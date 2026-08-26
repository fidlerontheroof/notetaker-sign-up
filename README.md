# Class Notes Intake

Students submit notes → every submission waits in your private review queue
→ you edit if needed, then approve to post it to a Google Doc for that
class date, or reject it. No automated screening — you review everything.

Notes live in a single Google Drive folder. Sharing that folder with
students is handled manually by you in Drive's own Share dialog — the app
just creates and updates the docs.

## Network reliability note

The student submission form independently confirms a submission actually
reached the server (not just that something responded), since some school
network filters can intercept requests and return a fake success response.
If that confirmation fails, students see a distinct warning telling them to
try a different network and notify you — see `app/api/verify/route.ts` and
the `unconfirmed` state in `app/page.tsx`.

## Important: how to actually restrict access

Drive's "Restricted" sharing with specific people is only truly
unforwardable if the person signs in with a matching Google account. If a
student doesn't have one, Drive can fall back to a preview link that isn't
tied to their identity — and that fallback link can effectively be passed
along, defeating the point.

Since your students don't have school-issued Google accounts, the version
that actually works: **have each student create a free Google account using
their school email address** (anyone can register any existing email as a
Google account login — it doesn't require Gmail or your school to issue
one). Then in Drive's Share dialog, add each of those addresses under
"specific people" with Viewer access, and leave general access set to
**Restricted** (not "Anyone with the link"). That forces real sign-in to
view, which is the only mechanism Drive has that can't just be forwarded.

## What's here

- `/` — student-facing submission form
- `/review` — your private review dashboard (password protected)
- `/api/submit` — receives a submission and adds it to the review queue
- `/api/verify` — confirms a submission actually landed in storage
- `/api/review` — lists submissions awaiting review (instructor only)
- `/api/approve` — approve (with optional edits) or reject a submission
- `lib/google-drive.ts` — talks to the Google Drive & Docs APIs
- `lib/store.ts` — storage (Upstash Redis in production, in-memory for local dev)
- `scripts/setup-google-drive.ts` — one-time CLI setup (auth + folder creation)

## One-time Google Cloud setup (before running the script below)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a new project (any name, e.g. "Class Notes Intake").
2. Under **APIs & Services → Library**, enable both the **Google Drive API**
   and the **Google Docs API**.
3. Under **APIs & Services → OAuth consent screen** (or **Google Auth
   Platform**), set it up as **External** and add yourself as a test user.
4. Create an OAuth Client ID (type: Web application). Add `http://localhost`
   as an Authorized redirect URI.
5. Copy the **Client ID** and **Client Secret**.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy the env file and fill in the Google credentials**

   ```bash
   cp .env.example .env.local
   ```

3. **Run the one-time setup script**

   ```bash
   npm run setup:google
   ```

   Prints a `GOOGLE_REFRESH_TOKEN` and `GOOGLE_DRIVE_FOLDER_ID` — paste both
   into `.env.local`.

4. **Share the folder yourself in Drive** — see "Important: how to
   actually restrict access" above.

5. **Fill in `REVIEW_PASSWORD`** with a real password.

6. **Run locally**

   ```bash
   npm run dev
   ```

## Deploying to Vercel

1. Push this project to a GitHub repo, then import it in Vercel.
2. Add every environment variable from `.env.local` in the Vercel
   project's **Settings → Environment Variables**.
3. Add a **Redis integration** (Storage tab → Marketplace → Upstash Redis)
   so submissions persist between requests.
4. Deploy. Share the root URL with students and keep `/review` + your
   password to yourself.

## How posting works

Each class date gets its own Google Doc, titled by the date the student
enters — a seminar meeting multiple times a week still gets one doc per
session. The first approved note for a date creates the doc; every note
after that gets appended, separated by a divider.

## Things worth deciding as you use this

- **Roster changes**: re-share the folder in Drive whenever students
  add/drop.
- **Anonymity**: student names are stored (for accountability) while a
  submission is pending review, but never appear in the posted doc. Once
  approved and posted, the record is deleted from Redis entirely.
  Rejected submissions are kept (not deleted).
- **Stale pending items**: no auto-expiration — submissions sit there
  until you act.
- **Security**: the review password is simple by design.
