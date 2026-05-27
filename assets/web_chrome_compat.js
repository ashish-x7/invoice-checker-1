/**
 * WEB CHROME COMPATIBILITY LAYER
 * Mocks Chrome Extension APIs (storage, runtime messaging, alarms, tabs) for web browsers.
 * Also runs the background sync loop directly in the browser.
 */

(function() {
    if (typeof window.chrome !== 'undefined' && window.chrome.runtime && window.chrome.runtime.id) {
        // Running inside a Chrome Extension context, do nothing.
        return;
    }

    console.log("%c[DEBUG] Loading Web Chrome Compatibility Layer...", "color: #9b59b6; font-weight: bold; font-size: 13px;");

    // Establish a BroadcastChannel for cross-tab communication
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('chrome-compat-channel') : null;
    const listeners = new Set();

    if (channel) {
        channel.onmessage = function(event) {
            const { message, sender } = event.data;
            console.log("[DEBUG] Received cross-tab message:", message);
            listeners.forEach(listener => {
                try {
                    listener(message, sender, () => {});
                } catch (e) {
                    console.error("Error in cross-tab message listener:", e);
                }
            });
        };
    }

    // Mock chrome namespace
    window.chrome = {
        runtime: {
            getManifest: function() {
                return {
                    name: "Invoice Checker Web App",
                    version: "1.0",
                    description: "Web application to check invoices for Amazon, Ajio, and Myntra.",
                    icons: { "16": "logo.png", "128": "logo.png" }
                };
            },
            getURL: function(path) {
                const cleanPath = String(path || "").replace(/^\/+/, "");
                const loc = window.location.pathname;
                const isDeep = loc.includes('/INVOICE/') || loc.includes('/RETURN/');
                const base = isDeep ? '../../' : '../';
                return base + cleanPath;
            },
            sendMessage: function(message, callback) {
                console.log("[DEBUG] Send message:", message);
                
                // Route to same-tab listeners
                listeners.forEach(listener => {
                    try {
                        listener(message, { tab: { id: 1 } }, callback || (() => {}));
                    } catch (e) {
                        console.error("Error in local message listener:", e);
                    }
                });

                // Broadcast to other tabs
                if (channel) {
                    channel.postMessage({
                        message: message,
                        sender: { tab: { id: 1 } }
                    });
                }

                // If Background Sync Worker is registered, invoke its handler
                if (window.WebBackgroundWorker && typeof window.WebBackgroundWorker.onMessage === 'function') {
                    window.WebBackgroundWorker.onMessage(message, callback);
                }
            },
            onMessage: {
                addListener: function(listener) {
                    listeners.add(listener);
                },
                removeListener: function(listener) {
                    listeners.delete(listener);
                }
            }
        },
        storage: {
            local: {
                get: function(keys, callback) {
                    const promise = new Promise((resolve) => {
                        const result = {};
                        if (typeof keys === 'string') {
                            const val = localStorage.getItem(keys);
                            try {
                                result[keys] = val ? JSON.parse(val) : null;
                            } catch (e) {
                                result[keys] = val;
                            }
                        } else if (Array.isArray(keys)) {
                            keys.forEach(k => {
                                const val = localStorage.getItem(k);
                                try {
                                    result[k] = val ? JSON.parse(val) : null;
                                } catch (e) {
                                    result[k] = val;
                                }
                            });
                        } else if (keys && typeof keys === 'object') {
                            Object.keys(keys).forEach(k => {
                                const val = localStorage.getItem(k);
                                try {
                                    result[k] = val !== null ? JSON.parse(val) : keys[k];
                                } catch (e) {
                                    result[k] = val;
                                }
                            });
                        }
                        resolve(result);
                    });
                    if (callback && typeof callback === 'function') {
                        promise.then(callback);
                    }
                    return promise;
                },
                set: function(items, callback) {
                    const promise = new Promise((resolve) => {
                        Object.keys(items).forEach(k => {
                            localStorage.setItem(k, JSON.stringify(items[k]));
                        });
                        // Trigger 'storage' event locally so current tab knows storage changed
                        window.dispatchEvent(new Event('storage'));
                        resolve();
                    });
                    if (callback && typeof callback === 'function') {
                        promise.then(callback);
                    }
                    return promise;
                },
                remove: function(keys, callback) {
                    const promise = new Promise((resolve) => {
                        if (typeof keys === 'string') {
                            localStorage.removeItem(keys);
                        } else if (Array.isArray(keys)) {
                            keys.forEach(k => localStorage.removeItem(k));
                        }
                        window.dispatchEvent(new Event('storage'));
                        resolve();
                    });
                    if (callback && typeof callback === 'function') {
                        promise.then(callback);
                    }
                    return promise;
                },
                clear: function(callback) {
                    const promise = new Promise((resolve) => {
                        localStorage.clear();
                        window.dispatchEvent(new Event('storage'));
                        resolve();
                    });
                    if (callback && typeof callback === 'function') {
                        promise.then(callback);
                    }
                    return promise;
                }
            }
        },
        alarms: {
            create: function(name, details) {
                console.log(`[ALARM MOCK] Created alarm: ${name}`, details);
            },
            onAlarm: {
                addListener: function(callback) {
                    console.log("[ALARM MOCK] Registered alarm listener.");
                }
            }
        },
        tabs: {
            create: function(details) {
                if (details && details.url) {
                    window.open(details.url, '_blank');
                }
            }
        }
    };

    // Web Background Sync Worker
    // Replicates background.js functionality in the browser
    const WebBackgroundWorker = {
        IS_PROCESSING: {
            "AJIO": false,
            "MYNTRA": false,
            "AMAZON": false
        },
        PLATFORMS: ["AJIO", "MYNTRA", "AMAZON"],
        
        init: function() {
            // Periodic sync check every 15 seconds
            setInterval(() => {
                this.PLATFORMS.forEach(p => this.startSyncProcess(p));
            }, 15000);

            // Sync check on storage changes (triggered by enqueue)
            window.addEventListener('storage', () => {
                this.PLATFORMS.forEach(p => this.startSyncProcess(p));
            });

            // Start immediately in case there's leftover work in localStorage
            setTimeout(() => {
                this.PLATFORMS.forEach(p => this.startSyncProcess(p));
            }, 2000);
        },

        onMessage: function(request, sendResponse) {
            if (request && request.action === 'startSync') {
                const platform = request.platform || "AJIO";
                this.startSyncProcess(platform);
                if (sendResponse) sendResponse({ status: `Sync logic triggered for ${platform}` });
            }
        },

        startSyncProcess: async function(platform) {
            if (this.IS_PROCESSING[platform]) {
                return;
            }

            // Tab-level distributed locking using localStorage
            const lockKey = `syncLock_${platform}`;
            const now = Date.now();
            const lockVal = localStorage.getItem(lockKey);
            if (lockVal) {
                const lockTime = parseInt(lockVal, 10);
                if (now - lockTime < 30000) {
                    // Lock is active and fresh, skip to prevent double-processing
                    return;
                }
            }

            const storageKey = `pushQueue_${platform}`;
            const checkQueue = await window.chrome.storage.local.get([storageKey]);
            const initLen = (checkQueue[storageKey] || []).length;

            if (initLen === 0) {
                return;
            }

            // Set Lock
            localStorage.setItem(lockKey, String(Date.now()));
            this.IS_PROCESSING[platform] = true;
            console.log(`%c[BACKGROUND WORKER] ${platform} Sync Process Started! (Rows: ${initLen})`, "color: #3498db; font-weight: bold;");

            try {
                while (true) {
                    // Refresh lock timestamp
                    localStorage.setItem(lockKey, String(Date.now()));

                    const result = await window.chrome.storage.local.get([storageKey]);
                    let currentQueue = result[storageKey] || [];

                    if (currentQueue.length === 0) {
                        console.log(`%c[BACKGROUND WORKER] ${platform} queue cleared. Worker stopping.`, "color: #27ae60; font-weight: bold;");
                        break;
                    }

                    const BATCH_SIZE = 10;
                    const batchItems = currentQueue.slice(0, BATCH_SIZE);
                    const normalizedBatch = batchItems.map(item => {
                        if (Array.isArray(item)) return item;
                        if (item && Array.isArray(item.row)) return item.row;
                        return null;
                    }).filter(row => Array.isArray(row) && row.length > 0);

                    if (normalizedBatch.length === 0) {
                        const doubleCheckMalformed = await window.chrome.storage.local.get([storageKey]);
                        let malformedQueue = doubleCheckMalformed[storageKey] || [];
                        malformedQueue.splice(0, batchItems.length);
                        await window.chrome.storage.local.set({ [storageKey]: malformedQueue });
                        continue;
                    }

                    const batchData = normalizedBatch;
                    const vendorEventId = this.extractVendorEventId(batchItems);
                    const payload = {
                        action: "saveData",
                        sheetName: platform,
                        data: batchData,
                        vendorEventId: vendorEventId
                    };

                    const success = await this.processRow(payload, platform);

                    if (vendorEventId) {
                        const batchInvoiceNos = batchItems.map(item => item.invoiceNo).filter(Boolean);
                        await this.updateHistoryStatus(platform, vendorEventId, batchInvoiceNos, success, success ? "" : "Batch failed to send to Google Sheets");
                    }

                    if (success) {
                        const doubleCheck = await window.chrome.storage.local.get([storageKey]);
                        let updatedQueue = doubleCheck[storageKey] || [];
                        if (updatedQueue.length > 0) {
                            updatedQueue.splice(0, batchItems.length);
                            await window.chrome.storage.local.set({ [storageKey]: updatedQueue });
                        }

                        // Broadcast update to all tabs
                        window.chrome.runtime.sendMessage({ action: 'syncUpdate', platform: platform });
                        
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        console.warn(`[BACKGROUND WORKER] ${platform}: Batch failed. Retrying in 10s...`);
                        await new Promise(r => setTimeout(r, 10000));
                        break; // Stop loop and retry in next cycle
                    }
                }
            } catch (err) {
                console.error(`[BACKGROUND WORKER ERROR] platform ${platform}:`, err);
            } finally {
                this.IS_PROCESSING[platform] = false;
                localStorage.removeItem(lockKey);
            }
        },

        processRow: async function(payload, platform) {
            try {
                const pushUrl = window.PUSH_URL || "https://script.google.com/macros/s/AKfycbwQ07SlthEKGMzS9X7_xkypGx1dqDkWoRk7hvmZj1TVkcVAcaQezjGEi6pEE721Ecqj/exec";
                const response = await fetch(pushUrl, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) return false;

                const text = (await response.text()).trim();
                if (text.includes("Success")) {
                    await this.syncVendorBatch(payload, platform);
                }
                return text.includes("Success");
            } catch (err) {
                console.error(`[BACKGROUND WORKER fetch failed] platform ${platform}:`, err);
                return false;
            }
        },

        syncVendorBatch: async function(payload, platform) {
            const vendorUrl = window.VENDOR_URL || "https://script.google.com/macros/s/AKfycbxeWfQ2NgquFWTGDIwsPwEqt1RSyEFuS9O1eZhcyrfHGpHDLXsABchs6u9FD2FNnEj8lw/exec";
            if (!vendorUrl || vendorUrl.includes("YOUR_")) return;

            try {
                const rows = payload && payload.data ? payload.data : [];
                await fetch(vendorUrl, {
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
            } catch (err) {
                console.error("[BACKGROUND WORKER vendor sync failed]", err);
            }
        },

        extractVendorEventId: function(batchItems) {
            for (let i = 0; i < batchItems.length; i++) {
                const item = batchItems[i];
                if (item && item.vendorEventId) return item.vendorEventId;
            }
            return "";
        },

        updateHistoryStatus: async function(platform, vendorEventId, invoiceNos, success, errorMsg = "") {
            try {
                const historyKey = 'pushHistory';
                const result = await window.chrome.storage.local.get([historyKey]);
                let history = result[historyKey] || [];
                let updatedAny = false;

                history = history.map(item => {
                    if (item.vendorEventId === vendorEventId) {
                        if (item.totalCount !== undefined) {
                            updatedAny = true;
                            const batchCount = Array.isArray(invoiceNos) ? invoiceNos.length : 1;
                            const sCount = success ? (item.successCount + batchCount) : item.successCount;
                            const fCount = !success ? (item.failedCount + batchCount) : item.failedCount;
                            const pCount = Math.max(0, item.totalCount - sCount - fCount);
                            
                            let overallStatus = "Pending";
                            let endTime = item.endTime || "";
                            if (pCount === 0) {
                                overallStatus = fCount > 0 ? "Failed" : "Success";
                                endTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
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
                    history = history.filter(item => (now - item.timestamp) < expiry);
                    await window.chrome.storage.local.set({ [historyKey]: history });
                    
                    window.chrome.runtime.sendMessage({ action: 'pushHistoryUpdated', platform: platform });
                }
            } catch (e) {
                console.error("Error updating push history status in background worker:", e);
            }
        }
    };

    window.WebBackgroundWorker = WebBackgroundWorker;
    WebBackgroundWorker.init();
})();
