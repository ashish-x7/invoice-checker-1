/**
 * AJIO CENTRALIZED MODAL LOGIC (SALE & PURCHASE)
 * All mapping, matching, and UI updates for Ajio modals should happen here.
 */
window.billTimer = null;

// --- SALE MODAL LOGIC ---
function updateInvoiceModalData(idx) {
    if (!globalSaleInvoiceData || idx >= globalSaleInvoiceData.length) return;
    const sRow = globalSaleInvoiceData[idx];

    // DYNAMICALLY FIND BA & CS indices in Portal
    let idxBA = 52;
    let idxCS = 96;

    if (globalPortalData && globalPortalData[0]) {
        const header = globalPortalData[0];
        const baPos = header.indexOf("Col BA");
        if (baPos !== -1) {
            idxBA = baPos;
            idxCS = idxBA + 44;
        }
    }

    console.log("SALE MODAL DEBUG:", {
        idx,
        idxBA,
        idxCS,
        saleInvoiceNo: sRow[2],
        portalDataAvailable: !!globalPortalData,
        portalRows: globalPortalData ? globalPortalData.length : 0
    });

    if (globalPortalData && globalPortalData.length > 1) {
        console.log("PORTAL SAMPLE (Row 1):", {
            colC: globalPortalData[1][2],
            colBA: globalPortalData[1][idxBA],
            colCS: globalPortalData[1][idxCS]
        });
    }

    // MATCHING LOGIC: VLOOKUP(Sale!C, Portal!$BA$2:$BX$5000, ...)
    let pIdx = -1;
    const saleKeyC = String(sRow[2] || "").trim().toUpperCase(); // Invoice No from Sale Column C
    if (saleKeyC !== "" && globalPortalData) {
        for (let i = 1; i < globalPortalData.length; i++) {
            // VLOOKUP range starts at BA. So it matches against Portal Column BA.
            const portalBAVal = String(globalPortalData[i][idxBA] || "").trim().toUpperCase();
            if (portalBAVal === saleKeyC) {
                pIdx = i;
                break;
            }
        }
    }
    console.log("MATCH RESULT (VLOOKUP Logic):", { saleKeyC, pIdxFound: pIdx, portalColUsed: "BA (Index 52)" });
    const pRow = pIdx !== -1 ? globalPortalData[pIdx] : null;

    // Header Metadata
    document.getElementById('mdlInvoiceNo').textContent = sRow[2] || "--";
    document.getElementById('mdlInvoiceDate').textContent = sRow[4] || "--";
    document.getElementById('mdlInvoiceId').textContent = sRow[1] || "--";
    document.getElementById('mdlInvoiceCount').textContent = `${idx} / ${globalSaleInvoiceData.length - 1}`;
    if (typeof getAjioSellerName === 'function') {
        document.getElementById('mdlInvoiceSellerName').textContent = getAjioSellerName();
    }

    // Jump input sync
    const jump = document.getElementById('mdlInvoiceJumpInput');
    if (jump) jump.value = idx;

    const safeGet = (row, offset) => (row && row[idxBA + offset] !== undefined && row[idxBA + offset] !== "") ? row[idxBA + offset] : "--";
    const parseVal = (v) => {
        if (v === "--" || v === "" || v === undefined) return null;
        const clean = String(v).replace(/[₹,Q\s]/g, "");
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    };

    const setField = (fieldPrefix, portalOffset, saleOffset, isQty = false) => {
        // Both values are retrieved from the Portal sheet's mirror range ($BA:$BX)
        const pVal = safeGet(pRow, portalOffset);
        const sVal = safeGet(pRow, saleOffset);

        const portalEl = document.getElementById(`mdl${fieldPrefix}Portal`);
        const saleEl = document.getElementById(`mdl${fieldPrefix}Sale`);
        const statusEl = document.getElementById(`mdl${fieldPrefix}Status`);

        if (!portalEl || !saleEl || !statusEl) return;

        const pNum = parseVal(pVal);
        const sNum = parseVal(sVal);

        const fmt = (v, isQ) => {
            if (v === "--") return "--";
            if (isQ) return "Q " + v;
            return "₹ " + (parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        };

        portalEl.textContent = fmt(pVal, isQty);
        saleEl.textContent = fmt(sVal, isQty);

        let isMatch = false;
        if (pRow && pNum !== null && sNum !== null) {
            if (isQty) isMatch = (pNum === sNum);
            else if (Math.abs(pNum - sNum) < 1.05) isMatch = true;
        } else if (pRow && String(pVal).trim() !== "--" && String(pVal).trim() === String(sVal).trim()) {
            isMatch = true;
        }

        if (pRow && isMatch) {
            statusEl.textContent = "TRUE ✅";
            statusEl.style.backgroundColor = "#c6efce"; statusEl.style.color = "#006100";
        } else {
            statusEl.textContent = "FALSE ❌";
            statusEl.style.backgroundColor = "#ffd6d6"; statusEl.style.color = "#9c0006";
            // Stop on mismatch or missing record
            isAllMatch = false;
        }
    };

    let isAllMatch = true;

    // Mapping based on User offsets from BA (52)
    setField("NoTax", 7, 8);      // BH (7), BI (8)
    setField("Qty", 4, 5, true);  // BE (4), BF (5)
    setField("Cgst", 10, 11);     // BK (10), BL (11)
    setField("Sgst", 13, 14);     // BN (13), BO (14)
    setField("Round", 19, 21);    // BT (19), BV (21)
    setField("WithTax", 20, 23);  // BU (20), BX (23)

    // Final UI
    const overallEl = document.getElementById('mdlOverallStatus');
    if (overallEl) {
        if (isAllMatch && pRow) {
            overallEl.textContent = "OK 👍";
            overallEl.style.color = "#2ecc71";
        } else {
            overallEl.textContent = "ERROR ⚠️";
            overallEl.style.color = "#e74c3c";
        }
    }

    return isAllMatch;
}

// --- PURCHASE MODAL LOGIC ---
// --- PURCHASE MODAL LOGIC ---
function updatePurchaseModalData(idx) {
    if (!globalPurchaseData || idx >= globalPurchaseData.length) return;
    const row = globalPurchaseData[idx];
    if (window.billTimer) {
        window.billTimer.updateProgress(idx);
    }

    // CHECK BILL DETAILS: If bill number is empty, show green error and return false (error)
    const billNoKey = String(row[2] || "").trim().toUpperCase();
    if (!billNoKey || billNoKey === "") {
        const errorEl = document.getElementById('mBillDetailsError');
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = '⚠️ BILL DETAILS MISSING - Auto Stop';
        }
        if (window.billTimer) {
            window.billTimer.stop();
        }
        return false; // Return false to indicate error and stop auto
    } else {
        const errorEl = document.getElementById('mBillDetailsError');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    // Find Portal row where Column CI (Index 86) matches Bill Number (Index 2)
    let pRow = null;
    if (billNoKey && globalPortalData) {
        for (let i = 1; i < globalPortalData.length; i++) {
            if (String(globalPortalData[i][86] || "").trim().toUpperCase() === billNoKey) {
                pRow = globalPortalData[i];
                break;
            }
        }
    }

    // Core Bill Metadata: Bill ID (A/0), Bill No (C/2), Bill Date (E/4)
    document.getElementById('mBillId').textContent = row[0] || "--";
    document.getElementById('mBillNo').textContent = row[2] || "--";
    document.getElementById('mBillDate').textContent = row[4] || "--";

    // Show current index as count
    document.getElementById('mBillCount').textContent = `${idx} / ${globalPurchaseData.length - 1}`;

    const sellerRow = (typeof getAjioSellerName === 'function' ? getAjioSellerName() : "--");
    document.getElementById('mBillSellerName').textContent = sellerRow;

    const jump = document.getElementById('mBillJumpInput');
    if (jump) jump.value = idx;

    const fmt = (v) => {
        if (v === undefined || v === null || v === "" || v === "--") return "₹ 0.00";
        let n = parseFloat(String(v).replace(/[₹,Q\s]/g, ""));
        return isNaN(n) ? "₹ 0.00" : "₹ " + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    const setStatus = (elId, isMatch, useTrueFalse = false) => {
        const el = document.getElementById(elId);
        if (!el) return;
        if (isMatch) {
            el.textContent = useTrueFalse ? "TRUE ✅" : "OK 👍";
            el.style.backgroundColor = "#c6efce"; el.style.color = "#006100";
        } else {
            el.textContent = useTrueFalse ? "FALSE ❌" : "ERROR ⚠️";
            el.style.backgroundColor = "#ffd6d6"; el.style.color = "#9c0006";
        }
    };

    let isAllMatch = true;

    // 1. Without Tax: Column X (Index 23)
    document.getElementById('mNoTax').textContent = fmt(row[23]);
    setStatus('mNoTaxStatus', !!row[23]);

    // 2. Quantity (Portal: index 31 (AF) vs Purchase: index 21 (V))
    const pQtyVal = row[31] || 0;
    const purQtyVal = row[21] || 0;
    document.getElementById('mQtyPortal').textContent = "P: Q" + pQtyVal;
    document.getElementById('mQtyPurchase').textContent = "PUR: Q" + purQtyVal;
    const qtyMatch = (String(pQtyVal) === String(purQtyVal));
    setStatus('mQtyStatus', qtyMatch, true); // TDS AND QTY ME TRUE FLASE
    if (!qtyMatch) isAllMatch = false;

    // 3. CGST (index 24 / Y) & SGST (index 25 / Z)
    document.getElementById('mCgst').textContent = fmt(row[24]);
    document.getElementById('mSgst').textContent = fmt(row[25]);
    setStatus('mCgstStatus', !!row[24]);
    setStatus('mSgstStatus', !!row[25]);

    // 4. TDS Check (Upload AX: 49, Calc AY: 50)
    const tdsUpl = parseFloat(String(row[49] || "0").replace(/[₹,Q\s]/g, "")) || 0;
    const tdsCalc = parseFloat(String(row[50] || "0").replace(/[₹,Q\s]/g, "")) || 0;
    document.getElementById('mTdsData').textContent = "D: " + fmt(tdsUpl);
    document.getElementById('mTdsCalc').textContent = "C: " + fmt(tdsCalc);
    const tdsMatch = (Math.abs(tdsUpl - tdsCalc) < 1.05);
    setStatus('mTdsStatus', tdsMatch, true); // TDS AND QTY ME TRUE FLASE
    if (!tdsMatch) isAllMatch = false;

    // 5. Round Off (index 28 / AC) & With Tax (index 29 / AD)
    document.getElementById('mRoundOff').textContent = fmt(row[28]);
    document.getElementById('mWithTax').textContent = fmt(row[29]);
    setStatus('mRoundStatus', !!row[28]);
    setStatus('mWithTaxStatus', !!row[29]);

    // 6. DIFF SALE-PUR: Portal index 89 (Column CL)
    const rawDiff = pRow ? pRow[89] : null;
    const diffVal = parseFloat(String(rawDiff || "0").replace(/[₹,Q\s]/g, "")) || 0;
    document.getElementById('mDiff').textContent = pRow ? fmt(diffVal) : "--";

    // Condition: If negative, show FALSE and stop AUTO
    const diffMatch = pRow && diffVal >= 0;
    setStatus('mDiffStatus', diffMatch, true);

    if (!diffMatch) {
        isAllMatch = false;
        // Stop Auto if negative
        if (window.isAutoRunning) {
            window.isAutoRunning = false;
            const autoBtn = document.getElementById('btnAutoBill');
            if (autoBtn) {
                autoBtn.textContent = "AUTO";
                autoBtn.style.background = "#c6f0ff";
            }
        }
    }

    // Overall UI Status
    const overallEl = document.getElementById('mOverall');
    if (overallEl) {
        if (isAllMatch) {
            overallEl.textContent = "OK 👍";
            overallEl.style.color = "#2ecc71";
        } else {
            overallEl.textContent = "ERROR ⚠️";
            overallEl.style.color = "#e74c3c";
        }
    }

    // Auto-stop logic if in loop
    if (window.isAutoRunning && !isAllMatch) {
        window.isAutoRunning = false;
        const autoBtn = document.getElementById('btnAutoBill');
        if (autoBtn) {
            autoBtn.textContent = "AUTO";
            autoBtn.style.background = "#c6f0ff";
        }
        if (window.billTimer) {
            window.billTimer.stop();
        }
    }

    return isAllMatch;
}

// Navigation Init
function initPurchaseModal() {
    if (!window.billTimer) {
        window.billTimer = new DashboardTimer('ajioBillTimerContainer', 'ajioBillTimerVal', 'ajioBillTimerSpeed', 'ajioBillTimerRemaining');
    }

    document.getElementById('btnCloseModal')?.addEventListener('click', () => {
        document.getElementById('purchaseModal').style.display = 'none';
        window.isAutoRunning = false;
        if (window.billTimer) {
            window.billTimer.stop();
        }
    });

    document.getElementById('btnNextBill')?.addEventListener('click', () => {
        const currentIdx = parseInt(document.getElementById('mBillJumpInput').value) || 0;
        if (currentIdx < globalPurchaseData.length - 1) updatePurchaseModalData(currentIdx + 1);
    });

    document.getElementById('btnPrevBill')?.addEventListener('click', () => {
        const currentIdx = parseInt(document.getElementById('mBillJumpInput').value) || 0;
        if (currentIdx > 1) updatePurchaseModalData(currentIdx - 1);
    });

    document.getElementById('btnRestartBill')?.addEventListener('click', () => {
        updatePurchaseModalData(1);
        if (window.billTimer) {
            window.billTimer.reset();
            window.billTimer.updateProgress(1);
        }
    });

    document.getElementById('mBillJumpInput')?.addEventListener('change', (e) => {
        updatePurchaseModalData(parseInt(e.target.value) || 1);
    });

    document.getElementById('btnAutoBill')?.addEventListener('click', (e) => {
        if (window.isAutoRunning) {
            window.isAutoRunning = false;
            e.target.textContent = "AUTO";
            e.target.style.background = "#c6f0ff";
            if (window.billTimer) window.billTimer.stop();
            return;
        }
        window.isAutoRunning = true;
        e.target.textContent = "STOP";
        e.target.style.background = "#ffd6d6";

        const currentIdx = parseInt(document.getElementById('mBillJumpInput').value) || 0;
        if (window.billTimer) {
            window.billTimer.start(currentIdx, globalPurchaseData.length);
        }

        const auto = () => {
            if (!window.isAutoRunning) return;
            const currentIdx = parseInt(document.getElementById('mBillJumpInput').value) || 0;
            if (currentIdx < globalPurchaseData.length - 1) {
                updatePurchaseModalData(currentIdx + 1);
                setTimeout(auto, 900);
            } else {
                window.isAutoRunning = false;
                e.target.textContent = "AUTO";
                e.target.style.background = "#c6f0ff";
                if (window.billTimer) window.billTimer.stop();
            }
        };
        auto();
    });

    document.getElementById('btnStopBill')?.addEventListener('click', () => {
        window.isAutoRunning = false;
        const autoBtn = document.getElementById('btnAutoBill');
        if (autoBtn) {
            autoBtn.textContent = "AUTO";
            autoBtn.style.background = "#c6f0ff";
        }
        if (window.billTimer) window.billTimer.stop();
    });
}

// Attach Init
document.addEventListener('DOMContentLoaded', initPurchaseModal);
