/* Onde as mesas ficam guardadas.
   - Arquivo (padrão, para jogar no próprio PC): data/rooms.json (pasta configurável em DATA_DIR).
   - MongoDB Atlas (para hospedar, ex.: Render grátis, que apaga o disco): ativado por MONGODB_URI
     (banco: MONGODB_DB, padrão "mesa"). Coleções "rooms" (uma por mesa) e "blobs" (mapas e retratos).
   - Supabase (opcional): SUPABASE_URL + SUPABASE_SECRET_KEY → tabela public.mesa_rooms + bucket "mesa".
   Nos modos remotos, as imagens grandes saem do JSON da mesa e só sobe o que mudou desde o último salvamento. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// O que muda na hora de guardar: Set → lista (e de volta ao carregar).
const toPlain = r => ({ ...r, revealed: [...r.revealed], demo: null });
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

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

// ---------- parte comum dos modos remotos ----------
// backend: { init(), listRooms() → [{ code, data }], upsertRoom(code, data), putBlob(path, type, bytes), getBlob(path) → { type, bytes } }
function remoteStore(kind, backend) {
  const savedJson = new Map(); // code → hash do JSON já salvo
  const savedBlob = new Map(); // caminho → hash da imagem já salva
  let ready = null;
  const init = () => (ready ||= backend.init());

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
    await backend.putBlob(p, blob.type, blob.bytes);
    savedBlob.set(p, h);
  }

  async function getBlob(p) {
    const b = await backend.getBlob(p);
    if (!b) return null;
    const dataUrl = `data:${b.type || 'image/jpeg'};base64,${Buffer.from(b.bytes).toString('base64')}`;
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

  async function saveNow(rooms) {
    await init();
    for (const room of rooms.values()) {
      const { json, blobs } = split(room);
      for (const [p, v] of blobs) await putBlob(p, v);
      const h = md5(JSON.stringify(json));
      if (savedJson.get(room.code) === h) continue;
      await backend.upsertRoom(room.code, json);
      savedJson.set(room.code, h);
    }
  }

  let saving = null;
  let again = false;
  return {
    kind,
    async loadAll() {
      await init();
      const out = [];
      for (const { code, data } of await backend.listRooms()) {
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
          try { await saveNow(rooms); } catch (e) { console.error(`Falha ao salvar (${kind}); tento de novo no próximo salvamento:`, e.message); }
        } while (again);
      })();
      try { await saving; } finally { saving = null; }
    },
  };
}

// ---------- MongoDB Atlas ----------
function mongoBackend(uri, dbName) {
  const { MongoClient, Binary } = require('mongodb');
  const client = new MongoClient(uri, { appName: 'mesa-rpg', serverSelectionTimeoutMS: 15000 });
  let rooms;
  let blobs;
  return {
    async init() {
      await client.connect();
      const db = client.db(dbName);
      rooms = db.collection('rooms');
      blobs = db.collection('blobs');
    },
    async listRooms() {
      return (await rooms.find({}).toArray()).map(d => ({ code: d._id, data: d.data }));
    },
    async upsertRoom(code, data) {
      await rooms.replaceOne({ _id: code }, { _id: code, data, updatedAt: new Date() }, { upsert: true });
    },
    async putBlob(p, type, bytes) {
      // Limite de um documento no MongoDB: 16 MB (os mapas do jogo ficam bem abaixo)
      await blobs.replaceOne({ _id: p }, { _id: p, type, bytes: new Binary(bytes), updatedAt: new Date() }, { upsert: true });
    },
    async getBlob(p) {
      const d = await blobs.findOne({ _id: p });
      return d ? { type: d.type, bytes: d.bytes.buffer } : null;
    },
  };
}

// ---------- Supabase (opcional) ----------
function supabaseBackend(url, key) {
  const base = url.replace(/\/+$/, '');
  const BUCKET = 'mesa';
  // Chave nova (sb_secret_…) vai só no apikey; a antiga (JWT service_role) também no Authorization.
  const auth = { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }) };
  async function req(method, p, { headers = {}, body } = {}) {
    const res = await fetch(`${base}${p}`, { method, headers: { ...auth, ...headers }, body });
    if (!res.ok) throw new Error(`${method} ${p.split('?')[0]} → ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res;
  }
  return {
    async init() {},
    async listRooms() {
      return (await req('GET', '/rest/v1/mesa_rooms?select=code,data')).json();
    },
    async upsertRoom(code, data) {
      await req('POST', '/rest/v1/mesa_rooms?on_conflict=code', {
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ code, data, updated_at: new Date().toISOString() }),
      });
    },
    async putBlob(p, type, bytes) {
      await req('POST', `/storage/v1/object/${BUCKET}/${p}`, { headers: { 'Content-Type': type, 'x-upsert': 'true' }, body: bytes });
    },
    async getBlob(p) {
      const res = await req('GET', `/storage/v1/object/${BUCKET}/${p}`);
      return { type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) };
    },
  };
}

function createStore() {
  const { MONGODB_URI, MONGODB_DB, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (MONGODB_URI) return remoteStore(`MongoDB (banco ${MONGODB_DB || 'mesa'})`, mongoBackend(MONGODB_URI, MONGODB_DB || 'mesa'));
  if (SUPABASE_URL && SUPABASE_SECRET_KEY) return remoteStore(`Supabase (${SUPABASE_URL})`, supabaseBackend(SUPABASE_URL, SUPABASE_SECRET_KEY));
  return fileStore();
}

module.exports = { createStore };
