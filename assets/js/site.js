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

  // Client story: plays muted on scroll; button turns sound on (restarts from the beginning) or off.
  d.querySelectorAll('[data-story-sound]').forEach(function (b) {
    var v = b.parentNode.querySelector('video'); if (!v) return;
    var lab = b.querySelector('.story-sound-label');
    var sync = function () { b.setAttribute('aria-pressed', String(!v.muted)); lab.textContent = v.muted ? 'Tap for sound' : 'Sound on'; b.classList.toggle('is-on', !v.muted); };
    b.addEventListener('click', function () { if (v.muted) { v.muted = false; v.currentTime = 0; } else { v.muted = true; } var p = v.play(); if (p && p.catch) p.catch(function () {}); sync(); });
    v.addEventListener('volumechange', sync); sync();
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

  // Contact form: submits to Wix Forms (ABK SKIN Contact Form) with a Wix visitor token.
  d.querySelectorAll('[data-wix-form]').forEach(function (f) {
    var formId = f.getAttribute('data-wix-form'), keys = JSON.parse(f.getAttribute('data-wix-fields') || '{}');
    var clientId = d.body.getAttribute('data-wix-client'), API = 'https://www.wixapis.com', KEY = 'abk.wix.session.v1';
    var status = f.querySelector('[data-cf-status]'), btn = f.querySelector('[data-cf-submit]'), email = f.getAttribute('data-fallback-email');
    var phoneEl = f.elements.phone;
    var say = function (msg, kind) { status.className = 'cf-status' + (kind ? ' is-' + kind : ''); status.innerHTML = msg; if (msg) status.focus(); };
    var token = function () {
      try { var t = JSON.parse(localStorage.getItem(KEY)); if (t && t.access && t.exp > Date.now()) return Promise.resolve(t.access); } catch (e) {}
      return fetch(API + '/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: clientId, grantType: 'anonymous' }) })
        .then(function (r) { if (!r.ok) throw new Error('token'); return r.json(); })
        .then(function (j) { try { localStorage.setItem(KEY, JSON.stringify({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 120) * 1000 })); } catch (e) {} return j.access_token; });
    };
    var e164 = function (raw) {
      var s = (raw || '').trim(); if (!s) return '';
      var dg = s.replace(/\D/g, '');
      if (s.charAt(0) === '+') return dg.length >= 8 && dg.length <= 15 ? '+' + dg : null;
      if (dg.length === 10) return '+1' + dg;
      if (dg.length === 11 && dg.charAt(0) === '1') return '+' + dg;
      return null;
    };
    if (phoneEl) phoneEl.addEventListener('input', function () { phoneEl.setCustomValidity(''); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (n) { return (f.elements[n] && f.elements[n].value || '').trim(); };
      var ph = e164(v('phone'));
      if (phoneEl) phoneEl.setCustomValidity(ph === null ? 'Enter a 10-digit US phone number, or include your country code with a +.' : '');
      if (!f.checkValidity()) { f.classList.add('was-validated'); var bad = f.querySelector(':invalid'); if (bad) { bad.focus(); if (bad.reportValidity) bad.reportValidity(); } return; }
      if (v('company')) { f.reset(); say('Thank you. Your message has been sent.', 'ok'); return; }
      var data = {};
      ['first', 'last', 'email', 'service', 'message'].forEach(function (n) { if (v(n) && keys[n]) data[keys[n]] = v(n); });
      if (ph && keys.phone) data[keys.phone] = ph;
      btn.disabled = true; btn.setAttribute('aria-busy', 'true'); say('Sending your message\u2026');
      var send = function (tok) { return fetch(API + '/form-submission-service/v4/submissions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: tok }, body: JSON.stringify({ submission: { formId: formId, submissions: data } }) }); };
      token().then(function (tok) { return send(tok).then(function (r) { if (r.status === 401) { try { localStorage.removeItem(KEY); } catch (x) {} return token().then(send); } return r; }); })
        .then(function (r) { if (!r.ok) throw new Error('submit ' + r.status); return r.json(); })
        .then(function () { f.reset(); f.classList.remove('was-validated'); say('Thank you, ' + data[keys.first].replace(/[<>&"]/g, '') + '. Your message has been sent, and ABK SKIN will reply by email.', 'ok'); if (window.abkTrack) window.abkTrack('contact-submit'); })
        .catch(function () { say('Sorry, your message could not be sent just now. Please try again, or email <a href="mailto:' + email + '">' + email + '</a>.', 'err'); })
        .then(function () { btn.disabled = false; btn.removeAttribute('aria-busy'); });
    });
  });

  // Video library: click to play with sound; only one plays at a time.
  var allV = [];
  d.querySelectorAll('[data-vcard]').forEach(function (c) {
    var v = c.querySelector('video'), b = c.querySelector('[data-vplay]');
    if (!v || !b) return; allV.push(v);
    b.addEventListener('click', function () {
      allV.forEach(function (o) { if (o !== v) o.pause(); });
      d.querySelectorAll('[data-reel]').forEach(function (o) { o.pause(); });
      v.controls = true; c.classList.add('is-playing'); var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
      v.focus();
    });
    v.addEventListener('ended', function () { c.classList.remove('is-playing'); v.controls = false; v.load(); });
  });
  d.querySelectorAll('[data-reels-row]').forEach(function (row) {
    var sec = row.closest('section'); if (!sec) return;
    var step = function (dir) { var card = row.querySelector('.vcard'); var w = card ? card.getBoundingClientRect().width + 16 : 300; row.scrollBy({ left: dir * w * 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    var p = sec.querySelector('[data-reels-prev]'), n = sec.querySelector('[data-reels-next]');
    if (p) p.addEventListener('click', function () { step(-1); }); if (n) n.addEventListener('click', function () { step(1); });
  });

  // Staging review notes: add ?review=1 to a URL to show them (no on-page bubble).
  if (/[?&]review=1/.test(location.search)) d.body.classList.add('show-review');

  // Gentle reveal on scroll
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    d.querySelectorAll('.sec-head, .path-card, .known-list li, .card:not([hidden]), .plan-card, .concern-card, .method-steps li, .tr-card, .club-card, .mh-grid li, .jr-card').forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('reveal'); io.observe(el); }
    });
  }
  // ---------- Journal topic filters ----------
  (function () {
    var bar = d.querySelector('[data-jr-filters]'), grid = d.querySelector('[data-jr-grid]');
    if (!bar || !grid) return;
    var status = d.querySelector('[data-jr-status]');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-jr-filter]');
      if (!b) return;
      var t = b.getAttribute('data-jr-filter'), shown = 0;
      bar.querySelectorAll('[data-jr-filter]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      grid.querySelectorAll('[data-topic]').forEach(function (li) { var on = t === 'all' || li.getAttribute('data-topic') === t; li.hidden = !on; if (on) { shown++; li.classList.add('is-in'); } });
      if (status) status.textContent = 'Showing ' + shown + (shown === 1 ? ' guide' : ' guides');
    });
  })();
  // ---------- Article table of contents ----------
  (function () {
    var toc = d.querySelector('.art-toc');
    if (!toc) return;
    if (window.matchMedia('(max-width: 999px)').matches) toc.removeAttribute('open');
    var links = toc.querySelectorAll('a[href^="#"]');
    if (!('IntersectionObserver' in window) || !links.length) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { links.forEach(function (l) { l.classList.remove('is-active'); l.removeAttribute('aria-current'); }); var a = map[e.target.id]; if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true'); } } });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var h = d.getElementById(id); if (h) obs.observe(h); });
  })();

  // Reviews slider: native scroll-snap + arrows, drag on desktop, progress bar.
  d.querySelectorAll('[data-rv]').forEach(function (sec) {
    var t = sec.querySelector('[data-rv-track]'), prev = sec.querySelector('[data-rv-prev]'), next = sec.querySelector('[data-rv-next]'), bar = sec.querySelector('[data-rv-bar]');
    if (!t) return;
    var step = function () { var s = t.querySelector('.rv-slide'); return s ? s.getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap || 16) : 300; };
    var update = function () {
      var max = t.scrollWidth - t.clientWidth, x = t.scrollLeft;
      if (prev) prev.disabled = x <= 2; if (next) next.disabled = x >= max - 2;
      if (bar) { var vis = Math.max(.12, t.clientWidth / t.scrollWidth); bar.style.width = (vis * 100) + '%'; bar.style.transform = 'translateX(' + (max > 0 ? (x / max) * ((1 - vis) / vis) * 100 : 0) + '%)'; }
    };
    var go = function (dir) { t.scrollBy({ left: dir * step(), behavior: reduce ? 'auto' : 'smooth' }); };
    prev && prev.addEventListener('click', function () { go(-1); });
    next && next.addEventListener('click', function () { go(1); });
    t.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } });
    t.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update); update();
    var down = false, sx = 0, sl = 0, moved = false;
    t.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = t.scrollLeft; });
    window.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) { moved = true; t.classList.add('is-drag'); } t.scrollLeft = sl - dx; });
    window.addEventListener('pointerup', function () { if (!down) return; down = false; if (moved) { var s = step(), idx = Math.round(t.scrollLeft / s); t.classList.remove('is-drag'); t.scrollTo({ left: idx * s, behavior: reduce ? 'auto' : 'smooth' }); } });
    t.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  });

  d.querySelectorAll('[data-fs]').forEach(function (sec) {
    var t = sec.querySelector('[data-fs-track]'), dots = [].slice.call(sec.querySelectorAll('[data-fs-dot]'));
    if (!t) return;
    var slides = [].slice.call(t.children), cur = 0, timer = null, paused = false;
    var pos = function (i) { return slides[i].offsetLeft - slides[0].offsetLeft; };
    var go = function (i) { cur = (i + slides.length) % slides.length; t.scrollTo({ left: pos(cur), behavior: reduce ? 'auto' : 'smooth' }); };
    var sync = function () { var x = t.scrollLeft, best = 0; slides.forEach(function (s, i) { if (Math.abs(pos(i) - x) < Math.abs(pos(best) - x)) best = i; }); cur = best; dots.forEach(function (b, i) { if (i === best) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }); };
    dots.forEach(function (b, i) { b.addEventListener('click', function () { go(i); restart(); }); });
    t.addEventListener('scroll', function () { clearTimeout(t._s); t._s = setTimeout(sync, 80); }, { passive: true });
    t.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); } });
    var tick = function () { if (!paused && !d.hidden) go(cur + 1); };
    var restart = function () { clearInterval(timer); if (!reduce) timer = setInterval(tick, 6500); };
    sec.addEventListener('mouseenter', function () { paused = true; }); sec.addEventListener('mouseleave', function () { paused = false; });
    sec.addEventListener('focusin', function () { paused = true; }); sec.addEventListener('focusout', function () { paused = false; });
    t.addEventListener('touchstart', function () { restart(); }, { passive: true });
    var down = false, sx = 0, sl = 0, moved = false;
    t.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = t.scrollLeft; t.style.scrollSnapType = 'none'; });
    window.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; t.scrollLeft = sl - dx; });
    window.addEventListener('pointerup', function (e) { if (!down) return; down = false; t.style.scrollSnapType = ''; if (moved) { var dx = e.clientX - sx; go(cur + (dx < -40 ? 1 : dx > 40 ? -1 : 0)); restart(); } });
    t.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    restart();
  });
})();
