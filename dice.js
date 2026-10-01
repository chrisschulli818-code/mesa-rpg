'use strict';
// Todas as rolagens acontecem no servidor, para ninguém "ajeitar" o dado no navegador.
const { randomInt } = require('crypto');

const die = sides => randomInt(1, sides + 1);

// Termo de dado: 2d6, d20, 4d6kh3, 2d20kl1, 3d6! (explosivo), d%
const DICE_TERM = /^(\d*)d(\d+|%)(?:(kh|kl)(\d+))?(!)?$/;

function rollExpression(input) {
  const expr = String(input ?? '').toLowerCase().replace(/\s+/g, '');
  if (!expr || expr.length > 80) throw new Error('Expressão inválida.');
  const terms = expr.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== expr) throw new Error('Expressão inválida.');

  let total = 0;
  let diceCount = 0;
  const parts = [];
  for (const term of terms) {
    const sign = term[0] === '-' ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    if (/^\d+$/.test(body)) {
      const value = Math.min(Number(body), 9999);
      total += sign * value;
      parts.push({ sign, type: 'mod', value });
      continue;
    }
    const m = body.match(DICE_TERM);
    if (!m) throw new Error(`Não entendi "${body}". Exemplo: /r 2d6+3`);
    const count = m[1] ? Number(m[1]) : 1;
    const sides = m[2] === '%' ? 100 : Number(m[2]);
    diceCount += count;
    if (count < 1 || diceCount > 100) throw new Error('Máximo de 100 dados por rolagem.');
    if (sides < 2 || sides > 1000) throw new Error('Dados de 2 a 1000 lados.');

    const rolls = [];
    for (let i = 0; i < count; i++) {
      let v = die(sides);
      rolls.push({ v });
      for (let guard = 0; m[5] && v === sides && guard < 20; guard++) {
        v = die(sides);
        rolls.push({ v, exploded: true });
      }
    }
    if (m[3]) {
      const keep = Math.min(Number(m[4]), rolls.length);
      const order = rolls.map((_, i) => i)
        .sort((a, b) => (m[3] === 'kh' ? rolls[b].v - rolls[a].v : rolls[a].v - rolls[b].v));
      for (const i of order.slice(keep)) rolls[i].dropped = true;
    }
    const sum = rolls.filter(r => !r.dropped).reduce((s, r) => s + r.v, 0);
    total += sign * sum;
    parts.push({ sign, type: 'dice', notation: body, sides, rolls, sum });
  }
  return { kind: 'expr', expr, total, parts };
}

// D&D 5e: d20 + modificador, com vantagem/desvantagem.
function rollD20(mod = 0, mode = 'normal') {
  const dice = mode === 'normal' ? [die(20)] : [die(20), die(20)];
  const natural = mode === 'adv' ? Math.max(...dice) : mode === 'dis' ? Math.min(...dice) : dice[0];
  return { kind: 'd20', mod, mode, dice, natural, total: natural + mod, crit: natural === 20, fumble: natural === 1 };
}

// Cyberpunk 2020: ATRIBUTO + perícia + 1d10.
// 10 natural = sucesso decisivo: rola de novo e soma (e de novo, se vier outro 10).
// 1 natural = falha crítica: rola 1d10 na Tabela de Falhas Críticas (o total não muda).
function rollCyber(base = 0) {
  const first = die(10);
  const extras = [];
  if (first === 10) {
    let d;
    do { d = die(10); extras.push(d); } while (d === 10 && extras.length < 5);
  }
  const fumble = first === 1 ? die(10) : null;
  const total = base + first + extras.reduce((a, b) => a + b, 0);
  return { kind: 'd10', base, first, extras, crit: first === 10 ? 'success' : first === 1 ? 'fail' : null, fumble, total };
}

// Call of Cthulhu 7e: d100 contra a perícia, com dados de bônus (bp > 0) ou penalidade (bp < 0).
function rollCoc(skill = 50, bp = 0) {
  const units = randomInt(0, 10);
  const tens = Array.from({ length: 1 + Math.min(2, Math.abs(bp)) }, () => randomInt(0, 10) * 10);
  const values = tens.map(t => (t + units === 0 ? 100 : t + units));
  const result = bp > 0 ? Math.min(...values) : bp < 0 ? Math.max(...values) : values[0];
  let level;
  if (result === 1) level = 'critical';
  else if (result === 100 || (skill < 50 && result >= 96)) level = 'fumble';
  else if (result <= Math.floor(skill / 5)) level = 'extreme';
  else if (result <= Math.floor(skill / 2)) level = 'hard';
  else if (result <= skill) level = 'regular';
  else level = 'fail';
  return { kind: 'd100', skill, bp, tens, units, result, level, total: result };
}

module.exports = { rollExpression, rollD20, rollCyber, rollCoc };
