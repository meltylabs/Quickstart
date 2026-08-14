(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const token = params.get("b") || "";
  const expiry = params.get("exp") || "";
  const signature = params.get("sig") || "";
  const hasPersonalizationParams = Boolean(token || expiry || signature);
  const neutralBrand = {
    name: "Your brand",
    campaign: "Creator campaign workspace",
    logo: "",
    monogram: "YB",
    accent: "#facc15",
    creator: "Creator 01",
    deliverable: "Campaign launch reel",
    due: "Due in 2 days",
    feedback: "Hold the product frame one more beat. Keep the CTA on the final frame.",
    response: "Updated in v2. Timing adjusted and the final CTA is locked. Ready for review.",
    health: "4 of 6 approved",
  };

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function safeAccent(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#facc15";
  }

  function fallbackMonogram(name) {
    const words = String(name || "Brand").trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || "BR").toUpperCase();
  }

  function applyLogo(brand) {
    const image = document.querySelector("[data-brand-logo]");
    const monogram = document.querySelector("[data-brand-monogram]");
    if (!image || !monogram) return;

    monogram.textContent = brand.monogram || fallbackMonogram(brand.name);
    const source = String(brand.logo || "");
    if (!source) {
      image.hidden = true;
      image.removeAttribute("src");
      return;
    }

    image.hidden = false;
    image.alt = brand.name;
    image.addEventListener("error", () => {
      image.hidden = true;
    }, { once: true });
    image.src = source;
  }

  function applyBrand(brand, { unavailable = false } = {}) {
    const name = String(brand.name || "Brand").slice(0, 48);
    const campaign = String(brand.campaign || `${name} creator campaign`).slice(0, 72);
    const accent = safeAccent(brand.accent);

    document.body.classList.add("is-brand-personalized");
    // Keep the personalization marker distinct from the content hook below.
    // Using `data-brand-name` on <body> would make setText() replace the entire deck.
    document.body.dataset.personalizedBrand = name;
    document.querySelector(".portal-window")?.style.setProperty("--portal-accent", accent);

    setText("[data-prospect-name]", unavailable ? "your brand" : name);
    setText("[data-prospect-title]", unavailable ? "Your brand" : name);
    setText("[data-brand-name]", name);
    setText("[data-brand-comment-author]", name);
    setText("[data-brand-campaign]", campaign);
    setText("[data-brand-creator]", String(brand.creator || "Creator 01").slice(0, 40));
    setText("[data-brand-deliverable]", String(brand.deliverable || "Campaign launch reel").slice(0, 72));
    setText("[data-brand-due]", String(brand.due || "Due in 2 days").slice(0, 24));
    setText("[data-brand-feedback]", String(brand.feedback || neutralBrand.feedback).slice(0, 150));
    setText("[data-brand-response]", String(brand.response || neutralBrand.response).slice(0, 150));
    setText("[data-brand-health]", String(brand.health || "4 of 6 approved").slice(0, 28));
    setText("[data-brand-prepared-for]", unavailable ? "Brand presentation · personalization unavailable" : `Prepared for ${name} · brand presentation · 2026`);
    setText("[data-chrome-deck]", unavailable ? "Brand presentation · personalization unavailable" : `Brand presentation · ${name} × OVO`);
    setText("[data-brand-preview-label]", unavailable
      ? "Personalization unavailable · neutral workflow illustration; interactive example uses Fitia public-source demo data"
      : `Prospect-branded workflow illustration for ${name} · interactive example uses Fitia public-source demo data`);
    setText("[data-brand-close-copy]", `Next review: ${name} campaign direction, targeted creator shortlist, legal guardrails, and commercial plan. Then we lock terms and move into contracting.`);
    applyLogo(brand);
  }

  window.OVOBrandReady = (async () => {
    if (!hasPersonalizationParams) return null;
    if (!token || !expiry || !signature) {
      applyBrand(neutralBrand, { unavailable: true });
      return null;
    }

    const query = new URLSearchParams({ b: token, exp: expiry, sig: signature });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3_000);

    try {
      const response = await fetch(`/api/brand-presentation?${query.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.brand) {
        applyBrand(neutralBrand, { unavailable: true });
        return null;
      }
      applyBrand(payload.brand);
      return payload.brand;
    } catch (_) {
      applyBrand(neutralBrand, { unavailable: true });
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
})();
