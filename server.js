'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const dice = require('./dice');
const { SYSTEMS, blankSheet, initiativeRoll, effStat, skillLevel, btmOf, meleeBonusOf, woundOf, sheetDamage } = require('./public/systems');
const BEST = require('./public/bestiary');
const CLASSES = require('./public/classes');
const { createStore } = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const MAX_CHAT = 300;
const MAX_IMAGE = 11 * 1024 * 1024;
const MAX_PORTRAIT = 400 * 1024;
const MAX_PORTRAITS_PER_ROOM = 200;
const FX_KINDS = ['slash', 'magic', 'blast', 'heal', 'shot'];
const DEFAULT_PORTRAITS = {
  dnd5e: ['guerreiro', 'mago', 'ladino', 'elfa', 'anao'],
  cyberpunk: ['netrunner', 'solo'],
  coc: ['investigador', 'ocultista'],
};
const COLORS = ['#e05252', '#4f9de0', '#52b86b', '#e0a852', '#a66be0', '#40c4c4', '#e06bb0', '#9aa84a'];

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
// Para o Render saber que o jogo está de pé e para o pinger que mantém o servidor acordado
app.get('/health', (req, res) => res.type('text').send('ok'));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));

// Retratos enviados pelos jogadores/mestre. O id é aleatório e o conteúdo nunca muda, então o navegador guarda em cache.
app.get('/img/:code/:id', (req, res) => {
  const data = rooms.get(req.params.code)?.images?.[req.params.id];
  const m = data && data.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(m[1]).send(Buffer.from(m[2], 'base64'));
});
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 12e6 });

const lanUrls = Object.values(os.networkInterfaces()).flat()
  .filter(i => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
  // IPs de Wi-Fi/rede de casa primeiro (VPNs como Tailscale ficam por último).
  .sort((a, b) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(b.address) - /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address))
  .map(i => `http://${i.address}:${PORT}`);

// ---------- helpers ----------
const str = (v, max = 80) => String(v ?? '').slice(0, max);
const num = (v, min, max, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const int = (v, min, max, def = 0) => Math.round(num(v, min, max, def));
const color = (v, def) => (/^#[0-9a-f]{6}$/i.test(v) ? v : def);
const newId = () => crypto.randomBytes(6).toString('hex');
const isImage = v => typeof v === 'string' && v.startsWith('data:image/') && v.length <= MAX_IMAGE;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 6 }, () => A[crypto.randomInt(A.length)]).join('');
  while (rooms.has(code));
  return code;
}

// ---------- salas e persistência ----------
const rooms = new Map();    // code -> estado da mesa (salvo em disco)
const presence = new Map(); // code -> Map(socketId -> { socket, pid, isGM })

function createRoom(system) {
  return {
    code: newCode(),
    system,
    gmKey: crypto.randomBytes(16).toString('hex'),
    createdAt: Date.now(),
    players: {},
    tokens: {},
    sheets: {},
    chat: [],
    notes: '',
    images: {},
    settings: { autoCombat: true, collision: true, playersPickClass: true, lockSheets: false },
    classes: [],
    story: { text: '', scenes: [], current: -1 },
    combat: null,
    objects: {},
    map: { grid: 60, cols: 24, rows: 16, fogEnabled: false, image: null, imageW: 0, imageH: 0, playerImage: null, fogVersion: 0 },
    revealed: new Set(),
    init: { list: [], turnId: null, round: 1 },
  };
}

// Arquivo local ou Supabase (quando SUPABASE_URL e SUPABASE_SECRET_KEY existem) — ver store.js
const store = createStore();

async function load() {
  try {
    for (const r of await store.loadAll()) {
      r.revealed = new Set(r.revealed);
      r.images ||= {};
      r.settings ||= { autoCombat: true };
      r.settings.collision ??= true;
      r.settings.playersPickClass ??= true;
      r.settings.lockSheets ??= false;
      r.classes ||= [];
      r.story ||= { text: '', scenes: [], current: -1 };
      r.combat ??= null;
      r.objects ||= {};
      r.demo = null; // o laço da demonstração não sobrevive a um reinício do servidor
      rooms.set(r.code, r);
    }
    console.log(`${rooms.size} mesa(s) carregada(s) de ${store.kind}.`);
  } catch (e) {
    console.error('Falha ao ler as mesas salvas:', e.message);
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1500);
}
function save() {
  clearTimeout(saveTimer);
  return store.saveRooms(rooms);
}

const clients = room => [...(presence.get(room.code)?.values() ?? [])];
const canSee = (msg, c) => !msg.hidden || c.isGM || c.pid === msg.pid;
const charName = (room, pid) => room.sheets[pid]?.info?.name || room.players[pid]?.name || '???';

const portraitOf = (room, pid) => Object.values(room.tokens).find(t => t.owner === pid)?.img || null;

function hpState(hp, max) {
  if (!(max > 0)) return null;
  if (hp <= 0) return 'down';
  return hp / max <= 0.5 ? 'hurt' : 'ok';
}

// Aceita retrato da galeria ("lib:goblin"), enviado ("up:<id>") ou nenhum.
function validImg(room, v) {
  if (!v) return null;
  if (/^lib:[a-z0-9-]{1,30}$/.test(v)) return v;
  const m = /^up:([0-9a-f]{12})$/.exec(v);
  return m && room.images[m[1]] ? v : undefined;
}

// Anima dano/cura para todos que enxergam o token. O número só vai para quem pode ver os PV.
function hpFx(room, t, before, after) {
  if (before == null || after == null || before === after) return;
  const delta = after - before;
  for (const c of clients(room)) {
    if (!tokenVisible(room, t, c.pid, c.isGM)) continue;
    const showNumber = c.isGM || !!t.owner;
    c.socket.emit('fx', { kind: delta < 0 ? 'hit' : 'heal', tokenId: t.id, amount: showNumber ? Math.abs(delta) : null, down: after <= 0 });
  }
}

function tokenVisible(room, t, pid, isGM) {
  if (isGM || t.owner === pid) return true;
  if (t.hidden) return false;
  if (!room.map.fogEnabled) return true;
  const s = t.size || 1;
  return room.revealed.has(`${Math.floor(t.x + s / 2)},${Math.floor(t.y + s / 2)}`);
}

// O que cada pessoa pode ver. Jogador nunca recebe token oculto, PV de monstro, fichas alheias ou notas do mestre.
function view(room, pid, isGM) {
  const online = new Set(clients(room).map(c => c.pid));
  const { image, playerImage, walls, ...map } = room.map;
  return {
    code: room.code,
    system: room.system,
    you: { pid, isGM },
    map: { ...map, hasImage: !!image },
    revealed: [...room.revealed],
    players: Object.values(room.players).map(p => ({ ...p, charName: charName(room, p.id), img: portraitOf(room, p.id), online: online.has(p.id) || !!p.bot })),
    tokens: Object.values(room.tokens).filter(t => tokenVisible(room, t, pid, isGM)).map(t => {
      const v = { ...t };
      const sheet = t.owner && room.sheets[t.owner];
      if (sheet) {
        v.name = charName(room, t.owner);
        v.hp = sheet.res?.hp?.cur;
        v.maxHp = sheet.res?.hp?.max;
      } else if (!isGM) {
        // Jogador vê só o estado geral do monstro (ferido, caído), nunca os PV exatos.
        v.hpState = hpState(t.hp, t.maxHp);
        delete v.hp;
        delete v.maxHp;
      }
      if (!isGM) { delete v.vision; delete v.initMod; delete v.ignore; delete v.stats; }
      return v;
    }),
    combat: room.combat ? { active: true } : null,
    demo: !!room.demo,
    settings: isGM ? room.settings : { playersPickClass: room.settings.playersPickClass, lockSheets: room.settings.lockSheets },
    classes: room.classes,
    hasWalls: !!walls,
    walls: wallsView(room, isGM),
    objects: Object.values(room.objects).filter(o => objectVisible(room, o, isGM)).map(o => objectView(o, isGM)),
    sheets: isGM ? room.sheets : room.sheets[pid] ? { [pid]: room.sheets[pid] } : {},
    init: {
      ...room.init,
      list: room.init.list.map(e => (e.hidden && !isGM ? { id: e.id, name: '???', value: e.value, hidden: true } : e)),
    },
    notes: isGM ? room.notes : undefined,
    story: isGM ? room.story : undefined,
  };
}

function sync(room) {
  for (const c of clients(room)) c.socket.emit('state', view(room, c.pid, c.isGM));
  scheduleSave();
}

function post(room, msg) {
  const m = { id: newId(), ts: Date.now(), ...msg };
  room.chat.push(m);
  if (room.chat.length > MAX_CHAT) room.chat.splice(0, room.chat.length - MAX_CHAT);
  for (const c of clients(room)) if (canSee(m, c)) c.socket.emit('chat:msg', m);
  scheduleSave();
}

function performRoll(req) {
  switch (req?.kind) {
    case 'd20': return dice.rollD20(int(req.mod, -99, 99), ['adv', 'dis'].includes(req.mode) ? req.mode : 'normal');
    case 'd10': return dice.rollCyber(int(req.base, -99, 99));
    case 'd100': return dice.rollCoc(int(req.skill, 0, 200, 50), int(req.bp, -2, 2));
    case 'flat': return { kind: 'flat', total: int(req.value, -99, 999) };
    case 'expr': return dice.rollExpression(req.expr);
    default: return null;
  }
}

function sortInit(room) {
  room.init.list.sort((a, b) => b.value - a.value);
}

function cleanSheet(system, input) {
  const base = blankSheet(system, '');
  const s = input && typeof input === 'object' ? input : {};
  const statKeys = Object.keys(base.stats);
  const out = { info: {}, res: {}, stats: {}, skills: [], notes: str(s.notes, 8000) };
  for (const k of Object.keys(base.info)) out.info[k] = str(s.info?.[k], 60);
  for (const k of Object.keys(base.res)) {
    out.res[k] = { cur: int(s.res?.[k]?.cur, -999, 9999, base.res[k].cur), max: int(s.res?.[k]?.max, 0, 9999, base.res[k].max) };
  }
  for (const k of statKeys) out.stats[k] = int(s.stats?.[k], -99, 999, base.stats[k]);
  if (Array.isArray(s.skills)) {
    out.skills = s.skills.slice(0, 80).map(k => ({
      name: str(k?.name, 50),
      stat: statKeys.includes(k?.stat) ? k.stat : statKeys[0],
      value: int(k?.value, -99, 999),
      prof: !!k?.prof,
    }));
  }
  out.attacks = Array.isArray(s.attacks) ? s.attacks.slice(0, 10).map(cleanAttack) : base.attacks;
  out.abilities = Array.isArray(s.abilities) ? s.abilities.slice(0, 12).map(cleanAbility) : [];
  out.classId = str(s.classId, 20);
  const sys = SYSTEMS[system];
  // Cyberpunk 2020: Blindagem PB por parte do corpo, Fluxovida e implantes cibernéticos
  if (sys.armor) out.armor = Object.fromEntries(sys.armor.map(a => [a.key, int(s.armor?.[a.key], 0, 99, 0)]));
  if (sys.lifepath) {
    out.life = Object.fromEntries(sys.lifepath.map(f => [f.key, str(s.life?.[f.key], f.long ? 3000 : 120)]));
    out.cyber = (Array.isArray(s.cyber) ? s.cyber : []).slice(0, 40).map(c => ({ name: str(c?.name, 60), hc: int(c?.hc, 0, 99), cost: int(c?.cost, 0, 9999999) }));
  }
  return out;
}

// Habilidade de classe (mesmo formato das habilidades do bestiário, mais usos por descanso).
const ABILITY_TYPES = ['area', 'heal', 'special', 'passive'];
const SAVE_KEYS = ['des', 'for', 'con', 'sab', 'none'];
const ABILITY_FX = ['blast', 'magic', 'slash', 'shot', 'heal', 'dust'];
function cleanAbility(a) {
  const type = ABILITY_TYPES.includes(a?.type) ? a.type : 'special';
  const uses = int(a?.uses, 0, 20);
  const dmg = typeof a?.damage === 'string' && a.damage.trim() && a.damage.trim() !== '0' ? validDamage(a.damage, '') : '';
  return {
    name: str(a?.name, 40).trim() || 'Habilidade',
    type,
    text: str(a?.text, 300),
    damage: type === 'area' ? dmg : '',
    amount: type === 'heal' ? validDamage(a?.amount, '1d8') : '',
    radius: int(a?.radius, 0, 10),
    range: int(a?.range, 1, 60, type === 'heal' ? 1 : 12),
    save: SAVE_KEYS.includes(a?.save) ? a.save : 'des',
    dc: int(a?.dc, 1, 30, 13),
    half: !!a?.half,
    fx: ABILITY_FX.includes(a?.fx) ? a.fx : type === 'heal' ? 'heal' : 'magic',
    uses,
    left: uses ? int(a?.left, 0, uses, uses) : 0,
  };
}

// Classe cadastrada pelo mestre.
function cleanClass(system, c) {
  const sys = SYSTEMS[system];
  const res = {};
  for (const r of sys.resources) { const v = int(c?.res?.[r.key], 0, 9999, 0); if (v > 0) res[r.key] = v; }
  const stats = {};
  for (const s of sys.stats) { const v = c?.stats?.[s.key]; if (v !== '' && v != null && Number.isFinite(Number(v))) stats[s.key] = int(v, -99, 999); }
  return {
    id: /^[0-9a-f]{12}$/.test(c?.id) ? c.id : newId(),
    name: str(c?.name, 40).trim() || 'Nova classe',
    desc: str(c?.desc, 400),
    res,
    def: str(c?.def, 10),
    stats,
    skills: (Array.isArray(c?.skills) ? c.skills : []).slice(0, 30)
      .map(k => ({ name: str(k?.name, 50).trim(), value: int(k?.value, 0, 999), prof: !!k?.prof }))
      .filter(k => k.name),
    attacks: (Array.isArray(c?.attacks) ? c.attacks : []).slice(0, 10).map(cleanAttack),
    abilities: (Array.isArray(c?.abilities) ? c.abilities : []).slice(0, 12).map(cleanAbility),
    gear: str(c?.gear, 1000),
  };
}

// Aplica a classe à ficha: nome da classe, PV, defesa, atributos, perícias, ataques, habilidades e equipamento.
function applyClass(room, pid, cls) {
  const sh = room.sheets[pid];
  if (!sh) return;
  const sys = SYSTEMS[room.system];
  const field = CLASSES.CLASS_FIELD[room.system];
  const level = / (\d+)$/.exec(sh.info[field] || '')?.[1];
  sh.info[field] = room.system === 'dnd5e' ? `${cls.name} ${level || 1}` : cls.name;
  const defField = CLASSES.DEF_FIELD[room.system];
  if (defField && cls.def) sh.info[defField] = cls.def;
  for (const [k, v] of Object.entries(cls.res)) if (sh.res[k]) sh.res[k] = { cur: v, max: v };
  Object.assign(sh.stats, cls.stats);
  if (room.system === 'cyberpunk') {
    // 2020: PB da armadura vai para torso e braços; Humanidade máxima = EMP × 10
    if (cls.def && sh.armor) for (const k of ['torso', 'rarm', 'larm']) sh.armor[k] = int(cls.def, 0, 99);
    const max = (Number(sh.stats.emp) || 0) * 10;
    if (sh.res.hum) sh.res.hum = { cur: Math.min(max, cls.res.hum ?? max), max };
  }
  for (const k of cls.skills) {
    let sk = sh.skills.find(s => s.name.toLowerCase() === k.name.toLowerCase());
    if (!sk) {
      sk = { name: k.name, stat: sys.skills.find(([n]) => n === k.name)?.[1] || sys.stats[0].key, value: 0, prof: false };
      sh.skills.push(sk);
    }
    if (sys.skillMode === 'prof') sk.prof = sk.prof || k.prof || !k.value;
    else sk.value = Math.max(sk.value || 0, k.value || 0);
  }
  if (cls.attacks.length) sh.attacks = structuredClone(cls.attacks);
  sh.abilities = cls.abilities.map(a => ({ ...structuredClone(a), left: a.uses }));
  if (cls.gear && !sh.notes.includes(cls.gear)) sh.notes = `${sh.notes ? `${sh.notes}\n` : ''}Equipamento (${cls.name}): ${cls.gear}`.slice(0, 8000);
  sh.classId = cls.id;
  post(room, { type: 'system', text: `📚 ${charName(room, pid)} agora é ${cls.name}.` });
}

const ATTACK_TYPES = ['melee', 'ranged', 'spell'];
function cleanAttack(a) {
  const type = ATTACK_TYPES.includes(a?.type) ? a.type : 'melee';
  const out = {
    name: str(a?.name, 40).trim() || 'Ataque',
    type,
    bonus: int(a?.bonus, -20, 200),
    damage: validDamage(a?.damage, '1d6'),
    range: type === 'melee' ? 1 : int(a?.range, 1, 200, 12),
  };
  // Cyberpunk 2020: a perícia da arma (Armas Curtas, Fuzil, Briga…) soma com o REF; bonus vira a Precisão da arma.
  if (a?.skill) out.skill = str(a.skill, 50);
  return out;
}

// ---------- combate automático ----------
// Um monstro "avista" um herói quando ele está dentro do alcance de visão e não há parede no meio.
const DEFAULT_VISION = 6;
const DEFAULT_INIT = { dnd5e: 0, cyberpunk: 5, coc: 50 };
const tokenCenter = t => ({ x: t.x + (t.size || 1) / 2, y: t.y + (t.size || 1) / 2 });
const isDown = t => t.maxHp > 0 && t.hp <= 0;

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (d === 0) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return u > 0 && u < 1 && v >= 0 && v <= 1;
}

// ---------- paredes, portas e passagens ----------
// Grade efetiva: parede do mapa, menos paredes quebradas e passagens secretas abertas, mais portas fechadas.
function blockGrid(room) {
  const { walls, cols, rows } = room.map;
  const grid = new Uint8Array(cols * rows);
  if (walls?.cells) for (let i = 0; i < grid.length; i++) grid[i] = walls.cells.charCodeAt(i) !== 48 ? 1 : 0;
  for (const o of Object.values(room.objects)) {
    if (o.edge || o.x >= cols || o.y >= rows) continue;
    const i = o.y * cols + o.x;
    if ((o.type === 'crack' && o.broken) || (o.type === 'secret' && o.open)) grid[i] = 0;
    else if (o.type === 'door' && !o.open) grid[i] = 1;
  }
  return grid;
}

// Paredes finas (casa) em pedaços de 1 quadrado: "v x,y" fica entre (x-1,y) e (x,y); "h x,y" entre (x,y-1) e (x,y).
function unitEdges(segments) {
  const out = [];
  for (const [x1, y1, x2, y2] of segments || []) {
    if (x1 === x2) for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) out.push(`v${x1},${y}`);
    else if (y1 === y2) for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) out.push(`h${x},${y1}`);
  }
  return out;
}

function blockedEdges(room) {
  const set = new Set(unitEdges(room.map.walls?.segments));
  for (const o of Object.values(room.objects)) if (o.type === 'door' && o.edge && !o.open) set.add(`${o.v ? 'v' : 'h'}${o.x},${o.y}`);
  return set;
}

function stepBlocked(edges, c1, r1, c2, r2) {
  if (c2 === c1 + 1) return edges.has(`v${c2},${r1}`);
  if (c2 === c1 - 1) return edges.has(`v${c1},${r1}`);
  if (r2 === r1 + 1) return edges.has(`h${c1},${r2}`);
  if (r2 === r1 - 1) return edges.has(`h${c1},${r1}`);
  return false;
}

function lineOfSight(room, a, b, grid = blockGrid(room), edges = blockedEdges(room)) {
  const { cols, rows } = room.map;
  const ka = `${Math.floor(a.x)},${Math.floor(a.y)}`;
  const kb = `${Math.floor(b.x)},${Math.floor(b.y)}`;
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4);
  for (let i = 1; i < steps; i++) {
    const c = Math.floor(a.x + ((b.x - a.x) * i) / steps);
    const r = Math.floor(a.y + ((b.y - a.y) * i) / steps);
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    const k = `${c},${r}`;
    if (k !== ka && k !== kb && grid[r * cols + c]) return false;
  }
  for (const e of edges) {
    const [x, y] = e.slice(1).split(',').map(Number);
    const v = e[0] === 'v';
    if (segmentsCross(a.x, a.y, b.x, b.y, x, y, v ? x : x + 1, v ? y + 1 : y)) return false;
  }
  return true;
}

// Caminho andando (sem atravessar parede ou porta fechada). Devolve a lista de quadrados ou null.
function findPath(room, from, to) {
  const { cols, rows } = room.map;
  if (to.x < 0 || to.y < 0 || to.x >= cols || to.y >= rows) return null;
  const grid = blockGrid(room);
  const edges = blockedEdges(room);
  if (grid[to.y * cols + to.x]) return null;
  const prev = new Int32Array(cols * rows).fill(-2);
  const start = Math.max(0, Math.min(cols - 1, from.x)) + Math.max(0, Math.min(rows - 1, from.y)) * cols;
  const goal = to.y * cols + to.x;
  prev[start] = -1;
  const q = [start];
  for (let i = 0; i < q.length && prev[goal] === -2; i++) {
    const cur = q[i]; const c = cur % cols; const r = Math.floor(cur / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dx; const nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (prev[n] !== -2 || grid[n] || stepBlocked(edges, c, r, nc, nr)) continue;
      prev[n] = cur;
      q.push(n);
    }
  }
  if (prev[goal] === -2) return null;
  const path = [];
  for (let n = goal; n !== -1; n = prev[n]) path.unshift({ x: n % cols, y: Math.floor(n / cols) });
  return path;
}

// Pares [monstro, herói avistado]. Monstro "calmo" (combate encerrado pelo mestre) só volta a vigiar
// depois que os heróis saem da vista dele.
function spotters(room) {
  const heroes = Object.values(room.tokens).filter(t => t.owner);
  const out = [];
  const grid = blockGrid(room);
  const edges = blockedEdges(room);
  for (const m of Object.values(room.tokens)) {
    if (m.owner || isDown(m)) continue;
    const vision = m.vision ?? DEFAULT_VISION;
    if (vision <= 0) continue;
    const mc = tokenCenter(m);
    const target = heroes.find(h => {
      const hc = tokenCenter(h);
      return Math.hypot(hc.x - mc.x, hc.y - mc.y) <= vision + 0.01 && lineOfSight(room, mc, hc, grid, edges);
    });
    if (m.ignore) { if (!target) m.ignore = false; continue; }
    if (target) out.push([m, target]);
  }
  return out;
}

function monsterInitRoll(room, t) {
  const mod = Number.isFinite(t.initMod) ? t.initMod : DEFAULT_INIT[room.system];
  if (room.system === 'dnd5e') return { kind: 'd20', mod };
  if (room.system === 'cyberpunk') return { kind: 'd10', base: mod };
  return { kind: 'flat', value: mod };
}

// O monstro que entra na luta aparece para todos (sai do oculto e da névoa em volta dele).
function addMonsterToFight(room, m) {
  m.hidden = false;
  const s = m.size || 1;
  const x0 = Math.round(m.x); const y0 = Math.round(m.y);
  for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) {
    const c = x0 + dx; const r = y0 + dy;
    if (c >= 0 && r >= 0 && c < room.map.cols && r < room.map.rows) room.revealed.add(`${c},${r}`);
  }
  room.map.fogVersion++;
  const roll = performRoll(monsterInitRoll(room, m));
  room.init.list.push({ id: newId(), name: m.name, value: roll.total, tokenId: m.id, hidden: false });
}

// Devolve os eventos de combate; quem chama emite depois do sync, para o cliente já ter o estado novo.
// Começa a luta: iniciativa de todos os heróis de pé + os monstros envolvidos.
// headline muda o texto do aviso (ex.: quando é o jogador quem ataca primeiro).
function beginCombat(room, spotted, headline) {
  room.combat = { startedAt: Date.now() };
  room.init = { list: [], turnId: null, round: 1 };
  for (const h of Object.values(room.tokens).filter(t => t.owner)) {
    const sheet = room.sheets[h.owner];
    if (!sheet || isOut(room, h)) continue; // herói caído não entra na nova luta
    const roll = performRoll(initiativeRoll(room.system, sheet));
    room.init.list.push({ id: newId(), name: charName(room, h.owner), value: roll.total, pid: h.owner, hidden: false });
  }
  for (const [m] of spotted) addMonsterToFight(room, m);
  sortInit(room);
  room.init.turnId = room.init.list[0]?.id || null;
  const [m, h] = spotted[0];
  const target = charName(room, h.owner);
  const text = headline || `${m.name} avistou ${target}`;
  post(room, { type: 'system', text: `⚔ Combate! ${text}. Iniciativa: ${room.init.list.map(e => `${e.name} ${e.value}`).join(', ')}.` });
  return [{ type: 'start', tokenId: m.id, name: m.name, target, headline, spotters: spotted.map(([x]) => x.id) }];
}

function checkCombat(room) {
  if (!room.settings.autoCombat) return [];
  const spotted = spotters(room);
  if (!spotted.length) return [];
  if (!room.combat) return beginCombat(room, spotted);
  const inFight = new Set(room.init.list.map(e => e.tokenId).filter(Boolean));
  const fresh = spotted.filter(([m]) => !inFight.has(m.id));
  if (!fresh.length) return [];
  for (const [m] of fresh) addMonsterToFight(room, m);
  sortInit(room);
  const names = fresh.map(([m]) => m.name).join(', ');
  post(room, { type: 'system', text: `⚔ ${names} ${fresh.length > 1 ? 'entraram' : 'entrou'} no combate!` });
  return [{ type: 'join', tokenId: fresh[0][0].id, name: names, spotters: fresh.map(([x]) => x.id) }];
}

function endCombat(room, victory) {
  if (!room.combat) return [];
  if (!victory) for (const [m] of spotters(room)) m.ignore = true;
  room.combat = null;
  room.init = { list: [], turnId: null, round: 1 };
  for (const t of Object.values(room.tokens)) delete t.stunned; // fim da luta: ninguém fica atordoado
  const othersLeft = Object.values(room.tokens).some(t => !t.owner && !isDown(t));
  post(room, { type: 'system', text: victory ? (othersLeft ? '🏆 Vitória! Os inimigos desta luta caíram.' : '🏆 Vitória! Todos os inimigos caíram.') : 'O combate terminou.' });
  return [{ type: 'end', victory }];
}

function checkVictory(room) {
  if (!room.combat) return [];
  const foes = room.init.list.filter(e => e.tokenId);
  if (!foes.length || !foes.every(e => !room.tokens[e.tokenId] || isDown(room.tokens[e.tokenId]))) return [];
  return endCombat(room, true);
}

// Sincroniza e só então avisa do combate (banner, "!" em cima do monstro).
function syncAndFight(room, events = checkCombat(room)) {
  sync(room);
  for (const ev of events) for (const c of clients(room)) c.socket.emit('combat', ev);
  scheduleAuto(room);
}

function cleanWalls(w, cols, rows) {
  if (!w || typeof w !== 'object') return null;
  // 0 livre, 1 parede, 2 árvore, 3-7 casa/prédio (altura do relevo)
  const cells = typeof w.cells === 'string' && w.cells.length === cols * rows && /^[0-9]*$/.test(w.cells) ? w.cells : null;
  const segments = Array.isArray(w.segments)
    ? w.segments.slice(0, 1000).filter(s => Array.isArray(s) && s.length === 4 && s.every(n => Number.isFinite(n))).map(s => s.map(Number))
    : [];
  return cells || segments.length ? { cells, segments } : null;
}

// ---------- objetos interativos ----------
const OBJ_TYPES = ['door', 'chest', 'trap', 'torch', 'lever', 'secret', 'crack'];
const TRAP_DEFAULT = { dnd5e: '2d6', cyberpunk: '2d6', coc: '1d6' };
const validDamage = (v, def) => (typeof v === 'string' && /^\d{1,2}d\d{1,3}([+-]\d{1,3})?$/.test(v.replace(/\s+/g, '')) ? v.replace(/\s+/g, '') : def);

function makeObject(o, cols, rows, system) {
  if (!o || !OBJ_TYPES.includes(o.type)) return null;
  // Portas de borda (casa) podem ficar na linha x = cols / y = rows.
  const x = int(o.x, 0, cols, -1);
  const y = int(o.y, 0, rows, -1);
  if (x < 0 || y < 0 || (!o.edge && (x >= cols || y >= rows))) return null;
  const obj = { id: newId(), type: o.type, x, y };
  if (o.type === 'door') Object.assign(obj, { edge: !!o.edge, v: !!o.v, dir: o.dir === 'h' ? 'h' : 'v', bars: !!o.bars, tech: !!o.tech, open: !!o.open });
  if (o.type === 'chest') Object.assign(obj, { loot: str(o.loot, 200).trim() || 'nada além de poeira', open: false });
  if (o.type === 'trap') Object.assign(obj, { damage: validDamage(o.damage, TRAP_DEFAULT[system] || '2d6'), armed: true, revealed: false });
  if (o.type === 'torch') Object.assign(obj, { lit: o.lit !== false, candle: !!o.candle, color: /^\d{1,3},\d{1,3},\d{1,3}$/.test(o.color) ? o.color : '255,170,60' });
  if (o.type === 'lever') Object.assign(obj, { on: false, target: null });
  if (o.type === 'secret') Object.assign(obj, { open: false });
  if (o.type === 'crack') Object.assign(obj, { broken: !!o.broken });
  return obj;
}

// Objetos do gerador. A alavanca aponta para a passagem secreta pela posição na lista.
function cleanObjects(list, cols, rows, system) {
  const out = {};
  if (!Array.isArray(list)) return out;
  const ids = list.slice(0, 400).map(o => {
    const obj = makeObject(o, cols, rows, system);
    if (obj) out[obj.id] = obj;
    return obj?.id ?? null;
  });
  list.slice(0, 400).forEach((o, i) => {
    if (o?.type === 'lever' && ids[i] && Number.isInteger(o.target)) out[ids[i]].target = ids[o.target] ?? null;
  });
  return out;
}

const objCells = o => (o.edge ? (o.v ? [[o.x - 1, o.y], [o.x, o.y]] : [[o.x, o.y - 1], [o.x, o.y]]) : [[o.x, o.y]]);

// Jogador não vê armadilha armada, passagem secreta fechada nem nada que esteja debaixo da névoa.
function objectVisible(room, o, isGM) {
  if (isGM) return true;
  if (o.type === 'trap' && !o.revealed) return false;
  if (o.type === 'secret' && !o.open) return false;
  if (!room.map.fogEnabled) return true;
  return objCells(o).some(([c, r]) => room.revealed.has(`${c},${r}`));
}

function objectView(o, isGM) {
  if (isGM) return o;
  const v = { ...o };
  if (o.type === 'chest' && !o.open) delete v.loot;
  delete v.target;
  return v;
}

// Paredes para o relevo 2.5D. O jogador só recebe as paredes das áreas reveladas (senão veria o mapa inteiro).
function wallsView(room, isGM) {
  const w = room.map.walls;
  if (!w) return null;
  if (isGM || !room.map.fogEnabled) return w;
  const { cols } = room.map;
  const seen = (c, r) => room.revealed.has(`${c},${r}`);
  let cells = null;
  if (w.cells) {
    const arr = w.cells.split('');
    for (let i = 0; i < arr.length; i++) if (arr[i] !== '0' && !seen(i % cols, Math.floor(i / cols))) arr[i] = '0';
    cells = arr.join('');
  }
  const segments = unitEdges(w.segments).filter(e => {
    const [x, y] = e.slice(1).split(',').map(Number);
    return e[0] === 'v' ? seen(x - 1, y) || seen(x, y) : seen(x, y - 1) || seen(x, y);
  }).map(e => {
    const [x, y] = e.slice(1).split(',').map(Number);
    return e[0] === 'v' ? [x, y, x, y + 1] : [x, y, x + 1, y];
  });
  return { cells, segments };
}

// Teste simples por sistema: DES para esquivar de armadilha, FOR para quebrar parede.
function attributeCheck(room, sheet, attr) {
  const st = sheet?.stats || {};
  if (room.system === 'dnd5e') {
    const roll = dice.rollD20(Math.floor(((st[attr === 'des' ? 'des' : 'for'] ?? 10) - 10) / 2));
    return { roll, success: roll.total >= 13, target: 'CD 13' };
  }
  if (room.system === 'cyberpunk') {
    // 2020: atributo + perícia + 1d10 contra a dificuldade Média (15). Armadilha: REF + Atletismo; parede: TCO + Feitos de Força.
    const [stat, skill] = attr === 'des' ? ['ref', 'Atletismo'] : ['tco', 'Feitos de Força'];
    const roll = dice.rollCyber(effStat('cyberpunk', sheet, stat) + skillLevel(sheet, skill));
    return { roll, success: roll.first !== 1 && roll.total >= 15, target: 'Média, 15' };
  }
  const roll = dice.rollCoc(st[attr === 'des' ? 'des' : 'for'] ?? 50, 0);
  return { roll, success: !['fail', 'fumble'].includes(roll.level), target: null };
}

const heroAuthor = (room, pid) => ({ pid, name: charName(room, pid), color: room.players[pid]?.color, img: portraitOf(room, pid), isGM: false });

function emitFx(room, fx) {
  for (const c of clients(room)) c.socket.emit('fx', fx);
}

function triggerTrap(room, hero, trap) {
  trap.armed = false;
  trap.revealed = true;
  const g = room.map.grid;
  emitFx(room, { kind: 'trap', x: (trap.x + 0.5) * g, y: (trap.y + 0.5) * g });
  const sheet = room.sheets[hero.owner];
  const name = charName(room, hero.owner);
  const check = attributeCheck(room, sheet, 'des');
  post(room, { ...heroAuthor(room, hero.owner), type: 'roll', label: `⚠ Armadilha! Esquiva de ${name}${check.target ? ` (${check.target})` : ''}`, roll: check.roll, hidden: false });
  if (check.success || !sheet) {
    post(room, { type: 'system', text: `${name} pulou para trás bem a tempo e escapou da armadilha!` });
    return;
  }
  const dmg = dice.rollExpression(trap.damage).total;
  if (room.system === 'cyberpunk') {
    // 2020: o dano da armadilha passa pela blindagem do local atingido e pelo MTC
    post(room, { type: 'system', text: `💥 ${name} caiu numa armadilha!` });
    hit2020(room, hero, dmg, Math.random() < 0.5 ? 'rleg' : 'lleg');
    return;
  }
  const before = sheet.res.hp.cur;
  sheet.res.hp.cur = before - dmg;
  hpFx(room, hero, before, sheet.res.hp.cur);
  post(room, { type: 'system', text: `💥 ${name} caiu numa armadilha e sofreu ${dmg} de dano!` });
}

// ---------- ataques e habilidades (bestiário) ----------
const tokenName = (room, t) => (t.owner ? charName(room, t.owner) : t.name);
const isHero = t => !!t.owner;
function isOut(room, t) {
  if (!t) return true;
  if (t.owner) return (room.sheets[t.owner]?.res?.hp?.cur ?? 1) <= 0;
  return isDown(t);
}

// Distância "em quadrados" entre dois tokens (0 = encostados, inclusive na diagonal).
function gapBetween(a, b) {
  const ca = tokenCenter(a); const cb = tokenCenter(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y)) - ((a.size || 1) + (b.size || 1)) / 2;
}

const monsterAuthor = t => ({ pid: null, tokenId: t.id, name: t.name, color: t.color, img: t.img, isGM: false });
const actorAuthor = (room, t) => (t.owner ? { ...heroAuthor(room, t.owner), tokenId: t.id } : monsterAuthor(t));

function defenseOf(room, t) {
  if (t.owner) return parseInt(room.sheets[t.owner]?.info?.ac, 10) || 10;
  return t.stats?.def ?? 10;
}


// Defesa no corpo a corpo do Cyberpunk 2020: REF do defensor + a melhor perícia de defesa + 1d10.
const MELEE_DEFENSE = ['Esquivar/Escapar', 'Artes Marciais', 'Briga', 'Esgrima', 'Armas Brancas', 'Atletismo'];
function evadeRoll(room, t) {
  if (!t.owner) return dice.rollCyber(Math.max(0, monsterRef(t) - monsterWoundMod(t)) + (t.stats?.dodge ?? 2));
  const sh = room.sheets[t.owner];
  return dice.rollCyber(effStat('cyberpunk', sh, 'ref') + Math.max(0, ...MELEE_DEFENSE.map(n => skillLevel(sh, n))));
}

// Teste de resistência do alvo contra uma habilidade. attr: des | for | con | sab.
function saveVs(room, t, attr, dc) {
  const st = t.owner ? room.sheets[t.owner]?.stats || {} : {};
  if (room.system === 'dnd5e') {
    const key = { des: 'des', for: 'for', con: 'con', sab: 'sab' }[attr] || 'des';
    const roll = dice.rollD20(t.owner ? Math.floor(((st[key] ?? 10) - 10) / 2) : 0);
    return { roll, success: roll.total >= dc };
  }
  if (room.system === 'cyberpunk') {
    // DES → REF + Esquivar/Escapar; FOR/CON → TCO + Resistência; SAB → AuCon + Resistência Tortura/Drogas
    const [key, skill] = { des: ['ref', 'Esquivar/Escapar'], for: ['tco', 'Resistência'], con: ['tco', 'Resistência'], sab: ['cool', 'Resistência Tortura/Drogas'] }[attr] || ['ref', 'Esquivar/Escapar'];
    const sh = t.owner && room.sheets[t.owner];
    const base = sh ? effStat('cyberpunk', sh, key) + skillLevel(sh, skill) : (key === 'ref' ? monsterRef(t) + (t.stats?.dodge ?? 2) : (t.stats?.[key] ?? 6));
    const roll = dice.rollCyber(base);
    return { roll, success: roll.first !== 1 && roll.total >= dc };
  }
  const key = { des: 'des', for: 'for', con: 'con', sab: 'pod' }[attr] || 'des';
  const roll = dice.rollCoc(t.owner ? st[key] ?? 50 : 50, 0);
  return { roll, success: !['fail', 'fumble'].includes(roll.level) };
}

function applyDamage(room, t, dmg) {
  if (dmg <= 0) return;
  let before;
  let after;
  if (t.owner) {
    const sh = room.sheets[t.owner];
    if (!sh) return;
    before = sh.res.hp.cur;
    after = sh.res.hp.cur = before - dmg;
  } else {
    before = t.hp ?? 0;
    after = t.hp = before - dmg;
  }
  hpFx(room, t, before, after);
  if (room.combat) room.combat.lastHitRound = room.init.round;
  if (before > 0 && after <= 0) post(room, { type: 'system', text: `☠ ${tokenName(room, t)} caiu!` });
}

// Dobra os dados do dano num crítico do D&D (2d6+3 → 4d6+3).
const doubleDice = expr => expr.replace(/(\d*)d(\d+)/g, (m, n, s) => `${(Number(n) || 1) * 2}d${s}`);

function resolveAttack(room, attacker, atk, target) {
  if (room.system === 'cyberpunk') return resolveAttack2020(room, attacker, atk, target);
  const g = room.map.grid;
  const aName = tokenName(room, attacker);
  const tName = tokenName(room, target);
  const tc = tokenCenter(target);
  const fxKind = atk.type === 'melee' ? 'slash' : atk.type === 'spell' ? 'magic' : 'shot';
  emitFx(room, { kind: fxKind, x: tc.x * g, y: tc.y * g, from: fxKind === 'shot' ? attacker.id : null, color: attacker.color });
  let roll;
  let hit;
  let crit = false;
  let versus = '';
  if (room.system === 'dnd5e') {
    const ac = defenseOf(room, target);
    roll = dice.rollD20(atk.bonus);
    crit = roll.natural === 20;
    hit = crit || (roll.natural !== 1 && roll.total >= ac);
    versus = `CA ${ac}`;
  } else {
    roll = dice.rollCoc(atk.bonus, 0);
    hit = !['fail', 'fumble'].includes(roll.level);
    crit = roll.level === 'extreme' || roll.level === 'critical';
    versus = `${atk.bonus}%`;
  }
  post(room, { ...actorAuthor(room, attacker), type: 'roll', label: `⚔ ${atk.name} em ${tName} (${versus})`, roll, hidden: false });
  if (!hit) {
    post(room, { type: 'system', text: `${aName} errou ${tName}.` });
    return;
  }
  const dmgRoll = dice.rollExpression(crit && room.system === 'dnd5e' ? doubleDice(atk.damage) : atk.damage);
  const dmg = dmgRoll.total;
  const note = crit ? ' — crítico!' : '';
  post(room, { ...actorAuthor(room, attacker), type: 'roll', label: `💥 Dano de ${atk.name}${note}`, roll: dmgRoll, hidden: false });
  applyDamage(room, target, dmg);
}

// ---------- Cyberpunk 2020 ----------
// Monstros: REF, TCO e MTC vêm do bestiário; ferimentos também atrapalham (Grave −2, Crítico −3, Mortal −5).
const monsterRef = t => t.stats?.ref ?? t.stats?.init ?? 6;
const monsterTrack = t => (t.maxHp > 0 ? Math.round(((t.maxHp - (t.hp ?? 0)) * 40) / t.maxHp) : 0);
function monsterWoundMod(t) {
  const w = woundOf(monsterTrack(t));
  return w.mortal != null ? 5 : w.level === 3 ? 3 : w.level === 2 ? 2 : 0;
}
const tcoOf = (room, t) => (t.owner ? Number(room.sheets[t.owner]?.stats?.tco) || 6 : t.stats?.tco ?? 6);
const damageOf = (room, t) => (t.owner ? sheetDamage(room.sheets[t.owner]) : monsterTrack(t));
const d10 = () => dice.rollExpression('1d10');

// Base do ataque: REF (com ferimentos) + perícia da arma + Precisão. Arma sem perícia (monstro, arma antiga) usa o bonus como total.
function attackBase2020(room, t, atk) {
  const sh = t.owner && room.sheets[t.owner];
  if (sh && atk.skill) return effStat('cyberpunk', sh, 'ref') + skillLevel(sh, atk.skill) + (atk.bonus || 0);
  return (atk.bonus || 0) - (t.owner ? 0 : monsterWoundMod(t));
}

// Dificuldade pela distância (1 quadrado = 2 m): queima-roupa 10, curta (¼ do alcance) 15, média (½) 20, longa 25, extrema (2×) 30.
function rangeDifficulty(gap, range) {
  if (gap <= 0) return [10, 'queima-roupa'];
  if (gap <= range / 4) return [15, 'curta'];
  if (gap <= range / 2) return [20, 'média'];
  if (gap <= range) return [25, 'longa'];
  return [30, 'extrema'];
}

const LOCATIONS = [null, 'head', 'torso', 'torso', 'torso', 'rarm', 'larm', 'rleg', 'rleg', 'lleg', 'lleg'];
const LOC_NAMES = { head: 'Cabeça', torso: 'Torso', rarm: 'Braço D.', larm: 'Braço E.', rleg: 'Perna D.', lleg: 'Perna E.' };

function resolveAttack2020(room, attacker, atk, target) {
  const g = room.map.grid;
  const aName = tokenName(room, attacker);
  const tName = tokenName(room, target);
  const tc = tokenCenter(target);
  const fxKind = atk.type === 'melee' ? 'slash' : atk.type === 'spell' ? 'magic' : 'shot';
  emitFx(room, { kind: fxKind, x: tc.x * g, y: tc.y * g, from: fxKind === 'shot' ? attacker.id : null, color: attacker.color });
  const roll = dice.rollCyber(attackBase2020(room, attacker, atk));
  let hit;
  let versus;
  if (atk.type === 'melee') {
    // Corpo a corpo: REF + perícia + 1d10 contra REF + defesa + 1d10 do alvo (empate fica com o defensor)
    const ev = evadeRoll(room, target);
    post(room, { ...actorAuthor(room, target), type: 'roll', label: `🛡 Defesa de ${tName}`, roll: ev, hidden: false });
    hit = roll.first !== 1 && roll.total > ev.total;
    versus = `defesa ${ev.total}`;
  } else {
    const [dv, band] = rangeDifficulty(gapBetween(attacker, target), atk.range || 25);
    hit = roll.first !== 1 && roll.total >= dv;
    versus = `${band}, ${dv}`;
  }
  post(room, { ...actorAuthor(room, attacker), type: 'roll', label: `⚔ ${atk.name} em ${tName} (${versus})`, roll, hidden: false });
  if (roll.first === 1) return combatFumble(room, attacker, atk, roll.fumble);
  if (!hit) {
    post(room, { type: 'system', text: `${aName} errou ${tName}.` });
    return;
  }
  const dmgRoll = dice.rollExpression(atk.damage);
  let raw = dmgRoll.total;
  let extra = '';
  if (atk.type === 'melee') {
    // Modificador de dano pelo Tipo Corporal; Artes Marciais somam o nível da perícia
    const bonus = meleeBonusOf(tcoOf(room, attacker)) + (attacker.owner && atk.skill === 'Artes Marciais' ? skillLevel(room.sheets[attacker.owner], 'Artes Marciais') : 0);
    if (bonus) { raw = Math.max(1, raw + bonus); extra = ` (${bonus > 0 ? '+' : ''}${bonus} de força)`; }
  }
  post(room, { ...actorAuthor(room, attacker), type: 'roll', label: `💥 Dano de ${atk.name}${extra}`, roll: dmgRoll, hidden: false });
  hit2020(room, target, raw);
}

// Dano que chega num alvo: local (1d10), Blindagem PB do local, cabeça dobra, MTC (mínimo 1), penetração progressiva.
function hit2020(room, target, raw, loc = null) {
  const tName = tokenName(room, target);
  const locRoll = loc ? null : d10();
  const where = loc || LOCATIONS[locRoll.total];
  const sh = target.owner && room.sheets[target.owner];
  const sp = sh ? sh.armor?.[where] ?? 0 : where === 'head' ? target.stats?.headSp ?? 0 : target.stats?.def ?? 0;
  const steps = [`🎯 ${LOC_NAMES[where]}${locRoll ? ` (d10 = ${locRoll.total})` : ''}: ${raw} de dano`];
  let dmg = raw;
  if (sp > 0) {
    if (dmg <= sp) {
      post(room, { type: 'system', text: `${steps[0]} − PB ${sp}: a blindagem de ${tName} segurou.` });
      return 0;
    }
    dmg -= sp;
    steps.push(`− PB ${sp}`);
    // Penetração Progressiva: cada ataque que atravessa a armadura tira 1 ponto do PB
    if (sh) sh.armor[where] = sp - 1;
    else if (where === 'head' && target.stats?.headSp) target.stats.headSp = sp - 1;
    else if (target.stats) target.stats.def = sp - 1;
  }
  if (where === 'head') { dmg *= 2; steps.push('× 2 (cabeça)'); }
  const btm = sh ? btmOf(Number(sh.stats?.tco) || 6) : target.stats?.btm ?? btmOf(target.stats?.tco ?? 6);
  if (btm) { dmg = Math.max(1, dmg - btm); steps.push(`− MTC ${btm}`); }
  post(room, { type: 'system', text: `${steps.join(' ')} = ${dmg} para ${tName}.` });
  applyDamage(room, target, dmg);
  if (isOut(room, target)) return dmg;
  // Ferimentos especiais: mais de 8 num membro arranca o membro; na cabeça, mata na hora
  if (dmg > 8 && where === 'head') {
    killToken(room, target, `☠ Tiro fatal na cabeça: ${tName} morreu.`);
    return dmg;
  }
  if (dmg > 8 && where !== 'torso') {
    post(room, { type: 'system', text: `🩸 ${tName} perdeu o ${LOC_NAMES[where].toLowerCase()}! Teste contra Morte como Mortal 0.` });
    if (!deathSave(room, target, 0)) return dmg;
  }
  woundSaves(room, target);
  return dmg;
}

function killToken(room, t, text) {
  if (t.owner) { const hp = room.sheets[t.owner]?.res?.hp; if (hp) { const b = hp.cur; hp.cur = Math.min(hp.cur, 0); hpFx(room, t, b, hp.cur); } }
  else { const b = t.hp ?? 0; t.hp = Math.min(b, 0); hpFx(room, t, b, t.hp); }
  post(room, { type: 'system', text });
}

// Teste de Vitalidade contra Morte: 1d10 ≤ TCO − nível Mortal. Falhou, morreu.
function deathSave(room, t, mortal) {
  const tco = tcoOf(room, t);
  const r = d10();
  const ok = r.total <= tco - mortal;
  post(room, { ...actorAuthor(room, t), type: 'roll', label: `💀 Teste contra Morte — ${tokenName(room, t)} (precisa ${tco - mortal} ou menos)`, roll: r, hidden: false });
  if (!ok) killToken(room, t, `☠ ${tokenName(room, t)} não resistiu aos ferimentos.`);
  return ok;
}

// Depois de cada ferimento: teste contra Atordoamento (1d10 ≤ TCO − Atordoamento) e, se estiver Mortal, contra Morte.
function woundSaves(room, t) {
  if (t.stats?.key === 'drone') return; // máquinas não desmaiam
  const w = woundOf(damageOf(room, t));
  if (!w.level) return;
  const tco = tcoOf(room, t);
  const r = d10();
  post(room, { ...actorAuthor(room, t), type: 'roll', label: `🌀 Teste contra Atordoamento — ${tokenName(room, t)}, ferimento ${w.name} (precisa ${tco - w.stun} ou menos)`, roll: r, hidden: false });
  if (r.total > tco - w.stun && !t.stunned) {
    t.stunned = true;
    post(room, { type: 'system', text: `😵 ${tokenName(room, t)} está atordoado e perde as ações até se recuperar.` });
  }
  if (w.mortal != null) deathSave(room, t, w.mortal);
}

// Começo do turno de alguém no Cyberpunk 2020: quem está Mortal testa contra Morte; atordoado tenta se recuperar.
// Devolve false se o personagem perde o turno.
function turnStart2020(room, t) {
  if (room.system !== 'cyberpunk' || !t || isOut(room, t)) return true;
  const w = woundOf(damageOf(room, t));
  if (w.mortal != null && !deathSave(room, t, w.mortal)) return false;
  if (!t.stunned) return true;
  const tco = tcoOf(room, t);
  const r = d10();
  post(room, { ...actorAuthor(room, t), type: 'roll', label: `🌀 ${tokenName(room, t)} tenta se recuperar do atordoamento (precisa ${tco - w.stun} ou menos)`, roll: r, hidden: false });
  if (r.total <= tco - w.stun) {
    t.stunned = false;
    post(room, { type: 'system', text: `${tokenName(room, t)} se recupera e pode agir.` });
    return true;
  }
  post(room, { type: 'system', text: `${tokenName(room, t)} continua atordoado e perde o turno.` });
  return false;
}

// Tabela de Falhas Críticas (Reflexos, combate): 1-4 nada; 5 larga a arma; 6 dispara/acerta algo à toa; 7 trava; 8 fere a si mesmo; 9-10 fere um aliado.
function combatFumble(room, attacker, atk, n) {
  const aName = tokenName(room, attacker);
  if (n <= 4) return post(room, { type: 'system', text: `💢 Falha crítica (${n}): ${aName} só não conseguiu.` });
  if (n === 5) return post(room, { type: 'system', text: `💢 Falha crítica (5): ${aName} deixou a arma cair!` });
  if (n === 6) return post(room, { type: 'system', text: `💢 Falha crítica (6): a arma de ${aName} disparou sozinha e acertou algo sem importância.` });
  if (n === 7) return post(room, { type: 'system', text: `💢 Falha crítica (7): a arma de ${aName} travou (ou ficou presa) por um turno.` });
  const dmg = dice.rollExpression(atk.damage);
  if (n === 8) {
    post(room, { ...actorAuthor(room, attacker), type: 'roll', label: `💢 Falha crítica (8): ${aName} feriu a si mesmo!`, roll: dmg, hidden: false });
    hit2020(room, attacker, dmg.total);
    return;
  }
  const ally = Object.values(room.tokens)
    .filter(t => t !== attacker && isHero(t) === isHero(attacker) && !isOut(room, t))
    .sort((a, b) => gapBetween(attacker, a) - gapBetween(attacker, b))[0];
  if (!ally) return post(room, { type: 'system', text: `💢 Falha crítica (${n}): ${aName} quase acertou um aliado.` });
  post(room, { ...actorAuthor(room, attacker), type: 'roll', label: `💢 Falha crítica (${n}): ${aName} acertou ${tokenName(room, ally)}!`, roll: dmg, hidden: false });
  hit2020(room, ally, dmg.total);
}

function resolveAbility(room, actor, ab, center) {
  const g = room.map.grid;
  const aName = tokenName(room, actor);
  const enemies = Object.values(room.tokens).filter(t => isHero(t) !== isHero(actor) && !isOut(room, t));
  if (ab.type === 'passive') return [];
  if (ab.type === 'heal') {
    // Cura quem é do mesmo lado dentro da área (raio 0 = quem está no quadrado; sem ponto = a si mesmo).
    const allies = Object.values(room.tokens).filter(t => isHero(t) === isHero(actor));
    const inArea = t => {
      const c = tokenCenter(t);
      return Math.max(Math.abs(c.x - (center.x + 0.5)), Math.abs(c.y - (center.y + 0.5))) <= (ab.radius || 0) + (t.size || 1) / 2;
    };
    const targets = allies.filter(inArea);
    emitFx(room, { kind: 'heal', x: (center.x + 0.5) * g, y: (center.y + 0.5) * g, from: null });
    if (!targets.length) { post(room, { type: 'system', text: `✚ ${aName} usa ${ab.name}, mas não há aliado ali.` }); return []; }
    const r = dice.rollExpression(ab.amount || '1d6');
    post(room, { ...actorAuthor(room, actor), type: 'roll', label: `✚ ${ab.name} → ${targets.map(t => tokenName(room, t)).join(', ')}`, roll: r, hidden: false });
    for (const t of targets) healToken(room, t, r.total);
    return [];
  }
  if (ab.type === 'special') {
    const c = tokenCenter(actor);
    emitFx(room, { kind: 'magic', x: c.x * g, y: c.y * g });
    post(room, { type: 'system', text: `✨ ${aName} usa ${ab.name}: ${ab.text}` });
    return [];
  }
  if (ab.type === 'sanity') {
    const c = tokenCenter(actor);
    emitFx(room, { kind: ab.fx || 'magic', x: c.x * g, y: c.y * g });
    post(room, { type: 'system', text: `👁 ${aName}: ${ab.name}. ${ab.text || ''}`.trim() });
    const [okLoss, failLoss] = String(ab.san || '0/1d4').split('/');
    for (const h of enemies.filter(t => t.owner && gapBetween(actor, t) <= (ab.radius ?? 6))) {
      const sh = room.sheets[h.owner];
      if (!sh?.res?.san) continue;
      const check = dice.rollCoc(sh.res.san.cur, 0);
      const passed = !['fail', 'fumble'].includes(check.level);
      post(room, { ...heroAuthor(room, h.owner), type: 'roll', label: `🧠 Teste de Sanidade — ${charName(room, h.owner)}`, roll: check, hidden: false });
      const lossExpr = (passed ? okLoss : failLoss).trim();
      const loss = /d/.test(lossExpr) ? dice.rollExpression(lossExpr).total : Number(lossExpr) || 0;
      if (loss > 0) {
        sh.res.san.cur -= loss;
        post(room, { type: 'system', text: `${charName(room, h.owner)} perde ${loss} de Sanidade (agora ${sh.res.san.cur}).` });
      }
    }
    return [];
  }
  // Área: todos os inimigos no raio em volta do ponto (raio 0 = só quem está no quadrado).
  emitFx(room, { kind: ab.fx || 'blast', x: (center.x + 0.5) * g, y: (center.y + 0.5) * g, from: null });
  post(room, { type: 'system', text: `✨ ${aName} usa ${ab.name}!${ab.text ? ` ${ab.text}` : ''}` });
  const hitList = enemies.filter(t => {
    const c = tokenCenter(t);
    return Math.max(Math.abs(c.x - (center.x + 0.5)), Math.abs(c.y - (center.y + 0.5))) <= (ab.radius || 0) + (t.size || 1) / 2;
  });
  if (!hitList.length) post(room, { type: 'system', text: 'Ninguém foi atingido.' });
  const dmgRoll = ab.damage && ab.damage !== '0' ? dice.rollExpression(ab.damage) : null;
  for (const t of hitList) {
    if (ab.save === 'none') { if (dmgRoll) applyDamage(room, t, dmgRoll.total); continue; } // acerta sempre
    const save = saveVs(room, t, ab.save || 'des', ab.dc || 12);
    post(room, { ...actorAuthor(room, t), type: 'roll', label: `🛡 Resistência de ${tokenName(room, t)} contra ${ab.name}`, roll: save.roll, hidden: false });
    if (!dmgRoll) {
      if (!save.success) post(room, { type: 'system', text: `${tokenName(room, t)} foi afetado: ${ab.text || ab.name}.` });
      continue;
    }
    const dmg = save.success ? (ab.half ? Math.floor(dmgRoll.total / 2) : 0) : dmgRoll.total;
    applyDamage(room, t, dmg);
  }
  if (dmgRoll) post(room, { ...actorAuthor(room, actor), type: 'roll', label: `💥 Dano de ${ab.name}${ab.half && ab.save !== 'none' ? ' (metade se resistir)' : ''}`, roll: dmgRoll, hidden: false });
  return hitList;
}

function healToken(room, t, amount) {
  if (t.owner) {
    const hp = room.sheets[t.owner]?.res?.hp;
    if (!hp) return;
    const before = hp.cur;
    hp.cur = Math.min(hp.max || Infinity, before + amount);
    hpFx(room, t, before, hp.cur);
  } else {
    const before = t.hp ?? 0;
    t.hp = Math.min(t.maxHp || Infinity, before + amount);
    hpFx(room, t, before, t.hp);
  }
}

// Habilidades de um token: jogador usa as da ficha (vindas da classe); monstro, as do bestiário.
function abilitiesOf(room, t) {
  return t.owner ? room.sheets[t.owner]?.abilities || [] : t.stats?.abilities || [];
}

// Ataque de um token: monstro usa o bestiário; jogador de teste usa a arma dele.
function attacksOf(room, t) {
  if (t.owner) {
    const list = room.sheets[t.owner]?.attacks;
    if (list?.length) return list;
    return room.players[t.owner]?.weapon ? [room.players[t.owner].weapon] : [];
  }
  return t.stats?.attacks || [];
}

// ---------- turnos automáticos (jogadores de teste e monstros) ----------
const autoTimers = new Map(); // code -> { turnId, timer }

function stepTurn(room, dir, depth = 0) {
  const list = room.init.list;
  if (!list.length) return;
  const i = list.findIndex(e => e.id === room.init.turnId);
  if (i === -1) {
    room.init.turnId = list[0].id;
  } else {
    let next = i + dir;
    if (next >= list.length) { next = 0; room.init.round++; }
    if (next < 0) { next = list.length - 1; room.init.round = Math.max(1, room.init.round - 1); }
    room.init.turnId = list[next].id;
  }
  const cur = list.find(e => e.id === room.init.turnId);
  if (dir === 1 && cur && !cur.hidden) post(room, { type: 'system', text: `Rodada ${room.init.round} — vez de ${cur.name}.` });
  // Cyberpunk 2020: atordoado que não se recupera (ou quem morre no teste contra Morte) perde a vez
  if (dir === 1 && room.combat && depth < list.length && !turnStart2020(room, entryToken(room, cur))) stepTurn(room, 1, depth + 1);
}

function entryToken(room, e) {
  if (!e) return null;
  if (e.tokenId) return room.tokens[e.tokenId] || null;
  return Object.values(room.tokens).find(t => t.owner === e.pid) || null;
}

function scheduleAuto(room) {
  const pending = autoTimers.get(room.code);
  const entry = room.combat && room.init.list.find(e => e.id === room.init.turnId);
  const actor = entryToken(room, entry);
  const auto = actor && ((actor.owner && room.players[actor.owner]?.bot && room.settings.botsAuto) || (!actor.owner && room.settings.monstersAuto));
  if (!auto) {
    if (pending) { clearTimeout(pending.timer); autoTimers.delete(room.code); }
    return;
  }
  if (pending?.turnId === entry.id) return; // já agendado (ou agindo agora)
  if (pending) clearTimeout(pending.timer);
  autoTimers.set(room.code, {
    turnId: entry.id,
    timer: setTimeout(() => {
      if (rooms.get(room.code) !== room || room.init.turnId !== entry.id || !room.combat) { autoTimers.delete(room.code); return; }
      autoTimers.set(room.code, { turnId: entry.id, acting: true });
      performTurn(room, actor, events => {
        autoTimers.delete(room.code);
        if (room.combat && room.init.turnId === entry.id) stepTurn(room, 1);
        // Na demonstração, luta empacada (8 rodadas sem ninguém se ferir) termina para o jogo seguir.
        if (room.demo && room.combat && room.init.round - (room.combat.lastHitRound || 1) >= 8) {
          post(room, { type: 'system', text: 'A luta empacou: os dois lados recuam.' });
          events = [...events, ...endCombat(room, false)];
        }
        syncAndFight(room, events);
      });
    }, 900),
  });
}

// Executa o turno: anda quadrado por quadrado (todos veem a caminhada) e depois age.
function performTurn(room, actor, done) {
  let plan;
  try { plan = planTurn(room, actor); } catch (e) { console.error('Erro no turno automático:', e); done([]); return; }
  let i = 0;
  const next = () => {
    if (rooms.get(room.code) !== room || !room.combat) { done([]); return; }
    if (i >= plan.path.length) { done(plan.act()); return; }
    const p = plan.path[i++];
    const door = closedDoorOnStep(room, cellOf(actor), p);
    if (door) {
      door.open = true;
      post(room, { type: 'system', text: `🚪 ${tokenName(room, actor)} abre a porta.` });
      sync(room);
      done(checkCombat(room));
      return;
    }
    actor.x = p.x; actor.y = p.y; actor.rest = { x: p.x, y: p.y };
    const trap = actor.owner && Object.values(room.objects).find(o => o.type === 'trap' && o.armed && o.x === p.x && o.y === p.y);
    if (trap) { triggerTrap(room, actor, trap); sync(room); done(checkVictory(room)); return; }
    sync(room);
    setTimeout(next, 180);
  };
  next();
}

// Porta fechada no passo de "from" para "to" (porta no quadrado ou porta de borda, da casa).
function closedDoorOnStep(room, from, to) {
  return Object.values(room.objects).find(o => o.type === 'door' && !o.open && (
    (!o.edge && o.x === to.x && o.y === to.y)
    || (o.edge && o.v && o.y === to.y && from.x !== to.x && o.x === Math.max(from.x, to.x))
    || (o.edge && !o.v && o.x === to.x && from.y !== to.y && o.y === Math.max(from.y, to.y)))) || null;
}

// Caminho curto até ficar em alcance do alvo (anda no máximo "speed" quadrados).
// Portas fechadas contam como passagem: quem anda para na porta e abre.
// good(p) diz se dali já dá para atacar (corpo a corpo: encostado; à distância: no alcance e vendo o alvo).
function approach(room, actor, target, reach, speed, good) {
  const { cols, rows } = room.map;
  const grid = walkGrid(room);
  const edges = new Set(unitEdges(room.map.walls?.segments));
  const taken = new Set(Object.values(room.tokens).filter(t => t !== actor && !isOut(room, t)).map(t => `${Math.round(t.x)},${Math.round(t.y)}`));
  const start = actor.rest || { x: Math.round(actor.x), y: Math.round(actor.y) };
  const dist = new Map([[`${start.x},${start.y}`, { steps: 0, prev: null, x: start.x, y: start.y }]]);
  const q = [start];
  let best = null;
  // Distância de caminhada até o alvo (contorna prédios e paredes), para nunca "empacar" num canto.
  const tcell = cellOf(target);
  const toTarget = bfsFrom(room, { x: Math.max(0, Math.min(cols - 1, tcell.x)), y: Math.max(0, Math.min(rows - 1, tcell.y)) }, grid, edges).dist;
  const score = p => { const d = toTarget[p.y * cols + p.x]; return d >= 0 ? d : 9999 + gapBetween({ x: p.x, y: p.y, size: actor.size }, target); };
  const ok = good || (p => gapBetween({ x: p.x, y: p.y, size: actor.size }, target) <= reach - 1);
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const node = dist.get(`${p.x},${p.y}`);
    const gap = score(p);
    const fits = ok(p);
    // O primeiro lugar bom achado é o mais perto (busca em largura); sem nenhum bom, o que fica mais perto do alvo.
    if (!taken.has(`${p.x},${p.y}`) && (!best || (fits && !best.fits) || (!fits && !best.fits && gap < best.gap))) best = { ...node, gap, fits };
    if (best?.fits) break;
    if (node.steps >= speed) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx; const ny = p.y + dy;
      const k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || dist.has(k) || grid[ny * cols + nx] || stepBlocked(edges, p.x, p.y, nx, ny)) continue;
      dist.set(k, { steps: node.steps + 1, prev: `${p.x},${p.y}`, x: nx, y: ny });
      q.push({ x: nx, y: ny });
    }
  }
  if (!best) return [];
  const path = [];
  for (let k = `${best.x},${best.y}`; k; k = dist.get(k).prev) path.unshift(dist.get(k));
  return path;
}

// Decide o turno: { path: quadrados a andar, act: () => eventos de combate }.
function planTurn(room, actor) {
  const name = tokenName(room, actor);
  const now = act => ({ path: [], act });
  if (isOut(room, actor)) return now(() => []);
  const foes = Object.values(room.tokens).filter(t => isHero(t) !== isHero(actor) && !isOut(room, t)
    && (isHero(actor) ? room.init.list.some(e => e.tokenId === t.id) : true));
  if (!foes.length) {
    if (!isHero(actor)) {
      return now(() => {
        post(room, { type: 'system', text: '💀 Todos os heróis caíram…' });
        return endCombat(room, false);
      });
    }
    return now(() => checkVictory(room));
  }
  const grid = blockGrid(room);
  const edges = blockedEdges(room);
  const sees = t => lineOfSight(room, tokenCenter(actor), tokenCenter(t), grid, edges);
  foes.sort((a, b) => gapBetween(actor, a) - gapBetween(actor, b));
  const target = foes.find(sees) || foes[0];

  // Habilidades do monstro (cada uma com sua chance; Sanidade só uma vez por combate)
  if (!isHero(actor)) {
    room.combat.used ||= {};
    const used = (room.combat.used[actor.id] ||= []);
    for (const ab of actor.stats?.abilities || []) {
      if (ab.type === 'passive' || Math.random() >= (ab.chance ?? 0)) continue;
      if (ab.type === 'heal' && (actor.hp ?? 0) >= (actor.maxHp || 1) * 0.6) continue;
      if (ab.type === 'sanity' && used.includes(ab.name)) continue;
      if (ab.type === 'area' && (!sees(target) || gapBetween(actor, target) > (actor.stats?.vision || 6))) continue;
      if (ab.type === 'sanity') used.push(ab.name);
      const who = ab.type === 'heal' ? actor : target; // cura em si mesmo
      const spot = { x: Math.floor(tokenCenter(who).x), y: Math.floor(tokenCenter(who).y) };
      return now(() => { resolveAbility(room, actor, ab, spot); return checkVictory(room); });
    }
  }

  const atks = attacksOf(room, actor);
  if (!atks.length) return now(() => { post(room, { type: 'system', text: `${name} não tem como atacar e passa a vez.` }); return []; });
  const pick = t => {
    const gap = gapBetween(actor, t);
    const melee = atks.find(a => a.type === 'melee' && gap <= (a.reach || 1) - 1);
    if (melee) return melee;
    return atks.find(a => a.type !== 'melee' && gap <= (a.range || 12) && sees(t)) || null;
  };
  const atk = pick(target);
  if (atk) return now(() => { resolveAttack(room, actor, atk, target); return checkVictory(room); });
  // Anda até o alvo (ou até um lugar de onde consiga ver e acertar o tiro) e, chegando, ataca.
  const melee = atks.find(a => a.type === 'melee');
  const ranged = atks.find(a => a.type !== 'melee');
  const reach = melee ? melee.reach || 1 : 3;
  const tc = tokenCenter(target);
  const good = ranged
    ? p => {
      const gap = gapBetween({ x: p.x, y: p.y, size: actor.size }, target);
      if (melee && gap <= (melee.reach || 1) - 1) return true;
      return gap <= (ranged.range || 12) && lineOfSight(room, { x: p.x + 0.5, y: p.y + 0.5 }, tc, grid, edges);
    }
    : null;
  const path = approach(room, actor, target, reach, actor.stats?.speed || 6, good).slice(1);
  return {
    path,
    act: () => {
      const a2 = pick(target);
      if (!a2) { post(room, { type: 'system', text: `${name} avança na direção de ${tokenName(room, target)}.` }); return []; }
      resolveAttack(room, actor, a2, target);
      return checkVictory(room);
    },
  };
}

// ---------- jogadores de teste ----------
function freeCellsNear(room, anchor, n, ignore = new Set()) {
  const { cols, rows } = room.map;
  const grid = blockGrid(room);
  const taken = new Set(Object.values(room.tokens).filter(t => !ignore.has(t.id)).map(t => `${Math.round(t.x)},${Math.round(t.y)}`));
  const out = [];
  const seen = new Set([`${anchor.x},${anchor.y}`]);
  const q = [anchor];
  for (let i = 0; i < q.length && out.length < n; i++) {
    const p = q[i];
    if (!grid[p.y * cols + p.x] && !taken.has(`${p.x},${p.y}`)) out.push(p);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx; const ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen.has(`${nx},${ny}`) || grid[ny * cols + nx]) continue;
      seen.add(`${nx},${ny}`);
      q.push({ x: nx, y: ny });
    }
  }
  return out;
}

// Posição inicial escolhida pelo mestre (quadrado do mapa) ou null
function cleanStart(room, at) {
  if (!at || typeof at !== 'object') return null;
  return { x: int(at.x, 0, room.map.cols - 1), y: int(at.y, 0, room.map.rows - 1) };
}

// Com névoa, o quadrado inicial e o entorno ficam à vista (senão os jogadores nasceriam no escuro)
function revealAround(room, at, r = 3) {
  if (!room.map.fogEnabled) return;
  for (let y = Math.max(0, at.y - r); y <= Math.min(room.map.rows - 1, at.y + r); y++) {
    for (let x = Math.max(0, at.x - r); x <= Math.min(room.map.cols - 1, at.x + r); x++) room.revealed.add(`${x},${y}`);
  }
  room.map.fogVersion++;
}

// Leva os jogadores de teste para perto de um quadrado (os mais próximos que estiverem livres)
function moveBots(room, at) {
  const bots = Object.values(room.tokens).filter(t => t.owner && room.players[t.owner]?.bot);
  if (!bots.length) return 0;
  const cells = freeCellsNear(room, at, bots.length, new Set(bots.map(b => b.id)));
  bots.forEach((b, i) => { const c = cells[i] || at; b.x = c.x; b.y = c.y; b.rest = { x: c.x, y: c.y }; });
  revealAround(room, at);
  return bots.length;
}

function addTestPlayers(room, count, at = null) {
  const heroes = BEST.TEST_HEROES[room.system] || BEST.TEST_HEROES.dnd5e;
  const bots = Object.values(room.players).filter(p => p.bot).length;
  const firstHero = Object.values(room.tokens).find(t => t.owner);
  const anchor = at || (firstHero ? { x: Math.round(firstHero.x), y: Math.round(firstHero.y) } : { x: Math.floor(room.map.cols / 2), y: Math.floor(room.map.rows / 2) });
  const cells = freeCellsNear(room, anchor, count);
  const names = [];
  for (let i = 0; i < count; i++) {
    const h = heroes[(bots + i) % heroes.length];
    const pid = `bot-${newId()}`;
    const color = COLORS[(Object.keys(room.players).length) % COLORS.length];
    room.players[pid] = { id: pid, name: 'Jogador de teste', color, isGM: false, bot: true, weapon: { ...h.weapon } };
    const sheet = blankSheet(room.system, h.name);
    Object.assign(sheet.info, h.info);
    Object.assign(sheet.stats, h.stats);
    sheet.res.hp = { cur: h.hp, max: h.hp };
    sheet.attacks = [cleanAttack(h.weapon)];
    if (h.san && sheet.res.san) sheet.res.san = { cur: h.san, max: h.san };
    if (h.hum && sheet.res.hum) sheet.res.hum = { cur: h.hum, max: (h.stats?.emp ?? 6) * 10 };
    if (h.armor && sheet.armor) Object.assign(sheet.armor, h.armor);
    for (const [name, value] of Object.entries(h.skills || {})) {
      const sk = sheet.skills.find(s => s.name === name);
      if (sk) sk.value = value;
    }
    room.sheets[pid] = sheet;
    const c = cells[i] || anchor;
    const t = { id: newId(), name: h.name, color, x: c.x, y: c.y, size: 1, owner: pid, hidden: false, img: `lib:${h.img}`, rest: { x: c.x, y: c.y } };
    room.tokens[t.id] = t;
    names.push(h.name);
  }
  if (at) revealAround(room, at);
  post(room, { type: 'system', text: `🧪 Jogadores de teste entraram${at ? ` em (${at.x}, ${at.y})` : ''}: ${names.join(', ')}.` });
}

function removeTestPlayers(room) {
  const bots = new Set(Object.values(room.players).filter(p => p.bot).map(p => p.id));
  if (!bots.size) return;
  for (const id of bots) { delete room.players[id]; delete room.sheets[id]; }
  for (const t of Object.values(room.tokens)) if (bots.has(t.owner)) delete room.tokens[t.id];
  room.init.list = room.init.list.filter(e => !bots.has(e.pid));
  post(room, { type: 'system', text: '🧪 Os jogadores de teste saíram da mesa.' });
}

// ---------- demonstração: todos se movem sozinhos, como num jogo ----------
const demoTimers = new Map();
const DEMO_MONSTERS = {
  dnd5e: [['goblin', 'goblin'], ['orc', 'esqueleto']],
  cyberpunk: [['booster', 'booster'], ['drone', 'ciberpsicopata']],
  coc: [['cultista', 'cultista'], ['profundo', 'carnical']],
};
const cellOf = t => ({ x: Math.round(t.x), y: Math.round(t.y) });

// Para andar na demonstração, porta fechada conta como passagem (o herói para e abre).
function walkGrid(room) {
  const grid = blockGrid(room);
  const { cols } = room.map;
  for (const o of Object.values(room.objects)) if (o.type === 'door' && !o.edge && !o.open) grid[o.y * cols + o.x] = 0;
  return grid;
}

function bfsFrom(room, start, grid, edges) {
  const { cols, rows } = room.map;
  const dist = new Int32Array(cols * rows).fill(-1);
  const prev = new Int32Array(cols * rows).fill(-1);
  const s = start.y * cols + start.x;
  dist[s] = 0;
  const q = [s];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]; const c = cur % cols; const r = Math.floor(cur / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dx; const nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (dist[n] >= 0 || grid[n] || stepBlocked(edges, c, r, nc, nr)) continue;
      dist[n] = dist[cur] + 1; prev[n] = cur; q.push(n);
    }
  }
  return { dist, prev };
}

function firstStep(prev, from, goal) {
  let n = goal;
  if (prev[n] === -1 && n !== from) return null;
  while (prev[n] !== from && prev[n] !== -1) n = prev[n];
  return prev[n] === from ? n : null;
}

function spawnMonster(room, key, x, y) {
  const st = BEST.statsFor(key, room.system);
  const t = { id: newId(), name: st.name, color: '#b33a3a', x, y, size: 1, owner: null, hidden: false, hp: st.hp, maxHp: st.hp, img: `lib:${key}`, vision: st.vision, stats: st, initMod: st.init, rest: { x, y } };
  room.tokens[t.id] = t;
  return t;
}

// Grupos de inimigos longe dos heróis (um no fundo do mapa, outro no meio do caminho).
function placeDemoMonsters(room, anchor) {
  const { cols } = room.map;
  const { dist } = bfsFrom(room, anchor, walkGrid(room), new Set(unitEdges(room.map.walls?.segments)));
  const max = Math.max(...dist);
  if (max < 6) return 0;
  const taken = new Set(Object.values(room.tokens).map(t => `${Math.round(t.x)},${Math.round(t.y)}`));
  const groups = DEMO_MONSTERS[room.system] || DEMO_MONSTERS.dnd5e;
  const targets = [max, Math.round(max * 0.55)];
  let placed = 0;
  groups.forEach((group, gi) => {
    let best = -1;
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 0 && (best < 0 || Math.abs(dist[i] - targets[gi]) < Math.abs(dist[best] - targets[gi]))) best = i;
    if (best < 0) return;
    const near = freeCellsNear(room, { x: best % cols, y: Math.floor(best / cols) }, group.length + 4).filter(p => !taken.has(`${p.x},${p.y}`));
    group.forEach((key, i) => { const p = near[i]; if (p) { spawnMonster(room, key, p.x, p.y); taken.add(`${p.x},${p.y}`); placed++; } });
  });
  return placed;
}

// ---------- encontro automático: o mestre diz quantos e quais, o jogo posiciona ----------
// Facções: um grupo sempre sai de uma facção só (goblins com orcs e lobos, cultistas com feiticeiros…).
// tier: 1 = lacaio (vem mais), 2 = normal, 3 = chefe. big = ocupa 2×2 quando cabe.
const ENCOUNTER = {
  dnd5e: {
    factions: [['goblin', 'orc', 'lobo'], ['esqueleto'], ['ladino', 'guerreiro', 'elfa', 'mago', 'anao'], ['aranha', 'slime', 'lobo']],
    tier: { goblin: 1, lobo: 1, esqueleto: 1, ladino: 1, orc: 2, guerreiro: 2, elfa: 2, aranha: 2, slime: 2, mago: 2, anao: 2, dragao: 3, olho: 3 },
    big: ['dragao', 'olho'],
    loot: ['30 peças de ouro e uma adaga élfica', 'poção de cura (2d4+2)', 'pergaminho de Mísseis Mágicos', '12 peças de prata e um mapa rasgado', 'anel com runas (brilha no escuro)', 'gema azul (50 po)', 'corda de seda e 3 tochas'],
  },
  cyberpunk: {
    factions: [['booster'], ['corpo', 'drone', 'netrunner', 'solo'], ['ciberpsicopata', 'booster']],
    tier: { booster: 1, drone: 1, corpo: 2, netrunner: 2, solo: 3, ciberpsicopata: 3 },
    big: [],
    loot: ['500 eurodólares num chip de crédito', 'pistola média (9mm) e 2 pentes', 'estimulante (1d6 de cura)', 'chip de perícia (Armas Curtas +1)', 'jaqueta blindada leve (PB 14)', 'agenda eletrônica com senhas corporativas', 'granada de fragmentação'],
  },
  coc: {
    factions: [['cultista', 'ocultista', 'investigador'], ['profundo', 'carnical'], ['tentaculos', 'cultista']],
    tier: { cultista: 1, carnical: 1, investigador: 1, profundo: 2, ocultista: 2, tentaculos: 2, shoggoth: 3 },
    big: ['shoggoth'],
    loot: ['diário com símbolos estranhos (+1d4 Mythos, −1d4 SAN)', 'revólver .38 com 6 balas', 'estatueta de pedra verde', 'kit de primeiros socorros', '40 dólares e uma chave antiga', 'lanterna e fósforos', 'recorte de jornal sobre desaparecimentos'],
  },
};

function autoEncounter(room, o) {
  const { cols, rows } = room.map;
  const E = ENCOUNTER[room.system] || ENCOUNTER.dnd5e;
  const hasWalls = !!room.map.walls;
  const grid = walkGrid(room);
  const edges = new Set(unitEdges(room.map.walls?.segments));
  const losGrid = blockGrid(room);
  const losEdges = blockedEdges(room);
  if (o.replace) {
    for (const t of Object.values(room.tokens)) if (!t.owner) delete room.tokens[t.id];
    room.init.list = room.init.list.filter(e => !e.tokenId || room.tokens[e.tokenId]);
  }
  const heroes = Object.values(room.tokens).filter(t => t.owner && !isOut(room, t));
  const taken = new Set();
  for (const t of Object.values(room.tokens)) for (let dx = 0; dx < (t.size || 1); dx++) for (let dy = 0; dy < (t.size || 1); dy++) taken.add((Math.round(t.y) + dy) * cols + Math.round(t.x) + dx);
  for (const ob of Object.values(room.objects)) if (!ob.edge && ob.x < cols && ob.y < rows) taken.add(ob.y * cols + ob.x);
  const free = i => i >= 0 && i < cols * rows && !grid[i] && !taken.has(i);

  // Distância andando até o herói mais próximo (várias origens de uma vez). Sem heróis: a partir do centro livre.
  const dist = new Int32Array(cols * rows).fill(-1);
  const q = [];
  const starts = heroes.length ? heroes.map(t => cellOf(t)) : [freeCellsNear(room, { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }, 1)[0] || { x: 0, y: 0 }];
  for (const s of starts) { const i = s.y * cols + s.x; if (i >= 0 && i < dist.length && dist[i] < 0) { dist[i] = 0; q.push(i); } }
  for (let k = 0; k < q.length; k++) {
    const cur = q[k]; const c = cur % cols; const r = Math.floor(cur / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dx; const nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (dist[n] >= 0 || grid[n] || stepBlocked(edges, c, r, nc, nr)) continue;
      dist[n] = dist[cur] + 1; q.push(n);
    }
  }
  const maxDist = Math.max(0, ...dist);
  if (maxDist < 4) return { error: 'Não achei espaço livre no mapa para os inimigos. Gere um mapa maior ou libere a névoa.' };

  // "Abertura" de cada quadrado: quantos quadrados livres há em volta (salas > corredores).
  const open = new Uint8Array(cols * rows);
  for (let i = 0; i < open.length; i++) {
    if (grid[i]) continue;
    const c = i % cols; const r = Math.floor(i / cols);
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = c + dx; const y = r + dy;
      if (x >= 0 && y >= 0 && x < cols && y < rows && !grid[y * cols + x]) n++;
    }
    open[i] = n;
  }
  // Os heróis não podem ver o grupo logo de cara (senão a luta começa na hora)
  const heroCenters = heroes.map(tokenCenter);
  const hidden = i => {
    const p = { x: (i % cols) + 0.5, y: Math.floor(i / cols) + 0.5 };
    // longe demais para a visão dos monstros (até 8 quadrados) ou com parede no meio
    return heroCenters.every(h => Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) > 10 || (hasWalls && !lineOfSight(room, h, p, losGrid, losEdges)));
  };
  const minDist = Math.min(Math.max(6, Math.round(maxDist * 0.25)), Math.max(3, maxDist - 2));
  // Área nova da História: os inimigos da cena ficam nela
  const R = o.region;
  const inRegion = i => !R || ((i % cols) >= R.x && (i % cols) < R.x + R.w && Math.floor(i / cols) >= R.y && Math.floor(i / cols) < R.y + R.h);
  let cands = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] >= minDist && free(i) && hidden(i) && inRegion(i)) cands.push(i);
  if (cands.length < o.count) { const has = new Set(cands); for (let i = 0; i < dist.length; i++) if (dist[i] >= 3 && free(i) && inRegion(i) && !has.has(i)) cands.push(i); } // mapa pequeno: afrouxa
  if (!cands.length) return { error: 'Não sobrou lugar longe dos jogadores. Tente menos inimigos ou um mapa maior.' };

  // Lista exata (vinda da História: "4 goblins e 2 orcs") ou tipos permitidos (o que o mestre marcou; nada marcado = todos)
  const exact = o.exact?.length ? o.exact.flatMap(e => Array(e.n).fill(e.key)).sort() : null;
  const allowed = new Set((exact || (o.types?.length ? o.types : Object.keys(E.tier))).filter(k => (E.tier[k] || exact) && BEST.BESTIARY[k]));
  if (!allowed.size) return { error: 'Nenhum tipo de inimigo válido para este sistema.' };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const bossKeys = o.bossKey && BEST.BESTIARY[o.bossKey] ? [o.bossKey] : [...allowed].filter(k => E.tier[k] === 3);
  const allBoss = Object.keys(E.tier).filter(k => E.tier[k] === 3);
  const wantBoss = o.boss && o.count >= 1;
  const troops = exact ? exact.length : o.count - (wantBoss ? 1 : 0);

  // Divide as tropas em grupos (automático: ~3 por grupo) e escolhe onde fica cada grupo:
  // espalhados pelo caminho (do meio até o fundo do mapa), de preferência em salas, perto de baús, longe dos outros grupos.
  const nGroups = Math.max(troops ? 1 : 0, Math.min(troops, o.groups || Math.max(1, Math.round(troops / 3))));
  const sizes = Array.from({ length: nGroups }, (_, g) => Math.floor(troops / nGroups) + (g < troops % nGroups ? 1 : 0));
  const chests = Object.values(room.objects).filter(ob => ob.type === 'chest').map(ob => ({ x: ob.x, y: ob.y }));
  const centers = [];
  const slots = nGroups + (wantBoss ? 1 : 0);
  for (let g = 0; g < slots; g++) {
    const isBoss = wantBoss && g === slots - 1;
    const target = isBoss ? maxDist : minDist + ((maxDist - minDist) * (g + 1)) / (slots + (wantBoss ? 0 : 0.5));
    let best = -1; let bestScore = -Infinity;
    for (const i of cands) {
      if (taken.has(i)) continue;
      const c = i % cols; const r = Math.floor(i / cols);
      const spread = centers.length ? Math.min(...centers.map(p => Math.max(Math.abs(p.x - c), Math.abs(p.y - r)))) : 20;
      const nearChest = chests.some(ch => Math.max(Math.abs(ch.x - c), Math.abs(ch.y - r)) <= 3) ? 1 : 0;
      const score = -Math.abs(dist[i] - target) / Math.max(1, maxDist) * 3 + (open[i] / 25) * 1.2 + Math.min(spread, 10) / 10 * 1.5 + nearChest * (isBoss ? 1 : 0.4) + Math.random() * 0.15;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    centers.push({ x: best % cols, y: Math.floor(best / cols), boss: isBoss });
  }

  // Quadrados em volta de um centro (andando, sem atravessar parede), dos mais perto do centro para os mais longe
  const around = (ctr, n) => {
    const out = [];
    const seen = new Set([ctr.y * cols + ctr.x]);
    const bq = [ctr.y * cols + ctr.x];
    for (let k = 0; k < bq.length && out.length < n * 3; k++) {
      const cur = bq[k]; const c = cur % cols; const r = Math.floor(cur / cols);
      if (free(cur) && Math.max(Math.abs(c - ctr.x), Math.abs(r - ctr.y)) <= 4) out.push(cur);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nc = c + dx; const nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const nb = nr * cols + nc;
        if (seen.has(nb) || grid[nb] || (Math.abs(dx) + Math.abs(dy) === 1 && stepBlocked(edges, c, r, nc, nr))) continue;
        seen.add(nb); bq.push(nb);
      }
    }
    return out;
  };
  const isRanged = key => (BEST.BESTIARY[key]?.attacks?.[0]?.type || 'melee') !== 'melee';
  const put = (key, i, size = 1) => {
    const t = spawnMonster(room, key, i % cols, Math.floor(i / cols));
    t.hidden = !!o.hidden;
    if (size > 1) t.size = size;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) taken.add(i + dy * cols + dx);
    return t;
  };

  const report = [];
  let placed = 0;
  centers.forEach((ctr, g) => {
    if (ctr.boss) {
      const key = pick(bossKeys.length ? bossKeys : allBoss);
      const i = ctr.y * cols + ctr.x;
      const fits2 = E.big.includes(key) && [1, cols, cols + 1].every(d => free(i + d)) && (i % cols) + 1 < cols;
      const t = put(key, i, fits2 ? 2 : 1);
      // Chefe que não é um monstro de chefe (o "chefe dos goblins"): mais forte, com o dobro de vida
      if (E.tier[key] !== 3) { t.hp = t.maxHp = t.maxHp * 2; t.name = `Chefe ${t.name.toLowerCase()}`; } else t.name = `${t.name} (chefe)`;
      placed++;
      report.push(`👑 ${t.name} no fundo do mapa (${dist[i]} passos)`);
      return;
    }
    const size = sizes[g] || 0;
    if (!size) return;
    // Facção do grupo: a que tem mais tipos permitidos (com um pouco de sorte no meio)
    const factions = E.factions.map(f => f.filter(k => allowed.has(k) && E.tier[k] < 3)).filter(f => f.length);
    const members = factions.length ? pick(factions) : [...allowed].filter(k => E.tier[k] < 3);
    const pool = members.length ? members : [...allowed];
    // Lacaios aparecem mais; no máximo um "normal" a cada dois (lista exata: na ordem, tipos iguais juntos)
    const keys = exact ? exact.splice(0, size) : Array.from({ length: size }, (_, k) => {
      const minions = pool.filter(m => E.tier[m] === 1);
      const regulars = pool.filter(m => E.tier[m] !== 1);
      return (k % 2 === 1 && regulars.length) || !minions.length ? pick(regulars.length ? regulars : pool) : pick(minions);
    });
    // Corpo a corpo na frente (mais perto dos heróis), quem atira atrás
    const cells = around(ctr, size).sort((a, b) => dist[a] - dist[b]);
    const order = keys.map((k, idx) => ({ k, idx })).sort((a, b) => isRanged(a.k) - isRanged(b.k));
    const names = [];
    order.forEach(({ k }, n) => {
      const i = isRanged(k) ? cells.splice(Math.max(0, cells.length - 1), 1)[0] : cells.shift();
      if (i == null || !free(i)) return;
      put(k, i);
      placed++;
      names.push(BEST.BESTIARY[k].name);
    });
    const where = open[ctr.y * cols + ctr.x] >= 16 ? 'em área ampla' : open[ctr.y * cols + ctr.x] >= 9 ? 'em espaço médio' : 'em passagem estreita';
    if (names.length) report.push(`Grupo ${g + 1}: ${summarize(names)} ${where}, a ${dist[ctr.y * cols + ctr.x]} passos`);
  });

  // Armadilhas extras: nos corredores (pouca abertura), no caminho entre os heróis e os grupos
  let traps = 0;
  const corridor = cands.filter(i => free(i) && open[i] <= 12 && dist[i] >= 3).sort(() => Math.random() - 0.5);
  for (const i of corridor) {
    if (traps >= (o.traps || 0)) break;
    const ob = makeObject({ type: 'trap', x: i % cols, y: Math.floor(i / cols) }, cols, rows, room.system);
    if (ob) { room.objects[ob.id] = ob; taken.add(i); traps++; }
  }
  // Baús extras: em cantos sem saída ou perto dos grupos (tesouro guardado)
  let chestN = 0;
  const deadEnd = i => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => { const c = (i % cols) + dx; const r = Math.floor(i / cols) + dy; return c >= 0 && r >= 0 && c < cols && r < rows && !grid[r * cols + c]; }).length <= 1;
  const chestSpots = [
    ...centers.flatMap(ctr => around(ctr, 3).slice(-2)),
    ...cands.filter(i => free(i) && deadEnd(i)),
    ...cands.filter(free).sort(() => Math.random() - 0.5),
  ];
  for (const i of chestSpots) {
    if (chestN >= (o.chests || 0)) break;
    if (!free(i)) continue;
    const ob = makeObject({ type: 'chest', x: i % cols, y: Math.floor(i / cols), loot: pick(E.loot) }, cols, rows, room.system);
    if (ob) { room.objects[ob.id] = ob; taken.add(i); chestN++; }
  }
  if (traps) report.push(`⚠ ${traps} armadilha(s) nos corredores`);
  if (chestN) report.push(`🎁 ${chestN} baú(s)`);
  return { placed, report };
}

// "Goblin, Goblin, Orc" → "2 Goblins + Orc"
function summarize(names) {
  const count = new Map();
  for (const n of names) count.set(n, (count.get(n) || 0) + 1);
  return [...count].map(([n, c]) => (c > 1 ? `${c} ${n}${/s$/.test(n) ? '' : 's'}` : n)).join(' + ');
}

function stopDemo(room, text) {
  clearInterval(demoTimers.get(room.code));
  demoTimers.delete(room.code);
  if (!room.demo) return;
  room.demo = null;
  if (text) post(room, { type: 'system', text });
}

function demoTick(room) {
  if (rooms.get(room.code) !== room || !room.demo) return stopDemo(room);
  if (room.combat) return; // durante o combate, os turnos automáticos cuidam de tudo
  const bots = Object.values(room.tokens).filter(t => t.owner && room.players[t.owner]?.bot && !isOut(room, t));
  if (!bots.length) { stopDemo(room, '💀 Todos os heróis de teste caíram. Fim da demonstração.'); return sync(room); }
  const foes = Object.values(room.tokens).filter(t => !t.owner && !isOut(room, t));
  if (!foes.length) { stopDemo(room, '🏁 Todos os inimigos foram derrotados. Fim da demonstração!'); return sync(room); }
  const { cols } = room.map;
  const grid = walkGrid(room);
  const edges = new Set(unitEdges(room.map.walls?.segments)); // paredes finas; portas de borda fechadas são abertas no caminho
  // Quem caiu não ocupa mais o quadrado (dá para passar por cima).
  const occupied = new Set(Object.values(room.tokens).filter(t => !isOut(room, t)).map(t => `${Math.round(t.x)},${Math.round(t.y)}`));
  let changed = false;

  const step = (bot, to) => {
    const x = to % cols; const y = Math.floor(to / cols);
    const from = cellOf(bot);
    const name = charName(room, bot.owner);
    const door = closedDoorOnStep(room, from, { x, y });
    if (door) { door.open = true; post(room, { type: 'system', text: `🚪 ${name} abre a porta.` }); changed = true; return; }
    if (occupied.has(`${x},${y}`)) {
      // Colega no caminho (corredor estreito): trocam de lugar.
      const mate = bots.find(b => b !== bot && Math.round(b.x) === x && Math.round(b.y) === y);
      if (!mate) return;
      mate.x = from.x; mate.y = from.y; mate.rest = { ...from };
      bot.x = x; bot.y = y; bot.rest = { x, y };
      changed = true;
      return;
    }
    occupied.delete(`${from.x},${from.y}`); occupied.add(`${x},${y}`);
    bot.x = x; bot.y = y; bot.rest = { x, y };
    changed = true;
    const trap = Object.values(room.objects).find(o => o.type === 'trap' && o.armed && o.x === x && o.y === y);
    if (trap) triggerTrap(room, bot, trap);
  };

  // O líder vai até o inimigo alcançável mais próximo; os outros seguem o líder.
  const leader = bots[0];
  const lc = cellOf(leader);
  const { dist, prev } = bfsFrom(room, lc, grid, edges);
  let best = null;
  const shut = blockedEdges(room); // paredes finas + portas de borda fechadas: "encostado" não vale através delas
  for (const f of foes) {
    const fc = cellOf(f);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (fc.y + dy) * cols + (fc.x + dx);
      if (fc.x + dx < 0 || fc.y + dy < 0 || fc.x + dx >= cols || fc.y + dy >= room.map.rows) continue;
      if (stepBlocked(shut, fc.x, fc.y, fc.x + dx, fc.y + dy)) continue;
      if (dist[n] >= 0 && (!best || dist[n] < best.d)) best = { d: dist[n], n };
    }
  }
  if (!best) { stopDemo(room, 'Os heróis de teste não acharam caminho até os inimigos. Fim da demonstração.'); return sync(room); }
  if (best.d > 0) { const s = firstStep(prev, lc.y * cols + lc.x, best.n); if (s != null) step(leader, s); }
  else {
    // Já encostado no inimigo e sem combate (luta que empacou): o inimigo volta a vigiar e a luta recomeça.
    for (const f of foes) if (f.ignore && gapBetween(leader, f) <= 0) { f.ignore = false; changed = true; }
  }
  for (const bot of bots.slice(1)) {
    const bc = cellOf(bot);
    const now = cellOf(leader);
    if (Math.max(Math.abs(bc.x - now.x), Math.abs(bc.y - now.y)) <= 1) continue;
    const bf = bfsFrom(room, bc, grid, edges);
    let goal = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const n = (now.y + dy) * cols + (now.x + dx);
      if (now.x + dx < 0 || now.y + dy < 0 || now.x + dx >= cols || now.y + dy >= room.map.rows) continue;
      if (bf.dist[n] > 0 && !occupied.has(`${now.x + dx},${now.y + dy}`) && (!goal || bf.dist[n] < goal.d)) goal = { d: bf.dist[n], n };
    }
    if (goal) { const s = firstStep(bf.prev, bc.y * cols + bc.x, goal.n); if (s != null) step(bot, s); }
  }

  // Baús encostados: o herói abre (de vez em quando, para não parar a toda hora)
  for (const bot of bots) {
    const bc = cellOf(bot);
    const chest = Object.values(room.objects).find(o => o.type === 'chest' && !o.open && Math.max(Math.abs(o.x - bc.x), Math.abs(o.y - bc.y)) <= 1);
    if (chest && Math.random() < 0.35) {
      chest.open = true;
      emitFx(room, { kind: 'chest', x: (chest.x + 0.5) * room.map.grid, y: (chest.y + 0.5) * room.map.grid });
      post(room, { type: 'system', text: `🎁 ${charName(room, bot.owner)} abriu um baú: ${chest.loot}.` });
      changed = true;
    }
  }

  // A névoa se abre em volta dos heróis de teste
  if (room.map.fogEnabled) {
    let revealed = false;
    for (const bot of bots) {
      const bc = cellOf(bot);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = bc.x + dx; const y = bc.y + dy;
        if (x < 0 || y < 0 || x >= cols || y >= room.map.rows) continue;
        if (!room.revealed.has(`${x},${y}`) && lineOfSight(room, { x: bc.x + 0.5, y: bc.y + 0.5 }, { x: x + 0.5, y: y + 0.5 }, blockGrid(room), blockedEdges(room))) {
          room.revealed.add(`${x},${y}`); revealed = true;
        }
      }
    }
    if (revealed) { room.map.fogVersion++; changed = true; }
  }
  if (changed) syncAndFight(room);
}

function startDemo(room, spawn, at = null) {
  stopDemo(room);
  if (!Object.values(room.players).some(p => p.bot)) addTestPlayers(room, 3, at);
  else if (at) moveBots(room, at); // posição escolhida pelo mestre
  // Mapa recém-gerado: coloca os heróis na entrada.
  if (Array.isArray(spawn) && spawn.length) {
    Object.values(room.tokens).filter(t => t.owner).forEach((t, i) => {
      const p = spawn[i % spawn.length];
      const x = int(p?.[0], 0, room.map.cols - 1); const y = int(p?.[1], 0, room.map.rows - 1);
      t.x = x; t.y = y; t.rest = { x, y };
    });
  }
  const anchor = cellOf(Object.values(room.tokens).find(t => t.owner && room.players[t.owner]?.bot));
  if (!Object.values(room.tokens).some(t => !t.owner && !isOut(room, t))) placeDemoMonsters(room, anchor);
  Object.assign(room.settings, { botsAuto: true, monstersAuto: true, autoCombat: true });
  room.demo = { startedAt: Date.now() };
  post(room, { type: 'system', text: '▶ Demonstração: os heróis de teste vão explorar o mapa, abrir portas e baús e enfrentar os inimigos sozinhos.' });
  demoTimers.set(room.code, setInterval(() => demoTick(room), 450));
}

// ---------- conexões ----------
io.on('connection', socket => {
  let room = null;
  let me = null; // { pid, isGM }

  const inRoom = fn => (...args) => { if (room) fn(...args); };
  const gmOnly = fn => (...args) => { if (room && me.isGM) fn(...args); };
  const author = () => ({
    pid: me.pid,
    name: me.isGM ? room.players[me.pid]?.name : charName(room, me.pid),
    color: room.players[me.pid]?.color,
    img: me.isGM ? null : portraitOf(room, me.pid),
    isGM: me.isGM,
  });

  function leave() {
    if (!room) return;
    const p = presence.get(room.code);
    p?.delete(socket.id);
    if (p && !p.size) presence.delete(room.code);
    sync(room);
    room = null;
  }

  socket.on('room:create', (data, ack) => {
    if (typeof ack !== 'function') return;
    const r = createRoom(SYSTEMS[data?.system] ? data.system : 'dnd5e');
    rooms.set(r.code, r);
    scheduleSave();
    ack({ ok: true, code: r.code, gmKey: r.gmKey });
  });

  socket.on('room:join', (data, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const r = rooms.get(str(data?.code, 10).toUpperCase());
    if (!r) return ack({ ok: false, error: 'Mesa não encontrada. Confira o código.' });
    const pid = str(data?.pid, 64);
    if (!pid) return ack({ ok: false, error: 'Identificação inválida.' });
    const name = str(data?.name, 40).trim() || 'Aventureiro';
    const isGM = typeof data?.gmKey === 'string' && safeEqual(data.gmKey, r.gmKey);

    leave();
    room = r;
    me = { pid, isGM };
    if (!presence.has(r.code)) presence.set(r.code, new Map());
    presence.get(r.code).set(socket.id, { socket, pid, isGM });

    const isNew = !r.players[pid];
    if (isNew) r.players[pid] = { id: pid, name, color: COLORS[Object.keys(r.players).length % COLORS.length], isGM };
    else Object.assign(r.players[pid], { name, isGM });

    if (!isGM) {
      if (!r.sheets[pid]) r.sheets[pid] = blankSheet(r.system, name);
      if (!r.sheets[pid].attacks) r.sheets[pid].attacks = blankSheet(r.system, name).attacks; // fichas de antes desta versão
      if (!Object.values(r.tokens).some(t => t.owner === pid)) {
        const n = Object.values(r.tokens).filter(t => t.owner).length;
        const portraits = DEFAULT_PORTRAITS[r.system];
        const t = { id: newId(), name, color: r.players[pid].color, x: 1 + (n % Math.max(1, r.map.cols - 2)), y: 1, size: 1, owner: pid, hidden: false, img: `lib:${portraits[n % portraits.length]}` };
        r.tokens[t.id] = t;
      }
    }

    ack({ ok: true, isGM, code: r.code, system: r.system, lanUrls });
    socket.emit('chat:history', r.chat.filter(m => canSee(m, me)));
    socket.emit('map:image', { image: isGM ? r.map.image : r.map.playerImage });
    if (isNew) post(r, { type: 'system', text: `${name} entrou na mesa${isGM ? ' como mestre' : ''}.` });
    sync(r);
  });

  socket.on('disconnect', leave);

  // ----- tokens -----
  socket.on('token:move', inRoom(d => {
    const t = room.tokens[d?.id];
    if (!t || (!me.isGM && t.owner !== me.pid)) return;
    const x = num(d.x, -1, room.map.cols, t.x);
    const y = num(d.y, -1, room.map.rows, t.y);
    const final = Number.isInteger(x) && Number.isInteger(y);
    const rest = t.rest || { x: Math.round(t.x), y: Math.round(t.y) };
    // Ao soltar o token, o jogador precisa ter um caminho de verdade (sem atravessar parede/porta fechada).
    // Jogador de teste movido pelo mestre segue as mesmas regras de um jogador (paredes, armadilhas).
    const asPlayer = !me.isGM || !!room.players[t.owner]?.bot;
    if (final && asPlayer && room.map.walls && room.settings.collision) {
      const path = findPath(room, rest, { x, y });
      if (!path) {
        t.x = rest.x; t.y = rest.y;
        socket.emit('move:blocked');
        return syncAndFight(room);
      }
      const trap = path.slice(1).map(p => Object.values(room.objects).find(o => o.type === 'trap' && o.armed && o.x === p.x && o.y === p.y)).find(Boolean);
      if (trap) {
        t.x = trap.x; t.y = trap.y; t.rest = { x: trap.x, y: trap.y };
        triggerTrap(room, t, trap);
        return syncAndFight(room);
      }
    }
    t.x = x; t.y = y;
    if (final) t.rest = { x, y };
    syncAndFight(room);
  }));

  // ----- objetos interativos -----
  socket.on('obj:use', inRoom(d => {
    const o = room.objects[d?.id];
    if (!o || !objectVisible(room, o, me.isGM)) return;
    const now = Date.now();
    if (now - (socket.data.lastUse || 0) < 400) return;
    socket.data.lastUse = now;
    const hero = Object.values(room.tokens).find(t => t.owner === me.pid);
    if (!me.isGM) {
      // O jogador precisa estar do lado do objeto (inclusive na diagonal).
      if (!hero) return;
      const hx = Math.round(hero.x); const hy = Math.round(hero.y);
      if (!objCells(o).some(([c, r]) => Math.max(Math.abs(c - hx), Math.abs(r - hy)) <= 1)) return socket.emit('obj:far');
    }
    const who = me.isGM ? 'O mestre' : charName(room, me.pid);
    const g = room.map.grid;
    const at = { x: (o.x + (o.edge && !o.v ? 0.5 : o.edge ? 0 : 0.5)) * g, y: (o.y + (o.edge && o.v ? 0.5 : o.edge ? 0 : 0.5)) * g };
    if (o.type === 'door') o.open = !o.open;
    else if (o.type === 'torch') o.lit = !o.lit;
    else if (o.type === 'chest') {
      if (o.open && !me.isGM) return;
      o.open = !o.open;
      if (o.open) {
        emitFx(room, { kind: 'chest', ...at });
        post(room, { type: 'system', text: `🎁 ${who} abriu um baú: ${o.loot}.` });
      }
    } else if (o.type === 'lever') {
      o.on = !o.on;
      const secret = room.objects[o.target];
      if (secret) {
        secret.open = o.on;
        emitFx(room, { kind: 'dust', x: (secret.x + 0.5) * g, y: (secret.y + 0.5) * g });
      }
      post(room, { type: 'system', text: `🔧 ${who} puxou uma alavanca… ${secret ? (o.on ? 'uma parede deslizou e revelou uma passagem!' : 'a passagem se fechou.') : 'nada parece ter acontecido.'}` });
    } else if (o.type === 'crack') {
      if (o.broken) return;
      if (!me.isGM) {
        if (now - (socket.data.lastBreak || 0) < 1500) return;
        socket.data.lastBreak = now;
        const check = attributeCheck(room, room.sheets[me.pid], 'for');
        post(room, { ...heroAuthor(room, me.pid), type: 'roll', label: `🧱 Quebrar a parede rachada${check.target ? ` (${check.target})` : ''}`, roll: check.roll, hidden: false });
        if (!check.success) {
          post(room, { type: 'system', text: `A parede rachada resistiu ao golpe de ${who}.` });
          return syncAndFight(room);
        }
      }
      o.broken = true;
      emitFx(room, { kind: 'blast', ...at });
      emitFx(room, { kind: 'dust', ...at });
      post(room, { type: 'system', text: `🧱 ${who} derrubou a parede!` });
    } else if (o.type === 'trap' && me.isGM) {
      o.armed = !o.armed;
      o.revealed = !o.armed;
    } else if (o.type === 'secret' && me.isGM) {
      o.open = !o.open;
      emitFx(room, { kind: 'dust', ...at });
    } else return;
    syncAndFight(room);
  }));

  socket.on('obj:add', gmOnly(d => {
    if (!room.map.walls && ['secret', 'crack'].includes(d?.type) && !d?.broken) return;
    const o = makeObject(d, room.map.cols, room.map.rows, room.system);
    if (!o) return;
    // Alavanca nova liga na passagem secreta mais próxima que ainda não tem alavanca.
    if (o.type === 'lever') {
      const taken = new Set(Object.values(room.objects).filter(x => x.type === 'lever').map(x => x.target));
      const free = Object.values(room.objects).filter(x => x.type === 'secret' && !taken.has(x.id));
      free.sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y));
      o.target = free[0]?.id ?? null;
    }
    if (o.type === 'crack' && o.broken) {
      const g = room.map.grid;
      emitFx(room, { kind: 'blast', x: (o.x + 0.5) * g, y: (o.y + 0.5) * g });
    }
    room.objects[o.id] = o;
    syncAndFight(room);
  }));

  socket.on('obj:update', gmOnly(d => {
    const o = room.objects[d?.id];
    const p = d?.patch;
    if (!o || !p || typeof p !== 'object') return;
    if ('loot' in p && o.type === 'chest') o.loot = str(p.loot, 200).trim() || o.loot;
    if ('damage' in p && o.type === 'trap') o.damage = validDamage(p.damage, o.damage);
    syncAndFight(room);
  }));

  socket.on('obj:remove', gmOnly(d => {
    delete room.objects[d?.id];
    syncAndFight(room);
  }));

  socket.on('token:add', gmOnly(d => {
    // Ficha de combate do bestiário conforme o retrato (goblin, dragão, cultista…).
    const img = validImg(room, d?.img) || null;
    const stats = BEST.statsFor(img?.startsWith('lib:') ? img.slice(4) : null, room.system);
    // Sem PV informado (ou 0), usa os PV do bestiário: monstro com 0 PV máximo nunca cairia.
    const maxHp = int(d?.maxHp, 0, 9999) || stats.hp;
    const t = {
      id: newId(),
      name: str(d?.name, 40) || 'Criatura',
      color: color(d?.color, '#b33a3a'),
      x: int(d?.x, 0, room.map.cols - 1),
      y: int(d?.y, 0, room.map.rows - 1),
      size: int(d?.size, 1, 6, 1),
      owner: null,
      hidden: !!d?.hidden,
      hp: maxHp,
      maxHp,
      img,
      vision: int(d?.vision, 0, 40, stats.vision ?? DEFAULT_VISION),
      stats,
      initMod: stats.init,
    };
    room.tokens[t.id] = t;
    syncAndFight(room);
  }));

  socket.on('token:update', gmOnly(d => {
    const t = room.tokens[d?.id];
    const p = d?.patch;
    if (!t || !p || typeof p !== 'object') return;
    if ('name' in p) t.name = str(p.name, 40);
    if ('color' in p) t.color = color(p.color, t.color);
    if ('size' in p) t.size = int(p.size, 1, 6, 1);
    if ('img' in p) {
      const img = validImg(room, p.img);
      if (img !== undefined) {
        t.img = img;
        // Trocou o retrato de um monstro para outro do bestiário: troca a ficha de combate junto.
        const key = img?.startsWith('lib:') ? img.slice(4) : null;
        if (!t.owner && BEST.BESTIARY[key]) { t.stats = BEST.statsFor(key, room.system); t.initMod = t.stats.init; }
      }
    }
    if ('statsKey' in p && !t.owner) {
      t.stats = BEST.statsFor(str(p.statsKey, 30), room.system);
      t.initMod = t.stats.init;
      t.maxHp = t.stats.hp; t.hp = t.stats.hp;
      t.vision = t.stats.vision;
    }
    if ('hp' in p) { const before = t.hp; t.hp = int(p.hp, -999, 9999); hpFx(room, t, before, t.hp); }
    if ('maxHp' in p) t.maxHp = int(p.maxHp, 0, 9999);
    if ('hidden' in p) t.hidden = !!p.hidden;
    if ('owner' in p) t.owner = room.players[p.owner] && !room.players[p.owner].isGM ? p.owner : null;
    if ('vision' in p) t.vision = int(p.vision, 0, 40, DEFAULT_VISION);
    if ('initMod' in p) t.initMod = int(p.initMod, -99, 999);
    const won = checkVictory(room);
    syncAndFight(room, won.length ? won : checkCombat(room));
  }));

  // Jogador troca o retrato do próprio token.
  socket.on('token:image', inRoom(d => {
    const t = room.tokens[d?.id];
    const img = validImg(room, d?.img);
    if (!t || img === undefined || (!me.isGM && t.owner !== me.pid)) return;
    t.img = img;
    sync(room);
  }));

  socket.on('image:upload', inRoom((d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const data = d?.image;
    if (typeof data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(data) || data.length > MAX_PORTRAIT) {
      return ack({ ok: false, error: 'Imagem inválida ou grande demais.' });
    }
    if (Object.keys(room.images).length >= MAX_PORTRAITS_PER_ROOM) return ack({ ok: false, error: 'Limite de imagens desta mesa atingido.' });
    const id = newId();
    room.images[id] = data;
    scheduleSave();
    ack({ ok: true, img: `up:${id}` });
  }));

  // Efeitos visuais (ataque, magia, explosão, cura, disparo) que todo mundo vê ao mesmo tempo.
  socket.on('fx:cast', inRoom(d => {
    if (!FX_KINDS.includes(d?.kind)) return;
    const now = Date.now();
    if (now - (socket.data.lastFx || 0) < 150) return;
    socket.data.lastFx = now;
    const src = room.tokens[d.from];
    const from = src && (me.isGM || src.owner === me.pid) ? src.id : null;
    const fx = { kind: d.kind, x: num(d.x, -1e4, 1e5), y: num(d.y, -1e4, 1e5), from, color: room.players[me.pid]?.color || '#fff' };
    for (const c of clients(room)) {
      // Quem não enxerga o token de origem vê o efeito sem saber de onde veio.
      const visibleFrom = from && tokenVisible(room, src, c.pid, c.isGM) ? from : null;
      c.socket.emit('fx', { ...fx, from: visibleFrom });
    }
  }));

  socket.on('token:remove', gmOnly(d => {
    const wasFoe = room.init.list.some(e => e.tokenId === d?.id);
    delete room.tokens[d?.id];
    if (wasFoe && room.combat) {
      // Conta como derrotado para a vitória, antes de sair da lista.
      const foesLeft = room.init.list.filter(e => e.tokenId && e.tokenId !== d.id && room.tokens[e.tokenId] && !isDown(room.tokens[e.tokenId]));
      room.init.list = room.init.list.filter(e => e.tokenId !== d?.id);
      if (!foesLeft.length) return syncAndFight(room, endCombat(room, true));
    }
    room.init.list = room.init.list.filter(e => e.tokenId !== d?.id);
    sync(room);
  }));

  socket.on('combat:end', gmOnly(() => syncAndFight(room, endCombat(room, false))));

  socket.on('settings:set', gmOnly(d => {
    if ('autoCombat' in (d || {})) room.settings.autoCombat = !!d.autoCombat;
    if ('collision' in (d || {})) room.settings.collision = !!d.collision;
    if ('botsAuto' in (d || {})) room.settings.botsAuto = !!d.botsAuto;
    if ('monstersAuto' in (d || {})) room.settings.monstersAuto = !!d.monstersAuto;
    if ('playersPickClass' in (d || {})) room.settings.playersPickClass = !!d.playersPickClass;
    if ('lockSheets' in (d || {})) room.settings.lockSheets = !!d.lockSheets;
    syncAndFight(room);
  }));

  // ----- mapa e névoa -----
  socket.on('fog:paint', gmOnly(d => {
    if (!Array.isArray(d?.cells)) return;
    for (const cell of d.cells.slice(0, 5000)) {
      const c = int(cell?.[0], -1, 9999, -1);
      const r = int(cell?.[1], -1, 9999, -1);
      if (c < 0 || r < 0 || c >= room.map.cols || r >= room.map.rows) continue;
      if (d.reveal) room.revealed.add(`${c},${r}`);
      else room.revealed.delete(`${c},${r}`);
    }
    room.map.fogVersion++;
    sync(room);
  }));

  socket.on('fog:all', gmOnly(d => {
    room.revealed.clear();
    if (d?.reveal) {
      for (let r = 0; r < room.map.rows; r++) for (let c = 0; c < room.map.cols; c++) room.revealed.add(`${c},${r}`);
    }
    room.map.fogVersion++;
    sync(room);
  }));

  socket.on('map:settings', gmOnly(d => {
    const m = room.map;
    if ('fogEnabled' in d) m.fogEnabled = !!d.fogEnabled;
    if ('grid' in d) {
      m.grid = int(d.grid, 20, 200, m.grid);
      if (m.image) {
        m.cols = Math.ceil(m.imageW / m.grid);
        m.rows = Math.ceil(m.imageH / m.grid);
        room.revealed.clear();
        m.walls = null; // o grid mudou: as paredes e objetos do gerador não batem mais
        room.objects = {};
      }
    }
    if (!m.image && ('cols' in d || 'rows' in d)) {
      m.cols = int(d.cols ?? m.cols, 4, 200, m.cols);
      m.rows = int(d.rows ?? m.rows, 4, 200, m.rows);
    }
    m.fogVersion++;
    sync(room);
  }));

  socket.on('map:image', gmOnly(d => {
    const m = room.map;
    if (d?.image && !isImage(d.image)) return;
    m.image = d?.image || null;
    m.playerImage = null;
    m.imageW = m.image ? int(d.w, 1, 8192, 1) : 0;
    m.imageH = m.image ? int(d.h, 1, 8192, 1) : 0;
    if (m.image) {
      m.cols = Math.ceil(m.imageW / m.grid);
      m.rows = Math.ceil(m.imageH / m.grid);
    }
    // Paredes só vêm de mapas gerados; imagem enviada pelo mestre não tem (vale só a distância).
    m.walls = m.image ? cleanWalls(d.walls, m.cols, m.rows) : null;
    room.objects = m.image ? cleanObjects(d.objects, m.cols, m.rows, room.system) : {};
    room.revealed.clear();
    m.fogVersion++;
    for (const c of clients(room)) c.socket.emit('map:image', { image: c.isGM ? m.image : null });
    sync(room);
  }));

  // Continuação do mapa: o mestre junta uma área nova ao lado da atual. A imagem e as paredes chegam já
  // juntas; aqui o que existia (tokens, objetos, névoa revelada) só é deslocado para o novo lugar.
  socket.on('map:extend', gmOnly(d => {
    const m = room.map;
    if (!m.image || !isImage(d?.image)) return;
    const dx = int(d.shift?.x, 0, 200);
    const dy = int(d.shift?.y, 0, 200);
    const w = int(d.w, 1, 8192, 1);
    const h = int(d.h, 1, 8192, 1);
    const cols = Math.ceil(w / m.grid);
    const rows = Math.ceil(h / m.grid);
    if (cols > 200 || rows > 200 || cols < m.cols || rows < m.rows) return;
    m.image = d.image;
    m.playerImage = null;
    m.imageW = w;
    m.imageH = h;
    m.cols = cols;
    m.rows = rows;
    m.walls = cleanWalls(d.walls, cols, rows);
    for (const o of Object.values(room.objects)) { o.x += dx; o.y += dy; }
    Object.assign(room.objects, cleanObjects(d.objects, cols, rows, room.system));
    room.revealed = new Set([...room.revealed].map(k => { const [c, r] = k.split(',').map(Number); return `${c + dx},${r + dy}`; }));
    for (const t of Object.values(room.tokens)) { t.x += dx; t.y += dy; }
    m.fogVersion++;
    post(room, { type: 'system', text: '🗺 O mapa cresceu: uma área nova foi ligada à atual.' });
    for (const c of clients(room)) c.socket.emit('map:image', { image: c.isGM ? m.image : null });
    sync(room);
  }));

  // A névoa é "recortada" no navegador do mestre: o jogador só recebe a parte revelada da imagem.
  socket.on('map:playerImage', gmOnly(d => {
    if (d?.version !== room.map.fogVersion || !isImage(d.image) || !room.map.image) return;
    room.map.playerImage = d.image;
    for (const c of clients(room)) if (!c.isGM) c.socket.emit('map:image', { image: d.image });
    scheduleSave();
  }));

  socket.on('ping', inRoom(d => {
    const p = { x: num(d?.x, -1e4, 1e5), y: num(d?.y, -1e4, 1e5), color: room.players[me.pid]?.color || '#fff' };
    for (const c of clients(room)) c.socket.emit('ping', p);
  }));

  // ----- chat e dados -----
  socket.on('chat:send', inRoom(d => {
    const text = str(d?.text, 500).trim();
    if (!text) return;
    const cmd = text.match(/^\/(r|roll|gr|m)\s+(.+)$/i);
    if (cmd) {
      const kind = cmd[1].toLowerCase();
      if (kind === 'm') return post(room, { ...author(), type: 'text', text: cmd[2], hidden: true });
      try {
        const roll = dice.rollExpression(cmd[2]);
        post(room, { ...author(), type: 'roll', label: '', roll, hidden: kind === 'gr' || !!d.secret });
      } catch (e) {
        socket.emit('chat:msg', { id: newId(), ts: Date.now(), type: 'system', text: e.message });
      }
      return;
    }
    if (text.startsWith('/')) {
      socket.emit('chat:msg', { id: newId(), ts: Date.now(), type: 'system', text: 'Comandos: /r 2d6+3 · /gr 1d20 (secreta) · /m texto (só o mestre vê)' });
      return;
    }
    post(room, { ...author(), type: 'text', text });
  }));

  socket.on('roll', inRoom(d => {
    let roll;
    try { roll = performRoll(d?.req); } catch { return; }
    if (!roll) return;
    post(room, { ...author(), type: 'roll', label: str(d.label, 80), roll, hidden: !!d.secret });
  }));

  // ----- fichas -----
  socket.on('sheet:set', inRoom(d => {
    const target = me.isGM && d?.pid ? d.pid : me.pid;
    if (!room.sheets[target]) return;
    const prev = room.sheets[target];
    const before = prev.res?.hp?.cur;
    const next = cleanSheet(room.system, d?.sheet);
    if (!me.isGM) {
      // Habilidades e classe quem define é o mestre; o jogador só as usa.
      next.abilities = prev.abilities || [];
      next.classId = prev.classId || '';
      if (room.settings.lockSheets) {
        // Ficha travada: o jogador só mexe em nome, PV atuais, recursos atuais e anotações.
        const field = CLASSES.CLASS_FIELD[room.system];
        const defField = CLASSES.DEF_FIELD[room.system];
        next.info[field] = prev.info[field];
        if (defField) next.info[defField] = prev.info[defField];
        next.stats = prev.stats;
        next.skills = prev.skills;
        next.attacks = prev.attacks;
        for (const k of Object.keys(next.res)) next.res[k].max = prev.res[k]?.max ?? next.res[k].max;
      }
    }
    room.sheets[target] = next;
    const tok = Object.values(room.tokens).find(t => t.owner === target);
    if (tok) hpFx(room, tok, before, room.sheets[target].res?.hp?.cur);
    sync(room);
  }));

  // ----- iniciativa -----
  socket.on('init:roll', inRoom(d => {
    const target = me.isGM && d?.pid ? d.pid : me.pid;
    if (!room.sheets[target]) return;
    let roll;
    try { roll = performRoll(d?.req); } catch { return; }
    if (!roll || typeof roll.total !== 'number') return;
    room.init.list = room.init.list.filter(e => e.pid !== target);
    room.init.list.push({ id: newId(), name: charName(room, target), value: roll.total, pid: target, hidden: false });
    sortInit(room);
    post(room, { ...author(), type: 'roll', label: `Iniciativa — ${charName(room, target)}`, roll, hidden: false });
    sync(room);
  }));

  socket.on('init:add', gmOnly(d => {
    const tokenId = room.tokens[d?.tokenId] ? d.tokenId : null;
    room.init.list.push({ id: newId(), name: str(d?.name, 40) || 'Criatura', value: int(d?.value, -99, 999), tokenId, hidden: !!d?.hidden });
    sortInit(room);
    sync(room);
  }));

  socket.on('init:update', gmOnly(d => {
    const e = room.init.list.find(x => x.id === d?.id);
    if (!e) return;
    if ('hidden' in d) e.hidden = !!d.hidden;
    if ('value' in d) { e.value = int(d.value, -99, 999); sortInit(room); }
    sync(room);
  }));

  socket.on('init:remove', gmOnly(d => {
    room.init.list = room.init.list.filter(e => e.id !== d?.id);
    if (room.init.turnId === d?.id) room.init.turnId = null;
    sync(room);
  }));

  socket.on('init:clear', gmOnly(() => {
    if (room.combat) return syncAndFight(room, endCombat(room, false));
    room.init = { list: [], turnId: null, round: 1 };
    sync(room);
  }));

  socket.on('init:step', gmOnly(d => {
    if (!room.init.list.length) return;
    stepTurn(room, d?.dir === -1 ? -1 : 1);
    syncAndFight(room, []);
  }));

  // ----- ataques e habilidades (o mestre escolhe o alvo no mapa) -----
  // Mestre ataca com qualquer token. Jogador ataca com o próprio personagem, seguindo as regras da mesa.
  socket.on('combat:attack', inRoom(d => {
    const attacker = room.tokens[d?.attacker];
    const target = room.tokens[d?.target];
    const atk = attacker && attacksOf(room, attacker)[int(d?.index, 0, 20)];
    if (!attacker || !target || !atk || attacker === target) return;
    let events = [];
    if (!me.isGM) {
      const deny = msg => socket.emit('combat:denied', msg);
      if (attacker.owner !== me.pid) return;
      if (target.owner || !tokenVisible(room, target, me.pid, false)) return deny('Escolha um inimigo como alvo.');
      if (isOut(room, attacker)) return deny('Seu personagem está caído.');
      if (isOut(room, target)) return deny('Esse inimigo já caiu.');
      const gap = gapBetween(attacker, target);
      if (atk.type === 'melee' && gap > 0) return deny('Ataque corpo a corpo: chegue até encostar no inimigo.');
      if (attacker.stunned) return deny('Você está atordoado: espere se recuperar no começo do seu turno.');
      // Cyberpunk 2020 deixa atirar até a distância extrema (2× o alcance), com dificuldade 30
      const maxRange = (atk.range || 12) * (room.system === 'cyberpunk' ? 2 : 1);
      if (atk.type !== 'melee' && gap > maxRange) return deny(`O alvo está longe demais (alcance máximo ${maxRange}).`);
      if (atk.type !== 'melee' && !lineOfSight(room, tokenCenter(attacker), tokenCenter(target))) return deny('Você não enxerga o alvo daqui (parede no caminho).');
      if (room.combat) {
        const cur = room.init.list.find(e => e.id === room.init.turnId);
        if (cur?.pid !== me.pid) return deny(`Espere a sua vez (agora é a vez de ${cur?.name || 'outro'}).`);
        room.combat.acted ||= {};
        if (room.combat.acted[me.pid] === room.init.turnId) return deny('Você já atacou neste turno. Clique em "Encerrar turno".');
        room.combat.acted[me.pid] = room.init.turnId;
      } else {
        // Ataque de surpresa: começa a luta com esse inimigo.
        events = beginCombat(room, [[target, attacker]], `${charName(room, me.pid)} atacou ${target.name}`);
      }
    }
    resolveAttack(room, attacker, atk, target);
    syncAndFight(room, [...events, ...checkVictory(room)]);
  }));

  // Jogador passa a vez (o mestre também pode).
  socket.on('turn:end', inRoom(() => {
    if (!room.combat) return;
    const cur = room.init.list.find(e => e.id === room.init.turnId);
    if (!me.isGM && cur?.pid !== me.pid) return;
    stepTurn(room, 1);
    syncAndFight(room, []);
  }));

  // Habilidade: o mestre usa a de qualquer token; o jogador, as da ficha dele, seguindo as regras da mesa.
  socket.on('combat:ability', inRoom(d => {
    const actor = room.tokens[d?.actor];
    const ab = actor && abilitiesOf(room, actor)[int(d?.index, 0, 20)];
    if (!actor || !ab || ab.type === 'passive') return;
    const c = tokenCenter(actor);
    const spot = { x: int(d?.x, 0, room.map.cols - 1, Math.floor(c.x)), y: int(d?.y, 0, room.map.rows - 1, Math.floor(c.y)) };
    if (!me.isGM && actor.owner !== me.pid) return;
    const deny = msg => socket.emit('combat:denied', msg);
    if (ab.uses && ab.left <= 0) return deny(`${ab.name}: sem usos. Espere o descanso.`);
    if (!me.isGM) {
      if (isOut(room, actor)) return deny('Seu personagem está caído.');
      if (actor.stunned) return deny('Você está atordoado: espere se recuperar no começo do seu turno.');
      if (ab.type === 'area' || ab.type === 'heal') {
        const center = { x: spot.x + 0.5, y: spot.y + 0.5 };
        const gap = Math.max(Math.abs(center.x - c.x), Math.abs(center.y - c.y)) - (actor.size || 1) / 2 - 0.5;
        if (gap > ab.range) return deny(`Longe demais (alcance ${ab.range}).`);
        if (room.map.fogEnabled && !room.revealed.has(`${spot.x},${spot.y}`)) return deny('Você não enxerga esse lugar.');
        if (gap > 0 && !lineOfSight(room, c, center)) return deny('Tem uma parede no caminho.');
      }
      if (room.combat) {
        const cur = room.init.list.find(e => e.id === room.init.turnId);
        if (cur?.pid !== me.pid) return deny(`Espere a sua vez (agora é a vez de ${cur?.name || 'outro'}).`);
        room.combat.acted ||= {};
        if (room.combat.acted[me.pid] === room.init.turnId) return deny('Você já agiu neste turno. Clique em "Encerrar turno".');
        room.combat.acted[me.pid] = room.init.turnId;
      }
    }
    if (ab.uses) ab.left -= 1;
    const hit = resolveAbility(room, actor, ab, spot) || [];
    let events = [];
    // Habilidade que acerta um inimigo fora de combate começa a luta.
    if (!room.combat && isHero(actor) && hit.length) events = beginCombat(room, [[hit[0], actor]], `${tokenName(room, actor)} usou ${ab.name}`);
    syncAndFight(room, [...events, ...checkVictory(room)]);
  }));

  // ----- classes e habilidades (o mestre cadastra) -----
  socket.on('class:save', gmOnly(d => {
    const cls = cleanClass(room.system, d?.cls);
    const i = room.classes.findIndex(c => c.id === cls.id);
    if (i >= 0) room.classes[i] = cls;
    else if (room.classes.length < 40) room.classes.push(cls);
    sync(room);
  }));

  socket.on('class:remove', gmOnly(d => {
    room.classes = room.classes.filter(c => c.id !== d?.id);
    sync(room);
  }));

  // Carrega as classes prontas do sistema (as que já existem com o mesmo nome ficam como estão).
  socket.on('class:presets', gmOnly(() => {
    for (const p of CLASSES.PRESETS[room.system] || []) {
      if (room.classes.some(c => c.name.toLowerCase() === p.name.toLowerCase()) || room.classes.length >= 40) continue;
      room.classes.push(cleanClass(room.system, p));
    }
    sync(room);
  }));

  // Dá a classe a um jogador. O jogador pode escolher a própria, se o mestre deixar, e fora de combate.
  socket.on('class:apply', inRoom(d => {
    const target = me.isGM && d?.pid ? d.pid : me.pid;
    const cls = room.classes.find(c => c.id === d?.classId);
    if (!cls || !room.sheets[target]) return;
    if (!me.isGM) {
      const deny = msg => socket.emit('combat:denied', msg);
      if (!room.settings.playersPickClass) return deny('Quem escolhe a classe é o mestre.');
      if (room.combat) return deny('Não dá para trocar de classe no meio do combate.');
    }
    applyClass(room, target, cls);
    sync(room);
  }));

  // Descanso: todos recuperam os usos das habilidades.
  socket.on('rest', gmOnly(() => {
    for (const sh of Object.values(room.sheets)) for (const a of sh.abilities || []) a.left = a.uses;
    post(room, { type: 'system', text: '🛏 Descanso: todos recuperaram os usos das habilidades.' });
    sync(room);
  }));

  // ----- teste com jogadores -----
  socket.on('test:add', gmOnly(d => {
    addTestPlayers(room, int(d?.count, 1, 6, 3), cleanStart(room, d?.at));
    syncAndFight(room);
  }));

  socket.on('test:demo', gmOnly(d => {
    if (!d?.start) { stopDemo(room, '⏹ Demonstração parada pelo mestre.'); return syncAndFight(room, []); }
    if (!room.map.walls) return socket.emit('chat:msg', { id: newId(), ts: Date.now(), type: 'system', text: 'A demonstração precisa de um mapa gerado.' });
    startDemo(room, d.spawn, cleanStart(room, d.at));
    syncAndFight(room);
  }));

  // Encontro automático: o mestre escolhe quantos, quais e o resto; o jogo escolhe onde cada um fica.
  socket.on('encounter:auto', gmOnly(d => {
    const opts = {
      count: d?.objectsOnly ? 0 : int(d?.count, 1, 40, 6),
      groups: int(d?.groups, 0, 10, 0),
      types: Array.isArray(d?.types) ? d.types.slice(0, 40).map(k => str(k, 30)) : [],
      boss: !!d?.boss,
      hidden: d?.hidden !== false,
      replace: !!d?.replace,
      traps: int(d?.traps, 0, 20, 0),
      chests: int(d?.chests, 0, 20, 0),
      exact: (Array.isArray(d?.exact) ? d.exact : []).slice(0, 12).map(e => ({ key: str(e?.key, 30), n: int(e?.n, 1, 20, 1) })).filter(e => BEST.BESTIARY[e.key]),
      bossKey: BEST.BESTIARY[d?.bossKey] ? d.bossKey : null,
      region: d?.region ? { x: int(d.region.x, 0, 200), y: int(d.region.y, 0, 200), w: int(d.region.w, 1, 200, 1), h: int(d.region.h, 1, 200, 1) } : null,
    };
    if (opts.exact.length) opts.count = opts.exact.reduce((a, e) => a + e.n, 0) + (opts.boss ? 1 : 0);
    const ended = opts.replace && room.combat ? endCombat(room, false) : [];
    const res = autoEncounter(room, opts);
    if (res.error) { socket.emit('combat:denied', res.error); return syncAndFight(room, ended); }
    // Só o mestre vê onde ficou cada grupo
    post(room, { type: 'system', hidden: true, text: `⚔ Encontro montado (só você vê): ${res.placed} inimigo(s). ${res.report.join(' • ')}` });
    socket.emit('encounter:done', res);
    syncAndFight(room, ended);
  }));

  socket.on('encounter:clear', gmOnly(() => {
    for (const t of Object.values(room.tokens)) if (!t.owner) delete room.tokens[t.id];
    room.init.list = room.init.list.filter(e => !e.tokenId || room.tokens[e.tokenId]);
    syncAndFight(room, room.combat ? endCombat(room, false) : []);
  }));

  // Leva os jogadores de teste que já estão no mapa até a posição escolhida
  socket.on('test:move', gmOnly(d => {
    const at = cleanStart(room, d?.at);
    if (!at) return;
    if (!moveBots(room, at)) return socket.emit('combat:denied', 'Não há jogadores de teste no mapa.');
    syncAndFight(room);
  }));

  socket.on('test:remove', gmOnly(() => {
    stopDemo(room, '⏹ Demonstração encerrada.');
    removeTestPlayers(room);
    syncAndFight(room, checkVictory(room));
  }));

  // ----- história organizada em cenas (só o mestre vê; o jogador recebe só o que for narrado) -----
  socket.on('story:set', gmOnly(d => {
    const s = d?.story || {};
    const cleanScene = c => ({
      id: str(c?.id, 30) || newId(),
      title: str(c?.title, 80),
      text: str(c?.text, 6000),
      place: c?.place && typeof c.place === 'object' ? { text: str(c.place.text, 400), label: str(c.place.label, 120), type: str(c.place.type, 20), same: !!c.place.same } : null,
      enemies: (Array.isArray(c?.enemies) ? c.enemies : []).slice(0, 12).map(e => ({ key: str(e?.key, 30), n: int(e?.n, 1, 20, 1) })).filter(e => BEST.BESTIARY[e.key]),
      boss: c?.boss === 'auto' ? 'auto' : BEST.BESTIARY[c?.boss] ? c.boss : null,
      traps: int(c?.traps, 0, 20),
      chests: int(c?.chests, 0, 20),
      ambush: !!c?.ambush,
      npcs: (Array.isArray(c?.npcs) ? c.npcs : []).slice(0, 12).map(n => str(n, 40)),
      done: !!c?.done,
    });
    room.story = {
      text: str(s.text, 60000),
      scenes: (Array.isArray(s.scenes) ? s.scenes : []).slice(0, 60).map(cleanScene),
      current: int(s.current, -1, 59, -1),
    };
    sync(room);
  }));

  socket.on('story:narrate', gmOnly(d => {
    const text = str(d?.text, 6000).trim();
    if (!text) return;
    post(room, { type: 'narration', title: str(d?.title, 80), text });
  }));

  socket.on('notes:set', gmOnly(d => {
    room.notes = str(d?.text, 20000);
    scheduleSave();
  }));
});

// Carrega as mesas antes de abrir a porta (no Supabase isso leva alguns segundos)
load().then(() => server.listen(PORT, () => {
  console.log(`\n  Mesa rodando em http://localhost:${PORT}`);
  for (const u of lanUrls) console.log(`  Na rede local:  ${u}`);
  console.log('');
}));

// Ao desligar (Ctrl+C aqui, SIGTERM no Render): salva tudo antes de sair
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const timer = setTimeout(() => process.exit(0), 8000);
  try { await save(); } finally { clearTimeout(timer); process.exit(0); }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
