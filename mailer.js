// mailer.js
// Sends confirmation/notification emails via SMTP. Configured entirely
// through environment variables so no credentials live in code:
//
//   SMTP_HOST       e.g. smtp.gmail.com  (required to enable email)
//   SMTP_PORT       e.g. 587  (default 587)
//   SMTP_SECURE     "true" for port 465, otherwise leave unset
//   SMTP_USER       your SMTP username / email address
//   SMTP_PASS       your SMTP password or app password
//   FROM_EMAIL      "from" address shown to students (defaults to SMTP_USER)
//   APP_URL         the public URL of this app, e.g. https://notes.example.com
//                   (used to build the "check your sign-up" link in emails)
//   ADMIN_EMAIL     optional — if set, gets a heads-up when a switch
//                   request can't be auto-approved and needs your review
//
// If SMTP_HOST isn't set, sendMail() just logs and does nothing —
// so the app still works without email configured, it just won't send any.

const nodemailer = require('nodemailer');

let transporter = null;
let warnedOnce = false;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

function appUrl() {
  return (process.env.APP_URL || '').replace(/\/+$/, '');
}

// Link a student can bookmark/reopen to see their own sign-up again.
function checkLink(email) {
  const base = appUrl();
  const path = `/?email=${encodeURIComponent(email)}`;
  return base ? base + path : path; // falls back to a relative link if APP_URL isn't set
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    if (!warnedOnce) {
      console.warn('[mailer] SMTP_HOST not set — emails will not be sent (this is fine for local testing).');
      warnedOnce = true;
    }
    return { sent: false };
  }
  try {
    await t.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e) {
    console.error('[mailer] failed to send to', to, '-', e.message);
    return { sent: false, error: e.message };
  }
}

function signupConfirmation({ to, name, date, day }) {
  const link = checkLink(to);
  const subject = `Notetaker sign-up confirmed: ${date} (${day})`;
  const text =
    `Hi ${name},\n\n` +
    `You're confirmed as notetaker for ${date} (${day}).\n\n` +
    `You can check your sign-up (or request a switch) any time here:\n${link}\n\n` +
    `If you didn't sign up for this, please contact your instructor.`;
  const html =
    `<p>Hi ${escapeHtml(name)},</p>` +
    `<p>You're confirmed as notetaker for <strong>${escapeHtml(date)} (${escapeHtml(day)})</strong>.</p>` +
    `<p>You can check your sign-up (or request a switch) any time here:<br>` +
    `<a href="${link}">${link}</a></p>` +
    `<p style="color:#777;font-size:0.9em;">If you didn't sign up for this, please contact your instructor.</p>`;
  return sendMail({ to, subject, text, html });
}

function switchConfirmation({ to, name, date, day }) {
  const link = checkLink(to);
  const subject = `Notetaker date updated: ${date} (${day})`;
  const text =
    `Hi ${name},\n\n` +
    `Your notetaker sign-up has been switched to ${date} (${day}).\n\n` +
    `You can check your sign-up any time here:\n${link}`;
  const html =
    `<p>Hi ${escapeHtml(name)},</p>` +
    `<p>Your notetaker sign-up has been switched to <strong>${escapeHtml(date)} (${escapeHtml(day)})</strong>.</p>` +
    `<p>You can check your sign-up any time here:<br><a href="${link}">${link}</a></p>`;
  return sendMail({ to, subject, text, html });
}

function switchPending({ to, name, fromDate, fromDay, toDate, toDay }) {
  const link = checkLink(to);
  const subject = `Switch request received (pending approval)`;
  const text =
    `Hi ${name},\n\n` +
    `Your current date, ${fromDate} (${fromDay}), is unchanged for now — ` +
    `${toDate} (${toDay}) is currently full, so your switch request has been sent ` +
    `to your instructor for approval. You'll get another email if it's approved.\n\n` +
    `You can check your sign-up any time here:\n${link}`;
  const html =
    `<p>Hi ${escapeHtml(name)},</p>` +
    `<p>Your current date, <strong>${escapeHtml(fromDate)} (${escapeHtml(fromDay)})</strong>, is unchanged for now — ` +
    `${escapeHtml(toDate)} (${escapeHtml(toDay)}) is currently full, so your switch request has been sent ` +
    `to your instructor for approval. You'll get another email if it's approved.</p>` +
    `<p>You can check your sign-up any time here:<br><a href="${link}">${link}</a></p>`;
  return sendMail({ to, subject, text, html });
}

async function notifyAdminOfPendingRequest({ studentName, studentEmail, fromDate, toDate }) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return { sent: false };
  const link = appUrl() ? appUrl() + '/admin.html' : '/admin.html';
  return sendMail({
    to: adminEmail,
    subject: `Notetaker switch request needs review`,
    text:
      `${studentName} (${studentEmail}) asked to switch from ${fromDate} to ${toDate}, ` +
      `but ${toDate} is full. Review it here: ${link}`,
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

module.exports = {
  sendMail,
  signupConfirmation,
  switchConfirmation,
  switchPending,
  notifyAdminOfPendingRequest,
  checkLink,
};
