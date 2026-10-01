/* Regras e modelos de ficha de cada sistema. Usado pelo servidor (Node) e pelo navegador. */
(function (root) {
  'use strict';

  const dndMod = v => Math.floor((Number(v) - 10) / 2);
  const sign = n => (n >= 0 ? `+${n}` : `${n}`);

  const SYSTEMS = {
    dnd5e: {
      name: 'D&D 5e',
      tagline: 'Masmorras, dragões e o bom e velho d20.',
      monster: 'Goblin',
      skillMode: 'prof',
      skillsLabel: 'Perícias',
      info: [
        { key: 'name', label: 'Personagem' },
        { key: 'class', label: 'Classe e nível' },
        { key: 'race', label: 'Raça' },
        { key: 'ac', label: 'CA', def: '10', short: true },
        { key: 'speed', label: 'Desloc.', def: '9 m', short: true },
        { key: 'prof', label: 'Proficiência', def: '2', short: true },
      ],
      resources: [{ key: 'hp', label: 'Pontos de Vida', def: 10, hp: true }],
      stats: [
        { key: 'for', label: 'FOR', def: 10 },
        { key: 'des', label: 'DES', def: 10 },
        { key: 'con', label: 'CON', def: 10 },
        { key: 'int', label: 'INT', def: 10 },
        { key: 'sab', label: 'SAB', def: 10 },
        { key: 'car', label: 'CAR', def: 10 },
      ],
      skills: [
        ['Acrobacia', 'des'], ['Adestrar Animais', 'sab'], ['Arcanismo', 'int'], ['Atletismo', 'for'],
        ['Atuação', 'car'], ['Enganação', 'car'], ['Furtividade', 'des'], ['História', 'int'],
        ['Intimidação', 'car'], ['Intuição', 'sab'], ['Investigação', 'int'], ['Medicina', 'sab'],
        ['Natureza', 'int'], ['Percepção', 'sab'], ['Persuasão', 'car'], ['Prestidigitação', 'des'],
        ['Religião', 'int'], ['Sobrevivência', 'sab'],
      ],
    },

    // Cyberpunk 2020 (edição brasileira da Devir, 1996). A chave continua "cyberpunk" para as mesas já salvas.
    cyberpunk: {
      name: 'Cyberpunk 2020',
      tagline: 'Night City, 2020. Atributo + perícia + 1d10 contra a dificuldade.',
      monster: 'Booster',
      skillMode: 'level',
      skillsLabel: 'Perícias (nível 0 a 10)',
      groupSkills: true,
      info: [
        { key: 'name', label: 'Nome' },
        { key: 'role', label: 'Papel', options: ['Solo', 'Roqueiro', 'Netrunner', 'Técnico', 'Tecnomédico', 'Mídia', 'Policial', 'Corporativo', 'Atravessador', 'Nômade'] },
        { key: 'cp', label: 'Pontos de Personagem', short: true },
        { key: 'rep', label: 'REP', def: '0', short: true },
        { key: 'ip', label: 'PE atuais', def: '0', short: true },
      ],
      // Localização (1d10) e Blindagem PB de cada parte do corpo, como na ficha
      armor: [
        { key: 'head', label: 'Cabeça', roll: '1' }, { key: 'torso', label: 'Torso', roll: '2-4' },
        { key: 'rarm', label: 'Braço D.', roll: '5' }, { key: 'larm', label: 'Braço E.', roll: '6' },
        { key: 'rleg', label: 'Perna D.', roll: '7-8' }, { key: 'lleg', label: 'Perna E.', roll: '9-0' },
      ],
      resources: [
        { key: 'hp', label: 'Saúde (40 quadrados de ferimento)', def: 40, hp: true, woundTrack: true },
        { key: 'hum', label: 'Humanidade', def: 60 },
      ],
      stats: [
        { key: 'int', label: 'INT', def: 6 }, { key: 'ref', label: 'REF', def: 6 },
        { key: 'tec', label: 'TEC', def: 6 }, { key: 'cool', label: 'AuCon', def: 6 },
        { key: 'atr', label: 'ATR', def: 6 }, { key: 'sor', label: 'SOR', def: 6 },
        { key: 'mov', label: 'MOV', def: 6 }, { key: 'tco', label: 'TCO', def: 6 },
        { key: 'emp', label: 'EMP', def: 6 },
      ],
      // Todas as perícias da ficha, na mesma ordem e com o atributo de cada uma.
      // As Habilidades Especiais de cada Papel ficam no topo.
      skills: [
        ['Autoridade', 'cool'], ['Liderança Carismática', 'cool'], ['Noção de Combate', 'int'], ['Credibilidade', 'emp'],
        ['Família', 'int'], ['Interface', 'int'], ['Reparos Improvisados', 'tec'], ['Tecnologia Médica', 'tec'],
        ['Recursos', 'int'], ['Negociar', 'cool'],
        ['Cuidados Pessoais', 'atr'], ['Roupa e Estilo', 'atr'],
        ['Resistência', 'tco'], ['Feitos de Força', 'tco'], ['Natação', 'tco'],
        ['Interrogatório', 'cool'], ['Intimidação', 'cool'], ['Oratória', 'cool'], ['Resistência Tortura/Drogas', 'cool'], ['Manha', 'cool'],
        ['Percepção', 'emp'], ['Entrevista', 'emp'], ['Liderança', 'emp'], ['Sedução', 'emp'], ['Trato Social', 'emp'], ['Persuasão e Lábia', 'emp'], ['Atuação', 'emp'],
        ['Contabilidade', 'int'], ['Antropologia', 'int'], ['Atenção/Notar', 'int'], ['Biologia', 'int'], ['Botânica', 'int'], ['Química', 'int'],
        ['Composição', 'int'], ['Diagnose', 'int'], ['Educação e Cultura Geral', 'int'], ['Especialista', 'int'], ['Jogo', 'int'], ['Geologia', 'int'],
        ['Esconder/Evadir', 'int'], ['História', 'int'], ['Idioma', 'int'], ['Pesquisa em Biblioteca', 'int'], ['Matemática', 'int'], ['Física', 'int'],
        ['Programação', 'int'], ['Sombra/Rastreamento', 'int'], ['Mercado de Ações', 'int'], ['Conhecimento de Sistemas', 'int'], ['Pedagogia', 'int'],
        ['Sobrevivência', 'int'], ['Zoologia', 'int'],
        ['Arqueirismo', 'ref'], ['Atletismo', 'ref'], ['Briga', 'ref'], ['Dança', 'ref'], ['Esquivar/Escapar', 'ref'], ['Condução', 'ref'],
        ['Esgrima', 'ref'], ['Armas Curtas', 'ref'], ['Armas Pesadas', 'ref'], ['Artes Marciais', 'ref'], ['Luta Greco-Romana', 'ref'], ['Armas Brancas', 'ref'],
        ['Motocicleta', 'ref'], ['Op. de Maquinaria Pesada', 'ref'], ['Pilotagem de Giro', 'ref'], ['Pilotagem de Asa Fixa', 'ref'], ['Pilotagem de Dirigível', 'ref'],
        ['Pilotagem de Veíc.Imp.Vet.', 'ref'], ['Fuzil', 'ref'], ['Furtividade', 'ref'], ['Submetralhadora', 'ref'],
        ['AeroTec', 'tec'], ['AVTec', 'tec'], ['Tecnologia Básica', 'tec'], ['Op. de Tanques Criogênicos', 'tec'], ['Projeto de Ciberterminal', 'tec'],
        ['Cibertecnologia', 'tec'], ['Demolições', 'tec'], ['Disfarce', 'tec'], ['Eletrônica', 'tec'], ['Segurança Eletrônica', 'tec'], ['Primeiros Socorros', 'tec'],
        ['Falsificação', 'tec'], ['Gito Tec', 'tec'], ['Pintura e Desenho', 'tec'], ['Fotografia e Filmagem', 'tec'], ['Medicamentos', 'tec'], ['Arrombamento', 'tec'],
        ['Punga', 'tec'], ['Tocar Instrumento', 'tec'], ['Armeiro', 'tec'],
      ],
      specialSkills: ['Autoridade', 'Liderança Carismática', 'Noção de Combate', 'Credibilidade', 'Família', 'Interface', 'Reparos Improvisados', 'Tecnologia Médica', 'Recursos', 'Negociar'],
      // Página "Fluxovida" da ficha
      lifepath: [
        { group: 'Estilo', key: 'clothes', label: 'Vestuário' }, { group: 'Estilo', key: 'hair', label: 'Cabelo' },
        { group: 'Estilo', key: 'marks', label: 'Marcas' }, { group: 'Estilo', key: 'ethnic', label: 'Etnia' },
        { group: 'Estilo', key: 'lang', label: 'Idioma' },
        { group: 'Antecedente Familiar', key: 'family', label: 'Antecedente familiar', long: true },
        { group: 'Antecedente Familiar', key: 'brothers', label: 'Irmãos ♂' }, { group: 'Antecedente Familiar', key: 'sisters', label: 'Irmãs ♀' },
        { group: 'Motivações', key: 'personality', label: 'Personalidade' }, { group: 'Motivações', key: 'valuedPerson', label: 'Pessoa que mais valoriza' },
        { group: 'Motivações', key: 'values', label: 'O que mais valoriza' }, { group: 'Motivações', key: 'people', label: 'Opinião sobre as pessoas' },
        { group: 'Motivações', key: 'valuedItem', label: 'Objeto que mais valoriza' },
        { group: 'Acontecimentos', key: 'events', label: 'Um acontecimento para cada ano acima dos 16', long: true },
      ],
    },

    coc: {
      name: 'Call of Cthulhu 7e',
      tagline: 'Investigação, horror cósmico e o d100.',
      monster: 'Profundo',
      skillMode: 'percent',
      skillsLabel: 'Perícias (%)',
      info: [
        { key: 'name', label: 'Investigador' },
        { key: 'occupation', label: 'Ocupação' },
        { key: 'age', label: 'Idade', short: true },
        { key: 'mov', label: 'MOV', def: '8', short: true },
      ],
      resources: [
        { key: 'hp', label: 'Pontos de Vida', def: 10, hp: true },
        { key: 'san', label: 'Sanidade', def: 50, rollable: true },
        { key: 'mp', label: 'Pontos de Magia', def: 10 },
        { key: 'luck', label: 'Sorte', def: 50, rollable: true },
      ],
      stats: [
        { key: 'for', label: 'FOR', def: 50 }, { key: 'con', label: 'CON', def: 50 },
        { key: 'tam', label: 'TAM', def: 50 }, { key: 'des', label: 'DES', def: 50 },
        { key: 'apa', label: 'APA', def: 50 }, { key: 'int', label: 'INT', def: 50 },
        { key: 'pod', label: 'POD', def: 50 }, { key: 'edu', label: 'EDU', def: 50 },
      ],
      skills: [
        ['Usar Bibliotecas', 'edu', 20], ['Encontrar', 'int', 25], ['Escutar', 'int', 20],
        ['Psicologia', 'int', 10], ['Furtividade', 'des', 20], ['Esquivar', 'des', 25],
        ['Lutar (Briga)', 'for', 25], ['Armas de Fogo (Revólver)', 'des', 20], ['Primeiros Socorros', 'edu', 30],
        ['Persuasão', 'apa', 10], ['Lábia', 'apa', 5], ['Charme', 'apa', 15], ['Intimidação', 'apa', 15],
        ['Ocultismo', 'edu', 5], ['História', 'edu', 5], ['Medicina', 'edu', 1], ['Dirigir Automóveis', 'des', 20],
        ['Escalar', 'for', 20], ['Rastrear', 'int', 10], ['Mythos de Cthulhu', 'int', 0],
      ],
    },
  };

  // Ataques que vêm na ficha nova (o jogador pode editar). bonus: D&D = bônus no d20; Cyberpunk = base do d10; Cthulhu = %.
  const DEFAULT_ATTACKS = {
    dnd5e: [
      { name: 'Espada longa', type: 'melee', bonus: 4, damage: '1d8+2', range: 1 },
      { name: 'Arco curto', type: 'ranged', bonus: 4, damage: '1d6+2', range: 16 },
    ],
    // Cyberpunk 2020: bonus = Precisão (WA) da arma; a perícia usada entra no teste com o REF. Alcance em quadrados de 2 m.
    cyberpunk: [
      { name: 'Pistola média (9mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '2d6+1', range: 25 },
      { name: 'Faca', type: 'melee', skill: 'Armas Brancas', bonus: 0, damage: '1d6', range: 1 },
      { name: 'Soco (Briga)', type: 'melee', skill: 'Briga', bonus: 0, damage: '1d3', range: 1 },
    ],
    coc: [
      { name: 'Revólver .38', type: 'ranged', bonus: 40, damage: '1d10', range: 15 },
      { name: 'Soco', type: 'melee', bonus: 50, damage: '1d3', range: 1 },
    ],
  };

  function blankSheet(system, name) {
    const s = SYSTEMS[system];
    return {
      info: Object.fromEntries(s.info.map(f => [f.key, f.key === 'name' ? name || '' : f.def || ''])),
      res: Object.fromEntries(s.resources.map(r => [r.key, { cur: r.def, max: r.def }])),
      stats: Object.fromEntries(s.stats.map(st => [st.key, st.def])),
      skills: s.skills.map(([skillName, stat, value]) => ({ name: skillName, stat, value: value || 0, prof: false })),
      attacks: JSON.parse(JSON.stringify(DEFAULT_ATTACKS[system] || DEFAULT_ATTACKS.dnd5e)),
      ...(s.armor ? { armor: Object.fromEntries(s.armor.map(a => [a.key, 0])) } : {}),
      ...(s.lifepath ? { life: {}, cyber: [] } : {}),
      notes: '',
    };
  }

  // ---------- Cyberpunk 2020 ----------
  // Tipo Corporal → Modificador de Tipo Corporal (MTC, subtraído do dano recebido) e modificador de dano corpo a corpo.
  const btmOf = tco => (tco <= 2 ? 0 : tco <= 4 ? 1 : tco <= 7 ? 2 : tco <= 9 ? 3 : tco === 10 ? 4 : 5);
  const meleeBonusOf = tco => (tco <= 2 ? -2 : tco <= 4 ? -1 : tco <= 7 ? 0 : tco <= 9 ? 1 : tco === 10 ? 2 : tco <= 12 ? 4 : tco <= 14 ? 6 : 8);
  const bodyTypeName = tco => (tco <= 2 ? 'Muito Fraco' : tco <= 4 ? 'Fraco' : tco <= 7 ? 'Médio' : tco <= 9 ? 'Forte' : tco === 10 ? 'Muito Forte' : 'Sobre-humano');

  // Nível de ferimento a partir do dano marcado (40 quadrados): Leve, Grave, Crítico e Mortal 0 a 6.
  // stun = quanto se subtrai do TCO no teste contra Atordoamento; mortal = nível do teste contra Morte.
  function woundOf(damage) {
    const d = Math.max(0, damage);
    if (d === 0) return { level: 0, name: 'Sem ferimentos', stun: 0, mortal: null };
    if (d <= 4) return { level: 1, name: 'Leve', stun: 0, mortal: null };
    if (d <= 8) return { level: 2, name: 'Grave', stun: 1, mortal: null };
    if (d <= 12) return { level: 3, name: 'Crítico', stun: 2, mortal: null };
    const m = Math.min(6, Math.floor((d - 13) / 4));
    return { level: 4 + m, name: `Mortal ${m}`, stun: 3 + m, mortal: m };
  }
  const sheetDamage = sheet => Math.max(0, (sheet?.res?.hp?.max ?? 40) - (sheet?.res?.hp?.cur ?? 40));

  // Atributo com os efeitos do ferimento: Grave −2 REF; Crítico REF/INT/AuCon ÷2; Mortal ÷3 (arredondando para cima).
  // EMP nunca passa de Humanidade ÷ 10.
  function effStat(system, sheet, key) {
    const v = Number(sheet?.stats?.[key]) || 0;
    if (system !== 'cyberpunk') return v;
    if (key === 'emp' && sheet?.res?.hum) return Math.min(v, Math.floor(Math.max(0, sheet.res.hum.cur) / 10));
    const w = woundOf(sheetDamage(sheet));
    if (!['ref', 'int', 'cool'].includes(key)) return v;
    if (w.mortal != null) return Math.ceil(v / 3);
    if (w.level === 3) return Math.ceil(v / 2);
    if (w.level === 2 && key === 'ref') return Math.max(0, v - 2);
    return v;
  }

  const skillLevel = (sheet, name) => Number(sheet?.skills?.find(s => s.name === name)?.value) || 0;

  // Valores calculados que a ficha mostra (Correr, Saltar, VIT, MTC…).
  function derived(system, sheet) {
    if (system !== 'cyberpunk') return [];
    const mov = Number(sheet?.stats?.mov) || 0;
    const tco = Number(sheet?.stats?.tco) || 0;
    const w = woundOf(sheetDamage(sheet));
    const hum = sheet?.res?.hum;
    return [
      ['Correr', `${mov * 3} m`], ['Saltar', `${Math.floor((mov * 3) / 4)} m`], ['Carregar', `${tco * 10} kg`], ['Levantar', `${tco * 40} kg`],
      ['VIT', `${tco}`, 'Nível de Vitalidade: passe no teste com 1d10 ≤ este valor'],
      ['MTC', `−${btmOf(tco)}`, `Modificador de Tipo Corporal (${bodyTypeName(tco)}): tirado de todo dano recebido`],
      ['Dano C.a.C.', `${meleeBonusOf(tco) >= 0 ? '+' : ''}${meleeBonusOf(tco)}`, 'Modificador de dano em ataques corpo a corpo'],
      ['Ferimento', w.name, w.level ? `Atordoamento = ${w.stun}${w.mortal != null ? ` · teste contra Morte a cada turno (Mortal ${w.mortal})` : ''}` : ''],
      ...(hum ? [['EMP atual', `${effStat(system, sheet, 'emp')}`, 'Humanidade ÷ 10']] : []),
    ];
  }

  const statValue = (sheet, key) => Number(sheet?.stats?.[key]) || 0;

  function skillTotal(system, sheet, sk) {
    if (system === 'dnd5e') return dndMod(statValue(sheet, sk.stat)) + (sk.prof ? parseInt(sheet.info?.prof, 10) || 0 : 0);
    if (system === 'cyberpunk') return effStat(system, sheet, sk.stat) + (Number(sk.value) || 0);
    return Number(sk.value) || 0;
  }

  // Pedido de rolagem que o navegador manda ao servidor.
  function rollFor(system, total) {
    if (system === 'dnd5e') return { kind: 'd20', mod: total };
    if (system === 'cyberpunk') return { kind: 'd10', base: total };
    return { kind: 'd100', skill: total };
  }

  function statRoll(system, sheet, key) {
    const v = effStat(system, sheet, key);
    return rollFor(system, system === 'dnd5e' ? dndMod(v) : v);
  }

  const skillRoll = (system, sheet, sk) => rollFor(system, skillTotal(system, sheet, sk));

  function initiativeRoll(system, sheet) {
    if (system === 'dnd5e') return { kind: 'd20', mod: dndMod(statValue(sheet, 'des')) };
    // Iniciativa = REF + 1d10; a Noção de Combate do Solo soma
    if (system === 'cyberpunk') return { kind: 'd10', base: effStat(system, sheet, 'ref') + skillLevel(sheet, 'Noção de Combate') };
    return { kind: 'flat', value: statValue(sheet, 'des') }; // CoC: age em ordem de DES
  }

  function statNote(system, v) {
    if (system === 'dnd5e') return sign(dndMod(v));
    if (system === 'coc') return `½ ${Math.floor(v / 2)} · ⅕ ${Math.floor(v / 5)}`;
    return '';
  }

  function skillNote(system, sheet, sk) {
    const t = skillTotal(system, sheet, sk);
    if (system === 'dnd5e') return sign(t);
    if (system === 'coc') return `${t}%`;
    return String(t);
  }

  const api = {
    SYSTEMS, blankSheet, skillTotal, statRoll, skillRoll, initiativeRoll, statNote, skillNote, dndMod, sign,
    btmOf, meleeBonusOf, woundOf, sheetDamage, effStat, skillLevel, derived,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SYSTEMS_API = api;
})(this);
