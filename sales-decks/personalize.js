(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const status = document.querySelector("[data-profile-status]");
  const alert = document.querySelector("[data-profile-alert]");

  const CAMPAIGN_LANES = {
    fitness: [
      ["Performance apparel", "Training authority, product-in-use content and a natural reason to talk about performance."],
      ["Sports nutrition", "A credible bridge from routine and recovery content into products the audience can actually adopt."],
    ],
    wellness: [
      ["Active wellness", "Daily rituals and trusted recommendations give wellness brands a believable entry point."],
      ["Nutrition + recovery", "Repeatable habits create room for products that support energy, sleep and recovery."],
    ],
    fashion: [
      ["Performance fashion", "Strong visual taste turns product integration into content people would watch anyway."],
      ["Lifestyle apparel", "Outfit-led storytelling gives brands repeatable moments across launches and seasonal drops."],
    ],
    beauty: [
      ["Beauty + skincare", "Demonstration, routine and transformation formats create a clear product story."],
      ["Wellness beauty", "A broader self-care angle opens conversations beyond one-off product placement."],
    ],
    food: [
      ["Better-for-you food", "Recipe and routine content makes trial feel native instead of inserted."],
      ["Kitchen + nutrition", "Utility-led content gives the audience a reason to save, share and come back."],
    ],
    travel: [
      ["Travel + hospitality", "Destination storytelling can sell the experience without losing the creator's point of view."],
      ["Lifestyle essentials", "Travel routines create natural use cases for products across movement, style and wellness."],
    ],
    business: [
      ["Creator technology", "A business-minded audience responds to tools that improve output, workflow and growth."],
      ["Modern work", "Founder-led storytelling creates a credible bridge into software, finance and productivity."],
    ],
    tech: [
      ["Consumer technology", "Demonstration and opinion-led content can turn features into a reason to care."],
      ["Creator tools", "A creator-first workflow makes software useful, visible and commercially relevant."],
    ],
    parenting: [
      ["Family lifestyle", "Real routines give household products context, trust and repeat exposure."],
      ["Wellness + essentials", "Everyday utility gives brands a strong reason to enter the conversation."],
    ],
    lifestyle: [
      ["Lifestyle apparel", "A recognizable point of view gives products a natural place inside everyday content."],
      ["Consumer wellness", "Routine-led storytelling connects attention to products the audience can use repeatedly."],
    ],
  };

  const POSITIONING = {
    fitness: "Performance-led content with a credible path into apparel, nutrition, recovery and training partnerships.",
    wellness: "Trust-led wellness content that can move audiences from inspiration into repeatable habits and products.",
    fashion: "A distinct visual point of view that can make brand product feel native, current and worth watching.",
    beauty: "Demonstration and routine content with the trust needed to make beauty recommendations convert.",
    food: "Useful, repeatable content that lets food and nutrition brands earn attention through real utility.",
    travel: "Experience-led storytelling that can put destinations and lifestyle products inside a credible narrative.",
    business: "Authority-led content with a natural bridge into tools, services and brands built for ambitious people.",
    tech: "Opinion and demonstration content that can translate product features into audience relevance.",
    parenting: "High-trust everyday storytelling with a natural fit for family, wellness and household partnerships.",
    lifestyle: "A recognizable life and point of view that gives the right consumer brands a believable role.",
  };

  function parseHandle(input) {
    let value = String(input || "").trim().toLowerCase();
    if (!value) return "";
    try {
      if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(value)) {
        const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
        value = parsed.pathname.split("/").filter(Boolean)[0] || "";
      }
    } catch (_) {
      return "";
    }
    value = value.replace(/^@+/, "").split(/[/?#]/)[0];
    return /^[a-z0-9._]{1,30}$/.test(value) ? value : "";
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return new Intl.NumberFormat("en-US").format(number);
  }

  function formatCompact(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: number >= 100_000 ? 1 : 0 }).format(number);
  }

  function firstName(name, handle) {
    const candidate = String(name || "").trim().split(/\s+/)[0];
    if (candidate) return candidate;
    return String(handle || "Creator").split(/[._]/)[0].replace(/^./, (letter) => letter.toUpperCase());
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function truncate(value, max = 112) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    return normalized.length > max ? `${normalized.slice(0, max - 1).trimEnd()}…` : normalized;
  }

  function truncateAtWord(value, max = 112) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    const clipped = normalized.slice(0, max - 1).trimEnd();
    const boundary = clipped.lastIndexOf(" ");
    const safe = boundary >= Math.floor(max * 0.55) ? clipped.slice(0, boundary) : clipped;
    return `${safe}…`;
  }

  function truncateMultiline(value, max = 180) {
    const normalized = String(value || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1).trimEnd()}…`;
  }

  function emailLocalPart(name, handle) {
    const candidate = firstName(name, handle)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24);
    return candidate || String(handle || "creator").replace(/[^a-z0-9]/g, "").slice(0, 24) || "creator";
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function setImage(element, source) {
    if (!element || !source) return;
    const personalized = document.body.classList.contains("is-personalized");
    const fallback = personalized ? "" : (element.dataset.fallback || element.getAttribute("src") || "");
    element.referrerPolicy = "no-referrer";
    element.src = source;
    element.addEventListener("error", () => {
      if (fallback && element.src !== new URL(fallback, window.location.href).href) {
        element.src = fallback;
        return;
      }
      element.hidden = true;
      element.closest("[data-photo-frame], [data-post-card]")?.setAttribute("hidden", "");
      element.closest(".ig-preview-profile-row")?.classList.add("avatar-missing");
    }, { once: true });
  }

  async function preloadImages(urls) {
    const unique = [...new Set(urls.filter(Boolean))];
    if (!unique.length) return new Set();

    const loadedSet = new Set();
    const loaders = unique.map((url) => new Promise((resolve) => {
      const image = new Image();
      image.referrerPolicy = "no-referrer";
      image.onload = () => {
        loadedSet.add(url);
        resolve(url);
      };
      image.onerror = () => resolve(null);
      image.src = url;
    }));
    let timer;
    const timeout = new Promise((resolve) => {
      timer = window.setTimeout(() => resolve([]), 2_600);
    });
    await Promise.race([Promise.all(loaders), timeout]);
    window.clearTimeout(timer);
    return loadedSet;
  }

  function choosePrimaryNiche(profile) {
    const inferred = Array.isArray(profile.niche_hints) ? profile.niche_hints : [];
    const category = String(profile.category || "").toLowerCase();
    const match = Object.keys(CAMPAIGN_LANES).find((niche) => category.includes(niche));
    return inferred.find((niche) => CAMPAIGN_LANES[niche]) || match || "lifestyle";
  }

  function applyCampaignLanes(profile = {}, proposal = {}) {
    const niche = choosePrimaryNiche(profile);
    const defaults = CAMPAIGN_LANES[niche] || CAMPAIGN_LANES.lifestyle;
    const campaignOne = truncateAtWord(proposal.campaign_one || defaults[0][0], 30);
    const campaignTwo = truncateAtWord(proposal.campaign_two || defaults[1][0], 30);
    const campaignOneCopy = proposal.campaign_one
      ? "We build a focused buyer list and pitch this lane with a creator-specific activation angle."
      : defaults[0][1];
    const campaignTwoCopy = proposal.campaign_two
      ? "We open a second front in this lane, then iterate the pitch from live market response."
      : defaults[1][1];

    setText("[data-campaign-one]", campaignOne);
    setText("[data-campaign-two]", campaignTwo);
    setText("[data-campaign-one-copy]", campaignOneCopy);
    setText("[data-campaign-two-copy]", campaignTwoCopy);
  }

  async function applyProfile(profile, proposal = {}) {
    const handle = profile.handle;
    const rawFirst = firstName(profile.full_name, handle);
    const name = truncateAtWord(profile.full_name || titleCase(handle), 36);
    const first = truncate(rawFirst, 10);
    const candidatePosts = Array.isArray(profile.top_posts) && profile.top_posts.length
      ? profile.top_posts
      : Array.isArray(profile.recent_posts)
        ? profile.recent_posts.slice(0, 3)
        : [];
    const loadedImages = await preloadImages([
      profile.profile_pic_url,
      ...candidatePosts.map((post) => post.thumbnail),
    ]);
    const posts = candidatePosts.filter((post) => loadedImages.has(post.thumbnail)).slice(0, 3);
    const primaryNiche = choosePrimaryNiche(profile);
    const niches = Array.isArray(profile.niche_hints) && profile.niche_hints.length
      ? profile.niche_hints
      : [primaryNiche, "lifestyle", "community"];
    const category = truncate(profile.category || `${titleCase(primaryNiche)} creator`, 48);
    const whyInvited = truncateAtWord(
      proposal.why || `${first}'s content has a clear point of view, an identifiable audience and room to build a much more deliberate commercial pipeline.`,
      155,
    );

    document.body.classList.add("is-personalized");
    document.body.classList.toggle("has-long-first", rawFirst.length > 6);
    document.body.classList.toggle("has-profile-only", candidatePosts.length === 0);
    document.body.classList.toggle("has-no-content-images", posts.length === 0);
    document.body.dataset.profileHandle = handle;
    setText("[data-creator-name]", name);
    setText("[data-creator-first]", first);
    setText("[data-creator-handle]", `@${handle}`);
    setText("[data-creator-handle-plain]", handle);
    setText("[data-creator-email]", `${emailLocalPart(profile.full_name, handle)}@ovotalent.com`);
    setText("[data-creator-bio]", truncateMultiline(profile.bio || "The profile tells us what the audience comes for. The proposal turns that attention into a focused outbound thesis.", 180));
    setText("[data-creator-category]", category);
    setText("[data-creator-followers]", formatCompact(profile.followers));
    setText("[data-creator-followers-full]", formatNumber(profile.followers));
    setText("[data-creator-following]", formatCompact(profile.following));
    setText("[data-creator-posts]", formatCompact(profile.posts_count));
    setText("[data-avg-likes]", formatCompact(profile.avg_likes));
    setText("[data-avg-comments]", formatCompact(profile.avg_comments));
    setText("[data-avg-views]", profile.avg_views === null ? "—" : formatCompact(profile.avg_views));
    setText("[data-engagement-rate]", profile.engagement_rate === null ? "—" : `${profile.engagement_rate}%`);
    setText("[data-signal-label]", candidatePosts.length ? "Recent content signal" : "Public profile signal");
    setText("[data-sample-size]", candidatePosts.length ? `${profile.sample_size || candidatePosts.length} recent posts` : "profile-level pull");
    setText(
      ".sample-disclaimer",
      candidatePosts.length && !posts.length
        ? "Recent-post metrics available · source imagery unavailable · not private Instagram Insights"
        : "Directional recent-post sample · not private Instagram Insights",
    );
    setText("[data-why-invited]", whyInvited);
    setText("[data-positioning]", POSITIONING[primaryNiche] || POSITIONING.lifestyle);
    setText(
      "[data-profile-status-line]",
      candidatePosts.length ? `Live Instagram profile · ${profile.sample_size || candidatePosts.length}-post sample` : "Live Instagram profile · profile-level data",
    );
    setText("[data-chrome-deck]", `Private OVO proposal · @${handle}`);

    document.querySelectorAll("[data-verified]").forEach((element) => {
      element.hidden = !profile.verified;
    });

    const avatar = document.querySelector("[data-creator-avatar]");
    if (loadedImages.has(profile.profile_pic_url)) {
      setImage(avatar, profile.profile_pic_url);
    } else if (avatar) {
      avatar.hidden = true;
      avatar.closest(".ig-preview-profile-row")?.classList.add("avatar-missing");
    }

    document.querySelectorAll("[data-creator-photo]").forEach((image) => {
      const index = Number(image.dataset.creatorPhoto || 0);
      const source = posts.length ? posts[index % posts.length]?.thumbnail : "";
      if (source) setImage(image, source);
      else image.closest("[data-photo-frame]")?.setAttribute("hidden", "");
    });

    document.querySelectorAll("[data-post-card]").forEach((card) => {
      const index = Number(card.dataset.postCard || 0);
      const post = posts[index];
      if (!post) {
        card.hidden = true;
        return;
      }
      setImage(card.querySelector("[data-post-image]"), post.thumbnail);
      const caption = card.querySelector("[data-post-caption]");
      const likes = card.querySelector("[data-post-likes]");
      const comments = card.querySelector("[data-post-comments]");
      if (caption) caption.textContent = truncate(post.caption || "Recent Instagram content", 86);
      if (likes) likes.textContent = `${formatCompact(post.likes)} likes`;
      if (comments) comments.textContent = `${formatCompact(post.comments)} comments`;
    });

    document.querySelectorAll("[data-niche]").forEach((element) => {
      const index = Number(element.dataset.niche || 0);
      element.textContent = titleCase(niches[index] || ["Culture", "Lifestyle", "Community"][index]);
    });

    applyCampaignLanes(profile, proposal);
    document.title = `${first} × OVO Talent`;
  }

  function showAlert(message) {
    if (!alert) return;
    alert.textContent = message;
    alert.hidden = false;
  }

  const input = params.get("ig") || params.get("handle") || "";
  const handle = parseHandle(input);
  const expiry = params.get("exp") || "";
  const signature = params.get("sig") || "";
  const proposalToken = params.get("p") || "";

  window.OVOProfileReady = (async () => {
    applyCampaignLanes();

    if (!input) {
      if (status) status.textContent = "Private creator presentation";
      return null;
    }

    if (!handle) {
      if (status) status.textContent = "Using presentation fallback";
      showAlert("That Instagram handle is invalid. The deck is showing the presentation fallback.");
      return null;
    }

    if (!expiry || !signature || !proposalToken) {
      if (status) status.textContent = "Using presentation fallback";
      showAlert("This profile URL was not generated from the presentation room. The deck is showing the fallback.");
      return null;
    }

    if (status) status.textContent = `Curating @${handle}`;

    try {
      const query = new URLSearchParams({ handle, exp: expiry, sig: signature, p: proposalToken });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 11_000);
      let response;
      try {
        response = await fetch(`/api/instagram-profile?${query.toString()}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Profile lookup failed.");
      await applyProfile(payload.profile, payload.proposal || {});
      if (status) status.textContent = `Built for @${handle}`;
      return payload.profile;
    } catch (error) {
      console.error("[OVO proposal]", error);
      if (status) status.textContent = "Profile unavailable · presentation fallback";
      showAlert("Instagram profile unavailable. This is the generic presentation deck.");
      setText("[data-chrome-deck]", "Private creator presentation");
      return null;
    }
  })();
})();
