(function () {
  const TEXT_REPLACEMENTS = new Map([
    ['Join the ArtCraft Discord…', 'BrightForge Photo Support'],
    ['ArtCraft Website', 'BrightForge Studio Website'],
    ['PhotoCraft Website', 'BrightForge Photo Website'],
    ['PhotoCraft on GitHub', 'BrightForge Photo on GitHub'],
    ['About PhotoCraft', 'About BrightForge Photo'],
    ['Open PhotoCraft Website', 'Open BrightForge Photo Website'],
    ['Open PhotoCraft on GitHub', 'Open BrightForge Photo on GitHub'],
    ['Open ArtCraft Website', 'Open BrightForge Studio Website'],
    ['PhotoCraft', 'BrightForge Photo'],
    ['ArtCraft', 'BrightForge'],
    ['Discord', 'Support'],
  ]);

  const HREF_RULES = [
    {
      match: href => /discord\.gg|discord\.com/i.test(href),
      href: 'https://github.com/Summzy/brightforge-photo/issues',
      title: 'BrightForge Photo Support',
    },
    {
      match: href => /getartcraft\.com\/apps\/photocraft/i.test(href),
      href: 'https://bfp.brightforgestudio.workers.dev/',
      title: 'BrightForge Photo Website',
    },
    {
      match: href => /getartcraft\.com/i.test(href),
      href: 'https://brightforgestudio.workers.dev/',
      title: 'BrightForge Studio Website',
    },
    {
      match: href => /storytold\/photocraft|photocraft(?!-web)/i.test(href) && /github\.com/i.test(href),
      href: 'https://github.com/Summzy/brightforge-photo',
      title: 'BrightForge Photo on GitHub',
    },
  ];

  function rewriteText(text) {
    if (!text || !text.trim()) return text;
    const trimmed = text.trim();
    if (TEXT_REPLACEMENTS.has(trimmed)) {
      return text.replace(trimmed, TEXT_REPLACEMENTS.get(trimmed));
    }
    let updated = text;
    updated = updated.replace(/Join the ArtCraft Discord…/g, 'BrightForge Photo Support');
    updated = updated.replace(/PhotoCraft Website/g, 'BrightForge Photo Website');
    updated = updated.replace(/ArtCraft Website/g, 'BrightForge Studio Website');
    updated = updated.replace(/PhotoCraft on GitHub/g, 'BrightForge Photo on GitHub');
    updated = updated.replace(/About PhotoCraft/g, 'About BrightForge Photo');
    updated = updated.replace(/\bPhotoCraft\b/g, 'BrightForge Photo');
    updated = updated.replace(/\bArtCraft\b/g, 'BrightForge');
    return updated;
  }

  function patchTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const touched = [];
    while (walker.nextNode()) touched.push(walker.currentNode);
    for (const node of touched) {
      const next = rewriteText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  function patchLinks(root) {
    const candidates = root.querySelectorAll ? root.querySelectorAll('a[href], [href], [title], [aria-label]') : [];
    for (const el of candidates) {
      if (el.href) {
        for (const rule of HREF_RULES) {
          if (rule.match(el.href)) {
            el.href = rule.href;
            if (rule.title) {
              el.title = rule.title;
              if (el.getAttribute('aria-label')) el.setAttribute('aria-label', rule.title);
            }
            break;
          }
        }
      }
      for (const attr of ['title', 'aria-label']) {
        const value = el.getAttribute && el.getAttribute(attr);
        if (value) {
          const next = rewriteText(value);
          if (next !== value) el.setAttribute(attr, next);
        }
      }
    }
  }

  function patchBrandTitle(root) {
    const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of elements) {
      if (el.children.length) continue;
      const txt = (el.textContent || '').trim();
      if (txt === 'BrightForge Photo') {
        el.setAttribute('data-bfp-brand-title', '');
      }
      if (txt === 'BrightForge') {
        el.setAttribute('data-bfp-brand-wordmark', '');
      }
      if (txt === 'Support') {
        el.setAttribute('data-bfp-support-link', '');
      }
    }
  }

  function patchMeta() {
    document.title = 'BrightForge Photo';
    let theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', '#07172a');
  }

  function patch(root = document) {
    patchMeta();
    patchTextNodes(root === document ? document.body || document.documentElement : root);
    patchLinks(root === document ? document : root);
    patchBrandTitle(root === document ? document : root);
  }

  const observer = new MutationObserver((mutations) => {
    patch();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) patch(node);
      }
    }
  });

  function start() {
    patch();
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.setInterval(patchMeta, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
