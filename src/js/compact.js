// Iteration 3: less vertical scrolling. Swipe rows on phones and tabbed secondary content.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Card groups become swipe rows on phones (CSS does the layout) ---------- */
  var rows = [
    ['section[aria-labelledby="exp-h"] .card, section[aria-label="The four galleries"] .card', false],
    ['section[aria-labelledby="learn-h"] .card, section[aria-label="Ways to learn"] .card', false],
    ['section[aria-labelledby="voices-h"] figure', false],
    ['section[aria-labelledby="near-h"] .card', false],
    ['section[aria-labelledby="it-h"] article', false],
    ['#membership article', false]
  ];
  rows.forEach(function (r) {
    var first = $(r[0]);
    if (!first) return;
    var row = first.parentElement;
    var items = Array.prototype.slice.call(row.children);
    if (items.length < 2) return;
    row.classList.add('snap-row');
    if (r[1]) row.classList.add('on-dark');
    row.setAttribute('tabindex', '0'); // keyboard users can scroll the row with arrow keys
    row.setAttribute('aria-label', (row.closest('section').querySelector('h2') || {}).textContent + ' (swipe for more)');
    var dots = document.createElement('div');
    dots.className = 'snap-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = items.map(function (_, i) { return '<span' + (i ? '' : ' class="on"') + '></span>'; }).join('');
    row.after(dots);
    var update = function () {
      var i = Math.round(row.scrollLeft / (items[0].getBoundingClientRect().width + 14));
      $$('span', dots).forEach(function (d, j) { d.classList.toggle('on', j === Math.min(i, items.length - 1)); });
    };
    row.addEventListener('scroll', update, { passive: true });
  });
  // dots only make sense while the row actually scrolls sideways
  var phone = window.matchMedia('(max-width: 640px)');
  var toggleDots = function () { $$('.snap-dots').forEach(function (d) { d.style.display = phone.matches ? '' : 'none'; }); };
  if (phone.addEventListener) phone.addEventListener('change', toggleDots);
  toggleDots();

  /* ---------- Horizontal rows with arrow buttons (Support: Yajman levels) ---------- */
  $$('.yaj-row').forEach(function (row) {
    var section = row.closest('section');
    var prev = $('.row-prev', section), next = $('.row-next', section);
    var cards = Array.prototype.slice.call(row.children);
    var dots = document.createElement('div');
    dots.className = 'yaj-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = cards.map(function () { return '<span></span>'; }).join('');
    row.after(dots);
    var step = function () { return cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(row).columnGap || 20); };
    var update = function () {
      var max = row.scrollWidth - row.clientWidth;
      if (prev) prev.disabled = row.scrollLeft < 4;
      if (next) next.disabled = row.scrollLeft > max - 4;
      var i = Math.round(row.scrollLeft / step());
      $$('span', dots).forEach(function (d, j) { d.classList.toggle('on', j === Math.min(i, cards.length - 1)); });
    };
    if (prev) prev.addEventListener('click', function () { row.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }); });
    if (next) next.addEventListener('click', function () { row.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }); });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        row.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: reduce ? 'auto' : 'smooth' });
      }
    });
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  /* ---------- Visit: First visit / Accessibility & getting here / FAQ as tabs ---------- */
  var panels = [
    ['section[aria-labelledby="first-h"]', 'First visit'],
    ['section[aria-labelledby="acc-h"]', 'Accessibility & getting here'],
    ['section[aria-labelledby="faq-h"]', 'Questions']
  ].map(function (p) { return { el: $(p[0]), label: p[1] }; }).filter(function (p) { return p.el; });
  if (panels.length === 3) {
    var bar = document.createElement('div');
    bar.className = 'tabbar';
    bar.innerHTML = '<div class="tabbar-title"><p id="gtk-h">Good to know</p></div><div role="tablist" aria-labelledby="gtk-h"></div>';
    panels[0].el.parentNode.insertBefore(bar, panels[0].el);
    var list = $('[role="tablist"]', bar);
    var tabs = panels.map(function (p, i) {
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tab';
      t.id = 'gtk-tab-' + i;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', 'gtk-panel-' + i);
      t.textContent = p.label;
      list.appendChild(t);
      p.el.id = p.el.id || 'gtk-panel-' + i;
      t.setAttribute('aria-controls', p.el.id);
      p.el.setAttribute('role', 'tabpanel');
      p.el.setAttribute('aria-labelledby', t.id);
      return t;
    });
    var show = function (i, scroll) {
      panels.forEach(function (p, j) {
        p.el.hidden = i !== j;
        tabs[j].setAttribute('aria-selected', String(i === j));
        tabs[j].tabIndex = i === j ? 0 : -1;
      });
      if (!reduce) { panels[i].el.classList.remove('panel-in'); void panels[i].el.offsetWidth; panels[i].el.classList.add('panel-in'); }
      if (scroll) bar.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i, false); });
      t.addEventListener('keydown', function (e) {
        var k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (k === undefined) return;
        e.preventDefault();
        k = (k + tabs.length) % tabs.length;
        tabs[k].focus();
        show(k, false);
      });
    });
    // #access and #getting-here (linked from other pages) open the right tab
    var fromHash = function () {
      if (!location.hash) return -1;
      var target = document.getElementById(location.hash.slice(1));
      return target ? panels.findIndex(function (p) { return p.el.contains(target); }) : -1;
    };
    var start = fromHash();
    show(start < 0 ? 0 : start, false);
    if (start >= 0) setTimeout(function () { document.getElementById(location.hash.slice(1)).scrollIntoView(); }, 0);
    window.addEventListener('hashchange', function () { var i = fromHash(); if (i >= 0) show(i, true); });
  }
})();
