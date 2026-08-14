(function () {
  "use strict";

  const links = Array.from(document.querySelectorAll(".blueprint-nav a"));
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  function openContainerForTarget(target) {
    if (!target) return;
    const container = target.closest("details");
    if (container) container.open = true;
  }

  function revealHashTarget() {
    if (!window.location.hash) return;
    try {
      openContainerForTarget(document.querySelector(window.location.hash));
    } catch (_error) {
      // Ignore malformed user-provided fragments.
    }
  }

  revealHashTarget();
  window.addEventListener("hashchange", revealHashTarget);
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    try {
      openContainerForTarget(document.querySelector(anchor.getAttribute("href")));
    } catch (_error) {
      // Ignore malformed fragments without breaking other page interactions.
    }
  });

  if ("IntersectionObserver" in window && sections.length > 0) {
    const linkById = new Map(
      links.map((link) => [link.getAttribute("href").slice(1), link])
    );
    const navList = document.querySelector(".blueprint-nav ol");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length === 0) return;

        links.forEach((link) => link.removeAttribute("aria-current"));
        const active = linkById.get(visible[0].target.id);
        if (!active) return;

        active.setAttribute("aria-current", "true");
        if (navList && navList.scrollWidth > navList.clientWidth) {
          active.scrollIntoView({
            behavior: "auto",
            block: "nearest",
            inline: "center"
          });
        }
      },
      {
        rootMargin: "-128px 0px -58% 0px",
        threshold: [0, 0.1]
      }
    );

    sections.forEach((section) => observer.observe(section));
  }
})();

(function () {
  "use strict";

  const data = window.PEPTIDE_MEDIA_INTELLIGENCE;
  const byId = (id) => document.getElementById(id);

  const escapeHtml = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));

  const safeUrl = (value) => {
    if (!value) return null;
    try {
      const parsed = new URL(String(value), window.location.href);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
    } catch (_error) {
      return null;
    }
  };

  const externalLink = (url, label, className = "") => {
    const safe = safeUrl(url);
    if (!safe) return `<span>${escapeHtml(label)}</span>`;
    const classAttribute = className ? ` class="${escapeHtml(className)}"` : "";
    return `<a${classAttribute} href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  };

  const unique = (values) =>
    Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
      String(left).localeCompare(String(right))
    );

  const sourceNotes = new Map();
  const sourceClaims = new Map();

  function indexRows() {
    data.notes.forEach((note) => {
      const id = note["Source ID"];
      if (!sourceNotes.has(id)) sourceNotes.set(id, []);
      sourceNotes.get(id).push(note);
    });

    data.sources.forEach((source) => {
      const company = source.Company;
      sourceClaims.set(
        source.ID,
        data.claims.filter((claim) =>
          String(claim.Company || "").toLowerCase().includes(String(company || "").toLowerCase()) ||
          String(company || "").toLowerCase().includes(String(claim.Company || "").toLowerCase())
        )
      );
    });
  }

  function renderExecutiveDecisions() {
    const root = byId("executive-decisions");
    if (!root) return;
    root.innerHTML = data.executiveDecisions.map((row) => `
      <article class="executive-decision-card">
        <span>${escapeHtml(row.Confidence)} confidence</span>
        <h4>${escapeHtml(row.Question)}</h4>
        <p><strong>${escapeHtml(row.Answer)}</strong></p>
        <dl>
          <div><dt>Evidence</dt><dd>${escapeHtml(row.Evidence)}</dd></div>
          <div><dt>Why</dt><dd>${escapeHtml(row.Why)}</dd></div>
          <div><dt>First proof</dt><dd>${escapeHtml(row["First proof"])}</dd></div>
        </dl>
      </article>
    `).join("");
  }

  function renderCurrentContext() {
    const root = byId("current-context-ledger");
    if (!root) return;
    root.innerHTML = data.currentContext.map((row) => `
      <article class="context-card">
        <span>${escapeHtml(row.Date)}</span>
        <h4>${escapeHtml(row.Topic)}</h4>
        <p><strong>Changed:</strong> ${escapeHtml(row["What changed"])}</p>
        <dl>
          <div><dt>Did not change</dt><dd>${escapeHtml(row["What did NOT change"])}</dd></div>
          <div><dt>Implication</dt><dd>${escapeHtml(row["Business implication"])}</dd></div>
          <div><dt>Next review</dt><dd>${escapeHtml(row["Next review"])}</dd></div>
          <div><dt>Evidence</dt><dd>${escapeHtml(row["Evidence class"])}</dd></div>
        </dl>
        <p>${externalLink(row["Primary / current link"], "Open current source ↗")}</p>
      </article>
    `).join("");
  }

  function renderFastQueue() {
    const root = byId("fast-listening-queue");
    if (!root) return;
    root.innerHTML = data.fastQueue.map((row) => `
      <li>
        <b>${escapeHtml(row[0])}</b>
        <a href="${escapeHtml(safeUrl(row[4]) || "#founder-media")}" target="_blank" rel="noopener noreferrer">
          <strong>${escapeHtml(row[1])}</strong>
          <span>${escapeHtml(row[2])}</span>
          <small>${escapeHtml(row[3])}</small>
        </a>
      </li>
    `).join("");
  }

  function renderCockpitQueue() {
    const root = byId("cockpit-listening-queue");
    if (!root) return;
    root.innerHTML = data.fastQueue.slice(0, 5).map((row) => `
      <li>
        <span>${escapeHtml(String(row[0]).padStart(2, "0"))}</span>
        <div>
          <strong>${escapeHtml(row[1])}</strong>
          <p>${escapeHtml(row[3])}</p>
        </div>
        ${externalLink(row[4], `Listen · ${row[2]} ↗`)}
      </li>
    `).join("");
  }

  function mediaType(source) {
    const url = String(source["Media link"] || "");
    if (url.includes("youtube.com")) return "YouTube";
    if (url.includes("podcasts.apple.com")) return "Apple Podcasts";
    if (url.includes("acast.com") || url.includes("buzzsprout.com")) return "Audio podcast";
    return "Founder media";
  }

  function sourceHaystack(source) {
    const notes = sourceNotes.get(source.ID) || [];
    const claims = sourceClaims.get(source.ID) || [];
    return [
      ...Object.values(source),
      ...notes.flatMap((note) => Object.values(note)),
      ...claims.flatMap((claim) => Object.values(claim))
    ].join(" ").toLowerCase();
  }

  function renderNotes(source) {
    const notes = sourceNotes.get(source.ID) || [];
    if (notes.length === 0) return "";
    return `
      <details>
        <summary>${notes.length} timestamped lessons</summary>
        <ol class="media-note-list">
          ${notes.map((note) => {
            const timestamp = note.Timestamp || "Episode";
            const link = safeUrl(note["Timestamp link"]);
            const timeMarkup = link
              ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(timestamp)} ↗</a>`
              : `<time>${escapeHtml(timestamp)}</time>`;
            return `
              <li>
                <header><b>${escapeHtml(note.Topic)}</b>${timeMarkup}</header>
                <p>${escapeHtml(note["What the operator said / what happened"])}</p>
                <p><strong>Noli application:</strong> ${escapeHtml(note["What Biologix can learn"])}</p>
                <p><strong>Evidence:</strong> ${escapeHtml(note["Evidence class"])}. ${escapeHtml(note["Freshness note"])}</p>
              </li>
            `;
          }).join("")}
        </ol>
      </details>
    `;
  }

  function renderSourceCard(source) {
    const notes = sourceNotes.get(source.ID) || [];
    return `
      <article class="media-card" id="media-source-${escapeHtml(source.ID)}">
        <header>
          <div>
            <span class="media-badge">${escapeHtml(source.Priority)}</span>
            <h3>${escapeHtml(source["Episode / source"])}</h3>
          </div>
          <span>${escapeHtml(source.Published)}</span>
        </header>
        <p class="media-company">${escapeHtml(source.Company)} · ${escapeHtml(source["Founder / operator"])}</p>
        <p class="media-relevance">${escapeHtml(source["Why it matters"])}</p>
        <div class="media-badges">
          <span class="media-badge">${escapeHtml(source.Lane)}</span>
          <span class="media-badge">${escapeHtml(mediaType(source))}</span>
          <span class="media-badge">${escapeHtml(source.Freshness)}</span>
          <span class="media-badge">${escapeHtml(source.Confidence)}</span>
        </div>
        <dl>
          <div><dt>At recording</dt><dd>${escapeHtml(source["Stage at recording"])}</dd></div>
          <div><dt>Business model</dt><dd>${escapeHtml(source.Model)}</dd></div>
          <div><dt>Current check</dt><dd>${escapeHtml(source["Current status at 2026-07-26"])}</dd></div>
          <div><dt>Notes indexed</dt><dd>${notes.length}</dd></div>
        </dl>
        <div class="media-card-actions">
          ${externalLink(source["Media link"], "Watch / listen ↗", "button-link button-link--primary")}
          ${externalLink(source["Current-check link"], "Open current check ↗", "button-link")}
        </div>
        ${renderNotes(source)}
      </article>
    `;
  }

  const state = { query: "", lane: "", priority: "" };

  function renderSources() {
    const root = byId("media-source-grid");
    const count = byId("media-results-count");
    if (!root || !count) return;

    const rows = data.sources.filter((source) => {
      if (state.lane && source.Lane !== state.lane) return false;
      if (state.priority && source.Priority !== state.priority) return false;
      if (state.query && !sourceHaystack(source).includes(state.query)) return false;
      return true;
    });

    count.textContent = `${rows.length} of ${data.sources.length} media sources shown`;
    root.innerHTML = rows.length
      ? rows.map(renderSourceCard).join("")
      : '<p class="media-empty">No source matches those filters. Reset the library or try a broader term.</p>';

    renderClaims(state.query);
  }

  function populateControls() {
    const lane = byId("media-lane");
    const priority = byId("media-priority");
    if (!lane || !priority) return;

    lane.insertAdjacentHTML(
      "beforeend",
      unique(data.sources.map((source) => source.Lane))
        .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
        .join("")
    );
    priority.insertAdjacentHTML(
      "beforeend",
      unique(data.sources.map((source) => source.Priority))
        .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
        .join("")
    );

    byId("media-controls")?.addEventListener("submit", (event) => event.preventDefault());
    byId("media-search")?.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      renderSources();
    });
    lane.addEventListener("change", (event) => {
      state.lane = event.target.value;
      renderSources();
    });
    priority.addEventListener("change", (event) => {
      state.priority = event.target.value;
      renderSources();
    });
    byId("media-reset")?.addEventListener("click", () => {
      state.query = "";
      state.lane = "";
      state.priority = "";
      byId("media-search").value = "";
      lane.value = "";
      priority.value = "";
      renderSources();
      byId("media-search").focus();
    });
  }

  function renderClaims(query = "") {
    const root = byId("claim-ledger");
    if (!root) return;
    const rows = data.claims.filter((row) =>
      !query || Object.values(row).join(" ").toLowerCase().includes(query)
    );
    root.innerHTML = rows.length ? rows.map((row) => `
      <article class="data-card">
        <span>${escapeHtml(row["Verification status"])}</span>
        <h4>${escapeHtml(row["Claim to evaluate"])}</h4>
        <p>${escapeHtml(row["Current finding at 2026-07-26"])}</p>
        <dl>
          <div><dt>Company</dt><dd>${escapeHtml(row.Company)}</dd></div>
          <div><dt>Confidence</dt><dd>${escapeHtml(row["Confidence (0-5)"])}/5</dd></div>
          <div><dt>Decision impact</dt><dd>${escapeHtml(row["Decision impact"])}</dd></div>
          <div><dt>Evidence</dt><dd>${escapeHtml(row["Evidence class"])}</dd></div>
        </dl>
        <p>${externalLink(row["Verification link"], "Open verification ↗")}</p>
      </article>
    `).join("") : '<p class="media-empty">No checked claim matches the current search.</p>';
  }

  function renderLessons() {
    const root = byId("lesson-ledger");
    if (!root) return;
    root.innerHTML = data.lessons.map((row) => `
      <article class="data-card">
        <span>${escapeHtml(row.Priority)} · ${escapeHtml(row.Confidence)}</span>
        <h4>${escapeHtml(row.Lesson)}</h4>
        <p>${escapeHtml(row["How to apply"])}</p>
        <dl>
          <div><dt>Domain</dt><dd>${escapeHtml(row.Domain)}</dd></div>
          <div><dt>Evidence</dt><dd>${escapeHtml(row.Evidence)}</dd></div>
          <div><dt>Proof</dt><dd>${escapeHtml(row["Metric / proof"])}</dd></div>
        </dl>
      </article>
    `).join("");
  }

  function renderAntiLessons() {
    const root = byId("anti-lesson-ledger");
    if (!root) return;
    root.innerHTML = data.antiLessons.map((row) => `
      <article class="data-card data-card--danger">
        <span>${escapeHtml(row["Risk level"])} risk · ${escapeHtml(row["Source / pattern"])}</span>
        <h4>${escapeHtml(row["Do not copy"])}</h4>
        <p><strong>Why:</strong> ${escapeHtml(row.Why)}</p>
        <p><strong>Safer pattern:</strong> ${escapeHtml(row["Safer pattern"])}</p>
      </article>
    `).join("");
  }

  function renderActions() {
    const root = byId("action-ledger");
    if (!root) return;
    root.innerHTML = data.actions.map((row) => `
      <article class="data-card">
        <span>${escapeHtml(row.Window)} · ${escapeHtml(row.Priority)}</span>
        <h4>${escapeHtml(row.Action)}</h4>
        <dl>
          <div><dt>Workstream</dt><dd>${escapeHtml(row.Workstream)}</dd></div>
          <div><dt>Owner</dt><dd>${escapeHtml(row.Owner)}</dd></div>
          <div><dt>Dependency</dt><dd>${escapeHtml(row.Dependency)}</dd></div>
          <div><dt>Done when</dt><dd>${escapeHtml(row["Definition of done"])}</dd></div>
          <div><dt>Metric</dt><dd>${escapeHtml(row.Metric)}</dd></div>
        </dl>
      </article>
    `).join("");
  }

  function renderWatchlist() {
    const root = byId("watchlist-ledger");
    if (!root) return;
    root.innerHTML = data.watchlist.map((row) => `
      <article class="data-card">
        <span>${escapeHtml(row.Cadence)} review · ${escapeHtml(row.Owner)}</span>
        <h4>${escapeHtml(row.Subject)}</h4>
        <p>${escapeHtml(row["What to watch"])}</p>
        <dl>
          <div><dt>Current state</dt><dd>${escapeHtml(row["Current state"])}</dd></div>
          <div><dt>Trigger</dt><dd>${escapeHtml(row.Trigger)}</dd></div>
        </dl>
        <p>${externalLink(row.Source, "Open watch source ↗")}</p>
      </article>
    `).join("");
  }

  function showDatasetError(message) {
    const status = byId("dataset-status");
    const grid = byId("media-source-grid");
    if (status) status.textContent = message;
    if (grid) grid.innerHTML = `<p class="media-empty">${escapeHtml(message)} The workbook remains available above.</p>`;
  }

  if (!data || !Array.isArray(data.sources) || !Array.isArray(data.notes)) {
    showDatasetError("The media dataset did not load.");
    return;
  }

  indexRows();
  renderExecutiveDecisions();
  renderCurrentContext();
  renderFastQueue();
  renderCockpitQueue();
  populateControls();
  renderLessons();
  renderAntiLessons();
  renderActions();
  renderWatchlist();
  renderSources();

  const status = byId("dataset-status");
  if (status) {
    status.textContent = `Current ${data.asOf} · ${data.stats.sources} sources · ${data.stats.notes} notes · ${data.stats.claims} checked claims`;
  }
})();
