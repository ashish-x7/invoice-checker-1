// Function to get nickname from storage
async function getNickname() {
    try {
        const result = await chrome.storage.local.get(['nickname']);
        return result.nickname || 'User';
    } catch (error) {
        console.error('Error getting nickname:', error);
        return 'User';
    }
}

document.getElementById('processBtn').addEventListener('click', () => {
  const fileInput = document.getElementById('excelUpload');
  const portalStatus = document.getElementById('portalStatus');
  if (portalStatus) portalStatus.textContent = "";

  if (fileInput.files.length === 0) {
    if (portalStatus) {
      portalStatus.textContent = "❌ Select file";
      portalStatus.style.color = "#e74c3c";
    } else {
      window.showCustomAlert("Please select an Excel file first.", "File Missing");
    }
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async function (e) {
    document.getElementById('tableContainer').innerHTML = "<h3>Processing data, please wait...</h3>";
    window.portalTdsMapCache = null; // Clear old TDS cache on new upload
    document.getElementById('paginationControls').style.display = 'none';

    const startTime = Date.now();

    setTimeout(async () => {
      let inserted = 0;
      let errorCount = 0;
      let statusVal = 'Success';
      let errorMsg = '';

      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Read 1st sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert sheet to array of arrays
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        const nickname = await getNickname();
        console.log('Ajio: Retrieved nickname:', nickname);

        if (rows.length === 0) {
          window.showCustomAlert("Sheet is empty!", "Empty File");
          return;
        }

        // Filter rows
        const header = rows[0] || [];

        // Determine original max columns before we push new ones to avoid index collisions
        let originalMaxCols = 0;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].length > originalMaxCols) originalMaxCols = rows[i].length;
          if (rows[i] && rows[i][11] === 0) {
              window.showCustomAlert("ERROR: Column L (Item Cost) has 0 at row " + (i + 1), "Data Error");
          }
        }

        // Move internal calculation columns to a safe high index (150+) to avoid alignment issues with BA (52)
        const internalStartIdx = 150;
        header[internalStartIdx] = "Portal Key 1 (D+C+F+K+N)";
        header[internalStartIdx + 1] = "Portal Key 2 (F+C+K+N)";
        header[internalStartIdx + 2] = "PRICE";
        header[internalStartIdx + 3] = "PPQ";
        header[internalStartIdx + 4] = "CGST";
        header[internalStartIdx + 5] = "SGST";
        header[internalStartIdx + 6] = "DP";
        header[internalStartIdx + 7] = "DO";


        const outData = [header];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const colD = (row.length > 3 && row[3] !== undefined && row[3] !== null) ? String(row[3]).trim() : "";

          if (colD !== "") {
            const cC = row[2] !== undefined && row[2] !== null ? String(row[2]).trim().toUpperCase() : "";
            const cD = row[3] !== undefined && row[3] !== null ? String(row[3]).trim().toUpperCase() : "";
            const cF = row[5] !== undefined && row[5] !== null ? String(row[5]).trim().toUpperCase() : "";
            const cK = row[10] !== undefined && row[10] !== null ? String(row[10]).trim().toUpperCase() : "";
            const cN = row[13] !== undefined && row[13] !== null ? String(row[13]).trim().toUpperCase() : "";

            const portalKey1 = (cD + cC + cF + cK + cN).trim();
            const portalKey2 = (cF + cC + cK + cN).trim();

            const internalStartIdx = 150;
            row[internalStartIdx] = portalKey1; // Portal Key 1 (D+C+F+K+N)
            row[internalStartIdx + 1] = portalKey2; // Portal Key 2 (F+C+K+N)


            row[44] = portalKey1; // AS: =D&C&F&K&N
            row[45] = portalKey2; // AT: =F&C&K&N
            
            // Apply User's Original Formulas (AU-AX)
            row[46] = (row.length > 30) ? row[30] : ""; // AU: =AE2
            
            // AV: =IFERROR(IF(OR(AU2="",Q2=""),"",AU2/Q2),"")
            const valAU = parseFloat(row[46]) || 0;
            const valQ = (row.length > 16) ? parseFloat(row[16]) : 0;
            row[47] = (valAU && valQ) ? Number((valAU/valQ).toFixed(4)) : "";

            // AW: =AE2*V2*AG2%
            const valAE = valAU;
            const valV = (row.length > 21) ? parseFloat(row[21]) : 0;
            const valAG = (row.length > 32) ? parseFloat(row[32]) : 0;
            row[48] = (valAE && valV && valAG) ? Number((valAE * valV * (valAG/100)).toFixed(4)) : "";

            // AX: =AE2*V2*AI2%
            const valAI = (row.length > 34) ? parseFloat(row[34]) : 0;
            row[49] = (valAE && valV && valAI) ? Number((valAE * valV * (valAI/100)).toFixed(4)) : "";

            // Duplicate calculations for internal indices (150+) if needed
            row[internalStartIdx + 2] = row[46]; // PRICE
            row[internalStartIdx + 3] = row[47]; // PPQ
            row[internalStartIdx + 4] = row[48]; // CGST
            row[internalStartIdx + 5] = row[49]; // SGST
            
            // Set DP to nickname
            row[internalStartIdx + 6] = nickname;
            row[internalStartIdx + 7] = nickname;


            outData.push(row);
          }
        }

        // Calculate max columns once to avoid recalculating on every page render
        let maxCols = 0;
        for (let i = 0; i < outData.length; i++) {
          if (outData[i].length > maxCols) maxCols = outData[i].length;
        }

        globalPortalData = outData;
        globalPortalMaxCols = Math.min(maxCols, 119);

        // Save to DB for persistence
        if (typeof saveToDB === 'function') {
          await saveToDB("portal", globalPortalData);
          console.log('Ajio: Saved portal data to DB');
        } else {
          localStorage.setItem('ajio_portal_data', JSON.stringify(globalPortalData));
          console.log('Ajio: Saved portal data to localStorage');
        }

        console.log('Ajio: globalPortalData length:', globalPortalData.length);
        saveToDB("portal", globalPortalData);

        await syncAllTabs();

        // Add nickname to DO column for all processed rows
        const dnIdx = globalPortalData[0].indexOf("Col DN");
        const doIdx = globalPortalData[0].indexOf("Col DO");
        if (dnIdx !== -1 && doIdx !== -1) {
          const nickname = await getNickname();
          console.log('Ajio syncAllTabs: Retrieved nickname:', nickname);
          for (let i = 1; i < globalPortalData.length; i++) {
            const row = globalPortalData[i];
            row[doIdx] = nickname;
          }
          console.log('Ajio syncAllTabs: Finished setting DO for', globalPortalData.length - 1, 'rows');
        }

        globalFilteredData = globalPortalData;
        maxCols = globalPortalMaxCols;
        currentPage = 1;
        currentSheet = 'portal'; // Switch state

        // Highlight correct tab
        document.getElementById('tabPortalBtn').classList.add('active');
        document.getElementById('tabSaleBtn').classList.remove('active');
        document.getElementById('tabPurchaseBtn').classList.remove('active');

        renderTable();
        document.getElementById('paginationControls').style.display = 'flex';
        inserted = outData.length - 1;
      } catch (error) {
        console.error("AJIO Portal processing error:", error);
        statusVal = 'Failed';
        errorMsg = error.message;
        errorCount = 1;
      }

      if (window.logFileUpload) {
        await window.logFileUpload({
            platform: 'Ajio',
            accountName: 'Ajio Portal',
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

      if (portalStatus) {
        if (statusVal === 'Success') {
          portalStatus.textContent = "✅ Data Uploaded";
          portalStatus.style.color = "#27ae60";
        } else {
          portalStatus.textContent = `❌ Error: ${errorMsg}`;
          portalStatus.style.color = "#e74c3c";
        }
      }
    }, 10); 
  };

  reader.onerror = (error) => {
    if (portalStatus) {
      window.showCustomAlert(error.message || "Error reading files.", "Processing Error");
      portalStatus.style.color = "#e74c3c";
    }
  };

  reader.readAsArrayBuffer(file);
});

async function syncPortalWithSale() {
  const nickname = await getNickname();

  // Clear global maps to avoid stale data
  portalDKMap.clear();
  portalMapDL_DM.clear();

  if (globalPortalData && globalPortalData.length > 0) {
    let pHeader = globalPortalData[0];

    // Original 2 columns
    let vlookupIdx = pHeader.indexOf("Sale U Data");
    if (vlookupIdx === -1) {
      vlookupIdx = pHeader.length;
      pHeader.push("Sale U Data");
      pHeader.push("Vlookup from Sale");
      globalPortalMaxCols += 2;
    }

    // New calculated columns BA through ED (Expanding range for DY, DX, EC processing)
    const targetCols = ["BA", "BB", "BC", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP", "BQ", "BR", "BS", "BT", "BU", "BV", "BW", "BX", "BY", "BZ", "CA", "CB", "CC", "CD", "CE", "CF", "CG", "CH", "CI", "CJ", "CK", "CL", "CM", "CN", "CO", "CP", "CQ", "CR", "CS", "CT", "CU", "CV", "CW", "CX", "CY", "CZ", "DA", "DB", "DC", "DD", "DE", "DF", "DG", "DH", "DI", "DJ", "DK", "DL", "DM", "DN", "DO"];


    // Ensure all target columns exist in the header
    for (let c of targetCols) {
      if (pHeader.indexOf("Col " + c) === -1) {
        pHeader.push("Col " + c);
      }
    }

    // DYNAMIC INDEX RESOLUTION
    const idxBA_actual = pHeader.indexOf("Col BA");
    const idxCX_actual = pHeader.indexOf("Col CX");
    const idxDE_actual = pHeader.indexOf("Col DE");
    const idxDH_actual = pHeader.indexOf("Col DH");
    const idxDG_actual = pHeader.indexOf("Col DG");
    
    // FORCE BA to index 52 (Excel BA) to ensure alignment
    let idxBA = 52; 
    pHeader[idxBA] = "Col BA";


    // Ensure all target columns are correctly placed starting from index 52
    for (let j = 0; j < targetCols.length; j++) {
      pHeader[idxBA + j] = "Col " + targetCols[j];
    }
    
    // Ensure globalPortalMaxCols reflects the full range including internal columns at index 150+
    if (pHeader.length < 158) {
        // Just making sure it doesn't shrink, but usually it will be 158 because of initial processing
    }
    globalPortalMaxCols = 119;


    // AY (index 50): =SALE!U2 | AZ (index 51): =VLOOKUP(AY2,SALE!$U$2:$V$6000,2)
    pHeader[50] = "AY (Sale!U)";
    pHeader[51] = "AZ (VLOOKUP Sale U:V)";

    // Indices based on row-indexing
    idxBA = pHeader.indexOf("Col BA");

    const saleMap = new Map();
    const saleMapT = new Map();
    const saleMapV = new Map(); // Key: Col V (index 21), Value: Col W (index 22)
    const saleUVMap = new Map(); // AZ VLOOKUP: Sale U (index 20) -> Sale V (index 21)

    const hasSaleData = globalSaleInvoiceData && globalSaleInvoiceData.length > 0;

    if (hasSaleData) {
      for (let s = 1; s < globalSaleInvoiceData.length; s++) {
        const sRow = globalSaleInvoiceData[s];
        // Original logic: U is 20, V is 21
        const uVal = sRow[20] !== undefined && sRow[20] !== null ? String(sRow[20]).trim() : "";
        const vVal = sRow[21] !== undefined && sRow[21] !== null ? String(sRow[21]).trim() : "";
        const wVal = sRow[22];

        if (uVal !== "") {
          saleMap.set(uVal, vVal);
        }

        if (vVal !== "") {
          saleMapV.set(vVal.toUpperCase(), wVal); // uppercase key for reliable CJ VLOOKUP
        }

        // For new formulas targeting SALE!T (T is 19)
        const tVal = sRow[19] !== undefined && sRow[19] !== null ? String(sRow[19]).trim() : "";
        if (tVal !== "") {
          saleMapT.set(tVal, sRow);
        }

        // AZ VLOOKUP: Sale U (index 20) -> Sale V (index 21)
        if (uVal !== "" && uVal !== "#N/A") {
          saleUVMap.set(uVal.toUpperCase(), vVal);
        }
      }
    }

    // DEBUG: Log first 3 Sale V keys
    let _debugSaleV = 0;
    for (const [k] of saleMapV) {
      if (_debugSaleV++ >= 3) break;
      console.log(`[DEBUG saleMapV key ${_debugSaleV}]: "${k}"`);
    }

    // Two normalizers:
    // - Bill/invoice ids can contain dashes/spaces and S/P variants. Normalize aggressively.
    // - Sale U/V style keys should stay close to raw (trim + upper) to match maps built from SALE.
    const normalizeBill = (v) => String(v || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/S/g, "P")
      .trim();
    const normalizeUV = (v) => String(v || "").trim().toUpperCase();

    // Purchase lookups are keyed by bill/invoice no in column C (index 2)
    const purchaseMapU = new Map();  // BillNo -> U (index 20)
    const purchaseMapAE = new Map(); // BillNo -> AE (index 30)
    const purchaseMapW = new Map();  // BillNo -> W (index 22)
    const hasPurchaseData = globalPurchaseData && globalPurchaseData.length > 0;
    if (hasPurchaseData) {
      for (let i = 1; i < globalPurchaseData.length; i++) {
        const pr = globalPurchaseData[i];
        const billNo = normalizeBill(pr[2]);
        if (!billNo) continue;
        purchaseMapU.set(billNo, String(pr[20] || "").trim());
        purchaseMapAE.set(billNo, pr[30] !== undefined && pr[30] !== null ? pr[30] : "");
        purchaseMapW.set(billNo, pr[22] !== undefined && pr[22] !== null ? pr[22] : "");
      }
    }

    const portalMapAS = new Map(); // AS(44) to AU(46)
    const portalMapER = new Map(); // ER(147) to ES(148)
    const portalMapFJ = new Map(); // F(5) to J(9)
    const portalMapBA_CO = new Map(); // BA to CO for self-lookup
    const portalMapDI_DJ = new Map(); // DI(44) to DJ(21) for BE lookup

    if (globalPortalData.length === 0) return;

    // First pass to build the map for self-lookup
    for (let p = 1; p < globalPortalData.length; p++) {
      const r = globalPortalData[p];
      const baKey = r[idxBA] !== undefined ? String(r[idxBA]).trim() : "";
      if (baKey) {
        portalMapBA_CO.set(baKey, r[idxBA + 40] || "");
      }
    }

    for (let p = 1; p < globalPortalData.length; p++) {
      const pRowOrig = globalPortalData[p];
      const asVal = pRowOrig[44] !== undefined && pRowOrig[44] !== null ? String(pRowOrig[44]).trim() : "";
      if (asVal !== "") portalMapAS.set(asVal, pRowOrig);

      const erVal = pRowOrig[147] !== undefined && pRowOrig[147] !== null ? String(pRowOrig[147]).trim() : "";
      if (erVal !== "") portalMapER.set(erVal, pRowOrig[148]);

      const fVal = pRowOrig[5] !== undefined && pRowOrig[5] !== null ? String(pRowOrig[5]).trim() : "";
      if (fVal !== "" && !portalMapFJ.has(fVal)) portalMapFJ.set(fVal, pRowOrig[9]);

      // Map for BE VLOOKUP: Look up AY in DI(44) to get DJ(21)
      const diVal = pRowOrig[44] !== undefined && pRowOrig[44] !== null ? String(pRowOrig[44]).trim() : "";
      if (diVal !== "") portalMapDI_DJ.set(diVal, pRowOrig[21]);
    }

    // 4. PRE-PASS: Compute AY (index 50) and AZ (index 51) for all portal rows
    //    AY = SALE!U2 (positional mirror), AZ = VLOOKUP(AY, SALE!U:V, 2)
    //    Must be done BEFORE the main loop so ayVal is ready for BA-BV lookups
    for (let p = 1; p < globalPortalData.length; p++) {
      const pRow = globalPortalData[p];
      const saleRowForAY = (hasSaleData && p < globalSaleInvoiceData.length) ? globalSaleInvoiceData[p] : null;
      pRow[50] = saleRowForAY ? (saleRowForAY[20] !== undefined ? String(saleRowForAY[20]).trim() : "") : "";
      const ayLookupPre = String(pRow[50] || "").trim().toUpperCase();
      pRow[51] = (ayLookupPre !== "" && ayLookupPre !== "#N/A" && saleUVMap.has(ayLookupPre))
        ? saleUVMap.get(ayLookupPre)
        : (ayLookupPre !== "" ? "#N/A" : "");
    }

    // 5. MAIN LOOP — use AY (pRow[50]) as matching key for BA-BV lookups
    for (let p = 1; p < globalPortalData.length; p++) {
      const pRow = globalPortalData[p];
      // ayVal = Portal AY (Sale U = A+B+C+H+I), matches saleMapT key (Sale T = A+B+C+H+I)
      const ayRaw = pRow[50];
      const ayVal = (ayRaw !== undefined && ayRaw !== null && String(ayRaw).trim() !== "" && String(ayRaw).trim() !== "#N/A")
        ? String(ayRaw).trim().toUpperCase() : "";

      // BA: =IFERROR(VLOOKUP(AY2,SALE!$T$1:$AJ$6000,16,),"") -> SALE AI(34)
      let baResult = "";
      if (ayVal !== "" && saleMapT.has(ayVal)) {
        const matchRow = saleMapT.get(ayVal);
        baResult = matchRow[34] !== undefined && matchRow[34] !== null ? matchRow[34] : "";
      }

      // BB: =IF(AY2="","",VLOOKUP(AY2,$AS$1:$AV$6000,3,FALSE)) -> PORTAL AU(46)
      let bbResult = (ayVal === "") ? "" : "#N/A";
      let matchRowPortal = null;
      if (ayVal !== "" && portalMapAS.has(ayVal)) {
        matchRowPortal = portalMapAS.get(ayVal);
        bbResult = matchRowPortal[46] !== undefined && matchRowPortal[46] !== null ? matchRowPortal[46] : "";
      }

      // BC: =IF(AY2="","",VLOOKUP(AY2,SALE!$T$1:$W$6000,4,FALSE)) -> SALE W(22)
      let bcResult = (ayVal === "") ? "" : "#N/A";
      if (ayVal !== "" && saleMapT.has(ayVal)) {
        const matchRow = saleMapT.get(ayVal);
        bcResult = matchRow[22] !== undefined && matchRow[22] !== null ? matchRow[22] : "";
      }

      // BD: =IF(AND(BB2="",BC2=""),"",BB2-BC2)
      let bdResult = (bbResult === "" && bcResult === "") ? "" : "#VALUE!";
      if (bdResult !== "" && bbResult !== "#N/A" && bcResult !== "#N/A") {
        const valBB = parseFloat(bbResult);
        const valBC = parseFloat(bcResult);
        if (!isNaN(valBB) && !isNaN(valBC)) bdResult = valBB - valBC;
      }

      // BE: =IF(AY2="","",VLOOKUP(AY2,$DI$1:$DJ$6000,2,FALSE)) -> PORTAL DJ (idxBA + 61)
      let beResult = (ayVal === "") ? "" : "#N/A";
      if (ayVal !== "" && portalMapDI_DJ.has(ayVal)) {
        const djVal = portalMapDI_DJ.get(ayVal);
        beResult = djVal !== undefined && djVal !== null ? djVal : "";
      }

      // BF: =IF(AY2="","",VLOOKUP(AY2,SALE!$T$1:$AD$6000,11,FALSE)) -> SALE AD(29)
      let bfResult = (ayVal === "") ? "" : "#N/A";
      if (ayVal !== "" && saleMapT.has(ayVal)) {
        const matchRow = saleMapT.get(ayVal);
        bfResult = matchRow[29] !== undefined && matchRow[29] !== null ? matchRow[29] : "";
      }

      // BG: =IF(AND(BE2="",BF2=""),"",BE2-BF2)
      let bgResult = (beResult === "" && bfResult === "") ? "" : "#VALUE!";
      if (bgResult !== "") {
        const valBE = parseFloat(beResult);
        const valBF = parseFloat(bfResult);
        if (!isNaN(valBE) && !isNaN(valBF)) bgResult = valBE - valBF;
      }

      // BH: =IF(AND(BB2="",BE2=""),"",BB2*BE2)
      let bhResult = (bbResult === "" && beResult === "") ? "" : "#VALUE!";
      if (bhResult !== "") {
        const valBB = parseFloat(bbResult);
        const valBE = parseFloat(beResult);
        if (!isNaN(valBB) && !isNaN(valBE)) bhResult = valBB * valBE;
      }

      const rnd = (val) => (typeof val === 'number' && val % 1 !== 0) ? Number(val.toFixed(4)) : val;

      const forceNum = (v) => {
        if (v === "#N/A" || v === "#VALUE!" || v === "" || v === undefined || v === null) return 0;
        const num = parseFloat(v);
        return isNaN(num) ? 0 : num;
      };

      const matchRowT = saleMapT.has(ayVal) ? saleMapT.get(ayVal) : null;

      // BI: =IF(AY2="","",VLOOKUP(AY2,SALE!$T$1:$X$6000,5,FALSE)) -> Sale X (23)
      let biResult = (ayVal === "") ? "" : (matchRowT && matchRowT[23] !== undefined && matchRowT[23] !== null ? matchRowT[23] : "#N/A");

      // BJ: =IF(AND(BH2="",BI2=""),"",BH2-BI2)
      let bjResult = (bhResult === "" && (biResult === "" || biResult === "#N/A")) ? "" : (forceNum(bhResult) - forceNum(biResult));

      // BK: =IF(AY2="","",VLOOKUP(AY2,$AS$1:$AX$6000,5,FALSE)) -> Portal AW (48)
      let bkResult = (ayVal === "") ? "" : (matchRowPortal && matchRowPortal[48] !== undefined && matchRowPortal[48] !== null ? matchRowPortal[48] : "#N/A");

      // BL: =IF(AY2="","",VLOOKUP(AY2,SALE!$T$1:$Z$6000,6,FALSE)) -> Sale Y (24)
      let blResult = (ayVal === "") ? "" : (matchRowT && matchRowT[24] !== undefined && matchRowT[24] !== null ? matchRowT[24] : "#N/A");

      // BM = BK - BL
      let bmResult = forceNum(bkResult) - forceNum(blResult);

      // BN: =IF(AY2="","",VLOOKUP(AY2,$AS$1:$AX$6000,5,FALSE)) -> Portal AW (48)
      let bnResult = (ayVal === "") ? "" : (matchRowPortal && matchRowPortal[48] !== undefined && matchRowPortal[48] !== null ? matchRowPortal[48] : "#N/A");

      // BO: =IF(AY2="","",VLOOKUP(AY2,SALE!$T$1:$Z$6000,6,FALSE)) -> Sale Y (24)
      let boResult = (ayVal === "") ? "" : (matchRowT && matchRowT[24] !== undefined && matchRowT[24] !== null ? matchRowT[24] : "#N/A");

      // BP = BN - BO
      let bpResult = forceNum(bnResult) - forceNum(boResult);

      // BQ = BC * BE + BK + BN
      let bqResult = forceNum(bcResult) * forceNum(beResult) + forceNum(bkResult) + forceNum(bnResult);

      // BR: =IF(AY2="","",VLOOKUP(AY2,SALE!$T$1:$AA$6000,8,FALSE)) -> Sale AA (26)
      let brResult = (ayVal === "") ? "" : (matchRowT && matchRowT[26] !== undefined && matchRowT[26] !== null ? matchRowT[26] : "#N/A");

      // BS: =IF(AND(BQ2="",BR2=""),"",BQ2-BR2)
      let bsResult = (bqResult === "" && (brResult === "" || brResult === "#N/A")) ? "" : (forceNum(bqResult) - forceNum(brResult));

      // BT: =IF(BR2="","",TEXT(IF(ROUND(BR2-INT(BR2),2)<=0.49, BR2-INT(BR2), (INT(BR2)+1)-BR2), "0.00"))
      let btResult = "";
      if (brResult === "" || brResult === "#N/A") {
        btResult = "";
      } else {
        let brNum = forceNum(brResult);
        let intBR = Math.floor(brNum);
        let diff = Math.round((brNum - intBR) * 100) / 100;
        if (diff <= 0.49) {
          btResult = diff.toFixed(2);
        } else {
          btResult = ((intBR + 1) - brNum).toFixed(2);
        }
      }

      // BU = ROUND(BQ, 0)
      let buResult = Math.round(forceNum(bqResult));

      // BV: =IF(AY2="","",VLOOKUP(AY2,SALE!$T$1:$AC$6000,10,FALSE)) -> Sale AC (28)
      let bvResult = (ayVal === "") ? "" : (matchRowT && matchRowT[28] !== undefined && matchRowT[28] !== null ? matchRowT[28] : "#N/A");

      // BW = BT - BV
      let bwResult = forceNum(btResult) - forceNum(bvResult);

      // BX = ROUND(VLOOKUP(AY2, SALE!$T$1:$AB$6000, 8, FALSE), 0)
      let bxMatchRowT = saleMapT.get(ayVal); // Use ayVal (index 50) as requested
      let bxResultRaw = bxMatchRowT && bxMatchRowT[26] !== undefined && bxMatchRowT[26] !== null ? bxMatchRowT[26] : "#N/A";
      let bxResult = Math.round(forceNum(bxResultRaw));

      // BY = BU - BX
      let byResult = forceNum(buResult) - forceNum(bxResult);

      // Logic tests
      let bzResult = !isNaN(forceNum(bdResult)) && forceNum(bdResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";
      let caResult = !isNaN(forceNum(bgResult)) && forceNum(bgResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";
      let cbResult = !isNaN(forceNum(bjResult)) && forceNum(bjResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";
      let ccResult = !isNaN(forceNum(bmResult)) && forceNum(bmResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";
      let cdResult = !isNaN(forceNum(bpResult)) && forceNum(bpResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";
      let ceResult = !isNaN(forceNum(bsResult)) && forceNum(bsResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";
      let cfResult = !isNaN(forceNum(bwResult)) && forceNum(bwResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";
      let cgResult = !isNaN(forceNum(byResult)) && forceNum(byResult) < 1 ? "TRUE ✅ " : "FALSE ❌ ";

      const setVal = (offset, mappedResult) => {
        pRow[idxBA + offset] = isNaN(mappedResult) ? mappedResult : rnd(mappedResult);
      };

      pRow[idxBA + 0] = baResult;
      pRow[idxBA + 1] = rnd(bbResult);
      pRow[idxBA + 2] = rnd(bcResult);
      pRow[idxBA + 3] = rnd(bdResult);
      pRow[idxBA + 4] = rnd(beResult);
      pRow[idxBA + 5] = rnd(bfResult);
      pRow[idxBA + 6] = rnd(bgResult);
      pRow[idxBA + 7] = rnd(bhResult);

      setVal(8, biResult);
      setVal(9, bjResult);
      setVal(10, bkResult);
      setVal(11, blResult);
      setVal(12, bmResult);
      setVal(13, bnResult);
      setVal(14, boResult);
      setVal(15, bpResult);
      setVal(16, bqResult);
      setVal(17, brResult);
      setVal(18, bsResult);
      pRow[idxBA + 19] = btResult;
      setVal(20, buResult);
      setVal(21, bvResult);
      setVal(22, bwResult);
      setVal(23, bxResult);
      setVal(24, byResult);

      const billNoKey = normalizeBill(pRow[2]); // Portal column C (Bill/Invoice no)

      // CH: Excel expects "=PURCHASE!U2" (row-positional). We prefer key-based matching,
      // but fall back to positional mirroring to avoid blank CH when ids don't line up.
      let chResult = billNoKey ? (purchaseMapU.get(billNoKey) || "") : "";
      if (chResult === "" && globalPurchaseData && globalPurchaseData[p] && globalPurchaseData[p][20] !== undefined) {
        chResult = String(globalPurchaseData[p][20] || "").trim();
      }
      pRow[idxBA + 33] = chResult;

      // CI: =IFERROR(VLOOKUP(C, PURCHASE!C:AE, 29, FALSE), "")
      // Prefer key-based lookup; fall back to row-positional mirror to avoid blanks.
      let ciResult = billNoKey ? (purchaseMapAE.get(billNoKey) || "") : "";
      if (ciResult === "" && globalPurchaseData && globalPurchaseData[p] && globalPurchaseData[p][30] !== undefined) {
        ciResult = globalPurchaseData[p][30];
      }
      pRow[idxBA + 34] = ciResult; // CI (Index 86)

      // CJ: =IFERROR(VLOOKUP(CH, SALE!V:W, 2), "") so use CH as key into saleMapV (V->W)
      const cjKey = normalizeUV(chResult);
      const cjResult = (cjKey && saleMapV.has(cjKey)) ? saleMapV.get(cjKey) : "";
      pRow[idxBA + 35] = cjResult; // CJ (Index 87)

      // CK: =IFERROR(VLOOKUP(CH, PURCHASE!T:W, 4, FALSE), "")
      // Prefer key-based lookup by bill no; fall back to row-positional mirror.
      let ckResult = billNoKey ? (purchaseMapW.get(billNoKey) || "") : "";
      if (ckResult === "" && globalPurchaseData && globalPurchaseData[p] && globalPurchaseData[p][22] !== undefined) {
        ckResult = globalPurchaseData[p][22];
      }
      pRow[idxBA + 36] = ckResult; // CK (Index 88)

      // CL: =IF(AND(CJ="",CK=""),"",CJ-CK)
      let clResult = "";
      if (cjResult !== "" || ckResult !== "") {
        const valCJ = parseFloat(cjResult) || 0;
        const valCK = parseFloat(ckResult) || 0;
        clResult = valCJ - valCK;
      }
      // CM (Index 90): Difference Amount (Numeric for modal lookup)
      const diffAmtVal = (typeof clResult === 'number' && clResult % 1 !== 0) ? Number(clResult.toFixed(4)) : clResult;
      pRow[idxBA + 37] = diffAmtVal; // CL (89)
      // CN (91): Difference Status
      let cmStatus = "";
      if (clResult !== "") {
        cmStatus = (parseFloat(clResult) > 0) ? "TRUE ✅ " : "FALSE ❌ ";
      }
      pRow[idxBA + 38] = cmStatus; // CM (90) - Added formula tracking
      // pRow[idxBA + 39] = cmStatus; // CN (91) - Removed as requested



      pRow[idxBA + 25] = bzResult;
      pRow[idxBA + 26] = caResult;
      pRow[idxBA + 27] = cbResult;
      pRow[idxBA + 28] = ccResult;
      pRow[idxBA + 29] = cdResult;
      pRow[idxBA + 30] = ceResult;
      pRow[idxBA + 31] = cfResult;
      pRow[idxBA + 32] = cgResult;

      // DX & DY: Concatenation of BZ through CG statuses
      const dyConcat = bzResult + caResult + cbResult + ccResult + cdResult + ceResult + cfResult + cgResult;
      pRow[idxBA + 75] = dyConcat; // DX
      pRow[idxBA + 76] = dyConcat; // DY

      // EC: Portal Key (D + C + F + K + N)
      pRow[idxBA + 80] = String(pRow[3] || "") + String(pRow[2] || "") + String(pRow[5] || "") + String(pRow[10] || "") + String(pRow[13] || "");

      // CO: =IFERROR(VLOOKUP(BA2,$F$1:$J$6000,5,),"")
      const baValRaw = pRow[idxBA] !== undefined ? String(pRow[idxBA]).trim() : "";
      pRow[idxBA + 40] = portalMapFJ.get(baValRaw) || "";

      // CP: Complex Status logic (DW, DY)
      // CP: Complex Status logic (CO, DY) - Updated to use CO instead of DW
      // CO is BA + 40, DY is BA + 76
      const coVal = String(pRow[idxBA + 40] || "").trim();
      const dyVal = String(pRow[idxBA + 76] || "").trim(); // DY is offset 76 from BA
      let cpResult = "";
      if (coVal === "Cancelled") {
        cpResult = "CANCEL";
      } else if (["New", "Shipped", "Delivered", "Ready to ship", "Invoice Generated"].includes(coVal)) {
        if (dyVal.includes("TRUE")) {
          cpResult = "ALL CLEAR";
        } else if (dyVal.includes("FALSE")) {
          cpResult = "ALL CLEAR (S>P)";
        }
      } else if (coVal !== "") {
        // If none of the above, but CO has data, default to blank unless we find TRUE/FALSE
        // (Keeping logic consistent with formula: IF(OR(...), IF(ISNUMBER...), ""))
        cpResult = "";
      }
      pRow[idxBA + 41] = cpResult;

      // CR: =AS2 (Index 44)
      pRow[idxBA + 43] = pRow[44] || "";

      // CS-CY: Sale mirrors (AK, AI, AL, AL, AN, AO, Blank)
      if (hasSaleData && p < globalSaleInvoiceData.length) {
        const sRowMatch = globalSaleInvoiceData[p];
        pRow[idxBA + 44] = sRowMatch[36] || ""; // CS (AK)
        pRow[idxBA + 45] = sRowMatch[34] || ""; // CT (AI)
        pRow[idxBA + 46] = sRowMatch[37] || ""; // CU (AL)
        pRow[idxBA + 47] = sRowMatch[37] || ""; // CV (AL)
        pRow[idxBA + 48] = sRowMatch[39] || ""; // CW (AN)
        pRow[idxBA + 49] = sRowMatch[40] || ""; // CX (AO)

        const idxDA = pHeader.indexOf("Col DA");
        const idxDB = pHeader.indexOf("Col DB");
        const idxDC = pHeader.indexOf("Col DC");
        const idxDD = pHeader.indexOf("Col DD");

        if (idxDA !== -1) pRow[idxDA] = sRowMatch[42] || "";
        if (idxDB !== -1) pRow[idxDB] = sRowMatch[43] || "";
        if (idxDC !== -1) pRow[idxDC] = sRowMatch[44] || "";
        if (idxDD !== -1) pRow[idxDD] = sRowMatch[45] || "";
        
        // DE: =SALE!AU2
        if (idxDE_actual !== -1) {
            pRow[idxDE_actual] = sRowMatch[46] || "";
        }
      }

      // CZ (Index 103): Invoice Number (Col C / Index 2) for Modal Lookup
      pRow[idxBA + 51] = String(pRow[2] || "").trim().toUpperCase();
      pRow[idxBA + 50] = ""; // CY (Blank)

      // DA-DE mirroring and CZ Star logic are now handled in the block above using direct index lookups.

      // CZ Star logic is already handled above based on CX

      // DF, DG: BLANK as requested (DG is now for timestamp)
      pRow[idxBA + 57] = "";
      // DG calculation will be handled after DH is set below

      // DE (Index 108): =SALE!AU2 (Index 46)
      pRow[108] = (hasSaleData && p < globalSaleInvoiceData.length) ? (globalSaleInvoiceData[p][46] || "") : "";

      // --- SHIFTED MAPPING (DG->DH, DH->DI, etc.) ---
      
      // CZ to DD (Index 103-107): New Formulas
      pRow[103] = (pRow[101] && String(pRow[101]).trim() !== "") ? "⭐" : ""; // CZ
      pRow[104] = pRow[96] || ""; // DA
      pRow[105] = pRow[97] ? String(pRow[97]).replace(/S/g, "P") : ""; // DB
      pRow[106] = pRow[98] || ""; // DC
      pRow[107] = pRow[100] || ""; // DD

      // DF (Index 109): BLANK
      pRow[109] = "";

      // DG (Index 110): CURRENT TIME + DATE + NICKNAME
      const now = new Date();
      pRow[110] = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB')} - ${nickname}`;

      // DH (Index 111): late-bound from DB lookup in CI:CP range
      pRow[111] = "";

      // DI (Index 112): =AS2 (Index 44)
      pRow[112] = pRow[44] || "";

      // DJ (Index 113): =V2 (Index 21) 
      pRow[113] = pRow[21] || "";

      // DK (Index 114): =C&F&K&N (Concatenation)
      pRow[114] = String(pRow[2] || "") + String(pRow[5] || "") + String(pRow[10] || "") + String(pRow[13] || "");

      // DL (Index 115): =DJ2 (Index 113)
      pRow[115] = pRow[113] || "";

      // DM (Index 116): =BA2 (Index 52)
      pRow[116] = pRow[idxBA] || ""; 
      
      // DN (Index 117): =CP2 (Index 93)
      pRow[117] = pRow[93] || ""; 

      // DO (Index 118): Logged Nickname (already handled in pre-pass usually, but confirming here)
      pRow[118] = pRow[idxBA + 41] || "";

      // AY & AZ already set in pre-pass above
    }

    // --- LATE BINDING LOOKUPS (CQ, DH) ---
    // These need maps of calculated columns CM and DX
    const portalECMap_CM = new Map();
    const portalECMap_DX = new Map();
    const portalCItoCPMap = new Map();
    const cmIdx = idxBA + 38;
    const dxIdxInPortal = 127;
    const ciIdx = idxBA + 34;
    const cpIdx = idxBA + 41;
    const dbIdx = 105;

    for (let p = 1; p < globalPortalData.length; p++) {
      const pRow = globalPortalData[p];
      const ecVal = String(pRow[132] || "").trim(); // EC is 132
      if (ecVal !== "") {
        portalECMap_CM.set(ecVal, pRow[cmIdx]);
        portalECMap_DX.set(ecVal, pRow[dxIdxInPortal]);
      }
      const ciKey = String(pRow[ciIdx] || "").trim();
      if (ciKey !== "" && !portalCItoCPMap.has(ciKey)) {
        portalCItoCPMap.set(ciKey, pRow[cpIdx] || "");
      }
    }

    for (let p = 1; p < globalPortalData.length; p++) {
      const pRow = globalPortalData[p];
      const ecVal = String(pRow[132] || "").trim();
      pRow[idxBA + 42] = portalECMap_CM.get(ecVal) || ""; // CQ
      const dbKey = String(pRow[dbIdx] || "").trim();
      pRow[111] = dbKey ? (portalCItoCPMap.get(dbKey) || "") : ""; // DH
    }

    // --- SUMMARY LOGIC FOR COLUMN CN ---
    if (globalPortalData.length > 4) {
      const cnIdx = idxBA + 39;

      // CN3: =PURCHASE!AO2
      let cn3Status = "";
      if (globalPurchaseData && globalPurchaseData.length > 1) {
        cn3Status = globalPurchaseData[1][40] || ""; // AO is index 40
      }
      globalPortalData[2][cnIdx] = cn3Status;

      // CN4: =IF(SUMPRODUCT(--(CL2:CL6000<0))>0,"ERROR ⚠️","OK 👍")
      let hasCLError = false;
      const clIdx = idxBA + 37;
      for (let p = 1; p < globalPortalData.length; p++) {
        const valCL = parseFloat(globalPortalData[p][clIdx]);
        if (!isNaN(valCL) && valCL < 0) {
          hasCLError = true;
          break;
        }
      }
      let cn4Status = hasCLError ? "ERROR ⚠️" : "OK 👍";
      globalPortalData[3][cnIdx] = cn4Status;

      // CN5: Global Status
      let cn5Status = "";
      if (cn3Status === "ERROR ⚠️" || cn4Status === "ERROR ⚠️") {
        cn5Status = "ERROR ⚠️";
      } else if (cn3Status === "OK 👍" && cn4Status === "OK 👍") {
        cn5Status = "OK 👍";
      }
      globalPortalData[4][cnIdx] = cn5Status;
    }

    // --- FINAL PASS: Populate Global portalDKMap for Purchase BB Lookup ---
    const dkIdx = 114; // Fixed index for DK
    const dlIdx = 115; // Fixed index for DL
    for (let p = 1; p < globalPortalData.length; p++) {
      const pRow = globalPortalData[p];
      const dkKey = String(pRow[dkIdx] || "").trim();
      if (dkKey !== "") {
        portalDKMap.set(dkKey, pRow[dlIdx]);
        if (p < 6) console.log(`[DEBUG] Portal Map Added: "${dkKey}" -> "${pRow[dlIdx]}"`);
      }
    }
  }
}

// GOOGLE SHEET INTEGRATION
document.getElementById('sendToGoogleSheetBtn').addEventListener('click', async () => {
    if (!globalPortalData || globalPortalData.length <= 1) {
        window.showCustomAlert("No Portal data to queue!", "Data Missing");
        return;
    }

    // Ensure we have a valid mapping index (BA usually starts at 52)
    const mappingIdx = (typeof idxBA !== 'undefined') ? idxBA : 52;

    console.log("[DEBUG] Push Button Clicked. globalPortalData length:", globalPortalData ? globalPortalData.length : 0);

    const startCol = 96; // CS
    const endCol = 111; // DH

    const sellerName = localStorage.getItem('ajio_purchase_seller_name') || "";
    const nickname = localStorage.getItem('nickname') || "User";
    const vendorEventId = `AJIO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let lastFilledRow = 0;

    // Detect last row that has data in Column CS
    for (let i = globalPortalData.length - 1; i >= 1; i--) {
        const row = globalPortalData[i] || [];
        const startVal = row[startCol];
        if (startVal !== undefined && startVal !== null && String(startVal).trim() !== "") {
            lastFilledRow = i;
            break;
        }
    }

    console.log("[DEBUG] Detected lastFilledRow:", lastFilledRow);

    if (lastFilledRow === 0) {
        console.warn("[DEBUG] No data found in column index 96 (CS). Check if you processed the data.");
        window.showCustomAlert("No AJIO data found in CS column range. Make sure you have processed the Portal data first!", "No Data");
        return;
    }

    // Build a compact export row so AJIO data lands in visible sheet columns.
    const newBatch = [];
    for (let i = 1; i <= lastFilledRow; i++) {
        const row = globalPortalData[i];

        const exportRow = row.slice(startCol, endCol + 1);
        exportRow.push(sellerName);
        exportRow.push(nickname);

        const invNo = String(row[97] || row[105] || row[2] || "").trim();
        newBatch.push({ sheetName: "AJIO", row: exportRow, vendorEventId: vendorEventId, invoiceNo: invNo });
    }

    if (newBatch.length === 0) return;

    // Log to pushHistory
    const invoiceList = [];
    for (let i = 1; i <= lastFilledRow; i++) {
        const row = globalPortalData[i];
        if (row) {
            const invNo = String(row[97] || row[105] || row[2] || "").trim();
            if (invNo) invoiceList.push(invNo);
        }
    }
    if (window.logPushHistory) {
        await window.logPushHistory("AJIO", invoiceList, vendorEventId, sellerName, "Portal Invoice Submitted To Google Sheet");
    }

    // Load existing queue for AJIO only
    const storageKey = 'pushQueue_AJIO';
    const result = await chrome.storage.local.get([storageKey]);
    let currentQueue = result[storageKey] || [];
    
    // Append the objects with vendorEventId and invoiceNo
    const exportBatch = newBatch.map(item => ({ row: item.row, vendorEventId: vendorEventId, invoiceNo: item.invoiceNo }));
    currentQueue = currentQueue.concat(exportBatch);
    await chrome.storage.local.set({ [storageKey]: currentQueue });


    // Signal Background script to start working for AJIO specifically
    chrome.runtime.sendMessage({ action: "startSync", platform: "AJIO" });

    // Instantly update the UI count
    if (typeof window.updateQueueUI === 'function') {
        window.updateQueueUI();
    } else if (typeof updateQueueUI === 'function') {
        updateQueueUI();
    }

    // UI Status Update
    const statusEl = document.getElementById('pushStatus');
    if (statusEl) {
        statusEl.innerHTML = `✅ ${newBatch.length} rows added to Background Queue`;
        statusEl.style.color = "#27ae60";
        statusEl.style.opacity = '1';
        setTimeout(() => { statusEl.style.opacity = '0'; }, 5000);
    }

});

// End of sendToGoogleSheetBtn listener
