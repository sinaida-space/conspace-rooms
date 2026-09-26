// Three-column footer shared by the welcome screen and the text pages:
// product · navigate · more. Rendered from one source so the pages never drift.
// "~" in the strings stands for a non-breaking space.

const VERSION = 'v2.0';

const COPY = {
  en: {
    tagline: 'An~endless labyrinth that holds the SOULS series.',
    created: 'Created by Sinaida Krivchenko and~UVALISS',
    navigate: 'Navigate',
    home: 'Enter the labyrinth',
    tech: 'Specs',
    rider: 'For galleries',
    privacy: 'Privacy policy',
    other: 'Русская версия',
    more: 'More',
    playlist: 'Companion playlist',
    released: 'September 2026',
  },
  ru: {
    tagline: 'Бесконечный лабиринт, в~котором живёт серия~SOULS.',
    created: 'Авторы: Sinaida Krivchenko и~UVALISS',
    navigate: 'Навигация',
    home: 'Войти в~лабиринт',
    tech: 'Спецификации',
    rider: 'Для~галерей',
    privacy: 'Конфиденциальность',
    other: 'English version',
    more: 'Ещё',
    playlist: 'Плейлист к~работе',
    released: 'сентябрь 2026',
  },
};

export function renderFooter(lang, target = document.getElementById('site-footer')) {
  if (!target) return;
  const l = lang === 'ru' ? 'ru' : 'en';
  const c = Object.fromEntries(Object.entries(COPY[l]).map(([k, v]) => [k, v.replace(/~/g, ' ')]));
  const other = l === 'ru' ? 'en' : 'ru';
  const here = location.pathname.split('/').pop() || 'index.html';
  const ext = 'target="_blank" rel="noopener"';
  target.className = 'site-footer';
  target.innerHTML = `
    <div class="footer-col footer-product">
      <h2><a class="footer-brand" href="index.html?lang=${l}">CONSPACE ROOMS</a></h2>
      <p>${c.tagline}</p>
      <p><a href="https://sinaida.eu/" ${ext}>${c.created}</a></p>
      <p class="footer-version">${VERSION} · ${c.released}</p>
    </div>
    <nav class="footer-col" aria-label="${c.navigate}">
      <h2>${c.navigate}</h2>
      <a href="index.html?lang=${l}">${c.home}</a>
      <a href="tech.html?lang=${l}">${c.tech}</a>
      <a href="rider.html?lang=${l}">${c.rider}</a>
      <a href="privacy.html?lang=${l}">${c.privacy}</a>
      <a href="${here}?lang=${other}" lang="${other}">${c.other}</a>
    </nav>
    <div class="footer-col">
      <h2>${c.more}</h2>
      <a href="https://sinaida.eu/" ${ext}>sinaida.eu</a>
      <a href="https://www.instagram.com/sin.ai.da" ${ext}>@sin.ai.da</a>
      <a href="https://uvaliss.ru/" ${ext}>uvaliss.ru</a>
      <a href="https://www.instagram.com/uvaliss/" ${ext}>@uvaliss</a>
      <a href="https://open.spotify.com/playlist/0145rQE2XluEkz3YWbEQLp?si=6c33fb59e0ad4ff4" ${ext}>${c.playlist}</a>
    </div>`;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
