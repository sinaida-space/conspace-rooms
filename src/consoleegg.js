// ── conspace-rooms · consoleegg.js ──────────────────────────────────────────
// A note for whoever opens the browser console: a CRT-style boot of Sinaida OS
// in neon red, then a few commands: one question from the piece, a line about
// the author, a rose. It speaks the language the visit is in, says one quiet
// line at each crossing into a new stage, and keeps one door it does not list.
// Prints only; nothing here touches the scene, the walk or the visit's counts.
// The stage lines come from a 'conspace:stage' event zones.js sends.

import { t, getLang } from './i18n.js';

const RED = 'color:#ff2a2a;font:700 15px/1.5 monospace;text-shadow:0 0 6px #ff2a2a,0 0 14px #b00';   // the title only
const TEXT = 'color:#d8d8d8;font:13px/1.5 monospace';
const DIM = 'color:#8a8a8a;font:italic 13px/1.5 monospace';
const NAME = 'color:#f2f2f2;font:700 13px/1.5 monospace';
const CODE = 'color:#f2f2f2;background:#1a1a1a;font:13px monospace;padding:1px 4px;border-radius:2px';

const TITLE = 'SINAIDA OS · live';
const GLYPHS = '▓▒░█#%&@/\\|_';
const PLAYLIST = 'https://open.spotify.com/playlist/1Nke8m1Yp3jYJynGS3rKyZ';
const CONTACT = 'https://sinaida.eu/#contact';
const STAIRS = 85;               // assets/stairs/stairs_1..85.webp, the same pictures the game deals
const nb = s => s.replace(/~/g, '\u00a0');

// Everything the egg says, in both languages. ~ is a non-breaking space.
const SAY = {
  en: {
    hello: 'hey there, you curious one <3\n\n'
      + 'nobody is watching.\n\n'
      + 'this labyrinth is not what it seems.\n'
      + 'you could be doing anything right now. you chose this.\n\n'
      + 'shall we talk?',
    commands: [
      ['ask()', 'one question from the piece'],
      ['about()', 'who made this room, and where to find her'],
      ['rose()', 'a rose, and what it becomes'],
      ['help()', 'this list again'],
    ],
    rooms: {
      close: 'the soul of someone close', child: 'the soul of a child', adult: 'the soul of a grown-up',
      boards: 'the hospital', light: 'the light', farewell: 'the last card',
    },
    from: room => `  from ${room}`,
    takeIt: 'The question that comes back may not be the one you wanted. Take it anyway.',
    whoAsked: 'Type sinaida.about() to learn who asked you this.',
    about: 'sinaida may be good at designing experiences, but first of all she is a person.\n\n'
      + 'she stares at moon reflections on the water from a high-rise window. she loves skylines at night. '
      + 'she is a little obsessed with her music and would put her life in the hands of a rock’n’roll band '
      + 'and feel supersonic about it. she is a hopeless nighthawk, and even claude says her peak hour is 2 am.\n\n'
      + 'she enjoys conversations with humans much more than with machines.\n\n'
      + 'so if you have an idea that should be seen, heard and felt, reach out. if you just want to talk, reach out too. '
      + 'and if you want to challenge her belief that meddle beats the dark side of the moon and that '
      + 'grigorovich’s spartacus at the bolshoi is the peak of the performing arts, definitely reach out.',
    door: 'p.s. there is a door nobody told you about. knock: sinaida.door()',
    playlist: 'go listen to the playlist',
    behind: 'a door. there is a different stairwell behind it every time.',
    stages: ['· back among the corridors.', '· the hospital is behind you. somewhere a kettle is on.', '· the walls are thinning. no need to hurry now.'],
  },
  ru: {
    hello: 'привет, любопытный человек <3\n\n'
      + 'никто не~смотрит.\n\n'
      + 'этот лабиринт не~то, чем кажется.\n'
      + 'сейчас можно было~бы заниматься чем угодно. а~ты здесь.\n\n'
      + 'поговорим?',
    commands: [
      ['ask()', 'один вопрос из~работы'],
      ['about()', 'кто сделал эту комнату и~где её найти'],
      ['rose()', 'роза и~то, чем она становится'],
      ['help()', 'этот список ещё раз'],
    ],
    rooms: {
      close: 'души близкого', child: 'души ребёнка', adult: 'души взрослого',
      boards: 'больницы', light: 'света', farewell: 'последней карточки',
    },
    from: room => (room === 'последней карточки' ? `  с~${room}` : `  из~${room}`),
    takeIt: 'Вернувшийся вопрос может оказаться не~тем, которого хотелось. Возьми его всё равно.',
    whoAsked: 'Набери sinaida.about(), чтобы узнать, кто тебя об~этом спросил.',
    about: 'зинаида, может, и~умеет придумывать опыт, но прежде всего она человек.\n\n'
      + 'она смотрит на~отражение луны в~воде из~окна высотки. она любит ночные силуэты городов. '
      + 'она слегка одержима своей музыкой: putting her life in the hands of a rock’n’roll band '
      + 'and feeling supersonic about it. она ужасная сова, и~её максимальная продуктивность '
      + 'приходится на~2~часа ночи.\n\n'
      + 'с~людьми ей разговаривать куда интереснее, чем с~машинами.\n\n'
      + 'так что если у~тебя есть идея, которую нужно увидеть, услышать и~почувствовать, напиши. '
      + 'если просто хочется поговорить, тоже напиши. а~если хочешь оспорить её веру в~то, что meddle '
      + 'лучше the dark side of~the moon и~что «спартак» григоровича в~большом остаётся вершиной '
      + 'исполнительских искусств, напиши обязательно.',
    door: 'p.s. есть дверь, о~которой тебе никто не~сказал. постучи: sinaida.door()',
    playlist: 'послушай плейлист',
    behind: 'дверь. за~ней каждый раз другая лестница.',
    stages: ['· снова коридоры.', '· больница позади. где-то уже поставили чайник.', '· стены редеют. торопиться больше некуда.'],
  },
};
// Read on each call, so a language switch on the first screen is picked up.
const say = () => SAY[getLang()] || SAY.en;
const out = (style, s) => console.log(`%c${nb(s)}`, style);

// An ASCII rose on a stem. It falls apart into petals in rose() below.
const ROSE = [
  '      .-~~~-.      ',
  '   .-( @@@@@ )-.   ',
  '  (  @@@@@@@@@  )  ',
  '   `-.@@@@@@@.-\'   ',
  '       \\ | /       ',
  '    ~~~~\\|/~~~~    ',
  '        \\|/        ',
  '         |         ',
  '        _|_        ',
];
const PETALS = '✿❀❁·';

// The question rooms, in the language the visit is in.
function questionRooms() {
  const soul = t('soulQuestions');
  return {
    close: soul[0],
    child: soul[1],
    adult: soul[2],
    boards: [...t('fearQuestions'), ...t('posterQuestions')],
    light: t('acceptQuestions'),
    farewell: t('questions'),
  };
}

// The command list; the door is left out on purpose.
function help() {
  const rows = say().commands;
  const w = Math.max(...rows.map(([c]) => c.length)) + 'sinaida.'.length + 3;
  out(CODE, rows.map(([c, what]) => `sinaida.${c}`.padEnd(w) + what).join('\n'));
}

// The CRT boot: the title scrambles, then settles letter by letter, then the
// commands appear. Each frame is one console line, so it stays a few lines long.
function boot() {
  const frames = 6;
  let frame = 0;
  const scramble = () => [...TITLE].map((c, i) => (c === ' ' || i < (frame * TITLE.length) / frames)
    ? c
    : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');
  const tick = setInterval(() => {
    frame += 1;
    if (frame < frames) {
      out(TEXT, scramble());
      return;
    }
    clearInterval(tick);
    out(RED, `***\n\n${TITLE}\n\n***`);
    console.log('');
    out(TEXT, say().hello);
    console.log('');
    help();
  }, 90);
}

// The rose, then its petals: each frame drops more of the flower and throws
// petal glyphs into the air, until only the playlist is left.
function rose() {
  const frames = 5;
  let frame = 0;
  const step = () => {
    const keep = 1 - frame / frames;
    const lines = ROSE.map(line => [...line].map(c => {
      if (c === ' ') return frame && Math.random() < 0.3 ? PETALS[Math.floor(Math.random() * PETALS.length)] : ' ';
      return Math.random() < keep ? c : (Math.random() < 0.5 ? PETALS[Math.floor(Math.random() * PETALS.length)] : ' ');
    }).join(''));
    console.log(`%c${lines.join('\n')}`, TEXT);
    frame += 1;
    if (frame <= frames) setTimeout(step, 260);
    else out(NAME, `${say().playlist} · ${PLAYLIST}`);
  };
  step();
}

// The door: one of the stairwell pictures, drawn as the background of an
// empty console line, dealt from a shuffled deck so none repeats until all
// 85 have been shown.
let deck = [];
function door() {
  if (!deck.length) {
    deck = Array.from({ length: STAIRS }, (_, i) => i + 1);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  const url = new URL(`assets/stairs/stairs_${deck.pop()}.webp`, location.href).href;
  console.log('%c ', `font-size:1px;padding:154px 116px;background:url("${url}") center/contain no-repeat`);  // 232×308, the pictures are 928×1232
  out(DIM, say().behind);
}

// The commands. Each returns nothing, so the console adds no echo of its own
// after what was printed. hint is what shows when someone types the bare name.
const api = { hint: 'sinaida.help()' };
Object.assign(api, {
  // Draws one question from all the rooms and prints it, then points to about().
  ask() {
    const rooms = questionRooms(), s = say();
    const pool = Object.entries(rooms).flatMap(([room, qs]) => qs.map(q => ({ room, q })));
    const { room, q } = pool[Math.floor(Math.random() * pool.length)];
    out(NAME, `? ${q}`);
    out(TEXT, s.from(s.rooms[room]));
    out(TEXT, s.takeIt);
    out(TEXT, s.whoAsked);
  },

  // Who made the room, the way to her site, and where the door is.
  about() {
    const s = say();
    out(TEXT, `${s.about}\n\n${CONTACT}`);
    out(DIM, s.door);
  },

  // A rose, scattered into petals, and the playlist to go with it.
  rose() { rose(); },

  help() { help(); },
});
Object.defineProperty(api, 'door', { value: door, enumerable: false });   // not in the list, not in the preview

// One quiet line when the visitor crosses into another stage.
function onStage(e) {
  const line = say().stages[e.detail?.stage];
  if (line) out(DIM, line);
}

export function installConsoleEgg() {
  if (window.sinaida) return;
  window.sinaida = api;
  addEventListener('conspace:stage', onStage);
  boot();
}

// Je suis le spectre d'une rose que tu portais hier au bal.
