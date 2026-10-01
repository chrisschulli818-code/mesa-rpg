/* Gerador procedural de mapas a partir de um tema digitado ("cripta amaldiçoada à noite").
   interpret(texto) transforma a frase em uma especificação (tipo, paleta, elementos, clima);
   generate(...) desenha o mapa num <canvas> alinhado ao grid do jogo.
   A mesma semente gera sempre o mesmo mapa em qualquer tamanho de quadrado. */
(function (root) {
  'use strict';

  const TYPES = [
    { key: 'masmorra', name: 'Masmorra', sys: ['dnd5e'] },
    { key: 'caverna', name: 'Caverna', sys: ['dnd5e', 'coc'] },
    { key: 'floresta', name: 'Floresta e ermos', sys: ['dnd5e', 'coc'] },
    { key: 'cidade', name: 'Cidade', sys: ['cyberpunk'] },
    { key: 'mansao', name: 'Casa e interiores', sys: ['coc'] },
  ];
  const SIZES = { s: [20, 14], m: [30, 20], l: [40, 28] };
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // ============ paletas ============
  const BASE = {
    masmorra: { void: '#1b1814', floor: '#8b8478', corridor: '#7a7367', wall: '#3a322b', hatch: 'rgba(0,0,0,0.6)', light: '255,170,60', core: '#ffcc55', pillar: '#5b554d', crack: 'rgba(40,34,28,0.35)' },
    caverna: { rock: '#26221e', edge: '#15120f', floor: '#7a6a55', water: '#2f5d73', ripple: '200,235,255', crystal: '120,220,255', crystalCore: '#9fe8ff', crystalChance: 0.012, stal: '#5d554b', mush: ['#b58cc9', '#e8dcc0'], liquid: 'water' },
    floresta: { grass: '#557d3b', tuft: 'rgba(30,60,20,0.45)', path: '#8e7550', pathIn: '#a88c62', water: '#2a6682', waterIn: '#3a84a6', tree: '#2f5a2a', treeKind: 'round', treeDensity: 0.52, rock: '#8a8680', flowers: ['#f4e27a', '#f29bd1', '#ffffff'], liquid: 'water' },
    cidade: { base: '#17181e', asphalt: '#1c1e25', sidewalk: '#30323b', roofs: ['#2a2d3a', '#33283d', '#1f2f38', '#2c2c2c', '#3a2f2a'], neon: ['#ff2a6d', '#05d9e8', '#f7ec13', '#b967ff'], neonChance: 0.7, lane: 'rgba(247,236,19,0.55)', cars: ['#c9304a', '#2d6bd6', '#d8d8e0', '#222222', '#e0a31a'], lamp: '255,230,170', lampChance: 0.03, puddles: true, helipads: true },
    mansao: { grass: '#4a6b35', hedge: '#2a4a24', woods: ['#7a5634', '#6b4a2c', '#86603a'], wall: '#2a1d14', rugs: ['#7a1f2b', '#1f3a5c', '#3d4a1f'], window: '#9fd0e8', light: '255,210,130', tree: '#2e5226', treeKind: 'round', gravel: '#a89f8c' },
  };

  const PALETTES = {
    gelo: {
      label: 'gelo e neve',
      masmorra: { void: '#12181e', floor: '#aebccb', corridor: '#98a8b8', wall: '#4d5d6c', light: '140,200,255', core: '#d2efff', pillar: '#7e93a6', crack: 'rgba(60,90,120,0.35)', hatch: 'rgba(0,0,0,0.5)' },
      caverna: { rock: '#1b232c', edge: '#0c1116', floor: '#b5c5d3', water: '#9fd2ea', ripple: '255,255,255', crystal: '160,225,255', crystalCore: '#e6f7ff', crystalChance: 0.03, stal: '#8fa3b5', mush: ['#d9ecf7', '#a9c9e0'], liquid: 'ice' },
      floresta: { grass: '#e3eaf0', tuft: 'rgba(140,160,180,0.45)', path: '#aab4be', pathIn: '#c4ccd4', water: '#8cc0dc', waterIn: '#b4dcef', tree: '#2c4a3a', treeKind: 'pine', snowTrees: true, rock: '#9aa3ab', flowers: [], liquid: 'ice' },
      cidade: { base: '#232830', asphalt: '#2a2f38', sidewalk: '#9aa3ae', roofs: ['#c9d3dc', '#b7c2cc', '#dfe6ec', '#a9b4bf'] },
      mansao: { grass: '#e3eaf0', hedge: '#4a6356', tree: '#2c4a3a', treeKind: 'pine', snowTrees: true },
      mods: { neve: true },
    },
    fogo: {
      label: 'fogo e lava',
      masmorra: { void: '#120a08', floor: '#5e4c44', corridor: '#524239', wall: '#2a1812', light: '255,110,40', core: '#ffb347', pillar: '#3e2c26', crack: 'rgba(255,80,20,0.35)', hatch: 'rgba(0,0,0,0.7)' },
      caverna: { rock: '#1e1210', edge: '#0c0605', floor: '#4a3a34', water: '#ff5a1a', ripple: '255,220,120', crystal: '255,140,40', crystalCore: '#ffd27a', stal: '#3a2a26', mush: ['#ff7a3a', '#5a2a1a'], liquid: 'lava' },
      floresta: { grass: '#3a3228', tuft: 'rgba(20,10,5,0.5)', path: '#5a4a3a', pathIn: '#6e5a46', water: '#ff5a1a', waterIn: '#ffa040', tree: '#2a2016', treeKind: 'dead', rock: '#4a4440', flowers: ['#ff7a2a'], liquid: 'lava' },
      cidade: { roofs: ['#2a1a16', '#3a2420', '#241612'], neon: ['#ff5a1a', '#ffb347', '#ff2a2a'], lamp: '255,120,40' },
      mansao: { grass: '#3a3228', hedge: '#2a2016', woods: ['#4a3020', '#3e2818'], tree: '#2a2016', treeKind: 'dead', light: '255,120,40' },
      features: ['lava'],
      mods: { brasas: true },
    },
    deserto: {
      label: 'deserto',
      masmorra: { void: '#2a2014', floor: '#c9a86a', corridor: '#b8965a', wall: '#6b5030', light: '255,190,90', core: '#ffe08a', pillar: '#a88850', crack: 'rgba(90,60,20,0.35)', hatch: 'rgba(60,40,10,0.5)' },
      caverna: { rock: '#3a2a18', edge: '#1e150a', floor: '#b08850', water: '#3aa0b0', stal: '#8a6a40' },
      floresta: { grass: '#d9bb7c', tuft: null, dunes: true, path: '#b89a60', pathIn: '#c9ab70', water: '#3aa0b0', waterIn: '#5cc0cc', tree: '#4a8a3a', treeKind: 'cactus', treeDensity: 0.7, rock: '#a08a6a', flowers: [], noRiver: true },
      cidade: { base: '#2e281f', asphalt: '#3a3228', sidewalk: '#8a7a5a', roofs: ['#c9a86a', '#b8965a', '#a88a5a', '#d4b67a'] },
      mansao: { grass: '#d9bb7c', hedge: '#8a7a4a', tree: '#4a8a3a', treeKind: 'cactus' },
    },
    pantano: {
      label: 'pântano',
      masmorra: { void: '#161a12', floor: '#6a7458', corridor: '#5e684c', wall: '#3a4230', light: '170,255,120', core: '#d8ffb0', pillar: '#4a5440' },
      caverna: { rock: '#22261a', edge: '#10120c', floor: '#5a5038', water: '#4a5a30', ripple: '200,230,150', mush: ['#a0c060', '#e0e0a0'] },
      floresta: { grass: '#4a5a32', tuft: 'rgba(20,30,10,0.5)', path: '#5a4a30', pathIn: '#6a583a', water: '#3a4a2a', waterIn: '#4a5e36', tree: '#2a3a22', treeKind: 'willow', rock: '#5a5a50', flowers: ['#d8e080'], pools: 5 },
      mansao: { grass: '#3a4a2a', hedge: '#26321c' },
      mods: { neblina: true },
    },
    sombrio: {
      label: 'sombrio',
      masmorra: { void: '#0e0c10', floor: '#5e5a60', corridor: '#504c52', wall: '#26222a', light: '170,120,255', core: '#d8c8ff', pillar: '#3e3a42', crack: 'rgba(20,10,30,0.45)' },
      caverna: { rock: '#141216', edge: '#08070a', floor: '#4a4448', water: '#2a2440', crystal: '170,120,255', crystalCore: '#e0d0ff', mush: ['#8a5aaa', '#5a3a6a'] },
      floresta: { grass: '#2e3a2c', tuft: 'rgba(10,15,10,0.55)', path: '#4a4034', pathIn: '#5a4e40', water: '#1e2a36', waterIn: '#2a3a48', tree: '#1c261c', treeKind: 'dead', rock: '#4a4a48', flowers: ['#8a5aaa'] },
      cidade: { roofs: ['#1a1a20', '#22202a', '#18181c'], neon: ['#b967ff', '#5a2aff'], neonChance: 0.3, lamp: '170,140,255' },
      mansao: { grass: '#2e3a28', hedge: '#1e2a1c', woods: ['#4a3424', '#3e2c1e', '#52392a'], rugs: ['#3a1016', '#1a1a2a'], light: '200,160,255', tree: '#1c261c', treeKind: 'dead' },
      features: ['teias'],
    },
    selva: {
      label: 'selva',
      masmorra: { void: '#141a10', floor: '#6a7458', corridor: '#5e684c', wall: '#34402a', pillar: '#4a5a3a' },
      caverna: { floor: '#5a6a44', rock: '#1e2618' },
      floresta: { grass: '#3f6a2a', tree: '#1f4a1f', treeColors: ['#1f4a1f', '#2a5a22', '#18401a'], treeDensity: 0.42, flowers: ['#ff4a6a', '#ffd23a', '#ff8a2a'], water: '#2a6a5a', waterIn: '#3a8a72' },
      mansao: { grass: '#3f6a2a', hedge: '#1f4a1f' },
    },
    outono: {
      label: 'outono',
      floresta: { grass: '#7a7a3a', tuft: 'rgba(80,60,20,0.4)', treeColors: ['#b8651f', '#9a3a1a', '#c9922a', '#7a4a1a'], flowers: ['#e0a040'] },
      mansao: { grass: '#7a7a3a', tree: '#b8651f' },
    },
    tecnologico: {
      label: 'tecnológico',
      masmorra: { void: '#0b0d11', floor: '#4a5058', corridor: '#3e444c', wall: '#1a2028', light: '5,217,232', core: '#b8f6ff', pillar: '#2a3038', crack: 'rgba(0,0,0,0.3)', hatch: null, tech: true },
      caverna: { light: '5,217,232' },
      mansao: { woods: ['#6a6e76', '#5a5e66'], light: '180,230,255' },
      features: ['tech'],
    },
    esgoto: {
      label: 'esgoto',
      masmorra: { void: '#10130e', floor: '#5c6450', corridor: '#4e5644', wall: '#262c20', light: '140,255,120', core: '#d8ffc8', pillar: '#3a4232' },
      features: ['canal'],
    },
    cristal: {
      label: 'cristais',
      masmorra: { light: '150,120,255', core: '#e0d8ff' },
      caverna: { crystal: '180,140,255', crystalCore: '#efe6ff', crystalChance: 0.07 },
      features: ['cristais'],
    },
    antiga: {
      label: 'época antiga',
      cidade: { base: '#221e1a', asphalt: '#2a2622', sidewalk: '#5a524a', roofs: ['#6a3a2a', '#5a4a3a', '#4a3a30', '#7a5a44'], neon: [], neonChance: 0, lane: 'rgba(230,220,200,0.3)', cars: ['#1a1a1a', '#2a2420', '#3a2a20'], lamp: '255,200,120', lampChance: 0.08, puddles: false, helipads: false },
    },
  };

  // ============ intérprete do tema ============
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // "=palavra" exige a palavra inteira; sem "=" aceita qualquer terminação (radical).
  function findWord(text, w) {
    const exact = w.startsWith('=');
    const word = (exact ? w.slice(1) : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(^|[^a-z0-9])${word}${exact ? '(?![a-z0-9])' : ''}`).exec(text);
    return m ? m.index + m[1].length : -1;
  }
  const firstOf = (text, words) => words.reduce((best, w) => { const i = findWord(text, w); return i >= 0 && (best < 0 || i < best) ? i : best; }, -1);

  const TYPE_WORDS = {
    masmorra: ['masmorra', 'dungeon', 'calabouco', 'prisao', 'cripta', 'catacumba', 'templo', 'tumba', 'sepulcro', 'fortaleza', 'castelo', 'labirinto', 'porao', 'esgoto', 'bunker', 'laboratorio', '=base', 'complexo', '=nave', 'estacao espacial', 'piramide', 'santuario', 'mausoleu', '=cela', 'celas', '=torre', 'covil', 'salao do trono', 'sala do trono', 'fabrica', 'armazem'],
    caverna: ['caverna', 'gruta', '=mina', 'minas', '=toca', 'subterran', 'tunel', 'tuneis', 'vulcao', 'abismo', 'fenda', 'geleira'],
    floresta: ['floresta', 'bosque', '=mata', 'selva', 'trilha', 'estrada', '=campo', 'campos', 'planicie', 'pantano', 'brejo', 'deserto', 'oasis', 'acampamento', '=vale', 'cemiterio', '=vila', 'aldeia', 'vilarejo', 'povoado', 'fazenda', 'clareira', 'praia', 'montanha', 'colina', '=rio', '=lago', 'lagoa', 'savana', 'tundra', 'estepe', '=ermo', 'ermos', 'mangue', 'encruzilhada'],
    cidade: ['cidade', '=rua', 'ruas', 'metropole', 'distrito', 'bairro', 'periferia', 'beco', '=centro', 'night city', 'megacidade', 'downtown', 'estacionamento', 'avenida', 'favela', 'urban', 'cruzamento', 'quarteirao'],
    mansao: ['mansao', '=casa', 'casarao', '=solar', 'residencia', 'hotel', 'hospital', 'manicomio', '=asilo', 'sanatorio', 'biblioteca', 'museu', 'escola', 'taverna', 'estalagem', '=bar', '=pub', 'hospedaria', 'delegacia', 'escritorio', 'palacio', 'igreja', 'capela', 'orfanato', 'clinica', 'apartamento', 'chale', 'saloon', 'cervejaria', 'restaurante', 'loja'],
  };

  const PALETTE_WORDS = [
    ['gelo', ['gelo', 'gelad', 'neve', 'nevad', 'congelad', 'inverno', 'glacia', 'geleira', 'artic', 'polar', '=frio', 'frigid', 'tundra', 'nevasca']],
    ['fogo', ['lava', 'fogo', 'vulca', 'inferno', 'infernal', 'magma', 'chama', 'demon', 'brasa', 'incendi', 'queimad', 'ardent']],
    ['deserto', ['deserto', 'areia', 'duna', 'oasis', 'egit', 'farao', 'piramide', 'arid', 'savana']],
    ['pantano', ['pantano', 'brejo', 'lodo', 'charco', 'mangue', 'lamaca', 'alagad']],
    ['selva', ['selva', 'tropical', 'jungle', 'amazon']],
    ['outono', ['outono', 'outonal']],
    ['tecnologico', ['laborator', 'bunker', '=base', '=nave', 'estacao espacial', 'corporac', 'tecnolog', 'futurist', 'servidor', 'data center', 'fabrica', 'industrial', 'militar', 'cyber', 'cibern']],
    ['esgoto', ['esgoto', 'bueiro', 'galeria pluvial']],
    ['cristal', ['cristal', 'cristais', 'arcan', 'magic', 'feitic', '=mago', 'encantad', '=runa', 'runas']],
    ['sombrio', ['assombrad', 'sombri', 'maldit', 'amaldicoad', 'fantasma', 'horror', '=morto', 'mortos', '=morte', 'necro', 'sinistr', 'tenebros', 'macabr', 'profan', 'terror', 'lovecraft', 'cthulhu', 'escuridao', 'cemiterio', 'cripta', 'mausoleu', 'vampir', 'zumbi', 'demoniac']],
    ['antiga', ['anos 20', '1920', 'vitorian', 'londres', 'arkham', 'colonial', 'epoca antiga', 'antigamente']],
  ];

  const FEATURE_WORDS = {
    sangue: ['sangue', 'sangrent', 'massacre', 'carnific', 'abatedouro', 'chacina', 'assassinat', 'cena do crime'],
    ritual: ['ritual', '=culto', 'cultista', 'sacrifici', 'pentagram', 'invocac', 'seita', 'profan'],
    ruinas: ['ruina', 'abandonad', 'destruid', 'devastad', 'pos-apocal', 'apocalip', 'decaden', 'escombro', 'desmoronad', 'em pedacos', 'arruinad'],
    cemiterio: ['cemiterio', 'tumulo', 'lapide', 'sepultura', 'campo santo', 'covas'],
    cripta: ['cripta', 'catacumba', 'tumba', 'mausoleu', 'sepulcro', 'sarcofag', 'piramide', 'necropole', 'farao'],
    templo: ['templo', 'igreja', 'catedral', 'capela', 'santuario', '=altar', 'piramide', 'mosteiro'],
    taverna: ['taverna', 'estalagem', '=bar', '=pub', 'hospedaria', 'saloon', 'cervejaria', 'restaurante'],
    tesouro: ['tesouro', '=ouro', 'riqueza', '=rico', 'rica', 'cofre', 'dragao', 'palacio', 'nobre', '=real'],
    vila: ['=vila', 'aldeia', 'vilarejo', 'povoado', 'fazenda', 'cabana', 'cabanas', 'cidade medieval', 'casebre'],
    rio: ['=rio', 'riacho', 'corrego', '=ponte'],
    lago: ['=lago', 'lagoa', 'oasis', 'pocas', 'charco'],
    prisao: ['prisao', '=cela', 'celas', 'calabouco', 'carcere', 'presidio'],
    trono: ['trono', '=rei', 'rainha', '=lorde', 'imperador', 'salao real'],
    hospital: ['hospital', 'manicomio', '=asilo', 'sanatorio', 'clinica', 'enfermaria'],
    biblioteca: ['biblioteca', 'livros', 'arquivo', 'escritorio', 'estudo'],
    teias: ['teia', 'aranha', 'aranhas'],
  };

  const MOD_WORDS = {
    noite: ['noite', 'noturn', 'meia-noite', 'meia noite', '=lua', 'escur', 'anoitecer', 'madrugada', 'night'],
    dia: ['=dia', 'ensolarad', 'manha', 'meio-dia', '=sol'],
    neblina: ['neblina', 'nevoa', 'bruma', 'nebulos', 'cerracao', 'fumaca'],
    chuva: ['chuva', 'tempestade', 'chuvos', 'garoa', 'temporal'],
    neve: ['neve', 'nevasca', 'nevand', 'nevad'],
  };

  const FEATURE_LABELS = {
    sangue: 'sangue', ritual: 'ritual', ruinas: 'ruínas', cemiterio: 'túmulos', cripta: 'sarcófagos', templo: 'altar', taverna: 'taverna',
    tesouro: 'tesouro', vila: 'casas', rio: 'rio', lago: 'lago', prisao: 'celas', trono: 'trono', hospital: 'enfermaria', biblioteca: 'biblioteca', teias: 'teias',
  };
  const MOD_LABELS = { noite: 'noite', neblina: 'neblina', chuva: 'chuva', neve: 'neve' };

  function interpret(input, system = 'dnd5e') {
    const text = norm(input);
    // Tipo: a palavra de tipo que aparece primeiro na frase manda ("caverna na floresta" = caverna).
    let type = null;
    let typePos = -1;
    for (const [key, words] of Object.entries(TYPE_WORDS)) {
      const i = firstOf(text, words);
      if (i >= 0 && (typePos < 0 || i < typePos)) { type = key; typePos = i; }
    }
    let palette = null;
    let palPos = -1;
    for (const [key, words] of PALETTE_WORDS) {
      const i = firstOf(text, words);
      if (i >= 0 && (palPos < 0 || i < palPos)) { palette = key; palPos = i; }
    }
    const features = new Set(Object.keys(FEATURE_WORDS).filter(k => firstOf(text, FEATURE_WORDS[k]) >= 0));
    const mods = {};
    for (const [k, words] of Object.entries(MOD_WORDS)) if (firstOf(text, words) >= 0) mods[k] = true;

    // explicit: a frase falou de um lugar (tipo, ambiente ou elemento), não é só o padrão do sistema
    const explicit = !!type || !!palette || features.size > 0;
    // Sem tipo explícito: deduz pelos elementos e pela paleta.
    if (!type) {
      if (features.has('taverna') || features.has('hospital') || features.has('biblioteca')) type = 'mansao';
      else if (features.has('cemiterio') || features.has('vila') || ['deserto', 'pantano', 'selva', 'outono'].includes(palette)) type = 'floresta';
      else if (features.has('cripta') || features.has('templo') || features.has('prisao') || features.has('trono') || ['tecnologico', 'esgoto'].includes(palette)) type = 'masmorra';
      else if (['fogo', 'cristal', 'gelo'].includes(palette)) type = 'caverna';
      else type = { dnd5e: 'masmorra', cyberpunk: 'cidade', coc: 'mansao' }[system] || 'masmorra';
    }
    // "Cidade" fora do Cyberpunk: vila medieval em D&D, cidade antiga em Cthulhu.
    const neonWords = firstOf(text, ['neon', 'cyber', 'futurist', 'night city', 'megacidade', 'corporac']) >= 0;
    if (type === 'cidade' && !neonWords) {
      if (system === 'dnd5e' || firstOf(text, ['medieval', 'fantasia']) >= 0) { type = 'floresta'; features.add('vila'); }
      else if (system === 'coc' && !palette) palette = 'antiga';
    }
    if (features.has('cemiterio') && !palette) palette = 'sombrio';
    if (mods.neve && !palette) palette = 'gelo';

    const pal = PALETTES[palette];
    for (const f of pal?.features || []) features.add(f);
    for (const [k, v] of Object.entries(pal?.mods || {})) if (!(k === 'neve' && firstOf(text, ['sem neve']) >= 0)) mods[k] = mods[k] ?? v;
    if (mods.dia) delete mods.noite;
    delete mods.dia;

    let size = 'm';
    if (firstOf(text, ['pequen', 'compact', '=mini', 'curt', 'apertad']) >= 0) size = 's';
    if (firstOf(text, ['grande', 'enorme', 'vast', 'gigant', 'imens', 'extens', 'ampl', 'labirint']) >= 0) size = 'l';

    const typeName = TYPES.find(t => t.key === type).name;
    const parts = [typeName];
    if (pal) parts.push(pal.label);
    for (const f of features) if (FEATURE_LABELS[f] && !(f === 'teias' && palette === 'sombrio')) parts.push(FEATURE_LABELS[f]);
    for (const m of Object.keys(mods)) if (MOD_LABELS[m] && !(m === 'neve' && palette === 'gelo')) parts.push(MOD_LABELS[m]);
    return { type, size, palette, features: [...features], mods, label: parts.join(' · '), text: input, explicit };
  }

  // ============ utilidades de desenho ============
  function makeRng(seed) {
    let h = 1779033703 ^ seed.length;
    for (const ch of seed) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    const R = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    R.int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
    R.pick = arr => arr[Math.floor(R() * arr.length)];
    R.chance = p => R() < p;
    return R;
  }

  function makeNoise(R, scale) {
    const N = 64;
    const g = Array.from({ length: N * N }, () => R());
    const smooth = t => t * t * (3 - 2 * t);
    const at = (i, j) => g[((j & (N - 1)) * N) + (i & (N - 1))];
    return (x, y) => {
      x /= scale; y /= scale;
      const x0 = Math.floor(x); const y0 = Math.floor(y);
      const u = smooth(x - x0); const w = smooth(y - y0);
      const a = at(x0, y0); const b = at(x0 + 1, y0); const c = at(x0, y0 + 1); const d = at(x0 + 1, y0 + 1);
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    };
  }

  function tint(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  const grid = (cols, rows, v) => Array.from({ length: rows }, () => new Array(cols).fill(v));
  const inb = (cols, rows, x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

  function bfs(cols, rows, starts, passable, maxDist) {
    const dist = new Int16Array(cols * rows).fill(-1);
    const q = [];
    for (const [x, y] of starts) {
      if (!inb(cols, rows, x, y) || !passable(x, y) || dist[y * cols + x] >= 0) continue;
      dist[y * cols + x] = 0;
      q.push([x, y]);
    }
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      const d = dist[y * cols + x];
      if (d >= maxDist) continue;
      for (const [dx, dy] of D4) {
        const nx = x + dx; const ny = y + dy;
        if (!inb(cols, rows, nx, ny) || dist[ny * cols + nx] >= 0 || !passable(nx, ny)) continue;
        dist[ny * cols + nx] = d + 1;
        q.push([nx, ny]);
      }
    }
    return q;
  }

  function withBorder(cols, rows, cells) {
    const set = new Set(cells.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of cells) for (const [dx, dy] of D8) if (inb(cols, rows, x + dx, y + dy)) set.add(`${x + dx},${y + dy}`);
    return [...set].map(k => k.split(',').map(Number));
  }

  function circle(g, x, y, r, fill) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  }

  function glow(g, x, y, r, rgb, alpha) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${rgb},${alpha})`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Luzes são desenhadas no fim, para brilharem por cima da escuridão da noite.
  const light = (D, x, y, r, rgb, alpha, core) => D.lights.push({ x, y, r, rgb, alpha, core });

  function drawTree(g, x, y, r, R, P) {
    const kind = P.treeKind || 'round';
    g.fillStyle = 'rgba(0,0,0,0.33)';
    g.beginPath(); g.ellipse(x + r * 0.28, y + r * 0.32, r * (kind === 'cactus' ? 0.5 : 1), r * (kind === 'cactus' ? 0.35 : 0.85), 0, 0, Math.PI * 2); g.fill();
    const base = P.treeColors ? R.pick(P.treeColors) : P.tree;
    if (kind === 'pine') {
      for (let layer = 0; layer < 3; layer++) {
        const rr = r * (1 - layer * 0.28);
        g.fillStyle = tint(base, layer * 0.12 + (R() - 0.5) * 0.1);
        g.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8 + layer * 0.2;
          const rad = k % 2 ? rr * 0.55 : rr;
          g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        }
        g.closePath(); g.fill();
        if (P.snowTrees) {
          g.fillStyle = 'rgba(255,255,255,0.75)';
          for (let k = 0; k < 4; k++) circle(g, x + (R() - 0.5) * rr, y + (R() - 0.5) * rr, r * 0.08, 'rgba(255,255,255,0.8)');
        }
      }
      circle(g, x, y, r * 0.1, P.snowTrees ? '#ffffff' : tint(base, 0.3));
    } else if (kind === 'dead') {
      g.strokeStyle = '#3e3024'; g.lineCap = 'round';
      const n = R.int(5, 7);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + R() * 0.5;
        const len = r * (0.6 + R() * 0.4);
        const ex = x + Math.cos(a) * len; const ey = y + Math.sin(a) * len;
        g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
        g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.6); g.lineTo(ex + Math.cos(a + 0.8) * r * 0.3, ey + Math.sin(a + 0.8) * r * 0.3); g.stroke();
      }
      circle(g, x, y, r * 0.2, '#4a3a2c');
    } else if (kind === 'cactus') {
      circle(g, x, y, r * 0.42, tint(base, (R() - 0.5) * 0.2));
      circle(g, x - r * 0.45, y - r * 0.1, r * 0.2, tint(base, -0.1));
      circle(g, x + r * 0.42, y + r * 0.12, r * 0.18, tint(base, -0.1));
      circle(g, x - r * 0.1, y - r * 0.12, r * 0.18, tint(base, 0.2));
      if (R() < 0.4) circle(g, x, y - r * 0.3, r * 0.1, '#ff6a8a');
    } else if (kind === 'willow') {
      circle(g, x, y, r, tint(base, (R() - 0.5) * 0.15));
      g.strokeStyle = tint(base, 0.2); g.lineWidth = r * 0.05;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3); g.quadraticCurveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.6, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95 + r * 0.1); g.stroke();
      }
    } else {
      circle(g, x, y, r, tint(base, (R() - 0.5) * 0.25));
      circle(g, x - r * 0.25, y - r * 0.25, r * 0.55, tint(base, 0.18 + R() * 0.1));
    }
  }

  function stoneRect(g, x, y, w, h, color) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + w * 0.08, y + h * 0.08, w, h);
    g.fillStyle = color; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(1, Math.min(w, h) * 0.06); g.strokeRect(x, y, w, h);
  }

  function pentagram(g, cx, cy, r, color) {
    g.save();
    g.strokeStyle = color; g.lineWidth = r * 0.06; g.shadowColor = color; g.shadowBlur = r * 0.3;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (let k = 0; k <= 5; k++) {
      const a = -Math.PI / 2 + ((k * 2) % 5) * (Math.PI * 2 / 5);
      g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    }
    g.stroke();
    g.restore();
  }

  function cobweb(g, x, y, s, dx, dy) {
    g.strokeStyle = 'rgba(230,230,230,0.35)'; g.lineWidth = Math.max(1, s * 0.02);
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(x, y, s * 0.28 * k, dx > 0 ? (dy > 0 ? 0 : -Math.PI / 2) : (dy > 0 ? Math.PI / 2 : Math.PI), (dx > 0 ? (dy > 0 ? 0 : -Math.PI / 2) : (dy > 0 ? Math.PI / 2 : Math.PI)) + Math.PI / 2); g.stroke(); }
    for (let k = 0; k < 3; k++) { const a = (k / 2) * (Math.PI / 2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx * Math.cos(a) * s * 0.9, y + dy * Math.sin(a) * s * 0.9); g.stroke(); }
  }

  // ============ objetos interativos ============
  const LOOT = {
    dnd5e: ['32 moedas de ouro', 'uma poção de cura', 'uma adaga +1', 'um pergaminho de bola de fogo', 'uma gema de 50 po', 'um mapa rasgado', 'um anel misterioso', 'uma corda élfica', '12 flechas de prata'],
    cyberpunk: ['500 eurodólares', 'um chip de dados criptografado', 'uma pistola pesada', 'um estimulante médico', 'munição perfurante', 'um cartão de acesso corporativo', 'um implante usado', 'uma granada de pulso'],
    coc: ['um diário manchado', 'um revólver .38', 'uma lanterna', 'um tomo proibido', 'fotografias estranhas', 'uma chave antiga', 'uma carta sem remetente', 'um amuleto esculpido'],
  };
  const TRAP_DAMAGE = { dnd5e: '2d6', cyberpunk: '2d6', coc: '1d6' };
  function pickLoot(R, system, rich) {
    const list = LOOT[system] || LOOT.dnd5e;
    const a = R.pick(list); const b = R.pick(list);
    const loot = a === b ? a : `${a} e ${b}`;
    return rich && system === 'dnd5e' ? `${loot}, além de 150 moedas de ouro` : loot;
  }

  function addTraps(D, R, cells, n, system) {
    const pool = [...cells];
    for (let k = 0; k < n && pool.length; k++) {
      const [x, y] = pool.splice(Math.floor(R() * pool.length), 1)[0];
      D.objects.push({ type: 'trap', x, y, damage: TRAP_DAMAGE[system] || '2d6' });
    }
  }

  // Paredes finas entre duas áreas andáveis: umas viram "rachadas" (dá para quebrar) e uma vira passagem secreta com alavanca.
  function addWallSecrets(D, R, cols, rows, isWall, walk) {
    const thin = [];
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      if (!isWall(x, y)) continue;
      if (walk(x - 1, y) && walk(x + 1, y)) thin.push([x, y, [x - 1, y]]);
      else if (walk(x, y - 1) && walk(x, y + 1)) thin.push([x, y, [x, y - 1]]);
    }
    const take = () => thin.splice(Math.floor(R() * thin.length), 1)[0];
    for (let k = 0; k < 2 && thin.length; k++) { const [x, y] = take(); D.objects.push({ type: 'crack', x, y }); }
    if (!thin.length) return;
    const [sx, sy, side] = take();
    const near = bfs(cols, rows, [side], walk, 3).filter(([x, y]) => !D.objects.some(o => o.x === x && o.y === y));
    const spot = near[near.length - 1] || side;
    D.objects.push({ type: 'secret', x: sx, y: sy });
    D.objects.push({ type: 'lever', x: spot[0], y: spot[1], target: D.objects.length - 1 });
  }

  // ============ masmorra ============
  function masmorra(g, cols, rows, s, R, D, P, F) {
    const T = grid(cols, rows, 0); // 0 rocha, 1 sala, 2 corredor, 3 lava
    const rooms = [];
    const target = Math.max(5, Math.round((cols * rows) / 55));
    for (let i = 0; i < 500 && rooms.length < target; i++) {
      const w = R.int(4, 8); const h = R.int(3, 6);
      const x = R.int(1, cols - w - 1); const y = R.int(1, rows - h - 1);
      if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) T[y][x] = 1;
    rooms.sort((a, b) => a.cx - b.cx);
    const dig = (x, y) => { if (T[y][x] === 0) T[y][x] = 2; };
    const corridor = (a, b) => {
      const h = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) dig(x, y); };
      const v = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) dig(x, y); };
      if (R() < 0.5) { h(a.cy, a.cx, b.cx); v(b.cx, a.cy, b.cy); } else { v(a.cx, a.cy, b.cy); h(b.cy, a.cx, b.cx); }
    };
    for (let i = 1; i < rooms.length; i++) {
      let best = rooms[0];
      for (let j = 0; j < i; j++) if (Math.hypot(rooms[j].cx - rooms[i].cx, rooms[j].cy - rooms[i].cy) < Math.hypot(best.cx - rooms[i].cx, best.cy - rooms[i].cy)) best = rooms[j];
      corridor(rooms[i], best);
    }
    for (let k = 0; k < 2; k++) { const a = R.pick(rooms); const b = R.pick(rooms); if (a !== b) corridor(a, b); }
    const entrance = rooms[0];
    const exit = rooms.reduce((m, r) => (Math.hypot(r.cx - entrance.cx, r.cy - entrance.cy) > Math.hypot(m.cx - entrance.cx, m.cy - entrance.cy) ? r : m), entrance);
    const biggest = rooms.filter(r => r !== entrance && r !== exit).reduce((m, r) => (!m || r.w * r.h > m.w * m.h ? r : m), null);
    // Poças de lava no miolo das salas (sempre sobra uma borda para passar)
    if (F.has('lava')) {
      for (const r of rooms) {
        if (r === entrance || r.w < 5 || r.h < 4 || !R.chance(0.55)) continue;
        const cx = r.x + r.w / 2; const cy = r.y + r.h / 2; const rx = (r.w - 2) / 2; const ry = (r.h - 2) / 2;
        for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.05 && !(x === r.cx && y === r.cy && r === exit)) T[y][x] = 3;
        }
      }
    }
    const solid = (x, y) => inb(cols, rows, x, y) && T[y][x] > 0;
    const walk = (x, y) => inb(cols, rows, x, y) && (T[y][x] === 1 || T[y][x] === 2);

    // Rocha
    g.fillStyle = P.void;
    g.fillRect(0, 0, cols * s, rows * s);
    if (P.hatch) {
      g.strokeStyle = P.hatch;
      g.lineWidth = Math.max(1, s * 0.05);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (T[y][x] || !D8.some(([dx, dy]) => solid(x + dx, y + dy))) continue;
        const a = R() * Math.PI;
        for (let k = 0; k < 3; k++) {
          const ox = (R() - 0.5) * s * 0.6; const oy = (R() - 0.5) * s * 0.6;
          g.beginPath();
          g.moveTo(x * s + s / 2 + ox - Math.cos(a) * s * 0.25, y * s + s / 2 + oy - Math.sin(a) * s * 0.25);
          g.lineTo(x * s + s / 2 + ox + Math.cos(a) * s * 0.25, y * s + s / 2 + oy + Math.sin(a) * s * 0.25);
          g.stroke();
        }
      }
    }
    // Piso
    const crackChance = F.has('ruinas') ? 0.45 : 0.18;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!T[y][x]) continue;
      g.fillStyle = tint(T[y][x] === 2 ? P.corridor : P.floor, (R() - 0.5) * 0.14);
      g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      g.strokeStyle = P.crack;
      g.lineWidth = Math.max(1, s * 0.03);
      g.strokeRect(x * s + s * 0.05, y * s + s * 0.05, s * 0.9, s * 0.9);
      if (P.tech) for (const [a, b] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) circle(g, x * s + s * a, y * s + s * b, s * 0.035, 'rgba(255,255,255,0.18)');
      if (R() < crackChance) {
        g.beginPath();
        g.moveTo(x * s + s * R(), y * s + s * 0.1);
        g.lineTo(x * s + s * R(), y * s + s * 0.5);
        g.lineTo(x * s + s * R(), y * s + s * 0.9);
        g.stroke();
      }
      if (T[y][x] === 2 && F.has('canal')) {
        const horiz = walk(x - 1, y) || walk(x + 1, y);
        g.fillStyle = 'rgba(60,110,50,0.85)';
        if (horiz) g.fillRect(x * s, y * s + s * 0.35, s + 0.5, s * 0.3); else g.fillRect(x * s + s * 0.35, y * s, s * 0.3, s + 0.5);
      }
    }
    // Lava
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== 3) continue;
      circle(g, x * s + s / 2, y * s + s / 2, s * 0.75, '#c2330e');
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== 3) continue;
      circle(g, x * s + s / 2, y * s + s / 2, s * 0.55, '#ff6a1a');
      circle(g, x * s + s * (0.3 + R() * 0.4), y * s + s * (0.3 + R() * 0.4), s * 0.16, '#ffc14a');
      if (R() < 0.3) light(D, x * s + s / 2, y * s + s / 2, s * 1.6, '255,110,30', 0.35);
    }
    // Sombra interna e paredes
    const wallGap = F.has('ruinas') ? 0.12 : 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!T[y][x]) continue;
      for (const [dx, dy] of D4) {
        if (solid(x + dx, y + dy)) continue;
        const ex = dx === 1 ? (x + 1) * s : x * s; const ey = dy === 1 ? (y + 1) * s : y * s;
        const horiz = dy !== 0;
        const grd = horiz ? g.createLinearGradient(0, ey, 0, ey - dy * s * 0.4) : g.createLinearGradient(ex, 0, ex - dx * s * 0.4, 0);
        grd.addColorStop(0, 'rgba(0,0,0,0.45)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        if (horiz) g.fillRect(x * s, Math.min(ey, ey - dy * s * 0.4), s, s * 0.4);
        else g.fillRect(Math.min(ex, ex - dx * s * 0.4), y * s, s * 0.4, s);
        if (R() < wallGap) continue;
        g.fillStyle = P.wall;
        const t = s * 0.16;
        if (horiz) g.fillRect(x * s - t / 2, ey - t / 2, s + t, t); else g.fillRect(ex - t / 2, y * s - t / 2, t, s + t);
      }
    }
    // Portas (ou grades, numa prisão): viram objetos interativos, desenhados pelo jogo e não na imagem.
    const bars = F.has('prisao');
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== 2 || !R.chance(bars ? 0.8 : 0.45)) continue;
      for (const [dx, dy] of D4) {
        if (!inb(cols, rows, x + dx, y + dy) || T[y + dy][x + dx] !== 1) continue;
        const side = dx !== 0 ? walk(x, y - 1) || walk(x, y + 1) : walk(x - 1, y) || walk(x + 1, y);
        if (side) continue;
        D.objects.push({ type: 'door', x, y, dir: dx !== 0 ? 'v' : 'h', bars, tech: !!P.tech });
        break;
      }
    }
    // Decoração das salas
    for (const r of rooms) {
      const cell = () => [r.x + R.int(0, r.w - 1), r.y + R.int(0, r.h - 1)];
      const px = c => c * s + s / 2;
      if ((r.w >= 6 && r.h >= 5 && r !== entrance) || (F.has('templo') && r.w >= 5 && r.h >= 4)) {
        for (const [ax, ay] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
          if (T[ay][ax] !== 1) continue;
          circle(g, px(ax) + s * 0.08, px(ay) + s * 0.1, s * 0.32, 'rgba(0,0,0,0.4)');
          circle(g, px(ax), px(ay), s * 0.32, P.pillar);
          circle(g, px(ax) - s * 0.08, px(ay) - s * 0.08, s * 0.16, tint(P.pillar, 0.2));
        }
      }
      if (r === entrance) continue;
      if (F.has('cripta')) {
        for (let k = R.int(1, 2); k > 0; k--) {
          const [cx, cy] = cell();
          if (T[cy][cx] !== 1) continue;
          stoneRect(g, cx * s + s * 0.2, cy * s + s * 0.05, s * 0.6, s * 0.9, tint(P.pillar, 0.15));
          g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = s * 0.04;
          g.beginPath(); g.moveTo(cx * s + s * 0.5, cy * s + s * 0.2); g.lineTo(cx * s + s * 0.5, cy * s + s * 0.8); g.moveTo(cx * s + s * 0.35, cy * s + s * 0.38); g.lineTo(cx * s + s * 0.65, cy * s + s * 0.38); g.stroke();
        }
      }
      if (r !== exit && R.chance(F.has('tesouro') ? 0.85 : 0.4)) {
        const [cx, cy] = cell();
        if (T[cy][cx] === 1) {
          D.objects.push({ type: 'chest', x: cx, y: cy, loot: pickLoot(R, D.system, F.has('tesouro')) });
          if (F.has('tesouro')) for (let k = 0; k < 7; k++) circle(g, cx * s + s * (0.1 + R() * 0.8), cy * s + s * (0.75 + R() * 0.2), s * 0.06, R() < 0.5 ? '#f4c542' : '#d9a520');
        }
      }
      if (R.chance(F.has('ruinas') ? 0.9 : 0.35)) {
        const [cx, cy] = cell();
        for (let k = 0; k < (F.has('ruinas') ? 7 : 4); k++) circle(g, cx * s + s * (0.15 + R() * 0.7), cy * s + s * (0.15 + R() * 0.7), s * (0.05 + R() * 0.09), R() < 0.5 ? '#b9b2a6' : tint(P.floor, -0.3));
      }
      if (F.has('tech')) {
        if (R.chance(0.6)) {
          const [cx, cy] = cell();
          stoneRect(g, cx * s + s * 0.12, cy * s + s * 0.12, s * 0.76, s * 0.76, '#6a5a3a');
          g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = s * 0.04;
          g.beginPath(); g.moveTo(cx * s + s * 0.12, cy * s + s * 0.12); g.lineTo(cx * s + s * 0.88, cy * s + s * 0.88); g.moveTo(cx * s + s * 0.88, cy * s + s * 0.12); g.lineTo(cx * s + s * 0.12, cy * s + s * 0.88); g.stroke();
        }
        if (R.chance(0.6)) {
          const cx = r.x + R.int(0, r.w - 2); const cy = r.y;
          g.fillStyle = '#15191f'; g.fillRect(cx * s + s * 0.1, cy * s + s * 0.08, s * 1.8, s * 0.5);
          g.fillStyle = '#05d9e8'; g.fillRect(cx * s + s * 0.2, cy * s + s * 0.16, s * 0.7, s * 0.3); g.fillStyle = '#39ff14'; g.fillRect(cx * s + s * 1.05, cy * s + s * 0.16, s * 0.7, s * 0.3);
          light(D, cx * s + s, cy * s + s * 0.4, s * 1.4, '5,217,232', 0.35);
        }
      }
      if (F.has('cristais')) {
        for (let k = 0; k < 2; k++) {
          const [cx, cy] = cell();
          if (T[cy][cx] !== 1) continue;
          const x = cx * s + s / 2; const y = cy * s + s / 2;
          g.fillStyle = `rgb(${P.light})`;
          g.beginPath(); g.moveTo(x, y - s * 0.35); g.lineTo(x + s * 0.15, y); g.lineTo(x, y + s * 0.2); g.lineTo(x - s * 0.15, y); g.closePath(); g.fill();
          light(D, x, y, s * 1.5, P.light, 0.35);
        }
      }
      if (F.has('teias') && R.chance(0.6)) {
        const corners = [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]];
        const [cx, cy, dx, dy] = R.pick(corners);
        cobweb(g, cx * s, cy * s, s * 1.2, dx, dy);
      }
      const torches = F.has('ruinas') ? 1 : 2;
      for (let k = 0; k < torches; k++) {
        if (!R.chance(F.has('ruinas') ? 0.3 : 0.5)) continue;
        const [cx, cy] = cell();
        if (T[cy][cx] === 1) D.objects.push({ type: 'torch', x: cx, y: cy, lit: true, color: P.light });
      }
    }
    if (F.has('ritual') && biggest) {
      const cx = (biggest.x + biggest.w / 2) * s; const cy = (biggest.y + biggest.h / 2) * s;
      pentagram(g, cx, cy, Math.min(biggest.w, biggest.h) * s * 0.38, '#c21a1a');
      light(D, cx, cy, s * 2.5, '220,30,30', 0.35);
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * Math.PI * 2) / 5; light(D, cx + Math.cos(a) * s * 1.3, cy + Math.sin(a) * s * 1.3, s * 0.6, '255,200,120', 0.5, '#fff1c0'); }
    }
    const stairs = (r, down) => {
      const x = r.cx * s; const y = r.cy * s;
      for (let k = 0; k < 5; k++) {
        g.fillStyle = tint(P.floor, down ? -0.4 - k * 0.1 : -k * 0.08);
        g.fillRect(x + s * 0.1, y + s * 0.1 + k * s * 0.16, s * 0.8, s * 0.16);
      }
    };
    stairs(entrance, false);
    if (F.has('trono')) {
      const x = exit.cx * s; const y = exit.cy * s;
      g.fillStyle = '#7a1f2b'; g.fillRect(x + s * 0.3, y + s * 0.5, s * 0.4, (exit.y + exit.h - exit.cy - 0.5) * s);
      stoneRect(g, x + s * 0.12, y + s * 0.05, s * 0.76, s * 0.7, '#c9a227');
      g.fillStyle = '#8a1a24'; g.fillRect(x + s * 0.25, y + s * 0.25, s * 0.5, s * 0.4);
      light(D, x + s / 2, y + s / 2, s * 2, '255,210,120', 0.3);
    } else if (F.has('templo') || F.has('ritual')) {
      const x = exit.cx * s; const y = exit.cy * s;
      stoneRect(g, x - s * 0.3, y + s * 0.2, s * 1.6, s * 0.6, tint(P.pillar, 0.25));
      for (const ox of [-0.1, 1.1]) light(D, x + ox * s, y + s * 0.3, s * 0.9, '255,200,120', 0.5, '#fff1c0');
    } else {
      stairs(exit, true);
    }

    const starts = [];
    for (let y = entrance.y; y < entrance.y + entrance.h; y++) for (let x = entrance.x; x < entrance.x + entrance.w; x++) starts.push([x, y]);
    const safe = new Set(bfs(cols, rows, [[entrance.cx, entrance.cy]], walk, 4).map(([x, y]) => `${x},${y}`));
    const corridors = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (T[y][x] === 2 && !safe.has(`${x},${y}`) && !D.objects.some(o => o.x === x && o.y === y)) corridors.push([x, y]);
    addTraps(D, R, corridors, 2 + (F.has('ruinas') ? 1 : 0), D.system);
    addWallSecrets(D, R, cols, rows, (x, y) => inb(cols, rows, x, y) && !T[y][x], walk);
    D.spawn = bfs(cols, rows, [[entrance.cx, entrance.cy]], walk, 99).slice(1, 12);
    D.reveal = withBorder(cols, rows, starts);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (walk(x, y)) D.floor.push([x, y]);
      if (!T[y][x]) D.block[y * cols + x] = 1;
    }
  }

  // ============ caverna ============
  function caverna(g, cols, rows, s, R, D, P, F) {
    let T;
    let region = [];
    for (let attempt = 0; attempt < 6 && region.length < cols * rows * 0.3; attempt++) {
      T = grid(cols, rows, 0);
      for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) T[y][x] = R() < 0.45 ? 0 : 1;
      for (let it = 0; it < 5; it++) {
        const N = grid(cols, rows, 0);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          let walls = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inb(cols, rows, x + dx, y + dy) || !T[y + dy][x + dx]) walls++;
          N[y][x] = walls >= 5 || x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 0 : 1;
        }
        T = N;
      }
      const seen = grid(cols, rows, false);
      region = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (!T[y][x] || seen[y][x]) continue;
        const comp = bfs(cols, rows, [[x, y]], (a, b) => T[b][a] > 0, 999);
        for (const [a, b] of comp) seen[b][a] = true;
        if (comp.length > region.length) region = comp;
      }
    }
    const keep = new Set(region.map(([x, y]) => `${x},${y}`));
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!keep.has(`${x},${y}`)) T[y][x] = 0;
    const inner = (x, y) => D8.every(([dx, dy]) => inb(cols, rows, x + dx, y + dy) && T[y + dy][x + dx] > 0);
    let W = grid(cols, rows, 0);
    const wetness = F.has('lago') ? 0.5 : 0.4;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (T[y][x] && inner(x, y) && R() < wetness) W[y][x] = 1;
    for (let it = 0; it < 3; it++) {
      const N = grid(cols, rows, 0);
      for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
        let n = 0;
        for (const [dx, dy] of D8) n += W[y + dy][x + dx];
        N[y][x] = T[y][x] && inner(x, y) && n >= 4 ? 1 : 0;
      }
      W = N;
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (W[y][x]) T[y][x] = 2;
    const liquid = P.liquid;

    g.fillStyle = P.rock;
    g.fillRect(0, 0, cols * s, rows * s);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!T[y][x]) circle(g, x * s + s * R(), y * s + s * R(), s * (0.2 + R() * 0.3), tint(P.rock, (R() - 0.5) * 0.3));
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (T[y][x]) circle(g, x * s + s / 2, y * s + s / 2, s * 0.8, P.edge);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (T[y][x]) circle(g, x * s + s / 2, y * s + s / 2, s * 0.68, tint(P.floor, (R() - 0.5) * 0.16));
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== 2) continue;
      const cx = x * s + s / 2; const cy = y * s + s / 2;
      circle(g, cx, cy, s * 0.66, P.water);
      if (liquid === 'lava') {
        circle(g, x * s + s * (0.3 + R() * 0.4), y * s + s * (0.3 + R() * 0.4), s * 0.2, '#ffc14a');
        if (R() < 0.35) light(D, cx, cy, s * 1.7, '255,110,30', 0.35);
      } else if (liquid === 'ice') {
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.moveTo(x * s + s * R(), y * s + s * R()); g.lineTo(x * s + s * R(), y * s + s * R()); g.stroke();
      } else if (R() < 0.4) {
        g.strokeStyle = `rgba(${P.ripple},0.35)`; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.ellipse(x * s + s * R(), y * s + s * R(), s * 0.2, s * 0.07, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    const bones = F.has('cemiterio') || F.has('cripta') || F.has('sangue');
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== 1) continue;
      const nearWall = D4.some(([dx, dy]) => !T[y + dy]?.[x + dx]);
      const px = x * s + s / 2; const py = y * s + s / 2;
      if (nearWall && R() < 0.12) {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(px + s * 0.08, py + s * 0.12, s * 0.22, s * 0.12, 0, 0, Math.PI * 2); g.fill();
        circle(g, px, py, s * 0.2, P.stal); circle(g, px - s * 0.05, py - s * 0.05, s * 0.09, tint(P.stal, 0.3));
      } else if (R() < P.crystalChance) {
        g.fillStyle = P.crystalCore;
        g.beginPath(); g.moveTo(px, py - s * 0.3); g.lineTo(px + s * 0.12, py); g.lineTo(px, py + s * 0.15); g.lineTo(px - s * 0.12, py); g.closePath(); g.fill();
        light(D, px, py, s * 1.1, P.crystal, 0.35);
      } else if (R() < 0.03) {
        for (let k = 0; k < 3; k++) circle(g, px + (R() - 0.5) * s * 0.5, py + (R() - 0.5) * s * 0.5, s * 0.08, R.pick(P.mush));
      } else if (bones && R() < 0.05) {
        g.strokeStyle = '#e8e0cc'; g.lineWidth = s * 0.06; g.lineCap = 'round';
        g.beginPath(); g.moveTo(px - s * 0.2, py - s * 0.1); g.lineTo(px + s * 0.2, py + s * 0.1); g.stroke();
        circle(g, px + s * 0.25, py - s * 0.15, s * 0.1, '#e8e0cc');
      } else if (R() < 0.25) {
        circle(g, px + (R() - 0.5) * s * 0.7, py + (R() - 0.5) * s * 0.7, s * 0.04, 'rgba(40,32,24,0.5)');
      }
    }

    const walk = (x, y) => T[y][x] === 1 || (liquid === 'ice' && T[y][x] === 2);
    if (F.has('ritual')) {
      // Círculo no ponto mais "aberto" da caverna, longe da entrada
      const open = [];
      for (let y = 2; y < rows - 2; y++) for (let x = Math.floor(cols / 2); x < cols - 2; x++) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (T[y + dy][x + dx] !== 1) { ok = false; break; }
        if (ok) open.push([x, y]);
      }
      if (open.length) {
        const [ox, oy] = R.pick(open);
        pentagram(g, ox * s + s / 2, oy * s + s / 2, s * 1.3, '#c21a1a');
        light(D, ox * s + s / 2, oy * s + s / 2, s * 2.4, '220,30,30', 0.35);
      }
    }
    const floorCells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (T[y][x] === 1) floorCells.push([x, y]);
    floorCells.sort((a, b) => a[0] - b[0] || Math.abs(a[1] - rows / 2) - Math.abs(b[1] - rows / 2));
    const start = floorCells[0] || [1, 1];
    D.spawn = bfs(cols, rows, [start], (x, y) => T[y][x] === 1, 99).slice(0, 11);
    D.reveal = withBorder(cols, rows, bfs(cols, rows, [start], (x, y) => T[y][x] > 0, 4));
    const nearStart = new Set(bfs(cols, rows, [start], (x, y) => T[y][x] === 1, 6).map(([x, y]) => `${x},${y}`));
    const far = floorCells.filter(([x, y]) => !nearStart.has(`${x},${y}`));
    for (let k = R.int(1, 2); k > 0 && far.length; k--) {
      const [x, y] = far.splice(Math.floor(R() * far.length), 1)[0];
      D.objects.push({ type: 'chest', x, y, loot: pickLoot(R, D.system, F.has('tesouro')) });
    }
    addTraps(D, R, far, 2, D.system);
    addWallSecrets(D, R, cols, rows, (x, y) => inb(cols, rows, x, y) && !T[y][x], (x, y) => inb(cols, rows, x, y) && T[y][x] === 1);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (walk(x, y)) D.floor.push([x, y]);
      if (!T[y][x]) D.block[y * cols + x] = 1;
    }
  }

  // ============ floresta e ermos ============
  function floresta(g, cols, rows, s, R, D, P, F) {
    const GRASS = 0; const PATH = 1; const WATER = 2; const BRIDGE = 3; const TREE = 4; const ROCK = 5; const CLEAR = 6; const HOUSE = 7; const GRAVE = 8;
    const T = grid(cols, rows, GRASS);
    const noise = makeNoise(R, 4);
    let py = R.int(Math.floor(rows * 0.3), Math.floor(rows * 0.6));
    const pathStart = [];
    const pathCells = [];
    for (let x = 0; x < cols; x++) {
      T[py][x] = PATH; T[py + 1][x] = PATH;
      pathCells.push([x, py]);
      if (x < 2) pathStart.push([x, py], [x, py + 1]);
      if (R() < 0.35) py = Math.max(1, Math.min(rows - 3, py + (R() < 0.5 ? -1 : 1)));
    }
    const river = F.has('rio') || (!P.noRiver && R() < 0.65);
    if (river) {
      let rx = R.int(Math.floor(cols * 0.45), Math.floor(cols * 0.72));
      for (let y = 0; y < rows; y++) {
        for (const x of [rx, rx + 1]) T[y][x] = T[y][x] === PATH ? BRIDGE : WATER;
        if (R() < 0.4) rx = Math.max(2, Math.min(cols - 4, rx + (R() < 0.5 ? -1 : 1)));
      }
    }
    // Lagos e poças
    const lakes = (F.has('lago') ? 1 : 0) + (P.pools || 0) + (P.noRiver && !F.has('lago') ? 1 : 0);
    for (let k = 0; k < lakes; k++) {
      const big = k === 0 && F.has('lago');
      const lx = R.int(3, cols - 4); const ly = R.int(2, rows - 3); const lr = big ? R.int(3, 4) : R.int(1, 2) + 0.5;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (T[y][x] !== GRASS) continue;
        if (Math.hypot(x - lx, (y - ly) * 1.2) < lr + (noise(x * 2, y * 2) - 0.5) * 1.5) T[y][x] = WATER;
      }
    }
    // Casas da vila, ao longo da estrada
    const houses = [];
    if (F.has('vila')) {
      for (let i = 0; i < 40 && houses.length < Math.round(cols / 4); i++) {
        const [hx, hy0] = R.pick(pathCells);
        const w = R.int(2, 3); const h = 2;
        const above = R() < 0.5;
        const hy = above ? hy0 - h - 1 : hy0 + 3;
        let ok = hx + w < cols && hy >= 1 && hy + h < rows - 1;
        for (let y = hy - 1; ok && y <= hy + h; y++) for (let x = hx - 1; x <= hx + w; x++) if (!inb(cols, rows, x, y) || (T[y][x] !== GRASS)) ok = false;
        if (!ok) continue;
        for (let y = hy; y < hy + h; y++) for (let x = hx; x < hx + w; x++) T[y][x] = HOUSE;
        houses.push({ x: hx, y: hy, w, h, door: above ? 'down' : 'up' });
      }
    }
    const cc = [R.int(Math.floor(cols * 0.15), Math.floor(cols * 0.4)), R.int(2, rows - 3)];
    const graveyard = F.has('cemiterio') ? { x: R.int(Math.floor(cols * 0.45), cols - 8), y: R.int(1, Math.max(1, rows - 8)), w: 7, h: 6 } : null;
    const inGraveyard = (x, y) => graveyard && x >= graveyard.x && x < graveyard.x + graveyard.w && y >= graveyard.y && y < graveyard.y + graveyard.h;
    const nearHouse = (x, y) => houses.some(h => x >= h.x - 1 && x <= h.x + h.w && y >= h.y - 1 && y <= h.y + h.h);
    const density = P.treeDensity;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== GRASS) continue;
      if (inGraveyard(x, y)) {
        if (x > graveyard.x && y > graveyard.y && x < graveyard.x + graveyard.w - 1 && (x - graveyard.x) % 2 === 1 && (y - graveyard.y) % 2 === 1 && R() < 0.85) T[y][x] = GRAVE; else T[y][x] = CLEAR;
      } else if (Math.hypot(x - cc[0], y - cc[1]) < 2.6) T[y][x] = CLEAR;
      else if (nearHouse(x, y)) T[y][x] = CLEAR;
      else if ((noise(x, y) > density && R() < 0.8) || R() < (P.treeKind === 'cactus' ? 0.02 : 0.05)) T[y][x] = TREE;
      else if (R() < 0.03) T[y][x] = ROCK;
    }

    const shade = makeNoise(R, 6);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.fillStyle = tint(P.grass, (shade(x, y) - 0.5) * 0.35 + (R() - 0.5) * 0.06);
      g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      if (P.dunes) {
        g.strokeStyle = 'rgba(150,110,50,0.3)'; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.arc(x * s + s * R(), y * s + s * (0.6 + R() * 0.3), s * 0.4, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      } else if (P.tuft) {
        g.strokeStyle = P.tuft; g.lineWidth = Math.max(1, s * 0.03);
        for (let k = 0; k < 3; k++) { const tx = x * s + s * R(); const ty = y * s + s * R(); g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + s * 0.04, ty - s * 0.12); g.stroke(); }
      }
      if (P.flowers.length && R() < 0.04) circle(g, x * s + s * R(), y * s + s * R(), s * 0.05, R.pick(P.flowers));
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (T[y][x] === PATH) circle(g, x * s + s / 2, y * s + s / 2, s * 0.78, P.path);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== PATH) continue;
      circle(g, x * s + s / 2, y * s + s / 2, s * 0.6, tint(P.pathIn, (R() - 0.5) * 0.1));
      if (R() < 0.3) circle(g, x * s + s * R(), y * s + s * R(), s * 0.05, 'rgba(0,0,0,0.2)');
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (T[y][x] === WATER || T[y][x] === BRIDGE) circle(g, x * s + s / 2, y * s + s / 2, s * 0.85, P.water);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== WATER && T[y][x] !== BRIDGE) continue;
      circle(g, x * s + s / 2, y * s + s / 2, s * 0.6, P.waterIn);
      if (P.liquid === 'lava') { if (R() < 0.3) light(D, x * s + s / 2, y * s + s / 2, s * 1.6, '255,110,30', 0.35); continue; }
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = Math.max(1, s * 0.03);
      g.beginPath(); g.arc(x * s + s * R(), y * s + s * R(), s * 0.15, 0.3, 2.2); g.stroke();
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] !== BRIDGE) continue;
      g.fillStyle = '#7a5530'; g.fillRect(x * s - s * 0.05, y * s + s * 0.05, s * 1.1, s * 0.9);
      g.strokeStyle = '#4f361d'; g.lineWidth = Math.max(1, s * 0.04);
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x * s + (k * s) / 4, y * s + s * 0.05); g.lineTo(x * s + (k * s) / 4, y * s + s * 0.95); g.stroke(); }
      g.fillStyle = '#3e2a16'; g.fillRect(x * s - s * 0.05, y * s, s * 1.1, s * 0.08); g.fillRect(x * s - s * 0.05, y * s + s * 0.92, s * 1.1, s * 0.08);
    }
    // Clareira: círculo de ritual (culto) ou fogueira
    const fx = cc[0] * s + s / 2; const fy = cc[1] * s + s / 2;
    if (F.has('ritual')) {
      pentagram(g, fx, fy, s * 1.9, '#c21a1a');
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * Math.PI * 2) / 5; light(D, fx + Math.cos(a) * s * 2.2, fy + Math.sin(a) * s * 2.2, s * 0.8, '255,200,120', 0.5, '#fff1c0'); }
      light(D, fx, fy, s * 2.8, '220,30,30', 0.3);
    } else {
      for (let k = 0; k < 8; k++) circle(g, fx + Math.cos((k * Math.PI) / 4) * s * 0.35, fy + Math.sin((k * Math.PI) / 4) * s * 0.35, s * 0.1, '#77716a');
      g.strokeStyle = '#5a3a1c'; g.lineWidth = s * 0.1;
      g.beginPath(); g.moveTo(fx - s * 0.2, fy - s * 0.2); g.lineTo(fx + s * 0.2, fy + s * 0.2); g.moveTo(fx + s * 0.2, fy - s * 0.2); g.lineTo(fx - s * 0.2, fy + s * 0.2); g.stroke();
      light(D, fx, fy, s * 2.2, '255,160,50', 0.4, '#ffb13b');
    }
    // Cemitério: cerca e lápides
    if (graveyard) {
      g.strokeStyle = '#2a2a2e'; g.lineWidth = s * 0.06; g.setLineDash([s * 0.12, s * 0.08]);
      g.strokeRect(graveyard.x * s, graveyard.y * s, graveyard.w * s, graveyard.h * s);
      g.setLineDash([]);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] === ROCK) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x * s + s * 0.58, y * s + s * 0.62, s * 0.32, s * 0.2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = P.rock; g.beginPath(); g.ellipse(x * s + s / 2, y * s + s / 2, s * 0.3, s * 0.22, R(), 0, Math.PI * 2); g.fill();
      } else if (T[y][x] === GRAVE) {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * s + s * 0.3, y * s + s * 0.3, s * 0.5, s * 0.55);
        g.fillStyle = tint('#8e8e94', (R() - 0.5) * 0.2);
        g.beginPath(); g.moveTo(x * s + s * 0.22, y * s + s * 0.85); g.lineTo(x * s + s * 0.22, y * s + s * 0.35); g.arc(x * s + s * 0.47, y * s + s * 0.35, s * 0.25, Math.PI, 0); g.lineTo(x * s + s * 0.72, y * s + s * 0.85); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = s * 0.04;
        g.beginPath(); g.moveTo(x * s + s * 0.47, y * s + s * 0.3); g.lineTo(x * s + s * 0.47, y * s + s * 0.62); g.moveTo(x * s + s * 0.36, y * s + s * 0.42); g.lineTo(x * s + s * 0.58, y * s + s * 0.42); g.stroke();
      }
    }
    for (const h of houses) {
      const X = h.x * s; const Y = h.y * s; const W = h.w * s; const H = h.h * s;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(X + s * 0.2, Y + s * 0.25, W, H);
      const roof = R.pick(['#8a3a24', '#6a4a2a', '#5a5a5a', '#7a5a3a']);
      g.fillStyle = tint(roof, 0.1); g.fillRect(X, Y, W, H / 2);
      g.fillStyle = tint(roof, -0.15); g.fillRect(X, Y + H / 2, W, H / 2);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = s * 0.04;
      for (let k = 1; k < h.w * 3; k++) { g.beginPath(); g.moveTo(X + (k * s) / 3, Y); g.lineTo(X + (k * s) / 3, Y + H); g.stroke(); }
      g.strokeStyle = tint(roof, -0.4); g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(X, Y + H / 2); g.lineTo(X + W, Y + H / 2); g.stroke();
      g.fillStyle = '#5a5250'; g.fillRect(X + W * 0.7, Y + s * 0.15, s * 0.28, s * 0.28);
      const dx = X + W / 2 - s * 0.2; const dy = h.door === 'down' ? Y + H : Y - s * 0.15;
      g.fillStyle = '#4a2f18'; g.fillRect(dx, dy, s * 0.4, s * 0.15);
      light(D, X + W / 2, h.door === 'down' ? Y + H + s * 0.3 : Y - s * 0.3, s * 1.2, '255,200,120', 0.3);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (T[y][x] === TREE) drawTree(g, x * s + s / 2 + (R() - 0.5) * s * 0.2, y * s + s / 2 + (R() - 0.5) * s * 0.2, s * (0.55 + R() * 0.25), R, P);
    }

    const walk = (x, y) => ![TREE, WATER, ROCK, HOUSE, GRAVE].includes(T[y][x]) || (T[y][x] === WATER && P.liquid === 'ice');
    D.spawn = bfs(cols, rows, pathStart, walk, 99).slice(0, 11);
    D.reveal = withBorder(cols, rows, bfs(cols, rows, pathStart, (x, y) => T[y][x] !== WATER, 5));
    addTraps(D, R, pathCells.filter(([x]) => x > 5), 2, D.system);
    const stash = bfs(cols, rows, [cc], walk, 3).filter(([x, y]) => T[y][x] === CLEAR || T[y][x] === GRASS);
    if (stash.length) { const [x, y] = stash[stash.length - 1]; D.objects.push({ type: 'chest', x, y, loot: pickLoot(R, D.system, F.has('tesouro')) }); }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (walk(x, y)) D.floor.push([x, y]);
      // Visão: árvores bloqueiam (sem relevo, a copa já está na imagem); casas bloqueiam e ganham relevo baixo.
      if (T[y][x] === TREE) D.block[y * cols + x] = 2;
      if (T[y][x] === HOUSE) D.block[y * cols + x] = 3;
    }
  }

  // ============ cidade ============
  function cidade(g, cols, rows, s, R, D, P, F) {
    const streetCol = new Array(cols).fill(false);
    const streetRow = new Array(rows).fill(false);
    for (let x = R.int(1, 3); x < cols; x += 2 + R.int(5, 8)) { streetCol[x] = true; if (x + 1 < cols) streetCol[x + 1] = true; }
    for (let y = R.int(1, 3); y < rows; y += 2 + R.int(4, 7)) { streetRow[y] = true; if (y + 1 < rows) streetRow[y + 1] = true; }
    const isStreet = (x, y) => streetCol[x] || streetRow[y];
    const spans = flags => {
      const out = [];
      for (let i = 0; i < flags.length;) {
        if (flags[i]) { i++; continue; }
        const a = i;
        while (i < flags.length && !flags[i]) i++;
        out.push([a, i - a]);
      }
      return out;
    };
    const lots = [];
    const split = (r, depth) => {
      if (depth < 2 && r.w >= 6 && (r.w >= r.h || r.h < 6) && R() < 0.75) {
        const k = R.int(3, r.w - 3);
        split({ x: r.x, y: r.y, w: k, h: r.h }, depth + 1); split({ x: r.x + k, y: r.y, w: r.w - k, h: r.h }, depth + 1);
      } else if (depth < 2 && r.h >= 6 && R() < 0.75) {
        const k = R.int(3, r.h - 3);
        split({ x: r.x, y: r.y, w: r.w, h: k }, depth + 1); split({ x: r.x, y: r.y + k, w: r.w, h: r.h - k }, depth + 1);
      } else lots.push(r);
    };
    const blocks = [];
    for (const [bx, bw] of spans(streetCol)) for (const [by, bh] of spans(streetRow)) blocks.push({ x: bx, y: by, w: bw, h: bh });
    for (const b of blocks) split(b, 0);
    const ruins = F.has('ruinas');

    g.fillStyle = P.base;
    g.fillRect(0, 0, cols * s, rows * s);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!isStreet(x, y)) continue;
      g.fillStyle = tint(P.asphalt, (R() - 0.5) * 0.12);
      g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      if (ruins && R() < 0.25) {
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.moveTo(x * s + s * R(), y * s); g.lineTo(x * s + s * R(), y * s + s * 0.5); g.lineTo(x * s + s * R(), y * s + s); g.stroke();
      }
    }
    g.lineWidth = Math.max(1, s * 0.05);
    g.setLineDash([s * 0.35, s * 0.3]);
    g.strokeStyle = P.lane;
    for (let x = 0; x < cols - 1; x++) {
      if (!(streetCol[x] && streetCol[x + 1])) continue;
      for (let y = 0; y < rows; y++) if (!streetRow[y]) { g.beginPath(); g.moveTo((x + 1) * s, y * s); g.lineTo((x + 1) * s, (y + 1) * s); g.stroke(); }
    }
    for (let y = 0; y < rows - 1; y++) {
      if (!(streetRow[y] && streetRow[y + 1])) continue;
      for (let x = 0; x < cols; x++) if (!streetCol[x]) { g.beginPath(); g.moveTo(x * s, (y + 1) * s); g.lineTo((x + 1) * s, (y + 1) * s); g.stroke(); }
    }
    g.setLineDash([]);
    g.fillStyle = 'rgba(230,230,240,0.5)';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!(streetCol[x] && streetRow[y])) continue;
      for (const [dx, dy] of D4) {
        const nx = x + dx; const ny = y + dy;
        if (!inb(cols, rows, nx, ny) || (streetCol[nx] && streetRow[ny])) continue;
        for (let k = 0; k < 4; k++) {
          if (dx) g.fillRect(nx * s + (dx > 0 ? s * 0.05 : s * 0.75), ny * s + (k * s) / 4 + s * 0.04, s * 0.2, s * 0.14);
          else g.fillRect(nx * s + (k * s) / 4 + s * 0.04, ny * s + (dy > 0 ? s * 0.05 : s * 0.75), s * 0.14, s * 0.2);
        }
      }
    }
    for (const b of blocks) { g.fillStyle = P.sidewalk; g.fillRect(b.x * s, b.y * s, b.w * s, b.h * s); }
    const neonChance = P.neonChance * (ruins ? 0.3 : 1);
    for (const l of lots) {
      const i = s * 0.28;
      const x = l.x * s + i; const y = l.y * s + i; const w = l.w * s - i * 2; const h = l.h * s - i * 2;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + s * 0.2, y + s * 0.22, w, h);
      const roof = R.pick(P.roofs);
      g.fillStyle = roof; g.fillRect(x, y, w, h);
      g.strokeStyle = tint(roof, 0.25); g.lineWidth = Math.max(1, s * 0.06); g.strokeRect(x, y, w, h);
      if (ruins && R() < 0.5) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.beginPath(); g.ellipse(x + w * R(), y + h * R(), s * 0.8, s * 0.5, R(), 0, Math.PI * 2); g.fill();
      }
      const units = R.int(1, 4);
      for (let k = 0; k < units; k++) {
        const ux = x + R() * (w - s * 0.6); const uy = y + R() * (h - s * 0.6);
        g.fillStyle = '#5b6070'; g.fillRect(ux, uy, s * 0.5, s * 0.4);
        g.strokeStyle = '#3a3e4a'; g.strokeRect(ux, uy, s * 0.5, s * 0.4);
        circle(g, ux + s * 0.25, uy + s * 0.2, s * 0.12, '#444a58');
      }
      if (P.helipads && l.w >= 5 && l.h >= 5 && R() < 0.25) {
        const cx = x + w / 2; const cy = y + h / 2;
        circle(g, cx, cy, s * 1.1, '#23252c');
        g.strokeStyle = '#f7ec13'; g.lineWidth = s * 0.06; g.beginPath(); g.arc(cx, cy, s * 1, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#f7ec13'; g.font = `700 ${s}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', cx, cy + s * 0.05);
      }
      if (P.neon.length && R() < neonChance) {
        const c = R.pick(P.neon);
        g.save();
        g.shadowColor = c; g.shadowBlur = s * 0.6; g.strokeStyle = c; g.lineWidth = s * 0.09;
        g.beginPath();
        const side = R.int(0, 3);
        if (side === 0) { g.moveTo(x, y + h); g.lineTo(x + w, y + h); } else if (side === 1) { g.moveTo(x, y); g.lineTo(x + w, y); } else if (side === 2) { g.moveTo(x, y); g.lineTo(x, y + h); } else { g.moveTo(x + w, y); g.lineTo(x + w, y + h); }
        g.stroke();
        g.restore();
      }
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!isStreet(x, y)) continue;
      const px = x * s + s / 2; const py = y * s + s / 2;
      if (P.puddles && R() < 0.05) {
        const c = R.pick(['255,42,109', '5,217,232', '185,103,255']);
        g.fillStyle = `rgba(${c},0.22)`; g.beginPath(); g.ellipse(px, py, s * 0.45, s * 0.22, R(), 0, Math.PI * 2); g.fill();
      } else if (R() < 0.06) {
        const vertical = streetCol[x] && !streetRow[y];
        const cw = vertical ? s * 0.42 : s * 0.8; const ch = vertical ? s * 0.8 : s * 0.42;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(px - cw / 2 + s * 0.06, py - ch / 2 + s * 0.08, cw, ch);
        g.fillStyle = ruins ? R.pick(['#3a3430', '#2a2624', '#4a3a30']) : R.pick(P.cars);
        g.fillRect(px - cw / 2, py - ch / 2, cw, ch);
        g.fillStyle = ruins ? 'rgba(20,20,20,0.7)' : 'rgba(160,210,255,0.6)';
        if (vertical) g.fillRect(px - cw / 2 + s * 0.06, py - ch / 2 + s * 0.15, cw - s * 0.12, s * 0.16); else g.fillRect(px - cw / 2 + s * 0.15, py - ch / 2 + s * 0.06, s * 0.16, ch - s * 0.12);
      } else if (!streetCol[x] !== !streetRow[y] && R() < P.lampChance) {
        light(D, px, py, s * 1.4, P.lamp, 0.32, '#fff4d0');
      } else if (ruins && R() < 0.05) {
        for (let k = 0; k < 5; k++) circle(g, px + (R() - 0.5) * s * 0.7, py + (R() - 0.5) * s * 0.7, s * (0.05 + R() * 0.08), R.pick(['#5a5650', '#4a4640', '#6a645c']));
      }
    }

    const edge = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < 3; x++) if (isStreet(x, y)) edge.push([x, y]);
    edge.sort((a, b) => Math.abs(a[1] - rows / 2) - Math.abs(b[1] - rows / 2));
    const start = edge[0] || [0, 0];
    D.spawn = bfs(cols, rows, [start], isStreet, 99).slice(0, 11);
    D.reveal = withBorder(cols, rows, bfs(cols, rows, [start], isStreet, 5));
    // Cada prédio ganha uma altura (3 = baixo ... 7 = arranha-céu) para o relevo 2.5D.
    for (const l of lots) {
      const level = R.int(3, 7);
      for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) D.block[y * cols + x] = level;
    }
    const streets = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (isStreet(x, y)) { D.floor.push([x, y]); if (x > 6) streets.push([x, y]); }
    addTraps(D, R, streets, 1 + (ruins ? 1 : 0), D.system);
    if (streets.length) { const [x, y] = R.pick(streets); if (!D.objects.some(o => o.x === x && o.y === y)) D.objects.push({ type: 'chest', x, y, loot: pickLoot(R, D.system, false) }); }
  }

  // ============ casa e interiores ============
  function mansao(g, cols, rows, s, R, D, P, F) {
    const hx = 2; const hy = 2; const hw = cols - 4; const hh = rows - 6;
    const rooms = [];
    const walls = [];
    const doors = [];
    const split = (r, depth) => {
      const canV = r.w >= 7; const canH = r.h >= 6;
      if ((!canV && !canH) || (depth >= 3 && R() < 0.45)) { rooms.push(r); return; }
      const vertical = canV && (!canH || r.w / r.h > 1.15 || (r.h / r.w <= 1.15 && R() < 0.5));
      if (vertical) {
        const sx = r.x + R.int(3, r.w - 3);
        const dy = r.y + R.int(0, r.h - 1);
        if (dy > r.y) walls.push([sx, r.y, sx, dy]);
        if (dy + 1 < r.y + r.h) walls.push([sx, dy + 1, sx, r.y + r.h]);
        doors.push({ x: sx, y: dy, v: true });
        split({ x: r.x, y: r.y, w: sx - r.x, h: r.h }, depth + 1); split({ x: sx, y: r.y, w: r.x + r.w - sx, h: r.h }, depth + 1);
      } else {
        const sy = r.y + R.int(3, r.h - 3);
        const dx = r.x + R.int(0, r.w - 1);
        if (dx > r.x) walls.push([r.x, sy, dx, sy]);
        if (dx + 1 < r.x + r.w) walls.push([dx + 1, sy, r.x + r.w, sy]);
        doors.push({ x: dx, y: sy, v: false });
        split({ x: r.x, y: r.y, w: r.w, h: sy - r.y }, depth + 1); split({ x: r.x, y: sy, w: r.w, h: r.y + r.h - sy }, depth + 1);
      }
    };
    // Taverna: um salão bem grande ocupa metade da casa.
    if (F.has('taverna')) {
      const cut = hx + Math.floor(hw * 0.6);
      const dy = hy + R.int(1, hh - 2);
      walls.push([cut, hy, cut, dy], [cut, dy + 1, cut, hy + hh]);
      doors.push({ x: cut, y: dy, v: true });
      rooms.push({ x: hx, y: hy, w: cut - hx, h: hh, kind: 'taverna' });
      split({ x: cut, y: hy, w: hx + hw - cut, h: hh }, 1);
    } else {
      split({ x: hx, y: hy, w: hw, h: hh }, 0);
    }
    const doorX = hx + Math.floor(hw / 2);
    const outer = [[hx, hy, hx + hw, hy], [hx, hy, hx, hy + hh], [hx + hw, hy, hx + hw, hy + hh], [hx, hy + hh, doorX, hy + hh], [doorX + 1, hy + hh, hx + hw, hy + hh]];

    const shade = makeNoise(R, 5);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.fillStyle = tint(P.grass, (shade(x, y) - 0.5) * 0.3 + (R() - 0.5) * 0.05);
      g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
    }
    g.fillStyle = P.hedge;
    for (let x = 0; x < cols; x++) { if (Math.abs(x - doorX) > 1) g.fillRect(x * s + s * 0.05, (rows - 1) * s + s * 0.15, s * 0.9, s * 0.75); g.fillRect(x * s + s * 0.05, s * 0.1, s * 0.9, s * 0.75); }
    for (let y = 1; y < rows - 1; y++) { g.fillRect(s * 0.1, y * s + s * 0.05, s * 0.75, s * 0.9); g.fillRect((cols - 1) * s + s * 0.15, y * s + s * 0.05, s * 0.75, s * 0.9); }
    for (let y = hy + hh; y < rows; y++) for (let x = doorX - 1; x <= doorX + 1; x++) {
      g.fillStyle = tint(P.gravel, (R() - 0.5) * 0.12); g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      for (let k = 0; k < 3; k++) circle(g, x * s + s * R(), y * s + s * R(), s * 0.04, 'rgba(0,0,0,0.15)');
    }
    drawTree(g, s * 2.5, (rows - 2.5) * s, s * 1.1, R, P);
    drawTree(g, (cols - 2.5) * s, (rows - 2.5) * s, s * 1.1, R, P);

    const biggest = rooms.reduce((m, r) => (r.w * r.h > m.w * m.h ? r : m), rooms[0]);
    const pool = F.has('hospital') ? ['enfermaria', 'enfermaria', 'ladrilho', 'madeira']
      : F.has('biblioteca') ? ['biblioteca', 'biblioteca', 'madeira', 'tapete']
        : ['madeira', 'madeira', 'ladrilho', 'tapete', 'biblioteca', 'quarto'];
    for (const r of rooms) {
      const kind = r.kind || (r === biggest ? (F.has('hospital') ? 'enfermaria' : 'salao') : R.pick(pool));
      const X = r.x * s; const Y = r.y * s; const W = r.w * s; const H = r.h * s;
      if (kind === 'ladrilho' || kind === 'enfermaria') {
        const [a, b] = kind === 'enfermaria' ? ['#d4dcda', '#bfcac7'] : ['#d8d2c4', '#3a3a3a'];
        for (let y = 0; y < r.h * 2; y++) for (let x = 0; x < r.w * 2; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(X + (x * s) / 2, Y + (y * s) / 2, s / 2 + 0.5, s / 2 + 0.5); }
      } else {
        const wood = R.pick(P.woods);
        g.fillStyle = wood; g.fillRect(X, Y, W, H);
        g.strokeStyle = 'rgba(30,18,8,0.35)'; g.lineWidth = Math.max(1, s * 0.025);
        for (let y = 0; y < r.h * 3; y++) {
          g.beginPath(); g.moveTo(X, Y + (y * s) / 3); g.lineTo(X + W, Y + (y * s) / 3); g.stroke();
          for (let x = (y % 2) * 0.7; x < r.w; x += 1.4) { g.beginPath(); g.moveTo(X + x * s, Y + (y * s) / 3); g.lineTo(X + x * s, Y + ((y + 1) * s) / 3); g.stroke(); }
        }
      }
      if (kind === 'tapete' || kind === 'salao') {
        const m = r.w > 4 && r.h > 4 ? s : s * 0.6;
        g.fillStyle = kind === 'salao' ? (F.has('tesouro') ? '#8a1a24' : '#5c1a24') : R.pick(P.rugs);
        g.fillRect(X + m, Y + m, W - m * 2, H - m * 2);
        g.strokeStyle = '#c9a227'; g.lineWidth = s * 0.06; g.strokeRect(X + m + s * 0.15, Y + m + s * 0.15, W - m * 2 - s * 0.3, H - m * 2 - s * 0.3);
      }
      if (kind === 'salao' && r.w >= 5) {
        const tw = Math.max(2, r.w - 4); const cx = X + W / 2; const cy = Y + H / 2;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx - (tw * s) / 2 + s * 0.1, cy - s * 0.35 + s * 0.12, tw * s, s * 0.7);
        g.fillStyle = '#4a2c16'; g.fillRect(cx - (tw * s) / 2, cy - s * 0.35, tw * s, s * 0.7);
        for (let k = 0; k < tw; k++) {
          g.fillStyle = '#3a2210';
          g.fillRect(cx - (tw * s) / 2 + k * s + s * 0.3, cy - s * 0.75, s * 0.4, s * 0.3); g.fillRect(cx - (tw * s) / 2 + k * s + s * 0.3, cy + s * 0.45, s * 0.4, s * 0.3);
        }
        light(D, cx, cy, s * 2.5, P.light, 0.3);
        for (let k = 0; k < 3; k++) light(D, cx - s + k * s, cy, s * 0.4, '255,230,160', 0.6, '#ffe7a8');
      }
      if (kind === 'taverna') {
        // Balcão em L, banquinhos, mesas redondas e barris
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X + s * 0.3, Y + s * 0.4, W - s * 1.6, s * 0.7);
        g.fillStyle = '#5a3418'; g.fillRect(X + s * 0.2, Y + s * 0.3, W - s * 1.6, s * 0.7); g.fillRect(X + W - s * 1.4, Y + s * 0.3, s * 0.7, s * 1.8);
        for (let k = 0; k < r.w - 3; k++) circle(g, X + s * (0.8 + k), Y + s * 1.35, s * 0.18, '#3a2210');
        for (let k = 0; k < 3; k++) { circle(g, X + W - s * 0.45, Y + H - s * (0.6 + k * 0.85), s * 0.35, '#6a4020'); g.strokeStyle = '#2a1a0c'; g.lineWidth = s * 0.05; g.beginPath(); g.arc(X + W - s * 0.45, Y + H - s * (0.6 + k * 0.85), s * 0.25, 0, Math.PI * 2); g.stroke(); }
        const tables = Math.max(2, Math.floor((r.w * r.h) / 10));
        for (let k = 0; k < tables; k++) {
          const tx = X + s * (1.5 + R() * Math.max(0.5, r.w - 4)); const ty = Y + s * (2.6 + R() * Math.max(0.5, r.h - 4));
          for (let c = 0; c < 4; c++) circle(g, tx + Math.cos((c * Math.PI) / 2 + 0.6) * s * 0.55, ty + Math.sin((c * Math.PI) / 2 + 0.6) * s * 0.55, s * 0.15, '#3a2210');
          circle(g, tx + s * 0.06, ty + s * 0.08, s * 0.4, 'rgba(0,0,0,0.35)');
          circle(g, tx, ty, s * 0.4, '#7a4a24');
          circle(g, tx, ty, s * 0.07, '#ffe7a8');
          light(D, tx, ty, s * 1.2, '255,190,110', 0.3);
        }
        g.fillStyle = '#4a4440'; g.fillRect(X + s * 0.2, Y + H - s * 0.5, s * 1.4, s * 0.35);
        light(D, X + s * 0.9, Y + H - s * 0.5, s * 1.8, '255,130,40', 0.45, '#ffb13b');
      }
      if (kind === 'enfermaria') {
        const beds = Math.max(1, Math.floor(r.w / 1.6));
        for (let k = 0; k < beds; k++) {
          const bx = X + s * (0.25 + k * 1.6); const by = Y + s * 0.2;
          if (bx + s * 0.9 > X + W) break;
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + s * 0.08, by + s * 0.1, s * 0.9, s * 1.6);
          g.fillStyle = '#f2f2ee'; g.fillRect(bx, by, s * 0.9, s * 1.6);
          g.fillStyle = F.has('sangue') && R() < 0.5 ? '#8a2020' : '#8fb0c8'; g.fillRect(bx, by + s * 0.55, s * 0.9, s * 1.05);
        }
      }
      if (kind === 'biblioteca') {
        const books = ['#8e2b2b', '#2b4a8e', '#2b8e4a', '#8e7a2b', '#5a2b8e'];
        g.fillStyle = '#3a2210'; g.fillRect(X + s * 0.1, Y + s * 0.1, W - s * 0.2, s * 0.45);
        const count = Math.floor((r.w - 0.35) / 0.12);
        for (let k = 0; k < count; k++) { g.fillStyle = R.pick(books); g.fillRect(X + s * 0.15 + k * s * 0.12, Y + s * 0.15, s * 0.1, s * 0.35); }
        const ax = X + W / 2; const ay = Y + H / 2 + s * 0.3;
        circle(g, ax, ay, s * 0.35, '#5c1a24'); circle(g, ax, ay - s * 0.1, s * 0.22, '#7a2432');
        light(D, ax + s * 0.6, ay, s * 1.4, '255,200,120', 0.35, '#fff1c0');
      }
      if (kind === 'quarto') {
        const bx = X + s * 0.3; const by = Y + s * 0.3;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(bx + s * 0.1, by + s * 0.12, s * 1.4, s * 2);
        g.fillStyle = '#e6dcc8'; g.fillRect(bx, by, s * 1.4, s * 2);
        g.fillStyle = R.pick(['#7a1f2b', '#2f4a6b', '#4a5a2f']); g.fillRect(bx, by + s * 0.7, s * 1.4, s * 1.3);
        g.fillStyle = '#ffffff'; g.fillRect(bx + s * 0.15, by + s * 0.12, s * 0.5, s * 0.35); g.fillRect(bx + s * 0.75, by + s * 0.12, s * 0.5, s * 0.35);
      }
      if (kind === 'ladrilho') {
        g.fillStyle = '#8c8f96'; g.fillRect(X + s * 0.1, Y + s * 0.1, W - s * 0.2, s * 0.55);
        circle(g, X + s * 0.8, Y + s * 0.38, s * 0.16, '#5a5d63');
      }
      if (F.has('ruinas') && R() < 0.6) {
        g.fillStyle = 'rgba(10,6,4,0.85)';
        g.beginPath(); g.ellipse(X + W * (0.3 + R() * 0.4), Y + H * (0.3 + R() * 0.4), s * (0.5 + R() * 0.5), s * (0.3 + R() * 0.3), R(), 0, Math.PI * 2); g.fill();
        for (let k = 0; k < 6; k++) circle(g, X + W * R(), Y + H * R(), s * (0.05 + R() * 0.08), '#6a5a4a');
      }
      if (F.has('teias') && R() < 0.7) cobweb(g, X, Y, s * 1.3, 1, 1);
      if (F.has('ritual') && r === biggest && kind !== 'taverna') {
        pentagram(g, X + W / 2, Y + H / 2, Math.min(W, H) * 0.35, '#c21a1a');
        light(D, X + W / 2, Y + H / 2, s * 2.4, '220,30,30', 0.35);
      }
    }
    g.lineCap = 'square';
    g.strokeStyle = P.wall;
    g.lineWidth = s * 0.2;
    for (const [x1, y1, x2, y2] of walls) { g.beginPath(); g.moveTo(x1 * s, y1 * s); g.lineTo(x2 * s, y2 * s); g.stroke(); }
    g.lineWidth = s * 0.3;
    for (const [x1, y1, x2, y2] of outer) { g.beginPath(); g.moveTo(x1 * s, y1 * s); g.lineTo(x2 * s, y2 * s); g.stroke(); }
    g.strokeStyle = F.has('ruinas') ? '#3a4448' : P.window;
    g.lineWidth = s * 0.1;
    g.lineCap = 'butt';
    for (let x = hx + 1; x < hx + hw - 1; x += R.int(2, 4)) { g.beginPath(); g.moveTo(x * s + s * 0.2, hy * s); g.lineTo(x * s + s * 0.8, hy * s); g.stroke(); }
    for (let y = hy + 1; y < hy + hh - 1; y += R.int(2, 4)) {
      g.beginPath(); g.moveTo(hx * s, y * s + s * 0.2); g.lineTo(hx * s, y * s + s * 0.8); g.stroke();
      g.beginPath(); g.moveTo((hx + hw) * s, y * s + s * 0.2); g.lineTo((hx + hw) * s, y * s + s * 0.8); g.stroke();
    }
    // Portas entre cômodos e a porta da frente viram objetos (ficam nas bordas dos quadrados).
    for (const d of [...doors, { x: doorX, y: hy + hh, v: false }]) D.objects.push({ type: 'door', edge: true, x: d.x, y: d.y, v: d.v });
    light(D, (doorX + 0.5) * s, (hy + hh) * s + s * 0.4, s * 1.3, '255,210,140', 0.35, '#fff1c0');
    const inside = [];
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) inside.push([x, y]);
    for (let k = R.int(1, 2); k > 0 && inside.length; k--) {
      const [x, y] = inside.splice(Math.floor(R() * inside.length), 1)[0];
      D.objects.push({ type: 'chest', x, y, loot: pickLoot(R, D.system, F.has('tesouro')) });
    }
    addTraps(D, R, inside, 1 + (F.has('ruinas') ? 1 : 0), D.system);
    for (const r of rooms) {
      if (!R.chance(0.5) || !inside.length) continue;
      const cx = r.x + R.int(0, r.w - 1); const cy = r.y + R.int(0, r.h - 1);
      if (!D.objects.some(o => o.x === cx && o.y === cy)) D.objects.push({ type: 'torch', x: cx, y: cy, lit: true, color: P.light, candle: true });
    }

    const front = [[doorX, hy + hh], [doorX, hy + hh + 1]];
    const outside = (x, y) => y >= hy + hh || y < hy || x < hx || x >= hx + hw;
    D.spawn = bfs(cols, rows, [[doorX, hy + hh + 1]], (x, y) => outside(x, y) && x > 0 && x < cols - 1 && y < rows - 1, 99).slice(0, 11);
    D.reveal = withBorder(cols, rows, [...front, ...bfs(cols, rows, [[doorX, hy + hh + 1]], outside, 4)]);
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) D.floor.push([x, y]);
    D.segments.push(...walls, ...outer); // paredes da casa ficam nas bordas dos quadrados (portas são vãos)
  }

  // ============ clima, luzes e acabamento ============
  function finish(g, cols, rows, s, R, D, mods, F) {
    const W = cols * s; const H = rows * s;
    if (F.has('sangue') && D.floor.length) {
      for (let k = Math.max(4, Math.round((cols * rows) / 45)); k > 0; k--) {
        const [x, y] = R.pick(D.floor);
        const cx = x * s + s * R(); const cy = y * s + s * R();
        circle(g, cx, cy, s * (0.2 + R() * 0.25), 'rgba(110,8,8,0.75)');
        for (let d = 0; d < 7; d++) { const a = R() * Math.PI * 2; const dist = s * (0.3 + R() * 0.5); circle(g, cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, s * (0.03 + R() * 0.06), 'rgba(120,10,10,0.8)'); }
      }
    }
    if (mods.noite) { g.fillStyle = 'rgba(6,10,32,0.62)'; g.fillRect(0, 0, W, H); }
    g.save();
    if (mods.noite) g.globalCompositeOperation = 'lighter';
    for (const l of D.lights) glow(g, l.x, l.y, l.r * (mods.noite ? 1.35 : 1), l.rgb, l.alpha * (mods.noite ? 1.25 : 1));
    g.restore();
    for (const l of D.lights) if (l.core) { circle(g, l.x, l.y, s * 0.1, l.core); circle(g, l.x, l.y, s * 0.045, '#ffffff'); }
    if (mods.brasas) {
      for (let k = Math.round(cols * rows * 0.5); k > 0; k--) {
        const x = R() * W; const y = R() * H;
        circle(g, x, y, s * (0.015 + R() * 0.03), R() < 0.5 ? 'rgba(255,140,40,0.85)' : 'rgba(255,220,120,0.8)');
      }
    }
    if (mods.neblina) {
      g.fillStyle = 'rgba(210,215,225,0.07)'; g.fillRect(0, 0, W, H);
      for (let k = Math.round((cols * rows) / 26); k > 0; k--) glow(g, R() * W, R() * H, s * (2 + R() * 3), '215,220,230', 0.1 + R() * 0.1);
    }
    if (mods.chuva) {
      g.strokeStyle = 'rgba(170,200,255,0.35)';
      g.lineWidth = Math.max(1, s * 0.02);
      g.beginPath();
      for (let k = cols * rows * 2; k > 0; k--) { const x = R() * W; const y = R() * H; g.moveTo(x, y); g.lineTo(x - s * 0.1, y + s * 0.4); }
      g.stroke();
    }
    if (mods.neve) {
      for (let k = cols * rows * 3; k > 0; k--) circle(g, R() * W, R() * H, s * (0.02 + R() * 0.035), 'rgba(255,255,255,0.8)');
    }
  }

  const GENERATORS = { masmorra, caverna, floresta, cidade, mansao };

  function generate({ spec, type, size, cell = 60, seed = String(Date.now()), system = 'dnd5e' }) {
    const sp = spec || { type: type || 'masmorra', size: size || 'm', palette: null, features: [], mods: {} };
    const t = GENERATORS[type || sp.type] ? type || sp.type : 'masmorra';
    const sz = size || sp.size || 'm';
    const [cols, rows] = SIZES[sz] || SIZES.m;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cell;
    canvas.height = rows * cell;
    const g = canvas.getContext('2d');
    const P = { ...BASE[t], ...(PALETTES[sp.palette]?.[t] || {}) };
    const F = new Set([...(sp.features || []), ...(PALETTES[sp.palette]?.features || [])]);
    const D = { spawn: [], reveal: [], lights: [], floor: [], block: new Uint8Array(cols * rows), segments: [], objects: [], system };
    const R = makeRng(`${t}:${sz}:${sp.palette || ''}:${[...F].sort().join(',')}:${seed}`);
    GENERATORS[t](g, cols, rows, cell, R, D, P, F);
    finish(g, cols, rows, cell, makeRng(`fx:${seed}`), D, sp.mods || {}, F);
    // Paredes (visão, movimento e relevo 2.5D): 0 livre, 1 parede, 2 bloqueia sem relevo (árvore), 3-7 prédio/casa (altura).
    // Segmentos são as paredes finas da casa, nas bordas dos quadrados.
    const walls = { cells: Array.from(D.block).join(''), segments: D.segments };
    return { canvas, cols, rows, spawn: D.spawn, reveal: D.reveal, walls, objects: D.objects };
  }

  root.MAPGEN = { TYPES, SIZES, generate, interpret };
})(this);
