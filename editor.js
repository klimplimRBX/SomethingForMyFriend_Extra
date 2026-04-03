// ── STATE ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
let _edStep   = -1;   // -1 = tela inicial
let _edIsNew  = true;
let _edData   = {};
let _editingIdx = -1;
let _editingPlayerCustom = false; // true quando editando o personagem do jogador
let _shotImgCount = 0;
let _pickerCb = null;
let _spdMode  = 'normal';
let _edAnimDir = 1; // 1=forward, -1=back, 0=home
let _imgQuality = 'normal'; // 'low' | 'normal' | 'high'
const _QUALITY_PARAMS = {
  low:    { char:[180,180,0.70], shot:[100,100,0.70],
            label:'📦 Baixa — 180×180px (personagem), 100×100px (tiro). Economiza armazenamento e previne corrupções.' },
  normal: { char:[300,300,0.82], shot:[150,150,0.82],
            label:'🖼 Normal — 300×300px (personagem), 150×150px (tiro). Recomendado para a maioria dos casos.' },
  high:   { char:[700,700,0.92], shot:[300,300,0.92],
            label:'🎨 Alta — 700×700px (personagem), 300×300px (tiro). Melhor visual, consome mais espaço.' },
};
function _getQualityParams(isShot) {
  const p = _QUALITY_PARAMS[_imgQuality] || _QUALITY_PARAMS.normal;
  return isShot ? p.shot : p.char;
}
function setImgQuality(q) {
  _imgQuality = q;
  ['low','normal','high'].forEach(m => {
    const b = $('ew-qual-'+m); if (!b) return;
    b.style.background  = m===q ? '#00a0b0' : 'rgba(0,160,176,0.12)';
    b.style.color       = m===q ? 'white'   : '#0D2461';
    b.style.borderColor = m===q ? '#00a0b0' : 'transparent';
  });
  const desc = $('ew-qual-desc');
  if (desc) desc.textContent = (_QUALITY_PARAMS[q]||_QUALITY_PARAMS.normal).label;
}

// Defaults usados pelo "Pular"
const ED_DEFAULTS = {
  hp:1000, shots:4, projDmg:50, shotInterval:0.12, projHeal:0,
  reloadCooldown:2.0, projSpeed:345, spread:7, projSize:14, projHitbox:14,
  passiveRegenIdle:0, passiveRegenHPS:0,
  moveSpeedMode:'normal', moveSpeedCustom:165,
  collisionEnabled:false, collisionDamage:10, collisionInterval:0.5,
  stunPerProj:0, stunAllProjs:0,
  homing:false, homingMode:'predict', bouncy:false,
  charSize:72, charHitbox:72, imgRatioX:100, imgRatioY:100,
  weaponSize:44,
  charImg:null, hurtImg:null, shotImgs:[], _shotImgNames:[],
  sfxEnabled:false, sfxShootOne:'', sfxShootAll:'', sfxDamage:'', sfxRandom:'', sfxRandomProb:10,
  musicEnabled:false, musicFilename:'', musicLoop:true,
  conditionEnabled:false, conditionHP:300,
};

// ── STEPS DEFINITION ──────────────────────────────────────────
// step -1: tela inicial (não conta nos dots)
// steps 0–8: os 9 passos
const ED_STEPS = [
  { title:'Nome e Stats',        sub:'Como seu personagem se chama e seus atributos base',  skippable:false },
  { title:'Imagens e proporções', sub:'A cara do seu personagem e seu tamanho em combate',   skippable:false },
  { title:'Regeneração Passiva', sub:'Recuperação de vida automática',                       skippable:true  },
  { title:'Velocidade',          sub:'Quão rápido seu personagem se move',                   skippable:true  },
  { title:'Colisão com Dano',    sub:'Dano ao encostar no inimigo',                          skippable:true  },
  { title:'Stun',                sub:'Capacidade de atordoar o inimigo',                     skippable:true  },
  { title:'Som',                 sub:'Efeitos sonoros do personagem',                         skippable:true  },
  { title:'Música',              sub:'Trilha sonora durante a batalha',                       skippable:true  },
  { title:'Modo Condição',       sub:'Transformação ao chegar em certo HP',                  skippable:false },
];

// ── OPEN / CLOSE ───────────────────────────────────────────────
function openEditor() {
  _edStep = -1;
  _edData = {};
  _edIsNew = true;
  _editingIdx = -1;
  _editingPlayerCustom = false;
  _shotImgCount = 0;
  _imgQuality = 'normal';
  $('editor').style.display = 'block';
  _edRender();
}

function openEditorForPlayer(isEditing) {
  _editingPlayerCustom = true;
  _edIsNew = !isEditing;
  _editingIdx = -1;
  _shotImgCount = 0;
  const existing = loadPlayerCustom();
  _edData = Object.assign({}, ED_DEFAULTS, PLAYER_DEFAULTS, isEditing && existing ? existing : {});
  // Migração: saves antigos tinham passiveRegenIdle:0/passiveRegenHPS:0 como padrão.
  // Se ambos estão zerados, aplica os defaults do player (5s / 100 HPS).
  if (_edData.passiveRegenIdle === 0 && _edData.passiveRegenHPS === 0) {
    _edData.passiveRegenIdle = PLAYER_DEFAULTS.passiveRegenIdle;
    _edData.passiveRegenHPS  = PLAYER_DEFAULTS.passiveRegenHPS;
  }
  _edAnimDir = 1; _edStep = 0;
  $('editor').style.display = 'block';
  _edRender();
}

function closeEditor() {
  $('editor').style.display = 'none';
  _editingPlayerCustom = false;
}

function edBack() {
  if (_edStep <= -1) { closeEditor(); return; }
  if (_edStep === 0) { _edAnimDir = 0; _edStep = -1; _edRender(); return; }
  _edSaveCurrent();
  _edAnimDir = -1;
  _edStep--;
  _edRender();
}

function edNext() {
  if (_edStep === -1) {
    // Começar novo personagem
    _edData = Object.assign({}, ED_DEFAULTS);
    _edIsNew = true;
    _editingIdx = -1;
    _edAnimDir = 1;
    _edStep = 0;
    _edRender();
    return;
  }
  _edSaveCurrent();
  if (_edStep >= ED_STEPS.length - 1) {
    _edFinish();
  } else {
    _edAnimDir = 1;
    _edStep++;
    _edRender();
  }
}

function edSkip() {
  // Apenas avança sem alterar os dados — mantém o valor atual
  if (_edStep >= ED_STEPS.length - 1) {
    _edFinish();
  } else {
    _edAnimDir = 1;
    _edStep++;
    _edRender();
  }
}

function edEditChar(idx) {
  const chars = loadCustomChars();
  if (idx < 0 || idx >= chars.length) return;
  _editingIdx = idx;
  _edIsNew = false;
  _edData = Object.assign({}, ED_DEFAULTS, chars[idx]);
  _edAnimDir = 1;
  _edStep = 0;
  _edRender();
}

// ── RENDER ─────────────────────────────────────────────────────
function _edRender() {
  const step = ED_STEPS[_edStep];
  // Header
  if (_edStep === -1) {
    $('ed-header-title').innerHTML = 'Vamos criar<br><span style="font-size:16px;font-weight:700;">O <u>seu</u> personagem <em>totalmente</em> personalizado</span>';
    $('ed-header-sub').textContent = '';
  } else {
    $('ed-header-title').textContent = step.title;
    $('ed-header-sub').textContent   = step.sub;
  }
  // Disable/enable next button based on step 1 image requirement (não obrigatório para player)
  if (_edStep === 1 && !_editingPlayerCustom) {
    const hasImg = !!_edData.charImg;
    $('ed-next-btn').disabled = !hasImg;
    $('ed-next-btn').style.opacity = hasImg ? '1' : '0.4';
    $('ed-next-btn').style.cursor = hasImg ? 'pointer' : 'not-allowed';
  } else {
    $('ed-next-btn').disabled = false;
    $('ed-next-btn').style.opacity = '1';
    $('ed-next-btn').style.cursor = 'pointer';
  }
  // Dots
  _edRenderDots();
  // Back btn
  $('ed-back-btn').style.visibility = _edStep === -1 ? 'hidden' : 'visible';
  // Skip / Next buttons
  const isLast = _edStep === ED_STEPS.length - 1;
  const skippable = _edStep >= 0 && step && step.skippable;
  $('ed-skip-btn').style.display = skippable ? 'block' : 'none';
  $('ed-next-btn').textContent = _edStep === -1 ? 'Começar' : (isLast ? 'Concluir ✓' : 'Continuar');
  // Content
  $('ed-step-content').innerHTML = '';
  $('ed-scroll').scrollTop = 0;
  if (_edStep === -1) _edRenderHome();
  else _edRenderStep(_edStep);
  // Animate step content
  const sc = $('ed-step-content');
  sc.classList.remove('anim-forward','anim-back','anim-home');
  void sc.offsetWidth; // force reflow to restart animation
  if (_edStep === -1)     sc.classList.add('anim-home');
  else if (_edAnimDir < 0) sc.classList.add('anim-back');
  else                     sc.classList.add('anim-forward');
}

function _edRenderDots() {
  const el = $('ed-step-dots');
  if (_edStep === -1) { el.innerHTML=''; return; }
  let html = '';
  for (let i=0; i<ED_STEPS.length; i++) {
    const active = i===_edStep;
    const done   = i < _edStep;
    const color  = done ? '#00a0b0' : (active ? '#0D2461' : 'rgba(13,36,97,0.25)');
    const size   = active ? 10 : 7;
    html += `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};transition:all .2s;"></div>`;
  }
  el.innerHTML = html;
}

// ── HOME SCREEN ────────────────────────────────────────────────
function _edRenderHome() {
  const chars = loadCustomChars();
  let html = '';
  if (chars.length > 0) {
    html += `<div style="font-size:14px;color:#0D2461;font-weight:600;margin-bottom:12px;opacity:0.7;">Editar um personagem já existente:</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:12px;">`;
    for (let i=0; i<chars.length; i++) {
      const c = chars[i];
      const bg = c.color || '#5B9BD5';
      let imgHtml = '';
      if (c.charImg) {
        imgHtml = `<img src="${c.charImg}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.6);">`;
      } else {
        imgHtml = `<svg width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="20" r="13" fill="rgba(255,255,255,0.8)"/><ellipse cx="26" cy="46" rx="19" ry="12" fill="rgba(255,255,255,0.8)"/></svg>`;
      }
      html += `<div onclick="edEditChar(${i})" style="background:${bg};border-radius:18px;padding:14px 12px 10px;min-width:90px;text-align:center;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,0.15);flex:0 0 auto;">
        ${imgHtml}
        <div style="color:white;font-weight:800;font-size:13px;margin-top:8px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name||'Sem nome'}</div>
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div style="text-align:center;color:#1a6b8a;font-size:14px;opacity:0.7;padding:20px 0;">Nenhum personagem criado ainda.</div>`;
  }
  $('ed-step-content').innerHTML = html;
}

// ── STEP RENDERERS ─────────────────────────────────────────────
function _edRenderStep(s) {
  const el = $('ed-step-content');
  if (s===0) {
    el.innerHTML = _edHTMLStats();
    // Após injetar o HTML, conectar eventos
    setTimeout(() => {
      // Homing toggle
      const hc = $('ew-homing');
      if (hc) {
        const toggleHomingWrap = () => {
          const wrap = $('ew-homing-mode-wrap');
          if (wrap) wrap.style.display = hc.checked ? 'block' : 'none';
        };
        hc.addEventListener('change', toggleHomingWrap);
        toggleHomingWrap();
      }
      // Proj size/hitbox → live preview
      ['ew-proj-size','ew-proj-hitbox'].forEach(id => {
        const el2 = $(id);
        if (el2) el2.addEventListener('input', _ewUpdateStatsPreview);
      });
      _ewUpdateStatsPreview();
      setHomingModeUI(_homingModeUI);
    }, 0);
  }
  else if (s===1) el.innerHTML = _edHTMLImages();
  else if (s===2) el.innerHTML = _edHTMLRegen();
  else if (s===3) el.innerHTML = _edHTMLSpeed();
  else if (s===4) el.innerHTML = _edHTMLCollision();
  else if (s===5) el.innerHTML = _edHTMLStun();
  else if (s===6) el.innerHTML = _edHTMLSfx();
  else if (s===7) el.innerHTML = _edHTMLMusic();
  else if (s===8) el.innerHTML = _edHTMLCondition();
  _edFillStep(s);
  if (s===1) _edInitImageHandlers();
}

// ── SAVE CURRENT STEP ─────────────────────────────────────────
function _edSaveCurrent() {
  const s = _edStep;
  const g  = id => $(id) ? $(id).value : null;
  const gi = id => parseInt(g(id))||0;
  const gf = id => parseFloat(g(id))||0;
  const gc = id => $(id) ? $(id).checked : false;
  if (s===0) {
    _edData.name          = g('ew-name')||'Meu Char';
    _edData.color         = g('ew-color')||'#8E44AD';
    _edData.hp            = gi('ew-hp');
    _edData.shots         = gi('ew-shots');
    _edData.projDmg       = gi('ew-proj-dmg');
    _edData.shotInterval  = gf('ew-shot-interval');
    _edData.projHeal      = gi('ew-proj-heal');
    _edData.reloadCooldown= gf('ew-reload');
    _edData.projSpeed     = gi('ew-proj-spd');
    _edData.spread        = gf('ew-spread');
    _edData.projSize      = gi('ew-proj-size');
    _edData.projHitbox    = gi('ew-proj-hitbox');
    _edData.homing        = gc('ew-homing');
    _edData.homingMode    = _homingModeUI;
    _edData.bouncy        = gc('ew-bouncy');
  } else if (s===1) {
    _edData.charSize      = parseInt($('ew-char-size')?.value)   || 72;
    _edData.charHitbox    = parseInt($('ew-char-hitbox')?.value) || 72;
    _edData.imgRatioX     = parseFloat($('ew-img-ratio-x')?.value) || 100;
    _edData.imgRatioY     = parseFloat($('ew-img-ratio-y')?.value) || 100;
    _edData.weaponSize    = Math.max(8, Math.min(parseInt($('ew-weapon-size')?.value) || 44, CHAR_SZ));
    // weaponImg já salvo diretamente no handler do picker
  } else if (s===2) {
    _edData.passiveRegenIdle = gf('ew-regen-idle');
    _edData.passiveRegenHPS  = gi('ew-regen-hps');
  } else if (s===3) {
    _edData.moveSpeedMode   = _spdMode;
    _edData.moveSpeedCustom = gi('ew-spd-custom-val');
  } else if (s===4) {
    _edData.collisionEnabled  = gc('ew-coll-enabled');
    _edData.collisionDamage   = gi('ew-coll-dmg');
    _edData.collisionInterval = gf('ew-coll-interval');
  } else if (s===5) {
    _edData.stunPerProj  = gf('ew-stun-per');
    _edData.stunAllProjs = gf('ew-stun-burst');
  } else if (s===6) {
    _edData.sfxEnabled    = gc('ew-sfx-enabled');
    _edData.sfxShootOne   = g('ew-sfx-shoot1')||'';
    _edData.sfxShootAll   = g('ew-sfx-shootall')||'';
    _edData.sfxDamage     = g('ew-sfx-damage')||'';
    _edData.sfxRandom     = g('ew-sfx-random')||'';
    _edData.sfxRandomProb = gi('ew-sfx-rnd-prob');
  } else if (s===7) {
    _edData.musicEnabled  = gc('ew-music-enabled');
    _edData.musicFilename = g('ew-music-file')||'';
    _edData.musicLoop     = gc('ew-music-loop');
  } else if (s===8) {
    _edData.conditionEnabled = gc('ew-cond-enabled');
    _edData.conditionHP      = gi('ew-cond-hp');
  }
}

function _edApplyDefaults(s) {
  // Pular não toca em nada — mantém os valores atuais de _edData
}

// ── FILL STEP WITH CURRENT DATA ───────────────────────────────
function _edFillStep(s) {
  const d = _edData;
  const sv = (id, v) => { if($(id)) $(id).value = v; };
  const sc = (id, v) => { if($(id)) $(id).checked = !!v; };
  if (s===0) {
    sv('ew-name', d.name||''); sv('ew-color', d.color||'#8E44AD');
    sv('ew-hp', d.hp??1000); sv('ew-shots', d.shots??4);
    sv('ew-proj-dmg', d.projDmg??50); sv('ew-shot-interval', d.shotInterval??0.12);
    sv('ew-proj-heal', d.projHeal??0); sv('ew-reload', d.reloadCooldown??2.0);
    sv('ew-proj-spd', d.projSpeed??345); sv('ew-spread', d.spread??7);
    sv('ew-proj-size', d.projSize??14); sv('ew-proj-hitbox', d.projHitbox??14);
    sc('ew-homing', d.homing); sc('ew-bouncy', d.bouncy);
    _homingModeUI = d.homingMode || 'predict';
  } else if (s===1) {
    sv('ew-char-size',    d.charSize    ?? 72);
    sv('ew-char-hitbox',  d.charHitbox  ?? 72);
    sv('ew-img-ratio-x',  d.imgRatioX   ?? 100);
    sv('ew-img-ratio-y',  d.imgRatioY   ?? 100);
    sv('ew-weapon-size',  d.weaponSize  ?? 44);
    setTimeout(_ewUpdateWeaponPreview, 50);
    setTimeout(_ewUpdateCharPreview, 55);
    _edRebuildShotList();
  } else if (s===2) {
    sv('ew-regen-idle', d.passiveRegenIdle ?? (_editingPlayerCustom ? 5 : 0));
    sv('ew-regen-hps',  d.passiveRegenHPS  ?? (_editingPlayerCustom ? 100 : 0));
  } else if (s===3) {
    setSpdMode(d.moveSpeedMode||'normal'); sv('ew-spd-custom-val', d.moveSpeedCustom??165);
  } else if (s===4) {
    sc('ew-coll-enabled', d.collisionEnabled); sv('ew-coll-dmg', d.collisionDamage??10);
    sv('ew-coll-interval', d.collisionInterval??0.5);
  } else if (s===5) {
    sv('ew-stun-per', d.stunPerProj??0); sv('ew-stun-burst', d.stunAllProjs??0);
  } else if (s===6) {
    sc('ew-sfx-enabled', d.sfxEnabled); sv('ew-sfx-shoot1', d.sfxShootOne||'');
    sv('ew-sfx-shootall', d.sfxShootAll||''); sv('ew-sfx-damage', d.sfxDamage||'');
    sv('ew-sfx-random', d.sfxRandom||''); sv('ew-sfx-rnd-prob', d.sfxRandomProb??10);
  } else if (s===7) {
    sc('ew-music-enabled', d.musicEnabled); sv('ew-music-file', d.musicFilename||'');
    sc('ew-music-loop', d.musicLoop!==false);
  } else if (s===8) {
    sc('ew-cond-enabled', d.conditionEnabled); sv('ew-cond-hp', d.conditionHP??300);
  }
}

// ── FINISH ─────────────────────────────────────────────────────
async function _edFinish() {
  if (!_edData.name || !_edData.name.trim()) {
    alert('Dá um nome ao personagem primeiro! (Passo 1)');
    _edStep = 0; _edRender(); return;
  }
  if (!_edData.charImg && !_editingPlayerCustom) {
    alert('Adicione pelo menos a imagem principal! (Passo 2)');
    _edStep = 1; _edRender(); return;
  }
  const cfg = Object.assign({}, _edData, {
    shotImgs:      (_edData.shotImgs||[]).filter(Boolean),
    _shotImgNames: (_edData._shotImgNames||[]).filter(Boolean),
    _charImgEl:null, _hurtImgEl:null, _weaponImgEl:null, _shotImgEls:null,
    _sfxShootOneBuf:null, _sfxShootAllBuf:null, _sfxDamageBuf:null, _sfxRandomBuf:null,
    _musicKey:null, _condCfgHydrated:null,
  });
  if (_editingPlayerCustom) {
    savePlayerCustom(cfg);
    await initPlayerCustom();
    await initCustomChars();
    // Seleciona "Você (custom)" que fica na posição 14
    sel.p1 = CHAR_TYPES.findIndex(t => t.isPlayerCustom);
    if (sel.p1 < 0) sel.p1 = 0;
    if (sel.p1 === sel.p2) sel.p2 = sel.p2 === 0 ? 1 : 0;
    alert('"' + cfg.name + '" salvo!');
    closeEditor();
    return;
  }
  const saved = loadCustomChars();
  if (_editingIdx >= 0 && _editingIdx < saved.length) {
    saved[_editingIdx] = cfg;
  } else {
    saved.push(cfg);
    _editingIdx = saved.length - 1;
  }
  saveCustomChars(saved);
  await initCustomChars();
  const customStart = _baseCharCount;
  sel.p1 = customStart + _editingIdx;
  alert('"' + cfg.name + '" salvo!');
  closeEditor();
}

// ── HTML TEMPLATES ─────────────────────────────────────────────
const _card = (content) =>
  `<div style="background:rgba(255,255,255,0.55);border-radius:18px;padding:16px 18px;margin-bottom:14px;backdrop-filter:blur(4px);">${content}</div>`;
const _label = (txt, sub) =>
  `<div style="font-weight:800;font-size:15px;color:#0D2461;margin-bottom:${sub?'2px':'10px'};">${txt}</div>${sub?`<div style="font-size:12px;color:#2c4a9e;margin-bottom:10px;opacity:0.8;">${sub}</div>`:''}`;
const _inp = (id, type, placeholder, step) =>
  `<input id="${id}" type="${type}" placeholder="${placeholder||''}" ${step?`step="${step}"`:''}
   style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;border:2px solid rgba(0,100,150,0.15);background:rgba(255,255,255,0.8);font-size:15px;color:#0D2461;font-weight:600;outline:none;">`;
const _row2 = (a, b) =>
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${a}${b}</div>`;
const _field = (label, input) =>
  `<div style="margin-bottom:12px;"><div style="font-size:12px;font-weight:700;color:#2c4a9e;margin-bottom:5px;">${label}</div>${input}</div>`;
const _toggle = (id, label) =>
  `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:10px;">
    <input id="${id}" type="checkbox" style="width:20px;height:20px;accent-color:#00a0b0;cursor:pointer;">
    <span style="font-size:14px;font-weight:700;color:#0D2461;">${label}</span>
  </label>`;

function _edHTMLStats() {
  return _card(`
    ${_label('Identidade')}
    ${_field('Nome do personagem', _inp('ew-name','text',''))}
    ${_field('Cor no menu', `<input id="ew-color" type="color" style="width:60px;height:40px;border:none;border-radius:10px;cursor:pointer;background:none;">`)}
  `) + _card(`
    ${_label('Vida e Projéteis')}
    ${_row2(_field('❤ HP', _inp('ew-hp','number','1000')), _field('🔫 Tiros por rajada', _inp('ew-shots','number','4')))}
    ${_row2(_field('💥 Dano por tiro', _inp('ew-proj-dmg','number','50')), _field('⏱ Intervalo entre tiros (s)', `<input id="ew-shot-interval" type="number" placeholder="0.12" step="any" min="0.0000001" style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;border:2px solid rgba(0,100,150,0.15);background:rgba(255,255,255,0.8);font-size:15px;color:#0D2461;font-weight:600;outline:none;">`))}
    ${_row2(_field('💚 Cura por tiro', _inp('ew-proj-heal','number','0')), _field('🔄 Recarga (s)', `<input id="ew-reload" type="number" placeholder="2.0" step="any" min="0.0000001" style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;border:2px solid rgba(0,100,150,0.15);background:rgba(255,255,255,0.8);font-size:15px;color:#0D2461;font-weight:600;outline:none;">`))}

  `) + _card(`
    ${_label('Projétil')}
    ${_row2(_field('🚀 Velocidade', _inp('ew-proj-spd','number','345')), _field('📐 Dispersão (graus)', `<input id="ew-spread" type="number" placeholder="7" step="0.5" min="0" style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;border:2px solid rgba(0,100,150,0.15);background:rgba(255,255,255,0.8);font-size:15px;color:#0D2461;font-weight:600;outline:none;">`))}
    <div style="font-size:11px;color:#2c4a9e;margin-top:-6px;margin-bottom:12px;opacity:0.8;">🎯 0 = precisão máxima (sem dispersão). Quanto maior o valor, mais aleatório o disparo.</div>
    ${_row2(_field('📏 Tamanho visual (px)', _inp('ew-proj-size','number','14')), _field('🎯 Hitbox (px)', _inp('ew-proj-hitbox','number','14')))}
    <div style="text-align:center;margin:4px 0 12px;">
      <canvas id="ew-stats-proj-canvas" width="260" height="80" style="border-radius:10px;background:#1a1a2e;display:inline-block;"></canvas>
      <div style="font-size:10px;color:#2c4a9e;margin-top:3px;opacity:0.7;">Preview do tamanho do projétil vs personagem padrão</div>
    </div>
    ${_toggle('ew-homing','Projéteis teleguiados')}
    <div id="ew-homing-mode-wrap" style="display:none;margin:0 0 10px 30px;">
      <div style="font-size:12px;font-weight:700;color:#2c4a9e;margin-bottom:6px;">Modo de perseguição:</div>
      <div style="display:flex;gap:8px;">
        <button id="ew-hm-predict" onclick="setHomingModeUI('predict')" style="flex:1;padding:8px 4px;border-radius:10px;border:2px solid #00a0b0;font-size:12px;font-weight:800;cursor:pointer;background:#00a0b0;color:white;">🎯 Prever</button>
        <button id="ew-hm-direct"  onclick="setHomingModeUI('direct')"  style="flex:1;padding:8px 4px;border-radius:10px;border:2px solid transparent;font-size:12px;font-weight:800;cursor:pointer;background:rgba(0,160,176,0.12);color:#0D2461;">🔄 Direto</button>
      </div>
      <div style="font-size:10px;color:#2c4a9e;margin-top:4px;opacity:0.7;">Prever = calcula onde o inimigo estará. Direto = segue em tempo real.</div>
    </div>
    ${_toggle('ew-bouncy','Projéteis ricocheteiam')}
  `);
}

let _homingModeUI = 'predict';
function setHomingModeUI(m) {
  _homingModeUI = m;
  const bp = $('ew-hm-predict'), bd = $('ew-hm-direct');
  if (!bp || !bd) return;
  bp.style.background    = m==='predict' ? '#00a0b0' : 'rgba(0,160,176,0.12)';
  bp.style.color         = m==='predict' ? 'white'   : '#0D2461';
  bp.style.borderColor   = m==='predict' ? '#00a0b0' : 'transparent';
  bd.style.background    = m==='direct'  ? '#00a0b0' : 'rgba(0,160,176,0.12)';
  bd.style.color         = m==='direct'  ? 'white'   : '#0D2461';
  bd.style.borderColor   = m==='direct'  ? '#00a0b0' : 'transparent';
}

function _ewUpdateStatsPreview() {
  const cv = $('ew-stats-proj-canvas'); if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);
  const projSz   = Math.max(2, parseInt($('ew-proj-size')?.value)   || 14);
  const hitboxSz = Math.max(2, parseInt($('ew-proj-hitbox')?.value) || 14);

  // ── Reference character cube (left side) ──────────────────────
  const refSz = 44; // same scale as game preview
  const refX = 14, refY = H/2 - refSz/2;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(refX+3, refY+3, refSz, refSz);
  // cube fill
  ctx.fillStyle = '#8E44AD';
  ctx.fillRect(refX, refY, refSz, refSz);
  // white outline
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(refX, refY, refSz, refSz);
  // label
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center';
  ctx.fillText('personagem', refX + refSz/2, refY + refSz + 10);

  // ── Arrow ──────────────────────────────────────────────────────
  const arrowX1 = refX + refSz + 6, arrowX2 = arrowX1 + 16, cy = H/2;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(arrowX1, cy); ctx.lineTo(arrowX2 - 4, cy); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.moveTo(arrowX2, cy); ctx.lineTo(arrowX2-5, cy-3); ctx.lineTo(arrowX2-5, cy+3); ctx.closePath(); ctx.fill();

  // ── Projectile comparison (right side) ────────────────────────
  const px = arrowX2 + 20 + Math.max(projSz, hitboxSz)/2;
  // Hitbox (red dashed)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,80,80,0.85)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([3,3]);
  ctx.strokeRect(px - hitboxSz/2, cy - hitboxSz/2, hitboxSz, hitboxSz);
  ctx.setLineDash([]);
  ctx.restore();
  // Visual (yellow)
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(px - projSz/2, cy - projSz/2, projSz, projSz);
  // Labels
  const labelY = cy - Math.max(projSz, hitboxSz)/2 - 4;
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
  ctx.fillText('vis ' + projSz + 'px', px, labelY);
  ctx.fillStyle = 'rgba(255,80,80,0.9)';
  ctx.fillText('hbx ' + hitboxSz + 'px', px, cy + Math.max(projSz,hitboxSz)/2 + 11);
}

function _edHTMLImages() {
  const qualityCard = _card(`
    ${_label('Qualidade das Imagens','Afeta o espaço usado no armazenamento')}
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <button onclick="setImgQuality('low')" id="ew-qual-low"
        style="flex:1;padding:10px 4px;border-radius:12px;border:2px solid transparent;font-size:11px;font-weight:800;cursor:pointer;background:rgba(0,160,176,0.12);color:#0D2461;line-height:1.4;">
        📦 Baixa<br><span style="font-size:9px;font-weight:600;opacity:0.7;">Evita corrupção</span>
      </button>
      <button onclick="setImgQuality('normal')" id="ew-qual-normal"
        style="flex:1;padding:10px 4px;border-radius:12px;border:2px solid #00a0b0;font-size:11px;font-weight:800;cursor:pointer;background:#00a0b0;color:white;line-height:1.4;">
        🖼 Normal<br><span style="font-size:9px;font-weight:600;opacity:0.85;">Recomendado</span>
      </button>
      <button onclick="setImgQuality('high')" id="ew-qual-high"
        style="flex:1;padding:10px 4px;border-radius:12px;border:2px solid transparent;font-size:11px;font-weight:800;cursor:pointer;background:rgba(0,160,176,0.12);color:#0D2461;line-height:1.4;">
        🎨 Alta<br><span style="font-size:9px;font-weight:600;opacity:0.7;">Mais espaço</span>
      </button>
    </div>
    <div id="ew-qual-desc" style="font-size:11px;color:#2c4a9e;background:rgba(0,100,150,0.08);border-radius:8px;padding:6px 10px;">
      🖼 Normal — 300×300px (personagem), 150×150px (tiro). Recomendado para a maioria dos casos.
    </div>
  `);
  const weaponSection = _editingPlayerCustom ? _card(`
    ${_label('Imagem da arma','A arma exibida ao lado do personagem (opcional)')}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <img id="ew-weapon-prev" src="" style="display:none;width:64px;height:64px;border-radius:14px;object-fit:cover;border:3px solid #27ae60;">
      <div id="ew-weapon-ph" style="width:64px;height:64px;border-radius:14px;background:#d5f5e3;display:flex;align-items:center;justify-content:center;">
        <img src="https://raw.githubusercontent.com/klimplimRBX/SomethingForMyFriend/main/CoolWeaponDisplay.png" crossorigin="anonymous" style="width:48px;height:48px;object-fit:contain;">
      </div>
      <div>
        <button onclick="ewPick('ew-weapon-img','image/*')" style="${_btnStyle('#27ae60')}">📁 Escolher arma</button>
        <div id="ew-weapon-name" style="font-size:11px;color:#2c4a9e;margin-top:4px;">padrão (pistola)</div>
      </div>
    </div>
    ${_field('🔫 Tamanho da arma (px, máx: '+CHAR_SZ+')', `<input id="ew-weapon-size" type="number" placeholder="44" min="8" max="${CHAR_SZ}" step="1" style="width:100%;box-sizing:border-box;padding:11px 14px;border-radius:12px;border:2px solid rgba(0,100,150,0.15);background:rgba(255,255,255,0.8);font-size:15px;color:#0D2461;font-weight:600;outline:none;" oninput="_ewUpdateWeaponPreview()">`)}
    <div style="text-align:center;margin:4px 0 4px;">
      <canvas id="ew-weapon-canvas" width="320" height="100" style="border-radius:10px;background:#1a1a2e;display:inline-block;width:100%;max-width:320px;"></canvas>
      <div style="font-size:10px;color:#2c4a9e;margin-top:3px;opacity:0.7;">Preview em proporção real (escala 65% do jogo)</div>
    </div>
  `) : '';
  return qualityCard + _card(`
    ${_label(_editingPlayerCustom ? 'Imagem Principal (opcional)' : 'Imagem Principal (OBRIGATÓRIO)', 'Aparece durante a luta')}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <img id="ew-char-prev" src="" style="display:none;width:64px;height:64px;border-radius:14px;object-fit:cover;border:3px solid #00a0b0;">
      <div id="ew-char-ph" style="width:64px;height:64px;border-radius:14px;background:#d0eef5;display:flex;align-items:center;justify-content:center;">
        <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="12" r="7" fill="#7fc8d8"/><ellipse cx="16" cy="27" rx="11" ry="7" fill="#7fc8d8"/></svg>
      </div>
      <div>
        <button onclick="ewPick('ew-char-img','image/*')" style="${_btnStyle('#00a0b0')}">📁 Escolher imagem</button>
        <div id="ew-char-name" style="font-size:11px;color:#2c4a9e;margin-top:4px;">nenhuma</div>
      </div>
    </div>
  `) + weaponSection + _card(`
    ${_label('Imagem de dano','Exibida quando leva um hit (opcional)')}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <img id="ew-hurt-prev" src="" style="display:none;width:64px;height:64px;border-radius:14px;object-fit:cover;border:3px solid #e8a030;">
      <div id="ew-hurt-ph" style="width:64px;height:64px;border-radius:14px;background:#fdefd0;display:flex;align-items:center;justify-content:center;">
        <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="12" r="7" fill="#f0b855"/><ellipse cx="16" cy="27" rx="11" ry="7" fill="#f0b855"/></svg>
      </div>
      <div>
        <button onclick="ewPick('ew-hurt-img','image/*')" style="${_btnStyle('#e8a030')}">📁 Escolher imagem</button>
        <div id="ew-hurt-name" style="font-size:11px;color:#2c4a9e;margin-top:4px;">nenhuma</div>
      </div>
    </div>
  `) + `<div id="ew-shot-section">` + _card(`
    ${_label('Imagens dos projéteis','Opcionais — um por tipo de tiro')}
    <div id="ew-shot-list" style="margin-bottom:10px;"></div>
    <button onclick="ewAddShot()" style="${_btnStyle('#5b6abf')}">+ Adicionar tiro</button>
  `) + `</div>` +
  `<div id="ew-proj-preview-wrap" style="margin-top:4px;">` + _card(`
    ${_label('Preview','Como ficará no jogo')}
    <canvas id="ew-proj-canvas" width="260" height="80" style="border-radius:12px;background:#1a1a2e;display:block;margin:0 auto;"></canvas>
    <div style="font-size:10px;color:#2c4a9e;margin-top:4px;text-align:center;opacity:0.7;">Cubo da esquerda = tamanho padrão do personagem (referência)</div>
  `) + `</div>` +
  _card(`
    ${_label('Proporções do Personagem')}
    ${_row2(_field('🧍 Tamanho na tela (px)', _inp('ew-char-size','number','72')), _field('💢 Hitbox (px)', _inp('ew-char-hitbox','number','72')))}
    ${_row2(_field('↔ Proporção horizontal (%)', _inp('ew-img-ratio-x','number','100','1')), _field('↕ Proporção vertical (%)', _inp('ew-img-ratio-y','number','100','1')))}
    <div style="font-size:11px;color:#2c4a9e;margin-top:4px;opacity:0.75;">100% = quadrado normal. Ajuste para esticar ou comprimir a imagem.</div>
    <canvas id="ew-char-size-canvas" width="260" height="110" style="border-radius:10px;background:#1a1a2e;display:block;margin:10px auto 0;"></canvas>
    <div style="font-size:10px;color:#2c4a9e;margin-top:3px;text-align:center;opacity:0.7;">Quadrado vermelho = hitbox · caixa colorida = visual</div>
  `);
}

function _btnStyle(color) {
  return `background:${color};color:white;border:none;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;`;
}

function _edHTMLRegen() {
  const defIdle = _editingPlayerCustom ? 5 : 0;
  const defHPS  = _editingPlayerCustom ? 100 : 0;
  return _card(`
    ${_label('Regeneração Passiva','Recuperação de vida automática ao longo do tempo')}
    ${_field('⏳ Tempo parado para regen iniciar (s) — 0 = desabilitado', _inp('ew-regen-idle','number',String(defIdle),'0.01'))}
    ${_field('💓 HP regenerado por segundo', _inp('ew-regen-hps','number',String(defHPS)))}
  `);
}

function _edHTMLSpeed() {
  return _card(`
    ${_label('Velocidade de Movimento')}
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      ${['slow','normal','fast','custom'].map(m =>
        `<button onclick="setSpdMode('${m}')" id="ew-spd-${m}" style="flex:1;padding:10px 4px;border-radius:12px;border:2px solid transparent;font-size:12px;font-weight:800;cursor:pointer;background:rgba(0,160,176,0.12);color:#0D2461;">
          ${{slow:'🐢 Lento',normal:'🚶 Normal',fast:'🏃 Rápido',custom:'✏️ Custom'}[m]}
        </button>`
      ).join('')}
    </div>
    <div id="ew-spd-custom-wrap" style="display:none;">
      ${_field('Velocidade personalizada (px/s)', _inp('ew-spd-custom-val','number','165'))}
    </div>
  `);
}

function _edHTMLCollision() {
  return _card(`
    ${_label('Colisão com Dano','Machuca o inimigo ao encostar')}
    ${_toggle('ew-coll-enabled','Ativar colisão com dano')}
    <div id="ew-coll-fields">
      ${_row2(_field('💢 Dano por toque', _inp('ew-coll-dmg','number','10')), _field('⏱ Intervalo entre danos (s)', _inp('ew-coll-interval','number','0.5','0.1')))}
    </div>
  `);
}

function _edHTMLStun() {
  return _card(`
    ${_label('Stun / Atordoamento','Quanto tempo o inimigo fica paralisado ao ser atingido')}
    ${_field('⏸ Stun por projétil (s)', _inp('ew-stun-per','number','0','0.05'))}
    ${_field('💫 Stun ao acertar toda a rajada (s)', _inp('ew-stun-burst','number','0','0.05'))}
  `);
}

function _edHTMLSfx() {
  const _repoNote = `<div style="font-size:11px;color:#2c4a9e;opacity:0.75;margin:-6px 0 10px;background:rgba(0,100,150,0.08);border-radius:8px;padding:6px 10px;">
    📁 Insira o nome do arquivo como está no repositório do GitHub (ex: <strong>Batata.mp3</strong>)
  </div>`;
  return _card(`
    ${_label('Efeitos Sonoros')}
    ${_toggle('ew-sfx-enabled','Ativar sons personalizados')}
    ${_repoNote}
    ${_field('🔫 Som de tiro único', _inp('ew-sfx-shoot1','text','Batata.mp3'))}
    ${_field('💥 Som de rajada completa', _inp('ew-sfx-shootall','text','Batata.mp3'))}
    ${_field('🤕 Som ao receber dano', _inp('ew-sfx-damage','text','Batata.mp3'))}
    ${_field('🎲 Som aleatório', _inp('ew-sfx-random','text','Batata.mp3'))}
    ${_field('🎲 Probabilidade do som aleatório (%)', _inp('ew-sfx-rnd-prob','number','10'))}
  `);
}

function _edHTMLMusic() {
  const _repoNote = `<div style="font-size:11px;color:#2c4a9e;opacity:0.75;margin:-6px 0 10px;background:rgba(0,100,150,0.08);border-radius:8px;padding:6px 10px;">
    📁 Insira o nome do arquivo como está no repositório do GitHub (ex: <strong>Batata.mp3</strong>)
  </div>`;
  return _card(`
    ${_label('Música de Fundo')}
    ${_toggle('ew-music-enabled','Ativar música')}
    ${_repoNote}
    ${_field('🎵 Nome do arquivo de música', _inp('ew-music-file','text','Batata.mp3'))}
    ${_toggle('ew-music-loop','Repetir música')}
  `);
}

function _edHTMLCondition() {
  return _card(`
    ${_label('Modo Condição','Transformação ao chegar em determinado HP')}
    ${_toggle('ew-cond-enabled','Ativar modo condição')}
    ${_field('❤ HP para ativar a transformação', _inp('ew-cond-hp','number','300'))}
    <div style="font-size:12px;color:#2c4a9e;opacity:0.75;margin-top:8px;">
      Quando ativo, o personagem muda de comportamento ao chegar neste HP.<br>
      Os atributos da forma de raiva podem ser editados após salvar.
    </div>
  `);
}

// ── IMAGE HANDLERS ─────────────────────────────────────────────
function _edInitImageHandlers() {
  $('hidden-file-input').onchange = function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const rawB64 = e.target.result;
      const id  = _pickerCb;
      if (id==='ew-char-img') {
        const [mW, mH, q] = _getQualityParams(false);
        const b64 = await compressImg(rawB64, mW, mH, q);
        _edData.charImg = b64;
        $('ew-char-prev').src = b64; $('ew-char-prev').style.display='block';
        $('ew-char-ph').style.display='none';
        $('ew-char-name').textContent = file.name + ' (comprimida)';
        // Habilita o botão Continuar agora que a imagem foi adicionada
        $('ed-next-btn').disabled = false;
        $('ed-next-btn').style.opacity = '1';
        $('ed-next-btn').style.cursor = 'pointer';
        const ci = new Image(); ci.src = b64; _edData._charImgEl = ci;
        ci.onload = _ewUpdateCharPreview;
        _ewUpdateProjPreview();
      } else if (id==='ew-hurt-img') {
        const [mW, mH, q] = _getQualityParams(false);
        const b64 = await compressImg(rawB64, mW, mH, q);
        _edData.hurtImg = b64;
        $('ew-hurt-prev').src = b64; $('ew-hurt-prev').style.display='block';
        $('ew-hurt-ph').style.display='none';
        $('ew-hurt-name').textContent = file.name + ' (comprimida)';
      } else if (id==='ew-weapon-img') {
        // Arma não precisa de compressão tão agressiva (sem base64 gigante)
        const [mW, mH, q] = _getQualityParams(false);
        const b64 = await compressImg(rawB64, mW, mH, q);
        _edData.weaponImg = b64;
        $('ew-weapon-prev').src = b64; $('ew-weapon-prev').style.display='block';
        $('ew-weapon-ph').style.display='none';
        $('ew-weapon-name').textContent = file.name + ' (comprimida)';
        // Pre-bake o elemento de imagem para uso em tempo real
        const wi = new Image(); wi.src = b64; _edData._weaponImgEl = wi;
        wi.onload = _ewUpdateWeaponPreview;
        _ewUpdateProjPreview();
      } else if (id && id.startsWith('ew-shot-')) {
        const idx = parseInt(id.split('-')[2]);
        const [mW, mH, q] = _getQualityParams(true); // tiros: dimensões menores
        const b64 = await compressImg(rawB64, mW, mH, q);
        if (!_edData.shotImgs) _edData.shotImgs=[];
        _edData.shotImgs[idx]=b64;
        if (!_edData._shotImgNames) _edData._shotImgNames=[];
        _edData._shotImgNames[idx]=file.name;
        const nm = $('ew-shot-name-'+idx); if(nm) nm.textContent=file.name+' (comprimida)';
        if (!_edData._shotImgEls) _edData._shotImgEls=[];
        const si=new Image(); si.src=b64;
        _edData._shotImgEls[idx]=si;
        si.onload=_ewUpdateProjPreview;
      }
    };
    reader.readAsDataURL(file);
  };
  // Restore existing previews
  if (_edData.charImg) {
    $('ew-char-prev').src=_edData.charImg; $('ew-char-prev').style.display='block';
    $('ew-char-ph').style.display='none'; $('ew-char-name').textContent='carregada';
    if (!_edData._charImgEl) { const ci=new Image(); ci.src=_edData.charImg; _edData._charImgEl=ci; }
  }
  if (_edData.hurtImg) {
    $('ew-hurt-prev').src=_edData.hurtImg; $('ew-hurt-prev').style.display='block';
    $('ew-hurt-ph').style.display='none'; $('ew-hurt-name').textContent='carregada';
  }
  if (_edData.weaponImg && $('ew-weapon-prev')) {
    $('ew-weapon-prev').src=_edData.weaponImg; $('ew-weapon-prev').style.display='block';
    $('ew-weapon-ph').style.display='none'; $('ew-weapon-name').textContent='carregada';
  }
  setTimeout(_ewUpdateProjPreview, 50);
  setTimeout(_ewUpdateWeaponPreview, 60);
  setTimeout(_ewUpdateCharPreview, 70);
  // Listeners live para o canvas de proporções
  ['ew-char-size','ew-char-hitbox','ew-img-ratio-x','ew-img-ratio-y'].forEach(id => {
    const el3 = $(id);
    if (el3) el3.addEventListener('input', _ewUpdateCharPreview);
  });
}

function _edRebuildShotList() {
  const list = $('ew-shot-list'); if(!list) return;
  list.innerHTML='';
  _shotImgCount=0;
  const imgs = _edData.shotImgs||[];
  const names= _edData._shotImgNames||[];
  for(let i=0;i<imgs.length;i++) {
    if(imgs[i]) _ewAddShotRow(names[i]||'carregado');
  }
}

function ewAddShot() {
  _ewAddShotRow(null);
}

function _ewAddShotRow(existingName) {
  const idx = _shotImgCount++;
  const list = $('ew-shot-list'); if(!list) return;
  const div=document.createElement('div');
  div.style='display:flex;align-items:center;gap:8px;margin-bottom:8px;background:rgba(0,160,176,0.1);border-radius:10px;padding:8px;';
  div.id='ew-shot-row-'+idx;
  div.innerHTML=`
    <span style="font-size:12px;color:#2c4a9e;font-weight:700;min-width:44px;">Tiro ${idx+1}</span>
    <button onclick="ewPick('ew-shot-${idx}','image/*')" style="${_btnStyle('#5b6abf')} padding:7px 10px;font-size:12px;">📁</button>
    <span id="ew-shot-name-${idx}" style="font-size:11px;color:#2c4a9e;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${existingName||'nenhuma'}</span>
    <button onclick="ewRemoveShot(${idx})" style="background:#e74c3c;color:white;border:none;border-radius:8px;padding:5px 8px;cursor:pointer;font-size:12px;">✕</button>
  `;
  list.appendChild(div);
}

function ewRemoveShot(idx) {
  if (_edData.shotImgs) _edData.shotImgs.splice(idx,1,null);
  const row=$('ew-shot-row-'+idx); if(row) row.remove();
  _ewUpdateProjPreview();
}

function ewPick(targetId, accept) {
  const inp=$('hidden-file-input');
  inp.accept=accept; inp.value='';
  _pickerCb=targetId; inp.click();
}

function _ewUpdateProjPreview() {
  const cv=$('ew-proj-canvas'); if(!cv) return;
  const ctx=cv.getContext('2d');
  const W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H);

  // Read actual proj size from fields if available
  const projSz = Math.max(2, parseInt($('ew-proj-size')?.value) || 14);

  // ── Reference cube (plain, leftmost) ─────────────────────────
  const refSz = 36, refX = 8, ry = H/2 - refSz/2;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(refX, ry, refSz, refSz);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(refX, ry, refSz, refSz);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 7px Arial'; ctx.textAlign = 'center';
  ctx.fillText('ref', refX + refSz/2, ry + refSz/2 + 3);

  // ── Custom char ───────────────────────────────────────────────
  const charSz = 44, cx = refX + refSz + 8 + charSz/2, cy = H/2;
  const drawAll = (img) => {
    ctx.clearRect(0,0,W,H);
    // redraw ref cube
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(refX, ry, refSz, refSz);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(refX, ry, refSz, refSz);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 7px Arial'; ctx.textAlign = 'center';
    ctx.fillText('ref', refX + refSz/2, ry + refSz/2 + 3);
    // char
    if(img) ctx.drawImage(img, cx-charSz/2, cy-charSz/2, charSz, charSz);
    else { ctx.fillStyle='#8E44AD'; ctx.fillRect(cx-charSz/2, cy-charSz/2, charSz, charSz); }
    // arrow
    const aS = cx + charSz/2 + 4, aE = aS + 16;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(aS,cy); ctx.lineTo(aE-4,cy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(aE,cy); ctx.lineTo(aE-5,cy-3); ctx.lineTo(aE-5,cy+3); ctx.closePath(); ctx.fill();
    // proj
    const px = aE + 8 + projSz/2;
    const shots = (_edData._shotImgEls||[]);
    if(shots[0] && shots[0].complete && shots[0].naturalWidth>0) ctx.drawImage(shots[0], px-projSz/2, cy-projSz/2, projSz, projSz);
    else { ctx.fillStyle='#FFD700'; ctx.fillRect(px-projSz/2, cy-projSz/2, projSz, projSz); }
  };
  if(_edData.charImg){ const i=new Image(); i.src=_edData.charImg; if(i.complete&&i.naturalWidth>0) drawAll(i); else i.onload=()=>drawAll(i); }
  else drawAll(null);
}

// ── WEAPON SIZE PREVIEW ────────────────────────────────────────
function _ewUpdateWeaponPreview() {
  const cv = $('ew-weapon-canvas'); if (!cv) return;
  const ctx2 = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx2.clearRect(0,0,W,H);

  const wSzRaw = parseInt($('ew-weapon-size')?.value) || 44;
  const wSz = Math.max(8, Math.min(wSzRaw, CHAR_SZ));

  // Escala 65%: representa as proporções do jogo sem ocupar toda a tela
  const SCALE = 0.65;
  const charPx = Math.round(72 * SCALE); // ≈47px — tamanho do personagem padrão no preview

  // ── Cubo de referência (personagem padrão) ────────────────────
  const refX = 14, refY = H/2 - charPx/2;
  ctx2.fillStyle = 'rgba(0,0,0,0.28)'; ctx2.fillRect(refX+3, refY+3, charPx, charPx);
  ctx2.fillStyle = '#5B2D8E'; ctx2.fillRect(refX, refY, charPx, charPx);
  ctx2.strokeStyle='rgba(255,255,255,0.6)'; ctx2.lineWidth=1.5; ctx2.strokeRect(refX, refY, charPx, charPx);
  ctx2.fillStyle='rgba(255,255,255,0.5)'; ctx2.font='bold 7px Arial'; ctx2.textAlign='center';
  ctx2.fillText('ref', refX+charPx/2, refY+charPx+10);

  // ── Arma (posicionada exatamente como no jogo) ────────────────
  const edgeDist = charPx/2 + Math.round(6 * SCALE);
  const gunX = refX + charPx/2 + edgeDist; // ponto onde a arma começa (borda do personagem)
  const gunY = H/2;
  const gH = Math.round(wSz * SCALE);       // altura escalada da arma

  const drawWeapon = (img) => {
    let gW;
    if (img && imgOk(img)) {
      gW = Math.round(gH * (img.naturalWidth / img.naturalHeight));
    } else {
      gW = Math.round(gH * (76/44)); // proporção padrão da pistola
    }
    ctx2.save();
    ctx2.translate(gunX, gunY);
    if (img && imgOk(img)) {
      ctx2.drawImage(img, 0, -gH/2, gW, gH);
    } else {
      // Placeholder enquanto PlayerGun.png não carregou
      ctx2.fillStyle = '#27ae60';
      ctx2.fillRect(0, -gH*0.25, gW*0.7, gH*0.5);
      ctx2.fillStyle = '#1e8449';
      ctx2.fillRect(gW*0.7, -gH*0.45, gW*0.3, gH*0.9);
    }
    ctx2.restore();
    // Label de tamanho
    ctx2.save();
    ctx2.fillStyle='rgba(255,220,0,0.9)'; ctx2.font='bold 9px Arial'; ctx2.textAlign='center';
    ctx2.fillText(wSz+'px', gunX + gW/2, gunY - gH/2 - 5);
    ctx2.restore();
  };

  // Prioridade: arma custom → PlayerGun.png padrão → placeholder verde
  const weapImg = _edData._weaponImgEl;
  if (weapImg && imgOk(weapImg)) {
    drawWeapon(weapImg);
  } else if (imgOk(PLAYER_GUN_IMG)) {
    drawWeapon(PLAYER_GUN_IMG);
  } else {
    // PlayerGun ainda carregando — aguarda e tenta novamente
    PLAYER_GUN_IMG.onload = _ewUpdateWeaponPreview;
    drawWeapon(null);
  }
}

// ── CHAR SIZE PREVIEW ──────────────────────────────────────────
function _ewUpdateCharPreview() {
  const cv = $('ew-char-size-canvas'); if (!cv) return;
  const ctx2 = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx2.clearRect(0, 0, W, H);

  const rawSz   = Math.max(8, parseInt($('ew-char-size')?.value)    || 72);
  const hitboxSz= Math.max(8, parseInt($('ew-char-hitbox')?.value)  || 72);
  const ratioX  = Math.max(10, parseFloat($('ew-img-ratio-x')?.value) || 100) / 100;
  const ratioY  = Math.max(10, parseFloat($('ew-img-ratio-y')?.value) || 100) / 100;

  const visW = rawSz * ratioX;
  const visH = rawSz * ratioY;
  const maxDim = Math.max(visW, visH, hitboxSz);
  const scale  = Math.min(1.0, (H - 28) / maxDim);

  const dVisW = visW * scale, dVisH = visH * scale;
  const dHbSz = hitboxSz * scale;

  const cx = W / 2, cy = (H - 16) / 2;

  // Hitbox (vermelho tracejado)
  ctx2.save();
  ctx2.strokeStyle = 'rgba(255,80,80,0.85)'; ctx2.lineWidth = 1.5;
  ctx2.setLineDash([3, 3]);
  ctx2.strokeRect(cx - dHbSz/2, cy - dHbSz/2, dHbSz, dHbSz);
  ctx2.setLineDash([]);
  ctx2.restore();

  // Visual do personagem
  const charImg = _edData._charImgEl;
  if (charImg && imgOk(charImg)) {
    ctx2.drawImage(charImg, cx - dVisW/2, cy - dVisH/2, dVisW, dVisH);
  } else {
    ctx2.fillStyle = _edData.color || '#8E44AD';
    ctx2.fillRect(cx - dVisW/2, cy - dVisH/2, dVisW, dVisH);
    ctx2.strokeStyle = 'rgba(255,255,255,0.6)'; ctx2.lineWidth = 1.5;
    ctx2.strokeRect(cx - dVisW/2, cy - dVisH/2, dVisW, dVisH);
  }

  // Labels
  const top = cy - Math.max(dVisH, dHbSz) / 2 - 4;
  const bot = cy + Math.max(dVisH, dHbSz) / 2 + 11;
  ctx2.textAlign = 'center'; ctx2.font = 'bold 9px Arial';
  ctx2.fillStyle = _edData.color || '#8E44AD';
  ctx2.fillText('vis ' + Math.round(visW) + 'x' + Math.round(visH) + 'px', cx, top);
  ctx2.fillStyle = 'rgba(255,80,80,0.9)';
  ctx2.fillText('hbx ' + hitboxSz + 'px', cx, bot);
}


function setSpdMode(m) {
  _spdMode = m;
  ['slow','normal','fast','custom'].forEach(mode=>{
    const b=$('ew-spd-'+mode);
    if(!b) return;
    b.style.background = mode===m ? '#00a0b0' : 'rgba(0,160,176,0.12)';
    b.style.color = mode===m ? 'white' : '#0D2461';
    b.style.borderColor = mode===m ? '#00a0b0' : 'transparent';
  });
  const cw=$('ew-spd-custom-wrap');
  if(cw) cw.style.display = m==='custom' ? 'block' : 'none';
}

// ── COMPAT STUBS (old editor fns still called elsewhere) ───────
function switchEdTab() {}
function setHomingMode() {}
function toggleConditionUI() {}
function toggleCollUI() {}
function toggleHomingUI() {}
function toggleSfxUI() {}
function toggleMusicUI() {}

// ── INIT ───────────────────────────────────────────────────────
setSpdMode('normal');
