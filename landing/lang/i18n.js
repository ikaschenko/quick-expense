(function () {
  'use strict';

  var SUPPORTED_LANGS = ['en', 'es'];
  var DEFAULT_LANG = 'en';
  var STORAGE_KEY = 'qe-lang';

  var currentLang = DEFAULT_LANG;

  /** Detect language from browser settings, return supported code or default */
  function detectLang() {
    var langs = navigator.languages || [navigator.language || navigator.userLanguage || ''];
    for (var i = 0; i < langs.length; i++) {
      var code = langs[i].toLowerCase().split('-')[0];
      if (SUPPORTED_LANGS.indexOf(code) !== -1) return code;
    }
    return DEFAULT_LANG;
  }

  /** Resolve initial language: saved preference > browser detection > default */
  function resolveInitialLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) { /* localStorage unavailable */ }
    return detectLang();
  }

  /** Get a language bundle from preloaded data */
  function getLangBundle(lang) {
    return (window.__i18n && window.__i18n[lang]) || null;
  }

  /** Apply translations to the DOM */
  function applyTranslations(bundle) {
    // Text content: data-i18n="key"
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      if (bundle[key] !== undefined) els[i].textContent = bundle[key];
    }

    // HTML content: data-i18n-html="key"
    var htmlEls = document.querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < htmlEls.length; j++) {
      var hKey = htmlEls[j].getAttribute('data-i18n-html');
      if (bundle[hKey] !== undefined) htmlEls[j].innerHTML = bundle[hKey];
    }

    // Attributes: data-i18n-attr="attr:key" (e.g. "content:meta.description")
    var attrEls = document.querySelectorAll('[data-i18n-attr]');
    for (var k = 0; k < attrEls.length; k++) {
      var parts = attrEls[k].getAttribute('data-i18n-attr').split(';');
      for (var m = 0; m < parts.length; m++) {
        var pair = parts[m].split(':');
        if (pair.length === 2 && bundle[pair[1]] !== undefined) {
          attrEls[k].setAttribute(pair[0], bundle[pair[1]]);
        }
      }
    }

    // Update html lang attribute
    document.documentElement.setAttribute('lang', currentLang);

    // Update active state on switcher
    var btns = document.querySelectorAll('.lang-switcher button');
    for (var b = 0; b < btns.length; b++) {
      if (btns[b].getAttribute('data-lang') === currentLang) {
        btns[b].classList.add('active');
      } else {
        btns[b].classList.remove('active');
      }
    }
  }

  /** Switch to a language */
  function setLang(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) lang = DEFAULT_LANG;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ok */ }
    var bundle = getLangBundle(lang);
    if (bundle) applyTranslations(bundle);
  }

  /** Build the language switcher UI */
  function createSwitcher() {
    var switcher = document.querySelector('.lang-switcher');
    if (!switcher) return;

    var labels = { en: 'EN', es: 'ES' };
    for (var i = 0; i < SUPPORTED_LANGS.length; i++) {
      var lang = SUPPORTED_LANGS[i];
      var btn = document.createElement('button');
      btn.setAttribute('data-lang', lang);
      btn.textContent = labels[lang] || lang.toUpperCase();
      btn.setAttribute('aria-label', 'Switch language to ' + lang);
      if (lang === currentLang) btn.classList.add('active');
      btn.addEventListener('click', (function (l) {
        return function () { setLang(l); };
      })(lang));
      switcher.appendChild(btn);
    }
  }

  // Initialize on DOM ready
  function init() {
    currentLang = resolveInitialLang();
    createSwitcher();
    // Always apply translations (including for English) so data-i18n elements get content
    setLang(currentLang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
