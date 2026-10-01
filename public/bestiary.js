/* Bestiário: ataques e habilidades de cada inimigo (por retrato da galeria) e heróis prontos para teste.
   Números no estilo de cada sistema:
   - D&D 5e: def = CA; ataque = bônus no d20.
   - Cyberpunk RED: def = blindagem (SP); ataque = base (STAT + perícia) somada ao d10.
   - Call of Cthulhu: ataque = % da perícia; def não é usada.
   Tipos de habilidade: passive (só texto), area (dano em área com teste), sanity (perda de Sanidade),
   heal (cura a si mesmo), special (efeito narrado). "chance" = probabilidade de usar no turno automático. */
(function (root) {
  'use strict';

  const BESTIARY = {
    // ---------- D&D 5e ----------
    goblin: { name: 'Goblin', sys: 'dnd5e', hp: 7, def: 15, init: 2, vision: 6, speed: 6,
      attacks: [{ name: 'Cimitarra', type: 'melee', bonus: 4, damage: '1d6+2' }, { name: 'Arco curto', type: 'ranged', bonus: 4, damage: '1d6+2', range: 16 }],
      abilities: [{ name: 'Fuga ágil', type: 'passive', text: 'Pode Desengajar ou se Esconder como ação bônus em todo turno.' }] },
    orc: { name: 'Orc', sys: 'dnd5e', hp: 15, def: 13, init: 1, vision: 6, speed: 6,
      attacks: [{ name: 'Machado grande', type: 'melee', bonus: 5, damage: '1d12+3' }, { name: 'Azagaia', type: 'ranged', bonus: 5, damage: '1d6+3', range: 6 }],
      abilities: [{ name: 'Agressivo', type: 'passive', text: 'Como ação bônus, avança até seu deslocamento na direção de um inimigo.' }] },
    esqueleto: { name: 'Esqueleto', sys: 'dnd5e', hp: 13, def: 13, init: 2, vision: 6, speed: 6,
      attacks: [{ name: 'Espada curta', type: 'melee', bonus: 4, damage: '1d6+2' }, { name: 'Arco curto', type: 'ranged', bonus: 4, damage: '1d6+2', range: 16 }],
      abilities: [{ name: 'Morto-vivo', type: 'passive', text: 'Vulnerável a dano contundente. Imune a veneno e a exaustão.' }] },
    lobo: { name: 'Lobo', sys: 'dnd5e', hp: 11, def: 13, init: 2, vision: 8, speed: 8,
      attacks: [{ name: 'Mordida', type: 'melee', bonus: 4, damage: '2d4+2' }],
      abilities: [{ name: 'Táticas de matilha', type: 'passive', text: 'Vantagem no ataque se outro lobo estiver ao lado do alvo. Faro e audição aguçados.' }] },
    dragao: { name: 'Dragão', sys: 'dnd5e', hp: 136, def: 18, init: 0, vision: 10, speed: 8,
      attacks: [{ name: 'Mordida', type: 'melee', bonus: 10, damage: '2d10+6', reach: 2 }, { name: 'Garras', type: 'melee', bonus: 10, damage: '2d6+6' }],
      abilities: [
        { name: 'Sopro de fogo', type: 'area', radius: 3, save: 'des', dc: 17, damage: '12d6', half: true, fx: 'blast', chance: 0.35, text: 'Cone de fogo. Teste de DES CD 17: metade do dano se passar.' },
        { name: 'Presença aterradora', type: 'passive', text: 'Quem o vê pela primeira vez faz teste de SAB CD 16 ou fica amedrontado por 1 minuto.' }] },
    slime: { name: 'Gosma', sys: 'dnd5e', hp: 22, def: 8, init: -2, vision: 4, speed: 3,
      attacks: [{ name: 'Pseudópode ácido', type: 'melee', bonus: 3, damage: '1d6+1' }],
      abilities: [
        { name: 'Jato ácido', type: 'area', radius: 1, save: 'des', dc: 11, damage: '2d6', half: true, fx: 'magic', chance: 0.3, text: 'Espirra ácido em volta. Teste de DES CD 11.' },
        { name: 'Corrosiva', type: 'passive', text: 'Armas de metal que a acertam sofrem −1 permanente no dano.' }] },
    aranha: { name: 'Aranha gigante', sys: 'dnd5e', hp: 26, def: 14, init: 3, vision: 6, speed: 6,
      attacks: [{ name: 'Mordida venenosa', type: 'melee', bonus: 5, damage: '1d8+3' }],
      abilities: [
        { name: 'Teia', type: 'area', radius: 1, save: 'for', dc: 12, damage: '0', fx: 'magic', chance: 0.3, text: 'Quem falhar no teste de FOR CD 12 fica preso na teia (impedido).' },
        { name: 'Escalada de aranha', type: 'passive', text: 'Anda por paredes e tetos sem precisar de teste.' }] },
    olho: { name: 'Olho tirano', sys: 'dnd5e', hp: 180, def: 18, init: 2, vision: 12, speed: 2,
      attacks: [{ name: 'Mordida', type: 'melee', bonus: 5, damage: '4d6' }, { name: 'Raio de dor', type: 'spell', bonus: 8, damage: '3d8', range: 24 }],
      abilities: [
        { name: 'Raio desintegrador', type: 'area', radius: 0, save: 'des', dc: 16, damage: '10d8', fx: 'magic', chance: 0.35, text: 'Um alvo. Teste de DES CD 16 ou sofre o dano todo.' },
        { name: 'Cone antimagia', type: 'passive', text: 'Magias não funcionam na frente do olho central.' }] },
    guerreiro: { name: 'Soldado', sys: 'dnd5e', hp: 16, def: 16, init: 1, vision: 6, speed: 6,
      attacks: [{ name: 'Espada longa', type: 'melee', bonus: 5, damage: '1d8+3' }, { name: 'Besta pesada', type: 'ranged', bonus: 3, damage: '1d10+1', range: 20 }],
      abilities: [{ name: 'Formação', type: 'passive', text: '+1 na CA se um aliado estiver ao lado.' }] },
    mago: { name: 'Mago', sys: 'dnd5e', hp: 22, def: 12, init: 2, vision: 8, speed: 6,
      attacks: [{ name: 'Raio de fogo', type: 'spell', bonus: 5, damage: '2d10', range: 24 }, { name: 'Adaga', type: 'melee', bonus: 3, damage: '1d4+1' }],
      abilities: [
        { name: 'Bola de fogo', type: 'area', radius: 2, save: 'des', dc: 14, damage: '8d6', half: true, fx: 'blast', chance: 0.3, text: 'Explosão de 6 m. Teste de DES CD 14: metade do dano se passar.' },
        { name: 'Escudo arcano', type: 'passive', text: 'Uma vez por rodada, +5 na CA contra um ataque.' }] },
    ladino: { name: 'Bandido', sys: 'dnd5e', hp: 11, def: 12, init: 3, vision: 6, speed: 6,
      attacks: [{ name: 'Cimitarra', type: 'melee', bonus: 3, damage: '1d6+1' }, { name: 'Besta leve', type: 'ranged', bonus: 3, damage: '1d8+1', range: 16 }],
      abilities: [{ name: 'Ataque furtivo', type: 'passive', text: '+2d6 de dano se tiver vantagem ou um aliado ao lado do alvo.' }] },
    elfa: { name: 'Batedora élfica', sys: 'dnd5e', hp: 16, def: 13, init: 3, vision: 10, speed: 7,
      attacks: [{ name: 'Arco longo', type: 'ranged', bonus: 5, damage: '1d8+3', range: 30 }, { name: 'Espada curta', type: 'melee', bonus: 5, damage: '1d6+3' }],
      abilities: [{ name: 'Olhos de águia', type: 'passive', text: 'Vantagem em testes de Percepção que dependem da visão.' }] },
    anao: { name: 'Veterano anão', sys: 'dnd5e', hp: 32, def: 17, init: 0, vision: 6, speed: 5,
      attacks: [{ name: 'Machado de batalha', type: 'melee', bonus: 5, damage: '1d8+3' }, { name: 'Machadinha', type: 'ranged', bonus: 5, damage: '1d6+3', range: 6 }],
      abilities: [{ name: 'Resiliência anã', type: 'passive', text: 'Vantagem contra veneno e resistência a dano de veneno.' }] },

    // ---------- Cyberpunk 2020 ----------
    // hp = quadrados de ferimento (humanos têm 40), def = PB da blindagem (headSp = PB do capacete), ref/tco = atributos, btm = MTC,
    // dodge = perícia de defesa no corpo a corpo. bonus = REF + perícia + Precisão da arma. Alcance em quadrados de 2 m.
    booster: { name: 'Booster', sys: 'cyberpunk', hp: 40, def: 10, ref: 7, tco: 7, btm: 2, dodge: 3, init: 7, vision: 7, speed: 6,
      attacks: [{ name: 'Pistola média (9mm)', type: 'ranged', bonus: 11, damage: '2d6+1', range: 25 }, { name: 'Faca', type: 'melee', bonus: 11, damage: '1d6' }],
      abilities: [{ name: 'Gangue', type: 'passive', text: 'Boosters andam em bando: +1 no ataque se outro Booster estiver por perto.' }] },
    drone: { name: 'Drone', sys: 'cyberpunk', hp: 20, def: 20, headSp: 20, ref: 8, tco: 6, btm: 0, dodge: 0, init: 8, vision: 12, speed: 10,
      attacks: [{ name: 'Submetralhadora acoplada', type: 'ranged', bonus: 14, damage: '2d6+3', range: 75 }],
      abilities: [
        { name: 'Rajada', type: 'area', radius: 1, save: 'des', dc: 20, damage: '2d6+3', half: true, fx: 'blast', chance: 0.3, text: 'Fogo automático numa área. Esquivar/Escapar contra 20.' },
        { name: 'Voo', type: 'passive', text: 'Voa: ignora terreno difícil e obstáculos baixos. Máquina: não fica atordoado.' }] },
    ciberpsicopata: { name: 'Ciberpsicopata', sys: 'cyberpunk', hp: 40, def: 20, headSp: 14, ref: 10, tco: 11, btm: 5, dodge: 6, init: 12, vision: 8, speed: 8,
      attacks: [{ name: 'Garras retráteis', type: 'melee', bonus: 17, damage: '1d6+3' }, { name: 'Escopeta (Rapid Assault 12)', type: 'ranged', bonus: 15, damage: '4d6', range: 25 }],
      abilities: [
        { name: 'Surto de adrenalina', type: 'heal', amount: '1d6', chance: 0.25, text: 'Estimulantes de combate fecham os ferimentos.' },
        { name: 'Cibernético demais', type: 'passive', text: 'Humanidade zerada: não sente dor nem medo. TCO sobre-humano (MTC −5).' }] },
    corpo: { name: 'Segurança corporativo', sys: 'cyberpunk', hp: 40, def: 18, headSp: 14, ref: 8, tco: 8, btm: 3, dodge: 4, init: 9, vision: 7, speed: 6,
      attacks: [{ name: 'Pistola pesada (11mm)', type: 'ranged', bonus: 14, damage: '3d6', range: 25 }, { name: 'Bastão elétrico', type: 'melee', bonus: 12, damage: '1d6' }],
      abilities: [
        { name: 'Chamar a segurança', type: 'special', chance: 0.2, text: 'Aperta o alarme: reforços da corporação chegam no próximo turno.' },
        { name: 'Colete de kevlar', type: 'passive', text: 'Blindagem PB 18 no torso, braços e pernas.' }] },
    netrunner: { name: 'Netrunner hostil', sys: 'cyberpunk', hp: 40, def: 10, ref: 6, tco: 5, btm: 2, dodge: 2, init: 6, vision: 7, speed: 6,
      attacks: [{ name: 'Pistola leve (.25)', type: 'ranged', bonus: 10, damage: '1d6+1', range: 25 }],
      abilities: [{ name: 'Choque neural', type: 'area', radius: 0, save: 'sab', dc: 15, damage: '2d6', fx: 'magic', chance: 0.4, text: 'Dispara um programa contra os implantes do alvo. AuCon + Resistência Tortura/Drogas contra 15.' }] },
    solo: { name: 'Mercenário', sys: 'cyberpunk', hp: 40, def: 18, headSp: 14, ref: 9, tco: 8, btm: 3, dodge: 5, init: 13, vision: 8, speed: 6,
      attacks: [{ name: 'Fuzil de assalto (5.56)', type: 'ranged', bonus: 17, damage: '5d6', range: 200 }, { name: 'Monofaca', type: 'melee', bonus: 15, damage: '2d6' }],
      abilities: [{ name: 'Noção de Combate', type: 'passive', text: '+4 na Iniciativa e na Atenção (já somado). Nunca é pego de surpresa.' }] },
    // ---------- Call of Cthulhu ----------
    cultista: { name: 'Cultista', sys: 'coc', hp: 11, def: 0, init: 50, vision: 6, speed: 6,
      attacks: [{ name: 'Faca ritual', type: 'melee', bonus: 40, damage: '1d4+1' }, { name: 'Revólver .32', type: 'ranged', bonus: 30, damage: '1d8', range: 15 }],
      abilities: [
        { name: 'Cântico profano', type: 'sanity', radius: 4, san: '0/1d4', fx: 'magic', chance: 0.35, text: 'Um cântico em língua esquecida. Quem ouvir faz teste de SAN (0/1d4).' },
        { name: 'Fanático', type: 'passive', text: 'Não foge nem se rende enquanto o líder estiver de pé.' }] },
    profundo: { name: 'Profundo', sys: 'coc', hp: 18, def: 1, init: 50, vision: 6, speed: 5,
      attacks: [{ name: 'Garras', type: 'melee', bonus: 45, damage: '1d6+1' }, { name: 'Lança', type: 'melee', bonus: 45, damage: '1d8+1', reach: 2 }],
      abilities: [
        { name: 'Visão do Profundo', type: 'sanity', radius: 6, san: '0/1d6', fx: 'magic', chance: 0.3, text: 'A forma anfíbia exige teste de SAN (0/1d6).' },
        { name: 'Anfíbio', type: 'passive', text: 'Respira na água e na terra; pele escamosa (1 ponto de armadura).' }] },
    shoggoth: { name: 'Shoggoth', sys: 'coc', hp: 60, def: 8, init: 30, vision: 8, speed: 4,
      attacks: [{ name: 'Esmagar', type: 'melee', bonus: 70, damage: '4d6', reach: 2 }],
      abilities: [
        { name: 'Visão do Shoggoth', type: 'sanity', radius: 8, san: '1d6/1d20', fx: 'magic', chance: 0.3, text: 'A massa de olhos e bocas exige teste de SAN (1d6/1d20).' },
        { name: 'Regeneração', type: 'heal', amount: '2d4', chance: 0.4, text: 'O protoplasma se refaz.' },
        { name: 'Protoplasma', type: 'passive', text: 'Armas comuns causam só metade do dano.' }] },
    carnical: { name: 'Carniçal', sys: 'coc', hp: 13, def: 0, init: 65, vision: 6, speed: 6,
      attacks: [{ name: 'Garras', type: 'melee', bonus: 40, damage: '1d6+1' }, { name: 'Mordida', type: 'melee', bonus: 30, damage: '1d6' }],
      abilities: [
        { name: 'Visão do carniçal', type: 'sanity', radius: 6, san: '0/1d6', fx: 'magic', chance: 0.3, text: 'Ver o carniçal exige teste de SAN (0/1d6).' },
        { name: 'Faro de cadáver', type: 'passive', text: 'Sente o cheiro dos vivos e dos mortos a grande distância.' }] },
    tentaculos: { name: 'Tentáculos', sys: 'coc', hp: 30, def: 2, init: 40, vision: 5, speed: 2,
      attacks: [{ name: 'Tentáculo', type: 'melee', bonus: 50, damage: '1d6+2', reach: 2 }],
      abilities: [
        { name: 'Esmagamento', type: 'area', radius: 1, save: 'for', dc: 50, damage: '2d6', fx: 'blast', chance: 0.3, text: 'Os tentáculos apertam tudo em volta. Teste de FOR.' },
        { name: 'Horror abissal', type: 'sanity', radius: 5, san: '1/1d8', fx: 'magic', chance: 0.25, text: 'Teste de SAN (1/1d8).' }] },
    investigador: { name: 'Capanga', sys: 'coc', hp: 11, def: 0, init: 55, vision: 6, speed: 6,
      attacks: [{ name: 'Revólver .38', type: 'ranged', bonus: 50, damage: '1d10', range: 15 }, { name: 'Soco', type: 'melee', bonus: 50, damage: '1d3' }],
      abilities: [{ name: 'Durão', type: 'passive', text: 'Aguenta um soco a mais antes de desmaiar.' }] },
    ocultista: { name: 'Feiticeiro', sys: 'coc', hp: 10, def: 0, init: 45, vision: 6, speed: 6,
      attacks: [{ name: 'Bengala', type: 'melee', bonus: 35, damage: '1d6' }],
      abilities: [
        { name: 'Murchar', type: 'area', radius: 0, save: 'con', dc: 50, damage: '2d6', fx: 'magic', chance: 0.4, text: 'Feitiço que resseca a carne de um alvo. Teste de CON.' },
        { name: 'Cântico', type: 'sanity', radius: 4, san: '0/1d3', fx: 'magic', chance: 0.25, text: 'Teste de SAN (0/1d3).' }] },
  };

  // Para retratos sem ficha própria (ou imagem enviada), uma criatura genérica do sistema.
  const GENERIC = {
    dnd5e: { name: 'Criatura', sys: 'dnd5e', hp: 11, def: 12, init: 1, vision: 6, speed: 6, attacks: [{ name: 'Ataque', type: 'melee', bonus: 3, damage: '1d6+1' }], abilities: [] },
    cyberpunk: { name: 'Capanga', sys: 'cyberpunk', hp: 40, def: 10, ref: 6, tco: 6, btm: 2, dodge: 2, init: 6, vision: 7, speed: 6, attacks: [{ name: 'Pistola média (9mm)', type: 'ranged', bonus: 10, damage: '2d6+1', range: 25 }], abilities: [] },
    coc: { name: 'Criatura', sys: 'coc', hp: 11, def: 0, init: 50, vision: 6, speed: 6, attacks: [{ name: 'Ataque', type: 'melee', bonus: 40, damage: '1d6' }], abilities: [] },
  };

  function statsFor(key, system) {
    const base = BESTIARY[key] || GENERIC[system] || GENERIC.dnd5e;
    return JSON.parse(JSON.stringify({ ...base, key: BESTIARY[key] ? key : null }));
  }

  // Heróis prontos para o "teste com jogadores".
  const TEST_HEROES = {
    dnd5e: [
      { name: 'Aria', img: 'guerreiro', info: { class: 'Guerreira 3', race: 'Humana', ac: '17', prof: '2' }, stats: { for: 16, des: 12, con: 14, int: 10, sab: 12, car: 10 }, hp: 28, weapon: { name: 'Espada longa', type: 'melee', bonus: 5, damage: '1d8+3' } },
      { name: 'Merlin', img: 'mago', info: { class: 'Mago 3', race: 'Humano', ac: '12', prof: '2' }, stats: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 }, hp: 16, weapon: { name: 'Raio de fogo', type: 'spell', bonus: 5, damage: '1d10', range: 24 } },
      { name: 'Sombra', img: 'ladino', info: { class: 'Ladina 3', race: 'Halfling', ac: '14', prof: '2' }, stats: { for: 10, des: 16, con: 12, int: 12, sab: 10, car: 14 }, hp: 21, weapon: { name: 'Arco curto', type: 'ranged', bonus: 5, damage: '1d6+3', range: 16 } },
      { name: 'Lirael', img: 'elfa', info: { class: 'Patrulheira 3', race: 'Elfa', ac: '14', prof: '2' }, stats: { for: 12, des: 16, con: 12, int: 10, sab: 14, car: 10 }, hp: 24, weapon: { name: 'Arco longo', type: 'ranged', bonus: 5, damage: '1d8+3', range: 30 } },
      { name: 'Borin', img: 'anao', info: { class: 'Clérigo 3', race: 'Anão', ac: '18', prof: '2' }, stats: { for: 14, des: 10, con: 16, int: 10, sab: 16, car: 12 }, hp: 27, weapon: { name: 'Martelo de guerra', type: 'melee', bonus: 4, damage: '1d8+2' } },
    ],
    // Cyberpunk 2020: skills = níveis de perícia; armor = PB por parte do corpo; weapon.bonus = Precisão (WA).
    cyberpunk: [
      { name: 'Johnny', img: 'solo', info: { role: 'Solo', rep: '3' }, stats: { int: 6, ref: 9, tec: 5, cool: 8, atr: 6, sor: 5, mov: 7, tco: 8, emp: 5 }, hp: 40, hum: 42,
        armor: { head: 14, torso: 18, rarm: 18, larm: 18, rleg: 10, lleg: 10 }, skills: { 'Noção de Combate': 6, 'Armas Curtas': 6, 'Fuzil': 5, 'Briga': 4, 'Esquivar/Escapar': 5, 'Atenção/Notar': 5 },
        weapon: { name: 'Pistola pesada (11mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '3d6', range: 25 } },
      { name: 'Lucy', img: 'netrunner', info: { role: 'Netrunner', rep: '2' }, stats: { int: 9, ref: 7, tec: 8, cool: 6, atr: 7, sor: 6, mov: 7, tco: 5, emp: 6 }, hp: 40, hum: 56,
        armor: { head: 0, torso: 10, rarm: 0, larm: 0, rleg: 0, lleg: 0 }, skills: { 'Interface': 6, 'Programação': 5, 'Armas Curtas': 4, 'Esquivar/Escapar': 3, 'Atenção/Notar': 4 },
        weapon: { name: 'Pistola média (9mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 1, damage: '2d6+1', range: 25 } },
      { name: 'Jackie', img: 'solo', info: { role: 'Nômade', rep: '2' }, stats: { int: 5, ref: 8, tec: 6, cool: 7, atr: 5, sor: 5, mov: 6, tco: 10, emp: 7 }, hp: 40, hum: 64,
        armor: { head: 0, torso: 14, rarm: 14, larm: 14, rleg: 4, lleg: 4 }, skills: { 'Família': 5, 'Fuzil': 5, 'Briga': 5, 'Armas Brancas': 4, 'Esquivar/Escapar': 3, 'Atenção/Notar': 3 },
        weapon: { name: 'Escopeta (Arasaka Rapid Assault 12)', type: 'ranged', skill: 'Fuzil', bonus: -1, damage: '4d6', range: 25 } },
      { name: 'Rogue', img: 'netrunner', info: { role: 'Atravessador', rep: '4' }, stats: { int: 8, ref: 7, tec: 5, cool: 9, atr: 7, sor: 7, mov: 6, tco: 6, emp: 8 }, hp: 40, hum: 76,
        armor: { head: 0, torso: 14, rarm: 14, larm: 14, rleg: 0, lleg: 0 }, skills: { 'Negociar': 6, 'Armas Curtas': 5, 'Persuasão e Lábia': 5, 'Esquivar/Escapar': 3, 'Atenção/Notar': 4 },
        weapon: { name: 'Pistola média (9mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 1, damage: '2d6+1', range: 25 } },
    ],
    coc: [
      { name: 'Harvey Walters', img: 'investigador', info: { occupation: 'Jornalista', age: '42' }, stats: { for: 50, con: 55, tam: 60, des: 60, apa: 50, int: 75, pod: 60, edu: 80 }, hp: 11, san: 60, weapon: { name: 'Revólver .38', type: 'ranged', bonus: 50, damage: '1d10', range: 15 } },
      { name: 'Dra. Clara', img: 'ocultista', info: { occupation: 'Médica', age: '38' }, stats: { for: 40, con: 50, tam: 50, des: 55, apa: 60, int: 80, pod: 70, edu: 85 }, hp: 10, san: 70, weapon: { name: 'Bengala', type: 'melee', bonus: 40, damage: '1d6' } },
      { name: 'Tommy', img: 'investigador', info: { occupation: 'Detetive', age: '35' }, stats: { for: 60, con: 60, tam: 65, des: 55, apa: 45, int: 65, pod: 50, edu: 60 }, hp: 13, san: 50, weapon: { name: 'Escopeta cal. 12', type: 'ranged', bonus: 55, damage: '4d6', range: 10 } },
    ],
  };

  const api = { BESTIARY, GENERIC, TEST_HEROES, statsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BESTIARY_API = api;
})(this);
