(() => {
  "use strict";

  const slides = [...document.querySelectorAll(".slide")];
  const progress = document.querySelector(".progress-bar");
  const currentLabel = document.querySelector("[data-current-slide]");
  const totalLabel = document.querySelector("[data-total-slides]");
  const notesPanel = document.querySelector(".speaker-notes");
  const notesBody = document.querySelector("[data-notes-body]");
  const overview = document.querySelector(".overview-panel");
  const overviewGrid = document.querySelector(".overview-grid");
  const help = document.querySelector(".help-panel");
  const blank = document.querySelector(".blank-screen");
  const stage = document.querySelector(".stage");
  const curtain = document.querySelector(".loading-curtain");
  const deckKey = document.body.dataset.deck || "ovo-deck";
  const proofRail = document.querySelector("[data-proof-rail]");
  const proofTabs = [...(proofRail?.querySelectorAll("[data-proof-case]") || [])];
  const proofPanels = [...(proofRail?.querySelectorAll("[data-proof-panel]") || [])];
  const proofRailIndex = slides.indexOf(proofRail);

  let current = 0;
  let previous = -1;
  let transitionTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let preparedText = new Map();
  let relayoutQueued = false;
  let panelReturnFocus = null;

  const slideAnnouncer = document.createElement("div");
  slideAnnouncer.className = "deck-live-region";
  slideAnnouncer.setAttribute("aria-live", "polite");
  slideAnnouncer.setAttribute("aria-atomic", "true");
  document.body.appendChild(slideAnnouncer);

  const panelConfigs = [
    { panel: notesPanel, action: "notes", id: `${deckKey}-speaker-notes` },
    { panel: overview, action: "overview", id: `${deckKey}-slide-overview` },
    { panel: help, action: "help", id: `${deckKey}-keyboard-help` },
  ];

  const pad = (value) => String(value).padStart(2, "0");
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function slideFromHash() {
    const raw = Number.parseInt(window.location.hash.replace("#", ""), 10);
    return Number.isFinite(raw) ? clamp(raw - 1, 0, slides.length - 1) : 0;
  }

  function updateMedia() {
    slides.forEach((slide, index) => {
      slide.querySelectorAll("video").forEach((video) => {
        if (index === current) {
          const playAttempt = video.play();
          if (playAttempt && typeof playAttempt.catch === "function") playAttempt.catch(() => {});
        } else {
          video.pause();
        }
      });
    });
  }

  function updateNotes() {
    if (!notesBody) return;
    const source = slides[current]?.querySelector(".notes");
    notesBody.innerHTML = source?.innerHTML || "<p>No notes for this slide.</p>";
  }

  function updateOverview() {
    overviewGrid?.querySelectorAll(".overview-card").forEach((card, index) => {
      card.setAttribute("aria-current", index === current ? "true" : "false");
    });
  }

  function activateProofCase(caseId, { focus = false, announce = true } = {}) {
    if (!proofRail || !caseId) return;
    const activeTab = proofTabs.find((tab) => tab.dataset.proofCase === caseId);
    const activePanel = proofPanels.find((panel) => panel.dataset.proofPanel === caseId);
    if (!activeTab || !activePanel) return;

    proofTabs.forEach((tab) => {
      const isActive = tab === activeTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    proofPanels.forEach((panel) => {
      const isActive = panel === activePanel;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    if (focus) activeTab.focus({ preventScroll: true });
    if (announce) slideAnnouncer.textContent = `${activeTab.textContent.trim()} case study selected`;
  }

  function goTo(index, { replaceHash = false } = {}) {
    const next = clamp(index, 0, slides.length - 1);
    if (next === current && slides[current]?.classList.contains("is-active")) return;

    window.clearTimeout(transitionTimer);
    previous = current;
    current = next;

    slides.forEach((slide, slideIndex) => {
      slide.classList.remove("is-active", "was-active");
      slide.setAttribute("aria-hidden", slideIndex === current ? "false" : "true");
    });

    if (previous !== current && slides[previous]) slides[previous].classList.add("was-active");
    slides[current]?.classList.add("is-active");

    transitionTimer = window.setTimeout(() => {
      slides.forEach((slide, slideIndex) => {
        if (slideIndex !== current) slide.classList.remove("was-active");
      });
    }, 760);

    if (currentLabel) currentLabel.textContent = pad(current + 1);
    if (progress) progress.style.width = `${((current + 1) / slides.length) * 100}%`;
    document.title = `${slides[current]?.dataset.title || "Presentation"} · OVO Talent`;
    slideAnnouncer.textContent = `Slide ${current + 1} of ${slides.length}: ${slides[current]?.dataset.title || "OVO Talent presentation"}`;

    const previousControl = document.querySelector('[data-action="previous"]');
    const nextControl = document.querySelector('[data-action="next"]');
    if (previousControl instanceof HTMLButtonElement) previousControl.disabled = current === 0;
    if (nextControl instanceof HTMLButtonElement) nextControl.disabled = current === slides.length - 1;

    const nextHash = `#${current + 1}`;
    if (window.location.hash !== nextHash) {
      const method = replaceHash ? "replaceState" : "pushState";
      window.history[method](null, "", nextHash);
    }

    updateMedia();
    updateNotes();
    updateOverview();
    if (current === proofRailIndex && previous !== current) activateProofCase("cal-ai", { announce: false });
  }

  function next() {
    goTo(current + 1);
  }

  function previousSlide() {
    goTo(current - 1);
  }

  function panelTrigger(action) {
    return document.querySelector(`[data-action="${action}"]`);
  }

  function setPanelOpen(config, isOpen) {
    if (!config.panel) return;
    config.panel.classList.toggle("is-open", isOpen);
    config.panel.setAttribute("aria-hidden", String(!isOpen));
    panelTrigger(config.action)?.setAttribute("aria-expanded", String(isOpen));
  }

  function isPanelDescendant(element) {
    return panelConfigs.some((config) => config.panel?.contains(element));
  }

  function focusDeckSurface() {
    const target = slides[current] || stage;
    if (!(target instanceof HTMLElement)) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  function closePanels(except = null, { restoreFocus = false } = {}) {
    panelConfigs.forEach((config) => {
      if (config.panel && config.panel !== except) setPanelOpen(config, false);
    });
    if (restoreFocus && panelReturnFocus instanceof HTMLElement && panelReturnFocus.isConnected && !isPanelDescendant(panelReturnFocus)) {
      panelReturnFocus.focus({ preventScroll: true });
      panelReturnFocus = null;
    } else if (restoreFocus) {
      panelReturnFocus = null;
      focusDeckSurface();
    }
  }

  function togglePanel(panel) {
    if (!panel) return;
    const willOpen = !panel.classList.contains("is-open");
    if (!willOpen) {
      closePanels(null, { restoreFocus: true });
      return;
    }
    const active = document.activeElement;
    if (!(panelReturnFocus instanceof HTMLElement) && active instanceof HTMLElement && active !== document.body && !isPanelDescendant(active)) {
      panelReturnFocus = active;
    }
    closePanels(panel);
    const config = panelConfigs.find((candidate) => candidate.panel === panel);
    if (config) setPanelOpen(config, true);
    window.requestAnimationFrame(() => {
      const firstTarget = panel.querySelector("button, a[href], [tabindex]:not([tabindex=\"-1\"])");
      (firstTarget || panel).focus({ preventScroll: true });
    });
  }

  function trapPanelFocus(event, panel) {
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      // Fullscreen can be blocked when the deck is embedded. The presentation still works.
    }
  }

  function runAction(action) {
    const actions = {
      next,
      previous: previousSlide,
      fullscreen: toggleFullscreen,
      notes: () => togglePanel(notesPanel),
      overview: () => togglePanel(overview),
      help: () => togglePanel(help),
      blank: () => setBlank(!blank?.classList.contains("is-open")),
    };
    actions[action]?.();
  }

  function isEditing() {
    const active = document.activeElement;
    return Boolean(active?.isContentEditable || active?.matches?.("input, textarea, select"));
  }

  function setBlank(isOpen) {
    blank?.classList.toggle("is-open", isOpen);
    blank?.setAttribute("aria-hidden", String(!isOpen));
  }

  function handleKeydown(event) {
    if (isEditing()) {
      if (event.key === "Escape") document.activeElement.blur();
      return;
    }

    const key = event.key.toLowerCase();

    const openPanel = panelConfigs.find((config) => config.panel?.classList.contains("is-open"))?.panel;
    if (openPanel && event.key === "Tab") {
      trapPanelFocus(event, openPanel);
      return;
    }

    if (blank?.classList.contains("is-open")) {
      if (key === "b" || key === "escape") setBlank(false);
      return;
    }

    if (key === "escape") {
      closePanels(null, { restoreFocus: true });
      return;
    }

    const focusedProofTab = document.activeElement?.matches?.("[data-proof-case]")
      ? document.activeElement
      : null;
    if (focusedProofTab && (key === " " || key === "enter")) {
      event.preventDefault();
      activateProofCase(focusedProofTab.dataset.proofCase, { focus: true });
      return;
    }

    if (current === proofRailIndex && ["1", "2", "3"].includes(key)) {
      event.preventDefault();
      const tab = proofTabs[Number(key) - 1];
      if (tab) activateProofCase(tab.dataset.proofCase);
      return;
    }

    if (["arrowright", "arrowdown", "pagedown", " "].includes(key)) {
      event.preventDefault();
      next();
    } else if (["arrowleft", "arrowup", "pageup"].includes(key)) {
      event.preventDefault();
      previousSlide();
    } else if (key === "home") {
      event.preventDefault();
      goTo(0);
    } else if (key === "end") {
      event.preventDefault();
      goTo(slides.length - 1);
    } else if (key === "f") {
      toggleFullscreen();
    } else if (key === "n") {
      togglePanel(notesPanel);
    } else if (key === "o") {
      togglePanel(overview);
    } else if (key === "b") {
      setBlank(true);
    } else if (key === "?" || key === "h") {
      togglePanel(help);
    }
  }

  function buildOverview() {
    if (!overviewGrid) return;
    const fragment = document.createDocumentFragment();

    slides.forEach((slide, index) => {
      const card = document.createElement("button");
      card.className = "overview-card";
      card.type = "button";
      card.innerHTML = `
        <span class="overview-num">${pad(index + 1)}</span>
        <strong>${slide.dataset.title || `Slide ${index + 1}`}</strong>
        <span>${slide.dataset.section || "OVO Talent"}</span>
      `;
      card.addEventListener("click", () => {
        goTo(index);
        closePanels(null, { restoreFocus: true });
      });
      fragment.appendChild(card);
    });

    overviewGrid.replaceChildren(fragment);
  }

  function fontShorthand(element) {
    const style = window.getComputedStyle(element);
    return style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
  }

  function prepareTextElement(element) {
    if (!window.Pretext?.prepare) return;
    const text = element.innerText.trim();
    if (!text) return;
    preparedText.set(element, window.Pretext.prepare(text, fontShorthand(element)));
  }

  function relayoutText() {
    relayoutQueued = false;
    if (!window.Pretext?.layout) return;

    preparedText.forEach((handle, element) => {
      if (!element.isConnected || element.clientWidth <= 0) return;
      element.style.minHeight = "";
      const naturalHeight = Math.ceil(element.scrollHeight);
      const style = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.1;
      const result = window.Pretext.layout(handle, element.clientWidth, lineHeight);
      if (Number.isFinite(result.height) && result.height > 0) {
        const measuredHeight = Math.min(Math.ceil(result.height), naturalHeight + 1);
        element.style.minHeight = `${measuredHeight}px`;
      }
    });
  }

  function scheduleRelayout() {
    if (relayoutQueued) return;
    relayoutQueued = true;
    window.requestAnimationFrame(relayoutText);
  }

  function wirePretext() {
    const elements = [...document.querySelectorAll("[data-pretext]")];
    elements.forEach((element) => {
      prepareTextElement(element);

      new MutationObserver(() => {
        prepareTextElement(element);
        scheduleRelayout();
      }).observe(element, { characterData: true, subtree: true, childList: true });
    });

    const resizeObserver = new ResizeObserver(scheduleRelayout);
    resizeObserver.observe(stage || document.body);
    scheduleRelayout();
  }

  function buildCreatorLedger() {
    const ledger = document.querySelector("[data-creator-ledger]");
    if (!ledger || ledger.dataset.ready === "true") return;

    const creators = [
      { name: "Paula", image: "assets/creator-proof/paula.jpg", category: "Fitness" },
      { name: "Daria", image: "assets/creator-proof/daria.jpg", category: "Wellness" },
      { name: "Juan", image: "assets/creator-proof/juan.jpg", category: "Lifestyle" },
      { name: "Maria", image: "assets/creators/maria.jpg", category: "Nutrition" },
      { name: "Samantha", image: "assets/creators/samantha.jpg", category: "Fitness" },
      { name: "Colby", image: "assets/creators/colby.jpg", category: "Performance" },
      { name: "Milan", image: "assets/creators/milan.jpg", category: "Lifestyle" },
      { name: "Alex", image: "assets/creators/alex.jpg", category: "Training" },
      { name: "Brenda", image: "assets/creators/brenda.jpg", category: "Fitness" },
      { name: "Denise", image: "assets/creators/denise.jpg", category: "Wellness" },
      { name: "Giovanni", image: "assets/creator-proof/gio.jpg", category: "Performance" },
    ];
    const formats = ["Reel", "TikTok", "Story", "UGC", "Feed", "Campaign"];
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 126; index += 1) {
      const creator = creators[index % creators.length];
      const record = document.createElement("div");
      record.className = "creator-record-card";
      record.innerHTML = `
        <div class="creator-record-person"><img src="${creator.image}" alt=""><span>${creator.name}</span></div>
        <small>AGR-${String(index + 184).padStart(4, "0")} · ${creator.category} · ${formats[index % formats.length]}</small>
      `;
      fragment.appendChild(record);
    }

    ledger.replaceChildren(fragment);
    ledger.dataset.ready = "true";
    const cards = [...ledger.children];
    const lightCards = (offset = 0) => {
      cards.forEach((card) => card.classList.remove("is-lit"));
      for (let index = 0; index < 6; index += 1) {
        cards[(offset + index * 21) % cards.length]?.classList.add("is-lit");
      }
    };

    lightCards(4);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let offset = 4;
      window.setInterval(() => {
        offset = (offset + 7) % cards.length;
        lightCards(offset);
      }, 1_500);
    }
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });

  proofTabs.forEach((tab) => {
    tab.addEventListener("click", () => activateProofCase(tab.dataset.proofCase, { focus: true }));
  });

  panelConfigs.forEach((config) => {
    if (!config.panel) return;
    config.panel.id ||= config.id;
    config.panel.setAttribute("role", "dialog");
    config.panel.setAttribute("aria-modal", "true");
    config.panel.setAttribute("aria-hidden", "true");
    config.panel.setAttribute("tabindex", "-1");
    const label = config.panel.querySelector(".speaker-notes-label, h2");
    if (label) {
      label.id ||= `${config.id}-label`;
      config.panel.setAttribute("aria-labelledby", label.id);
    }
    const trigger = panelTrigger(config.action);
    trigger?.setAttribute("aria-controls", config.panel.id);
    trigger?.setAttribute("aria-expanded", "false");
  });
  setBlank(false);
  buildCreatorLedger();
  activateProofCase("cal-ai", { announce: false });

  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("hashchange", () => goTo(slideFromHash(), { replaceHash: true }));

  stage?.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    stage.style.setProperty("--pointer-x", `${relativeX * 100}%`);
    stage.style.setProperty("--pointer-y", `${relativeY * 100}%`);
    document.body.classList.toggle("deck-controls-visible", relativeX > 0.7 && relativeY > 0.78);
  });

  stage?.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0]?.clientX || 0;
    touchStartY = event.changedTouches[0]?.clientY || 0;
  }, { passive: true });

  stage?.addEventListener("touchend", (event) => {
    const endX = event.changedTouches[0]?.clientX || 0;
    const endY = event.changedTouches[0]?.clientY || 0;
    const deltaX = endX - touchStartX;
    const deltaY = endY - touchStartY;
    if (Math.abs(deltaX) > 54 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) next();
      else previousSlide();
    }
  }, { passive: true });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".help-panel, .speaker-notes, .overview-panel, .controls")) return;
    closePanels();
  });

  if (totalLabel) totalLabel.textContent = pad(slides.length);
  buildOverview();
  current = slideFromHash();
  slides.forEach((slide) => slide.classList.remove("is-active", "was-active"));
  previous = -1;
  goTo(current, { replaceHash: true });

  const personalizationReady = Promise.resolve(window.OVOProfileReady || window.OVOBrandReady).catch(() => null);
  const personalizationDeadline = new Promise((resolve) => window.setTimeout(resolve, 14_000));

  Promise.allSettled([
    Promise.resolve(document.fonts?.ready),
    Promise.race([personalizationReady, personalizationDeadline]),
  ])
    .then(wirePretext)
    .finally(() => {
      window.setTimeout(() => curtain?.classList.add("is-ready"), 260);
    });

  window.OVODeck = { goTo, next, previous: previousSlide, deckKey };
})();
