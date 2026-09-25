// Text pages carry both languages; ?lang= (or the browser language) picks one.
// Nothing is stored.
(function () {
  const p = new URLSearchParams(location.search).get('lang');
  const lang = p === 'ru' || p === 'en' ? p
    : (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-switch a').forEach(a => a.classList.toggle('current', a.lang === lang));
})();

// Je suis le spectre d'une rose que tu portais hier au bal.
