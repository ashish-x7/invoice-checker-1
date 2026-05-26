/**
 * SHARED API SYNCHRONIZATION MODULE
 * This script handles global API count fetching and updating from Google Sheets.
 */

// --- TRIPLE DEPLOYMENT CONFIGURATION ---
window.AUTH_URL = "https://script.google.com/macros/s/AKfycbzPSf8PD52e4Qm0A2dYEJ2kqnOAwP7aecXvT2RYHa5xxJrCckTQL80EXBCOM_R4AuIa/exec";
window.PUSH_URL = "https://script.google.com/macros/s/AKfycbwQ07SlthEKGMzS9X7_xkypGx1dqDkWoRk7hvmZj1TVkcVAcaQezjGEi6pEE721Ecqj/exec";
window.CALC_URL = "https://script.google.com/macros/s/AKfycbxfLHtA0BSAH94yKsWmqqfc_B2qFOniYXk0cWbR7r3ZlTySp5RKsoyQxC9mRXCp2gnw/exec";
window.USER_URL = "https://script.google.com/macros/s/AKfycbwkz8B_Dy8-AYw-KiySOo0EFW4VcM6gVWvGDPEpUYcYlQUtKmkkHX1RAV6aFfKCJyEE/exec";
window.VENDOR_URL = "https://script.google.com/macros/s/AKfycbxeWfQ2NgquFWTGDIwsPwEqt1RSyEFuS9O1eZhcyrfHGpHDLXsABchs6u9FD2FNnEj8lw/exec";

// Global path resolver for extension routing
window.resolveLocalPath = (path) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL(path);
    }
    const loc = window.location.href;
    const isDeep = loc.includes('/INVOICE/') || loc.includes('/RETURN/');
    const base = isDeep ? '../../' : '../';
    return base + path;
};

// Helper to determine target URL based on action
function getTargetUrl(action) {
    if (action === "getAPICount") return window.PUSH_URL;
    if (action === "getUserInsights") return window.USER_URL;
    if (action === "getVendorDashboard" || action === "syncVendorBatch") return window.VENDOR_URL;
    if (action === "login" || action === "register" || action === "forgetPassword") return window.PUSH_URL;
    if (action === "getUsers" || action === "updateUsers") return window.PUSH_URL;
    const calcActions = ["getInsights", "getGlobalInsights", "exportDataByDate"];
    return calcActions.includes(action) ? window.CALC_URL : window.PUSH_URL;
}

function getFallbackUrls(action) {
    const primary = getTargetUrl(action);
    const urls = [primary];
    if (action === "getUsers" || action === "updateUsers") {
        urls.push(window.CALC_URL, window.AUTH_URL, window.USER_URL);
    } else if (action === "getAPICount") {
        urls.push(window.CALC_URL, window.AUTH_URL);
    } else if (action === "login" || action === "register" || action === "forgetPassword") {
        urls.push(window.PUSH_URL, window.CALC_URL);
    } else if (action === "getInsights" || action === "getGlobalInsights" || action === "exportDataByDate") {
        urls.push(window.PUSH_URL, window.AUTH_URL);
    }
    return urls.filter((url, index, arr) => url && !url.includes("YOUR_") && arr.indexOf(url) === index);
}

function shouldRetryWithNextUrl(action, resultText) {
    const text = String(resultText || "").trim();
    if (!text) return true;
    const normalizedText = text.toLowerCase();
    const retrySignals = ["action not found", "invalid action", "error: invalid action", "failed to execute", "critical error", "script function not found", "<!doctype html", "<html"];
    return retrySignals.some((signal) => normalizedText.includes(signal));
}

function ensurePopupSystem() {
    if (document.getElementById('customPopupOverlay')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = window.resolveLocalPath('assets/custom_popups.css');
    document.head.appendChild(link);
    const overlay = document.createElement('div');
    overlay.id = 'customPopupOverlay';
    overlay.className = 'custom-popup-overlay';
    overlay.innerHTML = `<div class="custom-popup-box"><div id="popupIcon" class="popup-icon-wrapper"></div><div id="popupTitle" class="popup-title"></div><div id="popupMessage" class="popup-message"></div><div id="popupButtons" class="popup-buttons"></div></div>`;
    document.body.appendChild(overlay);
}

window.showCustomModal = ({ title, message, type = 'info', confirmText = 'OK', cancelText = null, onConfirm = null }) => {
    ensurePopupSystem();
    const overlay = document.getElementById('customPopupOverlay');
    const box = overlay.querySelector('.custom-popup-box');
    const icon = document.getElementById('popupIcon');
    const titleEl = document.getElementById('popupTitle');
    const msgEl = document.getElementById('popupMessage');
    const btnCont = document.getElementById('popupButtons');
    box.className = `custom-popup-box popup-type-${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', danger: '⚠', info: 'ℹ' };
    icon.textContent = icons[type] || icons.info;
    titleEl.textContent = window.normalizeMojibake ? window.normalizeMojibake(title) : title;
    msgEl.textContent = window.normalizeMojibake ? window.normalizeMojibake(message) : message;
    btnCont.innerHTML = "";
    if (cancelText) {
        const btn = document.createElement('button');
        btn.className = 'popup-btn btn-cancel';
        btn.textContent = cancelText;
        btn.onclick = () => { overlay.classList.remove('active'); };
        btnCont.appendChild(btn);
    }
    const okBtn = document.createElement('button');
    okBtn.className = 'popup-btn btn-confirm';
    okBtn.textContent = confirmText;
    btnCont.appendChild(okBtn);
    overlay.classList.add('active');
    return new Promise((resolve) => {
        okBtn.onclick = () => { overlay.classList.remove('active'); if (onConfirm) onConfirm(); resolve(true); };
        if (cancelText) {
            btnCont.querySelector('.btn-cancel').onclick = () => { overlay.classList.remove('active'); resolve(false); };
        }
    });
};

window.showCustomConfirm = (message, title = "Are you sure?", confirmText = "YES", cancelText = "NO") => window.showCustomModal({ title, message, type: 'warning', confirmText, cancelText });

window.showCustomAlert = (message, title = "Alert", type = "info") => window.showCustomModal({ title, message, type, confirmText: "OK" });
window.showCustomError = (message, title = "Error") => window.showCustomModal({ title, message, type: "error", confirmText: "CLOSE" });
window.showCustomSuccess = (message, title = "Success") => window.showCustomModal({ title, message, type: "success", confirmText: "OK" });

const apiCallSync = async (payload) => {
    const targetUrls = getFallbackUrls(payload.action);
    for (let index = 0; index < targetUrls.length; index++) {
        const targetUrl = targetUrls[index];
        try {
            const response = await fetch(targetUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
            if (!response.ok) continue;
            const result = await response.text();
            if (shouldRetryWithNextUrl(payload.action, result) && index < targetUrls.length - 1) continue;
            return result;
        } catch (error) { console.error(`[API ERROR] Action: ${payload.action}`, error); }
    }
    return null;
};

window.fetchGlobalApiLimit = async () => {
    const raw = await apiCallSync({ action: "getAPICount" });
    const count = Number.parseInt(String(raw || "").trim(), 10);
    return Number.isFinite(count) ? count : null;
};
window.consumeGlobalApiCredit = async (count = 1) => await apiCallSync({ action: "updateAPI", count }) === "API Count Updated";
window.syncApiDisplay = async (elementId, forceReveal = false) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    const count = await window.fetchGlobalApiLimit();
    if (count !== null) {
        element.textContent = forceReveal ? count.toLocaleString() : "****";
        // Thresholds for 30,000 Limit
        element.style.color = (forceReveal && count < 1000) ? '#e74c3c' : (forceReveal ? '#10b981' : '#64748b');
    } else if (forceReveal) {
        element.textContent = "Unavailable";
        element.style.color = '#ef4444';
    }
    return count;
};
window.apiBridge = async (payload) => await apiCallSync(payload);

function normalizeOkNoAccess(value) { return String(value || "NO").trim().toUpperCase() === "OK" ? "OK" : "NO"; }
function normalizeSessionAccessShape(access) {
    const raw = access || {};
    const normalized = {
        AMAZON_INVOICE: normalizeOkNoAccess(raw.AMAZON_INVOICE || raw.amazon_invoice),
        AMAZON_RETURN: normalizeOkNoAccess(raw.AMAZON_RETURN || raw.amazon_return),
        AJIO_INVOICE: normalizeOkNoAccess(raw.AJIO_INVOICE || raw.ajio_invoice),
        AJIO_RETURN: normalizeOkNoAccess(raw.AJIO_RETURN || raw.ajio_return),
        MYNTRA_INVOICE: normalizeOkNoAccess(raw.MYNTRA_INVOICE || raw.myntra_invoice),
        MYNTRA_RETURN: normalizeOkNoAccess(raw.MYNTRA_RETURN || raw.myntra_return)
    };
    ["AMAZON", "AJIO", "MYNTRA"].forEach(p => {
        if (raw[p] && normalized[`${p}_INVOICE`] === "NO" && normalized[`${p}_RETURN`] === "NO") {
            normalized[`${p}_INVOICE`] = normalizeOkNoAccess(raw[p]);
            normalized[`${p}_RETURN`] = normalizeOkNoAccess(raw[p]);
        }
        normalized[p] = (normalized[`${p}_INVOICE`] === "OK" || normalized[`${p}_RETURN`] === "OK") ? "YES" : "NO";
    });
    return normalized;
}

function hasPlatformAccessInSession(access, platform) {
    const n = normalizeSessionAccessShape(access);
    return n[`${platform}_INVOICE`] === "OK" || n[`${platform}_RETURN`] === "OK";
}
function hasModuleAccessInSession(access, platform, module) {
    const n = normalizeSessionAccessShape(access);
    return n[`${platform}_${module}`] === "OK";
}

window.displayUserNickname = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['nickname', 'session'], (res) => {
            const nickname = res.nickname || (res.session && res.session.nickName) || localStorage.getItem('nickname') || "User";
            window.renderGlobalBadge(containerId, nickname, res.session || null);
        });
    } else {
        const nickname = localStorage.getItem('nickname') || "User";
        let session = null;
        try { session = JSON.parse(localStorage.getItem('session')); } catch (e) { }
        window.renderGlobalBadge(containerId, nickname, session);
    }
};

window.renderGlobalBadge = (containerId, nickname, sessionData = null) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "flex-end";
    container.style.gap = "8px";

    let session = sessionData;
    if (!session) { try { session = JSON.parse(localStorage.getItem('session')); } catch (e) { } }
    const access = normalizeSessionAccessShape((session && session.access) ? session.access : {});
    const isAdmin = String(session && session.role ? session.role : "").trim().toUpperCase() === "ADMIN";
    const roleLabel = isAdmin ? "ADMIN" : "USER";
    let safeName = (nickname || "User").toString().trim() || "User";
    if (safeName.toLowerCase() === 'kali') safeName = 'User';

    const topRow = document.createElement('div');
    topRow.style.display = "flex";
    topRow.style.alignItems = "center";
    topRow.style.gap = "12px";

    const wrapper = document.createElement('div');
    wrapper.id = "userBadgeWrapper";
    wrapper.style.cssText = "display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding:6px 16px; border-radius:50px; color:white; font-family:'Outfit', sans-serif; cursor:default;";
    wrapper.innerHTML = `<span style="font-weight:800; font-size:13px; text-transform:uppercase;">${safeName}</span><span style="font-size:12px; font-weight:600; opacity:0.9;">Hi, ${roleLabel}!</span>`;

    const logoutBtn = document.createElement('button');
    logoutBtn.id = "logoutBtnGlobal";
    logoutBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
    logoutBtn.style.cssText = "background:#ef4444; border:none; border-radius:10px; width:34px; height:34px; cursor:pointer; color:white; display:flex; align-items:center; justify-content:center; transition:all 0.2s;";
    logoutBtn.onclick = async () => {
        if (await window.showCustomConfirm("Logout confirmation?")) {
            localStorage.removeItem('session');
            localStorage.removeItem('nickname');
            window.location.href = window.resolveLocalPath('auth/auth.html');
        }
    };

    const homeBtn = document.createElement('button');
    homeBtn.id = "homeBtnGlobal";
    homeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
    homeBtn.style.cssText = "background:#475569; border:none; border-radius:10px; width:34px; height:34px; cursor:pointer; color:white; display:flex; align-items:center; justify-content:center; transition:all 0.2s;";
    homeBtn.onclick = () => { window.location.href = window.resolveLocalPath('auth/auth.html'); };

    let actionHost = document.getElementById('globalActionHost');
    if (!actionHost) { actionHost = document.createElement('div'); actionHost.id = 'globalActionHost'; }
    actionHost.style.cssText = "display:none; align-items:center; gap:8px;";

    topRow.append(actionHost, wrapper, homeBtn, logoutBtn);

    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = "display:flex; gap:8px; align-items:center;";

    // API Limit Pill (Hide if on Dashboards that already have their own display)
    const isInvoiceDash = window.location.href.toLowerCase().includes('/invoice/');
    const hasLocalDisplay = !!document.getElementById('apiCountDisplay') || !!document.getElementById('apiTrackerHeader') || !!document.getElementById('api-count');

    const apiPill = document.createElement('div');
    apiPill.id = "globalApiPill";
    apiPill.title = "Remaining API Credits";
    apiPill.style.cssText = "background:rgba(99,102,241,0.1); color:#4f46e5; border:1px solid rgba(99,102,241,0.2); padding:4px 12px; border-radius:8px; font-size:10px; font-weight:800; display:flex; align-items:center; gap:6px; cursor:pointer;";

    if (isInvoiceDash || hasLocalDisplay) apiPill.style.display = "none";

    apiPill.innerHTML = `<span style="color:#64748b; margin-right:4px;">Remaining API Call :</span> <span id="globalApiCount">****</span>`;
    apiPill.onclick = () => window.syncApiDisplay('globalApiCount', true);
    bottomRow.appendChild(apiPill);

    // New: Gemini Daily Quota Pill
    const aiQuotaPill = document.createElement('div');
    aiQuotaPill.id = "aiQuotaPill";
    aiQuotaPill.style.cssText = "background:rgba(16, 185, 129, 0.1); color:#059669; border:1px solid rgba(16, 185, 129, 0.2); padding:4px 12px; border-radius:8px; font-size:10px; font-weight:800; display:flex; align-items:center; gap:6px; cursor:default;";
    
    // Logic to initialize/reset daily limit
    const today = new Date().toDateString();
    let quotaData = JSON.parse(localStorage.getItem('gemini_quota_data') || '{"count": 1500, "date": ""}');
    if (quotaData.date !== today) {
        quotaData = { count: 1500, date: today };
        localStorage.setItem('gemini_quota_data', JSON.stringify(quotaData));
    }

    aiQuotaPill.innerHTML = `<span style="color:#64748b; margin-right:4px;">Daily AI Limit :</span> <span id="aiQuotaCount">${quotaData.count}</span> <span style="font-size:12px;">⚡</span>`;
    bottomRow.appendChild(aiQuotaPill);
    
    // Helper to decrement it from other scripts
    window.decrementAiQuota = () => {
        let q = JSON.parse(localStorage.getItem('gemini_quota_data') || '{"count": 1500, "date": ""}');
        q.count = Math.max(0, q.count - 1);
        localStorage.setItem('gemini_quota_data', JSON.stringify(q));
        const el = document.getElementById('aiQuotaCount');
        if (el) el.textContent = q.count;
    };

    // Refresh display
    if (apiPill.style.display !== "none") window.syncApiDisplay('globalApiCount', false);

    const createPlatBtn = (label, color, icon, url, isActive) => {
        const b = document.createElement('button');
        b.style.cssText = `background:${isActive ? color : 'white'}; color:${isActive ? 'white' : '#475569'}; border:1.5px solid ${isActive ? 'transparent' : '#e2e8f0'}; padding:4px 12px; border-radius:8px; font-size:10px; font-weight:800; display:flex; align-items:center; gap:6px; cursor:pointer; text-transform:uppercase; transition:all 0.2s;`;
        b.innerHTML = `<span>${icon}</span> ${label}`;
        b.onclick = async () => {
            if (label === "INSIGHTS") { window.location.href = window.resolveLocalPath(url); return; }
            const hasInv = hasModuleAccessInSession(access, label, "INVOICE");
            const hasRet = hasModuleAccessInSession(access, label, "RETURN");
            if (hasInv && !hasRet) { window.location.href = window.resolveLocalPath(url); return; }
            if (!hasInv && hasRet) { window.location.href = window.resolveLocalPath(url.replace('/INVOICE/', '/RETURN/').replace('.html', '_return.html')); return; }
            const choice = await window.showCustomModal({ title: `${label} Selection`, message: `Open ${label} module:`, confirmText: 'INVOICE', cancelText: 'RETURN' });
            if (choice === true) window.location.href = window.resolveLocalPath(url);
            else if (choice === false) window.location.href = window.resolveLocalPath(url.replace('/INVOICE/', '/RETURN/').replace('.html', '_return.html'));
        };
        return b;
    };

    const cur = window.location.href.toLowerCase();
    if (isAdmin || hasPlatformAccessInSession(access, "AMAZON")) bottomRow.appendChild(createPlatBtn("AMAZON", "#ff9900", "📦", "amazon/INVOICE/amazon.html", cur.includes("amazon.html")));
    if (isAdmin || hasPlatformAccessInSession(access, "AJIO")) bottomRow.appendChild(createPlatBtn("AJIO", "#1e293b", "💎", "ajio/INVOICE/ajio.html", cur.includes("ajio.html")));
    if (isAdmin || hasPlatformAccessInSession(access, "MYNTRA")) bottomRow.appendChild(createPlatBtn("MYNTRA", "#ff3f6c", "👚", "myntra/INVOICE/myntra.html", cur.includes("myntra.html")));
    if (isAdmin || ["AMAZON", "AJIO", "MYNTRA"].some(p => hasPlatformAccessInSession(access, p))) {
        bottomRow.appendChild(createPlatBtn("INSIGHTS", "#6366f1", "📊", "insights/insights.html", cur.includes("insights.html")));
    }

    container.append(topRow, bottomRow);
};

window.mountGlobalActionButton = (buttonId, statusId, isVisible) => {
    const host = document.getElementById('globalActionHost');
    const btn = document.getElementById(buttonId);
    const status = statusId ? document.getElementById(statusId) : null;
    if (!btn) return;
    if (host) host.style.display = 'none';
    btn.style.display = 'inline-flex';
    btn.disabled = !isVisible;
    btn.style.opacity = isVisible ? '1' : '0.65';
    btn.style.cursor = isVisible ? 'pointer' : 'not-allowed';
    if (status) {
        status.style.display = 'inline-block';
        status.style.opacity = isVisible ? status.style.opacity || '0' : '0';
    }
};

window.normalizeMojibake = (s) => {
    if (!s) return s;
    let out = String(s);
    const rep = (f, t) => out = out.split(f).join(t);
    rep("\u00E2\u201A\u00B9", "\u20B9"); // ₹
    return out;
};

// --- DATA UPLOAD HISTORY & QUEUE TRACKING LOGIC ---

window.logPushHistory = async (platform, invoiceList, vendorEventId, accountName = "", actionName = "") => {
    try {
        const historyKey = 'pushHistory';
        const result = await chrome.storage.local.get([historyKey]);
        let history = result[historyKey] || [];
        
        const now = Date.now();
        const nickname = localStorage.getItem('nickname') || "User";
        
        const newEntries = invoiceList.map(invNo => ({
            invoiceNo: invNo,
            platform: platform,
            accountName: accountName || "Default Account",
            actionName: actionName || "Portal Invoice Submitted To Google Sheet",
            uploader: nickname,
            timestamp: now,
            startTime: now,
            endTime: null,
            status: "Pending",
            vendorEventId: vendorEventId,
            error: ""
        }));
        
        // Add new individual invoices to the beginning
        history = newEntries.concat(history);
        
        // Purge items older than 24 hours
        const expiry = 24 * 60 * 60 * 1000;
        history = history.filter(item => (now - item.timestamp) < expiry);
        
        await chrome.storage.local.set({ [historyKey]: history });
        console.log(`[HISTORY] Logged ${invoiceList.length} individual invoices for ${platform}`);
    } catch (e) {
        console.error("Error logging push history:", e);
    }
};

function formatTimeCustom(timestamp) {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

async function getFlatHistory() {
    try {
        const tabType = (typeof currentModalTab !== 'undefined') ? currentModalTab : 'file';
        const key = tabType === 'file' ? 'fileUploadHistory' : 'pushHistory';
        const result = await chrome.storage.local.get([key]);
        const rawHistory = result[key] || [];
        
        const now = Date.now();
        const expiry = 24 * 60 * 60 * 1000;
        
        let flat = [];
        rawHistory.forEach(item => {
            if (!item) return;
            if (tabType === 'file') {
                flat.push({
                    fileName: item.fileName || "Unknown File",
                    platform: item.platform || "ALL",
                    accountName: item.accountName || "Default Account",
                    actionName: item.actionName || "File Uploaded",
                    uploader: item.uploader || "User",
                    timestamp: item.timestamp || now,
                    startTime: item.startTime || item.timestamp || now,
                    endTime: item.endTime || item.timestamp || now,
                    inserted: item.inserted !== undefined ? item.inserted : 0,
                    updated: item.updated !== undefined ? item.updated : 0,
                    errorCount: item.errorCount !== undefined ? item.errorCount : 0,
                    status: item.status || "Success",
                    error: item.error || ""
                });
            } else {
                if (item.totalCount !== undefined) {
                    flat.push({
                        invoiceNo: item.vendorEventId,
                        platform: item.platform,
                        accountName: item.accountName || "Default Account",
                        actionName: item.actionName || "Portal Invoice Submitted To Google Sheet",
                        uploader: item.uploader || "User",
                        timestamp: item.timestamp,
                        startTime: item.startTime || item.timestamp,
                        endTime: item.endTime || null,
                        status: item.status || "Pending",
                        vendorEventId: item.vendorEventId,
                        error: item.error || ""
                    });
                } else {
                    flat.push({
                        invoiceNo: item.invoiceNo || item.vendorEventId || "—",
                        platform: item.platform || "AJIO",
                        accountName: item.accountName || "Default Account",
                        actionName: item.actionName || "Portal Invoice Submitted To Google Sheet",
                        uploader: item.uploader || "User",
                        timestamp: item.timestamp || now,
                        startTime: item.startTime || item.timestamp || now,
                        endTime: item.endTime || null,
                        status: item.status || "Pending",
                        vendorEventId: item.vendorEventId || "",
                        error: item.error || ""
                    });
                }
            }
        });
        
        const validHist = flat.filter(item => (now - item.timestamp) < expiry);
        
        if (validHist.length !== rawHistory.length) {
            await chrome.storage.local.set({ [key]: validHist });
        }
        return validHist;
    } catch (e) {
        console.error("Error fetching history:", e);
        return [];
    }
}

// Global file upload logging function
window.logFileUpload = async (opts) => {
    try {
        const {
            platform = '',
            accountName: _accountName,
            actionName = '',
            fileName: fileNames = '',
            inserted = 0,
            updated = 0,
            errorCount = 0,
            status = 'Success',
            error: errorMsg = '',
            startTime,
            endTime
        } = opts || {};

        const historyKey = 'fileUploadHistory';
        const result = await chrome.storage.local.get([historyKey]);
        let history = result[historyKey] || [];
        
        const now = Date.now();
        const nickname = localStorage.getItem('nickname') || "User";
        
        // Determine account name: prefer passed value, fall back to localStorage
        let accountName = _accountName || "Default Account";
        if (!_accountName) {
            const p = platform.toUpperCase();
            if (p === 'MYNTRA') {
                if (actionName.includes("Purchase")) {
                    accountName = localStorage.getItem('myntra_purchase_seller_name') || "Default Account";
                } else {
                    const partyCode = localStorage.getItem('global_party_code');
                    if (partyCode) accountName = `Party: ${partyCode}`;
                }
            } else if (p === 'AJIO') {
                if (actionName.includes("Purchase")) {
                    accountName = localStorage.getItem('ajio_purchase_seller_name') || "Default Account";
                } else {
                    accountName = localStorage.getItem('ajio_party_code') || "Default Account";
                }
            } else if (p === 'AMAZON') {
                accountName = localStorage.getItem('amazon_seller_name') || "Default Account";
            }
        }

        const newEntry = {
            fileName: fileNames,
            platform: platform,
            accountName: accountName,
            actionName: actionName,
            uploader: nickname,
            timestamp: now,
            startTime: startTime || now,
            endTime: endTime || now,
            inserted: inserted,
            updated: updated,
            errorCount: errorCount,
            status: status,
            error: errorMsg
        };
        
        history = [newEntry].concat(history);
        
        // Purge items older than 24 hours
        const expiry = 24 * 60 * 60 * 1000;
        history = history.filter(item => (now - item.timestamp) < expiry);
        
        await chrome.storage.local.set({ [historyKey]: history });
        console.log(`[FILE HISTORY] Logged upload of ${fileNames} for ${platform}`);
        
        // If dataUploadModal is open, refresh counts & rows
        const modal = document.getElementById('dataUploadModal');
        if (modal && modal.style.display === 'flex') {
            if (typeof window.refreshHistoryCounters === 'function') await window.refreshHistoryCounters();
            if (typeof window.renderHistoryRows === 'function') await window.renderHistoryRows();
        }
    } catch (e) {
        console.error("Error logging file upload:", e);
    }
};

let currentModalTab = "file";

function initDataUploadFeature() {
    if (document.getElementById('dataUploadModal')) return;
    
    // Create the modal container
    const modal = document.createElement('div');
    modal.id = 'dataUploadModal';
    modal.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); z-index: 99999; justify-content: center; align-items: center; font-family: 'Outfit', sans-serif;";
    modal.innerHTML = `
      <div class="upload-history-content" style="background: white; border-radius: 20px; width: 96%; max-width: 1400px; height: 92%; max-height: 900px; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #e2e8f0; overflow: hidden; animation: modalFadeIn 0.3s ease;">
        <!-- Header -->
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 24px; border-bottom: 1px solid #f1f5f9; background: #f8fafc;">
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; font-family: 'Outfit', sans-serif;">Data Upload Queue & History 📤</h3>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b; font-weight: 600;">Track file uploads and Google Sheet synchronization logs (Autoclears after 24 hrs)</p>
          </div>
          <button id="closeDataUploadModalBtn" style="border: none; background: transparent; font-size: 24px; cursor: pointer; color: #94a3b8; transition: color 0.2s; line-height: 1;">&times;</button>
        </div>
        
        <!-- Tab Selector -->
        <div class="modal-tab-selector" style="display: flex; background: #f1f5f9; padding: 4px; border-radius: 12px; margin: 10px 24px 0 24px; gap: 4px; border: 1px solid #e2e8f0;">
          <button id="modalTabFileBtn" style="flex: 1; padding: 8px 16px; border: none; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; transition: all 0.2s; background: white; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-family: 'Outfit', sans-serif;">📁 File Upload</button>
          <button id="modalTabSheetBtn" style="flex: 1; padding: 8px 16px; border: none; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; transition: all 0.2s; background: transparent; color: #64748b; font-family: 'Outfit', sans-serif;">📊 Google Sheet Upload</button>
        </div>
        
        <!-- Controls (Filters and Counters) -->
        <div class="modal-controls" style="padding: 10px 24px; border-bottom: 1px solid #f1f5f9; background: #fff; display: flex; flex-direction: column; gap: 8px;">
          <!-- Stats / Counter Row -->
          <div class="stats-row" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 130px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 8px; text-align: center;">
              <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Total Sent Invoices</div>
              <div id="histCountTotal" style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px;">0</div>
            </div>
            <div style="flex: 1; min-width: 130px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 6px 8px; text-align: center;">
              <div style="font-size: 10px; font-weight: 800; color: #166534; text-transform: uppercase;">Succeeded Invoices</div>
              <div id="histCountSuccess" style="font-size: 16px; font-weight: 800; color: #15803d; margin-top: 2px;">0</div>
            </div>
            <div style="flex: 1; min-width: 130px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 6px 8px; text-align: center;">
              <div style="font-size: 10px; font-weight: 800; color: #991b1b; text-transform: uppercase;">Failed Invoices</div>
              <div id="histCountFailed" style="font-size: 16px; font-weight: 800; color: #b91c1c; margin-top: 2px;">0</div>
            </div>
            <div style="flex: 1; min-width: 130px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 6px 8px; text-align: center;">
              <div style="font-size: 10px; font-weight: 800; color: #1e40af; text-transform: uppercase;">Pending Invoices</div>
              <div id="histCountPending" style="font-size: 16px; font-weight: 800; color: #1d4ed8; margin-top: 2px;">0</div>
            </div>
            <div id="remainingApiCard" title="Click to refresh Remaining API Calls (Costs 1 call)" style="flex: 1; min-width: 130px; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 6px 8px; text-align: center; cursor: pointer; transition: all 0.2s;">
              <div style="font-size: 10px; font-weight: 800; color: #6b21a8; text-transform: uppercase;">Remaining API Calls</div>
              <div id="histCountRemainingApi" style="font-size: 16px; font-weight: 800; color: #6b21a8; margin-top: 2px;">****</div>
            </div>
          </div>
          
          <!-- Filters Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <!-- Platform Buttons -->
            <div style="display: flex; gap: 6px;">
              <button class="plat-filter-btn active" data-platform="ALL" style="padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; border: 1.5px solid #cbd5e1; background: #f1f5f9; color: #475569; transition: all 0.2s;">ALL</button>
              <button class="plat-filter-btn" data-platform="AMAZON" style="padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; border: 1.5px solid #ff9900; background: white; color: #ff9900; transition: all 0.2s;">AMAZON</button>
              <button class="plat-filter-btn" data-platform="AJIO" style="padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; border: 1.5px solid #1e293b; background: white; color: #1e293b; transition: all 0.2s;">AJIO</button>
              <button class="plat-filter-btn" data-platform="MYNTRA" style="padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; border: 1.5px solid #ff3f6c; background: white; color: #ff3f6c; transition: all 0.2s;">MYNTRA</button>
            </div>
            
            <!-- Filters Group -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <!-- Status Dropdown -->
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 800; color: #64748b;">Status:</span>
                <select id="statusFilterDropdown" style="padding: 6px 10px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 11px; font-weight: 700; color: #334155; outline: none; cursor: pointer; font-family: 'Outfit', sans-serif;">
                  <option value="ALL">All Statuses</option>
                  <option value="Pending">Pending ⏳</option>
                  <option value="Success">Success ✅</option>
                  <option value="Failed">Failed ❌</option>
                </select>
              </div>
              
              <!-- Count Selector (Floating Label style matching screenshot) -->
              <div class="floating-select-container">
                <span class="floating-select-label">Count<span>*</span></span>
                <select id="countLimitDropdown" class="floating-select-el">
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="250">250</option>
                  <option value="500">500</option>
                  <option value="ALL">All</option>
                </select>
              </div>
 
              <!-- Download Excel Button -->
              <button id="downloadExcelBtn" title="Download Excel Report" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid #bbf7d0; background: #f0fdf4; color: #15803d; cursor: pointer; transition: all 0.2s; padding: 0; outline: none; margin-right: 4px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="rgba(21, 128, 61, 0.1)"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="8" y1="13" x2="16" y2="13"></line>
                  <line x1="8" y1="17" x2="16" y2="17"></line>
                  <text x="8" y="10" font-family="'Outfit', sans-serif" font-weight="900" font-size="6.5" fill="#15803d">X</text>
                </svg>
              </button>
 
              <!-- Clear History Button -->
              <button id="clearHistoryBtn" title="Clear All History Logs" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid #fee2e2; background: #fef2f2; color: #ef4444; cursor: pointer; transition: all 0.2s; padding: 0; outline: none;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Table Body -->
        <div style="flex: 1; overflow-y: auto; padding: 0 24px; min-height: 200px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: 'Outfit', sans-serif;">
            <thead>
              <tr style="position: sticky; top: 0; z-index: 10;">
                <th id="modalTableHeaderCol1" style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; width: 20%; letter-spacing: 0.5px;">File Name / Channel</th>
                <th style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; width: 15%; letter-spacing: 0.5px;">Account</th>
                <th style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; width: 20%; letter-spacing: 0.5px;">Action / Uploader</th>
                <th style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; width: 17%; letter-spacing: 0.5px;">Time Logs Details</th>
                <th style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; text-align: center; width: 7%; letter-spacing: 0.5px;">Inserted</th>
                <th style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; text-align: center; width: 7%; letter-spacing: 0.5px;">Updated</th>
                <th style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; text-align: center; width: 7%; letter-spacing: 0.5px;">Error</th>
                <th style="padding: 6px 8px; font-size: 10.5px; font-weight: 800; color: #334155; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; text-align: center; width: 7%; letter-spacing: 0.5px;">Status</th>
              </tr>
            </thead>
            <tbody id="dataUploadTableBody">
              <!-- Dynamically populated -->
            </tbody>
          </table>
          <div id="dataUploadEmptyState" style="display: none; flex-direction: column; align-items: center; justify-content: center; padding: 80px 0; color: #94a3b8;">
            <span style="font-size: 40px; margin-bottom: 12px;">📭</span>
            <div style="font-weight: 700; font-size: 15px;">No matching upload logs found</div>
            <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">Upload history logs will show up here.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Add styles dynamically
    const style = document.createElement('style');
    style.textContent = `
      @keyframes modalFadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
      .plat-filter-btn.active[data-platform="ALL"] { background: #6366f1 !important; color: white !important; border-color: transparent !important; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25); }
      .plat-filter-btn.active[data-platform="AMAZON"] { background: #ff9900 !important; color: white !important; border-color: transparent !important; box-shadow: 0 4px 12px rgba(255, 153, 0, 0.25); }
      .plat-filter-btn.active[data-platform="AJIO"] { background: #1e293b !important; color: white !important; border-color: transparent !important; box-shadow: 0 4px 12px rgba(30, 41, 59, 0.25); }
      .plat-filter-btn.active[data-platform="MYNTRA"] { background: #ff3f6c !important; color: white !important; border-color: transparent !important; box-shadow: 0 4px 12px rgba(255, 63, 108, 0.25); }
      .plat-filter-btn:hover { transform: translateY(-1px); }
      .plat-filter-btn:active { transform: translateY(0); }
      #closeDataUploadModalBtn:hover { color: #475569 !important; }
      #remainingApiCard:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(107, 33, 168, 0.15); }
      #remainingApiCard:active { transform: translateY(0); }
      #clearHistoryBtn:hover { transform: translateY(-2px); background: #fee2e2 !important; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15); }
      #clearHistoryBtn:active { transform: translateY(0); }
      #downloadExcelBtn:hover { transform: translateY(-2px); background: #e8f5e9 !important; box-shadow: 0 4px 12px rgba(21, 128, 61, 0.15); }
      #downloadExcelBtn:active { transform: translateY(0); }
      
      .floating-select-container {
        position: relative;
        border: 1.5px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 8px;
        background: white;
        display: inline-flex;
        flex-direction: column;
        min-width: 80px;
        height: 32px;
        justify-content: center;
      }
      .floating-select-label {
        position: absolute;
        top: -7px;
        left: 8px;
        background: white;
        padding: 0 3px;
        font-size: 9px;
        font-weight: 800;
        color: #64748b;
      }
      .floating-select-label span {
        color: #ef4444;
      }
      .floating-select-el {
        border: none;
        outline: none;
        background: transparent;
        font-size: 11px;
        font-weight: 700;
        color: #334155;
        cursor: pointer;
        padding: 1px 0;
        width: 100%;
        font-family: 'Outfit', sans-serif;
      }
    `;
    document.head.appendChild(style);
    
    // Add close handlers
    document.getElementById('closeDataUploadModalBtn').onclick = () => {
        modal.style.display = 'none';
    };
    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };
    
    // Filters State
    let currentPlatformFilter = "ALL";
    let currentStatusFilter = "ALL";
    let currentCountLimit = 50;
    
    const filterBtns = modal.querySelectorAll('.plat-filter-btn');
    filterBtns.forEach(btn => {
        btn.onclick = async () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPlatformFilter = btn.getAttribute('data-platform');
            await refreshHistoryCounters();
            renderHistoryRows();
        };
    });
    
    const statusSelect = document.getElementById('statusFilterDropdown');
    statusSelect.onchange = (e) => {
        currentStatusFilter = e.target.value;
        renderHistoryRows();
    };
    
    const countSelect = document.getElementById('countLimitDropdown');
    countSelect.onchange = (e) => {
        currentCountLimit = e.target.value === "ALL" ? "ALL" : parseInt(e.target.value, 10);
        renderHistoryRows();
    };
    
    // Tab switching setup
    const tabFileBtn = document.getElementById('modalTabFileBtn');
    const tabSheetBtn = document.getElementById('modalTabSheetBtn');
    
    const switchModalTab = async (tab) => {
        currentModalTab = tab;
        if (tab === 'file') {
            tabFileBtn.style.background = 'white';
            tabFileBtn.style.color = '#0f172a';
            tabFileBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            tabSheetBtn.style.background = 'transparent';
            tabSheetBtn.style.color = '#64748b';
            tabSheetBtn.style.boxShadow = 'none';
            document.getElementById('modalTableHeaderCol1').textContent = 'File Name / Channel';
        } else {
            tabSheetBtn.style.background = 'white';
            tabSheetBtn.style.color = '#0f172a';
            tabSheetBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            tabFileBtn.style.background = 'transparent';
            tabFileBtn.style.color = '#64748b';
            tabFileBtn.style.boxShadow = 'none';
            document.getElementById('modalTableHeaderCol1').textContent = 'Invoice No. / Channel';
        }
        await refreshHistoryCounters();
        renderHistoryRows();
    };
    
    tabFileBtn.onclick = () => switchModalTab('file');
    tabSheetBtn.onclick = () => switchModalTab('sheet');
    
    // Remaining API limit action
    async function updateRemainingApiLimit(reveal = false) {
        const el = document.getElementById('histCountRemainingApi');
        if (!el) return;
        if (reveal) {
            el.textContent = "Loading...";
            const count = await window.fetchGlobalApiLimit();
            if (count !== null) {
                el.textContent = count.toLocaleString();
                el.style.color = count < 1000 ? '#dc2626' : '#6b21a8';
                const apiLocal = document.getElementById('apiCountDisplay');
                if (apiLocal) {
                    apiLocal.textContent = count.toLocaleString();
                    apiLocal.style.color = count < 1000 ? '#e74c3c' : '#10b981';
                }
            } else {
                el.textContent = "Unavailable";
                el.style.color = '#dc2626';
            }
        } else {
            const apiLocal = document.getElementById('apiCountDisplay');
            if (apiLocal && apiLocal.textContent !== '***' && apiLocal.textContent !== '****' && apiLocal.textContent !== 'Loading...') {
                el.textContent = apiLocal.textContent;
                el.style.color = apiLocal.style.color || '#6b21a8';
            } else {
                el.textContent = "****";
                el.style.color = '#6b21a8';
            }
        }
    }
    
    document.getElementById('remainingApiCard').onclick = () => updateRemainingApiLimit(true);
    
    // Clear history button action
    document.getElementById('clearHistoryBtn').onclick = async () => {
        const targetDesc = currentModalTab === 'file' ? "file upload history logs" : "Google Sheet sync history logs";
        const confirmed = await window.showCustomConfirm(`Are you sure you want to clear all ${targetDesc}? This cannot be undone.`, "Clear Upload History");
        if (confirmed) {
            const key = currentModalTab === 'file' ? 'fileUploadHistory' : 'pushHistory';
            await chrome.storage.local.set({ [key]: [] });
            await refreshHistoryCounters();
            renderHistoryRows();
        }
    };

    // Global Direct Download Helper using chrome.downloads if available
    window.directDownloadExcel = function(wb, filename, writeOptions = { cellStyles: true }) {
        if (typeof XLSX === 'undefined') {
            console.error("XLSX is not defined. Cannot download.");
            return;
        }
        const opt = Object.assign({ bookType: 'xlsx', type: 'binary', cellStyles: true }, writeOptions);
        try {
            if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
                const wbout = XLSX.write(wb, opt);
                const buf = new ArrayBuffer(wbout.length);
                const view = new Uint8Array(buf);
                for (let i = 0; i < wbout.length; i++) {
                    view[i] = wbout.charCodeAt(i) & 0xFF;
                }
                const blob = new Blob([buf], { type: 'application/octet-stream' });
                const blobUrl = URL.createObjectURL(blob);
                chrome.downloads.download({
                    url: blobUrl,
                    filename: filename,
                    saveAs: false
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("chrome.downloads error, falling back to writeFile:", chrome.runtime.lastError);
                        XLSX.writeFile(wb, filename, opt);
                    }
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                });
            } else {
                XLSX.writeFile(wb, filename, opt);
            }
        } catch (err) {
            console.error("directDownloadExcel error:", err);
            try {
                XLSX.writeFile(wb, filename, opt);
            } catch (fallbackErr) {
                console.error("Fallback writeFile error:", fallbackErr);
                if (typeof window.showCustomError === 'function') {
                    window.showCustomError("Error generating Excel file: " + fallbackErr.message, "Download Excel Error");
                } else {
                    alert("Error generating Excel file: " + fallbackErr.message);
                }
            }
        }
    };

    // Excel download button action
    document.getElementById('downloadExcelBtn').onclick = async () => {
        let history = await getFlatHistory();
        
        // Filter by platform (tab)
        if (currentPlatformFilter !== "ALL") {
            history = history.filter(h => h.platform === currentPlatformFilter);
        }
        
        // Filter by status (dropdown)
        if (currentStatusFilter !== "ALL") {
            history = history.filter(h => h.status === currentStatusFilter);
        }
        
        if (history.length === 0) {
            window.showCustomAlert("No history data to download.", "Download Excel", "info");
            return;
        }
        
        // Sort newest first
        history.sort((a, b) => b.timestamp - a.timestamp);
        
        // Format data for Excel
        const excelData = history.map(item => {
            const startTimeStr = formatTimeCustom(item.startTime || item.timestamp);
            let endTimeStr = "—";
            if (item.status === 'Pending') {
                endTimeStr = "Pending";
            } else {
                let completionTime = item.endTime;
                if (!completionTime || completionTime === "Pending") {
                    completionTime = item.timestamp ? (item.timestamp + 2000) : Date.now();
                }
                endTimeStr = typeof completionTime === 'number' ? formatTimeCustom(completionTime) : completionTime;
            }
            
            if (currentModalTab === 'file') {
                return {
                    "File Name": item.fileName,
                    "Channel / Platform": item.platform,
                    "Account": item.accountName,
                    "Action": item.actionName,
                    "Uploaded By": item.uploader,
                    "Start Time": startTimeStr,
                    "End Time": endTimeStr,
                    "Inserted": item.inserted,
                    "Updated": item.updated,
                    "Error": item.errorCount,
                    "Status": item.status,
                    "Error Details": item.error || ""
                };
            } else {
                return {
                    "Invoice No. / Vendor Event ID": item.invoiceNo,
                    "Channel / Platform": item.platform,
                    "Account": item.accountName,
                    "Action": item.actionName,
                    "Uploaded By": item.uploader,
                    "Start Time": startTimeStr,
                    "End Time": endTimeStr,
                    "Inserted": item.status === 'Success' ? 1 : 0,
                    "Updated": 0,
                    "Error": item.status === 'Failed' ? 1 : 0,
                    "Status": item.status,
                    "Error Details": item.error || ""
                };
            }
        });
        
        if (typeof XLSX !== 'undefined') {
            try {
                const ws = XLSX.utils.json_to_sheet(excelData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Upload Logs");
                
                // --- Column width ---
                const max_len = {};
                excelData.forEach(row => {
                    Object.keys(row).forEach(key => {
                        const val = row[key] ? row[key].toString() : "";
                        max_len[key] = Math.max(max_len[key] || key.length, val.length);
                    });
                });
                ws['!cols'] = Object.keys(max_len).map(key => ({ wch: max_len[key] + 3 }));

                // --- Cell Color Styling ---
                // Find column letters for Inserted / Updated / Error
                const headers = excelData.length > 0 ? Object.keys(excelData[0]) : [];
                const colInserted = headers.indexOf("Inserted");
                const colUpdated  = headers.indexOf("Updated");
                const colError    = headers.indexOf("Error");

                const toColLetter = (idx) => {
                    let letter = '';
                    let n = idx + 1;
                    while (n > 0) {
                        const rem = (n - 1) % 26;
                        letter = String.fromCharCode(65 + rem) + letter;
                        n = Math.floor((n - 1) / 26);
                    }
                    return letter;
                };

                const colorMap = [
                    { colIdx: colInserted, rgb: "16A34A" }, // Green matching UI table #16a34a
                    { colIdx: colUpdated,  rgb: "D97706" }, // Orange/Yellow matching UI table #d97706
                    { colIdx: colError,    rgb: "DC2626" }  // Red matching UI table #dc2626
                ];

                const totalRows = excelData.length + 1; // +1 for header

                colorMap.forEach(({ colIdx, rgb }) => {
                    if (colIdx < 0) return;
                    const colLetter = toColLetter(colIdx);
                    for (let rowNum = 1; rowNum <= totalRows; rowNum++) {
                        const cellRef = colLetter + rowNum;
                        if (!ws[cellRef]) ws[cellRef] = { v: rowNum === 1 ? headers[colIdx] : 0, t: rowNum === 1 ? 's' : 'n' };
                        ws[cellRef].s = {
                            font: { bold: rowNum === 1, color: { rgb: rgb } }
                        };
                    }
                });

                const timeStr = formatTimeCustom(Date.now()).replace(/[:\s]/g, '_');
                window.directDownloadExcel(wb, `Upload_History_${currentPlatformFilter}_${currentStatusFilter}_${timeStr}.xlsx`);
            } catch (err) {
                console.error("XLSX error:", err);
                window.showCustomError("Error generating Excel file: " + err.message, "Download Excel Error");
            }
        } else {
            // Fallback to CSV if SheetJS is somehow not loaded
            try {
                const headers = Object.keys(excelData[0]);
                const csvRows = [headers.join(",")];
                excelData.forEach(row => {
                    const values = headers.map(header => {
                        const escaped = ('' + (row[header] || '')).replace(/"/g, '""');
                        return `"${escaped}"`;
                    });
                    csvRows.push(values.join(","));
                });
                const csvString = csvRows.join("\n");
                const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                const timeStr = formatTimeCustom(Date.now()).replace(/[:\s]/g, '_');
                link.setAttribute("download", `Upload_History_${currentPlatformFilter}_${currentStatusFilter}_${timeStr}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (err) {
                console.error("CSV fallback error:", err);
                window.showCustomError("Error generating CSV fallback: " + err.message, "Download Error");
            }
        }
    };
    
    window.openDataUploadModal = async () => {
        modal.style.display = 'flex';
        updateRemainingApiLimit(false);
        await refreshHistoryCounters();
        renderHistoryRows();
    };
    
    async function refreshHistoryCounters() {
        const history = await getFlatHistory();
        
        let total = 0;
        let success = 0;
        let failed = 0;
        let pending = 0;
        
        // Filter by platform tab
        let filtered = history;
        if (currentPlatformFilter !== "ALL") {
            filtered = history.filter(h => h.platform === currentPlatformFilter);
        }
        
        total = filtered.length;
        success = filtered.filter(item => item.status === 'Success').length;
        failed = filtered.filter(item => item.status === 'Failed').length;
        pending = filtered.filter(item => item.status === 'Pending').length;
        
        document.getElementById('histCountTotal').textContent = total;
        document.getElementById('histCountSuccess').textContent = success;
        document.getElementById('histCountFailed').textContent = failed;
        document.getElementById('histCountPending').textContent = pending;
    }
    
    async function renderHistoryRows() {
        let history = await getFlatHistory();
        
        // Filter by platform
        if (currentPlatformFilter !== "ALL") {
            history = history.filter(h => h.platform === currentPlatformFilter);
        }
        
        // Filter by status
        if (currentStatusFilter !== "ALL") {
            history = history.filter(h => h.status === currentStatusFilter);
        }
        
        const tbody = document.getElementById('dataUploadTableBody');
        const emptyState = document.getElementById('dataUploadEmptyState');
        tbody.innerHTML = "";
        
        if (history.length === 0) {
            emptyState.style.display = "flex";
            return;
        }
        emptyState.style.display = "none";
        
        // Sort newest first
        history.sort((a, b) => b.timestamp - a.timestamp);
        
        // Apply limit slicing to prevent lag
        let displayList = history;
        if (currentCountLimit !== "ALL") {
            displayList = history.slice(0, currentCountLimit);
        }
        
        displayList.forEach(item => {
            const startTimeStr = formatTimeCustom(item.startTime || item.timestamp);
            let endTimeStr = "—";
            if (item.status === 'Pending') {
                endTimeStr = '<span style="color:#d97706; font-weight:700;">Pending...</span>';
            } else {
                let completionTime = item.endTime;
                if (!completionTime || completionTime === "Pending") {
                    completionTime = item.timestamp ? (item.timestamp + 2000) : Date.now();
                }
                endTimeStr = typeof completionTime === 'number' ? formatTimeCustom(completionTime) : completionTime;
            }
            
            let statusBadge = "";
            if (item.status === 'Success') {
                statusBadge = `<span style="background: #8ec03f; color: white; border: none; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; font-size: 9.5px; display: inline-block; min-width: 52px; text-align: center;">Success</span>`;
            } else if (item.status === 'Failed') {
                statusBadge = `<span style="background: #dc2626; color: white; border: none; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; font-size: 9.5px; display: inline-block; min-width: 52px; text-align: center;" title="${item.error || 'Sync failed'}">Failed</span>`;
            } else {
                statusBadge = `<span style="background: #2563eb; color: white; border: none; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; font-size: 9.5px; display: inline-block; min-width: 52px; text-align: center;">Pending</span>`;
            }
            
            const tr = document.createElement('tr');
            tr.style.cssText = "border-bottom: 1px solid #eef2f6; font-size: 10.5px; color: #475569; transition: background-color 0.2s;";
            tr.onmouseenter = () => { tr.style.backgroundColor = "#f8fafc"; };
            tr.onmouseleave = () => { tr.style.backgroundColor = "transparent"; };
            
            const primaryName = (currentModalTab === 'file') ? (item.fileName || "—") : (item.invoiceNo || "—");
            const insertedCount = (currentModalTab === 'file') ? (item.inserted !== undefined ? item.inserted : 0) : (item.status === 'Success' ? '1' : '0');
            const updatedCount = (currentModalTab === 'file') ? (item.updated !== undefined ? item.updated : 0) : 0;
            const errorCountVal = (currentModalTab === 'file') ? (item.errorCount !== undefined ? item.errorCount : 0) : (item.status === 'Failed' ? '1' : '0');

            tr.innerHTML = `
              <!-- Invoice No / File Name & Channel -->
              <td style="padding: 4px 8px;">
                <div style="font-weight: 600; color: #0f172a; font-family: monospace; font-size: 11.5px; margin-bottom: 1px; word-break: break-all;" title="${primaryName}">${primaryName}</div>
                <div style="font-size: 10px; color: #64748b; font-weight: 400;">Channel : <span style="color: #334155; font-weight: 500;">${item.platform}</span></div>
              </td>
              
              <!-- Account -->
              <td style="padding: 4px 8px; font-weight: 500; color: #334155; font-size: 11px;">
                ${item.accountName}
              </td>
              
              <!-- Action & Uploader -->
              <td style="padding: 4px 8px;">
                <div style="font-weight: 400; color: #64748b; margin-bottom: 1px; font-size: 10px;">Action : <span style="color: #334155; font-weight: 500;">${item.actionName}</span></div>
                <div style="font-size: 10px; color: #64748b; font-weight: 400;">Uploaded By : <span style="color: #334155; font-weight: 500;">${item.uploader}</span></div>
              </td>
              
              <!-- Time Logs Details -->
              <td style="padding: 4px 8px; font-size: 10px; color: #64748b; font-weight: 400; line-height: 1.3;">
                <div style="margin-bottom: 1px;">Start : <span style="color: #334155; font-weight: 500; font-family: monospace;">${startTimeStr}</span></div>
                <div>End : <span style="color: #334155; font-weight: 500; font-family: monospace;">${endTimeStr}</span></div>
              </td>
              <!-- Inserted -->
              <td style="padding: 4px 8px; text-align: center; font-weight: 800; font-size: 13px; color: #16a34a;">
                ${insertedCount}
              </td>
              
              <!-- Updated -->
              <td style="padding: 4px 8px; text-align: center; font-weight: 800; font-size: 13px; color: #d97706;">
                ${updatedCount}
              </td>
              
              <!-- Error -->
              <td style="padding: 4px 8px; text-align: center; font-weight: 800; font-size: 13px; color: #dc2626;">
                ${errorCountVal}
              </td>
              
              <!-- Status Badge -->
              <td style="padding: 4px 8px; text-align: center;">
                ${statusBadge}
              </td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    window.refreshHistoryCounters = refreshHistoryCounters;
    window.renderHistoryRows = renderHistoryRows;
}

// Global modal open shortcut
window.openDataUploadModal = () => {
    initDataUploadFeature();
    if (window.openDataUploadModal) {
        window.openDataUploadModal();
    }
};

// Auto-bind button once DOM loaded or checked
window.addEventListener('load', () => {
    const bindBtn = () => {
        const btn = document.getElementById('dataUploadBtn');
        const tracker = document.getElementById('apiTrackerHeader');
        if (btn) {
            // Relocate button next to Remaining API Call header if tracker exists
            if (tracker && btn.parentNode !== tracker.parentNode) {
                tracker.parentNode.insertBefore(btn, tracker);
                btn.style.marginLeft = "0px";
            }
            if (!btn.dataset.bound) {
                btn.dataset.bound = "true";
                btn.onclick = (e) => {
                    e.preventDefault();
                    window.openDataUploadModal();
                };
            }
        }
    };
    bindBtn();
    setTimeout(bindBtn, 1000);
    setTimeout(bindBtn, 3000);
});

// Auto-refresh receiver
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'pushHistoryUpdated') {
            const modal = document.getElementById('dataUploadModal');
            if (modal && modal.style.display === 'flex') {
                window.openDataUploadModal();
            }
        }
    });
}

