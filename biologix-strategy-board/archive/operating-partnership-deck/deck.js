(() => {
  "use strict";

  const MOBILE_BREAKPOINT = 700;
  const CANVAS_WIDTH = 1440;
  const CANVAS_HEIGHT = 810;

  const body = document.body;
  const slides = [...document.querySelectorAll(".slide")];
  const stage = document.querySelector(".stage");
  const progressTrack = document.querySelector("[data-progress-track]");
  const currentLabel = document.querySelector("[data-current-slide]");
  const totalLabel = document.querySelector("[data-total-slides]");
  const mobileCurrent = document.querySelector("[data-mobile-current]");
  const mobileProgress = document.querySelector(".mobile-progress");
  const notesPanel = document.querySelector(".speaker-notes");
  const notesTitle = document.querySelector("[data-notes-title]");
  const notesBody = document.querySelector("[data-notes-body]");
  const overview = document.querySelector(".overview-panel");
  const overviewGrid = document.querySelector(".overview-grid");

  let current = 0;
  let previous = -1;
  let touchStartX = 0;
  let touchStartY = 0;
  let transitionTimer;
  let scrollObserver;
  let lastPanelTrigger = null;

  const pad = (value) => String(value).padStart(2, "0");
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

  function indexFromHash() {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return 0;

    const exact = slides.findIndex((slide) => slide.id === hash);
    if (exact >= 0) return exact;

    const numeric = Number.parseInt(hash, 10);
    return Number.isFinite(numeric) ? clamp(numeric - 1, 0, slides.length - 1) : 0;
  }

  function updateScale() {
    if (isMobile()) {
      body.style.removeProperty("--deck-scale");
      return;
    }
    const scale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
    body.style.setProperty("--deck-scale", String(scale));
  }

  function updateNotes() {
    const slide = slides[current];
    const source = slide?.querySelector(".notes");
    if (notesTitle) notesTitle.textContent = slide?.dataset.title || `Slide ${current + 1}`;
    if (notesBody) notesBody.innerHTML = source?.innerHTML || "<p>No presenter notes for this slide.</p>";
  }

  function updateOverview() {
    overviewGrid?.querySelectorAll(".overview-card").forEach((card, index) => {
      card.setAttribute("aria-current", index === current ? "true" : "false");
    });
  }

  function updateProgress() {
    progressTrack?.querySelectorAll(".progress-segment").forEach((segment, index) => {
      segment.classList.toggle("is-complete", index < current);
      if (index === current) segment.setAttribute("aria-current", "step");
      else segment.removeAttribute("aria-current");
    });
  }

  function updateChrome() {
    const active = slides[current];
    const position = `${pad(current + 1)} / ${pad(slides.length)}`;

    body.classList.toggle("is-inverse", active?.classList.contains("inverse"));
    if (currentLabel) currentLabel.textContent = pad(current + 1);
    if (mobileCurrent) mobileCurrent.textContent = position;
    if (mobileProgress) {
      mobileProgress.style.setProperty("--mobile-progress", `${((current + 1) / slides.length) * 100}%`);
    }
    document.title = `${active?.dataset.title || "Operating partnership"} · Biologix × Alex`;
    updateProgress();
    updateNotes();
    updateOverview();
  }

  function setCurrent(index, { updateHash = true, replaceHash = false, scroll = false } = {}) {
    const next = clamp(index, 0, slides.length - 1);
    previous = current;
    current = next;
    window.clearTimeout(transitionTimer);

    if (isMobile()) {
      slides.forEach((slide) => slide.setAttribute("aria-hidden", "false"));
      if (scroll) {
        slides[current]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      slides.forEach((slide, indexToSet) => {
        slide.classList.remove("is-active", "was-active");
        slide.setAttribute("aria-hidden", indexToSet === current ? "false" : "true");
      });

      if (previous !== current && slides[previous]) slides[previous].classList.add("was-active");
      slides[current]?.classList.add("is-active");
      transitionTimer = window.setTimeout(() => {
        slides.forEach((slide, indexToClear) => {
          if (indexToClear !== current) slide.classList.remove("was-active");
        });
      }, 280);
    }

    if (updateHash) {
      const nextHash = `#${slides[current]?.id || current + 1}`;
      if (window.location.hash !== nextHash) {
        window.history[replaceHash ? "replaceState" : "pushState"](null, "", nextHash);
      }
    }

    updateChrome();
  }

  function buildProgress() {
    if (!progressTrack) return;
    const fragment = document.createDocumentFragment();

    slides.forEach((slide, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "progress-segment";
      button.setAttribute("aria-label", `Slide ${index + 1}: ${slide.dataset.title}`);
      button.addEventListener("click", () => setCurrent(index));
      fragment.appendChild(button);
    });

    progressTrack.replaceChildren(fragment);
  }

  function sanitizeOverviewClone(clone) {
    clone.removeAttribute("id");
    clone.removeAttribute("aria-hidden");
    clone.classList.add("is-active");
    clone.classList.remove("was-active");
    clone.querySelectorAll(".notes, .mobile-notes").forEach((element) => element.remove());
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.querySelectorAll("button, a, summary").forEach((element) => element.setAttribute("tabindex", "-1"));
    return clone;
  }

  function buildOverview() {
    if (!overviewGrid) return;
    const fragment = document.createDocumentFragment();

    slides.forEach((slide, index) => {
      const button = document.createElement("button");
      const thumb = document.createElement("span");
      const canvas = document.createElement("span");
      const label = document.createElement("span");
      const section = document.createElement("span");
      const title = document.createElement("strong");

      button.type = "button";
      button.className = "overview-card";
      button.setAttribute("aria-label", `Go to slide ${index + 1}: ${slide.dataset.title}`);
      thumb.className = "overview-thumb";
      canvas.className = "overview-slide-canvas";
      label.className = "overview-card-label";
      section.textContent = `${pad(index + 1)} · ${slide.dataset.section || "Deck"}`;
      title.textContent = slide.dataset.title || `Slide ${index + 1}`;

      canvas.appendChild(sanitizeOverviewClone(slide.cloneNode(true)));
      thumb.appendChild(canvas);
      label.append(section, title);
      button.append(thumb, label);
      button.addEventListener("click", () => {
        setCurrent(index);
        closePanel(overview);
      });
      fragment.appendChild(button);
    });

    overviewGrid.replaceChildren(fragment);
  }

  function buildMobileNotes() {
    slides.forEach((slide) => {
      if (slide.querySelector(".mobile-notes")) return;
      const source = slide.querySelector(".notes");
      if (!source) return;

      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const content = document.createElement("div");
      details.className = "mobile-notes";
      summary.textContent = "Presenter notes";
      content.className = "mobile-notes-body";
      content.innerHTML = source.innerHTML;
      details.append(summary, content);
      slide.appendChild(details);
    });
  }

  function closePanel(panel, { returnFocus = true } = {}) {
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    if (returnFocus && lastPanelTrigger) lastPanelTrigger.focus({ preventScroll: true });
  }

  function openPanel(panel, trigger) {
    if (!panel) return;
    [notesPanel, overview].forEach((other) => {
      if (other !== panel) closePanel(other, { returnFocus: false });
    });
    lastPanelTrigger = trigger || document.activeElement;
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    panel.querySelector("button")?.focus({ preventScroll: true });
  }

  function togglePanel(panel, trigger) {
    if (!panel) return;
    if (panel.classList.contains("is-open")) closePanel(panel);
    else openPanel(panel, trigger);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) {
      // Fullscreen can be unavailable in embedded browsers; the deck remains usable.
    }
  }

  function runAction(name, trigger) {
    const actions = {
      previous: () => setCurrent(current - 1, { scroll: isMobile() }),
      next: () => setCurrent(current + 1, { scroll: isMobile() }),
      notes: () => togglePanel(notesPanel, trigger),
      overview: () => togglePanel(overview, trigger),
      fullscreen: toggleFullscreen,
      print: () => window.print(),
    };
    actions[name]?.();
  }

  function shouldIgnoreNavigation(event) {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, summary, [contenteditable='true']"));
  }

  function handleKey(event) {
    if (isMobile() || shouldIgnoreNavigation(event)) return;
    const key = event.key.toLowerCase();

    if (key === "escape") {
      closePanel(notesPanel);
      closePanel(overview);
    } else if (["arrowright", "arrowdown", "pagedown", " "].includes(key)) {
      if (event.target instanceof HTMLButtonElement && key === " ") return;
      event.preventDefault();
      setCurrent(current + 1);
    } else if (["arrowleft", "arrowup", "pageup"].includes(key)) {
      event.preventDefault();
      setCurrent(current - 1);
    } else if (key === "home") {
      event.preventDefault();
      setCurrent(0);
    } else if (key === "end") {
      event.preventDefault();
      setCurrent(slides.length - 1);
    } else if (key === "n") {
      togglePanel(notesPanel, event.target);
    } else if (key === "o") {
      togglePanel(overview, event.target);
    } else if (key === "f") {
      toggleFullscreen();
    }
  }

  function configureScrollObserver() {
    scrollObserver?.disconnect();
    if (!isMobile() || !("IntersectionObserver" in window)) return;

    scrollObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = slides.indexOf(visible.target);
      if (index >= 0 && index !== current) setCurrent(index, { updateHash: false });
    }, {
      rootMargin: "-18% 0px -52% 0px",
      threshold: [0.1, 0.3, 0.6],
    });

    slides.forEach((slide) => scrollObserver.observe(slide));
  }

  function handleResize() {
    updateScale();
    configureScrollObserver();

    if (isMobile()) {
      slides.forEach((slide) => {
        slide.classList.remove("was-active");
        slide.setAttribute("aria-hidden", "false");
      });
    } else {
      setCurrent(current, { updateHash: false });
    }
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action, button));
  });

  document.addEventListener("keydown", handleKey);
  window.addEventListener("hashchange", () => {
    const index = indexFromHash();
    setCurrent(index, { updateHash: false, scroll: isMobile() });
  });

  let resizeFrame;
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(handleResize);
  });

  stage?.addEventListener("touchstart", (event) => {
    if (isMobile()) return;
    touchStartX = event.changedTouches[0]?.clientX || 0;
    touchStartY = event.changedTouches[0]?.clientY || 0;
  }, { passive: true });

  stage?.addEventListener("touchend", (event) => {
    if (isMobile()) return;
    const deltaX = (event.changedTouches[0]?.clientX || 0) - touchStartX;
    const deltaY = (event.changedTouches[0]?.clientY || 0) - touchStartY;
    if (Math.abs(deltaX) > 54 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setCurrent(current + (deltaX < 0 ? 1 : -1));
    }
  }, { passive: true });

  body.classList.add("deck-ready");
  if (totalLabel) totalLabel.textContent = pad(slides.length);
  buildProgress();
  buildMobileNotes();
  buildOverview();
  current = indexFromHash();
  updateScale();
  setCurrent(current, { replaceHash: true, scroll: false });

  if (isMobile() && window.location.hash) {
    window.requestAnimationFrame(() => slides[current]?.scrollIntoView({ block: "start" }));
  } else {
    configureScrollObserver();
  }

  Promise.resolve(document.fonts?.ready).finally(() => {
    window.setTimeout(() => {
      body.classList.add("is-loaded");
      if (isMobile() && window.location.hash) {
        const targetIndex = indexFromHash();
        setCurrent(targetIndex, { updateHash: false });
        slides[targetIndex]?.scrollIntoView({ block: "start" });
        window.setTimeout(configureScrollObserver, 350);
      } else {
        configureScrollObserver();
      }
    }, 140);
  });
})();
