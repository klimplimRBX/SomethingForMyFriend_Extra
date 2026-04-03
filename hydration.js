
const _GITHUB_BASE = 'https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/';

async function _fetchGhSfx(filename) {
  if (!SFX._ctx || !filename) return null;
  try {
    const res = await fetch(_GITHUB_BASE + filename);
    if (!res.ok) return null;
    const ab  = await res.arrayBuffer();
    return SFX._ctx.decodeAudioData(ab);
  } catch(e) { console.warn('fetchGhSfx failed:', filename, e); return null; }
}

async function _fetchGhMusic(filename) {
  if (!SFX._ctx || !filename) return null;
  const key = 'gh_music_' + filename;
  if (SFX._bufs[key]) return key; // already loaded
  try {
    const res = await fetch(_GITHUB_BASE + filename);
    if (!res.ok) return null;
    const ab  = await res.arrayBuffer();
    SFX._bufs[key] = await SFX._ctx.decodeAudioData(ab);
    return key;
  } catch(e) { console.warn('fetchGhMusic failed:', filename, e); return null; }
}

// Hydrate one cfg object (shared by normal and condition cfgs)
async function _hydrateCfgAssets(cfg) {
  // Char images (base64)
  if (cfg.charImg && !cfg._charImgEl) {
    const img=new Image(); img.src=cfg.charImg; cfg._charImgEl=img;
    await new Promise(r=>{img.onload=r;img.onerror=r;});
  }
  if (cfg.hurtImg && !cfg._hurtImgEl) {
    const img=new Image(); img.src=cfg.hurtImg; cfg._hurtImgEl=img;
    await new Promise(r=>{img.onload=r;img.onerror=r;});
  }
  if (cfg.weaponImg && !cfg._weaponImgEl) {
    const img=new Image(); img.src=cfg.weaponImg; cfg._weaponImgEl=img;
    await new Promise(r=>{img.onload=r;img.onerror=r;});
  }
  // Shot images (base64)
  if (cfg.shotImgs && cfg.shotImgs.length>0 && !cfg._shotImgEls) {
    cfg._shotImgEls = await Promise.all(cfg.shotImgs.map(b64=>new Promise(r=>{
      const img=new Image(); img.src=b64;
      img.onload=()=>r(img); img.onerror=()=>r(null);
    })));
  }
  // SFX from GitHub
  if (cfg.sfxShootOne  && !cfg._sfxShootOneBuf)  cfg._sfxShootOneBuf  = await _fetchGhSfx(cfg.sfxShootOne);
  if (cfg.sfxShootAll  && !cfg._sfxShootAllBuf)  cfg._sfxShootAllBuf  = await _fetchGhSfx(cfg.sfxShootAll);
  if (cfg.sfxDamage    && !cfg._sfxDamageBuf)    cfg._sfxDamageBuf    = await _fetchGhSfx(cfg.sfxDamage);
  if (cfg.sfxRandom    && !cfg._sfxRandomBuf)    cfg._sfxRandomBuf    = await _fetchGhSfx(cfg.sfxRandom);
  // Music from GitHub
  if (cfg.musicFilename && !cfg._musicKey) {
    cfg._musicKey = await _fetchGhMusic(cfg.musicFilename);
  }
}

async function hydrateCustom(cfg) {
  await _hydrateCfgAssets(cfg);
  // Condition sub-cfg
  if (cfg.conditionEnabled && cfg.conditionCfg && !cfg._condCfgHydrated) {
    // Condition cfg inherits images from parent if not set
    const cc = cfg.conditionCfg;
    if (!cc.charImg) cc._charImgEl = cfg._charImgEl;
    if (!cc.hurtImg) cc._hurtImgEl = cfg._hurtImgEl;
    if (!cc.shotImgs || cc.shotImgs.length===0) cc._shotImgEls = cfg._shotImgEls;
    await _hydrateCfgAssets(cc);
    cfg._condCfgHydrated = cc;
  }
}

// ── CUSTOM CHARS: carrega e hidrata ────────────────────────────
async function initPlayerCustom() {
  // Remove entrada anterior se existir
  const old = CHAR_TYPES.findIndex(t => t.isPlayerCustom);
  if (old >= 0) CHAR_TYPES.splice(old, 1);
  _baseCharCount = 15;
  const cfg = loadPlayerCustom();
  if (!cfg) return;
  await hydrateCustom(cfg);
  // Insere na posição 14 (antes do slot "+ Personalizado")
  CHAR_TYPES.splice(14, 0, {
    name: cfg.name || 'Você (custom)', color: cfg.color||'#5B2D8E',
    cls: PlayerCustomCharacter, cfg, isPlayerCustom: true
  });
  _baseCharCount = 16;
}

let _customCharTypes = [];
async function initCustomChars() {
  const saved = loadCustomChars();
  _customCharTypes = [];
  for (const cfg of saved) {
    await hydrateCustom(cfg);
    _customCharTypes.push({ name: cfg.name, color: cfg.color||'#8E44AD', cls: CustomCharacter, cfg, isCustom: true });
  }
  // Injeta no CHAR_TYPES (remove velhos primeiro)
  while (CHAR_TYPES.length > _baseCharCount) CHAR_TYPES.pop();
  for (const ct of _customCharTypes) CHAR_TYPES.push(ct);
}
let _baseCharCount = 15; // 15 base + 1 quando player custom existe
