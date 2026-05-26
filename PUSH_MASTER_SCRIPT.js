/**
 * GOOGLE APPS SCRIPT PROJECT 1: MASTER PUSH & AUTH
 * Handles: Login, Register, Save Data, API Credit Updates, User Management
 * This script should be deployed as a Web App (Deployment Link 1).
 */

var PASTEL_COLORS = ["#fff5f5", "#fffaeb", "#fafff0", "#f0fffb", "#f0f8ff", "#f8f0ff", "#fff0fa"];
var MASTER_SPREADSHEET_ID = "1bv2Tk6S3BBD1EVsgGDQvWuPDYwqLWPt_oEK96x5Sc0g";
var MASTER_SPREADSHEET_URL = "";
var ADMIN_EMAIL = "mahapatraa665@gmail.com";

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

function normalizeHeader_(v) { return String(v || "").trim().toLowerCase().replace(/\s+/g, " "); }

function findHeaderRowIndex_(values) {
  var scan = Math.min(values.length, 10);
  for (var r = 0; r < scan; r++) {
    for (var c = 0; c < (values[r] ? values[r].length : 0); c++) {
      if (normalizeHeader_(values[r][c]) === "user id") return r + 1;
    }
  }
  return 1;
}

function ensureUserSheetMeta_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) {
    sheet.getRange(1, 1, 3, 10).setValues([
      ["", "USER DATA", "", "PLATEFROM", "", "", "", "", "", ""],
      ["User id", "Nick Name", "password", "AMAZON", "", "AJIO", "", "MYNTRA", "", "ROLE"],
      ["", "", "", "INVOICE", "RETURN", "INVOICE", "RETURN", "INVOICE", "RETURN", ""]
    ]);
    values = sheet.getDataRange().getValues();
  }

  var secondRow = values[1] || [];
  var thirdRow = values[2] || [];
  var hasSplitLayout = normalizeHeader_(secondRow[0]) === "user id" &&
    normalizeHeader_(secondRow[3]) === "amazon" &&
    normalizeHeader_(thirdRow[3]) === "invoice";

  if (hasSplitLayout) {
    return {
      headerRowIndex: 3,
      colUserId: 0,
      colNick: 1,
      colPassword: 2,
      colAmazonInvoice: 3,
      colAmazonReturn: 4,
      colAjioInvoice: 5,
      colAjioReturn: 6,
      colMyntraInvoice: 7,
      colMyntraReturn: 8,
      colRole: 9,
      isSplitLayout: true
    };
  }

  var hrIdx = findHeaderRowIndex_(values);
  var hr = values[hrIdx - 1] || [];
  var idx = {};
  for (var i = 0; i < hr.length; i++) {
    var k = normalizeHeader_(hr[i]);
    if (k) idx[k] = i;
  }
  if (idx["role"] === undefined) {
    sheet.getRange(hrIdx, hr.length + 1).setValue("ROLE");
    SpreadsheetApp.flush();
    values = sheet.getDataRange().getValues();
    hr = values[hrIdx - 1];
    idx = {};
    for (var j = 0; j < hr.length; j++) idx[normalizeHeader_(hr[j])] = j;
  }
  return {
    headerRowIndex: hrIdx,
    colUserId: idx["user id"] || 0,
    colNick: idx["nick name"] || 1,
    colPassword: idx["password"] || 2,
    colAmazonInvoice: idx["amazon"] || 3,
    colAmazonReturn: idx["amazon"] || 3,
    colAjioInvoice: idx["ajio"] || 4,
    colAjioReturn: idx["ajio"] || 4,
    colMyntraInvoice: idx["myntra"] || 5,
    colMyntraReturn: idx["myntra"] || 5,
    colRole: idx["role"] || 6,
    isSplitLayout: false
  };
}

function getUserRowIndex_(values, meta, userId) {
  var target = String(userId || "").trim();
  for (var i = meta.headerRowIndex; i < values.length; i++) {
    if (String(values[i][meta.colUserId]).trim() === target) return i + 1;
  }
  return -1;
}

function readPlatformAccess_(row, meta, platform) {
  var invoiceKey = "col" + platform + "Invoice";
  var returnKey = "col" + platform + "Return";
  var invoice = normalizeHeader_(row[meta[invoiceKey]]) === "ok" ? "OK" : "NO";
  var ret = normalizeHeader_(row[meta[returnKey]]) === "ok" ? "OK" : "NO";
  return {
    invoice: invoice,
    ret: ret,
    any: (invoice === "OK" || ret === "OK") ? "OK" : "NO"
  };
}

function sendLoginAlert_(userData) {
  if (!ADMIN_EMAIL) {
    return { ok: false, stage: "config", message: "ADMIN_EMAIL missing" };
  }

  try {
    var access = userData && userData.access ? userData.access : { AMAZON: "NO", AJIO: "NO", MYNTRA: "NO" };
    var now = new Date();
    var timeString = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd-MMM-yyyy | hh:mm a");
    var subject = "Security Alert: " + String(userData.nickName || userData.userId || "User") + " has logged into the Portal";

    var badgeHtml = "";
    if (["YES", "OK"].indexOf(String(access.AMAZON || "NO").toUpperCase()) > -1) badgeHtml += '<span style="background:#fff7ed;color:#c2410c;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-right:6px;border:1px solid #ffedd5;">Amazon</span>';
    if (["YES", "OK"].indexOf(String(access.AJIO || "NO").toUpperCase()) > -1) badgeHtml += '<span style="background:#f0f9ff;color:#0369a1;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-right:6px;border:1px solid #e0f2fe;">Ajio</span>';
    if (["YES", "OK"].indexOf(String(access.MYNTRA || "NO").toUpperCase()) > -1) badgeHtml += '<span style="background:#fdf2f8;color:#be185d;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-right:6px;border:1px solid #fce7f3;">Myntra</span>';
    if (!badgeHtml) badgeHtml = '<span style="color:#64748b;font-size:13px;">No platform access assigned</span>';

    var htmlBody =
      '<div style="font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;background-color:#ffffff;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">' +
        '<div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:24px;text-align:center;color:#ffffff;">' +
          '<h2 style="margin:0;font-size:24px;letter-spacing:0.5px;">Invoice System Security</h2>' +
        '</div>' +
        '<div style="padding:32px;color:#1e293b;line-height:1.6;">' +
          '<p style="font-size:16px;margin-top:0;">Hello Admin,</p>' +
          '<p style="font-size:15px;color:#64748b;">A successful login has been recorded. Below are the activity details for your review:</p>' +
          '<div style="margin:24px 0;border-top:1px solid #f1f5f9;padding-top:24px;">' +
            '<div style="margin-bottom:20px;">' +
              '<span style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">User Nickname</span>' +
              '<span style="font-size:18px;font-weight:800;color:#0f172a;">' + String(userData.nickName || "") + '</span>' +
            '</div>' +
            '<div style="margin-bottom:20px;">' +
              '<span style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">User Account ID</span>' +
              '<code style="font-size:14px;background:#f8fafc;padding:4px 8px;border-radius:6px;color:#475569;border:1px solid #e2e8f0;">' + String(userData.userId || "") + '</code>' +
            '</div>' +
            '<div style="margin-bottom:20px;">' +
              '<span style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Time of Login</span>' +
              '<span style="font-size:15px;color:#334155;">' + timeString + '</span>' +
            '</div>' +
            '<div style="margin-bottom:20px;">' +
              '<span style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">System Access</span>' +
              '<div style="margin-top:8px;">' + badgeHtml + '</div>' +
            '</div>' +
            '<div>' +
              '<span style="display:block;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Login Status</span>' +
              '<span style="font-size:14px;font-weight:700;color:#10b981;">Authentication Successful</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: subject,
      htmlBody: htmlBody
    });
    return {
      ok: true,
      stage: "sent",
      message: "Login notification email sent",
      recipient: ADMIN_EMAIL,
      timestamp: timeString
    };
  } catch (err) {
    console.error("Failed to send login notification: " + err.toString());
    return {
      ok: false,
      stage: "send",
      message: err && err.message ? err.message : String(err),
      recipient: ADMIN_EMAIL
    };
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("Error: No data").setMimeType(ContentService.MimeType.TEXT);
    var payload = JSON.parse(e.postData.contents), action = payload.action;
    var ss = getMasterSpreadsheet_(), userDataSheet = ss.getSheetByName("USER DATA");
    if (!userDataSheet) {
      userDataSheet = ss.insertSheet("USER DATA");
      userDataSheet.appendRow(["User id", "Nick Name", "password", "AMAZON", "AJIO", "MYNTRA", "ROLE"]);
    }
    var userMeta = ensureUserSheetMeta_(userDataSheet);

    // DAILY API LIMIT REFRESH
    var l1 = userDataSheet.getRange("L1"), m1 = userDataSheet.getRange("M1"), today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
    if (l1.isBlank()) l1.setValue(10000);
    var lastR = m1.getValue(), lrStr = (lastR instanceof Date) ? Utilities.formatDate(lastR, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd") : String(lastR || "");
    if (lrStr !== today) { l1.setValue(10000); m1.setValue(today); SpreadsheetApp.flush(); }

    if (action === "getAPICount") {
      var currentCount = parseInt(l1.getValue(), 10);
      if (isNaN(currentCount)) {
        l1.setValue(10000);
        SpreadsheetApp.flush();
        currentCount = 10000;
      }
      return ContentService.createTextOutput(String(currentCount)).setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === "updateAPI") {
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        var cur = parseInt(l1.getValue(), 10) || 0, dec = parseInt(payload.count, 10) || 1;
        if (cur > 0) { l1.setValue(Math.max(0, cur - dec)); SpreadsheetApp.flush(); return ContentService.createTextOutput("API Count Updated").setMimeType(ContentService.MimeType.TEXT); }
        return ContentService.createTextOutput("API Limit Reached").setMimeType(ContentService.MimeType.TEXT);
      } finally { lock.releaseLock(); }
    }

    if (action === "register") {
      var dataR = userDataSheet.getDataRange().getValues();
      var cleanUserId = String(payload.userId || "").trim();
      if (getUserRowIndex_(dataR, userMeta, cleanUserId) > -1) return ContentService.createTextOutput("User Already Exists").setMimeType(ContentService.MimeType.TEXT);
      if (userMeta.isSplitLayout) {
        userDataSheet.appendRow([cleanUserId, String(payload.nickName || "").trim(), String(payload.password || "").trim(), "NO", "NO", "NO", "NO", "NO", "NO", "USER"]);
      } else {
        userDataSheet.appendRow([cleanUserId, String(payload.nickName || "").trim(), String(payload.password || "").trim(), "NO", "NO", "NO", "USER"]);
      }
      return ContentService.createTextOutput("Registration Success").setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === "login") {
      var dataL = userDataSheet.getDataRange().getValues();
      var userIdL = String(payload.userId || "").trim();
      var passwordL = String(payload.password || "").trim();
      var foundUser = false;
      for (var i = userMeta.headerRowIndex; i < dataL.length; i++) {
        var sheetUserId = String(dataL[i][userMeta.colUserId] || "").trim();
        var sheetPassword = String(dataL[i][userMeta.colPassword] || "").trim();
        if (sheetUserId === userIdL) {
          foundUser = true;
          if (sheetPassword === passwordL) {
            var roleValue = String(dataL[i][userMeta.colRole] || "USER").trim().toUpperCase() || "USER";
            var amazonAccess = readPlatformAccess_(dataL[i], userMeta, "Amazon");
            var ajioAccess = readPlatformAccess_(dataL[i], userMeta, "Ajio");
            var myntraAccess = readPlatformAccess_(dataL[i], userMeta, "Myntra");
            var res = {
              status: "Success",
              nickName: dataL[i][userMeta.colNick],
              role: roleValue,
              access: {
                AMAZON: amazonAccess.any,
                AMAZON_INVOICE: amazonAccess.invoice,
                AMAZON_RETURN: amazonAccess.ret,
                AJIO: ajioAccess.any,
                AJIO_INVOICE: ajioAccess.invoice,
                AJIO_RETURN: ajioAccess.ret,
                MYNTRA: myntraAccess.any,
                MYNTRA_INVOICE: myntraAccess.invoice,
                MYNTRA_RETURN: myntraAccess.ret
              }
            };
            var notifyResult;
            try {
              notifyResult = sendLoginAlert_({
                userId: userIdL,
                nickName: res.nickName,
                role: roleValue,
                access: res.access
              });
            } catch (notifyErr) {
              notifyResult = {
                ok: false,
                stage: "catch",
                message: notifyErr && notifyErr.message ? notifyErr.message : String(notifyErr),
                recipient: ADMIN_EMAIL
              };
              console.error("Notification Error: " + notifyResult.message);
            }
            res.notificationDebug = notifyResult || { ok: false, stage: "unknown", message: "Notification result unavailable" };
            return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      var errMsg = foundUser ? "Invalid Password" : "User ID Not Found";
      return ContentService.createTextOutput(errMsg).setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === "forgetPassword") {
      var dataF = userDataSheet.getDataRange().getValues(), rIdx = getUserRowIndex_(dataF, userMeta, payload.userId);
      if (rIdx > -1 && String(dataF[rIdx-1][userMeta.colPassword]) === String(payload.oldPassword)) {
        userDataSheet.getRange(rIdx, userMeta.colPassword+1).setValue(payload.newPassword);
        return ContentService.createTextOutput("Password Updated Successfully").setMimeType(ContentService.MimeType.TEXT);
      }
      return ContentService.createTextOutput("Invalid Credentials").setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === "getUsers") {
      var dataU = userDataSheet.getDataRange().getValues();
      var adminRow = getUserRowIndex_(dataU, userMeta, payload.requesterUserId);
      if (adminRow < 0) {
        return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Access denied" })).setMimeType(ContentService.MimeType.JSON);
      }

      var adminPassword = String(payload.requesterPassword || "").trim();
      var sheetAdminPassword = String(dataU[adminRow - 1][userMeta.colPassword] || "").trim();
      var adminRole = String(dataU[adminRow - 1][userMeta.colRole] || "USER").trim().toUpperCase();
      if (!adminPassword || sheetAdminPassword !== adminPassword || adminRole !== "ADMIN") {
        return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "Access denied" })).setMimeType(ContentService.MimeType.JSON);
      }

      var users = [];
      for (var u = userMeta.headerRowIndex; u < dataU.length; u++) {
        var rowUserId = String(dataU[u][userMeta.colUserId] || "").trim();
        if (!rowUserId) continue;
        var amazonUserAccess = readPlatformAccess_(dataU[u], userMeta, "Amazon");
        var ajioUserAccess = readPlatformAccess_(dataU[u], userMeta, "Ajio");
        var myntraUserAccess = readPlatformAccess_(dataU[u], userMeta, "Myntra");
        users.push({
          userId: rowUserId,
          nickName: String(dataU[u][userMeta.colNick] || ""),
          password: String(dataU[u][userMeta.colPassword] || ""),
          AMAZON: amazonUserAccess.any,
          AMAZON_INVOICE: amazonUserAccess.invoice,
          AMAZON_RETURN: amazonUserAccess.ret,
          AJIO: ajioUserAccess.any,
          AJIO_INVOICE: ajioUserAccess.invoice,
          AJIO_RETURN: ajioUserAccess.ret,
          MYNTRA: myntraUserAccess.any,
          MYNTRA_INVOICE: myntraUserAccess.invoice,
          MYNTRA_RETURN: myntraUserAccess.ret,
          ROLE: String(dataU[u][userMeta.colRole] || "USER")
        });
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "Success", users: users })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "updateUsers") {
      var lockX = LockService.getScriptLock();
      try {
        lockX.waitLock(15000);
        var dataX = userDataSheet.getDataRange().getValues(), rA = getUserRowIndex_(dataX, userMeta, payload.requesterUserId);
        if (rA < 0 || String(dataX[rA-1][userMeta.colRole]).toUpperCase() !== "ADMIN") return ContentService.createTextOutput("Access Denied").setMimeType(ContentService.MimeType.TEXT);
        var updates = payload.users || [], updated = 0;
        for (var k=0; k<updates.length; k++) {
          var item = updates[k], tIdx = getUserRowIndex_(dataX, userMeta, item.userId);
          if (tIdx < 0) continue;
          if (item.userId === payload.requesterUserId && item.ROLE && item.ROLE.toUpperCase() !== "ADMIN") continue;
          if (item.nickName !== undefined) userDataSheet.getRange(tIdx, userMeta.colNick+1).setValue(item.nickName);
          if (item.password !== undefined) userDataSheet.getRange(tIdx, userMeta.colPassword+1).setValue(item.password);
          if (item.AMAZON_INVOICE !== undefined) userDataSheet.getRange(tIdx, userMeta.colAmazonInvoice+1).setValue(item.AMAZON_INVOICE);
          if (item.AMAZON_RETURN !== undefined) userDataSheet.getRange(tIdx, userMeta.colAmazonReturn+1).setValue(item.AMAZON_RETURN);
          if (item.AJIO_INVOICE !== undefined) userDataSheet.getRange(tIdx, userMeta.colAjioInvoice+1).setValue(item.AJIO_INVOICE);
          if (item.AJIO_RETURN !== undefined) userDataSheet.getRange(tIdx, userMeta.colAjioReturn+1).setValue(item.AJIO_RETURN);
          if (item.MYNTRA_INVOICE !== undefined) userDataSheet.getRange(tIdx, userMeta.colMyntraInvoice+1).setValue(item.MYNTRA_INVOICE);
          if (item.MYNTRA_RETURN !== undefined) userDataSheet.getRange(tIdx, userMeta.colMyntraReturn+1).setValue(item.MYNTRA_RETURN);
          if (item.ROLE !== undefined) userDataSheet.getRange(tIdx, userMeta.colRole+1).setValue(item.ROLE);
          updated++;
        }
        return ContentService.createTextOutput(JSON.stringify({status:"Success", updated:updated})).setMimeType(ContentService.MimeType.JSON);
      } finally { lockX.releaseLock(); }
    }

    if (action === "saveData" || !action) {
      var lockS = LockService.getScriptLock();
      try {
        lockS.waitLock(15000);
        var sName = payload.sheetName || "AJIO", rows = Array.isArray(payload) ? payload : (payload.data || []);
        if (rows.length > 0) {
          var s = ss.getSheetByName(sName) || ss.insertSheet(sName), start = s.getLastRow() + 1;
          s.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
          var nC = Math.min(17, rows[0].length), bgs = [];
          for (var r=0; r<rows.length; r++) {
            var color = PASTEL_COLORS[(start+r-2)%7], rowBg = [];
            for (var c=0; c<nC; c++) rowBg.push(color);
            bgs.push(rowBg);
          }
          if (bgs.length > 0) s.getRange(start, 1, rows.length, nC).setBackgrounds(bgs);
          var curA = parseInt(l1.getValue(), 10) || 0; l1.setValue(Math.max(0, curA - rows.length));
          SpreadsheetApp.flush();
          return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
        }
      } finally { lockS.releaseLock(); }
    }


    return ContentService.createTextOutput("Invalid Action").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) { return ContentService.createTextOutput(err.toString()).setMimeType(ContentService.MimeType.TEXT); }
}
