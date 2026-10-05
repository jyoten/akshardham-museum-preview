// Opening hours and notices, read at runtime from /data/site-status.json (edited in /admin).
// Fills the "Open today" spots and shows a notice bar at the top of the page while a notice is live.
(function () {
  var L = window.SITE_LANG || 'en';
  var T = window.I18N || {};
  var t = function (k, vars) {
    var s = T[k] || k;
    for (var v in vars || {}) s = s.replace('{' + v + '}', vars[v]);
    return s;
  };
  var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var mins = function (hhmm) { var p = String(hhmm || '').split(':'); return p.length === 2 ? +p[0] * 60 + +p[1] : null; };
  var fmt = function (hhmm) {
    var m = mins(hhmm); if (m === null) return '';
    var h = Math.floor(m / 60), mm = m % 60;
    return (h % 12 || 12) + (mm ? ':' + String(mm).padStart(2, '0') : '') + (h < 12 ? ' AM' : ' PM');
  };
  var local = function (o, field) { return (o[field + '_' + L] || '').trim() || (o[field + '_en'] || '').trim(); };
  var href = function (u) {
    if (!/^\//.test(u)) return u;
    var local = L !== 'en' && !/^\/(css|js|fonts|images|data|admin)/.test(u) ? '/' + L + u : u;
    return (window.SITE_BASE || '') + local;
  };

  // "now" in the museum's time zone, whatever the visitor's own time zone is
  function museumNow(tz) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, day: DAYS.indexOf(p.weekday.toLowerCase()), mins: (+p.hour % 24) * 60 + +p.minute,
             stamp: p.year + '-' + p.month + '-' + p.day + 'T' + String(+p.hour % 24).padStart(2, '0') + ':' + p.minute };
  }
  function dateAdd(ymd, n) {
    var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function ruleFor(s, ymd, day) {
    var special = (s.special_dates || []).filter(function (x) { return x.date === ymd; })[0];
    if (special) return { closed: !!special.closed, opens: special.opens, closes: special.closes, note: local(special, 'note'), special: true };
    var r = (s.regular_hours || {})[DAYS[day]] || { closed: true };
    return { closed: !!r.closed || !r.opens, opens: r.opens, closes: r.closes, note: '' };
  }

  function render(s) {
    var now = museumNow(s.timezone || 'America/New_York');
    var today = ruleFor(s, now.date, now.day);
    var nextOpen = function () {
      for (var i = 1; i <= 14; i++) {
        var r = ruleFor(s, dateAdd(now.date, i), (now.day + i) % 7);
        if (!r.closed) return t('opens_at', { day: i === 1 ? t('tomorrow') : t('day_' + (now.day + i) % 7), time: fmt(r.opens) });
      }
      return '';
    };
    var state, label, value;
    if (today.closed) { state = 'closed'; label = t('closed_today'); value = today.note || nextOpen(); }
    else if (now.mins < mins(today.opens)) { state = 'later'; label = t('open_today'); value = t('hours_range', { open: fmt(today.opens), close: fmt(today.closes) }); }
    else if (now.mins >= mins(today.closes)) { state = 'closed'; label = t('closed_now'); value = nextOpen(); }
    else if (mins(today.closes) - now.mins <= 60) { state = 'soon'; label = t('closing_soon'); value = t('open_until', { time: fmt(today.closes) }); }
    else { state = 'open'; label = t('open_now'); value = t('until', { time: fmt(today.closes) }); }
    if (today.note && !today.closed) value += ' · ' + today.note;
    var wrap = function (v) { return s.sample_hours ? '<mark class="todo" title="Sample hours: set the real ones in /admin">' + esc(v) + '</mark>' : esc(v); };

    var q = function (k) { return document.querySelector('[data-status="' + k + '"]'); };
    if (q('today-label')) q('today-label').textContent = label;
    if (q('today')) q('today').innerHTML = wrap(value);
    if (q('dot')) q('dot').style.background = { open: '#7FBF7A', later: '#7FBF7A', soon: 'var(--gold)', closed: '#8A7F75' }[state];
    if (q('footer')) q('footer').innerHTML = esc(label) + ' · ' + wrap(value);

    // Visit page: the regular week, grouped ("Tuesday–Thursday 9:30 AM – 6 PM"), and the closed days
    var vh = q('visit-hours');
    if (vh) {
      var order = [2, 3, 4, 5, 6, 0, 1], groups = [], closed = [];
      order.forEach(function (d) {
        var r = (s.regular_hours || {})[DAYS[d]] || { closed: true };
        if (r.closed || !r.opens) { closed.push(t('day_' + d)); return; }
        var span = fmt(r.opens) + ' – ' + fmt(r.closes), g = groups[groups.length - 1];
        if (g && g.span === span && g.last === order[order.indexOf(d) - 1]) { g.to = d; g.last = d; }
        else groups.push({ from: d, to: d, last: d, span: span });
      });
      var lines = groups.length === 1 && !closed.length
        ? [t('every_day') + ' ' + groups[0].span]
        : groups.map(function (g) { return (g.from === g.to ? t('day_' + g.from) : t('day_' + g.from) + '–' + t('day_' + g.to)) + ' ' + g.span; });
      vh.innerHTML = lines.map(wrap).join('<br>') + (closed.length ? '<br><span style="font-size:14px;color:var(--stone)">' + wrap(t('closed_on', { days: closed.join(', ') })) + '</span>' : '');
    }

    // Notices: active, within their start/end window, not dismissed by this visitor
    var dismissed = [];
    try { dismissed = JSON.parse(localStorage.getItem('museum-notices-dismissed') || '[]'); } catch (e) {}
    var live = (s.notices || []).filter(function (n) {
      return n.active && (!n.starts || n.starts.slice(0, 16) <= now.stamp) && (!n.ends || n.ends.slice(0, 16) > now.stamp) && local(n, 'message');
    });
    live.forEach(function (n) {
      var key = n.id + ':' + local(n, 'message').length;
      if (dismissed.indexOf(key) !== -1) return;
      var bar = document.createElement('div');
      bar.className = 'notice notice-' + (n.type || 'info');
      bar.setAttribute('role', n.type === 'closure' ? 'alert' : 'status');
      var link = n.link_url && local(n, 'link_label') ? ' <a href="' + esc(href(n.link_url)) + '">' + esc(local(n, 'link_label')) + '</a>' : '';
      bar.innerHTML = '<div class="notice-inner"><p><strong>' + esc(t('notice_label_' + (n.type || 'info'))) + '</strong> ' + esc(local(n, 'message')) + link + '</p>' +
        '<button type="button" class="notice-close" aria-label="' + esc(t('notice_dismiss')) + '">×</button></div>';
      bar.querySelector('.notice-close').addEventListener('click', function () {
        dismissed.push(key);
        try { localStorage.setItem('museum-notices-dismissed', JSON.stringify(dismissed)); } catch (e) {}
        bar.remove();
        document.body.classList.toggle('has-notice', !!document.querySelector('.notice'));
        layout();
      });
      document.body.insertBefore(bar, document.body.firstChild);
    });
    document.body.classList.toggle('has-notice', !!document.querySelector('.notice'));
    layout();
  }
  // the home page's header floats over the hero: keep it below any notice
  function layout() {
    var h = 0;
    document.querySelectorAll('.notice').forEach(function (n) { h += n.offsetHeight; });
    document.documentElement.style.setProperty('--notice-h', h + 'px');
  }
  window.addEventListener('resize', layout);

  fetch((window.SITE_BASE || '') + '/data/site-status.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () { /* keep the page's placeholders */ });
})();
