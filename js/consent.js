// Cookie consent: a banner on first visit, a settings dialog, and a "Cookie settings" link in the footer.
// The choice is kept in localStorage with a policy VERSION; bump it when the cookie policy changes to ask again.
// Optional scripts wait for consent:
//   <script type="text/plain" data-consent="analytics" src="https://…"></script>
// They are switched on once that category is allowed. In code: window.cookieConsent.allows('analytics'),
// or listen for the 'cookieconsent' event on document.
(function () {
  var KEY = 'museum-consent';
  var VERSION = 1;
  var CATEGORIES = [
    { key: 'necessary', label: 'Essential', fixed: true, text: 'Needed for the site to work, such as remembering this choice. Always on.' },
    { key: 'analytics', label: 'Analytics', text: 'Count visits and see which pages are useful, so we can improve the site.' },
    { key: 'marketing', label: 'Marketing', text: 'Measure campaigns and show relevant museum news on other sites.' }
  ];

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      return c && c.version === VERSION ? c : null;
    } catch (e) { return null; }
  }
  function save(choice) {
    choice.necessary = true;
    choice.version = VERSION;
    choice.date = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch (e) { /* private mode: ask again next visit */ }
    state = choice;
    activate();
    document.dispatchEvent(new CustomEvent('cookieconsent', { detail: choice }));
  }
  // Turn on any <script type="text/plain" data-consent="…"> whose category is now allowed.
  function activate() {
    document.querySelectorAll('script[type="text/plain"][data-consent]').forEach(function (old) {
      if (!window.cookieConsent.allows(old.dataset.consent)) return;
      var s = document.createElement('script');
      Array.prototype.forEach.call(old.attributes, function (a) { if (a.name !== 'type') s.setAttribute(a.name, a.value); });
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  }
  var state = read();
  window.cookieConsent = {
    allows: function (key) { return key === 'necessary' || !!(state && state[key]); },
    get: function () { return state; },
    open: function () { openDialog(); }
  };

  var lastFocus = null;
  var banner = document.createElement('section');
  banner.className = 'consent';
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.innerHTML =
    '<div class="consent-inner">' +
    '<p class="consent-text"><strong>Cookies on this site.</strong> We use necessary cookies to make the site work.<span class="consent-more"> With your permission we’d also like to use analytics cookies to understand how it’s used.</span> <a href="#" class="todo-link" data-todo="Privacy page (no page yet)">Privacy policy</a></p>' +
    '<div class="consent-actions">' +
    '<button type="button" class="c-btn c-primary" data-act="all" aria-label="Accept all cookies">Accept<span class="consent-more"> all</span></button>' +
    '<button type="button" class="c-btn c-secondary" data-act="none" aria-label="Reject non-essential cookies">Reject<span class="consent-more"> non-essential</span></button>' +
    '<button type="button" class="c-link" data-act="manage" aria-label="Manage cookie settings">Manage<span class="consent-more"> settings</span></button>' +
    '</div></div>';

  var dialog = document.createElement('div');
  dialog.className = 'consent-dialog';
  dialog.hidden = true;
  dialog.innerHTML =
    '<div class="consent-backdrop" data-act="close"></div>' +
    '<div class="consent-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title">' +
    '<h2 id="consent-title">Cookie settings</h2>' +
    '<p>Choose which cookies we can use. Essential ones are always on. You can change this any time from “Cookie settings” at the bottom of every page.</p>' +
    '<ul class="consent-list">' + CATEGORIES.map(function (c) {
      return '<li><label class="consent-row"><span><strong>' + c.label + '</strong><small>' + c.text + '</small></span>' +
        '<input type="checkbox" role="switch" data-key="' + c.key + '"' + (c.fixed ? ' checked disabled' : '') + '></label></li>';
    }).join('') + '</ul>' +
    '<div class="consent-actions">' +
    '<button type="button" class="c-btn c-primary" data-act="save">Save choices</button>' +
    '<button type="button" class="c-btn c-secondary" data-act="all">Accept all</button>' +
    '<button type="button" class="c-btn c-secondary" data-act="none">Reject non-essential</button>' +
    '</div></div>';

  // keep the end of the page reachable while the banner is showing
  function pad() { document.body.style.paddingBottom = banner.isConnected ? banner.offsetHeight + 'px' : ''; }
  function closeBanner() { banner.remove(); pad(); }
  function openDialog() {
    lastFocus = document.activeElement;
    dialog.querySelectorAll('input[data-key]').forEach(function (i) {
      if (!i.disabled) i.checked = window.cookieConsent.allows(i.dataset.key);
    });
    dialog.hidden = false;
    document.documentElement.classList.add('consent-open');
    dialog.querySelector('input:not([disabled])').focus();
  }
  function closeDialog() {
    dialog.hidden = true;
    document.documentElement.classList.remove('consent-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function decide(act) {
    if (act === 'manage') return openDialog();
    if (act === 'close') return closeDialog();
    var choice = {};
    CATEGORIES.forEach(function (c) {
      if (c.fixed) return;
      choice[c.key] = act === 'all' ? true : act === 'none' ? false : dialog.querySelector('input[data-key="' + c.key + '"]').checked;
    });
    save(choice);
    closeBanner();
    if (!dialog.hidden) closeDialog();
  }
  [banner, dialog].forEach(function (el) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b) decide(b.dataset.act);
    });
  });
  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') return closeDialog();
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(dialog.querySelectorAll('input:not([disabled]), button'), function (x) { return x.offsetParent; });
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  document.body.appendChild(dialog);
  if (state) activate();
  else { document.body.appendChild(banner); pad(); window.addEventListener('resize', pad); }

  // "Cookie settings" in the footer reopens the choices.
  var legal = document.querySelector('nav[aria-label="Legal"]');
  if (legal) {
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'consent-footer-link';
    link.textContent = 'Cookie settings';
    link.addEventListener('click', openDialog);
    var privacy = Array.prototype.find.call(legal.querySelectorAll('a'), function (a) { return a.textContent === 'Privacy'; });
    legal.insertBefore(link, privacy ? privacy.nextSibling : legal.firstChild);
  }
})();
