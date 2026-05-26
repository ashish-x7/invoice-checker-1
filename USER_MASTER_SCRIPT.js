/**
 * GOOGLE APPS SCRIPT PROJECT 3: USER PERFORMANCE (PRODUCTIVITY LOGIC)
 * Handles: User-wise productivity, Invoice counts from sync logs, and Disputes.
 * This script should be deployed as a Web App (Deployment Link 3).
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
    var ss = getMasterSpreadsheet_();

    if (action === "getUserInsights") {
      var plats = ["AMAZON", "AJIO", "MYNTRA"], userStats = {}, peakHours = {};
      // Initialize peakHours for all 24 hours
      for (var hIdx = 0; hIdx < 24; hIdx++) peakHours[hIdx.toString().padStart(2, '0')] = 0;
      
      for (var p = 0; p < plats.length; p++) {
        var sh = ss.getSheetByName(plats[p]); 
        if (!sh || sh.getLastRow() <= 1) continue;
        
        var hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        // Improved: Look for "TIME" or "SYNC" or "DATA" to find the log column
        var sIdx = hs.findIndex(h => { 
          var s = String(h).toUpperCase(); 
          return s.indexOf("TIME") > -1 || s.indexOf("SYNC") > -1 || s.indexOf("DATA") > -1; 
        });
        var rIdx = hs.findIndex(h => {
          var s = normalizeHeader_(h);
          return s === "remark" || s === "remarks" || s.indexOf("status") > -1;
        });
        
        if (sIdx === -1) sIdx = 16; // Standard Column Q fallback
        
        var fetchR = Math.min(5000, sh.getLastRow() - 1);
        if (fetchR <= 0) continue;
        var data = sh.getRange(sh.getLastRow() - fetchR + 1, 1, fetchR, sh.getLastColumn()).getValues();
        
        for (var i = 0; i < data.length; i++) {
          var syncVal = String(data[i][sIdx] || "").trim(); 
          if (!syncVal || syncVal.length < 5) continue; // Ignore empty/short values

          // Peak Hours Extraction (HH from first part of string)
          var hourMatch = syncVal.match(/(\d{1,2}):\d{1,2}/);
          if (hourMatch) {
             var hr = hourMatch[1].padStart(2, '0');
             if (peakHours[hr] !== undefined) peakHours[hr]++;
          }

          var nick = ""; 
          // Extract nickname: "Date Time (Nickname)" OR "Date Time - Nickname"
          var mP = syncVal.match(/\(([^)]+)\)/); 
          if (mP) {
            nick = mP[1].trim(); 
          } else { 
            var mD = syncVal.split(" - "); 
            if(mD.length > 1) {
              nick = mD[mD.length - 1].trim(); 
            } else {
              // Try space split fallback
              var mS = syncVal.split(" ");
              if (mS.length > 2) nick = mS[mS.length - 1].trim();
            }
          }
          
          if (nick && nick.toUpperCase() !== "USER" && nick.length < 20) {
            if (!userStats[nick]) {
              userStats[nick] = { nickname: nick, totalRows: 0, disputeRows: 0, amazon: 0, ajio: 0, myntra: 0 };
            }
            userStats[nick].totalRows++;
            userStats[nick][plats[p].toLowerCase()]++;
            
            if (rIdx > -1) {
              var rText = String(data[i][rIdx] || "").trim().toUpperCase(); 
              // Dispute detection: if not OK/Clear/Match and not empty
              // Added shipment statuses to the safe list
              var safeWords = ["ALL CLEAR","OK","MATCH","BLANK","OK OK","CLEAR","DELIVERED","SHIPPED","READY TO SHIP"];
              if (rText && rText !== "" && safeWords.indexOf(rText) === -1) {
                userStats[nick].disputeRows++;
              }
            }
          }
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "Success", 
        userStats: Object.keys(userStats).map(k => userStats[k]),
        peakHours: peakHours
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Action Not Found in User Script" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { 
    return ContentService.createTextOutput(JSON.stringify({ status: "Critical Error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON); 
  }
}
