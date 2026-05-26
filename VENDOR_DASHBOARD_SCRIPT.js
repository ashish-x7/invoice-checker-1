/**
 * GOOGLE APPS SCRIPT PROJECT 4B: VENDOR DASHBOARD ANALYTICS
 * Reads vendor master + platform sheets and returns dashboard payload.
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
    if ((payload.action || "") !== "getVendorDashboard") {
      return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Action not found" })).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = getMasterSpreadsheet_();
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
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "Critical Error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

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
    if (row[8]) agg[vendorKey].lastUser = String(row[8]).trim();
    var user = String(row[8] || "").trim();
    if (user) agg[vendorKey].userCounts[user] = (agg[vendorKey].userCounts[user] || 0) + (parseInt(row[9], 10) || 1);
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
        agg[info.vendorKey] = {
          invoiceRows: 0,
          business: 0,
          lastActivityAt: "",
          lastInvoiceDate: "",
          lastUser: "",
          userCounts: {}
        };
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

function buildUserUsage_(vendors) {
  var users = {};
  for (var i = 0; i < vendors.length; i++) {
    var vendor = vendors[i];
    var userCounts = vendor.userCounts || {};
    Object.keys(userCounts).forEach(function(user) {
      if (!users[user]) users[user] = { user: user, vendors: 0, pushes: 0, invoices: 0, business: 0, topVendor: "" };
      users[user].vendors++;
      users[user].pushes += userCounts[user];
      users[user].invoices += vendor.invoiceRows || 0;
      users[user].business += vendor.business || 0;
      if (!users[user].topVendor || userCounts[user] > users[user].topVendorPushes) {
        users[user].topVendor = vendor.vendorName;
        users[user].topVendorPushes = userCounts[user];
      }
    });
  }
  return Object.keys(users).map(function(key) {
    return {
      user: users[key].user,
      vendors: users[key].vendors,
      pushes: users[key].pushes,
      invoices: users[key].invoices,
      business: users[key].business,
      topVendor: users[key].topVendor || "-"
    };
  }).sort(function(a, b) { return b.pushes - a.pushes; });
}

function pickTopUser_(userCounts) {
  var bestUser = "";
  var bestCount = -1;
  Object.keys(userCounts || {}).forEach(function(user) {
    if (userCounts[user] > bestCount) {
      bestUser = user;
      bestCount = userCounts[user];
    }
  });
  return bestUser ? { user: bestUser, pushes: bestCount } : null;
}

function dayDiff_(today, pastValue) {
  var past = pastValue instanceof Date ? pastValue : new Date(pastValue);
  if (isNaN(past.getTime())) return 999;
  var diff = today.getTime() - past.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function extractDateFromValues_(preferred, allValues) {
  for (var i = 0; i < preferred.length; i++) {
    var parsed = parseDateTime_(preferred[i]);
    if (parsed) return parsed;
  }
  for (var j = 0; j < allValues.length; j++) {
    var any = parseDateTime_(allValues[j]);
    if (any) return any;
  }
  return "";
}

function extractActivityTime_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = cleanString_(values[i]);
    if (!text || !/\d{1,2}:\d{2}/.test(text)) continue;
    var parsed = parseDateTime_(text);
    if (parsed) return parsed;
  }
  return "";
}

function extractUserFromValues_(values) {
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
  }
  return "";
}

function parseDateTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var text = cleanString_(value);
  if (!text) return null;
  var direct = new Date(text);
  if (!isNaN(direct.getTime())) return direct;

  var match = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ ,T-]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  var day = parseInt(match[1], 10);
  var month = parseInt(match[2], 10) - 1;
  var year = parseInt(match[3], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day, parseInt(match[4] || "0", 10), parseInt(match[5] || "0", 10), parseInt(match[6] || "0", 10));
}

function numberValue_(value) {
  return parseFloat(String(value || "").replace(/[^0-9.-]+/g, "")) || 0;
}

function cleanString_(value) {
  return String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
}
