// store.js
// Tiny JSON-file "database" with a serialized write queue.
// No native modules, no external DB required — works on any host with a
// persistent filesystem (Render, Railway, Fly.io, a plain VPS, etc).
// NOTE: this will NOT persist on purely serverless/ephemeral hosts
// (e.g. Vercel serverless functions, AWS Lambda) — see README.

const fs = require('fs');
const path = require('path');

// Where data.json lives. Defaults to next to the code (fine for local dev),
// but on a host with a mounted persistent volume (e.g. Railway), set
// DATA_DIR to that volume's mount path so data survives restarts/redeploys.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Default class dates. Edit this list to match your syllabus.
// capacity = number of notetaker slots per day.
const DEFAULT_CLASSES = [
  ['2026-08-25', 'Tuesday'],
  ['2026-08-27', 'Thursday'],
  ['2026-09-01', 'Tuesday'],
  ['2026-09-08', 'Tuesday'],
  ['2026-09-10', 'Thursday'],
  ['2026-09-15', 'Tuesday'],
  ['2026-09-17', 'Thursday'],
  ['2026-09-22', 'Tuesday'],
  ['2026-09-24', 'Thursday'],
  ['2026-09-29', 'Tuesday'],
  ['2026-10-01', 'Thursday'],
  ['2026-10-06', 'Tuesday'],
  ['2026-10-08', 'Thursday'],
  ['2026-10-13', 'Tuesday'],
  ['2026-10-15', 'Thursday'],
  ['2026-10-27', 'Tuesday'],
  ['2026-10-29', 'Thursday'],
  ['2026-11-03', 'Tuesday'],
  ['2026-11-05', 'Thursday'],
  ['2026-11-10', 'Tuesday'],
  ['2026-11-12', 'Thursday'],
  ['2026-11-17', 'Tuesday'],
  ['2026-11-19', 'Thursday'],
].map(([date, day]) => ({ date, day, capacity: 3, slots: [] }));
// slots: array of { name, email } — length grows up to `capacity`

function loadDefault() {
  return {
    classes: DEFAULT_CLASSES,
    switchRequests: [], // { id, email, name, fromDate, toDate, status, createdAt }
  };
}

function readRaw() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = loadDefault();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('data.json is corrupted: ' + e.message);
  }
}

function writeRaw(data) {
  // write to a temp file then rename, to avoid partial writes on crash
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// Serialize all mutations through a single promise chain so two
// simultaneous requests can't corrupt the file or double-book a slot.
// IMPORTANT: a rejection (e.g. "you're already signed up") must not
// poison the queue for every request that comes after it — so the
// chain itself always swallows errors, while the promise handed back
// to this specific caller still carries the real rejection.
let queue = Promise.resolve();
function withData(mutator) {
  const result = queue.then(async () => {
    const data = readRaw();
    const value = await mutator(data);
    writeRaw(data);
    return value;
  });
  queue = result.catch(() => {}); // reset chain regardless of outcome
  return result; // caller still sees success or the real error
}

function readData() {
  return readRaw();
}

module.exports = { readData, withData };
