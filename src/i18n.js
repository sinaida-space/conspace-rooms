// RU/EN strings for every visitor-facing text. Language is chosen on the
// first screen and kept only in the URL (?lang=ru|en), never in storage.
// In the tables below "~" stands for a non-breaking space (U+00A0).

const STRINGS = {
  en: {
    docTitle: 'CONSPACE ROOMS · Sinaida × UVALISS',
    cookieBoot: [
      'C:\\CONSPACE>SCANNING VISITOR…',
      'C:\\CONSPACE>GETTING INSIDE YOUR MIND…',
      'C:\\CONSPACE>LOCATING CONSENT.SYS…',
      'C:\\CONSPACE>AWAITING PERMISSION_',
    ],
    consentCopy: 'This experience keeps two tiny notes on~your machine: your graphics quality and~the fact that you have read this. Nothing else. No~trackers, no~ad networks, no~cookies sold to~a~stranger. If~you choose gesture mode later, your browser reads the webcam image locally. It~is never recorded and never sent anywhere.',
    consentBtn: 'Accept necessary~only',
    privacyLink: 'Privacy policy~→',
    statement: 'A~collaboration between Sinaida and~UVALISS.',
    aboutTitle: 'What this is',
    aboutText: 'A~web installation built on~the SOULS series by~UVALISS. The series is~dedicated to~her grandmother and follows a~soul’s path through trauma to~accepting itself. Here that path becomes an~endless labyrinth: eighteen works hang on~its walls, and you meet them in~whatever order the corridors unfold.',
    expectTitle: 'What to~expect',
    expect: [
      'There is~no exit. There is~a~Finish button.',
      'The corridors remember more than they show. The further you walk, the less fear is~left in~them.',
      'The walls leave marks. Red leads to~what is~not yet found.',
      'Every work has a~sound. Part of~the way is~heard before it~is~seen, so~put on~headphones.',
      'Some doors do~not open by~hand. They need time.',
      'Fifteen minutes at~least. The labyrinth does not like to~be~rushed.',
    ],
    credits: 'Credits',
    role1: 'Concept and experience~design',
    bio1: 'Visual artist and digital strategist working across interactive projection, generative systems, and~code. This piece is a~space to~walk through. There is nothing here to~solve.',
    role2: 'Artworks: SOULS~series',
    name2: 'UVALISS (Alisa~Feer)',
    bio2: 'Visual artist from Saint Petersburg exploring themes of~light and darkness, childhood and dreams. Her works are a~way of~looking into one’s own inner world and accepting it as~it~is.',
    boot: [
      'C:\\CONSPACE>LOADING KERNEL.SYS…',
      'C:\\CONSPACE>MOUNTING SOULS.DAT…',
      'C:\\CONSPACE>GPU: {gpu} [OK]',
      'C:\\CONSPACE>ROOMS.EXE READY_',
    ],
    noWebgl: 'WebGL2 is not available on~this device or~browser. This experience needs it to~run.',
    capability: 'capability check · GPU: {gpu} · pixel ratio: {dpr} · {touch}',
    touchYes: 'touch detected',
    touchNo: 'no~touch',
    modeLight: 'Touch controls',
    legendLight: 'hold top half = walk · drag = turn · tap = inspect',
    modeKeys: 'Keyboard + mouse',
    legendKeys: 'WASD/arrows = walk · ←/→ or~drag the mouse = look · E or~click = inspect',
    modeHands: 'Gestures (webcam)',
    legendHands: 'both fists = walk · point right/left hand = turn that way · both palms = stop · spread/pinch palms = zoom · finger pinch = inspect',
    recommended: 'recommended for this device',
    noCamTouch: 'no camera detected, this option will fall back to~touch controls',
    noCamKeys: 'no camera detected, this option will fall back to~keyboard',
    gestureTitle: 'Gestures need:',
    gestureList: ['a~front camera you can step back from', 'both hands in~the frame and well lit', 'on~a~phone or~tablet: prop it up at~arm’s length'],
    gesturePrivacy: 'The browser will ask for camera access. The image is~never recorded and never leaves your device.',
    techLink: 'Tech specs and~credits~→',
    enter: 'Enter',
    mute: 'Mute ambient audio',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    mainScreen: 'Main screen',
    finish: 'Finish',
    confirmLeave: 'Leave the labyrinth and return to~the main screen?',
    webglError: 'Your browser or~device doesn’t support WebGL2, which this piece needs to~run. Try a~recent version of~Chrome, Firefox, Safari, or~Edge on~a~desktop or~a~modern mobile~device.',
    farewellRole: 'CONSPACE ROOMS. A~collaboration between Sinaida and~UVALISS',
    playlistLabel: 'A~companion soundtrack for sitting with~it',
    playlistLink: 'Spotify playlist~↗',
    walkAgain: 'Walk again',
    touchHint: 'hold top half to~walk · drag to~turn · tap artwork to~inspect',
    hud: ['↑/W walk', '↓/S back', '←/→ or~drag turn', 'A/D strafe', 'E inspect'],
    handLegend: ['both fists = walk', 'point right hand = turn right', 'point left hand = turn left', 'both palms = stop', 'spread/pinch palms = zoom', 'finger pinch = inspect'],
    camTouch: 'Camera unavailable. Switched to~touch controls.',
    camKeys: 'Camera unavailable. Switched to~keyboard controls.',
    promptHands: 'pinch to~look closer',
    promptTouch: 'tap to~look closer',
    promptKeys: 'press E to~look closer',
    wallFear: ['i~am scared but i~keep walking', 'who turned off the light?', 'don’t turn around', 'breathe', 'nobody is~coming here', 'i~am cold', 'just keep fighting', 'whose voice is~in~your head?'],
    wallMemory: ['the tea is~getting cold', 'don’t forget your scarf', 'grandma, i~remember your hands', 'i~am waiting for you', 'it~smells of~pies in~here', 'who loved you for no~reason?', 'childhood', 'sit with me~a~while'],
    wallAccept: ['it~is~over now', 'leave the pain here', 'experience can be~read again', 'keep going', 'dawn', 'what is~left if~you let~go?', 'this has already been survived', 'freedom'],
    doorWait: 'stay here a~while',
    youLabel: 'You',
    pacClose: 'Close',
    pacHint: 'arrows, WASD or~swipe · Esc to~close',
    pacScore: 'SCORE',
    pacWin: 'ALL SOULS COLLECTED',
    pacLose: 'GAME OVER',
    pacAgain: 'tap or~Enter to~play again',
    questions: [
      'If~the room forgot you the moment you left~it, would you have been here at~all?',
      'Name the version of~yourself you buried to~become who is reading this. Does it know it’s~dead?',
      'When you finally stop moving, what will you have been walking~toward?',
      'Which of~your memories would you erase first, if~erasing it meant losing the person who gave it to~you?',
      'If~your soul were hung on~this wall tonight, framed and lit, would you recognize~it? Or~is~it a~stranger you’re required to~love?',
      'What part of~you only exists because someone else is~watching?',
      'You will forget this labyrinth. What makes you so~sure you won’t forget yourself the same~way?',
    ],
  },
  ru: {
    docTitle: 'CONSPACE ROOMS · Sinaida × UVALISS',
    cookieBoot: [
      'C:\\CONSPACE>СКАНИРУЮ ПОСЕТИТЕЛЯ…',
      'C:\\CONSPACE>ПРОНИКАЮ В~ТВОИ МЫСЛИ…',
      'C:\\CONSPACE>ИЩУ СОГЛАСИЕ.SYS…',
      'C:\\CONSPACE>ЖДУ РАЗРЕШЕНИЯ_',
    ],
    consentCopy: 'Эта работа хранит на~твоём устройстве две крошечные записи: настройку качества графики и~отметку, что это окно уже прочитано. Больше ничего. Никаких трекеров, рекламных сетей и~cookies, проданных чужим людям. Если позже выберешь управление жестами, браузер будет читать изображение с~камеры прямо на~устройстве. Оно нигде не~записывается и~никуда не~отправляется.',
    consentBtn: 'Принять только~необходимое',
    privacyLink: 'Политика конфиденциальности~→',
    statement: 'Совместный проект Sinaida и~UVALISS.',
    aboutTitle: 'Что это',
    aboutText: 'Веб-инсталляция по~серии SOULS художницы UVALISS. Серия посвящена её бабушке и~рассказывает о~пути души через травму к~принятию себя. Здесь этот путь стал бесконечным лабиринтом: восемнадцать работ висят на~его стенах, и~ты встречаешь их в~том порядке, в~каком сложатся коридоры.',
    expectTitle: 'Чего ждать',
    expect: [
      'Выхода нет. Есть кнопка «Завершить».',
      'Коридоры помнят больше, чем показывают. Чем дальше идёшь, тем меньше в~них страха.',
      'Стены оставляют знаки. Красное ведёт к~ненайденному.',
      'У~каждой работы есть звук. Часть пути слышна раньше, чем видна, поэтому лучше в~наушниках.',
      'Некоторые двери не~открываются руками. Им~нужно время.',
      'Пятнадцать минут минимум. Лабиринт не~любит, когда спешат.',
    ],
    credits: 'Авторы',
    role1: 'Концепция и~дизайн~взаимодействия',
    bio1: 'Визуальный артист и~цифровой стратег. Работает с~интерактивными проекциями, генеративными системами и~кодом. Эта инсталляция задумана как пространство для блуждания. Решать здесь~нечего.',
    role2: 'Работы: серия~SOULS',
    name2: 'UVALISS (Алиса~Феер)',
    bio2: 'Визуальный артист из~Санкт-Петербурга. Исследует темы света и~тьмы, детства и~снов. Её~работы помогают заглянуть в~свой внутренний мир и~принять его таким, какой он~есть.',
    boot: [
      'C:\\CONSPACE>ЗАГРУЖАЮ KERNEL.SYS…',
      'C:\\CONSPACE>МОНТИРУЮ SOULS.DAT…',
      'C:\\CONSPACE>GPU: {gpu} [OK]',
      'C:\\CONSPACE>ROOMS.EXE ГОТОВ_',
    ],
    noWebgl: 'На~этом устройстве или в~этом браузере нет WebGL2. Без него работа не~запустится.',
    capability: 'проверка устройства · GPU: {gpu} · плотность пикселей: {dpr} · {touch}',
    touchYes: 'сенсорный экран',
    touchNo: 'без сенсора',
    modeLight: 'Сенсорное управление',
    legendLight: 'держи верхнюю половину = идти · веди пальцем = поворот · тап = рассмотреть',
    modeKeys: 'Клавиатура и~мышь',
    legendKeys: 'WASD/стрелки = идти · ←/→ или тяни мышью = обзор · E или клик = рассмотреть',
    modeHands: 'Жесты (веб-камера)',
    legendHands: 'два кулака = идти · укажи правой/левой рукой = поворот в~ту сторону · две ладони = стоп · развести/свести ладони = зум · щипок пальцами = рассмотреть',
    recommended: 'подходит для этого устройства',
    noCamTouch: 'камера не~найдена, включится сенсорное управление',
    noCamKeys: 'камера не~найдена, включится клавиатура',
    gestureTitle: 'Для жестов нужно:',
    gestureList: ['камера, от~которой можно отойти на~шаг', 'обе руки в~кадре и~хорошо освещены', 'телефон или планшет поставь на~расстоянии вытянутой руки'],
    gesturePrivacy: 'Браузер спросит доступ к~камере. Изображение не~записывается и~не~покидает устройство.',
    techLink: 'Техническая информация и~авторы~→',
    enter: 'Войти',
    mute: 'Выключить звук',
    fullscreen: 'Во~весь экран',
    exitFullscreen: 'Выйти из~полноэкранного',
    mainScreen: 'На~главный',
    finish: 'Завершить',
    confirmLeave: 'Выйти из~лабиринта и~вернуться на~главный экран?',
    webglError: 'Твой браузер или устройство не~поддерживает WebGL2, а~без него работа не~запустится. Попробуй свежую версию Chrome, Firefox, Safari или Edge на~компьютере или современном~телефоне.',
    farewellRole: 'CONSPACE ROOMS. Совместный проект Sinaida и~UVALISS',
    playlistLabel: 'Саундтрек, чтобы побыть с~этим~подольше',
    playlistLink: 'Плейлист в~Spotify~↗',
    walkAgain: 'Пройти ещё~раз',
    touchHint: 'держи верхнюю половину, чтобы идти · веди пальцем для поворота · тапни по~работе, чтобы рассмотреть',
    hud: ['↑/W идти', '↓/S назад', '←/→ или мышь поворот', 'A/D вбок', 'E рассмотреть'],
    handLegend: ['два кулака = идти', 'правая рука указывает = вправо', 'левая рука указывает = влево', 'две ладони = стоп', 'развести/свести ладони = зум', 'щипок пальцами = рассмотреть'],
    camTouch: 'Камера недоступна. Включено сенсорное управление.',
    camKeys: 'Камера недоступна. Включена клавиатура.',
    promptHands: 'сведи пальцы, чтобы рассмотреть',
    promptTouch: 'тапни, чтобы рассмотреть',
    promptKeys: 'нажми E, чтобы рассмотреть',
    wallFear: ['мне страшно, но~я~иду', 'кто выключил свет?', 'не~оборачивайся', 'дыши', 'сюда никто не~придёт', 'мне холодно', 'ты~только борись', 'чей это голос в~твоей голове?'],
    wallMemory: ['чай остывает', 'не~забудь шарф', 'бабушка, я~помню твои руки', 'я~тебя жду', 'здесь пахнет пирогами', 'кто любил тебя просто~так?', 'детство', 'посиди со~мной'],
    wallAccept: ['всё прошло', 'оставь боль здесь', 'опыт можно прочитать заново', 'иди дальше', 'рассвет', 'что останется, если отпустить?', 'с~этим уже справились', 'свобода'],
    doorWait: 'постой здесь',
    youLabel: 'Ты',
    pacClose: 'Закрыть',
    pacHint: 'стрелки, WASD или свайп · Esc, чтобы закрыть',
    pacScore: 'СЧЁТ',
    pacWin: 'ВСЕ ДУШИ СОБРАНЫ',
    pacLose: 'ИГРА ОКОНЧЕНА',
    pacAgain: 'тапни или нажми Enter, чтобы сыграть ещё',
    questions: [
      'Если комната забывает тебя в~тот миг, когда ты выходишь, было ли твоё присутствие здесь~вообще?',
      'Назови версию себя, которую пришлось похоронить, чтобы стать тем, кто читает эти строки. Она знает, что её больше~нет?',
      'Когда ты наконец остановишься, что окажется в~конце твоей~дороги?',
      'Какое воспоминание стоило бы стереть первым, если вместе с~ним уйдёт человек, который тебе его~подарил?',
      'Если сегодня повесить твою душу на~эту стену, в~раме и~под светом, получится ли её узнать? Или это чужой человек, которого положено~любить?',
      'Какая часть тебя существует только потому, что на~тебя кто-то~смотрит?',
      'Этот лабиринт забудется. Откуда уверенность, что так~же не~забудешь~себя?',
    ],
  },
};

const nb = s => s.replace(/~/g, '\u00a0');

export function langFromUrl() {
  const p = new URLSearchParams(location.search).get('lang');
  return p === 'ru' || p === 'en' ? p : null;
}

let lang = langFromUrl() || 'en';

export function getLang() { return lang; }

// Sets the language and writes it into the URL (no storage), so a reload or
// "walk again" keeps it and a shared ?lang=ru link skips the language screen.
export function setLang(l) {
  lang = l === 'ru' ? 'ru' : 'en';
  document.documentElement.lang = lang;
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
}

// t('key') or t('key', { gpu: 'HIGH' }); arrays come back with each item processed.
export function t(key, vars = {}) {
  const v = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  const fill = s => nb(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return Array.isArray(v) ? v.map(fill) : fill(v);
}

// Fills every [data-i18n] element's text and [data-i18n-aria] label.
export function applyStatic(root = document) {
  document.title = t('docTitle');
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-list]').forEach(el => {
    el.replaceChildren(...t(el.dataset.i18nList).map(line => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-href]').forEach(el => {
    el.setAttribute('href', `${el.dataset.i18nHref}?lang=${lang}`);
  });
}

// Je suis le spectre d'une rose que tu portais hier au bal.
