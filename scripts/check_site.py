"""Dependency-free checks for the static GitHub Pages artifact."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re

ROOT = Path(__file__).resolve().parents[1] / 'dist'
EXPECTED = {'index.html', 'definition.html', 'proof.html'}

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.refs = []
        self.headings = 0
        self.main = 0
        self.viewport = False
        self.korean = False
        self.named_nav = False
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids, f'Duplicate id: {a["id"]}'
            self.ids.add(a['id'])
        for key in ('href', 'src'):
            if key in a:
                self.refs.append(a[key])
        self.headings += tag == 'h1'
        self.main += tag == 'main'
        self.viewport |= tag == 'meta' and a.get('name') == 'viewport' and 'width=device-width' in a.get('content', '')
        self.korean |= tag == 'html' and a.get('lang') == 'ko'
        self.named_nav |= tag == 'nav' and bool(a.get('aria-label'))

def local_ref(parent, value):
    u = urlsplit(value.strip().strip('\"\''))
    if u.scheme or u.netloc:
        return None
    assert not u.path.startswith('/'), f'Root-relative URL breaks project Pages: {value}'
    path = (parent / unquote(u.path)).resolve() if u.path else parent
    assert path.is_relative_to(ROOT.resolve()), f'URL escapes dist: {value}'
    assert path.exists(), f'Missing local resource: {value}'
    return path, u.fragment

pages = {}
for path in sorted(ROOT.glob('*.html')):
    p = Page();p.feed(path.read_text())
    assert p.headings == 1 and p.main == 1, f'Expected one h1/main: {path.name}'
    assert p.viewport and p.korean and p.named_nav, f'Missing page metadata: {path.name}'
    pages[path.name] = p
assert set(pages) == EXPECTED, f'Expected three pages: {set(pages)}'
checked = 0
for name, p in pages.items():
    for value in p.refs:
        result = local_ref(ROOT, value)
        if result:
            target, fragment = result
            if not urlsplit(value).path:
                target = ROOT / name
            if fragment and target.suffix == '.html':
                assert fragment in pages[target.name].ids, f'Missing anchor: {name}: {value}'
        checked += 1
for path in ROOT.rglob('*.js'):
    for value in re.findall(r'\bfrom\s*[\'\"](\.[^\'\"]+)[\'\"]', path.read_text()):
        local_ref(path.parent, value)
for value in re.findall(r'url\(([^)]+)\)', (ROOT / 'style.css').read_text()):
    local_ref(ROOT, value)
for name in ('vendor/THREE-LICENSE.txt', 'vendor/DAVID-LI-LICENSE.txt', 'fonts/STIX-OFL.txt', 'assets/overcast-sky.hdr'):
    assert (ROOT / name).is_file(), f'Missing attribution/resource: {name}'
assert not any(p.is_symlink() for p in ROOT.rglob('*')), 'Pages artifact must not contain symlinks'
css = (ROOT / 'style.css').read_text()
assert 'cursor:none' not in css and 'cursor: none' not in css
assert not (ROOT / '.env').exists() and not (ROOT / '.openai').exists()
print(json.dumps({'pages': sorted(pages), 'references_checked': checked, 'project_relative_assets': True, 'responsive_metadata': True, 'licensed_resources_present': True}, ensure_ascii=False, indent=2))
