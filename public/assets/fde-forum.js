(function () {
  "use strict";
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var nav = $(".nav");
  var toggle = $(".nav-toggle");
  if (nav && toggle) {
    toggle.addEventListener("click", function () { nav.classList.toggle("open"); });
    $$(".nav-links a", nav).forEach(function (link) {
      link.addEventListener("click", function () { nav.classList.remove("open"); });
    });
  }

  var buttons = $$(".board-filters button");
  var posts = $$(".post");
  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      buttons.forEach(function (b) { b.classList.toggle("on", b === button); });
      var filter = button.getAttribute("data-filter") || "all";
      posts.forEach(function (post) {
        var source = post.getAttribute("data-source") || "community";
        var show = filter === "all" || source === filter;
        post.hidden = !show;
      });
    });
  });

  function setStatus(status, text) {
    if (!status) return;
    status.className = "form-status " + text.className;
    status.textContent = text.message;
  }

  var form = $("#joinForm");
  if (form) {
    var status = $("#joinStatus");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var submit = $("#joinSubmit");
      var name = $("#joinName").value.trim();
      var email = $("#joinEmail").value.trim();
      var message = $("#joinMessage").value.trim();
      if (!message) {
        setStatus(status, { className: "error", message: "Add a short note about what you want to get help with." });
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus(status, { className: "error", message: "Enter a valid email so the applied pod can reply." });
        return;
      }
      submit.disabled = true;
      submit.textContent = "Sending…";
      fetch("/api/forum/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "fde",
          name: name,
          email: email,
          role: $("#joinRole").value,
          focus: [$("#joinFocus").value],
          message: message,
          source: "fde-forum",
          path: window.location.pathname,
        }),
      }).then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      }).then(function (result) {
        if (result.ok && result.data && result.data.lead) {
          form.reset();
          setStatus(status, { className: "ok", message: "Sent. A senior FDE will contact you directly — no shared inbox handoff." });
        } else {
          setStatus(status, { className: "error", message: (result.data && result.data.error) || "Could not send. Try again." });
        }
      }).catch(function () {
        setStatus(status, { className: "error", message: "Could not reach the server. Try again." });
      }).finally(function () {
        submit.disabled = false;
        submit.textContent = "Request a senior FDE";
      });
    });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  $$(".reveal").forEach(function (el) { io.observe(el); });
})();
