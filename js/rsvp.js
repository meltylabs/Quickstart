const SUPABASE_URL = 'https://ljtugpmazxzdxpzhtlyd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqdHVncG1henh6ZHhwemh0bHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMDUxMjIsImV4cCI6MjEwMjU4MTEyMn0.tk_Jk5g4Bay0Mq5ibJG9W0AeUcW3rrSnS4brGK8AXts';

const isConfigured = () => SUPABASE_URL !== 'YOUR_SUPABASE_URL';

// ========================
// SUPABASE REST HELPERS
// ========================
async function dbGet(token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/guests?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    { headers: dbHeaders() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

async function dbUpdate(token, data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/guests?token=eq.${encodeURIComponent(token)}`,
    {
      method: 'PATCH',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function dbHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ========================
// STATE
// ========================
let guestToken = null;
let guestData = null;

// ========================
// ELEMENTS
// ========================
const el = (id) => document.getElementById(id);

function showState(state) {
  ['rsvp-loading','rsvp-no-token','rsvp-form-wrap','rsvp-success','rsvp-declined'].forEach(id => {
    const e = el(id);
    if (e) e.classList.add('hidden');
  });
  const target = el(state);
  if (target) target.classList.remove('hidden');
}

// ========================
// RADIO BUTTONS
// ========================
function initRadios() {
  document.querySelectorAll('.radio-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      document.querySelectorAll(`.radio-opt[data-group="${group}"]`).forEach(b => {
        b.classList.remove('selected');
        b.querySelector('input').checked = false;
      });
      btn.classList.add('selected');
      btn.querySelector('input').checked = true;

      if (group === 'attending') {
        const attending = btn.dataset.value === 'yes';
        el('plus-one-section').classList.toggle('hidden', !attending);
        if (!attending) el('plus-one-name-section').classList.add('hidden');
      }
      if (group === 'plus_one') {
        el('plus-one-name-section').classList.toggle('hidden', btn.dataset.value !== 'yes');
      }
    });
  });
}

function setRadio(group, value) {
  const btn = document.querySelector(`.radio-opt[data-group="${group}"][data-value="${value}"]`);
  if (btn) btn.click();
}

function getRadio(group) {
  const selected = document.querySelector(`.radio-opt[data-group="${group}"].selected`);
  return selected ? selected.dataset.value : null;
}

// ========================
// PREFILL FORM
// ========================
function prefillForm(guest) {
  const greeting = el('rsvp-greeting');
  if (greeting) {
    greeting.innerHTML = `${t('rsvp_greeting_prefix')} <span></span> 👋`;
    greeting.querySelector('span').textContent = guest.name;
  }
  if (guest.email) el('rsvp-email').value = guest.email;
  if (guest.phone) el('rsvp-phone').value = guest.phone;
  if (guest.notes) el('rsvp-notes').value = guest.notes;
  if (guest.arrival_day) el('rsvp-arrival').value = guest.arrival_day;
  if (guest.is_attending === true) setRadio('attending', 'yes');
  if (guest.is_attending === false) setRadio('attending', 'no');
  if (guest.plus_one_confirmed === true) setRadio('plus_one', 'yes');
  if (guest.plus_one_confirmed === false) setRadio('plus_one', 'no');
  if (guest.plus_one_name) el('rsvp-plus-one-name').value = guest.plus_one_name;
}

// ========================
// SUCCESS STATES
// ========================
function showSuccess(attending) {
  if (attending === false) {
    showState('rsvp-declined');
    return;
  }
  showState('rsvp-success');
  const editBtn = el('rsvp-edit-btn');
  if (editBtn) {
    editBtn.onclick = () => {
      showState('rsvp-form-wrap');
      el('rsvp-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }
}

// ========================
// INIT RSVP
// ========================
async function initRsvp() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t') || params.get('token');

  if (!token) {
    showState('rsvp-no-token');
    return;
  }

  if (!isConfigured()) {
    // Supabase not yet configured — show a friendly placeholder
    showState('rsvp-no-token');
    const noToken = el('rsvp-no-token');
    if (noToken) {
      noToken.querySelector('h3').setAttribute('data-override', 'true');
      noToken.querySelector('h3').textContent = '🔧 RSVP en construcción';
      const p = noToken.querySelector('p');
      if (p) p.textContent = 'El sistema de confirmación estará disponible muy pronto.';
    }
    return;
  }

  showState('rsvp-loading');

  try {
    guestToken = token;
    guestData = await dbGet(token);

    if (!guestData) {
      showState('rsvp-no-token');
      const noToken = el('rsvp-no-token');
      if (noToken) {
        const p = noToken.querySelector('p');
        if (p) p.textContent = t('rsvp_not_found');
      }
      return;
    }

    // If already answered, show result (with option to edit)
    if (guestData.is_attending !== null) {
      showSuccess(guestData.is_attending);
      // Still prefill form in background so editing works seamlessly
      prefillForm(guestData);
      return;
    }

    showState('rsvp-form-wrap');
    prefillForm(guestData);

  } catch (err) {
    console.error('RSVP load error:', err);
    showState('rsvp-no-token');
    const noToken = el('rsvp-no-token');
    if (noToken) {
      const p = noToken.querySelector('p');
      if (p) p.textContent = t('rsvp_error');
    }
  }
}

// ========================
// FORM SUBMIT
// ========================
function initRsvpSubmit() {
  const form = el('rsvp-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!guestToken) return;

    const submitBtn = el('rsvp-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = t('rsvp_saving');

    const attending = getRadio('attending');
    const plusOne = getRadio('plus_one');

    if (attending === null) {
      submitBtn.disabled = false;
      submitBtn.textContent = t('rsvp_submit');
      return;
    }

    const payload = {
      is_attending: attending === 'yes' ? true : attending === 'no' ? false : null,
      plus_one_confirmed: plusOne === 'yes' ? true : plusOne === 'no' ? false : null,
      plus_one_name: el('rsvp-plus-one-name').value.trim() || null,
      phone: el('rsvp-phone').value.trim() || null,
      email: el('rsvp-email').value.trim() || null,
      arrival_day: el('rsvp-arrival').value || null,
      notes: el('rsvp-notes').value.trim() || null,
    };

    try {
      await dbUpdate(guestToken, payload);
      showSuccess(payload.is_attending);
    } catch (err) {
      console.error('RSVP submit error:', err);
      submitBtn.disabled = false;
      submitBtn.textContent = t('rsvp_submit');
      alert(t('rsvp_error'));
    }
  });
}

// Called by setLang to refresh dynamic labels
function updateRsvpLang() {
  const greeting = el('rsvp-greeting');
  if (greeting && guestData) {
    greeting.innerHTML = `${t('rsvp_greeting_prefix')} <span></span> 👋`;
    greeting.querySelector('span').textContent = guestData.name;
  }
  const submitBtn = el('rsvp-submit-btn');
  if (submitBtn && !submitBtn.disabled) {
    submitBtn.textContent = t('rsvp_submit');
  }
}
