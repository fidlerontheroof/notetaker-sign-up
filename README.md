# Notetaker Sign-Up

A small, self-contained web app for note-taker sign-ups:

- Students see only open/filled counts per date — never other students' names
- Each student can look up **their own** sign-up by email
- Students can request a switch to another date (auto-swaps immediately if
  there's room; otherwise queues as a pending request for you to approve)
- You (the instructor) get a password-protected admin page with the full
  roster, names included, plus a queue of pending switch requests to
  approve or deny

No database server, no signup with a third party, no ads. It's plain
Node.js + a JSON file for storage, so it's cheap/free to run and easy to
inspect or modify.

## Running it locally

```bash
npm install
ADMIN_PASSWORD=pick-a-real-password node server.js
```

Then open `http://localhost:3000` (student page) and
`http://localhost:3000/admin.html` (instructor page).

## Email confirmations

Students get an automatic email when they sign up, when a switch goes
through, and when a switch request is left pending — each one includes a
personal link back to "check my sign-up," so they don't have to remember
their date. That same link is also shown directly on the student page
after they sign up, with a Copy button, in case they'd rather bookmark
it than dig through email later.

Email is **off by default** (the app still works fine without it — it just
won't send anything, and logs a note to that effect). To turn it on, set
these environment variables when you run/deploy the app:

| Variable | Required? | Example |
|---|---|---|
| `SMTP_HOST` | yes, to enable email | `smtp.gmail.com` |
| `SMTP_PORT` | no (defaults to 587) | `587` |
| `SMTP_SECURE` | no (set `"true"` only for port 465) | `true` |
| `SMTP_USER` | usually yes | `you@gmail.com` |
| `SMTP_PASS` | usually yes | an app password, not your regular password |
| `FROM_EMAIL` | no (defaults to `SMTP_USER`) | `you@gmail.com` |
| `APP_URL` | strongly recommended | `https://your-app.onrender.com` |
| `ADMIN_EMAIL` | optional | `you@gmail.com` |

Notes:
- **`APP_URL`** is what turns the "check your sign-up" link in emails
  into a real, clickable URL rather than a relative path — set it to
  wherever you actually deploy this.
- **`ADMIN_EMAIL`**, if set, sends *you* a heads-up whenever a switch
  request can't auto-approve (i.e. the target date is full) and needs
  your review in the admin panel.
- If you use **Gmail** for `SMTP_HOST`/`SMTP_USER`, you'll need an
  [App Password](https://myaccount.google.com/apppasswords) (Gmail
  blocks your normal password for this) — your regular institutional
  email provider may have a similar SMTP relay/app-password setup; check
  with your IT department if you're not sure.
- If something like Resend or SendGrid is easier for you than raw SMTP,
  say so and I can swap the mailer over — the rest of the app doesn't
  need to change.

## Editing the class dates

Open `store.js` and edit the `DEFAULT_CLASSES` array near the top — each
entry is `[date, dayName]`. Capacity defaults to 3 per date; you can also
change capacity per-date later from the admin page without touching code.

**Note:** the date list is only used to *create* `data.json` the first
time the app runs (in whichever directory `DATA_DIR` points to — see
below). Once `data.json` exists, editing `store.js` won't change
anything already created — delete `data.json` and restart if you want to
reset to a fresh list (this also wipes any existing sign-ups, so only do
this before students start signing up).

## Deploying to Railway

This app needs a **persistent volume** — `data.json` has to survive
between requests, restarts, and redeploys. Railway supports this
directly. Steps:

1. **Push this folder to a GitHub repo** (a private repo is fine —
   Railway just needs read access via GitHub).

2. **Create the project.** In Railway: **New Project → Deploy from GitHub
   repo** → pick your repo. Railway auto-detects Node.js (via its
   Railpack build system) and reads `package.json` for the start command
   (`node server.js`) — no Dockerfile needed.

3. **Add a volume.** On the project canvas, right-click (or press ⌘K /
   Ctrl+K for the Command Palette) → create a new **Volume**, attach it
   to this service, and set its **mount path** to something like `/data`.

4. **Set environment variables** on the service (Settings → Variables):

   | Variable | Value |
   |---|---|
   | `DATA_DIR` | `/data` (must match the volume's mount path from step 3) |
   | `ADMIN_PASSWORD` | pick a real password — don't skip this |
   | `APP_URL` | fill in *after* step 5, once you have your Railway domain |
   | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc. | only if you want confirmation emails — see the Email section above |

   Railway also automatically sets `PORT` for you — the app already
   reads `process.env.PORT`, so nothing to do there.

5. **Generate a public domain.** Service → Settings → Networking →
   **Generate Domain**. This gives you a URL like
   `yourapp.up.railway.app` — go back and set `APP_URL` to this (step 4),
   then redeploy so confirmation-email links point to the right place.

6. **Deploy.** Railway deploys automatically on push once connected; you
   can also trigger a manual deploy from the dashboard. Share the domain
   from step 5 with students; keep `/admin.html` on that same domain for
   yourself.

A couple of things worth double-checking once it's live:
- Sign up as a test student yourself and confirm `data.json` survives a
  manual redeploy (push a trivial commit, redeploy, check your test
  sign-up is still there) — this confirms the volume is actually wired
  up correctly before real students start using it.
- Railway's free trial credit runs out after 30 days; after that you're
  on the Hobby plan (~$5/month) for an always-on service like this one.

## Deploying elsewhere (Render, Fly.io, a VPS)

Same idea as Railway: attach persistent storage, then set `DATA_DIR` to
wherever that storage is mounted so `data.json` lands there instead of
next to the code. Each host's process for attaching a disk/volume is
different (and changes over time), so check that host's current docs —
but the app-side steps are always: create the disk, note its mount path,
set `DATA_DIR` to that path, set `ADMIN_PASSWORD` and `APP_URL`, deploy.

This app is **not** a good fit for purely serverless hosts (Vercel
serverless functions, AWS Lambda, Cloudflare Workers) — their filesystem
resets between invocations, so `data.json` (and every sign-up in it)
would vanish constantly. If you specifically want one of those, `store.js`
would need to be swapped for a real hosted database instead — ask me and
I can adapt it.

## Security notes

- The admin password is checked on every admin request via a header —
  it's simple by design for a small class tool, but it does mean anyone
  who has the password can see/edit everything. Don't reuse a password
  you use elsewhere, and only share it if you add a co-admin.
- Always deploy behind HTTPS (every host listed above provides this by
  default) so the admin password isn't sent in plaintext over the network.
- There's no email verification — a student could technically type in
  someone else's email. If that's a concern, consider adding a check
  against your actual class roster (I can add an allow-list of valid
  student emails if you want).

## What's not included (yet)

- CSV export of the roster for your own records
- Reminder emails before each date
- Verification that a signed-up email actually belongs to an enrolled
  student (see the security note above)

Let me know if you want any of these added.
