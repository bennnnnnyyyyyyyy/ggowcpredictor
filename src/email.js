// GGO WC 2026 — Email Notification Service (Google Apps Script)
// Sends transactional emails via MailApp (uses the deploying account's quota).
// Workspace accounts: 1,500 emails/day. Gmail: 100/day.

var ADMIN_EMAIL = "ben.arthur.wiz@gmail.com";
var FROM_NAME   = "GGO WC 2026 Predictor";
var APP_URL     = "https://bennnnnnyyyyyyyy.github.io/ggowcpredictor/index.html";

// ─── Public email actions ────────────────────────────────────────────────────

/**
 * Called when a new account request is submitted.
 * Notifies the admin that someone is waiting for approval.
 */
function emailNewRequest_(displayName, username, email, note) {
  var subject = "New account request: " + displayName + " (@" + username + ")";
  var body = [
    "A new account request has been submitted.",
    "",
    "Name:     " + displayName,
    "Username: @" + username,
    "Email:    " + email,
    note ? "Note:     " + note : "",
    "",
    "Approve or reject from the Admin panel:",
    APP_URL,
  ].filter(function(l) { return l !== undefined; }).join("\n");

  var html = buildEmailHtml(
    "New Account Request 🆕",
    "A new player wants to join GGO WC 2026.",
    [
      "<b>Name:</b> "     + escapeHtml_(displayName),
      "<b>Username:</b> @" + escapeHtml_(username),
      "<b>Email:</b> "    + escapeHtml_(email),
      note ? "<b>Note:</b> " + escapeHtml_(note) : null,
    ].filter(Boolean).join("<br>"),
    "Open Admin Panel",
    APP_URL,
    "#1a73e8"
  );

  sendEmail_({ to: ADMIN_EMAIL, subject: subject, body: body, html: html });
  return { sent: true };
}

/**
 * Called when an admin approves a request.
 * Sends the user their access code.
 */
function emailApproved_(displayName, username, userEmail, secretCode) {
  var subject = "You're in! Your GGO WC 2026 access code 🎉";
  var body = [
    "Hi " + displayName + ",",
    "",
    "Your account request for GGO WC 2026 has been approved!",
    "",
    "Your login details:",
    "  Username:    " + username,
    "  Secret Code: " + secretCode,
    "",
    "Log in here: " + APP_URL,
    "",
    "Good luck with your predictions!",
    "— GGO Admin Team",
  ].join("\n");

  var html = buildEmailHtml(
    "You're in! 🎉",
    "Hi <b>" + escapeHtml_(displayName) + "</b>, your GGO WC 2026 account is approved.",
    "Here are your login details:" +
    "<div style='background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace;font-size:15px;'>" +
    "<b>Username:</b> " + escapeHtml_(username) + "<br>" +
    "<b>Secret Code:</b> <span style='color:#1a73e8;font-size:18px;letter-spacing:2px;'>" + escapeHtml_(secretCode) + "</span>" +
    "</div>" +
    "Keep your secret code safe — it's how you log in.",
    "Start Predicting →",
    APP_URL,
    "#16a34a"
  );

  sendEmail_({ to: userEmail, subject: subject, body: body, html: html });
  return { sent: true };
}

/**
 * Called when an admin rejects a request.
 */
function emailRejected_(displayName, username, userEmail) {
  var subject = "GGO WC 2026 — Account request update";
  var body = [
    "Hi " + displayName + ",",
    "",
    "Unfortunately your account request for @" + username + " was not approved at this time.",
    "",
    "If you think this is a mistake, please contact the GGO admin team.",
    "",
    "— GGO Admin Team",
  ].join("\n");

  var html = buildEmailHtml(
    "Request Not Approved",
    "Hi <b>" + escapeHtml_(displayName) + "</b>,",
    "Unfortunately your account request for <b>@" + escapeHtml_(username) + "</b> was not approved at this time.<br><br>" +
    "If you think this is a mistake, please reach out to the GGO admin team.",
    null,
    null,
    "#dc2626"
  );

  sendEmail_({ to: userEmail, subject: subject, body: body, html: html });
  return { sent: true };
}

// ─── Core send helper ────────────────────────────────────────────────────────

function sendEmail_(opts) {
  MailApp.sendEmail({
    to:       opts.to,
    subject:  opts.subject,
    body:     opts.body,
    name:     FROM_NAME,
    htmlBody: opts.html || opts.body,
  });
}

// ─── HTML email template ─────────────────────────────────────────────────────

function buildEmailHtml(title, subtitle, bodyHtml, ctaLabel, ctaUrl, accentColor) {
  var cta = ctaLabel && ctaUrl
    ? "<div style='text-align:center;margin:24px 0;'>" +
      "<a href='" + ctaUrl + "' style='display:inline-block;padding:12px 28px;background:" + accentColor + ";" +
      "color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;'>" +
      ctaLabel + "</a></div>"
    : "";

  return [
    "<!DOCTYPE html><html><body style='margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;'>",
    "<div style='max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);'>",
    "  <div style='background:#0f172a;padding:24px 32px;text-align:center;'>",
    "    <span style='color:#fff;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.7;'>GGO · FIFA World Cup 2026</span>",
    "  </div>",
    "  <div style='padding:32px;'>",
    "    <h2 style='margin:0 0 4px;color:#0f172a;font-size:22px;'>" + title + "</h2>",
    "    <p style='margin:0 0 20px;color:#475569;font-size:15px;'>" + subtitle + "</p>",
    "    <div style='color:#1e293b;font-size:15px;line-height:1.6;'>" + bodyHtml + "</div>",
    cta,
    "  </div>",
    "  <div style='background:#f8fafc;padding:16px 32px;text-align:center;color:#94a3b8;font-size:12px;'>",
    "    Gulf Global Outsourcing · GGO WC 2026 Predictor",
    "  </div>",
    "</div>",
    "</body></html>",
  ].join("");
}

function escapeHtml_(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
