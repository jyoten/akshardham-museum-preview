// Shared behaviour: mobile menu and the demo-only forms.
(function () {
  var header = document.querySelector('header');
  var button = header && header.querySelector('button[aria-label="Open menu"]');
  if (header && button) {
    var menu = document.createElement('div');
    menu.className = 'mobile-menu';
    menu.id = 'mobile-menu';
    var main = header.querySelector('nav[aria-label="Main"]');
    var lang = header.querySelector('nav[aria-label="Language"]');
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
