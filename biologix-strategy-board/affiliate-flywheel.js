(function () {
  'use strict';

  const storageKey = 'biologix-affiliate-flywheel-decisions-v2';

  function readState() {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    } catch (error) {
      return {};
    }
  }

  function writeState(state) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // The board still works when local storage is unavailable.
    }
  }

  function setupDecisionConsole() {
    const cards = Array.from(document.querySelectorAll('[data-decision-card]'));
    const progress = document.querySelector('[data-decision-progress]');
    const reset = document.querySelector('[data-reset-decisions]');
    if (!cards.length) return;

    let state = readState();

    function render() {
      cards.forEach((card) => {
        const key = card.dataset.decisionCard;
        const selected = state[key];
        const buttons = Array.from(card.querySelectorAll('[data-decision-option]'));
        card.classList.toggle('is-locked', Boolean(selected));
        buttons.forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.decisionOption === selected));
        });
      });

      if (progress) {
        const count = cards.filter((card) => Boolean(state[card.dataset.decisionCard])).length;
        progress.textContent = `${count} / ${cards.length} decisions locked`;
      }
    }

    cards.forEach((card) => {
      card.querySelectorAll('[data-decision-option]').forEach((button) => {
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          state[card.dataset.decisionCard] = button.dataset.decisionOption;
          writeState(state);
          render();
        });
      });
    });

    if (reset) {
      reset.addEventListener('click', () => {
        state = {};
        try {
          window.localStorage.removeItem(storageKey);
        } catch (error) {
          // Ignore storage errors; the visible state still resets.
        }
        render();
      });
    }

    render();
  }

  window.addEventListener('DOMContentLoaded', setupDecisionConsole);
}());
