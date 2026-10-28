/* Blog engagement: read counts, likes, bookmarks, subscribe, share.
   The API base URL is the <meta name="engage-api"> value (one config, from ENGAGE_API).
   Counts stay hidden when that API cannot be reached.
   External, direct, and in-site visits all post a read; localStorage plus the Worker debounce repeats. */
(function () {
  var VIEW_FALLBACK_MS = 12 * 60 * 60 * 1000;
  var KEY = 'yct-engage';

  function apiBase() {
    var m = document.querySelector('meta[name="engage-api"]');
    return ((m && m.getAttribute('content')) || '').replace(/\/+$/, '');
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function ensure(state) {
    state.views = state.views || {};
    state.likes = state.likes || {};
    state.likeSync = state.likeSync || {};
    state.bookmarks = state.bookmarks || {};
    state.bookmarkSync = state.bookmarkSync || {};
    return state;
  }
  function vid(state) {
    if (state.vid && /^[A-Za-z0-9_-]{8,80}$/.test(state.vid)) return state.vid;
    var bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var hex = '';
    for (var j = 0; j < bytes.length; j++) hex += ('0' + bytes[j].toString(16)).slice(-2);
    state.vid = hex;
    save(state);
    return hex;
  }
  function call(method, path, body) {
    var base = apiBase();
    if (!base) return Promise.resolve(null);
    var opts = { method: method, headers: { 'Accept': 'application/json' } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(base + path, opts).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      return j && j.ok ? j : null;
    }).catch(function () { return null; });
  }
  function visitSrc() {
    var ref = '';
    try { ref = document.referrer || ''; } catch (e) {}
    if (!ref) return 'direct';
    try { if (new URL(ref).host === location.host) return 'site'; } catch (e2) {}
    return 'external';
  }
  function lang() {
    return document.documentElement.getAttribute('data-lang') || 'zh-Hant';
  }
  function textIn(node) {
    if (!node) return '';
    var el = node.querySelector('[data-l="' + lang() + '"]');
    return (el || node).textContent || '';
  }
  function slugOk(s) { return typeof s === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s); }

  function bootPost(root) {
    var state = ensure(load());
    var slug = root.getAttribute('data-slug');
    var url = root.getAttribute('data-url') || location.href.split('#')[0];
    if (!slugOk(slug)) return;
    var windowMs = Number(root.getAttribute('data-view-window')) || VIEW_FALLBACK_MS;
    var data = {};
    try {
      var raw = document.getElementById('engage-post');
      data = raw ? JSON.parse(raw.textContent || '{}') : {};
    } catch (e) { data = {}; }
    var likeGen = 0;
    var markGen = 0;

    function paint() {
      var likeOn = !!state.likes[slug];
      var markOn = !!state.bookmarks[slug];
      var like = root.querySelector('[data-act="like"]');
      var mark = root.querySelector('[data-act="bookmark"]');
      if (like) { like.classList.toggle('on', likeOn); like.setAttribute('aria-pressed', likeOn ? 'true' : 'false'); }
      if (mark) { mark.classList.toggle('on', markOn); mark.setAttribute('aria-pressed', markOn ? 'true' : 'false'); }
    }
    function show(j) {
      if (!j || typeof j.views !== 'number') return;
      ['views', 'likes', 'bookmarks'].forEach(function (k) {
        var el = root.querySelector('[data-n="' + k + '"]');
        if (!el || typeof j[k] !== 'number') return;
        el.textContent = String(j[k]);
        el.hidden = false;
      });
      var views = root.querySelector('[data-stat="views"]');
      if (views) views.hidden = false;
    }
    function title() {
      var t = data.title || {};
      return t[lang()] || t['zh-Hant'] || t.en || '';
    }
    function setStatus(cls) {
      var el = root.querySelector('.share-status');
      if (!el) return;
      el.textContent = textIn(root.querySelector('.' + cls));
      el.hidden = !el.textContent;
    }
    function fillLinks() {
      var page = url;
      var text = title();
      var pairs = {
        line: 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(page),
        facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(page),
        email: 'mailto:?subject=' + encodeURIComponent(text) + '&body=' + encodeURIComponent(page),
        gmail: 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(text) + '&body=' + encodeURIComponent(page),
        whatsapp: 'https://wa.me/?text=' + encodeURIComponent(text ? text + '\n' + page : page)
      };
      Object.keys(pairs).forEach(function (k) {
        var a = root.querySelector('a[data-share="' + k + '"]');
        if (a) a.setAttribute('href', pairs[k]);
      });
    }
    function copyText(value) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(value).then(function () { return true; }, function () { return fallbackCopy(value); });
      }
      return Promise.resolve(fallbackCopy(value));
    }
    function fallbackCopy(value) {
      var ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    function drawQR(value) {
      if (typeof qrcode !== 'function') return null;
      try {
        var qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();
        var n = qr.getModuleCount();
        var cell = 6;
        var margin = 4;
        var canvas = document.createElement('canvas');
        var size = (n + margin * 2) * cell;
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#111111';
        for (var r = 0; r < n; r++) {
          for (var c = 0; c < n; c++) {
            if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
          }
        }
        return canvas;
      } catch (e) { return null; }
    }
    var pop = root.querySelector('.qr-pop');
    function closeQR() {
      if (!pop) return;
      pop.hidden = true;
      if (pop._focus && pop._focus.focus) pop._focus.focus();
    }
    function openQR(mode) {
      if (!pop) return;
      var canvas = drawQR(url);
      if (!canvas) { setStatus('msg-qrfail'); return; }
      var box = pop.querySelector('.qr-canvas');
      box.textContent = '';
      box.appendChild(canvas);
      pop._canvas = canvas;
      var wechat = pop.querySelector('.qr-hint-wechat');
      var link = pop.querySelector('.qr-hint-link');
      if (wechat) wechat.hidden = mode !== 'wechat';
      if (link) link.hidden = mode === 'wechat';
      pop._focus = document.activeElement;
      pop.hidden = false;
      var close = pop.querySelector('[data-qr-close]');
      if (close) close.focus();
    }
    function pushLike(on) {
      var gen = ++likeGen;
      return call('POST', '/like', { slug: slug, vid: vid(state), on: on }).then(function (j) {
        if (j && gen === likeGen) {
          if (on) state.likeSync[slug] = 1;
          else delete state.likeSync[slug];
          save(state);
        }
        return j;
      });
    }
    function pushMark(on) {
      var gen = ++markGen;
      return call('POST', '/bookmark', { slug: slug, vid: vid(state), on: on }).then(function (j) {
        if (j && gen === markGen) {
          if (on) state.bookmarkSync[slug] = 1;
          else delete state.bookmarkSync[slug];
          save(state);
        }
        return j;
      });
    }
    function remember(on) {
      if (on) {
        state.bookmarks[slug] = {
          slug: slug,
          url: url,
          date: data.date || '',
          title: data.title || {},
          savedAt: Date.now()
        };
      } else delete state.bookmarks[slug];
      save(state);
    }

    paint();
    fillLinks();
    if (window.MutationObserver) {
      new MutationObserver(fillLinks).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
    }
    var native = root.querySelector('[data-share="native"]');
    var mobile = window.matchMedia ? window.matchMedia('(max-width: 700px)').matches : window.innerWidth <= 700;
    if (native && mobile && navigator.share) native.hidden = false;

    var likeBtn = root.querySelector('[data-act="like"]');
    if (likeBtn) likeBtn.addEventListener('click', function () {
      var on = !state.likes[slug];
      if (on) state.likes[slug] = 1;
      else delete state.likes[slug];
      save(state);
      paint();
      pushLike(on).then(show);
    });
    var markBtn = root.querySelector('[data-act="bookmark"]');
    if (markBtn) markBtn.addEventListener('click', function () {
      var on = !state.bookmarks[slug];
      remember(on);
      paint();
      pushMark(on).then(show);
    });

    root.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-share]');
      if (!btn || btn.tagName === 'A') return;
      var kind = btn.getAttribute('data-share');
      if (kind === 'native') {
        var shareText = title();
        navigator.share({ title: shareText, text: shareText, url: url }).catch(function () {});
        return;
      }
      if (kind === 'wechat') { openQR('wechat'); return; }
      if (kind === 'qr') { openQR('qr'); return; }
      if (kind === 'copy' || kind === 'dcard' || kind === 'discord') {
        if (kind === 'dcard') window.open('https://www.dcard.tw/', '_blank', 'noopener,noreferrer');
        copyText(url).then(function (ok) {
          if (ok) setStatus(kind === 'dcard' ? 'msg-dcard' : kind === 'discord' ? 'msg-discord' : 'msg-copied');
        });
      }
    });
    if (pop) {
      pop.addEventListener('click', function (e) { if (e.target === pop) closeQR(); });
      var dl = pop.querySelector('[data-qr-download]');
      if (dl) dl.addEventListener('click', function () {
        var canvas = pop._canvas;
        if (!canvas || !canvas.toBlob) return;
        canvas.toBlob(function (blob) {
          if (!blob) return;
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = slug + '-qr.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        }, 'image/png');
      });
      var closeBtn = pop.querySelector('[data-qr-close]');
      if (closeBtn) closeBtn.addEventListener('click', closeQR);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && pop && !pop.hidden) closeQR();
      });
    }

    var chain = Promise.resolve(null);
    if (!state.views[slug] || Date.now() - Number(state.views[slug]) > windowMs) {
      chain = chain.then(function () {
        return call('POST', '/view', { slug: slug, vid: vid(state), src: visitSrc() }).then(function (j) {
          if (j) { state.views[slug] = Date.now(); save(state); }
          return j;
        });
      });
    }
    if (!!state.likes[slug] !== !!state.likeSync[slug]) {
      chain = chain.then(function (prev) {
        return pushLike(!!state.likes[slug]).then(function (j) { return j || prev; });
      });
    }
    if (!!state.bookmarks[slug] !== !!state.bookmarkSync[slug]) {
      chain = chain.then(function (prev) {
        return pushMark(!!state.bookmarks[slug]).then(function (j) { return j || prev; });
      });
    }
    chain.then(function (j) {
      if (j && typeof j.views === 'number') { show(j); return; }
      call('GET', '/counts?slug=' + encodeURIComponent(slug)).then(show);
    });
  }

  function titleSpans(title) {
    var wrap = document.createElement('span');
    var langs = ['zh-Hant', 'zh-Hans', 'en'];
    var map = title || {};
    var fallback = map['zh-Hant'] || map['zh-Hans'] || map.en || '';
    var texts = langs.map(function (l) { return map[l] || fallback; });
    if (!fallback) return wrap;
    if (texts.every(function (t) { return t === texts[0]; })) { wrap.textContent = texts[0]; return wrap; }
    langs.forEach(function (l, i) {
      if (!texts[i]) return;
      var s = document.createElement('span');
      s.setAttribute('data-l', l);
      s.setAttribute('lang', l);
      s.textContent = texts[i];
      wrap.appendChild(s);
    });
    return wrap;
  }
  function renderSaved() {
    var panel = document.querySelector('.saved-panel');
    if (!panel) return;
    var state = ensure(load());
    var ul = panel.querySelector('.saved-list');
    var empty = panel.querySelector('.saved-empty');
    var label = panel.querySelector('.saved-remove-label');
    if (!ul) return;
    var items = Object.keys(state.bookmarks).map(function (k) { return state.bookmarks[k]; }).filter(function (item) {
      return item && slugOk(item.slug);
    });
    items.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    ul.textContent = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'post-card saved-card';
      var a = document.createElement('a');
      a.href = item.slug + '/';
      var meta = document.createElement('span');
      meta.className = 'pc-text';
      if (item.date) {
        var time = document.createElement('time');
        time.className = 'pc-meta';
        time.dateTime = item.date;
        time.textContent = item.date;
        meta.appendChild(time);
      }
      var strong = document.createElement('strong');
      strong.className = 'pc-title';
      strong.appendChild(titleSpans(item.title));
      meta.appendChild(strong);
      a.appendChild(meta);
      li.appendChild(a);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'saved-remove';
      if (label) {
        for (var n = label.firstChild; n; n = n.nextSibling) btn.appendChild(n.cloneNode(true));
      }
      btn.addEventListener('click', function () {
        delete state.bookmarks[item.slug];
        save(state);
        renderSaved();
        call('POST', '/bookmark', { slug: item.slug, vid: vid(state), on: false }).then(function (j) {
          if (!j) return;
          delete state.bookmarkSync[item.slug];
          save(state);
        });
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    if (empty) empty.hidden = items.length > 0;
  }
  function syncSaved() {
    var state = ensure(load());
    var slugs = {};
    Object.keys(state.bookmarks).forEach(function (k) { if (slugOk(k)) slugs[k] = true; });
    Object.keys(state.bookmarkSync).forEach(function (k) { if (slugOk(k)) slugs[k] = true; });
    var list = Object.keys(slugs).slice(0, 30);
    var chain = Promise.resolve();
    list.forEach(function (slug) {
      var on = !!state.bookmarks[slug];
      if (on === !!state.bookmarkSync[slug]) return;
      chain = chain.then(function () {
        return call('POST', '/bookmark', { slug: slug, vid: vid(state), on: on }).then(function (j) {
          if (!j) return;
          if (on) state.bookmarkSync[slug] = 1;
          else delete state.bookmarkSync[slug];
          save(state);
        });
      });
    });
  }

  function bootSubscribe(form) {
    var box = form.closest ? form.closest('.subscribe') : form.parentNode;
    var msg = box.querySelector('.sub-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var email = input ? String(input.value || '').trim() : '';
      if (!email) return;
      call('POST', '/subscribe', { email: email, lang: lang() }).then(function (j) {
        if (!msg) return;
        msg.textContent = textIn(box.querySelector(j ? '.sub-ok' : '.sub-err'));
        msg.hidden = false;
        if (j && input) input.value = '';
      });
    });
  }

  function boot() {
    var post = document.querySelector('.engage[data-slug]');
    if (post) bootPost(post);
    if (document.querySelector('.saved-panel')) {
      window.yctRenderSaved = renderSaved;
      syncSaved();
      if (location.hash === '#saved') renderSaved();
    }
    var forms = document.querySelectorAll('form.subscribe-form');
    for (var i = 0; i < forms.length; i++) bootSubscribe(forms[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
