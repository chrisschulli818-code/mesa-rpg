/* Mesa — visão 3D (Three.js).
   Monta a cena a partir do mesmo estado do jogo (window.MESA_BRIDGE) e usa as mesmas ações de clique do 2D.
   1 quadrado do mapa = 1 unidade 3D; o chão é o plano y = 0 (x = coluna, z = linha). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const B = () => window.MESA_BRIDGE;
const WALL_H = 1.3;

let renderer, scene, camera, controls, sun, hemi, canvas3d;
let active = false;
let dragging = false;
let fitted = false;

// ---------- cena estática (chão, paredes, névoa) ----------
const staticGroup = new THREE.Group();
let groundMesh = null;
let groundImgSrc = null;
let fogMesh = null;
let fogCanvas = null;
let fogKey = '';
let wallsKey = '';
const texLoader = new THREE.TextureLoader();

// ---------- objetos dinâmicos ----------
const tokenObjs = new Map();   // id do token -> grupo da miniatura
const objMeshes = new Map();   // id do objeto -> grupo
const torchLights = [];
const floaterSprites = new Map();
const fxMeshes = new Map();
const pingMeshes = new Map();
let particlePoints = null;
let hoverMesh = null;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------- utilidades ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textSprite(text, { size = 40, color = '#fff', bg = 'rgba(0,0,0,0.7)', stroke = null, width = 256, height = 64 } = {}) {
  const c = makeCanvas(width, height);
  const g = c.getContext('2d');
  g.font = `700 ${size}px Inter, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (bg) {
    const tw = Math.min(width - 4, g.measureText(text).width + 24);
    g.fillStyle = bg;
    g.beginPath();
    if (g.roundRect) g.roundRect((width - tw) / 2, 4, tw, height - 8, 12); else g.rect((width - tw) / 2, 4, tw, height - 8);
    g.fill();
  }
  if (stroke) { g.lineWidth = size * 0.18; g.strokeStyle = stroke; g.strokeText(text, width / 2, height / 2 + 2); }
  g.fillStyle = color;
  g.fillText(text, width / 2, height / 2 + 2);
  const mat = new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.renderOrder = 10;
  s.scale.set(width / height * 0.4, 0.4, 1);
  return s;
}

function disposeObject(o) {
  o.traverse(n => {
    n.geometry?.dispose?.();
    const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
    for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
  });
}

const mixStone = (rgb, stone) => rgb.map((v, i) => (v * 0.45 + stone[i] * 0.55) / 255);

// ---------- montagem ----------
function mount() {
  const stage = document.getElementById('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvas3d = renderer.domElement;
  canvas3d.id = 'board3d';
  canvas3d.hidden = true;
  stage.insertBefore(canvas3d, document.getElementById('board').nextSibling);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0b09');
  scene.fog = new THREE.Fog('#0d0b09', 40, 110);
  scene.add(staticGroup);

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  hemi = new THREE.HemisphereLight('#e8eeff', '#2b2219', 1.15);
  scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff1dc', 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // Nossos ouvintes vêm antes dos da câmera: clique em token/objeto/ferramenta não gira nem arrasta a visão.
  canvas3d.addEventListener('pointerdown', onPointerDown);
  canvas3d.addEventListener('pointermove', onPointerMove);
  canvas3d.addEventListener('pointerup', onPointerUp);
  canvas3d.addEventListener('pointercancel', onPointerUp);
  canvas3d.addEventListener('contextmenu', e => e.preventDefault());

  controls = new OrbitControls(camera, canvas3d);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.3;
  controls.minDistance = 3;
  controls.maxDistance = 90;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  new ResizeObserver(resize).observe(stage);
  resize();

  // Partículas (faíscas, fumaça, cura…) vindas do mesmo sistema do 2D
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3000), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * 3000), 3));
  particlePoints = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  particlePoints.frustumCulled = false;
  scene.add(particlePoints);

  hoverMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#7fd1ff', transparent: true, opacity: 0.25, depthWrite: false }));
  hoverMesh.rotation.x = -Math.PI / 2;
  hoverMesh.visible = false;
  scene.add(hoverMesh);
}

function resize() {
  const stage = document.getElementById('stage');
  const w = stage.clientWidth || 1; const h = stage.clientHeight || 1;
  renderer.setSize(w, h, false);
  canvas3d.style.width = `${w}px`;
  canvas3d.style.height = `${h}px`;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function fit() {
  const st = B()?.S.state;
  if (!st) return;
  const { cols, rows } = st.map;
  const size = Math.max(cols, rows);
  controls.target.set(cols / 2, 0, rows / 2);
  camera.position.set(cols / 2, size * 0.78, rows / 2 + size * 0.62);
  controls.update();
  sun.position.set(cols / 2 - size * 0.35, size * 0.9, rows / 2 - size * 0.25);
  sun.target.position.set(cols / 2, 0, rows / 2);
  const sc = sun.shadow.camera;
  sc.left = -size * 0.8; sc.right = size * 0.8; sc.top = size * 0.8; sc.bottom = -size * 0.8;
  sc.near = 1; sc.far = size * 3;
  sc.updateProjectionMatrix();
  scene.fog.near = size * 1.2; scene.fog.far = size * 3;
  fitted = true;
}

// ---------- chão, paredes e névoa ----------
function rebuildGround(st) {
  const b = B();
  const { cols, rows } = st.map;
  const src = b.S.mapImg && st.map.hasImage ? b.S.mapImg.src : null;
  const key = `${cols}x${rows}|${src ? src.length + src.slice(-32) : 'sem-imagem'}`;
  if (groundMesh && groundMesh.userData.key === key) return;
  if (groundMesh) { staticGroup.remove(groundMesh); disposeObject(groundMesh); }
  const mat = new THREE.MeshStandardMaterial({ color: b.S.colors.board || '#2a241d', roughness: 0.95 });
  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), mat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(cols / 2, 0, rows / 2);
  groundMesh.receiveShadow = true;
  groundMesh.userData.key = key;
  staticGroup.add(groundMesh);
  if (src) {
    // A imagem tem o próprio tamanho em pixels (imageW × imageH), a partir do canto do mapa, como no 2D.
    const tex = new THREE.Texture(b.S.mapImg);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    const iw = (st.map.imageW || cols * st.map.grid) / st.map.grid;
    const ih = (st.map.imageH || rows * st.map.grid) / st.map.grid;
    const img = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    img.position.set(iw / 2 - cols / 2, rows / 2 - ih / 2, 0.002);
    img.receiveShadow = true;
    groundMesh.add(img);
  }

  // Grade sutil
  const pts = [];
  for (let c = 0; c <= cols; c++) pts.push(c, 0.01, 0, c, 0.01, rows);
  for (let r = 0; r <= rows; r++) pts.push(0, 0.01, r, cols, 0.01, r);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08 }));
  groundMesh.userData.grid = grid;
  groundMesh.add(grid);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(-cols / 2, rows / 2, 0);
  groundImgSrc = src;
}

let wallGroup = null;
let blockMesh = null;
function rebuildWalls(st) {
  const b = B();
  const W = b.S.wallInfo;
  const eff = W?.eff ? W.eff.join('') : '';
  const segs = JSON.stringify(st.walls?.segments || []);
  const key = `${st.map.cols}x${st.map.rows}|${eff}|${segs}|${groundImgSrc ? groundImgSrc.length : 0}|${b.S.revealed.size}`;
  if (key === wallsKey) return;
  wallsKey = key;
  if (wallGroup) { staticGroup.remove(wallGroup); disposeObject(wallGroup); }
  wallGroup = new THREE.Group();
  staticGroup.add(wallGroup);
  blockMesh = null;
  cuttables = [];
  if (!W?.eff) return;
  const { cols, rows } = st.map;
  const unrevealedDim = cell => b.S.isGM && st.map.fogEnabled && !b.S.revealed.has(cell);

  // Paredes e prédios: caixas instanciadas (uma geometria, muitas cópias)
  const blocks = [];
  const trees = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const code = W.eff[r * cols + c];
    if (code === '0' || code === undefined) continue;
    if (code === '2') trees.push([c, r]); else blocks.push([c, r, code]);
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const blockMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02 });
  const inst = new THREE.InstancedMesh(box, blockMat, Math.max(1, blocks.length));
  inst.count = blocks.length;
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  blocks.forEach(([c, r, code], i) => {
    const h = code === '1' ? WALL_H : 0.5 + (code.charCodeAt(0) - 51) * 0.9; // 3..7 = prédios
    m4.makeScale(1, h, 1).setPosition(c + 0.5, h / 2, r + 0.5);
    inst.setMatrixAt(i, m4);
    const [cr, cg, cb] = mixStone(b.cellColor(c, r), code === '1' ? [110, 102, 92] : [70, 76, 92]);
    col.setRGB(cr, cg, cb, THREE.SRGBColorSpace);
    if (unrevealedDim(`${c},${r}`)) col.multiplyScalar(0.45);
    inst.setColorAt(i, col);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.userData.cells = blocks;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  wallGroup.add(inst);
  const blockCut = blocks.length ? makeCuttable(inst, 'wall') : null;
  blockMesh = blockCut ? blockCut.proxy : null; // cliques usam o formato original, mesmo com a parede rebaixada
  if (blockMesh) blockMesh.userData.cells = blocks;

  // Janelas acesas nos prédios (faixas emissivas)
  const lit = blocks.filter(([, , code]) => code >= '3');
  if (lit.length) {
    const winMat = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
    const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.12), winMat, lit.length * 6);
    const owner = [];
    const base = [];
    let n = 0;
    const blockIndex = new Map(blocks.map(([c, r], i) => [r * cols + c, i]));
    for (const [c, r, code] of lit) {
      if (W.eff[(r + 1) * cols + c] && W.eff[(r + 1) * cols + c] !== '0') continue; // só na face aberta para a rua
      const h = 0.5 + (code.charCodeAt(0) - 51) * 0.9;
      for (let k = 0; k < 6; k++) {
        const y = 0.3 + (k >> 1) * (h / 3.4);
        if (y > h - 0.15 || ((c * 7 + r * 13 + k * 5) % 5) >= 2) continue;
        m4.makeTranslation(c + 0.3 + (k % 2) * 0.4, y, r + 1.002);
        wins.setMatrixAt(n++, m4);
        owner.push(blockIndex.get(r * cols + c));
        base.push(m4.clone());
      }
    }
    wins.count = n;
    wallGroup.add(wins);
    // Prédio rebaixado apaga as janelas dele
    if (blockCut) blockCut.windows = { mesh: wins, owner, base };
  }

  // Árvores: tronco + copa
  if (trees.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6), new THREE.MeshStandardMaterial({ color: '#4a3524' }), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), trees.length);
    trees.forEach(([c, r], i) => {
      const s = 0.8 + (((c * 31 + r * 17) % 10) / 25);
      m4.makeTranslation(c + 0.5, 0.35, r + 0.5); trunk.setMatrixAt(i, m4);
      m4.makeScale(s, s * 1.1, s).setPosition(c + 0.5, 0.75 + s * 0.35, r + 0.5); crown.setMatrixAt(i, m4);
      const [cr, cg, cb] = b.cellColor(c, r).map(v => v / 255);
      col.setRGB(cr * 0.9, Math.min(1, cg * 1.05), cb * 0.8, THREE.SRGBColorSpace);
      crown.setColorAt(i, col);
    });
    trunk.castShadow = crown.castShadow = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    wallGroup.add(trunk, crown);
    makeCuttable(crown, 'crown');
  }

  // Paredes finas da casa
  const edges = [];
  for (const [x1, y1, x2, y2] of st.walls?.segments || []) {
    if (x1 === x2) for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) edges.push([x1, y, true]);
    else for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) edges.push([x, y1, false]);
  }
  if (edges.length) {
    const thin = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#5a4230', roughness: 0.85 }), edges.length);
    edges.forEach(([x, y, v], i) => {
      m4.makeScale(v ? 0.14 : 1.14, WALL_H, v ? 1.14 : 0.14).setPosition(v ? x : x + 0.5, WALL_H / 2, v ? y + 0.5 : y);
      thin.setMatrixAt(i, m4);
    });
    thin.castShadow = thin.receiveShadow = true;
    wallGroup.add(thin);
    makeCuttable(thin, 'wall');
  }

  // Rachaduras visíveis no topo das paredes rachadas
  const blockAt = new Map(blocks.map(([c, r], i) => [r * cols + c, i]));
  for (const [i] of W.cracks) {
    const c = i % cols; const r = Math.floor(i / cols);
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false }));
    crack.rotation.x = -Math.PI / 2;
    crack.position.set(c + 0.5, WALL_H + 0.01, r + 0.5);
    wallGroup.add(crack);
    if (blockCut && blockAt.has(i)) (blockCut.decals ||= []).push({ mesh: crack, owner: blockAt.get(i) });
  }
}

// ---------- corte das paredes (os personagens nunca somem atrás de construções) ----------
// Cada malha "cortável" guarda a forma original (proxy, para os raios) e quanto cada cópia está rebaixada (k).
let cuttables = [];
function makeCuttable(mesh, kind) {
  const n = mesh.count;
  const base = [];
  const proxy = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(1, n));
  proxy.count = n;
  for (let i = 0; i < n; i++) { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); base.push(m); proxy.setMatrixAt(i, m); }
  proxy.computeBoundingSphere();
  proxy.updateMatrixWorld(true);
  const entry = { mesh, proxy, kind, base, k: new Float32Array(n), target: new Uint8Array(n) };
  cuttables.push(entry);
  return entry;
}

const cutRay = new THREE.Raycaster();
const _pt = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
let lastCutCheck = 0;

function updateCutaway(now, dt) {
  if (!cuttables.length) return;
  // Raios da câmera até cada miniatura: o que estiver no caminho é rebaixado.
  if (now - lastCutCheck > 90) {
    lastCutCheck = now;
    for (const c of cuttables) c.target.fill(0);
    const proxies = cuttables.map(c => c.proxy);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    for (const o of tokenObjs.values()) {
      if (o.scale.x < 0.05) continue;
      const h = o.userData.cardH || 1;
      const half = 0.36 * (o.userData.size || 1);
      for (const [fx, fy] of [[0, 0.25], [0, 0.6], [0, 1.0], [-1, 0.6], [1, 0.6]]) {
        _pt.set(o.position.x, 0.1 + h * fy, o.position.z).addScaledVector(right, fx * half);
        _dir.copy(_pt).sub(camera.position);
        const dist = _dir.length();
        cutRay.set(camera.position, _dir.normalize());
        cutRay.far = dist;
        for (const hit of cutRay.intersectObjects(proxies, false)) {
          if (hit.instanceId == null) continue;
          const c = cuttables.find(x => x.proxy === hit.object);
          c.target[hit.instanceId] = 1;
        }
      }
    }
  }
  const f = 1 - Math.exp(-dt * 10);
  for (const c of cuttables) {
    let dirty = false;
    for (let i = 0; i < c.k.length; i++) {
      const k0 = c.k[i];
      const goal = c.target[i];
      if (k0 === goal) continue;
      const k1 = Math.abs(goal - k0) < 0.01 ? goal : k0 + (goal - k0) * f;
      c.k[i] = k1;
      c.base[i].decompose(_p, _q, _s);
      if (c.kind === 'wall') { _s.y *= 1 - k1 * 0.85; _p.y = _s.y / 2; } // desce até sobrar um toco
      else _s.multiplyScalar(1 - k1 * 0.9); // copa encolhe
      c.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      dirty = true;
    }
    if (!dirty) continue;
    c.mesh.instanceMatrix.needsUpdate = true;
    if (c.windows) {
      const { mesh, owner, base } = c.windows;
      for (let j = 0; j < owner.length; j++) {
        const hidden = c.k[owner[j]] > 0.25;
        mesh.setMatrixAt(j, hidden ? _m.makeScale(0, 0, 0) : base[j]);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const d of c.decals || []) d.mesh.visible = c.k[d.owner] < 0.25;
  }
}

let crackTex = null;
function crackTexture() {
  if (crackTex) return crackTex;
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(10,6,4,0.9)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(30, 0); g.lineTo(26, 20); g.lineTo(38, 34); g.lineTo(28, 50); g.lineTo(34, 64); g.moveTo(38, 34); g.lineTo(56, 40); g.stroke();
  crackTex = canvasTexture(c);
  return crackTex;
}

function rebuildFog(st) {
  const b = B();
  const { cols, rows, fogEnabled } = st.map;
  const key = `${cols}x${rows}|${fogEnabled}|${b.S.revealed.size}|${st.map.fogVersion}`;
  if (key === fogKey) return;
  fogKey = key;
  if (!fogEnabled) { if (fogMesh) fogMesh.visible = false; return; }
  if (!fogCanvas || fogCanvas.width !== cols || fogCanvas.height !== rows) {
    fogCanvas = makeCanvas(cols, rows);
    if (fogMesh) { scene.remove(fogMesh); disposeObject(fogMesh); }
    const tex = new THREE.CanvasTexture(fogCanvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    fogMesh.rotation.x = -Math.PI / 2;
    fogMesh.position.set(cols / 2, 0.03, rows / 2);
    fogMesh.renderOrder = 2;
    scene.add(fogMesh);
  }
  const g = fogCanvas.getContext('2d');
  g.clearRect(0, 0, cols, rows);
  g.fillStyle = b.S.isGM ? 'rgba(0,0,0,0.55)' : '#050506';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!b.S.revealed.has(`${c},${r}`)) g.fillRect(c, r, 1, 1);
  fogMesh.material.map.needsUpdate = true;
  fogMesh.visible = true;
}

// ---------- miniaturas ----------
const portraitCache = new Map();
function portraitTexture(t) {
  const b = B();
  const img = b.getImg(t.img);
  const key = img ? t.img : `ini:${t.name}:${t.color}`;
  if (portraitCache.has(key)) return portraitCache.get(key);
  let c;
  if (img) {
    c = b.squareImg(img);
  } else {
    c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    g.fillStyle = t.color; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff'; g.font = '700 56px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.initials(t.name), 64, 68);
  }
  const tex = canvasTexture(c);
  // O retrato é quadrado; o cartão é mais alto que largo: recorta as laterais.
  tex.repeat.set(0.7, 1);
  tex.offset.set(0.15, 0);
  portraitCache.set(key, tex);
  return tex;
}

function hpBarTexture(pct, color) {
  const c = makeCanvas(64, 10);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, 64, 10);
  g.fillStyle = color; g.fillRect(1, 1, 62 * pct, 8);
  return canvasTexture(c);
}

function createMini(t) {
  const s = t.size || 1;
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * s, 0.42 * s, 0.1, 28), new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.5 }));
  base.position.y = 0.05;
  base.castShadow = true;
  const pivot = new THREE.Group();
  pivot.position.y = 0.1;
  const cardW = 0.72 * s; const cardH = 1.05 * s;
  const frameGeo = new THREE.PlaneGeometry(cardW + 0.08, cardH + 0.08);
  frameGeo.translate(0, cardH / 2, -0.005);
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color: t.color, side: THREE.DoubleSide }));
  const cardGeo = new THREE.PlaneGeometry(cardW, cardH);
  cardGeo.translate(0, cardH / 2 + 0.0, 0);
  const card = new THREE.Mesh(cardGeo, new THREE.MeshStandardMaterial({ map: portraitTexture(t), side: THREE.DoubleSide, roughness: 0.7 }));
  card.castShadow = true;
  frame.castShadow = true;
  pivot.add(frame, card);
  // Silhueta "raio X": só aparece nas partes da miniatura que algo está cobrindo (teste de profundidade invertido).
  const ghostOpts = { transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth, side: THREE.DoubleSide };
  const ghostFrame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ ...ghostOpts, color: t.color, opacity: 0.5 }));
  const ghostCard = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ ...ghostOpts, map: portraitTexture(t), opacity: 0.6 }));
  ghostFrame.renderOrder = 4;
  ghostCard.renderOrder = 5;
  pivot.add(ghostFrame, ghostCard);
  const ring =new THREE.Mesh(new THREE.RingGeometry(0.46 * s, 0.54 * s, 40), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  const sel = ring.clone();
  sel.material = new THREE.MeshBasicMaterial({ color: '#7fd1ff', transparent: true, depthWrite: false, side: THREE.DoubleSide });
  sel.scale.setScalar(1.15);
  const label = textSprite(t.name, { size: 34 });
  label.position.y = cardH + 0.45;
  const hp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  hp.scale.set(0.8 * s, 0.12, 1);
  hp.position.y = cardH + 0.22;
  hp.renderOrder = 10;
  hp.visible = false;
  group.add(base, pivot, ring, sel, label, hp);
  group.userData = { tokenId: t.id, pivot, card, frame, base, ring, sel, label, hp, ghosts: [ghostFrame, ghostCard], name: t.name, color: t.color, img: t.img, hpKey: '', cardH };
  for (const m of [base, card, frame]) m.userData.tokenId = t.id;
  scene.add(group);
  return group;
}

function syncMinis(now) {
  const b = B();
  const turnId = b.turnTokenId();
  const seen = new Set();
  for (const v of b.vis.values()) {
    const t = v.t;
    seen.add(t.id);
    let o = tokenObjs.get(t.id);
    // Mudou algo que pede recriar (tamanho, cor, nome, retrato carregado)
    const wantTex = portraitTexture(t);
    if (o && (o.userData.name !== t.name || o.userData.color !== t.color || o.userData.size !== (t.size || 1) || o.userData.card.material.map !== wantTex)) {
      scene.remove(o); disposeObject(o); tokenObjs.delete(t.id); o = null;
    }
    if (!o) { o = createMini(t); o.userData.size = t.size || 1; tokenObjs.set(t.id, o); }
    const u = o.userData;
    const s = t.size || 1;
    const age = (now - v.born) / 1000;
    let scale = age < 0.45 ? Math.min(1, 0.2 + age / 0.45) : 1;
    let alpha = t.hidden ? 0.5 : 1;
    if (v.gone != null) { const k = Math.min(1, (now - v.gone) / 320); scale *= 1 - k * 0.5; alpha *= 1 - k; }
    const hitK = (now - v.hitT) / 500;
    const shakeX = hitK < 1 ? Math.sin(hitK * 40) * (1 - hitK) * 0.1 : 0;
    o.position.set(v.x + s / 2 + shakeX, v.hop * 0.25, v.y + s / 2);
    o.scale.setScalar(Math.max(0.01, scale));
    // O cartão olha para a câmera (só gira no eixo vertical) e tomba quando o personagem cai
    const yaw = Math.atan2(camera.position.x - o.position.x, camera.position.z - o.position.z);
    u.pivot.rotation.set(0, yaw, 0);
    u.pivot.rotateX(-v.downK * 1.35);
    // Cinza quando caído; clarão vermelho ao levar dano
    const lum = 1 - v.downK * 0.45;
    const red = hitK < 1 ? 0.7 * (1 - hitK) : 0;
    u.card.material.color.setRGB(lum, lum * (1 - red), lum * (1 - red));
    for (const m of [u.card.material, u.frame.material, u.base.material]) { m.transparent = alpha < 1; m.opacity = alpha; }
    u.ghosts[0].material.opacity = 0.5 * alpha;
    u.ghosts[1].material.opacity = 0.6 * alpha;
    u.ring.visible = t.id === turnId;
    if (u.ring.visible) { const p = (Math.sin(now / 250) + 1) / 2; u.ring.scale.setScalar(1 + p * 0.12); u.ring.material.opacity = 0.6 + p * 0.4; }
    u.sel.visible = t.id === b.S.selected;
    u.label.material.opacity = alpha;
    if (t.maxHp > 0 && t.hp != null) {
      const pct = Math.max(0, Math.min(1, t.hp / t.maxHp));
      const key = pct.toFixed(2);
      if (u.hpKey !== key) {
        u.hp.material.map?.dispose();
        u.hp.material.map = hpBarTexture(pct, pct > 0.5 ? '#6fbf73' : pct > 0.25 ? '#e0b04a' : '#d0564a');
        u.hp.material.needsUpdate = true;
        u.hpKey = key;
      }
      u.hp.visible = true;
    } else u.hp.visible = false;
  }
  for (const [id, o] of tokenObjs) if (!seen.has(id)) { scene.remove(o); disposeObject(o); tokenObjs.delete(id); }
}

// ---------- objetos interativos ----------
const WOOD = '#6b4526';
function createObject(o) {
  const g = new THREE.Group();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  if (o.type === 'door') {
    const hinge = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.12), std(o.bars ? '#7a808a' : o.tech ? '#4a525c' : WOOD, o.bars ? { transparent: true, opacity: 0.75 } : {}));
    leaf.position.set(0.45, 0.575, 0);
    leaf.castShadow = true;
    hinge.add(leaf);
    g.add(hinge);
    g.userData.hinge = hinge;
  } else if (o.type === 'chest') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.32, 0.4), std(WOOD));
    body.position.y = 0.16; body.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.42), std('#d4a93a', { metalness: 0.6, roughness: 0.4 }));
    band.position.y = 0.2;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.32, -0.2);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.4), std('#8a5a34'));
    lid.position.set(0, 0.05, 0.2); lid.castShadow = true;
    lidPivot.add(lid);
    const gold = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: '#ffd84a' }));
    gold.rotation.x = -Math.PI / 2; gold.position.y = 0.3; gold.visible = false;
    g.add(body, band, lidPivot, gold);
    g.userData.lid = lidPivot; g.userData.gold = gold;
  } else if (o.type === 'torch') {
    const h = o.candle ? 0.3 : 0.75;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 8), std(o.candle ? '#efe6d0' : '#2a2420'));
    pole.position.y = h / 2; pole.castShadow = true;
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), color: `rgb(${o.color || '255,170,60'})`, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    flame.position.y = h + 0.12;
    flame.scale.setScalar(o.candle ? 0.25 : 0.45);
    g.add(pole, flame);
    g.userData.flame = flame; g.userData.flameY = h + 0.12;
  } else if (o.type === 'lever') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.18), std('#4a4e56', { metalness: 0.5 }));
    base.position.y = 0.07;
    const armPivot = new THREE.Group();
    armPivot.position.y = 0.14;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), std('#2a2a2e', { metalness: 0.6 }));
    arm.position.y = 0.22;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), std('#c0392b'));
    knob.position.y = 0.45;
    armPivot.add(arm, knob);
    g.add(base, armPivot);
    g.userData.arm = armPivot;
  } else if (o.type === 'trap') {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: '#e63c32', transparent: true, opacity: 0.35, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02;
    const spikes = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), std('#b8bcc4', { metalness: 0.7, roughness: 0.3 }));
      sp.position.set(-0.25 + (i % 3) * 0.25, 0.15, -0.25 + Math.floor(i / 3) * 0.25);
      spikes.add(sp);
    }
    g.add(pad, spikes);
    g.userData.pad = pad; g.userData.spikes = spikes;
  } else if (o.type === 'secret') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.02, WALL_H + 0.02, 1.02), new THREE.MeshBasicMaterial({ color: '#b478ff', wireframe: true }));
    box.position.y = WALL_H / 2;
    g.add(box);
  } else {
    return null; // parede rachada: desenhada junto com as paredes
  }
  g.traverse(n => { if (n.isMesh || n.isSprite) n.userData.objId = o.id; });
  scene.add(g);
  return g;
}

let flameTex = null;
function flameTexture() {
  if (flameTex) return flameTex;
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 38, 2, 32, 34, 30);
  grd.addColorStop(0, 'rgba(255,250,210,1)');
  grd.addColorStop(0.35, 'rgba(255,170,60,0.9)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  flameTex = canvasTexture(c);
  return flameTex;
}

function syncObjects(now) {
  const b = B();
  const objs = b.S.state.objects || [];
  const seen = new Set();
  const litTorches = [];
  for (const o of objs) {
    seen.add(o.id);
    let m = objMeshes.get(o.id);
    if (!m) { m = createObject(o); if (!m) continue; objMeshes.set(o.id, m); }
    const k = b.objAnim(o.id);
    if (o.type === 'door') {
      // Porta de quadrado: atravessa o meio do quadrado. Porta de borda (casa): fica na linha entre dois quadrados.
      if (o.edge) {
        if (o.v) { m.position.set(o.x, 0, o.y + 0.05); m.rotation.y = -Math.PI / 2; }
        else { m.position.set(o.x + 0.05, 0, o.y); m.rotation.y = 0; }
      } else if (o.dir === 'v') { m.position.set(o.x + 0.5, 0, o.y + 0.05); m.rotation.y = -Math.PI / 2; }
      else { m.position.set(o.x + 0.05, 0, o.y + 0.5); m.rotation.y = 0; }
      m.userData.hinge.rotation.y = (o.bars ? 0 : 1) * k * Math.PI * 0.5;
      if (o.bars) m.userData.hinge.position.y = k * 1.1; // a grade sobe
    } else if (o.type === 'chest') {
      m.position.set(o.x + 0.5, 0, o.y + 0.5);
      m.userData.lid.rotation.x = -k * 1.9;
      m.userData.gold.visible = k > 0.3;
    } else if (o.type === 'torch') {
      m.position.set(o.x + 0.5, 0, o.y + 0.5);
      m.userData.flame.visible = !!o.lit;
      if (o.lit) {
        const f = b.flicker(now, o.x * 7 + o.y);
        m.userData.flame.scale.setScalar((o.candle ? 0.25 : 0.45) * f);
        litTorches.push({ o, f, y: m.userData.flameY });
      }
    } else if (o.type === 'lever') {
      m.position.set(o.x + 0.5, 0, o.y + 0.5);
      m.userData.arm.rotation.z = 0.8 - k * 1.6;
    } else if (o.type === 'trap') {
      m.position.set(o.x + 0.5, 0, o.y + 0.5);
      m.userData.pad.visible = !o.revealed || o.armed;
      m.userData.spikes.visible = !!o.revealed;
    } else if (o.type === 'secret') {
      m.position.set(o.x + 0.5, 0, o.y + 0.5);
      m.visible = !o.open;
    }
  }
  for (const [id, m] of objMeshes) if (!seen.has(id)) { scene.remove(m); disposeObject(m); objMeshes.delete(id); }

  // Luz de verdade nas tochas acesas (as mais perto do centro da câmera, para não pesar)
  const tgt = controls.target;
  litTorches.sort((a, b2) => Math.hypot(a.o.x - tgt.x, a.o.y - tgt.z) - Math.hypot(b2.o.x - tgt.x, b2.o.y - tgt.z));
  while (torchLights.length < 10) {
    const l = new THREE.PointLight('#ffb060', 0, 6, 1.6);
    torchLights.push(l);
    scene.add(l);
  }
  torchLights.forEach((l, i) => {
    const t = litTorches[i];
    if (!t) { l.intensity = 0; return; }
    l.color.setRGB(...(t.o.color || '255,170,60').split(',').map(v => Number(v) / 255));
    l.position.set(t.o.x + 0.5, t.y + 0.1, t.o.y + 0.5);
    l.intensity = (t.o.candle ? 1.2 : 2.6) * t.f;
    l.distance = t.o.candle ? 3.5 : 6;
  });
}

// ---------- efeitos, partículas, números e pings ----------
const FX_COLOR = { slash: '#ff5a5a', magic: '#b388ff', blast: '#ff9d2e', heal: '#6fff8f', shot: '#fff35c', trap: '#c8ccd4', chest: '#ffd84a', dust: '#a89f92' };
function syncEffects(now) {
  const b = B();
  const g = b.S.state.map.grid;
  const seen = new Set();
  for (const e of b.effects) {
    seen.add(e);
    let m = fxMeshes.get(e);
    if (!m) {
      m = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 40), new THREE.MeshBasicMaterial({ color: FX_COLOR[e.kind] || '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: FX_COLOR[e.kind] || '#fff' }));
      m.add(ring, bolt);
      m.userData = { ring, bolt };
      scene.add(m);
      fxMeshes.set(e, m);
    }
    const age = (now - e.born) / 1000;
    const dur = e.duration || 1;
    const k = Math.min(1, age / dur);
    const tx = e.x / g; const tz = e.y / g;
    if (e.kind === 'shot' && e.from && age < e.travel) {
      const p = age / e.travel;
      m.userData.bolt.visible = true;
      m.userData.bolt.position.set(e.from.x / g + (tx - e.from.x / g) * p, 0.7, e.from.y / g + (tz - e.from.y / g) * p);
      m.userData.ring.visible = false;
    } else {
      m.userData.bolt.visible = false;
      m.userData.ring.visible = true;
      m.userData.ring.position.set(tx, 0.08, tz);
      const size = e.kind === 'blast' ? 3.2 : e.kind === 'magic' ? 1.8 : 1.2;
      m.userData.ring.scale.setScalar(0.4 + k * size);
      m.userData.ring.material.opacity = 1 - k;
    }
  }
  for (const [e, m] of fxMeshes) if (!seen.has(e)) { scene.remove(m); disposeObject(m); fxMeshes.delete(e); }

  // Partículas: mesma simulação do 2D, desenhadas acima do chão (a cor esmaece com a idade)
  const pos = particlePoints.geometry.attributes.position.array;
  const colAttr = particlePoints.geometry.attributes.color.array;
  const tmp = new THREE.Color();
  const list = b.particles;
  const n = Math.min(list.length, 3000);
  for (let i = 0; i < n; i++) {
    const p = list[i];
    const k = 1 - p.age / p.life;
    const rise = p.shape === 'smoke' || p.shape === 'plus' ? (1 - k) * 0.8 : 0;
    pos[i * 3] = p.x / g; pos[i * 3 + 1] = 0.35 + rise; pos[i * 3 + 2] = p.y / g;
    tmp.set(p.color); colAttr[i * 3] = tmp.r * k; colAttr[i * 3 + 1] = tmp.g * k; colAttr[i * 3 + 2] = tmp.b * k;
  }
  particlePoints.geometry.setDrawRange(0, n);
  particlePoints.geometry.attributes.position.needsUpdate = true;
  particlePoints.geometry.attributes.color.needsUpdate = true;

  // Números de dano, balões de dado, "❗"
  const fseen = new Set();
  for (const f of b.floaters) {
    const age = (now - f.born) / 1000;
    if (age < 0) continue;
    fseen.add(f);
    let s = floaterSprites.get(f);
    if (!s) {
      s = f.bubble ? textSprite(f.text, { size: 38, bg: f.bg || 'rgba(20,20,26,0.9)' }) : textSprite(f.text, { size: 52, color: f.color || '#fff', bg: null, stroke: 'rgba(0,0,0,0.9)' });
      scene.add(s);
      floaterSprites.set(f, s);
    }
    const k = age / f.life;
    const v = f.tokenId && b.vis.get(f.tokenId);
    let x; let z; let y = 1.5;
    if (v) { const sz = v.t.size || 1; x = v.x + sz / 2; z = v.y + sz / 2; y = 1.05 * sz + 0.9; } else { x = f.x / g; z = f.y / g; }
    s.position.set(x, y + (f.dy || 0) + k * 0.7, z);
    s.material.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
  }
  for (const [f, s] of floaterSprites) if (!fseen.has(f)) { scene.remove(s); disposeObject(s); floaterSprites.delete(f); }

  // Pings
  const pseen = new Set();
  for (const p of b.S.pings) {
    pseen.add(p);
    let m = pingMeshes.get(p);
    if (!m) {
      m = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 40), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
      pingMeshes.set(p, m);
    }
    const k = ((now - p.t) / 1600) % 1;
    m.position.set(p.x / g, 0.06, p.y / g);
    m.scale.setScalar(0.5 + k * 2.5);
    m.material.opacity = 1 - k;
  }
  for (const [p, m] of pingMeshes) if (!pseen.has(p)) { scene.remove(m); disposeObject(m); pingMeshes.delete(p); }
}

// ---------- clique, arrastar e mira ----------
function setNdc(e) {
  const r = canvas3d.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function groundPoint(e) {
  setNdc(e);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, p)) return null;
  const g = B().S.state.map.grid;
  return { x: p.x * g, y: p.z * g };
}

function pick(e) {
  const b = B();
  setNdc(e);
  const targets = [];
  for (const o of tokenObjs.values()) targets.push(o.userData.card, o.userData.frame, o.userData.base);
  for (const m of objMeshes.values()) m.traverse(n => { if (n.isMesh) targets.push(n); });
  if (blockMesh) targets.push(blockMesh);
  const hits = raycaster.intersectObjects(targets, false);
  let token = null;
  let object = null;
  for (const h of hits) {
    const u = h.object.userData;
    if (u.tokenId && !token) token = b.S.state.tokens.find(t => t.id === u.tokenId) || null;
    if (u.objId && !object && !token) object = (b.S.state.objects || []).find(o => o.id === u.objId) || null;
    if (h.object === blockMesh && !object && !token && h.instanceId != null) {
      // Parede rachada não tem malha própria: vale o bloco de parede clicado
      const [c, r] = blockMesh.userData.cells[h.instanceId];
      object = (b.S.state.objects || []).find(o => o.type === 'crack' && !o.broken && o.x === c && o.y === r) || null;
      break; // parede na frente: o que está atrás não conta
    }
    if (token) break;
  }
  return { token, object, ground: groundPoint(e) };
}

function onPointerDown(e) {
  const b = B();
  if (!active || !b?.S.state || e.button !== 0) return;
  const { token, object, ground } = pick(e);
  if (!ground) return;
  if (b.pointerDownAt(e, ground, token, token ? null : object)) {
    controls.enabled = false; // este clique é do jogo, não da câmera
    dragging = true;
    try { canvas3d.setPointerCapture(e.pointerId); } catch { /* ok */ }
  }
}

function onPointerMove(e) {
  const b = B();
  if (!active || !b?.S.state) return;
  const ground = groundPoint(e);
  if (!ground) return;
  if (dragging) b.pointerMoveAt(ground);
  else b.S.hover = ground;
}

function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  controls.enabled = true;
  B().endPointer();
}

function syncHover() {
  const b = B();
  const tool = b.S.tool;
  const g = b.S.state.map.grid;
  const show = b.S.hover && (tool.startsWith('obj:') || tool.startsWith('abl:') || b.isBrush());
  hoverMesh.visible = !!show;
  if (!show) return;
  let size = 1;
  if (tool.startsWith('abl:')) {
    const [, id, i] = tool.split(':');
    size = ((b.abilitiesOfToken(b.S.state.tokens.find(t => t.id === id))[Number(i)]?.radius) || 0) * 2 + 1;
    hoverMesh.material.color.set('#ff7a3a');
  } else if (b.isBrush()) {
    size = b.S.brush;
    hoverMesh.material.color.set(tool === 'reveal' ? '#ffe9a8' : '#8aa0ff');
  } else hoverMesh.material.color.set('#7fd1ff');
  const cx = Math.floor(b.S.hover.x / g); const cy = Math.floor(b.S.hover.y / g);
  hoverMesh.scale.set(size, size, 1);
  hoverMesh.position.set(cx + 0.5, 0.05, cy + 0.5);
}

// ---------- laço ----------
let lastFrame = 0;
function render(now) {
  const b = B();
  const st = b?.S.state;
  if (!active || !st) return;
  if (!fitted) fit();
  rebuildGround(st);
  rebuildWalls(st);
  rebuildFog(st);
  syncMinis(now);
  updateCutaway(now, Math.min(0.1, (now - (lastFrame || now)) / 1000));
  lastFrame = now;
  syncObjects(now);
  syncEffects(now);
  syncHover();
  controls.update();
  renderer.render(scene, camera);
}

function setActive(on) {
  active = on;
  canvas3d.hidden = !on;
  if (on) { resize(); if (!fitted) fit(); }
}

function zoom(factor) {
  const dir = camera.position.clone().sub(controls.target).multiplyScalar(factor);
  camera.position.copy(controls.target).add(dir);
  controls.update();
}

// Centraliza a câmera num ponto do mapa (em quadrados), mantendo ângulo e distância.
function focus(x, z) {
  const d = new THREE.Vector3(x, 0, z).sub(controls.target);
  controls.target.add(d);
  camera.position.add(d);
  controls.update();
}

mount();
// Duplo clique numa miniatura: a câmera vai até ela
canvas3d.addEventListener('dblclick', e => {
  const { token } = pick(e);
  if (token) focus(token.x + (token.size || 1) / 2, token.y + (token.size || 1) / 2);
});
window.MESA3D = {
  render, setActive, fit, zoom, focus,
  cutInfo: () => cuttables.map(c => [c.kind, c.k.length, c.target.reduce((a, v) => a + v, 0), c.proxy.boundingSphere?.radius]),
  // Posição na tela (px do canvas) de um ponto do mapa — usado em testes
  toScreen(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); const r = canvas3d.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
};
window.dispatchEvent(new Event('mesa3d-ready'));
