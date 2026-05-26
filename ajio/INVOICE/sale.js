// Ajio Sale Logic


document.getElementById('processSaleBtn').addEventListener('click', () => {
  const detailsFileInput = document.getElementById('saleDetailsUpload');
  const summaryFileInput = document.getElementById('saleSummaryUpload');
  const duplicateFileInput = document.getElementById('duplicateInvoiceUpload');

  if (detailsFileInput.files.length === 0 || summaryFileInput.files.length === 0) {
    window.showCustomAlert("Please select both SALE DETAILS and SALE SUMMARY files.", "Files Missing");
    return;
  }

  document.getElementById('tableContainer').innerHTML = "<h3>Processing Sale files, please wait...</h3>";
  document.getElementById('paginationControls').style.display = 'none';
  document.getElementById('downloadButtons').style.display = 'none';

  const detailsFile = detailsFileInput.files[0];
  const summaryFile = summaryFileInput.files[0];
  const duplicateFile = duplicateFileInput.files.length > 0 ? duplicateFileInput.files[0] : null;

  const readAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  };

  async function startProcessing() {
    try {
      const detailsBuffer = await readAsArrayBuffer(detailsFile);
      const summaryBuffer = await readAsArrayBuffer(summaryFile);
      let duplicateBuffer = null;
      if (duplicateFile) {
        duplicateBuffer = await readAsArrayBuffer(duplicateFile);
      }
      
      setTimeout(async () => {
        const startTime = Date.now();
        let inserted = 0;
        let errorCount = 0;
        let statusVal = 'Success';
        let errorMsg = '';
        let _dupRowCount = 0;

        try {
          const res = processSaleFiles(detailsBuffer, summaryBuffer, duplicateBuffer);
          inserted = res.inserted;
          errorCount = res.mismatchCount;
          _dupRowCount = res.duplicateRowCount || 0;
          if (errorCount > 0) {
            statusVal = 'Failed';
            errorMsg = `Found ${errorCount} duplicate invoice mismatches`;
          }
        } catch (error) {
          console.error(error);
          document.getElementById('tableContainer').innerHTML = "<p style='color:red;'>An error occurred during processing.</p>";
          window.showCustomError(error.message || "Error processing files.", "Sale Details Error");
          statusVal = 'Failed';
          errorMsg = error.message;
          errorCount = 1;
        }

        if (window.logFileUpload) {
          const endTime = Date.now();
          const baseLog = { platform: 'Ajio', accountName: 'Ajio Sale', actionName: 'Sale Process', inserted: inserted, updated: 0, errorCount: errorCount, status: statusVal, error: errorMsg, startTime: startTime, endTime: endTime };
          if (detailsFile) await window.logFileUpload({ ...baseLog, fileName: detailsFile.name });
          if (summaryFile) await window.logFileUpload({ ...baseLog, fileName: summaryFile.name });
          if (duplicateFile) await window.logFileUpload({ ...baseLog, fileName: duplicateFile.name, inserted: _dupRowCount });
        }

        const saleStatus = document.getElementById('saleStatus');
        if (saleStatus) {
          if (statusVal === 'Success') {
            saleStatus.textContent = "✅ Data Uploaded";
            saleStatus.style.color = "#27ae60";
          } else {
            saleStatus.textContent = `❌ Error: ${errorMsg}`;
            saleStatus.style.color = "#e74c3c";
          }
        }
      }, 50);
    } catch (err) {
      console.error(err);
      document.getElementById('tableContainer').innerHTML = "<p style='color:red;'>An error occurred during file reading.</p>";
    }
  }

  startProcessing();
});

function processSaleFiles(detailsBuffer, summaryBuffer, duplicateBuffer) {
  const wbDetails = XLSX.read(new Uint8Array(detailsBuffer), { type: 'array' });
  const wsDetails = wbDetails.Sheets[wbDetails.SheetNames[0]];
  const rowsDetails = XLSX.utils.sheet_to_json(wsDetails, { header: 1, defval: "" });
  console.log(`[DEBUG Sale] Total rows in Details file: ${rowsDetails.length}`);

  if (rowsDetails.length < 3) {
    throw new Error("Sale Details file does not have enough rows (expected data starting at row 3).");
  }

  const wbSummary = XLSX.read(new Uint8Array(summaryBuffer), { type: 'array' });
  const wsSummary = wbSummary.Sheets[wbSummary.SheetNames[0]];
  const rowsSummary = XLSX.utils.sheet_to_json(wsSummary, { header: 1, defval: "" });
  console.log(`[DEBUG Sale] Total rows in Summary file: ${rowsSummary.length}`);

  // SUMMARY DICTIONARY
  const summaryDict = {};
  for (let i = 1; i < rowsSummary.length; i++) {
    const row = rowsSummary[i];
    const key = String(row[2] !== undefined ? row[2] : "").trim();
    if (key !== "") {
      summaryDict[key] = {
        orderId: row[1],
        irn: row[5],
        shipmentDate: row[8],
        invoiceDate: row[8],
        gstId: row[9]
      };
    }
  }
  console.log(`[DEBUG Sale] Summary Dictionary size: ${Object.keys(summaryDict).length}`);

  const disputeData = [["Row No", "Invoice No", "Jio Code", "Order Date", "SKU", "Item Name", "Quantity", "Item Cost", "Invoice Amount", "Reason"]];
  const validDetailsRows = [];
  let skippedEmptyCount = 0;
  let disputeCount = 0;

  // VBA Process Details
  for (let r = 2; r < rowsDetails.length; r++) {
    const row = rowsDetails[r];

    if (!row || !row[1] || String(row[1]).trim() === "") {
      skippedEmptyCount++;
      continue;
    }

    const disputeText = String(row[21] !== undefined ? row[21] : "").trim();
    let isDisputed = false;
    if (disputeText.toLowerCase().includes("price dispute")) {
      let priceVal = 0;
      if (disputeText.includes("-")) {
        priceVal = parseFloat((disputeText.substring(disputeText.indexOf("-") + 1)).replace(/[^\d.-]/g, ''));
      }

      if (priceVal > 0) {
        isDisputed = true;
        disputeCount++;
        disputeData.push([
          r + 1, row[1], "`" + (row[7] || ""), row[2], row[8], row[9], row[11], row[12], row[20], disputeText
        ]);
      }
    }

    if (!isDisputed) {
      validDetailsRows.push(row);
    }
  }
  console.log(`[DEBUG Sale] Rows Skipped (Empty): ${skippedEmptyCount}`);
  console.log(`[DEBUG Sale] Rows Disputed: ${disputeCount}`);
  console.log(`[DEBUG Sale] Valid Rows remaining: ${validDetailsRows.length}`);

  // Build Portal AS column set
  const portalASSet = new Set();
  if (globalPortalData && globalPortalData.length > 0) {
    for (let i = 1; i < globalPortalData.length; i++) {
      const val = globalPortalData[i][44];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        portalASSet.add(String(val).trim().toUpperCase());
      }
    }
  }
  console.log(`[DEBUG Sale] Portal AS Set built with ${portalASSet.size} keys.`);

  // Create SALE INVOICE dataset
  const invoiceHeaders = ["Order ID", "Invoice ID", "New Invoice ID", "IRN", "Shipment Date", "Invoice Date", "GST ID", "JIO CODE", "SKU", "Item Title", "Quantity", "Item Cost", "GST Rate", "CESS Rate", "HSN", "Warehouse", "Status", "TCS", "Billing GST ID",
    "T (A&B&C&H&I)", "U (VLOOKUP Portal AS)", "V (C&B&H&I)",
    "Col W", "Col X", "Col Y", "Col Z", "Col AA", "Col AB", "Col AC", "Col AD", "Col AE", "Col AF", "Col AG", "Col AH", "Col AI", "Col AJ", "Col AK", "Col AL", "Col AM", "Col AN", "Col AO", "Col AP", "Col AQ", "AR", "AS", "AT", "AU"
  ];
  const invoiceData = [invoiceHeaders];
  console.log(`[DEBUG Sale] Starting final assembly of ${validDetailsRows.length} rows...`);

  for (let i = 0; i < validDetailsRows.length; i++) {
    const dRow = validDetailsRows[i];


    // Details B=1, C=2, E=4, F=5, G=6, H=7, I=8, J=9, K=10, L=11, N=13
    const invoiceId = dRow[6]; // G
    const newInvoiceId = dRow[1]; // B
    const jioCode = dRow[7]; // H
    const sku = dRow[8]; // I
    const itemTitle = dRow[9]; // J
    const qty = dRow[11]; // L
    const itemCost = dRow[13]; // N
    const hsn = dRow[10]; // K
    const warehouse = dRow[4]; // E
    const billingGst = dRow[5]; // F

    // Look up dict
    const sData = summaryDict[String(newInvoiceId).trim()] || {};

    const colA = String(sData.orderId || "").trim().toUpperCase();
    const colB = String(invoiceId || "").trim().toUpperCase();
    const colC = String(newInvoiceId || "").trim().toUpperCase();
    const colH = String(jioCode || "").trim().toUpperCase();
    const colI = String(sku || "").trim().toUpperCase();
    const saleTKey = (colA + colB + colC + colH + colI).trim(); // T: =A&B&C&H&I
    const saleVKey = (colC + colB + colH + colI).trim(); // V: =C2&B2&H2&I2 (original values, no healing)

    // AAROHI FIX: Use saleKey2 (Order-Independent) to avoid Order ID mismatches
    // U: =VLOOKUP(T2, PORTAL!$AS$1:$AS$6000, 1) — lookup saleTKey in Portal AS column
    const vlookupResult = portalASSet.has(saleTKey.toUpperCase()) ? saleTKey : "#N/A";

    // Calculate new columns
    const colK_val = parseFloat(qty) || 0;
    const colL_val = parseFloat(itemCost) || 0;
    const colM_val = 0.05; // 5% GST
    
    const resW = colK_val !== 0 ? colL_val / colK_val : 0;
    const resX = resW * colK_val;
    const resY = resW * colK_val * colM_val / 2;
    const resZ = resW * colK_val * colM_val / 2;
    
    let numAA = resX + resY + resZ;
    let resAA = Math.round(numAA * 100) / 100;
    
    let resAB = Math.round(resAA + 0.00000001);
    
    let intAA = Math.floor(resAA);
    let diff = Math.round((resAA - intAA) * 100) / 100;
    let resAC = "";
    if (diff <= 0.49) {
        resAC = diff.toFixed(2);
    } else {
        resAC = ((intAA + 1) - resAA).toFixed(2);
    }
    
    const resAD = qty;
    const resAE = newInvoiceId;
    const resAF = colA; 
    const resAG = String(resAF || "").split("S").join("P");
    const resAH = resW;
    
    const resAI = String(newInvoiceId).trim() === "" ? "" : newInvoiceId;
    const resAJ = String(colA).trim() === "" ? "" : colA;
    const resAK = String(invoiceId).trim() === "" ? "" : invoiceId;
    const resAL = String(sData.invoiceDate || "").trim() === "" ? "" : sData.invoiceDate;
    
    const resAQ = String(invoiceId).trim() === "" ? "" : invoiceId;
    const resAM = String(resAQ).trim() === "" ? "" : resAQ;
    const resAN = String(qty).trim() === "" ? "" : qty;
    const resAO = String(resAB).trim() === "" ? "" : resAB;
    const resAP = String(invoiceId || "") + String(newInvoiceId || "") + String(jioCode || "") + String(sku || ""); // AP Key: B+C+H+I

    const sRowData = [
      sData.orderId || "", // A
      invoiceId,           // B
      newInvoiceId,        // C
      sData.irn || "",     // D
      sData.shipmentDate || "", // E
      sData.invoiceDate || "",  // F
      sData.gstId || "",   // G
      jioCode,             // H
      sku,                 // I
      itemTitle,           // J
      qty,                 // K
      itemCost,            // L
      "5%",                // M
      "0%",                // N
      hsn,                 // O
      warehouse,           // P
      "submitted",         // Q
      "0",                 // R
      billingGst,          // S
      saleTKey,            // T (index 19): =A&B&C&H&I
      vlookupResult,       // U (index 20): =VLOOKUP(T, PORTAL!AS, 1)
      saleVKey,            // V (index 21): =C&B&H&I (healed)
      resW,                // W
      resX,                // X
      resY,                // Y
      resZ,                // Z
      resAA,               // AA
      resAB,               // AB
      resAC,               // AC
      resAD,               // AD
      resAE,               // AE
      resAF,               // AF
      resAG,               // AG
      resAH,               // AH
      resAI,               // AI
      resAJ,               // AJ
      resAK,               // AK
      resAL,               // AL
      resAM,               // AM
      resAN,               // AN
      resAO,               // AO
      resAP,               // AP
      resAQ,               // AQ
      "",                  // AR (43)
      "",                  // AS (44)
      "",                  // AT (45)
      ""                   // AU (46)
    ];


    invoiceData.push(sRowData);
  }

  // DUPLICATE INVOICE CHECK
  let mismatchCount = 0;
  if (duplicateBuffer) {
    mismatchCount = checkDuplicateInvoices(invoiceData, duplicateBuffer);
  }

  // Update globals for Table Rendering
  globalSaleInvoiceData = invoiceData;
  globalPriceDisputes = disputeData;

  saveToDB("sale", globalSaleInvoiceData);
  console.log(`[DEBUG Sale] Final processed data: ${globalSaleInvoiceData.length - 1} rows saved to DB.`);

  // Extract Party Code from C2 (index 2 of first data row)
  if (globalSaleInvoiceData.length > 1) {
    const firstInvoiceId = String(globalSaleInvoiceData[1][2] || "");
    const partyMatch = firstInvoiceId.match(/(?:AJ|MY)\d{2}S(\d{3})/);
    if (partyMatch && partyMatch[1]) {
      localStorage.setItem('global_party_code', partyMatch[1]);
      console.log(`[DEBUG Sale] Extracted Party Code: ${partyMatch[1]}`);
    }
  }

  syncAllTabs();

  // Reuse the existing display logic
  globalFilteredData = globalSaleInvoiceData;
  currentPage = 1;
  maxCols = globalSaleInvoiceData[0].length;
  currentSheet = 'sale'; // Switch state

  // Highlight correct tab
  document.getElementById('tabSaleBtn').classList.add('active');
  document.getElementById('tabPortalBtn').classList.remove('active');
  document.getElementById('tabPurchaseBtn').classList.remove('active');

  renderTable();

  document.getElementById('paginationControls').style.display = 'flex';
  document.getElementById('downloadButtons').style.display = 'flex';

  if (disputeData.length > 1) {
    document.getElementById('downloadDisputeBtn').style.display = 'inline-block';
  } else {
    document.getElementById('downloadDisputeBtn').style.display = 'none';
  }

  let duplicateRowCount = 0;
  if (duplicateBuffer) {
    try {
      const wbDupCount = XLSX.read(new Uint8Array(duplicateBuffer), { type: 'array' });
      const wsDupCount = wbDupCount.Sheets[wbDupCount.SheetNames[0]];
      const rowsDupCount = XLSX.utils.sheet_to_json(wsDupCount, { header: 1, defval: "" });
      duplicateRowCount = Math.max(0, rowsDupCount.length - 1); // minus header
    } catch(e) { duplicateRowCount = 0; }
  }

  return {
    inserted: globalSaleInvoiceData.length - 1,
    mismatchCount: mismatchCount,
    duplicateRowCount: duplicateRowCount
  };
}

function checkDuplicateInvoices(saleData, duplicateBuffer) {
  try {
    const wbDup = XLSX.read(new Uint8Array(duplicateBuffer), { type: 'array' });
    const wsDup = wbDup.Sheets[wbDup.SheetNames[0]];
    const rowsDup = XLSX.utils.sheet_to_json(wsDup, { header: 1, defval: "" });

    const saleCounts = {};
    // Skip header, index 2 is Column C (New Invoice ID)
    for (let i = 1; i < saleData.length; i++) {
      const invId = String(saleData[i][2] || "").trim().toUpperCase();
      if (invId) {
        saleCounts[invId] = (saleCounts[invId] || 0) + 1;
      }
    }

    const mismatches = [["INVOICE NO", "EXPECTED COUNT", "ACTUAL COUNT (UPLOADED)", "STATUS"]];
    const dupDict = {};

    for (let i = 1; i < rowsDup.length; i++) {
      const row = rowsDup[i];
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

    // Check if any invoice in sale data should have been in the duplicate list
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
    } else {
      console.log("[DUPLICATE CHECK] All match perfectly!");
    }
    return mismatches.length - 1;
  } catch (error) {
    console.error("Duplicate Invoice Check Error:", error);
    return 0;
  }
}

// Download Listeners
const dlInvBtn = document.getElementById('downloadInvoiceBtn');
if (dlInvBtn) {
  dlInvBtn.addEventListener('click', () => {
    if (!globalSaleInvoiceData || globalSaleInvoiceData.length === 0) return;
    const ws = XLSX.utils.aoa_to_sheet(globalSaleInvoiceData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SALE INVOICE");
    if (window.directDownloadExcel) {
      window.directDownloadExcel(wb, "SALE INVOICE.xlsx");
    } else {
      XLSX.writeFile(wb, "SALE INVOICE.xlsx");
    }
  });
}

const dlDisputeBtn = document.getElementById('downloadDisputeBtn');
if (dlDisputeBtn) {
  dlDisputeBtn.addEventListener('click', () => {
    if (!globalPriceDisputes || globalPriceDisputes.length <= 1) return;
    const ws = XLSX.utils.aoa_to_sheet(globalPriceDisputes);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PRICE DISPUTE");
    if (window.directDownloadExcel) {
      window.directDownloadExcel(wb, "PRICE DISPUTE.xlsx");
    } else {
      XLSX.writeFile(wb, "PRICE DISPUTE.xlsx");
    }
  });
}

function syncSaleWithPortal() {
  if (!globalSaleInvoiceData || globalSaleInvoiceData.length === 0) {
    console.log("[SYNC DEBUG] globalSaleInvoiceData is empty, skipping sync.");
    return;
  }

  // Build Purchase Map: Key is BA (Index 52)
  const purchaseMap = new Map();
  if (globalPurchaseData && globalPurchaseData.length > 0) {
    for (let i = 1; i < globalPurchaseData.length; i++) {
      const pRow = globalPurchaseData[i];
      const baKey = String(pRow[52] || "").trim();
      if (baKey !== "") {
        purchaseMap.set(baKey, pRow);
      }
    }
  }

  console.log(`[SYNC DEBUG] Purchase Map Size: ${purchaseMap.size}`);
  if (purchaseMap.size > 0) {
    const firstKey = [...purchaseMap.keys()][0];
    const firstRow = purchaseMap.get(firstKey);
    console.log(`[SYNC DEBUG] Purchase BA sample key: "${firstKey}"`);
    console.log(`[SYNC DEBUG] Purchase BB(53)="${firstRow[53]}" | BD(55)="${firstRow[55]}" | BE(56)="${firstRow[56]}" | BF(57)="${firstRow[57]}"`);
  } else {
    console.log("[SYNC DEBUG] Purchase Map is empty. Purchase data may not be loaded yet.");
  }

  let matchCount = 0;
  let noMatchCount = 0;

  // Populate SALE columns AR-AU based on AP (Index 41)
  for (let i = 1; i < globalSaleInvoiceData.length; i++) {
    const sRow = globalSaleInvoiceData[i];
    const apKey = String(sRow[41] || "").trim();

    if (i <= 3) {
      console.log(`[SYNC DEBUG] Sale Row ${i}: AP key="${apKey}" | Match=${purchaseMap.has(apKey)}`);
    }

    if (apKey !== "" && purchaseMap.has(apKey)) {
      const pMatch = purchaseMap.get(apKey);
      sRow[43] = pMatch[53] || ""; // AR: Purchase!BB (53)
      sRow[44] = pMatch[55] || ""; // AS: Purchase!BD (55)
      sRow[45] = pMatch[56] || ""; // AT: Purchase!BE (56)
      sRow[46] = pMatch[57] || ""; // AU: Purchase!BF (57)
      if (i <= 3) {
        console.log(`[SYNC DEBUG] Row ${i} MATCHED → AR="${sRow[43]}" | AS="${sRow[44]}" | AT="${sRow[45]}" | AU="${sRow[46]}"`);
      }
      matchCount++;
    } else {
      sRow[43] = "";
      sRow[44] = "";
      sRow[45] = "";
      sRow[46] = "";
      noMatchCount++;
    }
  }

  console.log(`[SYNC DEBUG] ✅ Matched: ${matchCount} | ❌ Not Matched: ${noMatchCount}`);
}

