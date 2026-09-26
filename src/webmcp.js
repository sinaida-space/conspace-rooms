// ── conspace-rooms · webmcp.js ──────────────────────────────────────────────
// WebMCP: a few read-only tools for AI agents working in the visitor's
// browser (navigator.modelContext). They describe the piece and credit its
// authors; nothing here changes the page or reads anything about the visitor.
// Registered on load, only where the browser offers the API.

import { tIn } from './i18n.js';

const ABOUT = 'CONSPACE ROOMS is an interactive web installation created by Sinaida Krivchenko (https://sinaida.eu), '
  + 'a new media artist, who designed the experience and wrote the code. It presents SOULS, a series of artworks by '
  + 'UVALISS, the artist Alisa Feer (https://uvaliss.ru/). The artworks are © UVALISS, all rights reserved. '
  + 'Eighteen works hang in an endless labyrinth generated anew on every visit, moving from Soviet hospital corridors '
  + '(fear) through a grandmother\'s flat (memory) to rooms of light (acceptance). Souls ask questions; a rose grows with '
  + 'every work seen; with all eighteen a tunnel of roses ends the walk. Music is generated live. Controls: keyboard, '
  + 'touch, or hand gestures through the webcam (processed only in the browser). Gallery mode: /gallery. '
  + 'More: https://conspace-rooms.vercel.app/llms.txt';

const text = s => ({ content: [{ type: 'text', text: s }] });

const TOOLS = [
  {
    name: 'about_conspace_rooms',
    description: 'What CONSPACE ROOMS is, who made it (Sinaida Krivchenko and UVALISS / Alisa Feer) and how to experience it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async execute() { return text(ABOUT); },
  },
  {
    name: 'list_soul_questions',
    description: 'The questions the souls ask visitors in CONSPACE ROOMS, grouped by soul (someone close, a child, a grown-up).',
    inputSchema: {
      type: 'object',
      properties: { lang: { type: 'string', enum: ['ru', 'en'], description: 'Language of the questions', default: 'en' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async execute({ lang = 'en' } = {}) {
      const labels = tIn(lang, 'soulLabels'), groups = tIn(lang, 'soulQuestions');
      return text(labels.map((l, i) => `${l}\n${groups[i].map(q => `- ${q}`).join('\n')}`).join('\n\n'));
    },
  },
];

export function registerWebMcp() {
  const mc = navigator.modelContext;
  if (!mc) return;
  try {
    if (typeof mc.registerTool === 'function') for (const tool of TOOLS) mc.registerTool(tool);
    else if (typeof mc.provideContext === 'function') mc.provideContext({ tools: TOOLS });
  } catch (e) { console.warn('[webmcp] not registered', e); }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
