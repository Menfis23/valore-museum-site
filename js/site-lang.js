// Shared language switcher for the main site nav (index/country/about/
// voices/perspectives and their story/submit pages). Separate from
// gallery.html's own i18n loader (js/gallery3d.js) since those pages share
// no DOM with the 3D gallery, but both read/write the same 'valoreLang'
// localStorage key and the same data/i18n/<code>.json files, so a language
// picked on either side carries over to the other.
(function () {
  const SUPPORTED_LANGS = ['en', 'fr', 'es', 'ar', 'ti', 'am', 'ht', 'so', 'my', 'prs', 'ne', 'sw', 'yo', 'uk', 'vi'];
  const cache = new Map();

  function detectDefaultLang() {
    const saved = localStorage.getItem('valoreLang');
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return SUPPORTED_LANGS.includes(nav) ? nav : 'en';
  }
  async function loadLang(lang) {
    if (cache.has(lang)) return cache.get(lang);
    const data = await fetch(`data/i18n/${lang}.json`).then(r => r.json());
    cache.set(lang, data);
    return data;
  }
  function applyStrings(strings) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = strings[el.dataset.i18n];
      if (val) el.textContent = val;
    });
    const label = document.getElementById('navLangLabel');
    if (label && strings['lang.translate']) label.textContent = strings['lang.translate'];
    const btn = document.getElementById('navLangBtn');
    if (btn && strings['lang.switch']) btn.title = strings['lang.switch'];
  }
  async function setLang(lang, save) {
    if (!SUPPORTED_LANGS.includes(lang)) lang = 'en';
    const strings = await loadLang(lang);
    applyStrings(strings);
    if (save !== false) localStorage.setItem('valoreLang', lang);
    document.querySelectorAll('.nav-lang-menu button').forEach(b =>
      b.setAttribute('aria-current', String(b.dataset.lang === lang)));
  }

  function init() {
    const navLinks = document.querySelector('nav.site-nav .nav-links');
    if (!navLinks || document.getElementById('navLangBtn')) return;

    const wrap = document.createElement('div');
    wrap.className = 'nav-lang-wrap';
    wrap.innerHTML =
      '<button type="button" class="nav-lang-btn" id="navLangBtn" aria-haspopup="true" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9s1.3-6.4 3.8-9z"/></svg>' +
        '<span id="navLangLabel">Translate</span>' +
      '</button>' +
      '<div class="nav-lang-menu" id="navLangMenu" role="menu"></div>';
    navLinks.appendChild(wrap);

    const btn = wrap.querySelector('#navLangBtn');
    const menu = wrap.querySelector('#navLangMenu');
    const close = () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };

    (async () => {
      for (const lang of SUPPORTED_LANGS) {
        const data = await loadLang(lang);
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.lang = lang;
        b.setAttribute('role', 'menuitem');
        b.textContent = data.langName;
        b.addEventListener('click', () => { setLang(lang); close(); });
        menu.appendChild(b);
      }
      setLang(detectDefaultLang(), false);
    })();

    btn.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
