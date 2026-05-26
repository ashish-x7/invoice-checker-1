/**
 * MYNTRA CENTRALIZED MODAL LOGIC (SALE & PURCHASE)
 */

// Shared Helpers
const toNum = (v) => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return v;
    const num = parseFloat(String(v).replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? 0 : num;
};

const fmt = (v) => `₹ ${toNum(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nearDecimal = (a, b) => Math.abs(toNum(a) - toNum(b)) < 1;
const boolStatus = (ok) => ok ? "TRUE" : "FALSE";
const okStatusHtml = () => '<span class="status-badge status-true">OK 👍</span>';
const statusHtml = (s) => (s === "TRUE" 
    ? '<span class="status-badge status-true">TRUE 👍</span>' 
    : '<span class="status-badge status-false">FALSE ❌</span>');

// --- SALE MODAL LOGIC ---
function updateCheckerUI(rowIdx) {
    if (typeof globalSaleData === 'undefined' || !globalSaleData[rowIdx]) return false;
    currentCheckerRow = rowIdx;
    if (window.myntraInvoiceTimer) {
        window.myntraInvoiceTimer.updateProgress(rowIdx);
    }

    const sRow = globalSaleData[rowIdx];
    const invNo = String(sRow[2] || "").trim(); // Sale Column C (Index 2)

    // Header Info
    document.getElementById('fieldInvNo').textContent = invNo || "---";
    document.getElementById('fieldInvDate').textContent = sRow[5] || "---"; // Sale Row index 5
    document.getElementById('fieldInvID').textContent = sRow[0] || "---";   // Order ID
    document.getElementById('fieldInvCount').textContent = `${rowIdx} / ${globalSaleData.length - 1}`;
    
    if (typeof updateMyntraModalSellerNames === 'function') updateMyntraModalSellerNames();

    const jump = document.getElementById('fieldInvJumpInput');
    if (jump) jump.value = rowIdx;

    // 1. DATA MATCH (Search Invoice No in Portal Column CR [95])
    const portalRow = (typeof globalPortalData !== 'undefined') ? globalPortalData.find(pr => String(pr[95] || "").trim() === invNo) : null;

    // 2. STATE CODE LOOKUP (Search Invoice No in Portal Column C [2] -> Get R [17])
    const stateMatchRow = (typeof globalPortalData !== 'undefined') ? globalPortalData.find(pr => String(pr[2] || "").trim() === invNo) : null;
    const stateCode = stateMatchRow ? String(stateMatchRow[17] || "").trim().toUpperCase() : "";
    const isGJ = (stateCode === "GJ");

    // 3. ROW MAPPING & COMPARISON
    
    // Total Without Tax: Portal AN (39) vs Sale AG (32)
    const pAmt = portalRow ? portalRow[39] : 0;
    const sAmt = portalRow ? portalRow[32] : 0;
    const amtStat = boolStatus(nearDecimal(pAmt, sAmt));
    document.getElementById('rowAmtPortal').textContent = fmt(pAmt);
    document.getElementById('rowAmtSale').textContent = fmt(sAmt);
    document.getElementById('rowAmtStatus').innerHTML = statusHtml(amtStat);

    // Quantity: Portal AS (44) vs Sale AL (37)
    const pQty = portalRow ? portalRow[44] : 0;
    const sQty = portalRow ? portalRow[37] : 0;
    const qtyStat = boolStatus(toNum(pQty) === toNum(sQty));
    document.getElementById('rowQtyPortal').textContent = `Q ${toNum(pQty)}`;
    document.getElementById('rowQtySale').textContent = `Q ${toNum(sQty)}`;
    document.getElementById('rowQtyStatus').innerHTML = statusHtml(qtyStat);

    // GST Rows
    let cgstStat = "TRUE", sgstStat = "TRUE", igstStat = "TRUE";
    
    if (isGJ) {
        const pCgst = portalRow ? portalRow[41] : 0; // AP
        const sCgst = portalRow ? portalRow[33] : 0; // AH
        cgstStat = boolStatus(nearDecimal(pCgst, sCgst));
        document.getElementById('rowCgstPortal').textContent = fmt(pCgst);
        document.getElementById('rowCgstSale').textContent = fmt(sCgst);
        document.getElementById('rowCgstStatus').innerHTML = statusHtml(cgstStat);

        const pSgst = portalRow ? portalRow[40] : 0; // AO
        const sSgst = portalRow ? portalRow[34] : 0; // AI
        sgstStat = boolStatus(nearDecimal(pSgst, sSgst));
        document.getElementById('rowSgstPortal').textContent = fmt(pSgst);
        document.getElementById('rowSgstSale').textContent = fmt(sSgst);
        document.getElementById('rowSgstStatus').innerHTML = statusHtml(sgstStat);

        document.getElementById('rowIgstPortal').textContent = "---";
        document.getElementById('rowIgstSale').textContent = "---";
        document.getElementById('rowIgstStatus').innerHTML = "";
    } else {
        const pIgst = portalRow ? portalRow[42] : 0; // AQ
        const sIgst = portalRow ? portalRow[35] : 0; // AJ
        igstStat = boolStatus(nearDecimal(pIgst, sIgst));
        document.getElementById('rowIgstPortal').textContent = fmt(pIgst);
        document.getElementById('rowIgstSale').textContent = fmt(sIgst);
        document.getElementById('rowIgstStatus').innerHTML = statusHtml(igstStat);

        document.getElementById('rowCgstPortal').textContent = "---";
        document.getElementById('rowCgstSale').textContent = "---";
        document.getElementById('rowCgstStatus').innerHTML = "";
        document.getElementById('rowSgstPortal').textContent = "---";
        document.getElementById('rowSgstSale').textContent = "---";
        document.getElementById('rowSgstStatus').innerHTML = "";
    }

    document.getElementById('rowStatePortal').textContent = stateCode || "---";
    document.getElementById('rowStateSale').textContent = stateCode || "---";
    document.getElementById('rowStateStatus').innerHTML = statusHtml(stateCode ? "TRUE" : "FALSE");

    const pRnd = portalRow ? portalRow[66] : 0; // BO
    const sRnd = portalRow ? portalRow[67] : 0; // BP
    const rndStat = boolStatus(nearDecimal(pRnd, sRnd));
    document.getElementById('rowRoundPortal').textContent = fmt(pRnd);
    document.getElementById('rowRoundSale').textContent = fmt(sRnd);
    document.getElementById('rowRoundStatus').innerHTML = statusHtml(rndStat);

    const pTotal = portalRow ? portalRow[43] : 0; // AR
    const sTotal = portalRow ? portalRow[36] : 0; // AK
    const totalStat = boolStatus(nearDecimal(pTotal, sTotal));
    document.getElementById('rowTotalPortal').textContent = fmt(pTotal);
    document.getElementById('rowTotalSale').textContent = fmt(sTotal);
    document.getElementById('rowTotalStatus').innerHTML = statusHtml(totalStat);

    return (amtStat === "FALSE" || qtyStat === "FALSE" || cgstStat === "FALSE" || sgstStat === "FALSE" || igstStat === "FALSE" || rndStat === "FALSE" || totalStat === "FALSE");
}

// --- PURCHASE MODAL LOGIC ---
function updatePurchaseUI(rowIdx) {
    if (typeof globalPurchaseData === 'undefined' || !globalPurchaseData[rowIdx]) return;
    currentPurchaseRow = rowIdx;
    if (window.myntraBillTimer) {
        window.myntraBillTimer.updateProgress(rowIdx);
    }
    const purRow = globalPurchaseData[rowIdx];
    const billNo = String(purRow[2] || "").trim();

    document.getElementById('purBillCount').textContent = `${rowIdx} / ${globalPurchaseData.length - 1}`;
    document.getElementById('purBillNo').textContent = billNo || "---";
    document.getElementById('purBillDate').textContent = purRow[5] || "---";
    document.getElementById('purBillID').textContent = purRow[34] || "---";
    if (typeof updateMyntraModalSellerNames === 'function') updateMyntraModalSellerNames();

    // CHECK BILL DETAILS: If bill number is empty, show green error and return true (error)
    if (!billNo || billNo === "") {
        const errorEl = document.getElementById('purBillDetailsError');
        if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.innerHTML = '⚠️ BILL DETAILS MISSING - Auto Stop';
        }
        return true; // Return true to indicate error and stop auto
    } else {
        const errorEl = document.getElementById('purBillDetailsError');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    const amtVal = parseFloat(purRow[23] || 0);
    document.getElementById('purAmtVal').textContent = fmt(amtVal);
    document.getElementById('purAmtStatus').innerHTML = okStatusHtml();

    const pQty = parseInt(purRow[31] || 0);
    const sQty = parseInt(purRow[21] || 0);
    document.getElementById('purQtyVal').textContent = `Q ${pQty} / Q ${sQty}`;
    document.getElementById('purQtyStatus').innerHTML = (pQty === sQty) ? '<span class="status-badge status-true">TRUE 👍</span>' : '<span class="status-badge status-false">DIFF ⚠️</span>';

    const cgstVal = parseFloat(purRow[24] || 0);
    const sgstVal = parseFloat(purRow[25] || 0);
    document.getElementById('purCgstVal').textContent = fmt(cgstVal);
    document.getElementById('purCgstStatus').innerHTML = okStatusHtml();
    document.getElementById('purSgstVal').textContent = fmt(sgstVal);
    document.getElementById('purSgstStatus').innerHTML = okStatusHtml();

    const tdsUpl = parseFloat(purRow[52] || 0);
    const tdsCalc = parseFloat(purRow[53] || 0);
    document.getElementById('purTdsVal').textContent = `${fmt(tdsUpl)} / ${fmt(tdsCalc)}`;
    document.getElementById('purTdsStatus').innerHTML = (Math.abs(tdsUpl - tdsCalc) < 0.1) ? '<span class="status-badge status-true">TRUE 👍</span>' : '<span class="status-badge status-false">DIFF ⚠️</span>';

    const roundVal = parseFloat(purRow[28] || 0);
    document.getElementById('purRoundVal').textContent = fmt(roundVal);
    document.getElementById('purRoundStatus').innerHTML = okStatusHtml();

    const totalVal = parseFloat(purRow[29] || 0);
    document.getElementById('purTotalVal').textContent = fmt(totalVal);
    document.getElementById('purTotalStatus').innerHTML = okStatusHtml();

    const portalRow = (typeof globalPortalData !== 'undefined') ? (() => {
        const normalizedBill = String(billNo || "").trim();
        const saleBill = normalizedBill.replace(/CGJ/g, "PGJ").replace(/MY27P/g, "MY27S");
        return globalPortalData.find(pr => {
            const portalBI = String(pr[60] || "").trim();
            const portalTransBI = String(pr[70] || "").trim();
            return portalBI === normalizedBill
                || portalTransBI === normalizedBill
                || portalBI === saleBill
                || portalTransBI === saleBill;
        });
    })() : null;

    const rawDiff = portalRow ? (portalRow[63] || portalRow[71] || 0) : 0;
    const diffVal = Number.isFinite(parseFloat(rawDiff)) ? parseFloat(rawDiff) : 0;
    const diffStatus = diffVal >= 0 ? "TRUE" : "FALSE";
    
    document.getElementById('purDiffVal').textContent = diffVal.toFixed(2);
    document.getElementById('purDiffStatus').innerHTML = statusHtml(diffStatus);

    return (pQty !== sQty || Math.abs(tdsUpl - tdsCalc) >= 0.1 || diffStatus === "FALSE");
}
