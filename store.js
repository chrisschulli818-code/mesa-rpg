/* Onde as mesas ficam guardadas.
   - Arquivo (padrão, para jogar no próprio PC): data/rooms.json (pasta configurável em DATA_DIR).
   - Supabase (para hospedar, ex.: Render grátis, que apaga o disco): ativado por SUPABASE_URL + SUPABASE_SECRET_KEY.
     Cada mesa é uma linha em public.mesa_rooms; as imagens grandes (mapa, mapa dos jogadores, retratos enviados)
     vão para o bucket privado "mesa". Só sobe o que mudou desde o último salvamento. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// O que muda na hora de guardar: Set → lista (e de volta ao carregar).
const toPlain = r => ({ ...r, revealed: [...r.revealed], demo: null });

function fileStore() {
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const file = path.join(dir, 'rooms.json');
  return {
    kind: `arquivo (${file})`,
    async loadAll() {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') console.error('Falha ao ler as mesas salvas:', e.message);
        return [];
      }
    },
    async saveRooms(rooms) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify([...rooms.values()].map(toPlain)));
        fs.renameSync(`${file}.tmp`, file);
      } catch (e) {
        console.error('Falha ao salvar as mesas:', e.message);
      }
    },
  };
}

function supabaseStore(url, key) {
  const base = url.replace(/\/+$/, '');
  const BUCKET = 'mesa';
  // Chave nova (sb_secret_…) vai só no apikey; a antiga (JWT service_role) também no Authorization.
  const auth = { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }) };
  const md5 = s => crypto.createHash('md5').update(s).digest('hex');
  const savedJson = new Map();  // code → hash do JSON já salvo
  const savedBlob = new Map();  // caminho no bucket → hash da imagem já salva

  async function req(method, p, { headers = {}, body } = {}) {
    const res = await fetch(`${base}${p}`, { method, headers: { ...auth, ...headers }, body });
    if (!res.ok) throw new Error(`${method} ${p.split('?')[0]} → ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res;
  }

  // data:image/png;base64,AAAA → bytes + tipo
  function fromDataUrl(s) {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(s);
    return m ? { type: m[1], bytes: Buffer.from(m[2], 'base64') } : null;
  }

  async function putBlob(p, dataUrl) {
    const h = md5(dataUrl);
    if (savedBlob.get(p) === h) return;
    const blob = fromDataUrl(dataUrl);
    if (!blob) return;
    await req('POST', `/storage/v1/object/${BUCKET}/${p}`, { headers: { 'Content-Type': blob.type, 'x-upsert': 'true' }, body: blob.bytes });
    savedBlob.set(p, h);
  }

  async function getBlob(p) {
    const res = await req('GET', `/storage/v1/object/${BUCKET}/${p}`);
    const type = res.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
    savedBlob.set(p, md5(dataUrl));
    return dataUrl;
  }

  // Tira as imagens do JSON da mesa (viram { $blob: caminho }) e devolve a lista do que subir.
  function split(room) {
    const r = toPlain(room);
    const blobs = [];
    const take = (p, v) => { blobs.push([p, v]); return { $blob: p }; };
    r.map = { ...r.map };
    if (r.map.image) r.map.image = take(`rooms/${r.code}/map`, r.map.image);
    if (r.map.playerImage) r.map.playerImage = take(`rooms/${r.code}/player`, r.map.playerImage);
    r.images = Object.fromEntries(Object.entries(r.images || {}).map(([id, v]) => [id, take(`rooms/${r.code}/img-${id}`, v)]));
    return { json: r, blobs };
  }

  let saving = null;
  let again = false;

  async function saveNow(rooms) {
    for (const room of rooms.values()) {
      const { json, blobs } = split(room);
      for (const [p, v] of blobs) await putBlob(p, v);
      const text = JSON.stringify(json);
      const h = md5(text);
      if (savedJson.get(room.code) === h) continue;
      await req('POST', '/rest/v1/mesa_rooms?on_conflict=code', {
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ code: room.code, data: json, updated_at: new Date().toISOString() }),
      });
      savedJson.set(room.code, h);
    }
  }

  return {
    kind: `Supabase (${base}, tabela mesa_rooms + bucket ${BUCKET})`,
    async loadAll() {
      const res = await req('GET', '/rest/v1/mesa_rooms?select=code,data');
      const rows = await res.json();
      const out = [];
      for (const { code, data } of rows) {
        try {
          const fill = async v => (v && typeof v === 'object' && v.$blob ? getBlob(v.$blob) : v);
          data.map.image = await fill(data.map.image).catch(() => null);
          data.map.playerImage = await fill(data.map.playerImage).catch(() => null);
          for (const id of Object.keys(data.images || {})) data.images[id] = await fill(data.images[id]).catch(() => undefined);
          savedJson.set(code, md5(JSON.stringify(split({ ...data, revealed: new Set(data.revealed || []) }).json)));
          out.push(data);
        } catch (e) {
          console.error(`Mesa ${code} não carregou:`, e.message);
        }
      }
      return out;
    },
    // Um salvamento por vez; se pedirem outro no meio, roda de novo no fim. Erro não derruba o jogo.
    async saveRooms(rooms) {
      if (saving) { again = true; return saving; }
      saving = (async () => {
        do {
          again = false;
          try { await saveNow(rooms); } catch (e) { console.error('Falha ao salvar no Supabase (tento de novo no próximo salvamento):', e.message); }
        } while (again);
      })();
      try { await saving; } finally { saving = null; }
    },
  };
}

function createStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? supabaseStore(url, key) : fileStore();
}

module.exports = { createStore };
