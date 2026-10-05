// 10,000-year timeline: era picker, earlier/later buttons, arrow keys, swipe, #era-NN deep links.
(function () {
  var ERAS = JSON.parse(document.getElementById('eras-data').textContent);
  var cardTpl = document.getElementById('era-card').innerHTML;
  var buttons = document.querySelectorAll('.era-btn');
  var PLACEHOLDER = /\[(?:[A-Z#][A-Z0-9#,&'’.\- ]*|Related exhibit)\]/g;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var panel = document.getElementById('era-h').closest('section');
  var prevBtn = document.getElementById('era-prev'), nextBtn = document.getElementById('era-next');

  // progress line under the era picker
  var progress = document.createElement('div');
  progress.className = 'era-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.innerHTML = '<span></span>';
  document.querySelector('section[data-l="Eras"]').appendChild(progress);

  var hint = document.createElement('p');
  hint.className = 'swipe-hint';
  hint.textContent = tx('js_swipe_eras');
  prevBtn.parentNode.after(hint);

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function text(s) { return esc(s).replace(PLACEHOLDER, '<mark class="todo">$&</mark>'); }

  function fromHash() {
    var m = /^#era-(\d\d)$/.exec(location.hash);
    var i = m ? parseInt(m[1], 10) - 1 : 4;
    return i >= 0 && i < ERAS.length ? i : 4;
  }

  function show(i, scroll) {
    if (!reduce && scroll && i !== current) {
      var cols = Array.prototype.slice.call(panel.firstElementChild.children);
      panel.style.setProperty('--dir', i > current ? 1 : -1);
      cols.forEach(function (c) { c.classList.remove('era-swap-in'); c.classList.add('era-swap-out'); });
      clearTimeout(show.t);
      show.t = setTimeout(function () {
        render(i);
        cols.forEach(function (c) { c.classList.remove('era-swap-out'); void c.offsetWidth; c.classList.add('era-swap-in'); });
      }, 200);
      current = i;
      mark(i, scroll);
      return;
    }
    render(i);
    mark(i, scroll);
    current = i;
  }

  function render(i) {
    var e = ERAS[i];
    document.getElementById('era-meta').innerHTML = tx('js_era_of', { num: e.num, total: ERAS.length }) + ' · ' + text(e.dates);
    document.getElementById('era-name').textContent = e.name;
    document.getElementById('era-summary').innerHTML = text(e.summary);
    document.getElementById('era-keys').innerHTML = text(e.keys);
    document.getElementById('era-see').innerHTML = e.see.map(function (s) {
      var img = s.hasImg ? '<img src="' + esc(s.img) + '" alt="' + esc(s.title) + '" style="width:100%;height:100%;object-fit:cover;display:block">' : '';
      return cardTpl
        .replace('{{IMG}}', img)
        .replace('{{s.href}}', esc(s.href))
        .replace('{{s.kind}}', text(s.kind))
        .replace('{{s.title}}', text(s.title))
        .replace('{{s.where}}', text(s.where));
    }).join('');
  }

  function mark(i, scroll) {
    buttons.forEach(function (b, j) { b.setAttribute('aria-pressed', String(j === i)); });
    progress.firstChild.style.width = ((i + 1) / ERAS.length * 100) + '%';
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === ERAS.length - 1;
    prevBtn.style.opacity = i === 0 ? '.35' : '';
    nextBtn.style.opacity = i === ERAS.length - 1 ? '.35' : '';
    // keep the chosen era visible in the picker (it scrolls sideways on small screens)
    var strip = buttons[i].closest('[style*="overflow-x:auto"]');
    if (strip) {
      var b = buttons[i].getBoundingClientRect(), r = strip.getBoundingClientRect();
      strip.scrollTo({ left: strip.scrollLeft + b.left - r.left - (r.width - b.width) / 2, behavior: scroll ? 'smooth' : 'auto' });
    }
  }

  function go(step) {
    var j = Math.max(0, Math.min(ERAS.length - 1, current + step));
    if (j !== current) buttons[j].click();
  }

  var current = fromHash();
  buttons.forEach(function (b, j) {
    b.addEventListener('click', function () { history.replaceState(null, '', '#era-' + ERAS[j].num); show(j, true); });
  });
  prevBtn.addEventListener('click', function () { go(-1); });
  nextBtn.addEventListener('click', function () { go(1); });
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.metaKey || e.ctrlKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  var touch = null;
  panel.addEventListener('touchstart', function (e) { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  panel.addEventListener('touchend', function (e) {
    if (!touch) return;
    var dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  }, { passive: true });
  window.addEventListener('hashchange', function () { show(fromHash(), true); });
  show(current, false);
  if (location.hash) document.getElementById('era-h').scrollIntoView();
})();
