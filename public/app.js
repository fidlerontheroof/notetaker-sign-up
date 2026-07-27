let currentEmail = '';
let mySignup = null; // { date, day, name } or null
let mode = 'signup'; // 'signup' | 'switch'
let allDates = [];

const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

async function checkStatus() {
  $('lookup-error').textContent = '';
  const email = $('email').value.trim();
  if (!email) {
    $('lookup-error').textContent = 'Enter your email first.';
    return;
  }
  currentEmail = email;

  const [statusRes, classesRes] = await Promise.all([
    fetch(`/api/my-signup?email=${encodeURIComponent(email)}`),
    fetch('/api/classes'),
  ]);
  const status = await statusRes.json();
  allDates = await classesRes.json();

  mySignup = status.signedUp ? status : null;
  renderStatus();
  renderDatesList();
}

function renderStatus() {
  const area = $('status-area');
  area.innerHTML = '';
  if (mySignup) {
    const bookmarkUrl = `${window.location.origin}/?email=${encodeURIComponent(currentEmail)}`;
    const div = document.createElement('div');
    div.className = 'status-banner';
    div.innerHTML = `
      <strong>You're signed up for ${fmtDate(mySignup.date)} (${mySignup.day}).</strong>
      <div style="margin-top:10px; font-size:0.85rem; color:var(--muted);">
        Bookmark this link to check your date again anytime (it's also in your confirmation email):
      </div>
      <div style="margin-top:6px; display:flex; gap:8px;">
        <input type="text" readonly value="${bookmarkUrl}" id="bookmark-input" style="font-size:0.8rem;" />
        <button class="small secondary" id="copy-link-btn" style="margin-top:0; white-space:nowrap;">Copy</button>
      </div>
      <div style="margin-top:8px;">
        <button class="secondary small" id="switch-btn">Request a different date</button>
      </div>
    `;
    area.appendChild(div);
    $('switch-btn').addEventListener('click', () => {
      mode = 'switch';
      $('signup-card').style.display = 'block';
      renderDatesList();
    });
    $('copy-link-btn').addEventListener('click', () => {
      const input = $('bookmark-input');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        $('copy-link-btn').textContent = 'Copied!';
        setTimeout(() => { $('copy-link-btn').textContent = 'Copy'; }, 1500);
      });
    });
  }
}

function renderDatesList() {
  const card = $('signup-card');
  const list = $('dates-list');
  list.innerHTML = '';

  if (mySignup && mode === 'signup') {
    // already signed up and not actively switching — hide the picker
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  allDates.forEach((c) => {
    const isMine = mySignup && mySignup.date === c.date;
    const isFull = c.filled >= c.capacity;
    const row = document.createElement('div');
    row.className = 'date-row';
    row.innerHTML = `
      <div class="date-main">
        <span>${fmtDate(c.date)}</span>
        <span class="date-day">${c.day}</span>
      </div>
      <div>
        <span class="slot-count ${isFull ? 'full' : ''}">${c.filled}/${c.capacity} filled</span>
        <button class="small" ${isFull || isMine ? 'disabled' : ''}>${isMine ? 'Current' : isFull ? 'Full' : 'Select'}</button>
      </div>
    `;
    const btn = row.querySelector('button');
    if (!isFull && !isMine) {
      btn.addEventListener('click', () => openForm(c.date, c.day));
    }
    list.appendChild(row);
  });
}

function openForm(date, day) {
  $('chosen-date').value = date;
  $('form-error').textContent = '';
  $('form-success').textContent = '';
  const formCard = $('signup-form-card');
  formCard.style.display = 'block';
  $('form-title').textContent = mode === 'switch'
    ? `Switch to ${fmtDate(date)} (${day})`
    : `Sign up for ${fmtDate(date)} (${day})`;

  if (mode === 'switch') {
    $('name').style.display = 'none';
    $('name').previousElementSibling.style.display = 'none';
    $('submit-btn').textContent = 'Request switch';
  } else {
    $('name').style.display = 'block';
    $('name').previousElementSibling.style.display = 'block';
    $('submit-btn').textContent = 'Confirm sign-up';
  }
  formCard.scrollIntoView({ behavior: 'smooth' });
}

async function submitForm() {
  $('form-error').textContent = '';
  $('form-success').textContent = '';
  const date = $('chosen-date').value;

  try {
    if (mode === 'switch') {
      const res = await fetch('/api/switch-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, toDate: date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === 'swapped') {
        $('form-success').textContent = `Done — you're now signed up for ${fmtDate(data.date)} (${data.day}).`;
      } else {
        $('form-success').textContent = `That date is currently full. Your switch request was sent to the instructor for approval.`;
      }
      mode = 'signup';
      await checkStatus();
      $('signup-form-card').style.display = 'none';
    } else {
      const name = $('name').value.trim();
      if (!name) { $('form-error').textContent = 'Enter your name.'; return; }
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: currentEmail, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      $('form-success').textContent = `You're signed up for ${fmtDate(data.date)} (${data.day}).`;
      await checkStatus();
      $('signup-form-card').style.display = 'none';
    }
  } catch (e) {
    $('form-error').textContent = e.message;
  }
}

$('check-btn').addEventListener('click', checkStatus);
$('email').addEventListener('keydown', (e) => { if (e.key === 'Enter') checkStatus(); });
$('submit-btn').addEventListener('click', submitForm);

// If the student arrived via the "check your sign-up" link from their
// confirmation email (e.g. /?email=alice@school.edu), prefill and
// look their status up automatically so they don't have to retype it.
(function prefillFromLink() {
  const params = new URLSearchParams(window.location.search);
  const emailParam = params.get('email');
  if (emailParam) {
    $('email').value = emailParam;
    checkStatus();
  }
})();
