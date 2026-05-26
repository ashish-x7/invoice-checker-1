/**
 * GOOGLE APPS SCRIPT PROJECT 4A: VENDOR MASTER SYNC
 * Handles vendor registry + vendor activity log in separate deployment.
 */

var VENDOR_MASTER_SHEET = "VENDOR NAME";
var VENDOR_ACTIVITY_SHEET = "VENDOR ACTIVITY";
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
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "No payload" })).setMimeType(ContentService.MimeType.JSON);
    }

    var payload = JSON.parse(e.postData.contents);
    if ((payload.action || "") !== "syncVendorBatch") {
      return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Action not found" })).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = getMasterSpreadsheet_();
    var masterSheet = ensureVendorMasterSheet_(ss);
    var activitySheet = ensureVendorActivitySheet_(ss);
    var rows = payload.data || [];
    var platform = String(payload.sheetName || "").trim().toUpperCase();
    var syncTime = parseDateTime_(payload.syncedAt) || new Date();

    var masterMap = buildLookupMap_(masterSheet, 0);
    var activityMap = buildLookupMap_(activitySheet, 0);
    var batchGroups = {};

    for (var i = 0; i < rows.length; i++) {
      var info = extractVendorInfo_(platform, rows[i], syncTime);
      if (!info.vendorKey) continue;
      if (!batchGroups[info.eventKey]) batchGroups[info.eventKey] = info;
      else mergeBatchInfo_(batchGroups[info.eventKey], info);
    }

    var newMasterRows = [];
    var masterUpdates = [];
    var activityRows = [];

    Object.keys(batchGroups).forEach(function(eventKey) {
      var info = batchGroups[eventKey];
      if (!info.vendorKey) return;

      var masterRowNo = masterMap[info.vendorKey];
      if (!masterRowNo) {
        newMasterRows.push([
          info.vendorKey,
          info.platform,
          info.vendorName,
          info.sellerCode,
          info.partyCode,
          info.seller,
          info.firstInvoiceDate || "",
          info.lastInvoiceDate || "",
          info.firstActivityAt || "",
          info.lastActivityAt || "",
          info.totalPushEvents,
          info.totalInvoiceRows,
          info.lastUser,
          "ACTIVE"
        ]);
      } else {
        masterUpdates.push({ rowNo: masterRowNo, info: info });
      }

      if (!activityMap[eventKey]) {
        activityRows.push([
          info.eventKey,
          info.vendorKey,
          info.platform,
          info.vendorName,
          info.partyCode,
          info.seller,
          info.eventAt,
          info.invoiceDate || "",
          info.user,
          info.pushEvents,
          info.invoiceRows
        ]);
      }
    });

    if (newMasterRows.length) {
      masterSheet.getRange(masterSheet.getLastRow() + 1, 1, newMasterRows.length, newMasterRows[0].length).setValues(newMasterRows);
      SpreadsheetApp.flush();
      masterMap = buildLookupMap_(masterSheet, 0);
    }

    for (var u = 0; u < masterUpdates.length; u++) {
      applyMasterUpdate_(masterSheet, masterUpdates[u].rowNo, masterUpdates[u].info);
    }

    if (activityRows.length) {
      activitySheet.getRange(activitySheet.getLastRow() + 1, 1, activityRows.length, activityRows[0].length).setValues(activityRows);
    }

    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({
      status: "Success",
      vendorsProcessed: Object.keys(batchGroups).length,
      newVendors: newMasterRows.length,
      newEvents: activityRows.length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "Critical Error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function ensureVendorMasterSheet_(ss) {
  var sheet = ss.getSheetByName(VENDOR_MASTER_SHEET) || ss.insertSheet(VENDOR_MASTER_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Vendor Key",
      "Platform",
      "Vendor Name",
      "Seller Code",
      "Party Code",
      "Seller",
      "First Invoice Date",
      "Last Invoice Date",
      "First Activity At",
      "Last Activity At",
      "Total Push Events",
      "Total Invoice Rows",
      "Last User",
      "Status"
    ]);
  }
  return sheet;
}

function ensureVendorActivitySheet_(ss) {
  var sheet = ss.getSheetByName(VENDOR_ACTIVITY_SHEET) || ss.insertSheet(VENDOR_ACTIVITY_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Event Key",
      "Vendor Key",
      "Platform",
      "Vendor Name",
      "Party Code",
      "Seller",
      "Event At",
      "Invoice Date",
      "User",
      "Push Events",
      "Invoice Rows"
    ]);
  }
  return sheet;
}

function buildLookupMap_(sheet, keyIndex) {
  var values = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][keyIndex] || "").trim();
    if (key && !map[key]) map[key] = i + 1;
  }
  return map;
}

function mergeBatchInfo_(target, source) {
  target.invoiceRows += source.invoiceRows;
  target.totalInvoiceRows += source.totalInvoiceRows;
  target.pushEvents = 1;
  target.totalPushEvents = 1;
  if (source.invoiceDate && (!target.invoiceDate || source.invoiceDate > target.invoiceDate)) target.invoiceDate = source.invoiceDate;
  if (source.lastInvoiceDate && (!target.lastInvoiceDate || source.lastInvoiceDate > target.lastInvoiceDate)) target.lastInvoiceDate = source.lastInvoiceDate;
  if (source.lastActivityAt && source.lastActivityAt > target.lastActivityAt) target.lastActivityAt = source.lastActivityAt;
}

function applyMasterUpdate_(sheet, rowNo, info) {
  var row = sheet.getRange(rowNo, 1, 1, 14).getValues()[0];
  var firstInvoice = row[6] || info.firstInvoiceDate || "";
  var lastInvoice = row[7] || "";
  var firstActivity = row[8] || info.firstActivityAt || "";
  var lastActivity = row[9] || "";
  var totalPushEvents = parseInt(row[10], 10) || 0;
  var totalInvoiceRows = parseInt(row[11], 10) || 0;

  if (!lastInvoice || (info.lastInvoiceDate && info.lastInvoiceDate > lastInvoice)) lastInvoice = info.lastInvoiceDate;
  if (!lastActivity || (info.lastActivityAt && info.lastActivityAt > lastActivity)) lastActivity = info.lastActivityAt;

  sheet.getRange(rowNo, 7, 1, 8).setValues([[
    firstInvoice,
    lastInvoice,
    firstActivity,
    lastActivity,
    totalPushEvents + info.totalPushEvents,
    totalInvoiceRows + info.totalInvoiceRows,
    info.lastUser || row[12] || "",
    "ACTIVE"
  ]]);
}

function extractVendorInfo_(platform, row, syncTime) {
  var values = Array.isArray(row) ? row : [];
  var sellerRaw = cleanString_(values[16]);
  var fallbackUser = cleanString_(values[17]) || extractUserFromRow_(values) || "User";
  var partyCode = extractPartyCode_(values);
  var invoiceDate = extractInvoiceDate_(values);
  var eventAt = extractEventTime_(values) || syncTime;
  var vendorName = sellerRaw;
  var sellerCode = "";
  var seller = sellerRaw;

  if (platform === "AMAZON") {
    sellerCode = sellerRaw;
    vendorName = sellerCode || "Unknown Amazon Vendor";
  } else {
    seller = sellerRaw || "Unknown Seller";
    vendorName = [partyCode, seller].filter(Boolean).join("-");
  }

  var vendorKey = [platform, (sellerCode || partyCode || ""), seller].join("|").replace(/\|+$/g, "");
  return {
    eventKey: [platform, vendorKey, Utilities.formatDate(new Date(eventAt), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"), fallbackUser].join("|"),
    vendorKey: vendorKey,
    platform: platform,
    vendorName: vendorName || "Unknown Vendor",
    sellerCode: sellerCode,
    partyCode: partyCode,
    seller: seller,
    user: fallbackUser,
    lastUser: fallbackUser,
    eventAt: eventAt,
    firstActivityAt: eventAt,
    lastActivityAt: eventAt,
    invoiceDate: invoiceDate,
    firstInvoiceDate: invoiceDate || "",
    lastInvoiceDate: invoiceDate || "",
    pushEvents: 1,
    totalPushEvents: 1,
    invoiceRows: 1,
    totalInvoiceRows: 1
  };
}

function extractInvoiceDate_(values) {
  var preferred = [2, 10, 5, 1];
  for (var i = 0; i < preferred.length; i++) {
    var parsed = parseDateTime_(values[preferred[i]]);
    if (parsed) return parsed;
  }
  for (var j = 0; j < values.length; j++) {
    var candidate = parseDateTime_(values[j]);
    if (candidate) return candidate;
  }
  return null;
}

function extractEventTime_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = cleanString_(values[i]);
    if (text && /\d{1,2}:\d{2}/.test(text)) {
      var parsed = parseDateTime_(text);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractUserFromRow_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = cleanString_(values[i]);
    if (!text) continue;
    var bracketMatch = text.match(/\(([^)]+)\)\s*$/);
    if (bracketMatch && bracketMatch[1]) return bracketMatch[1].trim();
    var dashParts = text.split(" - ");
    if (dashParts.length > 1) return cleanString_(dashParts[dashParts.length - 1]);
  }
  return "";
}

function extractPartyCode_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = cleanString_(values[i]);
    if (!text) continue;
    var match = text.match(/(?:AJ|MY)\d{2}S(\d{3})/i);
    if (match && match[1]) return match[1];
    if (/^\d{3,6}$/.test(text) && i <= 5) return text;
  }
  return "";
}

function parseDateTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var text = cleanString_(value);
  if (!text) return null;

  var isoDate = new Date(text);
  if (!isNaN(isoDate.getTime())) return isoDate;

  var match = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  var day = parseInt(match[1], 10);
  var month = parseInt(match[2], 10) - 1;
  var year = parseInt(match[3], 10);
  if (year < 100) year += 2000;
  var hour = parseInt(match[4] || "0", 10);
  var minute = parseInt(match[5] || "0", 10);
  var second = parseInt(match[6] || "0", 10);
  var parsed = new Date(year, month, day, hour, minute, second);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function cleanString_(value) {
  return String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
}
