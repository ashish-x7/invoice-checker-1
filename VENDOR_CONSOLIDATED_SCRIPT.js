/**
 * GOOGLE APPS SCRIPT: VENDOR CONSOLIDATED MASTER & ANALYTICS
 * Handles both:
 * 1. syncVendorBatch (From Background Sync)
 * 2. getVendorDashboard (From Analytics Hub)
 * 
 * Deployment: Use the Dashboard Link provided (8I62B).
 */

var VENDOR_MASTER_SHEET = "VENDOR NAME";
var VENDOR_ACTIVITY_SHEET = "VENDOR ACTIVITY";
var VENDOR_PLATFORMS = ["AMAZON", "AJIO", "MYNTRA"];
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
    var action = payload.action || "";
    var ss = getMasterSpreadsheet_();

    // --- ROUTING ---
    if (action === "getVendorDashboard") {
      return handleVendorDashboard_(ss, payload);
    } else if (action === "syncVendorBatch") {
      return handleVendorSync_(ss, payload);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Action not found: " + action })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "Critical Error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * HANDLER: getVendorDashboard
 * Reads vendor master + platform sheets and returns dashboard payload.
 */
function handleVendorDashboard_(ss, payload) {
  var selectedPlatform = String(payload.platform || "GLOBAL").trim().toUpperCase();
  var platforms = selectedPlatform === "GLOBAL" ? VENDOR_PLATFORMS : [selectedPlatform];
  var maxRows = parseInt(payload.maxRows, 10) || 5000;

  var masterMap = loadVendorMasterMap_(ss, selectedPlatform);
  var activityAgg = loadVendorActivityAgg_(ss, selectedPlatform);
  var rowAgg = loadVendorRowAgg_(ss, platforms, maxRows);
  var today = new Date();
  var vendorList = [];
  var statusCounts = { active: 0, orange: 0, red: 0 };
  var summary = { vendors: 0, invoiceRows: 0, pushEvents: 0, business: 0 };

  Object.keys(masterMap).forEach(function(vendorKey) {
    var base = masterMap[vendorKey];
    var activity = activityAgg[vendorKey] || {};
    var rows = rowAgg[vendorKey] || {};
    var lastSeen = rows.lastActivityAt || activity.lastActivityAt || base.lastActivityAt || base.lastInvoiceDate || "";
    var daysIdle = lastSeen ? dayDiff_(today, lastSeen) : 999;
    var status = daysIdle >= 5 ? "RED" : (daysIdle >= 2 ? "ORANGE" : "ACTIVE");

    var record = {
      vendorKey: vendorKey,
      platform: base.platform,
      vendorName: base.vendorName,
      seller: base.seller,
      partyCode: base.partyCode,
      lastUser: rows.lastUser || activity.lastUser || base.lastUser || "",
      lastInvoiceDate: rows.lastInvoiceDate || base.lastInvoiceDate || "",
      lastActivityAt: lastSeen || "",
      daysIdle: daysIdle,
      status: status,
      invoiceRows: rows.invoiceRows || 0,
      pushEvents: activity.pushEvents || 0,
      business: rows.business || 0,
      topUser: pickTopUser_(activity.userCounts || rows.userCounts || {}),
      userCounts: activity.userCounts || rows.userCounts || {}
    };

    vendorList.push(record);
    summary.vendors++;
    summary.invoiceRows += record.invoiceRows;
    summary.pushEvents += record.pushEvents;
    summary.business += record.business;
    if (status === "RED") statusCounts.red++;
    else if (status === "ORANGE") statusCounts.orange++;
    else statusCounts.active++;
  });

  vendorList.sort(function(a, b) {
    if ((b.business || 0) !== (a.business || 0)) return (b.business || 0) - (a.business || 0);
    return (b.invoiceRows || 0) - (a.invoiceRows || 0);
  });

  var staleVendors = vendorList.filter(function(v) { return v.status !== "ACTIVE"; }).sort(function(a, b) { return b.daysIdle - a.daysIdle; }).slice(0, 12);
  var userUsage = buildUserUsage_(vendorList);

  return ContentService.createTextOutput(JSON.stringify({
    status: "Success",
    platform: selectedPlatform,
    summary: summary,
    statusCounts: statusCounts,
    vendors: vendorList.slice(0, 100),
    staleVendors: staleVendors,
    topBusinessVendors: vendorList.slice(0, 10).map(function(v) {
      return { label: v.vendorName, value: v.business, rows: v.invoiceRows, pushes: v.pushEvents };
    }),
    userUsage: userUsage.slice(0, 12)
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * HANDLER: syncVendorBatch
 * Updates vendor master registry and logs sync activity.
 */
function handleVendorSync_(ss, payload) {
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
}

// --- HELPER FUNCTIONS ---

function loadVendorMasterMap_(ss, selectedPlatform) {
  var sheet = ss.getSheetByName(VENDOR_MASTER_SHEET);
  var map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var platform = String(row[1] || "").trim().toUpperCase();
    if (selectedPlatform !== "GLOBAL" && platform !== selectedPlatform) continue;
    var vendorKey = String(row[0] || "").trim();
    if (!vendorKey) continue;
    map[vendorKey] = {
      platform: platform,
      vendorName: String(row[2] || "").trim(),
      partyCode: String(row[4] || "").trim(),
      seller: String(row[5] || "").trim(),
      lastInvoiceDate: row[7] || "",
      lastActivityAt: row[9] || "",
      lastUser: String(row[12] || "").trim()
    };
  }
  return map;
}

function loadVendorActivityAgg_(ss, selectedPlatform) {
  var sheet = ss.getSheetByName(VENDOR_ACTIVITY_SHEET);
  var agg = {};
  if (!sheet || sheet.getLastRow() <= 1) return agg;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var platform = String(row[2] || "").trim().toUpperCase();
    if (selectedPlatform !== "GLOBAL" && platform !== selectedPlatform) continue;
    var vendorKey = String(row[1] || "").trim();
    if (!vendorKey) continue;
    if (!agg[vendorKey]) agg[vendorKey] = { pushEvents: 0, lastActivityAt: "", lastUser: "", userCounts: {} };
    agg[vendorKey].pushEvents += parseInt(row[9], 10) || 1;
    if (!agg[vendorKey].lastActivityAt || row[6] > agg[vendorKey].lastActivityAt) agg[vendorKey].lastActivityAt = row[6];
    var user = String(row[8] || "").trim();
    if (user) {
      agg[vendorKey].lastUser = user;
      agg[vendorKey].userCounts[user] = (agg[vendorKey].userCounts[user] || 0) + (parseInt(row[9], 10) || 1);
    }
  }
  return agg;
}

function loadVendorRowAgg_(ss, platforms, maxRows) {
  var agg = {};
  for (var p = 0; p < platforms.length; p++) {
    var platform = platforms[p];
    var sheet = ss.getSheetByName(platform);
    if (!sheet || sheet.getLastRow() <= 1) continue;
    var lastRow = sheet.getLastRow();
    var fetchRows = Math.min(maxRows, lastRow - 1);
    var data = sheet.getRange(lastRow - fetchRows + 1, 1, fetchRows, sheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var info = extractVendorRowInfo_(platform, data[i]);
      if (!info.vendorKey) continue;
      if (!agg[info.vendorKey]) {
        agg[info.vendorKey] = { invoiceRows: 0, business: 0, lastActivityAt: "", lastInvoiceDate: "", lastUser: "", userCounts: {} };
      }
      agg[info.vendorKey].invoiceRows++;
      agg[info.vendorKey].business += info.saleAmount;
      if (info.lastActivityAt && (!agg[info.vendorKey].lastActivityAt || info.lastActivityAt > agg[info.vendorKey].lastActivityAt)) agg[info.vendorKey].lastActivityAt = info.lastActivityAt;
      if (info.invoiceDate && (!agg[info.vendorKey].lastInvoiceDate || info.invoiceDate > agg[info.vendorKey].lastInvoiceDate)) agg[info.vendorKey].lastInvoiceDate = info.invoiceDate;
      if (info.user) {
        agg[info.vendorKey].lastUser = info.user;
        agg[info.vendorKey].userCounts[info.user] = (agg[info.vendorKey].userCounts[info.user] || 0) + 1;
      }
    }
  }
  return agg;
}

function extractVendorRowInfo_(platform, row) {
  var values = Array.isArray(row) ? row : [];
  var sellerRaw = cleanString_(values[16]);
  var seller = sellerRaw;
  var partyCode = platform === "AMAZON" ? "" : extractPartyCode_(values);
  var vendorName = platform === "AMAZON" ? sellerRaw : [partyCode, sellerRaw].filter(Boolean).join("-");
  var vendorKey = [platform, (platform === "AMAZON" ? sellerRaw : partyCode), sellerRaw].join("|").replace(/\|+$/g, "");
  return {
    vendorKey: vendorKey,
    vendorName: vendorName || "Unknown Vendor",
    saleAmount: numberValue_(values[5]),
    invoiceDate: extractDateFromValues_([values[2], values[10], values[5], values[1]], values),
    lastActivityAt: extractActivityTime_(values),
    user: cleanString_(values[17]) || extractUserFromValues_(values)
  };
}

function ensureVendorMasterSheet_(ss) {
  var sheet = ss.getSheetByName(VENDOR_MASTER_SHEET) || ss.insertSheet(VENDOR_MASTER_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Vendor Key", "Platform", "Vendor Name", "Seller Code", "Party Code", "Seller", "First Invoice Date", "Last Invoice Date", "First Activity At", "Last Activity At", "Total Push Events", "Total Invoice Rows", "Last User", "Status"]);
  }
  return sheet;
}

function ensureVendorActivitySheet_(ss) {
  var sheet = ss.getSheetByName(VENDOR_ACTIVITY_SHEET) || ss.insertSheet(VENDOR_ACTIVITY_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Event Key", "Vendor Key", "Platform", "Vendor Name", "Party Code", "Seller", "Event At", "Invoice Date", "User", "Push Events", "Invoice Rows"]);
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
  sheet.getRange(rowNo, 7, 1, 8).setValues([[firstInvoice, lastInvoice, firstActivity, lastActivity, totalPushEvents + info.totalPushEvents, totalInvoiceRows + info.totalInvoiceRows, info.lastUser || row[12] || "", "ACTIVE"]]);
}

function extractVendorInfo_(platform, row, syncTime) {
  var values = Array.isArray(row) ? row : [];
  var sellerRaw = cleanString_(values[16]);
  var fallbackUser = cleanString_(values[17]) || extractUserFromValues_(values) || "User";
  var partyCode = extractPartyCode_(values);
  var invoiceDate = extractInvoiceDate_(values);
  var eventAt = extractActivityTime_(values) || syncTime;
  var vendorName = sellerRaw;
  var sellerCode = (platform === "AMAZON") ? sellerRaw : "";
  var seller = sellerRaw || (platform === "AMAZON" ? "" : "Unknown Seller");
  if (platform !== "AMAZON") vendorName = [partyCode, seller].filter(Boolean).join("-");
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

function mergeBatchInfo_(target, source) {
  target.invoiceRows += source.invoiceRows;
  target.totalInvoiceRows += source.totalInvoiceRows;
  if (source.invoiceDate && (!target.invoiceDate || source.invoiceDate > target.invoiceDate)) target.invoiceDate = source.invoiceDate;
  if (source.lastInvoiceDate && (!target.lastInvoiceDate || source.lastInvoiceDate > target.lastInvoiceDate)) target.lastInvoiceDate = source.lastInvoiceDate;
  if (source.lastActivityAt && source.lastActivityAt > target.lastActivityAt) target.lastActivityAt = source.lastActivityAt;
}

function buildUserUsage_(vendors) {
  var users = {};
  for (var i = 0; i < vendors.length; i++) {
    var v = vendors[i];
    var uCounts = v.userCounts || {};
    Object.keys(uCounts).forEach(function(u) {
      if (!users[u]) users[u] = { user: u, vendors: 0, pushes: 0, invoices: 0, business: 0, topVendor: "", topVendorPushes: -1 };
      users[u].vendors++;
      users[u].pushes += uCounts[u];
      users[u].invoices += v.invoiceRows || 0;
      users[u].business += v.business || 0;
      if (uCounts[u] > users[u].topVendorPushes) {
        users[u].topVendor = v.vendorName;
        users[u].topVendorPushes = uCounts[u];
      }
    });
  }
  return Object.keys(users).map(function(k) { return users[k]; }).sort(function(a, b) { return b.pushes - a.pushes; });
}

function pickTopUser_(userCounts) {
  var bestUser = "";
  var bestCount = -1;
  Object.keys(userCounts || {}).forEach(function(u) {
    if (userCounts[u] > bestCount) { bestUser = u; bestCount = userCounts[u]; }
  });
  return bestUser ? { user: bestUser, pushes: bestCount } : null;
}

function dayDiff_(today, pastValue) {
  var past = pastValue instanceof Date ? pastValue : new Date(pastValue);
  if (isNaN(past.getTime())) return 999;
  return Math.floor((today.getTime() - past.getTime()) / (24 * 60 * 60 * 1000));
}

function extractDateFromValues_(preferred, allValues) {
  for (var i = 0; i < preferred.length; i++) {
    var p = parseDateTime_(preferred[i]);
    if (p) return p;
  }
  for (var j = 0; j < allValues.length; j++) {
    var a = parseDateTime_(allValues[j]);
    if (a) return a;
  }
  return "";
}

function extractInvoiceDate_(values) {
  var pref = [2, 10, 5, 1];
  for (var i = 0; i < pref.length; i++) {
    var p = parseDateTime_(values[pref[i]]);
    if (p) return p;
  }
  return null;
}

function extractActivityTime_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = cleanString_(values[i]);
    if (text && /\d{1,2}:\d{2}/.test(text)) {
      var p = parseDateTime_(text);
      if (p) return p;
    }
  }
  return null;
}

function extractUserFromValues_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = cleanString_(values[i]);
    if (!text) continue;
    var bMatch = text.match(/\(([^)]+)\)\s*$/);
    if (bMatch && bMatch[1]) return bMatch[1].trim();
    var dParts = text.split(" - ");
    if (dParts.length > 1) return cleanString_(dParts[dParts.length - 1]);
  }
  return "";
}

function extractPartyCode_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = cleanString_(values[i]);
    if (!text) continue;
    var m = text.match(/(?:AJ|MY)\d{2}S(\d{3})/i);
    if (m && m[1]) return m[1];
    if (/^\d{3,6}$/.test(text) && i <= 5) return text;
  }
  return "";
}

function parseDateTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var text = cleanString_(value);
  if (!text) return null;
  var iso = new Date(text);
  if (!isNaN(iso.getTime())) return iso;
  var m = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  var day = parseInt(m[1], 10), month = parseInt(m[2], 10) - 1, year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  var date = new Date(year, month, day, parseInt(m[4] || "0", 10), parseInt(m[5] || "0", 10), parseInt(m[6] || "0", 10));
  return isNaN(date.getTime()) ? null : date;
}

function numberValue_(value) {
  return parseFloat(String(value || "").replace(/[^0-9.-]+/g, "")) || 0;
}

function cleanString_(value) {
  return String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
}
