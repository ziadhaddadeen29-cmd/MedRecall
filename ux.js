/* Presentation preferences are intentionally separate from academic progress. */
(function() {
  "use strict";
  // Start from a paint opportunity, not navigation/network time.
  const minimumSplash = new Promise(function(resolve) {
    requestAnimationFrame(function() { setTimeout(resolve, 2500); });
  });
  let finishingSplash = false;
  let enabled = true;
  try { enabled = localStorage.getItem("medrecall-sound-enabled") !== "false"; } catch (_) {}
  let context = null;
  let lastSound = -Infinity;
  let active = [];
  const patterns = { click: [440], navigation: [480, 620], select: [540], modal: [480, 570],
    correct: [587, 784], wrong: [330, 294], unknown: [392], complete: [440, 554, 659], perfect: [523, 659, 784, 1047], startup: [440, 659] };
  function unlock() {
    if (!enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) context = new Audio();
      if (context.state === "suspended") Promise.resolve(context.resume()).catch(function() {});
    } catch (_) {}
  }
  function stop() {
    active.forEach(function(node) { try { node.stop(); } catch (_) {} });
    active = [];
  }
  function play(type) {
    try {
      if (!enabled || !context || context.state !== "running") return;
      const important = ["correct", "wrong", "unknown", "complete", "perfect"].includes(type);
      if (!important && performance.now() - lastSound < 90) return;
      stop();
      lastSound = performance.now();
      (patterns[type] || patterns.click).forEach(function(frequency, index) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const time = context.currentTime + index * .075;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, time);
        gain.gain.exponentialRampToValueAtTime(important ? .025 : .012, time + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, time + .10);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.onended = function() { oscillator.disconnect(); gain.disconnect(); active = active.filter(function(item) { return item !== oscillator; }); };
        oscillator.start(time); oscillator.stop(time + .12); active.push(oscillator);
      });
    } catch (_) { /* Audio must never interrupt studying. */ }
  }
  const toggle = document.getElementById("soundToggle");
  function renderSound() {
    toggle.textContent = "Sound effects: " + (enabled ? "On" : "Off");
    toggle.setAttribute("aria-pressed", String(enabled));
  }
  toggle.addEventListener("click", function() {
    enabled = !enabled;
    try { localStorage.setItem("medrecall-sound-enabled", String(enabled)); } catch (_) {}
    if (enabled) { unlock(); play("select"); } else stop();
    renderSound();
  });
  ["pointerdown", "touchend", "keydown"].forEach(function(type) {
    document.addEventListener(type, function(event) { if (event.isTrusted) unlock(); }, { passive: true, capture: true });
  });
  document.addEventListener("click", function(event) {
    const button = event.target.closest("button, summary");
    if (!button || button.disabled || button.id === "soundToggle" || button.matches("[data-answer], #submitAnswerButton, #dontKnowButton, #nextButton")) return;
    play(button.matches(".nav-item, #menuButton, #sidebarClose, #sidebarBackdrop") ? "navigation" : "click");
  }, true);
  document.addEventListener("change", function(event) { if (event.target.matches('input[type="checkbox"], input[type="radio"], select')) play("select"); });
  document.querySelectorAll("dialog").forEach(function(dialog) {
    new MutationObserver(function() { play("modal"); }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  });
  renderSound();
  window.MedRecallSound = { play: play };

  const updateButton = document.getElementById("whatsNewButton");
  const updateDialog = document.getElementById("whatsNewDialog");
  const seenKey = "medrecall-last-seen-version";
  let lastSeen = null;
  try { lastSeen = localStorage.getItem(seenKey); } catch (_) {}
  function renderUnread() {
    const unread = lastSeen !== MedRecallRelease.version;
    document.getElementById("updateBadge").hidden = !unread;
    updateButton.setAttribute("aria-label", unread ? "What's New — unread release" : "What's New");
  }
  function releaseCard(release) {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    heading.textContent = "MedRecall v" + release.version + " · " + release.title;
    article.appendChild(heading);
    if (release.date) {
      const date = document.createElement("time");
      date.dateTime = release.date; date.textContent = release.date; article.appendChild(date);
    }
    if (release.description) {
      const description = document.createElement("p");
      description.textContent = release.description; article.appendChild(description);
    }
    const list = document.createElement("ul");
    release.changes.forEach(function(change) { const item = document.createElement("li"); item.textContent = change; list.appendChild(item); });
    article.appendChild(list); return article;
  }
  document.getElementById("currentRelease").appendChild(releaseCard(MedRecallRelease.history[0]));
  MedRecallRelease.history.slice(1).forEach(function(release) { document.getElementById("olderReleases").appendChild(releaseCard(release)); });
  document.getElementById("releaseHistory").hidden = MedRecallRelease.history.length < 2;
  updateButton.addEventListener("click", function() {
    updateDialog.showModal();
    lastSeen = MedRecallRelease.version;
    try { localStorage.setItem(seenKey, lastSeen); } catch (_) {}
    renderUnread();
  });
  document.getElementById("closeWhatsNew").addEventListener("click", function() { updateDialog.close(); });
  updateDialog.addEventListener("click", function(event) {
    const rect = updateDialog.getBoundingClientRect();
    if (event.target === updateDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) updateDialog.close();
  });
  // One latest-release dot, not a backlog or an interrupting onboarding modal.
  renderUnread();

  const progressTools = document.querySelector(".progress-tools");
  document.getElementById("overviewProgressTools").appendChild(progressTools);
  const guides = {
    apple: { title: "Install on iPhone / iPad", steps: ["Open this link online in Safari.", "Tap Share (the square with an upward arrow).", "Choose Add to Home Screen.", "Enable Open as Web App if offered, then tap Add."], note: "Inside another app’s browser? Open the link in Safari first." },
    android: { title: "Install on Android", steps: ["Open this link online in Chrome.", "Tap the ⋮ menu.", "Choose Install app or Add to Home screen.", "Confirm installation."], note: "If the option is missing, open this link in Chrome outside any in-app browser." },
    desktop: { title: "Install on desktop", steps: ["In Chrome, use the install icon in the address bar if offered.", "In Edge, open the menu → Apps → Install this site as an app.", "Confirm Install."], note: "Some browsers do not offer installation. You can still study in a normal browser tab." }
  };
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "apple" : /Android/.test(ua) ? "android" : "desktop";
  function guideHTML(key) {
    const guide = guides[key];
    return '<article class="platform-guide"><h3>' + guide.title + '</h3><ol>' + guide.steps.map(function(step) { return '<li>' + step + '</li>'; }).join('') + '</ol><p>' + guide.note + '</p></article>';
  }
  const standalone = window.matchMedia("(display-mode: standalone)");
  let installEvent = null;
  const installButton = document.getElementById("installAppButton");
  function renderInstall() {
    const installed = standalone.matches || navigator.standalone === true;
    document.getElementById("installationStatus").textContent = installed ? "✓ Running as an installed app" : installEvent ? "Install available" : "Manual installation guide";
    document.getElementById("installGuideTitle").textContent = installed ? "MedRecall on your device" : "Install MedRecall";
    document.getElementById("primaryInstallGuide").innerHTML = installed ? "" : guideHTML(platform);
    document.getElementById("alternativeInstallGuides").innerHTML = Object.keys(guides).filter(function(key) { return installed || key !== platform; }).map(guideHTML).join('');
    document.querySelector("#otherInstallGuides summary").textContent = installed ? "Installation help" : "Other devices / browsers";
    installButton.hidden = installed || !installEvent;
    installButton.textContent = "Install MedRecall";
  }
  window.addEventListener("beforeinstallprompt", function(event) { event.preventDefault(); installEvent = event; renderInstall(); });
  window.addEventListener("appinstalled", function() {
    installEvent = null; renderInstall();
    document.getElementById("installationStatus").textContent = "✓ Installation completed";
  });
  standalone.addEventListener("change", renderInstall);
  installButton.addEventListener("click", async function() {
    if (!installEvent) return;
    const prompt = installEvent; installEvent = null; installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      renderInstall();
      if (choice.outcome === "accepted") document.getElementById("installationStatus").textContent = "Installation requested—follow your browser’s instructions";
    } catch (_) { renderInstall(); } finally { installButton.disabled = false; }
  });
  renderInstall();

  window.MedRecallUX = {
    finishLoading: async function() {
      if (finishingSplash) return;
      finishingSplash = true;
      await minimumSplash;
      const splash = document.getElementById("appSplash");
      if (!splash) return;
      splash.classList.add("leaving");
      splash.setAttribute("aria-hidden", "true");
      play("startup");
      splash.addEventListener("transitionend", function() { splash.remove(); }, { once: true });
      setTimeout(function() { splash.remove(); }, 220);
    },
    checkOffline: async function(worker) {
      const status = document.getElementById("offlineStatus");
      if (!worker || !window.MessageChannel) { status.textContent = "Offline readiness could not be confirmed."; return; }
      const result = await new Promise(function(resolve) {
        const channel = new MessageChannel();
        const timer = setTimeout(function() { channel.port1.close(); resolve(false); }, 3000);
        channel.port1.onmessage = function(event) { clearTimeout(timer); channel.port1.close(); resolve(event.data && event.data.offlineReady === true); };
        try { worker.postMessage({ type: "CHECK_OFFLINE" }, [channel.port2]); } catch (_) { clearTimeout(timer); channel.port1.close(); resolve(false); }
      });
      status.textContent = (result ? "✓ Offline access ready" : "Offline files are not yet confirmed. Reconnect and reopen MedRecall to prepare them.") + (status.dataset.updateNotice || "");
    }
  };
})();
