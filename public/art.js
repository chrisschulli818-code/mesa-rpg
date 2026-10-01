/* Galeria de retratos ilustrados (SVG) para tokens de personagens e monstros. */
(function (root) {
  'use strict';

  const svg = (bg1, bg2, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="b" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient></defs><rect width="100" height="100" fill="url(#b)"/>${body}</svg>`;

  const eyes = (y, r = 2.4, c = '#222', dx = 7) => `<circle cx="${50 - dx}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${50 + dx}" cy="${y}" r="${r}" fill="${c}"/>`;

  const ART = [
    // ---------- fantasia ----------
    { key: 'guerreiro', name: 'Guerreiro', sys: 'dnd5e', kind: 'pc', svg: svg('#8c93a0', '#2c3038',
      `<path d="M20 100 Q50 68 80 100Z" fill="#6b7280"/><ellipse cx="50" cy="56" rx="19" ry="22" fill="#e0b48a"/>
      <path d="M31 60 Q50 94 69 60 Q66 76 50 80 Q34 76 31 60Z" fill="#7a4a24"/>
      <path d="M28 54 Q27 20 50 18 Q73 20 72 54 L66 54 Q65 36 50 34 Q35 36 34 54Z" fill="#a3adba"/>
      <rect x="47" y="33" width="6" height="27" rx="2" fill="#7b8491"/>${eyes(54, 2.6)}
      <path d="M44 69 Q50 72 56 69" stroke="#3b2412" stroke-width="2" fill="none"/>`) },
    { key: 'mago', name: 'Mago', sys: 'dnd5e', kind: 'pc', svg: svg('#6a4bb0', '#1a1030',
      `<path d="M18 100 Q50 66 82 100Z" fill="#4c2a85"/><ellipse cx="50" cy="58" rx="17" ry="19" fill="#f0c9a0"/>
      <path d="M32 62 Q50 106 68 62 Q60 72 50 72 Q40 72 32 62Z" fill="#eeeeee"/>
      <path d="M22 46 L78 46 L70 40 L55 4 L30 40Z" fill="#5b34a3"/><rect x="20" y="42" width="60" height="8" rx="4" fill="#442479"/>
      <path d="M49 20 l2.2 5 5.2.5 -4 3.6 1.2 5.2 -4.4-2.8 -4.4 2.8 1.2-5.2 -4-3.6 5.2-.5z" fill="#ffd54a"/>
      ${eyes(57, 2.3)}<path d="M39 52 L46 53 M54 53 L61 52" stroke="#dddddd" stroke-width="2.5"/>`) },
    { key: 'ladino', name: 'Ladino', sys: 'dnd5e', kind: 'pc', svg: svg('#4a4a58', '#111116',
      `<path d="M14 100 Q50 60 86 100Z" fill="#26262e"/><path d="M22 100 Q16 28 50 16 Q84 28 78 100Z" fill="#3a3a46"/>
      <ellipse cx="50" cy="58" rx="17" ry="20" fill="#1c1c22"/><rect x="33" y="62" width="34" height="15" rx="5" fill="#5a1f24"/>
      <ellipse cx="43" cy="54" rx="4" ry="2.2" fill="#ffd65a"/><ellipse cx="57" cy="54" rx="4" ry="2.2" fill="#ffd65a"/>`) },
    { key: 'elfa', name: 'Elfa arqueira', sys: 'dnd5e', kind: 'pc', svg: svg('#4f9a5c', '#122a17',
      `<path d="M20 100 Q50 68 80 100Z" fill="#2f6b3a"/><path d="M28 92 Q24 40 50 30 Q76 40 72 92Z" fill="#e8c35a"/>
      <path d="M31 57 L16 42 L34 50Z" fill="#f1d0ae"/><path d="M69 57 L84 42 L66 50Z" fill="#f1d0ae"/>
      <ellipse cx="50" cy="57" rx="17" ry="20" fill="#f4d6b6"/><path d="M32 50 Q34 30 50 30 Q66 30 68 50 Q60 38 50 40 Q40 38 32 50Z" fill="#f0cf6a"/>
      <path d="M26 52 Q24 18 50 14 Q76 18 74 52 L70 40 Q62 24 50 24 Q38 24 30 40Z" fill="#3c8a4a"/>
      ${eyes(57, 2.4, '#2a5a2a')}<path d="M46 67 Q50 69 54 67" stroke="#b5566a" stroke-width="2" fill="none"/>`) },
    { key: 'anao', name: 'Anão', sys: 'dnd5e', kind: 'pc', svg: svg('#a0703a', '#2c1a0a',
      `<path d="M16 100 Q50 64 84 100Z" fill="#8a5a2b"/><ellipse cx="50" cy="54" rx="19" ry="19" fill="#e6b38a"/>
      <path d="M28 56 Q30 100 50 98 Q70 100 72 56 Q64 70 50 70 Q36 70 28 56Z" fill="#d0602a"/>
      <path d="M36 64 Q50 59 64 64 Q56 70 50 68 Q44 70 36 64Z" fill="#b84e1f"/>
      <path d="M30 37 Q14 31 13 13 Q24 26 34 30Z" fill="#efe6d0"/><path d="M70 37 Q86 31 87 13 Q76 26 66 30Z" fill="#efe6d0"/>
      <path d="M29 48 Q30 23 50 23 Q70 23 71 48Z" fill="#8d96a3"/><rect x="27" y="44" width="46" height="7" rx="3" fill="#6c7480"/>
      ${eyes(56)}<ellipse cx="50" cy="61" rx="4" ry="3" fill="#d49a72"/>`) },
    { key: 'goblin', name: 'Goblin', sys: 'dnd5e', kind: 'monster', svg: svg('#5d6b3a', '#161b0c',
      `<path d="M20 100 Q50 72 80 100Z" fill="#5a3e2b"/><path d="M31 50 L3 30 L30 63Z" fill="#6aa84f"/><path d="M69 50 L97 30 L70 63Z" fill="#6aa84f"/>
      <ellipse cx="50" cy="58" rx="22" ry="21" fill="#7cbf5a"/>
      <ellipse cx="41" cy="54" rx="5.5" ry="4.5" fill="#ffe14d"/><ellipse cx="59" cy="54" rx="5.5" ry="4.5" fill="#ffe14d"/>${eyes(54, 2, '#111', 9)}
      <path d="M33 46 L46 50 M67 46 L54 50" stroke="#355e24" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="50" cy="61" rx="3" ry="4" fill="#5e9a42"/><path d="M37 68 Q50 78 63 68 Q50 72 37 68Z" fill="#2d1d10" stroke="#2d1d10" stroke-width="3" stroke-linejoin="round"/>
      <path d="M42 69 l2 4 2-3.6 M54 69.5 l2 3.5 2-4" fill="#ffffff" stroke="#ffffff" stroke-width="1.5"/>`) },
    { key: 'orc', name: 'Orc', sys: 'dnd5e', kind: 'monster', svg: svg('#6b5a44', '#1a140c',
      `<path d="M14 100 Q50 62 86 100Z" fill="#4a3a2e"/><path d="M29 56 L15 43 L31 50Z" fill="#6f8f5a"/><path d="M71 56 L85 43 L69 50Z" fill="#6f8f5a"/>
      <path d="M28 52 Q28 30 50 30 Q72 30 72 52 Q74 78 50 84 Q26 78 28 52Z" fill="#7c9a63"/>
      <path d="M28 41 Q30 23 50 21 Q70 23 72 41 Q60 30 50 31 Q40 30 28 41Z" fill="#222222"/>
      <rect x="30" y="44" width="40" height="6" rx="3" fill="#56703f"/>
      <ellipse cx="41" cy="54" rx="4" ry="2.6" fill="#ff5a3a"/><ellipse cx="59" cy="54" rx="4" ry="2.6" fill="#ff5a3a"/>
      <path d="M36 71 Q50 65 64 71" stroke="#2c2a1c" stroke-width="3" fill="none"/>
      <path d="M38 72 L36 60 L43 70Z" fill="#fffbe6"/><path d="M62 72 L64 60 L57 70Z" fill="#fffbe6"/>
      <path d="M60 35 L66 50" stroke="#aa3333" stroke-width="2"/>`) },
    { key: 'esqueleto', name: 'Esqueleto', sys: 'dnd5e', kind: 'monster', svg: svg('#3d4a5c', '#0b0f16',
      `<path d="M26 100 Q50 82 74 100Z" fill="#cfc8b8"/>
      <path d="M28 50 Q28 21 50 21 Q72 21 72 50 Q72 62 64 66 L64 74 L36 74 L36 66 Q28 62 28 50Z" fill="#efe9dc"/>
      <ellipse cx="41" cy="50" rx="6.5" ry="7.5" fill="#1a1a1a"/><ellipse cx="59" cy="50" rx="6.5" ry="7.5" fill="#1a1a1a"/>
      <circle cx="41" cy="51" r="2" fill="#6ef0ff"/><circle cx="59" cy="51" r="2" fill="#6ef0ff"/>
      <path d="M50 58 L46 65 L54 65Z" fill="#1a1a1a"/><rect x="36" y="72" width="28" height="9" rx="2" fill="#efe9dc"/>
      <path d="M36 72 H64 M41 72 V81 M46 72 V81 M50 72 V81 M54 72 V81 M59 72 V81" stroke="#1a1a1a" stroke-width="1.3"/>`) },
    { key: 'lobo', name: 'Lobo', sys: 'dnd5e', kind: 'monster', svg: svg('#4a5563', '#101418',
      `<path d="M22 46 L29 10 L45 34Z" fill="#6e7580"/><path d="M78 46 L71 10 L55 34Z" fill="#6e7580"/>
      <path d="M27 40 L30 18 L39 34Z" fill="#d9a3a3"/><path d="M73 40 L70 18 L61 34Z" fill="#d9a3a3"/>
      <path d="M24 50 Q24 28 50 28 Q76 28 76 50 Q76 62 66 70 L58 88 Q50 94 42 88 L34 70 Q24 62 24 50Z" fill="#8a929c"/>
      <path d="M38 64 Q50 60 62 64 L58 86 Q50 92 42 86Z" fill="#d7dbe0"/><ellipse cx="50" cy="80" rx="5" ry="3.6" fill="#1b1b1b"/>
      <path d="M35 49 L47 52 L38 56Z" fill="#ffcf3a"/><path d="M65 49 L53 52 L62 56Z" fill="#ffcf3a"/>`) },
    { key: 'dragao', name: 'Dragão', sys: 'dnd5e', kind: 'monster', svg: svg('#7a1f14', '#1e0603',
      `<path d="M30 40 L13 6 L39 30Z" fill="#e9d8a6"/><path d="M70 40 L87 6 L61 30Z" fill="#e9d8a6"/>
      <path d="M22 56 Q20 30 50 26 Q80 30 78 56 Q78 70 66 76 L62 92 Q50 98 38 92 L34 76 Q22 70 22 56Z" fill="#c0392b"/>
      <path d="M40 30 L44 21 L48 29 L52 21 L56 29 L60 21" fill="none" stroke="#8e2418" stroke-width="3"/>
      <path d="M36 74 Q50 70 64 74 L60 90 Q50 95 40 90Z" fill="#e05a47"/>
      <ellipse cx="44" cy="84" rx="2.2" ry="1.4" fill="#3a0a06"/><ellipse cx="56" cy="84" rx="2.2" ry="1.4" fill="#3a0a06"/>
      <path d="M29 50 L47 54 L31 59Z" fill="#ffd23a"/><path d="M71 50 L53 54 L69 59Z" fill="#ffd23a"/>
      <path d="M38 51 L39 57 M62 51 L61 57" stroke="#111111" stroke-width="2"/>`) },
    { key: 'slime', name: 'Gosma', sys: 'dnd5e', kind: 'monster', svg: svg('#2e5a3a', '#08140c',
      `<path d="M16 86 Q14 50 34 36 Q50 24 66 36 Q86 50 84 86 Q76 94 66 88 Q58 96 50 90 Q42 96 34 88 Q24 94 16 86Z" fill="#52d273" opacity=".92"/>
      <ellipse cx="36" cy="44" rx="7" ry="4" fill="#ffffff" opacity=".6" transform="rotate(-30 36 44)"/>
      <ellipse cx="42" cy="60" rx="5" ry="6" fill="#112233"/><ellipse cx="60" cy="60" rx="5" ry="6" fill="#112233"/>
      <circle cx="43.5" cy="58" r="1.8" fill="#ffffff"/><circle cx="61.5" cy="58" r="1.8" fill="#ffffff"/>
      <path d="M44 72 Q51 77 58 72" stroke="#112233" stroke-width="2.5" fill="none" stroke-linecap="round"/>`) },
    { key: 'aranha', name: 'Aranha gigante', sys: 'dnd5e', kind: 'monster', svg: svg('#6d5a7a', '#1e1626',
      `<g stroke="#1c1c1c" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M42 48 L24 32 L10 42"/><path d="M41 54 L18 50 L6 62"/><path d="M41 60 L20 68 L12 84"/><path d="M44 64 L32 80 L30 96"/>
      <path d="M58 48 L76 32 L90 42"/><path d="M59 54 L82 50 L94 62"/><path d="M59 60 L80 68 L88 84"/><path d="M56 64 L68 80 L70 96"/></g>
      <ellipse cx="50" cy="73" rx="16" ry="18" fill="#2a2a2a"/><path d="M44 71 L50 64 L56 71 L50 79Z" fill="#c0392b"/>
      <circle cx="50" cy="50" r="13" fill="#333333"/>
      <circle cx="45" cy="47" r="2.6" fill="#ff3b3b"/><circle cx="55" cy="47" r="2.6" fill="#ff3b3b"/><circle cx="41" cy="52" r="1.6" fill="#ff3b3b"/><circle cx="59" cy="52" r="1.6" fill="#ff3b3b"/>`) },
    { key: 'olho', name: 'Olho tirano', sys: 'dnd5e', kind: 'monster', svg: svg('#4a2a5c', '#12081a',
      `<g stroke="#7d3c98" stroke-width="3.5" fill="none"><path d="M36 36 Q28 18 20 16"/><path d="M50 31 Q50 16 50 9"/><path d="M64 36 Q72 18 80 16"/><path d="M30 46 Q16 38 10 30"/><path d="M70 46 Q84 38 90 30"/></g>
      <g fill="#f2e6ff"><circle cx="20" cy="16" r="4"/><circle cx="50" cy="9" r="4"/><circle cx="80" cy="16" r="4"/><circle cx="10" cy="30" r="4"/><circle cx="90" cy="30" r="4"/></g>
      <g fill="#111111"><circle cx="20" cy="16" r="1.6"/><circle cx="50" cy="9" r="1.6"/><circle cx="80" cy="16" r="1.6"/><circle cx="10" cy="30" r="1.6"/><circle cx="90" cy="30" r="1.6"/></g>
      <circle cx="50" cy="60" r="30" fill="#9b59b6"/><ellipse cx="50" cy="55" rx="16" ry="12" fill="#ffffff"/>
      <circle cx="50" cy="55" r="7.5" fill="#27ae60"/><circle cx="50" cy="55" r="3.5" fill="#111111"/>
      <path d="M34 75 Q50 88 66 75 Z" fill="#3d1a4a"/>
      <path d="M39 76 l2 4 2-3.5 M47 78 l2 4 2-4 M55 78 l2 4 2-4 M61 76 l1 3 2-3" stroke="#ffffff" stroke-width="1.5" fill="none"/>`) },

    // ---------- cyberpunk ----------
    { key: 'netrunner', name: 'Netrunner', sys: 'cyberpunk', kind: 'pc', svg: svg('#1b2a55', '#050814',
      `<path d="M18 100 Q50 66 82 100Z" fill="#23233a"/><ellipse cx="50" cy="56" rx="18" ry="21" fill="#c99a7b"/>
      <path d="M30 50 Q30 25 50 25 Q70 25 70 50 Q64 36 50 36 Q36 36 30 50Z" fill="#111111"/>
      <rect x="28" y="46" width="44" height="12" rx="6" fill="#05d9e8"/><path d="M32 51 H68" stroke="#e0ffff" stroke-width="1.2" opacity=".8"/>
      <path d="M44 68 H56" stroke="#6b3f2e" stroke-width="2"/>
      <path d="M31 60 Q20 76 26 98" stroke="#ff2a6d" stroke-width="2.5" fill="none"/><path d="M69 60 Q80 76 74 98" stroke="#05d9e8" stroke-width="2.5" fill="none"/>`) },
    { key: 'solo', name: 'Solo', sys: 'cyberpunk', kind: 'pc', svg: svg('#4a1028', '#0a0306',
      `<path d="M16 100 Q50 64 84 100Z" fill="#2d2d2d"/><ellipse cx="50" cy="57" rx="19" ry="22" fill="#b9825f"/>
      <path d="M44 10 L56 10 L58 40 L42 40Z" fill="#ff2a6d"/>
      <circle cx="42" cy="55" r="2.5" fill="#222222"/><circle cx="59" cy="55" r="5.5" fill="#444444"/><circle cx="59" cy="55" r="3" fill="#ff3030"/>
      <path d="M53 48 L68 48 L68 62 L62 62" stroke="#999999" stroke-width="1.5" fill="none"/>
      <path d="M42 66 H56" stroke="#5a3522" stroke-width="2"/><path d="M34 70 Q50 82 66 70 L66 76 Q50 90 34 76Z" fill="#9aa1a8"/>`) },
    { key: 'booster', name: 'Booster', sys: 'cyberpunk', kind: 'monster', svg: svg('#3a1f5c', '#0b0612',
      `<path d="M16 100 Q50 64 84 100Z" fill="#3b1f5c"/><ellipse cx="50" cy="56" rx="18" ry="21" fill="#d6a882"/>
      <path d="M30 46 L25 20 L38 33 L42 12 L50 29 L58 10 L62 31 L75 18 L70 46 Q60 34 50 34 Q40 34 30 46Z" fill="#f7ec13"/>
      ${eyes(52, 2.5)}<path d="M31 60 Q50 56 69 60 L66 75 Q50 83 34 75Z" fill="#111111"/>
      <path d="M38 64 Q50 75 62 64" stroke="#39ff14" stroke-width="2.5" fill="none"/>`) },
    { key: 'drone', name: 'Drone', sys: 'cyberpunk', kind: 'monster', svg: svg('#12304a', '#040a10',
      `<ellipse cx="22" cy="20" rx="15" ry="3" fill="#cfe6ff" opacity=".5"/><ellipse cx="78" cy="20" rx="15" ry="3" fill="#cfe6ff" opacity=".5"/>
      <rect x="16" y="22" width="68" height="6" rx="3" fill="#9aa7b4"/><path d="M27 28 L37 40 M73 28 L63 40" stroke="#6b7785" stroke-width="4"/>
      <circle cx="50" cy="56" r="22" fill="#39424d" stroke="#7a8793" stroke-width="3"/>
      <circle cx="50" cy="56" r="11" fill="#111111"/><circle cx="50" cy="56" r="6" fill="#ff2a2a"/><circle cx="47" cy="53" r="2" fill="#ffb3b3"/>
      <path d="M37 79 L32 91 M63 79 L68 91 M50 78 V93" stroke="#6b7785" stroke-width="3"/>`) },
    { key: 'ciberpsicopata', name: 'Ciberpsicopata', sys: 'cyberpunk', kind: 'monster', svg: svg('#4a0a0a', '#0d0202',
      `<path d="M16 100 Q50 64 84 100Z" fill="#1d1d1d"/>
      <path d="M50 33 Q31 33 31 56 Q31 79 50 81Z" fill="#c48c6c"/><path d="M50 33 Q69 33 69 56 Q69 79 50 81Z" fill="#b8c2cc"/>
      <path d="M50 33 V81" stroke="#555555" stroke-width="1.5"/><path d="M56 44 H66 M56 62 H68 M60 71 H66" stroke="#7d8894" stroke-width="1.5"/>
      <path d="M31 46 Q30 25 50 25 Q58 25 64 29 L60 35 Q52 31 44 33Z" fill="#1a1a1a"/>
      <circle cx="42" cy="53" r="3.5" fill="#ff1a1a"/><circle cx="58" cy="53" r="3.5" fill="#ff1a1a"/>
      <path d="M38 68 Q50 77 62 68 Z" fill="#ffffff" stroke="#111111" stroke-width="2"/>
      <path d="M43 69 V73 M47 70 V75 M51 70 V75 M55 70 V74" stroke="#111111" stroke-width="1"/>`) },
    { key: 'corpo', name: 'Corpo', sys: 'cyberpunk', kind: 'monster', svg: svg('#16324a', '#060d14',
      `<path d="M14 100 Q50 66 86 100Z" fill="#1c1f26"/><path d="M42 78 L50 100 L58 78Z" fill="#eaeaea"/><path d="M48 80 L50 97 L52 80Z" fill="#b01030"/>
      <ellipse cx="50" cy="56" rx="17" ry="21" fill="#e3b995"/>
      <path d="M32 50 Q30 27 50 27 Q72 27 68 48 Q64 34 48 36 Q38 38 32 50Z" fill="#2b1d14"/>
      <rect x="33" y="49" width="15" height="7" rx="2" fill="#0b0b0b"/><rect x="52" y="49" width="15" height="7" rx="2" fill="#0b0b0b"/><path d="M48 52 H52" stroke="#0b0b0b" stroke-width="2"/>
      <path d="M44 68 Q50 70 56 68" stroke="#7a4b35" stroke-width="2" fill="none"/>`) },

    // ---------- Call of Cthulhu ----------
    { key: 'investigador', name: 'Investigador', sys: 'coc', kind: 'pc', svg: svg('#4d4838', '#12110c',
      `<path d="M14 100 Q50 64 86 100Z" fill="#8b6f47"/><path d="M36 77 L50 93 L64 77 L58 100 L42 100Z" fill="#6e5636"/>
      <ellipse cx="50" cy="58" rx="17" ry="20" fill="#e2bc98"/>
      <ellipse cx="50" cy="42" rx="34" ry="7" fill="#4a3a28"/><path d="M32 42 Q32 19 50 19 Q68 19 68 42Z" fill="#5a4630"/><rect x="32" y="35" width="36" height="5" fill="#2a2016"/>
      ${eyes(57, 2.3)}<path d="M42 66 Q50 63 58 66" stroke="#5a3a2a" stroke-width="3" fill="none"/>`) },
    { key: 'ocultista', name: 'Ocultista', sys: 'coc', kind: 'pc', svg: svg('#3a3350', '#0e0c16',
      `<path d="M16 100 Q50 64 84 100Z" fill="#2a2438"/><ellipse cx="50" cy="56" rx="17" ry="21" fill="#e6c4a4"/>
      <path d="M30 60 Q26 24 50 24 Q74 24 70 60 Q68 40 50 38 Q32 40 30 60Z" fill="#7a7a7a"/>
      <circle cx="43" cy="55" r="5" fill="none" stroke="#c9a227" stroke-width="1.5"/><circle cx="57" cy="55" r="5" fill="none" stroke="#c9a227" stroke-width="1.5"/><path d="M48 55 H52" stroke="#c9a227" stroke-width="1.5"/>
      ${eyes(55, 1.8)}<path d="M45 68 Q50 70 55 68" stroke="#8a5a4a" stroke-width="2" fill="none"/>
      <path d="M44 86 L50 80 L56 86 L50 92Z" fill="#8fbf8f"/>`) },
    { key: 'cultista', name: 'Cultista', sys: 'coc', kind: 'monster', svg: svg('#3a0d12', '#0a0203',
      `<path d="M12 100 Q16 30 50 13 Q84 30 88 100Z" fill="#7a1420"/><path d="M30 70 Q30 34 50 30 Q70 34 70 70 Q50 82 30 70Z" fill="#0b0506"/>
      <ellipse cx="43" cy="54" rx="3.5" ry="2" fill="#f5e663"/><ellipse cx="57" cy="54" rx="3.5" ry="2" fill="#f5e663"/>
      <g stroke="#e9c46a" stroke-width="2" fill="none"><circle cx="50" cy="88" r="7"/><path d="M50 81 V95 M43 88 H57"/></g>`) },
    { key: 'profundo', name: 'Profundo', sys: 'coc', kind: 'monster', svg: svg('#0d3a46', '#03100f',
      `<path d="M16 100 Q50 64 84 100Z" fill="#2b5d57"/><path d="M50 18 L56 34 L44 34Z" fill="#3d8f84"/>
      <path d="M26 56 Q26 28 50 28 Q74 28 74 56 Q74 80 50 84 Q26 80 26 56Z" fill="#4aa396"/>
      <path d="M30 69 L36 65 M30 74 L36 70 M70 69 L64 65 M70 74 L64 70" stroke="#2c6b62" stroke-width="2"/>
      <circle cx="38" cy="50" r="8" fill="#e8f1c0"/><circle cx="62" cy="50" r="8" fill="#e8f1c0"/><circle cx="38" cy="50" r="4" fill="#111111"/><circle cx="62" cy="50" r="4" fill="#111111"/>
      <path d="M36 70 Q50 64 64 70 Q50 78 36 70Z" fill="#1d3e3a"/>
      <path d="M40 70 l2 3 2-3 l2 3 2-3 l2 3 2-3 l2 3 2-3 l2 3 2-3" stroke="#e8f1c0" stroke-width="1" fill="none"/>`) },
    { key: 'shoggoth', name: 'Shoggoth', sys: 'coc', kind: 'monster', svg: svg('#1d3320', '#020402',
      `<path d="M10 90 Q8 44 30 32 Q44 18 62 28 Q90 38 90 80 Q84 96 66 90 Q54 100 40 92 Q22 100 10 90Z" fill="#161c16"/>
      <path d="M30 36 Q44 26 58 32" stroke="#3f5a3f" stroke-width="3" fill="none"/>
      <g fill="#b6ff5a"><circle cx="34" cy="50" r="5"/><circle cx="56" cy="42" r="7"/><circle cx="70" cy="60" r="4"/><circle cx="44" cy="68" r="3"/><circle cx="62" cy="76" r="5"/><circle cx="26" cy="72" r="3"/></g>
      <g fill="#000000"><circle cx="34" cy="50" r="2"/><circle cx="56" cy="42" r="3"/><circle cx="70" cy="60" r="1.6"/><circle cx="44" cy="68" r="1.2"/><circle cx="62" cy="76" r="2"/><circle cx="26" cy="72" r="1.2"/></g>`) },
    { key: 'carnical', name: 'Carniçal', sys: 'coc', kind: 'monster', svg: svg('#33333d', '#08080b',
      `<path d="M22 46 L22 12 L41 36Z" fill="#7d8078"/><path d="M78 46 L78 12 L59 36Z" fill="#7d8078"/>
      <path d="M26 54 Q26 30 50 30 Q74 30 74 54 Q72 70 62 76 L58 90 Q50 96 42 90 L38 76 Q28 70 26 54Z" fill="#9a9d92"/>
      <path d="M36 72 Q50 68 64 72 L60 88 Q50 94 40 88Z" fill="#7f8378"/>
      <ellipse cx="41" cy="52" rx="5" ry="3.5" fill="#ff3131"/><ellipse cx="59" cy="52" rx="5" ry="3.5" fill="#ff3131"/>
      <path d="M42 80 Q50 84 58 80" stroke="#2a1a1a" stroke-width="2" fill="none"/>
      <path d="M41 81 L43 88 L45 82Z M55 82 L57 88 L59 81Z" fill="#f3f0dc"/>`) },
    { key: 'tentaculos', name: 'Tentáculos', sys: 'coc', kind: 'monster', svg: svg('#2a1340', '#07030c',
      `<g fill="none" stroke-linecap="round"><path d="M20 100 Q14 70 30 58 Q44 48 36 34 Q30 24 40 20" stroke="#8e44ad" stroke-width="9"/>
      <path d="M50 100 Q56 74 46 60 Q38 46 54 36 Q66 28 58 16" stroke="#9b59b6" stroke-width="10"/>
      <path d="M80 100 Q88 76 72 64 Q60 54 70 42 Q78 34 72 26" stroke="#7d3c98" stroke-width="8"/></g>
      <g fill="#e8c6f5"><circle cx="31" cy="60" r="2"/><circle cx="37" cy="47" r="2"/><circle cx="48" cy="62" r="2"/><circle cx="49" cy="46" r="2"/><circle cx="74" cy="64" r="2"/><circle cx="67" cy="50" r="2"/></g>`) },
  ];

  const byKey = Object.fromEntries(ART.map(a => [a.key, a]));
  const cache = {};
  function artSrc(key) {
    if (!byKey[key]) return null;
    return (cache[key] ||= `data:image/svg+xml;charset=utf-8,${encodeURIComponent(byKey[key].svg.replace(/\s*\n\s*/g, ''))}`);
  }

  root.TOKEN_ART = { list: ART, byKey, artSrc };
})(this);
