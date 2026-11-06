/* ============================================================
   Kiln console — vanilla JS, no dependencies.
   Views: chat, workstreams, sandbox, deployments, proposals,
   FDE consultations, delivery/exports, blueprint.
   ============================================================ */
(function () {
  "use strict";

  var FORMAT_LABELS = { pdf: "PDF", docx: "Word", pptx: "PPT", xlsx: "Excel", md: "MD", json: "JSON" };
  var COLLATERAL_TYPES = [
    ["one-pager", "One-pager"],
    ["battlecard", "Competitive battlecard"],
    ["case-study", "Illustrative case study"],
    ["architecture-brief", "Architecture brief"],
    ["exec-summary", "Executive summary"],
    ["faq", "Stakeholder FAQ"],
  ];
  var VIEW_TITLES = {
    chat: "Chat", workstreams: "Workstreams", sandbox: "Sandbox",
    deployments: "Deployments", collateral: "Proposals & collaterals",
    revenue: "Revenue swarm",
    fde: "FDE consultations", delivery: "Delivery & exports", blueprint: "Blueprint",
    "fde-forum": "FDE Forum",
    billing: "Billing & usage", evidence: "Evidence log",
    team: "Team & roles", security: "Security", connectors: "Connectors",
    developer: "Developer", operations: "Operations",
  };
  var IDEA_KEY = "kiln.idea";
  var IS_MOBILE_APP = /^\/mobile\/?$/.test(window.location.pathname);
  if (IS_MOBILE_APP) document.body.classList.add("mobile-app");

  var state = {
    catalog: null, user: null, projects: [], project: null, ws: null,
    view: "chat", busy: false, draft: "", modalDoc: null,
    sandboxFull: null, blueprint: null, readiness: null, revenue: null,
    billing: null, evidence: null,
    workspace: null, connectors: null, developer: null, operations: null,
  };

  var el = {};
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initial(name) { return (String(name || "K").trim()[0] || "K").toUpperCase(); }
  function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return String(iso); }
  }
  function pct(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }

  function inlineMd(raw) {
    var s = esc(raw);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return s;
  }

  function md(raw) {
    var lines = String(raw || "").replace(/\r/g, "").split("\n");
    var out = [], list = null;
    function closeList() { if (list) { out.push("</" + list + ">"); list = null; } }
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) { closeList(); return; }
      var ul = /^[-*]\s+(.*)$/.exec(t);
      if (ul) {
        if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
        out.push("<li>" + inlineMd(ul[1]) + "</li>");
        return;
      }
      var ol = /^\d+\.\s+(.*)$/.exec(t);
      if (ol) {
        if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
        out.push("<li>" + inlineMd(ol[1]) + "</li>");
        return;
      }
      closeList();
      out.push("<p>" + inlineMd(t) + "</p>");
    });
    closeList();
    return out.join("");
  }

  function mdDoc(raw) {
    var lines = String(raw || "").replace(/\r/g, "").split("\n");
    var out = [], list = null, para = [], fence = false, code = [];
    function closeList() { if (list) { out.push("</" + list + ">"); list = null; } }
    function flushPara() {
      if (!para.length) return;
      out.push("<p>" + para.map(inlineMd).join("<br/>") + "</p>");
      para = [];
    }
    lines.forEach(function (line) {
      if (/^\s*```/.test(line)) {
        if (!fence) { closeList(); flushPara(); fence = true; code = []; }
        else { out.push("<pre>" + esc(code.join("\n")) + "</pre>"); fence = false; }
        return;
      }
      if (fence) { code.push(line); return; }

      if (!line.trim()) { closeList(); flushPara(); return; }
      var h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) { closeList(); flushPara(); out.push("<h" + h[1].length + ">" + inlineMd(h[2]) + "</h" + h[1].length + ">"); return; }
      if (/^>\s?/.test(line)) { closeList(); flushPara(); out.push("<blockquote>" + inlineMd(line.replace(/^>\s?/, "")) + "</blockquote>"); return; }
      if (/^\s*[-*]\s+/.test(line)) {
        flushPara();
        if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
        out.push("<li>" + inlineMd(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
        return;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        flushPara();
        if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
        out.push("<li>" + inlineMd(line.replace(/^\s*\d+\.\s+/, "")) + "</li>");
        return;
      }
      if (/^---+$/.test(line.trim())) { closeList(); flushPara(); out.push("<hr/>"); return; }
      closeList();
      para.push(line.trim());
    });
    closeList(); flushPara();
    if (fence && code.length) out.push("<pre>" + esc(code.join("\n")) + "</pre>");
    return out.join("");
  }

  /* ---------------- API ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var init = { credentials: "same-origin", headers: { Accept: "application/json" } };
    Object.keys(opts).forEach(function (k) { init[k] = opts[k]; });
    if (init.body && typeof init.body !== "string") {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(init.body);
    }
    return fetch(path, init).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error) || "Request failed (" + res.status + ").");
          err.status = res.status;
          err.code = data && data.code;
          err.upgradeUrl = data && data.upgradeUrl;
          err.usage = data && data.usage;
          err.requiredPlan = data && data.requiredPlan;
          if (res.status === 401 && path !== "/api/me") showAuth();
          if (res.status === 402) {
            try { window.dispatchEvent(new CustomEvent("kiln:upgrade", { detail: err })); } catch (e) { /* ignore */ }
          }
          throw err;
        }
        return data;
      });
    });
  }

  /* ---------------- UI atoms ---------------- */
  var bar = null;
  function progress(on) {
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "loading-bar";
      document.body.appendChild(bar);
    }
    if (on) {
      bar.classList.remove("done");
      bar.classList.add("on");
    } else {
      bar.classList.remove("on");
      bar.classList.add("done");
      setTimeout(function () { bar.classList.remove("done"); }, 400);
    }
  }

  function toast(message, type, title) {
    var root = el.toastRoot;
    var node = document.createElement("div");
    node.className = "toast " + (type || "");
    node.innerHTML = "<div>" + (title ? "<b>" + esc(title) + "</b>" : "") + "<span>" + esc(message) + "</span></div>";
    root.appendChild(node);
    setTimeout(function () { node.remove(); }, 4600);
    setTimeout(function () { node.style.opacity = "0"; node.style.transition = "opacity .3s"; }, 4200);
  }

  function showAuth() {
    el.authScreen.hidden = false;
    el.appShell.hidden = true;
    el.onboarding.hidden = true;
    closeModal();
  }

  function showApp() {
    el.authScreen.hidden = true;
    el.appShell.hidden = false;
  }

  function statusPill(status) {
    if (status === "approved" || status === "deployed") return '<span class="pill live">' + esc(status) + "</span>";
    if (status === "awaiting_approval") return '<span class="pill warn">Awaiting approval</span>';
    if (status === "deployed_with_warnings") return '<span class="pill warn">Deployed · warnings</span>';
    if (status === "rejected") return '<span class="pill warn">Rejected</span>';
    return '<span class="pill">Draft</span>';
  }

  function formatLinks(base, formats) {
    return (formats || []).map(function (f) {
      return '<a href="' + base + "?format=" + encodeURIComponent(f) + '" download title="Download ' + esc(FORMAT_LABELS[f] || f) + '">' + esc(FORMAT_LABELS[f] || f) + "</a>";
    }).join("");
  }

  /* ---------------- boot ---------------- */
  function boot() {
    el = {
      authScreen: $("#authScreen"),
      appShell: $("#appShell"),
      onboarding: $("#onboarding"),
      modalRoot: $("#modalRoot"),
      modalKicker: $("#modalKicker"),
      modalTitle: $("#modalTitle"),
      modalSub: $("#modalSub"),
      modalActions: $("#modalActions"),
      modalBody: $("#modalBody"),
      toastRoot: $("#toastRoot"),
      viewRoot: $("#viewRoot"),
      sidebar: $("#sidebar"),
      scrim: $("#scrim"),
      projectSelect: $("#projectSelect"),
      projectMeta: $("#projectMeta"),
      projectForm: $("#projectForm"),
      ideaInput: $("#ideaInput"),
      ideaCount: $("#ideaCount"),
      ideaHint: $("#ideaHint"),
      modelSelect: $("#modelSelect"),
      modelHint: $("#modelHint"),
      tierHint: $("#tierHint"),
      industryInput: $("#industryInput"),
      projectName: $("#projectName"),
      projectError: $("#projectError"),
      onboardClose: $("#onboardClose"),
      onboardCancel: $("#onboardCancel"),
      onboardSubmit: $("#projectSubmit"),
      sideNav: $("#sideNav"),
      menuBtn: $("#menuBtn"),
      sideClose: $("#sideClose"),
      crumbCodename: $("#crumbCodename"),
      crumbView: $("#crumbView"),
      userAvatar: $("#userAvatar"),
      userName: $("#userName"),
      userPlan: $("#userPlan"),
      tierPill: $("#tierPill"),
      modelPill: $("#modelPill"),
      countWs: $("#countWs"),
      countDeps: $("#countDeps"),
      countCol: $("#countCol"),
      countRevenue: $("#countRevenue"),
      sandboxDot: $("#sandboxDot"),
      usagePill: $("#usagePill"),
      upgradeBtn: $("#upgradeBtn"),
      verifyBanner: $("#verifyBanner"),
      resendVerifyBtn: $("#resendVerifyBtn"),
      operationsNav: $("#operationsNav"),
    };

    try { state.readiness = JSON.parse(sessionStorage.getItem("kiln.readiness") || "null"); } catch (e) { state.readiness = null; }

    try {
      var requestedView = new URLSearchParams(window.location.search).get("view");
      if (requestedView && VIEW_TITLES[requestedView]) state.initialView = requestedView;
    } catch (e) { /* ignore */ }

    bindAuth();
    bindShell();
    bindMobileNav();
    bindOnboarding();
    bindModal();
    bindBillingEvents();
    handleAuthQuery();
    setupInstallPrompt();
    registerServiceWorker();

    var queryIdea = "";
    try {
      queryIdea = new URLSearchParams(window.location.search).get("idea") || "";
      if (queryIdea) sessionStorage.setItem(IDEA_KEY, queryIdea);
    } catch (e) { /* ignore */ }

    var bootTasks = [api("/api/catalog")];
    bootTasks.push(api("/api/me").catch(function (err) {
      if (err && err.status === 401) return null;
      throw err;
    }));

    progress(true);
    Promise.all(bootTasks).then(function (results) {
      state.catalog = results[0];
      var me = results[1];
      fillModels();
      if (!me || !me.user) { showAuth(); return; }
      state.user = me.user;
      state.projects = me.projects || [];
      renderUser();
      renderProjectOptions();
      loadBilling();
      loadWorkspace();
      loadRevenueSummary();
      handleBillingReturn();
      if (state.user.admin && el.operationsNav) el.operationsNav.hidden = false;
      if (state.projects.length) {
        var stored = null;
        try { stored = localStorage.getItem("kiln.lastProject"); } catch (e) { /* ignore */ }
        var exists = state.projects.some(function (p) { return p.id === stored; });
        loadProject(exists ? stored : state.projects[0].id);
      } else {
        el.authScreen.hidden = true;
        el.appShell.hidden = true;
        showOnboarding(false, queryIdea);
      }
    }).catch(function (err) {
      showAuth();
      toast(err.message || "Could not reach the Kiln server.", "error", "Offline");
    }).then(function () { progress(false); });
  }

  /* ---------------- auth ---------------- */
  function authPanel(which) {
    var panels = {
      login: $("#loginForm"), register: $("#registerForm"),
      forgot: $("#forgotForm"), reset: $("#resetForm"), mfa: $("#mfaForm"),
    };
    Object.keys(panels).forEach(function (key) { if (panels[key]) panels[key].hidden = key !== which; });
    var tabLogin = $("#tabLogin"), tabRegister = $("#tabRegister");
    if (tabLogin) {
      tabLogin.classList.toggle("on", which === "login");
      tabLogin.setAttribute("aria-selected", which === "login" ? "true" : "false");
    }
    if (tabRegister) {
      tabRegister.classList.toggle("on", which === "register");
      tabRegister.setAttribute("aria-selected", which === "register" ? "true" : "false");
    }
  }

  function bindAuth() {
    var loginForm = $("#loginForm"), registerForm = $("#registerForm");
    var forgotForm = $("#forgotForm"), resetForm = $("#resetForm");

    $("#tabLogin").addEventListener("click", function () { authPanel("login"); });
    $("#tabRegister").addEventListener("click", function () { authPanel("register"); });
    $("#forgotBtn").addEventListener("click", function () { authPanel("forgot"); });
    $$("[data-auth-back]").forEach(function (btn) {
      btn.addEventListener("click", function () { authPanel("login"); });
    });
    $("#demoFill").addEventListener("click", function () {
      $("#loginEmail").value = "demo@kiln.studio";
      $("#loginPassword").value = "KilnDemo2026!";
      loginForm.requestSubmit();
    });
    var ssoBtn = $("#ssoBtn");
    if (ssoBtn) ssoBtn.addEventListener("click", function () {
      var email = ($("#loginEmail").value || "").trim();
      window.location.href = "/api/auth/sso/start" + (email ? "?org=" + encodeURIComponent(email) : "");
    });

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#loginError");
      err.hidden = true;
      var btn = $("#loginSubmit");
      btn.disabled = true; btn.textContent = "Signing in…";
      api("/api/auth/login", { method: "POST", body: { email: $("#loginEmail").value, password: $("#loginPassword").value } })
        .then(function (data) {
          if (data.mfaRequired) {
            state.mfaChallenge = data.challenge;
            authPanel("mfa");
            var mfaInput = $("#mfaCode");
            if (mfaInput) mfaInput.focus();
            toast("Enter your authenticator or recovery code to finish signing in.", "info", "MFA required");
            return;
          }
          return afterAuth(data);
        })
        .catch(function (error) { err.textContent = error.message; err.hidden = false; })
        .then(function () { btn.disabled = false; btn.innerHTML = 'Sign in <span aria-hidden="true">→</span>'; });
    });

    registerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#registerError");
      err.hidden = true;
      var btn = $("#registerSubmit");
      btn.disabled = true; btn.textContent = "Creating…";
      var attribution = {};
      try { attribution = JSON.parse(localStorage.getItem("kiln.attribution.v1") || "{}"); } catch (error) { attribution = {}; }
      api("/api/auth/register", {
        method: "POST",
        body: {
          name: $("#regName").value,
          email: $("#regEmail").value,
          password: $("#regPassword").value,
          ref: attribution.ref || new URLSearchParams(window.location.search).get("ref") || undefined,
        },
      })
        .then(function (data) {
          if (data.pending) {
            var success = $("#registerSuccess");
            var testUrl = data.verification && data.verification.testUrl;
            if (testUrl) {
              state.pendingVerifyUrl = testUrl;
              try { sessionStorage.setItem("kiln.verifyUrl", testUrl); } catch (e) { /* ignore */ }
            }
            if (success) {
              success.innerHTML = "If that email can be used, check your inbox to continue." +
                (testUrl ? ' <a href="' + esc(testUrl) + '">Open the test-mode verification link</a>.' : "");
              success.hidden = false;
            }
            toast("If that email can be used, check your inbox to continue.", "success", "Check your email");
            return;
          }
          return afterAuth(data);
        })
        .catch(function (error) { err.textContent = error.message; err.hidden = false; })
        .then(function () { btn.disabled = false; btn.innerHTML = 'Create account <span aria-hidden="true">→</span>'; });
    });

    var mfaForm = $("#mfaForm");
    if (mfaForm) mfaForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#mfaError");
      err.hidden = true;
      var btn = $("#mfaSubmit");
      btn.disabled = true; btn.textContent = "Verifying…";
      api("/api/auth/mfa/verify", { method: "POST", body: { challenge: state.mfaChallenge, code: $("#mfaCode").value } })
        .then(function (data) { state.mfaChallenge = null; return afterAuth(data); })
        .catch(function (error) { err.textContent = error.message; err.hidden = false; })
        .then(function () { btn.disabled = false; btn.innerHTML = 'Verify and sign in <span aria-hidden="true">→</span>'; });
    });

    forgotForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#forgotError"), success = $("#forgotSuccess");
      err.hidden = true; success.hidden = true;
      var btn = $("#forgotSubmit");
      btn.disabled = true; btn.textContent = "Sending…";
      api("/api/auth/forgot-password", { method: "POST", body: { email: $("#forgotEmail").value } })
        .then(function (data) {
          success.innerHTML = "If that account exists, a one-hour reset link is on its way.";
          if (data.testUrl) {
            success.innerHTML += ' <a href="' + esc(data.testUrl) + '">Open the test-mode reset link</a>.';
          }
          success.hidden = false;
        })
        .catch(function (error) { err.textContent = error.message; err.hidden = false; })
        .then(function () { btn.disabled = false; btn.innerHTML = 'Send reset link <span aria-hidden="true">→</span>'; });
    });

    resetForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("#resetError");
      err.hidden = true;
      if (!state.resetToken) { err.textContent = "Open a valid reset link from your email first."; err.hidden = false; return; }
      var btn = $("#resetSubmit");
      btn.disabled = true; btn.textContent = "Updating…";
      api("/api/auth/reset-password", { method: "POST", body: { token: state.resetToken, password: $("#resetPassword").value } })
        .then(function (data) {
          state.resetToken = null;
          try { window.history.replaceState({}, "", "/app"); } catch (error) { /* ignore */ }
          return afterAuth(data);
        })
        .catch(function (error) { err.textContent = error.message; err.hidden = false; })
        .then(function () { btn.disabled = false; btn.innerHTML = 'Update password <span aria-hidden="true">→</span>'; });
    });
  }

  function handleAuthQuery() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var reset = params.get("reset");
    var verify = params.get("verify");
    var invite = params.get("invite");
    var ssoError = params.get("sso_error");
    if (ssoError) {
      showAuth();
      var ssoErr = $("#loginError");
      if (ssoErr) { ssoErr.textContent = ssoError; ssoErr.hidden = false; }
    }
    if (invite) {
      state.inviteToken = invite;
      try { sessionStorage.setItem("kiln.inviteToken", invite); } catch (e) { /* ignore */ }
    }
    if (reset) {
      state.resetToken = reset;
      showAuth();
      authPanel("reset");
      return;
    }
    if (verify) {
      api("/api/auth/verify-email", { method: "POST", body: { token: verify } })
        .then(function (data) {
          state.user = data.user;
          state.projects = data.projects || [];
          renderUser();
          toast("Email verified. Your account is fully active.", "success", "Verified");
          return afterAuth(data);
        })
        .catch(function (error) {
          showAuth();
          var err = $("#loginError");
          err.textContent = error.message;
          err.hidden = false;
        })
        .then(function () {
          try { window.history.replaceState({}, "", "/app"); } catch (e) { /* ignore */ }
        });
    }
  }

  function afterAuth(data) {
    state.user = data.user;
    state.projects = data.projects || [];
    var inviteToken = state.inviteToken;
    if (!inviteToken) { try { inviteToken = sessionStorage.getItem("kiln.inviteToken"); } catch (e) { inviteToken = null; } }
    renderUser();
    renderProjectOptions();
    showApp();
    loadBilling();
    loadWorkspace();
    handleBillingReturn();
    if (state.user && state.user.admin && el.operationsNav) el.operationsNav.hidden = false;
    if (inviteToken) {
      api("/api/workspace/invites/accept", { method: "POST", body: { token: inviteToken } })
        .then(function (result) {
          state.inviteToken = null;
          try { sessionStorage.removeItem("kiln.inviteToken"); } catch (e) { /* ignore */ }
          state.workspace = result.workspace;
          state.projects = result.projects || state.projects;
          renderProjectOptions();
          toast("Invitation accepted. Shared workspaces are now visible.", "success", "Workspace joined");
          if (state.projects.length) loadProject(state.projects[0].id);
        })
        .catch(function (error) { toast(error.message, "error", "Invitation"); });
    }
    if (state.projects.length) {
      loadProject(state.projects[0].id);
    } else {
      el.appShell.hidden = true;
      showOnboarding(false);
    }
  }

  function loadWorkspace() {
    if (!state.user) return Promise.resolve(null);
    return api("/api/workspace").then(function (data) {
      state.workspace = data.workspace;
      if (state.user) {
        state.user.workspaceRole = data.workspace.role;
        state.user.mfaEnabled = state.user.mfaEnabled;
      }
      if (state.view === "team") renderTeam();
      return data.workspace;
    }).catch(function () { return null; });
  }

  function renderUser() {
    if (!state.user) return;
    el.userAvatar.textContent = initial(state.user.name);
    el.userName.textContent = state.user.name;
    var plan = state.billing ? state.billing.planName : (state.user.planName || state.user.plan || "free");
    el.userPlan.textContent = plan + (state.billing && state.billing.status === "past_due" ? " · payment issue" : "");
    updateUsage();
    renderVerifyBanner();
    syncTierOptions();
  }

  function updateUsage() {
    if (!state.user || !el.usagePill) return;
    var billing = state.billing || state.user;
    var quota = Number(billing.tokenQuota || state.user.tokenQuota || 0);
    var used = Number(billing.tokensUsed || state.user.tokensUsed || 0);
    if (!quota) { el.usagePill.hidden = true; return; }
    var percent = Math.min(100, Math.round((used / quota) * 100));
    el.usagePill.hidden = false;
    el.usagePill.textContent = compactNumber(used) + " / " + compactNumber(quota) + " tokens · " + percent + "%";
    el.usagePill.classList.toggle("warn", percent >= 80);
    if (el.upgradeBtn) {
      el.upgradeBtn.hidden = false;
      el.upgradeBtn.textContent = (state.billing && state.billing.plan !== "free") ? "Manage plan" : "Upgrade";
    }
  }

  function compactNumber(value) {
    var n = Number(value) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + "m";
    if (n >= 1000) return Math.round(n / 1000) + "k";
    return String(n);
  }

  function renderVerifyBanner() {
    if (!el.verifyBanner) return;
    var unverified = state.user && state.user.emailVerified === false;
    el.verifyBanner.hidden = !unverified;
    if (!unverified) return;
    var testUrl = state.pendingVerifyUrl || null;
    if (!testUrl) { try { testUrl = sessionStorage.getItem("kiln.verifyUrl"); } catch (e) { testUrl = null; } }
    var text = el.verifyBanner.querySelector("span");
    if (text) {
      text.innerHTML = "<b>Verify your email.</b> Check your inbox for the Kiln verification link." +
        (testUrl ? ' <a href="' + esc(testUrl) + '">Test mode: verify now</a>.' : "");
    }
  }

  function loadBilling() {
    if (!state.user) return Promise.resolve(null);
    return api("/api/billing").then(function (data) {
      state.billing = data.billing;
      if (state.billing) {
        state.user.plan = state.billing.plan;
        state.user.planName = state.billing.planName;
        state.user.tier = state.billing.tier;
        state.user.tokenQuota = state.billing.tokenQuota;
        state.user.tokensUsed = state.billing.tokensUsed;
      }
      renderUser();
      if (state.view === "billing") renderBilling();
      return data.billing;
    }).catch(function (error) {
      if (error.status !== 401) toast(error.message, "error", "Billing unavailable");
      return null;
    });
  }

  function handleBillingReturn() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var checkout = params.get("checkout");
    if (!checkout) return;
    api("/api/billing/checkout/" + encodeURIComponent(checkout) + "/confirm", { method: "POST" })
      .then(function (data) {
        state.billing = data.billing;
        renderUser();
        toast("Subscription active. Your invoice is in Billing & usage.", "success", "Plan activated");
      })
      .catch(function (error) {
        if (error.status !== 409) toast(error.message, "error", "Checkout");
      })
      .then(function () {
        try { window.history.replaceState({}, "", "/app?view=billing"); } catch (e) { /* ignore */ }
        loadBilling();
      });
  }

  function bindBillingEvents() {
    if (el.upgradeBtn) el.upgradeBtn.addEventListener("click", function () { setView("billing"); });
    if (el.resendVerifyBtn) {
      el.resendVerifyBtn.addEventListener("click", function () {
        el.resendVerifyBtn.disabled = true;
        api("/api/auth/resend-verification", { method: "POST" })
          .then(function (data) {
            if (data.alreadyVerified) {
              state.user.emailVerified = true;
              renderUser();
              toast("Your email is already verified.", "success", "Verified");
            } else {
              if (data.testUrl) {
                state.pendingVerifyUrl = data.testUrl;
                try { sessionStorage.setItem("kiln.verifyUrl", data.testUrl); } catch (e) { /* ignore */ }
              }
              renderVerifyBanner();
              toast("Verification email queued.", "success", "Check your inbox");
            }
          })
          .catch(function (error) { toast(error.message, "error", "Could not resend"); })
          .then(function () { el.resendVerifyBtn.disabled = false; });
      });
    }
    window.addEventListener("kiln:upgrade", function (event) {
      var err = event.detail || {};
      toast(err.message || "Upgrade to unlock this action.", "error", "Plan limit");
      setView("billing");
    });
  }

  /* ---------------- shell ---------------- */
  function bindShell() {
    el.sideNav.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-view]");
      if (!btn) return;
      setView(btn.getAttribute("data-view"));
      closeNav();
    });

    el.projectSelect.addEventListener("change", function () {
      if (el.projectSelect.value) loadProject(el.projectSelect.value);
    });
    $("#newProjectBtn").addEventListener("click", function () { showOnboarding(true); });

    $("#logoutBtn").addEventListener("click", function () {
      api("/api/auth/logout", { method: "POST" }).catch(function () {}).then(function () { window.location.href = "/"; });
    });

    el.menuBtn.addEventListener("click", openNav);
    el.sideClose.addEventListener("click", closeNav);
    el.scrim.addEventListener("click", closeNav);

    var packBtn = $("#packBtn");
    packBtn.addEventListener("click", function (e) { e.preventDefault(); setView("delivery"); });

    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeModal(); closeNav(); }
    });
  }

  function openNav() {
    el.appShell.classList.add("nav-open");
    el.scrim.hidden = false;
    el.menuBtn.setAttribute("aria-expanded", "true");
    var more = $("#mobileMore");
    if (more) more.classList.add("on");
  }
  function closeNav() {
    el.appShell.classList.remove("nav-open");
    el.scrim.hidden = true;
    el.menuBtn.setAttribute("aria-expanded", "false");
    var more = $("#mobileMore");
    var primary = ["chat", "workstreams", "sandbox", "collateral"];
    if (more) more.classList.toggle("on", primary.indexOf(state.view) < 0);
  }

  function bindMobileNav() {
    var nav = $("#mobileNav");
    if (!nav) return;
    nav.addEventListener("click", function (e) {
      var viewBtn = e.target.closest("button[data-mobile-view]");
      if (viewBtn) {
        setView(viewBtn.getAttribute("data-mobile-view"));
        closeNav();
        return;
      }
      if (e.target.closest("#mobileMore")) openNav();
    });
  }

  function setupInstallPrompt() {
    var btn = $("#installAppBtn");
    if (!btn) return;
    var deferred = null;
    var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");

    if (isIOS && !standalone) {
      btn.hidden = false;
      btn.addEventListener("click", function () {
        toast("Tap Share, then Add to Home Screen to install Kiln.", "", "Install on iOS");
      });
      return;
    }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });
    btn.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      Promise.resolve(deferred.userChoice).then(function () {
        deferred = null;
        btn.hidden = true;
      });
    });
    window.addEventListener("appinstalled", function () {
      deferred = null;
      btn.hidden = true;
      toast("Kiln is installed on this device.", "success", "Installed");
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    var secure = location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost";
    if (!secure) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {
      /* offline shell is optional */
    });
  }

  function renderProjectOptions() {
    el.projectSelect.innerHTML = state.projects.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>";
    }).join("") || '<option value="">No sandbox yet</option>';
    if (state.project) el.projectSelect.value = state.project.id;
  }

  function updateShell() {
    var p = state.project;
    if (!p || !state.ws) return;
    renderProjectOptions();
    el.projectSelect.value = p.id;
    el.crumbCodename.textContent = p.codename || p.name;
    el.crumbView.textContent = VIEW_TITLES[state.view] || "Workspace";
    el.tierPill.textContent = p.tierLabel || p.tier;
    el.modelPill.textContent = p.modelName || p.model;
    el.projectMeta.innerHTML = '<span class="pill">' + esc(p.tierLabel || p.tier) + "</span><span>" + esc(p.modelName || p.model) + "</span>";

    var artifacts = state.ws.artifacts || [];
    var uniq = {};
    artifacts.forEach(function (a) { uniq[a.functionKey] = true; });
    el.countWs.textContent = String(Object.keys(uniq).length);
    el.countDeps.textContent = String((state.ws.deployments || []).length);
    el.countCol.textContent = String((state.ws.collaterals || []).length);
    el.sandboxDot.hidden = !(state.ws.deployments || []).some(function (d) { return d.status === "awaiting_approval"; });
    updateRevenueBadge();
    document.title = (p.name || "Workspace") + " · Kiln";
  }

  function setView(view) {
    if (!VIEW_TITLES[view]) return;
    state.view = view;
    $$("#sideNav button[data-view]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-view") === view); });
    var mobilePrimary = ["chat", "workstreams", "sandbox", "collateral"];
    $$("#mobileNav button[data-mobile-view]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-mobile-view") === view); });
    var more = $("#mobileMore");
    if (more) more.classList.toggle("on", mobilePrimary.indexOf(view) < 0);
    el.crumbView.textContent = VIEW_TITLES[view];
    renderView();
  }

  function loadProject(id) {
    progress(true);
    return api("/api/projects/" + encodeURIComponent(id)).then(function (data) {
      state.ws = data;
      state.project = data.project;
      state.sandboxFull = null;
      state.lastProject = id;
      try { localStorage.setItem("kiln.lastProject", id); } catch (e) { /* ignore */ }
      var summary = state.projects.filter(function (p) { return p.id === id; })[0];
      if (!summary) {
        state.projects.push(data.project);
      } else {
        Object.assign(summary, data.project);
      }
      updateShell();
      showApp();
      el.onboarding.hidden = true;
      var nextView = state.initialView || state.view || "chat";
      state.initialView = null;
      setView(nextView);
    }).catch(function (err) {
      if (err.status === 401) { showAuth(); return; }
      if (err.status === 404) toast("That sandbox no longer exists.", "error", "Not found");
      else toast(err.message, "error", "Could not load sandbox");
      if (state.projects.length > 1) loadProject(state.projects[0].id);
      else showOnboarding(true);
    }).then(function () { progress(false); });
  }

  /* ---------------- onboarding ---------------- */
  function fillModels() {
    if (!state.catalog || !el.modelSelect) return;
    el.modelSelect.innerHTML = state.catalog.models.map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (m.default ? " selected" : "") + ">" + esc(m.name) + " · " + esc(m.params) + " · " + esc(m.license) + "</option>";
    }).join("");
    updateModelHint();
    el.modelSelect.addEventListener("change", updateModelHint);
  }

  function updateModelHint() {
    var m = (state.catalog.models || []).filter(function (x) { return x.id === el.modelSelect.value; })[0];
    var text = m ? m.bestFor + " · The selected model is part of the generation seed, so changing it changes the generated sections, figures and recommendations." : "The selected model changes the generated output.";
    if (el.modelHint) el.modelHint.textContent = text;
  }

  var TIER_ORDER = ["small", "smb", "enterprise"];
  function syncTierOptions() {
    if (!el.projectForm) return;
    var maxTier = (state.billing && state.billing.tier) || (state.user && state.user.tier) || "small";
    var maxIndex = Math.max(0, TIER_ORDER.indexOf(maxTier));
    var radios = $$('input[name="tier"]', el.projectForm);
    var firstAvailable = null;
    radios.forEach(function (radio) {
      var idx = TIER_ORDER.indexOf(radio.value);
      var locked = idx > maxIndex;
      radio.disabled = locked;
      var label = radio.closest(".tier-opt");
      if (label) {
        label.classList.toggle("locked", locked);
        label.setAttribute("aria-disabled", locked ? "true" : "false");
      }
      if (!locked && !firstAvailable) firstAvailable = radio;
      if (locked && radio.checked) radio.checked = false;
    });
    var checked = $('input[name="tier"]:checked', el.projectForm);
    if (!checked && firstAvailable) firstAvailable.checked = true;
    if (el.tierHint) {
      var planName = (state.billing && state.billing.planName) || (state.user && (state.user.planName || state.user.plan)) || "Free";
      if (maxTier === "enterprise") el.tierHint.textContent = "Enterprise-depth artifacts are unlocked on your " + planName + " plan.";
      else el.tierHint.textContent = "Your " + planName + " plan unlocks " + (maxTier === "smb" ? "SMB" : "Small") + "-depth artifacts. Upgrade in Billing & usage for " + (maxTier === "smb" ? "Enterprise" : "SMB or Enterprise") + " depth.";
    }
  }

  function prefillIdea() {
    var idea = "";
    try { idea = sessionStorage.getItem(IDEA_KEY) || localStorage.getItem(IDEA_KEY) || ""; } catch (e) { /* ignore */ }
    try {
      var q = new URLSearchParams(window.location.search).get("idea");
      if (q) idea = q;
    } catch (e) { /* ignore */ }
    el.ideaInput.value = idea;
    updateIdeaCount();
  }

  function updateIdeaCount() {
    var n = el.ideaInput.value.length;
    el.ideaCount.textContent = n + " / 2500";
    el.ideaCount.classList.toggle("over", n > 2500);
  }

  function showOnboarding(canCancel, idea) {
    el.onboardClose.hidden = !canCancel;
    el.onboardCancel.hidden = !canCancel;
    el.projectError.hidden = true;
    syncTierOptions();
    if (typeof idea === "string" && idea) el.ideaInput.value = idea;
    else if (!el.ideaInput.value) prefillIdea();
    updateIdeaCount();
    if (state.readiness && state.readiness.score != null) {
      el.ideaHint.textContent = "Readiness " + state.readiness.score + " / 18 — " + state.readiness.band + ". " + (el.ideaHint.textContent || "");
    }
    el.onboarding.hidden = false;
    el.onboarding.scrollTop = 0;
    document.body.style.overflow = "hidden";
    setTimeout(function () { el.ideaInput.focus(); }, 60);
  }

  function hideOnboarding() {
    el.onboarding.hidden = true;
    document.body.style.overflow = "";
  }

  function bindOnboarding() {
    el.ideaInput.addEventListener("input", updateIdeaCount);
    el.onboardClose.addEventListener("click", function () { if (state.project) hideOnboarding(); });
    el.onboardCancel.addEventListener("click", function () { if (state.project) hideOnboarding(); });
    el.projectForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var idea = el.ideaInput.value.trim();
      if (idea.length < 24) {
        el.projectError.textContent = "Give the idea a little more shape — at least 24 characters.";
        el.projectError.hidden = false;
        return;
      }
      var tierNode = $('input[name="tier"]:checked', el.projectForm);
      var btn = el.onboardSubmit;
      btn.disabled = true; btn.textContent = "Generating your first artifact…";
      el.projectError.hidden = true;
      api("/api/projects", {
        method: "POST",
        body: {
          idea: idea,
          tier: tierNode ? tierNode.value : "small",
          model: el.modelSelect.value,
          industry: el.industryInput.value.trim(),
          name: el.projectName.value.trim(),
        },
      }).then(function (data) {
        state.ws = data;
        state.project = data.project;
        state.sandboxFull = null;
        state.projects.push(data.project);
        try { localStorage.setItem("kiln.lastProject", data.project.id); localStorage.removeItem(IDEA_KEY); } catch (e) { /* ignore */ }
        hideOnboarding();
        showApp();
        updateShell();
        setView("chat");
        toast("Sandbox created. Your first ideation artifact is ready.", "success", data.project.codename);
      }).catch(function (err) {
        el.projectError.textContent = err.message;
        el.projectError.hidden = false;
      }).then(function () {
        btn.disabled = false;
        btn.innerHTML = 'Create sandbox &amp; generate <span aria-hidden="true">→</span>';
      });
    });
  }

  /* ---------------- modal ---------------- */
  function bindModal() {
    el.modalRoot.addEventListener("click", function (e) {
      if (e.target.closest("[data-close-modal]")) closeModal();
    });
    el.modalActions.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-modal-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-modal-action");
      if (action === "approve") approveDoc(btn);
      if (action === "reopen") reopenDoc(btn);
      if (action === "regenerate") regenerateDoc(btn);
    });
  }

  function openDoc(doc, kind) {
    state.modalDoc = { doc: doc, kind: kind || "artifact" };
    el.modalRoot.hidden = false;
    document.body.style.overflow = "hidden";
    renderModal();
    setTimeout(function () { $(".icon-btn[data-close-modal], .modal .icon-btn", el.modalRoot).focus(); }, 40);
  }

  function closeModal() {
    if (!el.modalRoot || el.modalRoot.hidden) return;
    el.modalRoot.hidden = true;
    state.modalDoc = null;
    document.body.style.overflow = "";
  }

  function renderModal() {
    var ctx = state.modalDoc;
    if (!ctx) return;
    var doc = ctx.doc;
    var kind = ctx.kind;
    var isCollateral = kind === "collateral";
    el.modalKicker.textContent = (isCollateral ? "Proposal collateral" : doc.functionName || "Artifact") + " · Revision " + (doc.revision || 1);
    el.modalTitle.textContent = doc.title || doc.functionName || "Artifact";
    el.modalSub.textContent = doc.subtitle || doc.summary || "";

    var exportsHtml = (doc.formats || []).map(function (f) {
      var base = isCollateral ? "/api/collaterals/" + doc.id + "/export" : "/api/artifacts/" + doc.id + "/export";
      return '<a class="btn btn-line" href="' + base + "?format=" + encodeURIComponent(f) + '" download>' + esc(FORMAT_LABELS[f] || f) + "</a>";
    }).join("");

    var actions = statusPill(doc.status);
    if (doc.status !== "approved") actions += '<button class="btn btn-ink" data-modal-action="approve">Approve draft</button>';
    else actions += '<button class="btn btn-line" data-modal-action="reopen">Reopen for edits</button>';
    if (!isCollateral) actions += '<button class="btn btn-line" data-modal-action="regenerate">New revision</button>';
    actions += '<span class="spacer"></span>' + exportsHtml;
    el.modalActions.innerHTML = actions;

    var meta = [
      "Status: <b>" + esc(doc.status || "draft") + "</b>",
      "Model: <b>" + esc(doc.modelName || (doc.project && doc.project.modelName) || "—") + "</b>",
      doc.confidence != null ? "Confidence: <b>" + esc(doc.confidence) + "%</b>" : "",
      "Generated: <b>" + esc(fmtDate(doc.createdAt)) + "</b>",
      (doc.formats || []).length ? "Exports: <b>" + doc.formats.map(function (f) { return esc(FORMAT_LABELS[f] || f); }).join(" · ") + "</b>" : "",
    ].filter(Boolean).map(function (m) { return "<span>" + m + "</span>"; }).join("");

    var body = '<div class="artifact-meta">' + meta + "</div>";
    if (doc.summary && doc.subtitle) body += '<div class="sec"><p>' + inlineMd(doc.summary) + "</p></div>";
    body += (doc.sections || []).map(renderSection).join("");

    if (doc.capabilities && doc.capabilities.length) {
      body += '<div class="sec"><div class="sec-title">Capabilities covered</div><ul class="bullet-list capability-list">' +
        doc.capabilities.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div>";
    }
    if (doc.guardrails && doc.guardrails.length) {
      body += '<div class="sec"><div class="sec-title">Human-in-the-loop guardrails</div><div class="guardrail-list">' +
        doc.guardrails.map(function (g) { return "<span>" + esc(g) + "</span>"; }).join("") + "</div></div>";
    }
    if (doc.agentTrace && doc.agentTrace.length) {
      body += '<div class="sec"><div class="sec-title">Agent trace</div><ul class="bullet-list trace-list">' +
        doc.agentTrace.map(function (t) {
          if (typeof t === "string") return "<li>" + esc(t) + "</li>";
          var state = t.state || t.status || "";
          return "<li><b>" + esc(t.step || t.name || t.action || "Step") + "</b>" +
            (t.detail ? " — " + esc(t.detail) : "") +
            (state ? ' <span class="trace-state ' + esc(state) + '">' + esc(state) + "</span>" : "") + "</li>";
        }).join("") + "</ul></div>";
    }
    el.modalBody.innerHTML = body;
    el.modalBody.scrollTop = 0;
  }

  function renderSection(sec) {
    if (!sec || !sec.type) return "";
    var title = sec.title ? '<div class="sec-title">' + esc(sec.title) + "</div>" : "";
    var body = "";
    if (sec.type === "kpis") {
      body = '<div class="kpi-grid">' + (sec.items || []).map(function (i) {
        return '<div class="kpi"><span>' + esc(i.label) + "</span><b>" + esc(i.value) + "</b></div>";
      }).join("") + "</div>";
    } else if (sec.type === "table") {
      var cols = sec.columns || [];
      body = '<div class="artifact-table-wrap"><table class="artifact-table"><thead><tr>' +
        cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        (sec.rows || []).map(function (row) {
          return "<tr>" + (Array.isArray(row) ? row : [row]).map(function (c) { return "<td>" + inlineMd(c) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    } else if (sec.type === "prose") {
      body = "<p>" + inlineMd(sec.text || "") + "</p>";
    } else if (sec.type === "bullets") {
      body = '<ul class="bullet-list">' + (sec.items || []).map(function (i) {
        return "<li>" + inlineMd(typeof i === "string" ? i : i.label || i.text || "") + "</li>";
      }).join("") + "</ul>";
    } else if (sec.type === "numbered") {
      body = '<ol class="num-list">' + (sec.items || []).map(function (i) {
        return "<li>" + inlineMd(typeof i === "string" ? i : i.label || i.text || "") + "</li>";
      }).join("") + "</ol>";
    } else if (sec.type === "timeline") {
      body = '<div class="timeline">' + (sec.items || []).map(function (i) {
        return '<div class="tl-item"><div class="tl-head"><b>' + esc(i.phase) + "</b><span>" + esc(i.weeks) + "</span></div>" +
          (i.detail ? "<p>" + inlineMd(i.detail) + "</p>" : "") +
          (i.items && i.items.length ? '<div class="tl-sub">' + i.items.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</div>" : "") +
          "</div>";
      }).join("") + "</div>";
    } else if (sec.type === "bars") {
      body = '<div class="bars">' + (sec.items || []).map(function (i) {
        var v = pct(i.value);
        return '<div class="bar-row"><span>' + esc(i.label) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + v + '%"></div></div><b>' + v + "</b></div>";
      }).join("") + "</div>";
    } else if (sec.type === "callout") {
      body = '<div class="callout ' + (sec.tone === "warn" ? "warn" : "") + '">' +
        (sec.title ? "<b>" + esc(sec.title) + "</b>" : "") + "<p>" + inlineMd(sec.text || "") + "</p></div>";
      return '<div class="sec">' + body + "</div>";
    } else if (sec.type === "checklist") {
      body = '<div class="checklist">' + (sec.items || []).map(function (i) {
        var done = ["done", "complete", "approved", "pass"].indexOf(String(i.state || "").toLowerCase()) >= 0;
        return '<div class="check-item ' + (done ? "done" : "") + '"><span class="check-box"></span><span>' + esc(i.label) +
          '</span><span class="state">' + esc(i.state || "pending") + "</span></div>";
      }).join("") + "</div>";
    } else if (sec.type === "keyvalue") {
      body = '<div class="kv">' + (sec.items || []).map(function (i) {
        return '<div class="kv-row"><b>' + esc(i.label) + "</b><span>" + inlineMd(i.value) + "</span></div>";
      }).join("") + "</div>";
    } else {
      body = '<pre class="code-view">' + esc(JSON.stringify(sec, null, 2)) + "</pre>";
    }
    return '<div class="sec">' + title + body + "</div>";
  }

  function approveDoc(btn) {
    var ctx = state.modalDoc;
    if (!ctx) return;
    var doc = ctx.doc;
    var base = ctx.kind === "collateral" ? "/api/collaterals/" + doc.id + "/approve" : "/api/artifacts/" + doc.id + "/approve";
    btn.disabled = true;
    api(base, { method: "POST" }).then(function (data) {
      Object.assign(doc, data.collateral || data.artifact);
      updateShell();
      renderModal();
      if (state.view === "workstreams") renderWorkstreams();
      if (state.view === "collateral") renderCollateral();
      if (state.view === "delivery") renderDelivery();
      toast("Draft approved and recorded against " + state.user.name + ".", "success", "Approved");
    }).catch(function (err) { toast(err.message, "error", "Approval failed"); })
      .then(function () { btn.disabled = false; });
  }

  function reopenDoc(btn) {
    var ctx = state.modalDoc;
    if (!ctx || ctx.kind === "collateral") return;
    var doc = ctx.doc;
    btn.disabled = true;
    api("/api/artifacts/" + doc.id + "/reopen", { method: "POST" }).then(function (data) {
      Object.assign(doc, data.artifact);
      updateShell();
      renderModal();
      if (state.view === "workstreams") renderWorkstreams();
      toast("Artifact reopened as a draft.", "", "Reopened");
    }).catch(function (err) { toast(err.message, "error", "Could not reopen"); })
      .then(function () { btn.disabled = false; });
  }

  function regenerateDoc(btn) {
    var ctx = state.modalDoc;
    if (!ctx || ctx.kind === "collateral") return;
    var doc = ctx.doc;
    btn.disabled = true; btn.textContent = "Generating…";
    runFunction(doc.functionKey, { open: false }).then(function (artifact) {
      if (artifact) {
        ctx.doc = artifact;
        renderModal();
        if (state.view === "workstreams") renderWorkstreams();
      }
    }).catch(function () {}).then(function () {
      btn.disabled = false; btn.textContent = "New revision";
    });
  }

  /* ---------------- views ---------------- */
  function renderView() {
    var v = state.view;
    if (v === "billing") { updateShell(); return renderBilling(); }
    if (v === "evidence") { updateShell(); return renderEvidence(); }
    if (v === "team") { updateShell(); return renderTeam(); }
    if (v === "security") { updateShell(); return renderSecurity(); }
    if (v === "connectors") { updateShell(); return renderConnectors(); }
    if (v === "developer") { updateShell(); return renderDeveloper(); }
    if (v === "operations") { updateShell(); return renderOperations(); }
    if (v === "fde-forum") { updateShell(); return renderForumEmbed(); }
    if (!state.ws) return;
    updateShell();
    if (v === "chat") return renderChat();
    if (v === "workstreams") return renderWorkstreams();
    if (v === "sandbox") return renderSandbox();
    if (v === "deployments") return renderDeployments();
    if (v === "collateral") return renderCollateral();
    if (v === "revenue") return renderRevenue();
    if (v === "fde") return renderFDE();
    if (v === "delivery") return renderDelivery();
    if (v === "blueprint") return renderBlueprint();
  }

  function viewHead(eyebrow, title, copy, actions) {
    return '<div class="view-head"><div><div class="eyebrow-sm">' + esc(eyebrow) + "</div><h1>" + title + "</h1>" +
      (copy ? "<p>" + esc(copy) + "</p>" : "") + '</div><div class="view-actions">' + (actions || "") + "</div></div>";
  }

  /* ============================== CHAT ============================== */
  function renderChat() {
    var p = state.project;
    var msgs = state.ws.messages || [];
    var artifacts = state.ws.artifacts || [];
    var approved = artifacts.filter(function (a) { return a.status === "approved"; }).length;
    el.viewRoot.className = "view chat-view";

    var top = '<div class="chat-top"><div class="chat-ident"><div class="avatar">' + esc(initial(p.codename)) + "</div><div><b>" +
      esc(p.name) + "</b><span>" + esc(p.codename) + " · " + esc(p.tierLabel) + " · " + esc(p.modelName) + "</span></div></div>" +
      '<div class="chat-stats"><span class="stat-chip"><b>' + artifacts.length + "</b> artifacts</span>" +
      '<span class="stat-chip"><b>' + approved + "</b> approved</span>" +
      '<span class="stat-chip"><b>' + (state.ws.deployments || []).length + "</b> deployments</span></div></div>";

    var thread = '<div class="messages" id="messages">';
    if (!msgs.length) {
      thread += '<div class="chat-empty">' +
        '<svg class="mark-big" viewBox="0 0 28 28" aria-hidden="true"><path d="M4 22V12a10 10 0 0 1 20 0v10" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 22V13a5 5 0 0 1 10 0v9" fill="none" stroke="#d3552d" stroke-width="1.7"/><rect x="2" y="22.2" width="24" height="2.6" rx="1.3" fill="currentColor"/></svg>' +
        "<h2>Start with a sentence.</h2><p>Ask for a workstream, say “generate all”, or tell me what changed in the business.</p>" +
        '<div class="prompt-list">' + ["Generate all", "Ideation to Prototype", "Architecture Design & Review", "Proposal Design", "Testing with AI", "Capacity Planning: DPR & RLS"].map(function (t) {
          return '<button data-prompt="' + esc(t) + '">' + esc(t) + "</button>";
        }).join("") + "</div></div>";
    } else {
      thread += msgs.map(function (m) {
        var isUser = m.role === "user";
        var artifact = m.artifactId ? artifacts.filter(function (a) { return a.id === m.artifactId; })[0] : null;
        return '<div class="msg ' + (isUser ? "user" : "assistant") + '">' +
          '<div class="avatar">' + (isUser ? esc(initial(state.user.name)) : "K") + "</div>" +
          '<div class="msg-body"><div class="msg-meta"><b>' + (isUser ? esc(state.user.name) : esc(p.codename)) + "</b><span>" + esc(fmtDate(m.at)) + "</span></div>" +
          '<div class="bubble">' + md(m.text) +
          (artifact ? '<button class="msg-artifact" data-open-artifact="' + esc(artifact.id) + '"><span>◆</span> ' + esc(artifact.functionName) + " r" + esc(artifact.revision) +
            ' <span class="fmt">' + artifact.formats.map(function (f) { return esc(FORMAT_LABELS[f] || f); }).join(" · ") + "</span> →</button>" : "") +
          "</div></div></div>";
      }).join("");
    }
    if (state.busy) {
      thread += '<div class="msg assistant"><div class="avatar">K</div><div class="msg-body"><div class="msg-meta"><b>' + esc(p.codename) + "</b><span>working</span></div>" +
        '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div></div>';
    }
    thread += "</div>";

    var quick = ["Generate all", "Discovery & Competitor Analysis", "Architecture Design & Review", "Proposal Design", "AI DLC & Deployment", "Capacity Planning: DPR & RLS", "What should I do next?"];
    var composer = '<div class="composer-wrap"><form class="composer" id="composerForm">' +
      '<div class="quick-row">' + quick.map(function (q) { return '<button type="button" data-prompt="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div>" +
      '<textarea id="chatInput" rows="1" placeholder="Ask for a workstream, challenge an assumption, or say “generate all”…" maxlength="4000">' + esc(state.draft) + "</textarea>" +
      '<div class="composer-row"><span class="composer-hint">⌘↵ to send · artifacts stay drafts until approved</span>' +
      '<button class="btn btn-ember" type="submit"' + (state.busy ? " disabled" : "") + ">" + (state.busy ? "Working…" : 'Send <span aria-hidden="true">→</span>') + "</button></div></form></div>";

    el.viewRoot.innerHTML = top + thread + composer;

    var messages = $("#messages");
    if (messages) messages.scrollTop = messages.scrollHeight;

    var input = $("#chatInput");
    function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 150) + "px"; }
    input.addEventListener("input", function () {
      state.draft = input.value;
      autosize();
    });
    input.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
    });
    autosize();
    if (!state.busy) setTimeout(function () { input.focus(); }, 30);

    function submit() {
      var text = input.value.trim();
      if (!text || state.busy) return;
      sendMessage(text);
    }
    $("#composerForm").addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    $$("[data-prompt]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { sendMessage(btn.getAttribute("data-prompt")); });
    });
    $$("[data-open-artifact]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var a = (state.ws.artifacts || []).filter(function (x) { return x.id === btn.getAttribute("data-open-artifact"); })[0];
        if (a) openDoc(a, "artifact");
      });
    });
  }

  function sendMessage(text) {
    if (state.busy) return;
    state.busy = true;
    state.draft = "";
    renderChat();
    api("/api/projects/" + state.project.id + "/chat", { method: "POST", body: { message: text } })
      .then(function (data) {
        (data.messages || []).forEach(function (m) { state.ws.messages.push(m); });
        (data.artifacts || []).forEach(function (a) { state.ws.artifacts.unshift(a); });
        if (data.project) Object.assign(state.ws.project, data.project);
        state.busy = false;
        updateShell();
        renderChat();
      })
      .catch(function (err) {
        state.busy = false;
        state.draft = text;
        renderChat();
        toast(err.message, "error", "Message failed");
      });
  }

  /* ============================== WORKSTREAMS ============================== */
  function latestFor(key) {
    var list = (state.ws.artifacts || []).filter(function (a) { return a.functionKey === key; });
    return list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0] || null;
  }

  function renderWorkstreams() {
    el.viewRoot.className = "view";
    var artifacts = state.ws.artifacts || [];
    var uniq = {};
    artifacts.forEach(function (a) { uniq[a.functionKey] = true; });
    var approved = artifacts.filter(function (a) { return a.status === "approved"; }).length;
    var fns = state.catalog.functions;

    var head = viewHead("Twelve workstreams", "The whole business,<br/><em>one workstream at a time.</em>",
      "Every card generates a real, brief-specific artifact with exports. Drafts stay drafts until a named human approves them.",
      '<button class="btn btn-ink" id="runAllBtn">Generate missing</button><button class="btn btn-line" id="packBtn2">Delivery pack</button>');

    var summary = '<div class="ws-summary">' +
      '<div class="metric"><b>' + Object.keys(uniq).length + '</b><span>of 12 workstreams</span></div>' +
      '<div class="metric moss"><b>' + approved + "</b><span>Approved artifacts</span></div>" +
      '<div class="metric"><b>' + artifacts.length + "</b><span>Total revisions</span></div>" +
      '<div class="metric ember"><b>' + (state.ws.deployments || []).length + "</b><span>Deployments</span></div></div>";

    var grid = '<div class="ws-grid">' + fns.map(function (fn) {
      var a = latestFor(fn.key);
      var formats = fn.formats.map(function (f) { return '<span>' + esc(FORMAT_LABELS[f] || f) + "</span>"; }).join("");
      var capabilities = "";
      if (fn.capabilities && fn.capabilities.length) {
        capabilities = '<details class="ws-cap"><summary>Capabilities <span>' + fn.capabilities.length + "</span></summary>" +
          '<div class="ws-cap-body"><ul>' + fn.capabilities.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" +
          (fn.guardrails && fn.guardrails.length
            ? '<div class="ws-cap-label">Human guardrails</div><ul class="ws-cap-guards">' + fn.guardrails.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul>"
            : "") +
          "</div></details>";
      }
      return '<article class="ws">' +
        '<div class="ws-head"><span class="ws-num">' + String(fn.n).padStart(2, "0") + "</span>" + (a ? statusPill(a.status) : '<span class="pill">Not generated</span>') + "</div>" +
        "<h3>" + esc(fn.name) + "</h3><p>" + esc(fn.short) + "</p>" +
        '<div class="ws-meta">' + formats + (a ? "<span>r" + esc(a.revision) + "</span>" : "") + "</div>" +
        capabilities +
        '<div class="ws-foot"><span class="status ' + (a ? (a.status === "approved" ? "approved" : "draft") : "") + '">' +
        (a ? (a.status === "approved" ? "Approved" : "Draft · review") : "Awaiting") + "</span>" +
        '<div class="ws-actions">' + (a
          ? '<button class="btn btn-line" data-open="' + esc(a.id) + '">Open</button><button class="btn btn-quiet" data-run-fn="' + esc(fn.key) + '" title="Generate a new revision">↻</button>'
          : '<button class="btn btn-ink" data-run-fn="' + esc(fn.key) + '">Generate</button>') +
        "</div></div></article>";
    }).join("") + "</div>";

    el.viewRoot.innerHTML = head + summary + grid;

    $("#runAllBtn").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true; btn.textContent = "Generating…";
      api("/api/projects/" + state.project.id + "/run-all", { method: "POST" }).then(function (data) {
        (data.generated || []).forEach(function (a) { state.ws.artifacts.unshift(a); });
        if (data.project) Object.assign(state.ws.project, data.project);
        updateShell();
        renderWorkstreams();
        toast((data.generated || []).length + " workstreams generated as drafts.", "success", "Workstreams complete");
      }).catch(function (err) { toast(err.message, "error", "Generation failed"); })
        .then(function () { btn.disabled = false; btn.textContent = "Generate missing"; });
    });
    $("#packBtn2").addEventListener("click", function () { setView("delivery"); });

    $$("[data-open]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var a = (state.ws.artifacts || []).filter(function (x) { return x.id === btn.getAttribute("data-open"); })[0];
        if (a) openDoc(a, "artifact");
      });
    });
    $$("[data-run-fn]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () {
        runFunction(btn.getAttribute("data-run-fn"), { open: true, button: btn });
      });
    });
  }

  function runFunction(key, opts) {
    opts = opts || {};
    if (opts.button) { opts.button.disabled = true; opts.button.textContent = "…"; }
    progress(true);
    return api("/api/projects/" + state.project.id + "/run", { method: "POST", body: { functionKey: key, instruction: state.project.idea } })
      .then(function (data) {
        state.ws.artifacts.unshift(data.artifact);
        if (data.project) Object.assign(state.ws.project, data.project);
        updateShell();
        toast(data.artifact.functionName + " r" + data.artifact.revision + " generated as a draft.", "success", "Artifact ready");
        if (opts.open) openDoc(data.artifact, "artifact");
        else if (state.view === "workstreams") renderWorkstreams();
        return data.artifact;
      })
      .catch(function (err) { toast(err.message, "error", "Generation failed"); return null; })
      .then(function (result) {
        progress(false);
        if (opts.button) {
          opts.button.disabled = false;
          opts.button.textContent = state.view === "workstreams" ? "↻" : "Generate";
        }
        return result;
      });
  }

  /* ============================== SANDBOX ============================== */
  function renderSandbox() {
    el.viewRoot.className = "view";
    var p = state.project;
    var sb = state.ws.sandbox || { files: [], features: [], entities: [], metrics: [] };
    var envs = p.envs || {};
    var head = viewHead("Isolated sandbox", "A working prototype,<br/><em>not a mockup.</em>",
      "The generated app runs against synthetic data. Production promotion is a separate, human-approved act.",
      '<a class="btn btn-line" href="' + esc(sb.previewUrl) + '" target="_blank" rel="noopener">Open in new tab ↗</a>' +
      '<button class="btn btn-ink" id="reloadFrame">Reload</button>');

    function envRow(env) {
      var e = envs[env];
      var label = env === "prod" ? "PROD" : env === "test" ? "TEST" : "DEV";
      return '<div class="env-row"><span class="env-badge ' + env + '">' + label + "</span>" +
        (e ? "<div><b>" + esc(e.version) + "</b><span> · " + esc(e.status || "deployed") + (e.approvedBy ? " by " + esc(e.approvedBy) : "") + "</span></div>"
           : "<div><b>—</b><span> · not deployed</span></div>") +
        '<span class="pill ' + (e ? "live" : "") + '">' + (e ? "live" : "idle") + "</span></div>";
    }

    var layout = '<div class="sandbox-layout"><div class="sandbox-main">' +
      '<div class="browser-bar"><div class="dots"><i></i><i></i><i></i></div><div class="url">' + esc(window.location.origin + sb.previewUrl) + "</div></div>" +
      '<iframe class="sandbox-frame" id="sandboxFrame" src="' + esc(sb.previewUrl) + '" title="Kiln sandbox prototype" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>' +
      "</div>" +
      '<div class="sandbox-aside">' +
      '<section class="panel"><div class="panel-head"><h3>Environments</h3><span class="pill">' + esc(p.tierLabel) + "</span></div>" +
      envRow("dev") + envRow("test") + envRow("prod") +
      '<div class="deploy-btns"><button class="btn btn-line" data-deploy="dev">Deploy dev</button><button class="btn btn-line" data-deploy="test">Deploy test</button><button class="btn btn-ember" data-deploy="prod">Request prod</button></div>' +
      (state.user.plan === "free" ? '<div class="sec-note">Free prototype: dev and test are included. Production shipping needs a paid plan. <a href="/app?view=billing">Compare plans</a></div>' : '') +
      "</section>" +
      '<section class="panel"><div class="panel-head"><h3>Prototype surface</h3><span class="pill">' + (sb.features || []).length + " features</span></div>" +
      '<div class="feature-pills">' + (sb.features || []).map(function (f) { return "<span>" + esc(f.name || f) + "</span>"; }).join("") + "</div>" +
      '<div class="sec-note">Entities: ' + esc((sb.entities || []).join(" · ")) + "</div></section>" +
      '<section class="panel"><div class="panel-head"><h3>Scaffold files</h3><span class="pill">' + (sb.files || []).length + " files</span></div>" +
      '<div class="file-list">' + (sb.files || []).map(function (f) {
        return '<button class="file-row" data-file="' + esc(f.path) + '"><span>◇</span><span>' + esc(f.path) + '</span><span class="lang">' + esc(f.lang) + '</span><span class="size">' + Math.max(1, Math.round((f.bytes || 0) / 1024)) + "k</span></button>";
      }).join("") + "</div></section>" +
      "</div></div>";

    el.viewRoot.innerHTML = head + layout;

    $("#reloadFrame").addEventListener("click", function () {
      var frame = $("#sandboxFrame");
      frame.src = sb.previewUrl + "?_=" + Date.now();
      toast("Preview reloaded.", "", "Sandbox");
    });
    $$("[data-deploy]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { deploy(btn.getAttribute("data-deploy"), btn); });
    });
    $$("[data-file]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { openFile(btn.getAttribute("data-file")); });
    });
  }

  function deploy(env, btn) {
    btn.disabled = true;
    var old = btn.textContent;
    btn.textContent = "Deploying…";
    api("/api/projects/" + state.project.id + "/deploy", { method: "POST", body: { env: env } }).then(function (data) {
      (state.ws.deployments || []).unshift(data.deployment);
      if (data.project) {
        Object.assign(state.ws.project, data.project);
        state.project = state.ws.project;
      }
      updateShell();
      if (env === "prod") {
        toast("Production promotion is waiting for your approval.", "", "Gate 04");
        setView("deployments");
      } else {
        renderView();
        toast("Deployed to " + env.toUpperCase() + " · " + data.deployment.testsPassed + "/" + data.deployment.testsTotal + " generated tests passed.", "success", "Deployment complete");
      }
    }).catch(function (err) {
      toast(err.message, "error", "Deployment failed");
      btn.disabled = false; btn.textContent = old;
    });
  }

  function openFile(path) {
    var load = state.sandboxFull
      ? Promise.resolve(state.sandboxFull)
      : api("/api/projects/" + state.project.id + "/sandbox").then(function (data) { state.sandboxFull = data; return data; });
    load.then(function (data) {
      var file = (data.files || []).filter(function (f) { return f.path === path; })[0];
      if (!file) { toast("File not found in the scaffold.", "error"); return; }
      state.modalDoc = null;
      el.modalRoot.hidden = false;
      document.body.style.overflow = "hidden";
      el.modalKicker.textContent = "Sandbox scaffold";
      el.modalTitle.textContent = file.path;
      el.modalSub.textContent = file.lang + " · " + file.content.length + " bytes · generated for " + state.project.codename;
      el.modalActions.innerHTML = '<span class="spacer"></span><button class="btn btn-line" data-close-modal>Close</button>';
      el.modalBody.innerHTML = '<pre class="code-view">' + esc(file.content) + "</pre>";
    }).catch(function (err) { toast(err.message, "error", "Could not load file"); });
  }

  /* ============================== DEPLOYMENTS ============================== */
  function renderDeployments() {
    el.viewRoot.className = "view";
    var deps = state.ws.deployments || [];
    var head = viewHead("Progressive delivery", "Every deployment,<br/><em>with its evidence.</em>",
      "Generated tests, policy gates and canary evidence are attached. Production promotion requires a named human.",
      '<button class="btn btn-line" data-deploy-top="dev">Deploy dev</button><button class="btn btn-line" data-deploy-top="test">Deploy test</button><button class="btn btn-ember" data-deploy-top="prod">Request production</button>');

    var list = deps.length ? deps.map(function (d, idx) {
      var open = d.status === "awaiting_approval" || idx === 0;
      var stages = (d.stages || []).map(function (s) {
        return '<div class="stage-row"><span class="stage-dot ' + esc(s.status) + '"></span><div><b>' + esc(s.name) + "</b><small>" + esc(s.detail) + '</small></div><span>' + esc(s.duration) + "</span></div>";
      }).join("");
      var tests = (d.tests || []).slice(0, 10).map(function (t) {
        return '<div class="test-row"><span class="t-id">' + esc(t.id) + '</span><span class="t-type">' + esc(t.type) + "</span><span>" + esc(t.feature) + '</span><span class="t-status ' + esc(t.status) + '">' + esc(t.status) + "</span></div>";
      }).join("");
      var actions = "";
      if (d.status === "awaiting_approval") {
        actions = '<button class="btn btn-ember" data-approve-dep="' + esc(d.id) + '">Approve production</button><button class="btn btn-line" data-reject-dep="' + esc(d.id) + '">Reject</button>';
      }
      return '<article class="dep ' + (open ? "open" : "") + '" data-dep="' + esc(d.id) + '">' +
        '<div class="dep-head" data-dep-toggle><span class="dep-env ' + esc(d.env) + '">' + esc(d.env) + "</span><b>" + esc(d.version) + "</b>" +
        '<span class="dep-sub">' + esc(d.commit) + " · " + esc(fmtDate(d.createdAt)) + " · " + esc(d.testsPassed + "/" + d.testsTotal) + " tests</span>" +
        statusPill(d.status) + "</div>" +
        '<div class="dep-body"><div class="test-summary"><span><b>' + esc(d.testsTotal) + "</b> generated tests</span><span><b>" + esc(d.newTests) + "</b> new this diff</span><span>Coverage <b>" + esc(d.coverage) + "%</b></span><span>Readiness <b>" + esc(d.readiness) + "</b></span><span>Rollback <b>" + esc(d.rollback) + "</b></span></div>" +
        stages + '<div class="dep-tests">' + tests + "</div>" +
        '<div class="dep-note">' + esc(d.notes || "") + "</div>" +
        (actions ? '<div class="dep-actions">' + actions + "</div>" : "") +
        "</div></article>";
    }).join("") : '<div class="empty-state"><b>No deployments yet.</b><p>Deploy to dev or test to generate a diff-aware test suite, or request production to exercise the approval gate.</p></div>';

    el.viewRoot.innerHTML = head + (state.user.plan === "free" ? '<div class="sec-note upgrade-note">Free prototype: production promotion is locked. <a href="/app?view=billing">Upgrade</a> when you are ready to ship.</div>' : '') + '<div class="dep-list">' + list + "</div>";

    $$("[data-dep-toggle]", el.viewRoot).forEach(function (h) {
      h.addEventListener("click", function () { h.closest(".dep").classList.toggle("open"); });
    });
    $$("[data-deploy-top]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { deploy(btn.getAttribute("data-deploy-top"), btn); });
    });
    $$("[data-approve-dep]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { decideDeployment(btn.getAttribute("data-approve-dep"), "approve", btn); });
    });
    $$("[data-reject-dep]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { decideDeployment(btn.getAttribute("data-reject-dep"), "reject", btn); });
    });
  }

  function decideDeployment(depId, decision, btn) {
    btn.disabled = true;
    api("/api/projects/" + state.project.id + "/deployments/" + depId + "/" + decision, { method: "POST" }).then(function (data) {
      var i = (state.ws.deployments || []).findIndex(function (d) { return d.id === depId; });
      if (i >= 0) state.ws.deployments[i] = data.deployment;
      if (data.project) { Object.assign(state.ws.project, data.project); state.project = state.ws.project; }
      updateShell();
      renderDeployments();
      toast(decision === "approve" ? "Production promotion approved and recorded." : "Promotion rejected; stable revision retained.", decision === "approve" ? "success" : "", "Gate 04");
    }).catch(function (err) {
      toast(err.message, "error", "Decision failed");
      btn.disabled = false;
    });
  }

  /* ============================== COLLATERAL ============================== */
  function renderCollateral() {
    el.viewRoot.className = "view";
    var cols = state.ws.collaterals || [];
    var head = viewHead("Commercial collateral", "Proposals that match<br/><em>the work you just planned.</em>",
      "Generated from this project's brief, tier and artifacts. Every item is a draft until commercial and FDE review approve it.",
      '<button class="btn btn-line" data-view-jump="delivery">Export matrix</button>');

    var list = cols.length ? '<div class="stack">' + cols.map(function (c) {
      return '<article class="item-card"><div class="row" style="margin-top:0"><span class="pill">' + esc(c.type) + "</span>" + statusPill(c.status) + "</div>" +
        "<h3>" + esc(c.title) + "</h3><div class=\"sub\">" + esc(c.subtitle) + "</div><p>" + esc(c.summary) + "</p>" +
        '<div class="row"><button class="btn btn-ink" data-open-col="' + esc(c.id) + '">Open</button>' +
        (c.status !== "approved" ? '<button class="btn btn-line" data-approve-col="' + esc(c.id) + '">Approve</button>' : "") +
        '<span class="spacer"></span><div class="fmt-btns">' + formatLinks("/api/collaterals/" + c.id + "/export", c.formats) + "</div></div></article>";
    }).join("") + "</div>" : '<div class="empty-state"><b>No collateral yet.</b><p>Generate a one-pager, battlecard or executive summary from the brief and tier profile.</p></div>';

    var form = '<div class="panel"><div class="panel-head"><h3>Generate collateral</h3></div>' +
      '<label class="field"><span>Type</span><select id="collateralType">' +
      COLLATERAL_TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + "</option>"; }).join("") + "</select></label>" +
      '<p class="sec-note">Uses the project brief, tier profile and current workstream outputs. 4 formats per item.</p>' +
      '<button class="btn btn-ember" id="collateralBtn" style="width:100%;margin-top:10px">Generate draft</button></div>' +
      '<div class="panel"><div class="panel-head"><h3>Commercial guardrails</h3></div><ul class="bullet-list"><li>FDE technical accuracy review</li><li>Commercial approval</li><li>Brand and legal review</li><li>No auto-send to a client</li></ul></div>';

    el.viewRoot.innerHTML = head + '<div class="split-grid"><div>' + list + '</div><div class="stack">' + form + "</div></div>";

    $$("[data-open-col]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = (state.ws.collaterals || []).filter(function (x) { return x.id === btn.getAttribute("data-open-col"); })[0];
        if (c) openDoc(c, "collateral");
      });
    });
    $$("[data-approve-col]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = (state.ws.collaterals || []).filter(function (x) { return x.id === btn.getAttribute("data-approve-col"); })[0];
        if (!c) return;
        btn.disabled = true;
        api("/api/collaterals/" + c.id + "/approve", { method: "POST" }).then(function (data) {
          Object.assign(c, data.collateral);
          updateShell();
          renderCollateral();
          toast("Collateral approved.", "success", "Approved");
        }).catch(function (err) { toast(err.message, "error", "Approval failed"); btn.disabled = false; });
      });
    });
    $("#collateralBtn").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true; btn.textContent = "Generating…";
      api("/api/projects/" + state.project.id + "/collateral", { method: "POST", body: { type: $("#collateralType").value } }).then(function (data) {
        state.ws.collaterals.unshift(data.collateral);
        updateShell();
        renderCollateral();
        toast(data.collateral.title + " generated as a draft.", "success", "Collateral ready");
        openDoc(data.collateral, "collateral");
      }).catch(function (err) { toast(err.message, "error", "Generation failed"); })
        .then(function () { btn.disabled = false; btn.textContent = "Generate draft"; });
    });
    var jump = $("[data-view-jump]", el.viewRoot);
    if (jump) jump.addEventListener("click", function () { setView("delivery"); });
  }

  /* ============================== FDE ============================== */
  function renderFDE() {
    el.viewRoot.className = "view";
    var cons = state.ws.consultations || [];
    var head = viewHead("Forward-deployed engineers", "A human in the room,<br/><em>before the commitment.</em>",
      "Book a consultation and Kiln prepares the brief: objectives, preparation and expected outputs. Nothing is committed until you confirm.");

    var list = cons.length ? '<div class="stack">' + cons.map(function (c) {
      var brief = (c.brief || []).map(function (b) {
        return "<h4>" + esc(b.title) + "</h4><ul>" + (b.items || []).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
      }).join("");
      return '<article class="item-card"><div class="row" style="margin-top:0"><span class="pill live">' + esc(c.status) + '</span><span class="pill">' + esc(c.scheduledFor) + "</span></div>" +
        '<div class="fde-person" style="margin-top:10px"><div class="avatar">' + esc(initial(c.fde)) + "</div><div><b>" + esc(c.fde) + "</b><span>" + esc((c.pod || []).join(" · ")) + "</span></div></div>" +
        "<h3>" + esc(c.topic) + "</h3>" + (c.notes ? "<p>" + esc(c.notes) + "</p>" : "") +
        (c.focus && c.focus.length ? '<div class="feature-pills" style="margin-top:8px">' + c.focus.map(function (f) { return "<span>" + esc(f) + "</span>"; }).join("") + "</div>" : "") +
        '<div class="fde-brief">' + brief + "</div></article>";
    }).join("") + "</div>" : '<div class="empty-state"><b>No consultation booked.</b><p>Use the form to brief an FDE on the wedge, data access or architecture risk.</p></div>';

    var focusChecks = state.catalog.functions.map(function (f) {
      return '<label><input type="checkbox" name="focus" value="' + esc(f.name) + '"/> ' + esc(f.name) + "</label>";
    }).join("");

    var form = '<div class="panel"><div class="panel-head"><h3>Book a consultation</h3><span class="pill">$9,500 from</span></div>' +
      '<label class="field"><span>Focus <small>min 8 characters</small></span><input id="fdeTopic" type="text" maxlength="240" placeholder="Validate the wedge and scope a production slice"/></label>' +
      '<label class="field"><span>Context for the FDE <small>optional</small></span><textarea id="fdeNotes" rows="3" maxlength="2000" placeholder="Constraints, systems, data access, decisions needed…"></textarea></label>' +
      '<div class="field"><span>Workstreams to cover</span><div class="focus-list">' + focusChecks + "</div></div>" +
      '<button class="btn btn-ember" id="fdeBtn" style="width:100%;margin-top:10px">Request consultation</button>' +
      '<p class="sec-note">A named FDE and pod are assigned, a date is proposed and a brief is generated. No calendar invite or commitment until you confirm.</p></div>';

    el.viewRoot.innerHTML = head + '<div class="split-grid"><div>' + list + '</div><div class="stack">' + form + "</div></div>";

    $("#fdeBtn").addEventListener("click", function () {
      var topic = $("#fdeTopic").value.trim();
      if (topic.length < 8) { toast("Describe what you want the FDE to focus on.", "error", "Add a focus"); $("#fdeTopic").focus(); return; }
      var btn = this;
      btn.disabled = true; btn.textContent = "Requesting…";
      var focus = $$('input[name="focus"]:checked', el.viewRoot).map(function (i) { return i.value; });
      api("/api/projects/" + state.project.id + "/consultation", { method: "POST", body: { topic: topic, notes: $("#fdeNotes").value, focus: focus } })
        .then(function (data) {
          state.ws.consultations.unshift(data.consultation);
          renderFDE();
          toast("Consultation proposed with " + data.consultation.fde + " on " + data.consultation.scheduledFor + ".", "success", "FDE booked");
        }).catch(function (err) { toast(err.message, "error", "Could not book"); })
        .then(function () { btn.disabled = false; btn.textContent = "Request consultation"; });
    });
  }

  /* ============================== DELIVERY ============================== */
  function renderDelivery() {
    el.viewRoot.className = "view";
    var artifacts = state.ws.artifacts || [];
    var p = state.project;
    var head = viewHead("Delivery & exports", "Everything is real.<br/><em>Download and check.</em>",
      "Every workstream exports native files. The delivery pack bundles the latest revision per workstream plus the sandbox scaffold and a manifest.");

    var banner = '<div class="pack-banner"><div><h2>Delivery pack</h2><p>Latest artifact per workstream, all available formats, the sandbox scaffold and a manifest listing revisions and approval state.</p></div>' +
      '<a class="btn btn-ember btn-lg" href="/api/projects/' + esc(p.id) + '/pack" download>Download ZIP ⇩</a></div>';

    var rows = state.catalog.functions.map(function (fn) {
      var a = latestFor(fn.key);
      var formats = a ? formatLinks("/api/artifacts/" + a.id + "/export", a.formats) : "—";
      return "<tr><td><span class=\"fn\">" + String(fn.n).padStart(2, "0") + " · " + esc(fn.name) + "</span></td>" +
        "<td>" + (a ? "r" + esc(a.revision) : "—") + "</td>" +
        "<td>" + (a ? '<span class="st ' + esc(a.status) + '">' + esc(a.status) + "</span>" : "—") + "</td>" +
        "<td>" + (a ? esc(fmtDate(a.createdAt)) : "—") + "</td>" +
        "<td>" + (a ? '<div class="fmt-btns">' + formats + "</div>" : "—") + "</td>" +
        '<td>' + (a ? '<button class="btn btn-line" data-open-del="' + esc(a.id) + '">Open</button>' : "") + "</td></tr>";
    }).join("");

    var table = '<div class="artifact-table-wrap"><table class="export-table"><thead><tr><th>Workstream</th><th>Rev</th><th>Status</th><th>Generated</th><th>Native exports</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>";
    var cols = state.ws.collaterals || [];
    if (cols.length) {
      table += '<div class="panel" style="margin-top:16px"><div class="panel-head"><h3>Proposal collaterals</h3><span class="pill">' + cols.length + "</span></div>" +
        '<div class="stack">' + cols.map(function (c) {
          return '<div class="item-card"><div class="row" style="margin-top:0"><b style="font-size:12px">' + esc(c.title) + "</b>" + statusPill(c.status) +
            '<span class="spacer"></span><div class="fmt-btns">' + formatLinks("/api/collaterals/" + c.id + "/export", c.formats) + "</div></div></div>";
        }).join("") + "</div></div>";
    }

    el.viewRoot.innerHTML = head + banner + table;

    $$("[data-open-del]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var a = artifacts.filter(function (x) { return x.id === btn.getAttribute("data-open-del"); })[0];
        if (a) openDoc(a, "artifact");
      });
    });
  }

  /* ============================== BILLING ============================== */
  function billingDate(value) {
    if (!value) return "—";
    try { return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
    catch (error) { return String(value); }
  }

  function billingStatusPill(b) {
    if (!b) return "";
    var label = b.status === "active" && b.plan === "free" ? "free" : b.status;
    if (b.cancelAtPeriodEnd) label = "cancels at period end";
    return '<span class="pill ' + (b.status === "active" ? "live" : b.status === "past_due" ? "warn" : "") + '">' + esc(label) + "</span>";
  }

  /* ============================== TEAM ============================== */
  function renderTeam() {
    el.viewRoot.className = "view team-view";
    var ws = state.workspace;
    if (!ws) {
      el.viewRoot.innerHTML = viewHead("Team & roles", "One workspace.<br/><em>Clear permissions.</em>",
        "Owners, admins, members and viewers share the same source of truth. Generations, deployments and billing stay human-approved.") +
        '<div class="panel"><div class="empty-state"><b>Loading workspace…</b><p>Reading members and roles.</p></div></div>';
      loadWorkspace().then(function () { if (state.view === "team") renderTeam(); });
      return;
    }
    var canManage = ws.role === "owner" || ws.role === "admin";
    var rows = (ws.members || []).map(function (member) {
      var roleOptions = ["member", "admin", "viewer"].map(function (role) {
        return '<option value="' + role + '"' + (member.role === role ? " selected" : "") + ">" + role.charAt(0).toUpperCase() + role.slice(1) + "</option>";
      }).join("");
      var control = member.role === "owner"
        ? '<span class="pill live">Owner</span>'
        : canManage
          ? '<select class="role-select" data-member-role="' + esc(member.id) + '">' + roleOptions + "</select>"
          : '<span class="pill">' + esc(member.role) + "</span>";
      var remove = member.role !== "owner" && canManage
        ? '<button class="btn btn-quiet member-remove" data-member-remove="' + esc(member.id) + '">Remove</button>' : "";
      return '<div class="member-row"><div class="member-ident"><span class="member-avatar">' + esc(initial(member.name || member.email)) + '</span><div><b>' + esc(member.name || member.email) + '</b><span>' + esc(member.email) + '</span></div></div>' +
        '<div class="member-role">' + control + remove + "</div></div>";
    }).join("");
    var invitePanel = canManage
      ? '<form class="panel invite-panel" id="inviteForm"><div class="panel-head"><div><h3>Invite a teammate</h3><p class="sec-note">Invites are email-bound and expire after seven days.</p></div><span class="pill">' + esc(ws.invites || 0) + " pending</span></div>" +
        '<div class="inline-form"><label class="field"><span>Work email</span><input id="inviteEmail" type="email" required placeholder="teammate@company.com"/></label>' +
        '<label class="field"><span>Role</span><select id="inviteRole"><option value="member">Member</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select></label>' +
        '<button class="btn btn-ink" type="submit" id="inviteSubmit">Send invite</button></div>' +
        '<div class="billing-alert" id="inviteResult" hidden></div></form>'
      : '<div class="panel"><div class="empty-state"><b>Your role is ' + esc(ws.role) + '.</b><p>Only owners and admins can invite people or change roles.</p></div></div>';
    var roleNote = '<div class="panel role-note"><div class="panel-head"><h3>What each role can do</h3><span class="pill">Server enforced</span></div>' +
      '<div class="role-grid"><div><b>Owner</b><span>Billing, members, keys, every project action.</span></div><div><b>Admin</b><span>Members, keys, generation and deployments.</span></div><div><b>Member</b><span>Generate, comment, deploy; no workspace admin.</span></div><div><b>Viewer</b><span>Read projects, artifacts and evidence only.</span></div></div></div>';
    el.viewRoot.innerHTML = viewHead("Team & roles", "Shared work.<br/><em>Named accountability.</em>",
      "Every project action is authorized against your workspace role. Invitations are bound to the invited email address.",
      '<button class="btn btn-line" id="teamRefresh">Refresh</button>') +
      '<div class="panel"><div class="panel-head"><div><h3>Members</h3><p class="sec-note">' + esc(ws.members.length) + ' people · your role: ' + esc(ws.role) + '</p></div><span class="pill live">Workspace</span></div><div class="member-list">' + rows + "</div></div>" +
      invitePanel + roleNote;
    var refresh = $("#teamRefresh");
    if (refresh) refresh.addEventListener("click", function () { loadWorkspace().then(renderTeam); });
    var form = $("#inviteForm");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("#inviteSubmit"); btn.disabled = true; btn.textContent = "Sending…";
      api("/api/workspace/members", { method: "POST", body: { email: $("#inviteEmail").value, role: $("#inviteRole").value } })
        .then(function (data) {
          var result = $("#inviteResult");
          result.hidden = false;
          result.innerHTML = "<b>Invite sent.</b> " + esc(data.member.email) + " was added as " + esc(data.member.role) + "." +
            (data.inviteUrl ? ' <a href="' + esc(data.inviteUrl) + '">Test-mode invite link</a>.' : "");
          $("#inviteEmail").value = "";
          loadWorkspace().then(renderTeam);
        })
        .catch(function (error) { toast(error.message, "error", "Invite failed"); })
        .then(function () { btn.disabled = false; btn.textContent = "Send invite"; });
    });
    $$("[data-member-role]", el.viewRoot).forEach(function (select) {
      select.addEventListener("change", function () {
        api("/api/workspace/members/" + encodeURIComponent(select.getAttribute("data-member-role")), { method: "PATCH", body: { role: select.value } })
          .then(function () { toast("Role updated.", "success", "Team"); loadWorkspace().then(renderTeam); })
          .catch(function (error) { toast(error.message, "error", "Role"); });
      });
    });
    $$("[data-member-remove]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        if (!window.confirm("Remove this person from the workspace?")) return;
        api("/api/workspace/members/" + encodeURIComponent(button.getAttribute("data-member-remove")), { method: "DELETE" })
          .then(function () { toast("Member removed.", "success", "Team"); loadWorkspace().then(renderTeam); })
          .catch(function (error) { toast(error.message, "error", "Team"); });
      });
    });
  }


  /* ============================== SECURITY ============================== */
  function renderSecurity() {
    el.viewRoot.className = "view security-view";
    var user = state.user || {};
    var mfa = state.mfa || { enabled: !!user.mfaEnabled };
    var setup = state.mfaSetup;
    var mfaPanel = '<div class="panel"><div class="panel-head"><div><h3>Multi-factor authentication</h3><p class="sec-note">TOTP authenticator plus single-use recovery codes.</p></div>' +
      (mfa.enabled ? '<span class="pill live">Enabled</span>' : '<span class="pill warn">Off</span>') + "</div>";
    if (setup) {
      mfaPanel += '<div class="setup-box"><p><b>1.</b> Add this secret to your authenticator app.</p><code class="secret">' + esc(setup.secret) + '</code>' +
        '<p><a href="' + esc(setup.otpauth) + '">Open in authenticator</a></p>' +
        '<p><b>2.</b> Save these recovery codes now. They will not be shown again.</p><div class="recovery-grid">' +
        (setup.recoveryCodes || []).map(function (code) { return "<code>" + esc(code) + "</code>"; }).join("") + "</div>" +
        '<form id="mfaConfirmForm" class="inline-form"><label class="field"><span>Six-digit code</span><input id="mfaConfirmCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required/></label><button class="btn btn-ink" type="submit">Confirm and enable</button></form></div>';
    } else if (mfa.enabled) {
      mfaPanel += '<p class="sec-note">' + esc(mfa.recoveryCodesRemaining || 0) + ' recovery codes remain. Disabling MFA requires your password and a current code.</p><button class="btn btn-line" id="mfaDisableBtn">Disable MFA</button>';
    } else {
      mfaPanel += '<p class="sec-note">Add a second factor before inviting teammates or issuing API keys.</p><button class="btn btn-ink" id="mfaSetupBtn">Set up authenticator</button>';
    }
    mfaPanel += "</div>";

    var sso = state.sso;
    var ssoPanel = '<div class="panel"><div class="panel-head"><div><h3>Enterprise SSO</h3><p class="sec-note">OIDC with PKCE. SAML is available through a quoted enterprise integration.</p></div>' +
      (sso && sso.enabled ? '<span class="pill live">Configured</span>' : '<span class="pill">Not configured</span>') + "</div>" +
      '<form id="ssoForm" class="stack-form"><label class="field"><span>Issuer URL</span><input id="ssoIssuer" type="url" placeholder="https://company.okta.com" value="' + esc((sso && sso.issuer) || "") + '" required/></label>' +
      '<div class="inline-form"><label class="field"><span>Client ID</span><input id="ssoClientId" value="' + esc((sso && sso.clientId) || "") + '" required/></label>' +
      '<label class="field"><span>Client secret ' + (sso && sso.hasSecret ? "(saved)" : "") + '</span><input id="ssoClientSecret" type="password" placeholder="' + (sso && sso.hasSecret ? "Leave blank to keep" : "Optional for public clients") + '"/></label></div>' +
      '<label class="field"><span>Redirect URI</span><input id="ssoRedirect" value="' + esc((sso && sso.redirectUri) || (window.location.origin + "/api/auth/sso/callback")) + '"/></label>' +
      '<button class="btn btn-ink" type="submit">Save SSO configuration</button></form>' +
      '<p class="sec-note">SCIM endpoint: <code>' + esc(window.location.origin + "/api/scim/v2") + '</code></p></div>';

    var tokens = state.scimTokens || [];
    var scimPanel = '<div class="panel"><div class="panel-head"><div><h3>SCIM provisioning</h3><p class="sec-note">Bearer tokens for Okta, Entra ID and other SCIM 2.0 clients.</p></div><span class="pill">' + tokens.length + " active</span></div>" +
      (tokens.length ? '<div class="token-list">' + tokens.map(function (token) { return '<div class="token-row"><div><b>' + esc(token.name) + '</b><span>' + esc(token.prefix) + '… · created ' + esc(fmtDate(token.createdAt)) + '</span></div><button class="btn btn-quiet" data-scim-revoke="' + esc(token.id) + '">Revoke</button></div>'; }).join("") + "</div>" : '<p class="sec-note">No SCIM token yet.</p>') +
      (state.newScimToken ? '<div class="billing-alert"><b>Copy this token now:</b> <code>' + esc(state.newScimToken) + '</code></div>' : "") +
      '<form id="scimForm" class="inline-form"><label class="field"><span>Token name</span><input id="scimName" placeholder="Okta production" required/></label><button class="btn btn-line" type="submit">Create SCIM token</button></form></div>';

    el.viewRoot.innerHTML = viewHead("Security", "Identity you can<br/><em>prove.</em>",
      "MFA, enterprise SSO, SCIM provisioning and workspace roles are enforced on the server, not in the browser.") +
      '<div class="security-grid">' + mfaPanel + ssoPanel + scimPanel + "</div>" +
      '<div class="panel"><div class="panel-head"><h3>Security posture</h3><a class="text-link" href="/trust" target="_blank" rel="noopener">Trust center</a></div><div class="posture-grid"><div><b>Passwords</b><span>scrypt with per-user salt</span></div><div><b>Sessions</b><span>HttpOnly, SameSite=Lax, 7-day expiry</span></div><div><b>API keys</b><span>SHA-256 at rest, scoped, revocable</span></div><div><b>Audit</b><span>Workspace, billing and security events</span></div></div></div>';

    if (!state.securityLoaded) {
      state.securityLoaded = true;
      Promise.all([
        api("/api/auth/mfa").catch(function () { return { mfa: { enabled: !!user.mfaEnabled } }; }),
        api("/api/workspace/sso").catch(function () { return { sso: { enabled: false } }; }),
        api("/api/workspace/scim-token").catch(function () { return { tokens: [] }; }),
      ]).then(function (results) {
        state.mfa = results[0].mfa;
        state.sso = results[1].sso;
        state.scimTokens = results[2].tokens || [];
        if (state.view === "security") renderSecurity();
      });
    }
    var setupBtn = $("#mfaSetupBtn");
    if (setupBtn) setupBtn.addEventListener("click", function () {
      api("/api/auth/mfa/setup", { method: "POST" }).then(function (data) {
        state.mfaSetup = data;
        renderSecurity();
      }).catch(function (error) { toast(error.message, "error", "MFA"); });
    });
    var confirmForm = $("#mfaConfirmForm");
    if (confirmForm) confirmForm.addEventListener("submit", function (e) {
      e.preventDefault();
      api("/api/auth/mfa/confirm", { method: "POST", body: { code: $("#mfaConfirmCode").value } })
        .then(function (data) {
          state.mfa = data.mfa; state.mfaSetup = null; state.securityLoaded = false;
          toast("MFA is enabled.", "success", "Security");
          renderSecurity();
        }).catch(function (error) { toast(error.message, "error", "MFA"); });
    });
    var disableBtn = $("#mfaDisableBtn");
    if (disableBtn) disableBtn.addEventListener("click", function () {
      var password = window.prompt("Confirm your password to disable MFA.");
      if (!password) return;
      var code = window.prompt("Enter a current authenticator or recovery code.");
      if (!code) return;
      api("/api/auth/mfa/disable", { method: "POST", body: { password: password, code: code } })
        .then(function (data) { state.mfa = data.mfa; state.securityLoaded = false; toast("MFA disabled.", "success", "Security"); renderSecurity(); })
        .catch(function (error) { toast(error.message, "error", "MFA"); });
    });
    var ssoForm = $("#ssoForm");
    if (ssoForm) ssoForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = ssoForm.querySelector("button[type=submit]"); btn.disabled = true;
      api("/api/workspace/sso", { method: "PUT", body: {
        issuer: $("#ssoIssuer").value,
        clientId: $("#ssoClientId").value,
        clientSecret: $("#ssoClientSecret").value || undefined,
        redirectUri: $("#ssoRedirect").value,
      } }).then(function (data) { state.sso = data.sso; toast("SSO configuration saved.", "success", "Security"); renderSecurity(); })
        .catch(function (error) { toast(error.message, "error", "SSO"); })
        .then(function () { btn.disabled = false; });
    });
    var scimForm = $("#scimForm");
    if (scimForm) scimForm.addEventListener("submit", function (e) {
      e.preventDefault();
      api("/api/workspace/scim-token", { method: "POST", body: { name: $("#scimName").value } })
        .then(function (data) { state.newScimToken = data.rawToken; state.securityLoaded = false; toast("SCIM token created.", "success", "Security"); renderSecurity(); })
        .catch(function (error) { toast(error.message, "error", "SCIM"); });
    });
    $$("[data-scim-revoke]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        api("/api/workspace/scim-token/" + encodeURIComponent(button.getAttribute("data-scim-revoke")), { method: "DELETE" })
          .then(function () { state.securityLoaded = false; renderSecurity(); })
          .catch(function (error) { toast(error.message, "error", "SCIM"); });
      });
    });
  }


  /* ============================== CONNECTORS ============================== */
  function renderConnectors() {
    el.viewRoot.className = "view connectors-view";
    if (state.connectors === null) {
      state.connectors = [];
      api("/api/connectors").then(function (data) { state.connectors = data.connectors || []; if (state.view === "connectors") renderConnectors(); })
        .catch(function (error) { toast(error.message, "error", "Connectors"); });
    }
    var cards = (state.connectors || []).map(function (connector) {
      var connected = connector.status === "connected";
      return '<article class="connector-card"><div class="connector-head"><div><span class="eyebrow-sm">' + esc(connector.category) + "</span><h3>" + esc(connector.name) + "</h3></div>" +
        (connected ? '<span class="pill live">Connected</span>' : '<span class="pill">Available</span>') + "</div>" +
        "<p>" + esc(connector.description) + "</p>" +
        '<div class="connector-meta"><span>' + esc(connector.auth) + "</span><span>" + esc((connector.scopes || []).join(" · ")) + "</span></div>" +
        (connected ? '<button class="btn btn-line" data-connector-disconnect="' + esc(connector.id) + '">Disconnect</button>' : '<button class="btn btn-ink" data-connector-connect="' + esc(connector.id) + '">Connect (test mode)</button>') +
        '<p class="sec-note">' + (connector.simulated ? "Connection state is simulated until provider credentials are configured." : "Connected.") + "</p></article>";
    }).join("") || '<div class="panel"><div class="empty-state"><b>Loading connectors…</b><p>Reading the marketplace catalog.</p></div></div>';
    el.viewRoot.innerHTML = viewHead("Connectors", "Your stack,<br/><em>in the loop.</em>",
      "Scoped connectors for delivery, revenue and data. Every connection is workspace-scoped and can be revoked.",
      '<a class="btn btn-line" href="/trust" target="_blank" rel="noopener">Trust center</a>') +
      '<div class="billing-mode"><b>Test mode.</b> Connector state is simulated until real provider credentials are configured. No external data is transferred.</div>' +
      '<div class="connector-grid">' + cards + "</div>";
    $$("[data-connector-connect]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        api("/api/connectors/" + encodeURIComponent(button.getAttribute("data-connector-connect")) + "/connect", { method: "POST" })
          .then(function (data) {
            state.connectors = state.connectors.map(function (c) { return c.id === data.connector.id ? data.connector : c; });
            toast(data.connector.name + " connected.", "success", "Connector");
            renderConnectors();
          }).catch(function (error) { toast(error.message, "error", "Connector"); });
      });
    });
    $$("[data-connector-disconnect]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        api("/api/connectors/" + encodeURIComponent(button.getAttribute("data-connector-disconnect")) + "/disconnect", { method: "POST" })
          .then(function () { state.connectors = null; renderConnectors(); })
          .catch(function (error) { toast(error.message, "error", "Connector"); });
      });
    });
  }

  /* ============================== DEVELOPER ============================== */
  function renderDeveloper() {
    el.viewRoot.className = "view developer-view";
    if (state.developer === null) {
      state.developer = { keys: [], webhooks: [], events: [], deliveries: [] };
      Promise.all([api("/api/api-keys"), api("/api/webhooks")]).then(function (results) {
        state.developer = { keys: results[0].keys || [], webhooks: results[1].webhooks || [], events: results[1].events || [], deliveries: results[1].deliveries || [] };
        if (state.view === "developer") renderDeveloper();
      }).catch(function (error) { toast(error.message, "error", "Developer"); });
    }
    var dev = state.developer || {};
    var keys = (dev.keys || []).map(function (key) {
      return '<div class="token-row"><div><b>' + esc(key.name) + '</b><span><code>' + esc(key.prefix) + '…</code> · ' + esc((key.scopes || []).join(", ")) + " · " + esc(fmtDate(key.createdAt)) + '</span></div><button class="btn btn-quiet" data-key-revoke="' + esc(key.id) + '">Revoke</button></div>';
    }).join("") || '<p class="sec-note">No API keys yet.</p>';
    var hooks = (dev.webhooks || []).map(function (hook) {
      return '<div class="token-row"><div><b>' + esc(hook.url) + '</b><span>' + esc((hook.events || []).join(", ")) + " · last status " + esc(hook.lastStatus || "—") + " · " + esc(fmtDate(hook.lastDeliveryAt)) + '</span></div><div class="row-actions"><button class="btn btn-quiet" data-webhook-test="' + esc(hook.id) + '">Send test</button><button class="btn btn-quiet" data-webhook-delete="' + esc(hook.id) + '">Delete</button></div></div>';
    }).join("") || '<p class="sec-note">No webhooks yet.</p>';
    el.viewRoot.innerHTML = viewHead("Developer", "Build on the<br/><em>same gates.</em>",
      "Scoped API keys for projects and public webhooks signed with HMAC-SHA256. Every request is rate-limited and revocable.",
      '<a class="btn btn-line" href="/developers" target="_blank" rel="noopener">API documentation</a>') +
      '<div class="billing-mode"><b>Public API.</b> Base URL <code>' + esc(window.location.origin + "/api/v1") + '</code> · Use <code>Authorization: Bearer &lt;key&gt;</code>.</div>' +
      '<div class="developer-grid"><div class="panel"><div class="panel-head"><div><h3>API keys</h3><p class="sec-note">Read, run and webhook scopes. Raw keys are shown once.</p></div><span class="pill">' + (dev.keys || []).length + '</span></div>' +
      (state.newApiKey ? '<div class="billing-alert"><b>Copy this key now:</b> <code>' + esc(state.newApiKey) + '</code></div>' : "") +
      '<div class="token-list">' + keys + '</div><form id="apiKeyForm" class="inline-form"><label class="field"><span>Key name</span><input id="apiKeyName" placeholder="CI deploy key" required/></label>' +
      '<label class="field"><span>Scopes</span><select id="apiKeyScopes"><option value="projects:read">projects:read</option><option value="projects:read,runs:write">projects:read + runs:write</option></select></label><button class="btn btn-ink" type="submit">Create key</button></form></div>' +
      '<div class="panel"><div class="panel-head"><div><h3>Webhooks</h3><p class="sec-note">HTTPS only. Private-network targets are rejected. Retries use exponential backoff.</p></div><span class="pill">' + (dev.webhooks || []).length + '</span></div>' +
      (state.newWebhookSecret ? '<div class="billing-alert"><b>Signing secret (shown once):</b> <code>' + esc(state.newWebhookSecret) + '</code></div>' : "") +
      '<div class="token-list">' + hooks + '</div><form id="webhookForm" class="stack-form"><label class="field"><span>Endpoint URL</span><input id="webhookUrl" type="url" placeholder="https://example.com/kiln" required/></label>' +
      '<label class="field"><span>Events</span><select id="webhookEvents"><option value="*">All events</option><option value="project.created,artifact.generated">Projects &amp; artifacts</option><option value="deployment.created,deployment.approved">Deployments</option><option value="billing.plan.activated">Billing</option></select></label><button class="btn btn-ink" type="submit">Create webhook</button></form></div></div>' +
      '<div class="panel"><div class="panel-head"><h3>Signature verification</h3><span class="pill">HMAC-SHA256</span></div><pre class="code-block">const expected = crypto\n  .createHmac("sha256", process.env.KILN_WEBHOOK_SECRET)\n  .update(rawBody)\n  .digest("hex");\nassert(req.headers["x-kiln-signature-256"] === "sha256=" + expected);</pre></div>';
    var keyForm = $("#apiKeyForm");
    if (keyForm) keyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var scopes = $("#apiKeyScopes").value.split(",");
      api("/api/api-keys", { method: "POST", body: { name: $("#apiKeyName").value, scopes: scopes } })
        .then(function (data) { state.newApiKey = data.rawKey; state.developer = null; toast("API key created.", "success", "Developer"); renderDeveloper(); })
        .catch(function (error) { toast(error.message, "error", "API key"); });
    });
    $$("[data-key-revoke]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        api("/api/api-keys/" + encodeURIComponent(button.getAttribute("data-key-revoke")), { method: "DELETE" })
          .then(function () { state.developer = null; renderDeveloper(); })
          .catch(function (error) { toast(error.message, "error", "API key"); });
      });
    });
    var hookForm = $("#webhookForm");
    if (hookForm) hookForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = $("#webhookEvents").value;
      api("/api/webhooks", { method: "POST", body: { url: $("#webhookUrl").value, events: raw === "*" ? ["*"] : raw.split(",") } })
        .then(function (data) { state.newWebhookSecret = data.secret; state.developer = null; toast("Webhook created.", "success", "Developer"); renderDeveloper(); })
        .catch(function (error) { toast(error.message, "error", "Webhook"); });
    });
    $$("[data-webhook-test]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        api("/api/webhooks/" + encodeURIComponent(button.getAttribute("data-webhook-test")) + "/test", { method: "POST" })
          .then(function () { toast("Test delivery queued. A cron run or Operations → Run jobs will deliver it.", "success", "Webhook"); })
          .catch(function (error) { toast(error.message, "error", "Webhook"); });
      });
    });
    $$("[data-webhook-delete]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        api("/api/webhooks/" + encodeURIComponent(button.getAttribute("data-webhook-delete")), { method: "DELETE" })
          .then(function () { state.developer = null; renderDeveloper(); })
          .catch(function (error) { toast(error.message, "error", "Webhook"); });
      });
    });
  }


  /* ============================== OPERATIONS ============================== */
  function renderOperations() {
    el.viewRoot.className = "view operations-view";
    if (!state.user || !state.user.admin) {
      el.viewRoot.innerHTML = viewHead("Operations", "Owner access<br/><em>required.</em>", "Observability, job runner and backups are restricted to the configured administrator.") + '<div class="panel"><div class="empty-state"><b>403</b><p>Sign in with the configured administrator account.</p></div></div>';
      return;
    }
    if (state.operations === null) {
      state.operations = { loading: true };
      api("/api/admin/observability").then(function (data) { state.operations = data; if (state.view === "operations") renderOperations(); })
        .catch(function (error) { state.operations = null; toast(error.message, "error", "Operations"); });
    }
    var op = state.operations || {};
    var metrics = op.metrics || {};
    var jobs = metrics.jobs || {};
    var backup = op.backups || {};
    var logs = (op.logs || []).slice(0, 40).map(function (log) {
      return "<tr><td><code>" + esc(log.method + " " + log.path) + "</code></td><td>" + esc(log.status) + "</td><td>" + esc(log.ms) + "ms</td><td>" + esc(fmtDate(log.at)) + "</td></tr>";
    }).join("");
    var backups = (backup.latest ? [backup.latest] : []).map(function (item) {
      return '<div class="token-row"><div><b>' + esc(item.label) + '</b><span>' + esc(item.id) + " · " + Math.round(Number(item.bytes || 0) / 1024) + " KB · " + esc(fmtDate(item.createdAt)) + '</span></div><button class="btn btn-quiet" data-backup-restore="' + esc(item.id) + '">Restore</button></div>';
    }).join("") || '<p class="sec-note">No backups recorded yet.</p>';
    el.viewRoot.innerHTML = viewHead("Operations", "See it.<br/><em>Recover it.</em>",
      "Request telemetry, durable jobs, signed webhook delivery and private snapshot backups with checksum validation.",
      '<button class="btn btn-line" id="opsRefresh">Refresh</button><button class="btn btn-ink" id="opsBackup">Create backup</button>') +
      '<div class="metric-grid"><div class="metric"><span>Requests</span><b>' + esc(compactNumber(metrics.requests || 0)) + '</b><small>' + esc(metrics.window || 0) + ' in window</small></div>' +
      '<div class="metric"><span>Error rate</span><b>' + esc(metrics.errorRate || 0) + '%</b><small>5xx / window</small></div>' +
      '<div class="metric"><span>p95 latency</span><b>' + esc((metrics.latencyMs && metrics.latencyMs.p95) || 0) + 'ms</b><small>p50 ' + esc((metrics.latencyMs && metrics.latencyMs.p50) || 0) + 'ms</small></div>' +
      '<div class="metric"><span>Queue pending</span><b>' + esc(jobs.pending || 0) + '</b><small>' + esc(jobs.failed || 0) + ' failed</small></div>' +
      '<div class="metric"><span>Storage</span><b>' + esc(metrics.storage || "—") + '</b><small>' + esc(backup.count || 0) + " backups</small></div></div>" +
      '<div class="operations-grid"><div class="panel"><div class="panel-head"><div><h3>Backups</h3><p class="sec-note">Private Blob snapshots · SHA-256 checksums · 20 retained.</p></div><button class="btn btn-line" id="opsRunJobs">Run jobs</button></div>' + backups + "</div>" +
      '<div class="panel"><div class="panel-head"><h3>Recent requests</h3><span class="pill">' + (op.logs || []).length + '</span></div><div class="table-wrap"><table class="ops-table"><thead><tr><th>Route</th><th>Status</th><th>Time</th><th>When</th></tr></thead><tbody>' + logs + "</tbody></table></div></div></div>";
    var refresh = $("#opsRefresh"); if (refresh) refresh.addEventListener("click", function () { state.operations = null; renderOperations(); });
    var run = $("#opsRunJobs"); if (run) run.addEventListener("click", function () {
      api("/api/admin/jobs/run", { method: "POST" }).then(function (data) { toast("Processed " + data.processed + " jobs.", "success", "Queue"); state.operations = null; renderOperations(); }).catch(function (error) { toast(error.message, "error", "Queue"); });
    });
    var backupBtn = $("#opsBackup"); if (backupBtn) backupBtn.addEventListener("click", function () {
      backupBtn.disabled = true; backupBtn.textContent = "Backing up…";
      api("/api/admin/backups", { method: "POST", body: { label: "manual console backup" } }).then(function () { toast("Backup created.", "success", "Backups"); state.operations = null; renderOperations(); }).catch(function (error) { toast(error.message, "error", "Backup"); }).then(function () { backupBtn.disabled = false; backupBtn.textContent = "Create backup"; });
    });
    $$("[data-backup-restore]", el.viewRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        if (!window.confirm("Restore this snapshot? A safety backup is created first.")) return;
        api("/api/admin/backups/" + encodeURIComponent(button.getAttribute("data-backup-restore")) + "/restore", { method: "POST" })
          .then(function () { toast("Snapshot restored.", "success", "Recovery"); state.operations = null; renderOperations(); })
          .catch(function (error) { toast(error.message, "error", "Recovery"); });
      });
    });
  }

  function renderBilling() {
    el.viewRoot.className = "view billing-view";
    var b = state.billing;
    if (!b) {
      el.viewRoot.innerHTML = viewHead("Billing & usage", "Verified plans.<br/><em>No self-selection.</em>",
        "Your effective plan is read from the server-side billing record. Client-declared plans never unlock entitlements.") +
        '<div class="panel"><div class="empty-state"><b>Loading billing…</b><p>Reading plan, usage and invoices.</p></div></div>';
      loadBilling().then(function () { if (state.view === "billing") renderBilling(); }).catch(function () {});
      return;
    }
    var plans = (b.plans && b.plans.length ? b.plans : (state.catalog.plans || []));
    var used = Number(b.tokensUsed) || 0;
    var quota = Number(b.tokenQuota) || 1;
    var pct = Math.min(100, Math.round(used / quota * 100));
    var head = viewHead("Billing & usage", "Pay for the depth<br/><em>you actually use.</em>",
      "Plans are bound to a verified billing record. Checkout, subscription changes and invoices live here — not in the onboarding form.",
      '<button class="btn btn-line" id="billingRefresh">Refresh</button>');

    var modeNote = b.testMode
      ? '<div class="billing-mode"><b>Test mode.</b> No card is charged. Stripe is used automatically when <code>STRIPE_SECRET_KEY</code> is configured; otherwise checkout is completed with an explicit test confirmation.</div>'
      : '<div class="billing-mode live"><b>Stripe connected.</b> Checkout and the customer portal open in Stripe.</div>';

    var plan = b.plans ? (b.plans.filter(function (p) { return p.key === b.plan; })[0] || {}) : {};
    var usage = '<div class="panel billing-usage"><div class="panel-head"><div><h3>Token usage</h3><p class="sec-note">Hard caps are enforced server-side before generation.</p></div>' + billingStatusPill(b) + "</div>" +
      '<div class="usage-row"><div class="usage-bar"><span style="width:' + pct + '%"></span></div><b>' + pct + "%</b></div>" +
      '<div class="usage-meta"><span>' + esc(compactNumber(used)) + " / " + esc(compactNumber(quota)) + " tokens used</span><span>" + (b.currentPeriodEnd ? "Renews " + esc(billingDate(b.currentPeriodEnd)) : "Free workspace") + "</span></div>" +
      (b.bonusTokens ? '<p class="sec-note">Includes ' + esc(compactNumber(b.bonusTokens)) + " bonus tokens from referrals.</p>" : "") +
      (b.cancelAtPeriodEnd ? '<div class="billing-alert">Your plan is set to cancel at the end of the period. <button class="text-link" data-billing-action="resume">Resume plan</button></div>' : "") +
      (b.status === "past_due" ? '<div class="billing-alert error">Payment is past due. Entitlements are paused until the subscription is current.</div>' : "") +
      "</div>";

    var planCards = '<div class="billing-plans">' + plans.map(function (p) {
      var current = p.key === b.plan;
      var isFree = p.key === "free";
      var action = "";
      if (current) action = '<span class="pill live">Current plan</span>';
      else if (p.key === "enterprise") action = '<a class="btn btn-line" href="/#contact">Talk to an FDE</a>';
      else if (isFree) action = '<span class="pill">Included</span>';
      else action = '<button class="btn btn-ember" data-checkout="' + esc(p.key) + '">Choose ' + esc(p.name) + "</button>";
      return '<article class="billing-plan' + (current ? " current" : "") + '"><div class="billing-plan-head"><div><span class="eyebrow-sm">' + esc(p.name) + "</span><b>" + esc(p.priceLabel || (p.price === 0 ? "$0" : "Custom")) + '</b><small>' + esc(p.cadence === "month" ? "per month" : p.cadence === "annual" ? "annual commitment" : "forever") + "</small></div>" + (current ? '<span class="pill live">Current</span>' : "") + "</div>" +
        "<p>" + esc(p.description || "") + "</p>" +
        '<div class="billing-facts"><span>' + esc(p.seats) + (Number(p.seats) === 1 ? " seat" : " seats") + "</span><span>" + esc(compactNumber(p.tokenQuota)) + " tokens/mo</span><span>" + esc(p.tier) + "-depth</span></div>" +
        '<div class="billing-plan-action">' + action + "</div></article>";
    }).join("") + "</div>";

    var pending = state.pendingCheckout ? '<div class="panel checkout-panel"><div class="panel-head"><h3>Complete checkout</h3><span class="pill warn">Test mode</span></div>' +
      "<p>Checkout <code>" + esc(state.pendingCheckout.id) + "</code> for the <b>" + esc(state.pendingCheckout.plan) + "</b> plan is ready. No card is charged in test mode.</p>" +
      '<button class="btn btn-ember" data-confirm-checkout="' + esc(state.pendingCheckout.id) + '">Complete test payment</button>' +
      '<p class="sec-note">This creates a paid invoice and activates the server-side entitlement.</p></div>' : "";

    var invoices = (b.invoices || []).length
      ? '<div class="panel"><div class="panel-head"><h3>Invoices</h3><span class="pill">' + b.invoices.length + '</span></div><div class="invoice-list">' + b.invoices.map(function (invoice) {
        return '<div class="invoice-row"><div><b>' + esc(invoice.number) + "</b><span>" + esc(billingDate(invoice.createdAt)) + " · " + esc(invoice.description || "") + '</span></div><div><b>$' + (Number(invoice.amount) / 100).toFixed(2) + '</b><span class="st ' + esc(invoice.status) + '">' + esc(invoice.status) + '</span><a class="text-link" href="/api/billing/invoices/' + esc(invoice.id) + '" target="_blank" rel="noopener">View</a></div></div>';
      }).join("") + "</div></div>"
      : '<div class="panel"><div class="empty-state"><b>No invoices yet.</b><p>A paid checkout creates the first invoice.</p></div></div>';

    var referral = b.referral || {};
    var referralPanel = '<div class="panel referral-panel"><div class="panel-head"><h3>Referral link</h3><span class="pill">' + esc(referral.referredCount || 0) + " referred</span></div>" +
      "<p>Share Kiln with another operator. Both accounts receive 5,000 bonus tokens when they sign up through your link.</p>" +
      '<div class="referral-copy"><input id="referralLink" readonly value="' + esc(referral.link || "") + '"><button class="btn btn-line" id="copyReferral">Copy</button></div>' +
      '<p class="sec-note">Code ' + esc(referral.code || "—") + " · " + esc(compactNumber(referral.bonusTokens || 0)) + " bonus tokens earned.</p></div>";

    var history = (b.usage || []).length ? '<div class="panel"><div class="panel-head"><h3>Recent metering</h3><span class="pill">' + b.usage.length + '</span></div><div class="usage-list">' + b.usage.map(function (entry) {
      return '<div class="usage-entry"><span>' + esc(entry.label || "generation") + "</span><b>" + esc(compactNumber(entry.tokens)) + " tokens</b><span>" + esc(revWhen(entry.at)) + "</span></div>";
    }).join("") + "</div></div>" : "";

    var actions = "";
    if (b.plan !== "free") {
      actions = '<div class="billing-sub-actions">' +
        (b.cancelAtPeriodEnd ? '<button class="btn btn-ember" data-billing-action="resume">Resume subscription</button>' : '<button class="btn btn-line" data-billing-action="cancel">Cancel at period end</button>') +
        '<button class="btn btn-line" data-billing-action="portal">Manage payment details</button></div>';
    }

    el.viewRoot.innerHTML = head + modeNote + usage + pending + '<h2 class="section-label">Plans</h2>' + planCards + actions + invoices + referralPanel + history;

    var refresh = $("#billingRefresh");
    if (refresh) refresh.addEventListener("click", function () { loadBilling().then(renderBilling); });
    $$("[data-checkout]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { startCheckout(btn.getAttribute("data-checkout"), btn); });
    });
    $$("[data-confirm-checkout]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { confirmCheckout(btn.getAttribute("data-confirm-checkout"), btn); });
    });
    $$("[data-billing-action]", el.viewRoot).forEach(function (btn) {
      btn.addEventListener("click", function () { billingAction(btn.getAttribute("data-billing-action"), btn); });
    });
    var copy = $("#copyReferral");
    if (copy) copy.addEventListener("click", function () {
      var input = $("#referralLink");
      if (input && navigator.clipboard) navigator.clipboard.writeText(input.value).then(function () { toast("Referral link copied.", "success", "Copied"); }).catch(function () { input.select(); });
    });
  }

  function startCheckout(plan, btn) {
    btn.disabled = true;
    var old = btn.textContent;
    btn.textContent = "Opening…";
    api("/api/billing/checkout", { method: "POST", body: { plan: plan } }).then(function (data) {
      if (data.url) { window.location.href = data.url; return; }
      state.pendingCheckout = data.checkout;
      state.billing = data.billing || state.billing;
      toast("Test checkout created. Confirm it below to activate the plan.", "", "Checkout ready");
      renderBilling();
    }).catch(function (err) { toast(err.message, "error", "Checkout failed"); })
      .then(function () { btn.disabled = false; btn.textContent = old; });
  }

  function confirmCheckout(id, btn) {
    btn.disabled = true;
    btn.textContent = "Activating…";
    api("/api/billing/checkout/" + id + "/confirm", { method: "POST" }).then(function (data) {
      state.billing = data.billing;
      state.pendingCheckout = null;
      if (state.user) { state.user.plan = data.billing.plan; state.user.tier = data.billing.tier; state.user.tokenQuota = data.billing.tokenQuota; state.user.tokensUsed = data.billing.tokensUsed; }
      renderUser();
      renderBilling();
      toast("Plan activated. The server-side billing record now controls entitlements.", "success", "Plan active");
    }).catch(function (err) { toast(err.message, "error", "Checkout failed"); })
      .then(function () { btn.disabled = false; btn.textContent = "Complete test payment"; });
  }

  function billingAction(action, btn) {
    if (action === "portal") {
      api("/api/billing/portal", { method: "POST" }).then(function (data) {
        if (data.url) window.location.href = data.url;
        else toast(data.message || "Test-mode subscriptions are managed here.", "", "Test mode");
      }).catch(function (err) { toast(err.message, "error", "Billing portal"); });
      return;
    }
    btn.disabled = true;
    api("/api/billing/" + action, { method: "POST" }).then(function (data) {
      state.billing = data.billing;
      renderUser();
      renderBilling();
      toast(action === "cancel" ? "Subscription will end at the current period." : "Subscription resumed.", "success", "Billing updated");
    }).catch(function (err) { toast(err.message, "error", "Billing update failed"); btn.disabled = false; });
  }

  /* ============================== EVIDENCE ============================== */
  function evidenceIcon(source) {
    return source === "billing" ? "▤" : source === "revenue" ? "◎" : "◇";
  }

  function renderEvidence() {
    el.viewRoot.className = "view evidence-view";
    var head = viewHead("Evidence log", "Every decision,<br/><em>on the record.</em>",
      "A user-visible audit trail across generated artifacts, deployments, Revenue Swarm approvals, billing events and account activity.",
      '<button class="btn btn-line" id="evidenceRefresh">Refresh</button>');
    if (!state.evidence) {
      el.viewRoot.innerHTML = head + '<div class="panel"><div class="empty-state"><b>Loading evidence…</b><p>Reading the append-only event trail.</p></div></div>';
      loadEvidence().then(function () { if (state.view === "evidence") renderEvidence(); }).catch(function () {});
      return;
    }
    var data = state.evidence;
    var counts = data.counts || {};
    var chips = ["workspace", "revenue", "billing"].map(function (source) {
      return '<span class="evidence-count"><b>' + esc(counts[source] || 0) + "</b> " + esc(source) + "</span>";
    }).join("");
    var events = (data.events || []).map(function (event) {
      var meta = [];
      if (event.projectId) meta.push("project " + event.projectId);
      if (event.actor) meta.push(event.actor);
      if (event.decision) meta.push("decision: " + event.decision);
      if (event.invoiceId) meta.push("invoice " + event.invoiceId);
      return '<article class="evidence-row source-' + esc(event.source) + '"><div class="evidence-glyph">' + esc(evidenceIcon(event.source)) + "</div>" +
        '<div class="evidence-main"><div class="evidence-title"><b>' + esc(event.type || "event") + "</b><span>" + esc(revWhen(event.at)) + "</span></div>" +
        "<p>" + esc(event.detail || event.summary || event.evidence || "Recorded.") + "</p>" +
        (meta.length ? '<div class="evidence-meta">' + meta.map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</div>" : "") +
        "</div><span class=\"pill\">" + esc(event.source) + "</span></article>";
    }).join("");
    el.viewRoot.innerHTML = head + '<div class="evidence-summary"><div><b>' + esc(data.total || 0) + "</b><span>events retained</span></div>" + chips + "</div>" +
      (events ? '<div class="evidence-list">' + events + "</div>" : '<div class="panel"><div class="empty-state"><b>No evidence yet.</b><p>Generate an artifact, deploy, or decide a Revenue Swarm approval.</p></div></div>');
    var refresh = $("#evidenceRefresh");
    if (refresh) refresh.addEventListener("click", function () { state.evidence = null; renderEvidence(); });
  }

  function loadEvidence() {
    return api("/api/evidence").then(function (data) { state.evidence = data; });
  }

  /* ============================== BLUEPRINT ============================== */
  /* ---------------- revenue swarm ---------------- */
  function updateRevenueBadge() {
    if (!el.countRevenue) return;
    var pending = 0;
    if (state.revenue && Array.isArray(state.revenue.approvals)) {
      pending = state.revenue.approvals.filter(function (a) { return a.status === "pending"; }).length;
    }
    el.countRevenue.textContent = String(pending);
    el.countRevenue.hidden = !pending;
  }

  function loadRevenueSummary() {
    if (state.revenue) { updateRevenueBadge(); return; }
    api("/api/revenue").then(function (data) {
      state.revenue = data.revenue;
      updateRevenueBadge();
    }).catch(function () { /* revenue is optional until the view is opened */ });
  }

  function revWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return String(iso); }
  }

  function revApprovalCard(a) {
    var confidence = Math.round(Number(a.confidence || 0) * 100);
    var evidence = (a.evidence || []).map(function (e) {
      return '<span class="rev-evidence-chip"><b>' + esc(e.label) + "</b> " + esc(e.value) + "</span>";
    }).join("");
    var guardrails = (a.guardrails || []).map(function (g) {
      return "<span>" + esc(g) + "</span>";
    }).join("");
    return '<article class="rev-approval" data-approval="' + esc(a.id) + '">' +
      '<div class="rev-approval-top"><span class="pill warn">Named human required</span><span class="rev-kind">' + esc(a.kind) + '</span><span class="rev-confidence">' + confidence + '% confidence</span></div>' +
      "<h3>" + esc(a.title) + "</h3>" +
      "<p>" + esc(a.summary) + "</p>" +
      (a.target ? '<div class="rev-target">' + esc(a.target) + "</div>" : "") +
      '<div class="rev-evidence">' + evidence + "</div>" +
      (guardrails ? '<div class="rev-guardrails">' + guardrails + "</div>" : "") +
      '<label class="rev-draft-label">Draft / payload<textarea data-rev-draft rows="4" spellcheck="false">' + esc(a.draft || "") + "</textarea></label>" +
      '<input class="rev-note" data-rev-note maxlength="300" placeholder="Decision note (optional)">' +
      '<div class="rev-actions"><button type="button" class="btn btn-ember" data-rev-approve>Approve &amp; simulate</button><button type="button" class="btn btn-line" data-rev-reject>Reject</button></div>' +
      "</article>";
  }

  function renderRevenue() {
    el.viewRoot.className = "view revenue-view";
    var head = viewHead(
      "Revenue swarm",
      "Nine agents.<br/><em>One named human gate.</em>",
      "Autonomous research, enrichment, drafting, routing and forecasting across the revenue lifecycle. Every external message, price, SOW, charge and standing-rule change stops here for a named human.",
      '<button class="btn btn-line" id="revRefresh">Refresh</button><button class="btn btn-ember" id="revRun">Run next cycle</button>'
    );

    if (!state.revenue) {
      el.viewRoot.innerHTML = head + '<div class="panel"><div class="empty-state"><b>Opening the revenue swarm…</b><p>Reading pipeline, approvals and agent reports.</p></div></div>';
      api("/api/revenue").then(function (data) {
        state.revenue = data.revenue;
        updateRevenueBadge();
        renderRevenue();
      }).catch(function (err) {
        toast(err.message || "Could not load the revenue swarm.", "error", "Revenue swarm");
      });
      return;
    }

    var r = state.revenue;
    var pending = (r.approvals || []).filter(function (a) { return a.status === "pending"; });
    var decided = (r.approvals || []).filter(function (a) { return a.status !== "pending"; }).slice(0, 5);
    var metrics = (r.metrics || []).map(function (m) {
      return '<div class="rev-kpi"><span>' + esc(m.label) + "</span><b>" + esc(m.value) + "</b><em>" + esc(m.delta || "") + "</em></div>";
    }).join("");
    var agents = (r.agents || []).map(function (a) {
      return '<article class="rev-agent ' + esc(a.status || "idle") + '">' +
        '<div class="rev-agent-head"><span class="rev-glyph">' + esc(a.glyph || "◇") + '</span><div><b>' + esc(a.name) + "</b><small>" + esc(a.autonomy) + "</small></div><span class=\"pill\">" + esc(a.status || "idle") + "</span></div>" +
        "<p>" + esc(a.lastAction) + "</p>" +
        '<div class="rev-agent-foot"><span>' + esc(a.metric) + "</span><em>" + esc(a.guardrail) + "</em></div>" +
        "</article>";
    }).join("");
    var pendingCards = pending.map(revApprovalCard).join("");
    if (!pendingCards) pendingCards = '<div class="empty-state"><b>No commitment artifacts waiting.</b><p>Run the next cycle to dispatch the swarm.</p></div>';
    var history = decided.length ? '<div class="rev-history"><div class="rev-history-head">Recently decided</div>' + decided.map(function (a) {
      return '<div class="rev-history-item"><span class="pill ' + (a.status === "approved" ? "success" : "warn") + '">' + esc(a.status) + "</span><b>" + esc(a.title) + "</b><span> · " + esc(a.decidedBy || "human") + "</span></div>";
    }).join("") + "</div>" : "";
    var audit = (r.events || []).slice(0, 12).map(function (e) {
      return '<div class="rev-event"><div class="rev-event-time">' + esc(revWhen(e.at)) + "</div><div><b>" + esc(e.actor) + "</b> · " + esc(e.summary) +
        '<span class="rev-event-type">' + esc(e.type) + " · " + esc(e.decision || "logged") + "</span></div></div>";
    }).join("");
    var connectors = (r.connectors || []).map(function (c) {
      return '<div class="rev-connector"><div><b>' + esc(c.name) + "</b><span>" + esc(c.detail) + "</span></div><span class=\"pill\">simulated</span><small>" + esc(c.lastSync) + "</small></div>";
    }).join("");
    var o = r.orchestrator || {};
    var flow = ["Attract", "Capture", "Qualify", "Land", "Expand", "Retain"].map(function (stage) {
      return '<span class="' + (stage === o.stage ? "on" : "") + '">' + stage + "</span>";
    }).join("<i>→</i>");
    var gateItems = [
      "External messages", "Prices, discounts or terms", "SOWs and contracts",
      "Charges, plans or entitlements", "Public content or standing rules", "Actions on paused or flagged leads",
    ].map(function (item) { return "<span>" + esc(item) + "</span>"; }).join("");

    el.viewRoot.innerHTML = head +
      '<div class="rev-kpis">' + metrics + "</div>" +
      '<div class="rev-grid">' +
        '<div class="panel rev-orchestrator">' +
          '<div class="panel-head"><h3>Master orchestrator</h3><span class="pill">Cycle ' + esc(o.cycle || 0) + " · " + esc(o.stage || "Ready") + "</span></div>" +
          '<p>Plans and delegates across attract, capture, qualify, land, expand and retain. It routes every commitment artifact to the gate; it never sends, prices, signs, publishes or charges.</p>' +
          '<div class="rev-flow">' + flow + "</div>" +
          '<div class="rev-summary"><b>Last cycle:</b> ' + esc(o.lastSummary || "No cycle has run yet.") + "</div>" +
        "</div>" +
        '<div class="panel rev-gate">' +
          '<div class="panel-head"><h3>Commitment boundary</h3><span class="pill warn">Human only</span></div>' +
          '<p>These actions never run autonomously. A recorded decision by a named human is required every time.</p>' +
          '<div class="rev-gate-list">' + gateItems + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="panel" style="margin-top:16px">' +
        '<div class="panel-head"><h3>The nine agents</h3><span class="pill">Autonomy with evidence</span></div>' +
        '<div class="rev-agents">' + agents + "</div>" +
      "</div>" +
      '<div class="rev-two">' +
        '<div class="panel"><div class="panel-head"><h3>Human approval queue</h3><span class="pill warn">' + pending.length + " waiting</span></div>" + pendingCards + history + "</div>" +
        '<div class="panel"><div class="panel-head"><h3>Audit log</h3><span class="pill">Append-only</span></div><div class="rev-audit">' + (audit || '<div class="empty-state"><b>No audit events yet.</b></div>') + "</div></div>" +
      "</div>" +
      '<div class="panel" style="margin-top:16px">' +
        '<div class="panel-head"><h3>Simulated connectors</h3><span class="pill">No external calls</span></div>' +
        '<div class="rev-connectors">' + connectors + "</div>" +
        '<p class="rev-disclaimer">Every connector is simulated. No email, CRM, Stripe, calendar or Apollo request leaves Kiln. Approvals record the signed-in human and release only a simulated action.</p>' +
      "</div>";

    bindRevenueActions();
  }

  function bindRevenueActions() {
    var run = $("#revRun");
    if (run) {
      run.addEventListener("click", function () {
        run.disabled = true;
        run.textContent = "Running…";
        api("/api/revenue/run", { method: "POST", body: {} }).then(function (data) {
          state.revenue = data.revenue;
          updateRevenueBadge();
          renderRevenue();
          toast((data.run && data.run.summary) || "Cycle complete.", "success", "Revenue swarm");
        }).catch(function (err) {
          run.disabled = false;
          run.textContent = "Run next cycle";
          toast(err.message || "Could not run the cycle.", "error", "Revenue swarm");
        });
      });
    }

    var refresh = $("#revRefresh");
    if (refresh) refresh.addEventListener("click", function () {
      state.revenue = null;
      updateRevenueBadge();
      renderRevenue();
    });

    $$("[data-approval]", el.viewRoot).forEach(function (card) {
      var id = card.getAttribute("data-approval");
      function decide(decision) {
        var draftEl = $("[data-rev-draft]", card);
        var noteEl = $("[data-rev-note]", card);
        var buttons = $$("button", card);
        buttons.forEach(function (b) { b.disabled = true; });
        api("/api/revenue/approvals/" + encodeURIComponent(id) + "/decision", {
          method: "POST",
          body: { decision: decision, draft: draftEl ? draftEl.value : "", note: noteEl ? noteEl.value : "" },
        }).then(function (data) {
          state.revenue = data.revenue;
          updateRevenueBadge();
          renderRevenue();
          toast(decision === "approve" ? "Approved. The release is simulated and audited." : "Rejected. The decision is in the audit log.", decision === "approve" ? "success" : "", "Guardrail & Approvals");
        }).catch(function (err) {
          buttons.forEach(function (b) { b.disabled = false; });
          toast(err.message || "Could not record the decision.", "error", "Approval failed");
        });
      }
      var approve = $("[data-rev-approve]", card);
      var reject = $("[data-rev-reject]", card);
      if (approve) approve.addEventListener("click", function () { decide("approve"); });
      if (reject) reject.addEventListener("click", function () { decide("reject"); });
    });
  }

  function renderBlueprint() {
    el.viewRoot.className = "view";
    var head = viewHead("Master blueprint", "The specification<br/><em>behind the workspace.</em>",
      "Phase 0–3 master prompt: product architecture, twelve autonomous workstreams, human-in-the-loop guardrails and the console contract.",
      '<a class="btn btn-line" href="/api/blueprint/raw" target="_blank" rel="noopener">Open raw markdown ↗</a>');

    el.viewRoot.innerHTML = head + '<article class="blueprint" id="blueprintBody"><p class="skeleton">Loading blueprint…</p></article>';

    var render = function (markdown) {
      var node = $("#blueprintBody");
      if (node) node.innerHTML = mdDoc(markdown);
    };
    if (state.blueprint) { render(state.blueprint); return; }
    api("/api/blueprint").then(function (data) {
      state.blueprint = data.markdown || "";
      render(state.blueprint);
    }).catch(function (err) {
      var node = $("#blueprintBody");
      if (node) node.innerHTML = '<div class="empty-state"><b>Blueprint unavailable.</b><p>' + esc(err.message) + "</p></div>";
    });
  }

  function renderForumEmbed() {
    el.viewRoot.className = "view forum-view";
    el.viewRoot.innerHTML = viewHead("FDE Forum", "Ask a real blocker,<br/><em>get a named owner.</em>",
      "The public forum loads below. Community answers come from senior field engineers, then are vetted by a pod owner.",
      '<button class="btn btn-line" id="forumRefresh">Reload forum</button>') +
      '<div class="forum-embed"><iframe id="forumFrame" title="Kiln FDE Forum" src="/fde-forum#feed" loading="lazy"></iframe></div>' +
      '<div class="forum-fallback">If the forum does not load, open <a href="/fde-forum" target="_blank" rel="noopener">/fde-forum ↗</a> in a new tab.</div>';
    var refresh = $("#forumRefresh");
    if (refresh) refresh.addEventListener("click", function () {
      var frame = $("#forumFrame");
      if (frame) frame.src = "/fde-forum?r=" + Date.now() + "#feed";
    });
  }

  /* ---------------- start ---------------- */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
