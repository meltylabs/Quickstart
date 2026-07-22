(() => {
  "use strict";

  const slides = [...document.querySelectorAll(".slide")];
  const stage = document.querySelector(".stage");
  const progress = document.querySelector(".progress-bar");
  const currentLabel = document.querySelector("[data-current-slide]");
  const totalLabel = document.querySelector("[data-total-slides]");
  const notesPanel = document.querySelector(".speaker-notes");
  const notesBody = document.querySelector("[data-notes-body]");
  const overview = document.querySelector(".overview-panel");
  const overviewGrid = document.querySelector(".overview-grid");
  const blank = document.querySelector(".blank-screen");
  const curtain = document.querySelector(".loading-curtain");

  let current = 0;
  let previous = -1;
  let transitionTimer;
  let touchStartX = 0;
  let touchStartY = 0;

  const pad = (value) => String(value).padStart(2, "0");
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function fromHash() {
    const requested = Number.parseInt(window.location.hash.slice(1), 10);
    return Number.isFinite(requested) ? clamp(requested - 1, 0, slides.length - 1) : 0;
  }

  function updateNotes() {
    const source = slides[current]?.querySelector(".notes");
    if (notesBody) notesBody.innerHTML = source?.innerHTML || "<p>No notes for this slide.</p>";
  }

  function updateOverview() {
    overviewGrid?.querySelectorAll(".overview-card").forEach((card, index) => {
      card.setAttribute("aria-current", index === current ? "true" : "false");
    });
  }

  function updateChrome() {
    const active = slides[current];
    document.body.classList.toggle("is-light-slide", active?.classList.contains("light"));
    if (currentLabel) currentLabel.textContent = pad(current + 1);
    if (progress) progress.style.width = `${((current + 1) / slides.length) * 100}%`;
    document.title = `${active?.dataset.title || "Presentation"} · OVO Labs`;
  }

  function goTo(index, { replaceHash = false } = {}) {
    const next = clamp(index, 0, slides.length - 1);
    window.clearTimeout(transitionTimer);
    previous = current;
    current = next;

    slides.forEach((slide, slideIndex) => {
      slide.classList.remove("is-active", "was-active");
      slide.setAttribute("aria-hidden", slideIndex === current ? "false" : "true");
      if (slideIndex === current) slide.scrollTop = 0;
    });

    if (previous !== current && slides[previous]) slides[previous].classList.add("was-active");
    slides[current]?.classList.add("is-active");
    transitionTimer = window.setTimeout(() => {
      slides.forEach((slide, indexToClear) => {
        if (indexToClear !== current) slide.classList.remove("was-active");
      });
    }, 740);

    const nextHash = `#${current + 1}`;
    if (window.location.hash !== nextHash) {
      window.history[replaceHash ? "replaceState" : "pushState"](null, "", nextHash);
    }

    updateChrome();
    updateNotes();
    updateOverview();
  }

  function togglePanel(panel) {
    if (!panel) return;
    const shouldOpen = !panel.classList.contains("is-open");
    [notesPanel, overview].forEach((item) => item?.classList.remove("is-open"));
    panel.classList.toggle("is-open", shouldOpen);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) {
      // Fullscreen can be blocked in embedded browsers; the deck remains usable.
    }
  }

  function action(name) {
    const actions = {
      previous: () => goTo(current - 1),
      next: () => goTo(current + 1),
      notes: () => togglePanel(notesPanel),
      overview: () => togglePanel(overview),
      fullscreen: toggleFullscreen,
    };
    actions[name]?.();
  }

  function buildOverview() {
    if (!overviewGrid) return;
    const fragment = document.createDocumentFragment();
    slides.forEach((slide, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "overview-card";
      button.innerHTML = `<span>${pad(index + 1)} · ${slide.dataset.section || "Deck"}</span><strong>${slide.dataset.title || `Slide ${index + 1}`}</strong>`;
      button.addEventListener("click", () => {
        goTo(index);
        overview.classList.remove("is-open");
      });
      fragment.appendChild(button);
    });
    overviewGrid.replaceChildren(fragment);
  }

  function handleKey(event) {
    const key = event.key.toLowerCase();
    if (blank?.classList.contains("is-open")) {
      if (key === "b" || key === "escape") blank.classList.remove("is-open");
      return;
    }
    if (key === "escape") {
      notesPanel?.classList.remove("is-open");
      overview?.classList.remove("is-open");
    } else if (["arrowright", "arrowdown", "pagedown", " "].includes(key)) {
      event.preventDefault();
      goTo(current + 1);
    } else if (["arrowleft", "arrowup", "pageup"].includes(key)) {
      event.preventDefault();
      goTo(current - 1);
    } else if (key === "home") {
      goTo(0);
    } else if (key === "end") {
      goTo(slides.length - 1);
    } else if (key === "n") {
      togglePanel(notesPanel);
    } else if (key === "o") {
      togglePanel(overview);
    } else if (key === "f") {
      toggleFullscreen();
    } else if (key === "b") {
      blank?.classList.add("is-open");
    }
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => action(button.dataset.action));
  });
  document.addEventListener("keydown", handleKey);
  window.addEventListener("hashchange", () => goTo(fromHash(), { replaceHash: true }));

  stage?.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    stage.style.setProperty("--pointer-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    stage.style.setProperty("--pointer-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  });
  stage?.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0]?.clientX || 0;
    touchStartY = event.changedTouches[0]?.clientY || 0;
  }, { passive: true });
  stage?.addEventListener("touchend", (event) => {
    const deltaX = (event.changedTouches[0]?.clientX || 0) - touchStartX;
    const deltaY = (event.changedTouches[0]?.clientY || 0) - touchStartY;
    if (Math.abs(deltaX) > 54 && Math.abs(deltaX) > Math.abs(deltaY)) goTo(current + (deltaX < 0 ? 1 : -1));
  }, { passive: true });

  document.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => image.closest(".slide, figure")?.classList.add("image-unavailable"));
  });

  if (totalLabel) totalLabel.textContent = pad(slides.length);
  buildOverview();
  current = fromHash();
  slides.forEach((slide) => slide.classList.remove("is-active", "was-active"));
  goTo(current, { replaceHash: true });

  Promise.resolve(document.fonts?.ready).finally(() => {
    window.setTimeout(() => curtain?.classList.add("is-ready"), 220);
  });
})();
