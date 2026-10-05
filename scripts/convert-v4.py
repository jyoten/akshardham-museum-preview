#!/usr/bin/env python3
"""One-off: turn the v4 static pages into Eleventy templates + per-language content files.

Run from the v5 folder:  python3 scripts/convert-v4.py
Reads the built v4 HTML pages in this folder, writes src/ (templates, partials, content), and
leaves the original HTML untouched (they are removed from the repo afterwards)."""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

PAGES = [  # file, content key, url path
    ('index.html', 'home', '/'),
    ('ajanta/index.html', 'ajanta', '/ajanta/'),
    ('timeline/index.html', 'timeline', '/timeline/'),
    ('visit/index.html', 'visit', '/visit/'),
    ('support/index.html', 'support', '/support/'),
    ('learn/index.html', 'learn', '/learn/'),
    ('explore/index.html', 'explore', '/explore/'),
    ('explore/lifelike-scenes/index.html', 'g_lifelike', '/explore/lifelike-scenes/'),
    ('explore/legacy-architecture/index.html', 'g_legacy', '/explore/legacy-architecture/'),
    ('explore/walking-into-scripture/index.html', 'g_scripture', '/explore/walking-into-scripture/'),
    ('explore/living-tapestry/index.html', 'g_tapestry', '/explore/living-tapestry/'),
    ('explore/rani-ki-vav/index.html', 'x_ranikivav', '/explore/rani-ki-vav/'),
    ('explore/konark-wheel/index.html', 'x_konark', '/explore/konark-wheel/'),
    ('explore/haveli/index.html', 'x_haveli', '/explore/haveli/'),
    ('explore/dholavira-bazaar/index.html', 'x_dholavira', '/explore/dholavira-bazaar/'),
    ('404.html', 'notfound', '/404.html'),
]
INLINE = {'a', 'mark', 'strong', 'em', 'b', 'i', 'span', 'br', 'small', 'abbr', 'code', 'sup', 'sub'}
VOID = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'path', 'circle', 'rect'}
SKIP = {'script', 'style', 'template', 'svg', 'title'}
ATTRS = ('alt', 'aria-label', 'placeholder', 'title', 'data-meaning')
ASSET = re.compile(r'^/(css|js|fonts|images|data|admin|favicon|apple-touch)')
TOK = re.compile(r'(<!--.*?-->|<[^>]+>)', re.S)


def tagname(tok):
    m = re.match(r'</?\s*([a-zA-Z0-9-]+)', tok)
    return m.group(1).lower() if m else None


def is_open(tok):
    return tok.startswith('<') and not tok.startswith('</') and not tok.startswith('<!')


def is_close(tok):
    return tok.startswith('</')


class Extractor:
    def __init__(self, prefix, store):
        self.prefix, self.store, self.n = prefix, store, 0

    def key(self, value):
        # identical text within one page shares a key
        for k, v in self.store.items():
            if k.startswith(self.prefix + '_') and v == value:
                return k
        self.n += 1
        k = f'{self.prefix}_{self.n:03d}'
        self.store[k] = value
        return k

    # ---- tags: translatable attributes + language-aware internal links
    def fix_tag(self, tok):
        if not is_open(tok):
            return tok
        def attr(m):
            name, val = m.group(1), m.group(2)
            if name in ATTRS and val.strip() and '{{' not in val:
                return f'{name}="{{{{ "{self.key(val)}" | t(lang) | safe }}}}"'
            if name == 'href' and val.startswith('/') and not ASSET.match(val):
                return f'href="{{{{ "{val}" | lurl(lang) }}}}"'
            return m.group(0)
        return re.sub(r'\b([a-zA-Z-]+)="([^"]*)"', attr, tok)

    # ---- text runs
    def emit_run(self, run):
        """run: list of tokens (text + inline tags, balanced). Returns template string."""
        text = ''.join(t for t in run if not t.startswith('<'))
        if not text.strip():
            return ''.join(self.fix_tag(t) for t in run)
        # keep surrounding whitespace in the template
        lead = []
        while run and not run[0].startswith('<') and not run[0].strip():
            lead.append(run.pop(0))
        trail = []
        while run and not run[-1].startswith('<') and not run[-1].strip():
            trail.insert(0, run.pop())
        # a single element wrapping everything: keep the element, translate its inside
        if run and is_open(run[0]) and tagname(run[0]) not in VOID and is_close(run[-1]):
            depth, wraps = 0, True
            for i, t in enumerate(run):
                if is_open(t) and tagname(t) not in VOID:
                    depth += 1
                elif is_close(t):
                    depth -= 1
                    if depth == 0 and i != len(run) - 1:
                        wraps = False
                        break
            if wraps:
                return ''.join(lead) + self.fix_tag(run[0]) + self.emit_run(run[1:-1]) + run[-1] + ''.join(trail)
        # no loose text at the top level: translate each top-level element separately
        top_text, depth, parts, cur = '', 0, [], []
        for t in run:
            if t.startswith('<'):
                if is_open(t) and tagname(t) not in VOID:
                    depth += 1
                elif is_close(t):
                    depth -= 1
                cur.append(t)
                if depth == 0:
                    parts.append(cur); cur = []
            else:
                if depth == 0:
                    top_text += t
                    if cur:
                        parts.append(cur); cur = []
                    parts.append([t])
                else:
                    cur.append(t)
        if cur:
            parts.append(cur)
        if not top_text.strip() and len(parts) > 1:
            return ''.join(lead) + ''.join(self.emit_run(list(p)) for p in parts) + ''.join(trail)
        # translate the whole run as one HTML string (inline tags kept, attributes untouched)
        value = ''.join(run)
        return ''.join(lead) + f'{{{{ "{self.key(value)}" | t(lang) | safe }}}}' + ''.join(trail)

    def convert(self, src):
        toks = [t for t in TOK.split(src) if t != '']
        out, run, skip = [], [], []

        def flush():
            nonlocal run
            if run:
                # only balanced runs are translated as a unit
                depth, ok = 0, True
                for t in run:
                    if t.startswith('<'):
                        if is_open(t) and tagname(t) not in VOID:
                            depth += 1
                        elif is_close(t):
                            depth -= 1
                            if depth < 0:
                                ok = False
                if ok and depth == 0:
                    out.append(self.emit_run(run))
                else:
                    for t in run:
                        if t.startswith('<'):
                            out.append(self.fix_tag(t))
                        elif t.strip():
                            out.append(f'{{{{ "{self.key(t.strip())}" | t(lang) | safe }}}}'.join(
                                [t[:len(t) - len(t.lstrip())], t[len(t.rstrip()):]]))
                        else:
                            out.append(t)
                run = []

        for t in toks:
            name = tagname(t) if t.startswith('<') else None
            if skip:
                out.append(t)
                if name == skip[-1] and is_close(t):
                    skip.pop()
                elif name == skip[-1] and is_open(t):
                    skip.append(name)
                continue
            if t.startswith('<!--'):
                flush(); out.append(t); continue
            if name in SKIP and is_open(t):
                flush(); out.append(self.fix_tag(t))
                if not t.endswith('/>'):
                    skip.append(name)
                continue
            if t.startswith('<'):
                if name in INLINE:
                    run.append(t)
                else:
                    flush(); out.append(self.fix_tag(t))
            else:
                run.append(t)
        flush()
        return ''.join(out)


def section(t, start, end):
    i = t.index(start)
    j = t.index(end, i) + len(end)
    return i, j


content = {}
ref = open('visit/index.html', encoding='utf-8').read()

# ---------- header partial
hi, hj = section(ref, '<header', '</header>')
header = ref[hi:hj]
header = re.sub(r'^<header style="[^"]*">', '<header style="{{ headerStyle }}">', header)
nav_html = re.search(r'<nav aria-label="Main".*?</nav>', header, re.S).group(0)
lang_html = re.search(r'<nav aria-label="Language".*?</nav>', header, re.S).group(0)
header = header.replace(nav_html, '<!--@@NAV@@-->').replace(lang_html, '<!--@@LANG@@-->')
common = Extractor('common', content)
header_t = common.convert(header)
NAV = []
for m in re.finditer(r'<a ([^>]*)>(.*?)</a>', nav_html):
    attrs, label = m.group(1), m.group(2)
    href = re.search(r'href="([^"]*)"', attrs).group(1)
    extra = re.sub(r'href="[^"]*"', '', attrs)
    extra = re.sub(r'\s*aria-current="page" style="[^"]*"', '', extra).strip()
    NAV.append({'href': href, 'key': href.strip('/').split('/')[0] or 'home', 'label': common.key(label), 'extra': extra})
nav_open = re.match(r'<nav[^>]*>', nav_html).group(0)
nav_t = (nav_open + '{% for item in nav %}<a href="{% if item.href.startsWith("/") %}{{ item.href | lurl(lang) }}{% else %}{{ item.href }}{% endif %}"'
         '{% if item.key == navKey %} aria-current="page" style="border-bottom-color:var(--gold)"{% endif %}'
         '{% if item.extra %} {{ item.extra | safe }}{% endif %}>{{ item.label | t(lang) | safe }}</a>{% endfor %}</nav>')
lang_t = '''<nav aria-label="Language" class="lang hide-sm">
<button type="button" class="lang-btn" aria-expanded="false" aria-controls="lang-menu">''' + \
    re.search(r'<button type="button" class="lang-btn"[^>]*>(<svg.*?</svg>)', lang_html, re.S).group(1) + \
    '''<span>{{ languages[lang].short }}</span><svg class="lang-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg><span class="visually-hidden">{{ "ui_choose_language" | t(lang) }}</span></button>
<ul id="lang-menu" class="lang-menu" hidden>
{% for code in langs %}<li><a href="{{ path | lurl(code) }}" lang="{{ code }}" hreflang="{{ code }}"{% if code == lang %} aria-current="true"{% endif %}{% if languages[code].font %} style="font-family:{{ languages[code].font | safe }}"{% endif %}>{{ languages[code].name }}</a></li>
{% endfor %}</ul>
</nav>'''
header_t = header_t.replace('<!--@@NAV@@-->', nav_t).replace('<!--@@LANG@@-->', lang_t)

# ---------- footer partial (from </div> wrapper's footer up to the wrapper end)
fi, fj = section(ref, '<footer', '</footer>')
footer_t = common.convert(ref[fi:fj])
# hours line gets a hook for the live status
footer_t = footer_t.replace('<p style="margin:0;font-size:15px">', '<p style="margin:0;font-size:15px" data-status="footer">', 1)

tail = ref[fj:]  # wrapper close + scripts
assert tail.strip().startswith('</div>')

# ---------- pages
os.makedirs('src/_includes/layouts', exist_ok=True)
os.makedirs('src/_includes/partials', exist_ok=True)
manifest = []
for path, key, url in PAGES:
    t = open(path, encoding='utf-8').read()
    title = re.search(r'<title>(.*?)</title>', t).group(1)
    bi = t.index('<body>\n') + len('<body>\n')
    wrapper_open = t[bi:t.index('>', bi) + 1]
    body_start = t.index('>', bi) + 1
    fi = t.index('<footer')
    body = t[body_start:fi]
    after = t[t.index('</footer>') + len('</footer>'):]
    # page header -> include, remembering its style
    m = re.search(r'<header style="([^"]*)">.*?</header>', body, re.S)
    header_style = m.group(1)
    nav_cur = re.search(r'<nav aria-label="Main".*?</nav>', m.group(0), re.S).group(0)
    cur = re.search(r'<a href="([^"]*)" aria-current="page"', nav_cur)
    nav_key = cur.group(1).strip('/').split('/')[0] if cur else ''
    body = body.replace(m.group(0), '<!--@@HEADER@@-->')
    if key == 'home':
        old = '<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:#7FBF7A;display:inline-block"></span>Open today</span><span style="font-size:17px"><mark class="todo">[HOURS]</mark></span>'
        assert old in body
        body = body.replace(old, '<span aria-hidden="true" data-status="dot" style="width:8px;height:8px;border-radius:50%;background:#7FBF7A;display:inline-block"></span><span data-status="today-label">Open today</span></span><span style="font-size:17px" data-status="today"><mark class="todo">[HOURS]</mark></span>')
    if key == 'visit':
        body, n = re.subn(r'(<dt style="[^"]*">Hours</dt><dd style="[^"]*")>', r'\1 data-status="visit-hours">', body, count=1)
        assert n == 1
    ex = Extractor(key, content)
    body_t = ex.convert(body).replace('<!--@@HEADER@@-->', '{% include "partials/header.njk" %}')
    extras = ''
    if 'eras-data' in after:
        tpl = re.search(r'<template id="era-card">.*?</template>', after, re.S).group(0)
        eras = json.loads(re.search(r'id="eras-data">(.*?)</script>', after, re.S).group(1))
        content[f'{key}_eras'] = eras
        body_t += ('{% raw %}' + tpl + '{% endraw %}\n<script type="application/json" id="eras-data">{{ lang | eras | safe }}</script>\n'
                   '<script src="/js/timeline.js" defer></script>\n')
    title_key = ex.key(title)
    fm = {
        'layout': 'layouts/base.njk',
        'pagination': {'data': 'langs', 'size': 1, 'alias': 'lang'},
        'path': url,
        'permalink': ('{{ "' + url + '" | lurl(lang) }}' + ('index.html' if url.endswith('/') else '')),
        'titleKey': title_key,
        'navKey': nav_key,
        'headerStyle': header_style,
    }
    if url == '/404.html':
        fm['permalink'] = '{% if lang == "en" %}/404.html{% else %}/{{ lang }}/404.html{% endif %}'
    out = '---\n' + json.dumps(fm, indent=1, ensure_ascii=False) + '\n---\n' + body_t
    dest = 'src/' + path.replace('.html', '.njk')
    os.makedirs(os.path.dirname(dest) or 'src', exist_ok=True)
    open(dest, 'w', encoding='utf-8').write(out)
    manifest.append((key, url, title))
    assert wrapper_open.startswith('<div style="font-family')

open('src/_includes/partials/header.njk', 'w', encoding='utf-8').write(header_t)
open('src/_includes/partials/footer.njk', 'w', encoding='utf-8').write(footer_t)
open('src/_includes/partials/wrapper-open.html', 'w', encoding='utf-8').write(wrapper_open)
os.makedirs('src/_data', exist_ok=True)
open('src/_data/nav.json', 'w').write(json.dumps(NAV, indent=1))
open('src/_includes/partials/tail.html', 'w', encoding='utf-8').write(tail)

# ---------- content files: one per page per language (+ common)
os.makedirs('src/content/en', exist_ok=True)
groups = {}
for k, v in content.items():
    groups.setdefault(k.split('_')[0] if not k.startswith(('g_', 'x_')) else '_'.join(k.split('_')[:2]), {})[k] = v
for g, items in groups.items():
    for lang in ('en', 'gu', 'hi'):
        os.makedirs(f'src/content/{lang}', exist_ok=True)
        data = items if lang == 'en' else {k: ([] if isinstance(v, list) else '') for k, v in items.items()}
        open(f'src/content/{lang}/{g}.json', 'w', encoding='utf-8').write(json.dumps(data, indent=1, ensure_ascii=False) + '\n')
print('pages:', len(manifest), '| strings:', sum(1 for v in content.values() if isinstance(v, str)), '| content files:', sorted(groups))
