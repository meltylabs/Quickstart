(() => {
  "use strict";

  const STORAGE_KEY = "fitia-portal-demo-v1";
  const SNAPSHOT_DATE = "Aug 8, 2026";
  const CAMPAIGN_MONTH = { year: 2026, month: 7, label: "August 2026" };
  const ROUTES = ["overview", "deliverables", "calendar", "creators", "performance", "brief"];
  const STATUS_LABELS = {
    awaiting: "Awaiting approval",
    approved: "Approved",
    changes: "Changes requested",
    scheduled: "Scheduled",
    published: "Published",
  };

  const rawDeliverables = [
    {
      id: "bQrHVaPFe4M",
      shortTitle: "Consistency opener",
      sourceTitle: "Struggling to lose weight? Meet Fitia (The Best Nutrition App)",
      creator: "Creator 01",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/bQrHVaPFe4M.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=bQrHVaPFe4M",
      publishedDate: "Dec 18, 2025",
      duration: 43,
      views: 1348,
      likes: 11,
      status: "awaiting",
      due: "Today · 17:00",
      eventDate: "2026-08-08",
      platform: "YouTube Short",
      currentVersion: 2,
      unread: true,
      versions: [
        { number: 1, note: "First cut", uploaded: "Aug 6 · 10:18" },
        { number: 2, note: "CTA timing pass", uploaded: "Aug 8 · 08:54" },
      ],
      comments: [
        { id: "bqr-1", type: "comment", author: "Fitia marketing", role: "Fitia", created: "Yesterday · 15:26", version: 1, timecode: 3, resolved: true, body: "The first three seconds are strong. Please keep the progress chart on screen through the next beat, then let the app reveal land cleanly." },
        { id: "bqr-2", type: "comment", author: "OVO campaign team", role: "OVO", created: "Today · 08:54", version: 2, timecode: 7, resolved: false, body: "Updated in V2: the chart now holds through 00:07 and the scan moment has its own beat. Final download CTA is unchanged." },
        { id: "bqr-s1", type: "system", created: "Today · 08:55", tone: "fitia", body: "V2 sent to Fitia for approval · simulated" },
      ],
    },
    {
      id: "7oPtb6II7Is",
      shortTitle: "Transformation story",
      sourceTitle: "My Real Body Transformation (Tracked with Fitia)",
      creator: "Creator 05",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/7oPtb6II7Is.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=7oPtb6II7Is",
      publishedDate: "Nov 26, 2025",
      duration: 13,
      views: 618,
      likes: 2,
      status: "awaiting",
      due: "Tomorrow · 11:00",
      eventDate: "2026-08-09",
      platform: "YouTube Short",
      currentVersion: 1,
      unread: true,
      versions: [{ number: 1, note: "First cut", uploaded: "Aug 8 · 09:12" }],
      comments: [
        { id: "trans-1", type: "comment", author: "OVO campaign team", role: "OVO", created: "Today · 09:12", version: 1, timecode: 5, resolved: false, body: "First cut is ready. We kept the transformation sequence tight and used “tracked with Fitia” in the on-screen line." },
        { id: "trans-s1", type: "system", created: "Today · 09:13", tone: "fitia", body: "V1 sent to Fitia for approval · simulated" },
      ],
    },
    {
      id: "EY9LOhGg-TI",
      shortTitle: "Macro tracker reveal",
      sourceTitle: "Meet the Best Calorie & Macro Tracking - Fitia",
      creator: "Creator 03",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/EY9LOhGg-TI.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=EY9LOhGg-TI",
      publishedDate: "Dec 18, 2025",
      duration: 18,
      views: 1713635,
      likes: 1008,
      status: "changes",
      due: "Return by Mon",
      eventDate: "2026-08-10",
      platform: "YouTube Short",
      currentVersion: 3,
      unread: false,
      versions: [
        { number: 1, note: "First cut", uploaded: "Aug 4 · 12:14" },
        { number: 2, note: "Copy pass", uploaded: "Aug 6 · 16:40" },
        { number: 3, note: "Product timing", uploaded: "Aug 8 · 10:08" },
      ],
      comments: [
        { id: "macro-1", type: "comment", author: "Fitia product", role: "Fitia", created: "Thu · 13:02", version: 2, timecode: 7, resolved: false, body: "The scan lands before the calorie total resolves. Give the total another half-second, then cut to the macro split." },
        { id: "macro-2", type: "comment", author: "Fitia marketing", role: "Fitia", created: "Thu · 13:06", version: 2, timecode: 12, resolved: false, body: "Please reduce the app-screen glare here so the protein number stays legible after Zoom compression." },
        { id: "macro-3", type: "comment", author: "OVO campaign team", role: "OVO", created: "Today · 10:08", version: 3, timecode: 7, resolved: false, body: "Both notes are in V3. Product total holds for 12 frames longer and the screen capture is now the clean export." },
        { id: "macro-s1", type: "system", created: "Thu · 13:07", tone: "ovo", body: "Changes requested by Fitia · simulated" },
      ],
    },
    {
      id: "rMH3_EuFTj0",
      shortTitle: "Weekday gym lunch",
      sourceTitle: "My Easy Lazy Girl Gym Lunch (Tracked with Fitia)",
      creator: "Creator 06",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/rMH3_EuFTj0.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=rMH3_EuFTj0",
      publishedDate: "Nov 21, 2025",
      duration: 34,
      views: 127,
      likes: 1,
      status: "changes",
      due: "Return by Wed",
      eventDate: "2026-08-12",
      platform: "YouTube Short",
      currentVersion: 2,
      unread: false,
      versions: [
        { number: 1, note: "First cut", uploaded: "Aug 5 · 14:32" },
        { number: 2, note: "Caption pass", uploaded: "Aug 7 · 11:44" },
      ],
      comments: [
        { id: "lunch-1", type: "comment", author: "Fitia marketing", role: "Fitia", created: "Yesterday · 10:18", version: 2, timecode: 2, resolved: false, body: "For the paid caption variant, please use “easy weekday gym lunch” instead. The organic source title can stay exactly as published." },
        { id: "lunch-2", type: "comment", author: "OVO campaign team", role: "OVO", created: "Yesterday · 11:44", version: 2, timecode: 2, resolved: false, body: "Logged. We will separate the paid caption from the original organic title and return the updated export Wednesday." },
        { id: "lunch-s1", type: "system", created: "Yesterday · 10:19", tone: "ovo", body: "Changes requested by Fitia · simulated" },
      ],
    },
    {
      id: "VPWRswctjnM",
      shortTitle: "Nutrition app review",
      sourceTitle: "Is This The Best Nutrition App?",
      creator: "Creator 04",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/VPWRswctjnM.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=VPWRswctjnM",
      publishedDate: "Dec 17, 2025",
      duration: 41,
      views: 981246,
      likes: 168,
      status: "approved",
      due: "Approved Fri",
      eventDate: "2026-08-11",
      platform: "YouTube Short",
      currentVersion: 2,
      unread: false,
      versions: [
        { number: 1, note: "First cut", uploaded: "Aug 3 · 09:48" },
        { number: 2, note: "Hook trim", uploaded: "Aug 6 · 12:22" },
      ],
      comments: [
        { id: "best-1", type: "comment", author: "Fitia marketing", role: "Fitia", created: "Thu · 09:20", version: 1, timecode: 2, resolved: true, body: "Tighten the opening pause before the question. Everything after the mirror cut is working." },
        { id: "best-2", type: "comment", author: "OVO campaign team", role: "OVO", created: "Thu · 12:22", version: 2, timecode: 2, resolved: true, body: "Opening pause is down by eight frames in V2. No other creative changes made." },
        { id: "best-s1", type: "system", created: "Fri · 14:02", tone: "fitia", body: "Approved by Fitia · simulated · 14:02" },
      ],
    },
    {
      id: "ZZLeVx6DiZQ",
      shortTitle: "Creator’s top nutrition app",
      sourceTitle: "This is my #1 Fitness Nutrition App (Fitia)",
      creator: "Creator 05",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/ZZLeVx6DiZQ.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=ZZLeVx6DiZQ",
      publishedDate: "Nov 29, 2025",
      duration: 90,
      views: 1023,
      likes: 10,
      status: "approved",
      due: "Approved Thu",
      eventDate: "2026-08-13",
      platform: "YouTube Short",
      currentVersion: 2,
      unread: false,
      versions: [
        { number: 1, note: "First cut", uploaded: "Aug 4 · 16:10" },
        { number: 2, note: "Routine montage", uploaded: "Aug 6 · 11:05" },
      ],
      comments: [
        { id: "one-1", type: "comment", author: "Fitia brand", role: "Fitia", created: "Wed · 17:18", version: 1, timecode: 21, resolved: true, body: "Can the routine montage arrive earlier? The creator proof is strong; we just want Fitia visible before the halfway point." },
        { id: "one-2", type: "comment", author: "OVO campaign team", role: "OVO", created: "Thu · 11:05", version: 2, timecode: 16, resolved: true, body: "Moved the routine montage to 00:16 and kept the transformation payoff intact." },
        { id: "one-s1", type: "system", created: "Thu · 16:44", tone: "fitia", body: "Approved by Fitia · simulated · 16:44" },
      ],
    },
    {
      id: "VhsHx6jA4tQ",
      shortTitle: "Travel calorie tracking",
      sourceTitle: "This is the app I use to track my calories while traveling (Fitia)",
      creator: "Creator 04",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/VhsHx6jA4tQ.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=VhsHx6jA4tQ",
      publishedDate: "Nov 24, 2025",
      duration: 36,
      views: 1095,
      likes: 5,
      status: "approved",
      due: "Approved Wed",
      eventDate: "2026-08-15",
      platform: "YouTube Short",
      currentVersion: 1,
      unread: false,
      versions: [{ number: 1, note: "First cut", uploaded: "Aug 5 · 13:20" }],
      comments: [
        { id: "travel-1", type: "comment", author: "Fitia marketing", role: "Fitia", created: "Wed · 15:38", version: 1, timecode: 19, resolved: true, body: "The travel context and restaurant scan are clear. Good to approve as delivered." },
        { id: "travel-s1", type: "system", created: "Wed · 15:39", tone: "fitia", body: "Approved by Fitia · simulated · 15:39" },
      ],
    },
    {
      id: "agme1gmY85M",
      shortTitle: "High-protein breakfast",
      sourceTitle: "My Everyday High-Protein Breakfast (Tracked with Fitia)",
      creator: "Creator 02",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/agme1gmY85M.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=agme1gmY85M",
      publishedDate: "Nov 23, 2025",
      duration: 29,
      views: 1273,
      likes: 20,
      status: "scheduled",
      due: "Live Aug 18 · 09:00",
      eventDate: "2026-08-18",
      platform: "YouTube Short",
      currentVersion: 2,
      unread: false,
      versions: [
        { number: 1, note: "First cut", uploaded: "Aug 3 · 10:40" },
        { number: 2, note: "Macro overlay", uploaded: "Aug 5 · 09:16" },
      ],
      comments: [
        { id: "breakfast-1", type: "comment", author: "Fitia product", role: "Fitia", created: "Tue · 14:08", version: 1, timecode: 17, resolved: true, body: "Please keep the protein and calorie total together so the meal math reads in one glance." },
        { id: "breakfast-2", type: "comment", author: "OVO campaign team", role: "OVO", created: "Wed · 09:16", version: 2, timecode: 17, resolved: true, body: "Combined into one locked overlay in V2 and checked at mobile size." },
        { id: "breakfast-s1", type: "system", created: "Thu · 11:22", tone: "fitia", body: "Approved by Fitia · simulated · 11:22" },
        { id: "breakfast-s2", type: "system", created: "Fri · 09:04", tone: "ink", body: "Scheduled for Aug 18 · simulated" },
      ],
    },
    {
      id: "fjsLVZT9-2I",
      shortTitle: "On-track eating routine",
      sourceTitle: "This nutrititon app helps me stay on track and eating what I love (Fitia App)",
      creator: "Creator 02",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/fjsLVZT9-2I.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=fjsLVZT9-2I",
      publishedDate: "Dec 30, 2025",
      duration: 45,
      views: 1458,
      likes: 9,
      status: "published",
      due: "Live Aug 5",
      eventDate: "2026-08-05",
      platform: "YouTube Short",
      currentVersion: 2,
      unread: false,
      versions: [
        { number: 1, note: "First cut", uploaded: "Jul 30 · 12:02" },
        { number: 2, note: "App sequence", uploaded: "Aug 2 · 15:34" },
      ],
      comments: [
        { id: "track-1", type: "comment", author: "Fitia product", role: "Fitia", created: "Aug 1 · 09:42", version: 1, timecode: 23, resolved: true, body: "The meal-plan sequence is clear. Hold the Fitia screen for one more beat before returning to the creator." },
        { id: "track-2", type: "comment", author: "OVO campaign team", role: "OVO", created: "Aug 2 · 15:34", version: 2, timecode: 23, resolved: true, body: "Screen hold extended in V2. Export and caption package are both ready." },
        { id: "track-s1", type: "system", created: "Aug 3 · 10:16", tone: "fitia", body: "Approved by Fitia · simulated · 10:16" },
        { id: "track-s2", type: "system", created: "Aug 5 · 09:02", tone: "ink", body: "Published link attached · simulated" },
      ],
    },
    {
      id: "s-F-hU_7LO8",
      shortTitle: "Recipe meal planner",
      sourceTitle: "The best meal planner and calorie tracker app for your recipes 🙌🏼 #fatloss #mealprep #mealplanning",
      creator: "Creator 06",
      creatorLabel: "Partner creator · demo roster label",
      thumbnail: "assets/fitia-posts/s-F-hU_7LO8.jpg",
      sourceUrl: "https://www.youtube.com/watch?v=s-F-hU_7LO8",
      publishedDate: "Nov 28, 2025",
      duration: 51,
      views: 4045,
      likes: 73,
      status: "published",
      due: "Live Aug 6",
      eventDate: "2026-08-06",
      platform: "YouTube Short",
      currentVersion: 1,
      unread: false,
      versions: [{ number: 1, note: "Final cut", uploaded: "Aug 2 · 11:28" }],
      comments: [
        { id: "recipe-1", type: "comment", author: "Fitia marketing", role: "Fitia", created: "Aug 2 · 14:22", version: 1, timecode: 31, resolved: true, body: "Recipe build is easy to follow and the final plate gives us the payoff. Approved with no revision." },
        { id: "recipe-s1", type: "system", created: "Aug 2 · 14:23", tone: "fitia", body: "Approved by Fitia · simulated · 14:23" },
        { id: "recipe-s2", type: "system", created: "Aug 6 · 10:00", tone: "ink", body: "Published link attached · simulated" },
      ],
    },
  ];

  const baseState = () => ({
    schema: 1,
    route: routeFromHash(),
    selectedId: "bQrHVaPFe4M",
    filter: "all",
    search: "",
    reviewTab: "review",
    mobileReview: false,
    resetConfirm: false,
    highlightedComment: null,
    activeVersions: Object.fromEntries(rawDeliverables.map((item) => [item.id, item.currentVersion])),
    currentTimecodes: Object.fromEntries(rawDeliverables.map((item) => {
      const marker = item.comments.find((comment) => Number.isFinite(comment.timecode));
      return [item.id, marker ? marker.timecode : 0];
    })),
    deliverables: clone(rawDeliverables),
  });

  const elements = {
    app: document.querySelector("[data-portal-app]"),
    loading: document.querySelector("[data-loading-shell]"),
    pageRoot: document.querySelector("[data-page-root]"),
    live: document.querySelector("[data-live-region]"),
    changeModal: document.querySelector("[data-change-modal]"),
    changeForm: document.querySelector("[data-change-form]"),
    modalTimecode: document.querySelector("[data-modal-timecode]"),
    moreBackdrop: document.querySelector("[data-more-backdrop]"),
    moreSheet: document.querySelector("[data-more-sheet]"),
  };

  let state = loadState();
  let modalContext = null;
  let previouslyFocused = null;
  let actionTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function routeFromHash() {
    const candidate = window.location.hash.replace(/^#/, "").trim().toLowerCase();
    return ROUTES.includes(candidate) ? candidate : "overview";
  }

  function loadState() {
    const fallback = baseState();
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (!stored || stored.schema !== 1 || !Array.isArray(stored.deliverables) || stored.deliverables.length !== rawDeliverables.length) return fallback;
      return {
        ...fallback,
        ...stored,
        route: routeFromHash(),
        resetConfirm: false,
        highlightedComment: null,
        mobileReview: false,
      };
    } catch (_) {
      return fallback;
    }
  }

  function saveState() {
    try {
      const durable = {
        schema: state.schema,
        selectedId: state.selectedId,
        filter: state.filter,
        search: state.search,
        reviewTab: state.reviewTab,
        activeVersions: state.activeVersions,
        currentTimecodes: state.currentTimecodes,
        deliverables: state.deliverables,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(durable));
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function statusMarkup(status) {
    return `<span class="status status--${status}"><i></i>${STATUS_LABELS[status]}</span>`;
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function formatMetric(value) {
    return new Intl.NumberFormat("en-US", { notation: value >= 100000 ? "compact" : "standard", maximumFractionDigits: value >= 100000 ? 1 : 0 }).format(value);
  }

  function selectedDeliverable() {
    return state.deliverables.find((item) => item.id === state.selectedId) || state.deliverables[0];
  }

  function counts() {
    const result = { all: state.deliverables.length, awaiting: 0, approved: 0, changes: 0, scheduled: 0, published: 0 };
    state.deliverables.forEach((item) => { result[item.status] += 1; });
    return result;
  }

  function clearedCount() {
    return state.deliverables.filter((item) => ["approved", "scheduled", "published"].includes(item.status)).length;
  }

  function announce(message) {
    elements.live.textContent = "";
    window.requestAnimationFrame(() => { elements.live.textContent = message; });
  }

  function isRendered(element) {
    return Boolean(element && !element.hidden && element.getClientRects().length);
  }

  function focusAfterRender(...selectors) {
    window.requestAnimationFrame(() => {
      const target = selectors
        .flatMap((selector) => [...document.querySelectorAll(selector)])
        .find((element) => isRendered(element));
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function renderChrome() {
    const activeRoute = state.route;
    document.querySelectorAll("[data-route]").forEach((button) => {
      const route = button.dataset.route;
      const isCurrent = route === activeRoute;
      if (isCurrent) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.querySelectorAll('[data-action="open-more"]').forEach((button) => {
      if (["performance", "brief"].includes(activeRoute)) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    const openWork = counts().awaiting + counts().changes;
    document.querySelectorAll("[data-nav-count]").forEach((node) => { node.textContent = String(openWork); });
    const cleared = clearedCount();
    const percentage = Math.round((cleared / state.deliverables.length) * 100);
    document.querySelectorAll("[data-clearance-summary]").forEach((node) => { node.textContent = `${cleared} of ${state.deliverables.length} cleared`; });
    document.querySelectorAll("[data-clearance-bar]").forEach((node) => { node.style.width = `${percentage}%`; });
    renderResetControls();
  }

  function renderResetControls() {
    document.querySelectorAll("[data-reset-control]").forEach((node) => {
      node.innerHTML = state.resetConfirm
        ? '<div class="reset-control__confirm"><span>Sure?</span><button type="button" data-action="confirm-reset" data-confirm="yes">Yes</button><button type="button" data-action="cancel-reset">No</button></div>'
        : '<button type="button" data-action="ask-reset">Reset demo</button>';
    });
  }

  function updateResetConfirmation(origin, isConfirming) {
    const controls = [...document.querySelectorAll("[data-reset-control]")];
    const controlIndex = Math.max(0, controls.indexOf(origin.closest("[data-reset-control]")));
    state.resetConfirm = isConfirming;
    renderResetControls();
    window.requestAnimationFrame(() => {
      const refreshed = [...document.querySelectorAll("[data-reset-control]")][controlIndex];
      const target = refreshed?.querySelector(isConfirming ? '[data-confirm="yes"]' : '[data-action="ask-reset"]');
      target?.focus();
    });
  }

  function render() {
    renderChrome();
    const renderers = {
      overview: renderOverview,
      deliverables: renderDeliverables,
      calendar: renderCalendar,
      creators: renderCreators,
      performance: renderPerformance,
      brief: renderBrief,
    };
    elements.pageRoot.innerHTML = renderers[state.route]();
    document.title = `${routeTitle(state.route)} · Fitia × OVO`;
    bindMediaFallbacks();
  }

  function routeTitle(route) {
    return route === "brief" ? "Campaign Brief" : route.charAt(0).toUpperCase() + route.slice(1);
  }

  function renderOverview() {
    const tally = counts();
    const cleared = clearedCount();
    const percentage = Math.round((cleared / state.deliverables.length) * 100);
    const priorities = state.deliverables.filter((item) => ["awaiting", "changes"].includes(item.status)).slice(0, 4);
    const activities = recentActivity().slice(0, 6);
    return `
      <section class="page page--overview" aria-labelledby="overview-title">
        <header class="page-heading">
          <div class="page-heading__copy">
            <span class="page-kicker">Fitia × OVO Talent · Demo workspace</span>
            <h1 id="overview-title">Campaign control room</h1>
            <p>One place for creative review, exact-frame feedback, approvals, publishing dates, and source links.</p>
          </div>
          <a class="source-chip" href="https://www.youtube.com/@fitia_app" target="_blank" rel="noopener noreferrer">Official Fitia source <i>↗</i></a>
        </header>

        <div class="overview-hero">
          <p class="overview-editorial">Make nutrition feel <span>possible every day.</span></p>
          <div class="overview-progress">
            <div class="overview-progress__head"><span>Creative clearance</span><strong>${percentage}%</strong></div>
            <div class="overview-progress__line"><i style="width:${percentage}%"></i></div>
            <div class="overview-progress__legend"><span>${cleared} cleared</span><span>${state.deliverables.length - cleared} in motion</span></div>
          </div>
        </div>

        <div class="overview-stats" aria-label="Campaign status totals">
          ${["awaiting", "changes", "approved", "scheduled", "published"].map((status) => `
            <div class="overview-stat" data-status="${status}"><strong>${tally[status]}</strong><span>${STATUS_LABELS[status]}</span></div>
          `).join("")}
        </div>

        <div class="overview-grid">
          <section class="section-panel">
            <header class="section-panel__head"><h2>Needs attention</h2><button type="button" data-action="view-all-deliverables">Open queue →</button></header>
            <ul class="priority-list">
              ${priorities.map((item) => `
                <li><button class="priority-item" type="button" data-action="open-deliverable" data-id="${item.id}">
                  <img src="${item.thumbnail}" alt="" loading="lazy">
                  <span><strong>${escapeHtml(item.shortTitle)}</strong><small>${escapeHtml(item.creator)} · ${escapeHtml(item.platform)}</small></span>
                  <i>${escapeHtml(item.due)}</i>
                </button></li>
              `).join("")}
            </ul>
          </section>

          <section class="section-panel">
            <header class="section-panel__head"><h2>Latest activity</h2><span>Simulated workflow</span></header>
            <ul class="activity-list">
              ${activities.map((activity) => `
                <li data-tone="${activity.tone}"><i></i><span><p>${escapeHtml(activity.body)}</p><small>${escapeHtml(activity.created)} · ${escapeHtml(activity.title)}</small></span></li>
              `).join("")}
            </ul>
          </section>
        </div>
      </section>`;
  }

  function recentActivity() {
    const rows = [];
    state.deliverables.forEach((item) => {
      item.comments.slice(-2).forEach((comment) => {
        const explicitSortKey = comment.activityAt ? Date.parse(comment.activityAt) : NaN;
        rows.push({
          body: comment.type === "system" ? comment.body : `${comment.author}: ${comment.body}`,
          created: comment.created,
          title: item.shortTitle,
          tone: comment.type === "system" ? (comment.tone || "ink") : comment.role === "Fitia" ? "fitia" : "ovo",
          sortKey: Number.isFinite(explicitSortKey) ? explicitSortKey : activitySortKey(comment.created),
          sequence: rows.length,
        });
      });
    });
    return rows.sort((a, b) => b.sortKey - a.sortKey || b.sequence - a.sequence);
  }

  function activitySortKey(label) {
    const [dayLabel = "", timeLabel = ""] = String(label).split(" · ");
    if (dayLabel === "Now") return Date.now();

    const snapshot = Date.UTC(2026, 7, 8);
    let day = snapshot;
    if (dayLabel === "Yesterday") day -= 86400000;
    else if (dayLabel !== "Today") {
      const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      if (Object.hasOwn(weekdays, dayLabel)) {
        const snapshotWeekday = new Date(snapshot).getUTCDay();
        day -= ((snapshotWeekday - weekdays[dayLabel] + 7) % 7) * 86400000;
      } else {
        const dated = dayLabel.match(/^Aug (\d{1,2})$/);
        if (dated) day = Date.UTC(2026, 7, Number(dated[1]));
      }
    }

    const time = timeLabel.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!time) return day;
    let hour = Number(time[1]);
    const meridiem = time[3]?.toUpperCase();
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (meridiem === "PM" && hour < 12) hour += 12;
    return day + hour * 3600000 + Number(time[2]) * 60000;
  }

  function filteredDeliverables() {
    const query = state.search.trim().toLowerCase();
    return state.deliverables.filter((item) => {
      if (state.filter !== "all" && item.status !== state.filter) return false;
      if (!query) return true;
      return [item.shortTitle, item.sourceTitle, item.creator, item.platform, STATUS_LABELS[item.status]].join(" ").toLowerCase().includes(query);
    });
  }

  function reconcileSelectionToResults() {
    const visible = filteredDeliverables();
    if (!visible.length || visible.some((item) => item.id === state.selectedId)) return false;
    state.selectedId = visible[0].id;
    visible[0].unread = false;
    state.reviewTab = "review";
    return true;
  }

  function renderDeliverables() {
    const tally = counts();
    const visible = filteredDeliverables();
    const item = selectedDeliverable();
    const activeVersion = state.activeVersions[item.id] || item.currentVersion;
    const currentTimecode = Math.min(state.currentTimecodes[item.id] || 0, item.duration);
    const isSuperseded = activeVersion < item.currentVersion;
    const isLocked = ["approved", "scheduled", "published"].includes(item.status);
    const isPublished = item.status === "published";
    const canApprove = !isLocked && !isSuperseded;
    const canRequest = !isPublished && !isSuperseded;
    const comments = isSuperseded
      ? item.comments.filter((comment) => comment.type === "comment" && comment.version === activeVersion)
      : item.comments;
    const commentCount = comments.filter((comment) => comment.type === "comment").length;
    const markers = comments.filter((comment) => comment.type === "comment" && Number.isFinite(comment.timecode));

    const actionMarkup = (location) => `
      <div class="review-actions review-actions--${location}">
        <button class="button button--approve" type="button" data-action="approve" ${canApprove ? "" : "disabled"}>${isLocked ? item.status === "approved" ? "Approved" : STATUS_LABELS[item.status] : isSuperseded ? "Select current version" : `Approve V${item.currentVersion}`}</button>
        <button class="button button--request" type="button" data-action="open-change-modal" ${canRequest ? "" : "disabled"}>Request changes</button>
      </div>`;

    return `
      <section class="page deliverables-page ${state.mobileReview ? "is-mobile-review" : ""}" aria-label="Deliverables workspace">
        <header class="page-heading">
          <div class="page-heading__copy">
            <span class="page-kicker">Assets &amp; approvals</span>
            <h1 id="deliverables-title">Deliverables</h1>
            <p>Review the exact frame, keep one revision trail, and move every asset forward.</p>
          </div>
          <div class="page-heading__meta">10 official Fitia posts · workflow simulated</div>
        </header>

        <div class="deliverables-shell ${state.mobileReview ? "is-mobile-review" : ""} ${visible.length ? "" : "is-empty"}" data-review-tab="${state.reviewTab}">
          <aside class="queue-pane" aria-label="Deliverable queue">
            <div class="queue-toolbar">
              <label class="search-field">
                <span class="sr-only">Search deliverables</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 1 1-4.9 12l-3.6 3.6 1.4 1.4 3.6-3.6A7 7 0 0 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>
                <input type="search" value="${escapeHtml(state.search)}" placeholder="Search deliverables  /" data-deliverable-search autocomplete="off">
              </label>
              <div class="filter-chips" aria-label="Filter deliverables">
                ${["all", "awaiting", "approved", "changes", "scheduled", "published"].map((filter) => `
                  <button class="filter-chip" type="button" data-action="filter" data-filter="${filter}" aria-pressed="${state.filter === filter}">${filter === "all" ? "All" : STATUS_LABELS[filter]} · ${tally[filter]}</button>
                `).join("")}
              </div>
            </div>
            <div class="deliverable-list" role="listbox" aria-label="Campaign deliverables">
              ${visible.length ? visible.map((row) => `
                <button class="deliverable-row" type="button" role="option" data-action="select-deliverable" data-id="${row.id}" aria-selected="${row.id === item.id}" aria-current="${row.id === item.id}">
                  <span class="deliverable-row__thumb"><img src="${row.thumbnail}" alt="" loading="lazy">${row.unread ? "<i aria-label=\"Unread activity\"></i>" : ""}</span>
                  <span class="deliverable-row__copy"><strong>${escapeHtml(row.shortTitle)}</strong><small>${escapeHtml(row.creator)} · V${row.currentVersion}</small></span>
                  <span class="deliverable-row__meta">${statusMarkup(row.status)}<small>${escapeHtml(row.due)}</small></span>
                </button>
              `).join("") : `
                <div class="queue-empty"><div><strong>No matching deliverables</strong><p>Try a different search or return to the complete queue.</p><button type="button" data-action="clear-filters">Clear filters</button></div></div>
              `}
            </div>
          </aside>

          ${visible.length ? "" : `
            <section class="review-empty-detail" aria-live="polite">
              <div><span>Queue filtered</span><strong>No deliverable selected</strong><p>Clear the current filters to return to the full review workspace.</p></div>
            </section>
          `}

          <div class="compact-review-tabs" role="group" aria-label="Review workspace panels" ${visible.length ? "" : "hidden"}>
            <button class="compact-mobile-back" type="button" data-action="mobile-back" aria-label="Back to all deliverables">← Queue</button>
            <button type="button" data-action="review-tab" data-tab="review" aria-pressed="${state.reviewTab === "review"}">Review</button>
            <button type="button" data-action="review-tab" data-tab="activity" aria-pressed="${state.reviewTab === "activity"}">Activity · ${commentCount}</button>
          </div>

          <section class="review-pane" aria-label="Creative review stage" ${visible.length ? "" : "hidden"}>
            <header class="review-stage__head">
              <div><p>${escapeHtml(item.creator)} · ${escapeHtml(item.platform)}</p><h2>${escapeHtml(item.sourceTitle)}</h2></div>
              ${statusMarkup(item.status)}
            </header>

            <div class="version-switcher" role="group" aria-label="Draft versions">
              ${item.versions.map((version) => `<button type="button" data-action="version" data-version="${version.number}" aria-pressed="${activeVersion === version.number}">V${version.number}</button>`).join("")}
              <span>${isSuperseded ? "Superseded · " : "Current · "}${escapeHtml(item.versions.find((version) => version.number === activeVersion)?.note || "Draft")}</span>
            </div>

            <div class="media-stack" key="${item.id}-${activeVersion}">
              <a class="media-frame" href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open the official Fitia post on YouTube">
                <img src="${item.thumbnail}" alt="Official Fitia post thumbnail: ${escapeHtml(item.sourceTitle)}" data-media-image>
                <span class="media-frame__shade"></span>
                <span class="media-frame__play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg></span>
                <span class="media-frame__source"><span>Official Fitia source</span><span>Play on YouTube ↗</span></span>
                <span class="media-error"><span><img src="assets/brands/fitia.png" alt=""><strong>Source unavailable</strong><span>Open on YouTube ↗</span></span></span>
              </a>

              <div class="timeline-wrap" aria-label="Frame-specific review timeline">
                <div class="timeline">
                  <span class="timeline__position" style="width:${(currentTimecode / item.duration) * 100}%"></span>
                  ${markers.map((comment) => `<button class="timeline-marker ${state.highlightedComment === comment.id ? "is-active" : ""}" style="left:${Math.min(98, Math.max(2, (comment.timecode / item.duration) * 100))}%" type="button" data-action="marker" data-comment-id="${comment.id}" data-timecode="${comment.timecode}" data-open="${!comment.resolved}" aria-label="Comment at ${formatTime(comment.timecode)}"></button>`).join("")}
                </div>
                <div class="timeline-meta"><span>00:00</span><strong>◆ ${formatTime(currentTimecode)}</strong><span>${formatTime(item.duration)}</span></div>
              </div>

              <div class="source-meta">
                <span><p>${escapeHtml(item.sourceTitle)}</p><small>Published ${escapeHtml(item.publishedDate)} · ${formatTime(item.duration)} · public snapshot ${SNAPSHOT_DATE}</small></span>
                <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">Verify source ↗</a>
              </div>
            </div>
            ${actionMarkup("stage")}
          </section>

          <aside class="thread-pane" aria-label="Review activity" ${visible.length ? "" : "hidden"}>
            <header class="thread-head">
              <div class="thread-head__top"><h2>Review thread</h2><span class="status status--${item.status}"><i></i>${commentCount} notes</span></div>
              <p>${escapeHtml(item.shortTitle)} · ${isSuperseded ? `viewing V${activeVersion} · read-only` : `current V${item.currentVersion}`}</p>
              <div class="version-history">${item.versions.map((version) => `<span class="${version.number === item.currentVersion ? "is-current" : ""}">V${version.number} · ${escapeHtml(version.uploaded)}</span>`).join("")}</div>
            </header>
            <div class="comments-list" data-comments-list>
              ${comments.length ? comments.map((comment) => renderComment(comment)).join("") : '<div class="system-event" data-tone="ink">No feedback was logged on this version.</div>'}
            </div>
            <form class="comment-composer" data-comment-form>
              <label class="sr-only" for="portal-comment">Add a simulated Fitia comment</label>
              <textarea id="portal-comment" name="comment" rows="3" placeholder="${isSuperseded ? `V${activeVersion} is read-only · select V${item.currentVersion} to comment` : "Add Fitia feedback…"}" required ${isSuperseded ? "disabled" : ""}></textarea>
              <div class="comment-composer__foot">
                <label class="timecode-toggle"><input type="checkbox" name="include_timecode" checked ${isSuperseded ? "disabled" : ""}>◆ ${formatTime(currentTimecode)}</label>
                <button type="submit" disabled data-comment-send>Send comment</button>
              </div>
            </form>
            ${actionMarkup("thread")}
          </aside>
        </div>
      </section>`;
  }

  function renderComment(comment) {
    if (comment.type === "system") {
      return `<div class="system-event" data-tone="${escapeHtml(comment.tone || "ink")}">${escapeHtml(comment.body)}</div>`;
    }
    const initials = comment.role === "Fitia" ? "FI" : "OV";
    const roleClass = comment.role === "Fitia" ? "fitia" : "ovo";
    return `
      <article class="comment ${state.highlightedComment === comment.id ? "is-highlighted" : ""}" data-comment-id="${comment.id}" data-role="${comment.role}">
        <span class="comment__avatar" aria-hidden="true">${initials}</span>
        <div>
          <div class="comment__head"><strong>${escapeHtml(comment.author)}</strong><span class="role-tag role-tag--${roleClass}">${escapeHtml(comment.role)}</span><span class="comment__time">${escapeHtml(comment.created)} · V${comment.version}</span></div>
          <p>${escapeHtml(comment.body)}</p>
          ${Number.isFinite(comment.timecode) ? `<button class="comment__timecode" type="button" data-action="comment-timecode" data-comment-id="${comment.id}" data-timecode="${comment.timecode}">◆ ${formatTime(comment.timecode)}</button>` : ""}
        </div>
      </article>`;
  }

  function renderCalendar() {
    const start = new Date(Date.UTC(CAMPAIGN_MONTH.year, CAMPAIGN_MONTH.month, 1));
    const gridStart = new Date(start);
    gridStart.setUTCDate(1 - start.getUTCDay());
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setUTCDate(gridStart.getUTCDate() + index);
      return date;
    });
    const events = state.deliverables.reduce((map, item) => {
      (map[item.eventDate] ||= []).push(item);
      return map;
    }, {});
    const agendaDates = Object.keys(events).sort();
    return `
      <section class="page" aria-labelledby="calendar-title">
        <header class="page-heading">
          <div class="page-heading__copy"><span class="page-kicker">Campaign calendar</span><h1 id="calendar-title">${CAMPAIGN_MONTH.label}</h1><p>Review deadlines, returns, scheduled assets, and published links in one operating view.</p></div>
          <div class="page-heading__meta">Dates &amp; workflow simulated</div>
        </header>
        <div class="calendar-shell">
          <div class="calendar-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}</div>
          <div class="calendar-grid">
            ${days.map((date) => {
              const key = date.toISOString().slice(0, 10);
              const outside = date.getUTCMonth() !== CAMPAIGN_MONTH.month;
              const today = key === "2026-08-08";
              return `<div class="calendar-day ${outside ? "is-outside" : ""} ${today ? "is-today" : ""}"><span class="calendar-day__number">${date.getUTCDate()}</span>${(events[key] || []).map((item) => `<button class="calendar-event" type="button" data-action="open-deliverable" data-id="${item.id}" data-status="${item.status}">${escapeHtml(item.shortTitle)}</button>`).join("")}</div>`;
            }).join("")}
          </div>
        </div>
        <div class="calendar-agenda">
          ${agendaDates.map((date) => {
            const stamp = new Date(`${date}T12:00:00Z`);
            const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(stamp);
            return `<div class="agenda-day"><time datetime="${date}">${dateLabel}</time><div>${events[date].map((item) => `<button class="agenda-event" type="button" data-action="open-deliverable" data-id="${item.id}" data-status="${item.status}"><span>${escapeHtml(item.shortTitle)}</span><small>${STATUS_LABELS[item.status]} · ${escapeHtml(item.due)}</small></button>`).join("")}</div></div>`;
          }).join("")}
        </div>
      </section>`;
  }

  function renderCreators() {
    const creatorMap = new Map();
    state.deliverables.forEach((item) => {
      if (!creatorMap.has(item.creator)) creatorMap.set(item.creator, []);
      creatorMap.get(item.creator).push(item);
    });
    const creators = [...creatorMap.entries()].map(([name, items]) => ({ name, items, hero: items[0] }));
    return `
      <section class="page" aria-labelledby="creators-title">
        <header class="page-heading">
          <div class="page-heading__copy"><span class="page-kicker">Campaign roster</span><h1 id="creators-title">Creator workstreams</h1><p>Every creator is tied to their active assets, current approval state, and verified source media.</p></div>
          <div class="page-heading__meta">Creator names are demo roster labels</div>
        </header>
        <div class="creator-grid">
          ${creators.map((creator) => {
            const cleared = creator.items.filter((item) => ["approved", "scheduled", "published"].includes(item.status)).length;
            return `<article class="creator-card">
              <div class="creator-card__portrait"><img src="${creator.hero.thumbnail}" alt="Official Fitia source thumbnail used for ${escapeHtml(creator.name)}"><span>${cleared}/${creator.items.length} cleared</span></div>
              <div class="creator-card__copy"><h2>${escapeHtml(creator.name)}</h2><p>Partner creator · demo roster label</p><div class="creator-card__meta"><span>${creator.items.length} ${creator.items.length === 1 ? "deliverable" : "deliverables"}</span><button type="button" data-action="open-deliverable" data-id="${creator.hero.id}">Open work →</button></div></div>
            </article>`;
          }).join("")}
        </div>
      </section>`;
  }

  function renderPerformance() {
    const totalViews = state.deliverables.reduce((sum, item) => sum + item.views, 0);
    const totalLikes = state.deliverables.reduce((sum, item) => sum + item.likes, 0);
    return `
      <section class="page" aria-labelledby="performance-title">
        <header class="page-heading">
          <div class="page-heading__copy"><span class="page-kicker">Performance &amp; source record</span><h1 id="performance-title">Creative intelligence</h1><p>Public Fitia post snapshots are kept separate from the simulated campaign targets and approval workflow.</p></div>
          <a class="source-chip" href="https://www.youtube.com/@fitia_app/shorts" target="_blank" rel="noopener noreferrer">Verify official channel <i>↗</i></a>
        </header>

        <section class="performance-section" aria-labelledby="public-source-title">
          <div class="performance-section__head"><h2 id="public-source-title">Official Fitia source snapshot</h2><span>Public YouTube values captured ${SNAPSHOT_DATE}<br>Not attributed to OVO campaign work</span></div>
          <div class="performance-primary">
            ${metricBlock("Combined public views", formatMetric(totalViews), "Across the 10 official source posts")}
            ${metricBlock("Combined public likes", formatMetric(totalLikes), "Public count at snapshot time")}
            ${metricBlock("Verified source posts", String(state.deliverables.length), "Every media card links to its official post")}
          </div>
        </section>

        <section class="performance-section" aria-labelledby="target-title">
          <div class="performance-section__head"><h2 id="target-title">Campaign operating targets</h2><span>Projected · simulated</span></div>
          <div class="performance-primary">
            ${metricBlock("Review turnaround", "≤ 1 day", "Target from draft delivery to brand decision", [14, 22, 26, 40, 51, 68, 78, 88, 96])}
            ${metricBlock("First-pass clearance", "≥ 60%", "Target for creator first submissions", [9, 18, 34, 43, 50, 59, 72, 82, 90])}
            ${metricBlock("Paid-ready variants", "4", "Target exports prepared after final approval", [12, 18, 28, 39, 52, 68, 78, 88, 96])}
          </div>
        </section>

        <section class="performance-section" aria-labelledby="source-table-title">
          <div class="performance-section__head"><h2 id="source-table-title">Public post record</h2><span>Values change after snapshot date</span></div>
          <table class="source-table">
            <thead><tr><th>Official Fitia post</th><th>Published</th><th>Duration</th><th>Views</th><th>Likes</th></tr></thead>
            <tbody>${[...state.deliverables].sort((a, b) => b.views - a.views).map((item) => `<tr><td><a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sourceTitle)} ↗</a></td><td>${escapeHtml(item.publishedDate)}</td><td>${formatTime(item.duration)}</td><td>${new Intl.NumberFormat("en-US").format(item.views)}</td><td>${new Intl.NumberFormat("en-US").format(item.likes)}</td></tr>`).join("")}</tbody>
          </table>
        </section>
      </section>`;
  }

  function metricBlock(label, value, note, points = null) {
    const sparkline = Array.isArray(points) && points.length > 1
      ? (() => {
        const coords = points.map((point, index) => `${(index / (points.length - 1)) * 100},${34 - (point / 100) * 30}`).join(" ");
        const lastY = 34 - (points[points.length - 1] / 100) * 30;
        return `<svg class="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Simulated target trajectory"><polyline points="${coords}"/><circle cx="100" cy="${lastY}" r="2.2"/></svg>`;
      })()
      : "";
    return `<article class="metric-block"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small>${sparkline}</article>`;
  }

  function renderBrief() {
    return `
      <section class="page" aria-labelledby="brief-title">
        <header class="page-heading">
          <div class="page-heading__copy"><span class="page-kicker">Operating brief · simulated</span><h1 id="brief-title">Campaign brief</h1><p>The source content is real; scope, dates, statuses, comments, and operating targets below are built for this campaign demo.</p></div>
          <div class="page-heading__meta">Last aligned · Aug 8, 2026 · simulated</div>
        </header>
        <div class="brief-layout">
          <article>
            <p class="brief-campaign-name">Everyday nutrition, made trackable.</p>
            <section class="brief-block"><h2>Business objective</h2><p>Show how Fitia turns everyday meals into a clear, sustainable nutrition routine—without asking creators to abandon the food and moments they already enjoy.</p></section>
            <section class="brief-block"><h2>Audience</h2><p>Fitness-minded adults who want practical calorie and macro guidance, especially people who have tried rigid tracking systems and need something easier to maintain.</p></section>
            <section class="brief-block"><h2>Creative direction</h2><ul><li>Lead with a recognizable nutrition frustration in the first three seconds.</li><li>Show the product in use: food scan, meal planning, calorie total, or macro split.</li><li>Let the creator’s routine carry the story; product proof should clarify it.</li><li>End with one clean action rather than stacking claims.</li></ul></section>
            <section class="brief-block"><h2>Review standard</h2><p>Fitia reviews product accuracy, message hierarchy, and paid-caption language. OVO owns creator communication, edit consolidation, version control, and the final publishing package.</p></section>
          </article>
          <aside class="brief-aside">
            <h2>Demo scope</h2>
            <div class="brief-fact"><span>Source assets</span><strong>10 official Fitia Shorts</strong></div>
            <div class="brief-fact"><span>Workflow</span><strong>Two review rounds</strong></div>
            <div class="brief-fact"><span>Approval SLA</span><strong>One business day</strong></div>
            <div class="brief-fact"><span>Campaign window</span><strong>Aug 4–28, 2026</strong></div>
            <div class="brief-fact"><span>OVO owner</span><strong>Campaign team</strong></div>
            <p>Scope, dates, owners, comments, and statuses are simulated for the portal demonstration.</p>
          </aside>
        </div>
      </section>`;
  }

  function bindMediaFallbacks() {
    document.querySelectorAll("[data-media-image]").forEach((image) => {
      image.addEventListener("error", () => image.closest(".media-frame")?.classList.add("is-error"), { once: true });
    });
  }

  function navigate(route, options = {}) {
    if (!ROUTES.includes(route)) return;
    state.route = route;
    state.mobileReview = Boolean(options.mobileReview && route === "deliverables");
    if (window.location.hash !== `#${route}`) window.history.pushState(null, "", `#${route}`);
    render();
    closeMore();
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  function openDeliverable(id) {
    const item = state.deliverables.find((candidate) => candidate.id === id);
    if (!item) return;
    item.unread = false;
    state.selectedId = id;
    state.reviewTab = "review";
    saveState();
    navigate("deliverables", { mobileReview: window.matchMedia("(max-width: 768px)").matches });
    focusAfterRender(
      '[data-action="mobile-back"]',
      `[data-id="${CSS.escape(state.selectedId)}"].deliverable-row`,
    );
  }

  function setReviewTab(tab) {
    if (!["review", "activity"].includes(tab)) return;
    state.reviewTab = tab;
    saveState();
    render();
    focusAfterRender(`[data-action="review-tab"][data-tab="${CSS.escape(tab)}"]`);
  }

  function focusComment(commentId) {
    window.requestAnimationFrame(() => {
      const target = document.querySelector(`[data-comment-id="${CSS.escape(commentId)}"].comment`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.setAttribute("tabindex", "-1");
      target?.focus({ preventScroll: true });
      window.setTimeout(() => {
        target?.classList.remove("is-highlighted");
        document.querySelectorAll(".timeline-marker.is-active").forEach((marker) => marker.classList.remove("is-active"));
        state.highlightedComment = null;
      }, 900);
    });
  }

  function focusMarker(commentId) {
    window.requestAnimationFrame(() => {
      const target = document.querySelector(`.timeline-marker[data-comment-id="${CSS.escape(commentId)}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
      window.setTimeout(() => {
        target?.classList.remove("is-active");
        state.highlightedComment = null;
      }, 900);
    });
  }

  function selectMarker(commentId, timecode, destination = "activity") {
    const item = selectedDeliverable();
    state.currentTimecodes[item.id] = Number(timecode) || 0;
    state.highlightedComment = commentId;
    if (window.matchMedia("(max-width: 1280px)").matches) state.reviewTab = destination;
    saveState();
    render();
    if (destination === "review") focusMarker(commentId);
    else focusComment(commentId);
  }

  function addComment(form) {
    const textarea = form.elements.comment;
    const body = textarea.value.trim();
    if (!body) return;
    const item = selectedDeliverable();
    const activeVersion = state.activeVersions[item.id] || item.currentVersion;
    if (activeVersion !== item.currentVersion) return;
    const includeTimecode = form.elements.include_timecode.checked;
    const now = new Date();
    const timeLabel = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now);
    const comment = {
      id: `demo-${Date.now()}`,
      type: "comment",
      author: "Fitia team",
      role: "Fitia",
      created: `Now · ${timeLabel}`,
      activityAt: now.toISOString(),
      version: activeVersion,
      timecode: includeTimecode ? state.currentTimecodes[item.id] || 0 : null,
      resolved: false,
      body,
    };
    item.comments.push(comment);
    saveState();
    state.reviewTab = "activity";
    render();
    announce("Simulated Fitia comment added to the review thread.");
    focusComment(comment.id);
  }

  function approveSelected(button) {
    const item = selectedDeliverable();
    const activeVersion = state.activeVersions[item.id] || item.currentVersion;
    if (["approved", "scheduled", "published"].includes(item.status) || activeVersion !== item.currentVersion) return;
    window.clearTimeout(actionTimer);
    button.classList.add("is-approving");
    button.disabled = true;
    actionTimer = window.setTimeout(() => {
      const now = new Date();
      const timeLabel = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
      item.status = "approved";
      item.due = "Approved just now";
      item.unread = false;
      item.comments.forEach((comment) => {
        if (comment.type === "comment") comment.resolved = true;
      });
      item.comments.push({ id: `approve-${Date.now()}`, type: "system", created: `Now · ${timeLabel}`, activityAt: now.toISOString(), tone: "fitia", body: `Approved by Fitia · simulated · ${timeLabel}` });
      reconcileSelectionToResults();
      saveState();
      render();
      focusAfterRender('[data-action="review-tab"][data-tab="review"]', `[data-id="${CSS.escape(state.selectedId)}"].deliverable-row`);
      announce(`${item.shortTitle} approved in the simulated workflow.`);
    }, 310);
  }

  function openChangeModal() {
    const item = selectedDeliverable();
    if (item.status === "published" || (state.activeVersions[item.id] || item.currentVersion) !== item.currentVersion) return;
    previouslyFocused = document.activeElement;
    modalContext = { id: item.id, timecode: state.currentTimecodes[item.id] || 0 };
    elements.modalTimecode.textContent = formatTime(modalContext.timecode);
    elements.changeForm.reset();
    elements.changeForm.elements.include_timecode.checked = true;
    elements.changeModal.hidden = false;
    document.body.classList.add("is-locked");
    window.requestAnimationFrame(() => elements.changeForm.elements.change_request.focus());
  }

  function closeChangeModal() {
    if (elements.changeModal.hidden) return;
    elements.changeModal.hidden = true;
    modalContext = null;
    releaseBodyLock();
    previouslyFocused?.focus?.();
  }

  function submitChangeRequest(form) {
    const body = form.elements.change_request.value.trim();
    if (!body || !modalContext) return;
    const item = state.deliverables.find((candidate) => candidate.id === modalContext.id);
    if (!item) return;
    const now = new Date();
    const timeLabel = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now);
    item.status = "changes";
    item.due = "Return requested";
    item.comments.push({
      id: `request-${Date.now()}`,
      type: "comment",
      author: "Fitia team",
      role: "Fitia",
      created: `Now · ${timeLabel}`,
      activityAt: now.toISOString(),
      version: item.currentVersion,
      timecode: form.elements.include_timecode.checked ? modalContext.timecode : null,
      resolved: false,
      body,
    });
    item.comments.push({ id: `request-system-${Date.now()}`, type: "system", created: `Now · ${timeLabel}`, activityAt: now.toISOString(), tone: "ovo", body: "Changes requested by Fitia · simulated" });
    const advanced = reconcileSelectionToResults();
    closeChangeModal();
    state.reviewTab = advanced ? "review" : "activity";
    saveState();
    render();
    focusAfterRender(`[data-action="review-tab"][data-tab="${state.reviewTab}"]`, `[data-id="${CSS.escape(state.selectedId)}"].deliverable-row`);
    announce(`${item.shortTitle} returned to OVO in the simulated workflow.`);
  }

  function openMore() {
    previouslyFocused = document.activeElement;
    elements.moreBackdrop.hidden = false;
    document.body.classList.add("is-locked");
    window.requestAnimationFrame(() => elements.moreSheet.querySelector("button")?.focus());
  }

  function closeMore() {
    if (elements.moreBackdrop.hidden) return;
    elements.moreBackdrop.hidden = true;
    releaseBodyLock();
    previouslyFocused?.focus?.();
  }

  function releaseBodyLock() {
    if (elements.changeModal.hidden && elements.moreBackdrop.hidden) document.body.classList.remove("is-locked");
  }

  function resetDemo() {
    window.clearTimeout(actionTimer);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    document.body.classList.add("is-resetting");
    state = baseState();
    state.route = "overview";
    if (window.location.hash !== "#overview") window.history.replaceState(null, "", "#overview");
    closeMore();
    render();
    focusAfterRender('[data-route="overview"][aria-current="page"]');
    announce("Fitia portal demo restored to its original simulated state.");
    window.setTimeout(() => document.body.classList.remove("is-resetting"), 280);
  }

  function selectAdjacent(direction) {
    const visible = filteredDeliverables();
    if (!visible.length) return;
    const currentIndex = Math.max(0, visible.findIndex((item) => item.id === state.selectedId));
    const nextIndex = (currentIndex + direction + visible.length) % visible.length;
    state.selectedId = visible[nextIndex].id;
    visible[nextIndex].unread = false;
    saveState();
    render();
    focusAfterRender(`[data-id="${CSS.escape(state.selectedId)}"].deliverable-row`);
  }

  function trapFocus(event, container) {
    if (event.key !== "Tab") return;
    const focusable = [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  document.addEventListener("click", (event) => {
    const skipLink = event.target.closest('.skip-link[href="#workspace-main"]');
    if (skipLink) {
      event.preventDefault();
      const workspace = document.getElementById("workspace-main");
      workspace?.focus({ preventScroll: true });
      workspace?.scrollIntoView({ block: "start" });
      return;
    }

    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      navigate(routeButton.dataset.route);
      return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    if (action === "open-deliverable" || action === "select-deliverable") openDeliverable(actionTarget.dataset.id);
    else if (action === "view-all-deliverables") navigate("deliverables");
    else if (action === "filter") {
      state.filter = actionTarget.dataset.filter;
      reconcileSelectionToResults();
      saveState();
      render();
      focusAfterRender(`[data-action="filter"][data-filter="${CSS.escape(state.filter)}"]`);
    }
    else if (action === "clear-filters") {
      state.filter = "all";
      state.search = "";
      saveState();
      render();
      focusAfterRender('[data-action="filter"][data-filter="all"]');
    }
    else if (action === "review-tab") setReviewTab(actionTarget.dataset.tab);
    else if (action === "mobile-back") {
      state.mobileReview = false;
      state.reviewTab = "review";
      render();
      focusAfterRender(`[data-id="${CSS.escape(state.selectedId)}"].deliverable-row`);
    }
    else if (action === "version") {
      const item = selectedDeliverable();
      state.activeVersions[item.id] = Number(actionTarget.dataset.version);
      saveState();
      render();
      focusAfterRender(`[data-action="version"][data-version="${Number(actionTarget.dataset.version)}"]`);
    }
    else if (action === "marker") selectMarker(actionTarget.dataset.commentId, actionTarget.dataset.timecode, "activity");
    else if (action === "comment-timecode") selectMarker(actionTarget.dataset.commentId, actionTarget.dataset.timecode, "review");
    else if (action === "approve") approveSelected(actionTarget);
    else if (action === "open-change-modal") openChangeModal();
    else if (action === "close-change-modal") closeChangeModal();
    else if (action === "open-more") openMore();
    else if (action === "close-more") closeMore();
    else if (action === "ask-reset") updateResetConfirmation(actionTarget, true);
    else if (action === "cancel-reset") updateResetConfirmation(actionTarget, false);
    else if (action === "confirm-reset") resetDemo();
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-deliverable-search]")) {
      const position = event.target.selectionStart;
      state.search = event.target.value;
      reconcileSelectionToResults();
      saveState();
      render();
      window.requestAnimationFrame(() => {
        const input = document.querySelector("[data-deliverable-search]");
        input?.focus();
        input?.setSelectionRange(position, position);
      });
    }
    if (event.target.closest("[data-comment-form]")) {
      const form = event.target.closest("[data-comment-form]");
      form.querySelector("[data-comment-send]").disabled = !form.elements.comment.value.trim();
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.matches("[data-comment-form]")) {
      event.preventDefault();
      addComment(event.target);
    } else if (event.target.matches("[data-change-form]")) {
      event.preventDefault();
      submitChangeRequest(event.target);
    }
  });

  elements.changeModal.addEventListener("click", (event) => {
    if (event.target === elements.changeModal) closeChangeModal();
  });

  elements.moreBackdrop.addEventListener("click", (event) => {
    if (event.target === elements.moreBackdrop) closeMore();
  });

  document.addEventListener("keydown", (event) => {
    if (!elements.changeModal.hidden) {
      if (event.key === "Escape") { event.preventDefault(); closeChangeModal(); return; }
      trapFocus(event, elements.changeModal);
      return;
    }
    if (!elements.moreBackdrop.hidden) {
      if (event.key === "Escape") { event.preventDefault(); closeMore(); return; }
      trapFocus(event, elements.moreSheet);
      return;
    }

    const isTyping = event.target.matches("input, textarea, [contenteditable=\"true\"]");
    if (isTyping) return;
    if (event.key === "/") {
      event.preventDefault();
      if (state.route !== "deliverables") navigate("deliverables");
      window.requestAnimationFrame(() => document.querySelector("[data-deliverable-search]")?.focus());
    } else if (state.route === "deliverables" && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const button = [...document.querySelectorAll('[data-action="approve"]:not([disabled])')].find((candidate) => isRendered(candidate));
      if (button) approveSelected(button);
    } else if (state.route === "deliverables" && event.key.toLowerCase() === "r") {
      event.preventDefault();
      openChangeModal();
    } else if (state.route === "deliverables" && event.target.closest(".deliverable-list") && event.key === "ArrowDown") {
      event.preventDefault(); selectAdjacent(1);
    } else if (state.route === "deliverables" && event.target.closest(".deliverable-list") && event.key === "ArrowUp") {
      event.preventDefault(); selectAdjacent(-1);
    }
  });

  window.addEventListener("hashchange", () => {
    const nextRoute = routeFromHash();
    if (nextRoute !== state.route) state.mobileReview = false;
    state.route = nextRoute;
    render();
  });

  if (!window.location.hash || !ROUTES.includes(window.location.hash.slice(1))) {
    window.history.replaceState(null, "", "#overview");
    state.route = "overview";
  }

  window.setTimeout(() => {
    elements.loading.hidden = true;
    elements.app.hidden = false;
    render();
  }, 220);
})();
