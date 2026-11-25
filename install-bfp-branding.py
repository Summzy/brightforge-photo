from pathlib import Path

script = Path('scripts/prepare-bfp-site.py')
if not script.exists():
    raise SystemExit('Run this from the brightforge-photo repository root.')

text = script.read_text(encoding='utf-8')
marker = "./branding/bfp-app-branding.js"
anchor = "    shutil.copytree(PROJECT / 'branding', site / 'branding', dirs_exist_ok=True)\n"
patch = """
    index_html = site / 'index.html'
    html = index_html.read_text(encoding='utf-8')
    if './branding/bfp-app-branding.css' not in html:
        html = html.replace('</head>', '  <link rel="stylesheet" href="./branding/bfp-app-branding.css">\\n</head>')
    if './branding/bfp-app-branding.js' not in html:
        html = html.replace('</body>', '  <script src="./branding/bfp-app-branding.js"></script>\\n</body>')
    index_html.write_text(html, encoding='utf-8')
"""

if marker in text:
    print('BrightForge Photo branding hook already installed.')
else:
    if anchor not in text:
        raise SystemExit('Could not find insertion point in scripts/prepare-bfp-site.py')
    text = text.replace(anchor, anchor + patch, 1)
    script.write_text(text, encoding='utf-8')
    print('BrightForge Photo branding hook installed.')
