/* Mesa — cliente do navegador */
(() => {
  'use strict';
  const API = window.SYSTEMS_API;
  const CLS = window.CLASSES_API;
  const socket = io();

  // ---------- utilidades ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue sem lembrar */ } },
  };
  // Só troca o HTML quando muda de verdade, para não engolir cliques a cada movimento de token.
  const setHTML = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };
  const isEditing = root => root.contains(document.activeElement) && document.activeElement.matches('input, textarea, select');

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  let pid = store.get('mesa:pid');
  if (!pid) { pid = rid(); store.set('mesa:pid', pid); }

  const S = {
    code: null, name: '', isGM: false, joined: false, lanUrls: [],
    state: null, revealed: new Set(), chat: [],
    mapImg: null, mapSrc: null, mapKey: '',
    cam: { x: 0, y: 0, z: 1 }, tool: 'move', brush: 3, selected: null,
    drag: null, pan: null, paint: null, paintTimer: null, pings: [], lastMove: 0,
    tab: 'chat', rollMode: 'normal', cocBP: 0, secret: false,
    sheetTarget: null, sheetDraft: null, sheetDraftPid: null, sheetDirty: false,
    fogSent: -1, colors: {},
    viewMode: ['2d', '25d', '3d'].includes(store.get('mesa:view')) ? store.get('mesa:view') : (store.get('mesa:3d') === '0' ? '2d' : '25d'),
    view3d: false, objAnim: new Map(), sinks: new Map(), wallInfo: null,
  };

  // ---------- lobby ----------
  const params = new URLSearchParams(location.search);
  const savedName = store.get('mesa:name') || '';
  $$('#lobby input[name=name]').forEach(i => { i.value = savedName; });
  if (params.get('sala')) $('#join-form [name=code]').value = params.get('sala').toUpperCase();

  let chosenSystem = 'dnd5e';
  $('#system-choice').innerHTML = Object.entries(API.SYSTEMS).map(([k, s]) =>
    `<button type="button" class="sys-card${k === chosenSystem ? ' on' : ''}" data-sys="${k}"><strong>${esc(s.name)}</strong><span>${esc(s.tagline)}</span></button>`).join('');
  $('#system-choice').addEventListener('click', e => {
    const b = e.target.closest('[data-sys]');
    if (!b) return;
    chosenSystem = b.dataset.sys;
    $$('.sys-card').forEach(x => x.classList.toggle('on', x === b));
    document.body.dataset.system = chosenSystem;
  });

  $('#create-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    socket.emit('room:create', { system: chosenSystem }, res => {
      if (!res?.ok) return toast(res?.error || 'Não deu para criar a mesa.');
      store.set(`mesa:gm:${res.code}`, res.gmKey);
      join(res.code, name);
    });
  });

  $('#join-form').addEventListener('submit', e => {
    e.preventDefault();
    join(e.target.code.value.trim().toUpperCase(), e.target.name.value.trim());
  });

  function join(code, name) {
    store.set('mesa:name', name);
    socket.emit('room:join', { code, name, pid, gmKey: store.get(`mesa:gm:${code}`) }, res => {
      if (!res?.ok) return toast(res?.error || 'Não deu para entrar.');
      S.code = res.code; S.name = name; S.isGM = res.isGM; S.lanUrls = res.lanUrls || [];
      if (!S.joined) enterGame(res);
      S.joined = true;
    });
  }

  // Reconecta sozinho se a conexão cair.
  socket.on('connect', () => { if (S.joined) join(S.code, S.name); });
  socket.on('disconnect', () => { if (S.joined) toast('Conexão perdida. Tentando reconectar…'); });

  // Recarregou a página já dentro de uma mesa: entra direto.
  if (params.get('sala') && savedName) join(params.get('sala').toUpperCase(), savedName);

  function enterGame(res) {
    const sys = API.SYSTEMS[res.system];
    document.body.dataset.system = res.system;
    document.body.classList.toggle('is-gm', res.isGM);
    $('#lobby').hidden = true;
    $('#game').hidden = false;
    history.replaceState(null, '', `?sala=${res.code}`);
    document.title = `Mesa ${res.code} — ${sys.name}`;
    $('#sys-name').textContent = sys.name;
    $('#room-code').textContent = res.code;
    $('#role-badge').textContent = res.isGM ? 'Mestre' : 'Jogador';
    $('#secret-label').textContent = res.isGM ? 'Rolagens secretas (só você vê)' : 'Rolagens secretas (só o mestre vê)';
    $('#token-form [name=name]').value = sys.monster;
    const monsterArt = window.TOKEN_ART.list.find(a => a.name === sys.monster)
      || window.TOKEN_ART.list.find(a => a.sys === res.system && a.kind === 'monster');
    setNewTokenImg(monsterArt ? `lib:${monsterArt.key}` : null);
    if (monsterArt) fillFromBestiary(`lib:${monsterArt.key}`);
    renderFxButtons(res.system);
    setupGen(res.system);
    applyView3d();
    if (res.isGM) renderGenPreview();
    $('#invite-info').innerHTML = `Mande este link para os jogadores:<br><code>${esc(inviteUrl())}</code><br><br>`
      + 'Funciona direto para quem está na mesma rede (Wi-Fi). Para jogar com amigos longe, veja o README (túnel ou hospedagem).';
    refreshColors();
    renderDiceBar();
    resizeCanvas();
  }

  function inviteUrl() {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const base = local && S.lanUrls[0] ? S.lanUrls[0] : location.origin;
    return `${base}/?sala=${S.code}`;
  }

  $('#invite-btn').addEventListener('click', () => {
    const url = inviteUrl();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast('Link de convite copiado!'), () => prompt('Copie o link:', url));
    } else {
      prompt('Copie o link:', url);
    }
  });

  function refreshColors() {
    const cs = getComputedStyle(document.body);
    for (const k of ['stage', 'board', 'grid', 'fog', 'accent', 'ink', 'ok', 'danger', 'warn']) S.colors[k] = cs.getPropertyValue(`--${k}`).trim();
  }

  // ---------- estado vindo do servidor ----------
  socket.on('state', st => {
    if (S.drag) {
      const t = st.tokens.find(x => x.id === S.drag.id);
      if (t) { t.x = S.drag.x; t.y = S.drag.y; }
    }
    if (S.sheetDirty && st.sheets[S.sheetDraftPid]) st.sheets[S.sheetDraftPid] = S.sheetDraft;
    S.state = st;
    syncVis(st);
    buildWalls(st);
    if (!S.paint) S.revealed = new Set(st.revealed);
    if (S.selected && !st.tokens.some(t => t.id === S.selected)) S.selected = null;

    const key = `${st.map.cols}x${st.map.rows}x${st.map.grid}`;
    if (key !== S.mapKey) { S.mapKey = key; fitView(); window.MESA3D?.fit(); }

    renderPlayers();
    renderInit();
    renderCombat();
    renderSheet();
    if (S.isGM) { renderGmPanel(); renderTokenEditor(); maybeSendPlayerImage(); }
    requestDraw();
  });

  socket.on('map:image', ({ image }) => {
    S.mapSrc = image || null;
    if (!image) { S.mapImg = null; requestDraw(); return; }
    const img = new Image();
    img.onload = () => {
      if (S.mapSrc !== image) return;
      S.mapImg = img;
      S.fogSent = -1;
      requestDraw();
      maybeSendPlayerImage();
    };
    img.src = image;
  });

  socket.on('ping', p => {
    S.pings.push({ ...p, t: performance.now() });
    requestDraw();
  });

  // ---------- topo ----------
  function renderPlayers() {
    setHTML($('#players'), S.state.players.map(p =>
      `<span class="chip${p.online ? '' : ' off'}" style="--c:${esc(p.color)}" title="${p.online ? 'online' : 'offline'}">${p.img ? portraitHTML(p.img, p.charName, p.color, 'small') : '<i></i>'}${p.isGM ? '👑 ' : ''}${p.bot ? '🧪 ' : ''}${esc(p.isGM ? p.name : p.charName)}${!p.isGM && !p.bot && p.charName !== p.name ? ` <span class="muted">(${esc(p.name)})</span>` : ''}</span>`).join(''));
  }

  // ---------- abas ----------
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab;
    $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.tab').forEach(x => x.classList.toggle('on', x.id === `tab-${S.tab}`));
    if (S.tab === 'chat') { b.classList.remove('unread'); scrollChat(); }
    if (S.tab === 'sheet') renderSheet(true);
  });

  // ---------- chat e dados ----------
  const LEVELS = {
    critical: ['Crítico!', 'good'], extreme: ['Sucesso extremo', 'good'], hard: ['Sucesso difícil', 'good'],
    regular: ['Sucesso', 'good'], fail: ['Falha', 'bad'], fumble: ['Desastre!', 'bad'],
  };
  const dieChip = (v, cls = '') => `<i class="die ${cls}">${v}</i>`;
  const signed = n => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);

  function rollView(r) {
    switch (r.kind) {
      case 'expr': {
        const detail = r.parts.map((p, i) => {
          const op = i === 0 && p.sign > 0 ? '' : p.sign > 0 ? '+ ' : '− ';
          if (p.type === 'mod') return `${op}${p.value}`;
          const chips = p.rolls.map(x => dieChip(x.v, [x.dropped && 'drop', x.v === p.sides && 'max', x.v === 1 && 'min'].filter(Boolean).join(' '))).join('');
          return `${op}<span>${esc(p.notation)}</span> ${chips}`;
        }).join(' ');
        return { total: r.total, detail };
      }
      case 'd20': {
        const chips = r.dice.map((v, i) => {
          const dropped = r.dice.length > 1 && (r.dice[0] === r.dice[1] ? i === 1 : v !== r.natural);
          return dieChip(v, [dropped && 'drop', v === 20 && 'max', v === 1 && 'min'].filter(Boolean).join(' '));
        }).join('');
        const mode = r.mode === 'adv' ? 'vantagem ' : r.mode === 'dis' ? 'desvantagem ' : '';
        const verdict = r.crit ? ['20 natural!', 'good'] : r.fumble ? ['1 natural…', 'bad'] : null;
        return { total: r.total, detail: `${mode}d20 ${chips} ${r.mod ? signed(r.mod) : ''}`, verdict };
      }
      case 'd10': {
        let detail = `${r.base} + d10 ${dieChip(r.first, r.first === 10 ? 'max' : r.first === 1 ? 'min' : '')}`;
        for (const x of r.extras || (r.extra != null && r.crit === 'success' ? [r.extra] : [])) detail += ` + ${dieChip(x, x === 10 ? 'max' : '')}`;
        if (r.crit === 'fail' && r.fumble == null && r.extra != null) detail += ` − ${dieChip(r.extra, 'min')}`; // rolagens antigas (RED)
        if (r.fumble != null) detail += ` · tabela de falhas ${dieChip(r.fumble, 'min')}`;
        const verdict = r.crit === 'success' ? ['Sucesso decisivo!', 'good'] : r.crit === 'fail' ? ['Falha crítica!', 'bad'] : null;
        return { total: r.total, detail, verdict };
      }
      case 'd100': {
        const tens = r.tens.map(t => dieChip(t === 0 ? '00' : t)).join('');
        const bp = r.bp > 0 ? `${r.bp} bônus · ` : r.bp < 0 ? `${-r.bp} penalidade · ` : '';
        return { total: r.result, detail: `${bp}dezenas ${tens} unidade ${dieChip(r.units)} · alvo ${r.skill}%`, verdict: LEVELS[r.level] };
      }
      case 'flat': return { total: r.total, detail: 'valor fixo (DES)' };
      default: return { total: '?', detail: '' };
    }
  }

  function msgHTML(m, isNew = false) {
    const time = new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const cls = `${isNew ? ' new' : ''}${m.hidden ? ' hidden-msg' : ''}`;
    if (m.type === 'system') return `<div class="msg sys${cls}">${esc(m.text)}</div>`;
    // Narração da História: texto do mestre em destaque, para ler em voz alta
    if (m.type === 'narration') return `<div class="msg narration${cls}">${m.title ? `<div class="nar-title">📜 ${esc(m.title)}</div>` : ''}<div class="nar-text">${esc(m.text)}</div></div>`;
    const head = `<div class="head">${m.img ? portraitHTML(m.img, m.name, m.color, 'small') : ''}<span class="who" style="--c:${esc(m.color)}">${esc(m.name)}${m.isGM ? ' <em>(mestre)</em>' : ''}</span>`
      + (m.hidden ? `<span class="tag">🔒 ${m.type === 'text' ? 'só o mestre' : 'secreta'}</span>` : '') + `<span class="time">${time}</span></div>`;
    if (m.type === 'text') return `<div class="msg${cls}">${head}<div class="txt">${esc(m.text)}</div></div>`;
    const v = rollView(m.roll);
    return `<div class="msg roll ${v.verdict?.[1] || ''}${cls}">${head}`
      + (m.label ? `<div class="roll-label">${esc(m.label)}</div>` : '')
      + `<div class="roll-body"><span class="roll-total">${v.total}</span><div class="roll-detail">${v.detail}${v.verdict ? ` <span class="verdict">${v.verdict[0]}</span>` : ''}</div></div></div>`;
  }

  const scrollChat = () => { const log = $('#chat-log'); log.scrollTop = log.scrollHeight; };

  socket.on('chat:history', list => {
    S.chat = list;
    $('#chat-log').innerHTML = list.map(msgHTML).join('');
    scrollChat();
  });

  socket.on('chat:msg', m => {
    S.chat.push(m);
    const log = $('#chat-log');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.insertAdjacentHTML('beforeend', msgHTML(m, true));
    if (atBottom || m.pid === pid) scrollChat();
    rollBubble(m);
    if (S.tab !== 'chat') {
      $('#tabs [data-tab=chat]').classList.add('unread');
      if (m.type === 'roll' && m.pid === pid) {
        const v = rollView(m.roll);
        toast(`${m.label || 'Rolagem'}: ${v.total}${v.verdict ? ` — ${v.verdict[0]}` : ''}`);
      }
    }
  });

  $('#chat-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat:send', { text, secret: S.secret });
    input.value = '';
  });

  $('#secret').addEventListener('change', e => { S.secret = e.target.checked; });

  function renderDiceBar() {
    const sys = document.body.dataset.system;
    const buttons = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(d => [d, `1${d}`]);
    if (sys === 'dnd5e') buttons.push(['d20 vant.', '2d20kh1'], ['d20 desv.', '2d20kl1']);
    if (sys === 'cyberpunk') buttons.push(['2d6 dano', '2d6'], ['3d6 dano', '3d6'], ['4d6 dano', '4d6'], ['5d6 dano', '5d6']);
    $('#dice-bar').innerHTML = buttons.map(([label, expr]) => `<button type="button" data-expr="${expr}">${label}</button>`).join('');
  }
  $('#dice-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-expr]');
    if (b) socket.emit('chat:send', { text: `/r ${b.dataset.expr}`, secret: S.secret });
  });

  // ---------- ficha ----------
  const sheetRoot = $('#tab-sheet');

  function renderSheet(force = false) {
    const st = S.state;
    if (!st || (!force && isEditing(sheetRoot))) return;
    const sys = API.SYSTEMS[st.system];
    let target = pid;
    let picker = '';
    if (S.isGM) {
      const ids = Object.keys(st.sheets);
      if (!ids.length) {
        sheetRoot.innerHTML = '<p class="empty">Nenhum jogador entrou ainda. As fichas aparecem aqui quando alguém entrar pelo convite.</p>';
        return;
      }
      if (!ids.includes(S.sheetTarget)) S.sheetTarget = ids[0];
      target = S.sheetTarget;
      const nameOf = id => st.players.find(p => p.id === id)?.charName || '???';
      picker = `<label class="picker">Ficha de<select id="sheet-pick">${ids.map(id => `<option value="${esc(id)}"${id === target ? ' selected' : ''}>${esc(nameOf(id))}</option>`).join('')}</select></label>`;
    }
    const sh = st.sheets[target];
    if (!sh) { sheetRoot.innerHTML = '<p class="empty">Carregando ficha…</p>'; return; }
    const tok = st.tokens.find(t => t.owner === target);
    const sig = JSON.stringify([target, sh, Object.keys(st.sheets), st.players.map(p => p.charName), tok?.img, tok?.color, st.classes, st.settings]);
    if (!force && sig === S.sheetSig) return;
    S.sheetSig = sig;
    S.sheetDraft = structuredClone(sh);
    S.sheetDraftPid = target;
    const hero = `<div class="sheet-hero">${portraitHTML(tok?.img, sh.info.name, tok?.color, '', `type="button" data-act="portrait" title="Trocar retrato"${tok ? '' : ' disabled'}`)}
      <div class="grow"><strong>${esc(sh.info.name || 'Sem nome')}</strong><span class="muted small">${tok ? 'Clique no retrato para trocar. Todos veem na hora.' : 'O mestre removeu o seu token do mapa.'}</span></div></div>`;
    sheetRoot.innerHTML = picker + hero + classPickHTML(sh) + sheetHTML(st.system, sys, S.sheetDraft);
    if (!S.isGM && st.settings?.lockSheets) lockSheetInputs();
    refreshCalcs();
  }

  // Escolha de classe na ficha: o mestre sempre; o jogador, se o mestre deixar.
  function classPickHTML(sh) {
    const st = S.state;
    const classes = st.classes || [];
    const label = CLS.CLASS_LABEL[st.system];
    const cur = classes.find(c => c.id === sh.classId);
    const canPick = S.isGM || st.settings?.playersPickClass;
    if (!classes.length || !canPick) {
      return cur ? `<div class="class-pick"><span class="muted small">${label}:</span> <b>${esc(cur.name)}</b></div>` : '';
    }
    return `<div class="class-pick">
      <label>${label}<select id="class-pick"><option value="">— escolher —</option>${classes.map(c => `<option value="${c.id}"${c.id === sh.classId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn primary small" data-act="apply-class">Aplicar</button>
      ${cur?.desc ? `<p class="muted small">${esc(cur.desc)}</p>` : ''}
    </div>`;
  }

  // Ficha travada pelo mestre: o jogador não mexe em atributos, perícias, ataques, PV máximos nem na classe.
  function lockSheetInputs() {
    const field = CLS.CLASS_FIELD[S.state.system];
    const defField = CLS.DEF_FIELD[S.state.system];
    const locked = new RegExp(`^(stats|skills|attacks|armor)\\.|\\.max$|^info\\.(${field}${defField ? `|${defField}` : ''})$`);
    for (const el of $$('[data-path]', sheetRoot)) if (locked.test(el.dataset.path)) el.disabled = true;
    for (const b of $$('[data-act="add-skill"], [data-act="del-skill"], [data-act="add-attack"], [data-act="del-attack"]', sheetRoot)) b.hidden = true;
  }

  const seg = (name, options, current) =>
    `<div class="seg">${options.map(([v, label]) => `<button type="button" data-seg="${name}" data-v="${v}" class="${String(current) === v ? 'on' : ''}">${label}</button>`).join('')}</div>`;

  // Grupos de perícias como na ficha do Cyberpunk 2020 (Habilidades Especiais primeiro, depois por atributo).
  const SKILL_GROUPS = [['atr', 'Atratividade'], ['tco', 'Tipo Corporal'], ['cool', 'Autocontrole'], ['emp', 'Empatia'], ['int', 'Inteligência'], ['ref', 'Reflexos'], ['tec', 'Técnica']];

  function sheetHTML(system, sys, sh) {
    const field = f => (f.options
      ? `<label>${esc(f.label)}<select data-path="info.${f.key}"><option value="">—</option>${f.options.map(o => `<option${o === sh.info[f.key] ? ' selected' : ''}>${esc(o)}</option>`).join('')}${sh.info[f.key] && !f.options.includes(sh.info[f.key]) ? `<option selected>${esc(sh.info[f.key])}</option>` : ''}</select></label>`
      : `<label>${esc(f.label)}<input data-path="info.${f.key}" value="${esc(sh.info[f.key])}" maxlength="60"></label>`);
    const statOpts = cur => sys.stats.map(s => `<option value="${s.key}"${s.key === cur ? ' selected' : ''}>${s.label}</option>`).join('');
    const modeBar = system === 'dnd5e'
      ? seg('rollMode', [['dis', 'Desvantagem'], ['normal', 'Normal'], ['adv', 'Vantagem']], S.rollMode)
      : system === 'coc'
        ? seg('cocBP', [['-2', '−2'], ['-1', 'Penalidade'], ['0', 'Normal'], ['1', 'Bônus'], ['2', '+2']], S.cocBP)
        : '<span class="muted small">10 no d10: rola de novo e soma. 1: falha crítica. Fácil 10 · Média 15 · Difícil 20 · Muito Difícil 25 · Quase Impossível 30.</span>';

    const skill = (sk, i) => {
      const p = `skills.${i}`;
      const parts = [];
      if (sys.skillMode === 'prof') parts.push(`<input type="checkbox" data-path="${p}.prof"${sk.prof ? ' checked' : ''} title="Proficiente">`);
      parts.push(`<input type="text" data-path="${p}.name" value="${esc(sk.name)}" maxlength="50">`);
      if (sys.skillMode !== 'percent') parts.push(`<select data-path="${p}.stat" title="Atributo">${statOpts(sk.stat)}</select>`);
      if (sys.skillMode !== 'prof') parts.push(`<input type="number" data-path="${p}.value" value="${esc(sk.value)}" title="${sys.skillMode === 'level' ? 'Nível' : '%'}">`);
      parts.push(`<button type="button" class="skill-roll" data-roll="skill" data-i="${i}" title="Rolar">🎲 <span data-calc="skill:${i}"></span></button>`);
      parts.push(`<button type="button" class="x" data-act="del-skill" data-i="${i}" title="Remover">×</button>`);
      return `<div class="skill${sys.skillMode === 'level' && !Number(sk.value) ? ' zero' : ''}">${parts.join('')}</div>`;
    };
    // Perícias agrupadas (Cyberpunk 2020) ou em lista simples
    let skillsHTML;
    if (sys.groupSkills) {
      const idx = sh.skills.map((sk, i) => [sk, i]);
      const special = new Set(sys.specialSkills || []);
      const groups = [['Habilidades Especiais', idx.filter(([sk]) => special.has(sk.name))],
        ...SKILL_GROUPS.map(([k, label]) => [label, idx.filter(([sk]) => !special.has(sk.name) && sk.stat === k)])];
      skillsHTML = `<label class="check small"><input type="checkbox" data-ui="only-trained"${S.onlyTrained ? ' checked' : ''}> Mostrar só as perícias com pontos</label>
        <div class="skills${S.onlyTrained ? ' only-trained' : ''}">${groups.filter(([, list]) => list.length).map(([label, list]) => `<div class="skill-group"><h5>${esc(label)}</h5>${list.map(([sk, i]) => skill(sk, i)).join('')}</div>`).join('')}</div>`;
    } else {
      skillsHTML = `<div class="skills">${sh.skills.map(skill).join('')}</div>`;
    }

    const armorHTML = sys.armor ? `
      <h4>Blindagem <span class="muted small">PB de cada parte do corpo · o local do golpe sai no 1d10</span></h4>
      <div class="armor-table">${sys.armor.map(a => `<label><span>${esc(a.label)}<small>${a.roll}</small></span><input type="number" min="0" max="99" data-path="armor.${a.key}" value="${esc(sh.armor?.[a.key] ?? 0)}"></label>`).join('')}</div>` : '';

    const lifeHTML = sys.lifepath ? (() => {
      const groups = [...new Set(sys.lifepath.map(f => f.group))];
      const totalHc = (sh.cyber || []).reduce((a, c) => a + (Number(c.hc) || 0), 0);
      const totalCost = (sh.cyber || []).reduce((a, c) => a + (Number(c.cost) || 0), 0);
      return `
      <h4>Implantes cibernéticos <span class="muted small">cada ponto de PH (perda de Humanidade) tira 1 de Humanidade; a cada 10, −1 EMP</span></h4>
      <div class="cyber-list">${(sh.cyber || []).map((c, i) => `<div class="cyber-row">
        <input type="text" data-path="cyber.${i}.name" value="${esc(c.name)}" maxlength="60" placeholder="Implante">
        <label>PH<input type="number" data-path="cyber.${i}.hc" value="${esc(c.hc)}" min="0" max="99"></label>
        <label>Preço (ed)<input type="number" data-path="cyber.${i}.cost" value="${esc(c.cost)}" min="0"></label>
        <button type="button" class="x" data-act="del-cyber" data-i="${i}" title="Remover">×</button></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn ghost small" data-act="add-cyber">+ Implante</button><span class="muted small" data-calc="cyber:0">Custo em PH: ${totalHc} · ${totalCost} ed</span></div>
      <details class="lifepath"${S.lifeOpen ? ' open' : ''}><summary><h4>Fluxovida</h4></summary>
        ${groups.map(gr => `<h5>${esc(gr)}</h5><div class="life-grid">${sys.lifepath.filter(f => f.group === gr).map(f => (f.long
          ? `<label class="span2">${esc(f.label)}<textarea rows="3" data-path="life.${f.key}">${esc(sh.life?.[f.key] || '')}</textarea></label>`
          : `<label>${esc(f.label)}<input data-path="life.${f.key}" value="${esc(sh.life?.[f.key] || '')}" maxlength="120"></label>`)).join('')}</div>`).join('')}
      </details>`;
    })() : '';

    return `<div class="sheet">
      <div class="sheet-info">${sys.info.filter(f => !f.short).map(field).join('')}</div>
      <div class="sheet-short">${sys.info.filter(f => f.short).map(field).join('')}</div>
      <div class="resources">${sys.resources.map(r => `
        <div class="res${r.woundTrack ? ' wide' : ''}">
          <div class="res-head"><span>${esc(r.label)}</span>${r.rollable ? `<button type="button" class="mini" data-roll="res" data-key="${r.key}">🎲 testar</button>` : ''}</div>
          <div class="res-vals"><input type="number" data-path="res.${r.key}.cur" value="${esc(sh.res[r.key]?.cur)}"><span class="muted">/</span><input type="number" data-path="res.${r.key}.max" value="${esc(sh.res[r.key]?.max)}"></div>
          <div class="bar"><i data-calc="bar:${r.key}"></i></div>
          ${r.woundTrack ? `<div class="wound-track" data-calc="track:${r.key}"></div>` : ''}
        </div>`).join('')}</div>
      ${armorHTML}
      <div class="sheet-actions">${modeBar}<button type="button" class="btn primary small" data-roll="init">🎲 Iniciativa</button></div>
      <h4>Atributos <span class="muted small">clique no nome para rolar</span></h4>
      <div class="stats">${sys.stats.map(s => `
        <div class="stat"><button type="button" class="stat-name" data-roll="stat" data-key="${s.key}">${s.label}</button>
        <input type="number" data-path="stats.${s.key}" value="${esc(sh.stats[s.key])}"><small data-calc="stat:${s.key}"></small></div>`).join('')}</div>
      ${API.derived(system, sh).length ? '<div class="derived" data-calc="derived:0"></div>' : ''}
      <h4>${esc(sys.skillsLabel)}${sys.skillMode === 'prof' ? ' <span class="muted small">☑ = proficiente</span>' : ''}</h4>
      ${skillsHTML}
      <button type="button" class="btn ghost small" data-act="add-skill">+ Adicionar perícia</button>
      <h4>${system === 'cyberpunk' ? 'Armas' : 'Ataques'} <span class="muted small">clique em ⚔ e depois no inimigo</span></h4>
      <div class="attacks">${(sh.attacks || []).map((a, i) => attackRowHTML(system, a, i)).join('') || '<p class="muted small">Nenhum ataque.</p>'}</div>
      <button type="button" class="btn ghost small" data-act="add-attack">+ Adicionar ${system === 'cyberpunk' ? 'arma' : 'ataque'}</button>
      <h4>Habilidades ${S.isGM ? '<span class="muted small">o jogador só usa; quem edita é você</span>' : ''}</h4>
      <div class="abilities">${(sh.abilities || []).map((a, i) => (S.isGM ? abilityEditHTML(a, `abilities.${i}`, 'data-path', i, true) : abilityCardHTML(a, i))).join('')
        || `<p class="muted small">${S.isGM ? 'Nenhuma. Aplique uma classe ou adicione.' : 'Nenhuma ainda. O mestre define as habilidades pela classe.'}</p>`}</div>
      ${S.isGM ? '<button type="button" class="btn ghost small" data-act="add-ability">+ Adicionar habilidade</button>' : ''}
      ${lifeHTML}
      <h4>Equipamento e anotações</h4>
      <textarea data-path="notes" rows="6" placeholder="Inventário, magias, contatos, pistas…">${esc(sh.notes)}</textarea>
    </div>`;
  }

  // Trilha de ferimentos do Cyberpunk 2020: 10 blocos de 4 quadrados (Leve, Grave, Crítico, Mortal 0 a 6).
  const TRACK_LABELS = ['Leve', 'Grave', 'Crítico', 'Mortal 0', 'Mortal 1', 'Mortal 2', 'Mortal 3', 'Mortal 4', 'Mortal 5', 'Mortal 6'];
  function woundTrackHTML(sh) {
    const dmg = API.sheetDamage(sh);
    return TRACK_LABELS.map((label, b) => `<div class="wt-block${dmg > b * 4 ? ' hit' : ''}"><span>${label}</span><div>${[0, 1, 2, 3].map(k => {
      const n = b * 4 + k + 1;
      return `<button type="button" class="wt-box${n <= dmg ? ' on' : ''}" data-act="track" data-n="${n}" title="${n} de dano"></button>`;
    }).join('')}</div><small>Atord = ${b}</small></div>`).join('');
  }

  // Uma linha de ataque da ficha: o "bônus" muda de sentido conforme o sistema.
  function attackRowHTML(system, a, i) {
    const [bonusLabel, bonusTitle] = {
      dnd5e: ['Acerto', 'Bônus somado ao d20 (compara com a CA do alvo)'],
      cyberpunk: a.skill ? ['Precisão', 'Precisão (WA) da arma: soma com REF + perícia'] : ['Base', 'Total somado ao d10 (arma sem perícia escolhida)'],
      coc: ['%', 'Chance da perícia no d100'],
    }[system];
    const p = `attacks.${i}`;
    const skills = system === 'cyberpunk' ? (S.sheetDraft?.skills || []).filter(s => s.stat === 'ref') : [];
    const skillSel = system === 'cyberpunk' ? `<label title="Perícia usada (somada ao REF)">Perícia<select data-path="${p}.skill"><option value="">— nenhuma —</option>${skills.map(s => `<option${s.name === a.skill ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : '';
    return `<div class="attack">
      <input type="text" class="atk-name" data-path="${p}.name" value="${esc(a.name)}" maxlength="40" title="Nome do ataque">
      <select data-path="${p}.type" title="Tipo">${[['melee', 'Corpo a corpo'], ['ranged', 'Distância'], ['spell', system === 'cyberpunk' ? 'Especial' : 'Magia']].map(([v, l]) => `<option value="${v}"${a.type === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${skillSel}
      <label title="${bonusTitle}">${bonusLabel}<input type="number" data-path="${p}.bonus" value="${esc(a.bonus)}"></label>
      <label title="Dados de dano (ex.: 3d6)">Dano<input type="text" data-path="${p}.damage" value="${esc(a.damage)}" maxlength="16"></label>
      <label title="${system === 'cyberpunk' ? 'Alcance em quadrados de 2 m (pistola 25, submetralhadora 75, escopeta 25, fuzil 200)' : 'Alcance em quadrados (corpo a corpo = encostado)'}">Alcance<input type="number" data-path="${p}.range" value="${esc(a.type === 'melee' ? 1 : a.range || 12)}" min="1" max="200"${a.type === 'melee' ? ' disabled' : ''}></label>
      ${system === 'cyberpunk' ? `<span class="atk-total muted small" data-calc="atk:${i}"></span>` : ''}
      <button type="button" class="btn primary small" data-act="attack" data-i="${i}">⚔ Atacar</button>
      <button type="button" class="x" data-act="del-attack" data-i="${i}" title="Remover">×</button>
    </div>`;
  }
  // ---------- habilidades (de classe) ----------
  const ABILITY_TYPES = [['area', 'Área / alvo (dano)'], ['heal', 'Cura'], ['special', 'Efeito narrado'], ['passive', 'Passiva']];
  const FX_OPTIONS = [['magic', 'Magia'], ['blast', 'Explosão'], ['slash', 'Corte'], ['shot', 'Disparo'], ['heal', 'Cura'], ['dust', 'Fumaça']];
  const SAVE_LABELS = {
    dnd5e: { des: 'DES', for: 'FOR', con: 'CON', sab: 'SAB' },
    cyberpunk: { des: 'REF', for: 'TCO', con: 'TCO', sab: 'AuCon' },
    coc: { des: 'DES', for: 'FOR', con: 'CON', sab: 'POD' },
  };

  function abilitySummary(a) {
    const sys = S.state.system;
    const where = a.radius ? `raio ${a.radius}` : a.type === 'heal' ? '1 aliado' : '1 alvo';
    if (a.type === 'area') {
      const save = a.save === 'none' ? 'acerta sempre' : `resiste com ${SAVE_LABELS[sys][a.save] || a.save}${sys !== 'coc' ? ` ${a.dc}` : ''}${a.half ? ' (metade)' : ''}`;
      return `${where} · alcance ${a.range}${a.damage ? ` · dano ${a.damage}` : ''} · ${save}`;
    }
    if (a.type === 'heal') return `cura ${a.amount} · ${where} · alcance ${a.range}`;
    return a.type === 'passive' ? 'passiva' : 'efeito narrado';
  }

  // Cartão da habilidade na ficha do jogador (só usa).
  function abilityCardHTML(a, i) {
    const uses = a.uses ? `<span class="uses${a.left ? '' : ' out'}">${a.left}/${a.uses} usos</span>` : '';
    return `<div class="ability-card">
      <div class="ab-head"><b>${a.type === 'passive' ? '◆' : a.type === 'heal' ? '✚' : '✨'} ${esc(a.name)}</b>${uses}</div>
      <span class="muted small">${esc(abilitySummary(a))}</span>
      ${a.text ? `<p class="small">${esc(a.text)}</p>` : ''}
      ${a.type === 'passive' ? '' : `<button type="button" class="btn primary small" data-act="use-ability" data-i="${i}"${a.uses && !a.left ? ' disabled' : ''}>Usar</button>`}
    </div>`;
  }

  // Editor de habilidade (mestre): na ficha usa data-path, no cadastro de classe usa data-cpath.
  function abilityEditHTML(a, p, attr, i, withUse = false) {
    const sys = S.state.system;
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
    const saves = [...Object.entries(SAVE_LABELS[sys]).filter(([k], j, arr) => arr.findIndex(x => x[1] === SAVE_LABELS[sys][k]) === j), ['none', 'Nenhuma (acerta sempre)']];
    const f = (label, key, val, type = 'text', extra = '') => `<label>${label}<input type="${type}" ${attr}="${p}.${key}" value="${esc(val ?? '')}" ${extra}></label>`;
    const area = a.type === 'area';
    const heal = a.type === 'heal';
    const active = area || heal;
    return `<div class="ability-edit">
      <div class="ab-row">
        <input type="text" class="ab-name" ${attr}="${p}.name" value="${esc(a.name)}" maxlength="40" title="Nome">
        <select ${attr}="${p}.type" title="Tipo">${opt(ABILITY_TYPES, a.type)}</select>
        ${withUse && a.type !== 'passive' ? `<button type="button" class="btn primary small" data-act="use-ability" data-i="${i}" title="Usar agora">✨</button>` : ''}
        <button type="button" class="x" data-act="del-ability" data-i="${i}" title="Remover">×</button>
      </div>
      <div class="ab-grid">
        ${area ? f('Dano', 'damage', a.damage, 'text', 'maxlength="16" placeholder="vazio = sem dano"') : ''}
        ${heal ? f('Cura', 'amount', a.amount, 'text', 'maxlength="16"') : ''}
        ${active ? f('Raio', 'radius', a.radius || 0, 'number', 'min="0" max="10" title="0 = um alvo só"') : ''}
        ${active ? f('Alcance', 'range', a.range, 'number', 'min="1" max="60"') : ''}
        ${area ? `<label>Resistência<select ${attr}="${p}.save">${opt(saves, a.save)}</select></label>` : ''}
        ${area && sys !== 'coc' && a.save !== 'none' ? f(sys === 'dnd5e' ? 'CD' : 'DV', 'dc', a.dc, 'number', 'min="1" max="30"') : ''}
        ${area && a.save !== 'none' ? `<label class="check"><input type="checkbox" ${attr}="${p}.half"${a.half ? ' checked' : ''}> Metade se resistir</label>` : ''}
        ${a.type !== 'passive' ? `<label>Efeito<select ${attr}="${p}.fx">${opt(FX_OPTIONS, a.fx)}</select></label>` : ''}
        ${a.type !== 'passive' ? f('Usos', 'uses', a.uses || 0, 'number', 'min="0" max="20" title="0 = sem limite; volta no descanso"') : ''}
        ${withUse && a.uses ? f('Restam', 'left', a.left ?? a.uses, 'number', `min="0" max="${a.uses}"`) : ''}
      </div>
      <input type="text" class="ab-text" ${attr}="${p}.text" value="${esc(a.text || '')}" maxlength="300" placeholder="Descrição (aparece no chat quando usar)">
    </div>`;
  }

  const blankAbility = () => ({ name: 'Nova habilidade', type: 'area', text: '', damage: '1d6', amount: '1d8', radius: 0, range: 12, save: 'des', dc: 13, half: true, fx: 'magic', uses: 0, left: 0 });

  // Usar habilidade: área e cura pedem o clique no alvo; as outras saem na hora.
  function aimAbility(ownerPid, index) {
    const tok = S.state.tokens.find(t => t.owner === ownerPid);
    if (!tok) { toast('Esse personagem não está no mapa.'); return; }
    const ab = S.state.sheets[ownerPid]?.abilities?.[index];
    if (!ab) return;
    if (ab.type === 'area' || ab.type === 'heal') {
      setTool(`abl:${tok.id}:${index}`);
      toast(ab.type === 'heal' ? 'Clique em você ou no aliado que vai receber a cura.' : 'Clique no alvo (ou no centro da área).');
    } else {
      socket.emit('combat:ability', { actor: tok.id, index });
    }
  }

  // Mira: salva a ficha pendente (o servidor usa os ataques dela) e espera o clique no inimigo.
  function aimAttack(ownerPid, index) {
    const tok = S.state.tokens.find(t => t.owner === ownerPid);
    if (!tok) { toast('Esse personagem não está no mapa.'); return; }
    if (S.sheetDirty && S.sheetDraftPid === ownerPid) { socket.emit('sheet:set', { pid: S.sheetDraftPid, sheet: S.sheetDraft }); S.sheetDirty = false; }
    setTool(`atk:${tok.id}:${index}`);
    toast('Agora clique no inimigo.');
  }

  function refreshCalcs() {
    const sys = S.state.system;
    const sh = S.sheetDraft;
    for (const el of $$('[data-calc]', sheetRoot)) {
      const [kind, key] = el.dataset.calc.split(':');
      if (kind === 'stat') el.textContent = API.statNote(sys, sh.stats[key]);
      if (kind === 'skill' && sh.skills[key]) el.textContent = API.skillNote(sys, sh, sh.skills[key]);
      if (kind === 'derived') el.innerHTML = API.derived(sys, sh).map(([l, v, tip]) => `<span title="${esc(tip || '')}"><b>${esc(l)}</b> ${esc(v)}</span>`).join('');
      if (kind === 'track') el.innerHTML = woundTrackHTML(sh);
      if (kind === 'cyber') {
        const hc = (sh.cyber || []).reduce((a, c) => a + (Number(c.hc) || 0), 0);
        const cost = (sh.cyber || []).reduce((a, c) => a + (Number(c.cost) || 0), 0);
        el.textContent = `Custo em PH: ${hc} · ${cost} ed`;
      }
      if (kind === 'atk' && sh.attacks[key]) {
        const a = sh.attacks[key];
        el.textContent = a.skill ? `= REF ${API.effStat(sys, sh, 'ref')} + ${API.skillLevel(sh, a.skill)} ${a.bonus >= 0 ? '+' : '−'} ${Math.abs(a.bonus || 0)} → ${API.effStat(sys, sh, 'ref') + API.skillLevel(sh, a.skill) + (Number(a.bonus) || 0)} + 1d10` : '';
      }
      if (kind === 'bar') {
        const r = sh.res[key];
        const pct = r?.max > 0 ? clamp(r.cur / r.max, 0, 1) : 0;
        el.style.width = `${pct * 100}%`;
        el.style.background = pct > 0.5 ? S.colors.ok : pct > 0.25 ? S.colors.warn : S.colors.danger;
      }
    }
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys.at(-1)] = value;
  }

  const flushSheet = debounce(() => {
    socket.emit('sheet:set', { pid: S.sheetDraftPid, sheet: S.sheetDraft });
    S.sheetDirty = false;
  }, 400);
  function queueSheetSave() { S.sheetDirty = true; flushSheet(); }

  sheetRoot.addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset.path || !S.sheetDraft) return;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) || 0 : el.value;
    setPath(S.sheetDraft, el.dataset.path, v);
    refreshCalcs();
    queueSheetSave();
    if (/^attacks\.\d+\.type$/.test(el.dataset.path)) renderSheetFromDraft(); // corpo a corpo trava o alcance
    if (/^abilities\.\d+\.(type|save|uses)$/.test(el.dataset.path)) renderSheetFromDraft(); // campos mudam com o tipo
    if (/^attacks\.\d+\.skill$/.test(el.dataset.path)) renderSheetFromDraft(); // "Base" vira "Precisão"
    // Cyberpunk 2020: Humanidade = EMP × 10 − PH dos implantes
    if (S.sheetDraft.cyber && (/^cyber\.\d+\.hc$/.test(el.dataset.path) || el.dataset.path === 'stats.emp')) recalcHumanity();
  });

  function recalcHumanity() {
    const sh = S.sheetDraft;
    if (!sh.res?.hum) return;
    const max = (Number(sh.stats.emp) || 0) * 10;
    const hc = (sh.cyber || []).reduce((a, c) => a + (Number(c.hc) || 0), 0);
    sh.res.hum = { cur: max - hc, max };
    for (const k of ['cur', 'max']) { const inp = $(`[data-path="res.hum.${k}"]`, sheetRoot); if (inp) inp.value = sh.res.hum[k]; }
    refreshCalcs();
    queueSheetSave();
  }

  sheetRoot.addEventListener('change', e => {
    if (e.target.dataset.ui === 'only-trained') {
      S.onlyTrained = e.target.checked;
      $('.skills', sheetRoot)?.classList.toggle('only-trained', S.onlyTrained);
    }
  });
  sheetRoot.addEventListener('toggle', e => { if (e.target.matches?.('details.lifepath')) S.lifeOpen = e.target.open; }, true);

  sheetRoot.addEventListener('change', e => {
    if (e.target.id === 'sheet-pick') { S.sheetTarget = e.target.value; renderSheet(true); }
  });

  sheetRoot.addEventListener('click', e => {
    const b = e.target.closest('[data-roll], [data-act], [data-seg]');
    if (!b || !S.sheetDraft) return;
    if (b.dataset.seg) {
      if (b.dataset.seg === 'rollMode') S.rollMode = b.dataset.v;
      else S.cocBP = Number(b.dataset.v);
      $$(`[data-seg="${b.dataset.seg}"]`, sheetRoot).forEach(x => x.classList.toggle('on', x === b));
      return;
    }
    if (b.dataset.act === 'portrait') {
      const tok = S.state.tokens.find(t => t.owner === S.sheetDraftPid);
      if (tok) openPicker(tok.img, img => socket.emit('token:image', { id: tok.id, img }));
      return;
    }
    if (b.dataset.act === 'attack') { aimAttack(S.sheetDraftPid, Number(b.dataset.i)); return; }
    if (b.dataset.act === 'apply-class') {
      const cls = (S.state.classes || []).find(c => c.id === $('#class-pick', sheetRoot)?.value);
      if (!cls) { toast('Escolha uma opção da lista.'); return; }
      if (!confirm(`Aplicar "${cls.name}"? Isso troca PV, atributos, ataques e habilidades desta ficha.`)) return;
      if (S.sheetDirty) { socket.emit('sheet:set', { pid: S.sheetDraftPid, sheet: S.sheetDraft }); S.sheetDirty = false; }
      socket.emit('class:apply', { pid: S.sheetDraftPid, classId: cls.id });
      return;
    }
    if (b.dataset.act === 'use-ability') {
      if (S.sheetDirty) { socket.emit('sheet:set', { pid: S.sheetDraftPid, sheet: S.sheetDraft }); S.sheetDirty = false; }
      aimAbility(S.sheetDraftPid, Number(b.dataset.i));
      return;
    }
    if (b.dataset.act === 'track') {
      // Clique num quadrado da trilha de ferimentos: marca o dano até ali (clicar no último marcado desmarca um)
      const n = Number(b.dataset.n);
      const hp = S.sheetDraft.res.hp;
      const dmg = API.sheetDamage(S.sheetDraft) === n ? n - 1 : n;
      hp.cur = hp.max - dmg;
      const inp = $('[data-path="res.hp.cur"]', sheetRoot); if (inp) inp.value = hp.cur;
      refreshCalcs();
      queueSheetSave();
      return;
    }
    if (b.dataset.act === 'add-cyber') {
      (S.sheetDraft.cyber ||= []).push({ name: '', hc: 0, cost: 0 });
      queueSheetSave();
      renderSheetFromDraft();
      return;
    }
    if (b.dataset.act === 'del-cyber') {
      S.sheetDraft.cyber.splice(Number(b.dataset.i), 1);
      renderSheetFromDraft();
      recalcHumanity();
      return;
    }
    if (b.dataset.act === 'add-ability') {
      (S.sheetDraft.abilities ||= []).push(blankAbility());
      queueSheetSave();
      renderSheetFromDraft();
      return;
    }
    if (b.dataset.act === 'del-ability') {
      S.sheetDraft.abilities.splice(Number(b.dataset.i), 1);
      queueSheetSave();
      renderSheetFromDraft();
      return;
    }
    if (b.dataset.act === 'add-attack') {
      (S.sheetDraft.attacks ||= []).push({ name: 'Novo ataque', type: 'melee', bonus: 0, damage: '1d6', range: 1 });
      queueSheetSave();
      renderSheetFromDraft();
      return;
    }
    if (b.dataset.act === 'del-attack') {
      S.sheetDraft.attacks.splice(Number(b.dataset.i), 1);
      queueSheetSave();
      renderSheetFromDraft();
      return;
    }
    if (b.dataset.act === 'add-skill') {
      const sys = API.SYSTEMS[S.state.system];
      S.sheetDraft.skills.push({ name: 'Nova perícia', stat: sys.stats[0].key, value: 0, prof: false });
      queueSheetSave();
      renderSheetFromDraft();
      return;
    }
    if (b.dataset.act === 'del-skill') {
      S.sheetDraft.skills.splice(Number(b.dataset.i), 1);
      queueSheetSave();
      renderSheetFromDraft();
      return;
    }
    sheetRoll(b.dataset.roll, b);
  });

  function renderSheetFromDraft() {
    S.state.sheets[S.sheetDraftPid] = S.sheetDraft;
    renderSheet(true);
  }

  function sheetRoll(kind, b) {
    const system = S.state.system;
    const sys = API.SYSTEMS[system];
    const sh = S.sheetDraft;
    if (kind === 'init') {
      socket.emit('init:roll', { req: API.initiativeRoll(system, sh), pid: S.sheetDraftPid });
      return;
    }
    let req;
    let label;
    if (kind === 'stat') {
      req = API.statRoll(system, sh, b.dataset.key);
      label = sys.stats.find(s => s.key === b.dataset.key)?.label;
    } else if (kind === 'skill') {
      const sk = sh.skills[Number(b.dataset.i)];
      req = API.skillRoll(system, sh, sk);
      label = sk.name;
    } else if (kind === 'res') {
      req = { kind: 'd100', skill: sh.res[b.dataset.key]?.cur || 0 };
      label = `Teste de ${sys.resources.find(r => r.key === b.dataset.key)?.label}`;
    } else return;
    if (req.kind === 'd20') req.mode = S.rollMode;
    if (req.kind === 'd100') req.bp = S.cocBP;
    if (S.isGM) label = `${sh.info.name || '???'}: ${label}`;
    socket.emit('roll', { req, label, secret: S.secret });
  }

  // ---------- iniciativa ----------
  // Painel "Sua vez!" do jogador: seus ataques + encerrar turno.
  function renderMyTurn() {
    if (S.isGM) return;
    const init = S.state.init;
    const cur = init.list.find(e => e.id === init.turnId);
    const mine = !!S.state.combat && cur?.pid === pid;
    $('#my-turn').hidden = !mine;
    if (mine && S.myTurnId !== init.turnId) {
      toast('⚔ Sua vez! Escolha um ataque e clique no inimigo.');
      $('#tabs [data-tab=init]').click();
    }
    S.myTurnId = mine ? init.turnId : null;
    if (!mine) return;
    const attacks = S.state.sheets[pid]?.attacks || [];
    setHTML($('#my-attacks'), attacks.map((a, i) => `<button type="button" class="sb-btn" data-my-atk="${i}"><b>⚔ ${esc(a.name)}</b><span>${esc(attackLabel(a))}</span></button>`).join('')
      || '<p class="muted small">Sua ficha não tem ataques. Adicione na aba Ficha.</p>');
  }
  $('#my-attacks').addEventListener('click', e => {
    const b = e.target.closest('[data-my-atk]');
    if (b) aimAttack(pid, Number(b.dataset.myAtk));
  });
  $('#end-turn').addEventListener('click', () => { setTool('move'); socket.emit('turn:end'); });
  socket.on('combat:denied', msg => toast(msg));

  function renderInit() {
    renderMyTurn();
    const init = S.state.init;
    $('#init-round').textContent = `Rodada ${init.round}`;
    setHTML($('#init-list'), init.list.length
      ? init.list.map(e => `<li class="${e.id === init.turnId ? 'turn' : ''}${e.hidden ? ' hid' : ''}">
          <span class="iv">${e.value}</span>
          <span class="in">${esc(e.name)}${e.pid === pid ? ' <em>(você)</em>' : ''}${e.hidden && S.isGM ? ' <em>(oculto)</em>' : ''}</span>
          ${S.isGM ? `<button class="mini" data-init-hide="${e.id}" title="Mostrar/ocultar dos jogadores">${e.hidden ? '🙈' : '👁'}</button><button class="mini" data-init-del="${e.id}" title="Remover">×</button>` : ''}
        </li>`).join('')
      : '<li class="empty">Ninguém na ordem ainda.</li>');
  }

  $('#init-list').addEventListener('click', e => {
    const hide = e.target.closest('[data-init-hide]');
    const del = e.target.closest('[data-init-del]');
    if (hide) {
      const entry = S.state.init.list.find(x => x.id === hide.dataset.initHide);
      socket.emit('init:update', { id: entry.id, hidden: !entry.hidden });
    }
    if (del) socket.emit('init:remove', { id: del.dataset.initDel });
  });
  // ---------- combate ----------
  function renderCombat() {
    const on = !!S.state.combat;
    $('#combat-badge').hidden = !on;
    if (on) $('#combat-badge').textContent = `⚔ Em combate · Rodada ${S.state.init.round}`;
    $('#stage').classList.toggle('in-combat', on);
    $('#demo-badge').hidden = !S.state.demo;
    if (S.isGM) {
      $('#demo-toggle').textContent = S.state.demo ? '⏹ Parar demonstração' : '▶ Iniciar demonstração';
      $('#demo-toggle').classList.toggle('danger', !!S.state.demo);
    }
    if (S.isGM) {
      $('#combat-end').hidden = !on;
      $('#auto-combat').checked = !!S.state.settings?.autoCombat;
    }
  }

  function showBanner(title, subtitle, kind = '') {
    const b = $('#combat-banner');
    b.className = 'combat-banner';
    void b.offsetWidth; // reinicia a animação
    b.querySelector('strong').textContent = title;
    b.querySelector('span').textContent = subtitle;
    b.classList.add('show');
    if (kind) b.classList.add(kind);
  }

  $('#auto-combat').addEventListener('change', e => socket.emit('settings:set', { autoCombat: e.target.checked }));
  $('#combat-end').addEventListener('click', () => socket.emit('combat:end'));

  $('#init-next').addEventListener('click', () => socket.emit('init:step', { dir: 1 }));
  $('#init-prev').addEventListener('click', () => socket.emit('init:step', { dir: -1 }));
  $('#init-clear').addEventListener('click', () => { if (confirm('Limpar toda a ordem de iniciativa?')) socket.emit('init:clear'); });
  $('#init-mine').addEventListener('click', () => {
    const sh = S.state?.sheets[pid];
    if (sh) socket.emit('init:roll', { req: API.initiativeRoll(S.state.system, sh) });
  });
  $('#init-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    socket.emit('init:add', { name: f.name.value, value: Number(f.value.value), hidden: f.hidden.checked, tokenId: S.selected });
    f.value.value = '';
    f.value.focus();
  });

  // ---------- painel do mestre ----------
  function renderGmPanel() {
    const m = S.state.map;
    const setIfIdle = (sel, prop, val) => { const el = $(sel); if (document.activeElement !== el) el[prop] = val; };
    setIfIdle('#map-grid', 'value', m.grid);
    setIfIdle('#map-cols', 'value', m.cols);
    setIfIdle('#map-rows', 'value', m.rows);
    $('#map-cols').disabled = $('#map-rows').disabled = m.hasImage;
    $('#fog-on').checked = m.fogEnabled;
    $('#collision-on').checked = S.state.settings?.collision !== false;
    $('#bots-auto').checked = !!S.state.settings?.botsAuto;
    $('#monsters-auto').checked = !!S.state.settings?.monstersAuto;
    $('#map-clear').disabled = !m.hasImage;
    setIfIdle('#gm-notes', 'value', S.state.notes || '');
    renderClassCard();
    renderEncounterCard();
    renderStory();
    syncGenPlace();
  }

  $('#map-grid').addEventListener('change', e => {
    if (S.state.map.hasImage && S.state.revealed.length && !confirm('Mudar o quadrado apaga a névoa revelada. Continuar?')) { renderGmPanel(); return; }
    socket.emit('map:settings', { grid: Number(e.target.value) });
  });
  $('#map-cols').addEventListener('change', e => socket.emit('map:settings', { cols: Number(e.target.value) }));
  $('#map-rows').addEventListener('change', e => socket.emit('map:settings', { rows: Number(e.target.value) }));
  $('#fog-on').addEventListener('change', e => socket.emit('map:settings', { fogEnabled: e.target.checked }));
  $('#fog-reveal-all').addEventListener('click', () => socket.emit('fog:all', { reveal: true }));
  $('#fog-hide-all').addEventListener('click', () => socket.emit('fog:all', { reveal: false }));
  $('#map-clear').addEventListener('click', () => { if (confirm('Remover a imagem do mapa?')) socket.emit('map:image', { image: null }); });
  $('#gm-notes').addEventListener('input', debounce(e => socket.emit('notes:set', { text: e.target.value }), 600));

  $('#map-file').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Reduz mapas gigantes para no máximo 4096 px no maior lado.
        const k = Math.min(1, 4096 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.88);
        if (data.length > 11e6) return toast('Imagem grande demais, tente uma menor.');
        toast('Enviando mapa…');
        socket.emit('map:image', { image: data, w: c.width, h: c.height });
      };
      img.onerror = () => toast('Não consegui ler essa imagem.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // ---------- gerador de mapas ----------
  const GEN = window.MAPGEN;
  const GEN_EXAMPLES = {
    dnd5e: ['cripta amaldiçoada à noite', 'vulcão com rios de lava', 'masmorra de gelo', 'vila na floresta de outono', 'templo no deserto com tesouro', 'taverna em noite de chuva', 'pântano com neblina', 'prisão do rei em ruínas'],
    cyberpunk: ['cidade neon na chuva', 'bunker militar abandonado', 'laboratório secreto', 'esgoto sob a cidade', 'distrito em ruínas à noite', 'bar de gangue'],
    coc: ['mansão assombrada à noite', 'cemitério com neblina', 'manicômio abandonado com sangue', 'ritual de culto na floresta', 'biblioteca proibida', 'cidade dos anos 20 na chuva', 'caverna com lago subterrâneo'],
  };
  let genSeed = rid();
  let genSpec = null;

  function setupGen(system) {
    const types = [...GEN.TYPES].sort((a, b) => b.sys.includes(system) - a.sys.includes(system));
    $('#gen-type').innerHTML = types.map(t => `<option value="${t.key}">${esc(t.name)}</option>`).join('');
    $('#gen-examples').innerHTML = GEN_EXAMPLES[system].map(e => `<button type="button" data-example="${esc(e)}">${esc(e)}</button>`).join('');
    applyGenSpec(GEN.interpret('', system));
    $('#gen-understood').textContent = 'Digite um tema ou clique num exemplo.';
  }

  function applyGenSpec(spec) {
    genSpec = spec;
    $('#gen-type').value = spec.type;
    $('#gen-size').value = spec.size;
    showGenLabel();
  }

  // Mostra como o texto foi entendido (o tipo acompanha o ajuste manual).
  function showGenLabel() {
    const typeName = GEN.TYPES.find(t => t.key === $('#gen-type').value).name;
    const label = [typeName, ...genSpec.label.split(' · ').slice(1)].join(' · ');
    $('#gen-understood').innerHTML = `Entendi: <b>${esc(label)}</b>`;
  }

  const currentGenSpec = () => ({ ...genSpec, type: $('#gen-type').value, size: $('#gen-size').value });

  $('#gen-form').addEventListener('submit', e => {
    e.preventDefault();
    applyGenSpec(GEN.interpret($('#gen-text').value.trim(), S.state?.system || document.body.dataset.system));
    genSeed = rid();
    renderGenPreview();
  });
  $('#gen-examples').addEventListener('click', e => {
    const b = e.target.closest('[data-example]');
    if (!b) return;
    $('#gen-text').value = b.dataset.example;
    $('#gen-form').requestSubmit();
  });

  // A pré-visualização usa quadrados pequenos; a mesma semente gera o mesmo mapa no tamanho real.
  function renderGenPreview() {
    const system = S.state?.system || document.body.dataset.system;
    const res = GEN.generate({ spec: currentGenSpec(), cell: 16, seed: genSeed, system });
    const cv = $('#gen-preview');
    cv.width = res.canvas.width;
    cv.height = res.canvas.height;
    const g = cv.getContext('2d');
    g.drawImage(res.canvas, 0, 0);
    g.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    g.beginPath();
    for (let x = 0; x <= res.cols; x++) { g.moveTo(x * 16, 0); g.lineTo(x * 16, cv.height); }
    for (let y = 0; y <= res.rows; y++) { g.moveTo(0, y * 16); g.lineTo(cv.width, y * 16); }
    g.stroke();
    // Marcadores dos objetos interativos (a imagem não traz portas, baús etc.)
    const COLORS = { door: '#b07a44', chest: '#f4c542', trap: '#ff4d4d', torch: '#ff9a3a', lever: '#c0c4cc', secret: '#b478ff', crack: '#e0d6c8' };
    for (const o of res.objects) {
      g.fillStyle = COLORS[o.type];
      if (o.edge) g.fillRect(o.v ? o.x * 16 - 2 : o.x * 16 + 3, o.v ? o.y * 16 + 3 : o.y * 16 - 2, o.v ? 4 : 10, o.v ? 10 : 4);
      else g.fillRect(o.x * 16 + 5, o.y * 16 + 5, 6, 6);
    }
  }

  $('#gen-type').addEventListener('change', () => { showGenLabel(); renderGenPreview(); });
  $('#gen-size').addEventListener('change', renderGenPreview);
  $('#gen-roll').addEventListener('click', () => { genSeed = rid(); renderGenPreview(); });

  function syncGenPlace() {
    const sel = $('#gen-place');
    const canJoin = !!S.state?.map.hasImage;
    for (const o of sel.options) if (o.value !== 'replace') o.disabled = !canJoin;
    if (!canJoin) sel.value = 'replace';
    const join = sel.value !== 'replace';
    $('#gen-use').textContent = join ? 'Juntar ao mapa' : 'Usar este mapa';
    $('#gen-explore-row').hidden = join;
    $('#gen-join-hint').hidden = !join;
  }
  $('#gen-place').addEventListener('change', syncGenPlace);

  // Junta a área gerada ao lado do mapa atual e abre uma passagem (com porta) entre as duas.
  function joinMap(piece, dir) {
    const st = S.state;
    const m = st.map;
    const g = m.grid;
    const oc = m.cols; const orw = m.rows; const pc = piece.cols; const pr = piece.rows;
    const horiz = dir === 'e' || dir === 'w';
    const cols = horiz ? oc + pc : Math.max(oc, pc);
    const rows = horiz ? Math.max(orw, pr) : orw + pr;
    if (cols > 200 || rows > 200 || cols * g > 8192 || rows * g > 8192) {
      return { error: 'O mapa ficaria grande demais. Use o tamanho Pequeno ou continue para o outro lado.' };
    }
    const mid = (total, n) => Math.floor((total - n) / 2);
    const O = { x: dir === 'w' ? pc : horiz ? 0 : mid(cols, oc), y: dir === 'n' ? pr : horiz ? mid(rows, orw) : 0 };
    const P = { x: dir === 'e' ? oc : horiz ? 0 : mid(cols, pc), y: dir === 's' ? orw : horiz ? mid(rows, pr) : 0 };

    // Grade de paredes: o que não é de nenhuma das duas áreas vira rocha.
    const M = new Array(cols * rows).fill('1');
    const oldCells = st.walls?.cells;
    for (let r = 0; r < orw; r++) for (let c = 0; c < oc; c++) M[(r + O.y) * cols + c + O.x] = oldCells ? oldCells[r * oc + c] : '0';
    const pCells = piece.walls?.cells;
    for (let r = 0; r < pr; r++) for (let c = 0; c < pc; c++) M[(r + P.y) * cols + c + P.x] = pCells ? pCells[r * pc + c] : '0';
    const shiftSeg = (s, o) => [s[0] + o.x, s[1] + o.y, s[2] + o.x, s[3] + o.y];
    let segments = [...(st.walls?.segments || []).map(s => shiftSeg(s, O)), ...(piece.walls?.segments || []).map(s => shiftSeg(s, P))];

    // Coordenadas ao longo da junção: u atravessa a emenda, v corre ao longo dela.
    const idx = (u, v) => (horiz ? v * cols + u : u * cols + v);
    const box = (o, w, h) => (horiz ? { u0: o.x, u1: o.x + w - 1, v0: o.y, v1: o.y + h - 1 } : { u0: o.y, u1: o.y + h - 1, v0: o.x, v1: o.x + w - 1 });
    const oldBox = box(O, oc, orw);
    const newBox = box(P, pc, pr);
    const [A, B] = dir === 'e' || dir === 's' ? [oldBox, newBox] : [newBox, oldBox];
    const v0 = Math.max(A.v0, B.v0); const v1 = Math.min(A.v1, B.v1);
    const vMid = (v0 + v1) / 2;
    let best = null;
    for (let v = v0; v <= v1; v++) {
      let a = 0; while (A.u1 - a >= A.u0 && M[idx(A.u1 - a, v)] !== '0' && a <= 10) a++;
      let b = 0; while (B.u0 + b <= B.u1 && M[idx(B.u0 + b, v)] !== '0' && b <= 10) b++;
      if (A.u1 - a < A.u0 || B.u0 + b > B.u1 || a > 10 || b > 10) continue; // essa linha não chega num chão
      const cost = a + b + Math.abs(v - vMid) * 0.02;
      if (!best || cost < best.cost) best = { v, a, b, cost };
    }
    if (!best) return { error: 'Não achei onde ligar as duas áreas. Clique em "Gerar outro" e tente de novo.' };
    const { v, a, b } = best;
    const carved = [];
    for (let u = A.u1 - a + 1; u <= B.u0 + b - 1; u++) {
      M[idx(u, v)] = '0';
      carved.push({ u, src: u <= A.u1 ? A.u1 - a : B.u0 + b }); // de onde copiar o piso
    }
    // Paredes finas que atravessam a passagem são cortadas no ponto.
    for (let k = A.u1 - a + 1; k <= B.u0 + b; k++) {
      segments = segments.flatMap(s => {
        const along = horiz ? s[0] === k && s[2] === k : s[1] === k && s[3] === k;
        if (!along) return [s];
        const lo = Math.min(horiz ? s[1] : s[0], horiz ? s[3] : s[2]);
        const hi = Math.max(horiz ? s[1] : s[0], horiz ? s[3] : s[2]);
        if (lo > v || hi < v + 1) return [s];
        const mk = (p, q) => (horiz ? [k, p, k, q] : [p, k, q, k]);
        return [lo < v ? mk(lo, v) : null, hi > v + 1 ? mk(v + 1, hi) : null].filter(Boolean);
      });
    }

    // Imagem: as duas áreas no lugar, rocha escura em volta e piso copiado na passagem.
    const cv = document.createElement('canvas');
    cv.width = cols * g;
    cv.height = rows * g;
    const ctx2 = cv.getContext('2d');
    ctx2.fillStyle = '#16130f';
    ctx2.fillRect(0, 0, cv.width, cv.height);
    ctx2.drawImage(S.mapImg, O.x * g, O.y * g, m.imageW, m.imageH);
    ctx2.drawImage(piece.canvas, P.x * g, P.y * g);
    const xy = (u, vv) => (horiz ? [u, vv] : [vv, u]);
    for (const { u, src } of carved) {
      const [sx, sy] = xy(src, v); const [tx, ty] = xy(u, v);
      ctx2.drawImage(cv, sx * g, sy * g, g, g, tx * g, ty * g, g, g);
    }

    // Objetos da área nova (no lugar certo) e uma porta na passagem.
    const objects = piece.objects.map(o => ({ ...o, x: o.x + P.x, y: o.y + P.y }));
    const doorU = b > 0 ? B.u0 : a > 0 ? A.u1 : null;
    if (doorU != null) { const [x, y] = xy(doorU, v); objects.push({ type: 'door', x, y, dir: horiz ? 'v' : 'h' }); }

    let q = 0.88; let image = cv.toDataURL('image/jpeg', q);
    while (image.length > 10.5 * 1024 * 1024 && q > 0.4) { q -= 0.12; image = cv.toDataURL('image/jpeg', q); }
    return { image, w: cv.width, h: cv.height, walls: { cells: M.join(''), segments: segments.slice(0, 1000) }, objects, shift: O, region: { x: P.x, y: P.y, w: pc, h: pr } };
  }

  // Coloca um mapa gerado na mesa: substitui o atual ou continua ao lado dele. Devolve false se não deu.
  function applyGeneratedMap(spec, seed, place, explore, ask = true) {
    if (place !== 'replace' && S.state.map.hasImage) {
      if (!S.mapImg) { toast('Espere o mapa atual terminar de carregar.'); return false; }
      const piece = GEN.generate({ spec, cell: S.state.map.grid, seed, system: S.state.system });
      const out = joinMap(piece, place);
      if (out.error) { toast(out.error); return false; }
      socket.emit('map:extend', out);
      return { region: out.region }; // a área nova (para os inimigos da cena ficarem nela)
    }
    if (ask && S.state.map.hasImage && !confirm('Trocar o mapa atual pelo gerado? A névoa revelada será apagada.')) return false;
    const res = GEN.generate({ spec, cell: S.state.map.grid, seed, system: S.state.system });
    const image = res.canvas.toDataURL('image/jpeg', 0.88);
    socket.emit('map:image', { image, w: res.canvas.width, h: res.canvas.height, walls: res.walls, objects: res.objects });
    if (explore) {
      socket.emit('map:settings', { fogEnabled: true });
      socket.emit('fog:all', { reveal: false });
      socket.emit('fog:paint', { cells: res.reveal, reveal: true });
      S.state.tokens.filter(t => t.owner).forEach((t, i) => {
        const c = res.spawn[i % Math.max(1, res.spawn.length)];
        if (c) socket.emit('token:move', { id: t.id, x: c[0], y: c[1] });
      });
    }
    S.camTouched = false;
    return true;
  }

  $('#gen-use').addEventListener('click', () => {
    const place = $('#gen-place').value;
    if (applyGeneratedMap(currentGenSpec(), genSeed, place, $('#gen-explore').checked)) toast(place !== 'replace' && S.state.map.hasImage ? 'Área nova ligada ao mapa!' : 'Mapa novo na mesa!');
  });
  // O mestre recorta a imagem com a névoa e manda só a parte revelada para os jogadores.
  let playerImgTimer;
  function maybeSendPlayerImage() {
    const m = S.state?.map;
    if (!S.isGM || !m?.hasImage || !S.mapImg || m.fogVersion === S.fogSent) return;
    clearTimeout(playerImgTimer);
    playerImgTimer = setTimeout(() => {
      const map = S.state.map;
      if (!map.hasImage || !S.mapImg) return;
      const c = document.createElement('canvas');
      c.width = map.imageW;
      c.height = map.imageH;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      if (!map.fogEnabled) {
        g.drawImage(S.mapImg, 0, 0, c.width, c.height);
      } else {
        for (const key of S.revealed) {
          const [cx, cy] = key.split(',').map(Number);
          const x = cx * map.grid;
          const y = cy * map.grid;
          const w = Math.min(map.grid, c.width - x);
          const h = Math.min(map.grid, c.height - y);
          if (w > 0 && h > 0) g.drawImage(S.mapImg, x, y, w, h, x, y, w, h);
        }
      }
      S.fogSent = map.fogVersion;
      socket.emit('map:playerImage', { image: c.toDataURL('image/jpeg', 0.82), version: map.fogVersion });
    }, 350);
  }

  $('#token-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const c = viewCenterCell(Number(f.size.value) || 1);
    socket.emit('token:add', { name: f.name.value, maxHp: Number(f.maxHp.value), color: f.color.value, size: Number(f.size.value), hidden: f.hidden.checked, img: S.newTokenImg, vision: Number(f.vision.value), x: c.x, y: c.y });
  });

  function setNewTokenImg(img) {
    S.newTokenImg = img;
    const btn = $('#token-form-img');
    const url = imgUrl(img);
    btn.style.backgroundImage = url ? `url("${url}")` : '';
    btn.textContent = url ? '' : '+';
  }
  $('#token-form-img').addEventListener('click', () => openPicker(S.newTokenImg, img => {
    // Se o nome ainda é o do retrato anterior, acompanha o novo (ex.: Goblin → Orc).
    const nameInput = $('#token-form [name=name]');
    const prevName = S.newTokenImg?.startsWith('lib:') && ART.byKey[S.newTokenImg.slice(4)]?.name;
    const nextName = img?.startsWith('lib:') && ART.byKey[img.slice(4)]?.name;
    if (nextName && (!nameInput.value || nameInput.value === prevName)) nameInput.value = nextName;
    setNewTokenImg(img);
    fillFromBestiary(img);
  }));

  // PV e visão sugeridos pela ficha do bestiário do retrato escolhido.
  function fillFromBestiary(img) {
    const entry = img?.startsWith('lib:') && window.BESTIARY_API.BESTIARY[img.slice(4)];
    if (!entry) return;
    const f = $('#token-form');
    f.maxHp.value = entry.hp;
    f.vision.value = entry.vision;
  }

  function renderTokenEditor() {
    const box = $('#token-editor');
    if (isEditing(box)) return;
    const t = S.selected && S.state.tokens.find(x => x.id === S.selected);
    if (!t) {
      setHTML(box, '<h3>Token selecionado</h3><p class="muted small">Clique num token no mapa para editar. <kbd>Delete</kbd> remove o selecionado.</p>');
      return;
    }
    const linked = !!t.owner;
    const players = S.state.players.filter(p => !p.isGM);
    setHTML(box, `<h3>Token: ${esc(t.name)}</h3>
      <div class="portrait-row" style="margin-bottom:12px">
        ${portraitHTML(t.img, t.name, t.color, 'big', 'type="button" data-tk-act="img" title="Trocar imagem"')}
        <div class="muted small">Clique na imagem para trocar. Todos veem na hora.</div>
      </div>
      <div class="grid2">
        <label>Nome<input data-tk="name" value="${esc(t.name)}" maxlength="40"${linked ? ' disabled' : ''}></label>
        <label>Cor<input type="color" data-tk="color" value="${esc(t.color)}"></label>
        <label>PV atual<input type="number" data-tk="hp" value="${t.hp ?? 0}"${linked ? ' disabled' : ''}></label>
        <label>PV máx.<input type="number" data-tk="maxHp" value="${t.maxHp ?? 0}"${linked ? ' disabled' : ''}></label>
        <label>Tamanho<select data-tk="size">${[1, 2, 3, 4].map(n => `<option value="${n}"${t.size === n ? ' selected' : ''}>${n}×${n}</option>`).join('')}</select></label>
        <label>Controlado por<select data-tk="owner"><option value="">Mestre</option>${players.map(p => `<option value="${esc(p.id)}"${t.owner === p.id ? ' selected' : ''}>${esc(p.charName)}</option>`).join('')}</select></label>
        <label class="check span2"><input type="checkbox" data-tk="hidden"${t.hidden ? ' checked' : ''}> Oculto dos jogadores</label>
        ${statBlockHTML(t)}
        ${linked ? '' : (() => {
          const sys = S.state.system;
          const initLabel = { dnd5e: 'Iniciativa (bônus)', cyberpunk: 'Iniciativa (REF)', coc: 'Iniciativa (DES)' }[sys];
          const initDef = { dnd5e: 0, cyberpunk: 5, coc: 50 }[sys];
          return `<label>Visão (quadrados)<input type="number" data-tk="vision" min="0" max="40" value="${t.vision ?? 6}" title="0 = não detecta ninguém"></label>
          <label>${initLabel}<input type="number" data-tk="initMod" value="${t.initMod ?? initDef}"></label>`;
        })()}
      </div>
      ${linked ? '<p class="muted small">Nome e PV vêm da ficha do jogador.</p>' : `
      <div class="row" style="margin-top:10px">
        <input type="number" id="tk-delta" value="5" min="0" style="width:70px">
        <button class="btn ghost small" data-tk-act="dmg">− Dano</button>
        <button class="btn ghost small" data-tk-act="heal">+ Cura</button>
      </div>`}
      <div class="row" style="margin-top:10px"><button class="btn danger small" data-tk-act="del">Remover token</button></div>`);
  }

  $('#token-editor').addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset.tk || !S.selected) return;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.dataset.tk === 'size' ? Number(el.value) : el.value;
    socket.emit('token:update', { id: S.selected, patch: { [el.dataset.tk]: v } });
  });
  $('#token-editor').addEventListener('click', e => {
    const b = e.target.closest('[data-tk-act]');
    if (!b || !S.selected) return;
    const t = S.state.tokens.find(x => x.id === S.selected);
    if (!t) return;
    const delta = Number($('#tk-delta')?.value) || 0;
    if (b.dataset.tkAct === 'img') openPicker(t.img, img => socket.emit('token:update', { id: t.id, patch: { img } }));
    if (b.dataset.tkAct === 'del') removeSelected();
    if (b.dataset.tkAct === 'dmg') socket.emit('token:update', { id: t.id, patch: { hp: (t.hp || 0) - delta } });
    if (b.dataset.tkAct === 'heal') socket.emit('token:update', { id: t.id, patch: { hp: Math.min(t.maxHp || Infinity, (t.hp || 0) + delta) } });
  });

  // ---------- ficha de combate (bestiário) ----------
  const BEST = window.BESTIARY_API;
  // Habilidades de um token: jogador → as da ficha (classe); monstro → as do bestiário.
  const abilitiesOfToken = t => (!t ? [] : t.owner ? S.state.sheets[t.owner]?.abilities || [] : t.stats?.abilities || []);
  function attackLabel(a) {
    const sys = S.state.system;
    const hit = sys === 'dnd5e' ? `${a.bonus >= 0 ? '+' : ''}${a.bonus} p/ acertar` : sys === 'cyberpunk' ? `base ${a.bonus} + d10` : `${a.bonus}%`;
    return `${hit} · dano ${a.damage}${a.type !== 'melee' ? ` · alcance ${a.range || 12}` : a.reach > 1 ? ` · alcance ${a.reach}` : ''}`;
  }

  function statBlockHTML(t) {
    const sys = S.state.system;
    if (t.owner) {
      // Jogador de teste: o mestre ataca com a arma dele
      const w = S.state.players.find(p => p.id === t.owner)?.weapon;
      if (!w) return '';
      return `<div class="span2 statblock"><h5>Arma do jogador de teste</h5>
        <button type="button" class="sb-btn" data-atk="0"><b>⚔ ${esc(w.name)}</b><span>${esc(attackLabel(w))}</span></button></div>`;
    }
    const s = t.stats;
    const entries = Object.entries(BEST.BESTIARY).sort((a, b) => (b[1].sys === sys) - (a[1].sys === sys));
    const picker = `<label>Ficha do bestiário<select data-statskey>
      ${s ? '' : '<option value="">— escolher —</option>'}
      ${entries.map(([k, e]) => `<option value="${k}"${s?.key === k ? ' selected' : ''}>${esc(e.name)}${e.sys !== sys ? ` (${API.SYSTEMS[e.sys].name})` : ''}</option>`).join('')}
      <option value="__generic"${s && !s.key ? ' selected' : ''}>Criatura genérica</option></select></label>`;
    if (!s) return `<div class="span2 statblock">${picker}</div>`;
    const def = sys === 'dnd5e' ? `CA ${s.def} · ` : sys === 'cyberpunk' ? `PB ${s.def} · MTC −${s.btm ?? 0} · REF ${s.ref ?? s.init} · ` : '';
    return `<div class="span2 statblock">
      <div class="sb-head"><strong>${esc(s.name)}</strong><span class="muted small">${def}Visão ${s.vision} · Desloc. ${s.speed}</span></div>
      <h5>Ataques — clique e depois no alvo</h5>
      ${s.attacks.map((a, i) => `<button type="button" class="sb-btn" data-atk="${i}"><b>⚔ ${esc(a.name)}</b><span>${esc(attackLabel(a))}</span></button>`).join('')}
      <h5>Habilidades</h5>
      ${s.abilities.map((ab, i) => (ab.type === 'passive'
        ? `<div class="sb-passive"><b>${esc(ab.name)}.</b> ${esc(ab.text)}</div>`
        : `<button type="button" class="sb-btn ability" data-abl="${i}"><b>✨ ${esc(ab.name)}</b><span>${esc(ab.text || '')}</span></button>`)).join('') || '<p class="muted small">Nenhuma.</p>'}
      ${picker}
    </div>`;
  }

  $('#token-editor').addEventListener('click', e => {
    const atk = e.target.closest('[data-atk]');
    const abl = e.target.closest('[data-abl]');
    if (!S.selected || (!atk && !abl)) return;
    const t = S.state.tokens.find(x => x.id === S.selected);
    if (!t) return;
    if (atk) { setTool(`atk:${t.id}:${atk.dataset.atk}`); return; }
    const ab = t.stats?.abilities?.[Number(abl.dataset.abl)];
    if (ab?.type === 'area') setTool(`abl:${t.id}:${abl.dataset.abl}`);
    else socket.emit('combat:ability', { actor: t.id, index: Number(abl.dataset.abl) });
  });
  $('#token-editor').addEventListener('change', e => {
    const sel = e.target.closest('[data-statskey]');
    if (sel && S.selected && sel.value) socket.emit('token:update', { id: S.selected, patch: { statsKey: sel.value } });
  });

  // ---------- encontro automático ----------
  function renderEncounterCard() {
    const sys = S.state.system;
    if ($('#enc-types').dataset.sys === sys) { $('#enc-auto').checked = !!S.state.settings?.monstersAuto; return; }
    $('#enc-types').dataset.sys = sys;
    const list = Object.entries(BEST.BESTIARY).filter(([, e]) => e.sys === sys);
    $('#enc-types').innerHTML = `<span class="muted small">Tipos (nenhum marcado = todos):</span>${list.map(([k, e]) =>
      `<label class="enc-type" title="${esc(e.name)}"><input type="checkbox" value="${k}"><span class="enc-img"></span>${esc(e.name)}</label>`).join('')}`;
    // Retratos: usa a mesma imagem da galeria (getImg resolve "lib:chave")
    for (const el of $$('#enc-types .enc-type')) {
      const key = el.querySelector('input').value;
      const url = imgUrl(`lib:${key}`);
      if (url) el.querySelector('.enc-img').style.backgroundImage = `url("${url}")`;
    }
    $('#enc-auto').checked = !!S.state.settings?.monstersAuto;
  }

  $('#enc-go').addEventListener('click', () => {
    socket.emit('encounter:auto', {
      count: Number($('#enc-count').value) || 6,
      groups: Number($('#enc-groups').value) || 0,
      boss: $('#enc-boss').value === '1',
      types: $$('#enc-types input:checked').map(i => i.value),
      traps: Number($('#enc-traps').value) || 0,
      chests: Number($('#enc-chests').value) || 0,
      hidden: $('#enc-hidden').checked,
      replace: $('#enc-replace').checked,
    });
  });
  $('#enc-clear').addEventListener('click', () => { if (confirm('Remover todos os inimigos do mapa?')) socket.emit('encounter:clear'); });
  $('#enc-auto').addEventListener('change', e => socket.emit('settings:set', { monstersAuto: e.target.checked }));
  socket.on('encounter:done', res => toast(`⚔ ${res.placed} inimigo(s) posicionados. Detalhes no chat (só você vê).`));

  // ---------- história organizada em cenas ----------
  const STORY_EXAMPLES = {
    dnd5e: 'Cena 1: A taverna do Javali\nOs heróis chegam à taverna à noite. O dono, Sr. Aldric, conta que goblins roubaram a caravana da filha dele, Elara.\n\nCena 2: A floresta sombria\nNa trilha pela floresta, um bando de lobos ataca. Há uma armadilha escondida no caminho.\n\nCena 3: O covil\nNuma caverna, o chefe dos goblins guarda o tesouro com quatro goblins e dois orcs. Cuidado com as armadilhas.',
    cyberpunk: 'Cena 1: O encontro\nNos becos de Night City, à noite, o atravessador Rogue oferece o serviço: roubar dados de um laboratório da Arasaka.\n\nCena 2: A emboscada\nNa saída do bar, uma gangue de boosters cerca o grupo.\n\nCena 3: O laboratório\nNo laboratório corporativo, quatro seguranças e dois drones patrulham. O mercenário chefe da segurança guarda o cofre com os dados.',
    coc: 'Cena 1: A carta\nNa biblioteca da universidade de Arkham, o professor Armitage entrega uma carta estranha aos investigadores.\n\nCena 2: A mansão\nNa mansão abandonada dos Whateley, três cultistas vigiam os corredores. Há uma armadilha no porão.\n\nCena 3: O ritual\nNa cripta sob a mansão, o sumo sacerdote conduz o ritual com cinco cultistas e dois profundos. Um shoggoth desperta.',
  };

  const storyScenes = () => S.state.story?.scenes || [];
  // Mudança de estrutura salva na hora; digitação espera um pouco. Enquanto há algo para salvar,
  // uma atualização do servidor não sobrescreve o rascunho.
  let storyTimer = null;
  function sendStory() { storyTimer = null; socket.emit('story:set', { story: S.storyDraft }); }
  function storyChanged(render = false) {
    S.state.story = S.storyDraft;
    clearTimeout(storyTimer);
    if (render) { sendStory(); renderStory(true); } else storyTimer = setTimeout(sendStory, 400);
  }

  function enemiesText(sc) {
    const names = sc.enemies.map(e => `${e.n} ${BEST.BESTIARY[e.key]?.name || e.key}${e.n > 1 && !/s$/.test(BEST.BESTIARY[e.key]?.name || '') ? 's' : ''}`);
    return names.join(' + ');
  }

  function renderStory(force = false) {
    const root = $('#tab-story');
    const story = S.state.story || { text: '', scenes: [], current: -1 };
    if (document.activeElement !== $('#story-text')) $('#story-text').value = story.text || '';
    $('#story-opts').hidden = !story.scenes.length;
    $('#story-auto').checked = !!S.state.settings?.monstersAuto;
    const sig = JSON.stringify([story.scenes, story.current]);
    if (!force && (storyTimer || sig === S.storySig || root.querySelector('.story-scenes :focus'))) return;
    S.storySig = sig;
    S.storyDraft = structuredClone(story);
    const sys = S.state.system;
    const monsters = Object.entries(BEST.BESTIARY).filter(([, e]) => e.sys === sys);
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const openEdits = new Set($$('#story-scenes .scene-edit[open]').map(d => d.closest('[data-scene]').dataset.scene));
    $('#story-scenes').innerHTML = S.storyDraft.scenes.map((sc, i) => `
      <div class="scene-card${i === story.current ? ' current' : ''}${sc.done ? ' done' : ''}" data-scene="${i}">
        <div class="scene-head"><span class="scene-n">${i + 1}</span><input class="scene-title" data-s="title" value="${esc(sc.title)}" maxlength="80">${sc.done ? '<span class="tag">✓ montada</span>' : ''}</div>
        <div class="scene-tags">
          <span>🗺 ${sc.place ? `${esc(sc.place.label)}${sc.place.same ? ' <em>(mesmo lugar)</em>' : ''}` : '<em>mapa atual</em>'}</span>
          ${sc.enemies.length ? `<span>⚔ ${esc(enemiesText(sc))}</span>` : '<span class="muted">sem inimigos</span>'}
          ${sc.boss ? `<span>👑 ${sc.boss === 'auto' ? 'chefe' : esc(BEST.BESTIARY[sc.boss]?.name || '')}</span>` : ''}
          ${sc.traps ? `<span>⚠ ${sc.traps}</span>` : ''}${sc.chests ? `<span>🎁 ${sc.chests}</span>` : ''}${sc.ambush ? '<span>🎯 emboscada</span>' : ''}
          ${sc.npcs.length ? `<span>👤 ${esc(sc.npcs.join(', '))}</span>` : ''}
        </div>
        <details class="scene-edit"><summary>Editar cena</summary>
          <label>Texto (é o que os jogadores leem)<textarea data-s="text" rows="4">${esc(sc.text)}</textarea></label>
          <label>Lugar (palavras do gerador de mapas; vazio = mapa atual)<input data-s="place" value="${esc(sc.place && !sc.place.same ? sc.place.text.slice(0, 160) : '')}" placeholder="ex.: caverna de gelo, mansão abandonada à noite"></label>
          <div class="scene-enemies">${sc.enemies.map((e, k) => `<div class="row"><input type="number" min="1" max="20" data-e="${k}" data-f="n" value="${e.n}"><select data-e="${k}" data-f="key">${opt(monsters.map(([key, m]) => [key, m.name]), e.key)}</select><button type="button" class="x" data-sact="del-enemy" data-k="${k}">×</button></div>`).join('')}</div>
          <div class="grid3">
            <button type="button" class="btn ghost small" data-sact="add-enemy">+ Inimigo</button>
            <label>Chefe<select data-s="boss">${opt([['', 'Nenhum'], ['auto', 'O mais forte da cena'], ...monsters.map(([key, m]) => [key, m.name])], sc.boss || '')}</select></label>
            <span></span>
            <label>Armadilhas<input type="number" min="0" max="20" data-s="traps" value="${sc.traps}"></label>
            <label>Baús<input type="number" min="0" max="20" data-s="chests" value="${sc.chests}"></label>
          </div>
        </details>
        <div class="row">
          <button type="button" class="btn primary small" data-sact="build">▶ Montar cena</button>
          <button type="button" class="btn ghost small" data-sact="narrate">📢 Narrar</button>
          <button type="button" class="btn ghost small" data-sact="enemies" title="Coloca só os inimigos da cena no mapa atual">⚔ Só inimigos</button>
          <button type="button" class="x" data-sact="del-scene" title="Apagar cena">🗑</button>
        </div>
      </div>`).join('') + (story.scenes.length ? '<button type="button" class="btn ghost small" id="story-add">+ Cena</button>' : '');
    for (const i of openEdits) $(`[data-scene="${i}"] .scene-edit`)?.setAttribute('open', '');
  }

  // Monta os inimigos, armadilhas e baús da cena (no mapa que estiver na mesa)
  function placeSceneEnemies(sc, region = null) {
    const strongest = sc.enemies.slice().sort((a, b) => (BEST.BESTIARY[b.key]?.hp || 0) - (BEST.BESTIARY[a.key]?.hp || 0))[0]?.key;
    const bossKey = sc.boss === 'auto' ? strongest : sc.boss;
    if (!sc.enemies.length && !bossKey && !sc.traps && !sc.chests) return;
    socket.emit('encounter:auto', {
      exact: sc.enemies, boss: !!bossKey, bossKey, traps: sc.traps, chests: sc.chests,
      hidden: true, replace: true, objectsOnly: !sc.enemies.length && !bossKey, region,
    });
  }

  function buildScene(i) {
    const sc = S.storyDraft.scenes[i];
    const system = S.state.system;
    const size = $('#story-size').value;
    const newPlace = sc.place && !sc.place.same;
    let region = null;
    if (newPlace || !S.state.map.hasImage) {
      const spec = { ...GEN.interpret(newPlace ? sc.place.text : sc.place?.text || '', system), size };
      const place = S.state.map.hasImage ? $('#story-place').value : 'replace';
      if (place === 'replace' && S.state.map.hasImage && !confirm(`Montar "${sc.title}" troca o mapa atual. Continuar?`)) return;
      const res = applyGeneratedMap(spec, rid(), place, place === 'replace', false);
      if (!res) return;
      region = res.region || null;
    }
    placeSceneEnemies(sc, region);
    if ($('#story-auto').checked !== !!S.state.settings?.monstersAuto) socket.emit('settings:set', { monstersAuto: $('#story-auto').checked });
    if ($('#story-narrate').checked && sc.text.trim()) socket.emit('story:narrate', { title: sc.title, text: sc.text });
    sc.done = true;
    S.storyDraft.current = i;
    storyChanged(true);
    toast(`▶ Cena ${i + 1} montada: ${sc.title}`);
  }

  $('#story-organize').addEventListener('click', () => {
    const text = $('#story-text').value;
    if (!text.trim()) { toast('Digite ou cole a história primeiro.'); return; }
    if (storyScenes().some(s => s.done) && !confirm('Organizar de novo apaga as cenas atuais (e o que você editou nelas). Continuar?')) return;
    const scenes = STORY.organize(text, S.state.system, GEN.interpret);
    S.storyDraft = { text, scenes, current: -1 };
    storyChanged(true);
    toast(`📜 ${scenes.length} cena(s) encontradas. Confira e clique em "Montar cena".`);
  });
  $('#story-example').addEventListener('click', () => {
    if ($('#story-text').value.trim() && !confirm('Trocar o texto pelo exemplo?')) return;
    $('#story-text').value = STORY_EXAMPLES[S.state.system] || STORY_EXAMPLES.dnd5e;
  });
  $('#story-text').addEventListener('input', debounce(() => { if (!S.storyDraft) return; S.storyDraft.text = $('#story-text').value; storyChanged(); }, 600));
  $('#story-auto').addEventListener('change', e => socket.emit('settings:set', { monstersAuto: e.target.checked }));

  $('#tab-story').addEventListener('input', e => {
    const card = e.target.closest('[data-scene]');
    if (!card || !S.storyDraft) return;
    const sc = S.storyDraft.scenes[Number(card.dataset.scene)];
    const el = e.target;
    if (el.dataset.e != null) {
      const en = sc.enemies[Number(el.dataset.e)];
      if (el.dataset.f === 'n') en.n = Math.max(1, Math.min(20, Number(el.value) || 1)); else en.key = el.value;
    } else if (el.dataset.s === 'place') {
      const v = el.value.trim();
      sc.place = v ? { text: v, label: GEN.interpret(v, S.state.system).label, type: GEN.interpret(v, S.state.system).type } : null;
      const tag = card.querySelector('.scene-tags span');
      if (tag) tag.innerHTML = `🗺 ${sc.place ? esc(sc.place.label) : '<em>mapa atual</em>'}`;
    } else if (el.dataset.s === 'traps' || el.dataset.s === 'chests') sc[el.dataset.s] = Math.max(0, Number(el.value) || 0);
    else if (el.dataset.s === 'boss') sc.boss = el.value || null;
    else if (el.dataset.s) sc[el.dataset.s] = el.value;
    storyChanged();
  });
  $('#tab-story').addEventListener('change', e => { if (e.target.closest('[data-scene]') && (e.target.tagName === 'SELECT' || e.target.type === 'number')) renderStory(true); });

  $('#tab-story').addEventListener('click', e => {
    if (e.target.id === 'story-add') {
      S.storyDraft.scenes.push({ id: rid(), title: `Cena ${S.storyDraft.scenes.length + 1}`, text: '', place: null, enemies: [], boss: null, traps: 0, chests: 0, ambush: false, npcs: [], done: false });
      storyChanged(true);
      return;
    }
    const b = e.target.closest('[data-sact]');
    const card = e.target.closest('[data-scene]');
    if (!b || !card || !S.storyDraft) return;
    const i = Number(card.dataset.scene);
    const sc = S.storyDraft.scenes[i];
    const act = b.dataset.sact;
    if (act === 'build') buildScene(i);
    if (act === 'narrate') { if (sc.text.trim()) { socket.emit('story:narrate', { title: sc.title, text: sc.text }); toast('📢 Narrado para os jogadores.'); } else toast('A cena não tem texto.'); }
    if (act === 'enemies') { placeSceneEnemies(sc); sc.done = true; S.storyDraft.current = i; storyChanged(true); }
    if (act === 'add-enemy') {
      const first = Object.entries(BEST.BESTIARY).find(([, m]) => m.sys === S.state.system)?.[0];
      sc.enemies.push({ key: first, n: 1 });
      storyChanged(true);
      card.querySelector('details')?.setAttribute('open', '');
      $(`[data-scene="${i}"] details`)?.setAttribute('open', '');
    }
    if (act === 'del-enemy') { sc.enemies.splice(Number(b.dataset.k), 1); storyChanged(true); $(`[data-scene="${i}"] details`)?.setAttribute('open', ''); }
    if (act === 'del-scene' && confirm(`Apagar a cena "${sc.title}"?`)) { S.storyDraft.scenes.splice(i, 1); storyChanged(true); }
  });

  // ---------- classes e habilidades (cadastro do mestre) ----------
  const CLASS_WORDS = { dnd5e: ['Classes', 'classes', 'classe'], cyberpunk: ['Papéis', 'papéis', 'papel'], coc: ['Ocupações', 'ocupações', 'ocupação'] };

  function renderClassCard() {
    const st = S.state;
    $$('#class-card .class-word').forEach((el, i) => { el.textContent = CLASS_WORDS[st.system][i] ?? el.textContent; });
    $('#class-modal-title').textContent = `Editar ${CLASS_WORDS[st.system][2]}`;
    const who = id => Object.entries(st.sheets).filter(([, sh]) => sh.classId === id).map(([p]) => st.players.find(x => x.id === p)?.charName).filter(Boolean);
    const classes = st.classes || [];
    $('#class-list').innerHTML = classes.map(c => {
      const hp = c.res?.hp ? `PV ${c.res.hp} · ` : '';
      const users = who(c.id);
      return `<div class="class-row">
        <div class="grow"><b>${esc(c.name)}</b><span class="muted small">${hp}${c.attacks.length} ataque(s) · ${c.abilities.length} habilidade(s)${users.length ? ` · ${esc(users.join(', '))}` : ''}</span></div>
        <button type="button" class="btn ghost small" data-cedit="${c.id}">Editar</button>
        <button type="button" class="x" data-cdel="${c.id}" title="Apagar">×</button>
      </div>`;
    }).join('') || '<p class="muted small">Nenhuma cadastrada ainda. Crie uma ou carregue as prontas do sistema.</p>';
    $('#players-pick').checked = st.settings?.playersPickClass !== false;
    $('#lock-sheets').checked = !!st.settings?.lockSheets;
  }

  $('#class-list').addEventListener('click', e => {
    const ed = e.target.closest('[data-cedit]');
    const del = e.target.closest('[data-cdel]');
    const cls = (S.state.classes || []).find(c => c.id === (ed || del)?.dataset[ed ? 'cedit' : 'cdel']);
    if (!cls) return;
    if (ed) openClassEditor(cls);
    else if (confirm(`Apagar "${cls.name}"? Quem já tem essa ${CLASS_WORDS[S.state.system][2]} continua com a ficha como está.`)) socket.emit('class:remove', { id: cls.id });
  });
  $('#class-new').addEventListener('click', () => openClassEditor(null));
  $('#class-presets').addEventListener('click', () => socket.emit('class:presets'));
  $('#rest-btn').addEventListener('click', () => socket.emit('rest'));
  $('#players-pick').addEventListener('change', e => socket.emit('settings:set', { playersPickClass: e.target.checked }));
  $('#lock-sheets').addEventListener('change', e => socket.emit('settings:set', { lockSheets: e.target.checked }));

  // Editor de classe: rascunho local, salvo de uma vez no botão Salvar.
  function openClassEditor(cls) {
    S.classDraft = cls ? structuredClone(cls) : { name: '', desc: '', res: {}, def: '', stats: {}, skills: [], attacks: [], abilities: [], gear: '' };
    renderClassEditor();
    $('#class-modal').hidden = false;
    $('#class-editor [data-cpath="name"]')?.focus();
  }
  function closeClassEditor() { $('#class-modal').hidden = true; S.classDraft = null; }

  function renderClassEditor() {
    const c = S.classDraft;
    const system = S.state.system;
    const sys = API.SYSTEMS[system];
    const defField = CLS.DEF_FIELD[system] || (system === 'cyberpunk' ? 'armor' : null);
    const defLabel = system === 'cyberpunk' ? 'PB da armadura (torso e braços)' : sys.info.find(f => f.key === defField)?.label;
    const prof = sys.skillMode === 'prof';
    const skillNames = sys.skills.map(([n]) => `<option value="${esc(n)}">`).join('');
    const atkType = a => [['melee', 'Corpo a corpo'], ['ranged', 'Distância'], ['spell', 'Magia']].map(([v, l]) => `<option value="${v}"${a.type === v ? ' selected' : ''}>${l}</option>`).join('');
    const bonusLabel = { dnd5e: 'Acerto', cyberpunk: 'Precisão', coc: '%' }[system];
    $('#class-editor').innerHTML = `
      <div class="grid2">
        <label>Nome<input data-cpath="name" value="${esc(c.name)}" maxlength="40" placeholder="Ex.: Paladino"></label>
        ${defField ? `<label>${esc(defLabel)}<input data-cpath="def" value="${esc(c.def || '')}" maxlength="10" placeholder="vazio = não muda"></label>` : '<span></span>'}
        <label class="span2">Descrição<textarea data-cpath="desc" rows="2" maxlength="400">${esc(c.desc || '')}</textarea></label>
      </div>
      <h4>Recursos <span class="muted small">vazio = não muda a ficha</span></h4>
      <div class="ce-grid">${sys.resources.map(r => `<label>${esc(r.label)}<input type="number" data-cpath="res.${r.key}" data-blank value="${esc(c.res?.[r.key] ?? '')}" min="0"></label>`).join('')}</div>
      <h4>Atributos <span class="muted small">vazio = não muda</span></h4>
      <div class="ce-grid stats">${sys.stats.map(s => `<label>${s.label}<input type="number" data-cpath="stats.${s.key}" data-blank value="${esc(c.stats?.[s.key] ?? '')}"></label>`).join('')}</div>
      <h4>Perícias ${prof ? '<span class="muted small">a classe dá proficiência nelas</span>' : `<span class="muted small">${system === 'coc' ? '% mínimo' : 'nível mínimo'}</span>`}</h4>
      <datalist id="ce-skills">${skillNames}</datalist>
      <div class="ce-list">${c.skills.map((k, i) => `<div class="ce-skill">
        <input list="ce-skills" data-cpath="skills.${i}.name" value="${esc(k.name)}" maxlength="50" placeholder="Nome da perícia">
        ${prof ? '' : `<input type="number" data-cpath="skills.${i}.value" value="${esc(k.value || 0)}" min="0" max="999">`}
        <button type="button" class="x" data-cact="del-skill" data-i="${i}">×</button></div>`).join('')}</div>
      <button type="button" class="btn ghost small" data-cact="add-skill">+ Perícia</button>
      <h4>Ataques <span class="muted small">vazio = a ficha mantém os ataques que tem</span></h4>
      <div class="ce-list">${c.attacks.map((a, i) => `<div class="attack">
        <input type="text" class="atk-name" data-cpath="attacks.${i}.name" value="${esc(a.name)}" maxlength="40">
        <select data-cpath="attacks.${i}.type">${atkType(a)}</select>
        ${system === 'cyberpunk' ? `<input list="ce-skills" data-cpath="attacks.${i}.skill" value="${esc(a.skill || '')}" placeholder="Perícia" title="Perícia somada ao REF">` : ''}
        <label>${bonusLabel}<input type="number" data-cpath="attacks.${i}.bonus" value="${esc(a.bonus)}"></label>
        <label>Dano<input type="text" data-cpath="attacks.${i}.damage" value="${esc(a.damage)}" maxlength="16"></label>
        <label>Alcance<input type="number" data-cpath="attacks.${i}.range" value="${esc(a.type === 'melee' ? 1 : a.range || 12)}" min="1" max="60"${a.type === 'melee' ? ' disabled' : ''}></label>
        <button type="button" class="x" data-cact="del-attack" data-i="${i}">×</button></div>`).join('')}</div>
      <button type="button" class="btn ghost small" data-cact="add-attack">+ Ataque</button>
      <h4>Habilidades <span class="muted small">usos voltam no 🛏 Descanso (0 = sem limite)</span></h4>
      <div class="abilities">${c.abilities.map((a, i) => abilityEditHTML(a, `abilities.${i}`, 'data-cpath', i)).join('')}</div>
      <button type="button" class="btn ghost small" data-cact="add-ability">+ Habilidade</button>
      <h4>Equipamento inicial</h4>
      <textarea data-cpath="gear" rows="2" maxlength="1000" placeholder="Vai para as anotações da ficha">${esc(c.gear || '')}</textarea>`;
  }

  $('#class-editor').addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset.cpath || !S.classDraft) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') v = el.value === '' && 'blank' in el.dataset ? '' : Number(el.value) || 0;
    setPath(S.classDraft, el.dataset.cpath, v);
    if (/\.(type|save)$/.test(el.dataset.cpath)) renderClassEditor();
  });
  $('#class-editor').addEventListener('click', e => {
    const b = e.target.closest('[data-cact], [data-act="del-ability"]');
    if (!b || !S.classDraft) return;
    const c = S.classDraft;
    const i = Number(b.dataset.i);
    const act = b.dataset.cact || b.dataset.act;
    if (act === 'add-skill') c.skills.push({ name: '', value: 0, prof: true });
    if (act === 'del-skill') c.skills.splice(i, 1);
    if (act === 'add-attack') c.attacks.push({ name: 'Novo ataque', type: 'melee', bonus: 0, damage: '1d6', range: 1 });
    if (act === 'del-attack') c.attacks.splice(i, 1);
    if (act === 'add-ability') c.abilities.push(blankAbility());
    if (act === 'del-ability') c.abilities.splice(i, 1);
    renderClassEditor();
  });
  $('#class-save').addEventListener('click', () => {
    if (!S.classDraft.name.trim()) { toast('Dê um nome.'); $('#class-editor [data-cpath="name"]').focus(); return; }
    socket.emit('class:save', { cls: S.classDraft });
    closeClassEditor();
  });
  $('#class-cancel').addEventListener('click', closeClassEditor);
  $('#class-close').addEventListener('click', closeClassEditor);

  // ---------- teste com jogadores ----------
  $('#test-add').addEventListener('click', () => socket.emit('test:add', { count: Number($('#test-count').value) }));

  // Demonstração: sem mapa gerado, cria um (masmorra / cidade / casa, conforme o sistema) com névoa e começa.
  $('#demo-toggle').addEventListener('click', () => {
    if (S.state.demo) { socket.emit('test:demo', { start: false }); return; }
    if (S.state.hasWalls) { socket.emit('test:demo', { start: true }); return; }
    const res = GEN.generate({ spec: { ...GEN.interpret('', S.state.system), size: 'm' }, cell: S.state.map.grid, seed: rid(), system: S.state.system });
    socket.emit('map:image', { image: res.canvas.toDataURL('image/jpeg', 0.88), w: res.canvas.width, h: res.canvas.height, walls: res.walls, objects: res.objects });
    socket.emit('map:settings', { fogEnabled: true });
    socket.emit('fog:all', { reveal: false });
    socket.emit('fog:paint', { cells: res.reveal, reveal: true });
    socket.emit('test:demo', { start: true, spawn: res.spawn });
    S.camTouched = false;
  });
  $('#test-remove').addEventListener('click', () => socket.emit('test:remove'));
  $('#bots-auto').addEventListener('change', e => socket.emit('settings:set', { botsAuto: e.target.checked }));
  $('#monsters-auto').addEventListener('change', e => socket.emit('settings:set', { monstersAuto: e.target.checked }));

  function removeSelected() {
    if (!S.isGM || !S.selected) return;
    const t = S.state.tokens.find(x => x.id === S.selected);
    if (t?.owner && !confirm(`Remover o token de ${t.name}? (A ficha continua.)`)) return;
    socket.emit('token:remove', { id: S.selected });
    S.selected = null;
  }

  function select(id) {
    if (!S.isGM || S.selected === id) return;
    S.selected = id;
    renderTokenEditor();
    const t = id && S.state.tokens.find(x => x.id === id);
    if (t) $('#init-form [name=name]').value = t.name;
    requestDraw();
  }

  // ---------- retratos ----------
  const ART = window.TOKEN_ART;
  const initials = name => (String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();

  function imgUrl(img) {
    if (!img) return null;
    if (img.startsWith('lib:')) return ART.artSrc(img.slice(4));
    if (img.startsWith('up:')) return `/img/${S.code}/${img.slice(3)}`;
    return null;
  }

  const imgCache = new Map();
  function getImg(img) {
    const url = imgUrl(img);
    if (!url) return null;
    let el = imgCache.get(url);
    if (!el) {
      el = new Image();
      el.src = url;
      imgCache.set(url, el);
    }
    return el.complete && el.naturalWidth ? el : null;
  }

  function portraitHTML(img, name, color, cls = '', attrs = '') {
    const url = imgUrl(img);
    const tag = attrs ? 'button' : 'span';
    const style = `--c:${esc(color || '')};${url ? `background-image:url(&quot;${url}&quot;)` : ''}`;
    return `<${tag} class="portrait ${cls}" style="${style}" ${attrs}>${url ? '' : esc(initials(name || '?'))}</${tag}>`;
  }

  // ---------- galeria de retratos (modal) ----------
  let pickerCb = null;
  let pickerCurrent = null;
  let pickerFilter = 'sys';

  function openPicker(current, cb) {
    pickerCb = cb;
    pickerCurrent = current;
    renderPicker();
    $('#picker').hidden = false;
  }
  function closePicker() {
    $('#picker').hidden = true;
    pickerCb = null;
  }
  function choosePortrait(img) {
    const cb = pickerCb;
    closePicker();
    cb?.(img);
  }

  function renderPicker() {
    const system = S.state?.system || document.body.dataset.system;
    const filters = [['sys', API.SYSTEMS[system].name], ['pc', 'Heróis'], ['monster', 'Monstros'], ['all', 'Todos']];
    $('#picker-filter').innerHTML = filters.map(([k, label]) => `<button type="button" data-filter="${k}" class="${k === pickerFilter ? 'on' : ''}">${label}</button>`).join('');
    const list = ART.list.filter(a => pickerFilter === 'all' || (pickerFilter === 'sys' ? a.sys === system : a.kind === pickerFilter));
    const current = pickerCurrent?.startsWith('up:')
      ? `<button type="button" class="pick on" data-img="${esc(pickerCurrent)}">${portraitHTML(pickerCurrent, '', '')}<span>Imagem enviada</span></button>`
      : '';
    $('#picker-grid').innerHTML = current + list.map(a =>
      `<button type="button" class="pick${pickerCurrent === `lib:${a.key}` ? ' on' : ''}" data-img="lib:${a.key}">${portraitHTML(`lib:${a.key}`, a.name, '')}<span>${esc(a.name)}</span></button>`).join('');
  }

  $('#picker-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (b) { pickerFilter = b.dataset.filter; renderPicker(); }
  });
  $('#picker-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-img]');
    if (b) choosePortrait(b.dataset.img);
  });
  $('#picker-none').addEventListener('click', () => choosePortrait(null));
  $('#picker-close').addEventListener('click', closePicker);
  $('#picker').addEventListener('click', e => { if (e.target.id === 'picker') closePicker(); });

  // Recorta a imagem enviada num quadrado de 256 px (leve para mandar a todos).
  $('#picker-file').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
        let data = c.toDataURL('image/webp', 0.85);
        if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.85);
        socket.emit('image:upload', { image: data }, res => {
          if (!res?.ok) return toast(res?.error || 'Não deu para enviar a imagem.');
          choosePortrait(res.img);
        });
      };
      img.onerror = () => toast('Não consegui ler essa imagem.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // ---------- mapa (canvas) e animações ----------
  const canvas = $('#board');
  const ctx = canvas.getContext('2d');
  const vis = new Map(); // estado visual de cada token: posição suavizada e animações
  const floaters = [];   // números e balões que sobem (dano, cura, rolagens)
  const particles = [];
  const effects = [];    // efeitos lançados (ataque, magia, explosão…)
  let shake = 0;

  const FX_COLORS = {
    dnd5e: { magic: '#c08bff', shot: '#f3e2b3' },
    cyberpunk: { magic: '#05d9e8', shot: '#fff35c' },
    coc: { magic: '#8fff9f', shot: '#ffd27a' },
  };
  const FX_TOOLS = {
    dnd5e: [['slash', '⚔', 'Ataque corpo a corpo'], ['shot', '🏹', 'Disparo (sai do seu token)'], ['magic', '✨', 'Magia'], ['blast', '🔥', 'Explosão'], ['heal', '💚', 'Cura']],
    cyberpunk: [['slash', '🔪', 'Lâmina'], ['shot', '🔫', 'Tiro (sai do seu token)'], ['magic', '⚡', 'Hack'], ['blast', '💥', 'Granada'], ['heal', '💉', 'Cura']],
    coc: [['slash', '🪓', 'Golpe'], ['shot', '🔫', 'Tiro (sai do seu token)'], ['magic', '👁', 'Ritual'], ['blast', '💥', 'Explosão'], ['heal', '🩹', 'Primeiros socorros']],
  };
  const FX_DURATION = { slash: 0.5, magic: 1.1, blast: 1.0, heal: 1.2, trap: 0.9, chest: 1.2, dust: 1.3 };

  function renderFxButtons(system) {
    $('#fx-group').innerHTML = FX_TOOLS[system].map(([k, icon, title]) => `<button data-tool="fx:${k}" title="${title}">${icon}</button>`).join('');
  }

  function requestDraw() { /* o laço de animação redesenha a cada quadro */ }

  function resizeCanvas() {
    const stage = $('#stage');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(stage.clientWidth * dpr);
    canvas.height = Math.round(stage.clientHeight * dpr);
    if (!S.camTouched) fitView();
  }
  new ResizeObserver(resizeCanvas).observe($('#stage'));

  function fitView() {
    if (!S.state) return;
    const { grid, cols, rows } = S.state.map;
    const stage = $('#stage');
    const W = cols * grid;
    const lift = S.view3d ? grid * 1.2 : 0; // espaço para as paredes e miniaturas da primeira fileira
    const H = rows * grid * tilt() + lift;
    const z = clamp(Math.min(stage.clientWidth / W, stage.clientHeight / H) * 0.92, 0.15, 2);
    S.cam = { z, x: (stage.clientWidth - W * z) / 2, y: (stage.clientHeight - H * z) / 2 + lift * z };
  }

  // Quadrado livre mais perto do centro da visão, para tokens novos não nascerem empilhados.
  function viewCenterCell(size = 1) {
    const stage = $('#stage');
    const { grid: g, cols, rows } = S.state.map;
    const cx = clamp(Math.floor((stage.clientWidth / 2 - S.cam.x) / S.cam.z / g), 0, cols - size);
    const cy = clamp(Math.floor((stage.clientHeight / 2 - S.cam.y) / S.cam.z / g), 0, rows - size);
    const taken = new Set();
    for (const t of S.state.tokens) {
      const s = t.size || 1;
      for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) taken.add(`${Math.round(t.x) + i},${Math.round(t.y) + j}`);
    }
    const fits = (x, y) => {
      if (x < 0 || y < 0 || x + size > cols || y + size > rows) return false;
      for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) if (taken.has(`${x + i},${y + j}`)) return false;
      return true;
    };
    for (let r = 0; r < 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && fits(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
        }
      }
    }
    return { x: cx, y: cy };
  }

  function turnTokenId() {
    const init = S.state.init;
    const e = init.list.find(x => x.id === init.turnId);
    if (!e) return null;
    if (e.tokenId) return e.tokenId;
    return e.pid ? S.state.tokens.find(t => t.owner === e.pid)?.id : null;
  }

  const ease = {
    outBack: k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
    outCubic: k => 1 - Math.pow(1 - k, 3),
  };
  const hash = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  const isDown = t => (t.maxHp > 0 && t.hp != null ? t.hp <= 0 : t.hpState === 'down');

  function centerOf(v) {
    const g = S.state.map.grid;
    const s = (v.t.size || 1) * g;
    return { x: v.x * g + s / 2, y: v.y * g + s / 2 };
  }

  function cellRevealed(x, y) {
    const g = S.state.map.grid;
    return S.revealed.has(`${Math.floor(x / g)},${Math.floor(y / g)}`);
  }

  // Liga o estado do servidor ao estado visual (tokens novos "nascem", sumidos desaparecem aos poucos).
  function syncVis(st) {
    const now = performance.now();
    const seen = new Set();
    for (const t of st.tokens) {
      seen.add(t.id);
      let v = vis.get(t.id);
      if (!v) {
        v = { x: t.x, y: t.y, born: now, walk: 0, hop: 0, hitT: -1e9, healT: -1e9, downK: isDown(t) ? 1 : 0, phase: (hash(t.id) % 628) / 100 };
        vis.set(t.id, v);
      }
      v.t = t;
      v.gone = null;
    }
    for (const v of vis.values()) if (!seen.has(v.t.id) && v.gone == null) v.gone = now;
  }

  function burst(x, y, n, colors, speed, life, size, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7);
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        grav: opts.grav ?? speed * 0.6, drag: opts.drag ?? 0.1,
        life: life * (0.6 + Math.random() * 0.6), age: 0, born: performance.now(),
        size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length],
        shape: opts.shape || 'dot', glow: opts.glow ?? true,
      });
    }
  }

  // ---------- eventos de animação vindos do servidor ----------
  socket.on('fx', fx => {
    if (!S.state) return;
    const now = performance.now();
    const g = S.state.map.grid;
    if (fx.kind === 'hit' || fx.kind === 'heal') {
      const v = vis.get(fx.tokenId);
      if (!v) return;
      const c = centerOf(v);
      if (fx.kind === 'hit') {
        v.hitT = now;
        burst(c.x, c.y, 18, ['#ff4d4d', '#b30000', '#ffd0d0'], g * 2.4, 0.6, g * 0.05);
        floaters.push({ tokenId: fx.tokenId, text: fx.amount != null ? `−${fx.amount}` : '💥', color: '#ff5a5a', born: now, life: 1.3 });
        if (fx.down) {
          floaters.push({ tokenId: fx.tokenId, text: 'Caído!', color: '#ffffff', born: now + 300, life: 1.8, small: true, dy: -0.35 });
          shake = Math.max(shake, 0.35);
        }
      } else {
        v.healT = now;
        burst(c.x, c.y, 16, ['#6fff8f', '#c8ffd4'], g * 0.9, 1.1, g * 0.07, { shape: 'plus', grav: -g * 1.2, drag: 0.4 });
        floaters.push({ tokenId: fx.tokenId, text: fx.amount != null ? `+${fx.amount}` : '✚', color: '#6fff8f', born: now, life: 1.3 });
      }
      return;
    }
    // Efeito no meio da névoa não aparece para o jogador.
    if (!S.isGM && S.state.map.fogEnabled && !cellRevealed(fx.x, fx.y)) return;
    const src = fx.from && vis.get(fx.from);
    const e = { ...fx, from: src ? centerOf(src) : null, born: now };
    startEffect(e, g);
    effects.push(e);
  });

  function startEffect(e, g) {
    const col = FX_COLORS[S.state.system];
    if (e.kind === 'slash') {
      burst(e.x, e.y, 12, ['#ffffff', '#ffd6d6'], g * 3, 0.35, g * 0.035, { shape: 'spark', grav: 0 });
    } else if (e.kind === 'magic') {
      burst(e.x, e.y, 28, [col.magic, '#ffffff'], g * 1.6, 1.0, g * 0.05, { grav: -g * 0.8, drag: 0.3 });
    } else if (e.kind === 'blast') {
      burst(e.x, e.y, 46, ['#ffec80', '#ff9d2e', '#ff4b1f'], g * 3.6, 0.7, g * 0.08, { grav: g * 1.2 });
      burst(e.x, e.y, 14, ['#555555', '#777777'], g * 1, 1.4, g * 0.3, { shape: 'smoke', glow: false, grav: -g * 0.4, drag: 0.4 });
      shake = Math.max(shake, 0.7);
    } else if (e.kind === 'trap') {
      burst(e.x, e.y, 20, ['#c8ccd4', '#8a8e96', '#ff4d4d'], g * 2.4, 0.5, g * 0.04, { shape: 'spark', grav: g * 2 });
      shake = Math.max(shake, 0.45);
    } else if (e.kind === 'chest') {
      burst(e.x, e.y, 26, ['#ffd84a', '#fff4b0', '#f4a82a'], g * 1.3, 1.1, g * 0.05, { grav: -g * 0.9, drag: 0.35 });
    } else if (e.kind === 'dust') {
      burst(e.x, e.y, 16, ['#8a8176', '#a89f92', '#6e665c'], g * 1.1, 1.2, g * 0.22, { shape: 'smoke', glow: false, grav: -g * 0.3, drag: 0.4 });
    } else if (e.kind === 'heal') {
      burst(e.x, e.y, 18, ['#6fff8f', '#c8ffd4'], g * 0.9, 1.2, g * 0.07, { shape: 'plus', grav: -g * 1.2, drag: 0.4 });
    } else if (e.kind === 'shot') {
      const dist = e.from ? Math.hypot(e.x - e.from.x, e.y - e.from.y) : 0;
      e.travel = e.from ? clamp(dist / (g * 22), 0.1, 0.4) : 0;
      if (e.from) burst(e.from.x, e.from.y, 8, [col.shot, '#ffffff'], g * 1.5, 0.2, g * 0.04, { grav: 0 });
    }
    e.duration = e.kind === 'shot' ? e.travel + 0.4 : FX_DURATION[e.kind];
  }

  // Monstro avistou alguém: "❗" em cima dele, anel de alerta e a tela treme.
  socket.on('combat', ev => {
    const now = performance.now();
    if (ev.type === 'start' || ev.type === 'join') {
      for (const id of ev.spotters || [ev.tokenId]) {
        const v = vis.get(id);
        if (!v) continue;
        const c = centerOf(v);
        floaters.push({ tokenId: id, text: '❗', color: '#ff3b30', born: now, life: 2, dy: 0.35 });
        S.pings.push({ x: c.x, y: c.y, color: '#ff3b30', t: now });
      }
      if (ev.type === 'start') {
        shake = Math.max(shake, 0.6);
        showBanner('⚔ COMBATE!', `${ev.headline || `${ev.name} avistou ${ev.target}`} · iniciativa rolada`);
        $('#tabs [data-tab=init]').click();
      } else {
        showBanner('⚔ Reforços!', `${ev.name} entrou no combate`, 'calm');
      }
    } else if (ev.type === 'end') {
      showBanner(ev.victory ? '🏆 VITÓRIA!' : 'Fim do combate', ev.victory ? 'Todos os inimigos caíram' : 'A poeira baixa…', ev.victory ? 'win' : 'calm');
    }
  });

  // ---------- laço de animação ----------
  function update(dt, now) {
    const g = S.state.map.grid;
    for (const [id, v] of vis) {
      if (v.gone != null && now - v.gone > 320) { vis.delete(id); continue; }
      const t = v.t;
      let moving;
      if (S.drag?.id === id) {
        v.x = S.drag.x;
        v.y = S.drag.y;
        moving = now - (S.drag.lastMoveT || 0) < 120;
      } else {
        const k = 1 - Math.exp(-dt * 12);
        v.x += (t.x - v.x) * k;
        v.y += (t.y - v.y) * k;
        moving = Math.hypot(t.x - v.x, t.y - v.y) > 0.03;
      }
      // Pulinhos enquanto anda.
      if (moving) { v.walk += dt * 16; v.hop = Math.abs(Math.sin(v.walk)); } else { v.hop *= Math.exp(-dt * 14); v.walk = 0; }
      v.downK += ((isDown(t) ? 1 : 0) - v.downK) * (1 - Math.exp(-dt * 6));
    }

    // Portas girando, tampa do baú, alavanca
    for (const o of S.state.objects || []) {
      const target = o.open || o.on ? 1 : 0;
      const cur = S.objAnim.get(o.id) ?? target;
      S.objAnim.set(o.id, cur + (target - cur) * (1 - Math.exp(-dt * 7)));
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      // Também expira pelo relógio: numa aba em segundo plano o laço pausa e não pode acumular fumaça.
      if (p.age >= p.life || now - p.born > p.life * 1000 + 300) { particles.splice(i, 1); continue; }
      const drag = Math.pow(p.drag, dt);
      p.vx *= drag;
      p.vy = p.vy * drag + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    const col = FX_COLORS[S.state.system];
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const age = (now - e.born) / 1000;
      if (e.kind === 'shot' && !e.impacted && age >= e.travel) {
        e.impacted = true;
        burst(e.x, e.y, 16, [col.shot, '#ffffff', '#ff9d2e'], g * 2.6, 0.4, g * 0.04, { shape: 'spark', grav: 0 });
      }
      if (age > e.duration) effects.splice(i, 1);
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      if ((now - floaters[i].born) / 1000 > floaters[i].life) floaters.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 1.4);
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (S.state) update(dt, now);
    if (S.viewMode === '3d' && window.MESA3D && S.state) window.MESA3D.render(now);
    else draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- paredes e relevo 2.5D ----------
  const TILT = 0.72; // quanto o chão "achata" na câmera inclinada
  const tilt = () => (S.view3d ? TILT : 1);

  // Altura do relevo por código de parede: 1 parede, 3..7 casa/prédio (2 = árvore, sem relevo).
  function blockHeight(code, g) {
    if (code === '1') return g * 0.75;
    if (code >= '3' && code <= '9') return g * (0.35 + (code.charCodeAt(0) - 51) * 0.5);
    return 0;
  }

  // Monta as paredes efetivas (menos as quebradas e passagens abertas) e anima as que acabaram de abrir.
  function buildWalls(st) {
    const { cols } = st.map;
    const w = st.walls;
    const eff = w?.cells ? w.cells.split('') : null;
    const opened = new Map();
    const cracks = new Map();
    for (const o of st.objects || []) {
      if (o.edge) continue;
      const i = o.y * cols + o.x;
      if (o.type === 'crack') { if (o.broken) opened.set(i, o); else cracks.set(i, o); }
      if (o.type === 'secret' && o.open) opened.set(i, o);
    }
    const prev = S.wallInfo?.eff;
    if (eff) {
      for (const i of opened.keys()) {
        if (prev && prev.length === eff.length && prev[i] !== '0' && eff[i] !== '0') S.sinks.set(i, { t: performance.now(), code: eff[i] });
        eff[i] = '0';
      }
    }
    const h = new Map();
    const v = new Map();
    const push = (m, k, x) => { if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
    for (const [x1, y1, x2, y2] of w?.segments || []) {
      if (x1 === x2) for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) push(v, y, x1);
      else for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) push(h, y1, x);
    }
    S.wallInfo = { eff, opened, cracks, h, v };
  }

  function cellHeight(c, r, g, now) {
    const { cols, rows } = S.state.map;
    const W = S.wallInfo;
    if (!W?.eff || c < 0 || r < 0 || c >= cols || r >= rows) return 0;
    const i = r * cols + c;
    const sink = S.sinks.get(i);
    if (sink) {
      const k = (now - sink.t) / 700;
      if (k < 1) return blockHeight(sink.code, g) * (1 - ease.outCubic(k));
      S.sinks.delete(i);
    }
    return blockHeight(W.eff[i], g);
  }

  // Cor média de cada quadrado da imagem (para pintar as faces das paredes).
  function cellColor(c, r) {
    const st = S.state;
    if (S.cellColorsFor !== S.mapImg || S.cellColorsKey !== S.mapKey) {
      S.cellColorsFor = S.mapImg;
      S.cellColorsKey = S.mapKey;
      S.cellColors = null;
      if (S.mapImg && st.map.hasImage) {
        const cv = document.createElement('canvas');
        cv.width = st.map.cols; cv.height = st.map.rows;
        const g2 = cv.getContext('2d', { willReadFrequently: true });
        g2.drawImage(S.mapImg, 0, 0, st.map.cols * st.map.grid, st.map.rows * st.map.grid, 0, 0, st.map.cols, st.map.rows);
        S.cellColors = g2.getImageData(0, 0, st.map.cols, st.map.rows).data;
      }
    }
    if (!S.cellColors) return [70, 64, 58];
    const i = (r * st.map.cols + c) * 4;
    return [S.cellColors[i], S.cellColors[i + 1], S.cellColors[i + 2]];
  }
  const rgb = ([r, g, b], k = 0) => `rgb(${Math.round(k < 0 ? r * (1 + k) : r + (255 - r) * k)},${Math.round(k < 0 ? g * (1 + k) : g + (255 - g) * k)},${Math.round(k < 0 ? b * (1 + k) : b + (255 - b) * k)})`;

  // Caixa extrudada: polígono no chão erguido até a altura h (faces viradas para a câmera + tampa).
  function extrude(pts, h, face, top, K) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
    const sgn = area > 0 ? 1 : -1;
    ctx.fillStyle = face;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      if (sgn * -(b.x - a.x) <= 0.001) continue; // só as faces viradas para o "sul" (para a câmera)
      ctx.beginPath();
      ctx.moveTo(a.x, a.y * K); ctx.lineTo(b.x, b.y * K); ctx.lineTo(b.x, b.y * K - h); ctx.lineTo(a.x, a.y * K - h);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = top;
    ctx.beginPath();
    pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y * K - h));
    ctx.closePath(); ctx.fill();
  }

  const rectPts = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const rotPts = (pts, px, py, a) => pts.map(p => ({ x: px + (p.x - px) * Math.cos(a) - (p.y - py) * Math.sin(a), y: py + (p.x - px) * Math.sin(a) + (p.y - py) * Math.cos(a) }));

  // Folha da porta no chão (girada conforme abre).
  function doorPoly(o, g, k) {
    const a = k * Math.PI * 0.5;
    const t = g * 0.08;
    if (o.edge) {
      if (o.v) return rotPts(rectPts(o.x * g - t, o.y * g + g * 0.06, o.x * g + t, o.y * g + g * 0.94), o.x * g, o.y * g + g * 0.06, -a);
      return rotPts(rectPts(o.x * g + g * 0.06, o.y * g - t, o.x * g + g * 0.94, o.y * g + t), o.x * g + g * 0.06, o.y * g, a);
    }
    const cx = o.x * g + g / 2; const cy = o.y * g + g / 2;
    if (o.bars) {
      const len = g * 0.9 * (1 - k * 0.92); // grade desliza para dentro da parede
      return o.dir === 'v' ? rectPts(cx - t, o.y * g + g * 0.05, cx + t, o.y * g + g * 0.05 + len) : rectPts(o.x * g + g * 0.05, cy - t, o.x * g + g * 0.05 + len, cy + t);
    }
    if (o.dir === 'v') return rotPts(rectPts(cx - t, o.y * g + g * 0.05, cx + t, o.y * g + g * 0.95), cx, o.y * g + g * 0.05, -a);
    return rotPts(rectPts(o.x * g + g * 0.05, cy - t, o.x * g + g * 0.95, cy + t), o.x * g + g * 0.05, cy, a);
  }
  const doorColors = o => (o.bars ? ['rgba(95,100,110,0.55)', '#8a909a'] : o.tech ? ['#48505a', '#6c7580'] : ['#5e3c20', '#8a5a34']);

  const objAnim = id => S.objAnim.get(id) ?? 0;
  const flicker = (now, seed) => 0.85 + Math.sin(now / 90 + seed) * 0.08 + Math.sin(now / 37 + seed * 3) * 0.07;

  // Quadrado de parede que abriu: copia o piso de um vizinho e, se foi quebrada, joga entulho.
  function drawPatches(g) {
    const W = S.wallInfo;
    if (!W?.eff || !S.mapImg) return;
    const { cols } = S.state.map;
    for (const [i, o] of W.opened) {
      const c = i % cols; const r = Math.floor(i / cols);
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [c + dx, r + dy]).find(([x, y]) => W.eff[y * cols + x] === '0' && !W.opened.has(y * cols + x));
      if (n) ctx.drawImage(S.mapImg, n[0] * g, n[1] * g, g, g, c * g, r * g, g + 0.5, g + 0.5);
      if (o.type === 'crack') {
        for (let k = 0; k < 9; k++) {
          const hx = ((i * 73 + k * 37) % 100) / 100; const hy = ((i * 29 + k * 61) % 100) / 100;
          ctx.fillStyle = k % 2 ? '#6e665c' : '#8d857a';
          ctx.beginPath(); ctx.arc(c * g + g * (0.12 + hx * 0.76), r * g + g * (0.12 + hy * 0.76), g * (0.05 + (k % 3) * 0.03), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function crackLines(x, y, w, h, seed) {
    ctx.save();
    ctx.strokeStyle = 'rgba(15,10,8,0.85)';
    ctx.lineWidth = Math.max(1.2, w * 0.035);
    ctx.beginPath();
    let px = x + w * 0.5; let py = y;
    ctx.moveTo(px, py);
    for (let k = 1; k <= 5; k++) { px = x + w * (0.3 + (((seed * 13 + k * 29) % 40) / 100)); py = y + (h * k) / 5; ctx.lineTo(px, py); }
    ctx.moveTo(x + w * 0.5, y + h * 0.4); ctx.lineTo(x + w * 0.85, y + h * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  // Objetos vistos de cima (modo 2D) e o que fica no chão em ambos os modos (armadilhas, passagens do mestre).
  function drawObjectsGround(g, now, only3dGround) {
    const z = S.cam.z;
    for (const o of S.state.objects || []) {
      const x = o.x * g; const y = o.y * g; const cx = x + g / 2; const cy = y + g / 2;
      const k = objAnim(o.id);
      if (o.type === 'trap') {
        if (!o.revealed || o.armed) {
          ctx.save(); ctx.setLineDash([g * 0.1, g * 0.07]); ctx.strokeStyle = 'rgba(230,60,50,0.8)'; ctx.lineWidth = 2 / z;
          ctx.strokeRect(x + g * 0.12, y + g * 0.12, g * 0.76, g * 0.76); ctx.restore();
          ctx.fillStyle = 'rgba(230,60,50,0.85)'; ctx.font = `700 ${g * 0.36}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('⚠', cx, cy);
        }
        if (o.revealed) {
          ctx.fillStyle = 'rgba(20,14,10,0.85)'; ctx.fillRect(x + g * 0.15, y + g * 0.15, g * 0.7, g * 0.7);
          ctx.fillStyle = '#b8bcc4';
          for (let s = 0; s < 3; s++) for (let t = 0; t < 3; t++) {
            const sx0 = x + g * (0.22 + s * 0.22); const sy0 = y + g * (0.3 + t * 0.22);
            ctx.beginPath(); ctx.moveTo(sx0, sy0 + g * 0.12); ctx.lineTo(sx0 + g * 0.06, sy0 - g * 0.06); ctx.lineTo(sx0 + g * 0.12, sy0 + g * 0.12); ctx.closePath(); ctx.fill();
          }
        }
        continue;
      }
      if (o.type === 'secret' && !o.open) {
        ctx.save(); ctx.setLineDash([g * 0.08, g * 0.06]); ctx.strokeStyle = 'rgba(180,120,255,0.9)'; ctx.lineWidth = 2 / z;
        ctx.strokeRect(x + g * 0.1, y + g * 0.1, g * 0.8, g * 0.8); ctx.restore();
        ctx.fillStyle = 'rgba(180,120,255,0.9)'; ctx.font = `700 ${g * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', cx, cy);
        continue;
      }
      if (only3dGround) continue;
      if (o.type === 'crack' && !o.broken) crackLines(x + g * 0.1, y + g * 0.1, g * 0.8, g * 0.8, o.x * 31 + o.y);
      if (o.type === 'door') {
        const [face, top] = doorColors(o);
        ctx.fillStyle = o.bars ? face : top;
        const pts = doorPoly(o, g, k);
        ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = Math.max(1, g * 0.02); ctx.stroke();
      }
      if (o.type === 'chest') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + g * 0.24, y + g * 0.36, g * 0.64, g * 0.44);
        ctx.fillStyle = '#6b4526'; ctx.fillRect(x + g * 0.18, y + g * 0.3, g * 0.64, g * 0.44);
        if (k > 0.05) {
          ctx.fillStyle = '#1e140b'; ctx.fillRect(x + g * 0.22, y + g * 0.34, g * 0.56, g * 0.36);
          ctx.fillStyle = '#f4c542'; for (let s = 0; s < 5; s++) { ctx.beginPath(); ctx.arc(x + g * (0.3 + s * 0.1), y + g * (0.5 + (s % 2) * 0.1), g * 0.05, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = '#8a5a34'; ctx.fillRect(x + g * 0.18, y + g * 0.3 - g * 0.22 * k, g * 0.64, g * 0.22 * k);
        } else {
          ctx.fillStyle = '#d4a93a'; ctx.fillRect(x + g * 0.18, y + g * 0.46, g * 0.64, g * 0.08); ctx.fillRect(x + g * 0.46, y + g * 0.3, g * 0.08, g * 0.44);
        }
      }
      if (o.type === 'lever') {
        ctx.fillStyle = '#4a4e56'; ctx.fillRect(cx - g * 0.2, cy - g * 0.08, g * 0.4, g * 0.16);
        const a = -0.8 + k * 1.6;
        ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = g * 0.07; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * g * 0.36, cy - Math.cos(a) * g * 0.36); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(cx + Math.sin(a) * g * 0.36, cy - Math.cos(a) * g * 0.36, g * 0.08, 0, Math.PI * 2); ctx.fill();
      }
      if (o.type === 'torch') {
        ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.arc(cx, cy, g * (o.candle ? 0.07 : 0.13), 0, Math.PI * 2); ctx.fill();
        if (o.lit) {
          const f = flicker(now, o.x * 7 + o.y);
          ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(cx, cy, g * (o.candle ? 0.06 : 0.1) * f, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff1a8'; ctx.beginPath(); ctx.arc(cx, cy, g * (o.candle ? 0.03 : 0.05) * f, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  // Luz das tochas (soma de brilho), no chão.
  function drawGlows(g, now) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const o of S.state.objects || []) {
      if (o.type !== 'torch' || !o.lit) continue;
      const f = flicker(now, o.x * 7 + o.y);
      const cx = o.x * g + g / 2; const cy = o.y * g + g / 2; const R = g * (o.candle ? 1.4 : 2.3) * f;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grd.addColorStop(0, `rgba(${o.color || '255,170,60'},${0.32 * f})`);
      grd.addColorStop(1, `rgba(${o.color || '255,170,60'},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    ctx.restore();
  }

  function drawBlock(c, r, h, g, K, now) {
    const { cols } = S.state.map;
    const x = c * g;
    const top = r * g * K - h;
    const south = (r + 1) * g * K;
    const code = S.wallInfo.eff[r * cols + c];
    // Mistura a cor da imagem com um tom de pedra, para a face não sumir no escuro.
    const avg = cellColor(c, r);
    const stone = code === '1' ? [104, 96, 86] : [70, 74, 86];
    const base = avg.map((v, i) => v * 0.45 + stone[i] * 0.55);
    const hb = cellHeight(c, r + 1, g, now);
    if (hb < h) {
      const grd = ctx.createLinearGradient(0, south - h, 0, south - hb);
      grd.addColorStop(0, rgb(base, -0.35));
      grd.addColorStop(1, rgb(base, -0.65));
      ctx.fillStyle = grd;
      ctx.fillRect(x, south - h, g + 0.5, h - hb);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = Math.max(1, g * 0.015);
      if (code === '1') {
        for (let yy = south - h + g * 0.22; yy < south - hb; yy += g * 0.22) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + g, yy); ctx.stroke(); }
      } else if (code >= '3') {
        // Janelas acesas nos prédios
        for (let yy = south - h + g * 0.18; yy < south - hb - g * 0.12; yy += g * 0.3) {
          for (let xx = 0; xx < 3; xx++) {
            const lit = ((c * 7 + r * 13 + Math.floor(yy) * 3 + xx * 5) % 5) < 2;
            ctx.fillStyle = lit ? 'rgba(255,220,140,0.85)' : 'rgba(10,12,18,0.6)';
            ctx.fillRect(x + g * (0.14 + xx * 0.28), yy, g * 0.16, g * 0.12);
          }
        }
      }
      const crack = S.wallInfo.cracks.get(r * cols + c);
      if (crack) crackLines(x + g * 0.15, south - h, g * 0.7, h - hb, c * 31 + r);
    }
    if (S.mapImg && S.state.map.hasImage) ctx.drawImage(S.mapImg, x, r * g, g, g, x, top, g + 0.5, g * K + 0.5);
    else { ctx.fillStyle = rgb(base); ctx.fillRect(x, top, g + 0.5, g * K + 0.5); }
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(x, top + g * K - Math.max(1, g * 0.03), g + 0.5, Math.max(1, g * 0.03));
    if (S.wallInfo.cracks.has(r * cols + c)) crackLines(x + g * 0.2, top + g * K * 0.1, g * 0.6, g * K * 0.8, c * 17 + r);
    if (S.isGM && S.state.map.fogEnabled && !S.revealed.has(`${c},${r}`)) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, top, g + 0.5, g * K + h);
    }
  }

  function drawObject3D(o, g, K, now) {
    const k = objAnim(o.id);
    const x = o.x * g; const y = o.y * g; const cx = x + g / 2; const cy = y + g / 2;
    if (o.type === 'door') {
      const [face, top] = doorColors(o);
      const pts = doorPoly(o, g, k);
      extrude(pts, g * 0.85, face, top, K);
      if (o.bars) {
        ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = Math.max(1, g * 0.025);
        const [a, b] = [pts[3], pts[2]];
        for (let s = 0; s <= 6; s++) {
          const px = a.x + (b.x - a.x) * (s / 6); const py = (a.y + (b.y - a.y) * (s / 6)) * K;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - g * 0.85); ctx.stroke();
        }
      }
    } else if (o.type === 'chest') {
      const h = g * 0.3;
      extrude(rectPts(x + g * 0.2, y + g * 0.38, x + g * 0.8, y + g * 0.74), h, '#5a3a1e', k > 0.05 ? '#1e140b' : '#7a4f2a', K);
      if (k > 0.05) {
        ctx.fillStyle = '#f4c542';
        for (let s = 0; s < 4; s++) { ctx.beginPath(); ctx.arc(x + g * (0.3 + s * 0.13), (y + g * 0.56) * K - h, g * 0.045, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#8a5a34';
        ctx.fillRect(x + g * 0.2, (y + g * 0.38) * K - h - g * 0.3 * k, g * 0.6, g * 0.3 * k);
      } else {
        ctx.fillStyle = '#d4a93a';
        ctx.fillRect(x + g * 0.46, (y + g * 0.74) * K - h, g * 0.08, h);
      }
    } else if (o.type === 'lever') {
      extrude(rectPts(cx - g * 0.16, cy - g * 0.08, cx + g * 0.16, cy + g * 0.08), g * 0.14, '#3a3e46', '#5a5e68', K);
      const a = -0.8 + k * 1.6;
      const bx = cx; const by = cy * K - g * 0.14;
      const ex = bx + Math.sin(a) * g * 0.42; const ey = by - Math.cos(a) * g * 0.42;
      ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = g * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(ex, ey, g * 0.07, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'torch') {
      const hgt = g * (o.candle ? 0.28 : 0.62);
      ctx.strokeStyle = o.candle ? '#efe6d0' : '#2a2420'; ctx.lineWidth = g * (o.candle ? 0.07 : 0.06); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy * K); ctx.lineTo(cx, cy * K - hgt); ctx.stroke();
      if (!o.candle) { ctx.fillStyle = '#3a302a'; ctx.beginPath(); ctx.ellipse(cx, cy * K - hgt, g * 0.12, g * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
      if (o.lit) {
        const f = flicker(now, o.x * 7 + o.y);
        const fy = cy * K - hgt - g * 0.1 * f;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const grd = ctx.createRadialGradient(cx, fy, 0, cx, fy, g * 0.45);
        grd.addColorStop(0, `rgba(${o.color || '255,170,60'},0.7)`); grd.addColorStop(1, `rgba(${o.color || '255,170,60'},0)`);
        ctx.fillStyle = grd; ctx.fillRect(cx - g * 0.45, fy - g * 0.45, g * 0.9, g * 0.9);
        ctx.restore();
        ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.ellipse(cx, fy, g * 0.07 * f, g * 0.13 * f, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff1a8'; ctx.beginPath(); ctx.ellipse(cx, fy + g * 0.03, g * 0.035, g * 0.06 * f, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // SVG da galeria não tem tamanho próprio: desenha uma vez num quadrado de 256 px para poder recortar.
  const squareCache = new WeakMap();
  function squareImg(img) {
    if (!img) return null;
    let c = squareCache.get(img);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, 0, 0, 256, 256);
      squareCache.set(img, c);
    }
    return c;
  }

  // Miniatura em pé (modo 2.5D): base colorida + cartão com o retrato.
  const miniBox = (t, g) => {
    const s = (t.size || 1) * g;
    return { s, w: s * 0.74, h: s * 1.12 };
  };

  function drawMini(v, g, K, now, isTurn) {
    const t = v.t;
    const { s, w, h } = miniBox(t, g);
    const age = (now - v.born) / 1000;
    let scale = age < 0.45 ? ease.outBack(clamp(age / 0.45, 0, 1)) : 1;
    let alpha = t.hidden ? 0.5 : 1;
    if (v.gone != null) { const kk = clamp((now - v.gone) / 320, 0, 1); scale *= 1 - kk * 0.5; alpha *= 1 - kk; }
    if (alpha <= 0 || scale <= 0) return;
    const hitK = (now - v.hitT) / 500;
    const shakeX = hitK < 1 ? Math.sin(hitK * 40) * (1 - hitK) * g * 0.1 : 0;
    const cx = v.x * g + s / 2 + shakeX;
    const gy = (v.y * g + s / 2) * K;
    const lift = v.hop * g * 0.25;
    const rx = s * 0.36; const ry = s * 0.36 * K;
    ctx.globalAlpha = alpha;
    // sombra e base
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx + s * 0.06, gy + s * 0.04, rx * 1.1, ry * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(cx, gy + g * 0.05, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.ellipse(cx, gy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, g * 0.02); ctx.stroke();
    if (isTurn) {
      const pulse = (Math.sin(now / 250) + 1) / 2;
      ctx.save(); ctx.shadowColor = S.colors.accent; ctx.shadowBlur = 10 + pulse * 14;
      ctx.strokeStyle = S.colors.accent; ctx.lineWidth = g * 0.05;
      ctx.beginPath(); ctx.ellipse(cx, gy, rx + g * (0.08 + pulse * 0.04), ry + g * (0.08 + pulse * 0.04) * K, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (t.id === S.selected) {
      ctx.save(); ctx.setLineDash([g * 0.1, g * 0.07]); ctx.strokeStyle = S.colors.accent; ctx.lineWidth = 2.5 / S.cam.z;
      ctx.beginPath(); ctx.ellipse(cx, gy, rx + g * 0.14, ry + g * 0.14 * K, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    const healK = (now - v.healT) / 900;
    if (healK < 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(111,255,143,${1 - healK})`; ctx.lineWidth = g * 0.06;
      ctx.beginPath(); ctx.ellipse(cx, gy, rx + healK * g * 0.3, ry + healK * g * 0.3 * K, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // cartão (cai de lado quando o token é derrubado)
    const bottom = gy - s * 0.06 - lift;
    const breath = v.downK > 0.5 ? 1 : 1 + Math.sin(now / 700 + v.phase) * 0.015;
    ctx.save();
    ctx.translate(cx, bottom);
    ctx.rotate(v.downK * 1.25);
    ctx.scale(scale, scale * breath);
    const pad = w * 0.07;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-w / 2 + w * 0.08, -h + w * 0.06, w, h);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h, w, h, w * 0.1); else ctx.rect(-w / 2, -h, w, h);
    ctx.fillStyle = '#1b1712'; ctx.fill();
    ctx.lineWidth = Math.max(2 / S.cam.z, g * 0.045); ctx.strokeStyle = t.color; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.rect(-w / 2 + pad, -h + pad, w - pad * 2, h - pad * 2); ctx.clip();
    if (v.downK > 0.01) ctx.filter = `grayscale(${v.downK}) brightness(${1 - v.downK * 0.35})`;
    const img = squareImg(getImg(t.img));
    const iw = w - pad * 2; const ih = h - pad * 2;
    if (img) {
      const sw = img.width * (iw / ih); // recorta o retrato quadrado para o formato do cartão
      ctx.drawImage(img, (img.width - sw) / 2, 0, sw, img.height, -w / 2 + pad, -h + pad, iw, ih);
    } else {
      ctx.fillStyle = t.color; ctx.fillRect(-w / 2 + pad, -h + pad, iw, ih);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${iw * 0.45}px Inter, sans-serif`; ctx.fillText(initials(t.name), 0, -h / 2);
    }
    ctx.filter = 'none';
    if (hitK < 1) { ctx.fillStyle = `rgba(255,30,30,${0.6 * (1 - hitK)})`; ctx.fillRect(-w / 2, -h, w, h); }
    ctx.restore();
    if (v.downK > 0.4) {
      ctx.globalAlpha = alpha * v.downK; ctx.font = `${w * 0.55}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💀', 0, -h / 2);
      ctx.globalAlpha = alpha;
    }
    ctx.restore();
    if (t.hpState === 'hurt') {
      ctx.beginPath(); ctx.arc(cx + w * 0.45, bottom - h + g * 0.05, g * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = '#d0303a'; ctx.fill(); ctx.lineWidth = 1.5 / S.cam.z; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    if (t.maxHp > 0 && t.hp != null) {
      const pct = clamp(t.hp / t.maxHp, 0, 1);
      const bw = w; const bh = Math.max(g * 0.08, 4 / S.cam.z);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(cx - bw / 2, bottom - h - bh - g * 0.06, bw, bh);
      ctx.fillStyle = pct > 0.5 ? S.colors.ok : pct > 0.25 ? S.colors.warn : S.colors.danger;
      ctx.fillRect(cx - bw / 2, bottom - h - bh - g * 0.06, bw * pct, bh);
    }
    let label = t.hidden ? `${t.name} (oculto)` : t.name;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(g * 0.2, 11 / S.cam.z)}px Inter, sans-serif`;
    const maxW = s * 1.1;
    if (ctx.measureText(label).width > maxW) { while (label.length > 2 && ctx.measureText(`${label}…`).width > maxW) label = label.slice(0, -1); label += '…'; }
    const tw = ctx.measureText(label).width; const lh = Math.max(g * 0.26, 14 / S.cam.z); const ly = gy + ry + g * 0.04;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cx - tw / 2 - 4 / S.cam.z, ly, tw + 8 / S.cam.z, lh);
    ctx.fillStyle = '#fff'; ctx.fillText(label, cx, ly + lh / 2);
    ctx.globalAlpha = 1;
  }

  // Cena 2.5D: desenha de trás para frente, fileira por fileira (paredes, objetos e miniaturas).
  function drawScene3D(g, K, now) {
    const { cols, rows } = S.state.map;
    const W = S.wallInfo || { h: new Map(), v: new Map() };
    const turnId = turnTokenId();
    const minis = new Map();
    const objs = new Map();
    const hDoors = new Map();
    const vDoors = new Map();
    const push = (m, k, x) => { if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
    for (const v of vis.values()) push(minis, clamp(Math.floor(v.y + (v.t.size || 1) / 2 - 0.001), 0, rows - 1), v);
    for (const o of S.state.objects || []) {
      if (o.edge) push(o.v ? vDoors : hDoors, o.y, o);
      else if (['door', 'chest', 'lever', 'torch'].includes(o.type)) push(objs, o.y, o);
    }
    const wallH = g * 0.9;
    const thin = g * 0.09;
    for (let r = 0; r <= rows; r++) {
      for (const x of W.h.get(r) || []) extrude(rectPts(x * g - thin, r * g - thin, (x + 1) * g + thin, r * g + thin), wallH, '#3b2a1c', '#6a4c34', K);
      for (const o of hDoors.get(r) || []) { const [f, tp] = doorColors(o); extrude(doorPoly(o, g, objAnim(o.id)), g * 0.8, f, tp, K); }
      if (r === rows) break;
      for (let c = 0; c < cols; c++) { const h = cellHeight(c, r, g, now); if (h > 0) drawBlock(c, r, h, g, K, now); }
      for (const x of W.v.get(r) || []) extrude(rectPts(x * g - thin, r * g - thin, x * g + thin, (r + 1) * g + thin), wallH, '#3b2a1c', '#6a4c34', K);
      for (const o of vDoors.get(r) || []) { const [f, tp] = doorColors(o); extrude(doorPoly(o, g, objAnim(o.id)), g * 0.8, f, tp, K); }
      for (const o of objs.get(r) || []) drawObject3D(o, g, K, now);
      for (const v of (minis.get(r) || []).sort((a, b) => a.y - b.y)) drawMini(v, g, K, now, v.t.id === turnId);
    }
  }

  function draw(now) {
    const C = S.colors;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.stage || '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const st = S.state;
    if (!st) return;
    const { grid: g, cols, rows, fogEnabled } = st.map;
    const W = cols * g;
    const H = rows * g;
    const z = S.cam.z;
    const K = tilt();
    const sx = shake ? (Math.random() - 0.5) * shake * 18 : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * 18 : 0;
    const ox = dpr * (S.cam.x + sx); const oy = dpr * (S.cam.y + sy);
    const ground = () => ctx.setTransform(dpr * z, 0, 0, dpr * z * K, ox, oy);
    const flat = () => ctx.setTransform(dpr * z, 0, 0, dpr * z, ox, oy);
    ground();

    ctx.fillStyle = C.board;
    ctx.fillRect(0, 0, W, H);
    if (S.mapImg && st.map.hasImage) ctx.drawImage(S.mapImg, 0, 0, st.map.imageW, st.map.imageH);
    drawPatches(g);

    ctx.beginPath();
    for (let c = 0; c <= cols; c++) { ctx.moveTo(c * g, 0); ctx.lineTo(c * g, H); }
    for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * g); ctx.lineTo(W, r * g); }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1 / z;
    ctx.stroke();

    drawObjectsGround(g, now, K !== 1);
    drawGlows(g, now);

    if (fogEnabled) {
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!S.revealed.has(`${c},${r}`)) ctx.rect(c * g - 0.5, r * g - 0.5, g + 1, g + 1);
        }
      }
      ctx.fillStyle = S.isGM ? 'rgba(0, 0, 0, 0.55)' : C.fog;
      ctx.fill();
    }

    // Alcance de visão do monstro selecionado (só o mestre vê)
    const sel = S.isGM && S.selected && vis.get(S.selected);
    if (sel && !sel.t.owner && (sel.t.vision ?? 6) > 0) {
      const c = centerOf(sel);
      const R = (sel.t.vision ?? 6) * g;
      ctx.save();
      ctx.fillStyle = 'rgba(220, 50, 40, 0.07)';
      ctx.strokeStyle = 'rgba(230, 70, 60, 0.7)';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([8 / z, 6 / z]);
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Pincel do mestre
    if (isBrush() && S.hover) {
      const half = (S.brush - 1) / 2;
      const c0 = Math.floor(S.hover.x / g) - half;
      const r0 = Math.floor(S.hover.y / g) - half;
      ctx.strokeStyle = S.tool === 'reveal' ? '#ffe9a8' : '#8aa0ff';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([6 / z, 4 / z]);
      ctx.strokeRect(c0 * g, r0 * g, S.brush * g, S.brush * g);
      ctx.setLineDash([]);
    }
    // Área da habilidade que o mestre está mirando
    if (S.tool.startsWith('abl:') && S.hover) {
      const [, id, i] = S.tool.split(':');
      const ab = abilitiesOfToken(st.tokens.find(t => t.id === id))[Number(i)];
      const rad = ab?.radius || 0;
      const c0 = Math.floor(S.hover.x / g) - rad; const r0 = Math.floor(S.hover.y / g) - rad;
      ctx.fillStyle = 'rgba(255,90,40,0.18)'; ctx.fillRect(c0 * g, r0 * g, (rad * 2 + 1) * g, (rad * 2 + 1) * g);
      ctx.strokeStyle = '#ff7a3a'; ctx.lineWidth = 2 / z; ctx.setLineDash([6 / z, 4 / z]);
      ctx.strokeRect(c0 * g, r0 * g, (rad * 2 + 1) * g, (rad * 2 + 1) * g); ctx.setLineDash([]);
    }
    // Onde o objeto vai ser colocado
    if (S.tool.startsWith('obj:') && S.hover) {
      ctx.strokeStyle = '#7fd1ff'; ctx.lineWidth = 2 / z; ctx.setLineDash([6 / z, 4 / z]);
      ctx.strokeRect(Math.floor(S.hover.x / g) * g, Math.floor(S.hover.y / g) * g, g, g);
      ctx.setLineDash([]);
    }

    if (K === 1) {
      const turnId = turnTokenId();
      const order = [...vis.values()].sort((a, b) => (a.t.id === S.selected) - (b.t.id === S.selected) || a.y - b.y);
      for (const v of order) drawToken(v, g, z, now, v.t.id === turnId);
    } else {
      flat();
      drawScene3D(g, K, now);
      ground();
    }

    for (const e of effects) drawEffect(e, g, now);
    drawParticles();

    // Pings
    S.pings = S.pings.filter(p => now - p.t < 1600);
    for (const p of S.pings) {
      const k = (now - p.t) / 1600;
      for (let i = 0; i < 2; i++) {
        const kk = (k + i * 0.3) % 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + kk * g * 1.4, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 1 - kk;
        ctx.lineWidth = 3 / z;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(0, 0, W, H);

    flat();
    drawFloaters(g, now, K);
  }

  function drawToken(v, g, z, now, isTurn) {
    const t = v.t;
    const s = (t.size || 1) * g;
    const r = s * 0.42;
    const age = (now - v.born) / 1000;
    let scale = age < 0.45 ? ease.outBack(clamp(age / 0.45, 0, 1)) : 1;
    let alpha = t.hidden ? 0.5 : 1;
    if (v.gone != null) {
      const k = clamp((now - v.gone) / 320, 0, 1);
      scale *= 1 - k * 0.5;
      alpha *= 1 - k;
    }
    if (alpha <= 0 || scale <= 0) return;

    const baseX = v.x * g + s / 2;
    const baseY = v.y * g + s / 2;
    const hitK = (now - v.hitT) / 500;
    const shakeX = hitK < 1 ? Math.sin(hitK * 40) * (1 - hitK) * g * 0.1 : 0;
    const breath = v.downK > 0.5 ? 1 : 1 + Math.sin(now / 700 + v.phase) * 0.022;
    const cx = baseX + shakeX;
    const cy = baseY - v.hop * g * 0.18;

    // Sombra no chão (encolhe quando o token pula)
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + r * 0.92, r * (0.85 - v.hop * 0.25) * scale, r * 0.26 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;

    // Anel pulsante de quem está na vez
    if (isTurn) {
      const pulse = (Math.sin(now / 250) + 1) / 2;
      ctx.save();
      ctx.shadowColor = S.colors.accent;
      ctx.shadowBlur = 10 + pulse * 16;
      ctx.strokeStyle = S.colors.accent;
      ctx.lineWidth = g * 0.06;
      ctx.beginPath();
      ctx.arc(cx, cy, r + g * (0.1 + pulse * 0.04), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(now / 900);
      ctx.setLineDash([g * 0.12, g * 0.1]);
      ctx.strokeStyle = S.colors.accent;
      ctx.lineWidth = g * 0.03;
      ctx.beginPath();
      ctx.arc(0, 0, r + g * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Brilho de cura
    const healK = (now - v.healT) / 900;
    if (healK < 1) {
      ctx.save();
      ctx.shadowColor = '#6fff8f';
      ctx.shadowBlur = 24 * (1 - healK);
      ctx.strokeStyle = `rgba(111, 255, 143, ${1 - healK})`;
      ctx.lineWidth = g * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, r + g * 0.06 + healK * g * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(v.downK * -0.5);
    ctx.scale(scale * breath, scale * breath);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.fill();

    ctx.save();
    ctx.clip();
    if (v.downK > 0.01) ctx.filter = `grayscale(${v.downK}) brightness(${1 - v.downK * 0.35})`;
    const img = getImg(t.img);
    if (img) {
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${r * 0.8}px Inter, sans-serif`;
      ctx.fillText(initials(t.name), 0, r * 0.04);
    }
    ctx.filter = 'none';
    if (hitK < 1) {
      ctx.fillStyle = `rgba(255, 30, 30, ${0.6 * (1 - hitK)})`;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2.5 / z, g * 0.065);
    ctx.strokeStyle = t.color;
    ctx.stroke();
    if (t.owner === pid) {
      ctx.beginPath();
      ctx.arc(0, 0, r + g * 0.045, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5 / z, g * 0.025);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    if (v.downK > 0.4) {
      ctx.globalAlpha = alpha * v.downK;
      ctx.font = `${r * 0.95}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💀', 0, r * 0.05);
      ctx.globalAlpha = alpha;
    }
    ctx.restore();

    if (t.id === S.selected) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-now / 1200);
      ctx.setLineDash([g * 0.12, g * 0.08]);
      ctx.beginPath();
      ctx.arc(0, 0, r + g * 0.13, 0, Math.PI * 2);
      ctx.strokeStyle = S.colors.accent;
      ctx.lineWidth = 2.5 / z;
      ctx.stroke();
      ctx.restore();
    }

    // Monstro ferido (o jogador não vê os PV, só uma gota de sangue)
    if (t.hpState === 'hurt') {
      ctx.beginPath();
      ctx.arc(cx + r * 0.78, cy - r * 0.78, g * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#d0303a';
      ctx.fill();
      ctx.lineWidth = 1.5 / z;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }

    // Nome
    let label = t.hidden ? `${t.name} (oculto)` : t.name;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(g * 0.2, 11 / z)}px Inter, sans-serif`;
    // Corta nomes longos para não encavalar com o token vizinho.
    const maxW = s * 1.05;
    if (ctx.measureText(label).width > maxW) {
      while (label.length > 2 && ctx.measureText(`${label}…`).width > maxW) label = label.slice(0, -1);
      label += '…';
    }
    const tw = ctx.measureText(label).width;
    const ly = baseY + s / 2 + g * 0.02;
    const lh = Math.max(g * 0.28, 15 / z);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(baseX - tw / 2 - 4 / z, ly, tw + 8 / z, lh);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, baseX, ly + lh / 2);

    // Barra de PV
    if (t.maxHp > 0 && t.hp != null) {
      const pct = clamp(t.hp / t.maxHp, 0, 1);
      const bw = s * 0.8;
      const bh = Math.max(g * 0.09, 4 / z);
      const bx = baseX - bw / 2;
      const by = cy - r - g * 0.16 - bh;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.5 ? S.colors.ok : pct > 0.25 ? S.colors.warn : S.colors.danger;
      ctx.fillRect(bx, by, bw * pct, bh);
    }
    ctx.globalAlpha = 1;
  }

  function drawEffect(e, g, now) {
    const age = (now - e.born) / 1000;
    const col = FX_COLORS[S.state.system];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    if (e.kind === 'slash') {
      // Três cortes em sequência
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const p = clamp((age - i * 0.08) / 0.16, 0, 1);
        if (p <= 0) continue;
        const fade = clamp(1 - (age - i * 0.08 - 0.16) / 0.22, 0, 1);
        ctx.save();
        ctx.rotate(-0.9 + i * 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, g * 0.6, -1.3, -1.3 + p * 2.4);
        ctx.strokeStyle = `rgba(255, 70, 70, ${fade * 0.7})`;
        ctx.lineWidth = g * 0.16 * (1 - p * 0.4);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${fade})`;
        ctx.lineWidth = g * 0.05;
        ctx.stroke();
        ctx.restore();
      }
    } else if (e.kind === 'magic') {
      // Círculo rúnico girando
      const k = clamp(age / e.duration, 0, 1);
      const R = g * (0.35 + ease.outCubic(Math.min(1, k * 2)) * 0.8);
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.translate(e.x, e.y);
      ctx.rotate(age * 2.2);
      ctx.strokeStyle = col.magic;
      ctx.shadowColor = col.magic;
      ctx.shadowBlur = g * 0.4;
      ctx.lineWidth = g * 0.04;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, Math.PI * 2); ctx.stroke();
      for (let tri = 0; tri < 2; tri++) {
        ctx.beginPath();
        for (let j = 0; j < 3; j++) {
          const a = tri * Math.PI / 3 + j * (Math.PI * 2 / 3) - Math.PI / 2;
          ctx[j ? 'lineTo' : 'moveTo'](Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.fillStyle = col.magic;
      for (let j = 0; j < 12; j++) {
        const a = j * Math.PI / 6;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.89, Math.sin(a) * R * 0.89, g * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
      if (k < 0.5) {
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.7);
        grd.addColorStop(0, `rgba(255, 255, 255, ${0.8 * (1 - k * 2)})`);
        grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2); ctx.fill();
      }
    } else if (e.kind === 'blast') {
      const k = clamp(age / e.duration, 0, 1);
      ctx.translate(e.x, e.y);
      if (k < 0.25) {
        const kk = k / 0.25;
        const R = g * 1.8 * ease.outCubic(kk);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        grd.addColorStop(0, `rgba(255, 255, 230, ${1 - kk})`);
        grd.addColorStop(0.4, `rgba(255, 160, 40, ${0.9 * (1 - kk)})`);
        grd.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, g * (0.3 + ease.outCubic(k) * 2.6), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 170, 60, ${1 - k})`;
      ctx.lineWidth = g * 0.18 * (1 - k) + 0.1;
      ctx.stroke();
    } else if (e.kind === 'heal') {
      const k = clamp(age / e.duration, 0, 1);
      const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, g * 1.1);
      grd.addColorStop(0, `rgba(111, 255, 143, ${0.45 * (1 - k)})`);
      grd.addColorStop(1, 'rgba(111, 255, 143, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(e.x, e.y, g * 1.1, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'shot') {
      if (e.from && age < e.travel) {
        const p = age / e.travel;
        const hx = e.from.x + (e.x - e.from.x) * p;
        const hy = e.from.y + (e.y - e.from.y) * p;
        const tp = Math.max(0, p - 0.3);
        const tx = e.from.x + (e.x - e.from.x) * tp;
        const ty = e.from.y + (e.y - e.from.y) * tp;
        const grd = ctx.createLinearGradient(tx, ty, hx, hy);
        grd.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grd.addColorStop(1, col.shot);
        ctx.strokeStyle = grd;
        ctx.lineWidth = g * 0.06;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = col.shot;
        ctx.shadowBlur = g * 0.3;
        ctx.beginPath(); ctx.arc(hx, hy, g * 0.06, 0, Math.PI * 2); ctx.fill();
      } else {
        const k = clamp((age - e.travel) / 0.4, 0, 1);
        ctx.beginPath();
        ctx.arc(e.x, e.y, g * (0.1 + k * 0.6), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 230, 150, ${1 - k})`;
        ctx.lineWidth = g * 0.06 * (1 - k) + 0.1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const k = p.age / p.life;
      ctx.globalAlpha = 1 - k;
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      if (p.shape === 'plus') {
        const a = p.size;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - a, p.y - a * 0.3, a * 2, a * 0.6);
        ctx.fillRect(p.x - a * 0.3, p.y - a, a * 0.6, a * 2);
      } else if (p.shape === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else if (p.shape === 'smoke') {
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + k * 1.5), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Desenhado sem a inclinação do chão (texto não pode achatar); no 2.5D sobe acima da miniatura.
  function drawFloaters(g, now, K = 1) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floaters) {
      const age = (now - f.born) / 1000;
      if (age < 0) continue;
      const k = age / f.life;
      const v = f.tokenId && vis.get(f.tokenId);
      let x = f.x;
      let y = f.y == null ? null : f.y * K;
      if (v) {
        const c = centerOf(v);
        x = c.x;
        y = K === 1 ? c.y - (v.t.size || 1) * g * 0.45 : c.y * K - miniBox(v.t, g).h - g * 0.2;
      }
      if (x == null || y == null) continue;
      y -= g * (0.2 + 0.6 * ease.outCubic(Math.min(1, k * 1.4)) + (f.dy || 0));
      const pop = k < 0.12 ? ease.outBack(k / 0.12) : 1;
      ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      if (f.bubble) {
        ctx.font = `700 ${g * 0.3 * pop}px Inter, sans-serif`;
        const w = ctx.measureText(f.text).width + g * 0.3;
        const h = g * 0.44 * pop;
        ctx.fillStyle = f.bg;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
        ctx.fill();
        ctx.lineWidth = g * 0.025;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(f.text, x, y + g * 0.01);
      } else {
        const size = g * (f.small ? 0.26 : 0.42) * pop;
        ctx.font = `800 ${size}px Inter, sans-serif`;
        ctx.lineWidth = size * 0.18;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x, y);
      }
    }
    ctx.restore();
  }

  // Balão com o resultado do dado em cima do token de quem rolou.
  function rollBubble(m) {
    if (!S.state || m.type !== 'roll' || (!m.pid && !m.tokenId)) return;
    const tok = m.tokenId ? S.state.tokens.find(t => t.id === m.tokenId) : S.state.tokens.find(t => t.owner === m.pid);
    if (!tok) return;
    const v = rollView(m.roll);
    const bg = v.verdict?.[1] === 'good' ? '#2e8b57' : v.verdict?.[1] === 'bad' ? '#b03030' : 'rgba(20, 20, 26, 0.92)';
    floaters.push({ tokenId: tok.id, text: `🎲 ${v.total}`, bubble: true, bg, born: performance.now(), life: 2.6, dy: 0.25 });
  }

  // ---------- interação com o mapa ----------
  const isBrush = () => S.isGM && (S.tool === 'reveal' || S.tool === 'hide');

  // Ponto no chão debaixo do mouse (no 2.5D o chão está achatado).
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - S.cam.x) / S.cam.z, y: (e.clientY - r.top - S.cam.y) / S.cam.z / tilt() };
  }

  // Ponto na tela sem achatar (para acertar coisas em pé: miniaturas, paredes).
  function toFlat(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - S.cam.x) / S.cam.z, y: (e.clientY - r.top - S.cam.y) / S.cam.z };
  }

  function tokenAtScreen(e) {
    const g = S.state.map.grid;
    const p = toFlat(e);
    const list = [...S.state.tokens].sort((a, b) => (b.y + (b.size || 1) / 2) - (a.y + (a.size || 1) / 2));
    for (const t of list) {
      const { s, w, h } = miniBox(t, g);
      const cx = t.x * g + s / 2; const gy = (t.y * g + s / 2) * TILT; const bottom = gy - s * 0.06;
      if (p.x >= cx - w / 2 && p.x <= cx + w / 2 && p.y >= bottom - h && p.y <= bottom) return t;
      if (((p.x - cx) / (s * 0.4)) ** 2 + ((p.y - gy) / (s * 0.4 * TILT)) ** 2 <= 1) return t;
    }
    return null;
  }

  // Objeto interativo debaixo do mouse (no 2.5D também acerta a parte em pé: parede rachada, porta, baú…).
  function objectAt(e, w) {
    const g = S.state.map.grid;
    const objs = (S.state.objects || []).filter(o => !(o.type === 'crack' && o.broken) && (S.isGM || o.type !== 'secret'));
    if (S.view3d) {
      const p = toFlat(e);
      const standing = objs.filter(o => !o.edge && o.type !== 'trap' && o.type !== 'secret').sort((a, b) => b.y - a.y);
      for (const o of standing) {
        const top = o.type === 'crack' ? cellHeight(o.x, o.y, g, performance.now()) : g * 0.9;
        if (p.x >= o.x * g && p.x <= (o.x + 1) * g && p.y >= o.y * g * TILT - top && p.y <= (o.y + 1) * g * TILT) return o;
      }
    }
    const c = Math.floor(w.x / g); const r = Math.floor(w.y / g);
    const cellHit = objs.find(o => !o.edge && o.x === c && o.y === r);
    if (cellHit) return cellHit;
    return objs.find(o => o.edge && (o.v
      ? Math.abs(w.x - o.x * g) < g * 0.3 && w.y >= o.y * g && w.y <= (o.y + 1) * g
      : Math.abs(w.y - o.y * g) < g * 0.3 && w.x >= o.x * g && w.x <= (o.x + 1) * g)) || null;
  }

  // Mestre coloca objetos com a ferramenta escolhida na barra.
  function placeObject(kind, w) {
    const { grid: g, cols, rows } = S.state.map;
    const c = Math.floor(w.x / g); const r = Math.floor(w.y / g);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const eff = S.wallInfo?.eff;
    const isWall = (x, y) => !!eff && x >= 0 && y >= 0 && x < cols && y < rows && eff[y * cols + x] !== '0';
    if (kind === 'remove') {
      const o = objectAt({ clientX: 0, clientY: 0 }, w);
      if (o) socket.emit('obj:remove', { id: o.id }); else toast('Não há objeto aí.');
      return;
    }
    if (['secret', 'crack', 'break'].includes(kind)) {
      if (!isWall(c, r)) return toast('Escolha um quadrado de parede (só em mapas gerados).');
      socket.emit('obj:add', kind === 'break' ? { type: 'crack', x: c, y: r, broken: true } : { type: kind, x: c, y: r });
      return;
    }
    if (isWall(c, r)) return toast('Coloque em um quadrado livre.');
    const payload = { type: kind, x: c, y: r };
    if (kind === 'door') payload.dir = isWall(c, r - 1) && isWall(c, r + 1) ? 'v' : 'h';
    if (kind === 'chest') {
      const loot = prompt('O que tem dentro do baú?', 'algumas moedas');
      if (loot === null) return;
      payload.loot = loot;
    }
    if (kind === 'torch') payload.lit = true;
    socket.emit('obj:add', payload);
  }

  function editObject(o) {
    if (o.type === 'chest') {
      const loot = prompt('O que tem dentro do baú?', o.loot || '');
      if (loot !== null) socket.emit('obj:update', { id: o.id, patch: { loot } });
    } else if (o.type === 'trap') {
      const damage = prompt('Dano da armadilha (ex.: 2d6, 3d8+2):', o.damage || '2d6');
      if (damage !== null) socket.emit('obj:update', { id: o.id, patch: { damage } });
    } else {
      toast('Alt+clique edita baús e armadilhas. Para apagar, use 🧩 → Remover objeto.');
    }
  }

  socket.on('move:blocked', () => toast('Caminho bloqueado: parede ou porta fechada no caminho.'));
  socket.on('obj:far', () => toast('Chegue mais perto (encoste no objeto) para usar.'));

  function tokenAt(w) {
    const g = S.state.map.grid;
    const list = S.state.tokens;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      const s = (t.size || 1) * g;
      if (Math.hypot(w.x - (t.x * g + s / 2), w.y - (t.y * g + s / 2)) <= s * 0.46) return t;
    }
    return null;
  }

  function paintAt(w) {
    const { grid: g, cols, rows } = S.state.map;
    const half = (S.brush - 1) / 2;
    const c0 = Math.floor(w.x / g);
    const r0 = Math.floor(w.y / g);
    for (let dc = -half; dc <= half; dc++) {
      for (let dr = -half; dr <= half; dr++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const key = `${c},${r}`;
        if (S.paint.reveal === S.revealed.has(key)) continue;
        if (S.paint.reveal) S.revealed.add(key); else S.revealed.delete(key);
        S.paint.cells.push([c, r]);
      }
    }
    if (!S.paintTimer) S.paintTimer = setTimeout(flushPaint, 100);
  }

  function flushPaint() {
    clearTimeout(S.paintTimer);
    S.paintTimer = null;
    if (S.paint?.cells.length) {
      socket.emit('fog:paint', { cells: S.paint.cells, reveal: S.paint.reveal });
      S.paint.cells = [];
    }
  }

  // De onde sai um disparo: o token selecionado (mestre) ou o próprio token (jogador).
  function fxSource() {
    if (S.isGM) return S.selected;
    return S.state.tokens.find(t => t.owner === pid)?.id || null;
  }

  function castFx(kind, w, hit) {
    const g = S.state.map.grid;
    const target = hit ? { x: hit.x * g + (hit.size || 1) * g / 2, y: hit.y * g + (hit.size || 1) * g / 2 } : w;
    const from = fxSource();
    socket.emit('fx:cast', { kind, x: target.x, y: target.y, from: hit && hit.id === from ? null : from });
  }

  // Clique no mapa, comum ao 2D, 2.5D e 3D. w = ponto no chão (em pixels do mapa); hitToken/hitObject já
  // vêm calculados por quem chamou. Devolve false quando o clique cai no "vazio" (aí vira mover a visão).
  function pointerDownAt(e, w, hitToken, hitObject) {
    if (e.shiftKey) { socket.emit('ping', w); return true; }
    if (S.tool.startsWith('fx:')) { castFx(S.tool.slice(3), w, hitToken); return true; }
    if (S.tool.startsWith('obj:') && S.isGM) { placeObject(S.tool.slice(4), w); return true; }
    if (S.tool.startsWith('atk:')) {
      const [, id, i] = S.tool.split(':');
      if (!hitToken || hitToken.id === id) { toast('Clique no token que vai receber o ataque.'); return true; }
      socket.emit('combat:attack', { attacker: id, index: Number(i), target: hitToken.id });
      setTool('move');
      return true;
    }
    if (S.tool.startsWith('abl:')) {
      const [, id, i] = S.tool.split(':');
      const g = S.state.map.grid;
      socket.emit('combat:ability', { actor: id, index: Number(i), x: Math.floor(w.x / g), y: Math.floor(w.y / g) });
      setTool('move');
      return true;
    }
    if (isBrush()) {
      S.paint = { reveal: S.tool === 'reveal', cells: [] };
      paintAt(w);
      return true;
    }
    const t = hitToken;
    if (t && (S.isGM || t.owner === pid)) {
      const g = S.state.map.grid;
      S.drag = { id: t.id, dx: w.x / g - t.x, dy: w.y / g - t.y, x: t.x, y: t.y };
      select(t.id);
      return true;
    }
    // Clique em porta, baú, tocha, alavanca, parede rachada… (Alt+clique do mestre edita)
    if (!t && hitObject) {
      if (e.altKey && S.isGM) editObject(hitObject);
      else socket.emit('obj:use', { id: hitObject.id });
      return true;
    }
    select(null);
    return false;
  }

  function pointerMoveAt(w) {
    S.hover = w;
    if (S.paint) {
      paintAt(w);
    } else if (S.drag) {
      const g = S.state.map.grid;
      const now = performance.now();
      S.drag.x = w.x / g - S.drag.dx;
      S.drag.y = w.y / g - S.drag.dy;
      S.drag.lastMoveT = now;
      const t = S.state.tokens.find(x => x.id === S.drag.id);
      if (t) { t.x = S.drag.x; t.y = S.drag.y; }
      if (now - S.lastMove > 50) {
        S.lastMove = now;
        socket.emit('token:move', { id: S.drag.id, x: S.drag.x, y: S.drag.y });
      }
    }
  }

  canvas.addEventListener('pointerdown', e => {
    if (!S.state) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético ou já liberado */ }
    const w = toWorld(e);
    if (e.button === 1 || e.button === 2) { S.pan = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    const t = S.view3d ? tokenAtScreen(e) : tokenAt(w);
    if (pointerDownAt(e, w, t, t ? null : objectAt(e, w))) {
      if (S.drag) canvas.classList.add('grabbing');
      return;
    }
    S.pan = { x: e.clientX, y: e.clientY };
    canvas.classList.add('grabbing');
  });

  canvas.addEventListener('pointermove', e => {
    if (!S.state) return;
    const w = toWorld(e);
    if (S.pan) {
      S.hover = w;
      S.camTouched = true;
      S.cam.x += e.clientX - S.pan.x;
      S.cam.y += e.clientY - S.pan.y;
      S.pan = { x: e.clientX, y: e.clientY };
    } else {
      pointerMoveAt(w);
    }
  });

  function endPointer() {
    if (S.drag) {
      const m = S.state.map;
      const t = S.state.tokens.find(x => x.id === S.drag.id);
      const s = t?.size || 1;
      const x = clamp(Math.round(S.drag.x), 0, m.cols - s);
      const y = clamp(Math.round(S.drag.y), 0, m.rows - s);
      if (t) { t.x = x; t.y = y; }
      socket.emit('token:move', { id: S.drag.id, x, y });
      S.drag = null; // o token desliza sozinho até o quadrado encaixado
    }
    if (S.paint) { flushPaint(); S.paint = null; }
    S.pan = null;
    canvas.classList.remove('grabbing');
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { S.hover = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function zoomAt(sx, sy, factor) {
    S.camTouched = true;
    const z = clamp(S.cam.z * factor, 0.15, 4);
    const k = z / S.cam.z;
    S.cam.x = sx - (sx - S.cam.x) * k;
    S.cam.y = sy - (sy - S.cam.y) * k;
    S.cam.z = z;
  }
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  const stageCenter = () => { const s = $('#stage'); return [s.clientWidth / 2, s.clientHeight / 2]; };
  const in3d = () => S.viewMode === '3d' && window.MESA3D;
  $('#zoom-in').addEventListener('click', () => (in3d() ? window.MESA3D.zoom(0.8) : zoomAt(...stageCenter(), 1.25)));
  $('#zoom-out').addEventListener('click', () => (in3d() ? window.MESA3D.zoom(1.25) : zoomAt(...stageCenter(), 0.8)));
  $('#zoom-fit').addEventListener('click', () => { S.camTouched = false; if (in3d()) window.MESA3D.fit(); else fitView(); });
  $('#brush').addEventListener('change', e => { S.brush = Number(e.target.value); });

  const DEFAULT_HINT = 'Shift+clique: ping · Roda: zoom · Arrastar o fundo: mover a visão';
  function setTool(tool) {
    S.tool = tool;
    $$('#toolbar [data-tool]').forEach(x => x.classList.toggle('on', x.dataset.tool === tool));
    canvas.classList.toggle('brush', tool !== 'move');
    if (!tool.startsWith('obj:')) $('#obj-tool').value = '';
    const fx = tool.startsWith('fx:') && $(`#toolbar [data-tool="${tool}"]`);
    const objName = tool.startsWith('obj:') && $('#obj-tool').selectedOptions[0]?.textContent;
    $('#hint').textContent = fx
      ? `Clique no alvo: ${fx.title}${tool === 'fx:shot' ? (S.isGM ? ' (sai do token selecionado)' : '') : ''} · Esc volta para ✋ Mover`
      : objName ? `${objName}: clique no quadrado · Alt+clique num baú/armadilha edita · Esc volta para ✋ Mover`
        : tool.startsWith('atk:') ? '⚔ Clique no alvo do ataque · Esc cancela'
          : tool.startsWith('abl:') ? '✨ Clique no centro da área da habilidade · Esc cancela'
            : DEFAULT_HINT;
  }

  $('#obj-tool').addEventListener('change', e => setTool(e.target.value ? `obj:${e.target.value}` : 'move'));

  // Visão 2D → 2.5D → 3D (preferência de cada pessoa, não muda nada para os outros).
  const VIEW_LABELS = { '2d': '🗺 2D', '25d': '🧊 2.5D', '3d': '🎲 3D' };
  function applyView3d() {
    S.view3d = S.viewMode === '25d';
    const is3d = S.viewMode === '3d' && !!window.MESA3D;
    $('#view3d').classList.toggle('on', S.viewMode !== '2d');
    $('#view3d').textContent = VIEW_LABELS[S.viewMode];
    $('#view3d').title = 'Trocar a visão: 2D → 2.5D → 3D (só na sua tela)';
    canvas.hidden = is3d;
    window.MESA3D?.setActive(is3d);
    $('#hint').textContent = is3d ? '3D: botão direito gira · roda aproxima · arrastar o chão move a visão · duplo clique centraliza · Shift+clique: ping' : DEFAULT_HINT;
    S.camTouched = false;
    fitView();
  }
  $('#view3d').addEventListener('click', () => {
    S.viewMode = { '2d': '25d', '25d': '3d', '3d': '2d' }[S.viewMode];
    if (S.viewMode === '3d' && !window.MESA3D) { toast('O modo 3D ainda está carregando…'); S.viewMode = '2d'; }
    store.set('mesa:view', S.viewMode);
    applyView3d();
  });

  // Ponte para o módulo 3D (view3d.js): ele lê o estado e usa as mesmas ações de clique do 2D.
  window.MESA_BRIDGE = {
    get S() { return S; },
    vis, floaters, particles, effects, pid,
    getImg, squareImg, cellColor, objAnim, turnTokenId, isDown, initials, flicker,
    pointerDownAt, pointerMoveAt, endPointer, abilitiesOfToken,
    isBrush: () => isBrush(),
  };
  window.addEventListener('mesa3d-ready', () => { if (S.viewMode === '3d') applyView3d(); });
  $('#collision-on').addEventListener('change', e => socket.emit('settings:set', { collision: e.target.checked }));

  $('#toolbar').addEventListener('click', e => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    setTool(b.dataset.tool);
    if ((S.tool === 'reveal' || S.tool === 'hide') && !S.state?.map.fogEnabled) toast('A névoa está desligada. Ative em Mestre → Névoa de guerra.');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#picker').hidden) { closePicker(); return; }
    if (e.key === 'Escape' && !$('#class-modal').hidden) { closeClassEditor(); return; }
    if (!S.joined || e.target.matches('input, textarea, select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
    if (e.key === 'Escape') { setTool('move'); select(null); }
  });
})();
