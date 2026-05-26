/**
 * GOOGLE APPS SCRIPT - MODULAR VERSION
 * Split into: 
 * Part 1: Push Data Logic (Auth, API Management, Data Saving)
 * Part 2: Data Calculation Logic (Insights, Analytics, User Stats)
 */

var PASTEL_COLORS = [
  "#fff5f5", // Light Red
  "#fffaeb", // Light Yellow/Orange
  "#fafff0", // Light Green
  "#f0fffb", // Light Cyan
  "#f0f8ff", // Light Blue
  "#f8f0ff", // Light Purple
  "#fff0fa"  // Light Pink
];
var MASTER_SPREADSHEET_ID = "1bv2Tk6S3BBD1EVsgGDQvWuPDYwqLWPt_oEK96x5Sc0g";
var MASTER_SPREADSHEET_URL = "";

function getMasterSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty("MASTER_SPREADSHEET_ID") || MASTER_SPREADSHEET_ID || "").trim();
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);

  var spreadsheetUrl = String(props.getProperty("MASTER_SPREADSHEET_URL") || MASTER_SPREADSHEET_URL || "").trim();
  if (spreadsheetUrl) return SpreadsheetApp.openByUrl(spreadsheetUrl);

  throw new Error("Spreadsheet not connected. Set script property MASTER_SPREADSHEET_ID (recommended) or bind this Apps Script project to the target Google Sheet.");
}

// --- SHARED HELPERS ---
function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findHeaderRowIndex_(values) {
  var maxScan = Math.min(values.length, 10);
  for (var r = 0; r < maxScan; r++) {
    for (var c = 0; c < (values[r] ? values[r].length : 0); c++) {
      if (normalizeHeader_(values[r][c]) === "user id") return r + 1;
    }
  }
  return 1;
}

function ensureUserSheetMeta_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) {
    sheet.appendRow(["User id", "Nick Name", "password", "AMAZON", "AJIO", "MYNTRA", "ROLE"]);
    values = sheet.getDataRange().getValues();
  }
  var headerRowIndex = findHeaderRowIndex_(values);
  var headerRow = values[headerRowIndex - 1] || [];
  var idx = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = normalizeHeader_(headerRow[i]);
    if (key) idx[key] = i;
  }
  if (idx["role"] === undefined) {
    var nextCol = headerRow.length + 1;
    sheet.getRange(headerRowIndex, nextCol).setValue("ROLE");
    SpreadsheetApp.flush();
    values = sheet.getDataRange().getValues();
    headerRow = values[headerRowIndex - 1] || [];
    idx = {};
    for (var j = 0; j < headerRow.length; j++) {
      var k = normalizeHeader_(headerRow[j]);
      if (k) idx[k] = j;
    }
  }
  return {
    headerRowIndex: headerRowIndex,
    colUserId: idx["user id"] !== undefined ? idx["user id"] : 0,
    colNick: idx["nick name"] !== undefined ? idx["nick name"] : 1,
    colPassword: idx["password"] !== undefined ? idx["password"] : 2,
    colAmazon: idx["amazon"] !== undefined ? idx["amazon"] : 3,
    colAjio: idx["ajio"] !== undefined ? idx["ajio"] : 4,
    colMyntra: idx["myntra"] !== undefined ? idx["myntra"] : 5,
    colRole: idx["role"] !== undefined ? idx["role"] : 6
  };
}

function getUserRowIndex_(values, meta, userId) {
  var target = String(userId || "").trim();
  if (!target) return -1;
  for (var i = meta.headerRowIndex; i < values.length; i++) {
    if (String(values[i][meta.colUserId] || "").trim() === target) return i + 1;
  }
  return -1;
}

// --- MAIN ROUTER ---
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("Error: No data in request body").setMimeType(ContentService.MimeType.TEXT);
    }
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = getMasterSpreadsheet_();
    var userDataSheet = ss.getSheetByName("USER DATA");
    if (!userDataSheet) {
      userDataSheet = ss.insertSheet("USER DATA");
      userDataSheet.appendRow(["User id", "Nick Name", "password", "AMAZON", "AJIO", "MYNTRA", "ROLE"]);
    }
    var userMeta = ensureUserSheetMeta_(userDataSheet);

    // DAILY LIMIT REFRESH will now be handled inside Calculation Logic to save resources

    // CATEGORIZE AND ROUTE
    var calculationActions = ["getAPICount", "getUsers", "getInsights", "getGlobalInsights", "getUserInsights"];
    if (calculationActions.indexOf(action) > -1) {
      return handleCalculationLogic_(action, payload, ss, userDataSheet, userMeta);
    } else {
      return handlePushLogic_(action, payload, ss, userDataSheet, userMeta);
    }

  } catch (error) {
    return ContentService.createTextOutput("Critical Error: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * PART 1: PUSH DATA LOGIC (Auth, Updates, Saving)
 */
function handlePushLogic_(action, payload, ss, userDataSheet, userMeta) {
  if (action === "updateAPI") {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      var lCell = userDataSheet.getRange("L1");
      var currentCount = parseInt(lCell.getValue(), 10) || 0;
      var dec = parseInt(payload.count, 10);
      if (isNaN(dec) || dec < 1) dec = 1;
      if (currentCount > 0) {
        lCell.setValue(Math.max(0, currentCount - dec));
        SpreadsheetApp.flush();
        return ContentService.createTextOutput("API Count Updated").setMimeType(ContentService.MimeType.TEXT);
      }
      return ContentService.createTextOutput("API Limit Reached").setMimeType(ContentService.MimeType.TEXT);
    } finally { lock.releaseLock(); }
  }

  if (action === "register") {
    var userId = String(payload.userId || "").trim(), nickName = String(payload.nickName || "").trim(), password = String(payload.password || "").trim();
    var dataR = userDataSheet.getDataRange().getValues();
    for (var r = userMeta.headerRowIndex; r < dataR.length; r++) {
      if (String(dataR[r][userMeta.colUserId] || "").trim() === userId) {
        return ContentService.createTextOutput("User Already Exists").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    userDataSheet.appendRow([userId, nickName, password, "NO", "NO", "NO", "USER"]);
    return ContentService.createTextOutput("Registration Success").setMimeType(ContentService.MimeType.TEXT);
  }

  if (action === "login") {
    var userIdL = String(payload.userId || "").trim(), passwordL = String(payload.password || "").trim();
    var dataL = userDataSheet.getDataRange().getValues();
    var foundUser = false;
    for (var i = userMeta.headerRowIndex; i < dataL.length; i++) {
      var sheetUserId = String(dataL[i][userMeta.colUserId] || "").trim();
      var sheetPassword = String(dataL[i][userMeta.colPassword] || "").trim();

      if (sheetUserId === userIdL) {
        foundUser = true;
        if (sheetPassword === passwordL) {
          var roleValue = String(dataL[i][userMeta.colRole] || "USER").trim().toUpperCase() || "USER";
          var response = {
            status: "Success", nickName: dataL[i][userMeta.colNick], role: roleValue,
            access: { AMAZON: dataL[i][userMeta.colAmazon] || "NO", AJIO: dataL[i][userMeta.colAjio] || "NO", MYNTRA: dataL[i][userMeta.colMyntra] || "NO" }
          };
          
          // --- Trigger Login Notification ---
          try {
            sendLoginAlert_({
              userId: userIdL,
              nickName: response.nickName,
              role: roleValue,
              access: response.access
            });
          } catch (err) {
            console.error("Notification Error: " + err.toString());
          }
          
          return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    var errMsg = foundUser ? "Invalid Password" : "User ID Not Found";
    return ContentService.createTextOutput(errMsg).setMimeType(ContentService.MimeType.TEXT);
  }

  if (action === "forgetPassword") {
    var userIdF = payload.userId, oldPw = payload.oldPassword, newPw = payload.newPassword;
    var dataF = userDataSheet.getDataRange().getValues();
    for (var f = userMeta.headerRowIndex; f < dataF.length; f++) {
      if (String(dataF[f][userMeta.colUserId] || "").trim() === String(userIdF || "").trim() && String(dataF[f][userMeta.colPassword] || "") === String(oldPw || "")) {
        userDataSheet.getRange(f + 1, userMeta.colPassword + 1).setValue(newPw);
        return ContentService.createTextOutput("Password Updated Successfully").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    return ContentService.createTextOutput("Invalid User ID or Old Password").setMimeType(ContentService.MimeType.TEXT);
  }

  if (action === "updateUsers") {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      var reqId = payload.requesterUserId, reqPw = payload.requesterPassword, updates = payload.users || [];
      var dataX = userDataSheet.getDataRange().getValues();
      var reqRow = -1;
      for (var x = userMeta.headerRowIndex; x < dataX.length; x++) {
        if (String(dataX[x][userMeta.colUserId] || "").trim() === String(reqId || "").trim() && String(dataX[x][userMeta.colPassword] || "") === String(reqPw || "")) {
          reqRow = x; break;
        }
      }
      if (reqRow < 0 || String(dataX[reqRow][userMeta.colRole] || "USER").trim().toUpperCase() !== "ADMIN") {
        return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Access denied or invalid credentials" })).setMimeType(ContentService.MimeType.JSON);
      }
      var updated = 0, errors = [];
      for (var k = 0; k < updates.length; k++) {
        var item = updates[k] || {}, targetId = String(item.userId || "").trim();
        if (!targetId) continue;
        var rIdx = getUserRowIndex_(dataX, userMeta, targetId);
        if (rIdx < 0) { errors.push("User not found: " + targetId); continue; }
        if (targetId === String(reqId || "").trim() && item.ROLE && String(item.ROLE).toUpperCase() !== "ADMIN") { errors.push("Cannot change your own ROLE from ADMIN"); continue; }
        if (item.nickName !== undefined) userDataSheet.getRange(rIdx, userMeta.colNick + 1).setValue(item.nickName);
        if (item.password !== undefined) userDataSheet.getRange(rIdx, userMeta.colPassword + 1).setValue(item.password);
        if (item.AMAZON !== undefined) userDataSheet.getRange(rIdx, userMeta.colAmazon + 1).setValue(item.AMAZON);
        if (item.AJIO !== undefined) userDataSheet.getRange(rIdx, userMeta.colAjio + 1).setValue(item.AJIO);
        if (item.MYNTRA !== undefined) userDataSheet.getRange(rIdx, userMeta.colMyntra + 1).setValue(item.MYNTRA);
        if (item.ROLE !== undefined) userDataSheet.getRange(rIdx, userMeta.colRole + 1).setValue(item.ROLE);
        updated++;
      }
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({ status: "Success", updated: updated, errors: errors })).setMimeType(ContentService.MimeType.JSON);
    } finally { lock.releaseLock(); }
  }

  if (action === "exportDataByDate") {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      var sName = payload.sheetName || "AMAZON", startStr = payload.startDate, endStr = payload.endDate;
      var target = ss.getSheetByName(sName);
      if (!target) return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
      var data = target.getDataRange().getValues();
      if (data.length < 1) return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "No data" })).setMimeType(ContentService.MimeType.JSON);
      var headers = data[0], dIdx = headers.findIndex(h => String(h).toUpperCase().indexOf("INVOICE DATE") > -1);
      if (dIdx === -1) return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Date column not found" })).setMimeType(ContentService.MimeType.JSON);
      var sP = startStr.split("-"), eP = endStr.split("-"), st = new Date(sP[0], parseInt(sP[1], 10) - 1, sP[2]), en = new Date(eP[0], parseInt(eP[1], 10) - 1, eP[2]);
      en.setHours(23, 59, 59, 999);
      var filtered = [headers];
      for (var i = 1; i < data.length; i++) {
        var dRaw = data[i][dIdx], dObj = (dRaw instanceof Date) ? dRaw : null;
        if (!dObj && typeof dRaw === 'string' && dRaw.trim()) {
          var p = dRaw.split(/[-/]/);
          if (p.length >= 3) dObj = (p[0].length === 4) ? new Date(p[0], parseInt(p[1], 10) - 1, p[2]) : new Date(p[2], parseInt(p[1], 10) - 1, p[0]);
        }
        if (dObj && !isNaN(dObj.getTime()) && dObj >= st && dObj <= en) {
          filtered.push(data[i].map(v => (v instanceof Date) ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), "dd-MM-yyyy") : v));
        }
      }
      var lCell = userDataSheet.getRange("L1"), cur = parseInt(lCell.getValue(), 10) || 0;
      if (cur > 0) lCell.setValue(cur - 1);
      return ContentService.createTextOutput(JSON.stringify({ status: "Success", data: filtered })).setMimeType(ContentService.MimeType.JSON);
    } finally { lock.releaseLock(); }
  }

  if (action === "saveData" || !action) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      var sName = payload.sheetName || "AJIO", dataRows = Array.isArray(payload) ? payload : (payload.data || []);
      if (dataRows.length > 0) {
        var sheet = ss.getSheetByName(sName) || ss.insertSheet(sName);
        var lastC = sheet.getLastColumn();
        if (lastC > 0) {
          var headersCheck = sheet.getRange(1, 1, 1, lastC).getValues()[0];
          if (headersCheck.findIndex(h => String(h).toUpperCase() === "VENDOR") === -1 && dataRows[0].length > lastC) sheet.getRange(1, lastC + 1).setValue("VENDOR");
        }
        var startR = sheet.getLastRow() + 1;
        sheet.getRange(startR, 1, dataRows.length, dataRows[0].length).setValues(dataRows);
        var nCols = Math.min(17, dataRows[0].length), bgs = [];
        for (var r = 0; r < dataRows.length; r++) {
          var color = PASTEL_COLORS[Math.max(0, (startR + r - 2) % 7)], rowBg = [];
          for (var c = 0; c < nCols; c++) rowBg.push(color);
          bgs.push(rowBg);
        }
        if (bgs.length > 0) sheet.getRange(startR, 1, dataRows.length, nCols).setBackgrounds(bgs);
        var lCell = userDataSheet.getRange("L1"), cur = parseInt(lCell.getValue(), 10) || 0;
        lCell.setValue(Math.max(0, cur - dataRows.length));
        SpreadsheetApp.flush();
        return ContentService.createTextOutput("Success (" + dataRows.length + " rows saved)").setMimeType(ContentService.MimeType.TEXT);
      }
    } finally { lock.releaseLock(); }
  }
  return ContentService.createTextOutput("Error: Invalid action").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * PART 2: CALCULATION & ANALYTICS LOGIC (Reading/Aggregation)
 */
function handleCalculationLogic_(action, payload, ss, userDataSheet, userMeta) {
  if (action === "getAPICount") {
    // 1. Check for Daily Refresh here instead of every doPost
    var l1Cell = userDataSheet.getRange("L1");
    var m1Cell = userDataSheet.getRange("M1");
    var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");

    if (l1Cell.isBlank() || isNaN(parseInt(l1Cell.getValue(), 10))) l1Cell.setValue(10000);

    var lastReset = m1Cell.getValue();
    var lastResetStr = (lastReset instanceof Date) ? Utilities.formatDate(lastReset, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd") : String(lastReset || "");

    if (lastResetStr !== todayStr) {
      l1Cell.setValue(10000);
      m1Cell.setValue(todayStr);
      SpreadsheetApp.flush();
    }

    // 2. Return count without unnecessary script lock (Read-only)
    var val = l1Cell.getValue();
    return ContentService.createTextOutput(String(val || 0)).setMimeType(ContentService.MimeType.TEXT);
  }

  if (action === "getUsers") {
    var reqId = payload.requesterUserId, reqPw = payload.requesterPassword;
    var dataU = userDataSheet.getDataRange().getValues(), reqRow = -1;
    for (var u = userMeta.headerRowIndex; u < dataU.length; u++) {
      if (String(dataU[u][userMeta.colUserId] || "").trim() === String(reqId || "").trim() && String(dataU[u][userMeta.colPassword] || "") === String(reqPw || "")) { reqRow = u; break; }
    }
    if (reqRow < 0 || String(dataU[reqRow][userMeta.colRole] || "USER").trim().toUpperCase() !== "ADMIN") {
      return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Access denied" })).setMimeType(ContentService.MimeType.JSON);
    }
    var users = [];
    for (var rr = userMeta.headerRowIndex; rr < dataU.length; rr++) {
      var idVal = String(dataU[rr][userMeta.colUserId] || "").trim();
      if (idVal) users.push({ userId: idVal, nickName: String(dataU[rr][userMeta.colNick] || ""), password: String(dataU[rr][userMeta.colPassword] || ""), AMAZON: String(dataU[rr][userMeta.colAmazon] || "NO"), AJIO: String(dataU[rr][userMeta.colAjio] || "NO"), MYNTRA: String(dataU[rr][userMeta.colMyntra] || "NO"), ROLE: String(dataU[rr][userMeta.colRole] || "USER") });
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "Success", users: users })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getInsights") {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      var sName = payload.sheetName || "AMAZON", maxR = parseInt(payload.maxRows, 10) || 1000, gBy = payload.groupBy || "MONTH", vFilter = payload.vendorFilter || "";
      var target = ss.getSheetByName(sName);
      if (!target) return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
      var lastR = target.getLastRow();
      if (lastR <= 1) return ContentService.createTextOutput(JSON.stringify({ status: "Success", sheetName: sName, totals: { rows: 0, sale: 0, purchase: 0, qty: 0 }, series: { dates: [], counts: [] }, remarkTop: [] })).setMimeType(ContentService.MimeType.JSON);
      var cache = CacheService.getScriptCache(), cacheKey = sName + "_" + lastR + "_" + maxR + "_" + gBy + "_" + vFilter;
      var cached = cache.get(cacheKey); if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      var fetch = Math.min(maxR, lastR - 1), start = lastR - fetch + 1, hs = target.getRange(1, 1, 1, target.getLastColumn()).getValues()[0];
      var dIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("INVOICE DATE") > -1), sIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("SALE AMOUNT") > -1 || String(h).toUpperCase() === "SALE AMOUN");
      var pIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("PURCHASE AMO") > -1), rIdx = hs.findIndex(h => String(h).trim().toUpperCase() === "REMARK"), qIdx = hs.findIndex(h => { var s = String(h).toUpperCase(); return s.indexOf("QTY") > -1 && s.indexOf("DIFF") === -1 && s.indexOf("STATUS") === -1; });
      var vIdx = 16; var maxC = Math.max(dIdx, sIdx, pIdx, rIdx, qIdx, vIdx);
      var data = target.getRange(start, 1, fetch, maxC + 1).getValues(), tSale = 0, tPurch = 0, tQty = 0, rGroups = {}, vGroups = {}, tGroups = {}, ms = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (var i = 0; i < data.length; i++) {
        var row = data[i]; if (vFilter && String(row[vIdx] || "").trim().toLowerCase() !== vFilter.toLowerCase()) continue;
        var rSale = 0, rPurch = 0, rQty = 0;
        if (qIdx > -1) { rQty = parseFloat(String(row[qIdx]).replace(/[^0-9.-]+/g, "")) || 0; tQty += rQty; }
        if (sIdx > -1) { rSale = parseFloat(String(row[sIdx]).replace(/[^0-9.-]+/g, "")) || 0; tSale += rSale; }
        if (pIdx > -1) { rPurch = parseFloat(String(row[pIdx]).replace(/[^0-9.-]+/g, "")) || 0; tPurch += rPurch; }
        if (rIdx > -1) { var r = String(row[rIdx]).trim() || "BLANK"; rGroups[r] = (rGroups[r] || 0) + 1; }
        var v = String(row[vIdx] || "").trim() || "Unknown Vendor"; if (!vGroups[v]) vGroups[v] = { sale: 0, count: 0 }; vGroups[v].sale += rSale; vGroups[v].count++;
        if (dIdx > -1) {
          var d = row[dIdx], dObj = (d instanceof Date) ? d : null; if (!dObj && typeof d === 'string') { var p = d.split(/[-/]/); if (p.length >= 3) dObj = new Date(p[2], parseInt(p[1], 10) - 1, p[0]); }
          if (dObj && !isNaN(dObj.getTime())) { var k = (gBy === "QUARTER") ? ("Q" + (Math.floor(dObj.getMonth() / 3) + 1) + " " + dObj.getFullYear()) : (ms[dObj.getMonth()] + " " + dObj.getFullYear()); if (!tGroups[k]) tGroups[k] = { count: 0, sale: 0, purchase: 0 }; tGroups[k].count++; tGroups[k].sale += rSale; tGroups[k].purchase += rPurch; }
        }
      }
      var skeys = Object.keys(tGroups).sort((a, b) => { var yA = parseInt(a.split(" ")[1]) || 0, yB = parseInt(b.split(" ")[1]) || 0; return (yA !== yB) ? (yA - yB) : a.localeCompare(b); });
      var sDates = [], sCounts = []; for (var k = 0; k < skeys.length; k++) { sDates.push(skeys[k]); sCounts.push(tGroups[skeys[k]].count); }
      var res = JSON.stringify({ status: "Success", sheetName: sName, maxRowsUsed: fetch, totals: { rows: fetch, sale: tSale, purchase: tPurch, qty: tQty }, series: { dates: sDates, counts: sCounts }, remarkTop: Object.keys(rGroups).map(k => ({ label: k, value: rGroups[k] })).sort((a, b) => b.value - a.value), vendorTop: Object.keys(vGroups).map(k => ({ label: k, value: vGroups[k].sale, rows: vGroups[k].count })).sort((a, b) => b.value - a.value) });
      try { cache.put(cacheKey, res, 21600); } catch (e) { } return ContentService.createTextOutput(res).setMimeType(ContentService.MimeType.JSON);
    } finally { lock.releaseLock(); }
  }

  if (action === "getGlobalInsights") {
    var lockGlobal = LockService.getScriptLock();
    try {
      lockGlobal.waitLock(15000);
      var vFilter = (payload.vendorFilter || "").trim();
      var platforms = ["AMAZON", "AJIO", "MYNTRA"], gTotals = { sale: 0, purchase: 0, qty: 0 }, comp = [], gTGroups = {}, gVGroups = {}, ms = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (var p = 0; p < platforms.length; p++) {
        var pName = platforms[p], sheet = ss.getSheetByName(pName); if (!sheet) continue;
        var lastR = sheet.getLastRow(); if (lastR <= 1) { comp.push({ label: pName, sale: 0, purchase: 0, qty: 0 }); continue; }
        var hs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0], pSale = 0, pPurch = 0, pQty = 0;
        var dIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("INVOICE DATE") > -1), sIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("SALE AMOUNT") > -1 || String(h).toUpperCase() === "SALE AMOUN");
        var purchIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("PURCHASE AMO") > -1), qtyIdx = hs.findIndex(h => { var s = String(h).toUpperCase(); return s.indexOf("QTY") > -1 && s.indexOf("DIFF") === -1 && s.indexOf("STATUS") === -1; });
        var data = sheet.getRange(2, 1, Math.min(2000, lastR - 1), Math.max(dIdx, sIdx, purchIdx, qtyIdx, 16) + 1).getValues();
        for (var i = 0; i < data.length; i++) {
          var row = data[i], vName = String(row[16] || "").trim() || "Unknown Vendor"; if (vFilter && vName.toLowerCase() !== vFilter.toLowerCase()) continue;
          var sVal = (sIdx > -1) ? (parseFloat(String(row[sIdx]).replace(/[^0-9.-]+/g, "")) || 0) : 0; pSale += sVal;
          if (purchIdx > -1) pPurch += parseFloat(String(row[purchIdx]).replace(/[^0-9.-]+/g, "")) || 0;
          if (qtyIdx > -1) pQty += parseFloat(String(row[qtyIdx]).replace(/[^0-9.-]+/g, "")) || 0;
          if (!gVGroups[vName]) gVGroups[vName] = { sale: 0, count: 0 }; gVGroups[vName].sale += sVal; gVGroups[vName].count++;
          if (dIdx > -1) { var d = row[dIdx], dObj = (d instanceof Date) ? d : null; if (dObj && !isNaN(dObj.getTime())) { var k = ms[dObj.getMonth()] + " " + dObj.getFullYear(); if (!gTGroups[k]) gTGroups[k] = { total: 0 }; gTGroups[k].total += sVal; } }
        }
        gTotals.sale += pSale; gTotals.purchase += pPurch; gTotals.qty += pQty; comp.push({ label: pName, sale: pSale, purchase: pPurch, qty: pQty });
      }
      var skeys = Object.keys(gTGroups).sort((a, b) => { var yA = parseInt(a.split(" ")[1]) || 0, yB = parseInt(b.split(" ")[1]) || 0; return (yA !== yB) ? (yA - yB) : (ms.indexOf(a.split(" ")[0]) - ms.indexOf(b.split(" ")[0])); }).slice(-6);
      return ContentService.createTextOutput(JSON.stringify({ status: "Success", totals: gTotals, comparison: comp, trend: { dates: skeys, values: skeys.map(k => gTGroups[k].total) }, vendorTop: Object.keys(gVGroups).map(k => ({ label: k, value: gVGroups[k].sale, rows: gVGroups[k].count })).sort((a, b) => b.value - a.value) })).setMimeType(ContentService.MimeType.JSON);
    } finally { lockGlobal.releaseLock(); }
  }

  if (action === "getUserInsights") {
    var lockUser = LockService.getScriptLock();
    try {
      lockUser.waitLock(15000);
      var platforms = ["AMAZON", "AJIO", "MYNTRA"], userStats = {};
      for (var p = 0; p < platforms.length; p++) {
        var pName = platforms[p], sheet = ss.getSheetByName(pName); if (!sheet) continue;
        var lastR = sheet.getLastRow(); if (lastR <= 1) continue;
        var hs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var sIdx = hs.findIndex(h => { var s = String(h).toUpperCase(); return s.indexOf("DATA AND TIME") > -1 || s.indexOf("SYNC TIME") > -1; });
        var rIdx = hs.findIndex(h => normalizeHeader_(h) === "remark"); if (sIdx === -1) continue;
        var data = sheet.getRange(lastR - Math.min(5000, lastR - 1) + 1, 1, Math.min(5000, lastR - 1), Math.max(sIdx, rIdx) + 1).getValues();
        for (var i = 0; i < data.length; i++) {
          var sVal = String(data[i][sIdx] || ""), nick = ""; if (!sVal) continue;
          var mP = sVal.match(/\(([^)]+)\)/), mD = sVal.split(" - ");
          if (mP) nick = mP[1].trim(); else if (mD.length > 1) nick = mD[mD.length - 1].trim();
          if (!nick || nick.toUpperCase() === "USER") continue;
          if (!userStats[nick]) userStats[nick] = { nickname: nick, totalRows: 0, disputeRows: 0, amazon: 0, ajio: 0, myntra: 0 };
          userStats[nick].totalRows++; userStats[nick][pName.toLowerCase()]++;
          var rText = String(data[i][rIdx] || "").toUpperCase();
          if (rText && ["ALL CLEAR", "OK", "MATCH", "BLANK", ""].indexOf(rText) === -1) userStats[nick].disputeRows++;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "Success", userStats: Object.keys(userStats).map(k => userStats[k]) })).setMimeType(ContentService.MimeType.JSON);
    } finally { lockUser.releaseLock(); }
  }
}
