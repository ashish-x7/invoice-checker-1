// Myntra Portal Processing Logic (Converted from VBA Import_File_To_Portal)

// Function to get nickname from storage
async function getNickname() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['nickname', 'session'], (res) => {
                resolve(res.nickname || (res.session && res.session.nickName) || localStorage.getItem('nickname') || 'User');
            });
        });
    }
    return localStorage.getItem('nickname') || 'User';
}

document.getElementById('processBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('excelUpload');
    const portalStatus = document.getElementById('portalStatus');
    
    // 1. CLEAR DASHBOARD PRE-STATE
    if (portalStatus) portalStatus.textContent = "";

    // 2. FILE SELECTION CHECK
    if (fileInput.files.length === 0) {
        if (portalStatus) {
            portalStatus.textContent = "❌ Select file";
            portalStatus.style.color = "#e74c3c";
        }
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        const nickname = await getNickname();
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

        if (rows.length === 0) {
            if (portalStatus) {
                portalStatus.textContent = "❌ File is empty";
                portalStatus.style.color = "#e74c3c";
            }
            return;
        }

        // 3. VBA FILTER LOGIC: Filter rows where Column C (Index 2) is not blank
        const originalHeaders = rows[0];
        const newHeaders = [...originalHeaders];
        
        // Ensure headers reaches S (Index 18)
        while (newHeaders.length < 18) {
            newHeaders.push(`Col ${String.fromCharCode(65 + newHeaders.length)}`);
        }
        
        // Add 11 new Col headers starting from index 18 (S) to 117 (DN)
        const labels = [
            "CONCAT (S)", "L_VAL (T)", "RATE (U)", "SGST (V)", "CGST (W)", "IGST (X)", "TAX_VAL (Y)", "TOTAL (Z)",
            "ROUND DIFF (AA)", "GRAND TOTAL (AB)", "QTY (AC)", "SALE_MATCH (AD)", "MATCH_VAL (AE)",
            "V_COST (AF)", "W_TAXABLE (AG)", "X_SGST (AH)", "Y_CGST (AI)", "Z_IGST (AJ)", "AB_ROUND (AK)", "AD_QTY (AL)",
            "U_RATE (AM)", "Y_TAX (AN)", "V_SGST (AO)", "W_CGST (AP)", "X_IGST (AQ)", "AB_GRAND (AR)", "AC_QTY (AS)",
            "DIFF_COST (AT)", "DIFF_TAX (AU)", "DIFF_SGST (AV)",
            "DIFF_CGST (AW)", "DIFF_IGST (AX)", "DIFF_ROUND (AY)", "DIFF_QTY (AZ)",
            "STATUS_COST (BA)", "STATUS_TAX (BB)", "STATUS_SGST (BC)", "STATUS_CGST (BD)", "STATUS_IGST (BE)", "STATUS_ROUND (BF)", "STATUS_QTY (BG)",
            "PUR_MATCH_ID (BH)", "PUR_INV (BI)", "SALE_RATE (BJ)", "PUR_RATE (BK)", "RATE_DIFF (BL)", "RATE_STATUS (BM)", "SUMMARY_STATUS (BN)",
            "ROUND_AK (BO)", "ROUND_AR (BP)", "ROUND_DIFF (BQ)", "ROUND_STATUS (BR)", "TRANS_BI (BS)", "MIR_BL (BT)", "MIR_BM (BU)", "STATUS_TEXT (BV)", "STATUS_TEXT_2 (BW)",
            "STATUS_TEXT_3 (BX)", "MIR_AD (BY)", "BZ_SALE_AF (BZ)", "CA_SALE_AE (CA)", "CB_SALE_AG (CB)", "CC_SALE_AH (CC)", "CD_SALE_AI (CD)", "CE_SALE_AM (CE)", "CF_POR_BW (CF)", "CG_SALE_AV (CG)", "CH_PUR_BG (CH)", "CI_PUR_BH (CI)", "CJ_PUR_BI (CJ)",
            "CK_VLOOKUP_BV (CK)", "CL_SUB_S_P (CL)", "CM_MIR_BZ (CM)", "CN_MIR_CA (CN)", "CO_MIR_CB (CO)", "CP_MIR_CC (CP)", "CQ_MIR_CD (CQ)", "CR_MIR_CE (CR)",
            "CS_BLANK (CS)", "CT_STATUS_STAR (CT)", "CU_MIR_CM (CU)", "CV_MIR_CL (CV)", "CW_MIR_CH (CW)", "CX_MIR_CI (CX)", "CY_MIR_CJ (CY)", "CZ_BLANK (CZ)", "DA_SYNC_TIME (DA)", "DB_FINAL_AUDIT (DB)"
        ];
        
        let finalHeaders = newHeaders.slice(0, 18).concat(labels);
        
        // Pad headers to DN (117)
        while (finalHeaders.length < 118) {
            let colIdx = finalHeaders.length;
            let colName = '';
            let tempIdx = colIdx;
            while (tempIdx >= 0) {
                colName = String.fromCharCode((tempIdx % 26) + 65) + colName;
                tempIdx = Math.floor(tempIdx / 26) - 1;
            }
            finalHeaders.push(`${colName} (${colName})`);
        }

        const startTime = Date.now();
        let inserted = 0;
        let errorCount = 0;
        let statusVal = 'Success';
        let errorMsg = '';
        let processedData = [finalHeaders];

        try {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;
                const valC = String(row[2] || "").trim();
                
                if (valC !== "") {
                    let newRow = [...row];
                    // Pad to DN (117)
                    while (newRow.length < 118) newRow.push("");

                    // Data extraction
                    const a = newRow[0], c = newRow[2], h = newRow[7], idxI = newRow[8];
                    const l = parseFloat(newRow[11]) || 0;
                    const k = parseFloat(newRow[10]) || 0;
                    const rStr = String(newRow[17] || "").trim().toUpperCase();
                    let m = parseFloat(String(newRow[12] || "").replace("%", "")) || 0;
                    if (m > 1) m = m / 100;

                    // S (18): =A2&C2&H2&I2
                    const sConcat = String(a||"") + String(c||"") + String(h||"") + String(idxI||"");
                    newRow[18] = sConcat;

                    // T (19): =L2
                    newRow[19] = l.toFixed(2);

                    // U (20): RATE = L2
                    newRow[20] = l.toFixed(2);

                    // V (21): SGST
                    let v = "";
                    if (rStr === "GJ") v = ((l * k * m) / 2).toFixed(2);
                    newRow[21] = v;

                    // W (22): CGST
                    let w = "";
                    if (rStr === "GJ") w = ((l * k * m) / 2).toFixed(2);
                    newRow[22] = w;

                    // X (23): IGST
                    let x = "";
                    if (rStr !== "GJ") x = (l * k * m).toFixed(2);
                    newRow[23] = x;

                    // Y (24): Taxable
                    const yVal = l * k;
                    newRow[24] = yVal.toFixed(2);

                    // Z (25): Total
                    // Formula: =IF(R2="GJ", Y2+V2+W2, Y2+X2)
                    // Shifted indices: Y=24, V=21, W=22, X=23
                    let zVal = 0;
                    const taxableVal = parseFloat(newRow[24]) || 0;
                    if (rStr === "GJ") {
                        const sgstVal = parseFloat(newRow[21]) || 0;
                        const cgstVal = parseFloat(newRow[22]) || 0;
                        zVal = taxableVal + sgstVal + cgstVal;
                    } else {
                        const igstVal = parseFloat(newRow[23]) || 0;
                        zVal = taxableVal + igstVal;
                    }
                    newRow[25] = zVal.toFixed(2);

                    // AA (26): Rounding Difference Logic
                    const zNum = parseFloat(newRow[25]) || 0;
                    const intZ = Math.floor(zNum);
                    const fractionalZ = parseFloat((zNum - intZ).toFixed(2));
                    let aaVal = 0;
                    if (fractionalZ <= 0.49) {
                        aaVal = fractionalZ;
                    } else {
                        aaVal = (intZ + 1) - zNum;
                    }
                    newRow[26] = aaVal.toFixed(2);

                    // AB (27): Grand Total (Round Z to 0)
                    newRow[27] = Math.round(zNum);

                    // AC (28): Qty
                    newRow[28] = k;

                    // DA (104): Date + Time + Nickname
                    newRow[104] = new Date().toLocaleString('en-GB') + " - " + nickname;

                    // LIMIT TO CR (Index 95, total length 96)
                    if (processedData[0] && processedData[0].length > 96) {
                        processedData[0] = processedData[0].slice(0, 96);
                    }
                    if (newRow.length > 96) {
                        newRow = newRow.slice(0, 96);
                    }

                    processedData.push(newRow);
                }
            }

            // 4. STORAGE & SYNC (Full Dashboard Reflow)
            globalPortalData = processedData;
            if (typeof triggerFullDashboardRefresh === 'function') {
                await triggerFullDashboardRefresh(); 
            }
            inserted = processedData.length - 1;
        } catch (err) {
            console.error("Myntra Portal Processing Error:", err);
            statusVal = 'Failed';
            errorMsg = err.message;
            errorCount = 1;
        }

        // Log upload status
        if (window.logFileUpload) {
            await window.logFileUpload({
                platform: 'Myntra',
                accountName: 'Myntra Portal',
                fileName: file.name,
                actionName: 'Portal Process',
                inserted: inserted,
                updated: 0,
                errorCount: errorCount,
                status: statusVal,
                error: errorMsg,
                startTime: startTime,
                endTime: Date.now()
            });
        }

        // 5. UPDATE UI
        if (statusVal === 'Success') {
            portalStatus.textContent = "✅ Data Uploaded";
            portalStatus.style.color = "#27ae60";
        } else {
            portalStatus.textContent = `❌ Error: ${errorMsg}`;
            portalStatus.style.color = "#e74c3c";
        }

        // 6. STAY ON PORTAL TAB
        currentSheet = 'portal'; 
        if (typeof refreshView === 'function') refreshView();

        setTimeout(() => {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            const portalTab = document.getElementById('tabPortalBtn');
            if (portalTab) portalTab.classList.add('active');
        }, 800);
    };

    reader.onerror = () => {
        if (portalStatus) {
            portalStatus.textContent = "❌ Error reading file";
            portalStatus.style.color = "#e74c3c";
        }
    };

    reader.readAsArrayBuffer(file);
});
