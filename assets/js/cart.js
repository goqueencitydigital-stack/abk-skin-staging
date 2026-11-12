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
      return call('POST', '/ecom/v1/carts/current/create-checkout', { channelType: 'WEB' }).then(function (j) {
        return call('POST', '/redirect-session/v1/redirect-session', { ecomCheckout: { checkoutId: j.checkoutId }, callbacks: { postFlowUrl: here, thankYouPageUrl: here + (here.indexOf('?') > -1 ? '&' : '?') + 'thanks=1' } });
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
      if (status) status.innerHTML = msg + links; else toast(msg + links);
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
        '<div class="cart-info"><h2 class="cart-name">' + nm + '</h2><p class="cart-unit">' + esc(money(li.price)) + ' each</p>' + warn +
        '<div class="cart-actions"><div class="qty"><button type="button" class="qty-btn" data-line-dec aria-label="Decrease quantity of ' + esc(name) + '"' + (li.quantity <= 1 ? ' disabled' : '') + '>&minus;</button>' +
        '<span class="qty-val" aria-label="Quantity">' + li.quantity + '</span>' +
        '<button type="button" class="qty-btn" data-line-inc aria-label="Increase quantity of ' + esc(name) + '"' + (li.quantity >= max ? ' disabled' : '') + '>+</button></div>' +
        '<button type="button" class="link-btn" data-line-remove>Remove<span class="sr-only"> ' + esc(name) + '</span></button></div></div>' +
        '<p class="cart-line-total">' + esc(money(li.lineItemPrice)) + '</p></li>';
    }).join('');
    var subM = cart.subtotalAfterDiscounts || cart.subtotal;
    $('[data-cart-subtotal]').textContent = money(subM);
    // Shipping preview. Wix applies the same rule at checkout: $13 flat, free over $100 (US).
    var rate = +page.getAttribute('data-ship-rate') || 0, free = +page.getAttribute('data-ship-free') || 0;
    var sub = subM ? Number(subM.amount) || 0 : 0;
    var isFree = free && sub >= free, ship = isFree ? 0 : rate;
    var usd = function (n) { return '$' + n.toFixed(2); };
    $('[data-cart-shipping]').textContent = isFree ? 'Free' : usd(rate);
    $('[data-cart-total]').textContent = usd(sub + ship);
    var t = $('[data-ship-text]'), bar = $('[data-ship-bar]'), meter = $('[data-ship-meter]');
    if (free && t) {
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
})();
