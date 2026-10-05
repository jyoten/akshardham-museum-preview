// Iteration 2: motion and interaction. Each block only runs when its page's markup exists.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function toast(msg) {
    var old = $('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }

  /* ---------- Header: sticky, shrinks and turns solid after a little scroll ---------- */
  var header = $('header');
  if (header) {
    header.classList.add('hdr');
    if (/position:absolute/.test(header.getAttribute('style') || '')) header.classList.add('hdr-overlay');
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 40);
      document.documentElement.style.setProperty('--header-h', header.getBoundingClientRect().height + 'px');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Scroll reveal ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = $$('section h2, section .card, section article, section figure, section blockquote, section details, section ol > li, section dl > div, section > div > div > p, .tl-row')
      .filter(function (el) {
        return !el.closest('header, footer, [aria-label="Welcome"], .chapter-nav, form, [aria-label="Eras"]') &&
          !(el.parentElement && el.parentElement.closest('.rv'));
      });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    var pending = [];
    targets.forEach(function (el) {
      if (el.closest('.rv')) return;
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already on screen: leave it be
      var sibs = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.classList.contains('rv'); });
      el.style.setProperty('--rv-delay', Math.min(sibs.length, 6) * 0.08 + 's');
      el.classList.add('rv');
      io.observe(el);
      pending.push(el);
    });
    // A fast scroll or an anchor jump can skip right past an element; reveal anything above the fold.
    var sweep = function () {
      pending = pending.filter(function (el) {
        if (el.classList.contains('in')) return false;
        if (el.getBoundingClientRect().top < window.innerHeight) { el.classList.add('in'); io.unobserve(el); return false; }
        return true;
      });
      if (!pending.length) window.removeEventListener('scroll', onSweep);
    };
    var swept = 0;
    var onSweep = function () { if (!swept) swept = requestAnimationFrame(function () { swept = 0; sweep(); }); };
    window.addEventListener('scroll', onSweep, { passive: true });
    window.addEventListener('load', sweep);
  }

  /* ---------- Cards with no .card class (membership tiers, routes) lift on hover ---------- */
  $$('#membership article, section[aria-labelledby="it-h"] article').forEach(function (a) { a.classList.add('lift'); });

  /* ---------- Home ---------- */
  var hero = $('section[aria-label="Welcome"]');
  if (hero) {
    var heroImg = $('img', hero);
    if (heroImg && !reduce) heroImg.classList.add('kenburns');
  }
  // the same slow zoom, gentler, on every interior hero photo
  if (!reduce) {
    $$('.page-hero-img, section[aria-labelledby="tl-title"] > img, section[aria-labelledby="s-h"] > img').forEach(function (img) { img.classList.add('kenburns-soft'); });
  }
  if (hero) {
    var h1 = $('h1', hero);
    if (h1 && !reduce) {
      var words = h1.textContent.trim().split(/\s+/);
      h1.setAttribute('aria-label', h1.textContent.trim());
      h1.innerHTML = words.map(function (w, i) {
        return '<span class="word" aria-hidden="true" style="--i:' + i + '">' + w + '</span>';
      }).join(' ');
    }
  }

  // Stats count up once they're on screen.
  var stats = $('section[aria-label="The museum in numbers"]');
  if (stats) {
    var nums = $$('span', stats).filter(function (s) { return /^[\d,]+\+?$/.test(s.textContent.trim()); });
    nums.forEach(function (s) { s.classList.add('count'); });
    var run = function () {
      nums.forEach(function (s) {
        var txt = s.dataset.final.trim();
        var target = parseInt(txt.replace(/\D/g, ''), 10);
        var suffix = txt.replace(/[\d,]/g, '');
        var start = performance.now(), dur = 1600 + Math.min(target, 1000);
        (function tick(now) {
          var p = Math.min(1, (now - start) / dur);
          var v = Math.round(target * (1 - Math.pow(1 - p, 3)));
          s.textContent = v.toLocaleString('en-US') + (p === 1 ? suffix : '');
          if (p < 1) requestAnimationFrame(tick);
        })(start);
      });
    };
    if (!reduce && 'IntersectionObserver' in window) {
      nums.forEach(function (s) { s.dataset.final = s.textContent; s.textContent = '0'; });
      var so = new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) { so.disconnect(); run(); }
      }, { threshold: 0.4 });
      so.observe(stats);
    }
  }

  // Timeline teaser: rows light up one after another when the list comes into view.
  var rows = $$('.tl-row');
  if (rows.length && !reduce && 'IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (e) {
      if (!e[0].isIntersecting) return;
      ro.disconnect();
      rows.forEach(function (r, i) {
        setTimeout(function () { r.classList.add('lit'); }, 300 + i * 140);
        setTimeout(function () { r.classList.remove('lit'); }, 300 + i * 140 + 700);
      });
    }, { threshold: 0.5 });
    ro.observe(rows[0].parentElement);
  }

  // Idea chips show a one-line meaning.
  var meaning = $('#idea-meaning');
  if (meaning) {
    $$('.idea-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var open = chip.getAttribute('aria-expanded') === 'true';
        $$('.idea-chip').forEach(function (c) { c.setAttribute('aria-expanded', 'false'); });
        if (open) { meaning.hidden = true; return; }
        chip.setAttribute('aria-expanded', 'true');
        meaning.hidden = false;
        meaning.textContent = chip.dataset.meaning;
        meaning.classList.remove('show'); void meaning.offsetWidth; meaning.classList.add('show');
      });
    });
  }

  /* ---------- Ajanta ---------- */
  var lookList = $('h2#ch2') && $('h2#ch2').closest('section').querySelector('ol');
  var heroFig = $('section[aria-labelledby="ex-h"] figure');
  if (lookList && heroFig) {
    var frame = heroFig.querySelector('div');
    frame.classList.add('hotspot-wrap');
    frame.style.overflow = 'visible';
    var spots = [
      { x: 50, y: 10 }, // ribbed ceiling
      { x: 50, y: 71 }, // stupa
      { x: 15, y: 80 }  // pillars
    ];
    var items = $$('li', lookList);
    var note = null;
    var closeNote = function () {
      if (note) note.remove();
      note = null;
      $$('.hotspot', frame).forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    };
    var openSpot = function (i) {
      closeNote();
      var btn = $$('.hotspot', frame)[i];
      btn.setAttribute('aria-expanded', 'true');
      var li = items[i];
      note = document.createElement('div');
      note.className = 'hotspot-note';
      note.setAttribute('role', 'note');
      note.innerHTML = '<strong>' + li.querySelector('h3').textContent + '</strong>' + li.querySelector('p').textContent;
      var s = spots[i];
      note.style.left = Math.min(Math.max(s.x, 30), 70) + '%';
      note.style.transform = 'translateX(-50%)';
      if (s.y > 50) note.style.bottom = (100 - s.y + 6) + '%'; else note.style.top = (s.y + 6) + '%';
      frame.appendChild(note);
    };
    spots.forEach(function (s, i) {
      if (!items[i]) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hotspot';
      b.textContent = i + 1;
      b.style.left = s.x + '%';
      b.style.top = s.y + '%';
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-label', 'Look closely: ' + items[i].querySelector('h3').textContent);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        b.getAttribute('aria-expanded') === 'true' ? closeNote() : openSpot(i);
      });
      frame.appendChild(b);
      // and a way back up from the "Look closely" chapter
      var show = document.createElement('button');
      show.type = 'button';
      show.className = 'show-on-photo';
      show.textContent = 'Show on the photo ↑';
      show.addEventListener('click', function () {
        frame.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        setTimeout(function () { openSpot(i); }, reduce ? 0 : 450);
      });
      items[i].querySelector('div').appendChild(show);
    });
    var hint = document.createElement('span');
    hint.className = 'hotspot-hint';
    hint.textContent = 'Tap the numbers to look closely';
    frame.appendChild(hint);
    document.addEventListener('click', function (e) { if (note && !frame.contains(e.target)) closeNote(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNote(); });
  }

  var article = $('article');
  if (article && $('#ch1')) {
    // reading progress
    var bar = document.createElement('div');
    bar.className = 'read-progress';
    document.body.appendChild(bar);
    var progress = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    };
    window.addEventListener('scroll', progress, { passive: true });
    window.addEventListener('resize', progress);

    // Chapters as chTabs: one chapter at a time, with previous / next at the bottom.
    var chapters = $$('section[aria-labelledby^="ch"]', article);
    var heads = chapters.map(function (c) { return c.querySelector('h2'); });
    var nav = document.createElement('nav');
    nav.className = 'chapter-nav tabbar';
    nav.setAttribute('aria-label', 'Chapters');
    var chList = document.createElement('div');
    chList.setAttribute('role', 'tablist');
    nav.appendChild(chList);
    var chTabs = heads.map(function (h, i) {
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tab';
      t.id = 'tab-' + h.id;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', 'panel-' + h.id);
      t.innerHTML = '<span>0' + (i + 1) + '</span>' + h.textContent;
      chList.appendChild(t);
      return t;
    });
    article.parentNode.insertBefore(nav, article);
    var showChapter = function (i, scroll) {
      chapters.forEach(function (c, j) {
        c.hidden = i !== j;
        chTabs[j].setAttribute('aria-selected', String(i === j));
        chTabs[j].tabIndex = i === j ? 0 : -1;
      });
      chapters[i].classList.remove('panel-in'); void chapters[i].offsetWidth; chapters[i].classList.add('panel-in');
      if (scroll) {
        var top = nav.getBoundingClientRect().top + window.scrollY - (header ? header.getBoundingClientRect().height : 0);
        window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      }
      progress();
    };
    chapters.forEach(function (c, i) {
      c.id = 'panel-' + heads[i].id;
      c.setAttribute('role', 'tabpanel');
      c.setAttribute('aria-labelledby', chTabs[i].id);
      var chSteps = document.createElement('div');
      chSteps.className = 'chapter-steps';
      if (i > 0) chSteps.innerHTML += '<button type="button" class="prev">← ' + heads[i - 1].textContent + '</button>';
      if (i < chapters.length - 1) chSteps.innerHTML += '<button type="button" class="next">Next: ' + heads[i + 1].textContent + ' →</button>';
      c.appendChild(chSteps);
      chSteps.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (b) showChapter(i + (b.classList.contains('next') ? 1 : -1), true);
      });
      chTabs[i].addEventListener('click', function () { showChapter(i, false); });
      chTabs[i].addEventListener('keydown', function (e) {
        var k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: chTabs.length - 1 }[e.key];
        if (k === undefined) return;
        e.preventDefault();
        k = (k + chTabs.length) % chTabs.length;
        chTabs[k].focus();
        showChapter(k, false);
      });
    });
    var fromHash = function () {
      var h = heads.findIndex(function (x) { return '#' + x.id === location.hash; });
      return h < 0 ? 0 : h;
    };
    showChapter(fromHash(), false);
    window.addEventListener('hashchange', function () { showChapter(fromHash(), true); });
  }

  /* ---------- Visit: ticket form, floor tabs, FAQ accordion ---------- */
  var form = $('form[data-demo-form]');
  if (form) {
    var date = $('#visit-date', form);
    var windows = $$('fieldset:nth-of-type(1) button[aria-pressed]', form);
    var pressedStyle = windows.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0].getAttribute('style');
    var plainStyle = windows.filter(function (b) { return b.getAttribute('aria-pressed') === 'false'; })[0].getAttribute('style');
    var chosen = null;
    windows.forEach(function (b) {
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('style', plainStyle);
      b.addEventListener('click', function () {
        chosen = b;
        windows.forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
          x.setAttribute('style', x === b ? pressedStyle : plainStyle);
        });
        refresh();
      });
    });

    var counts = {};
    $$('button[aria-label^="More "]', form).forEach(function (plus) {
      var kind = plus.getAttribute('aria-label').replace(/^More | tickets$/g, '');
      var minus = form.querySelector('button[aria-label="Fewer ' + kind + ' tickets"]');
      var out = plus.previousElementSibling;
      out.setAttribute('aria-live', 'polite');
      counts[kind] = 0;
      var set = function (n) {
        counts[kind] = Math.max(0, Math.min(20, n));
        out.textContent = counts[kind];
        out.classList.remove('bump'); void out.offsetWidth; out.classList.add('bump');
        minus.disabled = counts[kind] === 0;
        minus.style.opacity = counts[kind] === 0 ? '.4' : '';
        refresh();
      };
      plus.addEventListener('click', function () { set(counts[kind] + 1); });
      minus.addEventListener('click', function () { set(counts[kind] - 1); });
      minus.disabled = true;
      minus.style.opacity = '.4';
    });

    var steps = document.createElement('ol');
    steps.className = 'steps';
    steps.setAttribute('aria-label', 'Booking progress');
    steps.innerHTML = '<li>Date</li><li>Entry window</li><li>Visitors</li>';
    form.insertBefore(steps, form.firstChild);

    var submit = $('button[type="submit"]', form);
    var summary = document.createElement('p');
    summary.className = 'ticket-summary';
    summary.setAttribute('aria-live', 'polite');
    submit.parentNode.insertBefore(summary, submit);

    var refresh = function () {
      var people = Object.keys(counts).filter(function (k) { return counts[k] > 0; })
        .map(function (k) { return counts[k] + ' ' + k.toLowerCase() + (counts[k] > 1 ? (k === 'Child' ? 'ren' : 's') : ''); });
      var total = Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0);
      var when = date.value ? new Date(date.value + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null;
      var win = chosen ? chosen.querySelector('span').textContent : null;
      var extras = $$('input[type="checkbox"]', form).filter(function (c) { return c.checked; })
        .map(function (c) { return c.parentNode.textContent.split('·')[0].replace('Add a ', '').trim(); });
      var done = [!!when, !!win, total > 0];
      $$('li', steps).forEach(function (li, i) { li.classList.toggle('done', done[i]); });
      var parts = [];
      parts.push(when ? '<b>' + when + '</b>' : 'Pick a date');
      parts.push(win ? '<b>' + win + '</b>' : 'choose an entry window');
      parts.push(total ? '<b>' + people.join(', ') + '</b>' : 'add visitors');
      summary.innerHTML = parts.join(' · ') + (extras.length ? ' · plus ' + extras.join(' and ') : '');
      var ready = done.every(Boolean);
      submit.setAttribute('aria-disabled', String(!ready));
    };
    date.addEventListener('change', refresh);
    $$('input[type="checkbox"]', form).forEach(function (c) { c.addEventListener('change', refresh); });
    form.addEventListener('submit', function () {
      if (submit.getAttribute('aria-disabled') === 'true') {
        toast('Almost there: choose a date, an entry window and at least one visitor.');
      } else {
        toast('Checkout isn’t connected yet. This is a preview of the booking flow.');
      }
    });
    refresh();
  }

  var tabs = $$('[role="tablist"][aria-label="Floors"] [role="tab"]');
  if (tabs.length) {
    var onStyle = tabs[0].getAttribute('style'), offStyle = tabs[1].getAttribute('style');
    var galleries = tabs[0].parentNode.nextElementSibling;
    var plan = $('[aria-label="Floor plan placeholder"]');
    galleries.classList.add('floor-panel');
    plan.classList.add('floor-panel');
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t, j) {
          t.setAttribute('aria-selected', String(i === j));
          t.setAttribute('style', i === j ? onStyle : offStyle);
          t.tabIndex = i === j ? 0 : -1;
        });
        galleries.innerHTML = '<mark class="todo">[GALLERIES ON FLOOR ' + (i + 1) + ']</mark>';
        plan.innerHTML = '<mark class="todo">[FLOOR ' + (i + 1) + ' PLAN]</mark>';
        plan.setAttribute('aria-label', 'Floor ' + (i + 1) + ' plan placeholder');
        [galleries, plan].forEach(function (el) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); });
      });
      tab.addEventListener('keydown', function (e) {
        var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!k) return;
        var next = tabs[(i + k + tabs.length) % tabs.length];
        next.focus(); next.click();
      });
      tab.tabIndex = i === 0 ? 0 : -1;
    });
  }

  var faqs = $$('section[aria-labelledby="faq-h"] details');
  faqs.forEach(function (d) {
    d.classList.add('acc');
    var summaryEl = d.querySelector('summary');
    var body = document.createElement('div');
    body.className = 'acc-body';
    while (summaryEl.nextSibling) body.appendChild(summaryEl.nextSibling);
    d.appendChild(body);
    summaryEl.addEventListener('click', function (e) {
      e.preventDefault();
      var opening = !d.open;
      faqs.forEach(function (o) { if (o !== d && o.open) collapse(o); });
      opening ? expand(d) : collapse(d);
    });
  });
  function expand(d) {
    var body = d.querySelector('.acc-body');
    d.open = true;
    if (reduce) return;
    var h = body.scrollHeight;
    body.style.height = '0px';
    requestAnimationFrame(function () { body.style.height = h + 'px'; });
    body.addEventListener('transitionend', function te() { body.style.height = ''; body.removeEventListener('transitionend', te); });
  }
  function collapse(d) {
    var body = d.querySelector('.acc-body');
    if (reduce) { d.open = false; return; }
    body.style.height = body.scrollHeight + 'px';
    requestAnimationFrame(function () { body.style.height = '0px'; });
    body.addEventListener('transitionend', function te() { d.open = false; body.style.height = ''; body.removeEventListener('transitionend', te); });
  }

  /* ---------- Support: Legacy Hall search (sample data) and drifting swans ---------- */
  var lhInput = $('#lh-search');
  if (lhInput) {
    var lhResults = $('#lh-results');
    var lhButton = lhInput.parentNode.querySelector('button');
    var data = null;
    var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var SWAN = '<svg width="28" height="25" viewBox="0 0 60 54" aria-hidden="true"><path d="M2 34C8 36 14 40 22 40C30 40 36 38 39 33C42 28 41 23 40 18C38 12 39 5 43 4C47 3 50 5 50 8L55 14L49 11C47 11 46 13 46.5 16C47 21 44 26 45 31C46 36 54 38 52 44C49 50 38 52 26 52C14 52 4 46 2 34Z" fill="currentColor"/></svg>';
    var search = function () {
      var q = lhInput.value.trim().toLowerCase();
      if (!q) { lhResults.innerHTML = ''; return; }
      var go = function () {
        var hits = data.sponsors.filter(function (s) { return (s.name + ' ' + s.city).toLowerCase().indexOf(q) !== -1; }).slice(0, 5);
        var hi = function (s) {
          var i = s.toLowerCase().indexOf(q);
          return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
        };
        lhResults.innerHTML = '<span class="lh-note">Sample data · not real sponsors</span>' + (hits.length ? hits.map(function (s, i) {
          return '<div class="lh-hit" style="animation-delay:' + i * 0.06 + 's">' + SWAN + '<div>' + hi(s.name) + '<small>' + esc(s.city) + ' · Swan ' + s.swan + ' · ' + esc(s.bay) + ' bay</small></div></div>';
        }).join('') : '<div class="lh-hit">No match in the sample list. Try “Sample”.</div>');
      };
      if (data) return go();
      fetch('/data/legacy-hall-sample.json').then(function (r) { return r.json(); }).then(function (d) { data = d; go(); })
        .catch(function () { lhResults.textContent = 'The sponsor list could not be loaded.'; });
    };
    lhInput.addEventListener('input', search);
    lhButton.addEventListener('click', search);
    lhInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });

    var hall = lhInput.closest('section');
    if (hall && !reduce) {
      hall.style.position = 'relative';
      hall.style.overflow = 'hidden';
      var flock = document.createElement('div');
      flock.className = 'swans';
      flock.setAttribute('aria-hidden', 'true');
      [[8, 18, 54, 0], [72, 12, 40, -6], [86, 62, 64, -11], [30, 70, 34, -3], [52, 34, 28, -8]].forEach(function (s) {
        var sw = document.createElement('div');
        sw.className = 'swan';
        sw.style.cssText = 'left:' + s[0] + '%;top:' + s[1] + '%;width:' + s[2] + 'px;color:#F0C9A0;animation-duration:' + (14 + s[2] / 4) + 's;animation-delay:' + s[3] + 's';
        sw.innerHTML = SWAN.replace('width="28" height="25"', 'width="100%" height="100%"');
        flock.appendChild(sw);
      });
      hall.insertBefore(flock, hall.firstChild);
      Array.prototype.forEach.call(hall.children, function (c) { if (c !== flock) c.style.position = 'relative'; });
    }
  }
})();
