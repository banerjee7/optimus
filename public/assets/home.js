/* Kiln home page interactions — no dependencies. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Mobile navigation ---------------- */
  var nav = document.getElementById("nav");
  var toggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");

  function closeNav() {
    if (!nav) return;
    nav.classList.remove("open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  }

  if (navLinks) {
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeNav();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeNav();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 860) closeNav();
  });

  /* ---------------- Scroll reveal ---------------- */
  var revealNodes = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (!revealNodes.length) {
    revealNodes = Array.prototype.slice.call(
      document.querySelectorAll(".section-head, .cat, .ws-card, .price-card, .service-card, .assurance-card, .platform-card")
    );
    revealNodes.forEach(function (n) { n.classList.add("reveal"); });
  }

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealNodes.forEach(function (n) { n.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealNodes.forEach(function (n, i) {
      n.style.transitionDelay = Math.min(i % 6, 5) * 40 + "ms";
      io.observe(n);
    });
  }

  /* ---------------- Readiness instrument ---------------- */
  var IDEA_KEY = "kiln.idea";
  var quiz = document.getElementById("quiz");
  var body = document.getElementById("quizBody");
  var countEl = document.getElementById("quizCount");
  var hintEl = document.getElementById("quizHint");
  var resultEl = document.getElementById("quizResult");
  var scoreValue = document.getElementById("scoreValue");
  var scoreRing = document.getElementById("scoreRing");
  var bandName = document.getElementById("bandName");
  var bandCopy = document.getElementById("bandCopy");
  var quizCta = document.getElementById("quizCta");
  var ideaEl = document.getElementById("creatorIdea");

  var answers = {};
  var TOTAL = 6;

  var BANDS = [
    {
      min: 0, max: 7, name: "Shape the wedge",
      copy: "Start with ten customer conversations before you build. Kiln will help you frame the wedge, the evidence and the kill criteria.",
      hint: "Shape the wedge: narrow the problem before generating anything."
    },
    {
      min: 8, max: 13, name: "Ready for a pilot",
      copy: "The pain is real and reachable. Scope one workflow, instrument it, and prove value in a quarter before expanding.",
      hint: "Ready for a pilot: pick one workflow and one measurable baseline."
    },
    {
      min: 14, max: 18, name: "Ready to build",
      copy: "Strong signal. Kiln can generate all twelve workstreams and a full delivery plan — every gate still needs your signature.",
      hint: "Ready to build: generate the full plan, then approve what ships."
    }
  ];

  function bandFor(score) {
    for (var i = 0; i < BANDS.length; i++) {
      if (score >= BANDS[i].min && score <= BANDS[i].max) return BANDS[i];
    }
    return BANDS[0];
  }

  function readIdea() {
    if (ideaEl) return ideaEl.value.trim();
    try { return (localStorage.getItem(IDEA_KEY) || "").trim(); } catch (e) { return ""; }
  }

  function persistIdea() {
    if (!ideaEl) return;
    var value = ideaEl.value.trim();
    try {
      if (value) localStorage.setItem(IDEA_KEY, value);
      else localStorage.removeItem(IDEA_KEY);
    } catch (e) { /* storage may be unavailable */ }
  }

  function appHref() {
    var idea = readIdea();
    if (!idea) return "/app";
    try {
      sessionStorage.setItem(IDEA_KEY, idea);
    } catch (e) { /* ignore */ }
    return "/app?idea=" + encodeURIComponent(idea);
  }

  function refreshCta() {
    if (!quizCta) return;
    quizCta.href = appHref();
  }

  function renderQuiz() {
    var keys = Object.keys(answers);
    var score = keys.reduce(function (sum, k) { return sum + answers[k]; }, 0);
    var answered = keys.length;

    if (countEl) countEl.textContent = answered + " / " + TOTAL + " answered";

    if (answered < TOTAL) {
      if (hintEl) hintEl.textContent = "Answer all six to see your band.";
      if (resultEl) resultEl.hidden = true;
      quiz && quiz.classList.remove("complete");
      return;
    }

    var band = bandFor(score);
    if (scoreValue) scoreValue.textContent = String(score);
    if (bandName) bandName.textContent = band.name;
    if (bandCopy) bandCopy.textContent = band.copy;
    if (hintEl) hintEl.textContent = band.hint;
    if (resultEl) resultEl.hidden = false;
    if (scoreRing) {
      var deg = Math.round((score / 18) * 360);
      scoreRing.style.background = "conic-gradient(var(--ember) " + deg + "deg, var(--paper-2) " + deg + "deg)";
    }
    quiz && quiz.classList.add("complete");

    try {
      sessionStorage.setItem("kiln.readiness", JSON.stringify({ score: score, band: band.name }));
    } catch (e) { /* ignore */ }
    if (window.kilnTrack) window.kilnTrack("readiness_complete", { score: score, band: band.name });
  }

  if (body) {
    body.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-v]");
      if (!btn) return;
      var q = btn.closest(".q");
      if (!q) return;
      var idx = Number(q.getAttribute("data-q"));
      var value = Number(btn.getAttribute("data-v"));
      if (!isFinite(idx) || !isFinite(value)) return;

      answers[idx] = value;
      Array.prototype.forEach.call(q.querySelectorAll("button"), function (b) {
        var on = b === btn;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      refreshCta();
      renderQuiz();
    });
  }

  if (ideaEl) {
    try {
      var saved = localStorage.getItem(IDEA_KEY);
      if (saved && !ideaEl.value) ideaEl.value = saved;
    } catch (e) { /* ignore */ }

    var ideaTimer = null;
    ideaEl.addEventListener("input", function () {
      clearTimeout(ideaTimer);
      ideaTimer = setTimeout(function () { persistIdea(); refreshCta(); }, 180);
    });
    ideaEl.addEventListener("blur", function () { persistIdea(); refreshCta(); });
  }

  refreshCta();

  /* ---------------- Workstream capability panels ---------------- */
  var wsCards = Array.prototype.slice.call(document.querySelectorAll(".ws-card[data-fn]"));

  if (wsCards.length) {
    fetch("/api/catalog", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.functions) return;
        var byKey = {};
        data.functions.forEach(function (fn) { byKey[fn.key] = fn; });

        wsCards.forEach(function (card) {
          var fn = byKey[card.getAttribute("data-fn")];
          if (!fn || !fn.capabilities || !fn.capabilities.length) return;

          var details = document.createElement("details");
          details.className = "ws-cap";

          var summary = document.createElement("summary");
          summary.innerHTML = "Capabilities <span>" + fn.capabilities.length + "</span>";
          details.appendChild(summary);

          var body = document.createElement("div");
          body.className = "ws-cap-body";

          var list = document.createElement("ul");
          fn.capabilities.forEach(function (capability) {
            var li = document.createElement("li");
            li.textContent = capability;
            list.appendChild(li);
          });
          body.appendChild(list);

          if (fn.guardrails && fn.guardrails.length) {
            var guardLabel = document.createElement("div");
            guardLabel.className = "ws-cap-label";
            guardLabel.textContent = "Human guardrails";
            body.appendChild(guardLabel);

            var guards = document.createElement("ul");
            guards.className = "ws-cap-guards";
            fn.guardrails.forEach(function (guardrail) {
              var li = document.createElement("li");
              li.textContent = guardrail;
              guards.appendChild(li);
            });
            body.appendChild(guards);
          }

          details.appendChild(body);
          var formats = card.querySelector(".ws-formats");
          if (formats) card.insertBefore(details, formats);
          else card.appendChild(details);
        });
      })
      .catch(function () { /* cards remain usable without the capability panel */ });
  }

  /* ---------------- Server-side lead capture ---------------- */
  var queryForm = document.getElementById("queryForm");
  var leadType = document.getElementById("leadType");
  var slotWrap = document.getElementById("slotWrap");
  var leadSlot = document.getElementById("leadSlot");

  function setStatus(message, tone) {
    var status = document.getElementById("queryStatus");
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
    status.className = "contact-status" + (tone ? " " + tone : "");
  }

  function loadSlots() {
    if (!leadSlot || leadSlot.getAttribute("data-loaded") === "1") return;
    leadSlot.setAttribute("data-loaded", "1");
    fetch("/api/availability", { headers: { Accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.slots) return;
        data.slots.forEach(function (slot) {
          var option = document.createElement("option");
          option.value = slot.id;
          option.textContent = slot.label + " · " + slot.pod;
          leadSlot.appendChild(option);
        });
      })
      .catch(function () { /* the pod can still propose a time */ });
  }

  if (leadType && slotWrap) {
    leadType.addEventListener("change", function () {
      var wantsFde = leadType.value === "fde" || leadType.value === "enterprise";
      slotWrap.hidden = !wantsFde;
      if (wantsFde) loadSlots();
    });
  }

  if (queryForm) {
    queryForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(queryForm);
      function field(name) { return String(data.get(name) || "").trim(); }
      var payload = {
        type: field("type") || "contact",
        name: field("name"),
        email: field("email"),
        company: field("company"),
        message: field("message"),
        slot: field("slot"),
        consent: !!data.get("consent"),
        attribution: window.kilnAttribution || null,
        source: "marketing",
        path: window.location.pathname + window.location.search,
      };
      if (!payload.name || !payload.email || !payload.message) {
        setStatus("Please add your name, email and a short note.", "error");
        return;
      }
      var button = queryForm.querySelector('button[type="submit"]');
      if (button) { button.disabled = true; button.textContent = "Sending…"; }
      setStatus("Sending securely to the Kiln team…", "");
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
        })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || "The enquiry could not be sent. Please email bidyut.banerjee@gmail.com.");
          var lead = result.body.lead || {};
          var route = lead.routing && lead.routing.pod ? " Routed to the " + lead.routing.pod + "." : "";
          setStatus("Thank you — your enquiry is logged as " + (lead.id || "received") + "." + route + " Bidyut will reply directly.", "success");
          if (window.kilnTrack) window.kilnTrack("lead_submit", { type: payload.type, source: "marketing" });
          queryForm.reset();
          if (slotWrap) slotWrap.hidden = true;
          if (leadSlot) leadSlot.innerHTML = '<option value="">Let the pod propose a time</option>';
        })
        .catch(function (error) {
          setStatus(error.message || "The enquiry could not be sent. Please email bidyut.banerjee@gmail.com.", "error");
        })
        .then(function () {
          if (button) { button.disabled = false; button.innerHTML = 'Send to the Kiln team <span aria-hidden="true">→</span>'; }
        });
    });
  }

  /* The public home page deliberately does not probe /api/me. Auth-aware
     navigation belongs in the console, not in an anonymous marketing view. */
})();
