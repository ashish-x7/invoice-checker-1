/**
 * BACKGROUND SERVICE WORKER (Manifest V3)
 * Handles parallel persistent background data syncing to Google Sheets
 */

console.log("%c[DEBUG] Invoice Checker Extension Loaded!", "color: #f39c12; font-weight: bold; font-size: 14px;");
const manifest = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest() : null;
if (manifest) {
  console.log("[DEBUG] Current Manifest Icons:", JSON.stringify(manifest.icons));
  console.log("[DEBUG] Manifest Action Icon:", manifest.action ? JSON.stringify(manifest.action.default_icon) : "None");
}

// --- TRIPLE DEPLOYMENT CONFIGURATION ---
const G_SHEET_PUSH_URL = "https://script.google.com/macros/s/AKfycbwQ07SlthEKGMzS9X7_xkypGx1dqDkWoRk7hvmZj1TVkcVAcaQezjGEi6pEE721Ecqj/exec"; // For saving data, auth, registry
const G_SHEET_CALC_URL = "https://script.google.com/macros/s/AKfycbxfLHtA0BSAH94yKsWmqqfc_B2qFOniYXk0cWbR7r3ZlTySp5RKsoyQxC9mRXCp2gnw/exec"; // For fetching insights (rarely used in background)
const G_SHEET_USER_URL = "https://script.google.com/macros/s/AKfycbwkz8B_Dy8-AYw-KiySOo0EFW4VcM6gVWvGDPEpUYcYlQUtKmkkHX1RAV6aFfKCJyEE/exec"; // For user analytics (rarely used in background)
const G_SHEET_VENDOR_URL = "https://script.google.com/macros/s/AKfycbxeWfQ2NgquFWTGDIwsPwEqt1RSyEFuS9O1eZhcyrfHGpHDLXsABchs6u9FD2FNnEj8lw/exec"; // Separate vendor master + vendor dashboard deployment

// Track processing status for each platform independently
let IS_PROCESSING = {
    "AJIO": false,
    "MYNTRA": false,
    "AMAZON": false
};

const PLATFORMS = ["AJIO", "MYNTRA", "AMAZON"];

// Listen for sync signals
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`[DEBUG] Message received from tab:`, request);
    if (request.action === 'startSync') {
        const platform = request.platform || "AJIO";
        console.log(`[DEBUG] Received Signal to start sync for: ${platform}`);
        startSyncProcess(platform);
        sendResponse({ status: `Sync logic triggered for ${platform}` });
    }
    return true;
});

// Alarm to ensure sync resumes if service worker sleeps
chrome.alarms.create("syncPoll", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "syncPoll") {
        console.log("[DEBUG] Periodic alarm check triggered.");
        PLATFORMS.forEach(p => startSyncProcess(p));
    }
  });
}

/**
 * Parallel Sync Loop for a specific platform
 */
async function startSyncProcess(platform) {
    if (IS_PROCESSING[platform]) {
        console.log(`[DEBUG] ${platform} loop is already busy. Ignoring new signal.`);
        return;
    }
    
    const storageKey = `pushQueue_${platform}`;
    
    // Check if there's actually anything in the queue before marking as busy
    const checkQueue = await chrome.storage.local.get([storageKey]);
    const initLen = (checkQueue[storageKey] || []).length;
    
    if (initLen === 0) {
        console.log(`[DEBUG] ${platform} queue is empty. No work to do.`);
        return;
    }

    IS_PROCESSING[platform] = true;
    console.log(`%c[BACKGROUND] ${platform} Sync Process Started! (Rows: ${initLen})`, "color: #3498db; font-weight: bold;");

    try {
        while (true) {
            // 1. Fetch freshest queue for this platform
            const result = await chrome.storage.local.get([storageKey]);
            let currentQueue = result[storageKey] || [];
            
            if (currentQueue.length === 0) {
                console.log(`%c[BACKGROUND] ${platform} queue cleared or finished. Worker stopping.`, "color: #27ae60; font-weight: bold;");
                break;
            }

            // 2. Prepare the batch (up to 10 rows)
            const BATCH_SIZE = 10;
            const batchItems = currentQueue.slice(0, BATCH_SIZE);
            const normalizedBatch = batchItems.map(item => {
                if (Array.isArray(item)) return item;
                if (item && Array.isArray(item.row)) return item.row;
                return null;
            }).filter(row => Array.isArray(row) && row.length > 0);

            if (normalizedBatch.length === 0) {
                console.error(`[SYNC ERROR] ${platform}: Queue items are malformed. Clearing first ${batchItems.length} items.`, batchItems);
                const doubleCheckMalformed = await chrome.storage.local.get([storageKey]);
                let malformedQueue = doubleCheckMalformed[storageKey] || [];
                malformedQueue.splice(0, batchItems.length);
                await chrome.storage.local.set({ [storageKey]: malformedQueue });
                continue;
            }

            const batchData = normalizedBatch;
            const vendorEventId = extractVendorEventId(batchItems);
            const payload = {
                action: "saveData",
                sheetName: platform,
                data: batchData,
                vendorEventId: vendorEventId
            };

            console.log(`[SYNC] ${platform}: Prepared normalized batch`, {
                rows: batchData.length,
                firstRowIsArray: Array.isArray(batchData[0]),
                firstRowLength: batchData[0] ? batchData[0].length : null,
                firstRowSample: batchData[0] || null
            });

            console.log(`[SYNC] ${platform}: Pushing ${batchData.length} rows. ${currentQueue.length - batchItems.length} pending.`);

            // 3. Process the batch
            const success = await processRow(payload, platform);
            
            if (vendorEventId) {
                const batchInvoiceNos = batchItems.map(item => item.invoiceNo).filter(Boolean);
                await updateHistoryStatus(platform, vendorEventId, batchInvoiceNos, success, success ? "" : "Batch failed to send to Google Sheets");
            }
            
            if (success) {
                // 4. Atomic shift to prevent data loss
                const doubleCheck = await chrome.storage.local.get([storageKey]);
                let updatedQueue = doubleCheck[storageKey] || [];
                
                if (updatedQueue.length > 0) {
                    updatedQueue.splice(0, batchItems.length);
                    await chrome.storage.local.set({ [storageKey]: updatedQueue });
                }

                // 5. Notify the specific platform dashboard
                chrome.runtime.sendMessage({ action: 'syncUpdate', platform: platform }).catch(() => {});
                
                // Wait 2 seconds per batch
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.warn(`%c[SYNC WARNING] ${platform}: Batch failed to send. Retrying in 10s...`, "color: #f39c12;");
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    } catch (err) {
        console.error(`[CRITICAL] Error in background worker for ${platform}:`, err);
    } finally {
        IS_PROCESSING[platform] = false;
    }
}

/**
 * Single Row Processor
 */
async function processRow(payload, platform) {
    try {
        console.log(`[SYNC] ${platform}: Sending batch to main push script`, {
            rows: payload && payload.data ? payload.data.length : 0,
            target: G_SHEET_PUSH_URL
        });
        const response = await fetch(G_SHEET_PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error(`[NETWORK] ${platform} sheet sync failed with HTTP ${response.status}.`);
            return false;
        }

        const text = (await response.text()).trim();
        console.log(`[SYNC] ${platform} Server Response:`, text);
        if (text.includes("Spreadsheet not connected") || text.includes("getSheetByName")) {
            console.error(`[SYNC] ${platform}: Google Apps Script is not attached to a spreadsheet. Set MASTER_SPREADSHEET_ID in Apps Script properties or bind the script to the target Google Sheet, then redeploy the web app.`);
        }
        if (text.includes("Success")) {
            await syncVendorBatch(payload, platform);
        }
        return text.includes("Success");
    } catch (err) {
        console.error(`[NETWORK] ${platform} fetch failed:`, err);
        return false;
    }
}

async function syncVendorBatch(payload, platform) {
    if (!G_SHEET_VENDOR_URL || G_SHEET_VENDOR_URL.indexOf("YOUR_") > -1) {
        console.warn(`[VENDOR] ${platform}: Vendor URL missing, skipping vendor sync.`, G_SHEET_VENDOR_URL);
        return;
    }

    try {
        const rows = payload && payload.data ? payload.data : [];
        console.log(`[VENDOR] ${platform}: Starting vendor sync`, {
            rows: rows.length,
            target: G_SHEET_VENDOR_URL,
            sampleRow: rows.length ? rows[0] : null
        });

        const response = await fetch(G_SHEET_VENDOR_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "syncVendorBatch",
                sheetName: platform,
                data: rows,
                vendorEventId: payload && payload.vendorEventId ? payload.vendorEventId : "",
                syncedAt: new Date().toISOString()
            })
        });

        const text = (await response.text()).trim();
        console.log(`[VENDOR] ${platform}: Vendor sync response`, {
            ok: response.ok,
            status: response.status,
            body: text
        });

        if (!response.ok) {
            console.error(`[VENDOR] ${platform}: Vendor sync HTTP error ${response.status}`, text);
        }
    } catch (err) {
        console.error(`[VENDOR] ${platform}: Vendor sync failed`, err);
    }
}

function extractVendorEventId(batchItems) {
    for (let i = 0; i < batchItems.length; i++) {
        const item = batchItems[i];
        if (item && item.vendorEventId) return item.vendorEventId;
    }
    return "";
}

/**
 * Deduct Global API count
 */
async function deductApiCount(platform) {
    try {
        const response = await fetch(G_SHEET_PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "updateAPI", count: 1 })
        });

        if (!response.ok) {
            console.warn(`[API] ${platform} failed to update API count. HTTP ${response.status}.`);
            return false;
        }

        const text = (await response.text()).trim();
        if (text && text !== "API Count Updated" && text !== "API Limit Reached") {
            console.warn(`[API] ${platform} unexpected API count response: ${text}`);
        }

        return text === "API Count Updated";
    } catch (e) {
        console.warn(`[API] ${platform} failed to update API count.`, e);
        return false;
    }
}

/**
 * Update sync status in pushHistory log
 */
async function updateHistoryStatus(platform, vendorEventId, invoiceNos, success, errorMsg = "") {
    try {
        const historyKey = 'pushHistory';
        const result = await chrome.storage.local.get([historyKey]);
        let history = result[historyKey] || [];
        
        let updatedAny = false;
        history = history.map(item => {
            if (item.vendorEventId === vendorEventId) {
                if (item.totalCount !== undefined) {
                    // Legacy grouped item update logic
                    updatedAny = true;
                    const batchCount = Array.isArray(invoiceNos) ? invoiceNos.length : 1;
                    const sCount = success ? (item.successCount + batchCount) : item.successCount;
                    const fCount = !success ? (item.failedCount + batchCount) : item.failedCount;
                    const pCount = Math.max(0, item.totalCount - sCount - fCount);
                    
                    let overallStatus = "Pending";
                    let endTime = item.endTime || "";
                    if (pCount === 0) {
                        overallStatus = fCount > 0 ? "Failed" : "Success";
                        const d = new Date();
                        const yyyy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        const hh = String(d.getHours()).padStart(2, '0');
                        const min = String(d.getMinutes()).padStart(2, '0');
                        const ss = String(d.getSeconds()).padStart(2, '0');
                        endTime = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
                    }
                    
                    return {
                        ...item,
                        successCount: sCount,
                        failedCount: fCount,
                        pendingCount: pCount,
                        status: overallStatus,
                        endTime: endTime,
                        error: errorMsg || item.error || ""
                    };
                } else {
                    // Flat individual item update logic
                    const isMatch = (!invoiceNos || !Array.isArray(invoiceNos) || invoiceNos.length === 0) 
                        || invoiceNos.includes(item.invoiceNo);
                        
                    if (isMatch) {
                        updatedAny = true;
                        return {
                            ...item,
                            status: success ? "Success" : "Failed",
                            endTime: Date.now(),
                            error: errorMsg || item.error || ""
                        };
                    }
                }
            }
            return item;
        });
        
        if (updatedAny) {
            const now = Date.now();
            const expiry = 24 * 60 * 60 * 1000;
            // Purge logs older than 24 hours
            history = history.filter(item => (now - item.timestamp) < expiry);
            
            await chrome.storage.local.set({ [historyKey]: history });
            console.log(`[HISTORY BACKGROUND] Updated event ${vendorEventId}: Success=${success}, count=${Array.isArray(invoiceNos) ? invoiceNos.length : 0}`);
            
            // Broadcast update event to all active tabs
            chrome.runtime.sendMessage({ action: 'pushHistoryUpdated', platform: platform }).catch(() => {});
        }
    } catch (e) {
        console.error("Error updating push history status:", e);
    }
}

