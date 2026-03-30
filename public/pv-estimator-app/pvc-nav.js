/**
 * PVCopilot app nav: tools dropdown (animated), mobile drawer, LCOE delay + navigate.
 */
(function () {
  var APP_ROOT = "../";
  function appPath(segment) {
    var s = segment.replace(/^\//, "");
    return APP_ROOT + s;
  }

  var toolsBtn = document.getElementById("pvcNavToolsBtn");
  var toolsMenu = document.getElementById("pvcNavToolsMenu");
  var toolsWrap = document.getElementById("pvcNavToolsWrap");
  var mobileBtn = document.getElementById("pvcNavMobileBtn");
  var mobilePanel = document.getElementById("pvcNavMobilePanel");
  var iconMenu = document.getElementById("pvcNavIconMenu");
  var iconClose = document.getElementById("pvcNavIconClose");
  var lcoeBtn = document.getElementById("pvcNavLcoeBtn");
  var MOBILE_MAX = 767;

  function isMobileLayout() {
    return window.matchMedia("(max-width: " + MOBILE_MAX + "px)").matches;
  }

  function closeTools() {
    if (!toolsMenu || !toolsBtn) return;
    toolsMenu.classList.remove("is-open");
    toolsMenu.setAttribute("aria-hidden", "true");
    toolsBtn.setAttribute("aria-expanded", "false");
  }

  function openTools() {
    if (!toolsMenu || !toolsBtn) return;
    toolsMenu.classList.add("is-open");
    toolsMenu.setAttribute("aria-hidden", "false");
    toolsBtn.setAttribute("aria-expanded", "true");
  }

  function toggleTools(e) {
    e.stopPropagation();
    if (!toolsMenu || !toolsBtn) return;
    if (toolsMenu.classList.contains("is-open")) closeTools();
    else openTools();
  }

  if (toolsBtn && toolsMenu) {
    toolsBtn.addEventListener("click", toggleTools);
    toolsMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeTools);
    });
    document.addEventListener("click", function (e) {
      if (toolsWrap && !toolsWrap.contains(e.target)) closeTools();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeTools();
    });
  }

  function closeMobile() {
    if (!mobilePanel || !mobileBtn) return;
    mobilePanel.hidden = true;
    mobileBtn.setAttribute("aria-expanded", "false");
    if (iconMenu) iconMenu.hidden = false;
    if (iconClose) iconClose.hidden = true;
    document.body.style.overflow = "";
  }

  function openMobile() {
    if (!mobilePanel || !mobileBtn) return;
    mobilePanel.hidden = false;
    mobileBtn.setAttribute("aria-expanded", "true");
    if (iconMenu) iconMenu.hidden = true;
    if (iconClose) iconClose.hidden = false;
    document.body.style.overflow = "hidden";
    closeTools();
  }

  if (mobileBtn && mobilePanel) {
    mobileBtn.addEventListener("click", function () {
      if (mobilePanel.hidden) openMobile();
      else closeMobile();
    });
    mobilePanel.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMobile);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !mobilePanel.hidden) closeMobile();
    });
    window.addEventListener("resize", function () {
      if (!isMobileLayout()) closeMobile();
    });
  }

  if (lcoeBtn) {
    lcoeBtn.addEventListener("click", function () {
      if (lcoeBtn.classList.contains("is-busy")) return;
      lcoeBtn.classList.add("is-busy");
      window.setTimeout(function () {
        window.location.href = appPath("lcoe-tool");
      }, 600);
    });
  }
})();
