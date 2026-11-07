// server.js
const express = require('express');
const path = require('path');
const { readData, withData } = require('./store');
const mailer = require('./mailer');

function dayName(dateStr) {
  // Always derive the weekday from the date itself (UTC, to dodge
  // timezone-shift bugs) rather than trusting free-text input.
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
// Separate credential for server-to-server calls from the call-list app.
// Deliberately distinct from ADMIN_PASSWORD so the two apps can rotate
// their shared secret independently of your own admin login.
const CALL_LIST_API_KEY = process.env.CALL_LIST_API_KEY || '';

// ---------- helpers ----------

function publicView(data) {
  // Never send names/emails to the public endpoint — only counts.
  return data.classes.map((c) => ({
    date: c.date,
    day: c.day,
    capacity: c.capacity,
    filled: c.slots.length,
  }));
}

function sameEmail(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

// Any date the student holds — their own pick OR an instructor-assigned one.
function findStudentClass(data, email) {
  return data.classes.find((c) => c.slots.some((s) => sameEmail(s.email, email)));
}

// The date the student picked themselves. Slots the instructor added from
// the admin page carry `assignedByAdmin: true` and are NOT the student's own,
// so students can see them but can't switch or add to them.
function findOwnClass(data, email) {
  return data.classes.find((c) =>
    c.slots.some((s) => sameEmail(s.email, email) && !s.assignedByAdmin)
  );
}

function findAssignedClasses(data, email) {
  return data.classes.filter((c) =>
    c.slots.some((s) => sameEmail(s.email, email) && s.assignedByAdmin)
  );
}

function requireAdmin(req, res, next) {
  const supplied = req.header('x-admin-password');
  if (supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  next();
}

// ---------- public (student) routes ----------

// List all class dates with open/filled counts only — no names.
app.get('/api/classes', (req, res) => {
  const data = readData();
  res.json(publicView(data));
});

// Look up the caller's own sign-up by email. Never reveals anyone else's.
app.get('/api/my-signup', (req, res) => {
  const email = (req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email is required' });
  const data = readData();
  const anyCls = findStudentClass(data, email);
  if (!anyCls) return res.json({ signedUp: false });
  const name = anyCls.slots.find((s) => sameEmail(s.email, email)).name;
  const own = findOwnClass(data, email);
  const assigned = findAssignedClasses(data, email).map((c) => ({ date: c.date, day: c.day }));
  res.json({
    signedUp: true,
    name,
    // `date`/`day` are the student's own pick (null if they only have
    // instructor-assigned dates).
    date: own ? own.date : null,
    day: own ? own.day : null,
    assigned,
  });
});

// Sign up for a date. One active slot per student.
app.post('/api/signup', async (req, res) => {
  const { name, email, date } = req.body || {};
  if (!name || !email || !date) {
    return res.status(400).json({ error: 'name, email, and date are required' });
  }
  try {
    const result = await withData((data) => {
      const existing = findStudentClass(data, email);
      if (existing) {
        throw new Error(
          `You're already signed up for ${existing.date} (${existing.day}). Use the switch option to change dates.`
        );
      }
      const cls = data.classes.find((c) => c.date === date);
      if (!cls) throw new Error('That date was not found.');
      if (cls.slots.length >= cls.capacity) {
        throw new Error('That date just filled up — please pick another.');
      }
      cls.slots.push({ name: name.trim(), email: email.trim() });
      return { date: cls.date, day: cls.day };
    });
    res.json({ success: true, ...result });
    mailer.signupConfirmation({ to: email.trim(), name: name.trim(), date: result.date, day: result.day });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Request (or immediately perform, if room is open) a switch to another date.
app.post('/api/switch-request', async (req, res) => {
  const { email, toDate } = req.body || {};
  if (!email || !toDate) {
    return res.status(400).json({ error: 'email and toDate are required' });
  }
  try {
    const result = await withData((data) => {
      const fromCls = findOwnClass(data, email);
      if (!fromCls) {
        throw new Error(
          findStudentClass(data, email)
            ? 'Your date was assigned by the instructor — please contact them to change it.'
            : "You don't currently have a sign-up to switch from."
        );
      }
      if (fromCls.date === toDate) throw new Error("You're already signed up for that date.");

      const toCls = data.classes.find((c) => c.date === toDate);
      if (!toCls) throw new Error('That date was not found.');
      if (toCls.slots.some((s) => sameEmail(s.email, email))) {
        throw new Error("You're already assigned to that date.");
      }

      const slotIndex = fromCls.slots.findIndex(
        (s) => sameEmail(s.email, email) && !s.assignedByAdmin
      );
      const student = fromCls.slots[slotIndex];

      if (toCls.slots.length < toCls.capacity) {
        // room available now — swap immediately
        fromCls.slots.splice(slotIndex, 1);
        toCls.slots.push(student);
        return { status: 'swapped', date: toCls.date, day: toCls.day, name: student.name };
      }

      // no room — log a pending request for the instructor to resolve
      data.switchRequests.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        email: student.email,
        name: student.name,
        fromDate: fromCls.date,
        toDate: toCls.date,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      return {
        status: 'pending',
        toDate,
        toDay: toCls.day,
        fromDate: fromCls.date,
        fromDay: fromCls.day,
        name: student.name,
      };
    });
    res.json({ success: true, ...result });

    if (result.status === 'swapped') {
      mailer.switchConfirmation({ to: email.trim(), name: result.name, date: result.date, day: result.day });
    } else if (result.status === 'pending') {
      mailer.switchPending({
        to: email.trim(),
        name: result.name,
        fromDate: result.fromDate,
        fromDay: result.fromDay,
        toDate: result.toDate,
        toDay: result.toDay,
      });
      mailer.notifyAdminOfPendingRequest({
        studentName: result.name,
        studentEmail: email.trim(),
        fromDate: result.fromDate,
        toDate: result.toDate,
      });
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- admin routes (require x-admin-password header) ----------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.json({ success: true });
});

// Full roster, names included.
app.get('/api/admin/classes', requireAdmin, (req, res) => {
  const data = readData();
  res.json(data.classes);
});

app.get('/api/admin/switch-requests', requireAdmin, (req, res) => {
  const data = readData();
  res.json(data.switchRequests.filter((r) => r.status === 'pending'));
});

// Approve a pending switch request — moves the student regardless of capacity
// (admin override), then marks the request resolved.
app.post('/api/admin/switch-requests/:id/approve', requireAdmin, async (req, res) => {
  try {
    const result = await withData((data) => {
      const reqItem = data.switchRequests.find((r) => r.id === req.params.id);
      if (!reqItem || reqItem.status !== 'pending') throw new Error('Request not found or already resolved');
      const fromCls = data.classes.find((c) => c.date === reqItem.fromDate);
      const toCls = data.classes.find((c) => c.date === reqItem.toDate);
      if (fromCls) {
        const idx = fromCls.slots.findIndex(
          (s) => sameEmail(s.email, reqItem.email) && !s.assignedByAdmin
        );
        if (idx >= 0) fromCls.slots.splice(idx, 1);
      }
      if (toCls) {
        const already = toCls.slots.find((s) => sameEmail(s.email, reqItem.email));
        if (already) delete already.assignedByAdmin; // it's now their own pick
        else toCls.slots.push({ name: reqItem.name, email: reqItem.email });
      }
      reqItem.status = 'approved';
      return { ok: true, name: reqItem.name, email: reqItem.email, toDate: reqItem.toDate, toDay: toCls ? toCls.day : '' };
    });
    res.json({ ok: true });
    mailer.switchConfirmation({ to: result.email, name: result.name, date: result.toDate, day: result.toDay });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/switch-requests/:id/deny', requireAdmin, async (req, res) => {
  try {
    const result = await withData((data) => {
      const reqItem = data.switchRequests.find((r) => r.id === req.params.id);
      if (!reqItem) throw new Error('Request not found');
      reqItem.status = 'denied';
      return {
        ok: true,
        name: reqItem.name,
        email: reqItem.email,
        fromDate: reqItem.fromDate,
        toDate: reqItem.toDate,
      };
    });
    res.json({ ok: true });
    mailer.switchDenied({
      to: result.email,
      name: result.name,
      fromDate: result.fromDate,
      toDate: result.toDate,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Manually move or remove a student (admin override), e.g. to resolve conflicts.
app.post('/api/admin/move', requireAdmin, async (req, res) => {
  const { email, toDate, fromDate } = req.body || {};
  try {
    const result = await withData((data) => {
      const fromCls = fromDate
        ? data.classes.find((c) => c.date === fromDate)
        : findOwnClass(data, email) || findStudentClass(data, email);
      const toCls = data.classes.find((c) => c.date === toDate);
      if (!toCls) throw new Error('Target date not found');
      if (toCls.slots.some((s) => sameEmail(s.email, email))) {
        throw new Error('That student is already on the target date.');
      }
      let student;
      if (fromCls) {
        const idx = fromCls.slots.findIndex((s) => sameEmail(s.email, email));
        student = fromCls.slots[idx];
        fromCls.slots.splice(idx, 1);
      } else {
        student = { name: req.body.name || email, email };
      }
      toCls.slots.push(student);
      return { ok: true };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remove a student from one date. Pass `date` so a student on two dates
// (their own + an assigned one) is only removed from the one you clicked.
app.post('/api/admin/remove', requireAdmin, async (req, res) => {
  const { email, date } = req.body || {};
  try {
    const result = await withData((data) => {
      const cls = date
        ? data.classes.find((c) => c.date === date)
        : findStudentClass(data, email);
      if (!cls) throw new Error('Student not found in any slot');
      const idx = cls.slots.findIndex((s) => sameEmail(s.email, email));
      if (idx === -1) throw new Error('Student not found on that date');
      cls.slots.splice(idx, 1);
      return { ok: true };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Add a student to a date (on top of any date they already have).
// Admin override: allowed even if the date is at capacity. The slot is
// flagged `assignedByAdmin` so the student sees it but can't change it.
app.post('/api/admin/assign', requireAdmin, async (req, res) => {
  const email = (req.body?.email || '').trim();
  const date = req.body?.date;
  let name = (req.body?.name || '').trim();
  try {
    if (!email || !date) throw new Error('Email and date are required');
    const result = await withData((data) => {
      const cls = data.classes.find((c) => c.date === date);
      if (!cls) throw new Error('Date not found');
      if (cls.slots.some((s) => sameEmail(s.email, email))) {
        throw new Error('That student is already on this date.');
      }
      if (!name) {
        // reuse the name from their existing sign-up, if any
        const existing = findStudentClass(data, email);
        name = existing ? existing.slots.find((s) => sameEmail(s.email, email)).name : '';
      }
      if (!name) throw new Error("Enter the student's name (they have no existing sign-up to copy it from).");
      cls.slots.push({ name, email, assignedByAdmin: true });
      return { name, date: cls.date, day: cls.day, overCapacity: cls.slots.length > cls.capacity };
    });
    res.json({ ok: true, ...result });
    if (req.body?.notify !== false) {
      mailer.assignmentNotice({ to: email, name: result.name, date: result.date, day: result.day });
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update capacity for a given date.
app.post('/api/admin/capacity', requireAdmin, async (req, res) => {
  const { date, capacity } = req.body || {};
  try {
    const result = await withData((data) => {
      const cls = data.classes.find((c) => c.date === date);
      if (!cls) throw new Error('Date not found');
      const cap = parseInt(capacity, 10);
      if (isNaN(cap) || cap < cls.slots.length) {
        throw new Error(`Capacity can't be less than the ${cls.slots.length} student(s) already signed up.`);
      }
      cls.capacity = cap;
      return { ok: true };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Add a new class date. Weekday is always derived from the date itself.
app.post('/api/admin/dates', requireAdmin, async (req, res) => {
  const { date, capacity } = req.body || {};
  try {
    const result = await withData((data) => {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
      }
      if (data.classes.some((c) => c.date === date)) {
        throw new Error('That date is already in the sign-up');
      }
      const cap = parseInt(capacity, 10);
      data.classes.push({
        date,
        day: dayName(date),
        capacity: isNaN(cap) || cap < 1 ? 3 : cap,
        slots: [],
      });
      data.classes.sort((a, b) => a.date.localeCompare(b.date));
      return { ok: true };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remove a class date. Refuses if anyone is still signed up for it, so a
// date can't be deleted out from under a student without you noticing.
app.post('/api/admin/dates/remove', requireAdmin, async (req, res) => {
  const { date } = req.body || {};
  try {
    const result = await withData((data) => {
      const idx = data.classes.findIndex((c) => c.date === date);
      if (idx === -1) throw new Error('Date not found');
      if (data.classes[idx].slots.length > 0) {
        throw new Error(
          'Move or remove the signed-up student(s) from this date first, then delete it.'
        );
      }
      data.classes.splice(idx, 1);
      return { ok: true };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- server-to-server route (for the call-list app) ----------
// Deliberately separate from the /api/admin/* routes above: it uses its own
// shared secret (CALL_LIST_API_KEY) rather than ADMIN_PASSWORD, and exposes
// only the notetaker name(s) for a single requested date — not the full
// roster, and never anyone's email.
app.get('/api/notetaker-for-date', (req, res) => {
  const suppliedKey = req.header('x-call-list-key');
  if (!CALL_LIST_API_KEY || suppliedKey !== CALL_LIST_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const date = (req.query.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  const data = readData();
  const cls = data.classes.find((c) => c.date === date);
  const names = cls ? cls.slots.map((s) => s.name) : [];
  res.json({ date, names });
});

app.listen(PORT, () => {
  console.log(`Notetaker sign-up running on http://localhost:${PORT}`);
});
