// Myntra Sale Processing Logic (Converted from VBA Create_Sale_Invoice_File)
document.getElementById('processSaleBtn').addEventListener('click', async () => {
    const detailInput = document.getElementById('saleDetailUpload');
    const summaryInput = document.getElementById('saleSummaryUpload');
    const statusEl = document.getElementById('saleStatus');

    if (detailInput.files.length === 0 || summaryInput.files.length === 0) {
        statusEl.textContent = "❌ Select both files";
        statusEl.style.color = "#e74c3c";
        return;
    }

    const startTime = Date.now();
    let inserted = 0;
    let errorCount = 0;
    let statusVal = 'Success';
    let errorMsg = '';
    
    let detailFile = null;
    let summaryFile = null;
    let duplicateFile = null;
    let _dupRowCount = 0;

    try {
        statusEl.textContent = "⏳ Processing...";
        statusEl.style.color = "#64748b";

        detailFile = detailInput.files[0];
        summaryFile = summaryInput.files[0];
        const duplicateFileInput = document.getElementById('duplicateInvoiceUpload');
        duplicateFile = duplicateFileInput.files.length > 0 ? duplicateFileInput.files[0] : null;

        // 1. READ DETAIL FILE
        const detailRows = await readExcelFile(detailFile);
        if (detailRows.length < 3) throw new Error("Detail file too small");

        // 2. READ SUMMARY FILE & BUILD MAP
        const summaryRows = await readExcelFile(summaryFile);
        const summaryMap = new Map();
        for (let i = 0; i < summaryRows.length; i++) {
            if (!summaryRows[i]) continue;
            const invId = String(summaryRows[i][2] || "").trim(); // Column C
            if (invId) summaryMap.set(invId, summaryRows[i]);
        }

        // 3. TARGET STRUCTURE
        const headers = [
            "Order ID", "Invoice ID", "New Invoice ID", "Igst", 
            "Shipment date", "Invoice date", "GST ID", "SKU ID", 
            "SKU", "Item Title", "Quantity", "Item Cost", 
            "Cgst", "Sgst", "HSN", "Warehouse Code/Name", 
            "Status", "State Code", "Billing GST ID",
            "CONCAT (T)", "VLOOKUP (U)", "ITEM_COST (V)", "TAXABLE (W)", "SGST (X)", "CGST (Y)", "IGST (Z)",
            "TOTAL (AA)", "ROUND (AB)", "RND_DIFF (AC)", "QTY (AD)", "INV_NEW (AE)", "ORD_ID (AF)",
            "INV_DATE (AG)", "INV_DATE2 (AH)", "QTY2 (AI)", "INV_NEW2 (AJ)", "ORD_ID2 (AK)", "SUB_INV (AL)", "RATE (AM)",
            "VLOOK_RES (AN)", "INV_NEW3 (AO)", "ORD_ID3 (AP)", "INV_NEW4 (AQ)", "INV_DATE3 (AR)", "INV_DATE4 (AS)",
            "QTY3 (AT)", "ROUND2 (AU)", "STATE (AV)"
        ];

        // BUILD PORTAL LOOKUP SET (Column S is index 18 in Portal data)
        const portalIdSet = new Set();
        if (typeof globalPortalData !== 'undefined' && globalPortalData.length > 1) {
            for (let j = 1; j < globalPortalData.length; j++) {
                const portalS = String(globalPortalData[j][18] || "").trim();
                if (portalS) portalIdSet.add(portalS);
            }
        }

        const resultRows = [headers];

        // 4. MAPPING (Start from row 3 as per VBA G3:G)
        for (let i = 2; i < detailRows.length; i++) {
            const dRow = detailRows[i];
            if (!dRow) continue;
            const newRow = new Array(48).fill("");

            // Direct Mappings
            newRow[0] = dRow[6] || "";  // A: Order ID (G)
            newRow[2] = dRow[1] || "";  // C: New Invoice ID (B)
            newRow[6] = dRow[5] || "";  // G: GST ID (F)
            newRow[7] = dRow[7] || "";  // H: SKU ID (H)
            newRow[8] = dRow[8] || "";  // I: SKU (I)
            newRow[9] = dRow[9] || "";  // J: Item Title (J)
            newRow[10] = dRow[11] || ""; // K: Quantity (L)
            newRow[11] = dRow[12] || ""; // L: Item Cost (M)
            newRow[14] = dRow[10] || ""; // O: HSN (K)

            newRow[3] = dRow[14] ? dRow[14] + "%" : ""; // D: Igst (O)
            newRow[12] = dRow[15] ? dRow[15] + "%" : ""; // M: Cgst (P)
            newRow[13] = dRow[16] ? dRow[16] + "%" : ""; // N: Sgst (Q)

            newRow[4] = dRow[2] || ""; // E: Shipment date (C)
            newRow[5] = dRow[2] || ""; // F: Invoice date (C)

            // Lookup Mapping
            const match = summaryMap.get(String(newRow[2]).trim());
            if (match) {
                newRow[1] = match[1] || ""; // B: Invoice ID (Summary B)
                newRow[15] = (match[7] || "") + "/" + (match[6] || ""); // P: Warehouse (H/G)
                
                // Extract state code from brackets: "Karnataka (KA)" -> "KA"
                const stateFull = String(match[16] || ""); // Summary Q
                const bracketMatch = stateFull.match(/\(([^)]+)\)/);
                if (bracketMatch) newRow[17] = bracketMatch[1]; // R: State Code
            }

            // Fixed Values
            newRow[16] = "submitted"; // Q
            newRow[18] = "29AAECM9636P1ZJ"; // S

            // --- NEW CALCULATED COLUMNS (T-Z) ---
            const aVal = newRow[0], cVal = newRow[2], hVal = newRow[7], iVal = newRow[8];
            const kVal = parseFloat(newRow[10]) || 0;
            const lVal = parseFloat(newRow[11]) || 0;
            const state = String(newRow[17] || "").trim();
            const cgstPct = (parseFloat(String(newRow[12] || "").replace("%","")) || 0) / 100;
            const sgstPct = (parseFloat(String(newRow[13] || "").replace("%","")) || 0) / 100;
            const igstPct = (parseFloat(String(newRow[3] || "").replace("%","")) || 0) / 100;

            // T (19): =A2&C2&H2&I2
            const tConcat = String(aVal||"") + String(cVal||"") + String(hVal||"") + String(iVal||"");
            newRow[19] = tConcat;

            // U (20): ID Value
            newRow[20] = tConcat;

            // V (21): =L2
            newRow[21] = lVal.toFixed(2);

            // W (22): =V2*K2
            const wTaxable = lVal * kVal;
            newRow[22] = wTaxable.toFixed(2);

            // X (23): =IF(R2="GJ", V2*K2*M2, "") -> Using col 12
            newRow[23] = (state === "GJ") ? (wTaxable * cgstPct).toFixed(2) : "";

            // Y (24): =IF(R2="GJ", V2*K2*M2, "") -> Using col 13
            newRow[24] = (state === "GJ") ? (wTaxable * sgstPct).toFixed(2) : "";

            // Z (25): =IF(R2="GJ","", V2*K2*D2) -> Using col 3
            newRow[25] = (state !== "GJ") ? (wTaxable * igstPct).toFixed(2) : "";

            // --- NEW CALCULATED COLUMNS (AA-AM) ---

            // AA (26): =IF(R2="GJ", W2+X2+Y2, W2+Z2)
            const wVal = parseFloat(newRow[22]) || 0;
            const xVal = parseFloat(newRow[23]) || 0;
            const yVal = parseFloat(newRow[24]) || 0;
            const zVal = parseFloat(newRow[25]) || 0;
            const aaTotal = (state === "GJ") ? (wVal + xVal + yVal) : (wVal + zVal);
            newRow[26] = aaTotal.toFixed(2);

            // AB (27): =ROUND(AA2,0)
            newRow[27] = Math.round(aaTotal);

            // AC (28): Rounding Diff
            const aaVal = aaTotal;
            const intAA = Math.floor(aaVal);
            const diffAA = aaVal - intAA;
            const roundDiffAA = Math.round(diffAA * 100) / 100;
            let acRes = 0;
            if (roundDiffAA <= 0.49) {
                acRes = diffAA;
            } else {
                acRes = (intAA + 1) - aaVal;
            }
            newRow[28] = acRes.toFixed(2);

            // AD (29): =K2
            newRow[29] = newRow[10];

            // AE (30): =IF(LEN(TRIM(C2))=0,"",C2)
            newRow[30] = String(newRow[2] || "").trim() === "" ? "" : newRow[2];

            // AF (31): =IF(A2="","",A2)
            newRow[31] = String(newRow[0] || "").trim() === "" ? "" : newRow[0];

            // AG (32): =IF(F2="","",F2)
            newRow[32] = String(newRow[5] || "").trim() === "" ? "" : newRow[5];

            // AH (33): =IF(F2="","",F2)
            newRow[33] = String(newRow[5] || "").trim() === "" ? "" : newRow[5];

            // AI (34): =IF(K2="","",K2)
            newRow[34] = String(newRow[10] || "").trim() === "" ? "" : newRow[10];

            // AJ (35): =C2
            newRow[35] = newRow[2];

            // AK (36): =A2
            newRow[36] = newRow[0];

            // AL (37): =SUBSTITUTE(AJ2, "C", "P")
            newRow[37] = String(newRow[35] || "").replaceAll("C", "P");

            // AM (38): =IF(V2="","",V2)
            newRow[38] = String(newRow[21] || "").trim() === "" ? "" : newRow[21];

            // --- NEW CALCULATED COLUMNS (AN-AS) ---

            // AN (39): =IF(U2="","",U2)
            newRow[39] = String(newRow[20] || "").trim() === "" ? "" : newRow[20];

            // AO (40): =C2
            newRow[40] = newRow[2];

            // AP (41): =A2
            newRow[41] = newRow[0];

            // AQ (42): =C2
            newRow[42] = newRow[2];

            // AR (43): =F2
            newRow[43] = newRow[5];

            // AS (44): =AR2
            newRow[44] = newRow[43];

            // --- NEW CALCULATED COLUMNS (AT-AV) ---

            // AT (45): =K2
            newRow[45] = newRow[10];

            // AU (46): =AB2
            newRow[46] = newRow[27];

            // AV (47): =IF(R2="","",R2)
            newRow[47] = String(newRow[17] || "").trim() === "" ? "" : newRow[17];

            resultRows.push(newRow);
        }

        // DUPLICATE INVOICE CHECK
        let mismatchCount = 0;
        let _dupRowCount = 0;
        if (duplicateFile) {
            const duplicateRows = await readExcelFile(duplicateFile);
            _dupRowCount = Math.max(0, duplicateRows.length - 1);
            mismatchCount = checkDuplicateInvoices(resultRows, duplicateRows);
        }

        // 5. STORAGE & SYNC (Full Dashboard Reflow)
        globalSaleData = resultRows;
        if (typeof triggerFullDashboardRefresh === 'function') {
            await triggerFullDashboardRefresh(); 
        }

        // Extract Party Code from C2 (index 2 of first data row)
        if (resultRows.length > 1) {
            const firstInvoiceId = String(resultRows[1][2] || "");
            const partyMatch = firstInvoiceId.match(/(?:AJ|MY)\d{2}S(\d{3})/);
            if (partyMatch && partyMatch[1]) {
                localStorage.setItem('global_party_code', partyMatch[1]);
                console.log(`[DEBUG Myntra Sale] Extracted Party Code: ${partyMatch[1]}`);
            }
        }

        inserted = resultRows.length - 1;
        errorCount = mismatchCount;
        if (errorCount > 0) {
            statusVal = 'Failed';
            errorMsg = `Found ${errorCount} duplicate mismatches`;
        }
    } catch (err) {
        console.error(err);
        statusVal = 'Failed';
        errorMsg = err.message;
        errorCount = 1;
    }

    // Log upload status
    if (window.logFileUpload) {
        const endTime = Date.now();
        const baseLog = { platform: 'Myntra', accountName: 'Myntra Sale', actionName: 'Sale Process', inserted: inserted, updated: 0, errorCount: errorCount, status: statusVal, error: errorMsg, startTime: startTime, endTime: endTime };
        if (detailFile) await window.logFileUpload({ ...baseLog, fileName: detailFile.name });
        if (summaryFile) await window.logFileUpload({ ...baseLog, fileName: summaryFile.name });
        if (duplicateFile) await window.logFileUpload({ ...baseLog, fileName: duplicateFile.name, inserted: _dupRowCount });
    }

    // 6. UPDATE UI
    if (statusVal === 'Success') {
        statusEl.textContent = "✅ Data Uploaded";
        statusEl.style.color = "#27ae60";
    } else {
        statusEl.textContent = `❌ Error: ${errorMsg}`;
        statusEl.style.color = "#e74c3c";
        window.showCustomError(errorMsg, "Sale Details Error");
    }

    currentSheet = 'sale';
    if (typeof refreshView === 'function') refreshView();

    // Auto-switch to SALE tab view
    setTimeout(() => {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const saleTabBtn = document.getElementById('tabSaleBtn');
        if (saleTabBtn) saleTabBtn.classList.add('active');
    }, 1000);
});

function checkDuplicateInvoices(saleData, duplicateRows) {
    try {
        const saleCounts = {};
        // Index 2 is New Invoice ID (Column C)
        for (let i = 1; i < saleData.length; i++) {
            const invId = String(saleData[i][2] || "").trim().toUpperCase();
            if (invId) {
                saleCounts[invId] = (saleCounts[invId] || 0) + 1;
            }
        }

        const mismatches = [["INVOICE NO", "EXPECTED COUNT", "ACTUAL COUNT (UPLOADED)", "STATUS"]];
        const dupDict = {};

        for (let i = 1; i < duplicateRows.length; i++) {
            const row = duplicateRows[i];
            if (!row) continue;
            const invId = String(row[0] || "").trim().toUpperCase();
            const expectedCount = parseInt(row[1]) || 0;
            if (!invId) continue;

            dupDict[invId] = expectedCount;
            const actualCount = saleCounts[invId] || 0;

            // Only report mismatch if the invoice actually exists in the upload (actualCount > 0)
            if (actualCount > 0 && actualCount !== expectedCount) {
                mismatches.push([invId, expectedCount, actualCount, actualCount > expectedCount ? "Extra Count" : "Less Count"]);
            }
        }

        // Visa versa: Check if any invoice appears multiple times in upload but is NOT in the duplicate list.
        for (const invId in saleCounts) {
            if (saleCounts[invId] > 1 && !dupDict[invId]) {
                mismatches.push([invId, "N/A (Not in List)", saleCounts[invId], "Unexpected Duplicates"]);
            }
        }

        if (mismatches.length > 1) {
            const ws = XLSX.utils.aoa_to_sheet(mismatches);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "MISMATCH REPORT");
            if (window.directDownloadExcel) {
                window.directDownloadExcel(wb, "DUPLICATE_INVOICE_MISMATCH_REPORT.xlsx");
            } else {
                XLSX.writeFile(wb, "DUPLICATE_INVOICE_MISMATCH_REPORT.xlsx");
            }
            window.showCustomAlert(`Found ${mismatches.length - 1} mismatches in Duplicate Invoice check. Report downloaded.`, "Duplicate Check Warning");
            return mismatches.length - 1;
        } else {
            console.log("[DUPLICATE CHECK] All match perfectly!");
            return 0;
        }
    } catch (error) {
        console.error("Duplicate Invoice Check Error:", error);
        return 0;
    }
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
                resolve(rows);
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsArrayBuffer(file);
    });
}
