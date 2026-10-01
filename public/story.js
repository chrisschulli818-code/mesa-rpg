/* Organizador de histórias (sem IA): o mestre digita ou cola a aventura e o jogo separa em cenas.
   Em cada cena ele procura, por palavras-chave, o lugar (usando o intérprete do gerador de mapas),
   os inimigos com a quantidade ("três goblins", "2 orcs"), o chefe, armadilhas, tesouros e nomes de personagens. */
(function (root) {
  'use strict';

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Palavras que apontam para cada ficha do bestiário (radicais, sem acento).
  const ENEMY_WORDS = {
    dnd5e: {
      goblin: ['goblin'], orc: ['orc', 'orque'], esqueleto: ['esqueleto', 'morto-vivo', 'mortos-vivos', 'morto vivo', 'mortos vivos', 'zumbi'],
      lobo: ['lobo', 'lobos', 'warg'], dragao: ['dragao', 'dragoes', 'serpe'], slime: ['gosma', 'slime', 'lodo vivo'],
      aranha: ['aranha'], olho: ['olho tirano', 'observador', 'beholder'], guerreiro: ['soldado', 'guardas', 'guarda real', 'cavaleiro', 'sentinela'],
      mago: ['mago', 'magos', 'feiticeiro', 'bruxo', 'necromante'], ladino: ['bandido', 'ladrao', 'ladroes', 'salteador', 'assaltante', 'pirata'],
      elfa: ['elfo', 'elfa', 'batedor', 'arqueiro'], anao: ['anao', 'anoes'],
    },
    cyberpunk: {
      booster: ['booster', 'gangue', 'gangues', 'gangster', 'punk', 'marginal', 'bandido'], drone: ['drone'],
      ciberpsicopata: ['ciberpsicopata', 'ciberpsicose', 'psicopata'], corpo: ['seguranca', 'guardas', 'corporativo', 'agente corporativo', 'policial corrupto', 'soldado'],
      netrunner: ['netrunner', 'hacker'], solo: ['mercenario', 'assassino', '=solo', 'matador', 'atirador'],
    },
    coc: {
      cultista: ['cultista', 'seita', 'fanatico', 'adorador'], profundo: ['profundo', 'homem-peixe', 'homens-peixe', 'criatura do mar'],
      shoggoth: ['shoggoth'], carnical: ['carnical', 'carnicais', 'ghoul', 'comedor de cadaver'], tentaculos: ['tentaculo'],
      investigador: ['capanga', 'gangster', 'bandido', 'mafioso', 'policial corrupto'], ocultista: ['feiticeiro', 'bruxo', 'bruxa', 'ocultista', 'sacerdote'],
    },
  };
  const BOSS_KEYS = { dnd5e: ['dragao', 'olho'], cyberpunk: ['ciberpsicopata', 'solo'], coc: ['shoggoth'] };
  const BOSS_WORDS = ['chefe', 'lider', 'lorde', '=rei', 'rainha', 'senhor d', 'chefao', 'mandante', 'mestre do culto', 'sumo sacerdote', 'general', 'capitao', 'patrao', 'boss'];

  const NUMBERS = {
    um: 1, uma: 1, dois: 2, duas: 2, par: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
    alguns: 3, algumas: 3, poucos: 2, poucas: 2, varios: 4, varias: 4, muitos: 6, muitas: 6, bando: 5, grupo: 4, horda: 8, dezena: 10, 'uma duzia': 12,
  };

  // "=palavra" exige a palavra inteira; sem "=" aceita qualquer terminação.
  function findAll(text, w) {
    const exact = w.startsWith('=');
    const word = (exact ? w.slice(1) : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${word}${exact ? '(?![a-z0-9])' : '[a-z]*'}`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(text))) out.push({ index: m.index + m[1].length, match: m[0].slice(m[1].length) });
    return out;
  }

  // Palavras de grupo: "uma gangue de boosters" = 5, "um bando de lobos" = 5
  const COLLECTIVE = { bando: 5, grupo: 4, gangue: 5, gangues: 8, horda: 8, matilha: 5, esquadrao: 5, patrulha: 3, tropa: 6, seita: 5, exercito: 12, legiao: 12, enxame: 6 };

  // Quantidade escrita logo antes da palavra, na mesma frase ("três goblins", "2 orcs", "um bando de lobos"); plural sem número = 3.
  function countBefore(text, idx, word) {
    if (COLLECTIVE[word.replace(/[^a-z]/g, '')]) return COLLECTIVE[word.replace(/[^a-z]/g, '')];
    const start = Math.max(0, idx - 30);
    const sentence = text.slice(start, idx).split(/[.!?;\n]/).pop();
    const before = sentence.trim().split(/\s+/).filter(Boolean).slice(-4);
    for (let k = before.length - 1; k >= 0; k--) {
      const w = before[k].replace(/[^a-z0-9]/g, '');
      if (COLLECTIVE[w]) return COLLECTIVE[w];
      if (/^\d{1,2}$/.test(w)) return Number(w);
      if (NUMBERS[w] != null) return NUMBERS[w];
    }
    return /s$/.test(word) ? 3 : 1;
  }

  // A frase fala do inimigo como relato ou passado, não como presença na cena?
  const REPORT_CUES = ['conta que', 'contou', 'contam', 'dizem', 'disse que', 'diz que', 'rumor', 'boato', 'lenda', 'ouviram falar', 'ouviu falar', 'falam de', 'fala de', 'historia de', 'pede ajuda contra', 'pedem ajuda contra', 'contratad', 'recompensa por', 'cacar', 'procurar', 'investigar', 'teme', 'temem', 'medo de', 'foi visto', 'foram vistos'];
  const PAST_VERB = /^\s+(roubaram|atacaram|levaram|fugiram|sequestraram|mataram|destruiram|invadiram|queimaram|saquearam|raptaram|apareceram|eram|foram|estiveram|tinham|haviam)\b/;
  function reported(text, idx, len) {
    const start = Math.max(text.lastIndexOf('.', idx), text.lastIndexOf('\n', idx), text.lastIndexOf('!', idx), text.lastIndexOf('?', idx)) + 1;
    const endMatch = /[.!?\n]/.exec(text.slice(idx));
    const sentence = text.slice(start, endMatch ? idx + endMatch.index : text.length);
    if (REPORT_CUES.some(c => sentence.includes(c))) return true;
    return PAST_VERB.test(text.slice(idx + len, idx + len + 20));
  }

  // Divide o texto em cenas: linhas "Cena 1", "Capítulo", "Parte", "Ato", "#", "1." ou, sem marcadores, parágrafos.
  const MARKER = /^\s*(?:#{1,3}\s*|(?:cena|cap[ií]tulo|parte|ato|sess[aã]o|encontro|local)\s*[\divxlc]*\s*[:.\-–—]?\s*|\d{1,2}\s*[.)\-–—]\s+)(.*)$/i;
  function splitScenes(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const hasMarkers = lines.some(l => MARKER.test(l) && l.trim().length < 90);
    const scenes = [];
    if (hasMarkers) {
      let cur = null;
      for (const line of lines) {
        const m = line.trim().length < 90 && MARKER.exec(line);
        if (m) { cur = { title: m[1].trim(), body: [] }; scenes.push(cur); continue; }
        if (!cur) { if (!line.trim()) continue; cur = { title: '', body: [] }; scenes.push(cur); }
        cur.body.push(line);
      }
    } else {
      let buf = [];
      const flush = () => { if (buf.join(' ').trim()) scenes.push({ title: '', body: buf }); buf = []; };
      for (const line of lines) { if (!line.trim()) flush(); else buf.push(line); }
      flush();
      // Parágrafos muito curtos grudam no próximo
      for (let i = scenes.length - 2; i >= 0; i--) {
        if (scenes[i].body.join(' ').length < 60) { scenes[i + 1].body = [...scenes[i].body, ...scenes[i + 1].body]; scenes.splice(i, 1); }
      }
    }
    return scenes.map(s => ({ title: s.title, text: s.body.join('\n').trim() })).filter(s => s.title || s.text);
  }

  // Nomes próprios citados no meio das frases (Maria, Sr. Blackwood, Johnny Silverhand…)
  const NAME_STOP = new Set(['O', 'A', 'Os', 'As', 'Um', 'Uma', 'Eles', 'Elas', 'Ele', 'Ela', 'Cena', 'Capítulo', 'Parte', 'Ato', 'Quando', 'Então', 'Depois', 'No', 'Na', 'Nos', 'Nas', 'De', 'Do', 'Da', 'Em', 'Mas', 'Se', 'Lá', 'Ali', 'Aqui', 'Por', 'Para', 'Com', 'Sem', 'Mestre', 'Jogadores', 'Night', 'City', 'Rede', 'Deus', 'Deuses']);
  function findNames(text) {
    const out = new Map();
    const re = /(?<=[a-zà-ÿ0-9,;:)]\s)((?:(?:Sr|Sra|Dr|Dra|Srta)\.?\s)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçü]{2,}(?:\s(?:de|da|do|dos|van|von)?\s?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçü]{2,})?)/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1].trim();
      if (NAME_STOP.has(name.split(/\s/)[0])) continue;
      out.set(name, (out.get(name) || 0) + 1);
    }
    return [...out.keys()].slice(0, 8);
  }

  function analyze(scene, system, genInterpret, prevPlace) {
    const text = norm(`${scene.title}\n${scene.text}`);
    // Lugar: o intérprete do gerador de mapas; sem lugar citado, a cena continua onde a anterior estava
    const spec = genInterpret(`${scene.title} ${scene.text}`, system);
    const place = spec.explicit ? { text: `${scene.title} ${scene.text}`.slice(0, 400), label: spec.label, type: spec.type } : null;

    // Inimigos com quantidade (a maior quantidade citada para cada tipo)
    const words = ENEMY_WORDS[system] || ENEMY_WORDS.dnd5e;
    const enemies = {};
    for (const [key, list] of Object.entries(words)) {
      for (const w of list) for (const hit of findAll(text, w)) {
        // "sem goblins", "nenhum orc": não conta
        if (/\b(sem|nenhum|nenhuma|nao ha|nem)\s+(\S+\s+)?$/.test(text.slice(Math.max(0, hit.index - 18), hit.index))) continue;
        // Só citado, não está na cena: "conta que goblins roubaram…", "dizem que um dragão…", "goblins atacaram a vila"
        if (reported(text, hit.index, hit.match.length)) continue;
        const n = Math.min(20, countBefore(text, hit.index, hit.match));
        enemies[key] = Math.max(enemies[key] || 0, n);
      }
    }
    const bossWord = BOSS_WORDS.some(w => findAll(text, w).length);
    // "o chefe dos goblins", "o líder dos cultistas": o chefe é daquele tipo
    let ofKey = null;
    const of = /(?:chefe|lider|lorde|rei|rainha|capitao|senhor|mestre|comandante)\s+d[oa]s?\s+([a-z-]+(?:\s[a-z-]+)?)/.exec(text);
    if (of) for (const [key, list] of Object.entries(words)) if (list.some(w => findAll(of[1], w).length)) { ofKey = key; break; }
    const bossKey = ofKey || (BOSS_KEYS[system] || []).find(k => enemies[k]) || null;
    if (bossKey && !ofKey) enemies[bossKey] = Math.max(0, enemies[bossKey] - 1); // "um dragão" É o chefe; "o chefe dos goblins" vem além dos goblins
    const list = Object.entries(enemies).filter(([, n]) => n > 0).map(([key, n]) => ({ key, n }));

    const traps = Math.min(6, findAll(text, 'armadilh').length + findAll(text, 'alcapao').length + findAll(text, 'mina terrestre').length);
    const chests = Math.min(4, ['tesouro', '=bau', 'baus', 'cofre', 'reliquia', 'recompensa', 'espolio', 'artefato', 'pilhagem'].reduce((a, w) => a + findAll(text, w).length, 0));
    const ambush = ['emboscada', 'escondid', 'de tocaia', 'a espreita', 'sorrateir', 'invisivel'].some(w => findAll(text, w).length);

    return {
      title: scene.title || (scene.text.split(/[.!?\n]/)[0] || 'Cena').trim().slice(0, 60),
      text: scene.text,
      place: place || (prevPlace ? { ...prevPlace, same: true } : null),
      enemies: list,
      boss: bossKey || (bossWord && list.length ? 'auto' : null),
      traps,
      chests,
      ambush,
      npcs: findNames(scene.text),
    };
  }

  function organize(text, system, genInterpret) {
    let prev = null;
    return splitScenes(text).map((s, i) => {
      const a = analyze(s, system, genInterpret, prev);
      if (a.place && !a.place.same) prev = a.place;
      return { id: `c${Date.now().toString(36)}${i}`, ...a };
    });
  }

  const api = { organize, splitScenes, analyze, ENEMY_WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.STORY = api;
})(this);
