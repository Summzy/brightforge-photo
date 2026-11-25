#!/usr/bin/env python3
'''Prepare an upstream PhotoCraft web release into a complete BFP static site.

This does NOT replace PhotoCraft's editing engine or implement same-file saving.
It preserves the wasm bootloader, application chunks, and license files.
'''
from __future__ import annotations
import json
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath

PROJECT = Path(__file__).resolve().parents[1]
MAX_FILE = 24 * 1024 * 1024


def build(release_archive: Path, site: Path) -> None:
    if site.exists():
        shutil.rmtree(site)
    site.mkdir(parents=True)
    with zipfile.ZipFile(release_archive) as archive:
        items = archive.namelist()
        matches = [p for p in items if p.endswith('/app/parts.txt')]
        if len(matches) != 1:
            raise RuntimeError(f'Expected one app/parts.txt within published web ZIP; found {len(matches)}')
        prefix = matches[0][:-len('app/parts.txt')]
        for item in archive.infolist():
            if not item.filename.startswith(prefix) or item.is_dir():
                continue
            relative = PurePosixPath(item.filename[len(prefix):])
            if not relative.parts or any(p in ('..', '') for p in relative.parts) or relative.is_absolute():
                raise RuntimeError('Unsafe entry in upstream ZIP')
            target = site.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as inp, target.open('wb') as out:
                shutil.copyfileobj(inp, out)

    index = site / 'index.html'
    if not index.is_file() or not (site / 'app/parts.txt').is_file():
        raise RuntimeError('The upstream release did not contain a complete bootloader and app')
    html = index.read_text(encoding='utf-8')
    if '<title>PhotoCraft</title>' not in html or '<div id="photocraft_loading">' not in html:
        raise RuntimeError('Upstream HTML layout changed: refusing to create a broken branded site')
    html = html.replace('<title>PhotoCraft</title>', '<title>BrightForge Photo</title>')
    html = html.replace('</head>', '''  <meta name="theme-color" content="#07172a">
  <meta name="description" content="BrightForge Photo — professional photo editing, reimagined.">
  <link rel="icon" type="image/png" sizes="192x192" href="./branding/bfp-icon-192.png">
  <link rel="manifest" href="./manifest.webmanifest">
  <link rel="stylesheet" href="./branding/bfp.css">
</head>''', 1)
    html = html.replace('<div id="photocraft_loading">', '''<div id="photocraft_loading">
    <div id="bfp-brand">
      <img src="./branding/bfp-lens-6b.webp" alt="BrightForge Photo BFP neon lens logo">
      <h1>BrightForge <span>Photo</span></h1>
      <small>PHOTO EDITING REIMAGINED</small>
    </div>''', 1)
    html = html.replace('Loading PhotoCraft', 'Loading BrightForge Photo')
    html = html.replace('If PhotoCraft doesn\'t start', 'If BrightForge Photo doesn\'t start')
    html = html.replace('PhotoCraft needs JavaScript', 'BrightForge Photo needs JavaScript')
    html = html.replace('<strong>PhotoCraft stopped.</strong>', '<strong>BrightForge Photo stopped.</strong>')
    # Keep the existing PhotoCraft WASM engine, but allow native browser Save As.
    html = html.replace('</head>', '  <script defer src="./branding/bfp-save-as.js"></script>\n</head>', 1)
    index.write_text(html, encoding='utf-8')

    # Fix upstream PhotoCraft v0.23.1 missing module path.
    snippets = site / 'snippets'
    if not snippets.is_dir():
        raise RuntimeError('Missing PhotoCraft snippets')
    shutil.copytree(
        snippets,
        site / 'app' / 'snippets',
        dirs_exist_ok=True
    )

    # Bundle the upstream eframe JavaScript snippet into the main loader.
    import re
    glue = site / 'app' / 'photocraft-web.js'
    code = glue.read_text(encoding='utf-8')
    parts = re.findall(r"(?m)^import .*?from ['\"]\./snippets/([^'\"]+)['\"];?\s*$", code)
    if len(parts) != 3 or len(set(parts)) != 1:
        raise RuntimeError(f'Unexpected PhotoCraft snippet imports: {parts}')
    snippet = (site / 'app' / 'snippets' / parts[0]).read_text(encoding='utf-8')
    declarations = snippet.replace('export function ', 'function ')
    symbols = re.findall(r'(?m)^function (\w+)\(', declarations)
    code, count = re.subn(r"(?m)^import .*?from ['\"]\./snippets/[^'\"]+['\"];?\s*\n", '', code)
    if count != 3 or len(symbols) != 3:
        raise RuntimeError('PhotoCraft snippet shape changed')
    code = declarations + "\nconst import1 = { " + ", ".join(symbols) + " };\nconst import2 = import1;\n" + code
    glue.write_text(code, encoding='utf-8')

    shutil.copytree(PROJECT / 'branding', site / 'branding', dirs_exist_ok=True)

    index_html = site / 'index.html'
    html = index_html.read_text(encoding='utf-8')
    if './branding/bfp-app-branding.css' not in html:
        html = html.replace('</head>', '  <link rel="stylesheet" href="./branding/bfp-app-branding.css">\n</head>')
    if './branding/bfp-app-branding.js' not in html:
        html = html.replace('</body>', '  <script src="./branding/bfp-app-branding.js"></script>\n</body>')
    index_html.write_text(html, encoding='utf-8')
    (site / 'manifest.webmanifest').write_text(json.dumps({
        'id': './', 'name': 'BrightForge Photo', 'short_name': 'BFP',
        'description': 'Professional Photo Editing, Reimagined',
        'start_url': './', 'scope': './', 'display': 'standalone',
        'background_color': '#07172a', 'theme_color': '#07172a',
        'icons': [
            {'src': './branding/bfp-icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
            {'src': './branding/bfp-icon-512.png', 'sizes': '512x512', 'type': 'image/png'}
        ]
    }, indent=2) + '\n', encoding='utf-8')
    oversized = [(p, p.stat().st_size) for p in site.rglob('*') if p.is_file() and p.stat().st_size > MAX_FILE]
    if oversized:
        raise RuntimeError(f'Assets exceed safe Cloudflare file limit: {oversized}')
    contents = (site / 'app/parts.txt').read_text(encoding='utf-8').splitlines()
    if not contents or contents[0].strip() != 'photocraft-parts 1':
        raise RuntimeError('Invalid PhotoCraft chunk manifest')
    if not contents[1:] or not all((site / 'app' / p).is_file() for p in contents[1:]):
        raise RuntimeError('Incomplete PhotoCraft WebAssembly asset chunks')
    if not list(site.glob('photocraft-web-boot-*_bg.wasm')):
        raise RuntimeError('PhotoCraft bootloader Wasm missing')
    if not (site / 'app/photocraft-web.js').exists():
        raise RuntimeError('PhotoCraft runtime glue missing')
    print('BrightForge Photo site prepared successfully:', site)
    print('WebAssembly chunks:', len(contents) - 1)
    print('Asset files:', sum(1 for x in site.rglob('*') if x.is_file()))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Usage: prepare-bfp-site.py <photocraft-web-version.zip> <output-site-dir>')
    build(Path(sys.argv[1]), Path(sys.argv[2]))
