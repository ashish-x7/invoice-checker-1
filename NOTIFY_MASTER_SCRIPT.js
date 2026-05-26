/**
 * GOOGLE APPS SCRIPT: NOTIFICATION MASTER
 * Logic for sending automated email alerts for system activities.
 * Recipient: mahapatraa665@gmail.com
 */

const ADMIN_EMAIL = "mahapatraa665@gmail.com";

/**
 * Sends a premium HTML email alert when a user logs in.
 * @param {Object} userData - Contains userId, nickName, role, and access.
 */
function sendLoginAlert_(userData) {
  if (!ADMIN_EMAIL) return;

  try {
    const now = new Date();
    const timeString = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd-MMM-yyyy | hh:mm a");

    const subject = "🔔 Security Alert: " + userData.nickName + " has logged into the Portal";

    // Modern HTML Template (No Tables)
    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 24px; letter-spacing: 0.5px;">🛡️ Invoice System Security</h2>
        </div>
        
        <div style="padding: 32px; color: #1e293b; line-height: 1.6;">
          <p style="font-size: 16px; margin-top: 0;">Hello Admin,</p>
          <p style="font-size: 15px; color: #64748b;">A successful login has been recorded. Below are the activity details for your review:</p>
          
          <div style="margin: 24px 0; border-top: 1px solid #f1f5f9; padding-top: 24px;">
            
            <div style="margin-bottom: 20px;">
              <span style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">👤 User Nickname</span>
              <span style="font-size: 18px; font-weight: 800; color: #0f172a;">${userData.nickName}</span>
            </div>
            
            <div style="margin-bottom: 20px;">
              <span style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">🆔 User Account ID</span>
              <code style="font-size: 14px; background: #f8fafc; padding: 4px 8px; border-radius: 6px; color: #475569; border: 1px solid #e2e8f0;">${userData.userId}</code>
            </div>
            
            <div style="margin-bottom: 20px;">
              <span style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">🕒 Time of Login</span>
              <span style="font-size: 15px; color: #334155;">${timeString}</span>
            </div>
            
            <div style="margin-bottom: 20px;">
              <span style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">💻 Device & Platform</span>
              <span style="font-size: 15px; color: #334155;">Windows Desktop • Chrome Extension</span>
            </div>
            
            <div style="margin-bottom: 20px;">
              <span style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">🔐 System Access</span>
              <div style="margin-top: 8px;">
                ${userData.access.AMAZON === 'YES' ? '<span style="background: #fff7ed; color: #c2410c; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-right: 6px; border: 1px solid #ffedd5;">📦 Amazon</span>' : ''}
                ${userData.access.AJIO === 'YES' ? '<span style="background: #f0f9ff; color: #0369a1; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-right: 6px; border: 1px solid #e0f2fe;">💎 Ajio</span>' : ''}
                ${userData.access.MYNTRA === 'YES' ? '<span style="background: #fdf2f8; color: #be185d; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-right: 6px; border: 1px solid #fce7f3;">👚 Myntra</span>' : ''}
              </div>
            </div>
            
            <div>
              <span style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">✅ Login Status</span>
              <span style="font-size: 14px; font-weight: 700; color: #10b981;">Authentication Successful</span>
            </div>
            
          </div>
          
          <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 16px; margin-top: 32px;">
            <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 500;">
              <strong>⚠️ Notice:</strong> If you do not recognize this activity, please log in to the Master Spreadsheet and disable this User ID immediately.
            </p>
          </div>
        </div>
        
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="margin: 0; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            Generated by Invoice Checker Auto-Notify System
          </p>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: subject,
      htmlBody: htmlBody
    });

    console.log("Login notification sent for user: " + userData.userId);
  } catch (e) {
    console.error("Failed to send login notification: " + e.toString());
  }
}
