(function () {
  'use strict';

  const LANGS = {
    en: { flag: '\uD83C\uDDEC\uD83C\uDDE7', name: 'English' },
    es: { flag: '\uD83C\uDDEA\uD83C\uDDF8', name: 'Espa\u00f1ol' },
    ru: { flag: '\uD83C\uDDF7\uD83C\uDDFA', name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' }
  };
  const SUPPORTED_LANGS = Object.keys(LANGS);
  const DEFAULT_LANG = 'en';
  // Manual choice is authoritative; the auto result is rewritten on every load. Legacy 'qe-lang' is ignored on purpose.
  const MANUAL_KEY = 'qe-lang-manual';
  const AUTO_KEY = 'qe-lang-auto';
  const ARROW_SVG = '<svg class="lang-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  let currentLang = DEFAULT_LANG;
  let trigger = null;
  let menu = null;
  let options = [];

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable: in-memory only */ }
  }

  function isSupported(lang) {
    return SUPPORTED_LANGS.indexOf(lang) !== -1;
  }

  /** First supported base language from the ordered browser preferences, else default */
  function detectLang() {
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (let i = 0; i < prefs.length; i++) {
      const code = String(prefs[i]).toLowerCase().split(/[-_]/)[0];
      if (isSupported(code)) return code;
    }
    return DEFAULT_LANG;
  }

  /** Get a language bundle from preloaded data */
  function getLangBundle(lang) {
    return (window.__i18n && window.__i18n[lang]) || null;
  }

  /** Translate a key, falling back to English when the active bundle lacks it */
  function translate(key, bundle) {
    if (bundle && bundle[key] !== undefined) return bundle[key];
    const fallback = getLangBundle(DEFAULT_LANG);
    return fallback && fallback[key] !== undefined ? fallback[key] : undefined;
  }

  /** Apply translations to the DOM */
  function applyTranslations(bundle) {
    // Text content: data-i18n="key"
    const els = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < els.length; i++) {
      const text = translate(els[i].dataset.i18n, bundle);
      if (text !== undefined) els[i].textContent = text;
    }

    // HTML content: data-i18n-html="key"
    const htmlEls = document.querySelectorAll('[data-i18n-html]');
    for (let j = 0; j < htmlEls.length; j++) {
      const html = translate(htmlEls[j].dataset.i18nHtml, bundle);
      if (html !== undefined) htmlEls[j].innerHTML = html;
    }

    // Attributes: data-i18n-attr="attr:key" (e.g. "content:meta.description")
    const attrEls = document.querySelectorAll('[data-i18n-attr]');
    for (let k = 0; k < attrEls.length; k++) {
      const parts = attrEls[k].dataset.i18nAttr.split(';');
      for (let m = 0; m < parts.length; m++) {
        const pair = parts[m].split(':');
        const value = pair.length === 2 ? translate(pair[1], bundle) : undefined;
        if (value !== undefined) attrEls[k].setAttribute(pair[0], value);
      }
    }

    document.documentElement.setAttribute('lang', currentLang);
    updateSwitcher(bundle);
  }

  /** Render the given language (no persistence) */
  function applyLang(lang) {
    currentLang = isSupported(lang) ? lang : DEFAULT_LANG;
    applyTranslations(getLangBundle(currentLang));
  }

  /** Visitor picked a language: persist as manual choice and apply */
  function chooseLang(lang) {
    if (!isSupported(lang)) return;
    writeStorage(MANUAL_KEY, lang);
    applyLang(lang);
  }

  function isMenuOpen() {
    return !!menu && !menu.hidden;
  }

  function closeMenu(restoreFocus) {
    if (!menu) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const selected = options.filter(function (o) { return o.dataset.lang === currentLang; })[0];
    (selected || options[0]).focus();
  }

  /** Sync trigger label and option states with the active language */
  function updateSwitcher(bundle) {
    if (!trigger) return;
    const meta = LANGS[currentLang];
    const label = translate('lang.label', bundle) || 'Language';
    trigger.querySelector('.lang-flag').textContent = meta.flag;
    trigger.querySelector('.lang-name').textContent = meta.name;
    trigger.setAttribute('aria-label', label + ': ' + meta.name);
    menu.setAttribute('aria-label', label);
    for (let i = 0; i < options.length; i++) {
      options[i].setAttribute('aria-selected', options[i].dataset.lang === currentLang ? 'true' : 'false');
    }
  }

  function onSwitcherKeydown(e) {
    if (!isMenuOpen()) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target === trigger) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    const idx = options.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      options[(idx + 1) % options.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      options[(idx - 1 + options.length) % options.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      options[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      options[options.length - 1].focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && idx !== -1) {
      e.preventDefault();
      chooseLang(options[idx].dataset.lang);
      closeMenu(true);
    }
  }

  /** Build the language dropdown UI */
  function createSwitcher() {
    const switcher = document.querySelector('.lang-switcher');
    if (!switcher) return;

    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lang-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'lang-menu');
    trigger.innerHTML = '<span class="lang-flag" aria-hidden="true"></span><span class="lang-name"></span>' + ARROW_SVG;
    trigger.addEventListener('click', function () {
      if (isMenuOpen()) closeMenu(false); else openMenu();
    });

    menu = document.createElement('ul');
    menu.id = 'lang-menu';
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    options = SUPPORTED_LANGS.map(function (lang) {
      const li = document.createElement('li');
      li.className = 'lang-option';
      li.dataset.lang = lang;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.tabIndex = -1;
      li.innerHTML = '<span class="lang-flag" aria-hidden="true"></span><span class="lang-name"></span>';
      li.querySelector('.lang-flag').textContent = LANGS[lang].flag;
      li.querySelector('.lang-name').textContent = LANGS[lang].name;
      li.addEventListener('click', function () {
        chooseLang(lang);
        closeMenu(true);
      });
      menu.appendChild(li);
      return li;
    });

    switcher.appendChild(trigger);
    switcher.appendChild(menu);
    switcher.addEventListener('keydown', onSwitcherKeydown);
    switcher.addEventListener('focusout', function (e) {
      if (e.relatedTarget && !switcher.contains(e.relatedTarget)) closeMenu(false);
    });
    document.addEventListener('click', function (e) {
      if (isMenuOpen() && !switcher.contains(e.target)) closeMenu(false);
    });
  }

  // Initialize on DOM ready
  function init() {
    createSwitcher();
    const manual = readStorage(MANUAL_KEY);
    if (isSupported(manual)) {
      applyLang(manual);
      return;
    }
    // Re-detected on every load so newly added languages can match
    const detected = detectLang();
    writeStorage(AUTO_KEY, detected);
    applyLang(detected);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
