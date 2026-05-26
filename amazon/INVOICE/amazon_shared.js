// --- GLOBAL STATE ---
if (typeof window.displayUserNickname === 'function') {
    window.displayUserNickname('userNicknameContainer');
}

let globalPortalData = [];
let globalSaleData = [];
let globalPurchaseData = [];
let globalVendorData = [];
let globalFilteredData = []; 
let globalNickname = "User";

let purchaseMap = new Map();
let saleMap = new Map();
let vendorMap = new Map();
let searchColIdx = -1; // Default to 'All Columns'

let globalPurchaseMetadata = null; 
let globalSaleMetadata = null; 
let globalPortalMetadata = null;
let globalVendorMetadata = null;
const norm_key = (s) => String(s || "").replace(/[^a-z0-9]/gi, '').toLowerCase();
const getRenderedText = (val, colIndex, row, sheetKey) => {
    let rendered = renderCustomCell(val, colIndex, row, sheetKey);
    if (rendered === null || rendered === undefined) rendered = String(val || "");
    return String(rendered).replace(/<[^>]*>?/gm, '').trim();
};

// Pagination state (used by table render + upload flows)
let currentPage = 1;
let rowsPerPage = 50;

// UI state
let currentSheet = 'portal';     // 'portal' | 'purchase' | 'sale' | 'vendor' | 'savedLinks' | 'queue'
let formulaViewActive = false;   // toggles formula/text rendering

// --- INSIGHTS (Google Sheet read + charts) ---
const INSIGHTS_SHEET_NAME = "AMAZON";
const INSIGHTS_MAX_ROWS = 5000;
let insightsVisible = false;
let insightsLastData = null;
let currentVendorFilter = null; // Track active vendor deep-dive
let insightsResizeTimer = null;
let insightsPrevLayout = null;
let currentInsightsTab = 'global'; // 'global' or 'user'

function setInsightsStatus(message, kind) {
    const el = document.getElementById('insightsStatus');
    if (!el) return;
    el.textContent = message || "";
    el.style.color = kind === 'error' ? '#991b1b' : kind === 'success' ? '#065f46' : '#64748b';
}

function showInsightsView() {
    const container = document.getElementById('insightsContainer');
    const table = document.getElementById('tableContainer');
    const pagination = document.getElementById('paginationControls');
    const linksCont = document.getElementById('savedLinksContainer');
    const queue = document.getElementById('queueContainer');
    insightsPrevLayout = {
        table: table ? table.style.display : "",
        pagination: pagination ? pagination.style.display : "",
        links: linksCont ? linksCont.style.display : "",
        queue: queue ? queue.style.display : ""
    };
    if (container) container.style.display = 'block';
    if (table) table.style.display = 'none';
    if (pagination) pagination.style.display = 'none';
    if (linksCont) linksCont.style.display = 'none';
    if (queue) queue.style.display = 'none';
    insightsVisible = true;
}

function hideInsightsView() {
    const container = document.getElementById('insightsContainer');
    const table = document.getElementById('tableContainer');
    const pagination = document.getElementById('paginationControls');
    const linksCont = document.getElementById('savedLinksContainer');
    const queue = document.getElementById('queueContainer');
    if (container) container.style.display = 'none';
    if (table) table.style.display = (insightsPrevLayout && insightsPrevLayout.table !== undefined) ? insightsPrevLayout.table : 'block';
    if (pagination) pagination.style.display = (insightsPrevLayout && insightsPrevLayout.pagination !== undefined) ? insightsPrevLayout.pagination : pagination.style.display;
    if (linksCont) linksCont.style.display = (insightsPrevLayout && insightsPrevLayout.links !== undefined) ? insightsPrevLayout.links : linksCont.style.display;
    if (queue) queue.style.display = (insightsPrevLayout && insightsPrevLayout.queue !== undefined) ? insightsPrevLayout.queue : queue.style.display;
    insightsVisible = false;
}

function switchInsightsTab(tab) {
    currentInsightsTab = tab;
    const gBtn = document.getElementById('insTabGlobalBtn');
    const uBtn = document.getElementById('insTabUserBtn');
    const gView = document.getElementById('insGlobalView');
    const uView = document.getElementById('insUserView');

    if (tab === 'global') {
        if (gBtn) gBtn.classList.add('active');
        if (uBtn) uBtn.classList.remove('active');
        if (gView) gView.style.display = 'block';
        if (uView) uView.style.display = 'none';
    } else {
        if (gBtn) gBtn.classList.remove('active');
        if (uBtn) uBtn.classList.add('active');
        if (gView) gView.style.display = 'none';
        if (uView) uView.style.display = 'block';
    }

    loadInsights();
}

function renderInsightsFromPayload(payload, requestedLimit) {
    if (!payload || payload.status !== "Success") {
        setInsightsStatus((payload && payload.message) ? payload.message : "Failed to load insights.", "error");
        return;
    }

    if (currentInsightsTab === 'user') {
        renderUserInsights(payload);
        setInsightsStatus("User Performance Updated.", "success");
        return;
    }

    const totals = payload.totals || { rows: 0, sale: 0, purchase: 0 };
    const series = payload.series || { dates: [], counts: [] };
    const remarks = payload.remarkTop || [];

    const kpiRows = document.getElementById('kpiRows');
    const kpiRowsHint = document.getElementById('kpiRowsHint');
    const kpiSale = document.getElementById('kpiSale');
    const kpiPurchase = document.getElementById('kpiPurchase');
    const kpiTopRemark = document.getElementById('kpiTopRemark');
    const kpiTopRemarkHint = document.getElementById('kpiTopRemarkHint');
    const subtitle = document.getElementById('insightsSubtitle');

    if (kpiRows) kpiRows.textContent = String(totals.rows || 0);
    if (kpiRowsHint) kpiRowsHint.textContent = "Loaded: " + String(payload.maxRowsUsed || 0) + " / " + String(requestedLimit);

    if (window.InsightsCharts && kpiSale) kpiSale.textContent = window.InsightsCharts.formatINR(totals.sale || 0);
    if (window.InsightsCharts && kpiPurchase) kpiPurchase.textContent = window.InsightsCharts.formatINR(totals.purchase || 0);

    const kpiAllClear = document.getElementById('kpiAllClear');

    const allClearExact = remarks.find(function(r) { return String(r.label).trim().toUpperCase() === "ALL CLEAR"; });
    const otherRemarks = remarks.filter(function(r) { return String(r.label).trim().toUpperCase() !== "ALL CLEAR"; });
    
    if (kpiAllClear) kpiAllClear.textContent = allClearExact ? String(allClearExact.value) : "0";

    const top = otherRemarks.length ? otherRemarks[0] : null;
    if (kpiTopRemark) kpiTopRemark.textContent = top ? String(top.label || "-") : "-";
    if (kpiTopRemarkHint) kpiTopRemarkHint.textContent = top ? (String(top.value || 0) + " rows") : "0 rows";
    if (subtitle) subtitle.textContent = "Sheet: " + (payload.sheetName || INSIGHTS_SHEET_NAME);

    const lineCanvas = document.getElementById('insightsLineChart');
    const barCanvas = document.getElementById('insightsBarChart');
    const pieCanvas = document.getElementById('insightsPieChart');

    if (window.InsightsCharts && lineCanvas) {
        window.InsightsCharts.drawLineChart(lineCanvas, series.dates || [], series.counts || [], {
            line: "#ff9900",
            fillTop: "rgba(255, 153, 0, 0.22)",
            fillBottom: "rgba(255, 153, 0, 0.03)"
        });
    }

    if (window.InsightsCharts && barCanvas) {
        window.InsightsCharts.drawBarChart(barCanvas, [
            { label: "SALE", value: totals.sale || 0 },
            { label: "PURCHASE", value: totals.purchase || 0 }
        ], {
            barTop: "rgba(255, 153, 0, 0.92)",
            barBottom: "rgba(255, 153, 0, 0.40)"
        });
    }

    if (window.InsightsCharts && pieCanvas) {
        window.InsightsCharts.drawPieChart(pieCanvas, remarks || [], {
            colors: ["#ff9900", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"]
        });
    }

    // Render the New Scrollable Leaderboard
    renderVendorLeaderboard(payload.vendorTop || []);

    // Manage Filter Badge Visibility
    const badge = document.getElementById('vendorFilterBadge');
    const badgeName = document.getElementById('filteredVendorName');
    if (badge && badgeName) {
        if (currentVendorFilter) {
            badge.style.display = 'flex';
            badgeName.textContent = currentVendorFilter;
        } else {
            badge.style.display = 'none';
        }
    }

    setInsightsStatus("Updated. Showing last " + String(payload.maxRowsUsed || 0) + " rows.", "success");
}

function renderVendorLeaderboard(vendors) {
    const container = document.getElementById('vendorLeaderboardList');
    const searchInput = document.getElementById('vendorSearchInput');
    const statsContainer = document.getElementById('vendorTopStats');
    const chartCanvas = document.getElementById('vendorDonutChart');
    if (!container) return;

    // Persist full list
    container.allVendors = vendors;
    const searchTerm = (searchInput ? searchInput.value : "").toLowerCase().trim();
    const filtered = (container.allVendors || []).filter(v => 
        v.label.toLowerCase().includes(searchTerm)
    );

    // --- 1. Analytics (Top 5 Stats + Donut Chart) ---
    const totalRevenue = vendors.reduce((acc, v) => acc + (v.value || 0), 0);
    
    if (statsContainer && totalRevenue > 0) {
        const top5 = [...vendors].sort((a,b) => b.value - a.value).slice(0, 5);
        statsContainer.innerHTML = top5.map((v, i) => {
            const pct = ((v.value / totalRevenue) * 100).toFixed(1);
            const colors = ["#ff9900", "#ffb84d", "#ffd699", "#ff7a00", "#e68a00"]; // Amazon Orange hues
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #fff; border-radius: 10px; border: 1px solid #f1f5f9; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                  <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${colors[i % colors.length]}; flex-shrink: 0;"></div>
                    <span style="font-size: 13px; font-weight: 800; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;">${v.label}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 12px; font-weight: 900; color: ${colors[i % colors.length]};">${pct}%</span>
                    <span style="font-size: 11px; font-weight: 700; color: #94a3b8; min-width: 50px; text-align: right;">${window.InsightsCharts.formatCompact(v.value)}</span>
                  </div>
                </div>
            `;
        }).join('');
    }

    if (window.InsightsCharts && chartCanvas && totalRevenue > 0) {
        const sorted = [...vendors].sort((a,b) => b.value - a.value);
        const chartData = sorted.slice(0, 7);
        if (sorted.length > 7) {
            const groupValue = sorted.slice(7).reduce((acc, v) => acc + (v.value || 0), 0);
            chartData.push({ label: "Others", value: groupValue });
        }
        window.InsightsCharts.drawDonutChart(chartCanvas, chartData, {
            colors: ["#ff9900", "#f59e0b", "#fbbf24", "#fb923c", "#ea580c", "#d97706", "#9a3412", "#64748b"]
        });
    }

    // --- 2. List Rendering ---
    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 40px; color: #94a3b8; font-weight: 700;">No matching vendors found</div>`;
        return;
    }

    const maxVal = Math.max.apply(null, container.allVendors.map(v => v.value).concat([1]));

    container.innerHTML = filtered.map((v, i) => {
        const percent = Math.min(100, Math.max(2, (v.value / maxVal) * 100));
        const avg = v.rows > 0 ? (v.value / v.rows) : 0;
        const isActive = (currentVendorFilter && v.label.toLowerCase() === currentVendorFilter.toLowerCase());

        return `
            <div class="vendor-item" style="${isActive ? 'background: #fff7ed; border-color: #ff9900;' : ''}" onclick="applyVendorDeepDive('${v.label.replace(/'/g, "\\'")}')">
                <div class="v-rank">${i + 1}</div>
                <div class="v-info">
                   <div class="v-name" title="${v.label}">${v.label}</div>
                   <div class="v-stats">${v.rows} Invoices • Avg: ₹${window.InsightsCharts.formatINR(avg)}</div>
                   <div class="v-bar-wrap">
                      <div class="v-bar-fill" style="width: ${percent}%"></div>
                   </div>
                </div>
                <div class="v-value-box">
                    <div class="v-value">₹${window.InsightsCharts.formatINR(v.value)}</div>
                    <div style="font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Total Sale</div>
                </div>
            </div>
        `;
    }).join('');

    // Attach search listener once
    if (searchInput && !searchInput.dataset.listening) {
        searchInput.dataset.listening = "true";
        searchInput.addEventListener('input', () => renderVendorLeaderboard(container.allVendors));
    }
}

function renderUserInsights(payload) {
    const userStats = payload.userStats || [];
    const leaderboardCont = document.getElementById('userLeaderboardContent');
    const platformStatsCont = document.getElementById('userPlatformWorkload');
    const chartCanvas = document.getElementById('userProductivityChart');
    const teamAvgKPI = document.getElementById('teamAverageKPI');
    const teamIntKPI = document.getElementById('teamIntegrityKPI');
    const activeUsersKPI = document.getElementById('activeUsersKPI');
    const platformPieCanvas = document.getElementById('userPlatformPieChart');

    if (!userStats || userStats.length === 0) {
        if (leaderboardCont) leaderboardCont.innerHTML = '<div style="padding:40px; text-align:center; color:#94a3b8; font-weight:700;">No user data found in the sync records.</div>';
        if (platformStatsCont) platformStatsCont.innerHTML = "";
        if (teamAvgKPI) teamAvgKPI.textContent = "0";
        if (teamIntKPI) teamIntKPI.textContent = "0%";
        if (activeUsersKPI) activeUsersKPI.textContent = "0";
        return;
    }

    const totalInvoices = userStats.reduce((sum, u) => sum + (u.totalRows || 0), 0);
    const totalDisputes = userStats.reduce((sum, u) => sum + (u.disputeRows || 0), 0);
    const avgRows = Math.round(totalInvoices / userStats.length);
    const dataIntegrity = totalInvoices > 0 ? (((totalInvoices - totalDisputes) / totalInvoices) * 100).toFixed(1) : "0.0";

    if (teamAvgKPI) teamAvgKPI.textContent = avgRows.toLocaleString();
    if (teamIntKPI) teamIntKPI.textContent = `${dataIntegrity}%`;
    if (activeUsersKPI) activeUsersKPI.textContent = userStats.length;

    // 1. Draw Grouped Bar Chart (Top 7 Users)
    if (window.InsightsCharts && chartCanvas) {
        const topUsers = [...userStats].sort((a, b) => b.totalRows - a.totalRows).slice(0, 7);
        window.InsightsCharts.drawBarChart(chartCanvas, topUsers.map(u => ({
            label: u.nickname,
            sale: u.totalRows,
            purchase: u.disputeRows
        })), {
            barTop: '#6366f1',
            barBottom: '#ef4444',
            saleLabel: 'Total Invoices',
            purchaseLabel: 'Disputes'
        });
    }

    // 2. Render Leaderboard
    if (leaderboardCont) {
        leaderboardCont.innerHTML = userStats.sort((a,b) => b.totalRows - a.totalRows).map((u, i) => {
            const disputeRate = u.totalRows > 0 ? ((u.disputeRows / u.totalRows) * 100).toFixed(1) : 0;
            const rankIcon = i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
            return `
                <div class="user-card">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="user-rank-badge">${i + 1}</div>
                            <span class="user-name-tag">${u.nickname} ${rankIcon}</span>
                        </div>
                        <span style="font-size: 11px; font-weight: 800; color: ${u.disputeRows > 5 ? '#ef4444' : '#10b981'}; background: ${u.disputeRows > 5 ? '#fef2f2' : '#f0fdf4'}; padding: 4px 8px; border-radius: 6px;">
                            ${disputeRate}% Dispute Rate
                        </span>
                    </div>
                    <div class="user-stat-grid">
                        <div class="user-stat-item">
                            <span class="label">Total Invoices</span>
                            <span class="value" style="color: #6366f1;">${u.totalRows}</span>
                        </div>
                        <div class="user-stat-item">
                            <span class="label">Disputes</span>
                            <span class="value" style="color: #ef4444;">${u.disputeRows}</span>
                        </div>
                        <div class="user-stat-item">
                            <span class="label">Accuracy</span>
                            <span class="value" style="color: #10b981;">${(100 - disputeRate).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3. Render Platform Distribution Stats
    if (platformStatsCont) {
        platformStatsCont.innerHTML = userStats.sort((a,b) => b.totalRows - a.totalRows).slice(0, 5).map(u => {
            const total = u.totalRows || 1;
            return `
                <div style="background: #f8fafc; padding: 12px; border-radius: 12px; margin-bottom: 8px; border: 1px solid #f1f5f9;">
                    <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 13px; margin-bottom: 8px; color: #1e293b;">
                        <span>${u.nickname}</span>
                        <span style="color: #6366f1;">${u.totalRows} Total</span>
                    </div>
                    <div style="display: flex; gap: 4px; height: 6px; border-radius: 10px; overflow: hidden; background: #e2e8f0;">
                        <div style="width: ${(u.amazon / total * 100) || 0}%; background: #ff9900; transition: width 0.5s ease;"></div>
                        <div style="width: ${(u.ajio / total * 100) || 0}%; background: #1e293b; transition: width 0.5s ease;"></div>
                        <div style="width: ${(u.myntra / total * 100) || 0}%; background: #ff3f6c; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 6px; font-weight: 700; color: #64748b;">
                        <span>Amazon: ${u.amazon}</span>
                        <span>Ajio: ${u.ajio}</span>
                        <span>Myntra: ${u.myntra}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (window.InsightsCharts && platformPieCanvas) {
        const teamAmazon = userStats.reduce((sum, u) => sum + (u.amazon || 0), 0);
        const teamAjio = userStats.reduce((sum, u) => sum + (u.ajio || 0), 0);
        const teamMyntra = userStats.reduce((sum, u) => sum + (u.myntra || 0), 0);
        window.InsightsCharts.drawDonutChart(platformPieCanvas, [
            { label: 'Amazon', value: teamAmazon },
            { label: 'Ajio', value: teamAjio },
            { label: 'Myntra', value: teamMyntra }
        ], {
            colors: ['#ff9900', '#1e293b', '#ff3f6c']
        });
    }
}

// Global scope for onclick
window.applyVendorDeepDive = async (vendorName) => {
    if (currentVendorFilter === vendorName) return; 
    currentVendorFilter = vendorName;
    
    // Clear search and scroll top
    const searchInput = document.getElementById('vendorSearchInput');
    if (searchInput) searchInput.value = "";

    await loadInsights(); // Re-fetch from server with filter
};

// Clear Filter logic
document.addEventListener('DOMContentLoaded', () => {
    const clearBtn = document.getElementById('clearVendorFilterBtn');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            currentVendorFilter = null;
            await loadInsights();
        };
    }
});

async function loadInsights() {
    const select = document.getElementById('insightsRowLimit');
    let requested = parseInt(select ? select.value : "", 10);
    if (isNaN(requested) || requested < 1) requested = 2000;
    requested = Math.min(requested, INSIGHTS_MAX_ROWS);

    setInsightsStatus("Loading insights...", "info");

    if (typeof window.consumeGlobalApiCredit === 'function') {
        await window.consumeGlobalApiCredit(1);
    }

    const action = (currentInsightsTab === 'user') ? "getUserInsights" : "getInsights";

    const raw = await window.apiBridge({ 
        action: action, 
        sheetName: INSIGHTS_SHEET_NAME, 
        maxRows: requested,
        vendorFilter: currentVendorFilter // Mandatory for deep-dive
    });
    try {
        const parsed = JSON.parse(raw);
        insightsLastData = { payload: parsed, requestedLimit: requested };
        renderInsightsFromPayload(parsed, requested);
    } catch (e) {
        console.error("Insights Parse Error:", e, raw);
        setInsightsStatus("Error: Failed to parse insights data. Please check connection.", "error");
    }
}

// Function to get nickname from storage
async function getNickname() {
    try {
        const result = await chrome.storage.local.get(['nickname']);
        return result.nickname || 'User';
    } catch (error) {
        console.error('Error getting nickname:', error);
        return 'User';
    }
}
window.showPurchaseKeys = () => { console.log("--- Purchase Map Keys ---"); console.log(Array.from(purchaseMap.keys())); };

let portalSumNet = 0, portalSumGrand = 0, portalSumCgst = 0, portalSumSgst = 0, portalSumQty = 0;
let priceMatchStatusGlobal = "TRUE";
let globalAuditHasIssueAV = false;
let globalAuditHasIssueBC = false;



// --- COLUMN FILTERING STATE ---
let globalFilters = { portal: {}, purchase: {}, sale: {}, vendor: {} }; 
let currentSortedCol = { index: -1, order: 'none' }; // { index, order: 'asc'|'desc' }

const PORTAL_HEADERS = [
    "ORDER ID", "ORDER ITEM ID", "PURCHASE DATE", "PAYMENTS DATE", 
    "SHIPMENT DATE", "INVOICE DATE", "GST ID", "ASIN", 
    "SKU", "ITEM TITLE", "QUANTITY", "ITEM COST", 
    "GST RATE", "CESS RATE", "HSN", "WAREHOUSE", 
    "STATUS", "TCS", "COL S", "VALUE", "U", "MATCH KEY", "UNIT COST", "SALE TCS", "DIFF W-X", "VENDOR COST", "DIFF W-Z",
    "PURCHASE MATCH", "V=AB", "SALE TAX %", "M=AD", "VC TAX %", "M=AF", "CALC GST/2", "SALE CGST",
    "DIFF-CGST", "VC CGST", "DIFF-VC-CGST", "CALC SGST", "SALE SGST", "DIFF-SGST", "VC SGST", "DIFF-VC-SGST", "A&U&H",
    "UNIT COST", "SALE PRICE", "PUR PRICE", "DIFF AS-AU", "PUR GST/2", "PUR GST/2-2", "SALE QTY", "SALE TOTAL", "VC QTY", "VC TOTAL", "DIFF AT-AU", "PUR TOTAL", "PRICE STATUS",
    "SALE ORDER ID", "SALE INV NO", "SALE INV DATE", "SALE INV DATE (BI)", "SALE QTY (BJ)", "SALE NET GRAND (BK)", "-", "⭐ (BM)", "SALE ORDER ID (BN)", "PUR INV NO (BO)", "SALE INV DATE (BP)", "PUR QTY (BQ)", "PUR WITH TAX (BR)", "-", "SYSTEM TIMESTAMP (BT)", "SALE DISPUTE STATUS (BU)"
];

const DB_NAME = "AmazonDashboardDB";
const STORE_NAME = "sheets";
const PDF_STORE_NAME = "saved_invoice_pdf_links";
const REPORTS_STORE_NAME = "reports_log";

// --- DATABASE LOGIC ---
function openDB() { 
    return new Promise((res, rej) => { 
        const r = indexedDB.open(DB_NAME, 3); // Bump version to 3
        r.onupgradeneeded=(e)=>{ 
            const db=e.target.result; 
            if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME,{keyPath:"id"}); 
            if(!db.objectStoreNames.contains(PDF_STORE_NAME)) db.createObjectStore(PDF_STORE_NAME,{keyPath:"invoiceNo"}); 
            if(!db.objectStoreNames.contains(REPORTS_STORE_NAME)) db.createObjectStore(REPORTS_STORE_NAME,{keyPath:"timestamp"});
        }; 
        r.onsuccess=(e)=>res(e.target.result); 
        r.onerror=(e)=>rej(e.target.error); 
    }); 
}
async function saveToDB(id,data){try{const db=await openDB();const tx=db.transaction(STORE_NAME,"readwrite");tx.objectStore(STORE_NAME).put({id,data});}catch(e){}}
async function getFromDB(id){try{const db=await openDB();const tx=db.transaction(STORE_NAME,"readonly");const req=tx.objectStore(STORE_NAME).get(id);return new Promise(res=>req.onsuccess=()=>res(req.result?req.result.data:null));}catch(e){return null;}}
async function deleteFromDB(id){try{const db=await openDB();const tx=db.transaction(STORE_NAME,"readwrite");tx.objectStore(STORE_NAME).delete(id);}catch(e){}}

// PDF Link Storage Helpers
async function savePdfLink(invoiceNo, link) {
    try {
        const db = await openDB();
        const tx = db.transaction(PDF_STORE_NAME, "readwrite");
        tx.objectStore(PDF_STORE_NAME).put({ invoiceNo, link, timestamp: Date.now() });
    } catch (e) { console.error("Save Link Error:", e); }
}

async function getAllPdfLinks() {
    try {
        const db = await openDB();
        const tx = db.transaction(PDF_STORE_NAME, "readonly");
        const req = tx.objectStore(PDF_STORE_NAME).getAll();
        return new Promise(res => req.onsuccess = () => res(req.result || []));
    } catch (e) { return []; }
}

async function deletePdfLink(invoiceNo) {
    try {
        const db = await openDB();
        const tx = db.transaction(PDF_STORE_NAME, "readwrite");
        tx.objectStore(PDF_STORE_NAME).delete(invoiceNo);
    } catch (e) { }
}

async function cleanupSavedLinks() {
    const links = await getAllPdfLinks();
    const now = Date.now();
    const expiry = 24 * 60 * 60 * 1000; // 24 Hours
    for (const link of links) {
        if (now - link.timestamp > expiry) {
            await deletePdfLink(link.invoiceNo);
        }
    }
}

// --- REPORT LOG STORAGE HELPERS ---
async function saveReportEntry(entry) {
    try {
        const db = await openDB();
        const tx = db.transaction(REPORTS_STORE_NAME, "readwrite");
        // Ensure timestamp is current if not provided
        if (!entry.timestamp) entry.timestamp = Date.now();
        tx.objectStore(REPORTS_STORE_NAME).put(entry);
    } catch (e) { console.error("Report Save Error:", e); }
}

async function getAllReports() {
    try {
        const db = await openDB();
        const tx = db.transaction(REPORTS_STORE_NAME, "readonly");
        const req = tx.objectStore(REPORTS_STORE_NAME).getAll();
        return new Promise(res => req.onsuccess = () => res(req.result || []));
    } catch (e) { return []; }
}

async function deleteReportEntry(timestamp) {
    try {
        const db = await openDB();
        const tx = db.transaction(REPORTS_STORE_NAME, "readwrite");
        tx.objectStore(REPORTS_STORE_NAME).delete(timestamp);
    } catch (e) { }
}

async function cleanupOldReports() {
    const reports = await getAllReports();
    const now = Date.now();
    const expiry = 24 * 60 * 60 * 1000; // 24 Hours
    for (const rep of reports) {
        if (now - rep.timestamp > expiry) {
            await deleteReportEntry(rep.timestamp);
        }
    }
}

// --- INITIALIZATION ---
window.addEventListener('load', async () => {
    // Cleanup old data
    await cleanupSavedLinks();
    await cleanupOldReports();
    
    // 0. Initialize User Badge
    globalNickname = await getNickname();
    if (typeof window.displayUserNickname === 'function') {
        window.displayUserNickname('userNicknameContainer');
    }

    const rawPortal = await getFromDB("raw_portal");
    const rawPur = await getFromDB("raw_purchase");
    const rawSaleSum = await getFromDB("raw_sale_summary");
    const rawSaleDet = await getFromDB("raw_sale_details");
    const rawVen = await getFromDB("raw_vendor");

    if (rawPortal) {
        globalPortalData = rawPortal.map(r => { let row = [...r]; while(row.length < 74) row.push(""); return row; });
        if (globalPortalData.length > 0) {
            globalPortalData[0] = [...PORTAL_HEADERS, "BV"];
            const r1 = globalPortalData[1] || [];
            globalPortalMetadata = { seller: r1[0] || "Multiple Sellers", gstin: r1[6] || "-", date: r1[5] || "-", status: r1[16] || "Processed" };
        }
        // Ensure nickname is set in BV2 cell on load
        if (globalPortalData.length > 1 && globalPortalData[1].length > 73) {
            globalPortalData[1][73] = globalNickname;
        }
        await saveToDB("raw_portal", globalPortalData);
        recalculatePortalAggregates();
        const s = document.getElementById('portalFileStatus'); if(s) { s.textContent = "✅ Restored"; s.className = "fm-status status-success"; }
    }
    if (rawPur) { performPurchaseProcessing(rawPur); const s = document.getElementById('purchaseFileStatus'); if(s) { s.textContent = "✅ Restored"; s.className = "fm-status status-success"; } }
    if (rawSaleSum && rawSaleDet) { performSaleProcessing(rawSaleSum, rawSaleDet); const s = document.getElementById('saleFileStatus'); if(s) { s.textContent = "✅ Restored"; s.className = "fm-status status-success"; } }
    if (rawVen) { performVendorProcessing(rawVen); const s = document.getElementById('vendorFileStatus'); if(s) { s.textContent = "✅ Restored"; s.className = "fm-status status-success"; } }

    setupSharedEventListeners();
    const lastTab = localStorage.getItem('amazon_active_tab') || 'portal';
    switchTab(lastTab);
    cleanupSavedLinks(); // Run cleanup on load
});

function setupSharedEventListeners() {
    const addListener = (id, event, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(event, fn); };
    
    addListener('tabPortalBtn', 'click', () => switchTab('portal'));
    addListener('tabPurchaseBtn', 'click', () => switchTab('purchase'));
    addListener('tabSaleBtn', 'click', () => switchTab('sale'));
    addListener('tabVendorBtn', 'click', () => switchTab('vendor'));
    addListener('tabSavedLinksBtn', 'click', () => switchTab('savedLinks'));
    addListener('tabReportBtn', 'click', () => switchTab('report'));
    addListener('openUploadModalBtn', 'click', () => {
        const modal = document.getElementById('uploadModal');
        if (modal) modal.style.display = 'flex';
    });
    addListener('closeUploadModalBtn', 'click', () => {
        const modal = document.getElementById('uploadModal');
        if (modal) modal.style.display = 'none';
    });
    addListener('searchInput', 'input', applySearchFilter);
    addListener('clearBtn', 'click', clearAllData);
    addListener('formulaBtn', 'click', function() { 
        formulaViewActive = !formulaViewActive; 
        this.innerHTML = formulaViewActive ? 
            `<span>✅</span> SHOW RESULTS` : 
            `<span>📝</span> SHOW FORMULAS`; 
        renderTable(); 
    });

    // Dropdown Logic
    const toggle = document.getElementById('actionsToggleBtn');
    const dropdown = document.getElementById('actionsDropdown');
    if (toggle && dropdown) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) dropdown.classList.remove('active');
        });
    }
    addListener('processPortalBtn', 'click', processPortal);
    addListener('processPurchaseBtn', 'click', processPurchase);
    addListener('processSaleBtn', 'click', processSale);
    addListener('processVendorBtn', 'click', processVendor);
    addListener('sendToGoogleSheetBtn', 'click', pushDetailsToGoogleSheet);

    // Insights
    addListener('insightsBtnHeader', 'click', async () => {
        showInsightsView();
        await loadInsights();
    });
    addListener('insightsBackBtn', 'click', hideInsightsView);
    addListener('insightsRefreshBtn', 'click', loadInsights);
    addListener('insTabGlobalBtn', 'click', () => switchInsightsTab('global'));
    addListener('insTabUserBtn', 'click', () => switchInsightsTab('user'));

    window.addEventListener('resize', () => {
        if (!insightsVisible || !insightsLastData) return;
        if (insightsResizeTimer) clearTimeout(insightsResizeTimer);
        insightsResizeTimer = setTimeout(() => {
            renderInsightsFromPayload(insightsLastData.payload, insightsLastData.requestedLimit);
        }, 150);
    });
    addListener('closeFmBtn', 'click', () => {
        const modal = document.getElementById('uploadModal');
        if (modal) modal.style.display = 'none';
    });
    addListener('invoiceDetailsBtnHeader', 'click', () => { if(window.openInvoiceDetails) window.openInvoiceDetails(); });
    addListener('closeIdBtn', 'click', () => { 
        const modal = document.getElementById('invoiceDetailsModal');
        if (modal) modal.style.display = 'none'; 
    });
    addListener('saleDetailsBtnHeader', 'click', () => { if(window.openSaleDetails) window.openSaleDetails(); });
    addListener('closeSaleIdBtn', 'click', () => { 
        const modal = document.getElementById('saleDetailsModal');
        if (modal) modal.style.display = 'none'; 
    });
    
    // Pagination Listeners
    addListener('pgSizeSelect', 'change', (e) => { rowsPerPage = parseInt(e.target.value); currentPage = 1; renderTable(); });
    addListener('pgJumpBtn', 'click', () => {
        const jumpInput = document.getElementById('pgJumpInput');
        const jump = parseInt(jumpInput ? jumpInput.value : 0);
        const totalPages = Math.ceil((globalFilteredData.length - 1) / rowsPerPage);
        if (jump > 0 && jump <= totalPages) { currentPage = jump; renderTable(); }
    });
    addListener('pgJumpInput', 'keydown', (e) => { 
        if (e.key === 'Enter') {
            const btn = document.getElementById('pgJumpBtn');
            if (btn) btn.click();
        }
    });

    addListener('searchColSelect', 'change', (e) => { 
        searchColIdx = parseInt(e.target.value); 
        refreshView(); 
    });

    // API Tracker Initialization
    const updateLocalApiDisplay = async () => {
        await window.syncApiDisplay('apiCountDisplay');
    };
    updateLocalApiDisplay();

    const apiHeader = document.getElementById('apiTrackerHeader');
    if (apiHeader) {
        apiHeader.addEventListener('click', async () => {
            await window.consumeGlobalApiCredit();
            await window.syncApiDisplay('apiCountDisplay', true);
        });
    }

    addListener('syncSaleBtn', 'click', syncSaleToPortal);
    
    // Report Tab Listeners
    addListener('exportReportBtn', 'click', exportReportToExcel);
    addListener('clearReportBtn', 'click', async () => {
        const confirmed = await window.showCustomConfirm("Are you sure you want to clear ALL report entries?", "Clear Reports");
        if (confirmed) {
            const reports = await getAllReports();
            for (const r of reports) await deleteReportEntry(r.timestamp);
            renderReportTab();
        }
    });
}

// --- GLOBAL HELPERS FOR AMAZON ---
const isNear = (v1, v2) => Math.abs((parseFloat(v1)||0) - (parseFloat(v2)||0)) < 1;

function hasPortalErrors(colIdx) {
    if (!globalPortalData || globalPortalData.length <= 1) return false;
    for (let i = 1; i < globalPortalData.length; i++) {
        const row = globalPortalData[i];
        const val = renderCustomCell(null, colIdx, row, 'portal', i);
        if (val === "#N/A") return true;
    }
    return false;
}

function showPortalErrorWarning(colName) {
    const modal = document.getElementById('warningModal');
    const msg = document.getElementById('warningMessageText');
    if (msg) {
        msg.textContent = `Portal data contains '#N/A' errors in Column ${colName}. This means some items in your Portal file do not match the required records. Please fix these errors first to ensure your auditing is 100% accurate.`;
    }
    if (modal) modal.style.display = 'flex';
}

function closeWarningModal() {
    const modal = document.getElementById('warningModal');
    if (modal) modal.style.display = 'none';
}

// --- SHARED DATA & STATE ---
function switchTab(t) { 
    console.log(`[DEBUG] Attempting Switch to Tab: "${t}"`);
    currentSheet=t; 
    currentPage=1; 
    localStorage.setItem('amazon_active_tab',t); 

    if (insightsVisible) {
        const ins = document.getElementById('insightsContainer');
        if (ins) ins.style.display = 'none';
        insightsVisible = false;
    }
    
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); 
    const btnId = `tab${t.charAt(0).toUpperCase()+t.slice(1)}Btn`;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.classList.add('active');
    } else {
        console.warn(`[DEBUG] Tab Button with ID "${btnId}" NOT FOUND!`);
    }
    
    // Toggle containers
    const tableCont = document.getElementById('tableContainer');
    const linksCont = document.getElementById('savedLinksContainer');
    const reportCont = document.getElementById('reportContainer');
    const pgCont = document.getElementById('paginationControls');

    if (t === 'savedLinks') {
        tableCont.style.display = 'none';
        pgCont.style.display = 'none';
        linksCont.style.display = 'block';
        if (reportCont) reportCont.style.display = 'none';
        renderSavedLinksTab();
        cleanupSavedLinks(); 
    } else if (t === 'report') {
        tableCont.style.display = 'none';
        pgCont.style.display = 'none';
        linksCont.style.display = 'none';
        if (reportCont) reportCont.style.display = 'block';
        renderReportTab();
    } else {
        tableCont.style.display = 'block';
        pgCont.style.display = (t==='portal'||t==='purchase'||t==='sale'||t==='vendor') ? 'flex' : 'none';
        linksCont.style.display = 'none';
        if (reportCont) reportCont.style.display = 'none';
        runFilterLogic(); 
    }
    if (typeof window.mountGlobalActionButton === 'function') {
        window.mountGlobalActionButton('sendToGoogleSheetBtn', 'pushStatus', globalPortalData.length > 1);
    }
}

function refreshView() {
    updateSearchDropdown();
    renderTable();
}


async function renderSavedLinksTab() {
    const body = document.getElementById('savedLinksBody');
    if (!body) return;
    const links = await getAllPdfLinks();
    
    if (links.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #94a3b8;">No saved links found. Data clears after 24 hours.</td></tr>';
        return;
    }

    body.innerHTML = links.map(l => {
        const dateStr = new Date(l.timestamp).toLocaleString();
        return `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                <td style="padding: 12px; font-weight: 700; color: #1e293b;">${l.invoiceNo}</td>
                <td style="padding: 12px; color: #6366f1; word-break: break-all;"><a href="${l.link}" target="_blank">${l.link.substring(0, 100)}...</a></td>
                <td style="padding: 12px; color: #64748b;">${dateStr}</td>
                <td style="padding: 12px;">
                    <button class="delete-link-btn" data-inv="${l.invoiceNo}" style="padding: 5px 10px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">DELETE</button>
                </td>
            </tr>
        `;
    }).join('');

    // Remove old listeners and add a fresh one (Delegated)
    body.onclick = null; 
    body.onclick = async (e) => {
        if (e.target.classList.contains('delete-link-btn')) {
            const invNo = e.target.getAttribute('data-inv');
            await deletePdfLink(invNo);
            renderSavedLinksTab();
        }
    };
}

function applySearchFilter() {
    runFilterLogic();
}

function updateSearchDropdown() {
    const select = document.getElementById('searchColSelect');
    if (!select) return;

    const headers = globalFilteredData[0] || [];
    let html = '<option value="-1">All Columns</option>';
    
    headers.forEach((h, i) => {
        if (!h || h.trim() === "") return;
        const letter = getColLetter(i);
        // Highlight columns from W (22) onwards in the list if in Portal
        const label = h.length > 20 ? h.substring(0, 17) + "..." : h;
        html += `<option value="${i}" ${searchColIdx === i ? 'selected' : ''}>${label} (${letter})</option>`;
    });
    
    select.innerHTML = html;
}

function getColLetter(n) {
    let s = "";
    while (n >= 0) {
        s = String.fromCharCode((n % 26) + 65) + s;
        n = Math.floor(n / 26) - 1;
    }
    return s;
}
async function clearAllData() {
    const confirmed = await window.showCustomConfirm("Are you sure you want to delete stored Amazon Portal, Sale, Purchase, and Vendor Center data? Pending queue transfers will not be deleted.", "Clear All Data");
    if (!confirmed) return;

    await deleteFromDB('raw_portal'); await deleteFromDB('raw_sale_summary'); await deleteFromDB('raw_sale_details'); await deleteFromDB('raw_purchase'); await deleteFromDB('raw_vendor');
    
    // Reset all global states
    globalPortalData=[]; globalSaleData=[]; globalPurchaseData=[]; globalVendorData=[];
    globalPurchaseMetadata=null; globalSaleMetadata=null; globalPortalMetadata=null; globalVendorMetadata=null;
    globalFilteredData=[];
    
    portalSumNet = 0; portalSumGrand = 0; portalSumCgst = 0; portalSumSgst = 0; portalSumQty = 0;
    priceMatchStatusGlobal = "TRUE";
    
    purchaseMap.clear(); saleMap.clear(); vendorMap.clear(); 
    
    await window.showCustomSuccess("Data cleared successfully.", "Cleared");
    location.reload(); 
}
function getPortalGSTRate(r) { let s=String(r[12]||"").trim(); if(s.includes("%")) return parseFloat(s)/100; let v=parseFloat(s)||0; return (v>0&&v<1)?v:(v/100); }

function recalculatePortalAggregates() {
    if(!globalPortalData||globalPortalData.length<=1){ 
        portalSumQty = 0; portalSumNet = 0; portalSumGrand = 0; portalSumCgst = 0; portalSumSgst = 0;
        priceMatchStatusGlobal="TRUE"; 
        globalAuditHasIssueAV = false;
        globalAuditHasIssueBC = false;
        return; 
    }
    let q=0, n=0, wt=0, c=0, s=0;
    
    // Reset flags
    globalAuditHasIssueAV = false;
    globalAuditHasIssueBC = false;

    for (let i=1; i<globalPortalData.length; i++) {
        const r=globalPortalData[i]; 
        const qty = parseFloat(r[10]) || 0;
        const net = parseFloat(r[11]) || 0;
        const m = getPortalGSTRate(r);
        
        q += qty;
        n += net;
        wt += (net * m + net);
        c += ((m/2) * net);
        s += ((m/2) * net);
        
        // --- Pre-calculate Audit Statuses for Column BE (Index 56) ---
        // AV (Index 47): AS-AU | BC (Index 54): AT-AU
        // This avoids O(N^2) loops during rendering/filtering
        const u_cost = parseFloat(r[11]) / (parseFloat(r[10]) || 1);
        const orderId = String(r[0]||"").trim();
        const asin = String(r[7]||"").trim();
        const sku = String(r[8]||"").trim();
        const vKey = norm_key(orderId) + norm_key(asin) + norm_key(sku);
        
        const pM = purchaseMap.get(vKey);
        const sM = saleMap.get(vKey);
        const p_price = pM ? parseFloat(pM[16]) : 0;
        const s_price = sM ? parseFloat(sM[17]) : 0;

        if (!globalAuditHasIssueAV) {
            const valAV = (u_cost - p_price);
            if (!pM || valAV < -0.01) globalAuditHasIssueAV = true;
        }
        if (!globalAuditHasIssueBC) {
            const valBC = (s_price - p_price);
            if (!sM || !pM || valBC < -0.01) globalAuditHasIssueBC = true;
        }
    }
    portalSumQty = q;
    portalSumNet = n;
    portalSumGrand = wt; 
    portalSumCgst = c;
    portalSumSgst = s;
    priceMatchStatusGlobal = (globalAuditHasIssueAV || globalAuditHasIssueBC) ? "FALSE" : "TRUE";
}

function getAmazonFormula(type, col, rowIdx) {
    const r = rowIdx + 1; // Excel row number 
    if (type === 'portal') {
        if (col === 12) return "=M" + r;
        if (col === 19) return "=L" + r + "*M" + r + "+L" + r;
        if (col === 21) return "=A" + r + "&H" + r + "&I" + r;
        if (col === 22) return "=L" + r + "/K" + r;
        if (col === 23) return "=IF(V" + r + "=\"\",\"\",IFERROR(VLOOKUP(V" + r + ", SALE!$Q$2:$R$367, 2, FALSE),\"\"))";
        if (col === 24) return "=W" + r + "-X" + r;
        if (col === 25) return "=IFERROR(VLOOKUP(V" + r + ", VENDOR!$H$1:$AJ$2000, 21, 0), \"#N/A\")";
        if (col === 26) return "=W" + r + "-Z" + r;
        if (col === 27) return "=VLOOKUP(V" + r + ", PURCHASE!$P$2:$P$365, 1, )";
        if (col === 28) return "=V" + r + "=AB" + r;
        if (col === 29) return "=IF(V" + r + "=\"\",\"\",IFERROR(VLOOKUP(V" + r + ", SALE!$Q$2:$S$367, 3, FALSE),\"\"))";
        if (col === 30) return "=M" + r + "=AD" + r;
        if (col === 31) return "=VLOOKUP(V" + r + ", VC!$T$1:$V$350, 3, )";
        if (col === 32) return "=M" + r + "=AF" + r;
        if (col === 33) return "=M" + r + "/2*L" + r;
        if (col === 34) return "=IF(V" + r + "=\"\",\"\",IFERROR(VLOOKUP(V" + r + ", SALE!$Q$18:$T$367, 4, FALSE),\"\"))";
        if (col === 35) return "=AH" + r + "-AI" + r;
        if (col === 36) return "=VLOOKUP(V" + r + ", VC!$T$1:$Y$350, 6, )";
        if (col === 37) return "=AH" + r + "-AK" + r;
        if (col === 38) return "=M" + r + "/2*L" + r;
        if (col === 39) return "=IF(V" + r + "=\"\",\"\",IFERROR(VLOOKUP(V" + r + ", SALE!$Q$2:$U$367, 5, FALSE),\"\"))";
        if (col === 40) return "=AM" + r + "-AN" + r;
        if (col === 41) return "=VLOOKUP(V" + r + ", VC!$T$1:$Z$350, 7, )";
        if (col === 42) return "=AM" + r + "-AP" + r;
        if (col === 43) return "=A" + r + "&U" + r + "&H" + r;
        if (col === 44) return "=W" + r;
        if (col === 45) return "=IF(V" + r + "=\"\",\"\",IFERROR(VLOOKUP(V" + r + ", SALE!$Q$2:$R$367, 2, FALSE),\"\"))";
        if (col === 46) return "=VLOOKUP(V" + r + ", PURCHASE!$P$2:$Q$365, 2, )";
        if (col === 47) return "=AS" + r + "-AU" + r;
        if (col === 48 || col === 49) return "=VLOOKUP(V" + r + ", PURCHASE!$P$2:$S$365, 3, )";
        if (col === 50) return "=IF(V" + r + "=\"\",\"\",IFERROR(VLOOKUP(V" + r + ", SALE!$Q$2:$R$367, 2, FALSE),\"\"))";
        if (col === 51) return "=IF(V" + r + "=\"\",\"\",IFERROR(VLOOKUP(V" + r + ", SALE!$Q$2:$X$367, 8, FALSE),\"\"))";
        if (col === 52) return "=VLOOKUP(V" + r + ", VC!$T$1:$X$350, 4, )";
        if (col === 53) return "=VLOOKUP(V" + r + ", VC!$T$1:$X$350, 5, )";
        if (col === 54) return "=AT" + r + "-AU" + r;
        if (col === 55) return "=VLOOKUP(V" + r + ", PURCHASE!$P$2:$W$365, 8, )";
        if (col === 56) {
            if (r === 3) return "=IF(OR(COUNTIF(AV2:AV350, \"<0\")>0, SUMPRODUCT(--ISNA(AV2:AV350))>0), FALSE, TRUE)";
            if (r === 4) return "=IF(BE3=TRUE, \"TRUE ✅ \", \"FALSE ❌ \")";
            if (r === 5) return "=IF(OR(COUNTIF(BC2:BC350, \"<0\")>0, SUMPRODUCT(--ISNA(BC2:BC350))>0), FALSE, TRUE)";
        }
        if (r === 2) {
            if (col === 57 || col === 65) return "='SALE'!Q2";  // SALE ORDER ID (BF, BN)
            if (col === 58) return "='SALE'!C2";               // SALE INV NO
            if (col === 59 || col === 60 || col === 67) return "='SALE'!I2"; // SALE INV DATE (BH, BI, BP)
            if (col === 61) return "='SALE'!F2";               // SALE QTY
            if (col === 62) return "='SALE'!H2";               // SALE NET GRAND
            if (col === 64) return "=\"⭐\"";                   // STAR (BM)
            if (col === 66) return "='PURCHASE'!B2";           // PUR INV NO (BO)
            if (col === 68) return "='PURCHASE'!L2";           // PUR QTY (BQ)
            if (col === 69) return "='PURCHASE'!O2";           // PUR WITH TAX (BR)
            if (col === 71) return "=\"" + new Date().toLocaleString() + " (" + globalNickname + ")\""; // SYSTEM TIMESTAMP (BT)
            if (col === 72) return "=IF(COUNTA('SALE'!P2:P367)>0, \"DISPUTE\", \"ALL CLEAR\")"; // DISPUTE STATUS (BU)
        }
    } else if (type === 'purchase') {
        if (col === 15) return "=B" + r + "&C" + r + "&D" + r;
        if (col === 16) return "=I" + r;
        if (col === 17 || col === 18) return "=J" + r + "/2*I" + r;
        if (col === 19) return "=H" + r;
        if (col === 20) return "=J" + r;
        if (col === 21) return "=Q" + r + "*T" + r;
        if (col === 22) return "=V" + r + "*U" + r + "+V" + r;
        if (col === 23) return "-";
        if (col === 24) return "=A" + r + "&X" + r + "&B" + r;
        if (col === 25) return "=I" + r + "*H" + r;
        if (col === 26) return "=Z" + r + "*(1+M" + r + "/100)";
        if (col === 27) return "=B" + r + "&W" + r + "&C" + r;
        if (col === 28) return "=J" + r + "*0.001";
        if (col === 29) return "=AA" + r + "-AB" + r;
    } else if (type === 'sale') {
        if (col === 19 || col === 20) return "=(I" + r + "/200)*H" + r;
        if (col === 26 && r === 2) return "=IF(AND(SALE!P1 = \"Reason ( System Cost)\", COUNTA(SALE!P2:P367) > 0), \"ERROR\", IF(SALE!P1 = \"Reason ( System Cost)\", \"OK\", IF(COUNTA(SALE!P2:P367) = 0, \"OK\", \"ERROR\")))";
    }
    return null;
}

// --- RENDERING ENGINE ---
function renderCustomCell(val, colIndex, rowData, type, originalIndex) {
    if (type === 'portal') {
        const L=parseFloat(rowData[11])||0, K=parseFloat(rowData[10])||1, M=getPortalGSTRate(rowData);
        const orderId = String(rowData[0]||"").trim();
        const asin = String(rowData[7]||"").trim(), sku = String(rowData[8]||"").trim();
        const vKey = norm_key(orderId) + norm_key(asin) + norm_key(sku);

        // Basic Calcs
        if (colIndex === 12) return (M * 100).toFixed(0) + "%";
        if (colIndex === 19) return (L * M + L).toFixed(2);
        if (colIndex === 21) return (orderId + asin + sku).toUpperCase();
        if (colIndex === 22) return (L / K).toFixed(2);

        const sM = saleMap.get(vKey), vM = vendorMap.get(vKey), pM = purchaseMap.get(vKey);
        
        // --- DEBUG FOR ROW 236 ---
        if (originalIndex === 236 && type === 'portal') {
            console.log(`[DEBUG 236] Key: "${vKey}" | Found in: Pur:${purchaseMap.has(vKey)}, Sale:${saleMap.has(vKey)}, Ven:${vendorMap.has(vKey)}`);
            if (purchaseMap.size > 0 && !purchaseMap.has(vKey)) {
                console.log(`[DEBUG 236] Sample Map Key: "${Array.from(purchaseMap.keys())[0]}"`);
            }
        }
        
        // Diagnostic for Purchase Match (AB) (Index 27)
        if (colIndex === 27) {
            const hasMatch = purchaseMap.has(vKey);
            if (!hasMatch && purchaseMap.size > 0 && Math.random() < 0.05) { // Log occasionally to prevent spam
                console.log(`[DIAGNOSTIC - PORTAL] No Match for: "${vKey}"`);
                console.log(`[DIAGNOSTIC - PORTAL] Sample Purchase Key: "${Array.from(purchaseMap.keys())[0]}"`);
            }
        }

        // VLOOKUPs from SALE (Indices based on performSaleProcessing row structure)
        if (colIndex === 23) return sM ? sM[17] : "#N/A"; // SALE TCS
        if (colIndex === 24) {
            const diff = (parseFloat(L/K) - parseFloat(sM?.[6]||0));
            return (Math.abs(diff) < 0.001 ? 0 : diff).toFixed(2); // DIFF W-X
        }
        if (colIndex === 25) return vM ? vM[20] : "#N/A"; // VENDOR COST (Z)
        if (colIndex === 26) {
            const diff = (parseFloat(L/K) - parseFloat(vM?.[20]||0));
            return (Math.abs(diff) < 0.001 ? 0 : diff).toFixed(2); // DIFF W-Z
        }
        if (colIndex === 27) return pM ? pM[15] : "#N/A"; // PURCHASE MATCH (AB) (Returns Column P of Purchase)
        if (colIndex === 28) {
             const res = String((orderId+asin+sku).toLowerCase() === (pM?.[15]||"").toLowerCase()).toUpperCase();
             return `<span class="badge ${res==='TRUE'?'badge-success':'badge-danger'}">${res}</span>`;
        }
        if (colIndex === 29) return sM ? sM[18] : "#N/A"; // SALE TAX %
        if (colIndex === 30) { 
             const saleTax = sM ? sM[18] : "";
             const res = (saleTax === (M * 100).toFixed(0) + "%") ? "TRUE" : "FALSE";
             return `<span class="badge ${res==='TRUE'?'badge-success':'badge-danger'}">${res}</span>`;
        }
        if (colIndex === 31) return vM ? vM[21] : "#N/A"; // VC TAX %
        if (colIndex === 32) { 
             const vcTax = vM ? vM[21] : "";
             const res = (vcTax === (M * 100).toFixed(0) + "%") ? "TRUE" : "FALSE";
             return `<span class="badge ${res==='TRUE'?'badge-success':'badge-danger'}">${res}</span>`;
        }
        if (colIndex === 33) return (M / 2 * L).toFixed(2); // CALC GST/2
        if (colIndex === 34) return sM ? sM[19] : "#N/A"; // SALE CGST
        
        const cgst_calc = parseFloat((M / 2 * L).toFixed(2));
        const cgst_sale = sM ? parseFloat(sM[19]) : 0;
        const cgst_vc = vM ? parseFloat(vM[24]) : 0;
        
        if (colIndex === 35) return (cgst_calc - cgst_sale).toFixed(2); // DIFF-CGST
        if (colIndex === 36) return vM ? vM[24] : "#N/A"; // VC CGST
        if (colIndex === 37) return (cgst_calc - cgst_vc).toFixed(2); // DIFF-VC-CGST
        if (colIndex === 38) return cgst_calc.toFixed(2); // CALC SGST
        if (colIndex === 39) return sM ? sM[20] : "#N/A"; // SALE SGST
        if (colIndex === 40) return (cgst_calc - (sM ? parseFloat(sM[20]) : 0)).toFixed(2); // DIFF-SGST
        if (colIndex === 41) return vM ? vM[25] : "#N/A"; // VC SGST
        if (colIndex === 42) return (cgst_calc - (vM ? parseFloat(vM[25]) : 0)).toFixed(2); // DIFF-VC-SGST
        if (colIndex === 43) return orderId + (rowData[20]||"") + asin; // A&U&H
        
        // Extended Audit Lookups (AS-BD)
        const p_price = pM ? parseFloat(pM[16]) : 0;
        const s_price = sM ? parseFloat(sM[17]) : 0;
        const u_cost = parseFloat(renderCustomCell(null, 22, rowData, 'portal', 0));
        
        if (colIndex === 44) return u_cost.toFixed(2); // AS (W)
        if (colIndex === 45) return sM ? sM[17] : "#N/A"; // AT (SALE PRICE) matches VLOOKUP(V2, Q:R, 2)
        if (colIndex === 46) return pM ? pM[16] : "#N/A"; // AU (PUR PRICE)
        if (colIndex === 47) return (u_cost - p_price).toFixed(2); // AV (AS-AU)
        if (colIndex === 48 || colIndex === 49) return pM ? pM[17] : "#N/A"; // AW/AX (PUR GST/2)
        if (colIndex === 50) return sM ? sM[17] : "#N/A"; // AY (SALE QTY) updated to match VLOOKUP(V2, Q:R, 2)
        if (colIndex === 51) return sM ? sM[23] : "#N/A"; // AZ (SALE TOTAL) matches VLOOKUP(V2, Q:X, 8)
        if (colIndex === 52) return vM ? vM[22] : "#N/A"; // BA (VC QTY)
        if (colIndex === 53) return vM ? vM[23] : "#N/A"; // BB (VC TOTAL)
        if (colIndex === 54) return (s_price - p_price).toFixed(2); // BC (AT-AU)
        if (colIndex === 55) return pM ? pM[22] : "#N/A"; // BD (PUR TOTAL)

        if (colIndex === 56) {
            if (originalIndex !== 2 && originalIndex !== 3 && originalIndex !== 4) return "";
            
            // Optimization: Use pre-calculated global flags instead of looping through all rows
            let hasIssue = (originalIndex === 4) ? globalAuditHasIssueBC : globalAuditHasIssueAV;
            
            if (originalIndex === 2 || originalIndex === 4) {
                const res = hasIssue ? "FALSE" : "TRUE";
                return `<span class="badge ${res==='TRUE'?'badge-success':'badge-danger'}" style="padding: 10px 20px; font-weight: bold;">${res}</span>`;
            } else {
                const res = hasIssue ? "FALSE ❌ " : "TRUE ✅ ";
                return `<span style="font-weight: bold; color: ${hasIssue?'#ef4444':'#10b981'}; font-size: 1.1em;">${res}</span>`;
            }
        }
        
        // --- NEW SALE/PURCHASE METADATA SYNC (BF-BU) ---
        if (colIndex >= 57 && colIndex <= 72) {
            if (originalIndex !== 1) return "";
            if (colIndex === 57 || colIndex === 65) return globalSaleMetadata ? globalSaleMetadata.invId : ""; // BF, BN (Sale Order ID)
            if (colIndex === 58) return globalSaleMetadata ? globalSaleMetadata.invNo : "";                   // BG (Sale Inv No)
            if (colIndex === 59 || colIndex === 60 || colIndex === 67) return globalSaleMetadata ? globalSaleMetadata.date : ""; // BH, BI, BP (Sale Date)
            if (colIndex === 61) return globalSaleMetadata ? globalSaleMetadata.qty : "";                    // BJ (Sale Qty)
            if (colIndex === 62) return globalSaleMetadata ? "₹ " + parseFloat(globalSaleMetadata.grand||0).toLocaleString(undefined, {minimumFractionDigits: 2}) : ""; // BK (Sale Grand)
            
            if (colIndex === 64) return "⭐"; // BM
            if (colIndex === 71) return new Date().toLocaleString() + " (" + globalNickname + ")"; // BT (Timestamp)
            if (colIndex === 72) { // BU (Dispute Status)
                if (!globalSaleMetadata) return "WAITING...";
                const res = globalSaleMetadata.countReason > 0 ? "DISPUTE" : "ALL CLEAR";
                const color = res === "DISPUTE" ? "#ef4444" : "#10b981";
                return `<span style="font-weight: 800; color: ${color};">${res}</span>`;
            }

            if (!globalPurchaseMetadata) return "";
            if (colIndex === 66) return globalPurchaseMetadata.invNo;                   // BO (Pur Inv No)
            if (colIndex === 68) return globalPurchaseMetadata.qty;                     // BQ (Pur Qty)
            if (colIndex === 69) return "₹ " + parseFloat(globalPurchaseMetadata.grand||0).toLocaleString(undefined, {minimumFractionDigits: 2}); // BR (Pur Grand)
        }
    } else if (type === 'sale') {
        if (colIndex === 19 || colIndex === 20) { const I=parseFloat(String(rowData[8]||"").replace("%",""))||0, H=parseFloat(rowData[7])||0; return ((I/200)*H).toFixed(2); }
        if (colIndex === 26) {
            if (originalIndex !== 1) return ""; // Only show result in AA2 (the first data row)
            const h = (globalSaleMetadata && globalSaleMetadata.reasonHeader) ? globalSaleMetadata.reasonHeader : "";
            const cnt = (globalSaleMetadata && globalSaleMetadata.countReason) ? globalSaleMetadata.countReason : 0;
            let result = "ERROR";
            if (h === "Reason ( System Cost)") {
                result = (cnt > 0) ? "ERROR" : "OK";
            } else {
                result = (cnt === 0) ? "OK" : "ERROR";
            }
            const color = result === "OK" ? "#10b981" : "#ef4444";
            return `<span style="font-weight: 800; color: ${color};">${result}</span>`;
        }
    }
    return val;
}

// --- DATA PROCESSING ---
async function processPortal() { 
    const f=document.getElementById('portalFile'); if(!f.files.length) return window.showCustomAlert("Please select a Portal file first!", "Selection Required"); 
    console.log(`[DEBUG] Processing PORTAL file: ${f.files[0].name}`);
    const s = document.getElementById('portalFileStatus'); if(s) { s.textContent = "⏳ Processing..."; s.className = "fm-status"; }
    const _startTime = Date.now();
    const _fileName = f.files[0].name;
    handleFileRead(f.files[0], 'portal', async (json)=>{ 
        let _inserted = 0, _errorCount = 0, _status = 'Success', _errorMsg = '';
        try {
            console.log(`[DEBUG] Portal file read success. Rows: ${json.length}`);
            globalPortalData = json.map(r => { let row = [...r]; while(row.length < 74) row.push(""); return row; });
            if (globalPortalData.length > 0) {
                globalPortalData[0] = [...PORTAL_HEADERS, "BV"];
                const r1 = json[1] || [];
                globalPortalMetadata = { seller: r1[15] || "Multiple Sellers", gstin: r1[6] || "-", date: r1[5] || "-", status: r1[16] || "Processed" };
            }
            // Add nickname to BV2 cell (row 1, column 73)
            if (globalPortalData.length > 1 && globalPortalData[1].length > 73) {
                globalPortalData[1][73] = globalNickname;
            }
            await saveToDB("raw_portal", globalPortalData); 
            console.log(`[DEBUG] saved Portal to DB. Recalculating aggregates...`);
            recalculatePortalAggregates(); 
            console.log(`[DEBUG] Switching to "portal" tab...`);
            switchTab('portal');
            if(s) { s.textContent = "✅ Done"; s.className = "fm-status status-success"; }
            _inserted = Math.max(0, globalPortalData.length - 1);
        } catch(err) {
            _status = 'Failed'; _errorMsg = err.message || String(err); _errorCount = 1;
            if(s) { s.textContent = "❌ Error"; s.className = "fm-status status-error"; }
            window.showCustomError(err, "Processing Error");
        }
        if (window.logFileUpload) await window.logFileUpload({ platform: 'Amazon', accountName: 'Amazon Portal', fileName: _fileName, actionName: 'Portal Process', inserted: _inserted, updated: 0, errorCount: _errorCount, status: _status, error: _errorMsg, startTime: _startTime, endTime: Date.now() });
    }); 
}

async function processPurchase() { 
    const fS = document.getElementById('purchaseFile'); 
    const fD = document.getElementById('purchaseDetailFile');
    if(!fS.files.length) return window.showCustomAlert("Please select Purchase Summary file!", "Selection Required"); 
    
    console.log(`[DEBUG] Processing PURCHASE files... Summary: ${fS.files[0].name}`);
    const s = document.getElementById('purchaseFileStatus'); 
    const sdStatus = document.getElementById('purchaseDetailFileStatus');
    const _startTime = Date.now();
    const _fileNames = [fS.files[0].name];
    if(fD && fD.files.length > 0) _fileNames.push(fD.files[0].name);
    
    if(s) { s.textContent = "⏳ Processing..."; s.className = "fm-status"; }
    let _inserted = 0, _errorCount = 0, _status = 'Success', _errorMsg = '';
    
    try {
        const jsonS = await readExcelAsJson(fS.files[0]);
        let jsonD = [];
        if (fD && fD.files.length > 0) {
            jsonD = await readExcelAsJson(fD.files[0]);
            if (sdStatus) {
                sdStatus.textContent = "✅ Details Loaded";
                sdStatus.style.display = "inline";
                sdStatus.className = "fm-status status-success";
            }
        }

        await saveToDB("raw_purchase", jsonS);
        if (jsonD.length > 0) await saveToDB("raw_purchase_details", jsonD);

        const has12 = performPurchaseProcessing(jsonS, jsonD); 
        console.log(`[DEBUG] Switching to "purchase" tab...`);
        switchTab('purchase');

        _inserted = Math.max(0, (globalPurchaseData ? globalPurchaseData.length - 1 : 0));

        // --- Price Dispute Popups ---
        const maxD = globalPurchaseMetadata ? (globalPurchaseMetadata.maxDisputeFound || 0) : 0;
        if (maxD > 1) {
            window.showCustomDanger(`Major Price Dispute! The difference is ₹${maxD} (More than ₹1). Please check the invoice thoroughly before going ahead.`, "PRICE WARNING");
        } else if (globalPurchaseMetadata && globalPurchaseMetadata.hasDisputeColumn) {
            window.showCustomSuccess(`Price dispute value is ₹${maxD}. This is within the normal range (0 to 1). Please review carefully and age bade.`, "PRICE NORMAL");
        }

        if (s) { 
            if (has12) {
                s.textContent = "❌ 12% GST FOUND"; 
                s.className = "fm-status status-error"; 
            } else {
                s.textContent = "✅ Done"; 
                s.className = "fm-status status-success"; 
            }
        }
    } catch(e) {
        _status = 'Failed'; _errorMsg = e.message || String(e); _errorCount = 1;
        if(s) { s.textContent = "❌ Error"; s.className = "fm-status status-error"; }
        window.showCustomError(e, "Processing Error");
    }
    if (window.logFileUpload) {
        const _endTime = Date.now();
        const _baseLog = { platform: 'Amazon', accountName: 'Amazon Purchase', actionName: 'Purchase Process', inserted: _inserted, updated: 0, errorCount: _errorCount, status: _status, error: _errorMsg, startTime: _startTime, endTime: _endTime };
        if (fS.files[0]) await window.logFileUpload({ ..._baseLog, fileName: fS.files[0].name });
        if (fD && fD.files.length > 0) await window.logFileUpload({ ..._baseLog, fileName: fD.files[0].name });
    }
}
function performPurchaseProcessing(j, detailsJson = []) {
    if(!j||j.length<9) return false;
    let has12 = false;
    const ex=(s)=>s?String(s).split(":")[1]?.trim()||s:"";
    const m={ 
        seller:ex(j[1]?.[0]), 
        gstin:ex(j[3]?.[0]), 
        date:ex(j[4]?.[0]), 
        invNo:ex(j[5]?.[0]), 
        sellerCode:ex(j[7]?.[0]), 
        qty:0, 
        net:0, 
        cgst:0, 
        sgst:0, 
        grand:0, 
        tds:0, 
        withTax:0,
        maxDisputeFound: 0,
        hasDisputeColumn: false
    };

    // Build Details Mapping (Flexible matching)
    // We will use two maps: Full Key (PO+ASIN+SKU) and Fallback Key (ASIN+SKU)
    const disputeFullMap = new Map();
    const disputeFallbackMap = new Map();

    if (detailsJson && detailsJson.length > 0) {
        console.log(`[DEBUG] Building Dispute Map from Details. Total rows: ${detailsJson.length}`);
        for (let i = 0; i < detailsJson.length; i++) {
            const dRow = detailsJson[i];
            if (!dRow || dRow.length < 8) continue;
            
            const dp = String(dRow[20] || "").trim();
            if (dp === "" || dp.toLowerCase() === "reason") continue;

            const dPO = norm_key(dRow[5]);
            const dAsin = norm_key(dRow[6]);
            const dSku = norm_key(dRow[7]);

            const fullKey = dPO + dAsin + dSku;
            const fallbackKey = dAsin + dSku;

            if (fullKey) disputeFullMap.set(fullKey, dp);
            if (fallbackKey) disputeFallbackMap.set(fallbackKey, dp);
            
            if (i < 15) console.log(`[DEBUG] Detail Entry - Full: ${fullKey}, Fallback: ${fallbackKey}, Val: ${dp}`);
        }
    }

    const hRaw = j[8] || [], fIdx = (ns) => hRaw.findIndex(h => ns.some(n => String(h).toLowerCase().includes(n.toLowerCase())));
    const iQ=fIdx(["qty"]), iN=fIdx(["net","taxable"]), iC=fIdx(["cgst"]), iS=fIdx(["sgst"]), iG=fIdx(["grand","total"]), iT=fIdx(["tax %"]);
    const iAsin=fIdx(["asin", "item-asin"]), iSku=fIdx(["sku", "item-sku"]), iOid=fIdx(["order id", "shipment id", "po number"]);

    let rows=[hRaw.filter((_, idx)=>idx!==0 && idx!==6 && idx!==10).concat(["B&C&D", "G", "J/2*I", "J/2*I", "F", "J", "Q*T", "V*U+V", "-", "A&X&B"])];
    purchaseMap.clear();

    let maxD = 0;

    for(let i=9; i<j.length; i++){
        const row=j[i]; if(!row || row.length===0){ continue; }
        if(String(row[0]||"").toLowerCase().includes("total")) { m.qty=row[iQ]; m.net=row[iN]; m.cgst=row[iC]; m.sgst=row[iS]; m.grand=row[iG]; continue; }
        
        if (row[1] && row[2]) {
            const sPO = norm_key((iOid !== -1) ? row[iOid] : row[0]);
            const sAsin = norm_key((iAsin !== -1) ? row[iAsin] : row[1]);
            const sSku = norm_key((iSku !== -1) ? row[iSku] : row[2]);
            
            const summaryFullKey = sPO + sAsin + sSku;
            const summaryFallbackKey = sAsin + sSku;
            
            let disputeValue = disputeFullMap.get(summaryFullKey) || disputeFallbackMap.get(summaryFallbackKey) || "";
            
            if (disputeValue !== "") {
                m.hasDisputeColumn = true;
                const numericPart = disputeValue.split('-').pop()?.trim() || "0";
                const val = parseFloat(numericPart) || 0;
                if (val > maxD) maxD = val;
            } else if (i < 15 && detailsJson.length > 0) {
                console.warn(`[DEBUG] Match Failed for Row ${i}. Summary Fallback Key searched: "${summaryFallbackKey}"`);
            }

            const valB = String(row[1] || "").trim();
            const valC = String(row[2] || "").trim();
            const valD = String(row[3] || "").trim();
            const valH = String(row[7] || "").trim();
            const valI = String(row[8] || "").trim();
            const numNet = parseFloat(String(row[iN] || "0").replace(/[^0-9.]/g, "")) || 0;
            const numTax = parseFloat(String(row[iT] || "0").replace(/[^0-9.]/g, "")) || 0;
            const resR = ((numTax / 200) * numNet).toFixed(2);
            
            const filtered = row.filter((_, idx) => idx !== 0 && idx !== 6 && idx !== 10);
            
            // Map Dispute Value to Column N (Filtered index 10)
            filtered[10] = disputeValue || "";

            // Append % to Column J (In filtered array, index 9 corresponds to displayed Column J)
            if (filtered[9] !== undefined) {
                const tv = String(filtered[9]).replace("%", "");
                if (tv && !isNaN(tv)) {
                    filtered[9] = tv + "%";
                    if (tv === "12") has12 = true;
                }
            }

            const valG = row[8] || "";
            const valQty = row[7] || "";
            const valTaxStr = String(filtered[9] || "");
            const numQ = parseFloat(String(valG || "0").replace(/[^0-9.]/g, "")) || 0;
            const numT = parseFloat(String(valQty || "0").replace(/[^0-9.]/g, "")) || 0;
            const numU = parseFloat(valTaxStr.replace("%", "")) || 0;
            
            const resV = (numQ * numT).toFixed(2);
            const resW = (parseFloat(resV) * (1 + numU / 100)).toFixed(2);
            const resY = String(filtered[0] || "") + "-" + String(filtered[1] || "");

            const bh = valB + valC + valD;
            const extended = filtered.concat([bh, valG, resR, resR, valQty, valTaxStr, resV, resW, "-", resY]);
            
            const pk = norm_key(iOid !== -1 ? row[iOid] : (row[1] || "")) + 
                        norm_key(iAsin !== -1 ? row[iAsin] : (row[2] || "")) + 
                        norm_key(iSku !== -1 ? row[iSku] : (row[3] || ""));
            
            purchaseMap.set(pk, extended);
            rows.push(extended);
        }
    }
    m.maxDisputeFound = maxD;
    m.tds=(m.net*0.001).toFixed(2); m.withTax=Math.round(m.grand-m.tds); 
    globalPurchaseData=rows; 
    globalPurchaseMetadata=m;
    return has12;
}

async function processSale() {
    const fD=document.getElementById('saleDetailFile'), fS=document.getElementById('saleSummaryFile'); if(!fD.files.length||!fS.files.length) return window.showCustomAlert("Please select both Sale Summary and Sale Detail files!", "Selection Required");
    console.log(`[DEBUG] Processing SALE files... Detail: ${fD.files[0].name}, Summary: ${fS.files[0].name}`);
    const s = document.getElementById('saleFileStatus'); if(s) { s.textContent = "⏳ Processing..."; s.className = "fm-status"; }
    const _startTime = Date.now();
    const _fileNames = `Detail: ${fD.files[0].name} | Summary: ${fS.files[0].name}`;
    let _inserted = 0, _errorCount = 0, _status = 'Success', _errorMsg = '';
    try { 
        const sJ=await readExcelAsJson(fS.files[0]), iJ=await readExcelAsJson(fD.files[0]); 
        console.log(`[DEBUG] Sale files read. Summary Rows: ${sJ.length}, Detail Rows: ${iJ.length}`);
        await saveToDB("raw_sale_summary", sJ); await saveToDB("raw_sale_details", iJ); 
        const has12 = performSaleProcessing(sJ, iJ); 
        console.log(`[DEBUG] Switching to "sale" tab...`);
        switchTab('sale');

        _inserted = Math.max(0, (globalSaleData ? globalSaleData.length - 1 : 0));

        // --- Price Dispute Popups ---
        const maxD = globalSaleMetadata ? (globalSaleMetadata.maxDisputeFound || 0) : 0;
        if (maxD > 1) {
            window.showCustomDanger(`Major Price Dispute! The difference is ₹${maxD} (More than ₹1). Please check the invoice thoroughly before going ahead.`, "PRICE WARNING");
        } else if (globalSaleMetadata && globalSaleMetadata.hasDisputeColumn) {
            window.showCustomSuccess(`Price dispute value is ₹${maxD}. This is within the normal range (0 to 1). Please review carefully and age bade.`, "PRICE NORMAL");
        }

        if (s) { 
            if (has12) {
                s.textContent = "❌ 12% GST FOUND"; 
                s.className = "fm-status status-error"; 
            } else {
                s.textContent = "✅ Done"; 
                s.className = "fm-status status-success"; 
            }
        }
    } catch(e){ 
        _status = 'Failed'; _errorMsg = e.message || String(e); _errorCount = 1;
        if(s) { s.textContent = "❌ Error"; s.className = "fm-status status-error"; }
        window.showCustomError(e, "Processing Error"); 
    }
    if (window.logFileUpload) {
        const _endTime = Date.now();
        const _baseLog = { platform: 'Amazon', accountName: 'Amazon Sale', actionName: 'Sale Process', inserted: _inserted, updated: 0, errorCount: _errorCount, status: _status, error: _errorMsg, startTime: _startTime, endTime: _endTime };
        if (fD.files[0]) await window.logFileUpload({ ..._baseLog, fileName: fD.files[0].name });
        if (fS.files[0]) await window.logFileUpload({ ..._baseLog, fileName: fS.files[0].name });
    }
}
function performSaleProcessing(sJ, iJ) {
    if(!sJ || !iJ) return;
    const parseNum = (v) => parseFloat(String(v || "0").replace(/[^0-9.]/g, "")) || 0;
    
    // Find the actual summary row (usually has the invoice number and totals)
    let sR = sJ[1]; 
    for(let r of sJ) {
        if (r && r[12] && !isNaN(parseNum(r[12])) && parseNum(r[12]) > 0) {
            sR = r;
            break;
        }
    }

    globalSaleMetadata = { 
        seller: sR[0] || "-", 
        gstin: sR[9] || "-", 
        date: sR[8] || "-", 
        invNo: sR[2] || "-", 
        invId: (sJ[2] && sJ[2][1]) ? sJ[2][1] : "-", 
        qty: parseNum(sR[13]), 
        net: parseNum(sR[10]), 
        grand: parseNum(sR[12]),
        reasonHeader: (iJ[1] && iJ[1][19]) ? String(iJ[1][19]).trim() : "",
        countReason: 0,
        maxDisputeFound: 0,
        hasDisputeColumn: false
    };
    
    let rows=[["Order ID","Item ASIN","SKU","Name","HSN","Qty","Cost","Gross","Tax%","IGST","CGST","SGST","CESS%","CESS ₹","Invoice ₹","Reason","A&B&C","H","I","I/2*H","I/2*H","F","R*V","W*S+W","-","A&Y&B","Audit Status (AA)"]];
    saleMap.clear();
    let rCount = 0;
    let maxD = 0;
    let hasDispute = false;

    for(let i=2; i<iJ.length; i++){
        const row=iJ[i]; if(!row || !row[5]) continue;
        const reasonText = String(row[19] || "").trim();
        if (reasonText !== "") rCount++;
        
        if (reasonText.toLowerCase().includes("price dispute -")) {
            hasDispute = true;
            const numericPart = reasonText.split('-').pop()?.trim() || "0";
            const val = parseFloat(numericPart) || 0;
            if (val > maxD) maxD = val;
        }

        const q=parseNum(row[10]), g=parseNum(row[11]), t=parseNum(row[13])+parseNum(row[14]);
        if (t === 12) has12 = true;
        const keyABC = (row[5]||"")+(row[6]||"")+(row[7]||""), valR=g.toFixed(2), valS=t+"%", valT=((t/200)*g).toFixed(2);
        const valX=(parseFloat(g*q)*(1+t/100)).toFixed(2), valZ=(row[5]||"")+"-"+(row[6]||"");
        const mapped = [row[5]||"",row[6]||"",row[7]||"",row[8]||"",row[4]||"",q,(g/q).toFixed(2),g.toFixed(2),t+"%",row[9]||0,row[16]||0,row[17]||0,"0%",0,row[18]||0,row[19]||"",keyABC,valR,valS,valT,valT,q,(g*q).toFixed(2),valX,"-",valZ, ""];
        const vKey = norm_key(row[5]) + norm_key(row[6]) + norm_key(row[7]); // Use norm_key for robust matching
        saleMap.set(vKey, mapped);
        rows.push(mapped);
    }
    globalSaleMetadata.countReason = rCount;
    globalSaleMetadata.maxDisputeFound = maxD;
    globalSaleMetadata.hasDisputeColumn = hasDispute;
    globalSaleData=rows;
}
async function processVendor() { 
    const f=document.getElementById('vendorFile'); if(!f.files.length) return window.showCustomAlert("Please select a Vendor Central file first!", "Selection Required"); 
    console.log(`[DEBUG] Processing VENDOR file: ${f.files[0].name}`);
    const s = document.getElementById('vendorFileStatus'); if(s) { s.textContent = "⏳ Processing..."; s.className = "fm-status"; }
    const _startTime = Date.now();
    const _fileName = f.files[0].name;
    handleFileRead(f.files[0], 'vendor', async (json)=>{ 
        let _inserted = 0, _errorCount = 0, _status = 'Success', _errorMsg = '';
        try {
            console.log(`[DEBUG] Vendor file read success. Rows: ${json.length}`);
            await saveToDB("raw_vendor", json); 
            performVendorProcessing(json); 
            console.log(`[DEBUG] Switching to "vendor" tab...`);
            switchTab('vendor');
            if(s) { s.textContent = "✅ Done"; s.className = "fm-status status-success"; }
            _inserted = Math.max(0, (globalVendorData ? globalVendorData.length - 1 : 0));
        } catch(err) {
            _status = 'Failed'; _errorMsg = err.message || String(err); _errorCount = 1;
            if(s) { s.textContent = "❌ Error"; s.className = "fm-status status-error"; }
            window.showCustomError(err, "Processing Error");
        }
        if (window.logFileUpload) await window.logFileUpload({ platform: 'Amazon', accountName: 'Amazon Vendor', fileName: _fileName, actionName: 'Vendor Process', inserted: _inserted, updated: 0, errorCount: _errorCount, status: _status, error: _errorMsg, startTime: _startTime, endTime: Date.now() });
    }); 
}
function performVendorProcessing(j) {
    if(!j||j.length<2) return;
    const r1 = j[2] || []; // First data row for metadata
    
    let hs = [...(j[1] || [])];
    while(hs.length < 29) hs.push("");
    hs = hs.slice(0, 29).map((h, i) => 
        i === 18 ? "A&AC&H" : 
        i === 19 ? "A&H&I" : 
        i === 20 ? "L" : 
        i === 21 ? "M" : 
        i === 22 ? "K*L" : 
        i === 23 ? "W*M+W" : 
        (i === 24 || i === 25) ? "M/2*L*K" : 
        i === 28 ? "-" : h
    );
    
    let tQty=0, tNet=0, tExact=0, tCgst=0, tSgst=0;
    vendorMap.clear();
    globalVendorData = [hs, ...j.slice(2).map(r => {
        let s = [...r];
        while(s.length < 29) s.push("");
        s = s.slice(0, 29);
        let k = parseFloat(s[10]) || 0, l = parseFloat(s[11]) || 0, m = parseFloat(String(s[12] || "").replace(/[^0-9.]/g, "")) || 0;
        
        s[18] = s[0] + "-" + s[7]; 
        s[19] = s[0] + s[7] + s[8]; 
        s[20] = s[11]; 
        s[21] = s[12]; 
        s[22] = (k * l).toFixed(2); 
        s[23] = (k * l * (1 + m / 100)).toFixed(2); 
        s[24] = s[25] = ((m / 200) * k * l).toFixed(2); 
        s[28] = "-"; 
        
        // Summing calculated values
        tQty += k;
        tNet += (k * l);
        tExact += parseFloat(s[23]) || 0;
        tCgst += parseFloat(s[24]) || 0;
        tSgst += parseFloat(s[25]) || 0;

        const vKey = norm_key(s[0]) + norm_key(s[7]) + norm_key(s[8]);
        vendorMap.set(vKey, s); 
        return s;
    })];

    globalVendorMetadata = { 
        seller: "Amazon Retail", 
        gstin: r1[6] || "-", // Column G
        date: r1[5] || "-",  // Column F
        invNo: r1[2] || "-", // Column C
        qty: tQty,
        net: tNet,
        exact: tExact,
        cgst: tCgst,
        sgst: tSgst,
        grand: Math.round(tExact),
        round: (Math.round(tExact) - tExact).toFixed(2)
    };
}

// --- SYNC ENGINE ---
async function syncSaleToPortal() {
    if (!globalPortalData || globalPortalData.length <= 1) return window.showCustomAlert("Please upload and process Portal data first!", "Data Missing");
    if (!globalSaleData || globalSaleData.length <= 1) return window.showCustomAlert("Please upload and process Sale data first!", "Data Missing");
    
    console.log("--- GST SYNC START ---");
    let matchCount = 0;
    const portalDataRaw = globalPortalData; 

    // 1. Ensure Sale Map is indexed by the Match Key (Column Q / Index 16)
    // The performSaleProcessing already does this, but we'll use the rendered text for safety.
    
    // 2. Iterate Portal rows (skip header)
    for (let i = 1; i < portalDataRaw.length; i++) {
        const row = portalDataRaw[i];
        
        // Get robust key using norm_key logic (symbol & case agnostic)
        const pk = norm_key(row[0]) + norm_key(row[7]) + norm_key(row[8]);
        
        if (!pk || pk.length < 5) continue;

        // Find match in saleMap (which uses consistent keys)
        const sM = saleMap.get(pk);
        if (sM) {
            // Value Sync based on user-provided VLOOKUP logic
            row[12] = sM[8];         // Col M  = Sale Col I (Index 8)
            row[23] = sM[17];        // Col X  = Sale Index 17 (Gross)
            row[29] = sM[18];        // Col AD = Sale Index 18 (Tax %)
            row[34] = sM[19];        // Col AI = Sale Index 19 (CGST)
            row[39] = sM[20];        // Col AN = Sale Index 20 (SGST)
            row[45] = sM[17];        // Col AT = Sale Index 17 (Price)
            row[50] = sM[17];        // Col AY = Sale Index 17 (Qty - as per user formula)
            row[51] = sM[23];        // Col AZ = Sale Index 23 (Total with Tax)
            
            matchCount++;
        }
    }

    console.log("Total GST Matches Found:", matchCount);
    
    if (matchCount > 0) {
        await saveToDB("raw_portal", globalPortalData); 
        refreshView();
        showCustomSyncModal(matchCount);
    } else {
        window.showCustomAlert("No matches found between Portal Column V and Sale Column Q.", "No Matches");
    }
}

function showCustomSyncModal(count) {
    const existing = document.getElementById('gstSyncModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gstSyncModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center; z-index: 9999;
        animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
        <div style="
            background: rgba(255, 255, 255, 0.85); 
            backdrop-filter: blur(20px);
            padding: 30px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.3);
            text-align: center; width: 350px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            transform: scale(0.9); animation: modalOpen 0.3s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
            <div style="font-size: 50px; margin-bottom: 15px;">✅</div>
            <h2 style="margin: 0; color: #1e293b; font-size: 20px; font-weight: 700;">Sync Successful!</h2>
            <p style="color: #64748b; margin: 15px 0 25px 0; font-size: 14px; line-height: 1.5;">
                Successfully matched and updated <br>
                <span style="color: #6366f1; font-weight: 800; font-size: 24px;">${count}</span> <br>
                records in Portal Tab.
            </p>
            <button id="gstSyncModalClose" style="
                background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
                color: white; border: none; padding: 12px 30px; border-radius: 12px;
                font-weight: 600; cursor: pointer; width: 100%;
                transition: all 0.2s; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
            " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                GREAT
            </button>
        </div>
        <style>
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes modalOpen { to { transform: scale(1); } }
        </style>
    `;

    document.body.appendChild(modal);

    // Use addEventListener instead of inline onclick for CSP compliance
    const closeBtn = document.getElementById('gstSyncModalClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });
    }
}

// --- HELPERS ---
function readExcelAsJson(f) { return new Promise((res, rej) => { const r=new FileReader(); r.onload=(e)=>res(XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(e.target.result),{type:'array'}).Sheets[XLSX.read(new Uint8Array(e.target.result),{type:'array'}).SheetNames[0]],{header:1})); r.onerror=rej; r.readAsArrayBuffer(f); }); }
function handleFileRead(f, t, cb) { const r=new FileReader(); r.onload=async (e)=>await cb(XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(e.target.result),{type:'array'}).Sheets[XLSX.read(new Uint8Array(e.target.result),{type:'array'}).SheetNames[0]],{header:1})); r.readAsArrayBuffer(f); }

function renderTable() {
    console.log(`[DEBUG] renderTable triggered | Sheet: "${currentSheet}" | Rows in FilteredData: ${globalFilteredData.length}`);
    recalculatePortalAggregates();
    const cont = document.getElementById('tableContainer'), info = document.getElementById('tableInfoBox');
    if (typeof window.mountGlobalActionButton === 'function') {
        window.mountGlobalActionButton('sendToGoogleSheetBtn', 'pushStatus', globalPortalData.length > 1);
    }
    if (!globalFilteredData || globalFilteredData.length <= 1) { 
        console.log(`[DEBUG] renderTable | NO DATA FOUND for display`);
        cont.innerHTML = "<div style='text-align:center; padding: 50px; color: #64748b;'><h3>No data available</h3><p>Click 'Upload Files &#x1F4C1;' above to start processing.</p></div>"; 
        if(info) info.textContent = "0 Rows"; return; 
    }
    if(info) info.textContent = (globalFilteredData.length-1) + " Rows";

    const pB=document.getElementById('purchaseInfoBanner'), sB=document.getElementById('saleInfoBanner'), pSumHeader=document.getElementById('portal-summary-header');
    const portB=document.getElementById('portalInfoBanner'), vB=document.getElementById('vendorInfoBanner');

    // Show/Hide Banners
    if(pSumHeader) pSumHeader.style.display = (currentSheet==='portal')?'flex':'none';
    if(portB) portB.style.display = 'none'; // Hidden as per request
    if(pB) pB.style.display = (currentSheet==='purchase' && globalPurchaseMetadata)?'block':'none';
    if(sB) sB.style.display = (currentSheet==='sale' && globalSaleMetadata)?'block':'none';
    if(vB) vB.style.display = (currentSheet==='vendor' && globalVendorMetadata)?'block':'none';

    if (currentSheet === 'portal' || currentSheet === 'vendor') {
        const roundedGrand = Math.round(portalSumGrand);
        
        document.getElementById('totalQtyBox').textContent = `Total Qty: ${portalSumQty}`;
        document.getElementById('totalNetBox').textContent = `Total Without Tax: ₹ ${portalSumNet.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('totalGrandBox').textContent = `Total With Tax: ₹ ${portalSumGrand.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('totalNetGrandBox').textContent = `Net Grand: ₹ ${roundedGrand.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('totalPortalCgstBox').textContent = `Total CGST: ₹ ${portalSumCgst.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('totalPortalSgstBox').textContent = `Total SGST: ₹ ${portalSumSgst.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('totalRoundOffBox').textContent = `Round Off: ₹ ${(roundedGrand - portalSumGrand).toFixed(2)}`;
    } else { if (pSumHeader) pSumHeader.style.display = 'none'; }
    
    if(currentSheet==='portal' && globalPortalMetadata) {
        document.getElementById('port-seller').textContent = globalPortalMetadata.seller;
        document.getElementById('port-gstin').textContent = globalPortalMetadata.gstin;
        document.getElementById('port-inv-date').textContent = globalPortalMetadata.date;
        document.getElementById('port-status').textContent = globalPortalMetadata.status;
    }
    if(currentSheet==='vendor' && globalVendorMetadata) {
        document.getElementById('v-seller').textContent = globalVendorMetadata.seller;
        document.getElementById('v-gstin').textContent = globalVendorMetadata.gstin;
        document.getElementById('v-inv-date').textContent = globalVendorMetadata.date;
        document.getElementById('v-inv-no').textContent = globalVendorMetadata.invNo;
        document.getElementById('v-total-qty').textContent = globalVendorMetadata.qty;
        document.getElementById('v-total-net').textContent = globalVendorMetadata.net.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('v-total-cgst').textContent = globalVendorMetadata.cgst.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('v-total-sgst').textContent = globalVendorMetadata.sgst.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('v-total-exact').textContent = globalVendorMetadata.exact.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('v-total-grand').textContent = globalVendorMetadata.grand.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('v-total-round').textContent = globalVendorMetadata.round;
    }

    if(pB && pB.style.display==='block' && globalPurchaseMetadata) {
        document.getElementById('p-seller').textContent = globalPurchaseMetadata.seller;
        document.getElementById('p-seller-code').textContent = globalPurchaseMetadata.sellerCode;
        document.getElementById('p-gstin').textContent = globalPurchaseMetadata.gstin;
        document.getElementById('p-date').textContent = globalPurchaseMetadata.date;
        document.getElementById('p-inv').textContent = globalPurchaseMetadata.invNo;
        document.getElementById('p-total-qty').textContent = globalPurchaseMetadata.qty;
        document.getElementById('p-total-net').textContent = parseFloat(globalPurchaseMetadata.net||0).toFixed(2);
        document.getElementById('p-total-cgst').textContent = parseFloat(globalPurchaseMetadata.cgst||0).toFixed(2);
        document.getElementById('p-total-sgst').textContent = parseFloat(globalPurchaseMetadata.sgst||0).toFixed(2);
        document.getElementById('p-total-grand').textContent = parseFloat(globalPurchaseMetadata.grand||0).toFixed(2);
        document.getElementById('p-total-tds').textContent = globalPurchaseMetadata.tds;
        document.getElementById('p-total-with-tax').textContent = globalPurchaseMetadata.withTax;
    }
    if(sB.style.display==='block' && globalSaleMetadata) {
        document.getElementById('s-seller').textContent = globalSaleMetadata.seller;
        document.getElementById('s-gstin').textContent = globalSaleMetadata.gstin;
        document.getElementById('s-date').textContent = globalSaleMetadata.date;
        document.getElementById('s-inv-id-banner').textContent = globalSaleMetadata.invId;
        document.getElementById('s-inv').textContent = globalSaleMetadata.invNo;
        document.getElementById('s-total-qty').textContent = globalSaleMetadata.qty;
        document.getElementById('s-total-net').textContent = parseFloat(globalSaleMetadata.net||0).toFixed(2);
        document.getElementById('s-total-grand').textContent = parseFloat(globalSaleMetadata.grand||0).toFixed(2);
        let sC=0, sS=0; for(let i=1;i<globalFilteredData.length;i++) { sC+=parseFloat(renderCustomCell(null,19,globalFilteredData[i],'sale',0))||0; sS+=parseFloat(renderCustomCell(null,20,globalFilteredData[i],'sale',0))||0; }
        document.getElementById('s-total-cgst').textContent = sC.toFixed(2); document.getElementById('s-total-sgst').textContent = sS.toFixed(2);
        let exactG = (parseFloat(globalSaleMetadata.net)+sC+sS);
        document.getElementById('s-total-exact').textContent = exactG.toFixed(2);
        document.getElementById('s-total-roundoff').textContent = (globalSaleMetadata.grand - exactG).toFixed(2);
    }

    const start = (currentPage-1)*rowsPerPage+1, end = Math.min(currentPage*rowsPerPage, globalFilteredData.length-1);
    const dataPage = [globalFilteredData[0], ...globalFilteredData.slice(start, end+1)];
    
    let h = '<table><thead><tr><th class="sticky-col" style="background:#475569; color:white;">#</th>';
    globalFilteredData[0].forEach((cell, idx) => {
        let bg = "#1e293b"; // Default dark
        if (currentSheet === 'portal') {
            if (idx >= 21 && idx <= 26) bg = "#059669"; // Greenish
            else if (idx >= 27 && idx <= 28) bg = "#0891b2"; // Teal
            else if (idx >= 29 && idx <= 32) bg = "#4f46e5"; // Indigo
            else if (idx >= 33 && idx <= 42) bg = "#7c3aed"; // Purple
            else if (idx >= 43 && idx <= 55) bg = "#d97706"; // Amber
            else if (idx === 56) bg = "#db2777"; // Pink
        } else if (currentSheet === 'purchase') {
             if (idx >= 18) bg = "#059669";
        } else if (currentSheet === 'sale') {
             if (idx >= 16) bg = "#7c3aed";
        }
        
        const colLetter = getColLetter(idx);
        const headerText = cell ? `${cell} (${colLetter})` : `(${colLetter})`;
        
        // Check if filter is active
        const isFiltered = globalFilters[currentSheet] && globalFilters[currentSheet][idx] && globalFilters[currentSheet][idx].length > 0;

        h += `
          <th style="background:${bg}; color:white; min-width:140px;">
            <div class="th-content">
              <span>${headerText}</span>
              <div class="filter-trigger ${isFiltered ? 'active' : ''}" data-col="${idx}">
                ${isFiltered ? '▼' : '▼'}
              </div>
            </div>
          </th>`;
    });
    h += '</tr></thead><tbody>';

    for(let i=1; i<dataPage.length; i++){
        h += `<tr><td class="sticky-col" style="font-weight:700; text-align:center;">${start+i-1}</td>`;
        for(let j=0; j<globalFilteredData[0].length; j++){
            let v = dataPage[i][j]||""; 
            if (formulaViewActive) {
                const f = getAmazonFormula(currentSheet, j, start+i-1);
                if (f !== null) v = f;
            } else {
                v = renderCustomCell(v,j,dataPage[i],currentSheet,start+i-1);
            }
            
            let cellBg = "";
            if (currentSheet === 'portal') {
                if (j >= 21 && j <= 26) cellBg = "background: rgba(16, 185, 129, 0.08);"; // Light Green
                else if (j >= 27 && j <= 28) cellBg = "background: rgba(6, 182, 212, 0.08);"; // Light Teal
                else if (j >= 29 && j <= 32) cellBg = "background: rgba(79, 70, 229, 0.08);"; // Light Indigo
                else if (j >= 33 && j <= 42) cellBg = "background: rgba(139, 92, 246, 0.08);"; // Light Purple
                else if (j >= 43 && j <= 55) cellBg = "background: rgba(245, 158, 11, 0.08);"; // Light Amber
                else if (j === 56) cellBg = "background: rgba(219, 39, 119, 0.08);"; // Light Pink
            } else if (currentSheet === 'purchase' && j >= 18) {
                cellBg = "background: rgba(16, 185, 129, 0.08);";
            } else if (currentSheet === 'sale' && j >= 16) {
                cellBg = "background: rgba(139, 92, 246, 0.08);";
            }
            
            h += `<td style="${cellBg}">${v}</td>`;
        }
        h += '</tr>';
    }
    h += '</tbody></table>';
    cont.innerHTML = h;
    renderPagination();
}

function renderPagination() {
    const totalRows = globalFilteredData.length - 1;
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    const container = document.getElementById('paginationControls');
    const blocksContainer = document.getElementById('pageBlocks');
    
    if (totalPages <= 1) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    
    let blocks = '';
    
    const addBlock = (p, label, active, disabled) => {
        const title = label || p;
        const cls = active ? 'page-block active' : (disabled ? 'pg-nav-btn disabled' : (label ? 'pg-nav-btn' : 'page-block'));
        const dataAttr = (!disabled && !active) ? `data-page="${p}"` : '';
        blocks += `<div class="${cls}" ${dataAttr}>${title}</div>`;
    };

    // Nav Arrows
    addBlock(1, "«", false, currentPage === 1);
    addBlock(currentPage - 1, "‹", false, currentPage === 1);

    // Smart Windowing
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    if (startPage > 1) {
        addBlock(1);
        if (startPage > 2) blocks += `<div class="page-ellipsis">...</div>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        addBlock(i, i, i === currentPage);
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) blocks += `<div class="page-ellipsis">...</div>`;
        addBlock(totalPages);
    }

    addBlock(currentPage + 1, "›", false, currentPage === totalPages);
    addBlock(totalPages, "»", false, currentPage === totalPages);

    blocksContainer.innerHTML = blocks;
}

// Fixed Shared Pagination Delegation
document.addEventListener('click', (e) => {
    const block = e.target.closest('.page-block[data-page], .pg-nav-btn[data-page]');
    if (block) {
        const p = parseInt(block.getAttribute('data-page'));
        if (p) {
            currentPage = p;
            renderTable();
        }
    }
});

async function pushDetailsToGoogleSheet() {
    if (!globalPortalData || globalPortalData.length <= 1) {
        window.showCustomAlert("No data available to push!", "No Data");
        return;
    }

    const SCRIPT_URL = window.PUSH_URL || "YOUR_MASTER_PUSH_URL_HERE";
    const btn = document.getElementById('sendToGoogleSheetBtn');
    
    // Columns BF (57) to BU (72) per PORTAL_HEADERS
    const startCol = 57;
    const endCol = 72;
    const exportData = [];
    const vendorEventId = `AMAZON_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sellerName = (
        globalPurchaseMetadata?.sellerCode ||
        globalPurchaseMetadata?.seller ||
        globalPortalMetadata?.seller ||
        globalSaleMetadata?.seller ||
        "Amazon Seller"
    );

    // Extract all rows (starting index 1)
    for (let i = 1; i < globalPortalData.length; i++) {
        const row = globalPortalData[i];
        if (!row) continue;
        
        // Only push rows that have some value in the start column (BF / 57)
        // Note: Even if empty, we check if renderCustomCell gives us something
        const testVal = renderCustomCell(row[startCol], startCol, row, 'portal', i);
        if (!testVal || String(testVal).trim() === "") continue;
        
        const subset = [];
        for (let j = startCol; j <= endCol; j++) {
            let val = renderCustomCell(row[j], j, row, 'portal', i);
            
            // Strip HTML tags (e.g., from Column BU Dispute Status badge)
            if (typeof val === 'string' && val.includes('<')) {
                val = val.replace(/<[^>]*>/g, '');
            }
            subset.push(val !== undefined ? val : "");
        }

        subset.push(sellerName);
        subset.push(globalNickname || "User");

        // Add to REPORT TAB logging
        const reportEntry = {
            timestamp: Date.now() + i,
            formattedTime: new Date().toLocaleString(),
            data: {
                "INVOICE ID": subset[0] || "",
                "INVOICE NO.": subset[1] || "",
                "INVOICE DATE": subset[2] || "",
                "IRN DATE": subset[3] || "",
                "QTY_SALE": subset[4] || "",
                "SALE AMOUNT": subset[5] || "",
                "ZOHO SALE": subset[6] || "",
                "⭐": subset[7] || "",
                "BILL ID": subset[8] || "",
                "BILL NO.": subset[9] || "",
                "BILL DATE": subset[10] || "",
                "QTY_PUR": subset[11] || "",
                "PURCHASE AMOUNT": subset[12] || "",
                "ZOHO PURCHASE": subset[13] || "",
                "DATA AND TIME": subset[14] || new Date().toLocaleString(),
                "REMARK": subset[15] || "",
                "SELLER NAME": sellerName
            }
        };
        await saveReportEntry(reportEntry);

        // Only push to Google Sheet queue if row has some data in these columns
        if (subset.some(cell => cell && String(cell).trim() !== "")) {
            const invNo = String(subset[1] || "").trim();
            exportData.push({ row: subset, vendorEventId: vendorEventId, invoiceNo: invNo });
        }
    }

    if (exportData.length === 0) {
        window.showCustomAlert("No audit data found in columns BF-BU.", "Audit Empty");
        return;
    }

    const originalHtml = btn.innerHTML;
    btn.textContent = "Adding to Queue... ⏳";
    btn.disabled = true;

    try {
        const invoiceList = exportData.map(item => String(item.row && item.row[1] || "").trim()).filter(Boolean);
        if (window.logPushHistory) {
            await window.logPushHistory("AMAZON", invoiceList, vendorEventId, sellerName, "Portal Invoice Submitted To Google Sheet");
        }

        const storageKey = 'pushQueue_AMAZON';
        const res = await chrome.storage.local.get([storageKey]);
        const oldQueue = res[storageKey] || [];
        
        // Add new items
        const newRows = exportData;
        await chrome.storage.local.set({ [storageKey]: [...oldQueue, ...newRows] });

        
        const statusEl = document.getElementById('pushStatus');
        if (statusEl) {
            statusEl.style.opacity = '1';
            setTimeout(() => { statusEl.style.opacity = '0'; }, 3000);
        }

        // Notify background specifically for AMAZON
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'startSync', platform: 'AMAZON' });
        }
        
        updateQueueUI();
    } catch (err) {
        console.error("Queueing failed:", err);
        window.showCustomError("Error adding to sync queue: " + err.message, "Queue Error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// --- QUEUE UI LOGIC (Isolated for Amazon) ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'syncUpdate' && msg.platform === 'AMAZON') {
        updateQueueUI();
    }
});

async function updateQueueUI() {
    const container = document.getElementById('queueContainer');
    const pendingText = document.getElementById('queuePendingCount');
    const statusText = document.getElementById('queueWorkerStatus');
    const progressBar = document.getElementById('queueProgressBar');

    if (!container || !pendingText) return;

    // Fetch FRESH queue for AMAZON only
    const storageKey = 'pushQueue_AMAZON';
    const res = await chrome.storage.local.get([storageKey]);
    const amazonQueue = res[storageKey] || [];
    const count = amazonQueue.length;

    pendingText.textContent = count;
    container.style.display = (count > 0 || currentSheet === 'queue') ? 'block' : 'none';

    if (count > 0) {
        statusText.textContent = "Processing Amazon Sync... 🚀";
        statusText.style.color = "#ff9900";
        progressBar.style.width = "40%";
    } else {
        statusText.textContent = "Amazon All Synced ✅";
        statusText.style.color = "#27ae60";
        progressBar.style.width = "0%";
    }
}

// Clear Queue Logic (Isolated for Amazon)
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'clearQueueBtn') {
        const confirmed = await window.showCustomConfirm("Clear pending AMAZON transfers only?", "Clear Queue");
        if (confirmed) {
            await chrome.storage.local.set({ ['pushQueue_AMAZON']: [] });
            updateQueueUI();
        }
    }
});

// Initialization
window.addEventListener('load', () => {
    updateQueueUI();
});

// Event Delegation for Table/Header Buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('filter-trigger')) {
      e.stopPropagation();
      const colIndex = parseInt(e.target.getAttribute('data-col'));
      window.showFilterMenu(colIndex, e.target);
  }
});



// --- COLUMN FILTERING LOGIC ---
let activeFilterMenu = null;

window.showFilterMenu = function(colIndex, el) {
  if (activeFilterMenu) {
    document.body.removeChild(activeFilterMenu);
    activeFilterMenu = null;
  }

  const sheetKey = currentSheet;
  const filters = globalFilters[sheetKey] || {};

  // Fetch base rows
  let filteredForMenu = [];
  if (sheetKey === 'portal') filteredForMenu = globalPortalData.slice(1);
  else if (sheetKey === 'sale') filteredForMenu = globalSaleData.slice(1);
  else if (sheetKey === 'purchase') filteredForMenu = globalPurchaseData.slice(1);
  else if (sheetKey === 'vendor') filteredForMenu = globalVendorData.slice(1);

  if (!filteredForMenu || filteredForMenu.length === 0) return;

  // EXCEL BEHAVIOR: shown unique values should be based on data already filtered by OTHER columns.
  for (const [idxStr, selected] of Object.entries(filters)) {
    const idx = parseInt(idxStr);
    if (idx === colIndex) continue; // Skip current column
    filteredForMenu = filteredForMenu.filter(row => {
      const rowVal = String(row[idx] || "").trim();
      return selected.includes(rowVal);
    });
  }

  const uniqueValues = new Set();
  filteredForMenu.forEach(row => {
    const val = getRenderedText(row[colIndex], colIndex, row, sheetKey);
    uniqueValues.add(val);
  });
  
  const sortedUnique = Array.from(uniqueValues).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const menu = document.createElement('div');
  menu.className = 'filter-menu';
  menu.style.display = 'flex';
  
  const rect = el.getBoundingClientRect();
  menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
  menu.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 280) + 'px';

  let filterContent = `
    <div class="sort-options">
      <button class="sort-btn sort-asc">🔼 Sort A to Z</button>
      <button class="sort-btn sort-desc">🔽 Sort Z to A</button>
    </div>
    <div class="filter-menu-header">
      <div style="font-weight:700; font-size:12px; color:#64748b;">Text Filters</div>
      <div class="filter-search-container">
        <span class="filter-search-icon">🔍</span>
        <input type="text" class="filter-search-input" placeholder="Search...">
      </div>
    </div>
    <div class="filter-options-list">
      <label class="filter-option">
        <input type="checkbox" checked class="select-all-cb">
        <span>(Select All)</span>
      </label>
      <div class="options-container">
  `;

  const selectedValues = globalFilters[sheetKey][colIndex] || [];
  const isAllSelected = selectedValues.length === 0;

  sortedUnique.forEach(val => {
    const isChecked = isAllSelected || selectedValues.includes(val);
    filterContent += `
      <label class="filter-option">
        <input type="checkbox" value="${escapeHTML(val)}" ${isChecked ? 'checked' : ''} class="opt-cb">
        <span>${escapeHTML(val || "(Blanks)")}</span>
      </label>
    `;
  });

  filterContent += `
      </div>
    </div>
    <div class="filter-menu-footer">
      <button class="filter-btn filter-btn-clear">Clear</button>
      <button class="filter-btn filter-btn-apply">OK</button>
    </div>
  `;

  menu.innerHTML = filterContent;
  document.body.appendChild(menu);
  activeFilterMenu = menu;

  // Attach Listeners to Menu Elements
  menu.querySelector('.sort-asc').onclick = () => window.sortColumn(colIndex, 'asc');
  menu.querySelector('.sort-desc').onclick = () => window.sortColumn(colIndex, 'desc');
  menu.querySelector('.filter-search-input').onkeyup = (e) => window.filterOptionsSubList(e.target);
  menu.querySelector('.select-all-cb').onchange = (e) => window.toggleFilterSelectAll(e.target);
  menu.querySelector('.filter-btn-clear').onclick = () => window.clearColumnFilter(colIndex);
  menu.querySelector('.filter-btn-apply').onclick = () => window.applyColFilter(colIndex);

  setTimeout(() => {
    const closeListener = (e) => {
      if (activeFilterMenu && !activeFilterMenu.contains(e.target)) {
        document.body.removeChild(activeFilterMenu);
        activeFilterMenu = null;
        window.removeEventListener('mousedown', closeListener);
      }
    };
    window.addEventListener('mousedown', closeListener);
  }, 10);
};

window.filterOptionsSubList = function(input) {
  const filter = input.value.toLowerCase();
  const options = activeFilterMenu.querySelectorAll('.options-container .filter-option');
  options.forEach(opt => {
    const text = opt.textContent.toLowerCase();
    opt.style.display = text.includes(filter) ? 'flex' : 'none';
  });
};

window.toggleFilterSelectAll = function(cb) {
  const options = activeFilterMenu.querySelectorAll('.opt-cb');
  options.forEach(opt => opt.checked = cb.checked);
};

window.clearColumnFilter = function(colIndex) {
  if (globalFilters[currentSheet]) {
    delete globalFilters[currentSheet][colIndex];
  }
  if (activeFilterMenu) {
    document.body.removeChild(activeFilterMenu);
    activeFilterMenu = null;
  }
  runFilterLogic();
};

window.applyColFilter = function(colIndex) {
  const options = activeFilterMenu.querySelectorAll('.opt-cb');
  const selected = [];
  let someUnchecked = false;
  options.forEach(opt => {
    if (opt.checked) selected.push(opt.value);
    else someUnchecked = true;
  });

  if (!someUnchecked) {
    delete globalFilters[currentSheet][colIndex];
  } else {
    globalFilters[currentSheet][colIndex] = selected;
  }

  if (activeFilterMenu) {
    document.body.removeChild(activeFilterMenu);
    activeFilterMenu = null;
  }
  runFilterLogic();
};

window.sortColumn = function(colIndex, order) {
  currentSortedCol = { index: colIndex, order: order };
  if (activeFilterMenu) {
    document.body.removeChild(activeFilterMenu);
    activeFilterMenu = null;
  }
  runFilterLogic();
};

window.runFilterLogic = function() {
    const d = (currentSheet==='portal')?globalPortalData:(currentSheet==='purchase')?globalPurchaseData:(currentSheet==='sale')?globalSaleData:(currentSheet==='vendor')?globalVendorData:[];
    
    if (!d || d.length <= 1) {
        globalFilteredData = (d && d.length > 0) ? [...d] : [];
        renderTable();
        return;
    }

    const header = d[0];
    let filtered = d.slice(1);

    const sheetKey = currentSheet;
    const filters = globalFilters[sheetKey] || {};
    for (const [idxStr, selected] of Object.entries(filters)) {
        const idx = parseInt(idxStr);
        filtered = filtered.filter(row => {
            const rowVal = getRenderedText(row[idx], idx, row, sheetKey);
            return selected.includes(rowVal);
        });
    }

    // Integrate Global Search into Filter Logic
    const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || "";
    if (query !== "") {
        filtered = filtered.filter(row => {
            return row.some(cell => String(cell || "").toLowerCase().includes(query));
        });
    }

    if (currentSortedCol.index !== -1) {
        const idx = currentSortedCol.index;
        const order = currentSortedCol.order;
        filtered.sort((a, b) => {
            let valA = a[idx];
            let valB = b[idx];
            
            let numA = parseFloat(String(valA).replace(/[₹,%\s]/g, ""));
            let numB = parseFloat(String(valB).replace(/[₹,%\s]/g, ""));
            
            if (!isNaN(numA) && !isNaN(numB)) {
                return order === 'asc' ? numA - numB : numB - numA;
            }
            
            valA = String(valA || "").toLowerCase();
            valB = String(valB || "").toLowerCase();
            if (valA < valB) return order === 'asc' ? -1 : 1;
            if (valA > valB) return order === 'asc' ? 1 : -1;
            return 0;
        });
    }

    globalFilteredData = [header, ...filtered];
    renderTable();
};

// --- REPORT TAB LOGIC ---
async function renderReportTab() {
    const tbody = document.getElementById('reportTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = "";
    const reports = await getAllReports();
    // Sort reverse chronological
    reports.sort((a, b) => b.timestamp - a.timestamp);
    
    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="16" style="padding: 40px; text-align: center; color: #64748b;">No report entries found for the last 24 hours.</td></tr>`;
        return;
    }
    
    reports.forEach(entry => {
        const d = entry.data || {};
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #f1f5f9";
        
        const cols = [
            d["INVOICE ID"], d["INVOICE NO."], d["INVOICE DATE"], d["IRN DATE"], 
            d["QTY_SALE"], d["SALE AMOUNT"], d["ZOHO SALE"], d["⭐"], 
            d["BILL ID"], d["BILL NO."], d["BILL DATE"], d["QTY_PUR"], 
            d["PURCHASE AMOUNT"], d["ZOHO PURCHASE"], d["DATA AND TIME"], d["REMARK"]
        ];
        
        cols.forEach(val => {
            const td = document.createElement('td');
            td.style.padding = "10px 12px";
            td.textContent = val || "-";
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
}

async function exportReportToExcel() {
    const reports = await getAllReports();
    if (reports.length === 0) {
        window.showCustomAlert("No data to export!", "Export Empty");
        return;
    }
    
    // Sort chronological for export
    reports.sort((a, b) => a.timestamp - b.timestamp);
    
    const headers = [
        "INVOICE ID", "INVOICE NO.", "INVOICE DATE", "IRN DATE", 
        "QTY", "SALE AMOUNT", "ZOHO SALE", "⭐", 
        "BILL ID", "BILL NO.", "BILL DATE", "QTY", 
        "PURCHASE AMOUNT", "ZOHO PURCHASE", "DATA AND TIME", "REMARK"
    ];
    
    const dataRows = reports.map(r => {
        const d = r.data || {};
        return [
            d["INVOICE ID"], d["INVOICE NO."], d["INVOICE DATE"], d["IRN DATE"], 
            d["QTY_SALE"], d["SALE AMOUNT"], d["ZOHO SALE"], d["⭐"], 
            d["BILL ID"], d["BILL NO."], d["BILL DATE"], d["QTY_PUR"], 
            d["PURCHASE AMOUNT"], d["ZOHO PURCHASE"], d["DATA AND TIME"], d["REMARK"]
        ];
    });
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Amazon Report");
    
    const nickname = (globalNickname || "User").replace(/[^a-z0-9]/gi, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${nickname}-${dateStr}-REPORT.xlsx`;
    
    if (window.directDownloadExcel) {
        window.directDownloadExcel(wb, fileName);
    } else {
        XLSX.writeFile(wb, fileName);
    }
}
