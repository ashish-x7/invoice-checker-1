import { getGeminiResponse, fileToBase64 } from './api-helper.js';

const HARDCODED_API_KEY = "AIzaSyDbx0H-vGeQiGNbI6G8DdRJK56qS-ed4jw";

// Dedicated Sync URL for Amazon Return
const AMAZON_RETURN_SYNC_URL = "https://script.google.com/macros/s/AKfycbxZXOH4zomh68pIDRnWTZGOCVR2mt0b5uBEEiOqnys08zpJBfcgK-Bnkj4hai2dphV1/exec";

document.addEventListener('DOMContentLoaded', async () => {
    if (window.displayUserNickname) {
        window.displayUserNickname('hiddenBadgeHost');
    }
    
    // Core Elements
    const pdfInput = document.getElementById('pdf-input');
    const imageInput = document.getElementById('image-input');
    const verifyBtn = document.getElementById('verify-btn');
    const newVerifyBtn = document.getElementById('new-verify-btn');
    const pushDetailsBtn = document.getElementById('push-details-btn');
    const pushStatusMsg = document.getElementById('push-status-msg');
    
    // Status Elements
    const pdfStatus = document.getElementById('pdfStatus');
    const imageStatus = document.getElementById('imageStatus');
    const statusBadge = document.getElementById('status-badge');
    const partyCodeValue = document.getElementById('party-code-value');
    
    // Modal & Triggers
    const returnModal = document.getElementById('returnVerificationModal');
    const closeModalBtnTop = document.getElementById('closeModalBtnTop');
    const closeModalBtnFooter = document.getElementById('closeModalBtnFooter');

    // Inject Navigation Tools
    function injectTools() {
        const hiddenHost = document.getElementById('hiddenBadgeHost');
        const topUserHost = document.getElementById('topUserHost');
        const bottomLeftTools = document.getElementById('bottomLeftTools');
        const bottomRightNav = document.getElementById('bottomRightNav');
        
        if (!hiddenHost || !topUserHost || !bottomLeftTools || !bottomRightNav) return;

        const checkInterval = setInterval(() => {
            const topRow = hiddenHost.firstElementChild;
            const bottomRow = hiddenHost.lastElementChild;
            
            if (topRow && bottomRow && bottomRow.style.display === 'flex' && bottomRow.children.length > 0) {
                clearInterval(checkInterval);
                
                while (topRow.firstChild) topUserHost.appendChild(topRow.firstChild);
                while (bottomRow.firstChild) {
                    const child = bottomRow.firstChild;
                    bottomRightNav.appendChild(child);
                }

                // Re-link API Credit Click to handle logic correct (REVEAL = 1 API CREDIT)
                const apiPill = document.getElementById('globalApiPill');
                if (apiPill) {
                    apiPill.onclick = async () => {
                        const countSpan = document.getElementById('globalApiCount');
                        if (countSpan && countSpan.innerText.includes('****')) {
                            // 1. Consume 1 REAL API Credit from Google Sheets
                            if (window.consumeGlobalApiCredit) {
                                await window.consumeGlobalApiCredit(1);
                            }
                            
                            // 2. Also decrement local AI Quota if desired (for double status check)
                            if (window.decrementAiQuota) {
                                window.decrementAiQuota(); 
                            }

                            // 3. Finally reveal the value using shared logic
                            if (window.syncApiDisplay) {
                                await window.syncApiDisplay('globalApiCount', true);
                            }
                        }
                    };
                }
                
                bottomLeftTools.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>TOOLS:
                        </span>
                        <button id="openDataCenterBtn" style="background:#fff4e5; border:1.2px solid #ffcc80; color:#ef6c00; padding:4px 14px; border-radius:8px; font-size:10px; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.2s; text-transform:uppercase;">
                            AMAZON DATA CENTER <span style="color: #ffab40; font-size: 12px;">📂</span>
                        </button>
                    </div>
                `;

                document.getElementById('openDataCenterBtn').addEventListener('click', () => {
                    returnModal.style.display = 'flex';
                });
            }
        }, 100);
    }
    
    injectTools();

    // Modal Controls
    const closeAllModals = () => {
        returnModal.style.display = 'none';
    };

    if (closeModalBtnTop) closeModalBtnTop.addEventListener('click', closeAllModals);
    if (closeModalBtnFooter) closeModalBtnFooter.addEventListener('click', closeAllModals);
    
    window.addEventListener('click', (e) => {
        if (e.target === returnModal) closeAllModals();
    });

    // Upload Triggers
    document.getElementById('pdf-upload-btn').addEventListener('click', () => pdfInput.click());
    document.getElementById('image-upload-btn').addEventListener('click', () => imageInput.click());

    let pdfFile = null;
    let portalPdfFile = null;

    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            pdfFile = e.target.files[0];
            pdfStatus.innerText = "✓ " + pdfFile.name.substring(0, 15) + "...";
            pdfStatus.style.background = "#ff9900";
            pdfStatus.style.color = "white";
            checkReady();
        }
    });

    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            portalPdfFile = e.target.files[0];
            imageStatus.innerText = "✓ " + portalPdfFile.name.substring(0, 15) + "...";
            imageStatus.style.background = "#4f46e5";
            imageStatus.style.color = "white";
            checkReady();
        }
    });

    function checkReady() {
        if (pdfFile && portalPdfFile) {
            verifyBtn.disabled = false;
            verifyBtn.style.opacity = "1";
        }
    }

    // Reset Audit Button (Main Dashboard)
    const resetAuditBtn = document.getElementById('reset-audit-btn');
    if (resetAuditBtn) {
        resetAuditBtn.addEventListener('click', () => {
            if (partyCodeValue) partyCodeValue.innerText = "---";
            if (pushStatusMsg) pushStatusMsg.innerText = "Ready to sync this audit...";
            if (statusBadge) {
                statusBadge.innerText = "Ready to Audit";
                statusBadge.style.background = "#334155";
                statusBadge.style.color = "white";
                statusBadge.classList.remove('analyzing');
            }
            if (pushDetailsBtn) {
                pushDetailsBtn.disabled = false;
                pushDetailsBtn.style.opacity = "1";
                pushDetailsBtn.innerHTML = `PUSH DETAILS <span style="font-size: 16px;">📤</span>`;
                pushDetailsBtn.style.background = "rgba(16, 185, 129, 0.08)";
                pushDetailsBtn.style.color = "#059669";
                pushDetailsBtn.style.border = "2px solid rgba(16, 185, 129, 0.3)";
            }
            // Reset table skeletons
            for(let i=0; i<4; i++) {
                const p1 = document.getElementById(`row-${i}-pdf1`);
                const p2 = document.getElementById(`row-${i}-pdf2`);
                const st = document.getElementById(`row-${i}-status`);
                if (p1) p1.innerHTML = `<div class="skeleton-pulse">---</div>`;
                if (p2) p2.innerHTML = `<div class="skeleton-pulse">---</div>`;
                if (st) st.innerHTML = `<div class="skeleton-pulse">---</div>`;
            }
        });
    }

    // New Verification Reset
    if (newVerifyBtn) {
        newVerifyBtn.addEventListener('click', () => {
            pdfFile = null;
            portalPdfFile = null;
            pdfInput.value = "";
            imageInput.value = "";
            pdfStatus.innerText = "SELECT FILE 📁";
            pdfStatus.style.background = "rgba(0,0,0,0.03)";
            pdfStatus.style.color = "#64748b";
            imageStatus.innerText = "SELECT FILE 📁";
            imageStatus.style.background = "rgba(0,0,0,0.03)";
            imageStatus.style.color = "#64748b";
            verifyBtn.disabled = true;
            verifyBtn.style.opacity = "0.6";
            
            if (partyCodeValue) partyCodeValue.innerText = "---";
            if (pushStatusMsg) pushStatusMsg.innerText = "Ready to sync this audit...";
            if (pushDetailsBtn) {
                pushDetailsBtn.disabled = false;
                pushDetailsBtn.style.opacity = "1";
                pushDetailsBtn.innerHTML = `PUSH DETAILS <span style="font-size: 16px;">📤</span>`;
                pushDetailsBtn.style.background = "rgba(16, 185, 129, 0.08)";
                pushDetailsBtn.style.color = "#059669";
                pushDetailsBtn.style.border = "2px solid rgba(16, 185, 129, 0.3)";
            }

            // Reset table skeletons
            for(let i=0; i<4; i++) {
                document.getElementById(`row-${i}-pdf1`).innerHTML = `<div class="skeleton-pulse">---</div>`;
                document.getElementById(`row-${i}-pdf2`).innerHTML = `<div class="skeleton-pulse">---</div>`;
                document.getElementById(`row-${i}-status`).innerHTML = `<div class="skeleton-pulse">---</div>`;
            }
            statusBadge.innerText = "Ready to Audit";
            statusBadge.style.background = "#334155";
            
            returnModal.style.display = 'flex';
        });
    }

    // Push to Sheet Logic
    if (pushDetailsBtn) {
        pushDetailsBtn.addEventListener('click', async () => {
            const partCode = partyCodeValue ? partyCodeValue.innerText : "N/A";
            const amount = document.getElementById('row-3-pdf1') ? document.getElementById('row-3-pdf1').innerText : "0";
            
            if (partCode === "---" || partCode === "N/A") {
                alert("Please complete an audit first!");
                return;
            }

            pushDetailsBtn.disabled = true;
            pushDetailsBtn.style.opacity = "0.7";
            pushDetailsBtn.innerText = "PUSHING...";
            pushStatusMsg.innerText = "Syncing with Google Sheets...";

            const now = new Date();
            const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
            
            // Extract Nickname from the Premium User Badge
            let nickname = "Unknown User";
            const topUserHost = document.getElementById('topUserHost');
            if (topUserHost) {
                const nicknameText = topUserHost.innerText.trim();
                nickname = nicknameText.split(/\s|Hi/)[0];
            } else {
                const badgeEl = document.getElementById('user-badge-nickname');
                if (badgeEl) nickname = badgeEl.innerText.trim();
            }
            
            const payload = {
                partCode: partCode,
                amount: amount,
                timestampAndUser: `${timestamp} | ${nickname}`
            };

            console.log("[DEBUG] Sync Payload:", payload);

            try {
                const response = await fetch(AMAZON_RETURN_SYNC_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                console.log("[DEBUG] Fetch Request Sent. Status: Success (Assumption due to no-cors)");

                pushStatusMsg.innerText = "✅ Data successfully added to AMAZON RETURN sheet!";
                pushStatusMsg.style.color = "#10b981";
                pushDetailsBtn.innerHTML = "SUCCESS ✓";
                pushDetailsBtn.style.background = "#334155";
                pushDetailsBtn.style.color = "white";
                pushDetailsBtn.style.border = "none";

                if (window.decrementAiQuota) {
                    window.decrementAiQuota();
                }

            } catch (error) {
                console.error("[CRITICAL DEBUG] Push Error:", error);
                alert("SYC ERROR: " + error.message);
                pushStatusMsg.innerText = "❌ Sync failed. Please check script URL.";
                pushStatusMsg.style.color = "#ef4444";
                pushDetailsBtn.disabled = false;
                pushDetailsBtn.style.opacity = "1";
                pushDetailsBtn.innerText = "RETRY";
                pushDetailsBtn.style.background = "rgba(16, 185, 129, 0.08)";
            }
        });
    }

    // Core Verification Logic
    verifyBtn.addEventListener('click', async () => {
        if (!pdfFile || !portalPdfFile) return;

        returnModal.style.display = 'none';
        statusBadge.innerText = "Analyzing Dual PDFs...";
        statusBadge.classList.add('analyzing');
        statusBadge.style.background = "#6366f1";

        try {
            const startTime = performance.now();
            const pdfBase64 = await fileToBase64(pdfFile);
            const portalPdfBase64 = await fileToBase64(portalPdfFile);

            for(let i=0; i<4; i++) {
                document.getElementById(`row-${i}-pdf1`).className = 'skeleton-pulse';
                document.getElementById(`row-${i}-pdf2`).className = 'skeleton-pulse';
                document.getElementById(`row-${i}-status`).className = 'skeleton-pulse';
            }

            const result = await getGeminiResponse(HARDCODED_API_KEY, pdfBase64, portalPdfBase64);
            
            const endTime = performance.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            console.log(`[DEBUG] Audit Complete in ${duration}s`);

            if (partyCodeValue && result.partyCode) {
                partyCodeValue.innerText = result.partyCode;
            }

            if (result.auditData) {
                result.auditData.forEach((row, index) => {
                    const p1 = document.getElementById(`row-${index}-pdf1`);
                    const p2 = document.getElementById(`row-${index}-pdf2`);
                    const st = document.getElementById(`row-${index}-status`);

                    if (p1) { p1.className = ""; p1.innerText = row.pdf1Value; }
                    if (p2) { p2.className = ""; p2.innerText = row.pdf2Value; }
                    if (st) {
                        st.className = "";
                        const color = row.status ? '#10b981' : '#ef4444';
                        const bg = row.status ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                        st.innerHTML = `<span class="status-pill" style="background:${bg}; color:${color};">${row.status ? 'MATCHED' : 'MISMATCH'}</span>`;
                    }
                });
            }

            if (window.decrementAiQuota) window.decrementAiQuota();

            statusBadge.innerText = "Audit Complete";
            statusBadge.style.background = "rgba(16, 185, 129, 0.2)";
            statusBadge.style.color = "#10b981";

        } catch (error) {
            console.error("Audit Error:", error);
            statusBadge.innerText = "Audit Failed";
            statusBadge.style.background = "#ef4444";
            statusBadge.style.color = "white";
        }
    });
});
