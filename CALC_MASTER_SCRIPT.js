/**
 * GOOGLE APPS SCRIPT PROJECT 2: ANALYTICS & CALC (PLATFORM TRENDS)
 * Handles: Platform Insights, Monthly/Quarterly Charts, Global Totals.
 * Deployment Link 2.
 */

function normalizeHeader_(v) { return String(v || "").trim().toLowerCase().replace(/\s+/g, " "); }
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

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
    var payload = JSON.parse(e.postData.contents), action = payload.action;
    var ss = getMasterSpreadsheet_(), userDataSheet = ss.getSheetByName("USER DATA");

    if (action === "getAPICount") {
      if (!userDataSheet) return ContentService.createTextOutput("0").setMimeType(ContentService.MimeType.TEXT);
      return ContentService.createTextOutput(String(userDataSheet.getRange("L1").getValue())).setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === "getUsers") {
      if (!userDataSheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "USER DATA sheet not found" })).setMimeType(ContentService.MimeType.JSON);
      }

      var dataU = userDataSheet.getDataRange().getValues();
      var adminRow = -1;
      for (var u = 1; u < dataU.length; u++) {
        var rowUserId = String(dataU[u][0] || "").trim();
        var rowPassword = String(dataU[u][2] || "").trim();
        if (rowUserId === String(payload.requesterUserId || "").trim() && rowPassword === String(payload.requesterPassword || "").trim()) {
          adminRow = u;
          break;
        }
      }

      if (adminRow < 0 || String(dataU[adminRow][6] || "USER").trim().toUpperCase() !== "ADMIN") {
        return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Access denied" })).setMimeType(ContentService.MimeType.JSON);
      }

      var users = [];
      for (var r = 1; r < dataU.length; r++) {
        var userId = String(dataU[r][0] || "").trim();
        if (!userId) continue;
        users.push({
          userId: userId,
          nickName: String(dataU[r][1] || ""),
          password: String(dataU[r][2] || ""),
          AMAZON: String(dataU[r][3] || "NO"),
          AJIO: String(dataU[r][4] || "NO"),
          MYNTRA: String(dataU[r][5] || "NO"),
          ROLE: String(dataU[r][6] || "USER")
        });
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "Success", users: users })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getInsights") {
      var sName = payload.sheetName || "AMAZON", target = ss.getSheetByName(sName);
      if (!target || target.getLastRow() <= 1) return ContentService.createTextOutput(JSON.stringify({ status: "Success", totals: {rows:0,sale:0,purchase:0,qty:0}, series:{dates:[],counts:[]}, vendorTop:[], remarkTop:[] })).setMimeType(ContentService.MimeType.JSON);
      
      var hs = target.getRange(1, 1, 1, target.getLastColumn()).getValues()[0], fetch = Math.min(parseInt(payload.maxRows) || 1000, target.getLastRow() - 1);
      var dIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("INVOICE DATE") > -1), sIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("SALE AMOUNT") > -1), pIdx = hs.findIndex(h => String(h).toUpperCase().indexOf("PURCHASE AMO") > -1), rIdx = hs.findIndex(h => String(h).toUpperCase() === "REMARK"), qIdx = hs.findIndex(h => { var s = String(h).toUpperCase(); return s.indexOf("QTY") > -1 && s.indexOf("DIFF")===-1; });
      var vIdx = 16; 

      var data = target.getRange(target.getLastRow() - fetch + 1, 1, fetch, target.getLastColumn()).getValues();
      var tS=0, tP=0, tQ=0, rG={}, vG={}, tG={}, ms=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      
      for (var i=0; i<data.length; i++) {
        var row = data[i], sV = (sIdx > -1) ? (parseFloat(String(row[sIdx]).replace(/[^0-9.-]+/g,"")) || 0) : 0;
        if (payload.vendorFilter && vIdx > -1 && String(row[vIdx] || "").toLowerCase() !== payload.vendorFilter.toLowerCase()) continue;
        tS += sV;
        if (pIdx > -1) tP += parseFloat(String(row[pIdx]).replace(/[^0-9.-]+/g,"")) || 0;
        if (qIdx > -1) tQ += parseFloat(String(row[qIdx]).replace(/[^0-9.-]+/g,"")) || 0;
        if (rIdx > -1) { var rm = String(row[rIdx] || "BLANK").trim(); rG[rm] = (rG[rm] || 0) + 1; }
        if (vIdx > -1) { var vn = String(row[vIdx] || "Unknown").trim(); if (!vG[vn]) vG[vn] = { sale: 0, count: 0 }; vG[vn].sale += sV; vG[vn].count++; }
        if (dIdx > -1) {
          var date = row[dIdx];
          if (date instanceof Date && !isNaN(date.getTime())) {
            var k = (payload.groupBy === "QUARTER") ? ("Q"+(Math.floor(date.getMonth()/3)+1)+" "+date.getFullYear()) : (ms[date.getMonth()] + " " + date.getFullYear());
            if (!tG[k]) tG[k] = { count: 0, sale: 0 };
            tG[k].count++; tG[k].sale += sV;
          }
        }
      }
      
      var sortedKeys = Object.keys(tG).sort(function(a,b) {
        var yA = parseInt(a.split(" ")[1]) || 0, yB = parseInt(b.split(" ")[1]) || 0;
        return yA !== yB ? yA - yB : ms.indexOf(a.split(" ")[0]) - ms.indexOf(b.split(" ")[0]);
      });

      return ContentService.createTextOutput(JSON.stringify({ status: "Success", totals: { rows: fetch, sale: tS, purchase: tP, qty: tQ }, series: { dates: sortedKeys, counts: sortedKeys.map(k=>tG[k].count) }, vendorTop: Object.keys(vG).map(k=>({label:k, value:vG[k].sale, rows:vG[k].count})).sort((a,b)=>b.value-a.value), remarkTop: Object.keys(rG).map(k=>({label:k, value:rG[k]})).sort((a,b)=>b.value-a.value) })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getGlobalInsights") {
      var plats = ["AMAZON", "AJIO", "MYNTRA"], gT = { sale: 0, purchase: 0, qty:0 }, comp = [], ms = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], gTrend = {}, gVendors = {};
      
      for (var p = 0; p < plats.length; p++) {
        var sh = ss.getSheetByName(plats[p]); if (!sh || sh.getLastRow() <= 1) { comp.push({ label: plats[p], sale: 0, purchase: 0, qty: 0 }); continue; }
        var hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], sI = hs.findIndex(h => String(h).toUpperCase().indexOf("SALE AMOUNT") > -1), pI = hs.findIndex(h => String(h).toUpperCase().indexOf("PURCHASE AMO") > -1), qI = hs.findIndex(h => String(h).toUpperCase().indexOf("QTY") > -1 && String(h).toUpperCase().indexOf("DIFF")===-1), dI = hs.findIndex(h => String(h).toUpperCase().indexOf("INVOICE DATE") > -1);
        var data = sh.getRange(2, 1, Math.min(2000, sh.getLastRow()-1), sh.getLastColumn()).getValues(), pS = 0, pP = 0, pQ = 0;
        for (var i = 0; i < data.length; i++) {
          var row = data[i], sV = (sI > -1) ? (parseFloat(String(row[sI]).replace(/[^0-9.-]+/g,"")) || 0) : 0;
          pS += sV;
          if (pI > -1) pP += parseFloat(String(row[pI]).replace(/[^0-9.-]+/g,"")) || 0;
          if (qI > -1) pQ += parseFloat(String(row[qI]).replace(/[^0-9.-]+/g,"")) || 0;
          if (dI > -1 && row[dI] instanceof Date) { var k = ms[row[dI].getMonth()] + " " + row[dI].getFullYear(); if(!gTrend[k]) gTrend[k] = 0; gTrend[k] += sV; }
          var vn = String(row[16] || "Unknown"); if(!gVendors[vn]) gVendors[vn] = { sale: 0, count: 0 }; gVendors[vn].sale += sV; gVendors[vn].count++;
        }
        gT.sale += pS; gT.purchase += pP; gT.qty += pQ;
        comp.push({ label: plats[p], sale: pS, purchase: pP, qty: pQ });
      }
      var sortedT = Object.keys(gTrend).sort((a,b) => (parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1])) || (ms.indexOf(a.split(" ")[0]) - ms.indexOf(b.split(" ")[0]))).slice(-6);
      return ContentService.createTextOutput(JSON.stringify({ status: "Success", totals: gT, comparison: comp, trend: { dates: sortedT, values: sortedT.map(k=>gTrend[k]) }, vendorTop: Object.keys(gVendors).map(k=>({label:k, value:gVendors[k].sale, rows:gVendors[k].count})).sort((a,b)=>b.value-a.value) })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "exportDataByDate") {
      var lockE = LockService.getScriptLock();
      try {
        lockE.waitLock(10000);
        var targetS = ss.getSheetByName(payload.sheetName || "AMAZON");
        if (!targetS) return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
        var d = targetS.getDataRange().getValues(), headers = d[0], filtered = [headers];
        var dIdx = headers.findIndex(h => String(h).toUpperCase().indexOf("INVOICE DATE") > -1);
        var st = new Date(payload.startDate), en = new Date(payload.endDate); en.setHours(23,59,59,999);
        for (var i=1; i<d.length; i++) {
          var obj = d[i][dIdx]; if (!(obj instanceof Date)) continue;
          if (obj >= st && obj <= en) {
            filtered.push(d[i].map(v => (v instanceof Date) ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), "dd-MM-yyyy") : v));
          }
        }
        var curV = parseInt(userDataSheet.getRange("L1").getValue(), 10) || 0; 
        if (curV > 0) userDataSheet.getRange("L1").setValue(curV - 1);
        return ContentService.createTextOutput(JSON.stringify({status:"Success", data:filtered})).setMimeType(ContentService.MimeType.JSON);
      } finally { lockE.releaseLock(); }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Action Not Found in Calc Script" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return ContentService.createTextOutput(JSON.stringify({ status: "Critical Error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON); }
}
