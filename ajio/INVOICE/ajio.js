/* global normalizeMojibake */
// Fallback: if normalizeMojibake is not provided by an external script, define a no-op
if (typeof normalizeMojibake === 'undefined') {
  window.normalizeMojibake = (str) => str || '';
}

const pastelColors = [
  'rgb(255, 245, 245)',
  'rgb(255, 250, 235)',
  'rgb(250, 255, 240)',
  'rgb(240, 255, 250)',
  'rgb(240, 248, 255)',
  'rgb(248, 240, 255)',
  'rgb(255, 240, 250)'
];

// Initialize Global User UI
if (typeof window.displayUserNickname === 'function') {
  window.displayUserNickname('userNicknameContainer');
}



// SHARED GLOBAL STATE
let globalFilteredData = [];
let currentPage = 1;
let pageSize = 50;
let cachedPortalBillCount = 0;
let cachedSaleBillCount = 0;
let cachedPurchaseBillCount = 0;
let currentSheet = 'portal'; // Tracks active tab

// API Synchronization Logic
const updateLocalApiDisplay = async () => {
  if (typeof window.syncApiDisplay === 'function') {
    await window.syncApiDisplay('apiCountDisplay');
  }
};

let maxCols = 0;
let formulaViewActive = false; // Toggle state

let globalPortalData = [];
let globalPortalMaxCols = 0;

let globalSaleInvoiceData = [];
let globalPriceDisputes = []; // Moved from sale.js
let globalPurchaseData = [];
let portalDKMap = new Map();
let portalMapDL_DM = new Map();
let currentPurchaseIdx = 0; // Tracks active purchase bill in modal
let uniquePurchaseInvoices = []; // List of unique Inv IDs from Column C
let purchaseAutoInterval = null;

// --- QUEUE SYSTEM STATE ---
let globalQueueData = [];
let queueWorkerInterval = null;
let isQueueProcessing = false;

// --- INSIGHTS (Google Sheet read + charts) ---
const INSIGHTS_SHEET_NAME = "AJIO";
const INSIGHTS_MAX_ROWS = 10000;
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
  const queue = document.getElementById('queueContainer');
  insightsPrevLayout = {
    table: table ? table.style.display : "",
    pagination: pagination ? pagination.style.display : "",
    queue: queue ? queue.style.display : ""
  };
  if (container) container.style.display = 'block';
  if (table) table.style.display = 'none';
  if (pagination) pagination.style.display = 'none';
  if (queue) queue.style.display = 'none';
  insightsVisible = true;
}

function hideInsightsView() {
  const container = document.getElementById('insightsContainer');
  const table = document.getElementById('tableContainer');
  const pagination = document.getElementById('paginationControls');
  const queue = document.getElementById('queueContainer');
  if (container) container.style.display = 'none';
  if (table) table.style.display = (insightsPrevLayout && insightsPrevLayout.table !== undefined) ? insightsPrevLayout.table : 'block';
  if (pagination) pagination.style.display = (insightsPrevLayout && insightsPrevLayout.pagination !== undefined) ? insightsPrevLayout.pagination : pagination.style.display;
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
  const kpiAllClear = document.getElementById('kpiAllClear');
  const subtitle = document.getElementById('insightsSubtitle');

  if (kpiRows) kpiRows.textContent = String(totals.rows || 0);
  if (kpiRowsHint) kpiRowsHint.textContent = "Loaded: " + String(payload.maxRowsUsed || 0) + " / " + String(requestedLimit);

  if (window.InsightsCharts && kpiSale) kpiSale.textContent = window.InsightsCharts.formatINR(totals.sale || 0);
  if (window.InsightsCharts && kpiPurchase) kpiPurchase.textContent = window.InsightsCharts.formatINR(totals.purchase || 0);

  const allClearExact = remarks.find(function (r) { return String(r.label).trim().toUpperCase() === "ALL CLEAR"; });
  const otherRemarks = remarks.filter(function (r) { return String(r.label).trim().toUpperCase() !== "ALL CLEAR"; });

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
      line: "#34495e",
      fillTop: "rgba(52, 73, 94, 0.18)",
      fillBottom: "rgba(52, 73, 94, 0.02)"
    });
  }

  if (window.InsightsCharts && barCanvas) {
    window.InsightsCharts.drawBarChart(barCanvas, [
      { label: "SALE", value: totals.sale || 0 },
      { label: "PURCHASE", value: totals.purchase || 0 }
    ], {
      barTop: "rgba(52, 73, 94, 0.92)",
      barBottom: "rgba(52, 73, 94, 0.42)"
    });
  }

  if (window.InsightsCharts && pieCanvas) {
    window.InsightsCharts.drawPieChart(pieCanvas, remarks || [], {
      colors: ["#2d3748", "#6c5ce7", "#27ae60", "#f1c40f", "#e67e22", "#3498db", "#64748b"]
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
    leaderboardCont.innerHTML = userStats.sort((a, b) => b.totalRows - a.totalRows).map((u, i) => {
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
                          <span class="label">Invoices</span>
                          <span class="value" style="color: #6366f1;">${u.totalRows}</span>
                      </div>
                      <div class="user-stat-item">
                          <span class="label">Issues</span>
                          <span class="value" style="color: #ef4444;">${u.disputeRows}</span>
                      </div>
                      <div class="user-stat-item">
                          <span class="label">Efficiency</span>
                          <span class="value" style="color: #10b981;">${(100 - disputeRate).toFixed(1)}%</span>
                      </div>
                  </div>
              </div>
          `;
    }).join('');
  }

  // 3. Render Platform Distribution Stats
  if (platformStatsCont) {
    platformStatsCont.innerHTML = userStats.sort((a, b) => b.totalRows - a.totalRows).slice(0, 5).map(u => {
      const total = u.totalRows || 1;
      return `
              <div style="background: #f8fafc; padding: 12px; border-radius: 12px; margin-bottom: 8px; border: 1px solid #f1f5f9;">
                  <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 13px; margin-bottom: 8px; color: #1e293b;">
                      <span>${u.nickname}</span>
                      <span style="color: #6366f1;">${u.totalRows} Total</span>
                  </div>
                  <div style="display: flex; gap: 4px; height: 6px; border-radius: 10px; overflow: hidden; background: #e2e8f0;">
                      <div style="width: ${(u.amazon / total * 100)}%; background: #ff9900; transition: width 0.5s ease;"></div>
                      <div style="width: ${(u.ajio / total * 100)}%; background: #1e293b; transition: width 0.5s ease;"></div>
                      <div style="width: ${(u.myntra / total * 100)}%; background: #ff3f6c; transition: width 0.5s ease;"></div>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 6px; font-weight: 700; color: #64748b;">
                      <span>AMZ: ${u.amazon}</span>
                      <span>AJI: ${u.ajio}</span>
                      <span>MYN: ${u.myntra}</span>
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
    const top5 = [...vendors].sort((a, b) => b.value - a.value).slice(0, 5);
    statsContainer.innerHTML = top5.map((v, i) => {
      const pct = ((v.value / totalRevenue) * 100).toFixed(1);
      const colors = ["#2d3748", "#1a365d", "#2c5282", "#2b6cb0", "#3182ce"]; // Ajio Blue hues
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
    const sorted = [...vendors].sort((a, b) => b.value - a.value);
    const chartData = sorted.slice(0, 7);
    if (sorted.length > 7) {
      const groupValue = sorted.slice(7).reduce((acc, v) => acc + (v.value || 0), 0);
      chartData.push({ label: "Others", value: groupValue });
    }
    window.InsightsCharts.drawDonutChart(chartCanvas, chartData, {
      colors: ["#2d3748", "#1a365d", "#2c5282", "#2b6cb0", "#3182ce", "#4299e1", "#63b3ed", "#64748b"]
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
          <div class="vendor-item" style="${isActive ? 'background: #f0f7ff; border-color: #002e6e;' : ''}" onclick="applyVendorDeepDive('${v.label.replace(/'/g, "\\'")}')">
              <div class="v-rank">${i + 1}</div>
              <div class="v-info">
                 <div class="v-name" title="${v.label}">${v.label}</div>
                 <div class="v-stats">${v.rows} Invoices • Avg: ₹${window.InsightsCharts.formatINR(avg)}</div>
                 <div class="v-bar-wrap">
                    <div class="v-bar-fill" style="width: ${percent}%; background: #002e6e;"></div>
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
    console.error("AJIO Insights Parse Error:", e, raw);
    setInsightsStatus("Error: Failed to parse insights data. Please check connection.", "error");
  }
}

// --- IndexedDB Persistence ---
const DB_NAME = "AjioInvoiceDB";
const STORE_NAME = "ExcelStore";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveToDB(key, data) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(data, key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Save to DB failed:", err);
  }
}

async function getFromDB(key) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Load from DB failed:", err);
    return null;
  }
}

async function deleteFromDB(key) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Delete from DB failed:", err);
  }
}

async function clearDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
    });
  } catch (err) {
    console.error("Clear DB failed:", err);
  }
}

// Auto-load on startup
window.addEventListener('load', async () => {
  // 0. Initialize User Badge
  if (typeof window.displayUserNickname === 'function') {
    window.displayUserNickname('userNicknameContainer');
  }

  // Sync API tracker from Google Sheets
  updateLocalApiDisplay();

  // 1. Load data from DB
  const pData = await getFromDB("portal");
  const sData = await getFromDB("sale");
  const purData = await getFromDB("purchase");
  const queueData = await getFromDB('PushQueue');

  if (pData) {
    globalPortalData = pData;
    globalPortalMaxCols = pData[0] ? Math.min(pData[0].length, 119) : 0;
    cachedPortalBillCount = new Set(pData.slice(1).map(r => String(r[2] || "").trim()).filter(id => id !== "")).size;
  }
  if (sData) {
    globalSaleInvoiceData = sData;
    cachedSaleBillCount = new Set(sData.slice(1).map(r => String(r[2] || "").trim()).filter(id => id !== "")).size;
  }
  if (purData) {
    globalPurchaseData = purData;
    cachedPurchaseBillCount = new Set(purData.slice(1).map(r => String(r[2] || "").trim()).filter(id => id !== "")).size;
  }
  if (queueData) globalQueueData = queueData;

  // 2. Initialize Queue Worker
  startQueueWorker();

  // 3. Reset to default tab
  currentSheet = 'portal';
  globalFilteredData = globalPortalData;
  maxCols = globalPortalMaxCols;

  // Display Party Code if data exists
  const partyCodeLoad = localStorage.getItem('global_party_code');
  const pBadgeLoad = document.getElementById('partyCodeBadge');
  const pValueLoad = document.getElementById('partyCodeValue');
  if (pBadgeLoad && pValueLoad && partyCodeLoad) {
    pValueLoad.textContent = partyCodeLoad;
    pBadgeLoad.style.display = 'block';
  }

  // 4. Clear All Data Logic
  const clearBtn = document.getElementById('clearAllDataBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const ok = await window.showCustomConfirm("Are you sure? This will delete all Portal, Sale, and Purchase data and you will have to re-upload files.", "Danger: Clear All Data", true);
      if (ok) {
        await clearDB();
        window.location.reload();
      }
    });
  }

  if (globalPortalData.length > 0 || globalSaleInvoiceData.length > 0 || globalPurchaseData.length > 0) {
    syncAllTabs();
  }

  // Global Search Listener
  const searchInput = document.getElementById('searchFInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      runFilterLogic();
    });
  }

  renderTable();
});

// --- QUEUE SYSTEM SYNC ---
// UI now listens to background.js updates instead of running its own loop
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'syncUpdate' && msg.platform === 'AJIO') {
    // We ignore msg.count (total) and re-check local platform count
    updateQueueUI();
  }
});

window.updateQueueUI = updateQueueUI;
async function updateQueueUI(forcedCount) {
  const container = document.getElementById('queueContainer');
  const pendingText = document.getElementById('queuePendingCount');
  const statusText = document.getElementById('queueWorkerStatus');
  const progressBar = document.getElementById('queueProgressBar');

  if (!container || !pendingText) return;

  // Fetch full queue for AJIO ONLY
  const storageKey = 'pushQueue_AJIO';
  const res = await chrome.storage.local.get([storageKey]);
  const ajioQueue = res[storageKey] || [];
  const count = ajioQueue.length;

  pendingText.textContent = count;

  // Show if data is pending for AJIO or if it's the active tab
  if (count > 0 || currentSheet === 'queue') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }

  if (count > 0) {
    statusText.textContent = "Processing Ajio Sync... 🚀";
    statusText.style.color = "#3498db";
    // Calculate relative progress roughly (using a fixed base for now or just 40%)
    progressBar.style.width = "40%";
  } else {
    statusText.textContent = "Ajio All Synced ✅";
    statusText.style.color = "#27ae60";
    progressBar.style.width = "0%";
  }

  // Normalize any corrupted icon glyphs set above.
  if (statusText) statusText.textContent = normalizeMojibake(statusText.textContent);

  // Sync header badge (Should also probably be filtered)
  if (typeof window.updateGlobalQueueBadge === 'function') {
    window.updateGlobalQueueBadge(count);
  }
}

// Clear Queue Button (Now clears global background queue)
document.getElementById('clearQueueBtn').addEventListener('click', async () => {
  const confirmed = await window.showCustomConfirm("Clear pending AJIO transfers only?", "Clear Ajio Queue", true);
  if (confirmed) {
    await chrome.storage.local.set({ ['pushQueue_AJIO']: [] });
    updateQueueUI();
  }
});


function getExcelFormula(sheetType, colIdx, rowIdx) {
  const r = rowIdx + 1; // 1-based row number for Excel
  if (sheetType === 'SALE') {
    if (colIdx === 22) return "=L" + r + "/K" + r; // W
    if (colIdx === 23) return "=W" + r + "*K" + r; // X
    if (colIdx === 24) return "=X" + r + "*M" + r + "/2"; // Y
    if (colIdx === 25) return "=X" + r + "*M" + r + "/2"; // Z
    if (colIdx === 26) return "=X" + r + "+Y" + r + "+Z" + r; // AA
    if (colIdx === 28) return "Fraction logic (AA vs INT AA)";
    if (colIdx === 41) return "=B" + r + "&C" + r + "&H" + r + "&I" + r; // AP
    if (colIdx === 42) return "=A" + r; // AQ
    if (colIdx === 43) return "=IFERROR(VLOOKUP(AP" + r + ",PURCHASE!$BA$2:$BB$6000,2,0),\"\")"; // AR
    if (colIdx === 44) return "=IFERROR(VLOOKUP(AP" + r + ",PURCHASE!$BA$2:$BD$6000,4,0),\"\")"; // AS
    if (colIdx === 45) return "=IFERROR(VLOOKUP(AP" + r + ",PURCHASE!$BA$2:$BE$6000,5,0),\"\")"; // AT
    if (colIdx === 46) return "=IFERROR(VLOOKUP(AP" + r + ",PURCHASE!$BA$2:$BF$6000,6,0),\"\")"; // AU
  } else if (sheetType === 'PURCHASE') {
    if (colIdx === 19) return "=B" + r + "&A" + r + "&H" + r + "&I" + r; // T
    if (colIdx === 20) return "=VLOOKUP(T" + r + ",PORTAL!$AT$1:$AT$6000,1,)"; // U
    if (colIdx === 21) return "=K" + r; // V
    if (colIdx === 22) return "=L" + r + "/K" + r; // W
    if (colIdx === 23) return "=W" + r + "*V" + r; // X
    if (colIdx === 24) return "=X" + r + "*M" + r + "/2"; // Y
    if (colIdx === 25) return "=X" + r + "*M" + r + "/2"; // Z
    if (colIdx === 26) return "=X" + r + "*0.1%"; // AA
    if (colIdx === 27) return "=X" + r + "+Y" + r + "+Z" + r + "-AA" + r; // AB
    if (colIdx === 28) return "Fraction logic (AB vs INT AB)"; // AC
    if (colIdx === 29) return "=IFERROR(ROUND(AB" + r + ",0),\"\")"; // AD
    if (colIdx === 30) return "=C" + r; // AE
    if (colIdx === 31) return "=BB" + r; // AF
    if (colIdx === 32) return "=AF" + r + "-V" + r; // AG
    if (colIdx === 33) return "=IF(AG" + r + "<1,\"TRUE ✅ \",\"FALSE ❌ \")"; // AH
    if (colIdx === 34) return "=A" + r; // AI
    if (colIdx === 35) return "=C" + r; // AJ
    if (colIdx === 36) return "=REPLACE(AJ" + r + ",5,1,\"S\") if P"; // AK
    if (colIdx === 39) return "=AL" + r + "=AM" + r; // AN
    if (colIdx === 40 && r === 2) return "=IF(COUNTIF(AN2:AN6000,\"TRUE\")...)"; // AO
    if (colIdx === 41) return "=B" + r; // AP
    if (colIdx === 42) return "=A" + r; // AQ
    if (colIdx === 47) return "=C" + r; // AV (Bill No Key)
    if (colIdx === 48) return "=AW" + r + "*0.1%"; // AW (Keeping original calculation if needed elsewhere)
    if (colIdx === 49) return "=IFERROR(VLOOKUP(AV" + r + ", PORTAL!$C$2:$CI$6000, 85, FALSE), 0)"; // AX (TDS Portal Mirror)
    if (colIdx === 50) return "=IFERROR(VLOOKUP(AV" + r + ", $C$2:$Q$6000, 15, FALSE), 0)"; // AY (TDS Purchase Mirror)
    if (colIdx === 51) return "=IF(AX" + r + "=AY" + r + ",\"TRUE✅\",\"FALSE❌\")"; // AZ
    if (colIdx === 52) return "=A" + r + "&B" + r + "&H" + r + "&I" + r; // BA
    if (colIdx === 53) return "=IF(AP" + r + "=\"\",\"\",AP" + r + ")"; // BB
    if (colIdx === 54) return "=AQ" + r; // BC
    if (colIdx === 55) return "=IF(AS" + r + "=\"\",\"\",AS" + r + ")"; // BD
    if (colIdx === 56) return "=AT" + r; // BE
    if (colIdx === 57) return "=AU" + r; // BF
    if (colIdx === 58) return "=IF(AR" + r + "=\"\",\"\",AR" + r + ")"; // BG
  } else if (sheetType === 'PORTAL') {
    if (colIdx === 44) return "=D" + r + "&C" + r + "&F" + r + "&K" + r + "&N" + r; // AS
    if (colIdx === 45) return "=F" + r + "&C" + r + "&K" + r + "&N" + r; // AT
    if (colIdx === 46) return "=AE" + r; // AU
    if (colIdx === 47) return "=IFERROR(IF(OR(AU" + r + "=\"\",Q" + r + "=\"\"),\"\",AU" + r + "/Q" + r + " ),\"\")"; // AV
    if (colIdx === 48) return "=AE" + r + "*V" + r + "*AG" + r + "%"; // AW
    if (colIdx === 49) return "=AE" + r + "*V" + r + "*AI" + r + "%"; // AX
    if (colIdx === 50) return "=SALE!U" + r; // AY
    if (colIdx === 51) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$U$1:$V$6000,2,FALSE))"; // AZ
    if (colIdx === 52) return "=IFERROR(VLOOKUP(AY" + r + ",SALE!$T$1:$AJ$6000,16,),\"\")"; // BA
    if (colIdx === 53) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",$AS$1:$AV$6000,3,FALSE))"; // BB
    if (colIdx === 54) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$T$1:$W$6000,4,FALSE))"; // BC
    if (colIdx === 55) return "=IF(AND(BB" + r + "=\"\",BC" + r + "=\"\"),\"\",BB" + r + "-BC" + r + ")"; // BD
    if (colIdx === 56) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",$DI$1:$DJ$6000,2,FALSE))"; // BE
    if (colIdx === 57) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$T$1:$AD$6000,11,FALSE))"; // BF
    if (colIdx === 58) return "=IF(AND(BE" + r + "=\"\",BF" + r + "=\"\"),\"\",BE" + r + "-BF" + r + ")"; // BG
    if (colIdx === 59) return "=IF(AND(BB" + r + "=\"\",BE" + r + "=\"\"),\"\",BB" + r + "*BE" + r + ")"; // BH
    if (colIdx === 60) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$T$1:$X$6000,5,FALSE))"; // BI
    if (colIdx === 61) return "=IF(AND(BH" + r + "=\"\",BI" + r + "=\"\"),\"\",BH" + r + "-BI" + r + ")"; // BJ
    if (colIdx === 62) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",$AS$1:$AX$6000,5,FALSE))"; // BK
    if (colIdx === 63) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$T$1:$Z$6000,6,FALSE))"; // BL
    if (colIdx === 65) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",$AS$1:$AX$6000,5,FALSE))"; // BN
    if (colIdx === 66) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$T$1:$Z$6000,6,FALSE))"; // BO
    if (colIdx === 67) return "=BN" + r + "-BO" + r; // BP
    if (colIdx === 68) return "=BC" + r + "*BE" + r + "+BK" + r + "+BN" + r; // BQ
    if (colIdx === 69) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$T$1:$AA$6000,8,FALSE))"; // BR
    if (colIdx === 70) return "=IF(AND(BQ" + r + "=\"\",BR" + r + "=\"\"),\"\",BQ" + r + "-BR" + r + ")"; // BS
    if (colIdx === 71) return "=IF(BR" + r + "=\"\",\"\",TEXT(IF(ROUND(BR" + r + "-INT(BR" + r + "),2)<=0.49, BR" + r + "-INT(BR" + r + "), (INT(BR" + r + ")+1)-BR" + r + "), \"0.00\"))"; // BT
    if (colIdx === 72) return "=ROUND(BQ" + r + ",0)"; // BU
    if (colIdx === 73) return "=IF(AY" + r + "=\"\",\"\",VLOOKUP(AY" + r + ",SALE!$T$1:$AC$6000,10,FALSE))"; // BV
    if (colIdx === 75) return "=ROUND(VLOOKUP(AY" + r + ", SALE!$T$1:$AB$6000, 8, FALSE), 0)"; // BX
    if (colIdx === 76) return "=BU" + r + "-BX" + r; // BY
    if (colIdx === 85) return "=PURCHASE!U" + r; // CH
    if (colIdx === 86) return "=IFERROR(VLOOKUP(C" + r + ", PURCHASE!$C$2:$AE$6000, 29, FALSE), \"\")"; // CI (TDS Mirror from Purchase AE)
    if (colIdx === 87) return "=IFERROR(VLOOKUP(CH" + r + ",SALE!$V$1:$W$6000,2,),\"\")"; // CJ
    if (colIdx === 88) return "=IFERROR(VLOOKUP(CH" + r + ",PURCHASE!$T$1:$W$6000,4,),\"\")"; // CK
    if (colIdx === 89) return "=IF(AND(CJ" + r + "=\"\",CK" + r + "=\"\"),\"\",CJ" + r + "-CK" + r + ")"; // CL
    if (colIdx === 90) return "=IF(CL" + r + ">0,\"TRUE ✅ \",\"FALSE ❌ \")"; // CM
    if (colIdx === 91) {
      if (r === 3) return "=PURCHASE!AO2";
      if (r === 4) return "=IF(SUMPRODUCT(--(CL2:CL6000<0))>0,\"ERROR ⚠️\",\"OK 👍\")";
      if (r === 5) return "=IF(OR(CN3=\"ERROR ⚠️\", CN4=\"ERROR ⚠️\"), \"ERROR ⚠️\", IF(AND(CN3=\"OK 👍\", CN4=\"OK 👍\"), \"OK 👍\", \"\"))";
      return "";
    }
    if (colIdx === 92) return "=IFERROR(VLOOKUP(BA" + r + ",$F$1:$J$6000,5, ),\"\")"; // CO
    if (colIdx === 93) return "=IF(CO" + r + "=\"Cancelled\",\"CANCEL\",IF(OR(CO" + r + "=\"New\",CO" + r + "=\"Shipped\",CO" + r + "=\"Delivered\",CO" + r + "=\"Ready to ship\",CO" + r + "=\"Invoice Generated\"),IF(ISNUMBER(SEARCH(\"TRUE\",DY" + r + ")),\"ALL CLEAR\",IF(ISNUMBER(SEARCH(\"FALSE\",DY" + r + ")),\"ALL CLEAR (S>P)\",\"\")),\"\"))"; // CP
    if (colIdx === 94) return "=VLOOKUP(EC" + r + ",BA1:CM6000,39,)"; // CQ
    if (colIdx === 95) return "=AS" + r; // CR
    if (colIdx === 96) return "=SALE!AK" + r; // CS
    if (colIdx === 97) return "=SALE!AI" + r; // CT
    if (colIdx === 98) return "=SALE!AL" + r; // CU
    if (colIdx === 99) return "=SALE!AL" + r; // CV
    if (colIdx === 100) return "=SALE!AN" + r; // CW
    if (colIdx === 101) return "=SALE!AO" + r; // CX
    if (colIdx === 103) return "=IF(CX" + r + "<>\"\",\"⭐\",\"\")"; // CZ
    if (colIdx === 104) return "=IF(CS" + r + "=\"\",\"\",CS" + r + ")"; // DA
    if (colIdx === 105) return "=IF(CT" + r + "=\"\",\"\",SUBSTITUTE(CT" + r + ",\"S\",\"P\"))"; // DB
    if (colIdx === 106) return "=IF(CU" + r + "=\"\",\"\",CU" + r + ")"; // DC
    if (colIdx === 107) return "=IF(CW" + r + "=\"\",\"\",CW" + r + ")"; // DD
    if (colIdx === 108) return "=SALE!AU" + r; // DE
    if (colIdx === 109) return ""; // DF
    if (colIdx === 110) return ""; // DG
  if (colIdx === 111) return "=IF(DB" + r + "=\"\",\"\",IFERROR(VLOOKUP(DB" + r + ",$CI$1:$CP$5000,8,FALSE),\"\"))"; // DH
    if (colIdx === 112) return "=AS" + r; // DI
    if (colIdx === 113) return "=V" + r; // DJ
    if (colIdx === 114) return "=C" + r + "&F" + r + "&K" + r + "&N" + r; // DK
    if (colIdx === 115) return "=DJ" + r; // DL
    if (colIdx === 116) return "=BA" + r; // DM
    if (colIdx === 117) return "=CP" + r; // DN
  }
  return null;
}

async function syncAllTabs() {
  // 1. Ensure pointers are absolute
  if (currentSheet === 'portal') globalFilteredData = globalPortalData;
  else if (currentSheet === 'sale') globalFilteredData = globalSaleInvoiceData;
  else if (currentSheet === 'purchase') globalFilteredData = globalPurchaseData;

  // 2. Perform sync with safety checks
  try {
    if (typeof syncPurchaseTabs === 'function') syncPurchaseTabs();
    if (typeof syncSaleWithPortal === 'function') syncSaleWithPortal();
    if (typeof syncPortalWithSale === 'function') await syncPortalWithSale();
  } catch (e) {
    console.error("Error during cross-tab synchronization:", e);
  }

  // 3. Re-verify pointers and maxCols after sync
  if (currentSheet === 'portal') {
    globalFilteredData = globalPortalData;
    maxCols = globalPortalMaxCols;
  } else if (currentSheet === 'sale') {
    globalFilteredData = globalSaleInvoiceData;
    maxCols = globalSaleInvoiceData[0] ? globalSaleInvoiceData[0].length : 0;
  } else if (currentSheet === 'purchase') {
    globalFilteredData = globalPurchaseData;
    maxCols = globalPurchaseData[0] ? globalPurchaseData[0].length : 0;
  }

  renderTable();
}

// SHARED UTILITIES
function escapeHTML(str) {
  if (typeof str !== 'string') str = String(str || "");
  return str.replace(/[&<>'"]/g, function (tag) {
    const charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    return charsToReplace[tag] || tag;
  });
}

// --- COLUMN FILTERING STATE ---
let globalFilters = { portal: {}, sale: {}, purchase: {} };
let currentSortedCol = { index: -1, order: 'none' }; // { index, order: 'asc'|'desc' }

function renderTable() {
  const container = document.getElementById('tableContainer');

  if (globalFilteredData.length <= 1) {
    container.innerHTML = "<div style='text-align:center; padding: 50px; color: #64748b;'><h3>No data available</h3><p>Click 'Upload Files 📁' above to start processing.</p></div>";
    document.getElementById('topToolbar').style.display = 'flex'; // Keep toolbar visible for Upload button
    document.getElementById('paginationControls').style.display = 'none';

    if (typeof window.mountGlobalActionButton === 'function') {
      window.mountGlobalActionButton('sendToGoogleSheetBtn', 'pushStatus', globalPortalData.length > 1);
    }

    // In QUEUE tab, show a helpful message only if globalQueueData is actually empty
    if (currentSheet === 'queue') {
      if (!globalQueueData || globalQueueData.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding: 50px; color: #64748b;'><h3>The queue is currently empty</h3><p>Use the 'Push Details' button on the Portal tab to add data here.</p></div>";
      } else {
        container.innerHTML = "<div style='text-align:center; padding: 40px;'><h2 style='color: #6c5ce7;'>Background Processing Active 🚀</h2><p>Your sync is running automatically. You can switch to other tabs safely.</p></div>";
      }
    }

    return;
  } else {
    document.getElementById('topToolbar').style.display = 'flex';
    document.getElementById('paginationControls').style.display = (currentSheet === 'queue') ? 'none' : 'flex';

    if (typeof window.mountGlobalActionButton === 'function') {
      window.mountGlobalActionButton('sendToGoogleSheetBtn', 'pushStatus', globalPortalData.length > 1);
    }

    // Hide everything else if in queue tab (The container is handled in updateQueueUI)
    if (currentSheet === 'queue') {
      container.innerHTML = "<div style='text-align:center; padding: 40px;'><h2 style='color: #6c5ce7;'>Background Processing Active</h2><p>Your sync is running automatically. You can switch to other tabs safely.</p></div>";
      return;
    }
  }

  const headerRow = globalFilteredData[0];
  const dataRows = globalFilteredData.slice(1);
  const totalPages = Math.ceil(dataRows.length / pageSize) || 1;

  if (currentPage > totalPages) currentPage = totalPages;

  // Calculate unique bills if applicable
  let extraInfo = `${dataRows.length} Rows`;
  if (currentSheet === 'purchase') extraInfo = `${dataRows.length} Rows | ${cachedPurchaseBillCount} Bills`;
  else if (currentSheet === 'sale') extraInfo = `${dataRows.length} Rows | ${cachedSaleBillCount} Bills`;
  else if (currentSheet === 'portal') {
    extraInfo = `${dataRows.length} Rows | ${cachedPortalBillCount} Bills`;
  }
  document.getElementById('tableInfoBox').textContent = extraInfo;

  renderPagination(totalPages);

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageRows = dataRows.slice(startIdx, endIdx);

  let html = '<table>';
  html += '<tr class="header-row">';
  // Prepend Row # column
  html += '<th class="sticky-col" style="background:#f1f5f9; text-align:center;"># Row</th>';

  for (let colIndex = 0; colIndex < maxCols; colIndex++) {
    const cellValue = headerRow[colIndex] !== undefined && headerRow[colIndex] !== null ? String(headerRow[colIndex]) : "";
    let colName = '';
    let tempIndex = colIndex;
    while (tempIndex >= 0) {
      colName = String.fromCharCode((tempIndex % 26) + 65) + colName;
      tempIndex = Math.floor(tempIndex / 26) - 1;
    }
    const displayValue = cellValue ? `${cellValue} (${colName})` : `(${colName})`;

    // Check if filter is active for this column
    const isFiltered = globalFilters[currentSheet] && globalFilters[currentSheet][colIndex] && globalFilters[currentSheet][colIndex].length > 0;
    const isSorted = currentSortedCol.index === colIndex;

    html += `
      <th>
        <div class="th-content">
          <span>${escapeHTML(displayValue)}</span>
          <div class="filter-trigger ${isFiltered ? 'active' : ''}" data-col="${colIndex}">
            ${isFiltered ? '🔽' : '▼'}
          </div>
        </div>
      </th>`;
  }
  html += '</tr>';


  for (let rowIndex = 0; rowIndex < pageRows.length; rowIndex++) {
    const absoluteIndex = startIdx + rowIndex;
    const colorIndex = absoluteIndex % 7;
    html += `<tr style="background-color: ${pastelColors[colorIndex]}">`;

    // Exact Excel Row Number (Header is 1, Data starts from 2)
    html += `<td class="sticky-col" style="font-weight:700; text-align:center;">${absoluteIndex + 2}</td>`;

    for (let colIndex = 0; colIndex < maxCols; colIndex++) {
      let cellValue = pageRows[rowIndex][colIndex] !== undefined && pageRows[rowIndex][colIndex] !== null ? String(pageRows[rowIndex][colIndex]) : "";

      // Fix: Use the global currentSheet variable to determine the correct formula context
      if (formulaViewActive) {
        const sheetKey = currentSheet.toUpperCase(); // 'portal' -> 'PORTAL', 'sale' -> 'SALE', 'purchase' -> 'PURCHASE'
        let formulaStr = null;

        if (sheetKey === 'PORTAL') {
          const headerName = headerRow[colIndex] ? String(headerRow[colIndex]) : "";
          const excelRow = absoluteIndex + 2; // data begins on row 2
          if (headerName.startsWith("Portal Key 1")) {
            formulaStr = `=D${excelRow}&C${excelRow}&F${excelRow}&K${excelRow}&N${excelRow}`;
          } else if (headerName.startsWith("Portal Key 2")) {
            formulaStr = `=F${excelRow}&C${excelRow}&K${excelRow}&N${excelRow}`;
          }
        }

        if (!formulaStr) {
          formulaStr = normalizeMojibake(getExcelFormula(sheetKey, colIndex, absoluteIndex + 1));
        }
        if (formulaStr) cellValue = formulaStr;
      }

      // Add "View" button for Purchase sheet at the end of the row (last col or new col)
      if (currentSheet === 'purchase' && colIndex === maxCols - 1) {
        html += `<td>${escapeHTML(cellValue)} <button class="purchase-viewer-btn" data-row="${absoluteIndex + 1}" style="margin-left:5px; cursor:pointer; background:#2ecc71; color:white; border:none; border-radius:3px; padding:2px 5px; font-size:10px;">View</button></td>`;
      } else {
        html += `<td>${escapeHTML(cellValue)}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</table>';
  container.innerHTML = normalizeMojibake(html);
  container.scrollTop = 0;
}

function renderPagination(totalPages) {
  const container = document.getElementById('pageBlocks');
  container.innerHTML = "";

  // Helper to create a block
  const createBlock = (label, page, isActive = false, isDisabled = false) => {
    const div = document.createElement('div');
    div.className = `page-block ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`;
    div.textContent = normalizeMojibake(label);
    if (!isDisabled && !isActive) {
      div.setAttribute('data-page', page);
    }
    return div;
  };

  const createEllipsis = () => {
    const span = document.createElement('span');
    span.className = 'page-ellipsis';
    span.textContent = '...';
    return span;
  };

  // First & Prev
  container.appendChild(createBlock("«", 1, false, currentPage === 1));
  container.appendChild(createBlock("‹", currentPage - 1, false, currentPage === 1));

  // Determine Range
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);

  // First page if not in range
  if (start > 1) {
    container.appendChild(createBlock(1, 1));
    if (start > 2) container.appendChild(createEllipsis());
  }

  // Range
  for (let i = start; i <= end; i++) {
    container.appendChild(createBlock(i, i, i === currentPage));
  }

  // Last page if not in range
  if (end < totalPages) {
    if (end < totalPages - 1) container.appendChild(createEllipsis());
    container.appendChild(createBlock(totalPages, totalPages));
  }

  // Next & Last
  container.appendChild(createBlock("›", currentPage + 1, false, currentPage === totalPages));
  container.appendChild(createBlock("»", totalPages, false, currentPage === totalPages));
}

// Pagination Delegation
document.getElementById('pageBlocks').addEventListener('click', (e) => {
  const block = e.target.closest('.page-block');
  if (block && block.hasAttribute('data-page')) {
    const page = parseInt(block.getAttribute('data-page'));
    currentPage = page;
    renderTable();
  }
});

// JUMP TO PAGE
document.getElementById('jumpPageBtn').onclick = () => {
  const input = document.getElementById('jumpPageInput');
  const val = parseInt(input.value, 10);
  const dataRows = (globalFilteredData.length - 1);
  const totalPages = Math.ceil(dataRows / pageSize);

  if (!isNaN(val) && val >= 1 && val <= totalPages) {
    currentPage = val;
    renderTable();
    input.value = '';
  } else {
    window.showCustomAlert(`Enter a valid page (1-${totalPages})`, "Invalid Page");
  }
};

document.getElementById('jumpPageInput').onkeydown = (e) => {
  if (e.key === 'Enter') document.getElementById('jumpPageBtn').click();
};

// PAGINATION HANDLERS (Cleaned up old ones if they existed)
document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
  pageSize = parseInt(e.target.value, 10);
  currentPage = 1;
  renderTable();
});

// FORMULA TOGGLE
document.getElementById('toggleFormulaBtn').addEventListener('click', function () {
  formulaViewActive = !formulaViewActive;
  this.textContent = formulaViewActive ? "Show Results" : "Show Formulas";
  this.style.backgroundColor = formulaViewActive ? "#27ae60" : "#3498db";
  renderTable();
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
  if (currentSheet === 'portal') {
    if (globalPortalData.length > 0) {
      await syncAllTabs();
      window.showCustomAlert("✅ Portal Data Re-calculated!", "Sync Success");
    } else window.showCustomAlert("No Portal data to refresh.", "Data Missing");
  }
  else if (currentSheet === 'purchase') {
    if (globalPurchaseData.length > 0) {
      await syncAllTabs();
      maxCols = globalPurchaseData[0].length;
      renderTable();
      window.showCustomAlert("✅ Purchase Data Re-calculated!", "Sync Success");
    } else window.showCustomAlert("No Purchase data to refresh.", "Data Missing");
  }
  else if (currentSheet === 'sale') {
    if (globalSaleInvoiceData.length > 0) {
      await syncAllTabs();
      maxCols = globalSaleInvoiceData[0].length;
      renderTable();
      window.showCustomAlert("✅ Sale Data Re-calculated!", "Sync Success");
    } else window.showCustomAlert("No Sale data to refresh.", "Data Missing");
  }
});

document.getElementById('clearDataBtn').addEventListener('click', async () => {
  const confirmed = await window.showCustomConfirm("Are you sure you want to clear AJIO Portal, Sale, and Purchase data? Pending queue transfers will not be deleted.", "Clear All Data", true);
  if (confirmed) {
    await deleteFromDB("portal");
    await deleteFromDB("sale");
    await deleteFromDB("purchase");
    globalPortalData = [];
    globalSaleInvoiceData = [];
    globalPurchaseData = [];
    location.reload();
  }
});

// INVOICE DETAILS MODAL LOGIC
const invoiceModal = document.getElementById('invoiceModal');
let currentModalSaleIdx = 1;
let autoCycleInterval = null;
let invoiceTimer = null;
window.addEventListener('DOMContentLoaded', () => {
  invoiceTimer = new DashboardTimer('ajioInvoiceTimerContainer', 'ajioInvoiceTimerVal', 'ajioInvoiceTimerSpeed', 'ajioInvoiceTimerRemaining');
});

function getAjioSellerName() {
  return String(localStorage.getItem('ajio_purchase_seller_name') || "").trim() || "--";
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function inflateZipEntry(compressedData, compressionMethod) {
  if (compressionMethod === 0) {
    return compressedData;
  }

  if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([compressedData]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

async function readZipEntries(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries = [];

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: End of central directory not found.');
  }

  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let ptr = centralDirectoryOffset;

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error('Invalid ZIP: Central directory entry missing.');
    }

    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLength = view.getUint16(ptr + 28, true);
    const extraFieldLength = view.getUint16(ptr + 30, true);
    const fileCommentLength = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);
    const fileName = decoder.decode(bytes.slice(ptr + 46, ptr + 46 + fileNameLength));
    const isDir = fileName.endsWith('/');

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error('Invalid ZIP: Local file header missing.');
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraFieldLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
    const data = isDir ? new Uint8Array(0) : await inflateZipEntry(compressedData, compressionMethod);

    entries.push({ name: fileName, dir: isDir, data });
    ptr += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

async function renamePdfZipWithSeller(file, sellerName, statusElementId, platformLabel) {
  const statusEl = document.getElementById(statusElementId);
  const setStatus = (message, color = "#64748b") => {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = color;
    }
  };

  if (!file) {
    setStatus("Please choose a ZIP file first.", "#dc2626");
    return;
  }
  if (typeof JSZip === 'undefined') {
    setStatus("ZIP library not loaded.", "#dc2626");
    return;
  }
  if (!sellerName || sellerName === "--") {
    setStatus("Seller name is missing.", "#dc2626");
    return;
  }

  setStatus("Processing ZIP, please wait...", "#2563eb");

  try {
    const zipEntries = await readZipEntries(file);
    const outputZip = new JSZip();
    let renamedCount = 0;
    const sellerSuffixRegex = new RegExp(` ${escapeRegExp(sellerName)}$`, 'i');

    for (const entry of zipEntries) {
      if (entry.dir) {
        outputZip.folder(entry.name);
        continue;
      }

      let targetPath = entry.name;
      if (/\.pdf$/i.test(entry.name)) {
        const parts = entry.name.split('/');
        const originalName = parts.pop();
        const dotIndex = originalName.lastIndexOf('.');
        const baseName = dotIndex >= 0 ? originalName.slice(0, dotIndex) : originalName;
        const extension = dotIndex >= 0 ? originalName.slice(dotIndex) : '';
        const renamedBase = sellerSuffixRegex.test(baseName) ? baseName : `${baseName} ${sellerName}`;
        parts.push(`${renamedBase}${extension}`);
        targetPath = parts.join('/');
        renamedCount++;
      }

      outputZip.file(targetPath, entry.data);
    }

    const blob = await outputZip.generateAsync({ type: 'blob' });
    const partyCode = localStorage.getItem('global_party_code') || "";
    const prefix = partyCode ? `${partyCode}_` : "";
    const downloadName = `${prefix}${platformLabel}_${file.name.replace(/\.zip$/i, '')}_renamed.zip`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    setStatus(`Done. Renamed ${renamedCount} PDF file(s) and downloaded ZIP.`, "#16a34a");
  } catch (error) {
    console.error('ZIP rename failed:', error);
    setStatus("ZIP processing failed. Please try another file.", "#dc2626");
  }
}
document.getElementById('refreshBtn').addEventListener('click', async () => {
  if (currentSheet === 'portal') {
    if (globalPortalData.length > 0) {
      await syncAllTabs();
      window.showCustomSuccess("✅ Portal Data Re-calculated!", "Sync Success");
    } else window.showCustomAlert("No Portal data to refresh.", "Data Missing");
  }
  else if (currentSheet === 'purchase') {
    if (globalPurchaseData.length > 0) {
      await syncAllTabs();
      maxCols = globalPurchaseData[0].length;
      renderTable();
      window.showCustomSuccess("✅ Purchase Data Re-calculated!", "Sync Success");
    } else window.showCustomAlert("No Purchase data to refresh.", "Data Missing");
  }
  else if (currentSheet === 'sale') {
    if (globalSaleInvoiceData.length > 0) {
      await syncAllTabs();
      maxCols = globalSaleInvoiceData[0].length;
      renderTable();
      window.showCustomSuccess("✅ Sale Data Re-calculated!", "Sync Success");
    } else window.showCustomAlert("No Sale data to refresh.", "Data Missing");
  }
});

document.getElementById('clearDataBtn').addEventListener('click', async () => {
  const confirmed = await window.showCustomConfirm("Are you sure you want to clear AJIO Portal, Sale, and Purchase data? Pending queue transfers will not be deleted.", "Clear All Data", true);
  if (confirmed) {
    await deleteFromDB("portal");
    await deleteFromDB("sale");
    await deleteFromDB("purchase");
    globalPortalData = [];
    globalSaleInvoiceData = [];
    globalPurchaseData = [];
    location.reload();
  }
});



function updateAjioModalSellerNames() {
  const sellerName = getAjioSellerName();
  const invoiceSellerEl = document.getElementById('mdlInvoiceSellerName');
  const billSellerEl = document.getElementById('mBillSellerName');
  if (invoiceSellerEl) invoiceSellerEl.textContent = sellerName;
  if (billSellerEl) billSellerEl.textContent = sellerName;
}

function getJumpTarget(inputId, maxRow, fallbackRow) {
  const input = document.getElementById(inputId);
  if (!input) return fallbackRow;
  const rawValue = String(input.value || "").trim();
  if (rawValue === "") return fallbackRow;

  const parsed = Number(rawValue);
  input.value = "";
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxRow) {
    window.showCustomAlert(`Please enter a row number between 1 and ${maxRow}.`, "Invalid Range");
    return null;
  }
  return parsed;
}

// PURCHASE BILL VIEWER FUNCTIONS
function triggerPurchaseViewer(idx) {
  if (!globalPurchaseData || globalPurchaseData.length <= 1) {
    window.showCustomAlert("No Purchase Bill data loaded.", "Data Missing");
    return;
  }
  if (idx === undefined) idx = currentPurchaseIdx;
  if (idx < 1) idx = 1;
  if (idx >= globalPurchaseData.length) idx = globalPurchaseData.length - 1;

  currentPurchaseIdx = idx;
  const modal = document.getElementById('purchaseModal');
  if (modal) modal.style.display = 'flex';
  if (window.billTimer) {
    window.billTimer.reset();
    window.billTimer.updateProgress(idx);
  }
  // FUNCTIONS MOVED TO ajio_modal.js
}

async function openInvoiceModal() {
  if (!globalSaleInvoiceData || globalSaleInvoiceData.length <= 1) {
    window.showCustomAlert("No Sale Invoice data loaded to show details.", "Data Missing");
    return;
  }
  invoiceModal.style.display = 'flex';
  updateAjioModalSellerNames();
  // FUNCTIONS MOVED TO ajio_modal.js
  if (invoiceTimer) {
    invoiceTimer.reset();
    invoiceTimer.updateProgress(currentModalSaleIdx);
  }
}


function closeInvoiceModal() {
  invoiceModal.style.display = 'none';
  if (autoCycleInterval) {
    clearInterval(autoCycleInterval);
    autoCycleInterval = null;
  }
  if (invoiceTimer) {
    invoiceTimer.stop();
  }
}

// Missing constants
let idxBA = 52;

// INITIALIZATION


// Create and add the buttons to the toolbar
window.addEventListener('load', () => {
  // Show User Nickname
  if (typeof displayUserNickname === 'function') {
    displayUserNickname('userNicknameContainer');
  }

  // Attach listeners to hardcoded header buttons
  const invDetailsBtn = document.getElementById('invoiceDetailsBtnHeader');
  const bDetailsBtn = document.getElementById('billDetailsBtnHeader');

  if (invDetailsBtn) invDetailsBtn.addEventListener('click', openInvoiceModal);
  if (bDetailsBtn) bDetailsBtn.addEventListener('click', () => triggerPurchaseViewer());

  // Upload Modal Logic
  const uploadModal = document.getElementById('uploadModal');
  const openUploadBtn = document.getElementById('openUploadModalBtn');
  const closeUploadBtn = document.getElementById('closeUploadModalBtn');
  const closeUploadXBtn = document.getElementById('closeUploadModalX');

  // Insights
  const insightsBtn = document.getElementById('insightsBtnHeader');
  const insightsBackBtn = document.getElementById('insightsBackBtn');
  const insightsRefreshBtn = document.getElementById('insightsRefreshBtn');
  if (insightsBtn) {
    insightsBtn.onclick = async () => {
      showInsightsView();
      await loadInsights();
    };
  }
  if (insightsBackBtn) insightsBackBtn.onclick = hideInsightsView;
  if (insightsRefreshBtn) insightsRefreshBtn.onclick = loadInsights;

  // Add User Tab Toggle Listeners
  const tabGlobalBtn = document.getElementById('insTabGlobalBtn');
  const tabUserBtn = document.getElementById('insTabUserBtn');
  if (tabGlobalBtn) tabGlobalBtn.onclick = () => switchInsightsTab('global');
  if (tabUserBtn) tabUserBtn.onclick = () => switchInsightsTab('user');

  if (openUploadBtn) {
    openUploadBtn.onclick = () => {
      if (uploadModal) uploadModal.style.display = 'flex';
    };
  }
  if (closeUploadBtn) {
    closeUploadBtn.onclick = () => {
      if (uploadModal) uploadModal.style.display = 'none';
    };
  }
  if (closeUploadXBtn) {
    closeUploadXBtn.onclick = () => {
      if (uploadModal) uploadModal.style.display = 'none';
    };
  }

  window.addEventListener('click', (event) => {
    if (event.target == uploadModal) uploadModal.style.display = 'none';
  });

  // 3. API Tracker Logic
  const apiDisplay = document.getElementById('apiCountDisplay');
  const apiContainer = document.getElementById('apiTrackerHeader');

  if (apiContainer) {
    apiContainer.onclick = async () => {
      // Costs 1 global credit and force reveals from Google Sheet
      await window.consumeGlobalApiCredit();
      await window.syncApiDisplay('apiCountDisplay', true);
    };
  }

  window.addEventListener('resize', () => {
    if (!insightsVisible || !insightsLastData) return;
    if (insightsResizeTimer) clearTimeout(insightsResizeTimer);
    insightsResizeTimer = setTimeout(() => {
      renderInsightsFromPayload(insightsLastData.payload, insightsLastData.requestedLimit);
    }, 150);
  });
});

// MODAL INTERACTION LISTENERS
document.addEventListener('DOMContentLoaded', () => {
  // Existing elements already handled in main init
});

// We attach these to the document or window if they might be dynamically rendered, 
// but since they are in a static modal, we can just attach them.
window.addEventListener('load', () => {
  const autoBtn = document.getElementById('modalAutoBtn');
  const stopBtn = document.getElementById('modalStopBtn');
  const nextBtn = document.getElementById('modalNextBtn');
  const restartBtn = document.getElementById('modalRestartBtn');
  const closeBtn = document.getElementById('modalCloseBtn');
  const jumpInput = document.getElementById('mdlInvoiceJumpInput');
  const zipBtn = document.getElementById('ajioInvoiceZipBtn');
  const zipInput = document.getElementById('ajioInvoiceZipInput');

  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      if (autoCycleInterval) return;
      if (invoiceTimer) {
        invoiceTimer.start(currentModalSaleIdx, globalSaleInvoiceData.length);
      }
      autoCycleInterval = setInterval(() => {
        let nextIdx = currentModalSaleIdx + 1;

        if (nextIdx < globalSaleInvoiceData.length) {
          currentModalSaleIdx = nextIdx;
          // --- NEW: STRONG AUTO-STOP ON MISMATCH ---
          const isMatch = updateInvoiceModalData(currentModalSaleIdx);
          if (invoiceTimer) {
            invoiceTimer.updateProgress(currentModalSaleIdx);
          }
          if (!isMatch) {
            clearInterval(autoCycleInterval);
            autoCycleInterval = null;
            autoBtn.style.opacity = '1';
            if (invoiceTimer) {
              invoiceTimer.stop();
            }
          }
        } else {
          // STOP AT END
          clearInterval(autoCycleInterval);
          autoCycleInterval = null;
          autoBtn.style.opacity = '1';
          if (invoiceTimer) {
            invoiceTimer.stop();
          }
          window.showCustomSuccess("Auto-check complete for all invoices!", "Success ✓");
        }
      }, 100); // Turbo Mode: 0.1 seconds
      autoBtn.style.opacity = '0.5';
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (autoCycleInterval) {
        clearInterval(autoCycleInterval);
        autoCycleInterval = null;
        document.getElementById('modalAutoBtn').style.opacity = '1';
      }
      if (invoiceTimer) {
        invoiceTimer.stop();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentModalSaleIdx < globalSaleInvoiceData.length - 1) {
        currentModalSaleIdx++;
        updateInvoiceModalData(currentModalSaleIdx);
      } else {
        currentModalSaleIdx = 1;
        updateInvoiceModalData(currentModalSaleIdx);
      }
      if (invoiceTimer) {
        invoiceTimer.updateProgress(currentModalSaleIdx);
      }
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      currentModalSaleIdx = 1;
      updateInvoiceModalData(currentModalSaleIdx);
      if (invoiceTimer) {
        invoiceTimer.reset();
        invoiceTimer.updateProgress(currentModalSaleIdx);
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeInvoiceModal);
  }

  if (jumpInput) {
    jumpInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val >= 1 && val < globalSaleInvoiceData.length) {
        currentModalSaleIdx = val;
        updateInvoiceModalData(currentModalSaleIdx);
        if (invoiceTimer) {
          invoiceTimer.updateProgress(currentModalSaleIdx);
        }
      }
    });
  }

  if (zipBtn && zipInput) {
    zipBtn.addEventListener('click', () => {
      const file = zipInput.files[0];
      if (!file) {
        window.showCustomAlert("Please select a ZIP file first.", "No File Selected");
        return;
      }
      const seller = document.getElementById('mdlInvoiceSellerName').textContent;
      renamePdfZipWithSeller(file, seller, 'ajioInvoiceZipStatus', 'ajio_invoice');
    });
  }
  // --- PURCHASE MODAL LISTENERS ---
  const btnNextBill = document.getElementById('btnNextBill');
  const btnPrevBill = document.getElementById('btnPrevBill');
  const btnRestartBill = document.getElementById('btnRestartBill');
  const btnAutoBill = document.getElementById('btnAutoBill');
  const btnStopBill = document.getElementById('btnStopBill');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const mBillJumpInput = document.getElementById('mBillJumpInput');
  const ajioBillZipBtn = document.getElementById('ajioBillZipBtn');
  const ajioBillZipInput = document.getElementById('ajioBillZipInput');

  if (btnNextBill) {
    btnNextBill.addEventListener('click', () => {
      if (currentPurchaseIdx < globalPurchaseData.length - 1) {
        currentPurchaseIdx++;
        updatePurchaseModalData(currentPurchaseIdx);
      }
    });
  }
  if (btnPrevBill) {
    btnPrevBill.addEventListener('click', () => {
      if (currentPurchaseIdx > 1) {
        currentPurchaseIdx--;
        updatePurchaseModalData(currentPurchaseIdx);
      }
    });
  }
  if (btnRestartBill) {
    btnRestartBill.addEventListener('click', () => {
      currentPurchaseIdx = 1;
      updatePurchaseModalData(currentPurchaseIdx);
    });
  }
  if (btnAutoBill) {
    btnAutoBill.addEventListener('click', () => {
      if (purchaseAutoInterval) return;
      btnAutoBill.style.opacity = '0.5';
      purchaseAutoInterval = setInterval(() => {
        let next = currentPurchaseIdx + 1;
        if (next < globalPurchaseData.length) {
          currentPurchaseIdx = next;
          const isOk = updatePurchaseModalData(currentPurchaseIdx);
          if (!isOk) {
            clearInterval(purchaseAutoInterval);
            purchaseAutoInterval = null;
            btnAutoBill.style.opacity = '1';
          }
        } else {
          clearInterval(purchaseAutoInterval);
          purchaseAutoInterval = null;
          btnAutoBill.style.opacity = '1';
          window.showCustomSuccess("Purchase checking complete!", "Success");
        }
      }, 100);
    });
  }
  if (btnStopBill) {
    btnStopBill.addEventListener('click', () => {
      if (purchaseAutoInterval) {
        clearInterval(purchaseAutoInterval);
        purchaseAutoInterval = null;
        document.getElementById('btnAutoBill').style.opacity = '1';
      }
    });
  }
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      document.getElementById('purchaseModal').style.display = 'none';
      if (purchaseAutoInterval) {
        clearInterval(purchaseAutoInterval);
        purchaseAutoInterval = null;
        document.getElementById('btnAutoBill').style.opacity = '1';
      }
    });
  }
  if (mBillJumpInput) {
    mBillJumpInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val >= 1 && val < globalPurchaseData.length) {
        currentPurchaseIdx = val;
        updatePurchaseModalData(currentPurchaseIdx);
      }
    });
  }
  if (ajioBillZipBtn && ajioBillZipInput) {
    ajioBillZipBtn.addEventListener('click', () => {
      const file = ajioBillZipInput.files[0];
      if (!file) {
        window.showCustomAlert("Please select a ZIP file.", "No File");
        return;
      }
      const seller = getAjioSellerName();
      renamePdfZipWithSeller(file, seller, 'ajioBillZipStatus', 'ajio_bill');
    });
  }
});

// TAB SWITCHING LOGIC
document.getElementById('tabPortalBtn').addEventListener('click', () => {
  if (insightsVisible) hideInsightsView();
  currentSheet = 'portal';
  document.getElementById('tabPortalBtn').classList.add('active');
  document.getElementById('tabSaleBtn').classList.remove('active');
  document.getElementById('tabPurchaseBtn').classList.remove('active');

  const badge = document.getElementById('purchaseSellerBadge');
  if (badge) badge.style.display = 'none';

  // Show Party Code Badge if data exists
  const partyCode = localStorage.getItem('global_party_code');
  const pBadge = document.getElementById('partyCodeBadge');
  const pValue = document.getElementById('partyCodeValue');
  if (pBadge && pValue && partyCode) {
    pValue.textContent = partyCode;
    pBadge.style.display = 'block';
  }

  runFilterLogic();
});


document.getElementById('tabSaleBtn').addEventListener('click', () => {
  if (insightsVisible) hideInsightsView();
  currentSheet = 'sale';
  document.getElementById('tabSaleBtn').classList.add('active');
  document.getElementById('tabPortalBtn').classList.remove('active');
  document.getElementById('tabPurchaseBtn').classList.remove('active');

  const badge = document.getElementById('purchaseSellerBadge');
  if (badge) badge.style.display = 'none';
  const pBadge = document.getElementById('partyCodeBadge');
  if (pBadge) pBadge.style.display = 'none';

  runFilterLogic();
});


document.getElementById('tabPurchaseBtn').addEventListener('click', () => {
  if (insightsVisible) hideInsightsView();
  currentSheet = 'purchase';
  document.getElementById('tabPurchaseBtn').classList.add('active');
  document.getElementById('tabPortalBtn').classList.remove('active');
  document.getElementById('tabSaleBtn').classList.remove('active');

  // Show Seller Badge if data exists
  const sellerName = localStorage.getItem('ajio_purchase_seller_name');
  const badge = document.getElementById('purchaseSellerBadge');
  const nameSpan = document.getElementById('purchaseSellerName');
  if (badge && nameSpan && sellerName) {
    nameSpan.textContent = sellerName;
    badge.style.display = 'block';
  }

  const pBadge = document.getElementById('partyCodeBadge');
  if (pBadge) pBadge.style.display = 'none';

  runFilterLogic();
});


document.getElementById('tabQueueBtn').addEventListener('click', () => {
  if (insightsVisible) hideInsightsView();
  currentSheet = 'queue';
  document.getElementById('tabQueueBtn').classList.add('active');
  document.getElementById('tabPortalBtn').classList.remove('active');
  document.getElementById('tabSaleBtn').classList.remove('active');
  document.getElementById('tabPurchaseBtn').classList.remove('active');

  globalFilteredData = [];
  updateQueueUI();
  
  const pBadge = document.getElementById('partyCodeBadge');
  if (pBadge) pBadge.style.display = 'none';
  const sBadge = document.getElementById('purchaseSellerBadge');
  if (sBadge) sBadge.style.display = 'none';

  renderTable();
});

// Event Delegation for Table/Header Buttons
document.addEventListener('click', (e) => {
  // Filter Triggers
  if (e.target.classList.contains('filter-trigger')) {
    e.stopPropagation();
    const colIndex = parseInt(e.target.getAttribute('data-col'));
    window.showFilterMenu(colIndex, e.target);
  }
  // Purchase Viewer Buttons
  if (e.target.classList.contains('purchase-viewer-btn')) {
    const rowIndex = parseInt(e.target.getAttribute('data-row'));
    if (typeof window.triggerPurchaseViewer === 'function') {
      window.triggerPurchaseViewer(rowIndex);
    }
  }
});


// --- COLUMN FILTERING LOGIC ---
let activeFilterMenu = null;

window.showFilterMenu = function (colIndex, el) {
  if (activeFilterMenu) {
    document.body.removeChild(activeFilterMenu);
    activeFilterMenu = null;
  }

  const sheetKey = currentSheet;
  const filters = globalFilters[sheetKey] || {};

  // To match Excel behavior: shown unique values should be based on data already filtered 
  // by OTHER columns. (If we filter by this column too, we can't select other values easily).
  let filteredForMenu = [];
  if (sheetKey === 'portal') filteredForMenu = globalPortalData.slice(1);
  else if (sheetKey === 'sale') filteredForMenu = globalSaleInvoiceData.slice(1);
  else if (sheetKey === 'purchase') filteredForMenu = globalPurchaseData.slice(1);

  // Apply all filters EXCEPT the current column to find what values are "available"
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
    const val = String(row[colIndex] || "").trim();
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

window.filterOptionsSubList = function (input) {
  const filter = input.value.toLowerCase();
  const options = activeFilterMenu.querySelectorAll('.options-container .filter-option');
  options.forEach(opt => {
    const text = opt.textContent.toLowerCase();
    opt.style.display = text.includes(filter) ? 'flex' : 'none';
  });
};

window.toggleFilterSelectAll = function (cb) {
  const options = activeFilterMenu.querySelectorAll('.opt-cb');
  options.forEach(opt => opt.checked = cb.checked);
};

window.clearColumnFilter = function (colIndex) {
  if (globalFilters[currentSheet]) {
    delete globalFilters[currentSheet][colIndex];
  }
  if (activeFilterMenu) {
    document.body.removeChild(activeFilterMenu);
    activeFilterMenu = null;
  }
  runFilterLogic();
};

window.applyColFilter = function (colIndex) {
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

window.sortColumn = function (colIndex, order) {
  currentSortedCol = { index: colIndex, order: order };
  if (activeFilterMenu) {
    document.body.removeChild(activeFilterMenu);
    activeFilterMenu = null;
  }
  runFilterLogic();
};

window.runFilterLogic = function () {
  const sheetKey = currentSheet;
  let baseData = [];
  if (sheetKey === 'portal') {
    baseData = globalPortalData;
    maxCols = globalPortalMaxCols;
  } else if (sheetKey === 'sale') {
    baseData = globalSaleInvoiceData;
    maxCols = baseData && baseData.length > 0 ? baseData[0].length : 0;
  } else if (sheetKey === 'purchase') {
    baseData = globalPurchaseData;
    maxCols = baseData && baseData.length > 0 ? baseData[0].length : 0;
  }

  if (!baseData || baseData.length <= 1) {
    globalFilteredData = baseData || [];
    renderTable();
    return;
  }

  const header = baseData[0];
  let filtered = baseData.slice(1);

  const filters = globalFilters[sheetKey] || {};
  for (const [idxStr, selected] of Object.entries(filters)) {
    const idx = parseInt(idxStr);
    filtered = filtered.filter(row => {
      const rowVal = String(row[idx] || "").trim();
      return selected.includes(rowVal);
    });
  }

  // Integrate Global Search into Filter Logic
  const searchInputDoc = document.getElementById('searchFInput');
  const searchQuery = searchInputDoc ? searchInputDoc.value.toLowerCase().trim() : "";
  if (searchQuery !== "") {
    // Specifically GST ID Search (Col F) for AJIO as per existing logic, or Generic?
    // User mentioned "Search GST ID (Col F)" in HTML.
    filtered = filtered.filter(row => {
      const gstVal = String(row[5] || "").toLowerCase();
      return gstVal.includes(searchQuery);
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

if (typeof escapeHTML !== 'function') {
  window.escapeHTML = function (str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };
}

function startQueueWorker() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: 'startSync', platform: 'AJIO' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Background worker notification failed (Service Worker might be sleeping):", chrome.runtime.lastError.message);
      } else {
        console.log("Background sync triggered for AJIO:", response ? response.status : "No response");
      }
    });
  }
}
