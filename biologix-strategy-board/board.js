(function () {
  'use strict';

  const header = document.querySelector('.site-header');

  function updateHeaderState() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 4);
  }

  function matchesFilter(record, filter) {
    if (filter === 'all') return true;
    if (filter === 'next') return record.dataset.horizon === 'next-72h';
    if (filter === 'replies') return record.dataset.track === 'replies';
    if (filter === 'silent') return record.dataset.track === 'silent';
    if (filter === 'gated') return record.dataset.status === 'gated';
    if (filter === 'done') return record.dataset.status === 'done';
    return true;
  }

  function setupFilters() {
    const filterBar = document.querySelector('[data-filter-bar]');
    if (!filterBar) return;

    const records = Array.from(document.querySelectorAll('[data-action-record]'));
    const buttons = Array.from(filterBar.querySelectorAll('[data-filter]'));
    const emptyState = document.querySelector('[data-empty-state]');
    const clearButton = document.querySelector('[data-clear-filters]');
    let activeFilter = 'all';

    function countFor(filter) {
      return records.filter((record) => matchesFilter(record, filter)).length;
    }

    function updateCounts() {
      buttons.forEach((button) => {
        const count = button.querySelector('[data-filter-count]');
        if (count) count.textContent = countFor(button.dataset.filter);
      });
    }

    function applyFilter(filter) {
      activeFilter = filter;
      let visible = 0;

      records.forEach((record) => {
        const show = matchesFilter(record, activeFilter);
        record.hidden = !show;
        if (show) visible += 1;
      });

      document.querySelectorAll('[data-record-group]').forEach((group) => {
        const groupRecords = Array.from(group.querySelectorAll('[data-action-record]'));
        group.hidden = groupRecords.length > 0 && groupRecords.every((record) => record.hidden);
      });

      buttons.forEach((button) => {
        const selected = button.dataset.filter === activeFilter;
        button.setAttribute('aria-pressed', String(selected));
      });

      if (emptyState) emptyState.hidden = visible !== 0;
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => applyFilter(button.dataset.filter));
    });

    if (clearButton) clearButton.addEventListener('click', () => applyFilter('all'));

    updateCounts();
    applyFilter(activeFilter);
  }

  function setupHashReveal() {
    if (!location.hash) return;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target && target.tagName === 'DETAILS') target.open = true;
  }

  function setupPrintExpansion() {
    let priorOpenState = [];

    window.addEventListener('beforeprint', () => {
      priorOpenState = Array.from(document.querySelectorAll('details')).map((detail) => ({
        detail,
        open: detail.open
      }));
      priorOpenState.forEach(({ detail }) => { detail.open = true; });
    });

    window.addEventListener('afterprint', () => {
      priorOpenState.forEach(({ detail, open }) => { detail.open = open; });
      priorOpenState = [];
    });
  }

  async function setupPretext() {
    const api = window.Pretext;
    if (!api || typeof api.prepare !== 'function' || typeof api.layout !== 'function') return;

    await document.fonts.ready;
    const prepared = new Map();
    const elements = Array.from(document.querySelectorAll('[data-pretext]'));

    function prepareElement(element) {
      const style = getComputedStyle(element);
      prepared.set(element, api.prepare(element.textContent.trim(), style.font));
    }

    function relayout() {
      prepared.forEach((handle, element) => {
        if (!element.isConnected || element.clientWidth === 0) return;
        const style = getComputedStyle(element);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
        const result = api.layout(handle, element.clientWidth, lineHeight);
        element.style.minHeight = `${Math.ceil(result.height)}px`;
      });
    }

    elements.forEach((element) => {
      prepareElement(element);
      if (element.contentEditable === 'true') {
        new MutationObserver(() => {
          prepareElement(element);
          relayout();
        }).observe(element, { characterData: true, childList: true, subtree: true });
      }
    });

    new ResizeObserver(relayout).observe(document.body);
    relayout();
  }

  window.addEventListener('scroll', updateHeaderState, { passive: true });
  window.addEventListener('hashchange', setupHashReveal);
  window.addEventListener('DOMContentLoaded', () => {
    updateHeaderState();
    setupFilters();
    setupHashReveal();
    setupPrintExpansion();
    setupPretext().catch((error) => console.warn('Pretext enhancement unavailable.', error));
  });
}());
