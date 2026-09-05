// ========================
// RENDER AGENDA
// ========================
function renderAgenda() {
  const container = document.getElementById('agenda-grid');
  if (!container) return;

  const lang = currentLang;
  const dayNames = t('day_names');
  const monthName = t('month_name');

  container.innerHTML = AGENDA.map(day => {
    const dayName = dayNames[day.dayIndex];
    const location = lang === 'es' ? day.locationEs : day.locationEn;
    const sublocation = lang === 'es' ? day.sublocationEs : day.sublocationEn;

    const eventsHtml = day.events.map(ev => {
      const title = lang === 'es' ? ev.titleEs : ev.titleEn;
      const desc = lang === 'es' ? (ev.descEs || null) : (ev.descEn || null);

      if (ev.type === 'wedding') {
        return `<div class="wedding-highlight">✨ ${title} ✨</div>`;
      }

      const badge = ev.type === 'suggested'
        ? `<span class="event-badge badge-suggested">${t('badge_suggested')}</span>`
        : ev.type === 'optional'
        ? `<span class="event-badge badge-optional">${t('badge_optional')}</span>`
        : '';

      return `
        <div class="event-row">
          <span class="event-icon">${ev.icon}</span>
          <div class="event-body">
            <div class="event-title">${title}</div>
            ${desc ? `<div class="event-desc">${desc}</div>` : ''}
            ${ev.linkUrl ? `<a href="${ev.linkUrl}" target="_blank" rel="noopener noreferrer" class="event-link">${ev.linkLabel}</a>` : ''}
          </div>
          ${badge}
        </div>`;
    }).join('');

    return `
      <div class="day-card${day.isWeddingDay ? ' day-card-wedding' : ''}">
        <div class="day-card-header">
          <div class="day-date">
            <span class="day-name">${dayName}</span>
            <span class="day-num">${day.dateNum}</span>
            <span class="day-month">${monthName}</span>
          </div>
          <div class="day-location">
            ${location}
            ${sublocation ? `<small>${sublocation}</small>` : ''}
          </div>
        </div>
        <div class="day-events">${eventsHtml}</div>
      </div>`;
  }).join('');
}

// ========================
// RENDER FAQ
// ========================
function renderFaq() {
  const container = document.getElementById('faq-list');
  if (!container) return;

  const faqs = t('faqs');
  container.innerHTML = faqs.map(faq => `
    <div class="faq-item">
      <button class="faq-q" type="button" aria-expanded="false">
        <span>${faq.q}</span>
        <span class="faq-icon" aria-hidden="true">+</span>
      </button>
      <div class="faq-a" role="region">
        <p>${faq.a}</p>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      container.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
      btn.setAttribute('aria-expanded', !wasOpen);
    });
  });
}

// ========================
// INFO TABS
// ========================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`tab-${target}`);
      if (panel) panel.classList.add('active');
    });
  });
}

// ========================
// NAV
// ========================
function initNav() {
  const nav = document.getElementById('nav');
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.style.transform = (y > lastY && y > 120) ? 'translateY(-100%)' : 'translateY(0)';
    lastY = y;
  }, { passive: true });

  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  menuToggle && menuToggle.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
  });
  document.querySelectorAll('.mobile-menu a').forEach(a => {
    a.addEventListener('click', () => mobileMenu.classList.add('hidden'));
  });
}

// ========================
// LANG TOGGLE
// ========================
function initLangToggle() {
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    setLang(currentLang === 'es' ? 'en' : 'es');
  });
}

// ========================
// INIT
// ========================
document.addEventListener('DOMContentLoaded', () => {
  initLang();
  renderAgenda();
  renderFaq();
  initTabs();
  initNav();
  initLangToggle();
  initRadios();
  initRsvp();
  initRsvpSubmit();
});
