/* Classes prontas de cada sistema (o mestre pode carregar, editar ou criar as suas). Servidor e navegador.
   Classe: { name, desc, res: { hp, san… }, def (CA ou SP), stats, skills: [{ name, value, prof }], attacks, abilities, gear }
   Habilidade: { name, type: area | heal | special | passive, text, damage, amount, radius, range, save, dc, half, fx, uses } */
(function (root) {
  'use strict';

  // Nome do campo "classe" na ficha e como ele se chama em cada sistema.
  const CLASS_FIELD = { dnd5e: 'class', cyberpunk: 'role', coc: 'occupation' };
  const CLASS_LABEL = { dnd5e: 'Classe', cyberpunk: 'Papel', coc: 'Ocupação' };
  const DEF_FIELD = { dnd5e: 'ac' }; // no Cyberpunk 2020, def = PB da armadura em torso e braços

  const prof = (...names) => names.map(name => ({ name, prof: true }));
  const lv = obj => Object.entries(obj).map(([name, value]) => ({ name, value }));

  const PRESETS = {
    dnd5e: [
      {
        name: 'Guerreiro', desc: 'Mestre das armas e das armaduras. Aguenta a linha de frente.',
        res: { hp: 12 }, def: '16', stats: { for: 16, des: 12, con: 14, int: 8, sab: 10, car: 10 },
        skills: prof('Atletismo', 'Intimidação', 'Percepção'),
        attacks: [
          { name: 'Espada longa', type: 'melee', bonus: 5, damage: '1d8+3' },
          { name: 'Besta leve', type: 'ranged', bonus: 3, damage: '1d8+1', range: 16 },
        ],
        abilities: [
          { name: 'Retomar o fôlego', type: 'heal', amount: '1d10+1', range: 1, radius: 0, uses: 1, text: 'Recupera PV de si mesmo.' },
          { name: 'Surto de ação', type: 'special', uses: 1, text: 'Faz uma ação extra neste turno (ataque de novo).' },
          { name: 'Estilo de luta: Defesa', type: 'passive', text: '+1 na CA usando armadura (já incluído).' },
        ],
        gear: 'Cota de malha, escudo, espada longa, besta leve e 20 virotes, kit de explorador.',
      },
      {
        name: 'Mago', desc: 'Estudioso do arcano. Frágil, mas com magias devastadoras.',
        res: { hp: 7 }, def: '12', stats: { for: 8, des: 14, con: 12, int: 16, sab: 12, car: 10 },
        skills: prof('Arcanismo', 'História', 'Investigação'),
        attacks: [
          { name: 'Raio de fogo', type: 'spell', bonus: 5, damage: '1d10', range: 24 },
          { name: 'Adaga', type: 'melee', bonus: 4, damage: '1d4+2' },
        ],
        abilities: [
          { name: 'Mísseis mágicos', type: 'area', radius: 0, range: 24, save: 'none', damage: '3d4+3', fx: 'magic', uses: 2, text: 'Três dardos de força que nunca erram.' },
          { name: 'Mãos flamejantes', type: 'area', radius: 1, range: 3, save: 'des', dc: 13, damage: '3d6', half: true, fx: 'blast', uses: 2, text: 'Leque de chamas. Metade do dano se passar em DES.' },
          { name: 'Sono', type: 'area', radius: 2, range: 18, save: 'sab', dc: 13, fx: 'magic', uses: 1, text: 'Quem falhar cai no sono até levar dano.' },
        ],
        gear: 'Grimório, cajado arcano, adaga, bolsa de componentes, kit de estudioso.',
      },
      {
        name: 'Clérigo', desc: 'Servo de uma divindade. Cura os aliados e luta com fé.',
        res: { hp: 10 }, def: '16', stats: { for: 14, des: 10, con: 14, int: 10, sab: 16, car: 12 },
        skills: prof('Medicina', 'Religião', 'Intuição'),
        attacks: [
          { name: 'Maça', type: 'melee', bonus: 4, damage: '1d6+2' },
          { name: 'Chama sagrada', type: 'spell', bonus: 5, damage: '1d8', range: 12 },
        ],
        abilities: [
          { name: 'Curar ferimentos', type: 'heal', amount: '1d8+3', range: 1, radius: 0, uses: 2, text: 'Toque que cura um aliado (ou você).' },
          { name: 'Palavra curativa', type: 'heal', amount: '1d4+3', range: 12, radius: 0, uses: 2, text: 'Cura um aliado à distância.' },
          { name: 'Expulsar mortos-vivos', type: 'area', radius: 3, range: 1, save: 'sab', dc: 13, fx: 'magic', uses: 1, text: 'Mortos-vivos que falharem fogem por 1 minuto.' },
        ],
        gear: 'Cota de malha, escudo, maça, símbolo sagrado, kit de sacerdote.',
      },
      {
        name: 'Ladino', desc: 'Furtivo e preciso. Acha armadilhas e golpeia onde dói.',
        res: { hp: 9 }, def: '14', stats: { for: 10, des: 16, con: 12, int: 12, sab: 12, car: 14 },
        skills: prof('Furtividade', 'Acrobacia', 'Prestidigitação', 'Percepção', 'Enganação'),
        attacks: [
          { name: 'Rapieira', type: 'melee', bonus: 5, damage: '1d8+3' },
          { name: 'Arco curto', type: 'ranged', bonus: 5, damage: '1d6+3', range: 16 },
        ],
        abilities: [
          { name: 'Ataque furtivo', type: 'area', radius: 0, range: 16, save: 'none', damage: '1d6', fx: 'slash', uses: 1, text: 'Dano extra num inimigo desatento ou cercado.' },
          { name: 'Ação ardilosa', type: 'passive', text: 'Pode Correr, Desengajar ou se Esconder como ação bônus.' },
        ],
        gear: 'Armadura de couro, rapieira, arco curto e 20 flechas, ferramentas de ladrão.',
      },
    ],

    // Cyberpunk 2020: os 10 Papéis do livro, cada um com a Habilidade Especial e as Perícias Profissionais (40 pontos).
    // def = PB da jaqueta/colete (torso e braços). Ataques: bonus = Precisão da arma, skill = perícia somada ao REF.
    cyberpunk: [
      {
        name: 'Solo', desc: 'Assassino de aluguel, guarda-costas, soldado. Habilidade Especial: Noção de Combate (soma na Iniciativa e na Atenção).',
        res: { hp: 40, hum: 50 }, def: '18', stats: { int: 6, ref: 9, tec: 5, cool: 8, atr: 5, sor: 5, mov: 7, tco: 9, emp: 5 },
        skills: lv({ 'Noção de Combate': 6, 'Atenção/Notar': 4, 'Armas Curtas': 5, 'Briga': 4, 'Armas Brancas': 3, 'Armeiro': 2, 'Fuzil': 5, 'Atletismo': 3, 'Submetralhadora': 4, 'Furtividade': 4 }),
        attacks: [
          { name: 'Fuzil de assalto (Militech Ronin)', type: 'ranged', skill: 'Fuzil', bonus: 1, damage: '5d6', range: 200 },
          { name: 'Pistola pesada (11mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '3d6', range: 25 },
          { name: 'Faca', type: 'melee', skill: 'Armas Brancas', bonus: 0, damage: '1d6' },
        ],
        abilities: [
          { name: 'Rajada (fogo automático)', type: 'area', radius: 1, range: 50, save: 'des', dc: 20, damage: '3d6', fx: 'blast', uses: 2, text: 'Varre a área com fogo automático. Esquivar/Escapar contra 20.' },
          { name: 'Noção de Combate', type: 'passive', text: 'O nível da perícia soma na Iniciativa (já automático) e nos testes de Atenção/Notar.' },
        ],
        gear: 'Jaqueta blindada média (PB 18), fuzil de assalto, pistola pesada, faca, 2 granadas.',
      },
      {
        name: 'Roqueiro', desc: 'Músico rebelde que move multidões. Habilidade Especial: Liderança Carismática.',
        res: { hp: 40, hum: 60 }, def: '14', stats: { int: 6, ref: 7, tec: 5, cool: 8, atr: 8, sor: 5, mov: 6, tco: 6, emp: 9 },
        skills: lv({ 'Liderança Carismática': 6, 'Atenção/Notar': 3, 'Atuação': 5, 'Roupa e Estilo': 4, 'Composição': 4, 'Briga': 3, 'Tocar Instrumento': 5, 'Manha': 3, 'Persuasão e Lábia': 4, 'Sedução': 3 }),
        attacks: [{ name: 'Pistola média (9mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '2d6+1', range: 25 }, { name: 'Soco', type: 'melee', skill: 'Briga', bonus: 0, damage: '1d3' }],
        abilities: [
          { name: 'Incendiar a multidão', type: 'special', uses: 1, text: 'Liderança Carismática: controla uma multidão de até (nível²) × 200 pessoas.' },
          { name: 'Presença de palco', type: 'area', radius: 1, range: 6, save: 'sab', dc: 15, fx: 'magic', uses: 1, text: 'Quem falhar em AuCon fica hipnotizado pelo show por um turno.' },
        ],
        gear: 'Jaqueta blindada leve (PB 14), guitarra, amplificador portátil, pistola média.',
      },
      {
        name: 'Netrunner', desc: 'Hacker que invade a Rede com o ciberterminal. Habilidade Especial: Interface.',
        res: { hp: 40, hum: 56 }, def: '10', stats: { int: 9, ref: 7, tec: 8, cool: 6, atr: 5, sor: 6, mov: 6, tco: 5, emp: 6 },
        skills: lv({ 'Interface': 6, 'Atenção/Notar': 3, 'Tecnologia Básica': 4, 'Educação e Cultura Geral': 3, 'Conhecimento de Sistemas': 5, 'Cibertecnologia': 3, 'Projeto de Ciberterminal': 4, 'Composição': 2, 'Eletrônica': 4, 'Programação': 6 }),
        attacks: [{ name: 'Pistola leve (.25)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '1d6+1', range: 25 }],
        abilities: [
          { name: 'Programa de ataque', type: 'area', radius: 0, range: 12, save: 'sab', dc: 15, damage: '2d6', fx: 'magic', uses: 3, text: 'Dispara um programa contra os implantes do alvo (AuCon + Resistência Tortura/Drogas contra 15).' },
          { name: 'Invadir sistema', type: 'special', uses: 3, text: 'Abre portas eletrônicas, desliga câmeras e torres de segurança.' },
        ],
        gear: 'Ciberterminal, trodos, interface neural, pistola leve, colete de kevlar (PB 10).',
      },
      {
        name: 'Técnico', desc: 'Conserta, modifica e improvisa qualquer máquina. Habilidade Especial: Reparos Improvisados.',
        res: { hp: 40, hum: 60 }, def: '14', stats: { int: 8, ref: 6, tec: 9, cool: 6, atr: 5, sor: 6, mov: 6, tco: 6, emp: 6 },
        skills: lv({ 'Reparos Improvisados': 6, 'Atenção/Notar': 3, 'Tecnologia Básica': 5, 'Cibertecnologia': 4, 'Educação e Cultura Geral': 3, 'Pedagogia': 2, 'Eletrônica': 5, 'Armeiro': 4, 'Segurança Eletrônica': 4, 'AVTec': 4 }),
        attacks: [{ name: 'Submetralhadora (Uzi Miniauto 9)', type: 'ranged', skill: 'Submetralhadora', bonus: 1, damage: '2d6+1', range: 75 }, { name: 'Chave inglesa', type: 'melee', skill: 'Briga', bonus: 0, damage: '1d6' }],
        abilities: [
          { name: 'Gambiarra', type: 'special', uses: 3, text: 'Conserta ou altera qualquer coisa por 1d6 turnos por nível de Reparos Improvisados.' },
          { name: 'Granada caseira', type: 'area', radius: 1, range: 10, save: 'des', dc: 15, damage: '4d6', half: true, fx: 'blast', uses: 1, text: 'Explosivo improvisado. Esquivar/Escapar contra 15 para metade do dano.' },
        ],
        gear: 'Caixa de ferramentas, kit de eletrônica, submetralhadora, jaqueta blindada leve (PB 14).',
      },
      {
        name: 'Tecnomédico', desc: 'Médico de rua e cirurgião de implantes. Habilidade Especial: Tecnologia Médica.',
        res: { hp: 40, hum: 64 }, def: '14', stats: { int: 9, ref: 6, tec: 8, cool: 7, atr: 5, sor: 5, mov: 6, tco: 5, emp: 7 },
        skills: lv({ 'Tecnologia Médica': 6, 'Atenção/Notar': 3, 'Tecnologia Básica': 3, 'Diagnose': 5, 'Pesquisa em Biblioteca': 3, 'Educação e Cultura Geral': 4, 'Op. de Tanques Criogênicos': 3, 'Medicamentos': 5, 'Zoologia': 2, 'Percepção': 3, 'Primeiros Socorros': 3 }),
        attacks: [{ name: 'Pistola média (9mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '2d6+1', range: 25 }, { name: 'Bisturi', type: 'melee', skill: 'Armas Brancas', bonus: 0, damage: '1d6' }],
        abilities: [
          { name: 'Estabilizar', type: 'heal', amount: '1d6+2', range: 1, radius: 0, uses: 3, text: 'Tecnologia Médica num ferido encostado: fecha ferimentos e estanca o sangue.' },
          { name: 'Injeção de estimulante', type: 'heal', amount: '1d6', range: 1, radius: 0, uses: 4, text: 'Aplicador de drogas: o aliado recupera o fôlego.' },
          { name: 'Sedativo', type: 'area', radius: 0, range: 1, save: 'con', dc: 15, fx: 'dust', uses: 2, text: 'Quem falhar em TCO + Resistência apaga por 1d10 minutos.' },
        ],
        gear: 'Maleta médica, aplicador de drogas, kit cirúrgico, pistola média, jaqueta blindada leve.',
      },
      {
        name: 'Mídia', desc: 'Repórter que expõe as corporações. Habilidade Especial: Credibilidade.',
        res: { hp: 40, hum: 70 }, def: '10', stats: { int: 8, ref: 6, tec: 5, cool: 7, atr: 8, sor: 6, mov: 6, tco: 5, emp: 9 },
        skills: lv({ 'Credibilidade': 6, 'Atenção/Notar': 4, 'Composição': 4, 'Educação e Cultura Geral': 4, 'Persuasão e Lábia': 4, 'Percepção': 4, 'Trato Social': 3, 'Manha': 3, 'Fotografia e Filmagem': 5, 'Entrevista': 3 }),
        attacks: [{ name: 'Pistola leve (.25)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '1d6+1', range: 25 }],
        abilities: [
          { name: 'Furo de reportagem', type: 'special', uses: 1, text: 'Credibilidade: o público acredita na matéria; a corporação sente o golpe.' },
          { name: 'Flash da câmera', type: 'area', radius: 1, range: 4, save: 'des', dc: 15, fx: 'magic', uses: 2, text: 'Quem falhar fica ofuscado (−3 no próximo ataque).' },
        ],
        gear: 'Minicâmera, gravador, agenda eletrônica com contatos, pistola leve, colete de kevlar (PB 10).',
      },
      {
        name: 'Policial', desc: 'Agente da lei nas ruas violentas. Habilidade Especial: Autoridade.',
        res: { hp: 40, hum: 60 }, def: '18', stats: { int: 6, ref: 8, tec: 5, cool: 8, atr: 5, sor: 6, mov: 6, tco: 8, emp: 6 },
        skills: lv({ 'Autoridade': 6, 'Atenção/Notar': 4, 'Armas Curtas': 5, 'Percepção': 3, 'Atletismo': 3, 'Educação e Cultura Geral': 2, 'Briga': 4, 'Armas Brancas': 3, 'Interrogatório': 5, 'Manha': 5 }),
        attacks: [{ name: 'Pistola pesada (11mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '3d6', range: 25 }, { name: 'Cassetete', type: 'melee', skill: 'Armas Brancas', bonus: 0, damage: '1d6' }],
        abilities: [
          { name: 'Voz de prisão', type: 'area', radius: 2, range: 1, save: 'sab', dc: 15, fx: 'magic', uses: 2, text: 'Autoridade: quem falhar em AuCon larga a arma e se rende por um turno.' },
          { name: 'Chamar reforços', type: 'special', uses: 1, text: 'Uma viatura chega em 1d10 turnos.' },
        ],
        gear: 'Distintivo, colete blindado (PB 18), pistola pesada, cassetete, algemas, rádio.',
      },
      {
        name: 'Corporativo', desc: 'Executivo que comanda o poder de uma megacorporação. Habilidade Especial: Recursos.',
        res: { hp: 40, hum: 60 }, def: '10', stats: { int: 9, ref: 6, tec: 5, cool: 8, atr: 7, sor: 6, mov: 6, tco: 5, emp: 6 },
        skills: lv({ 'Recursos': 6, 'Atenção/Notar': 3, 'Percepção': 4, 'Educação e Cultura Geral': 4, 'Pesquisa em Biblioteca': 3, 'Trato Social': 4, 'Persuasão e Lábia': 5, 'Mercado de Ações': 5, 'Roupa e Estilo': 3, 'Cuidados Pessoais': 3 }),
        attacks: [{ name: 'Pistola leve (.25)', type: 'ranged', skill: 'Armas Curtas', bonus: 0, damage: '1d6+1', range: 25 }],
        abilities: [
          { name: 'Equipe de segurança', type: 'special', uses: 1, text: 'Recursos: a corporação manda uma equipe (o mestre decide o tamanho).' },
          { name: 'Suborno', type: 'area', radius: 0, range: 2, save: 'sab', dc: 18, fx: 'magic', uses: 2, text: 'Quem falhar aceita o dinheiro e sai da luta.' },
        ],
        gear: 'Terno blindado (PB 10), agenda eletrônica, cartão de crédito corporativo, pistola leve.',
      },
      {
        name: 'Atravessador', desc: 'Intermediário que consegue qualquer coisa. Habilidade Especial: Negociar.',
        res: { hp: 40, hum: 64 }, def: '14', stats: { int: 8, ref: 7, tec: 5, cool: 9, atr: 6, sor: 7, mov: 6, tco: 5, emp: 7 },
        skills: lv({ 'Negociar': 6, 'Atenção/Notar': 3, 'Falsificação': 3, 'Armas Curtas': 5, 'Briga': 3, 'Armas Brancas': 3, 'Arrombamento': 4, 'Punga': 4, 'Intimidação': 4, 'Persuasão e Lábia': 5 }),
        attacks: [{ name: 'Pistola média (9mm)', type: 'ranged', skill: 'Armas Curtas', bonus: 1, damage: '2d6+1', range: 25 }, { name: 'Canivete', type: 'melee', skill: 'Armas Brancas', bonus: 0, damage: '1d6' }],
        abilities: [
          { name: 'Conheço um cara', type: 'special', uses: 2, text: 'Negociar: localiza a pessoa, o lugar ou a coisa de que o grupo precisa.' },
          { name: 'Golpe sujo', type: 'area', radius: 0, range: 1, save: 'none', damage: '1d6', fx: 'slash', uses: 1, text: 'Ataque traiçoeiro num alvo distraído.' },
        ],
        gear: 'Jaqueta blindada leve (PB 14), pistola média, canivete, 3 telefones descartáveis.',
      },
      {
        name: 'Nômade', desc: 'Guerreiro da estrada, leal ao clã. Habilidade Especial: Família.',
        res: { hp: 40, hum: 64 }, def: '14', stats: { int: 6, ref: 8, tec: 6, cool: 7, atr: 5, sor: 5, mov: 7, tco: 9, emp: 7 },
        skills: lv({ 'Família': 6, 'Atenção/Notar': 3, 'Resistência': 4, 'Armas Brancas': 3, 'Fuzil': 5, 'Condução': 5, 'Tecnologia Básica': 3, 'Sobrevivência': 4, 'Briga': 4, 'Atletismo': 3 }),
        attacks: [
          { name: 'Escopeta (Arasaka Rapid Assault 12)', type: 'ranged', skill: 'Fuzil', bonus: -1, damage: '4d6', range: 25 },
          { name: 'Soco', type: 'melee', skill: 'Briga', bonus: 0, damage: '1d3' },
        ],
        abilities: [
          { name: 'Chamar a família', type: 'special', uses: 1, text: 'Família: convoca parentes do clã (nível × 2).' },
          { name: 'Atropelamento', type: 'area', radius: 0, range: 6, save: 'des', dc: 20, damage: '4d6', half: true, fx: 'blast', uses: 1, text: 'Joga o veículo no alvo. Esquivar/Escapar contra 20 para metade.' },
        ],
        gear: 'Moto ou picape, escopeta, jaqueta blindada leve (PB 14), kit de sobrevivência.',
      },
    ],
    coc: [
      {
        name: 'Detetive particular', desc: 'Investigador de aluguel. Segue pistas e desconfia de todos.',
        res: { hp: 12, san: 60, mp: 12, luck: 50 }, stats: { for: 50, con: 60, tam: 60, des: 60, apa: 50, int: 70, pod: 60, edu: 60 },
        skills: lv({ 'Encontrar': 60, 'Psicologia': 50, 'Armas de Fogo (Revólver)': 55, 'Lábia': 40, 'Furtividade': 40, 'Direito': 30 }),
        attacks: [
          { name: 'Revólver .38', type: 'ranged', bonus: 55, damage: '1d10', range: 15 },
          { name: 'Soco', type: 'melee', bonus: 50, damage: '1d3+1' },
        ],
        abilities: [
          { name: 'Tiro certeiro', type: 'area', radius: 0, range: 15, save: 'none', damage: '1d10', fx: 'slash', uses: 1, text: 'Um disparo mirado com calma.' },
          { name: 'Faro para mentiras', type: 'passive', text: 'O mestre avisa quando alguém mente descaradamente.' },
        ],
        gear: 'Revólver .38, lanterna, bloco de notas, câmera fotográfica, sobretudo.',
      },
      {
        name: 'Médico', desc: 'Clínico ou cirurgião. Salva vidas, mesmo diante do impossível.',
        res: { hp: 11, san: 65, mp: 13, luck: 50 }, stats: { for: 45, con: 55, tam: 55, des: 55, apa: 60, int: 75, pod: 65, edu: 80 },
        skills: lv({ 'Medicina': 70, 'Primeiros Socorros': 60, 'Psicologia': 40, 'Usar Bibliotecas': 40, 'Esquivar': 30 }),
        attacks: [{ name: 'Bisturi', type: 'melee', bonus: 40, damage: '1d4' }],
        abilities: [
          { name: 'Primeiros socorros', type: 'heal', amount: '1d3', range: 1, radius: 0, uses: 3, text: 'Estanca um ferimento de alguém encostado.' },
          { name: 'Tratamento médico', type: 'heal', amount: '1d3+1', range: 1, radius: 0, uses: 1, text: 'Cirurgia improvisada.' },
          { name: 'Sedativo', type: 'special', uses: 2, text: 'Acalma alguém em crise (evita surto de loucura).' },
        ],
        gear: 'Maleta médica, sedativos, estetoscópio, jaleco.',
      },
      {
        name: 'Professor de ocultismo', desc: 'Acadêmico que leu o que não devia. Conhece rituais.',
        res: { hp: 10, san: 55, mp: 14, luck: 45 }, stats: { for: 40, con: 50, tam: 50, des: 50, apa: 50, int: 80, pod: 70, edu: 85 },
        skills: lv({ 'Ocultismo': 60, 'Usar Bibliotecas': 70, 'História': 50, 'Mythos de Cthulhu': 5, 'Idiomas (Latim)': 50 }),
        attacks: [{ name: 'Bengala', type: 'melee', bonus: 35, damage: '1d6' }],
        abilities: [
          { name: 'Encantamento de banimento', type: 'area', radius: 1, range: 6, save: 'sab', damage: '2d6', fx: 'magic', uses: 1, text: 'Palavras antigas que ferem criaturas do Mythos (custa sanidade, a critério do mestre).' },
          { name: 'Sinal de proteção', type: 'special', uses: 1, text: 'Desenha um sinal que afasta criaturas menores por uma cena.' },
        ],
        gear: 'Livros raros, caderno de anotações, giz, velas, bengala.',
      },
      {
        name: 'Veterano de guerra', desc: 'Sobreviveu às trincheiras. Frio sob fogo.',
        res: { hp: 13, san: 50, mp: 10, luck: 50 }, stats: { for: 65, con: 65, tam: 65, des: 60, apa: 45, int: 55, pod: 50, edu: 50 },
        skills: lv({ 'Armas de Fogo (Rifle/Espingarda)': 60, 'Lutar (Briga)': 60, 'Esquivar': 45, 'Primeiros Socorros': 40, 'Escutar': 40 }),
        attacks: [
          { name: 'Espingarda cal. 12', type: 'ranged', bonus: 60, damage: '4d6', range: 10 },
          { name: 'Faca de trincheira', type: 'melee', bonus: 60, damage: '1d4+2' },
        ],
        abilities: [
          { name: 'Granada', type: 'area', radius: 1, range: 8, save: 'des', damage: '4d6', half: true, fx: 'blast', uses: 1, text: 'Explosão. Esquivar pela metade do dano.' },
          { name: 'Sangue-frio', type: 'passive', text: 'Não perde a vez por susto na primeira rodada de combate.' },
        ],
        gear: 'Espingarda, faca de trincheira, cantil, uniforme velho, medalha.',
      },
    ],
  };

  const api = { PRESETS, CLASS_FIELD, CLASS_LABEL, DEF_FIELD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CLASSES_API = api;
})(this);
