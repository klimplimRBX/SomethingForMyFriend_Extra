// ── PERSISTÊNCIA SEGURA ─────────────────────────────────────────
// Checksum simples (djb2) — detecta corrupção de dados
function _cksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// Campos obrigatórios e seus tipos/defaults esperados para sanitização
const _CHAR_SCHEMA = {
  name: ['string', 'Personagem'],
  color: ['string', '#8E44AD'],
  hp: ['number', 1000],
  shots: ['number', 4],
  projDmg: ['number', 50],
  shotInterval: ['number', 0.12],
  projHeal: ['number', 0],
  reloadCooldown: ['number', 2.0],
  projSpeed: ['number', 345],
  spread: ['number', 7],
  projSize: ['number', 14],
  projHitbox: ['number', 14],
  charSize: ['number', 72],
  charHitbox: ['number', 72],
  imgRatioX: ['number', 100],
  imgRatioY: ['number', 100],
  weaponSize: ['number', 44],
  moveSpeedMode: ['string', 'normal'],
  moveSpeedCustom: ['number', 165],
  homing: ['boolean', false],
  bouncy: ['boolean', false],
  conditionEnabled: ['boolean', false],
  conditionHP: ['number', 300],
};

function _sanitizeCfg(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const out = Object.assign({}, cfg);
  for (const [key, [type, def]] of Object.entries(_CHAR_SCHEMA)) {
    if (typeof out[key] !== type || (type === 'number' && !isFinite(out[key]))) {
      console.warn(`[Integridade] Campo "${key}" corrompido, restaurando padrão:`, out[key], '→', def);
      out[key] = def;
    }
  }
  // Garantir arrays essenciais
  if (!Array.isArray(out.shotImgs)) out.shotImgs = [];
  if (!Array.isArray(out._shotImgNames)) out._shotImgNames = [];
  return out;
}

function _saveSecure(key, data) {
  try {
    const json = JSON.stringify(data);
    const ck   = _cksum(json);
    localStorage.setItem(key, json);
    localStorage.setItem(key + '_ck', ck);
    // Backup rotativo (1 geração)
    localStorage.setItem(key + '_bak', json);
    localStorage.setItem(key + '_bak_ck', ck);
    return true;
  } catch(e) {
    console.error('[Integridade] Falha ao salvar:', key, e);
    alert('Erro ao salvar: armazenamento cheio ou bloqueado.');
    return false;
  }
}

function _loadSecure(key, isArray) {
  const _tryParse = (raw) => { try { return JSON.parse(raw); } catch(e) { return null; } };
  const _verify = (raw, ck) => raw && ck && _cksum(raw) === ck;

  const raw  = localStorage.getItem(key);
  const ck   = localStorage.getItem(key + '_ck');
  const bakR = localStorage.getItem(key + '_bak');
  const bakC = localStorage.getItem(key + '_bak_ck');

  let data = null;
  if (raw && _verify(raw, ck)) {
    data = _tryParse(raw);
  } else if (raw) {
    console.warn('[Integridade] Checksum falhou para', key, '— tentando backup...');
    if (bakR && _verify(bakR, bakC)) {
      console.warn('[Integridade] Backup OK, restaurando...');
      data = _tryParse(bakR);
      // Repara entrada principal com o backup válido
      try { localStorage.setItem(key, bakR); localStorage.setItem(key + '_ck', bakC); } catch(e){}
    } else {
      console.warn('[Integridade] Backup também inválido — dados descartados.');
      data = null;
    }
  }

  if (!data) return isArray ? [] : null;

  // Sanitizar
  if (isArray) {
    if (!Array.isArray(data)) return [];
    return data.map(_sanitizeCfg).filter(Boolean);
  } else {
    return _sanitizeCfg(data);
  }
}

// ── CUSTOM CHARS: persistência ─────────────────────────────────
const _CUSTOM_CHARS_KEY = 'boxvsbox_custom_chars';
function loadCustomChars()     { return _loadSecure(_CUSTOM_CHARS_KEY, true); }
function saveCustomChars(arr)  { _saveSecure(_CUSTOM_CHARS_KEY, arr); }

// ── PLAYER CUSTOM: persistência ────────────────────────────────
const _PLAYER_CUSTOM_KEY = 'boxvsbox_player_custom';
function loadPlayerCustom()    { return _loadSecure(_PLAYER_CUSTOM_KEY, false); }
function savePlayerCustom(cfg) { _saveSecure(_PLAYER_CUSTOM_KEY, cfg); }
function deletePlayerCustom()  {
  [_PLAYER_CUSTOM_KEY, _PLAYER_CUSTOM_KEY+'_ck', _PLAYER_CUSTOM_KEY+'_bak', _PLAYER_CUSTOM_KEY+'_bak_ck']
    .forEach(k => localStorage.removeItem(k));
}
