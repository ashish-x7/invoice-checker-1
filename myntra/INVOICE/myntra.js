/* global normalizeMojibake */
// Myntra Dashboard Core Logic
if (typeof window.displayUserNickname === 'function') {
    window.displayUserNickname('userNicknameContainer');
}


let globalPortalData = [];
let globalSaleData = [];
let globalPurchaseData = [];
let globalFilteredData = [];

let currentSheet = 'portal';
let currentPage = 1;
let pageSize = 50;
let formulaViewActive = false;
let saleMapByC = new Map(); // Crucial for Invoice Checker
let portalMapByCS = new Map(); // Reverse lookup for Sale-based Audit

// --- INSIGHTS (Google Sheet read + charts) ---
const INSIGHTS_SHEET_NAME = "MYNTRA";
const INSIGHTS_MAX_ROWS = 7000;
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
    const subtitle = document.getElementById('insightsSubtitle');

    if (kpiRows) kpiRows.textContent = String(totals.rows || 0);
    if (kpiRowsHint) kpiRowsHint.textContent = "Loaded: " + String(payload.maxRowsUsed || 0) + " / " + String(requestedLimit);

    if (window.InsightsCharts && kpiSale) kpiSale.textContent = window.InsightsCharts.formatINR(totals.sale || 0);
    if (window.InsightsCharts && kpiPurchase) kpiPurchase.textContent = window.InsightsCharts.formatINR(totals.purchase || 0);

    const kpiAllClear = document.getElementById('kpiAllClear');

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
            line: "#ff3f6c",
            fillTop: "rgba(255, 63, 108, 0.22)",
            fillBottom: "rgba(255, 63, 108, 0.03)"
        });
    }

    if (window.InsightsCharts && barCanvas) {
        window.InsightsCharts.drawBarChart(barCanvas, [
            { label: "SALE", value: totals.sale || 0 },
            { label: "PURCHASE", value: totals.purchase || 0 }
        ], {
            barTop: "rgba(17, 24, 39, 0.92)",
            barBottom: "rgba(17, 24, 39, 0.40)"
        });
    }

    if (window.InsightsCharts && pieCanvas) {
        window.InsightsCharts.drawPieChart(pieCanvas, remarks || [], {
            colors: ["#ff3f6c", "#0ea5e9", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6", "#64748b"]
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
            const colors = ["#ff3f6c", "#ff527b", "#ff668a", "#ff7a99", "#ff8ea8"]; // Myntra Pink hues
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
            colors: ["#ff3f6c", "#ec4899", "#d946ef", "#a855f7", "#8b5cf6", "#6366f1", "#4f46e5", "#64748b"]
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
            <div class="vendor-item" style="${isActive ? 'background: #fff0f3; border-color: #ff3f6c;' : ''}" onclick="applyVendorDeepDive('${v.label.replace(/'/g, "\\'")}')">
                <div class="v-rank">${i + 1}</div>
                <div class="v-info">
                   <div class="v-name" title="${v.label}">${v.label}</div>
                   <div class="v-stats">${v.rows} Invoices • Avg: ₹${window.InsightsCharts.formatINR(avg)}</div>
                   <div class="v-bar-wrap">
                      <div class="v-bar-fill" style="width: ${percent}%; background: #ff3f6c;"></div>
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
        platformStatsCont.innerHTML = userStats.sort((a,b) => b.totalRows - a.totalRows).slice(0, 5).map(u => {
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

    // New: Handle User/Global Insights Tab Toggles
    const tabGlobalBtn = document.getElementById('insTabGlobalBtn');
    const tabUserBtn = document.getElementById('insTabUserBtn');
    if (tabGlobalBtn) tabGlobalBtn.onclick = () => switchInsightsTab('global');
    if (tabUserBtn) tabUserBtn.onclick = () => switchInsightsTab('user');
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
        console.error("Myntra Insights Parse Error:", e, raw);
        setInsightsStatus("Error: Failed to parse insights data. Please check connection.", "error");
    }
}

function escapeZipNameRegExp(text) {
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
        const sellerSuffixRegex = new RegExp(` ${escapeZipNameRegExp(sellerName)}$`, 'i');

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

// --- COLUMN FILTERING STATE ---
let globalFilters = { portal: {}, sale: {}, purchase: {}, queue: {} };
let currentSortedCol = { index: -1, order: 'none' }; // { index, order: 'asc'|'desc' }

// --- QUEUE SYSTEM SYNC ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'syncUpdate' && msg.platform === 'MYNTRA') {
        updateQueueUI();
    }
});

async function updateQueueUI(forcedCount) {
    const container = document.getElementById('queueContainer');
    const pendingText = document.getElementById('queuePendingCount');
    const statusText = document.getElementById('queueWorkerStatus');
    const progressBar = document.getElementById('queueProgressBar');

    if (!container || !pendingText) return;

    const storageKey = 'pushQueue_MYNTRA';
    const res = await chrome.storage.local.get([storageKey]);
    const myntraQueue = res[storageKey] || [];
    const count = myntraQueue.length;

    pendingText.textContent = count;
    container.style.display = (count > 0 || currentSheet === 'queue') ? 'block' : 'none';

    if (count > 0) {
        statusText.textContent = "Processing Myntra Sync... 🚀";
        statusText.style.color = "#3498db";
        progressBar.style.width = "40%";
    } else {
        statusText.textContent = "Myntra All Synced ✅";
        statusText.style.color = "#27ae60";
        progressBar.style.width = "0%";
    }

    if (statusText) statusText.textContent = normalizeMojibake(statusText.textContent);

    if (typeof window.updateGlobalQueueBadge === 'function') {
        window.updateGlobalQueueBadge(count);
    }
}

// --- INITIALIZATION ---
function setupEventListeners() {
    // Tab switching
    document.getElementById('tabPortalBtn').onclick = () => switchTab('portal');
    document.getElementById('tabSaleBtn').onclick = () => switchTab('sale');
    document.getElementById('tabPurchaseBtn').onclick = () => switchTab('purchase');
    document.getElementById('tabQueueBtn').onclick = () => switchTab('queue');

    // Clear Queue Button
    document.getElementById('clearQueueBtn').addEventListener('click', async () => {
        const confirmed = await window.showCustomConfirm("Clear pending MYNTRA transfers only?", "Clear Myntra Queue", true);
        if (confirmed) {
            await chrome.storage.local.set({ ['pushQueue_MYNTRA']: [] });
            updateQueueUI();
        }
    });

    // Modals
    const modal = document.getElementById('uploadModal');
    const checkerModal = document.getElementById('invoiceCheckerModal');
    const billModal = document.getElementById('purchaseBillModal');

    document.getElementById('openUploadModalBtn').onclick = () => modal.style.display = 'flex';
    document.getElementById('closeUploadModalBtn').onclick = () => modal.style.display = 'none';
    document.getElementById('footerCloseModalBtn').onclick = () => modal.style.display = 'none';

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

    window.addEventListener('resize', () => {
        if (!insightsVisible || !insightsLastData) return;
        if (insightsResizeTimer) clearTimeout(insightsResizeTimer);
        insightsResizeTimer = setTimeout(() => {
            renderInsightsFromPayload(insightsLastData.payload, insightsLastData.requestedLimit);
        }, 150);
    });

    // Invoice Details
    const openInvoiceDetails = async () => {
        if (globalSaleData.length <= 1) {
            window.showCustomAlert("Please upload Sale data first!", "Data Missing");
            return;
        }
        checkerModal.style.display = 'flex';
        updateCheckerUI(1);
    };
    document.getElementById('invoiceDetailsBtnHeader').onclick = openInvoiceDetails;

    // Bill Details
    const openBillDetails = async () => {
        if (globalPurchaseData.length <= 1) {
            window.showCustomAlert("Please upload Purchase data first!", "Data Missing");
            return;
        }
        billModal.style.display = 'flex';
        updatePurchaseUI(1);
    };
    document.getElementById('billDetailsBtnHeader').onclick = openBillDetails;
    document.getElementById('billDetailsBtnAction').onclick = openBillDetails;

    // Search Input
    document.getElementById('searchInput').oninput = applySearchFilter;

    // API Tracker
    document.getElementById('apiTrackerHeader').onclick = async () => {
        await window.consumeGlobalApiCredit();
        await window.syncApiDisplay('apiCountDisplay', true);
    };

    const getMyntraJumpTarget = (inputId, maxRow, fallbackRow) => {
        const input = document.getElementById(inputId);
        if (!input) return fallbackRow;
        const rawValue = String(input.value || "").trim();
        if (rawValue === "") return fallbackRow;

        const parsed = Number(rawValue);
        input.value = "";
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxRow) {
            window.showCustomAlert(`Please enter a row number between 1 and ${maxRow}.`, "Invalid Row");
            return null;
        }
        return parsed;
    };

    // --- INVOICE CHECKER LISTENERS ---
    document.getElementById('checkerNextBtn').onclick = () => {
        const targetRow = getMyntraJumpTarget('fieldInvJumpInput', globalSaleData.length - 1, currentCheckerRow + 1);
        if (targetRow === null) return;
        if (targetRow < globalSaleData.length) {
            updateCheckerUI(targetRow);
        } else {
            window.showCustomAlert("Reached the end of the list!", "Pagination");
            checkerStop();
        }
    };

    document.getElementById('checkerAutoBtn').onclick = () => {
        if (autoInterval) return;
        document.getElementById('checkerAutoBtn').style.background = "#ffeb3b";
        if (window.myntraInvoiceTimer) {
            window.myntraInvoiceTimer.start(currentCheckerRow, globalSaleData.length);
        }
        autoInterval = setInterval(() => {
            let nextRow = currentCheckerRow + 1;
            if (nextRow < globalSaleData.length) {
                const stoppedWithError = updateCheckerUI(nextRow);
                if (stoppedWithError) checkerStop();
            } else {
                checkerStop();
                window.showCustomSuccess("Auto-check complete!", "Success ✓");
            }
        }, 100);
    };

    document.getElementById('checkerStopBtn').onclick = checkerStop;
    document.getElementById('checkerRestartBtn').onclick = () => {
        checkerStop();
        updateCheckerUI(1);
        if (window.myntraInvoiceTimer) {
            window.myntraInvoiceTimer.reset();
            window.myntraInvoiceTimer.updateProgress(1);
        }
    };

    const closeChecker = () => {
        checkerStop();
        document.getElementById('invoiceCheckerModal').style.display = 'none';
        if (window.myntraInvoiceTimer) {
            window.myntraInvoiceTimer.stop();
        }
    };
    document.getElementById('closeCheckerBtn').onclick = closeChecker;
    document.getElementById('checkerCloseBtnPrimary').onclick = closeChecker;

    const closeBillDetails = () => {
        purchaseStop();
        if (billModal) billModal.style.display = 'none';
        if (window.myntraBillTimer) {
            window.myntraBillTimer.stop();
        }
    };
    const closePurBtn = document.getElementById('closePurBtn');
    const purCloseBtn = document.getElementById('purCloseBtn');
    if (closePurBtn) closePurBtn.onclick = closeBillDetails;
    if (purCloseBtn) purCloseBtn.onclick = closeBillDetails;

    document.getElementById('checkerLogo').onerror = function () {
        this.src = 'https://via.placeholder.com/80?text=BC';
    };

    // Global click to close modals
    window.onclick = (e) => {
        if (e.target == modal) modal.style.display = 'none';
        if (e.target == checkerModal) closeChecker();
        if (e.target == billModal) closeBillDetails();
        if (activeFilterMenu && !activeFilterMenu.contains(e.target)) {
            closeFilterMenu();
        }
    };

    // Pagination & Page Size
    document.getElementById('pageSizeSelect').onchange = (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        renderTable();
    };

    document.getElementById('jumpPageBtn').onclick = () => {
        const input = document.getElementById('jumpPageInput');
        const val = parseInt(input.value);
        const totalPages = Math.ceil((globalFilteredData.length - 1) / pageSize);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
            currentPage = val;
            renderTable();
            input.value = '';
        }
    };

    document.getElementById('jumpPageInput').onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('jumpPageBtn').click();
    };

    // Formula Toggle
    document.getElementById('toggleFormulaBtn').addEventListener('click', function () {
        formulaViewActive = !formulaViewActive;
        this.textContent = formulaViewActive ? "Show Results" : "Show Formulas";
        this.style.backgroundColor = formulaViewActive ? "#27ae60" : "#34495e";
        renderTable();
    });

    // Actions
    document.getElementById('clearDataBtn').onclick = clearAllData;
    document.getElementById('sendToGoogleSheetBtn').onclick = pushDetailsToGoogleSheet;

    if (document.getElementById('refreshBtn')) {
        document.getElementById('refreshBtn').onclick = async () => {
            if (globalPortalData.length > 0) {
                console.log("Manual Refreshing Formulas...");
                await refreshFormulaSync();
            } else {
                window.showCustomAlert("No data to refresh!", "Data Missing");
            }
        };
    }
}

async function refreshFormulaSync() {
    await triggerFullDashboardRefresh();
    window.showCustomSuccess("✅ Formulas refreshed successfully!", "Refresh Complete");
}

async function triggerFullDashboardRefresh() {
    console.log("Auto-triggering full dashboard refresh...");
    if (typeof syncPortalSaleMatch === 'function') await syncPortalSaleMatch();
    if (typeof syncPurchasePortalMatch === 'function') await syncPurchasePortalMatch();
    if (typeof syncPortalPurchaseMatch === 'function') await syncPortalPurchaseMatch();
    if (typeof syncSalePurchaseMatch === 'function') await syncSalePurchaseMatch();

    await saveToDB("portal", globalPortalData);
    await saveToDB("sale", globalSaleData);
    await saveToDB("purchase", globalPurchaseData);
    if (typeof refreshView === 'function') refreshView();
}

/**
 * Updates Portal columns that depend on Purchase data.
 */
async function syncPortalPurchaseMatch() {
    if (!globalPortalData || globalPortalData.length <= 1 || !globalPurchaseData || globalPurchaseData.length <= 1) return;

    const purMapByU = new Map();
    for (let j = 1; j < globalPurchaseData.length; j++) {
        const u = String(globalPurchaseData[j][20] || "").trim();
        if (u) purMapByU.set(u, globalPurchaseData[j]);
    }

    const saleMapByT = new Map();
    for (let j = 1; j < globalSaleData.length; j++) {
        const t = String(globalSaleData[j][19] || "").trim();
        if (t) saleMapByT.set(t, globalSaleData[j]);
    }

    for (let i = 1; i < globalPortalData.length; i++) {
        if (globalPurchaseData[i]) {
            globalPortalData[i][59] = String(globalPurchaseData[i][20] || "").trim(); 
        }

        const keyBH = String(globalPortalData[i][59] || "").trim();
        if (!keyBH) continue;

        const purRow = purMapByU.get(keyBH);
        const saleRow = saleMapByT.get(keyBH);

        globalPortalData[i][60] = purRow ? purRow[30] : "";
        globalPortalData[i][61] = saleRow ? saleRow[21] : "";
        globalPortalData[i][62] = purRow ? purRow[22] : "";

        const bjMatch = parseFloat(globalPortalData[i][61]) || 0;
        const bkMatch = parseFloat(globalPortalData[i][62]) || 0;
        const diffRate = (globalPortalData[i][61] === "" && globalPortalData[i][62] === "") ? "" : (bjMatch - bkMatch).toFixed(2);
        globalPortalData[i][63] = diffRate;

        if (diffRate !== "") {
            globalPortalData[i][64] = parseFloat(diffRate) > 0 ? "TRUE ✅ " : "FALSE ❌ ";
        } else {
            globalPortalData[i][64] = "";
        }
    }
}

async function syncSalePurchaseMatch() {
    if (!globalSaleData || globalSaleData.length <= 1 || !globalPurchaseData || globalPurchaseData.length <= 1) return;

    const purMapByBD = new Map();
    for (let j = 1; j < globalPurchaseData.length; j++) {
        const bd = String(globalPurchaseData[j][55] || "").trim();
        if (bd) purMapByBD.set(bd, globalPurchaseData[j]);
    }

    for (let i = 1; i < globalSaleData.length; i++) {
        const keyBY = String(globalSaleData[i][76] || "").trim();
        if (!keyBY) continue;

        const purRow = purMapByBD.get(keyBY);
        if (purRow) {
            globalSaleData[i][85] = String(purRow[58] || "").trim();
            globalSaleData[i][86] = String(purRow[59] || "").trim();
            globalSaleData[i][87] = String(purRow[60] || "").trim();
        } else {
            globalSaleData[i][85] = "";
            globalSaleData[i][86] = "";
            globalSaleData[i][87] = "";
        }
    }
}

// --- DATABASE LOGIC (IndexedDB) ---
const DB_NAME = "MyntraDashboardDB";
const STORE_NAME = "sheets";

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveToDB(id, data) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({ id, data });
        return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
    } catch (err) { console.error("Save error:", err); }
}
window.saveToDB = saveToDB;

async function getFromDB(id) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        return new Promise((resolve) => { request.onsuccess = (e) => resolve(e.target.result ? e.target.result.data : null); });
    } catch (err) { console.error("Load error:", err); return null; }
}

async function deleteFromDB(id) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
    } catch (err) { console.error("Delete error:", err); }
}

async function clearAllData() {
    const confirmed = await window.showCustomConfirm("Are you sure you want to clear Myntra Portal, Sale, and Purchase data? Pending queue transfers will not be deleted.", "Clear All Data", true);
    if (!confirmed) return;
    try {
        await deleteFromDB("portal");
        await deleteFromDB("sale");
        await deleteFromDB("purchase");
        globalPortalData = [];
        globalSaleData = [];
        globalPurchaseData = [];
        refreshView();
        await window.showCustomSuccess("Data cleared successfully.", "Success");
        location.reload();
    } catch (err) { console.error("Clear error:", err); }
}

window.addEventListener('load', async () => {
    if (typeof window.displayUserNickname === 'function') {
        window.displayUserNickname('userNicknameContainer');
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['nickname', 'session'], (res) => {
            const nick = res.nickname || (res.session && res.session.nickName);
            if (nick) localStorage.setItem('nickname', nick);
        });
    }

    setupEventListeners();
    updateLocalApiDisplay();

    const pData = await getFromDB("portal");
    const sData = await getFromDB("sale");
    const purData = await getFromDB("purchase");
    if (pData) globalPortalData = pData;
    if (sData) globalSaleData = sData;
    if (purData) globalPurchaseData = purData;

    startQueueWorker();

    if (globalPortalData.length > 0) {
        console.log("Auto-Syncing data on load...");
        if (typeof syncPortalSaleMatch === 'function') await syncPortalSaleMatch();
        if (typeof syncPurchasePortalMatch === 'function') await syncPurchasePortalMatch();
    }

    updatePartyCodeBadge();

    refreshView();
});

// --- UI LOGIC ---
function switchTab(tab) {
    currentPage = 1; // Reset to page 1 on every tab switch
    currentSheet = tab;
    if (insightsVisible) hideInsightsView();
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}Btn`).classList.add('active');

    document.getElementById('searchInput').value = "";
    document.getElementById('topToolbar').style.display = 'flex';
    document.getElementById('paginationControls').style.display = (tab === 'queue') ? 'none' : 'flex';
    if (typeof window.mountGlobalActionButton === 'function') {
        window.mountGlobalActionButton('sendToGoogleSheetBtn', null, globalPortalData.length > 1);
    }

    const sellerName = localStorage.getItem('myntra_purchase_seller_name');
    const badge = document.getElementById('purchaseSellerBadge');
    const nameSpan = document.getElementById('purchaseSellerName');
    if (badge && nameSpan) {
        if (tab === 'purchase' && sellerName) {
            nameSpan.textContent = sellerName;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    updatePartyCodeBadge();
    refreshView();
}


function refreshView() {
    runFilterLogic();
    updatePartyCodeBadge();
}

function applySearchFilter() {
    runFilterLogic();
}

function updatePartyCodeBadge() {
    const partyCode = String(localStorage.getItem('global_party_code') || '').trim();
    const pBadge = document.getElementById('partyCodeBadge');
    const pValue = document.getElementById('partyCodeValue');
    if (!pBadge || !pValue) return;

    if (currentSheet === 'portal' && partyCode) {
        pValue.textContent = partyCode;
        pBadge.style.display = 'block';
    } else {
        pBadge.style.display = 'none';
    }
}

window.renderTable = () => {
    const container = document.getElementById('tableContainer');
    const infoBox = document.getElementById('tableInfoBox');
    const pagination = document.getElementById('paginationControls');
    const pushBtn = document.getElementById('sendToGoogleSheetBtn');

    if (!globalFilteredData || globalFilteredData.length <= 1) {
        container.innerHTML = `<div style="text-align:center; padding: 80px; color: #64748b;">
            <h3>No data available</h3>
            <p>Click 'Upload Files 📁' above to start processing Myntra ${currentSheet} data.</p>
        </div>`;
        infoBox.textContent = "0 Rows";
        pagination.style.display = 'none';
        if (typeof window.mountGlobalActionButton === 'function') {
            window.mountGlobalActionButton('sendToGoogleSheetBtn', null, globalPortalData.length > 1);
        }
        container.innerHTML = normalizeMojibake(container.innerHTML);
        return;
    }

    if (typeof window.mountGlobalActionButton === 'function') {
        window.mountGlobalActionButton('sendToGoogleSheetBtn', null, globalPortalData.length > 1);
    }
    pagination.style.display = 'flex';
    infoBox.textContent = `${globalFilteredData.length - 1} Rows`;

    let html = '<table><thead><tr><th class="sticky-col" style="background:#f1f5f9; text-align:center;"># Row</th>';
    globalFilteredData[0].forEach((h, colIndex) => {
        let colName = '';
        let tempIndex = colIndex;
        while (tempIndex >= 0) {
            colName = String.fromCharCode((tempIndex % 26) + 65) + colName;
            tempIndex = Math.floor(tempIndex / 26) - 1;
        }
        const displayValue = h ? `${h} (${colName})` : `(${colName})`;
        const isFiltered = globalFilters[currentSheet] && globalFilters[currentSheet][colIndex] && globalFilters[currentSheet][colIndex].length > 0;
        html += `<th style="min-width:140px;">
            <div class="th-content">
              <span>${displayValue}</span>
              <div class="filter-trigger ${isFiltered ? 'active' : ''}" data-col="${colIndex}">▼</div>
            </div>
          </th>`;
    });
    html += '</tr></thead><tbody>';

    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(start + pageSize, globalFilteredData.length);
    const colors = ['rgb(255, 245, 245)', 'rgb(255, 250, 235)', 'rgb(250, 255, 240)', 'rgb(240, 255, 250)', 'rgb(240, 248, 255)', 'rgb(248, 240, 255)', 'rgb(255, 240, 250)'];

    for (let i = start; i < end; i++) {
        const rowColor = colors[(i - 1) % 7];
        html += `<tr style="background-color: ${rowColor}">`;
        html += `<td class="sticky-col" style="font-weight:700; text-align:center;">${i + 1}</td>`;
        globalFilteredData[i].forEach((cell, colIndex) => {
            let displayVal = cell || '';
            if (formulaViewActive) {
                const sheetType = currentSheet.toUpperCase();
                const formula = normalizeMojibake(getExcelFormula(sheetType, colIndex, i + 1));
                if (formula) displayVal = formula;
            }
            html += `<td>${displayVal}</td>`;
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = normalizeMojibake(html);
    const totalPages = Math.ceil((globalFilteredData.length - 1) / pageSize);
    renderPagination(totalPages);
};

function renderPagination(totalPages) {
    const container = document.getElementById('pageBlocks');
    container.innerHTML = "";
    const createBlock = (label, page, isActive = false, isDisabled = false) => {
        const div = document.createElement('div');
        div.className = `page-block ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`;
        div.textContent = normalizeMojibake(label);
        if (!isDisabled && !isActive) div.setAttribute('data-page', page);
        return div;
    };
    const createEllipsis = () => {
        const span = document.createElement('span');
        span.className = 'page-ellipsis';
        span.textContent = '...';
        return span;
    };
    container.appendChild(createBlock("«", 1, false, currentPage === 1));
    container.appendChild(createBlock("‹", currentPage - 1, false, currentPage === 1));
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    if (start > 1) {
        container.appendChild(createBlock(1, 1));
        if (start > 2) container.appendChild(createEllipsis());
    }
    for (let i = start; i <= end; i++) container.appendChild(createBlock(i, i, i === currentPage));
    if (end < totalPages) {
        if (end < totalPages - 1) container.appendChild(createEllipsis());
        container.appendChild(createBlock(totalPages, totalPages));
    }
    container.appendChild(createBlock("›", currentPage + 1, false, currentPage === totalPages));
    container.appendChild(createBlock("»", totalPages, false, currentPage === totalPages));
}

document.addEventListener('click', (e) => {
    const block = e.target.closest('.page-block[data-page]');
    if (block) {
        const p = parseInt(block.getAttribute('data-page'));
        if (p) { currentPage = p; renderTable(); }
    }
});

function getExcelFormula(sheetType, colIdx, r) {
    if (sheetType === 'PORTAL') {
        if (colIdx === 18) return `=A${r}&C${r}&H${r}&I${r}`;
        if (colIdx === 19) return `=L${r}`;
        if (colIdx === 20) return `=L${r}`;
        if (colIdx === 21) return `=IF(R${r}="GJ",U${r}*K${r}*M${r}/2,"")`;
        if (colIdx === 22) return `=IF(R${r}="GJ",U${r}*K${r}*M${r}/2,"")`;
        if (colIdx === 23) return `=IF(R${r}="GJ","",U${r}*K${r}*M${r})`;
        if (colIdx === 24) return `=U${r}*K${r}`;
        if (colIdx === 25) return `=IF(R${r}="GJ",Y${r}+U${r}+V${r},Y${r}+W${r})`;
        if (colIdx === 26) return `=TEXT(IF(ROUND(Z${r}-INT(Z${r}),2)<=0.49, Z${r}-INT(Z${r}), (INT(Z${r})+1)-Z${r}), "0.00")`;
        if (colIdx === 27) return `=ROUND(Z${r},0)`;
        if (colIdx === 28) return `=K${r}`;
        if (colIdx === 29) return `=SALE!U${r}`;
        if (colIdx === 30) return `=VLOOKUP(AD${r},SALE!$U$1:$AE$5000, 11, )`;
        if (colIdx === 31) return `=IF(AD${r}="","",IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AA$5000,7,FALSE),""))`;
        if (colIdx === 32) return `=IF(AD${r}="","",IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AA$5000,8,FALSE),""))`;
        if (colIdx === 33) return `=IF(AD${r}="","",IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AA$5000,9,FALSE),""))`;
        if (colIdx === 34) return `=IF(AD${r}="","",IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AA$5000,10,FALSE),""))`;
        if (colIdx === 35) return `=IF(AD${r}="","",IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AA$5000,11,FALSE),""))`;
        if (colIdx === 36) return `=IF(AD${r}="","",IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AB$5000,13,FALSE),""))`;
        if (colIdx === 37) return `=IF(AD${r}="","",IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AD$5000,15,FALSE),""))`;
        if (colIdx === 38) return `=VLOOKUP(AD${r},$S$1:$Z$5000,3,)`;
        if (colIdx === 39) return `=VLOOKUP(AD${r},$S$1:$Z$5000,7,)`;
        if (colIdx === 40) return `=VLOOKUP(AD${r},$S$1:$Z$5000,4,)`;
        if (colIdx === 41) return `=VLOOKUP(AD${r},$S$1:$Z$5000,5,)`;
        if (colIdx === 42) return `=VLOOKUP(AD${r},$S$1:$Z$5000,6,)`;
        if (colIdx === 43) return `=VLOOKUP(AD${r},$S$1:$AB$5000,10,)`;
        if (colIdx === 44) return `=VLOOKUP(AD${r},$S$1:$AC$5000,11,)`;
        if (colIdx === 45) return `=AF${r}-AM${r}`;
        if (colIdx === 46) return `=AG${r}-AN${r}`;
        if (colIdx === 47) return `=IF(AND(AH${r}="",AO${r}=""),"",AH${r}-AO${r})`;
        if (colIdx === 48) return `=IF(AND(AI${r}="",AP${r}=""),"",AI${r}-AP${r})`;
        if (colIdx === 49) return `=IF(AND(AJ${r}="",AQ${r}=""),"",AJ${r}-AQ${r})`;
        if (colIdx === 50) return `=AK${r}-AR${r}`;
        if (colIdx === 51) return `=AL${r}-AS${r}`;
        if (colIdx === 52) return `=IF(AT${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 53) return `=IF(AU${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 54) return `=IF(AV${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 55) return `=IF(AW${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 56) return `=IF(AX${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 57) return `=IF(AY${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 58) return `=IF(BG${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 59) return `=PURCHASE!U${r}`;
        if (colIdx === 60) return `=IF(BH${r}="","",VLOOKUP(BH${r},PURCHASE!$U$1:$AE$5000,11,FALSE))`;
        if (colIdx === 61) return `=IF(BH${r}="","",IFERROR(VLOOKUP(BH${r},SALE!$T$2:$V$5000,3,FALSE),""))`;
        if (colIdx === 62) return `=IFERROR(VLOOKUP(BH${r},PURCHASE!$T$2:$W$5000,4,),"")`;
        if (colIdx === 63) return `=IF(AND(BJ${r}="",BK${r}=""),"",BJ${r}-BK${r})`;
        if (colIdx === 64) return `=IF(BL${r}>0,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 65) {
            if (r === 3) return `=PURCHASE!AO2`;
            if (r === 4) return `=IF(SUMPRODUCT(--(BL2:BL2001<0))>0,"ERROR ⚠️","OK 👍")`;
            if (r === 5) return `=IF(OR(BN3="ERROR ⚠️", BN4="ERROR ⚠️"), "ERROR ⚠️", IF(AND(BN3="OK 👍", BN4="OK 👍"), "OK 👍", ""))`;
        }
        if (colIdx === 66) return `=TEXT(IF(ROUND(AK${r}-INT(AK${r}),2)<=0.49, AK${r}-INT(AK${r}), (INT(AK${r})+1)-AK${r}), "0.00")`;
        if (colIdx === 67) return `=TEXT(IF(ROUND(AR${r}-INT(AR${r}),2)<=0.49, AR${r}-INT(AR${r}), (INT(AR${r})+1)-AR${r}), "0.00")`;
        if (colIdx === 68) return `=BO${r}-BP${r}`;
        if (colIdx === 69) return `=IF(BQ${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 70) return `=SUBSTITUTE(SUBSTITUTE(BI${r},"CGJ","PGJ"),"MY27S","MY27P")`;
        if (colIdx === 71) return `=BL${r}`;
        if (colIdx === 72) return `=BM${r}`;
        if (colIdx === 73) return `=IF(BL${r}>0,"ALL CLEAR",IF(BL${r}<0,"SALE > PURCHASE",""))`;
        if (colIdx === 74) return `=IF(R${r}="","",R${r})`;
        if (colIdx === 75) return `=IF(BL${r}>0,"ALL CLEAR",IF(BL${r}<0,"SALE > PURCHASE",""))`;
        if (colIdx === 76) return `=AD${r}`;
        // BZ to CE (77-82)
        if (colIdx === 77) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AF$5000,12,FALSE),"")`; // BZ
        if (colIdx === 78) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AE$5000,11,FALSE),"")`; // CA
        if (colIdx === 79) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AG$5000,13,FALSE),"")`; // CB
        if (colIdx === 80) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AH$5000,14,FALSE),"")`; // CC
        if (colIdx === 81) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AI$5000,15,FALSE),"")`; // CD
        if (colIdx === 82) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AM$5000,19,FALSE),"")`; // CE
        // CG to CK (84-88)
        if (colIdx === 84) return `=IF(CE${r}<>"","⭐","")`; // CG
        if (colIdx === 85) return `=BZ${r}`; // CH
        if (colIdx === 86) return `=IF(CA${r}="","",SUBSTITUTE(CA${r},"MY27S","MY27P"))`; // CI
        if (colIdx === 87) return `=CB${r}`; // CJ
        if (colIdx === 88) return `=CD${r}`; // CK
        // CL to CR (89-95)
        if (colIdx === 89) return `=CQ${r}`; // CL
        if (colIdx === 91) return (globalPortalData[r] && globalPortalData[r][91]) || ""; // CN (Audit Stamp)
        if (colIdx === 92) return `=IFERROR(VLOOKUP(CA${r},$BI$1:$BX$5000,16,FALSE),"")`; // CO
        if (colIdx === 93) return `=AD${r}`; // CP (Mirror AD)
        if (colIdx === 94) return `=IFERROR(VLOOKUP(CP${r},PURCHASE!$BD$1:$BI$5000,6,FALSE),"")`; // CQ
        if (colIdx === 95) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AE$5000,11,FALSE),C${r})`; // CR
        
        if (colIdx === 104) {
            const nick = localStorage.getItem('nickname') || "User";
            return `=IF(CY${r}<>"","${new Date().toLocaleString('en-GB')} - " & "${nick}","")`;
        }
        if (colIdx === 105) return `=CK${r}`;
    } else if (sheetType === 'SALE') {
        if (colIdx === 19) return `=A${r}&C${r}&H${r}&I${r}`;
        if (colIdx === 21) return `=L${r}`;
        if (colIdx === 22) return `=V${r}*K${r}`;
        if (colIdx === 23) return `=IF(R${r}="GJ",V${r}*K${r}*M${r},"")`;
        if (colIdx === 24) return `=IF(R${r}="GJ",V${r}*K${r}*N${r},"")`;
        if (colIdx === 25) return `=IF(R${r}="GJ","",V${r}*K${r}*D${r})`;
        if (colIdx === 26) return `=IF(R${r}="GJ",W${r}+X${r}+Y${r},W${r}+Z${r})`;
        if (colIdx === 27) return `=ROUND(AA${r},0)`;
        if (colIdx === 28) return `=TEXT(IF(ROUND(AA${r}-INT(AA${r}),2)<=0.49, AA${r}-INT(AA${r}), (INT(AA${r})+1)-AA${r}), "0.00")`;
        if (colIdx === 29) return `=K${r}`;
        if (colIdx === 30) return `=IF(LEN(TRIM(C${r}))=0,"",C${r})`;
        if (colIdx === 31) return `=IF(A${r}="","",A${r})`;
        if (colIdx === 32) return `=IF(F${r}="","",F${r})`;
        if (colIdx === 33) return `=IF(F${r}="","",F${r})`;
        if (colIdx === 34) return `=K${r}`;
        if (colIdx === 35) return `=C${r}`;
        if (colIdx === 36) return `=A${r}`;
        if (colIdx === 37) return `=SUBSTITUTE(AJ${r},"C","P")`;
        if (colIdx === 38) return `=IF(V${r}="","",V${r})`;
        if (colIdx === 39) return `=IF(U${r}="","",U${r})`;
        if (colIdx === 40) return `=C${r}`;
        if (colIdx === 41) return `=A${r}`;
        if (colIdx === 42) return `=C${r}`;
        if (colIdx === 43) return `=F${r}`;
        if (colIdx === 44) return `=AR${r}`;
        if (colIdx === 45) return `=K${r}`;
        if (colIdx === 46) return `=AB${r}`;
        if (colIdx === 47) return `=IF(R${r}="","",R${r})`;
        if (colIdx === 48) return `=AD${r}`;
        if (colIdx === 55) return `=A${r}&B${r}&H${r}&I${r}`;
        if (colIdx === 56) return `=A${r}`;
        if (colIdx === 57) return `=C${r}`;
        if (colIdx === 58) return `=F${r}`;
        if (colIdx === 59) return `=K${r}`;
        if (colIdx === 60) return `=L${r}`;
        if (colIdx === 76) return `=AD${r}`;
        if (colIdx === 77) return `=IFERROR(VLOOKUP(BY${r},PORTAL!$U$2:$AF$5000,12,),"")`;
        if (colIdx === 78) return `=IFERROR(VLOOKUP(BY${r},PORTAL!$U$2:$AF$5000,11,),"")`;
        if (colIdx === 79) return `=IFERROR(VLOOKUP(BY${r},PORTAL!$U$2:$AM$5000,13,),"")`;
        if (colIdx === 80) return `=IFERROR(VLOOKUP(BY${r},PORTAL!$U$2:$AM$5000,14,),"")`;
        if (colIdx === 81) return `=IFERROR(VLOOKUP(BY${r},PORTAL!$U$2:$AM$5000,15,),"")`;
        if (colIdx === 82) return `=IFERROR(VLOOKUP(BY${r},PORTAL!$U$2:$AM$5000,19,),"")`;
        if (colIdx === 83) return `=IFERROR(VLOOKUP(BY${r},PORTAL!$S$2:$BW$5000,57,),"")`;
        if (colIdx === 84) return `=IF(BY${r}="","",VLOOKUP(BY${r},PORTAL!$AN$2:$AV$5001,9,FALSE))`;
        if (colIdx === 84) return `=IF(CE${r}<>"","⭐","")`;
        if (colIdx === 85) return `=BZ${r}`;
        if (colIdx === 86) return `=IF(CA${r}="","",SUBSTITUTE(CA${r},"MY27S","MY27P"))`;
        if (colIdx === 87) return `=CB${r}`;
        if (colIdx === 88) return `=CD${r}`;
        if (colIdx === 89) return `=CQ${r}`;
        if (colIdx === 91) {
            const nick = localStorage.getItem('nickname') || "User";
            return `"${new Date().toLocaleString('en-GB')} - ${nick}"`;
        }
        if (colIdx === 92) return `=IFERROR(VLOOKUP(CA${r},$BI$1:$BX$5000,16,) ,"")`;
        if (colIdx === 93) return `=AD${r}`;
        if (colIdx === 94) return `=IFERROR(VLOOKUP(CP${r},PURCHASE!$BD$2:$BI$5000,6,),"")`;
        if (colIdx === 95) return `=IFERROR(VLOOKUP(AD${r},SALE!$U$1:$AE$5000,11,),"")`;
    } else if (sheetType === 'PURCHASE') {
        if (colIdx === 0) return `=Details!F${r + 1}`;
        if (colIdx === 1) return `=Summary!B${r + 1}`;
        if (colIdx === 2) return `=Details!B${r + 1}`;
        if (colIdx === 3) return `=Summary!I${r + 1}`;
        if (colIdx === 19) return `=A${r}&B${r}&H${r}&I${r}`;
        if (colIdx === 20) return `=IF(T${r}="","",VLOOKUP(T${r},PORTAL!$S$1:$S$5000,1,FALSE))`;
        if (colIdx === 21) return `=K${r}`;
        if (colIdx === 22) return `=L${r}/K${r}`;
        if (colIdx === 23) return `=W${r}*V${r}`;
        if (colIdx === 24) return `=X${r}*M${r}/2`;
        if (colIdx === 25) return `=X${r}*M${r}/2`;
        if (colIdx === 26) return `=X${r}*0.1%`;
        if (colIdx === 27) return `=X${r}+Y${r}+Z${r}-AA${r}`;
        if (colIdx === 28) return `=TEXT(IF(ROUND(AB${r}-INT(AB${r}),2)<=0.49, AB${r}-INT(AB${r}), (INT(AB${r})+1)-AB${r}), "0.00")`;
        if (colIdx === 29) return `=ROUND(AB${r},0)`;
        if (colIdx === 30) return `=B${r}`;
        if (colIdx === 31) return `=IFERROR(VLOOKUP(C${r},PORTAL!$C$1:$K$5000, 9, FALSE),"")`;
        if (colIdx === 32) return `=IF(AND(AF${r}="",V${r}=""),"",AF${r}-V${r})`;
        if (colIdx === 33) return `=IF(AG${r}<1,"TRUE ✅ ","FALSE ❌ ")`;
        if (colIdx === 34) return `=A${r}`;
        if (colIdx === 35) return `=C${r}`;
        if (colIdx === 36) return `=IF(OR(AJ${r}=0,AJ${r}=""),"",IF(LEFT(AJ${r},1)="P","C"&MID(ajVal,2,99),IF(MID(ajVal,5,1)="P",REPLACE(ajVal,5,1,"S"),"ERROR")))`;
        if (colIdx === 37) return `=IF(OR(AJ${r}=0,AJ${r}=""),"",TRIM(RIGHT(AJ${r},LEN(AJ${r})-FIND("§",SUBSTITUTE(AJ${r},"-","§",LEN(AJ${r})-LEN(SUBSTITUTE(AJ${r},"-","")))))))`;
        if (colIdx === 38) return `=IF(OR(AK${r}=0,AK${r}=""),"",TRIM(RIGHT(AK${r},LEN(AK${r})-FIND("§",SUBSTITUTE(AK${r},"-","§",LEN(AK${r})-LEN(SUBSTITUTE(AK${r},"-","")))))))`;
        if (colIdx === 39) return `=AL${r}=AM${r}`;
        if (colIdx === 41) return `=X${r}+Y${r}+Z${r}`;
        if (colIdx === 42) return `=AT${r}`;
        if (colIdx === 43) return `=C${r}`;
        if (colIdx === 44) return `=A${r}`;
        if (colIdx === 45) return `=B${r}`;
        if (colIdx === 46) return `=F${r}`;
        if (colIdx === 47) return `=K${r}`;
        if (colIdx === 48) return `=AD${r}`;
        if (colIdx === 55) return `=A${r}&B${r}&H${r}&I${r}`;
        if (colIdx === 56) return `=A${r}`;
        if (colIdx === 57) return `=C${r}`;
        if (colIdx === 58) return `=F${r}`;
        if (colIdx === 59) return `=K${r}`;
        if (colIdx === 60) return `=L${r}`;
    }
    return null;
}

/**
 * Matches Purchase Data with Portal Data based on the Concat ID.
 * Updates Purchase Column U (PORTAL_MATCH) and many reconciliation fields.
 */
async function syncPurchasePortalMatch() {
    if (!globalPurchaseData || globalPurchaseData.length <= 1 || !globalPortalData || globalPortalData.length <= 1) return;

    // AUTO-PADDING headers
    if (globalPurchaseData[0].length < 62) {
        const ph = globalPurchaseData[0];
        while (ph.length < 53) ph.push("");
        const labels = ["BB_TCS_CALC", "BC_MATCH", "BD_MIR_U", "BE_MIR_A", "BF_MIR_C", "BG_MIR_F", "BH_MIR_K", "BI_MIR_L"];
        for (let l = 0; l < labels.length; l++) { ph[l + 53] = labels[l]; }
    }

    const portalMapByC = new Map();
    const portalMapNumeric = new Map();
    const portalMapByCR = new Map();
    const portalMapByConcat = new Map();
    const portalMapByAE = new Map();

    for (let j = 1; j < globalPortalData.length; j++) {
        const row = globalPortalData[j];
        const portalC = String(row[2] || "").trim();
        const portalCR = String(row[95] || "").trim();
        const portalS = String(row[18] || "").trim();
        const portalAE = String(row[30] || "").trim();

        if (portalC) {
            portalMapByC.set(portalC, row);
            const numKey = portalC.replace(/\D/g, '');
            if (numKey) portalMapNumeric.set(numKey, row);
        }
        if (portalCR) portalMapByCR.set(portalCR, row);
        if (portalS) portalMapByConcat.set(portalS, row);
        if (portalAE) portalMapByAE.set(portalAE, row);
    }
    const purMapByInv = new Map();
    for (let j = 1; j < globalPurchaseData.length; j++) {
        const purC = String(globalPurchaseData[j][2] || "").trim();
        if (purC) purMapByInv.set(purC, globalPurchaseData[j]);
    }

    const idSet = new Set();
    const uniqueIDs = [];
    for (let j = 1; j < globalPurchaseData.length; j++) {
        const id = String(globalPurchaseData[j][2] || "").trim();
        if (id && !idSet.has(id)) { idSet.add(id); uniqueIDs.push(id); }
    }
    uniqueIDs.sort();

    let updated = false;
    let allTrue = true;

    for (let i = 1; i < globalPurchaseData.length; i++) {
        while (globalPurchaseData[i].length < 62) globalPurchaseData[i].push("");
        
        const purT = String(globalPurchaseData[i][19] || "").trim();
        
        // AF Logic (Index 31) - Based on Bill No (C/2) matching Portal C/2
        const purC_Lookup = String(globalPurchaseData[i][2] || "").trim();
        let portalMatchC = purC_Lookup ? portalMapByC.get(purC_Lookup) : null;
        
        // Fallback: Try Numeric-Only match if exact match fails
        if (!portalMatchC && purC_Lookup) {
            const numKey = purC_Lookup.replace(/\D/g, '');
            if (numKey) portalMatchC = portalMapNumeric.get(numKey);
        }

        if (portalMatchC) {
            const portalQty = parseFloat(portalMatchC[10]) || 0;
            globalPurchaseData[i][31] = portalQty;
        } else {
            globalPurchaseData[i][31] = "";
            if (i < 5) console.log(`[DEBUG] No match for Purchase Row ${i} (Bill No: ${purC_Lookup})`);
        }

        // AG Logic (Index 32) - Diff (AF - V)
        const vQty = parseFloat(globalPurchaseData[i][21]) || 0;
        const afVal = globalPurchaseData[i][31];
        const afQty = parseFloat(afVal) || 0;
        globalPurchaseData[i][32] = (afVal === "" && globalPurchaseData[i][21] === "") ? "" : (afQty - vQty).toFixed(2);

        // AH Logic (Index 33) - Status
        const diffAG = (globalPurchaseData[i][32] === "") ? null : parseFloat(globalPurchaseData[i][32]);
        globalPurchaseData[i][33] = (diffAG !== null && Math.abs(diffAG) < 1) ? "TRUE ✅ " : "FALSE ❌ ";

        // Rest of matching logic...
        const portalRowByConcat = portalMapByConcat?.get(purT);
        globalPurchaseData[i][20] = portalRowByConcat ? purT : "";

        // Moving to mirrors
        // AF (31), AG (32), AH (33) are handled above

        globalPurchaseData[i][34] = globalPurchaseData[i][0];
        globalPurchaseData[i][35] = globalPurchaseData[i][2];
        const ajVal = String(globalPurchaseData[i][35] || "");
        if (ajVal && ajVal !== "0") {
            const lastSeg = ajVal.split("-").pop().trim();
            if (ajVal.startsWith("P")) globalPurchaseData[i][36] = "C" + ajVal.substring(1);
            else if (ajVal.charAt(4) === "P") globalPurchaseData[i][36] = ajVal.substring(0, 4) + "S" + ajVal.substring(5);
            globalPurchaseData[i][37] = lastSeg;
            globalPurchaseData[i][38] = String(globalPurchaseData[i][36] || "").split("-").pop().trim();
            globalPurchaseData[i][39] = (globalPurchaseData[i][37] === globalPurchaseData[i][38]) ? "TRUE" : "FALSE";
        }
        if (globalPurchaseData[i][39] !== "TRUE") allTrue = false;

        globalPurchaseData[i][41] = (parseFloat(globalPurchaseData[i][23]) || 0) + (parseFloat(globalPurchaseData[i][24]) || 0) + (parseFloat(globalPurchaseData[i][25]) || 0);
        globalPurchaseData[i][45] = globalPurchaseData[i][1];
        globalPurchaseData[i][42] = globalPurchaseData[i][45];
        globalPurchaseData[i][43] = globalPurchaseData[i][2];
        globalPurchaseData[i][44] = globalPurchaseData[i][0];
        globalPurchaseData[i][46] = globalPurchaseData[i][5];
        globalPurchaseData[i][47] = globalPurchaseData[i][10];
        globalPurchaseData[i][48] = globalPurchaseData[i][29];
        globalPurchaseData[i][49] = uniqueIDs[i - 1] || "";
        
        const ayVal = String(globalPurchaseData[i][49]).replace(/CGJ/g, "PGJ").replace(/MY26S/g, "MY26P");
        globalPurchaseData[i][50] = ayVal;
        const purMatch = purMapByInv.get(ayVal);
        globalPurchaseData[i][51] = purMatch ? purMatch[3] : "";
        globalPurchaseData[i][52] = purMatch ? (parseFloat(purMatch[16]) || 0).toFixed(2) : "";
        
        const azVal = parseFloat(globalPurchaseData[i][51]) || 0;
        const bbVal = (azVal * 0.001).toFixed(2);
        globalPurchaseData[i][53] = bbVal;
        globalPurchaseData[i][54] = (String(globalPurchaseData[i][52]).trim() === String(bbVal)) ? "TRUE ✅ " : "FALSE ❌ ";

        globalPurchaseData[i][55] = globalPurchaseData[i][19];
        globalPurchaseData[i][56] = globalPurchaseData[i][0];
        globalPurchaseData[i][57] = globalPurchaseData[i][2];
        globalPurchaseData[i][58] = globalPurchaseData[i][5];
        globalPurchaseData[i][59] = globalPurchaseData[i][10];
        globalPurchaseData[i][60] = globalPurchaseData[i][11];
        updated = true;
    }
    if (globalPurchaseData.length > 1) globalPurchaseData[1][40] = allTrue ? "OK 👍" : "ERROR ⚠️";
    if (updated) await saveToDB("purchase", globalPurchaseData);
}

/**
 * Positional synchronization: Maps Sale Column U directly to Portal Column AD
 * based on the exact row number (positional mapping). Also handles a massive 
 * set of cross-sheet VLOOKUPs and reconciliation columns.
 */
async function syncPortalSaleMatch() {
    if (!globalPortalData || globalPortalData.length <= 1) return;

    // ALWAYS REFRESH HEADERS AND TRUNCATE TO CR (96 columns)
    const ph = globalPortalData[0];
    const labels = ["CONCAT (S)", "L_VAL (T)", "RATE (U)", "SGST (V)", "CGST (W)", "IGST (X)", "TAX_VAL (Y)", "TOTAL (Z)", "ROUND DIFF (AA)", "GRAND TOTAL (AB)", "QTY (AC)", "SALE_MATCH (AD)", "MATCH_VAL (AE)", "V_COST (AF)", "W_TAXABLE (AG)", "X_SGST (AH)", "Y_CGST (AI)", "Z_IGST (AJ)", "AB_ROUND (AK)", "AD_QTY (AL)", "U_RATE (AM)", "Y_TAX (AN)", "V_SGST (AO)", "W_CGST (AP)", "X_IGST (AQ)", "AB_GRAND (AR)", "AC_QTY (AS)", "DIFF_COST (AT)", "DIFF_TAX (AU)", "DIFF_SGST (AV)", "DIFF_CGST (AW)", "DIFF_IGST (AX)", "DIFF_ROUND (AY)", "DIFF_QTY (AZ)", "STATUS_COST (BA)", "STATUS_TAX (BB)", "STATUS_SGST (BC)", "STATUS_CGST (BD)", "STATUS_IGST (BE)", "STATUS_ROUND (BF)", "STATUS_QTY (BG)", "PUR_MATCH_ID (BH)", "PUR_INV (BI)", "SALE_RATE (BJ)", "PUR_RATE (BK)", "RATE_DIFF (BL)", "RATE_STATUS (BM)", "SUMMARY_STATUS (BN)", "ROUND_AK (BO)", "ROUND_AR (BP)", "ROUND_DIFF (BQ)", "ROUND_STATUS (BR)", "TRANS_BI (BS)", "MIR_BL (BT)", "MIR_BM (BU)", "STATUS_TEXT (BV)", "STATUS_TEXT_2 (BW)", "STATUS_TEXT_3 (BX)", "MIR_AD (BY)", "BZ_SALE_RATE", "CA_SALE_MATCH", "CB_SALE_TAX", "CC_SALE_SGST", "CD_SALE_CGST", "CE_SALE_IGST", "CF_P_KEY", "CG_SALE_DIFF", "CH_MIR_BZ", "CI_SUB_CA", "CJ_MIR_CB", "CK_MIR_CD", "CL_MIR_CQ", "CM_EMPTY", "CN_AUDIT", "CO_LOOK_BI", "CP_MIR_AD", "CQ_LOOK_BI", "CR_SALE_AE"];
    for (let l = 0; l < labels.length; l++) { 
        ph[l + 18] = labels[l]; 
    }
    globalPortalData[0] = globalPortalData[0].slice(0, 96);

    // 1. Optimized Combined Loop for Portal Maps
    const portalDataMap = new Map();
    const portalMapByBI = new Map();
    const portalMapByS = new Map();
    portalMapByCS.clear();

    for (let j = 1; j < globalPortalData.length; j++) {
        const row = globalPortalData[j];
        const s = String(row[18] || "").trim();
        const bi = String(row[91] || "").trim(); // CN is index 91

        if (s) portalDataMap.set(s, row);
        if (bi) portalMapByBI.set(bi, row);

        let valCS = String(row[89] || row[2] || "").trim().toUpperCase();
        let normKey = valCS.replace(/[SP]/g, '');
        if (normKey) {
            if (!portalMapByCS.has(normKey)) portalMapByCS.set(normKey, []);
            portalMapByCS.get(normKey).push(row);
        }
    }

    // 2. Optimized Combined Loop for Sale Maps
    const saleMapByT = new Map();
    const saleMapByULevel = new Map();
    const saleMapByANLevel = new Map();
    for (let j = 1; j < globalSaleData.length; j++) {
        const row = globalSaleData[j];
        const saleT = String(row[19] || "").trim();
        const u = String(row[20] || "").trim();
        const an = String(row[47] || "").trim(); // AV is index 47

        if (saleT) saleMapByT.set(saleT, row);
        if (u) saleMapByULevel.set(u, row);
        if (an) saleMapByANLevel.set(an, row);
    }

    // 3. Optimized Combined Loop for Purchase Maps
    const purchaseMapByU = new Map();
    const purchaseMapByT = new Map();
    const purMapByBDLevel = new Map();

    for (let j = 1; j < globalPurchaseData.length; j++) {
        const row = globalPurchaseData[j];
        const purU = String(row[20] || "").trim();
        const purT = String(row[19] || "").trim();
        const bd = String(row[55] || "").trim();

        if (purU) purchaseMapByU.set(purU, row);
        if (purT) purchaseMapByT.set(purT, row);
        if (bd) purMapByBDLevel.set(bd, row);
    }

    // Build Portal Map for AM-AS Lookups (Index 18 is 'S')
    for (let j = 1; j < globalPortalData.length; j++) {
        const sKey = String(globalPortalData[j][18] || "").trim();
        const biKey = String(globalPortalData[j][60] || "").trim();
        if (sKey) portalMapByS.set(sKey, globalPortalData[j]);
        if (biKey) portalMapByBI.set(biKey, globalPortalData[j]);
    }

    let updated = false;

    for (let i = 1; i < globalPortalData.length; i++) {
        while (globalPortalData[i].length < 106) globalPortalData[i].push("");

        // Position mapping
        const newValAD = globalSaleData[i] ? String(globalSaleData[i][20] || "").trim() : "";
        globalPortalData[i][29] = newValAD;
        globalPortalData[i][76] = newValAD; // KEY FIX: Mirror AD to BY for lookups below

        // VLOOKUP logic
        const sMatch = saleMapByULevel.get(newValAD);
        if (sMatch) {
            globalPortalData[i][30] = String(sMatch[27] || "").trim(); // AB-matched
            globalPortalData[i][31] = String(sMatch[21] || "").trim(); // V-matched
            globalPortalData[i][32] = String(sMatch[22] || "").trim(); // W-matched
            globalPortalData[i][33] = String(sMatch[24] || "").trim(); // Y-matched
            globalPortalData[i][34] = String(sMatch[23] || "").trim(); // X-matched
            globalPortalData[i][35] = String(sMatch[25] || "").trim(); // Z-matched
            globalPortalData[i][36] = String(sMatch[27] || "").trim(); // AB-matched
            globalPortalData[i][37] = String(sMatch[29] || "").trim(); // AD-matched
        }

        // AM-AS VLOOKUP Logic (Indices 38-44) - Based on AD (29) searching in S (18)
        const valAD_Lookup = globalPortalData[i][29];
        const portalMatch = valAD_Lookup ? portalMapByS.get(valAD_Lookup) : null;
        if (portalMatch) {
            globalPortalData[i][38] = portalMatch[20] || ""; // AM (3rd of S-Z)
            globalPortalData[i][39] = portalMatch[24] || ""; // AN (7th of S-Z)
            globalPortalData[i][40] = portalMatch[21] || ""; // AO (4th of S-Z)
            globalPortalData[i][41] = portalMatch[22] || ""; // AP (5th of S-Z)
            globalPortalData[i][42] = portalMatch[23] || ""; // AQ (6th of S-Z)
            globalPortalData[i][43] = portalMatch[27] || ""; // AR (10th of S-AB)
            globalPortalData[i][44] = portalMatch[28] || ""; // AS (11th of S-AC)
        } else {
            // Fallback clear
            [38,39,40,41,42,43,44].forEach(idx => globalPortalData[i][idx] = "");
        }

        // Audit calculations
        const diffPairs = [[31, 38, 45], [32, 39, 46], [33, 40, 47], [34, 41, 48], [35, 42, 49], [36, 43, 50], [37, 44, 51]];
        diffPairs.forEach(([sIdx, pIdx, dIdx]) => {
            const vS = parseFloat(globalPortalData[i][sIdx]) || 0;
            const vP = parseFloat(globalPortalData[i][pIdx]) || 0;
            globalPortalData[i][dIdx] = (globalPortalData[i][sIdx] === "" && globalPortalData[i][pIdx] === "") ? "" : (vS - vP).toFixed(2);
        });

        // BH-BM Positional
        if (globalPurchaseData[i]) {
            globalPortalData[i][59] = String(globalPurchaseData[i][20] || "").trim();
        }
        const valBH = globalPortalData[i][59];
        const purRowBH = valBH ? purchaseMapByU.get(valBH) : null;
        globalPortalData[i][60] = purRowBH ? purRowBH[30] : "";
        const saleRowT = valBH ? saleMapByT.get(valBH) : null;
        globalPortalData[i][61] = saleRowT ? saleRowT[21] : "";
        const purRowT = valBH ? purchaseMapByT.get(valBH) : null;
        globalPortalData[i][62] = purRowT ? purRowT[22] : "";

        // BL & BM
        const bj = parseFloat(globalPortalData[i][61]) || 0;
        const bk = parseFloat(globalPortalData[i][62]) || 0;
        const diffBL = (globalPortalData[i][61] === "" && globalPortalData[i][62] === "") ? "" : (bj - bk).toFixed(2);
        globalPortalData[i][63] = diffBL;
        globalPortalData[i][64] = (diffBL !== "" && parseFloat(diffBL) > 0) ? "TRUE ✅ " : "FALSE ❌ ";

        // BZ-CJ Logic (Match IDs)
        const valBY = globalPortalData[i][76]; // mirror AD
        if (valBY) {
            const sU = saleMapByULevel.get(valBY);
            if (sU) {
                globalPortalData[i][77] = sU[31] || "";
                globalPortalData[i][78] = sU[30] || "";
                globalPortalData[i][79] = sU[32] || "";
                globalPortalData[i][80] = sU[33] || "";
                globalPortalData[i][81] = sU[34] || "";
                globalPortalData[i][82] = sU[38] || "";
            }
            const purBD = purMapByBDLevel.get(valBY);
        }

        // BA-BG Status Logic (Indices 52-58) - Based on differences AT-AZ (45-51)
        const statusIndices = [52, 53, 54, 55, 56, 57, 58];
        const diffIndices = [45, 46, 47, 48, 49, 50, 51];
        statusIndices.forEach((sIdx, idx) => {
            const dIdx = diffIndices[idx];
            const diffVal = parseFloat(globalPortalData[i][dIdx]) || 0;
            globalPortalData[i][sIdx] = (globalPortalData[i][dIdx] !== "" && Math.abs(diffVal) < 1) ? "TRUE ✅ " : "FALSE ❌ ";
        });

        // BO-BX Logic (Indices 66-75)
        // BO (66) & BP (67): Rounding logic for AK (36) and AR (43)
        const getRnd = (val) => {
            const num = parseFloat(val) || 0;
            const intVal = Math.floor(num);
            const frac = parseFloat((num - intVal).toFixed(2));
            return (frac <= 0.49 ? frac : (intVal + 1) - num).toFixed(2);
        };
        globalPortalData[i][66] = getRnd(globalPortalData[i][36]); // BO
        globalPortalData[i][67] = getRnd(globalPortalData[i][43]); // BP
        
        // BQ (68): BO - BP
        const bqVal = (parseFloat(globalPortalData[i][66]) || 0) - (parseFloat(globalPortalData[i][67]) || 0);
        globalPortalData[i][68] = bqVal.toFixed(2);
        
        // BR (69): BQ Status
        globalPortalData[i][69] = (Math.abs(bqVal) < 1) ? "TRUE ✅ " : "FALSE ❌ ";
        
        // BS (70): Transformation mirror
        globalPortalData[i][70] = String(globalPortalData[i][60] || "").replace(/CGJ/g, "PGJ").replace(/MY27S/g, "MY27P");
        
        // BT (71) & BU (72): Mirror BL (63) and BM (64)
        globalPortalData[i][71] = globalPortalData[i][63] || "";
        globalPortalData[i][72] = globalPortalData[i][64] || "";
        
        // BV (73) & BX (75): Status Text based on Rate Diff (BL/63)
        const blVal = parseFloat(globalPortalData[i][63]) || 0;
        const statusTxt = (blVal > 0) ? "ALL CLEAR" : (blVal < 0 ? "SALE > PURCHASE" : "");
        globalPortalData[i][73] = statusTxt; // BV
        globalPortalData[i][75] = statusTxt; // BX

        // BW (74): Mirror of R (17)
        globalPortalData[i][74] = globalPortalData[i][17] || "";

        // CG (84): Logic "=IF(CE2<>"","⭐","")"
        globalPortalData[i][84] = String(globalPortalData[i][82] || "").trim() !== "" ? "⭐" : "";

        // NEW LOGIC: CH-CK (85-88)
        globalPortalData[i][85] = globalPortalData[i][77] || ""; // CH = BZ
        globalPortalData[i][86] = String(globalPortalData[i][78] || "").trim() === "" ? "" : String(globalPortalData[i][78]).replace(/MY27S/g, "MY27P"); // CI = CA Substitute
        globalPortalData[i][87] = globalPortalData[i][79] || ""; // CJ = CB
        globalPortalData[i][88] = globalPortalData[i][81] || ""; // CK = CD

        // CL (89) = CQ2 (Index 94)
        globalPortalData[i][89] = globalPortalData[i][94] || "";

        // CN (91) = Timestamp + Nickname
        const nick = localStorage.getItem('nickname') || "User";
        globalPortalData[i][91] = new Date().toLocaleString('en-GB') + " - " + nick;

        // CO (92) = IFERROR(VLOOKUP(CA2, $BI$1:$BV$1000, 16, ), "")
        const caVal = globalPortalData[i][78];
        const portalMatchCO = caVal ? portalMapByBI.get(caVal) : null;
        globalPortalData[i][92] = portalMatchCO ? portalMatchCO[75] : ""; // Index 75 is BX (16th col from BI/60)

        // CP (93) = AD2 (Index 29)
        globalPortalData[i][93] = globalPortalData[i][29] || "";

        // CQ (94) = IFERROR(VLOOKUP(CP2, PURCHASE!$BD$2:$BI$5000, 6, ), "")
        const cpVal = globalPortalData[i][93];
        const purMatchCQ = cpVal ? purMapByBDLevel.get(cpVal) : null;
        globalPortalData[i][94] = purMatchCQ ? purMatchCQ[60] : ""; // Index 60 is BI

        // CR (95) = VLOOKUP(AD2, SALE!$U$1:$AE$5000, 11) or Fallback to Portal Invoice No
        const adValCQ = globalPortalData[i][29];
        const sMatchCQ = adValCQ ? saleMapByULevel.get(adValCQ) : null;
        globalPortalData[i][95] = (sMatchCQ ? (sMatchCQ[30] || "") : String(globalPortalData[i][2] || "")).trim(); // Index 30 is AE

        // TRUNCATE AT CR (Index 95, total length 96)
        if (globalPortalData[i].length > 96) {
            globalPortalData[i] = globalPortalData[i].slice(0, 96);
        }

        updated = true;
    }

    // BN Summary Calculation (BN3, BN4, BN5)
    if (globalPortalData.length > 4) {
        // BN3 (Row 3, Index 2): Purchase Status
        let purchaseStatusField = "";
        if (typeof globalPurchaseData !== 'undefined' && globalPurchaseData.length > 1) {
            purchaseStatusField = globalPurchaseData[1][40] || ""; // PURCHASE!AO2
        }
        globalPortalData[2][65] = purchaseStatusField;

        // BN4 (Row 4, Index 3): Rate Issue Check (Any BL < 0)
        let rateIssueFound = false;
        for (let j = 1; j < globalPortalData.length; j++) {
            const blVal = parseFloat(globalPortalData[j][63]) || 0;
            if (blVal < 0) {
                rateIssueFound = true;
                break;
            }
        }
        globalPortalData[3][65] = rateIssueFound ? "ERROR ⚠️" : "OK 👍";

        // BN5 (Row 5, Index 4): Combined Status
        const bn3Val = globalPortalData[2][65];
        const bn4Val = globalPortalData[3][65];
        if (bn3Val === "ERROR ⚠️" || bn4Val === "ERROR ⚠️") {
            globalPortalData[4][65] = "ERROR ⚠️";
        } else if (bn3Val === "OK 👍" && bn4Val === "OK 👍") {
            globalPortalData[4][65] = "OK 👍";
        } else {
            globalPortalData[4][65] = "";
        }
    }

    if (updated) {
        await saveToDB("portal", globalPortalData);
        refreshView();
    }
}

window.myntraInvoiceTimer = null;
window.myntraBillTimer = null;
let currentCheckerRow = 1;
function getMyntraSellerName() { return String(localStorage.getItem('myntra_purchase_seller_name') || "").trim() || "--"; }
function updateMyntraModalSellerNames() {
    const s = getMyntraSellerName();
    if (document.getElementById('fieldInvSellerName')) document.getElementById('fieldInvSellerName').textContent = s;
    if (document.getElementById('purBillSellerName')) document.getElementById('purBillSellerName').textContent = s;
}

// FUNCTIONS MOVED TO myntra_modal.js

let autoInterval = null;
function checkerStop() {
    if (autoInterval) {
        clearInterval(autoInterval);
        autoInterval = null;
        document.getElementById('checkerAutoBtn').style.background = "#dff9fb";
    }
    if (window.myntraInvoiceTimer) {
        window.myntraInvoiceTimer.stop();
    }
}

let currentPurchaseRow = 1, purchaseAutoInterval = null;
// FUNCTIONS MOVED TO myntra_modal.js

function purchaseStop() {
    if (purchaseAutoInterval) {
        clearInterval(purchaseAutoInterval);
        purchaseAutoInterval = null;
        document.getElementById('purAutoBtn').style.background = "#3b82f6";
    }
    if (window.myntraBillTimer) {
        window.myntraBillTimer.stop();
    }
}

function purchaseAuto() {
    if (purchaseAutoInterval) { purchaseStop(); return; }
    document.getElementById('purAutoBtn').style.background = "#fbbf24";
    if (window.myntraBillTimer) {
        window.myntraBillTimer.start(currentPurchaseRow, globalPurchaseData.length);
    }
    purchaseAutoInterval = setInterval(() => {
        if (currentPurchaseRow < globalPurchaseData.length - 1) {
            const hasError = updatePurchaseUI(currentPurchaseRow + 1);
            if (hasError) purchaseStop();
        } else {
            purchaseStop();
            window.showCustomSuccess("Purchase checking complete!", "Success ✓");
        }
    }, 100);
}

document.addEventListener('DOMContentLoaded', () => {
    window.myntraInvoiceTimer = new DashboardTimer('myntraInvoiceTimerContainer', 'myntraInvoiceTimerVal', 'myntraInvoiceTimerSpeed', 'myntraInvoiceTimerRemaining');
    window.myntraBillTimer = new DashboardTimer('myntraBillTimerContainer', 'myntraBillTimerVal', 'myntraBillTimerSpeed', 'myntraBillTimerRemaining');

    const openBtn = document.getElementById('openPurchaseAuditBtn');
    if (openBtn) {
        openBtn.onclick = () => {
            if (globalPurchaseData.length > 1) {
                document.getElementById('purchaseBillModal').style.display='flex';
                updatePurchaseUI(1);
                if (window.myntraBillTimer) {
                    window.myntraBillTimer.reset();
                    window.myntraBillTimer.updateProgress(1);
                }
            }
        };
    }
    document.getElementById('purNextBtn').onclick = () => {
        if (currentPurchaseRow < globalPurchaseData.length-1) {
            updatePurchaseUI(currentPurchaseRow+1);
        }
    };
    document.getElementById('purAutoBtn').onclick = purchaseAuto;
    document.getElementById('purStopBtn').onclick = purchaseStop;
    document.getElementById('purRestartBtn').onclick = () => {
        purchaseStop();
        updatePurchaseUI(1);
        if (window.myntraBillTimer) {
            window.myntraBillTimer.reset();
            window.myntraBillTimer.updateProgress(1);
        }
    };
    document.getElementById('myntraInvoiceZipBtn').onclick = () => renamePdfZipWithSeller(document.getElementById('myntraInvoiceZipInput').files[0], getMyntraSellerName(), 'myntraInvoiceZipStatus', 'myntra_invoice');
    document.getElementById('myntraBillZipBtn').onclick = () => renamePdfZipWithSeller(document.getElementById('myntraBillZipInput').files[0], getMyntraSellerName(), 'myntraBillZipStatus', 'myntra_bill');
    
    const pushBtn = document.getElementById('sendToGoogleSheetBtn');
    if (pushBtn) pushBtn.onclick = pushDetailsToGoogleSheet;
});

async function pushDetailsToGoogleSheet() {
    const btn = document.getElementById('sendToGoogleSheetBtn');
    if (!globalPortalData || globalPortalData.length <= 1) return;
    const sellerName = localStorage.getItem('myntra_purchase_seller_name') || "";
    const vendorEventId = `MYNTRA_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startCol = 77;
    const endCol = 92;
    try {
        let lastFilledRow = 0;
        for (let i = globalPortalData.length - 1; i >= 1; i--) {
            const row = globalPortalData[i] || [];
            const startVal = row[startCol];
            if (startVal !== undefined && startVal !== null && String(startVal).trim() !== "") {
                lastFilledRow = i;
                break;
            }
        }

        if (lastFilledRow === 0) {
            window.showCustomAlert("No Myntra data found in BZ column range to push.", "No Data");
            return;
        }

        const rowsToPush = globalPortalData.slice(1, lastFilledRow + 1).map(r => {
            // Range BZ to CO (Index 77 to 92 -> slice(77, 93))
            const subset = r.slice(startCol, endCol + 1);
            subset.push(sellerName); // Column CP in sheet
            const nick = localStorage.getItem('nickname') || "User";
            subset.push(nick); // Column CQ in sheet
            const invNo = String(r[78] || r[86] || r[2] || "").trim();
            return { row: subset, vendorEventId: vendorEventId, invoiceNo: invNo };
        });

        // Log to pushHistory
        const invoiceList = [];
        for (let i = 1; i <= lastFilledRow; i++) {
            const row = globalPortalData[i];
            if (row) {
                const invNo = String(row[78] || row[86] || row[2] || "").trim();
                if (invNo) invoiceList.push(invNo);
            }
        }
        if (window.logPushHistory) {
            await window.logPushHistory("MYNTRA", invoiceList, vendorEventId, sellerName, "Portal Invoice Submitted To Google Sheet");
        }

        const storageKey = 'pushQueue_MYNTRA';
        const res = await chrome.storage.local.get([storageKey]);
        let q = (res[storageKey] || []).concat(rowsToPush);
        await chrome.storage.local.set({ [storageKey]: q });
        btn.textContent = "Added! 🚀";

        updateQueueUI();
        startQueueWorker();
        setTimeout(() => switchTab('queue'), 1500);
    } catch (e) { console.error(e); }
}

function startQueueWorker() {
    chrome.runtime.sendMessage({ action: 'startSync', platform: 'MYNTRA' });
}

async function updateLocalApiDisplay() {
    if (typeof window.syncApiDisplay === 'function') await window.syncApiDisplay('apiCountDisplay');
}

let activeFilterMenu = null;
window.showFilterMenu = function (colIndex, el) {
    console.log("Opening filter menu for column:", colIndex);
    if (activeFilterMenu) { closeFilterMenu(); }
    
    const sheetKey = currentSheet;
    let data = (sheetKey === 'portal') ? globalPortalData : (sheetKey === 'sale') ? globalSaleData : globalPurchaseData;
    const uniqueValues = Array.from(new Set(data.slice(1).map(r => String(r[colIndex] || "").trim()))).sort();
    
    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    const rect = el.getBoundingClientRect();
    menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    menu.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 280) + 'px';
    
    menu.innerHTML = `
        <div class="filter-menu-header">
            <span>Filter List</span>
            <div class="filter-close-x" id="filterCloseX">&times;</div>
        </div>
        <div class="filter-search-container">
            <input type="text" class="filter-search-input" placeholder="Search values..." id="filterSearchInput">
        </div>
        <div class="filter-actions-bar">
            <div class="filter-action-link" id="selectAllFilter">Select All</div>
            <div class="filter-action-link" id="unselectAllFilter">Unselect All</div>
        </div>
        <div class="filter-options-list" id="filterOptionsList">
            ${uniqueValues.map(v => `
                <label class="filter-option">
                    <input type="checkbox" value="${v}" checked class="opt-cb">
                    <span>${v || "(Blanks)"}</span>
                </label>
            `).join('')}
        </div>
        <div class="filter-menu-footer">
            <button class="filter-btn filter-btn-clear" id="filterCancelBtn">Cancel</button>
            <button class="filter-btn filter-btn-apply" id="filterApplyBtn">Apply</button>
        </div>
    `;
    
    document.body.appendChild(menu);
    activeFilterMenu = menu;

    // Search logic
    const searchInput = menu.querySelector('#filterSearchInput');
    searchInput.focus();
    searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase();
        const options = menu.querySelectorAll('.filter-option');
        options.forEach(opt => {
            const txt = opt.querySelector('span').textContent.toLowerCase();
            opt.style.display = txt.includes(query) ? 'flex' : 'none';
        });
    };

    // Button actions
    menu.querySelector('#filterCloseX').onclick = () => closeFilterMenu();
    menu.querySelector('#filterCancelBtn').onclick = () => closeFilterMenu();
    menu.querySelector('#filterApplyBtn').onclick = () => applyColFilter(colIndex);

    menu.querySelector('#selectAllFilter').onclick = () => {
        menu.querySelectorAll('.opt-cb').forEach(cb => {
            if (cb.parentElement.style.display !== 'none') cb.checked = true;
        });
    };
    menu.querySelector('#unselectAllFilter').onclick = () => {
        menu.querySelectorAll('.opt-cb').forEach(cb => {
            if (cb.parentElement.style.display !== 'none') cb.checked = false;
        });
    };

    // Prevent propagation
    menu.onclick = (e) => e.stopPropagation();
};

window.closeFilterMenu = () => {
    if (activeFilterMenu) {
        document.body.removeChild(activeFilterMenu);
        activeFilterMenu = null;
    }
};

window.applyColFilter = (colIndex) => {
    console.log("Applying filter for column:", colIndex);
    if (!activeFilterMenu) return;
    const selected = Array.from(activeFilterMenu.querySelectorAll('.opt-cb:checked')).map(cb => cb.value);
    globalFilters[currentSheet][colIndex] = selected;
    closeFilterMenu();
    runFilterLogic();
};

window.runFilterLogic = function () {
    console.log("Running filter logic for", currentSheet);
    const d = (currentSheet === 'portal') ? globalPortalData : (currentSheet === 'sale') ? globalSaleData : globalPurchaseData;
    if (!d || d.length <= 1) { globalFilteredData = [...d]; renderTable(); return; }
    
    let filtered = d.slice(1);
    if (!globalFilters[currentSheet]) globalFilters[currentSheet] = {};
    for (const [idx, sel] of Object.entries(globalFilters[currentSheet])) {
        const colIdx = parseInt(idx);
        filtered = filtered.filter(r => sel.includes(String(r[colIdx] || "").trim()));
    }
    
    const q = document.getElementById('searchInput').value.toLowerCase();
    if (q) filtered = filtered.filter(r => r.some(c => String(c || "").toLowerCase().includes(q)));
    
    globalFilteredData = [d[0], ...filtered];
    renderTable();
};

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-trigger')) {
        e.stopPropagation();
        window.showFilterMenu(parseInt(e.target.getAttribute('data-col')), e.target);
    }
});

function escapeHTML(s) { return s ? String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])) : ""; }
