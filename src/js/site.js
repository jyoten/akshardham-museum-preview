// Shared behaviour: mobile menu and the demo-only forms.
(function () {
  var header = document.querySelector('header');
  var button = header && header.querySelector('button[data-l="Open menu"]');
  if (header && button) {
    var menu = document.createElement('div');
    menu.className = 'mobile-menu';
    menu.id = 'mobile-menu';
    var main = header.querySelector('nav[data-l="Main"]');
    var lang = header.querySelector('nav[data-l="Language"]');
    var tickets = header.querySelector('a[href$="#tickets"]');
    if (main) {
      var nav = main.cloneNode(true);
      nav.className = '';
      nav.removeAttribute('style');
      if (tickets) nav.appendChild(tickets.cloneNode(true)).removeAttribute('style');
      menu.appendChild(nav);
    }
    if (lang) {
      var l = lang.cloneNode(true);
      l.className = 'mobile-lang';
      l.removeAttribute('style');
      menu.appendChild(l);
    }
    header.appendChild(menu);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'mobile-menu');
    button.addEventListener('click', function () {
      var open = header.classList.toggle('menu-open');
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  // The design's forms have no backend yet.
  document.querySelectorAll('form').forEach(function (f) {
    f.addEventListener('submit', function (e) { e.preventDefault(); });
  });
  document.querySelectorAll('a.todo-link').forEach(function (a) {
    a.title = 'Not built yet: ' + a.getAttribute('data-todo');
  });
})();

// Language dropdown in the header (the phone menu shows the three choices in a row instead).
(function () {
  document.querySelectorAll('.mobile-lang .lang-menu').forEach(function (m) { m.removeAttribute('id'); m.hidden = false; });
  var btn = document.querySelector('header .lang:not(.mobile-lang) .lang-btn');
  if (!btn) return;
  var menu = document.getElementById(btn.getAttribute('aria-controls'));
  var links = Array.prototype.slice.call(menu.querySelectorAll('a'));
  var open = function (focusFirst) {
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    if (focusFirst) links[0].focus();
  };
  var close = function (refocus) {
    if (menu.hidden) return;
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  };
  btn.addEventListener('click', function () { menu.hidden ? open(false) : close(false); });
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(true); }
  });
  menu.addEventListener('keydown', function (e) {
    var i = links.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); links[(i + 1) % links.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
    else if (e.key === 'Tab') close(false);
  });
  document.addEventListener('click', function (e) { if (!btn.parentNode.contains(e.target)) close(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) close(true); });
})();
