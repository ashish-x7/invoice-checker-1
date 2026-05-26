// --- Auth Dashboard Login/Register Logic ---

// --- Navigation Logic ---
const showBox = (id) => {
  document.querySelectorAll('.auth-box, .dashboard-box').forEach(box => box.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  if (id === 'dashboard-view') {
    document.body.classList.add('dashboard-active');
  } else {
    document.body.classList.remove('dashboard-active');
  }
};

document.getElementById('goto-register').onclick = () => showBox('register-form');
document.getElementById('goto-forget').onclick = () => showBox('forget-form');
document.getElementById('goto-login-from-reg').onclick = () => showBox('login-form');
document.getElementById('goto-login-from-forget').onclick = () => showBox('login-form');

// --- Toast Helpers ---
const showToast = (msg, type = 'success') => {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
};

// --- Storage Adapter ---
const extensionStorageAvailable = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

const storage = {
  get: async (keys) => {
    if (extensionStorageAvailable) {
      return await chrome.storage.local.get(keys);
    }

    return new Promise((resolve) => {
      const result = {};
      if (typeof keys === 'string') {
        const value = localStorage.getItem(keys);
        result[keys] = value ? JSON.parse(value) : null;
      } else if (Array.isArray(keys)) {
        keys.forEach((k) => {
          const value = localStorage.getItem(k);
          result[k] = value ? JSON.parse(value) : null;
        });
      } else if (keys && typeof keys === 'object') {
        Object.keys(keys).forEach((k) => {
          const value = localStorage.getItem(k);
          result[k] = value !== null ? JSON.parse(value) : keys[k];
        });
      }
      resolve(result);
    });
  },
  set: async (items) => {
    if (extensionStorageAvailable) {
      return await chrome.storage.local.set(items);
    }

    Object.keys(items).forEach((k) => {
      localStorage.setItem(k, JSON.stringify(items[k]));
    });
  },
  remove: async (keys) => {
    if (extensionStorageAvailable) {
      return await chrome.storage.local.remove(keys);
    }

    if (typeof keys === 'string') {
      localStorage.removeItem(keys);
    } else if (Array.isArray(keys)) {
      keys.forEach((k) => localStorage.removeItem(k));
    }
  }
};

// --- Session Management ---
let sessionTimer;
let isApiRevealed = false;
let globalApiCount = "****";
let sessionPasswordCache = "";
let cachedUsersPayload = null;
window.CACHED_USER_STATS = []; // For User Deep-Dive feature

const getStoredNickname = async () => {
  if (extensionStorageAvailable) {
    const result = await chrome.storage.local.get('nickname');
    if (result && result.nickname && result.nickname.toString().trim()) {
      return result.nickname.toString().trim();
    }
    return null;
  }

  const rawNickname = localStorage.getItem('nickname');
  if (!rawNickname) return null;

  try {
    const nickname = JSON.parse(rawNickname);
    return nickname && nickname.toString().trim() ? nickname.toString().trim() : null;
  } catch {
    return rawNickname.toString().trim() || null;
  }
};

const checkSession = async () => {
  if (!extensionStorageAvailable) {
    showToast('Extension storage API not found. Load this page through the extension popup or reload the extension in chrome://extensions.', 'warning');
    console.warn('chrome.storage.local is undefined. Running with browser localStorage fallback for session data.');
  }
  const { session } = await storage.get('session');
  if (session) {
    const now = Date.now();
    const expiry = session.timestamp + (6 * 60 * 60 * 1000); // 6 Hours
    if (now < expiry) {
      const preferredName = await getStoredNickname() || session.nickName || 'User';
      const authNameElement = document.getElementById('authUserNameDisplay');
      if (authNameElement) {
        authNameElement.innerText = preferredName.toUpperCase();
      }
      session.access = normalizeAccess(session.access || {});
      startTimer(expiry);
      showDashboard(session.access, session.role || "USER");
      return true;
    } else {
      await storage.remove('session');
      showToast('Session Expired. Please login again.', 'error');
    }
  }
  showBox('login-form');
  return false;
};

const startTimer = (expiry) => {
  if (sessionTimer) clearInterval(sessionTimer);
  const update = () => {
    const now = Date.now();
    const diff = expiry - now;
    if (diff <= 0) {
      clearInterval(sessionTimer);
      checkSession();
      return;
    }
    const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    document.getElementById('timer').innerText = `${h}:${m}:${s}`;
  };
  update();
  sessionTimer = setInterval(update, 1000);
};

// --- API Calls ---
const apiCall = async (payload) => {
  return await window.apiBridge(payload);
};

const normalizeOkNo = (value) => String(value || "NO").trim().toUpperCase() === "OK" ? "OK" : "NO";

const normalizeAccess = (rawAccess = {}) => {
  const access = rawAccess || {};
  const normalized = {
    AMAZON_INVOICE: normalizeOkNo(access.AMAZON_INVOICE || access.amazon_invoice),
    AMAZON_RETURN: normalizeOkNo(access.AMAZON_RETURN || access.amazon_return),
    AJIO_INVOICE: normalizeOkNo(access.AJIO_INVOICE || access.ajio_invoice),
    AJIO_RETURN: normalizeOkNo(access.AJIO_RETURN || access.ajio_return),
    MYNTRA_INVOICE: normalizeOkNo(access.MYNTRA_INVOICE || access.myntra_invoice),
    MYNTRA_RETURN: normalizeOkNo(access.MYNTRA_RETURN || access.myntra_return)
  };

  ["AMAZON", "AJIO", "MYNTRA"].forEach((platform) => {
    if (access[platform] && normalized[`${platform}_INVOICE`] === "NO" && normalized[`${platform}_RETURN`] === "NO") {
      normalized[`${platform}_INVOICE`] = normalizeOkNo(access[platform]);
      normalized[`${platform}_RETURN`] = normalizeOkNo(access[platform]);
    }
    normalized[platform] = (normalized[`${platform}_INVOICE`] === "OK" || normalized[`${platform}_RETURN`] === "OK") ? "OK" : "NO";
  });

  return normalized;
};

const hasPlatformAccess = (access, platform) => {
  const normalized = normalizeAccess(access);
  return normalized[`${platform}_INVOICE`] === "OK" || normalized[`${platform}_RETURN`] === "OK";
};

const hasModuleAccess = (access, platform, moduleName) => {
  const normalized = normalizeAccess(access);
  return normalized[`${platform}_${moduleName}`] === "OK";
};

const getExtensionPageUrl = (relativePath) => {
  const cleanPath = String(relativePath || "").replace(/^\/+/, "");
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    const runtimeUrl = chrome.runtime.getURL(cleanPath);
    if (/^chrome-extension:\/\//i.test(runtimeUrl)) return runtimeUrl;
  }
  return `${window.location.origin}/${cleanPath}`;
};

// Update API Display across dashboard
const updateGlobalAPI = async () => {
  if (typeof window.syncApiDisplay === 'function') {
    const count = await window.fetchGlobalApiLimit();
    if (count !== null) {
      globalApiCount = count.toLocaleString();
      if (isApiRevealed) {
        const el = document.getElementById('api-count');
        el.textContent = globalApiCount;
        el.style.color = count < 500 ? '#e74c3c' : '#27ae60';
      }
    } else if (isApiRevealed) {
      const el = document.getElementById('api-count');
      globalApiCount = "Unavailable";
      el.textContent = globalApiCount;
      el.style.color = '#ef4444';
    }
  }
};

// --- Registration ---
document.getElementById('register-submit-btn').onclick = async () => {
  const userId = document.getElementById('reg-user-id').value.trim();
  const nickName = document.getElementById('reg-nickname').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  if (!userId || !nickName || !password) return showToast("Please fill all fields", "error");

  showToast("Registering...", "success");
  const result = await apiCall({ action: "register", userId, nickName, password });
  
  if (result === "Registration Success") {
    showToast("Registration Successful! Please Login.");
    showBox('login-form');
  } else {
    showToast(result || "Registration Failed", "error");
  }
};

// --- Login ---
document.getElementById('login-btn').onclick = async () => {
  const userId = document.getElementById('login-user-id').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!userId || !password) return showToast("Please fill all fields", "error");

  showToast("Authenticating...", "success");
  console.log("[DEBUG] Login Attempt:", { userId, passwordLength: password.length });
  const result = await apiCall({ action: "login", userId, password });
  console.log("[DEBUG] Login Result Raw:", result);

  try {
    const data = JSON.parse(result);
    console.log("[DEBUG] Login Parsed Response:", data);
    if (data && data.notificationDebug) {
      console.log("[DEBUG] Login Notification Status:", data.notificationDebug);
    }
    if (data.status === "Success") {
      sessionPasswordCache = password;
      const sessionData = {
        userId,
        nickName: data.nickName,
        role: (data.role || "USER").toUpperCase(),
        access: normalizeAccess(data.access),
        timestamp: Date.now()
      };
      await storage.set({ session: sessionData, nickname: data.nickName });
      showToast(`Welcome back, ${data.nickName}!`);
      if (data.notificationDebug && data.notificationDebug.ok === false) {
        console.warn("[DEBUG] Login notification failed:", data.notificationDebug);
      }
      checkSession();
      updateGlobalAPI();
    } else {
      showToast("Invalid Credentials", "error");
    }
  } catch (e) {
    showToast(result || "Login Failed", "error");
  }
};

// --- Password Reset ---
document.getElementById('reset-submit-btn').onclick = async () => {
  const userId = document.getElementById('forget-user-id').value.trim();
  const oldPassword = document.getElementById('forget-old-password').value.trim();
  const newPassword = document.getElementById('forget-new-password').value.trim();
  const confirmPassword = document.getElementById('forget-confirm-password').value.trim();

  if (!userId || !oldPassword || !newPassword || !confirmPassword) {
    return showToast("Fill all fields", "error");
  }
  if (newPassword !== confirmPassword) {
    return showToast("Passwords do not match", "error");
  }

  showToast("Updating password...", "success");
  const result = await apiCall({ action: "forgetPassword", userId, oldPassword, newPassword });

  if (result === "Password Updated Successfully") {
    showToast("Success! Please login with your new password.");
    showBox('login-form');
  } else {
    showToast(result || "Update Failed", "error");
  }
};


// --- Dashboard Logic ---
const showDashboard = (access, role) => {
  access = normalizeAccess(access);
  showBox('dashboard-view');
  updateGlobalAPI(); // Load API count immediately when dashboard shows

  const manageBtn = document.getElementById('manage-users-btn');
  const masterSheetBtn = document.getElementById('masterSheetLink');
  const exportBtn = document.getElementById('main-export-btn');

  const isAdmin = String(role || "").trim().toUpperCase() === "ADMIN";
  
  if (manageBtn) manageBtn.classList.toggle('hidden', !isAdmin);
  if (masterSheetBtn) masterSheetBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  if (exportBtn) exportBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  
  // Update Indicators -> Sidebar items
  let firstAccessible = null;
  ['AMAZON', 'AJIO', 'MYNTRA'].forEach(p => {
    const pKey = p.toLowerCase();
    const card = document.getElementById(`card-${pKey}`);
    if (!card) return;
    const isOk = hasPlatformAccess(access, p);
    
    // Lock Logic: Blur and add small lock icon for sidebar
    if (!isOk) {
      card.classList.add('locked');
      if (!card.querySelector('.lock-overlay')) {
        const lock = document.createElement('div');
        lock.className = 'lock-overlay';
        lock.style.width = '24px';
        lock.style.height = '24px';
        lock.style.right = '12px';
        lock.style.left = 'auto';
        lock.style.transform = 'translateY(-50%)';
        lock.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
        card.appendChild(lock);
      }
    } else {
      card.classList.remove('locked');
      const lock = card.querySelector('.lock-overlay');
      if (lock) lock.remove();
      if (!firstAccessible) firstAccessible = p;
    }
  });

  // Global card is always unlocked if at least one platform is accessible
  const globalCard = document.getElementById('card-global');
  if (globalCard && !firstAccessible) {
    globalCard.classList.add('locked');
  } else if (globalCard) {
    globalCard.classList.remove('locked');
  }

  if (firstAccessible) {
    selectPlatform(firstAccessible);
  }
};

let currentPlatform = null;
let insightsLastData = null;
let currentVendorFilter = null;
let currentInsightsTab = 'GLOBAL'; // 'GLOBAL' | 'USER' | 'VENDOR'
window.CACHED_VENDOR_DASHBOARD = null;

const selectPlatform = async (platform) => {
  if (!platform) return;
  currentPlatform = platform;
  document.querySelectorAll('.sidebar-item').forEach(c => c.classList.remove('active'));
  const cardId = `card-${platform.toLowerCase()}`;
  const card = document.getElementById(cardId);
  if (card) card.classList.add('active');
  const globalAnalyticsBtn = document.getElementById('globalAnalyticsBtn');
  if (globalAnalyticsBtn) globalAnalyticsBtn.classList.toggle('active', platform === 'GLOBAL');

  const subtitle = document.getElementById('insightsSubtitle');
  if(subtitle) subtitle.textContent = `Loading Insights for ${platform}...`;
  
  if (currentInsightsTab === 'USER') {
      await loadUserPerformanceInsights();
  } else if (currentInsightsTab === 'VENDOR') {
      await loadVendorDashboard(platform);
  } else {
      await loadInsights(platform);
  }
};

const switchInsightsTab = (tab) => {
    currentInsightsTab = tab;
    const globalBtn = document.getElementById('insTabGlobalBtn');
    const userBtn = document.getElementById('insTabUserBtn');
    const vendorBtn = document.getElementById('insTabVendorBtn');
    const globalView = document.getElementById('insGlobalView');
    const userView = document.getElementById('insUserView');
    const vendorView = document.getElementById('insVendorView');

    if (globalBtn) globalBtn.classList.toggle('active', tab === 'GLOBAL');
    if (userBtn) userBtn.classList.toggle('active', tab === 'USER');
    if (vendorBtn) vendorBtn.classList.toggle('active', tab === 'VENDOR');

    if (globalView) globalView.style.display = tab === 'GLOBAL' ? 'block' : 'none';
    if (userView) userView.style.display = tab === 'USER' ? 'block' : 'none';
    if (vendorView) vendorView.style.display = tab === 'VENDOR' ? 'block' : 'none';

    if (tab === 'USER') {
        loadUserPerformanceInsights();
    } else if (tab === 'VENDOR') {
        loadVendorDashboard(currentPlatform || 'GLOBAL');
    } else if (currentPlatform) {
        loadInsights(currentPlatform);
    }
};

document.getElementById('insTabGlobalBtn').onclick = () => switchInsightsTab('GLOBAL');
document.getElementById('insTabUserBtn').onclick = () => switchInsightsTab('USER');
document.getElementById('insTabVendorBtn').onclick = () => switchInsightsTab('VENDOR');
const globalAnalyticsBtn = document.getElementById('globalAnalyticsBtn');
if (globalAnalyticsBtn) {
  globalAnalyticsBtn.onclick = async () => {
    if (currentPlatform !== 'GLOBAL') await selectPlatform('GLOBAL');
  };
}

// Handle Sidebar Click
document.querySelectorAll('.sidebar-item').forEach(card => {
  card.onclick = async () => {
    if (card.classList.contains('locked')) {
      showAccessDeniedModal();
      return;
    }
    const platform = card.getAttribute('data-platform');
    if (currentPlatform !== platform) selectPlatform(platform);
  };
});

// --- Insights Fetching Logic ---
function setInsightsStatus(msg, type) {
  const el = document.getElementById('insightsStatus');
  if(el) {
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#64748b';
  }
}

async function loadInsights(platform) {
  if (!platform) return Promise.resolve();
  if (platform === "GLOBAL") return loadGlobalInsights();

  const select = document.getElementById('insightsRowLimit');
  const groupSelect = document.getElementById('insightsDateGroup');
  
  let requested = parseInt(select ? select.value : "1000", 10);
  let groupBy = groupSelect ? groupSelect.value : "MONTH"; 
  
  setInsightsStatus(`Fetching ${platform} Data...`, "info");
  
  if (typeof window.consumeGlobalApiCredit === 'function') {
      await window.consumeGlobalApiCredit(1);
  }

  const raw = await window.apiBridge({ action: "getInsights", sheetName: platform, maxRows: requested, groupBy: groupBy, vendorFilter: currentVendorFilter || "" });
  return new Promise((resolve) => {
      try {
          const parsed = JSON.parse(raw);
          insightsLastData = { payload: parsed, requestedLimit: requested, platform: platform };
          renderInsightsLocally(parsed, requested);
          resolve(parsed);
      } catch (e) {
          console.error("Platform Insights Parse Error:", e, raw);
          setInsightsStatus("Error: Failed to parse data.", "error");
          resolve(null);
      }
  });
}

async function loadGlobalInsights() {
    setInsightsStatus(`Fetching Global Analytics...`, "info");
    if (typeof window.consumeGlobalApiCredit === 'function') {
        await window.consumeGlobalApiCredit(1);
    }
    const raw = await window.apiBridge({ action: "getGlobalInsights", vendorFilter: currentVendorFilter || "" });
    return new Promise((resolve) => {
        try {
            const parsed = JSON.parse(raw);
            renderGlobalInsights(parsed);
            resolve(parsed);
        } catch (e) {
            console.error("Global Insights Parse Error:", e, raw);
            setInsightsStatus("Error: Failed to parse Global data.", "error");
            resolve(null);
        }
    });
}

async function loadUserPerformanceInsights() {
    setInsightsStatus(`Fetching User Performance Data...`, "info");
    const sub = document.getElementById('insightsSubtitle');
    if (sub) sub.textContent = `User Wise Productivity & Disputes`;

    const userView = document.getElementById('insUserView');
    let loadingOverlay = null;
    if (userView) {
        // Prepare container for overlay
        userView.style.position = 'relative';
        
        // Remove existing overlays if any
        userView.querySelectorAll('.ins-loading-overlay').forEach(ov => ov.remove());
        
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'ins-loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="ins-spinner-large"></div>
            <div class="ins-loading-text">Analyzing Team Performance...</div>
            <div style="font-size: 11px; margin-top: 8px; color: #64748b; font-weight: 600;">Processing 6,000+ records</div>
        `;
        userView.appendChild(loadingOverlay);
    }

    try {
        const raw = await window.apiBridge({ action: "getUserInsights" });
        const parsed = JSON.parse(raw);
        
        if (parsed.status === "Success") {
            // Wait slightly for UI to render the loader, then process heavy data
            setTimeout(() => {
                renderUserInsights(parsed.userStats || [], parsed.peakHours || {});
                if (loadingOverlay) loadingOverlay.remove();
                setInsightsStatus("User analytics updated.", "success");
            }, 400); 
            return parsed;
        } else {
            if (loadingOverlay) loadingOverlay.remove();
            setInsightsStatus("Failed to load user data.", "error");
            return null;
        }
    } catch (e) {
        if (loadingOverlay) loadingOverlay.remove();
        console.error("User Insights Error:", e);
        setInsightsStatus("Error: Failed to fetch user performance.", "error");
        return null;
    }
}

function renderUserInsights(stats, peakHoursData) {
    const leaderboard = document.getElementById('userLeaderboardContent');
    const teamAvgKPI = document.getElementById('teamAverageKPI');
    const teamIntKPI = document.getElementById('teamIntegrityKPI');
    const activeUsersKPI = document.getElementById('activeUsersKPI');
    
    if (!leaderboard) return;

    if (!stats || stats.length === 0) {
        leaderboard.innerHTML = `<div style="padding: 40px; text-align: center; color: #94a3b8;">No user performance data found.</div>`;
        return;
    }

    // --- CALCULATE GLOBAL KPIS ---
    const totalInvoices = stats.reduce((acc, u) => acc + u.totalRows, 0);
    const totalDisputes = stats.reduce((acc, u) => acc + u.disputeRows, 0);
    const avgRows = Math.round(totalInvoices / stats.length);
    const teamIntegrity = totalInvoices > 0 ? (((totalInvoices - totalDisputes) / totalInvoices) * 100).toFixed(1) : 0;
    
    if (teamAvgKPI) teamAvgKPI.textContent = avgRows.toLocaleString();
    if (teamIntKPI) teamIntKPI.textContent = `${teamIntegrity}%`;
    if (activeUsersKPI) activeUsersKPI.textContent = stats.length;
    
    // Cache for spotlight
    window.TEAM_AVERAGE_INV = avgRows;

    // --- RENDER LEADERBOARD ---
    // Sort by Total Rows
    const sorted = [...stats].sort((a, b) => b.totalRows - a.totalRows);

    let html = `
        <table style="width: 100%; border-collapse: collapse; font-family: Outfit;">
            <thead style="background: #f8fafc; position: sticky; top: 0;">
                <tr style="text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase;">
                    <th style="padding: 12px;">Rank & User</th>
                    <th style="padding: 12px; text-align: center;">Total Rows</th>
                    <th style="padding: 12px; text-align: center;">Disputes</th>
                    <th style="padding: 12px; text-align: center;">Dispute Rate</th>
                    <th style="padding: 12px;">Top Platforms</th>
                </tr>
            </thead>
            <tbody>
    `;

    sorted.forEach((u, i) => {
        const rate = u.totalRows > 0 ? ((u.disputeRows / u.totalRows) * 100).toFixed(1) : 0;
        const rateColor = rate > 10 ? '#ef4444' : rate > 5 ? '#f59e0b' : '#10b981';
        let rankContent = i + 1;
        if (i === 0) rankContent = '🥇';
        else if (i === 1) rankContent = '🥈';
        else if (i === 2) rankContent = '🥉';
        
        const rankColor = i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#e2e8f0';

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                <td style="padding: 12px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 28px; height: 28px; background: ${i < 3 ? 'transparent' : rankColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${i < 3 ? '#000' : '#fff'}; font-size: ${i < 3 ? '18px' : '11px'}; font-weight: 800;">${rankContent}</div>
                    <span style="font-weight: 700; color: #1e293b;">${u.nickname}</span>
                </td>
                <td style="padding: 12px; text-align: center; font-weight: 700; color: #475569;">${u.totalRows.toLocaleString()}</td>
                <td style="padding: 12px; text-align: center; color: #ef4444; font-weight: 700;">${u.disputeRows.toLocaleString()}</td>
                <td style="padding: 12px; text-align: center;">
                    <span style="background: ${rateColor}15; color: ${rateColor}; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">${rate}%</span>
                </td>
                <td style="padding: 12px;">
                    <div style="display: flex; gap: 6px;">
                        ${u.amazon > 0 ? '<span title="Amazon" style="width: 8px; height: 8px; background: #ff9900; border-radius: 50%;"></span>' : ''}
                        ${u.ajio > 0 ? '<span title="Ajio" style="width: 8px; height: 8px; background: #1e3a8a; border-radius: 50%;"></span>' : ''}
                        ${u.myntra > 0 ? '<span title="Myntra" style="width: 8px; height: 8px; background: #ec4899; border-radius: 50%;"></span>' : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    leaderboard.innerHTML = html;

    // Charts
    if (window.InsightsCharts) {
        const prodCanvas = document.getElementById('userProductivityChart');
        if (prodCanvas) {
            const chartData = sorted.slice(0, 8).map(u => ({
                label: u.nickname,
                sale: u.totalRows,
                purchase: u.disputeRows
            }));
            window.InsightsCharts.drawBarChart(prodCanvas, chartData, {
                barTop: '#6366f1',
                barBottom: '#ef4444',
                saleLabel: 'Total Invoices',
                purchaseLabel: 'Disputes'
            });
        }

        const workloadCont = document.getElementById('userPlatformWorkload');
        if (workloadCont) {
            workloadCont.innerHTML = sorted.slice(0, 4).map(u => {
                const total = u.amazon + u.ajio + u.myntra;
                const amzP = total > 0 ? (u.amazon/total*100).toFixed(0) : 0;
                const ajiP = total > 0 ? (u.ajio/total*100).toFixed(0) : 0;
                const mynP = total > 0 ? (u.myntra/total*100).toFixed(0) : 0;

                return `
                    <div style="flex: 1; min-width: 200px; background: #f8fafc; padding: 12px; border-radius: 10px;">
                        <div style="font-weight: 800; font-size: 12px; margin-bottom: 8px; color: #1e293b;">${u.nickname}</div>
                        <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                            <div style="width: ${amzP}%; background: #ff9900;" title="Amazon: ${amzP}%"></div>
                            <div style="width: ${ajiP}%; background: #1e3a8a;" title="Ajio: ${ajiP}%"></div>
                            <div style="width: ${mynP}%; background: #ec4899;" title="Myntra: ${mynP}%"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; font-weight: 600;">
                            <span>AMZ: ${amzP}%</span>
                            <span>AJI: ${ajiP}%</span>
                            <span>MYN: ${mynP}%</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // --- NEW: Global Platform Pie Chart for the Team ---
        const platformPieCanvas = document.getElementById('userPlatformPieChart');
        if (platformPieCanvas) {
            let teamAmazon = 0, teamAjio = 0, teamMyntra = 0;
            stats.forEach(u => {
                teamAmazon += (u.amazon || 0);
                teamAjio += (u.ajio || 0);
                teamMyntra += (u.myntra || 0);
            });

            const pieData = [
                { label: 'Amazon', value: teamAmazon },
                { label: 'Ajio', value: teamAjio },
                { label: 'Myntra', value: teamMyntra }
            ];

            window.InsightsCharts.drawPieChart(platformPieCanvas, pieData, {
                colors: ["#ff9900", "#1e3a8a", "#ec4899"] // Matching platform colors
            });
        }

        // --- NEW: Peak Performance Hours Chart ---
        const peakCanvas = document.getElementById('teamPeakHoursChart');
        if (peakCanvas && peakHoursData) {
            const peakLabels = Object.keys(peakHoursData).sort();
            const peakItems = peakLabels.map(h => ({
                label: h + ":00",
                value: peakHoursData[h]
            }));
            window.InsightsCharts.drawBarChart(peakCanvas, peakItems, {
                barTop: "#8b5cf6",
                barBottom: "rgba(139, 92, 246, 0.4)"
            });
        }
    }

    // --- POPULATE DEEP-DIVE DROPDOWN ---
    window.CACHED_USER_STATS = stats;
    const deepDiveSelect = document.getElementById('userDeepDiveSelect');
    if (deepDiveSelect) {
        const currentSelection = deepDiveSelect.value;
        deepDiveSelect.innerHTML = '<option value="">-- Select User --</option>';
        sorted.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.nickname;
            opt.textContent = u.nickname;
            deepDiveSelect.appendChild(opt);
        });
        if (currentSelection) deepDiveSelect.value = currentSelection;
    }
}

async function loadVendorDashboard(platform) {
    setInsightsStatus(`Fetching vendor activity for ${platform || 'GLOBAL'}...`, "info");
    const sub = document.getElementById('insightsSubtitle');
    if (sub) sub.textContent = `Vendor activity, repeat pushes, inactivity alerts`;

    try {
        const raw = await window.apiBridge({
            action: "getVendorDashboard",
            platform: platform || "GLOBAL",
            maxRows: parseInt(document.getElementById('insightsRowLimit')?.value || "5000", 10)
        });

        if (!raw) {
            renderVendorDashboardEmpty("Vendor Apps Script URL configure karna baaki hai.");
            setInsightsStatus("Vendor URL not configured.", "error");
            return null;
        }

        const parsed = JSON.parse(raw);
        if (parsed.status !== "Success") {
            renderVendorDashboardEmpty(parsed.message || "Vendor dashboard unavailable.");
            setInsightsStatus("Vendor dashboard fetch failed.", "error");
            return null;
        }

        window.CACHED_VENDOR_DASHBOARD = parsed;
        renderVendorDashboard(parsed);
        setInsightsStatus("Vendor dashboard updated.", "success");
        return parsed;
    } catch (e) {
        console.error("Vendor Dashboard Error:", e);
        renderVendorDashboardEmpty("Vendor dashboard parse error.");
        setInsightsStatus("Error: Failed to fetch vendor dashboard.", "error");
        return null;
    }
}

function renderVendorDashboardEmpty(message) {
    const table = document.getElementById('vendorDashboardTable');
    const alerts = document.getElementById('vendorAlertList');
    const usage = document.getElementById('vendorUserUsage');
    if (table) table.innerHTML = `<div style="padding: 30px; text-align: center; color: #94a3b8;">${message}</div>`;
    if (alerts) alerts.innerHTML = `<div style="padding: 18px; text-align: center; color: #94a3b8; font-weight: 700;">${message}</div>`;
    if (usage) usage.innerHTML = `<div style="padding: 22px; text-align: center; color: #94a3b8; width: 100%;">${message}</div>`;
}

function renderVendorDashboard(payload) {
    const summary = payload.summary || {};
    const statusCounts = payload.statusCounts || {};
    const vendors = payload.vendors || [];
    const staleVendors = payload.staleVendors || [];
    const userUsage = payload.userUsage || [];

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('vendorTotalKPI', (summary.vendors || 0).toLocaleString());
    setText('vendorOrangeKPI', (statusCounts.orange || 0).toLocaleString());
    setText('vendorRedKPI', (statusCounts.red || 0).toLocaleString());
    setText('vendorPushKPI', (summary.pushEvents || 0).toLocaleString());
    setText('vendorBusinessKPI', `₹${window.InsightsCharts ? window.InsightsCharts.formatINR(summary.business || 0) : (summary.business || 0)}`);

    const chartCanvas = document.getElementById('vendorBusinessChart');
    if (chartCanvas && window.InsightsCharts) {
        window.InsightsCharts.drawBarChart(chartCanvas, (payload.topBusinessVendors || []).slice(0, 8), {
            barTop: '#0ea5e9',
            barBottom: 'rgba(14, 165, 233, 0.25)'
        });
    }

    const alerts = document.getElementById('vendorAlertList');
    if (alerts) {
        if (!staleVendors.length) {
            alerts.innerHTML = `<div style="padding: 18px; text-align: center; color: #94a3b8; font-weight: 700;">All vendors are active.</div>`;
        } else {
            alerts.innerHTML = staleVendors.map(v => `
                <div style="padding: 14px; border-radius: 14px; border: 1px solid ${v.status === 'RED' ? '#fca5a5' : '#fdba74'}; background: ${v.status === 'RED' ? '#fef2f2' : '#fff7ed'};">
                    <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center;">
                        <div>
                            <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${v.vendorName}</div>
                            <div style="font-size: 11px; color: #64748b; font-weight: 700;">${v.platform} • Last User: ${v.lastUser || '-'}</div>
                        </div>
                        <div style="font-size: 11px; font-weight: 800; color: ${v.status === 'RED' ? '#dc2626' : '#ea580c'};">${v.daysIdle} days idle</div>
                    </div>
                </div>
            `).join('');
        }
    }

    const table = document.getElementById('vendorDashboardTable');
    if (table) {
        table.dataset.vendors = JSON.stringify(vendors);
        renderVendorDashboardTable(vendors);
    }

    const usage = document.getElementById('vendorUserUsage');
    if (usage) {
        if (!userUsage.length) {
            usage.innerHTML = `<div style="padding: 22px; text-align: center; color: #94a3b8; width: 100%;">No user activity found for vendors.</div>`;
        } else {
            usage.innerHTML = userUsage.map(item => `
                <div style="flex: 1; min-width: 220px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${item.user}</div>
                        <div style="font-size: 11px; font-weight: 800; color: #2563eb;">${item.pushes} pushes</div>
                    </div>
                    <div style="font-size: 11px; color: #64748b; font-weight: 700;">Top Vendor: ${item.topVendor || '-'}</div>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 11px; color: #475569; font-weight: 700;">
                        <span>${item.vendors} vendors</span>
                        <span>${item.invoices} rows</span>
                        <span>₹${window.InsightsCharts ? window.InsightsCharts.formatINR(item.business || 0) : item.business || 0}</span>
                    </div>
                </div>
            `).join('');
        }
    }
}

function renderVendorDashboardTable(vendors) {
    const table = document.getElementById('vendorDashboardTable');
    if (!table) return;

    const search = (document.getElementById('vendorDashboardSearch')?.value || '').trim().toLowerCase();
    const filtered = (vendors || []).filter(v => {
        if (!search) return true;
        return [v.vendorName, v.platform, v.lastUser, (v.topUser && v.topUser.user) || ''].join(' ').toLowerCase().includes(search);
    });

    if (!filtered.length) {
        table.innerHTML = `<div style="padding: 30px; text-align: center; color: #94a3b8;">No matching vendors found.</div>`;
        return;
    }

    table.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-family: Outfit;">
            <thead style="background: #f8fafc; position: sticky; top: 0;">
                <tr style="text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase;">
                    <th style="padding: 12px;">Vendor</th>
                    <th style="padding: 12px; text-align: center;">Rows</th>
                    <th style="padding: 12px; text-align: center;">Pushes</th>
                    <th style="padding: 12px; text-align: center;">Business</th>
                    <th style="padding: 12px;">Last User</th>
                    <th style="padding: 12px;">Top User</th>
                    <th style="padding: 12px; text-align: center;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(v => `
                    <tr style="border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                        <td style="padding: 12px;">
                            <div style="font-weight: 800; color: #0f172a;">${v.vendorName}</div>
                            <div style="font-size: 11px; color: #64748b; font-weight: 700;">${v.platform} • Last invoice: ${formatVendorDate(v.lastInvoiceDate)}</div>
                        </td>
                        <td style="padding: 12px; text-align: center; font-weight: 700;">${(v.invoiceRows || 0).toLocaleString()}</td>
                        <td style="padding: 12px; text-align: center; font-weight: 700; color: #2563eb;">${(v.pushEvents || 0).toLocaleString()}</td>
                        <td style="padding: 12px; text-align: center; font-weight: 700; color: #16a34a;">₹${window.InsightsCharts ? window.InsightsCharts.formatINR(v.business || 0) : v.business || 0}</td>
                        <td style="padding: 12px; font-weight: 700; color: #475569;">${v.lastUser || '-'}</td>
                        <td style="padding: 12px; font-weight: 700; color: #7c3aed;">${v.topUser ? `${v.topUser.user} (${v.topUser.pushes})` : '-'}</td>
                        <td style="padding: 12px; text-align: center;">
                            <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 90px; padding: 6px 10px; border-radius: 999px; background: ${vendorStatusBg(v.status)}; color: ${vendorStatusColor(v.status)}; font-size: 11px; font-weight: 800;">
                                ${v.status} • ${v.daysIdle}d
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function vendorStatusBg(status) {
    if (status === 'RED') return '#fef2f2';
    if (status === 'ORANGE') return '#fff7ed';
    return '#f0fdf4';
}

function vendorStatusColor(status) {
    if (status === 'RED') return '#dc2626';
    if (status === 'ORANGE') return '#ea580c';
    return '#16a34a';
}

function formatVendorDate(value) {
    if (!value) return '-';
    try {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('en-GB');
    } catch {
        return String(value);
    }
}

function renderUserSpotlight(nickname) {
    const reportCont = document.getElementById('userSpotlightReport');
    if (!reportCont) return;

    if (!nickname) {
        reportCont.innerHTML = `
            <div style="padding: 30px; text-align: center; border: 2px dashed #e2e8f0; border-radius: 16px; color: #94a3b8;">
                <span style="font-size: 24px;">👤</span>
                <p style="margin: 8px 0 0; font-size: 13px; font-weight: 600;">Select a user above to generate a report</p>
            </div>
        `;
        return;
    }

    const u = window.CACHED_USER_STATS.find(s => s.nickname === nickname);
    if (!u) return;

    const total = (u.amazon || 0) + (u.ajio || 0) + (u.myntra || 0);
    const disputeRate = u.totalRows > 0 ? ((u.disputeRows / u.totalRows)*100).toFixed(1) : 0;
    
    // --- CALCULATE STARS ---
    const stars = (rate) => {
        const r = parseFloat(rate);
        if (r <= 2) return "⭐⭐⭐⭐⭐";
        if (r <= 5) return "⭐⭐⭐⭐";
        if (r <= 10) return "⭐⭐⭐";
        if (r <= 20) return "⭐⭐";
        return "⭐";
    };

    // --- CALCULATE BADGE ---
    const getBadge = (user) => {
        const counts = [
            { p: 'AMAZON', c: user.amazon || 0 },
            { p: 'AJIO', c: user.ajio || 0 },
            { p: 'MYNTRA', c: user.myntra || 0 }
        ].sort((a,b) => b.c - a.c);
        
        if (counts[0].c === 0) return "New Trainee";
        const top = counts[0].p;
        if (top === 'AMAZON') return "Amazon Titan";
        if (top === 'AJIO') return "Ajio Virtuoso";
        return "Myntra Stylist";
    };

    const efficiency = window.TEAM_AVERAGE_INV > 0 ? (u.totalRows / window.TEAM_AVERAGE_INV).toFixed(1) : 1;

    reportCont.innerHTML = `
        <div style="display: flex; gap: 24px; animation: modalFadeIn 0.3s ease-out; background: #fff; padding: 25px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
            <!-- Column 1: Persona & Accuracy -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 15px; border-right: 1px solid #f1f5f9; padding-right: 20px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 50px; height: 50px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🎖️</div>
                    <div>
                        <div style="font-weight: 900; font-size: 16px; color: #1e293b;">${u.nickname}</div>
                        <div style="font-size: 11px; font-weight: 800; color: #6366f1; text-transform: uppercase;">${getBadge(u)}</div>
                    </div>
                </div>
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 12px;">
                   <div style="font-size: 10px; font-weight: 800; color: #64748b; margin-bottom: 4px;">ACCURACY RATING</div>
                   <div style="font-size: 18px;">${stars(disputeRate)}</div>
                   <div style="font-size: 11px; color: #94a3b8; font-weight: 600; margin-top: 4px;">Current Error Rate: ${disputeRate}%</div>
                </div>

                <div style="background: #f8fafc; padding: 15px; border-radius: 12px;">
                   <div style="font-size: 10px; font-weight: 800; color: #64748b; margin-bottom: 4px;">EFFICIENCY SCORE</div>
                   <div style="font-size: 18px; font-weight: 900; color: #10b981;">${efficiency}x <span style="font-size: 12px; font-weight: 600; color: #94a3b8;">vs Team Avg</span></div>
                </div>
            </div>

            <!-- Column 2: Specific Stats Grid -->
            <div style="flex: 1.5; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 10px; color: #64748b; font-weight: 800; text-transform: uppercase;">Total Row Count</div>
                    <div style="font-size: 22px; font-weight: 950; color: #1e293b; margin-top: 5px;">${u.totalRows.toLocaleString()}</div>
                </div>
                <div style="background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #f1f5f9;">
                    <div style="font-size: 10px; color: #ef4444; font-weight: 800; text-transform: uppercase;">Dispute Count</div>
                    <div style="font-size: 22px; font-weight: 950; color: #ef4444; margin-top: 5px;">${u.disputeRows.toLocaleString()}</div>
                </div>
                <div style="grid-column: span 2; padding: 15px; text-align: center;">
                    <h4 style="margin: 0 0 12px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Platform Workload Share</h4>
                    <canvas id="spotlightPieChart" style="height: 140px; margin: 0 auto;"></canvas>
                </div>
            </div>

            <!-- Column 3: Platform Breakdown -->
            <div style="flex: 0.8; display: flex; flex-direction: column; gap: 10px;">
                <div style="padding: 12px; background: #fff5eb; border-left: 5px solid #ff9900; border-radius: 8px;">
                   <div style="font-weight: 800; font-size: 10px; color: #ff9900;">AMAZON</div>
                   <div style="font-weight: 900; font-size: 18px;">${u.amazon}</div>
                </div>
                <div style="padding: 12px; background: #f0f7ff; border-left: 5px solid #1e3a8a; border-radius: 8px;">
                   <div style="font-weight: 800; font-size: 10px; color: #1e3a8a;">AJIO</div>
                   <div style="font-weight: 900; font-size: 18px;">${u.ajio}</div>
                </div>
                <div style="padding: 12px; background: #fff1f5; border-left: 5px solid #ec4899; border-radius: 8px;">
                   <div style="font-weight: 800; font-size: 10px; color: #ec4899;">MYNTRA</div>
                   <div style="font-weight: 900; font-size: 18px;">${u.myntra}</div>
                </div>
            </div>
        </div>
    `;

    // Render Mini-Pie for selected user
    const spotlightCanvas = document.getElementById('spotlightPieChart');
    if (spotlightCanvas && window.InsightsCharts) {
        window.InsightsCharts.drawPieChart(spotlightCanvas, [
            { label: 'Amazon', value: u.amazon },
            { label: 'Ajio', value: u.ajio },
            { label: 'Myntra', value: u.myntra }
        ], {
            colors: ["#ff9900", "#1e3a8a", "#ec4899"]
        });
    }
}


function renderGlobalInsights(payload) {
    if (!payload || payload.status !== "Success") {
        setInsightsStatus("Failed to load global data.", "error");
        return;
    }

    const sub = document.getElementById('insightsSubtitle');
    if(sub) sub.textContent = `Overall Business Performance`;

    // Hide platform-specific panels, show global ones
    document.getElementById('insightsLineChart').parentElement.style.display = 'none';
    document.getElementById('insightsBarChart').parentElement.style.display = 'none';
    document.getElementById('insightsPieChart').parentElement.style.display = 'none';
    document.getElementById('globalComparisonPanel').style.display = 'block';
    document.getElementById('globalTrendPanel').style.display = 'block';
    document.getElementById('globalSharePanel').style.display = 'block';
    document.getElementById('globalQtyPanel').style.display = 'block';

    const totals = payload.totals || { sale: 0, purchase: 0, qty: 0 };
    const kpiNetDiff = document.getElementById('kpiNetDiff');
    const kpiSale = document.getElementById('kpiSale');
    const kpiPurchase = document.getElementById('kpiPurchase');
    const kpiTotalQty = document.getElementById('kpiTotalQty');
    const kpiProfitMargin = document.getElementById('kpiProfitMargin');

    const netDiff = (totals.sale || 0) - (totals.purchase || 0);
    if (kpiNetDiff) {
        kpiNetDiff.textContent = window.InsightsCharts ? window.InsightsCharts.formatINR(netDiff) : `₹${netDiff}`;
        kpiNetDiff.style.color = netDiff >= 0 ? '#10b981' : '#ef4444';
    }
    if (kpiSale) kpiSale.textContent = window.InsightsCharts ? window.InsightsCharts.formatINR(totals.sale) : totals.sale;
    if (kpiPurchase) kpiPurchase.textContent = window.InsightsCharts ? window.InsightsCharts.formatINR(totals.purchase) : totals.purchase;
    if (kpiTotalQty) kpiTotalQty.textContent = totals.qty.toLocaleString();
    
    const margin = totals.sale > 0 ? (netDiff / totals.sale * 100).toFixed(2) : "0";
    if (kpiProfitMargin) kpiProfitMargin.textContent = `${margin}%`;

    const compCanvas = document.getElementById('globalComparisonChart');
    const trendCanvas = document.getElementById('globalTrendChart');

    if (window.InsightsCharts && compCanvas) {
        window.InsightsCharts.drawGlobalComparisonChart(compCanvas, payload.comparison || []);
    }
    if (window.InsightsCharts && trendCanvas) {
        window.InsightsCharts.drawLineChart(trendCanvas, payload.trend.dates || [], payload.trend.values || [], {
            line: '#8b5cf6',
            fillTop: 'rgba(139, 92, 246, 0.18)',
            fillBottom: 'rgba(139, 92, 246, 0.02)'
        });
    }

    const shareCanvas = document.getElementById('globalShareChart');
    const qtyCanvas = document.getElementById('globalQtyChart');

    if (window.InsightsCharts && shareCanvas) {
        const shareData = (payload.comparison || []).map(it => ({ label: it.label, value: it.sale }));
        window.InsightsCharts.drawPieChart(shareCanvas, shareData, {
            colors: ["#ff9900", "#1e3a8a", "#ec4899"] // Amazon, Ajio, Myntra branding
        });
    }

    if (window.InsightsCharts && qtyCanvas) {
        const qtyData = (payload.comparison || []).map(it => ({ label: it.label, value: it.qty }));
        window.InsightsCharts.drawBarChart(qtyCanvas, qtyData, {
            barTop: "rgba(99, 102, 241, 0.92)",
            barBottom: "rgba(99, 102, 241, 0.40)"
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

    setInsightsStatus("Global dashboard updated.", "success");
}

const rowLimitSelect = document.getElementById('insightsRowLimit');
const dateGroupSelect = document.getElementById('insightsDateGroup');

if (rowLimitSelect) {
  rowLimitSelect.addEventListener('change', () => {
    if (currentPlatform) loadInsights(currentPlatform);
  });
}

if (dateGroupSelect) {
  dateGroupSelect.addEventListener('change', () => {
    if (currentPlatform) loadInsights(currentPlatform);
  });
}

const refreshBtn = document.getElementById('insightsRefreshBtn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    if (!currentPlatform) return;
    if (currentInsightsTab === 'USER') loadUserPerformanceInsights();
    else if (currentInsightsTab === 'VENDOR') loadVendorDashboard(currentPlatform);
    else loadInsights(currentPlatform);
  });
}

function renderInsightsLocally(payload, requestedLimit) {
    if (!payload || payload.status !== "Success") {
        setInsightsStatus((payload && payload.message) ? payload.message : "Failed to load insights.", "error");
        return;
    }

    // Ensure platform panels are visible and global hidden
    document.getElementById('insightsLineChart').parentElement.style.display = 'block';
    document.getElementById('insightsBarChart').parentElement.style.display = 'block';
    document.getElementById('insightsPieChart').parentElement.style.display = 'block';
    document.getElementById('globalComparisonPanel').style.display = 'none';
    document.getElementById('globalTrendPanel').style.display = 'none';
    document.getElementById('globalSharePanel').style.display = 'none';
    document.getElementById('globalQtyPanel').style.display = 'none';

    const platform = payload.sheetName || currentPlatform;
    const sub = document.getElementById('insightsSubtitle');
    if(sub) sub.textContent = `Analytics for ${platform}`;
    
    const totals = payload.totals || { rows: 0, sale: 0, purchase: 0 };
    const series = payload.series || { dates: [], counts: [] };
    const remarks = payload.remarkTop || [];

    const kpiNetDiff = document.getElementById('kpiNetDiff');
    const kpiNetDiffHint = document.getElementById('kpiNetDiffHint');
    const kpiSale = document.getElementById('kpiSale');
    const kpiPurchase = document.getElementById('kpiPurchase');
    const kpiTotalQty = document.getElementById('kpiTotalQty');
    const kpiProfitMargin = document.getElementById('kpiProfitMargin');

    const netDiffValue = (totals.sale || 0) - (totals.purchase || 0);
    if (kpiNetDiff) {
       kpiNetDiff.textContent = window.InsightsCharts ? window.InsightsCharts.formatINR(netDiffValue) : `₹${netDiffValue}`;
       // Make it green if profit, red if loss
       kpiNetDiff.style.color = netDiffValue >= 0 ? '#10b981' : '#ef4444';
    }
    if (kpiNetDiffHint) kpiNetDiffHint.textContent = netDiffValue >= 0 ? "Profit / Positive Gap" : "Loss / Negative Gap";

    if (window.InsightsCharts && kpiSale) kpiSale.textContent = window.InsightsCharts.formatINR(totals.sale || 0);
    if (window.InsightsCharts && kpiPurchase) kpiPurchase.textContent = window.InsightsCharts.formatINR(totals.purchase || 0);

    let marginPct = 0;
    if (totals.sale > 0 && netDiffValue > 0) {
        marginPct = (netDiffValue / totals.sale) * 100;
    }
    if (kpiProfitMargin) {
        kpiProfitMargin.textContent = totals.sale > 0 ? marginPct.toFixed(2) + "%" : "0%";
    }

    if (kpiTotalQty) kpiTotalQty.textContent = totals.qty ? parseInt(totals.qty).toLocaleString('en-IN') : "0";

    const lineCanvas = document.getElementById('insightsLineChart');
    const barCanvas = document.getElementById('insightsBarChart');
    const pieCanvas = document.getElementById('insightsPieChart');

    if (window.InsightsCharts && lineCanvas) {
        window.InsightsCharts.drawLineChart(lineCanvas, series.dates || [], series.counts || [], {
            line: platform === 'MYNTRA' ? '#ec4899' : platform === 'AMAZON' ? '#ff9900' : '#1e3a8a',
            fillTop: platform === 'MYNTRA' ? "rgba(236,72,153,0.18)" : platform === 'AMAZON' ? "rgba(255,153,0,0.18)" : "rgba(30,58,138,0.18)",
            fillBottom: platform === 'MYNTRA' ? "rgba(236,72,153,0.02)" : platform === 'AMAZON' ? "rgba(255,153,0,0.02)" : "rgba(30,58,138,0.02)"
        });
    }

    if (window.InsightsCharts && barCanvas) {
        window.InsightsCharts.drawBarChart(barCanvas, [
            { label: "SALE", value: totals.sale || 0 },
            { label: "PURCHASE", value: totals.purchase || 0 }
        ], {
            barTop: platform === 'MYNTRA' ? "rgba(236,72,153,0.92)" : platform === 'AMAZON' ? "rgba(255,153,0,0.92)" : "rgba(30,58,138,0.92)",
            barBottom: platform === 'MYNTRA' ? "rgba(236,72,153,0.40)" : platform === 'AMAZON' ? "rgba(255,153,0,0.40)" : "rgba(30,58,138,0.40)"
        });
    }

    if (window.InsightsCharts && pieCanvas) {
        window.InsightsCharts.drawPieChart(pieCanvas, remarks || [], {
            colors: platform === 'MYNTRA' ? ["#ec4899", "#8b5cf6", "#14b8a6", "#eab308", "#ef4444", "#3b82f6", "#64748b"] :
                    platform === 'AMAZON' ? ["#ff9900", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"] :
                    ["#1e3a8a", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"]
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

    // --- 1. Compute Analytics (Top 5 Stats + Donut Chart) ---
    const totalRevenue = vendors.reduce((acc, v) => acc + (v.value || 0), 0);
    
    if (statsContainer && totalRevenue > 0) {
        const top5 = [...vendors].sort((a,b) => b.value - a.value).slice(0, 5);
        statsContainer.innerHTML = top5.map((v, i) => {
            const pct = ((v.value / totalRevenue) * 100).toFixed(1);
            const colors = ["#6366f1", "#a855f7", "#ec4899", "#ef4444", "#f59e0b"];
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
            const othersVal = sorted.slice(7).reduce((acc, v) => acc + (v.value || 0), 0);
            chartData.push({ label: "Others", value: othersVal });
        }
        window.InsightsCharts.drawDonutChart(chartCanvas, chartData);
    }

    // --- 2. Render List ---
    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 40px; color: #94a3b8; font-weight: 700;">No matching vendors found</div>`;
    } else {
        const maxVal = Math.max.apply(null, container.allVendors.map(v => v.value).concat([1]));
        container.innerHTML = filtered.map((v, i) => {
            const percent = Math.min(100, Math.max(2, (v.value / maxVal) * 100));
            const avg = v.rows > 0 ? (v.value / v.rows) : 0;
            const isActive = (currentVendorFilter && v.label.toLowerCase() === currentVendorFilter.toLowerCase());

            return `
                <div class="vendor-item" style="${isActive ? 'background: #f5f3ff; border-color: #6366f1;' : ''}" onclick="applyVendorDeepDive('${v.label.replace(/'/g, "\\'")}')">
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
    }

    // Attach search listener once
    if (searchInput && !searchInput.dataset.listening) {
        searchInput.dataset.listening = "true";
        searchInput.addEventListener('input', () => renderVendorLeaderboard(container.allVendors));
    }
}

window.applyVendorDeepDive = async (vendorName) => {
    if (currentVendorFilter === vendorName) return; 
    currentVendorFilter = vendorName;
    
    // Clear search and scroll top
    const searchInput = document.getElementById('vendorSearchInput');
    if (searchInput) searchInput.value = "";

    if (currentPlatform) loadInsights(currentPlatform);
};

window.addEventListener('resize', () => {
    if (insightsLastData) {
        renderInsightsLocally(insightsLastData.payload, insightsLastData.requestedLimit);
    }
});

// --- Handle "Enter Dashboard" button ---
const enterDashBtn = document.getElementById('enter-dashboard-btn');
if (enterDashBtn) {
  enterDashBtn.onclick = async () => {
    if (!currentPlatform) return showToast("Select a platform first", "error");
    
    const { session } = await storage.get('session');
    const access = normalizeAccess(session && session.access ? session.access : {});
    const canInvoice = hasModuleAccess(access, currentPlatform, "INVOICE");
    const canReturn = hasModuleAccess(access, currentPlatform, "RETURN");

    if (!canInvoice && !canReturn) {
      showAccessDeniedModal();
      return;
    }

    const invoiceUrls = {
      AMAZON: 'amazon/INVOICE/amazon.html',
      AJIO: 'ajio/INVOICE/ajio.html',
      MYNTRA: 'myntra/INVOICE/myntra.html'
    };
    const returnUrls = {
      AMAZON: 'amazon/RETURN/amazon_return.html',
      AJIO: 'ajio/RETURN/ajio_return.html',
      MYNTRA: 'myntra/RETURN/myntra_return.html'
    };

    if (canInvoice && !canReturn) {
      showToast(`Launching ${currentPlatform} Invoice Dashboard...`, "success");
      window.location.assign(window.resolveLocalPath(invoiceUrls[currentPlatform]));
      return;
    }

    if (!canInvoice && canReturn) {
      showToast(`Launching ${currentPlatform} Return Dashboard...`, "success");
      window.location.assign(window.resolveLocalPath(returnUrls[currentPlatform]));
      return;
    }

    window.showCustomModal({
      title: `${currentPlatform} Module Selection`,
      message: `Please select which module you would like to open for ${currentPlatform}.`,
      type: 'info',
      confirmText: 'INVOICE',
      cancelText: 'RETURN',
      onConfirm: async () => {
        showToast(`Launching ${currentPlatform} Invoice Dashboard...`, "success");
        if (typeof window.consumeGlobalApiCredit === 'function') {
          await window.consumeGlobalApiCredit();
        }
        window.location.assign(window.resolveLocalPath(invoiceUrls[currentPlatform]));
      }
    }).then((isInvoice) => {
      if (isInvoice === false) {
        showToast(`Launching ${currentPlatform} Return Dashboard...`, "success");
        window.location.assign(window.resolveLocalPath(returnUrls[currentPlatform]));
      }
    });
  };
}

// Logout
document.getElementById('logout-btn').onclick = async () => {
  await storage.remove(['session', 'nickname']);
  location.reload();
};

// Clear Filter logic
document.addEventListener('DOMContentLoaded', () => {
    const clearBtn = document.getElementById('clearVendorFilterBtn');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            currentVendorFilter = null;
            if (currentPlatform) await loadInsights(currentPlatform);
        };
    }

    const vendorSearch = document.getElementById('vendorDashboardSearch');
    if (vendorSearch) {
        vendorSearch.addEventListener('input', () => {
            if (window.CACHED_VENDOR_DASHBOARD) {
                renderVendorDashboardTable(window.CACHED_VENDOR_DASHBOARD.vendors || []);
            }
        });
    }
});

// --- Admin User Manager ---
const userManagerModal = document.getElementById('user-manager-modal');
const userManagerTable = document.getElementById('user-manager-table');
const userManagerStatus = document.getElementById('user-manager-status');
const userManagerSummary = document.getElementById('user-manager-summary');
const adminPasswordInput = document.getElementById('admin-password-input');
const loadUsersBtn = document.getElementById('load-users-btn');
const saveUsersBtn = document.getElementById('save-users-btn');

const setUserManagerStatus = (message, type = 'info') => {
  if (!userManagerStatus) return;
  userManagerStatus.textContent = message || '';
  userManagerStatus.style.color = type === 'error' ? '#991b1b' : type === 'success' ? '#065f46' : '#475569';
};

const normalizeUserManagerError = (message) => {
  const text = String(message || "").trim();
  if (!text) return "Failed to load users.";

  if (text.toLowerCase() === "access denied") {
    return "Access denied. Admin password mismatch hai ya sheet me aapka role ADMIN nahi hai.";
  }

  return text;
};

const renderUserManagerSummary = (users = []) => {
  if (!userManagerSummary) return;

  const total = users.length;
  const admins = users.filter((u) => String(u.ROLE || "USER").toUpperCase() === "ADMIN").length;
  const active = users.filter((u) => hasPlatformAccess(u, "AMAZON") || hasPlatformAccess(u, "AJIO") || hasPlatformAccess(u, "MYNTRA")).length;

  const totalEl = userManagerSummary.querySelector('[data-stat="total"]');
  const adminEl = userManagerSummary.querySelector('[data-stat="admins"]');
  const activeEl = userManagerSummary.querySelector('[data-stat="active"]');
  if (totalEl) totalEl.textContent = String(total);
  if (adminEl) adminEl.textContent = String(admins);
  if (activeEl) activeEl.textContent = String(active);
};

const openUserManager = async () => {
  const { session } = await storage.get('session');
  if (!session) return;
  const isAdmin = String(session.role || "").trim().toUpperCase() === "ADMIN";
  if (!isAdmin) {
    showToast("Admin access required", "error");
    return;
  }

  cachedUsersPayload = null;
  if (userManagerTable) userManagerTable.innerHTML = "";
  renderUserManagerSummary([]);
  if (saveUsersBtn) saveUsersBtn.disabled = true;
  setUserManagerStatus("Enter admin password to load users.");

  if (userManagerModal) userManagerModal.classList.add('active');
  if (adminPasswordInput) adminPasswordInput.focus();
};

const closeUserManager = () => {
  if (userManagerModal) userManagerModal.classList.remove('active');
  setUserManagerStatus("");
  if (userManagerTable) userManagerTable.innerHTML = "";
  renderUserManagerSummary([]);
  cachedUsersPayload = null;
};

const createSelect = (value, options) => {
  const select = document.createElement('select');
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });
  select.value = value;
  return select;
};

const renderUsersTable = async (users) => {
  const { session } = await storage.get('session');
  const currentUserId = session ? String(session.userId || "").trim() : "";

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ["User ID", "Nick Name", "Password", "Amazon Invoice", "Amazon Return", "Ajio Invoice", "Ajio Return", "Myntra Invoice", "Myntra Return", "Role"].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  (users || []).forEach((u) => {
    const tr = document.createElement('tr');
    tr.dataset.userId = String(u.userId || "").trim();

    const tdId = document.createElement('td');
    tdId.textContent = tr.dataset.userId;
    tr.appendChild(tdId);

    const tdNick = document.createElement('td');
    const nickInput = document.createElement('input');
    nickInput.type = 'text';
    nickInput.value = String(u.nickName || "");
    nickInput.className = 'um-nick';
    tdNick.appendChild(nickInput);
    tr.appendChild(tdNick);

    const tdPass = document.createElement('td');
    const pwWrap = document.createElement('div');
    pwWrap.className = 'pw-wrap';
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.value = String(u.password || "");
    passInput.dataset.original = String(u.password || "");
    passInput.className = 'um-pass';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'pw-toggle';
    toggleBtn.textContent = 'Show';
    toggleBtn.onclick = () => {
      const showing = passInput.type === 'text';
      passInput.type = showing ? 'password' : 'text';
      toggleBtn.textContent = showing ? 'Show' : 'Hide';
    };
    pwWrap.appendChild(passInput);
    pwWrap.appendChild(toggleBtn);
    tdPass.appendChild(pwWrap);
    tr.appendChild(tdPass);

    const okNo = ["OK", "NO"];
    [
      { key: 'AMAZON_INVOICE', className: 'um-amazon-invoice' },
      { key: 'AMAZON_RETURN', className: 'um-amazon-return' },
      { key: 'AJIO_INVOICE', className: 'um-ajio-invoice' },
      { key: 'AJIO_RETURN', className: 'um-ajio-return' },
      { key: 'MYNTRA_INVOICE', className: 'um-myntra-invoice' },
      { key: 'MYNTRA_RETURN', className: 'um-myntra-return' }
    ].forEach((field) => {
      const td = document.createElement('td');
      const select = createSelect(String(u[field.key] || "NO").toUpperCase(), okNo);
      select.className = field.className;
      td.appendChild(select);
      tr.appendChild(td);
    });

    const tdRole = document.createElement('td');
    const selRole = createSelect(String(u.ROLE || "USER").toUpperCase(), ["ADMIN", "USER"]);
    selRole.className = 'um-role';
    if (tr.dataset.userId && tr.dataset.userId === currentUserId) {
      selRole.disabled = true; // prevent accidental self lockout via UI
      selRole.value = "ADMIN";
    }
    tdRole.appendChild(selRole);
    tr.appendChild(tdRole);

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  userManagerTable.innerHTML = "";
  userManagerTable.appendChild(table);
};

const loadUsers = async () => {
  const { session } = await storage.get('session');
  if (!session) return;

  const requesterUserId = session.userId;
  const pw = (adminPasswordInput && adminPasswordInput.value) ? adminPasswordInput.value : sessionPasswordCache;
  if (!pw) {
    setUserManagerStatus("Admin password required.", "error");
    if (adminPasswordInput) adminPasswordInput.focus();
    return;
  }

  setUserManagerStatus("Loading users...");
  const result = await apiCall({ action: "getUsers", requesterUserId, requesterPassword: pw });
  console.log("[USER MANAGER] getUsers raw response:", result);
  if (result === null || result === undefined || result === "") {
    setUserManagerStatus("User API unreachable. Reload extension once, then try again.", "error");
    return;
  }
  try {
    const parsed = JSON.parse(result);
    if (parsed && parsed.status === "Success") {
      sessionPasswordCache = pw;
      cachedUsersPayload = parsed;
      await renderUsersTable(parsed.users || []);
      renderUserManagerSummary(parsed.users || []);
      setUserManagerStatus(`Loaded ${parsed.users ? parsed.users.length : 0} users.`, "success");
      if (saveUsersBtn) saveUsersBtn.disabled = false;
      return;
    }

    setUserManagerStatus(
      normalizeUserManagerError((parsed && parsed.message) ? parsed.message : `Failed to load users. ${String(result).slice(0, 120)}`),
      "error"
    );
  } catch {
    setUserManagerStatus(normalizeUserManagerError(result || "Failed to load users."), "error");
  }
};

const saveUsers = async () => {
  const { session } = await storage.get('session');
  if (!session) return;

  const requesterUserId = session.userId;
  const pw = (adminPasswordInput && adminPasswordInput.value) ? adminPasswordInput.value : sessionPasswordCache;
  if (!pw) {
    setUserManagerStatus("Admin password required.", "error");
    if (adminPasswordInput) adminPasswordInput.focus();
    return;
  }

  const tbody = userManagerTable ? userManagerTable.querySelector('tbody') : null;
  if (!tbody) {
    setUserManagerStatus("No users loaded.", "error");
    return;
  }

  const updates = [];
  tbody.querySelectorAll('tr').forEach((tr) => {
    const userId = tr.dataset.userId;
    if (!userId) return;

    const nick = tr.querySelector('.um-nick') ? tr.querySelector('.um-nick').value : "";
    const passEl = tr.querySelector('.um-pass');
    const amazonInvoice = tr.querySelector('.um-amazon-invoice') ? tr.querySelector('.um-amazon-invoice').value : "NO";
    const amazonReturn = tr.querySelector('.um-amazon-return') ? tr.querySelector('.um-amazon-return').value : "NO";
    const ajioInvoice = tr.querySelector('.um-ajio-invoice') ? tr.querySelector('.um-ajio-invoice').value : "NO";
    const ajioReturn = tr.querySelector('.um-ajio-return') ? tr.querySelector('.um-ajio-return').value : "NO";
    const myntraInvoice = tr.querySelector('.um-myntra-invoice') ? tr.querySelector('.um-myntra-invoice').value : "NO";
    const myntraReturn = tr.querySelector('.um-myntra-return') ? tr.querySelector('.um-myntra-return').value : "NO";
    const role = tr.querySelector('.um-role') ? tr.querySelector('.um-role').value : "USER";

    const item = {
      userId: userId,
      nickName: nick,
      AMAZON_INVOICE: amazonInvoice,
      AMAZON_RETURN: amazonReturn,
      AJIO_INVOICE: ajioInvoice,
      AJIO_RETURN: ajioReturn,
      MYNTRA_INVOICE: myntraInvoice,
      MYNTRA_RETURN: myntraReturn,
      ROLE: role
    };

    if (passEl) {
      const original = passEl.dataset.original || "";
      const current = passEl.value || "";
      if (current !== original) item.password = current;
    }

    updates.push(item);
  });

  setUserManagerStatus("Saving changes...");
  if (saveUsersBtn) saveUsersBtn.disabled = true;

  const result = await apiCall({ action: "updateUsers", requesterUserId, requesterPassword: pw, users: updates });
  console.log("[USER MANAGER] updateUsers raw response:", result);
  if (result === null || result === undefined || result === "") {
    setUserManagerStatus("User API unreachable while saving. Reload extension once, then try again.", "error");
    if (saveUsersBtn) saveUsersBtn.disabled = false;
    return;
  }
  try {
    const parsed = JSON.parse(result);
    if (parsed && parsed.status === "Success") {
      sessionPasswordCache = pw;
      const errCount = parsed.errors && parsed.errors.length ? parsed.errors.length : 0;
      setUserManagerStatus(errCount ? `Saved. ${errCount} warning(s).` : "Saved successfully.", errCount ? "error" : "success");
      if (errCount && window.showCustomAlert) {
        window.showCustomAlert((parsed.errors || []).join("\n"), "Update Warnings");
      }
      await loadUsers();
      return;
    }
    setUserManagerStatus(normalizeUserManagerError((parsed && parsed.message) ? parsed.message : "Save failed."), "error");
  } catch {
    setUserManagerStatus(normalizeUserManagerError(result || "Save failed."), "error");
  } finally {
    if (saveUsersBtn) saveUsersBtn.disabled = false;
  }
};

// Start
checkSession();

// API Reveal Toggle
document.getElementById('api-usage-container').onclick = async () => {
  isApiRevealed = !isApiRevealed;
  const el = document.getElementById('api-count');
  if (isApiRevealed) {
    el.textContent = "Loading...";
    el.style.color = "";
    if (typeof window.consumeGlobalApiCredit === 'function') {
      await window.consumeGlobalApiCredit();
    }
    await updateGlobalAPI();
    showToast("API Count Revealed", "success");
  } else {
    el.textContent = "****";
    el.style.color = "";
  }
};

// Global Sync: Refresh API count every 30 seconds for all users
setInterval(() => {
  if (!document.getElementById('dashboard-view').classList.contains('hidden')) {
    updateGlobalAPI();
  }
}, 30000);

// --- Access Denied Modal Logic ---
const showAccessDeniedModal = () => {
  document.getElementById('access-denied-modal').classList.add('active');
};

const hideAccessDeniedModal = () => {
  document.getElementById('access-denied-modal').classList.remove('active');
};

document.getElementById('close-modal-btn').onclick = hideAccessDeniedModal;
document.getElementById('access-denied-modal').onclick = (e) => {
  if (e.target.id === 'access-denied-modal') hideAccessDeniedModal();
};

// User Manager hooks
const manageUsersBtn = document.getElementById('manage-users-btn');
if (manageUsersBtn) manageUsersBtn.onclick = openUserManager;
const closeUserManagerBtn = document.getElementById('close-user-manager');
if (closeUserManagerBtn) closeUserManagerBtn.onclick = closeUserManager;
if (userManagerModal) {
  userManagerModal.onclick = (e) => {
    if (e.target && e.target.id === 'user-manager-modal') closeUserManager();
  };
}
if (loadUsersBtn) loadUsersBtn.onclick = loadUsers;
if (saveUsersBtn) saveUsersBtn.onclick = saveUsers;

// --- Daily Performance Report Logic ---
const getTodayActivityStats = async () => {
  const stats = {
    ajio: { sales: 0, purchases: 0, cn: 0, dn: 0 },
    amazon: { sales: 0, purchases: 0, cn: 0, dn: 0 },
    myntra: { sales: 0, purchases: 0, cn: 0, dn: 0 }
  };

  const nickname = (await getStoredNickname() || 'User').toUpperCase().trim();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  try {
    // 1. Process pushHistory (individual invoice pushes)
    const pushResult = await storage.get('pushHistory');
    const pushHistory = pushResult.pushHistory || [];
    pushHistory.forEach(item => {
      if (item.timestamp >= todayStartMs && item.uploader && item.uploader.toUpperCase().trim() === nickname) {
        const platform = item.platform.toLowerCase();
        if (stats[platform]) {
          // Pushes are Sales Invoices
          stats[platform].sales++;
        }
      }
    });

    // 2. Process fileUploadHistory (uploaded files count)
    const uploadResult = await storage.get('fileUploadHistory');
    const uploadHistory = uploadResult.fileUploadHistory || [];
    uploadHistory.forEach(item => {
      if (item.timestamp >= todayStartMs && item.uploader && item.uploader.toUpperCase().trim() === nickname) {
        const platform = item.platform.toLowerCase();
        if (stats[platform]) {
          const action = (item.actionName || '').toLowerCase();
          const count = parseInt(item.inserted) || 0;
          if (count > 0) {
            if (action.includes('sale') || action.includes('sales')) {
              stats[platform].sales += count;
            } else if (action.includes('purchase') || action.includes('bill')) {
              stats[platform].purchases += count;
            } else if (action.includes('credit')) {
              stats[platform].cn += count;
            } else if (action.includes('debit')) {
              stats[platform].dn += count;
            } else if (action.includes('portal process')) {
              stats[platform].sales += count;
            } else if (action.includes('vendor process')) {
              stats[platform].purchases += count;
            }
          }
        }
      }
    });
  } catch (err) {
    console.error("Error reading activity histories:", err);
  }

  return stats;
};

const addOtherWorkRow = (text = '') => {
  const container = document.getElementById('other-work-inputs-container');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'other-work-row';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'insights-select';
  input.placeholder = 'Enter details of other work...';
  input.value = text;
  
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-delete-task';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.title = 'Delete task';
  deleteBtn.onclick = () => row.remove();
  
  row.appendChild(input);
  row.appendChild(deleteBtn);
  container.appendChild(row);
};

const openDailyReportModal = async () => {
  const modal = document.getElementById('daily-report-modal');
  if (!modal) return;

  const nameInput = document.getElementById('report-user-name');
  const datetimeInput = document.getElementById('report-datetime');
  
  const nickname = await getStoredNickname() || 'User';
  nameInput.value = nickname.toUpperCase();

  const now = new Date();
  datetimeInput.value = formatTimeCustom(now.getTime());

  // Fetch today's stats and populate form
  const stats = await getTodayActivityStats();
  
  document.getElementById('input-ajio-sales').value = stats.ajio.sales;
  document.getElementById('input-ajio-purchases').value = stats.ajio.purchases;
  document.getElementById('input-ajio-cn').value = stats.ajio.cn;
  document.getElementById('input-ajio-dn').value = stats.ajio.dn;

  document.getElementById('input-amazon-sales').value = stats.amazon.sales;
  document.getElementById('input-amazon-purchases').value = stats.amazon.purchases;
  document.getElementById('input-amazon-cn').value = stats.amazon.cn;
  document.getElementById('input-amazon-dn').value = stats.amazon.dn;

  document.getElementById('input-myntra-sales').value = stats.myntra.sales;
  document.getElementById('input-myntra-purchases').value = stats.myntra.purchases;
  document.getElementById('input-myntra-cn').value = stats.myntra.cn;
  document.getElementById('input-myntra-dn').value = stats.myntra.dn;

  // Clear other work inputs
  const container = document.getElementById('other-work-inputs-container');
  if (container) {
    container.innerHTML = '';
    // Start with 1 empty other work input field by default
    addOtherWorkRow();
  }

  modal.classList.add('active');
};

const closeDailyReportModal = () => {
  const modal = document.getElementById('daily-report-modal');
  if (modal) modal.classList.remove('active');
};

const downloadReportImage = async () => {
  const downloadBtn = document.getElementById('generate-report-img-btn');
  if (!downloadBtn) return;
  downloadBtn.disabled = true;
  downloadBtn.innerHTML = 'Generating Image... ⏳';

  try {
    const userName = document.getElementById('report-user-name').value.trim() || 'User';
    const now = new Date();
    const datetimeStr = formatTimeCustom(now.getTime());

    // Update metadata in template
    document.getElementById('template-user-name').innerText = userName;
    document.getElementById('template-datetime').innerText = datetimeStr;

    // Compile Stats Table Rows
    const tbody = document.getElementById('template-stats-tbody');
    tbody.innerHTML = '';

    const platforms = ['AJIO', 'AMAZON', 'MYNTRA'];
    const metrics = [
      { key: 'sales', label: 'INVOICE CREATE', color: '#3b82f6', border: '5px solid #3b82f6' },
      { key: 'purchases', label: 'BILL CREATE', color: '#10b981', border: '5px solid #10b981' },
      { key: 'cn', label: 'CREDIT NOTE CREATE', color: '#ef4444', border: '5px solid #ef4444' },
      { key: 'dn', label: 'DEBIT NOTE CREATE', color: '#ef4444', border: '5px solid #ef4444' }
    ];

    let rowCount = 0;

    platforms.forEach(p => {
      metrics.forEach(m => {
        const inputId = `input-${p.toLowerCase()}-${m.key}`;
        const inputVal = parseInt(document.getElementById(inputId).value) || 0;

        if (inputVal > 0) {
          rowCount++;
          const tr = document.createElement('tr');
          
          const tdLabel = document.createElement('td');
          tdLabel.style.border = '1px solid #cbd5e1';
          tdLabel.style.borderLeft = m.border;
          tdLabel.style.padding = '8px 12px';
          tdLabel.style.fontWeight = '600';
          tdLabel.style.color = '#334155';
          tdLabel.innerText = `${p} ${m.label}:`;

          const tdVal = document.createElement('td');
          tdVal.style.border = '1px solid #cbd5e1';
          tdVal.style.padding = '8px 12px';
          tdVal.style.textAlign = 'center';
          tdVal.style.fontWeight = 'bold';
          tdVal.style.color = m.color;
          tdVal.style.fontSize = '14px';
          tdVal.innerText = inputVal;

          tr.appendChild(tdLabel);
          tr.appendChild(tdVal);
          tbody.appendChild(tr);
        }
      });
    });

    if (rowCount === 0) {
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.style.border = '1px solid #cbd5e1';
      tdLabel.style.padding = '12px';
      tdLabel.style.textAlign = 'center';
      tdLabel.style.color = '#64748b';
      tdLabel.style.fontStyle = 'italic';
      tdLabel.colSpan = 2;
      tdLabel.innerText = 'No core platform tasks processed today.';
      tr.appendChild(tdLabel);
      tbody.appendChild(tr);
    }

    // Compile Other Work Rows
    const otherWorkTbody = document.getElementById('template-other-work-tbody');
    const otherWorkSection = document.getElementById('template-other-work-section');
    otherWorkTbody.innerHTML = '';

    const otherInputs = document.querySelectorAll('.other-work-row input');
    let otherCount = 0;

    otherInputs.forEach(input => {
      const val = input.value.trim();
      if (val) {
        otherCount++;
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.style.border = '1px solid #cbd5e1';
        td.style.borderLeft = '5px solid #10b981';
        td.style.padding = '8px 12px';
        td.style.color = '#334155';
        td.innerText = val;
        tr.appendChild(td);
        otherWorkTbody.appendChild(tr);
      }
    });

    if (otherCount > 0) {
      otherWorkSection.style.display = 'block';
    } else {
      otherWorkSection.style.display = 'none';
    }

    // Render screenshot
    setTimeout(async () => {
      try {
        const element = document.getElementById('report-screenshot-template');
        const canvas = await window.html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        
        const a = document.createElement('a');
        const dateStr = now.toISOString().split('T')[0];
        a.download = `Daily_Work_Report_${userName.replace(/\s+/g, '_')}_${dateStr}.png`;
        a.href = imgData;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast("Report image downloaded successfully!", "success");
        closeDailyReportModal();
      } catch (err) {
        console.error("Screenshot capture failed:", err);
        showToast("Failed to generate report image.", "error");
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = 'Download Report Image 📥';
      }
    }, 150);

  } catch (e) {
    console.error("Error generating report:", e);
    showToast("Error processing report data.", "error");
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = 'Download Report Image 📥';
  }
};

// Event Bindings
const dailyReportBtn = document.getElementById('dailyReportBtn');
if (dailyReportBtn) {
  dailyReportBtn.onclick = openDailyReportModal;
}

const closeDailyReportBtn = document.getElementById('close-daily-report-btn');
if (closeDailyReportBtn) closeDailyReportBtn.onclick = closeDailyReportModal;

const cancelDailyReportBtn = document.getElementById('cancel-daily-report-btn');
if (cancelDailyReportBtn) cancelDailyReportBtn.onclick = closeDailyReportModal;

const addOtherWorkBtn = document.getElementById('add-other-work-btn');
if (addOtherWorkBtn) {
  addOtherWorkBtn.onclick = () => addOtherWorkRow();
}

const generateReportImgBtn = document.getElementById('generate-report-img-btn');
if (generateReportImgBtn) {
  generateReportImgBtn.onclick = downloadReportImage;
}

const dailyReportModal = document.getElementById('daily-report-modal');
if (dailyReportModal) {
  dailyReportModal.onclick = (e) => {
    if (e.target && e.target.id === 'daily-report-modal') closeDailyReportModal();
  };
}

// Export Data Logic
const closeExportBtn = document.getElementById('close-export-btn');
if (closeExportBtn) closeExportBtn.onclick = () => document.getElementById('export-data-modal').classList.remove('active');

const mainExportBtn = document.getElementById('main-export-btn');
if (mainExportBtn) {
  mainExportBtn.onclick = () => {
    // Default dates (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    document.getElementById('export-start-date').value = firstDay;
    document.getElementById('export-end-date').value = lastDay;
    if (currentPlatform) document.getElementById('export-platform').value = currentPlatform;
    
    document.getElementById('export-data-modal').classList.add('active');
  };
}

const confirmExportBtn = document.getElementById('confirm-export-btn');
if (confirmExportBtn) {
  confirmExportBtn.onclick = async () => {
    const platform = document.getElementById('export-platform').value;
    const startDate = document.getElementById('export-start-date').value;
    const endDate = document.getElementById('export-end-date').value;

    if (!startDate || !endDate) {
      showToast("Please select both dates", "error");
      return;
    }

    confirmExportBtn.disabled = true;
    confirmExportBtn.textContent = "Processing...";
    setInsightsStatus("Exporting Data from Google Sheets...", "info");

    try {
      const raw = await window.apiBridge({
        action: "exportDataByDate",
        sheetName: platform,
        startDate: startDate,
        endDate: endDate
      });

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        console.error("Export Parse Error:", e, raw);
        showToast("Connection failed or invalid response from server.", "error");
        return;
      }
      if (parsed.status === "Success") {
        const rows = parsed.data;
        if (!rows || rows.length <= 1) {
          showToast("No data found for this range", "error");
        } else {
          downloadCSV(rows, `${platform}_Export_${startDate}_to_${endDate}.csv`);
          showToast(`Exported ${rows.length - 1} rows!`);
          document.getElementById('export-data-modal').classList.remove('active');
        }
      } else {
        showToast(parsed.message || "Export failed", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Connection failed or invalid response", "error");
    } finally {
      confirmExportBtn.disabled = false;
      confirmExportBtn.textContent = "Download CSV";
      setInsightsStatus("Ready", "success");
    }
  };
}

function downloadCSV(rows, filename) {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add BOM for Excel compatibility

  rows.forEach(row => {
    const rowStr = row.map(val => {
      let cell = val === null || val === undefined ? "" : String(val);
      // Escape quotes and wrap in quotes if contains comma or newline
      if (cell.includes(",") || cell.includes("\"") || cell.includes("\n")) {
        cell = "\"" + cell.replace(/"/g, "\"\"") + "\"";
      }
      return cell;
    }).join(",");
    csvContent += rowStr + "\r\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// User Deep Dive Change Listener
const userDeepDiveSelect = document.getElementById('userDeepDiveSelect');
if (userDeepDiveSelect) {
    userDeepDiveSelect.addEventListener('change', (e) => {
        renderUserSpotlight(e.target.value);
    });
}

// --- PDF REPORT EXPORT LOGIC ---
const pdfBtn = document.getElementById('pdf-report-btn');
if (pdfBtn) {
    pdfBtn.onclick = async () => {
        if (!window.showCustomModal) return;

        const choice = await window.showCustomModal({
            title: "Export PDF Report",
            message: "Choose report type. 'Full Report' runs in the background across all platforms.",
            type: "info",
            confirmText: "Executive Full Report",
            cancelText: "Current Page Snapshot"
        });

        // choice = true (Full), false (Current)
        if (choice) {
            processBackgroundReport('full');
            showToast("Report generation started in background. You can continue working.");
        } else {
            generatePDFReport('current');
        }
    };
}

// Store for generated reports
window.READY_REPORTS = [];

async function processBackgroundReport(mode) {
    const bubble = document.getElementById('report-progress-bubble');
    const progressText = document.getElementById('report-progress-text');
    
    if (bubble) bubble.style.display = 'flex';
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;

    const originalPlatform = currentPlatform;
    const originalTab = currentInsightsTab;
    
    try {
        const platforms = ['GLOBAL', 'AMAZON', 'AJIO', 'MYNTRA', 'USERS'];
        for (let i = 0; i < platforms.length; i++) {
            const p = platforms[i];
            if (progressText) progressText.textContent = `Gathering ${p} Analysis... (${i+1}/${platforms.length})`;
            
            // Switch and Load
            if (p === 'USERS') {
                switchInsightsTab('USER');
                await loadUserPerformanceInsights();
            } else {
                switchInsightsTab('GLOBAL');
                await selectPlatform(p);
                // loadInsights is called by selectPlatform
                await new Promise(r => setTimeout(r, 800)); // Buffer for charts
            }

            const activeViewId = p === 'USERS' ? 'insUserView' : 'insGlobalView';
            const element = document.getElementById(activeViewId);
            const canvas = await html2canvas(element, {
                scale: 1.5,
                useCORS: true,
                backgroundColor: "#f8fafc",
                logging: false
            });

            if (i > 0) doc.addPage();
            
            // Branded Header
            doc.setFillColor(30, 41, 59);
            doc.rect(0, 0, pageWidth, 20, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.text("EXECUTIVE REPORT", margin, 13);
            doc.setFontSize(9);
            doc.text(p + " SEGMENT", pageWidth - margin - 40, 13);

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - (2 * margin);
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            doc.addImage(imgData, 'PNG', margin, 35, imgWidth, Math.min(imgHeight, 240));

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(`Page ${i + 1} | Generated by Invoice Checker AI`, pageWidth / 2, pageHeight - 5, { align: "center" });
        }

        // Restore original view silently
        await selectPlatform(originalPlatform);
        switchInsightsTab(originalTab);

        // Add to Inbox
        const reportId = `REP_${Date.now()}`;
        const blob = doc.output('blob');
        const reportUrl = URL.createObjectURL(blob);
        
        window.READY_REPORTS.push({
            id: reportId,
            name: `Report_${new Date().toLocaleDateString()}.pdf`,
            url: reportUrl,
            time: new Date().toLocaleTimeString()
        });

        updateNotificationUI();
        showToast("New PDF Report is ready in Home Tab!");

    } catch (err) {
        console.error("Background Report Error:", err);
        showToast("Background generation failed.", "error");
    } finally {
        if (bubble) bubble.style.display = 'none';
    }
}

function updateNotificationUI() {
    const badge = document.getElementById('home-notif-badge');
    const pill = document.getElementById('ready-reports-pill');
    const countEl = document.getElementById('ready-count');
    const listEl = document.getElementById('report-list');
    
    const count = window.READY_REPORTS.length;
    
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    }
    
    if (pill) {
        pill.style.display = 'none'; // Pill is now hidden as requested
        if (countEl) countEl.textContent = `${count} Report Ready`;
    }
    
    if (listEl) {
        if (count === 0) {
            listEl.innerHTML = `<p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 20px;">No reports ready yet.</p>`;
        } else {
            listEl.innerHTML = window.READY_REPORTS.map(r => `
                <div class="report-item">
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-size:11px; font-weight:800; color:#1e293b;">${r.name}</span>
                        <span style="font-size:9px; color:#64748b;">Ready at ${r.time}</span>
                    </div>
                    <a href="${r.url}" download="${r.name}" style="background:#6366f1; color:#fff; padding:4px 10px; border-radius:6px; font-size:10px; text-decoration:none; font-weight:700;">Download 📥</a>
                </div>
            `).join('');
        }
    }
}

// --- Reports Modal Logic ---
document.getElementById('sidebar-home-btn')?.addEventListener('click', () => {
    if (window.READY_REPORTS && window.READY_REPORTS.length > 0) {
        document.getElementById('reports-modal').classList.add('active');
        updateNotificationUI();
    }
});

document.getElementById('close-reports-btn')?.addEventListener('click', () => {
    document.getElementById('reports-modal').classList.remove('active');
});

document.getElementById('close-reports-modal-btn')?.addEventListener('click', () => {
    document.getElementById('reports-modal').classList.remove('active');
});

// Close on background click
document.getElementById('reports-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'reports-modal') {
        document.getElementById('reports-modal').classList.remove('active');
    }
});

async function generatePDFReport(mode) {
    const activeViewId = document.getElementById('insGlobalView').style.display !== 'none'
        ? 'insGlobalView'
        : (document.getElementById('insUserView').style.display !== 'none' ? 'insUserView' : 'insVendorView');
    const element = document.getElementById(activeViewId);
    
    // Safety check: Don't capture if loading overlay is present
    if (element.querySelector('.ins-loading-overlay')) {
        showToast("Please wait for data to finish loading before exporting.", "warning");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    
    if (typeof setInsightsStatus === 'function') {
        setInsightsStatus("Creating High-Res Report...", "info");
    }

    try {
        const canvas = await html2canvas(element, { 
            scale: 1.2,
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: "#ffffff",
            imageTimeout: 15000, // Give it more time for 6K rows
            onclone: (clonedDoc) => {
                const clonedEl = clonedDoc.getElementById(activeViewId);
                if (clonedEl) {
                    // Expand all scrollable containers to full height for PDF
                    const scrollables = clonedEl.querySelectorAll('[style*="overflow-y: auto"], [style*="overflow: auto"]');
                    scrollables.forEach(s => {
                        s.style.height = 'auto';
                        s.style.maxHeight = 'none';
                        s.style.overflow = 'visible';
                    });
                    clonedEl.style.height = 'auto';
                    clonedEl.style.overflow = 'visible';
                }
            }
        });
        const imgData = canvas.toDataURL('image/png', 0.7); 
        const imgWidth = pageWidth - (2 * margin);
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // If report is too long, it might need multiple pages, but for now we fit to one or use a very long page
        // For simplicity and quality, we add it to the first page.
        doc.addImage(imgData, 'PNG', margin, 20, imgWidth, imgHeight);
        doc.save(`Performance_Report_${Date.now()}.pdf`);
        
        if (typeof setInsightsStatus === 'function') {
            setInsightsStatus("Report Downloaded", "success");
        }
    } catch (e) {
        console.error("PDF Generation Error:", e);
        if (typeof showToast === 'function') {
            showToast("Failed to generate PDF. Data might be too large.", "error");
        }
    }
}
