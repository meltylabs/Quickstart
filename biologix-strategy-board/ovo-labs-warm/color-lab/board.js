(() => {
  const variants = {
    gold: {
      letter: "A",
      name: "Gilded Clinical",
      palette: "White · cream · champagne gold · black",
      note: "The gold direction you asked for. Expensive when gold stays a detail and the purchase action stays black.",
    },
    cobalt: {
      letter: "B",
      name: "Cobalt Standard",
      palette: "Optic white · cobalt · near-black · pale blue",
      note: "My recommendation. It gives the science and testing system a recognizable signal while keeping the commerce crisp and energetic.",
    },
    "black-label": {
      letter: "C",
      name: "Black Label",
      palette: "Graphite · white · polished silver · ice blue",
      note: "The strongest luxury posture. It can command attention, but photography and copy must keep it from drifting into crypto or bodybuilding.",
    },
    oxblood: {
      letter: "D",
      name: "Oxblood Editorial",
      palette: "Porcelain · ink · deep oxblood · mineral blush",
      note: "The female-leading option without defaulting to pink. It feels editorial and warm, with enough darkness to stay credible to male buyers.",
    },
  };

  const frame = document.querySelector("#variant-frame");
  const stage = document.querySelector(".preview-stage");
  const openLink = document.querySelector("#open-variant");
  const variantLetter = document.querySelector("#variant-letter");
  const variantName = document.querySelector("#variant-name");
  const variantPalette = document.querySelector("#variant-palette");
  const variantNote = document.querySelector("#variant-note");
  const tabs = [...document.querySelectorAll("[data-variant]")];
  const deviceButtons = [...document.querySelectorAll("[data-device]")];
  const validVariant = (value) => Object.hasOwn(variants, value);

  function selectVariant(key, updateHistory = true) {
    if (!validVariant(key)) return;
    const variant = variants[key];

    tabs.forEach((tab) => {
      const selected = tab.dataset.variant === key;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    variantLetter.textContent = variant.letter;
    variantName.textContent = variant.name;
    variantPalette.textContent = variant.palette;
    variantNote.textContent = variant.note;
    frame.title = `${variant.name} homepage preview`;
    frame.src = `${key}/`;
    openLink.href = `${key}/`;

    if (updateHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set("variant", key);
      window.history.replaceState({}, "", url);
    }

    window.localStorage.setItem("peptide-color-variant", key);
  }

  function selectDevice(device) {
    stage.dataset.deviceState = device;
    deviceButtons.forEach((button) => {
      const selected = button.dataset.device === device;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    window.localStorage.setItem("peptide-color-device", device);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectVariant(tab.dataset.variant));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      next.focus();
      selectVariant(next.dataset.variant);
    });
  });

  deviceButtons.forEach((button) => {
    button.addEventListener("click", () => selectDevice(button.dataset.device));
  });

  document.querySelector("[data-jump='cobalt']").addEventListener("click", () => {
    selectVariant("cobalt");
    document.querySelector(".preview-stage").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const queryVariant = new URLSearchParams(window.location.search).get("variant");
  const storedVariant = window.localStorage.getItem("peptide-color-variant");
  const initialVariant = validVariant(queryVariant) ? queryVariant : validVariant(storedVariant) ? storedVariant : "gold";
  const storedDevice = window.localStorage.getItem("peptide-color-device");

  selectVariant(initialVariant, false);
  selectDevice(storedDevice === "mobile" ? "mobile" : "desktop");
})();
