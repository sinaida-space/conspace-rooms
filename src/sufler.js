// SHA-256 of the password. It only keeps the page out of casual view; the repo is public.
const HASH = 'b2e7dec9f76146caf15ea443e12f53e7ec9b6075ce3e171f56d36b41e487eacf';
const HINTS = [
  ['Заставка. Выбери язык, потом режим жестов и&nbsp;разреши камеру.', 'Встань в&nbsp;шаге от&nbsp;камеры, руки видны целиком.'],
  ['Иди: сожми один кулак.', 'Два кулака: бег. Разожми, чтобы остановиться.'],
  ['Поворот: укажи пальцем вправо или&nbsp;влево.', 'У&nbsp;стены лабиринт повернёт сам.'],
  ['Больница, страх. Свечи вдоль стен показывают путь.', 'Расскажи про серию SOULS: взгляд в&nbsp;свой внутренний мир.'],
  ['У&nbsp;картины: открытая ладонь держит её&nbsp;на&nbsp;экране.', 'Работы показываются сами, по&nbsp;3 секунды. У&nbsp;семи из&nbsp;них твой голос.'],
  ['Портал. Бабушкина квартира, память.', 'Ковры, патефон, часы на&nbsp;12:24.'],
  ['Приближение: две открытые ладони, разведи или&nbsp;сведи.', 'Две ладони без движения закрывают картину.'],
  ['Светлые комнаты, принятие.', 'Роза в&nbsp;углу растёт с&nbsp;каждой работой.'],
  ['Все восемнадцать найдены: арка из&nbsp;роз выводит наружу.', 'Если не&nbsp;успеваем, Q (держать секунду) завершает прогулку.'],
  ['Спасибо.', 'Сайт: conspace-rooms.vercel.app']
];
const $ = id => document.getElementById(id);
let i = 0, win = null;

async function sha(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function show(id) { ['gate', 'howto', 'hints'].forEach(s => $(s).hidden = s !== id); }
function render() {
  const [main, note] = HINTS[i];
  $('card').innerHTML = main + (note ? '<small>' + note + '</small>' : '');
  $('count').textContent = (i + 1) + ' / ' + HINTS.length;
}
function step(d) { i = Math.max(0, Math.min(HINTS.length - 1, i + d)); render(); }
function openStage() {
  win = window.open('index.html?lang=ru', 'conspace-stage', 'popup,width=1280,height=720');
  if (!win) $('popup').textContent = 'Браузер заблокировал окно: разреши всплывающие окна для этого сайта.';
  return !!win;
}

$('gate').addEventListener('submit', async e => {
  e.preventDefault();
  if (await sha($('pw').value.trim()) === HASH) { show('howto'); $('ok').focus(); }
  else { $('err').textContent = 'Неверный пароль.'; $('pw').select(); }
});
$('ok').addEventListener('click', () => { if (openStage()) { show('hints'); render(); } });
$('reopen').addEventListener('click', openStage);
$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
addEventListener('keydown', e => {
  if ($('hints').hidden) return;
  if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
});

// Je suis le spectre d'une rose que tu portais hier au bal.
