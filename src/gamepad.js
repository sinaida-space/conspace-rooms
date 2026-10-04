// ── conspace-rooms · gamepad.js ─────────────────────────────────────────────
// A game controller walks the labyrinth too (standard mapping: Xbox,
// PlayStation, Switch Pro, Steam Deck). Read once a frame, nothing asked of
// the visitor and nothing stored or sent: the browser only lets the page see
// a controller after one of its buttons is pressed.
//   left stick   walk and step aside        right stick   look round
//   RT or L3     run                        A             look at a work / touch
//   B            close, stop                Y             back to the middle
//   Start        menu (D-pad moves in it, A chooses)

const DEAD = 0.18;
const dz = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
const prev = [];

function key(code, type = 'keydown') {
  dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
}

// once a frame, before the player moves: sets player.pad, fires the buttons
export function pollGamepad(player, router) {
  const pads = navigator.getGamepads?.() || [];
  const gp = [...pads].find(p => p && p.connected);
  if (!gp) { if (player) player.pad = null; return; }
  const b = i => !!gp.buttons[i]?.pressed;
  const ax = i => dz(gp.axes[i] || 0);
  if (player) {
    player.pad = {
      walk: -ax(1), strafe: ax(0), turn: ax(2), look: ax(3),
      run: (gp.buttons[7]?.value || 0) > 0.4 || b(10),
    };
  }
  const menu = document.getElementById('hud-menu');
  const inMenu = menu && !menu.classList.contains('hidden');
  const down = i => b(i) && !prev[i];
  if (down(0)) {
    if (inMenu) { if (menu.contains(document.activeElement)) document.activeElement.click(); }   // never a work behind the menu
    else router.emit('pick');
  }
  if (down(1)) { if (inMenu) key('Escape'); else router.emit('halt'); }
  if (down(3)) { key('Space'); key('Space', 'keyup'); }
  if (down(9)) key('Tab');
  if (inMenu && down(12)) key('ArrowUp');
  if (inMenu && down(13)) key('ArrowDown');
  for (let i = 0; i < gp.buttons.length; i++) prev[i] = b(i);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
