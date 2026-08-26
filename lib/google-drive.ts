// Posts approved notes to a Google Doc, one doc per class date, all living
// inside a single Drive folder that you share manually with your students.
//
// Requires these env vars (see scripts/setup-google-drive.ts for how to get
// them):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI       must match what you registered in Google Cloud Console
//   GOOGLE_REFRESH_TOKEN      obtained once via the setup script, lets the app
//                             act as you without you logging in every time
//   GOOGLE_DRIVE_FOLDER_ID    the single folder all class-date docs live in
//
// Strategy: each class date gets its own Google Doc, named
// "Class Notes — 2026-07-27", inside GOOGLE_DRIVE_FOLDER_ID. New approved
// notes are appended to the end of that doc.

import { google } from "googleapis";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing ${name}. Set it in your environment before posting to Google Drive.`
    );
  }
  return val;
}

export function getAuthClient() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = requireEnv("GOOGLE_REDIRECT_URI");
  const refreshToken = requireEnv("GOOGLE_REFRESH_TOKEN");

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function docTitle(classDate: string, topic: string): string {
  return `Class Notes — ${classDate}${topic ? `: ${topic}` : ""}`;
}

async function findDocByTitle(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  title: string
): Promise<string | null> {
  const escapedTitle = title.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name = '${escapedTitle}' and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
  });
  const files = res.data.files || [];
  return files.length > 0 ? files[0].id || null : null;
}

async function createDoc(
  drive: ReturnType<typeof google.drive>,
  docs: ReturnType<typeof google.docs>,
  folderId: string,
  title: string
): Promise<string> {
  const created = await docs.documents.create({
    requestBody: { title },
  });
  const documentId = created.data.documentId!;

  const file = await drive.files.get({
    fileId: documentId,
    fields: "parents",
  });
  const previousParents = (file.data.parents || []).join(",");
  await drive.files.update({
    fileId: documentId,
    addParents: folderId,
    removeParents: previousParents,
    fields: "id, parents",
  });

  return documentId;
}

async function appendText(
  docs: ReturnType<typeof google.docs>,
  documentId: string,
  text: string
): Promise<void> {
  const doc = await docs.documents.get({ documentId });
  const content = doc.data.body?.content || [];
  const lastElement = content[content.length - 1];
  const endIndex = (lastElement?.endIndex ?? 1) - 1;

  const separator = endIndex > 1 ? "\n\n---\n\n" : "";

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: Math.max(endIndex, 1) },
            text: `${separator}${text}`,
          },
        },
      ],
    },
  });
}

export async function postNoteToGoogleDrive(params: {
  classDate: string;
  topic: string;
  notesText: string;
}): Promise<string> {
  const folderId = requireEnv("GOOGLE_DRIVE_FOLDER_ID");
  const authClient = getAuthClient();
  const drive = google.drive({ version: "v3", auth: authClient });
  const docs = google.docs({ version: "v1", auth: authClient });

  const title = docTitle(params.classDate, params.topic);

  let documentId = await findDocByTitle(drive, folderId, title);
  if (!documentId) {
    documentId = await createDoc(drive, docs, folderId, title);
  }

  await appendText(docs, documentId, params.notesText);

  return `https://docs.google.com/document/d/${documentId}/edit`;
}
