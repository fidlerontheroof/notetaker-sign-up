// One-time setup script. Run this locally (not on Vercel) to:
//   1. Walk you through Google's OAuth consent flow and get a refresh token
//   2. Create the Drive folder that will hold all the class-date docs
//
// Usage:
//   npm run setup:google
//
// Before running, make sure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and
// GOOGLE_REDIRECT_URI are set (in .env.local or your shell).
//
// After this script finishes, go share the folder yourself in Drive's
// normal Share dialog — this script does NOT share it with anyone. Use
// "Restricted" + specific people (not "Anyone with the link") for real
// access control. Note: a student can only be genuinely restricted to
// "must sign in as this exact account" if they have a Google account
// (personal Gmail or otherwise) associated with the email you share with —
// otherwise Drive may fall back to a preview link that isn't tied to
// their identity and could be passed along.

import { google } from "googleapis";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
];

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI.\n" +
        "Set these (in .env.local) before running this script — see README.md."
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n1. Open this URL in your browser and approve access:\n");
  console.log(authUrl);
  console.log(
    "\n2. After approving, Google will redirect you to your redirect URI"
  );
  console.log(
    "   with a ?code=... in the address bar. Copy just that code value.\n"
  );

  const code = await prompt("Paste the code here: ");

  const { tokens } = await oauth2Client.getToken(code.trim());
  oauth2Client.setCredentials(tokens);

  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh token was returned. This usually means you've already " +
        "authorized this app before. Go to https://myaccount.google.com/permissions, " +
        "remove access for this app, and run this script again."
    );
    process.exit(1);
  }

  console.log("\n✅ Got a refresh token. Save this in your env vars as:");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const folderName = await prompt(
    'Name for the Drive folder that will hold all class notes (e.g. "Criminal Procedure — Class Notes"): '
  );

  const folder = await drive.files.create({
    requestBody: {
      name: folderName || "Class Notes",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  const folderId = folder.data.id!;
  console.log(`\n✅ Created folder. Save this in your env vars as:`);
  console.log(`GOOGLE_DRIVE_FOLDER_ID=${folderId}\n`);

  console.log(
    "Now go to Drive, find that folder, and share it yourself:\n" +
      "  - Click Share\n" +
      "  - Add each student's email under \"specific people\" (not \"Anyone with the link\")\n" +
      "  - Set access to Viewer\n" +
      "  - Leave general access set to Restricted\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
