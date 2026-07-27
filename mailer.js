// mailer.js
// Sends confirmation/notification emails via Resend's HTTPS API.
//
// Why not SMTP: most PaaS hosts (Railway included) block outbound SMTP
// ports (465/587) by default to prevent abuse — this has nothing to do
// with your credentials, the connection just can't leave their network.
// Resend (and similar providers like SendGrid/Postmark) send over plain
// HTTPS instead, which isn't blocked anywhere.
//
// Required env vars:
//   RESEND_API_KEY   your API key from resend.com (required to enable email)
//   FROM_EMAIL       the "from" address shown to students. Must be on a
//                     domain you've verified with Resend — see their
//                     dashboard. Defaults to Resend's shared test address
//                     (onboarding@resend.dev), which only delivers to the
//                     email you signed up to Resend with — fine for your
//                     own testing, NOT fine for real students until you
//                     verify a real domain.
//   APP_URL          the public URL of this app, e.g. https://notes.example.com
//                     (used to build the "check your sign-up" link in emails)
//   ADMIN_EMAIL      optional — if set, gets a heads-up when a switch
//                     request can't be auto-approved and needs your review
//
// If RESEND_API_KEY isn't set, sendMail() just logs and does nothing —
// so the app still works without email configured, it just won't send any.

const RESEND_API_URL = 'https://api.resend.com/emails';

let warnedOnce = false;

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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedOnce) {
      console.warn('[mailer] RESEND_API_KEY not set — emails will not be sent (this is fine for local testing).');
      warnedOnce = true;
    }
    return { sent: false };
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || 'Notetaker Sign-Up <onboarding@resend.dev>',
        to,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[mailer] Resend API error', res.status, body);
      return { sent: false, error: `Resend API returned ${res.status}` };
    }
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
