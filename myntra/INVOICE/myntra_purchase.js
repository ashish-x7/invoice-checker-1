// Myntra Purchase Processing Logic (Converted from VBA Upload_Purchase_Details_And_Summary)

document.getElementById('processPurchaseBtn').addEventListener('click', async () => {
    const detailInput = document.getElementById('purchaseDetailUpload');
    const summaryInput = document.getElementById('purchaseSummaryUpload');
    const purchaseStatus = document.getElementById('purchaseStatus');
    
    if (purchaseStatus) purchaseStatus.textContent = "";

    if (detailInput.files.length === 0 || summaryInput.files.length === 0) {
        if (purchaseStatus) {
            purchaseStatus.textContent = "❌ Select both files";
            purchaseStatus.style.color = "#e74c3c";
        }
        return;
    }

    const startTime = Date.now();
    let inserted = 0;
    let errorCount = 0;
    let statusVal = 'Success';
    let errorMsg = '';
    
    let detailFile = null;
    let summaryFile = null;

    try {
        detailFile = detailInput.files[0];
        summaryFile = summaryInput.files[0];

        // Read Details File
        const detailRows = await readExcelFile(detailFile);
        // Read Summary File
        const summaryRows = await readExcelFile(summaryFile);

        if (detailRows.length < 3) throw new Error("Details file too short");

        // 1. Create a Summary Map (Invoice ID -> Row Data)
        // VBA logic looks at summary column C (index 2) starting row 3
        const summaryMap = new Map();
        for (let i = 2; i < summaryRows.length; i++) {
            const row = summaryRows[i];
            const invoiceID = String(row[2] || "").trim().replace(/<br>/g, "");
            if (invoiceID) {
                summaryMap.set(invoiceID, row);
            }
        }

        // 2. Process Details and Merge
        const headers = [
            "Order ID", "Invoice ID", "New Invoice ID", "Invoice Reference Number (IRN)",
            "Shipment date", "Invoice date", "GST ID", "SKU ID", "SKU", "Item Title",
            "Quantity", "Item Cost", "GST Rate", "CESS Rate", "HSN",
            "Warehouse Code/Name", "TDS", "Tax Collected at Source (TCS)", "Billing GST ID",
            "CONCAT (T)", "PORTAL_MATCH (U)",
            "V_QTY (V)", "W_RATE (W)", "X_TAXABLE (X)", "Y_SGST (Y)", "Z_CGST (Z)", "AA_TCS (AA)", "AB_TOTAL (AB)", "AC_ROUND (AC)", "AD_GRAND (AD)", "AE_INV (AE)",
            "AF_P_MATCH (AF)", "AG_QTY_DIFF (AG)", "AH_STATUS (AH)", "AI_ORD (AI)", "AJ_NEW_INV (AJ)", "AK_TRANS_INV (AJ)", "AL_SEG1 (AL)", "AM_SEG2 (AM)", "AN_CHECK (AN)", "STATUS (AO)",
            "AP_TAXABLE_TOTAL (AP)", "AQ_AT_REF (AQ)", "AR_INV_C (AR)", "AS_ORD_A (AS)", "AT_INV_B (AT)", "AU_DATE_F (AU)", "AV_QTY_K (AV)", "AW_MATCH_AD (AW)", "AX_PORTAL_DN (AX)", "AY_TRANS_AX (AY)", "AZ_VLOOK_C2 (AZ)", "BA_VLOOK_C15 (BA)",
            "BC_MIR_U (BC)", "BD_MIR_A (BD)", "BE_MIR_C (BE)", "BF_MIR_F (BF)", "BG_MIR_K (BG)", "BH_MIR_L (BH)"
        ];
        // Wait, fixing labels sequence from BA (52)
        headers[52] = "BA_VLOOK_C15 (BA)";
        headers[53] = "BB_EMPTY (BB)";
        headers[54] = "BC_EMPTY (BC)";
        headers[55] = "BD_MIR_U (BD)";
        headers[56] = "BE_MIR_A (BE)";
        headers[57] = "BF_MIR_C (BF)";
        headers[58] = "BG_MIR_F (BG)";
        headers[59] = "BH_MIR_K (BH)";
        headers[60] = "BI_MIR_L (BI)";
        headers[61] = "BJ_MIR_EXTRA (BJ)";

        const processedData = [headers];

        // VBA starts from row 3 (i=2)
        for (let i = 2; i < detailRows.length; i++) {
            const dRow = detailRows[i];
            const newInvoiceID = String(dRow[1] || "").trim(); // Details B
            
            if (newInvoiceID === "") continue;

            // Create a new row of length 62
            const newRow = new Array(62).fill("");

            // Data from Details
            newRow[0] = dRow[5];  // Order ID (F)
            newRow[2] = dRow[1];  // New Invoice ID (B)
            newRow[6] = dRow[4];  // GST ID (E)
            newRow[7] = dRow[6];  // SKU ID (G)
            newRow[8] = dRow[7];  // SKU (H)
            newRow[9] = dRow[8];  // Item Title (I)
            newRow[10] = dRow[10]; // Quantity (K)
            newRow[11] = dRow[11]; // Item Cost (L)
            newRow[14] = dRow[9];  // HSN (J)

            // Data from Summary Match
            const sMatch = summaryMap.get(newInvoiceID);
            if (sMatch) {
                newRow[1] = String(sMatch[1] || "").trim().replace(/<br>/g, ""); // Invoice ID (B)
                newRow[3] = sMatch[8]; // IRN (I)
                newRow[4] = sMatch[6]; // Shipment Date (G)
                newRow[5] = sMatch[6]; // Invoice Date (G)
                newRow[15] = (sMatch[5] || "") + "/" + (sMatch[4] || ""); // Warehouse (F/E)
                newRow[16] = sMatch[10]; // TDS (K)
            }

            // Fixed Values
            if (newRow[11] !== "") {
                newRow[12] = "5%";
                newRow[13] = "0%";
                newRow[17] = "0";
                newRow[18] = "24AAECE9149B1ZU";
            }

            // CONCAT (T): =A2&B2&H2&I2 (Indices: 0, 1, 7, 8)
            const tConcat = String(newRow[0] || "") + String(newRow[1] || "") + String(newRow[7] || "") + String(newRow[8] || "");
            newRow[19] = tConcat;

            // NEW CALCULATION COLUMNS (V to AE)
            const qty = parseFloat(newRow[10]) || 0;
            const cost = parseFloat(newRow[11]) || 0;
            const gstRate = parseFloat(newRow[12]) / 100 || 0;

            newRow[21] = qty; // V (21): =K2
            newRow[22] = qty > 0 ? (cost / qty).toFixed(2) : "0.00"; // W (22): =L2/K2
            newRow[23] = cost.toFixed(2); // X (23): =W2*V2
            
            const taxable = parseFloat(newRow[23]) || 0;
            newRow[24] = (taxable * gstRate / 2).toFixed(2); // Y (24): =X2*M2/2
            newRow[25] = (taxable * gstRate / 2).toFixed(2); // Z (25): =X2*M2/2
            newRow[26] = (taxable * 0.001).toFixed(2); // AA (26): =X2 * 0.1%
            
            const sgst = parseFloat(newRow[24]) || 0;
            const cgst = parseFloat(newRow[25]) || 0;
            const tcs = parseFloat(newRow[26]) || 0;
            const total = taxable + sgst + cgst - tcs;
            newRow[27] = total.toFixed(2); // AB (27): =X2+Y2+Z2-AA2

            // AC (28): Rounding Difference
            const intTotal = Math.floor(total);
            const fractional = parseFloat((total - intTotal).toFixed(2));
            newRow[28] = (fractional <= 0.49 ? fractional : (intTotal + 1) - total).toFixed(2);

            newRow[29] = Math.round(total); // AD (29): =ROUND(AB2,0)
            newRow[30] = newRow[1]; // AE (30): =B2

            // NEW COLUMNS AF to AN
            newRow[34] = newRow[0]; // AI (34): =A2
            newRow[35] = newRow[2]; // AJ (35): =C2

            // AF (31): Portal Quantity Placeholder (Updated during Sync)
            newRow[31] = "0";

            // Helper for Text Segments
            const getLastSeg = (s) => (s && s !== 0) ? String(s).split("-").pop().trim() : "";

            const ajVal = String(newRow[35] || "");
            if (ajVal !== "" && ajVal !== "0") {
                // AK (36): Transformation
                if (ajVal.startsWith("P")) {
                    newRow[36] = "C" + ajVal.substring(1);
                } else if (ajVal.charAt(4) === "P") {
                    newRow[36] = ajVal.substring(0, 4) + "S" + ajVal.substring(5);
                } else {
                    newRow[36] = "ERROR";
                }
                // AL (37) & AM (38)
                newRow[37] = getLastSeg(ajVal);
                newRow[38] = getLastSeg(newRow[36]);
                // AN (39)
                newRow[39] = newRow[37] === newRow[38] ? "TRUE" : "FALSE";
            }

            // NEW COLUMNS AP to AW (Static Mirroring)
            newRow[41] = (parseFloat(newRow[23]) || 0) + (parseFloat(newRow[24]) || 0) + (parseFloat(newRow[25]) || 0); // AP: =X2+Y2+Z2
            newRow[45] = newRow[1]; // AT: =B2
            newRow[42] = newRow[45]; // AQ: =AT2
            newRow[43] = newRow[2]; // AR: =C2
            newRow[44] = newRow[0]; // AS: =A2
            newRow[46] = dRow[5];   // AU: =F2
            newRow[47] = newRow[10]; // AV: =K2
            newRow[48] = newRow[29]; // AW: =AD2
            
            // BA (52): TDS PORTAL (Mirror of index 16 from Summary ideally, or calculated)
            newRow[52] = newRow[16]; 
            // BB (53): TDS PURCHASE (Mirror of actual TDS)
            newRow[53] = newRow[16];

            // Original data moved to BD (55) onwards
            newRow[55] = newRow[19]; // BD: =U2 (Concat)
            newRow[56] = newRow[0];  // BE: =A2 (Order)
            newRow[57] = newRow[2];  // BF: =C2 (Inv)
            newRow[58] = newRow[5];  // BG: =F2 (Date)
            newRow[59] = newRow[10]; // BH: =K2 (Qty)
            newRow[60] = parseFloat(newRow[11] || 0).toFixed(2); // BI: =L2 (Cost)

            processedData.push(newRow);
        }

        // 3. STORAGE & SYNC (Full Dashboard Reflow)
        purchaseStatus.textContent = "⏳ Refreshing formulas...";
        globalPurchaseData = processedData;
        if (typeof triggerFullDashboardRefresh === 'function') {
            await triggerFullDashboardRefresh(); 
        }

        // Extract Seller Name from Summary (S3 = index 18 of 3rd row)
        if (summaryRows.length >= 3) {
            const sellerName = String(summaryRows[2][18] || "").trim();
            if (sellerName) {
                localStorage.setItem('myntra_purchase_seller_name', sellerName);
                const badge = document.getElementById('purchaseSellerBadge');
                const nameSpan = document.getElementById('purchaseSellerName');
                if (badge && nameSpan) {
                    nameSpan.textContent = sellerName;
                    if (currentSheet === 'purchase') badge.style.display = 'block';
                }
            }
        }

        inserted = processedData.length - 1;
    } catch (err) {
        console.error(err);
        statusVal = 'Failed';
        errorMsg = err.message;
        errorCount = 1;
    }

    // Log upload status
    if (window.logFileUpload) {
        const endTime = Date.now();
        const baseLog = { platform: 'Myntra', accountName: 'Myntra Purchase', actionName: 'Purchase Process', inserted: inserted, updated: 0, errorCount: errorCount, status: statusVal, error: errorMsg, startTime: startTime, endTime: endTime };
        if (detailFile) await window.logFileUpload({ ...baseLog, fileName: detailFile.name });
        if (summaryFile) await window.logFileUpload({ ...baseLog, fileName: summaryFile.name });
    }

    // 4. UPDATE UI
    if (statusVal === 'Success') {
        purchaseStatus.textContent = "✅ Purchase Balanced & Formulas Refreshed (" + inserted + " rows)";
        purchaseStatus.style.color = "#27ae60";
    } else {
        purchaseStatus.textContent = `❌ Error: ${errorMsg}`;
        purchaseStatus.style.color = "#e74c3c";
        window.showCustomError(errorMsg, "Bill Details Error");
    }

    currentSheet = 'purchase'; 
    if (typeof refreshView === 'function') refreshView();

    setTimeout(() => {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const pTab = document.getElementById('tabPurchaseBtn');
        if (pTab) pTab.classList.add('active');
    }, 800);
});

/**
 * Utility to read Excel file rows
 */
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
            resolve(rows);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}
