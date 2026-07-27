const $ = (id) => document.getElementById(id);
let adminPassword = sessionStorage.getItem('adminPassword') || '';

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

async function adminFetch(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers, {
    'x-admin-password': adminPassword,
    'Content-Type': 'application/json',
  });
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function login() {
  $('login-error').textContent = '';
  const password = $('password').value;
  try {
    await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    });
    adminPassword = password;
    sessionStorage.setItem('adminPassword', password);
    $('login-card').style.display = 'none';
    $('admin-area').style.display = 'block';
    await loadAll();
  } catch (e) {
    $('login-error').textContent = e.message;
  }
}

async function loadAll() {
  const [classes, requests] = await Promise.all([
    adminFetch('/api/admin/classes'),
    adminFetch('/api/admin/switch-requests'),
  ]);
  renderRoster(classes);
  renderRequests(requests, classes);
}

function renderRoster(classes) {
  const body = $('roster-body');
  body.innerHTML = '';
  classes.forEach((c) => {
    const names = c.slots.length
      ? c.slots.map((s) => `${s.name} (${s.email})`).join('<br/>')
      : '<span style="color:#999;">— open —</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(c.date)}</td>
      <td>${c.day}</td>
      <td>
        <input type="number" min="${c.slots.length}" value="${c.capacity}" style="width:60px;" data-date="${c.date}" class="cap-input" />
      </td>
      <td>${names}</td>
      <td>
        ${c.slots.map((s) => `<button class="small danger" data-remove="${s.email}">Remove ${s.name}</button>`).join('<br/>')}
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('.cap-input').forEach((input) => {
    input.addEventListener('change', async (e) => {
      try {
        await adminFetch('/api/admin/capacity', {
          method: 'POST',
          body: JSON.stringify({ date: e.target.dataset.date, capacity: e.target.value }),
        });
        await loadAll();
      } catch (err) {
        alert(err.message);
        await loadAll();
      }
    });
  });

  body.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this student from their slot?')) return;
      await adminFetch('/api/admin/remove', {
        method: 'POST',
        body: JSON.stringify({ email: btn.dataset.remove }),
      });
      await loadAll();
    });
  });
}

function renderRequests(requests, classes) {
  const card = $('requests-card');
  const body = $('requests-body');
  body.innerHTML = '';
  if (!requests.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  requests.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name} (${r.email})</td>
      <td>${fmtDate(r.fromDate)}</td>
      <td>${fmtDate(r.toDate)}</td>
      <td>
        <button class="small" data-approve="${r.id}">Approve</button>
        <button class="small danger" data-deny="${r.id}">Deny</button>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await adminFetch(`/api/admin/switch-requests/${btn.dataset.approve}/approve`, { method: 'POST' });
      await loadAll();
    });
  });
  body.querySelectorAll('[data-deny]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await adminFetch(`/api/admin/switch-requests/${btn.dataset.deny}/deny`, { method: 'POST' });
      await loadAll();
    });
  });
}

$('login-btn').addEventListener('click', login);
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

// auto-login if we already have a stored password from this session
if (adminPassword) {
  $('login-card').style.display = 'none';
  $('admin-area').style.display = 'block';
  loadAll().catch(() => {
    // stored password no longer valid
    sessionStorage.removeItem('adminPassword');
    adminPassword = '';
    $('login-card').style.display = 'block';
    $('admin-area').style.display = 'none';
  });
}
