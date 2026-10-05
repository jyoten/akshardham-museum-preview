// 10,000-year timeline: era picker, earlier/later buttons, #era-NN deep links.
(function () {
  var ERAS = JSON.parse(document.getElementById('eras-data').textContent);
  var cardTpl = document.getElementById('era-card').innerHTML;
  var buttons = document.querySelectorAll('.era-btn');
  var PLACEHOLDER = /\[(?:[A-Z#][A-Z0-9#,&'’.\- ]*|Related exhibit)\]/g;

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
    var e = ERAS[i];
    document.getElementById('era-meta').innerHTML = 'Era ' + e.num + ' of ' + ERAS.length + ' · ' + text(e.dates);
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
    buttons.forEach(function (b, j) { b.setAttribute('aria-pressed', String(j === i)); });
    // keep the chosen era visible in the picker (it scrolls sideways on small screens)
    var strip = buttons[i].closest('[style*="overflow-x:auto"]');
    if (strip) {
      var b = buttons[i].getBoundingClientRect(), r = strip.getBoundingClientRect();
      strip.scrollTo({ left: strip.scrollLeft + b.left - r.left - (r.width - b.width) / 2, behavior: scroll ? 'smooth' : 'auto' });
    }
    current = i;
  }

  var current = fromHash();
  buttons.forEach(function (b, j) {
    b.addEventListener('click', function () { history.replaceState(null, '', '#era-' + ERAS[j].num); show(j, true); });
  });
  document.getElementById('era-prev').addEventListener('click', function () { buttons[Math.max(0, current - 1)].click(); });
  document.getElementById('era-next').addEventListener('click', function () { buttons[Math.min(ERAS.length - 1, current + 1)].click(); });
  window.addEventListener('hashchange', function () { show(fromHash(), true); });
  show(current, false);
  if (location.hash) document.getElementById('era-h').scrollIntoView();
})();
