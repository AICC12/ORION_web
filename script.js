/* =====================================================================
   ORION — script.js  ·  shared vanilla-JS interactions
   --------------------------------------------------------------------
   1) Header state       — solid background after scroll
   2) Mobile menu        — toggle open/close
   3) Reveal-on-scroll   — IntersectionObserver, fade + rise (staggered)
   4) Hero parallax      — subtle scale / translate / fade on scroll
   5) Media-band drift   — gentle background parallax on full-bleed bands
   6) Image fallback     — swap in a placeholder if a file is missing
   All effects respect prefers-reduced-motion.
   ===================================================================== */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------
     1) HEADER — add .is-scrolled once the page moves down a little
  --------------------------------------------------------------- */
  var header = document.querySelector('.site-header');

  function onScrollHeader() {
    if (!header) return;
    if (window.scrollY > 40) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  }
  onScrollHeader();

  /* ---------------------------------------------------------------
     2) MOBILE MENU — hamburger toggles the nav panel
  --------------------------------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // close the menu after tapping a link
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        toggle.classList.remove('is-open');
      });
    });
  }

  /* ---------------------------------------------------------------
     3) REVEAL ON SCROLL — elements fade + rise into view.
        Children of [data-reveal-stagger] cascade with a small delay.
  --------------------------------------------------------------- */
  var revealEls = document.querySelectorAll('[data-reveal], [data-reveal-stagger]');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;

        // apply staggered delays to direct children
        if (el.hasAttribute('data-reveal-stagger')) {
          var step = parseInt(el.getAttribute('data-stagger') || '90', 10);
          Array.prototype.forEach.call(el.children, function (child, i) {
            child.style.transitionDelay = (i * step) + 'ms';
          });
        }
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------------
     4) HERO PARALLAX — very subtle scale/translate/fade on the hero
        image as the user scrolls the first viewport.
     5) MEDIA-BAND DRIFT — gentle vertical drift on full-bleed bands.
        Both are throttled with requestAnimationFrame.
  --------------------------------------------------------------- */
  var heroImg = document.querySelector('.hero__media img');
  var hero = document.querySelector('.hero');
  var bands = Array.prototype.slice.call(document.querySelectorAll('.media-band__bg img'));
  var ticking = false;

  function updateParallax() {
    var y = window.scrollY;

    // hero: image drifts down slowly, scales up a touch, fades out
    if (heroImg && hero) {
      var h = hero.offsetHeight || window.innerHeight;
      var p = Math.min(y / h, 1);                 // 0 → 1 across hero height
      var scale = 1 + p * 0.08;
      var shift = p * 60;                          // px
      heroImg.style.transform = 'translate3d(0,' + shift + 'px,0) scale(' + scale + ')';
      var inner = document.querySelector('.hero__inner');
      if (inner) {
        inner.style.transform = 'translate3d(0,' + (p * 40) + 'px,0)';
        inner.style.opacity = String(1 - p * 1.05);
      }
    }

    // full-bleed bands: background image drifts as it passes through view
    bands.forEach(function (img) {
      var rect = img.parentElement.parentElement.getBoundingClientRect();
      var vh = window.innerHeight;
      if (rect.bottom < 0 || rect.top > vh) return;
      var prog = (rect.top + rect.height / 2 - vh / 2) / vh; // -1 … 1
      img.style.transform = 'translate3d(0,' + (prog * -34) + 'px,0) scale(1.08)';
    });

    ticking = false;
  }

  function requestParallax() {
    if (!ticking) { window.requestAnimationFrame(updateParallax); ticking = true; }
  }

  // pre-scale bands so the drift has headroom (no empty edges)
  bands.forEach(function (img) { img.style.transform = 'scale(1.08)'; });

  window.addEventListener('scroll', function () {
    onScrollHeader();
    if (!reduceMotion) requestParallax();
  }, { passive: true });

  window.addEventListener('resize', function () { if (!reduceMotion) requestParallax(); }, { passive: true });
  if (!reduceMotion) updateParallax();

  /* ---------------------------------------------------------------
     6) IMAGE FALLBACK — if a product image is missing, hide the broken
        <img> so the .figure placeholder (data-ph) shows through cleanly.
  --------------------------------------------------------------- */
  document.querySelectorAll('.figure img, .hero__media img, .media-band__bg img').forEach(function (img) {
    img.addEventListener('error', function () { img.style.opacity = '0'; });
  });

  /* ---------------------------------------------------------------
     7) FOOTER YEAR — keep the copyright current automatically.
  --------------------------------------------------------------- */
  var yr = document.querySelector('[data-year]');
  if (yr) yr.textContent = new Date().getFullYear();

})();
