# Mesa

Mesa virtual de RPG no navegador. O mestre e os jogadores veem o mesmo mapa, os mesmos tokens e as mesmas rolagens em tempo real.
Sistemas: **D&D 5e**, **Cyberpunk 2020** (regras da edição brasileira da Devir) e **Call of Cthulhu 7e**.

## Rodar

Dê dois cliques em `iniciar.bat`, ou rode:

```
npm install
npm start
```

Depois abra http://localhost:3000, crie a mesa e clique em **Copiar convite**.

## Hospedar no Render (link fixo para os amigos)

O projeto já vem pronto para o Render (plano grátis), com as mesas salvas no **MongoDB Atlas** (grátis para sempre, sem cartão). O disco do Render grátis é apagado a cada reinício; sem o banco, as mesas sumiriam.

1. **MongoDB Atlas** (https://www.mongodb.com/cloud/atlas/register):
   - crie a conta e um cluster **M0 (Free)**, de preferência na região **N. Virginia (AWS us-east-1)**;
   - em **Database Access**, crie um usuário e uma senha (use letras e números, sem símbolos, para não dar problema na URL);
   - em **Network Access → Add IP Address**, escolha **Allow access from anywhere** (`0.0.0.0/0`), porque o IP do Render muda;
   - em **Database → Connect → Drivers**, copie a URL `mongodb+srv://usuario:senha@cluster....mongodb.net/` e troque `<password>` pela senha.
2. **Render:** em https://dashboard.render.com clique em **New → Blueprint**, autorize o GitHub e escolha o repositório `mesa-rpg` (ou crie um **Web Service** com build `npm install` e start `node server.js`).
3. **Variável de ambiente** `MONGODB_URI`: cole a URL do passo 1 (só no Render, nunca no código nem no chat). `MONGODB_DB` já vem como `mesa`.
4. Espere o deploy e confira nos *Logs* a linha **"mesa(s) carregada(s) de MongoDB"**. Abra `https://mesa-rpg-xxxx.onrender.com`, crie a mesa e mande o convite.
5. **Para o servidor não dormir** (o grátis desliga após 15 min sem acesso): crie uma conta grátis em https://cron-job.org, **Create cronjob**, URL `https://SEU-APP.onrender.com/health`, **a cada 10 minutos**. Uma só mesa ligada 24 h cabe nas 750 h grátis por mês do Render.

As mesas ficam na coleção `rooms` e as imagens (mapas e retratos) na coleção `blobs`. Jogando no próprio PC, sem `MONGODB_URI`, tudo continua salvo em `data/rooms.json`. Se preferir o Supabase, use `SUPABASE_URL` e `SUPABASE_SECRET_KEY` no lugar (tabela `mesa_rooms` e pasta `mesa`).
## Jogar com amigos

- **Mesma rede (Wi-Fi):** o convite já usa o IP da sua máquina (ex.: `http://192.168.0.10:3000`). Se não abrir, libere o Node no Firewall do Windows.
- **Amigos em outras casas:** crie um túnel, por exemplo com o [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel --url http://localhost:3000`), e mande o link gerado com `?sala=CÓDIGO` no final. Outra opção é hospedar em Render, Railway ou Fly.io.

## O que tem

- Mapa com grid, zoom e arrastar; imagem de mapa enviada pelo mestre
- Tokens: cada jogador ganha o seu e move só ele; o mestre cria monstros e pode escondê-los
- **Gerador de mapas por tema** (aba Mestre): digite algo como *"cripta amaldiçoada à noite"*, *"vulcão com rios de lava"*, *"taverna em noite de chuva"* ou *"cidade neon na chuva"*. O jogo interpreta:
  - **tipo:** masmorra, caverna, floresta/ermos (com vilas e cemitérios), cidade (neon ou anos 20) e casa/interiores (mansão, taverna, manicômio, biblioteca)
  - **ambiente:** gelo, fogo/lava, deserto, pântano, selva, outono, sombrio, tecnológico, esgoto, cristais
  - **elementos:** sangue, ritual, ruínas, túmulos, sarcófagos, altar, tesouro, celas, trono, rio, lago…
  - **clima:** noite, neblina, chuva, neve
  - **tamanho:** "pequeno" ou "grande"

  Tem pré-visualização, "Gerar outro" (mesmo tema, outro mapa) e ajuste manual de tipo e tamanho. O mapa sai alinhado ao grid. No modo exploração, cobre tudo com névoa, revela só a entrada e coloca os jogadores lá.

  **Continuar o mapa em vez de substituir:** em "Onde colocar", escolha à direita, à esquerda, em cima ou embaixo e clique em **Juntar ao mapa**. A área nova entra ao lado da atual, ligada por uma passagem com porta (dá para misturar temas: masmorra + caverna de gelo + cripta…). Tokens, objetos, portas abertas e a névoa já revelada continuam como estavam; a área nova fica coberta pela névoa. Limite: 200 quadrados por lado.
- Névoa de guerra pintada pelo mestre; **o jogador só recebe a parte revelada da imagem**
- Ping no mapa (Shift+clique)
- **Três visões** (botão na barra do mapa alterna 🗺 2D → 🧊 2.5D → 🎲 3D; cada pessoa escolhe a sua):
  - **2.5D:** câmera inclinada, paredes, casas e prédios com altura, tokens como miniaturas em pé com o retrato
  - **3D:** cena 3D de verdade (Three.js), com sombras, luz das tochas, prédios com janelas acesas, árvores, portas que giram e baús que abrem
    - **botão direito** gira a câmera, **roda** aproxima, **arrastar o chão** move a visão; **duplo clique** numa miniatura centraliza nela
    - arrastar miniaturas, clicar em objetos, atacar, habilidades, efeitos, névoa e combate funcionam igual ao 2D
    - os personagens nunca somem atrás ou dentro de construções: paredes, prédios e copas de árvore que ficam entre a câmera e uma miniatura descem sozinhos, e o que ainda cobrir aparece como silhueta transparente
- **Objetos interativos** (os mapas gerados já vêm com eles; o mestre coloca mais pelo menu 🧩 Objetos):
  - 🚪 **Portas:** clique para abrir ou fechar. Fechadas, bloqueiam passagem e visão dos monstros.
  - 🎁 **Baús:** abrem com animação e o conteúdo aparece no chat. Alt+clique do mestre edita o que tem dentro.
  - ⚠ **Armadilhas escondidas:** quem pisa faz teste de esquiva automático e leva dano se falhar. O mestre vê, o jogador não. Alt+clique edita o dano.
  - 🔥 **Tochas:** acender ou apagar muda a luz.
  - 🔧 **Alavanca:** abre a passagem secreta (❔) ligada a ela; a parede afunda.
  - 〰 **Parede rachada:** o jogador tenta quebrar com um teste de força. O mestre quebra qualquer parede com ⛏.
  - O jogador precisa estar encostado no objeto para usar.
- **Paredes bloqueiam o movimento** dos jogadores nos mapas gerados (o token volta se não houver caminho). O mestre pode desligar isso na aba Mestre.
- **Retratos nos tokens:** galeria com 25 ilustrações (heróis e monstros de fantasia, Cyberpunk e Cthulhu) ou foto própria enviada. O jogador troca o dele pela ficha; o mestre troca qualquer um pelo editor de token. Todos veem na hora.
- **Animações em tempo real para todos:**
  - tokens deslizam com pulinhos ao andar, "respiram" parados, surgem e somem com animação
  - dano: tremida, clarão vermelho, partículas e número subindo; cura: brilho verde e cruzes
  - token com 0 PV tomba, fica cinza e ganha uma caveira
  - anel pulsante no token da vez na iniciativa
  - balão com o resultado do dado em cima de quem rolou
  - efeitos lançados por qualquer um pela barra do mapa: corte, disparo (sai do seu token), magia/hack/ritual, explosão (a tela treme) e cura
  - o jogador vê o monstro "ferido" (gota de sangue) ou "caído", mas nunca os PV exatos
- Rolagens feitas no servidor: `/r 2d6+3`, `/r 4d6kh3`, `/r 2d20kl1`, `/r 3d6!` (explosivo), `/gr` (secreta), `/m` (mensagem só para o mestre)
- Fichas por sistema, com rolagem ao clicar:
  - D&D 5e: d20 + modificador, vantagem e desvantagem, 20 e 1 naturais
  - Cyberpunk 2020: atributo + perícia + 1d10 contra a dificuldade (Fácil 10, Média 15, Difícil 20, Muito Difícil 25, Quase Impossível 30); 10 natural rola de novo e soma, 1 natural é falha crítica
- **Cyberpunk 2020 no modelo do livro e da ficha oficial:**
  - atributos INT, REF, TEC, AuCon, ATR, SOR, MOV, TCO e EMP; Papel (Solo, Roqueiro, Netrunner, Técnico, Tecnomédico, Mídia, Policial, Corporativo, Atravessador, Nômade), REP e PE
  - calculados sozinhos: Correr (MOV × 3 m), Saltar, Carregar, Levantar, VIT, MTC, modificador de dano corpo a corpo e EMP atual (Humanidade ÷ 10)
  - trilha de 40 quadrados de ferimento (Leve, Grave, Crítico, Mortal 0 a 6) com o Atordoamento de cada nível; clique nos quadrados para marcar dano
  - ferimentos pesam: Grave −2 REF; Crítico REF, INT e AuCon pela metade; Mortal a um terço
  - Blindagem PB por local (Cabeça, Torso, braços, pernas) e todas as perícias da ficha, agrupadas por atributo (dá para mostrar só as que têm pontos)
  - implantes cibernéticos com PH: a Humanidade (EMP × 10 − PH) se ajusta sozinha
  - Fluxovida: estilo, antecedente familiar, motivações e acontecimentos
  - armas com perícia e Precisão: o teste é REF + perícia + Precisão + 1d10
  - combate à distância contra a tabela de alcance (queima-roupa 10, curta 15, média 20, longa 25, extrema 30; 1 quadrado = 2 m); corpo a corpo contra REF + defesa + 1d10 do alvo
  - dano: local do golpe no 1d10, a blindagem do local segura (e perde 1 ponto a cada ataque que a atravessa), tiro na cabeça dobra, depois sai o MTC (mínimo 1)
  - mais de 8 de dano num membro arranca o membro; na cabeça, mata
  - após cada ferimento, teste contra Atordoamento (e contra Morte, se Mortal); o atordoado perde o turno até se recuperar
  - Iniciativa = REF + Noção de Combate + 1d10; falha crítica em combate usa a Tabela de Falhas Críticas (arma cai, trava, fere a si ou um aliado)
  - Call of Cthulhu: d100 com sucesso regular, difícil e extremo, crítico, desastre e dados de bônus ou penalidade; testes de Sanidade e Sorte
- Iniciativa com rodadas, entradas ocultas e destaque do token da vez
- **📚 Classes e habilidades cadastradas pelo mestre** (aba Mestre; no Cyberpunk são Papéis, no Cthulhu, Ocupações):
  - cada uma tem PV (e Sanidade, Sorte, Humanidade…), CA ou PB da armadura, atributos, perícias, ataques, habilidades e equipamento inicial
  - **Carregar prontas** traz 4 por sistema (ex.: Guerreiro, Mago, Clérigo, Ladino; os 10 Papéis do Cyberpunk 2020 com Habilidade Especial e Perícias Profissionais; Detetive, Médico, Professor de ocultismo, Veterano de guerra), que dá para editar
  - habilidades: **área/alvo** com dano e teste de resistência (ou "acerta sempre"), **cura** (em si ou num aliado), **efeito narrado** e **passiva**; cada uma com alcance, raio e número de usos
  - na aba Ficha, o mestre escolhe a classe de cada jogador e clica em **Aplicar**; se o mestre deixar, o jogador escolhe a própria (fora de combate)
  - o jogador usa as habilidades pela ficha (clica em **Usar** e depois no alvo), com as mesmas regras do ataque: alcance, linha de visão, só na sua vez e uma ação por turno
  - **🛏 Descanso** devolve os usos de todo mundo
  - **Travar fichas**: o jogador não muda atributos, perícias, ataques nem PV máximos; as habilidades, só o mestre edita sempre
- **Bestiário:** cada inimigo da galeria tem ficha de combate própria, com PV, defesa, ataques e habilidades:
  - D&D: goblin, orc, esqueleto, lobo, dragão, gosma, aranha, olho tirano e NPCs
  - Cyberpunk 2020: booster, drone, ciberpsicopata, segurança corporativo, netrunner, mercenário (com PB, MTC e REF)
  - Cthulhu: cultista, profundo, shoggoth, carniçal, tentáculos, capanga, feiticeiro

  No editor do token (aba Mestre), clique num ataque e depois no alvo; o jogo rola o acerto e aplica o dano. Cada sistema usa a própria regra: CA no D&D, alcance/defesa, local do golpe, PB e MTC no Cyberpunk, % da perícia no Cthulhu. As habilidades incluem sopro em área com teste de resistência, perda de Sanidade, cura e efeitos narrados. Dá para trocar a ficha pelo seletor "Ficha do bestiário".
- **Jogadores atacam os monstros com os dados:**
  - a ficha tem uma seção **Ataques** (nome, tipo, bônus/%, dano, alcance), que já vem com armas do sistema e pode ser editada
  - clique em **⚔ Atacar** e depois no inimigo: o jogo rola o acerto (d20 contra CA, d10 contra a dificuldade do alcance ou a defesa, d100 contra %) e o dano, que tira PV do monstro; com 0 PV ele cai
  - regras: corpo a corpo precisa estar encostado; distância precisa de alcance e de linha de visão
  - em combate, só na sua vez e um ataque por turno; depois, **Encerrar turno** (o painel "Sua vez!" aparece na aba Iniciativa)
  - atacar fora de combate começa a luta
- **📜 História** (aba História, só o mestre vê): digite ou cole a aventura e clique em **Organizar em cenas**:
  - separa as cenas por "Cena 1", "Capítulo", "Parte", "Ato", "#", "1." ou por linha em branco
  - em cada cena acha o **lugar** (com as mesmas palavras do gerador de mapas; sem lugar citado, continua no mapa da cena anterior), os **inimigos com a quantidade** ("quatro goblins e dois orcs", "um bando de lobos", "uma gangue de boosters"), o **chefe** ("o chefe dos goblins" vira um goblin chefe com o dobro de vida; "um dragão" já é o chefe), **armadilhas**, **tesouros**, **emboscadas** e os **nomes de personagens**
  - inimigos só citados ("o dono conta que goblins roubaram…") não entram na cena
  - tudo pode ser corrigido em "Editar cena": texto, lugar, inimigos e quantidades, chefe, armadilhas e baús
  - **▶ Montar cena** gera o mapa do lugar (substituindo o atual ou continuando ao lado), posiciona os inimigos da cena na área nova e lê o texto para os jogadores; **📢 Narrar** só lê; **⚔ Só inimigos** usa o mapa atual
  - a narração aparece em destaque no chat de todos; a cena atual fica marcada
  - funciona por palavras-chave, sem IA: histórias com frases diretas ("três cultistas vigiam a cripta") funcionam melhor
- **⚔ Encontro automático** (aba Mestre): você diz quantos inimigos, quantos grupos (ou automático), quais tipos (nenhum marcado = todos do sistema), se tem chefe e quantas armadilhas e baús extras; o jogo posiciona tudo:
  - grupos coerentes (goblins com orcs e lobos, esqueletos juntos, cultistas com feiticeiros, gangue de Boosters…), com mais lacaios que inimigos fortes
  - espalhados pelo caminho, do meio até o fundo do mapa, de preferência em salas e longe uns dos outros
  - fora da vista dos jogadores (a luta só começa quando alguém chega perto) e, se quiser, ocultos até serem vistos
  - quem luta corpo a corpo fica na frente do grupo, quem atira fica atrás; o chefe fica no fundo do mapa, perto de um baú se houver
  - armadilhas extras vão para os corredores; baús extras, para cantos sem saída ou perto dos grupos
  - o resumo de onde ficou cada grupo aparece no chat, só para você; "Remover todos os inimigos" limpa o mapa
- **▶ Demonstração** (aba Mestre, no topo): tudo se move sozinho, como num jogo. Se não houver mapa gerado, cria um (masmorra, cidade ou mansão, conforme o sistema).
  - entram 3 jogadores de teste e dois grupos de inimigos do bestiário, longe deles
  - os heróis exploram andando quadrado a quadrado, e a névoa se abre em volta deles
  - eles abrem portas e baús e podem cair em armadilhas
  - quando um monstro os avista, começa o combate: cada um anda até o alvo no seu turno e ataca ou usa habilidade
  - depois de cada vitória, seguem para o próximo grupo até o fim
  - o botão ⏹ para tudo
- **🧪 Teste com jogadores** (aba Mestre): adiciona 1 a 4 jogadores de mentira, com ficha, retrato e arma, para testar sozinho. Eles seguem as regras de paredes e armadilhas quando você os move. Dá para ligar "jogadores de teste agem sozinhos" e "monstros agem sozinhos": no turno deles, cada um anda até o alvo, ataca ou usa habilidade, e passa a vez.
  - **📍 Posição inicial:** clique em *Escolher posição inicial* e depois no quadrado do mapa onde quer que eles comecem. Ao adicionar os jogadores de teste ou iniciar a demonstração, eles nascem em volta desse quadrado (com névoa, o entorno é revelado). *Levar para lá* move os que já estão no mapa; o × volta para a posição automática. A posição vale só para o mapa atual.
- **Combate automático:** cada monstro tem um alcance de visão (padrão 6 quadrados, ajustável no editor do token; 0 = não detecta). Quando um jogador entra na visão dele sem parede no meio:
  - aparece "⚔ COMBATE!" para todos e um "❗" em cima do monstro
  - o monstro sai do oculto e a iniciativa de todos é rolada
  - a aba Iniciativa abre sozinha
  - outros monstros que avistarem alguém durante a luta entram nela
  - quando todos os inimigos chegam a 0 PV, aparece "🏆 Vitória!"

  O mestre pode desligar o recurso ou encerrar a luta na aba Iniciativa. Nos mapas gerados, paredes, árvores, casas e prédios bloqueiam a visão; em imagens enviadas vale só a distância.
- O jogador nunca recebe tokens ocultos, PV de monstros, fichas dos outros nem as anotações do mestre
- As mesas ficam salvas em `data/rooms.json` (ou no MongoDB, quando hospedado; veja "Hospedar no Render")

O mestre é reconhecido por uma chave guardada no navegador em que a mesa foi criada. Para mestrar de outro PC, crie a mesa nele.
