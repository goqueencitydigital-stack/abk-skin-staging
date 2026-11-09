/* ABK SKIN — progressive enhancement only. Every page works without this file. */
(function () {
  var d = document, html = d.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header border on scroll
  var header = d.querySelector('[data-header]');
  var onScroll = function () { if (header) header.classList.toggle('is-scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Mobile menu
  var mBtn = d.querySelector('[data-menu-btn]'), mMenu = d.querySelector('[data-mobile-menu]');
  if (mBtn && mMenu) {
    var setMenu = function (open) {
      mBtn.setAttribute('aria-expanded', String(open)); mMenu.hidden = !open;
      d.body.style.overflow = open ? 'hidden' : '';
      if (open) { var f = mMenu.querySelector('a'); f && f.focus(); }
    };
    mBtn.addEventListener('click', function () { setMenu(mBtn.getAttribute('aria-expanded') !== 'true'); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mBtn.getAttribute('aria-expanded') === 'true') { setMenu(false); mBtn.focus(); } });
  }

  // Mega menu: opens on hover (pointer) and on click/Enter. The link still works on second activation.
  d.querySelectorAll('.has-mega').forEach(function (li) {
    var trigger = li.querySelector('[data-mega-trigger]'), timer;
    var open = function () { clearTimeout(timer); li.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); };
    var close = function () { li.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); };
    li.addEventListener('mouseenter', open);
    li.addEventListener('mouseleave', function () { timer = setTimeout(close, 160); });
    trigger.addEventListener('click', function (e) { if (!li.classList.contains('is-open')) { e.preventDefault(); open(); } });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) close(); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); trigger.focus(); } });
  });

  // Video reels: autoplay only without reduced motion; always pausable.
  d.querySelectorAll('[data-reel-wrap]').forEach(function (w) {
    var v = w.querySelector('[data-reel]'), vt = w.querySelector('[data-reel-toggle]');
    if (!v || !vt) return;
    var label = vt.querySelector('.reel-label');
    var sync = function () { var paused = v.paused; vt.setAttribute('aria-pressed', String(paused)); label.textContent = paused ? 'Play video' : 'Pause video'; };
    if (!reduce) {
      var start = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
      if ('IntersectionObserver' in window) { new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) start(); else v.pause(); }); }, { threshold: 0.3 }).observe(v); } else start();
    }
    v.addEventListener('play', sync); v.addEventListener('pause', sync); sync();
    vt.addEventListener('click', function () { if (v.paused) v.play(); else v.pause(); });
  });

  // Shop search + brand filter
  d.querySelectorAll('[data-shop-tools]').forEach(function (tools) {
    var scope = tools.parentElement, q = tools.querySelector('[data-shop-q]'), b = tools.querySelector('[data-shop-brand]');
    var cards = scope.querySelectorAll('.prd-card'), count = tools.querySelector('[data-shop-count]'), empty = scope.querySelector('[data-shop-empty]');
    var params = new URLSearchParams(location.search);
    if (params.get('q')) q.value = params.get('q');
    if (params.get('brand')) b.value = params.get('brand');
    var apply = function () {
      var term = q.value.trim().toLowerCase(), brand = b.value, n = 0;
      cards.forEach(function (c) {
        var ok = (!term || c.dataset.name.indexOf(term) > -1) && (!brand || c.dataset.brand === brand);
        c.hidden = !ok; if (ok) n++;
      });
      count.textContent = n + (n === 1 ? ' product' : ' products');
      if (empty) empty.hidden = n > 0;
      var u = new URL(location.href);
      term ? u.searchParams.set('q', term) : u.searchParams.delete('q');
      brand ? u.searchParams.set('brand', brand) : u.searchParams.delete('brand');
      history.replaceState(null, '', u);
    };
    q.addEventListener('input', apply); b.addEventListener('change', apply);
    var reset = scope.querySelector('[data-shop-reset]');
    if (reset) reset.addEventListener('click', function () { q.value = ''; b.value = ''; apply(); q.focus(); });
    apply();
  });

  // Strength picker: each SKU keeps its own price, stock and purchase link.
  d.querySelectorAll('[data-sku-pick]').forEach(function (fs) {
    var panels = d.querySelectorAll('[data-sku-panel]');
    fs.addEventListener('change', function (e) {
      panels.forEach(function (p) { p.hidden = p.dataset.skuPanel !== e.target.value; });
    });
  });

  // Mobile sticky book bar appears after the hero
  var mb = d.querySelector('[data-mobile-book]'), heroBox = d.querySelector('.book-box');
  if (mb && heroBox && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { mb.classList.toggle('is-visible', !en[0].isIntersecting && en[0].boundingClientRect.top < 0); }).observe(heroBox);
  }


  // Home shop tabs: links work without JS (they open the category page); with JS they filter in place.
  d.querySelectorAll('[data-shop-tabs]').forEach(function (sec) {
    var tabs = sec.querySelectorAll('[data-tab]'), cards = sec.querySelectorAll('.prd-card');
    tabs.forEach(function (t) {
      t.setAttribute('role', 'button');
      t.addEventListener('click', function (e) {
        e.preventDefault();
        var cat = t.dataset.tab, n = 0;
        tabs.forEach(function (o) { o.setAttribute('aria-current', String(o === t)); });
        cards.forEach(function (c) {
          var ok = cat === 'all' ? c.hasAttribute('data-featured') : (' ' + c.dataset.cats + ' ').indexOf(' ' + cat + ' ') > -1 && n < 8;
          c.hidden = !ok; if (ok) n++;
        });
      });
    });
  });

  // Header search icon lands on the shop with the search box focused.
  if (/[?&]search=1/.test(location.search)) { var sq = d.querySelector('[data-shop-q]'); if (sq) { sq.focus(); } }

  // Contact form: composes an email in the visitor's own mail app. Nothing is sent from the page.
  d.querySelectorAll('[data-mailto-form]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!f.checkValidity()) return;
      e.preventDefault();
      var v = function (n) { return (f.elements[n] && f.elements[n].value || '').trim(); };
      var name = (v('first') + ' ' + v('last')).trim();
      var body = v('message') + '\n\n' + name + '\n' + v('email');
      location.href = f.getAttribute('action') + '?subject=' + encodeURIComponent('Question from ' + (name || 'the ABK SKIN website')) + '&body=' + encodeURIComponent(body);
    });
  });

  // Staging review notes toggle (staging builds only). Add ?review=1 to a URL to open with notes showing.
  var rt = d.querySelector('[data-review-toggle]');
  if (rt) {
    var on = /[?&]review=1/.test(location.search);
    var setR = function (v) { d.body.classList.toggle('show-review', v); rt.setAttribute('aria-pressed', String(v)); rt.textContent = v ? 'Hide review notes' : 'Show review notes'; };
    setR(on); rt.addEventListener('click', function () { setR(!d.body.classList.contains('show-review')); });
  }

  // Gentle reveal on scroll
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    d.querySelectorAll('.sec-head, .path-card, .known-list li, .card:not([hidden]), .plan-card, .concern-card, .method-steps li, .tr-card, .club-card, .mh-grid li').forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('reveal'); io.observe(el); }
    });
  }
})();
