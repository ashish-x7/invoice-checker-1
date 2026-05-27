// Process Purchase Files Logic
document.getElementById('processPurchaseBtn').addEventListener('click', () => {
    const detailFile = document.getElementById('purchaseDetailUpload').files[0];
    const summaryFile = document.getElementById('purchaseSummaryUpload').files[0];
    
    const purchaseStatus = document.getElementById('purchaseStatus');
    if (purchaseStatus) purchaseStatus.textContent = "";

    if (!detailFile || !summaryFile) {
        if (purchaseStatus) {
            purchaseStatus.textContent = "❌ Select both files";
            purchaseStatus.style.color = "#e74c3c";
        } else {
            window.showCustomAlert("Please upload both PURCHASE DETAIL and PURCHASE SUMMARY files.", "Files Missing");
        }
        return;
    }
    window.portalTdsMapCache = null; // Clear old TDS portal cache
    if (typeof portalDKMap !== 'undefined') portalDKMap.clear(); 
    document.getElementById('tableContainer').innerHTML = "<h3>Processing Purchase data, please wait...</h3>";
    
    const readExcel = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                resolve(rows);
            };
            reader.readAsArrayBuffer(file);
        });
    };
    
    const startTime = Date.now();
    Promise.all([readExcel(detailFile), readExcel(summaryFile)]).then(async ([detailRows, summaryRows]) => {
        let inserted = 0;
        let errorCount = 0;
        let statusVal = 'Success';
        let errorMsg = '';

        try {
            if (detailRows.length === 0 || summaryRows.length === 0) {
                throw new Error("One of the files is empty.");
            }
            
            // Build Summary Dictionary mapping Summary C to Summary B, G, I, K
            const dict = new Map();
            for (let i = 1; i < summaryRows.length; i++) {
                const sumRow = summaryRows[i];
                if (!sumRow) continue;
                const sumC = sumRow[2] !== undefined && sumRow[2] !== null ? String(sumRow[2]).trim() : "";
                if (sumC !== "") {
                    dict.set(sumC, {
                        valB: sumRow[1] !== undefined ? String(sumRow[1]) : "",
                        valG: sumRow[6] !== undefined ? String(sumRow[6]) : "",
                        valI: sumRow[8] !== undefined ? String(sumRow[8]) : "",
                        valK: sumRow[10] !== undefined ? String(sumRow[10]) : ""
                    });
                }
            }
            
            const headers = ["Order ID", "Invoice ID", "New Invoice ID", "W/T Tax", "Shipment date", "Invoice date", "GST ID", "JIO CODE", "SKU", "Item Title", "Quantity", "Item Cost", "GST Rate", "CESS Rate", "HSN", "Warehouse Code/Name", "Tds Amount", "Tax Collected at Source (TCS)", "Billing GST ID"];
            
            // Expansion: Adding headers T through BF
            const moreHeaders = ["T (B&A&H&I)", "U (VLOOKUP Portal!AT)", "V (K)", "W (L/K)", "X (W*V)", "Y (X*M/2)", "Z (X*M/2)", "AA (X*0.1%)", "AB (X+Y+Z-AA)", "AC (TEXT Fraction)", "AD (ROUND AB)", "AE (C)", "AF (BE)", "AG (AF-V)", "AH (AG<1)", "AI (A)", "AJ (C)", "AK (MID S/P)", "AL (TRIM AJ)", "AM (TRIM AK)", "AN (AL=AM)", "AO (COUNTIF)", "AP (B)", "AQ (A)", "AR (C)", "AS (F)", "AT (K)", "AU (AD)", "AV (PORTAL!CI)", "AW (VLOOKUP AW)", "AX (VLOOKUP AX)", "AY (AW*0.1%)", "AZ (AX=AY)", "BA (A&B&H&I)", "BB (AP)", "BC (Mirror AQ)", "BD (Mirror AS)", "BE (Mirror AT)", "BF (Mirror AU)", "BG (Mirror AR)"];
            headers.push(...moreHeaders);

            globalPurchaseData = [headers];

            // Build Portal AT (index 45) Set for U: =VLOOKUP(T2, PORTAL!$AT$1:$AT$6000, 1)
            const portalDataMap = new Map(); // used for AF lookup (Portal BE)
            const portalATSet = new Set();
            if (globalPortalData && globalPortalData.length > 0) {
                for (let p = 1; p < globalPortalData.length; p++) {
                    const atVal = globalPortalData[p][45]; // AT index 45 = F+C+K+N
                    const beVal = globalPortalData[p][56]; // BE index 56
                    if (atVal !== undefined && atVal !== null && String(atVal).trim() !== "") {
                        const atStr = String(atVal).trim();
                        portalATSet.add(atStr.toUpperCase());
                        portalDataMap.set(atStr, beVal); // keep for AF lookup
                    }
                }
            }
            
            for (let i = 2; i < detailRows.length; i++) { // Start at index 2 (Row 3)
                const dRow = detailRows[i];
                if (!dRow) continue;
                const colB = dRow[1] !== undefined ? String(dRow[1]).trim() : "";
                if (colB === "") continue;
                
                const newRow = new Array(headers.length).fill("");
                
                // Map Detail rows
                newRow[2] = dRow[1] !== undefined ? String(dRow[1]) : "";   // C <- B
                newRow[15] = dRow[3] !== undefined ? String(dRow[3]) : "";  // P <- D
                newRow[6] = dRow[4] !== undefined ? String(dRow[4]) : "";   // G <- E
                newRow[8] = dRow[7] !== undefined ? String(dRow[7]) : "";   // I <- H
                newRow[9] = dRow[8] !== undefined ? String(dRow[8]) : "";   // J <- I
                newRow[10] = dRow[10] !== undefined ? String(dRow[10]) : "";// K <- K
                newRow[14] = dRow[9] !== undefined ? String(dRow[9]) : "";  // O <- J
                newRow[11] = dRow[12] !== undefined ? String(dRow[12]) : "";// L <- M
                
                // Validation
                if (newRow[11] == "0") {
                    throw new Error("ERROR: Column L (Item Cost) has 0 at row " + (i + 1));
                }
                const wsDetailO = String(dRow[14]).trim();
                const wsDetailP = String(dRow[15]).trim();
                if (wsDetailO !== "2.5" || wsDetailP !== "2.5") {
                    throw new Error("ERROR: O or P (GST/CESS) not 2.5 at row " + (i + 1));
                }
                
                // Column G Cleaning
                let valG = dRow[6] !== undefined ? String(dRow[6]).trim() : "";
                if (valG !== "") {
                    valG = valG.replace(/,/g, "");
                    if (!isNaN(parseFloat(valG)) && isFinite(valG)) {
                        newRow[7] = Math.floor(parseFloat(valG));
                    } else {
                        newRow[7] = valG;
                    }
                }
                
                // Lookup Dictionary
                const key = newRow[2]; 
                if (dict.has(key)) {
                    const matchVal = dict.get(key);
                    const valB = matchVal.valB;
                    if (valB.includes("<br>")) {
                        const parts = valB.split("<br>");
                        newRow[1] = parts[0] ? parts[0].trim() : ""; // B
                        newRow[0] = parts[1] ? parts[1].trim() : ""; // A
                    } else {
                        newRow[1] = valB.trim(); // B
                    }
                    newRow[4] = matchVal.valG; // E
                    newRow[5] = matchVal.valG; // F
                    newRow[3] = matchVal.valI; // D
                    newRow[16] = matchVal.valK; // Q
                }
                
                // Constants
                newRow[12] = "5%"; // M
                newRow[13] = "0%"; // N
                newRow[17] = "0"; // R
                newRow[18] = "24AAECE9149B1ZU"; // S
                
                // Apply Formulas (T through AP)
                
                const valA = newRow[0] !== undefined && newRow[0] !== null ? String(newRow[0]).trim() : "";
                const valB = newRow[1] !== undefined && newRow[1] !== null ? String(newRow[1]).trim() : "";
                const valC = newRow[2] !== undefined && newRow[2] !== null ? String(newRow[2]).trim() : "";
                const valH = newRow[7] !== undefined && newRow[7] !== null ? String(newRow[7]).trim() : "";
                const valI = newRow[8] !== undefined && newRow[8] !== null ? String(newRow[8]).trim() : "";
                
                const valK = parseFloat(newRow[10]) || 0;
                const valL = parseFloat(newRow[11]) || 0;

                newRow[19] = valB + valA + valH + valI; // Formula: =B2&A2&H2&I2
                const lookupKey = newRow[19];
                // U: =VLOOKUP(T2, PORTAL!$AT$1:$AT$6000, 1) — if T exists in Portal AT, return T, else #N/A
                newRow[20] = portalATSet.has(String(lookupKey).trim().toUpperCase()) ? lookupKey : "#N/A";
                
                newRow[21] = valK;
                
                const resW = valK !== 0 ? valL / valK : 0;
                newRow[22] = resW % 1 !== 0 ? Number(resW.toFixed(4)) : resW;
                
                const resX = resW * valK;
                newRow[23] = resX % 1 !== 0 ? Number(resX.toFixed(4)) : resX;
                
                const resY = resX * 0.05 / 2;
                newRow[24] = resY % 1 !== 0 ? Number(resY.toFixed(4)) : resY;
                
                const resZ = resX * 0.05 / 2;
                newRow[25] = resZ % 1 !== 0 ? Number(resZ.toFixed(4)) : resZ;
                
                const resAA = resX * 0.001;
                newRow[26] = resAA % 1 !== 0 ? Number(resAA.toFixed(4)) : resAA;
                
                const resAB = resX + resY + resZ - resAA;
                newRow[27] = Number(resAB.toFixed(4));
                
                const intAB = Math.floor(resAB);
                const diffAB = Math.round((resAB - intAB) * 100) / 100;
                if (diffAB <= 0.49) {
                    newRow[28] = diffAB.toFixed(2);
                } else {
                    newRow[28] = ((intAB + 1) - resAB).toFixed(2);
                }
                
                newRow[29] = Math.round(resAB);
                newRow[30] = valC;
                
                // AF (Index 31): Mirrored from Quantity Purchase (Index 10) as requested (=BE2)
                newRow[31] = newRow[10];
                
                // AG (AF - V)
                const valAG = (parseFloat(newRow[31]) || 0) - valK;
                newRow[32] = Number(valAG.toFixed(4));
                
                // AH (AG < 1)
                newRow[33] = (Math.abs(valAG) < 1) ? "TRUE ✅ " : "FALSE ❌ ";
                
                newRow[34] = valA;
                newRow[35] = valC;
                
                if (!valC) {
                    newRow[36] = "";
                } else if (valC.length >= 5) {
                    const char5 = valC.charAt(4);
                    if (char5 === 'P' || char5 === 'p') {
                        newRow[36] = valC.substring(0, 4) + 'S' + valC.substring(5);
                    } else {
                        newRow[36] = "ERROR";
                    }
                } else {
                    newRow[36] = "ERROR";
                }
                
                if (!valC) {
                    newRow[37] = "";
                } else {
                    const dashIdx = valC.indexOf("-");
                    if (dashIdx !== -1) {
                        newRow[37] = valC.substring(dashIdx + 1).trim();
                    } else {
                        newRow[37] = "";
                    }
                }
                
                const valAK = newRow[36] || "";
                if (!valAK || valAK === "ERROR") {
                    newRow[38] = "";
                } else {
                    const dashIdx = valAK.indexOf("-");
                    if (dashIdx !== -1) {
                        newRow[38] = valAK.substring(dashIdx + 1).trim();
                    } else {
                        newRow[38] = "";
                    }
                }
                
                newRow[39] = (newRow[37] === newRow[38]) ? "TRUE" : "FALSE";

                globalPurchaseData.push(newRow);
            }

            // --- SECOND PASS: Complex Calculations (AO to BF) ---
            const uniqueInvoices = new Set();
            const purchaseDataMap = new Map(); // Key: Col C (index 2), Value: Row Array
            
            // Build maps from first pass results
            for (let i = 1; i < globalPurchaseData.length; i++) {
                const pRow = globalPurchaseData[i];
                const invId = String(pRow[2] || "").trim();
                const normalize = (id) => String(id || "").toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/S/g, 'P');
                const normInv = normalize(invId);
                let pMatch = (globalPortalData && globalPortalData.find) ? globalPortalData.find(pr => pr && normalize(pr[2]) === normInv) : null;
                if (invId) {
                    uniqueInvoices.add(invId);
                    purchaseDataMap.set(invId, pRow);
                }
            }
            
            // Using global portalDKMap instead of local
            if (globalPortalData && globalPortalData.length > 0) {
                for (let p = 1; p < globalPortalData.length; p++) {
                    if (!globalPortalData[p]) continue;
                    const dk = String(globalPortalData[p][114] || "").trim();
                    if (dk) portalDKMap.set(dk, globalPortalData[p][115]);
                }
            }

            if (globalPurchaseData.length > 1) {
                // 1. Calculate Summary Status for AO2
                let allANTrue = true;
                for (let j = 1; j < globalPurchaseData.length; j++) {
                    if (globalPurchaseData[j][39] !== "TRUE") {
                        allANTrue = false;
                        break;
                    }
                }
                globalPurchaseData[1][40] = allANTrue ? "OK 👍" : "ERROR ⚠️";

                // 2. Fill Columns AP to BF for all rows
                for (let i = 1; i < globalPurchaseData.length; i++) {
                    const pRow = globalPurchaseData[i];
                    
                    // AF (Index 31): FORCED MIRROR = K (=K2) - Per user request
                    pRow[31] = pRow[10]; 

                    pRow[41] = pRow[1];  // AP (Mirror B)
                    pRow[42] = pRow[0];  // AQ (Mirror A)
                    pRow[43] = pRow[2];  // AR (Mirror C)
                    pRow[44] = pRow[5];  // AS (Mirror F)
                    pRow[45] = pRow[10]; // AT (Mirror K)
                    pRow[46] = pRow[29]; // AU (Mirror AD)
                    
                    // AV (Index 47): Bill Number (Key)
                    const billNoKey = String(pRow[2] || "").trim();
                    pRow[47] = billNoKey;
                    
                    // Build a quick map for Portal TDS if not already done (efficiency)
                    if (!window.portalTdsMapCache) {
                        window.portalTdsMapCache = new Map();
                        if (globalPortalData && globalPortalData.length > 0) {
                            for (let p = 1; p < globalPortalData.length; p++) {
                                const pBillNo = String(globalPortalData[p][2] || "").trim();
                                const pTdsVal = globalPortalData[p][86]; // CI (TDS)
                                if (pBillNo) window.portalTdsMapCache.set(pBillNo.toUpperCase(), pTdsVal);
                            }
                        }
                    }

                    // AX (Index 49): TDS Portal (Lookup Bill No in Portal Map)
                    const normKey = billNoKey.toUpperCase();
                    pRow[49] = window.portalTdsMapCache.get(normKey) || 0;

                    // AY (Index 50): TDS Purchase (Lookup Bill No in current sheet - which is already in pRow[16])
                    pRow[50] = parseFloat(pRow[16]) || 0;
                    
                    // AZ (51) Status, BA (52) Key
                    pRow[51] = (Math.abs(pRow[50] - pRow[49]) < 1.05) ? "TRUE✅" : "FALSE❌";
                    pRow[52] = String(pRow[0] || "") + String(pRow[1] || "") + String(pRow[7] || "") + String(pRow[8] || "");
                    pRow[53] = pRow[1] || ""; // BB: Mirror B (Invoice ID)
                    pRow[54] = pRow[0] || ""; // BC: Mirror A (Order ID)
                    pRow[55] = pRow[5] || ""; // BD: Mirror F (Invoice Date)
                    pRow[56] = pRow[10] || ""; // BE: Mirror K (Quantity)
                    pRow[57] = pRow[29] || ""; // BF: Mirror AD (Taxable Value)
                    
                    // Recalculate AG (32) and AH (33) because AF changed
                    const valK = parseFloat(pRow[10]) || 0;
                    const valAF = parseFloat(pRow[31]) || 0;
                    const valAG = valAF - valK;
                    pRow[32] = Number(valAG.toFixed(4));
                    pRow[33] = (Math.abs(valAG) < 1) ? "TRUE ✅ " : "FALSE ❌ ";
                }
            }
            
            globalFilteredData = globalPurchaseData;
            saveToDB("purchase", globalPurchaseData);
            currentPage = 1;
            maxCols = globalPurchaseData[0].length;
            currentSheet = 'purchase'; // Switch state

            // Re-render and Update UI
            if (typeof renderTable === 'function') renderTable();
            if (typeof updateBillCounts === 'function') updateBillCounts();

            // Highlight correct tab
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('tabPurchaseBtn').classList.add('active');
            document.getElementById('tabPortalBtn').classList.remove('active');
            document.getElementById('tabSaleBtn').classList.remove('active');
            
            syncAllTabs();
            
            document.getElementById('purchaseDownloadButtons').style.display = 'flex';
            renderTable();
            document.getElementById('paginationControls').style.display = 'flex';
            
            // Extract Seller Name from Summary (S3 = index 18 of 3rd row)
            if (summaryRows.length >= 3) {
                const sellerName = String(summaryRows[2][18] || "").trim();
                if (sellerName) {
                    localStorage.setItem('ajio_purchase_seller_name', sellerName);
                    const badge = document.getElementById('purchaseSellerBadge');
                    const nameSpan = document.getElementById('purchaseSellerName');
                    if (badge && nameSpan) {
                        nameSpan.textContent = sellerName;
                        if (currentSheet === 'purchase') badge.style.display = 'block';
                    }
                }
            }
            inserted = globalPurchaseData.length - 1;
        } catch (err) {
            console.error(err);
            statusVal = 'Failed';
            errorMsg = err.message;
            errorCount = 1;
        }

        if (window.logFileUpload) {
            const endTime = Date.now();
            const baseLog = { platform: 'Ajio', accountName: 'Ajio Purchase', actionName: 'Purchase Process', inserted: inserted, updated: 0, errorCount: errorCount, status: statusVal, error: errorMsg, startTime: startTime, endTime: endTime };
            if (detailFile) await window.logFileUpload({ ...baseLog, fileName: detailFile.name });
            if (summaryFile) await window.logFileUpload({ ...baseLog, fileName: summaryFile.name });
        }

        if (statusVal === 'Success') {
            if (purchaseStatus) {
                purchaseStatus.textContent = "✅ Data Uploaded";
                purchaseStatus.style.color = "#27ae60";
            }
        } else {
            window.showCustomError(errorMsg, "Bill Details Error");
            if (purchaseStatus) {
                purchaseStatus.textContent = `❌ Error: ${errorMsg}`;
                purchaseStatus.style.color = "#e74c3c";
            }
        }
    }).catch(err => {
        console.error(err);
        window.showCustomError(err.message || "An error occurred during processing.", "Bill Details Error");
        if (purchaseStatus) {
            purchaseStatus.textContent = "❌ Processing Error";
            purchaseStatus.style.color = "#e74c3c";
        }
    });
});

function syncPurchaseTabs() {
    if (!globalPurchaseData || globalPurchaseData.length < 2) return;

    // --- SECOND PASS: Complex Calculations (AO to BF) ---
    const uniqueInvoices = new Set();
    const purchaseDataMap = new Map(); // Key: Col C (index 2), Value: Row Array
    
    // Build maps from first pass results
    for (let i = 1; i < globalPurchaseData.length; i++) {
        const pRow = globalPurchaseData[i];
        const invId = String(pRow[2] || "").trim();
        if (invId) {
            uniqueInvoices.add(invId);
            purchaseDataMap.set(invId, pRow);
        }
    }
    
    // Using global portalDKMap instead of local
    if (globalPortalData && globalPortalData.length > 0) {
        for (let p = 1; p < globalPortalData.length; p++) {
            const dk = String(globalPortalData[p][114] || "").trim();
            if (dk) portalDKMap.set(dk, globalPortalData[p][115]);
        }
    }

    if (globalPurchaseData.length > 1) {
        // 1. Calculate Summary Status for AO2
        let allANTrue = true;
        for (let j = 1; j < globalPurchaseData.length; j++) {
            if (globalPurchaseData[j][39] !== "TRUE") {
                allANTrue = false;
                break;
            }
        }
        globalPurchaseData[1][40] = allANTrue ? "OK 👍" : "ERROR ⚠️";

        // 2. Fill Columns AP to BF for all rows
        for (let i = 1; i < globalPurchaseData.length; i++) {
            const pRow = globalPurchaseData[i];
            
            pRow[41] = pRow[1];  // AP (Mirror B)
            pRow[42] = pRow[0];  // AQ (Mirror A)
            pRow[43] = pRow[2];  // AR (Mirror C)
            pRow[44] = pRow[5];  // AS (Mirror F)
            pRow[45] = pRow[10]; // AT (Mirror K)
            pRow[46] = pRow[29]; // AU (Mirror AD)
            
            // AV should mirror this row's Purchase bill/invoice no from column C.
            const billNoKey = String(pRow[2] || "").trim();
            pRow[47] = billNoKey;
            
            const avKey = String(pRow[47] || "").trim();
            let matchRow = purchaseDataMap.get(avKey);
            pRow[48] = matchRow ? matchRow[3] : "";
            pRow[49] = matchRow ? matchRow[16] : "";
            
            // AY: AW * 0.1%
            const valAW = parseFloat(pRow[48]) || 0;
            pRow[50] = Number((valAW * 0.001).toFixed(4));
            
            // AZ (51) Status
            pRow[51] = (Math.abs(parseFloat(pRow[50] || 0) - parseFloat(pRow[49] || 0)) < 0.01) ? "TRUE✅" : "FALSE❌";
            
            // BA (52) Key: A+B+H+I
            pRow[52] = String(pRow[0] || "") + String(pRow[1] || "") + String(pRow[7] || "") + String(pRow[8] || "");
            pRow[53] = pRow[41] || ""; // BB: Mirror AP
            
            // AF (Index 31) = K (Index 10) - Per user request (=BE2)
            pRow[31] = pRow[10];
            pRow[56] = pRow[10]; // BE (Index 56) mirrors AT (Index 45) which is K
            
            // Recalculate AG (32) and AH (33) because AF changed
            const valK = parseFloat(pRow[10]) || 0;
            const valAF = parseFloat(pRow[31]) || 0;
            const valAG = valAF - valK;
            pRow[32] = Number(valAG.toFixed(4));
            pRow[33] = (Math.abs(valAG) < 1) ? "TRUE ✅ " : "FALSE ❌ ";

            pRow[53] = pRow[1] || ""; // BB: Mirror B
            pRow[54] = pRow[0] || ""; // BC: Mirror A
            pRow[55] = pRow[5] || ""; // BD: Mirror F
            pRow[56] = pRow[10] || ""; // BE: Mirror K
            pRow[57] = pRow[29] || ""; // BF: Mirror AD
        }
    }
}

// Download Purchase Bill Logic
const dlPurchBtn = document.getElementById('downloadPurchaseBtn');
if (dlPurchBtn) {
    dlPurchBtn.addEventListener('click', () => {
        if (!globalPurchaseData || globalPurchaseData.length === 0) {
            window.showCustomAlert("No Purchase data to download!", "Data Missing");
            return;
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(globalPurchaseData);

        // Ensure AS/AT export as real formulas in the generated workbook
        for (let rowIndex = 1; rowIndex < globalPurchaseData.length; rowIndex++) {
            const excelRow = rowIndex + 1;
            const asCell = `AS${excelRow}`;
            const atCell = `AT${excelRow}`;

            if (!ws[asCell]) ws[asCell] = {};
            ws[asCell].f = `F${excelRow}`;
            delete ws[asCell].v;

            if (!ws[atCell]) ws[atCell] = {};
            ws[atCell].f = `K${excelRow}`;
            delete ws[atCell].v;
        }

        // Convert any formula string values to actual XLSX formulas
        for (let key in ws) {
            if (ws[key] && ws[key].v && typeof ws[key].v === 'string' && ws[key].v.startsWith('=')) {
                ws[key].f = ws[key].v;
                delete ws[key].v;
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        if (window.directDownloadExcel) {
            window.directDownloadExcel(wb, "PURCHASE BILL.xlsx");
        } else {
            XLSX.writeFile(wb, "PURCHASE BILL.xlsx");
        }
    });
}
