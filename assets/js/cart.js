/* ABK SKIN cart: Wix Stores + Wix eCommerce (headless REST).
   Visitor session tokens persist in localStorage, so the cart survives page loads and return visits.
   Wix controls price, stock, tax, shipping and checkout. This file never charges a card. */
(function () {
  'use strict';
  var d = document, body = d.body;
  var CLIENT_ID = body.getAttribute('data-wix-client');
  var STORES_APP = body.getAttribute('data-wix-stores');
  if (!CLIENT_ID || !window.fetch) return;
  var API = 'https://www.wixapis.com';
  var KEY = 'abk.wix.session.v1';
  var MAX_QTY = 10;
  var PKGS = (body.getAttribute('data-bf-pkgs') || '').split(',').filter(Boolean);

  // ---------- Session tokens ----------
  function readSession() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function saveSession(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {} }
  function tokenRequest(payload) {
    return fetch(API + '/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw new Error('token ' + r.status); return r.json(); })
      .then(function (j) { var t = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 120) * 1000 }; saveSession(t); return t; });
  }
  var pending = null;
  function getToken(force) {
    var s = readSession();
    if (s && s.access && !force && s.exp > Date.now()) return Promise.resolve(s.access);
    if (pending) return pending;
    pending = (s && s.refresh
      ? tokenRequest({ clientId: CLIENT_ID, grantType: 'refresh_token', refresh_token: s.refresh }).catch(function () { return tokenRequest({ clientId: CLIENT_ID, grantType: 'anonymous' }); })
      : tokenRequest({ clientId: CLIENT_ID, grantType: 'anonymous' }))
      .then(function (t) { pending = null; return t.access; }, function (e) { pending = null; throw e; });
    return pending;
  }
  function call(method, path, data, retried) {
    return getToken(false).then(function (tok) {
      return fetch(API + path, { method: method, headers: { 'content-type': 'application/json', authorization: tok }, body: data ? JSON.stringify(data) : undefined });
    }).then(function (r) {
      if (r.status === 401 && !retried) return getToken(true).then(function () { return call(method, path, data, true); });
      if (r.status === 404 && path === '/ecom/v1/carts/current') return { cart: null };
      return r.json().then(function (j) { if (!r.ok) { var e = new Error((j && j.message) || ('Request failed ' + r.status)); e.details = j; throw e; } return j; });
    });
  }

  // ---------- Cart API ----------
  var Cart = {
    get: function () { return call('GET', '/ecom/v1/carts/current').then(function (j) { return j.cart; }); },
    add: function (productId, variantId, qty) {
      var ref = { appId: STORES_APP, catalogItemId: productId };
      if (variantId && !/^0{8}-/.test(variantId)) ref.options = { variantId: variantId };
      return call('POST', '/ecom/v1/carts/current/add-to-cart', { lineItems: [{ catalogReference: ref, quantity: qty }] }).then(function (j) { return j.cart; });
    },
    setQty: function (id, qty) { return call('POST', '/ecom/v1/carts/current/update-line-items-quantity', { lineItems: [{ id: id, quantity: qty }] }).then(function (j) { return j.cart; }); },
    remove: function (id) { return call('POST', '/ecom/v1/carts/current/remove-line-items', { lineItemIds: [id] }).then(function (j) { return j.cart; }); },
    checkoutUrl: function () {
      var here = cartUrl();
      return Cart.get().then(function (cart) {
        // Black Friday treatment packages: after payment, send the buyer to the booking screen.
        var bought = (cart && cart.lineItems || []).map(function (li) { return li.catalogReference && li.catalogReference.catalogItemId; }).filter(function (id) { return PKGS.indexOf(id) > -1; });
        try { localStorage.setItem(KEY + '.bfpkgs', JSON.stringify(bought)); } catch (e) {}
        var thanks = bought.length ? location.origin + '/black-friday/book/index.html?thanks=1' : here + (here.indexOf('?') > -1 ? '&' : '?') + 'thanks=1';
        return call('POST', '/ecom/v1/carts/current/create-checkout', { channelType: 'WEB' }).then(function (j) { return { j: j, thanks: thanks }; });
      }).then(function (o) {
        return call('POST', '/redirect-session/v1/redirect-session', { ecomCheckout: { checkoutId: o.j.checkoutId }, callbacks: { postFlowUrl: here, thankYouPageUrl: o.thanks } });
      }).then(function (j) { return j.redirectSession.fullUrl; });
    }
  };

  // ---------- Helpers ----------
  function cartUrl() { var a = d.querySelector('[data-cart-link]'); return a ? a.href.split('#')[0] : location.origin + '/cart/'; }
  function count(cart) { return cart && cart.lineItems ? cart.lineItems.reduce(function (n, li) { return n + (li.quantity || 0); }, 0) : 0; }
  function money(m) { return m ? (m.formattedConvertedAmount || m.formattedAmount || ('$' + Number(m.amount).toFixed(2))) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setBadge(cart) {
    var n = count(cart);
    try { localStorage.setItem(KEY + '.count', String(n)); } catch (e) {}
    d.querySelectorAll('[data-cart-count]').forEach(function (b) { b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; });
    d.querySelectorAll('[data-cart-link]').forEach(function (a) { a.setAttribute('aria-label', n ? 'Your cart, ' + n + (n === 1 ? ' item' : ' items') : 'Your cart'); });
  }
  // Show the last known count instantly, then confirm with Wix.
  (function () { var n = 0; try { n = +localStorage.getItem(KEY + '.count') || 0; } catch (e) {} if (n) setBadge({ lineItems: [{ quantity: n }] }); })();

  var toastEl, toastTimer;
  function toast(html) {
    if (!toastEl) { toastEl = d.createElement('div'); toastEl.className = 'cart-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); body.appendChild(toastEl); }
    toastEl.innerHTML = html; toastEl.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 6000);
  }
  function friendly(err) {
    var m = (err && err.message) || '';
    if (/stock|quantity|available/i.test(m)) return 'Sorry, there is not enough stock for that quantity.';
    return 'Sorry, something went wrong. Please try again, or email ' + esc('abkskinn@gmail.com') + '.';
  }

  // ---------- Mini cart drawer (opens after every add to cart) ----------
  var cdr, cdrLast;
  function isPkg(li) { return PKGS.indexOf(li.catalogReference && li.catalogReference.catalogItemId) > -1; }
  function closeDrawer() {
    if (!cdr || cdr.hidden) return;
    cdr.classList.remove('is-open'); body.classList.remove('cdr-lock');
    setTimeout(function () { cdr.hidden = true; }, 260);
    if (cdrLast && cdrLast.focus) cdrLast.focus();
  }
  function openDrawer(cart, addedId) {
    if (!cdr) {
      cdr = d.createElement('div'); cdr.className = 'cdr'; cdr.hidden = true;
      cdr.innerHTML = '<div class="cdr-scrim" data-cdr-close></div><aside class="cdr-panel" role="dialog" aria-modal="true" aria-labelledby="cdr-h">' +
        '<header class="cdr-head"><h2 id="cdr-h" class="cdr-title">Added to your cart</h2><button type="button" class="cdr-x" data-cdr-close aria-label="Close cart"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header>' +
        '<ul class="cdr-lines" data-cdr-lines></ul>' +
        '<div class="cdr-foot"><dl class="cdr-totals"><div><dt>Subtotal</dt><dd data-cdr-sub></dd></div><div class="cdr-save" data-cdr-save-row hidden><dt>Black Friday savings</dt><dd data-cdr-save></dd></div></dl>' +
        '<p class="cdr-note" data-cdr-note hidden><strong>Booking comes next.</strong> You will book your treatment visits right after checkout.</p>' +
        '<p class="cdr-err" data-cdr-err hidden></p>' +
        '<button type="button" class="btn btn-primary btn-block" data-cdr-checkout>Secure checkout</button>' +
        '<a class="btn btn-block cdr-view" href="' + esc(cartUrl()) + '">View cart</a>' +
        '<button type="button" class="link-btn cdr-keep" data-cdr-close>Keep shopping</button></div></aside>';
      body.appendChild(cdr);
      cdr.addEventListener('click', function (e) { if (e.target.closest('[data-cdr-close]')) closeDrawer(); });
      d.addEventListener('keydown', function (e) {
        if (cdr.hidden) return;
        if (e.key === 'Escape') closeDrawer();
        if (e.key === 'Tab') { var f = cdr.querySelectorAll('button, a[href]'), a = f[0], z = f[f.length - 1]; if (e.shiftKey && d.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && d.activeElement === z) { e.preventDefault(); a.focus(); } }
      });
      var co = cdr.querySelector('[data-cdr-checkout]');
      co.addEventListener('click', function () {
        var err = cdr.querySelector('[data-cdr-err]'); err.hidden = true;
        co.disabled = true; co.textContent = 'Opening secure checkout\u2026';
        Cart.checkoutUrl().then(function (url) { location.href = url; }).catch(function (x) { co.disabled = false; co.textContent = 'Secure checkout'; err.innerHTML = friendly(x); err.hidden = false; });
      });
    }
    var items = (cart && cart.lineItems) || [];
    items = items.slice().sort(function (a, b) { var A = a.catalogReference && a.catalogReference.catalogItemId === addedId, B = b.catalogReference && b.catalogReference.catalogItemId === addedId; return (B ? 1 : 0) - (A ? 1 : 0); });
    cdr.querySelector('[data-cdr-lines]').innerHTML = items.map(function (li) {
      var name = (li.productName && (li.productName.translated || li.productName.original)) || 'Item';
      var img = li.image && li.image.url ? li.image.url + '/v1/fill/w_160,h_160,al_c,q_80/item.jpg' : '';
      var just = li.catalogReference && li.catalogReference.catalogItemId === addedId;
      return '<li class="cdr-line' + (just ? ' is-new' : '') + '"><div class="cdr-img">' + (img ? '<img src="' + esc(img) + '" alt="" width="64" height="64">' : '') + '</div>' +
        '<div class="cdr-info"><p class="cdr-name">' + esc(name) + '</p><p class="cdr-meta">Qty ' + li.quantity + (isPkg(li) ? ' &middot; 3 visits' : '') + '</p></div>' +
        '<p class="cdr-price">' + (li.fullPrice && Number(li.fullPrice.amount) > Number(li.price.amount) ? '<s>' + esc(money(li.fullPrice)) + '</s>' : '') + esc(money(li.lineItemPrice || li.price)) + '</p></li>';
    }).join('');
    cdr.querySelector('[data-cdr-sub]').textContent = money(cart.subtotalAfterDiscounts || cart.subtotal);
    var saved = items.reduce(function (t, li) { var f = li.fullPrice ? Number(li.fullPrice.amount) || 0 : 0, pr = li.price ? Number(li.price.amount) || 0 : 0; return t + (f > pr ? (f - pr) * li.quantity : 0); }, 0);
    var sr = cdr.querySelector('[data-cdr-save-row]'); sr.hidden = !(saved > 0.004); cdr.querySelector('[data-cdr-save]').textContent = '$' + saved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    cdr.querySelector('[data-cdr-note]').hidden = !items.some(isPkg);
    var n = items.reduce(function (t, li) { return t + (li.quantity || 0); }, 0);
    cdr.querySelector('#cdr-h').textContent = 'Added to your cart' + (n > 1 ? ' (' + n + ' items)' : '');
    cdrLast = d.activeElement;
    cdr.hidden = false; body.classList.add('cdr-lock');
    requestAnimationFrame(function () { cdr.classList.add('is-open'); cdr.querySelector('.cdr-x').focus(); });
  }

  // ---------- Add to cart (product pages and shop cards) ----------
  d.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add-to-cart]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    var box = btn.closest('[data-buy-box]') || btn;
    var pid = box.getAttribute('data-store-product'), vid = box.getAttribute('data-store-variant');
    var name = box.getAttribute('data-name') || 'Item';
    var input = box.querySelector('[data-qty-input]');
    var qty = input ? Math.max(1, Math.min(MAX_QTY, parseInt(input.value, 10) || 1)) : 1;
    var status = box.querySelector('[data-add-status]');
    var label = btn.innerHTML;
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Adding\u2026';
    Cart.add(pid, vid, qty).then(function (cart) {
      setBadge(cart);
      var msg = 'Added ' + esc(name) + (qty > 1 ? ' (' + qty + ')' : '') + ' to your cart.';
      var links = ' <a href="' + esc(cartUrl()) + '">View cart</a>';
      if (status) status.textContent = '';
      openDrawer(cart, pid);
    }).catch(function (err) {
      if (status) status.textContent = friendly(err); else toast(friendly(err));
    }).then(function () { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = label; });
  });

  // Quantity steppers on product pages
  d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qty-inc],[data-qty-dec]');
    if (!b) return;
    var input = b.closest('[data-qty]').querySelector('[data-qty-input]');
    var v = (parseInt(input.value, 10) || 1) + (b.hasAttribute('data-qty-inc') ? 1 : -1);
    input.value = Math.max(1, Math.min(+input.max || MAX_QTY, v));
  });

  // ---------- Black Friday display (Wix applies the real discount in the cart) ----------
  var SALE_END = Date.UTC(2026, 11, 1, 5, 0, 0); // Tue, Dec 1, 2026, 12:00 AM Eastern
  var saleOn = Date.now() < SALE_END;
  if (!saleOn) d.querySelectorAll('[data-sale-after]').forEach(function (el) { el.hidden = false; });
  d.querySelectorAll('[data-sale-only]').forEach(function (el) { if (!saleOn) el.hidden = true; else if (el.hasAttribute('data-sale-tag')) el.hidden = false; });
  function applySale(el) {
    if (!saleOn) return;
    var pct = +el.getAttribute('data-sale') || 0, txt = el.textContent.trim();
    if (!pct || el.getAttribute('data-sale-done') === txt) return;
    var now = txt.replace(/\$([\d,]+(?:\.\d{1,2})?)/g, function (m, n) { return '$' + (Math.round(parseFloat(n.replace(/,/g, '')) * (100 - pct)) / 100).toFixed(2); });
    if (now === txt) return;
    el.innerHTML = '<s class="was">' + esc(txt) + '</s> <span class="now">' + esc(now) + '</span>';
    el.setAttribute('data-sale-done', el.textContent.trim());
    el.setAttribute('aria-label', 'Was ' + txt + ', now ' + now);
  }
  d.querySelectorAll('[data-sale]').forEach(applySale);
  var cd = d.querySelector('[data-countdown]');
  if (cd && saleOn) {
    var end = Date.parse(cd.getAttribute('data-countdown'));
    var tick = function () { var ms = end - Date.now(); if (ms <= 0) { cd.hidden = true; return; } var m = Math.floor(ms / 60000); cd.querySelector('[data-cd="d"]').textContent = Math.floor(m / 1440); cd.querySelector('[data-cd="h"]').textContent = Math.floor(m / 60) % 24; cd.querySelector('[data-cd="m"]').textContent = m % 60; cd.hidden = false; };
    tick(); setInterval(tick, 30000);
  }

  // ---------- Live price and stock from Wix ----------
  var liveEls = d.querySelectorAll('[data-live-price][data-store-product]');
  if (liveEls.length) {
    var ids = [];
    liveEls.forEach(function (el) { var id = el.getAttribute('data-store-product'); if (ids.indexOf(id) < 0) ids.push(id); });
    var chunks = [];
    for (var i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    Promise.all(chunks.map(function (c) {
      return call('POST', '/stores-reader/v1/products/query', { query: { filter: JSON.stringify({ id: { $hasSome: c } }), paging: { limit: 100 } } }).then(function (j) { return j.products || []; });
    })).then(function (lists) {
      var by = {};
      lists.forEach(function (l) { l.forEach(function (p) { by[p.id] = p; }); });
      liveEls.forEach(function (el) {
        var p = by[el.getAttribute('data-store-product')];
        if (!p) return;
        var pd = p.priceData || {}, f = pd.formatted || {};
        if (pd.discountedPrice != null && pd.discountedPrice < pd.price) el.innerHTML = '<s class="was">' + esc(f.price) + '</s> ' + esc(f.discountedPrice);
        else if (f.price) el.textContent = f.price;
        if (el.hasAttribute('data-sale')) { el.removeAttribute('data-sale-done'); applySale(el); }
        var inStock = p.stock ? p.stock.inStock !== false : true;
        var box = el.closest('[data-buy-box]');
        if (box) {
          var st = box.querySelector('[data-live-stock]'), add = box.querySelector('[data-add-to-cart]'), q = box.querySelector('[data-qty-input]');
          if (st) { st.textContent = inStock ? (p.stock && p.stock.trackInventory && p.stock.quantity != null && p.stock.quantity <= 3 ? 'In stock, ' + p.stock.quantity + ' left' : 'In stock') : 'Out of stock'; st.className = 'prd-stock ' + (inStock ? 'ok' : 'no'); }
          if (add) { add.disabled = !inStock; add.textContent = inStock ? 'Add to cart' : 'Out of stock'; }
          if (q && p.stock && p.stock.trackInventory && p.stock.quantity) q.max = Math.min(MAX_QTY, p.stock.quantity);
        }
        var card = el.closest('.prd-card');
        if (card && !inStock) { var qb = card.querySelector('[data-add-to-cart]'); if (qb) { qb.disabled = true; qb.textContent = 'Out of stock'; } }
      });
    }).catch(function () { /* keep the built prices; Wix still validates at checkout */ });
  }

  // ---------- Cart page ----------
  var page = d.querySelector('[data-cart-page]');
  function renderCart(cart) {
    var $ = function (s) { return page.querySelector(s); };
    $('[data-cart-loading]').hidden = true;
    var items = (cart && cart.lineItems) || [];
    $('[data-cart-empty]').hidden = items.length > 0;
    $('[data-cart-full]').hidden = items.length === 0;
    if (!items.length) return;
    $('[data-cart-lines]').innerHTML = items.map(function (li) {
      var name = (li.productName && (li.productName.translated || li.productName.original)) || 'Product';
      var link = page.querySelector('[data-prd-link="' + (li.catalogReference && li.catalogReference.catalogItemId) + '"]');
      var href = link ? link.href : null;
      if (link) name = link.textContent;
      var img = li.image && li.image.url ? li.image.url + '/v1/fill/w_240,h_288,al_c,q_80/item.jpg' : '';
      var avail = li.availability || {};
      var max = Math.min(MAX_QTY, avail.quantityAvailable || MAX_QTY);
      var warn = avail.status && avail.status !== 'AVAILABLE' ? '<p class="cart-warn">' + (avail.status === 'NOT_AVAILABLE' ? 'No longer available. Please remove it to check out.' : 'Only ' + esc(avail.quantityAvailable) + ' available.') + '</p>' : '';
      var nm = href ? '<a href="' + esc(href) + '">' + esc(name) + '</a>' : esc(name);
      return '<li class="cart-line" data-line="' + esc(li.id) + '">' +
        '<div class="cart-img">' + (img ? '<img src="' + esc(img) + '" alt="" width="120" height="144">' : '') + '</div>' +
        '<div class="cart-info"><h2 class="cart-name">' + nm + '</h2><p class="cart-unit">' + (li.fullPrice && Number(li.fullPrice.amount) > Number(li.price.amount) ? '<s class="was">' + esc(money(li.fullPrice)) + '</s> ' : '') + esc(money(li.price)) + ' each</p>' + warn +
        '<div class="cart-actions"><div class="qty"><button type="button" class="qty-btn" data-line-dec aria-label="Decrease quantity of ' + esc(name) + '"' + (li.quantity <= 1 ? ' disabled' : '') + '>&minus;</button>' +
        '<span class="qty-val" aria-label="Quantity">' + li.quantity + '</span>' +
        '<button type="button" class="qty-btn" data-line-inc aria-label="Increase quantity of ' + esc(name) + '"' + (li.quantity >= max ? ' disabled' : '') + '>+</button></div>' +
        '<button type="button" class="link-btn" data-line-remove>Remove<span class="sr-only"> ' + esc(name) + '</span></button></div></div>' +
        '<p class="cart-line-total">' + esc(money(li.lineItemPrice)) + '</p></li>';
    }).join('');
    var subM = cart.subtotalAfterDiscounts || cart.subtotal;
    $('[data-cart-subtotal]').textContent = money(subM);
    var saved = items.reduce(function (t, li) { var f = li.fullPrice ? Number(li.fullPrice.amount) || 0 : 0, pr = li.price ? Number(li.price.amount) || 0 : 0; return t + (f > pr ? (f - pr) * li.quantity : 0); }, 0);
    var saveRow = $('[data-cart-save-row]');
    if (saveRow) { saveRow.hidden = !(saved > 0.004); if (!saveRow.hidden) $('[data-cart-save]').textContent = '$' + saved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    // Shipping preview. Wix applies the same rule at checkout: $13 flat, free over $100 (US).
    var rate = +page.getAttribute('data-ship-rate') || 0, free = +page.getAttribute('data-ship-free') || 0;
    var sub = subM ? Number(subM.amount) || 0 : 0;
    var shipItems = items.filter(function (li) { return PKGS.indexOf(li.catalogReference && li.catalogReference.catalogItemId) < 0; });
    var noShip = !shipItems.length;
    var isFree = noShip || (free && sub >= free), ship = isFree ? 0 : rate;
    var usd = function (n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    $('[data-cart-shipping]').textContent = noShip ? 'Not needed' : isFree ? 'Free' : usd(rate);
    $('[data-cart-total]').textContent = usd(sub + ship);
    var t = $('[data-ship-text]'), bar = $('[data-ship-bar]'), meter = $('[data-ship-meter]');
    if (meter) meter.hidden = noShip;
    var pn = $('[data-cart-pkg-note]'); if (pn) pn.hidden = !items.some(isPkg);
    var sn = $('[data-cart-ship-note]'); if (sn) sn.hidden = noShip;
    if (free && t && !noShip) {
      t.innerHTML = isFree ? '<strong>Your order ships free.</strong>' : 'You are <strong>' + usd(Math.max(0.01, free - sub)) + '</strong> away from free shipping.';
      bar.style.width = Math.min(100, sub / free * 100) + '%';
      meter.classList.toggle('is-free', !!isFree);
    }
  }
  function showError(msg) { var e = page.querySelector('[data-cart-error]'); e.innerHTML = msg; e.hidden = !msg; }

  if (page) {
    if (/[?&]thanks=1/.test(location.search)) { page.querySelector('[data-cart-thanks]').hidden = false; }
    Cart.get().then(function (c) { setBadge(c); renderCart(c); }).catch(function () {
      page.querySelector('[data-cart-loading]').hidden = true; showError('Your cart could not be loaded. Please refresh the page.');
    });
    page.addEventListener('click', function (e) {
      var b = e.target.closest('[data-line-inc],[data-line-dec],[data-line-remove]');
      if (!b) return;
      var line = b.closest('[data-line]'), id = line.getAttribute('data-line');
      var q = parseInt(line.querySelector('.qty-val').textContent, 10);
      line.setAttribute('aria-busy', 'true'); line.classList.add('is-busy');
      var job = b.hasAttribute('data-line-remove') ? Cart.remove(id) : Cart.setQty(id, q + (b.hasAttribute('data-line-inc') ? 1 : -1));
      job.then(function (c) { showError(''); setBadge(c); renderCart(c); var f = page.querySelector('[data-line="' + id + '"] .qty-btn:not([disabled])') || page.querySelector('#cart-title'); if (f && b.hasAttribute('data-line-remove')) { page.querySelector('#cart-title').setAttribute('tabindex', '-1'); page.querySelector('#cart-title').focus(); } else if (f) f.focus(); })
        .catch(function (err) { line.classList.remove('is-busy'); line.removeAttribute('aria-busy'); showError(friendly(err)); });
    });
    var co = page.querySelector('[data-checkout]');
    co.addEventListener('click', function () {
      var label = co.innerHTML;
      co.disabled = true; co.setAttribute('aria-busy', 'true'); co.textContent = 'Opening secure checkout\u2026';
      Cart.checkoutUrl().then(function (url) { location.href = url; }).catch(function (err) {
        co.disabled = false; co.removeAttribute('aria-busy'); co.innerHTML = label; showError(friendly(err));
      });
    });
  } else if (readSession()) {
    Cart.get().then(setBadge).catch(function () {});
  }

  // ---------- Black Friday booking screen (after checkout) ----------
  var bfk = d.querySelector('[data-bfk-grid]');
  if (bfk) {
    var got = []; try { got = JSON.parse(localStorage.getItem(KEY + '.bfpkgs')) || []; } catch (e) {}
    if (got.length) bfk.querySelectorAll('[data-bfk-card]').forEach(function (c) { c.hidden = got.indexOf(c.getAttribute('data-bfk-card')) < 0; });
    if (/[?&]thanks=1/.test(location.search)) { setBadge(null); }
  }
})();
