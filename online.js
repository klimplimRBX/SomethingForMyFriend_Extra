"use strict";
// ── ONLINE.JS — Lobby online + integração com game.js ──────────
// Depende de: network.js, game.js, char_types.js
// Adicionar ao index.html DEPOIS de network.js e ANTES do closing </body>

// ── ESTADO REMOTO ─────────────────────────────────────────────
// Input recebido do jogador remoto (host usa isso pra mover o char do guest)
const remoteInputs = {
  1: { moveX:0, moveY:0, aimX:0, aimY:0, shootTap:false },
  2: { moveX:0, moveY:0, aimX:0, aimY:0, shootTap:false },
};

// Estado do jogo recebido do host (guest usa isso pra renderizar)
let _receivedState = null;

// ── BOSS MULTIPLIER ───────────────────────────────────────────
const BOSS_MULT = 3;

/**
 * Aplica multiplicador de Boss num personagem.
 * Chame logo após instanciar o char quando mode=duos_boss.
 */
function applyBossMultiplier(char) {
  char.hp    *= BOSS_MULT;
  char.maxHp *= BOSS_MULT;
  char.sz    *= 1.25; // boss é maior visualmente

  // Guarda para draw (anel dourado)
  char._isBoss = true;

  // Multiplicadores específicos por classe
  if (char.spd    != null) char.spd    *= BOSS_MULT;
  if (char._spd   != null) char._spd   *= BOSS_MULT;
  if (char.vx     != null) { char.vx *= BOSS_MULT; char.vy *= BOSS_MULT; }

  // Reduz tempo de carga (dispara mais rápido)
  if (char._chargeT != null) char._chargeT /= BOSS_MULT;

  // Marcador visual
  console.log(`[BOSS] ${char.name} — HP:${char.hp} sz:${char.sz}`);
  return char;
}

// ── FIX CORES: paleta e shuffle determinístico pelo roomCode ─────
const _ONLINE_COLORS = [
  '#E74C3C', // Vermelho
  '#E67E22', // Laranja
  '#F1C40F', // Amarelo
  '#2ECC71', // Verde
  '#3498DB', // Azul
  '#1ABC9C', // Ciano
  '#1A237E', // Azul escuro
  '#FF69B4', // Rosa
  '#9B59B6', // Roxo
  '#FF00FF', // Magenta
];

/** Shuffle determinístico — mesma seed = mesma ordem em host e guest */
function _seededShuffle(arr, seed) {
  const a = [...arr];
  let s = (seed >>> 0) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0; // LCG
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _codeToSeed(code) {
  let h = 5381;
  for (let i = 0; i < (code || '').length; i++)
    h = (Math.imul(h, 31) + code.charCodeAt(i)) >>> 0;
  return h;
}

// ── NETWORK CALLBACKS ─────────────────────────────────────────
NET.on('connected', () => {
  console.log('[ONLINE] conectado ao servidor');
  _lobbyUI.setStatus('Conectado!', 'ok');
});

NET.on('disconnected', ({ reason }) => {
  console.log('[ONLINE] desconectado:', reason);
  _lobbyUI.setStatus('Desconectado. Tente novamente.', 'err');
});

NET.on('player_joined', ({ playerIndex, username }) => {
  _lobbyUI.addPlayer(playerIndex, username);
  _lobbyUI.setStatus(`${username} entrou na sala!`, 'ok');
  // FIX 3: host popula sua própria lista de players (necessário para _checkOnlineWin)
  NET.state.players[playerIndex] = username;
});

NET.on('room_full', ({ players }) => {
  _lobbyUI.setStatus('Sala cheia! Pode iniciar.', 'ok');
  _lobbyUI.setCanStart(true);
});

NET.on('room_closed', ({ reason }) => {
  _lobbyUI.setStatus(`Sala fechada: ${reason}`, 'err');
  _lobbyUI.showPanel('menu');
});

NET.on('player_left', ({ username }) => {
  _lobbyUI.setStatus(`${username} saiu da sala.`, 'warn');
  _lobbyUI.setCanStart(false);
  if (G.state === 'playing') G.returnToMenu?.();
});

NET.on('room_config', ({ charIndices, bossIndex, customChars }) => {
  // Guest recebe config atualizada do host
  _lobbyUI.applyRemoteConfig(charIndices, bossIndex, customChars);
});

NET.on('game_start', (data) => {
  _lobbyUI.hide();
  G.startOnline(data);
});

NET.on('remote_input', ({ playerIndex, moveX, moveY, aimX, aimY, shootTap }) => {
  // Host recebe inputs dos guests e armazena em remoteInputs
  const ri = remoteInputs[playerIndex];
  if (!ri) return;
  ri.moveX    = moveX    ?? 0;
  ri.moveY    = moveY    ?? 0;
  ri.aimX     = aimX     ?? 0;
  ri.aimY     = aimY     ?? 0;
  ri.shootTap = shootTap ?? false;
});

NET.on('game_state', (state) => {
  // Guest recebe estado do host e aplica
  _receivedState = state;
});

NET.on('game_over', ({ winner }) => {
  G.onlineGameOver(winner);
});

NET.on('friend_request', ({ from }) => {
  _lobbyUI.showNotification(`${from} quer ser seu amigo!`, [
    { label: 'Aceitar', action: () => NET.respondFriend(from, true,  () => _lobbyUI.refreshFriends()) },
    { label: 'Recusar', action: () => NET.respondFriend(from, false, () => _lobbyUI.refreshFriends()) },
  ]);
});

NET.on('friend_accepted', ({ by }) => {
  _lobbyUI.showNotification(`${by} aceitou sua amizade!`);
  _lobbyUI.refreshFriends();
});

NET.on('room_invite', ({ from, code }) => {
  _lobbyUI.showNotification(`${from} te convidou para a sala ${code}`, [
    { label: 'Entrar', action: () => _lobbyUI.doJoinRoom(code) },
    { label: 'Recusar', action: null },
  ]);
});

// ── GAME.JS PATCHES ───────────────────────────────────────────
// Adiciona métodos online ao objeto G

/**
 * Inicia uma partida online.
 * Chamado tanto no host quanto no guest quando game_start é recebido.
 */
G.startOnline = function({ mode, charIndices, bossIndex, customChars, players }) {
  // Esconde o botão "Jogar Online" durante a partida
  if (_onlineBtn) _onlineBtn.style.display = 'none';
  const ns = NET.state;
  AW = 475; AH = 475;
  this.chars  = [];
  this.projs  = [];
  this.deathTimer = 0;
  this._onlineMode = mode;

  // ── PvP: ambos são PlayerCharacter ────────────────────────
  if (mode === 'pvp') {
    // P1 (host): local — usa playerInput normal
    // P2 (guest): posição controlada por remoteInputs[1]
    const p1type = { ...CHAR_TYPES[0] }; // "Você" (PlayerCharacter)
    const p2type = { ...CHAR_TYPES[0], name: players?.[1] || 'P2', color: '#E74C3C' };

    this.chars[0] = new PlayerCharacter(135, 270, p1type);
    this.chars[1] = new PlayerCharacter(405, 270, p2type);

    // Marca o char do guest para usar remoteInputs
    if (!ns.isHost) {
      // Guest: char[0] é o remoto (host), char[1] é o local
      this.chars[1]._isLocalPlayer = true;
      this.chars[0]._isRemote      = true;
      this.chars[0]._remoteIdx     = 0;
    } else {
      // Host: char[0] local, char[1] remoto
      this.chars[0]._isLocalPlayer = true;
      this.chars[1]._isRemote      = true;
      this.chars[1]._remoteIdx     = 1;
    }
  }

  // ── Duos vs Boss: 3 jogadores ─────────────────────────────
  if (mode === 'duos_boss') {
    const bossTypeIdx = bossIndex >= 0 ? bossIndex : 7; // default Tiger
    const bossType    = { ...CHAR_TYPES[bossTypeIdx] };

    // Slots: 0=P1(duo), 1=P2(duo), 2=Boss
    const pType1 = { ...CHAR_TYPES[0], name: players?.[0] || 'P1', color: '#5B2D8E' };
    const pType2 = { ...CHAR_TYPES[0], name: players?.[1] || 'P2', color: '#E74C3C' };

    this.chars[0] = new PlayerCharacter(135, 200, pType1);
    this.chars[1] = new PlayerCharacter(135, 350, pType2);

    const BossCls = bossType.cls || Character;
    this.chars[2] = new BossCls(405, 270, bossType);
    applyBossMultiplier(this.chars[2]);

    // Marca locais/remotos
    const myIdx = ns.playerIndex;
    this.chars.forEach((c, i) => {
      if (i === myIdx) c._isLocalPlayer = true;
      else { c._isRemote = true; c._remoteIdx = i; }
    });
  }

  this._cutscene           = null;
  this._dogArenaExpanding  = false;
  this._finaleActive       = false;
  this._finaleGuardT       = 0;
  this._dogPhase2Timer     = 0;
  this._dogSubPhase        = 0;
  this._orbitalDogs        = [];
  this._dogFinalTimer      = 0;
  this._dogFinalRushing    = false;

  cam.reset(); // ← FIX 1: reseta câmera antes de entrar em jogo online
  // FIX CORES: shuffle determinístico — host e guest calculam o mesmo resultado
  const _shuffledColors = _seededShuffle(_ONLINE_COLORS, _codeToSeed(ns.roomCode));
  this.chars.forEach((c, i) => { c.color = _shuffledColors[i % _shuffledColors.length]; });
  this.state = 'playing';
  _applyCursor?.();
  console.log(`[ONLINE] jogo iniciado mode=${mode} playerIndex=${ns.playerIndex}`);
};

/**
 * Update estendido para modo online.
 * Substituição parcial de G.update — chame dentro do game loop.
 */
G._onlineUpdate = function(dt) {
  const ns = NET.state;
  if (!ns.roomCode || this.state !== 'playing') return;

  // ── GUEST: aplica estado recebido ─────────────────────────
  if (!ns.isHost && _receivedState) {
    _applyReceivedState(_receivedState);
    _receivedState = null;
    // NÃO retorna aqui — continua para predição local e envio de input
  }

  // ── HOST: roda simulação normal ───────────────────────────
  if (ns.isHost) {
    // Aplica inputs remotos nos chars marcados
    this.chars.forEach(c => {
      if (c._isRemote && c instanceof PlayerCharacter) {
        const ri = remoteInputs[c._remoteIdx];
        if (ri) _applyRemoteInputToChar(c, ri);
      }
    });

    // Roda update normal
    if (this._onlineMode === 'pvp') {
      const [c1, c2] = this.chars;
      c1.update(dt, c2, this.projs);
      c2.update(dt, c1, this.projs);
    } else if (this._onlineMode === 'duos_boss') {
      _updateDuosBoss(dt, this.chars, this.projs);
    }

    // Atualiza projéteis e verifica mortes
    _updateProjectiles(dt, this.chars, this.projs);
    _checkOnlineWin();

    // Serializa e envia estado pros guests
    const serialized = _serializeState();
    NET.sendGameState(dt, serialized);
  }

  // ── GUEST: predição local + envio de input ────────────────
  if (!ns.isHost) {
    // Predição local: move o char local imediatamente sem esperar servidor
    // O estado do servidor vai corrigir a posição periodicamente
    const localChar = this.chars.find(c => c._isLocalPlayer);
    if (localChar && localChar.alive) {
      const otherChar = this.chars.find(c => c !== localChar);
      localChar._move(dt, otherChar);
    }

    // Sempre envia input (não pula quando estado chegou)
    NET.sendInput(dt, {
      moveX:    playerInput.moveX,
      moveY:    playerInput.moveY,
      aimX:     playerInput.aimX,
      aimY:     playerInput.aimY,
      shootTap: playerInput.shootTap,
    });
    playerInput.shootTap = false;
  }

  // ── FIX 2: câmera segue o player LOCAL em ambos host e guest ──
  // Deve rodar ao final, depois de todas as atualizações de posição
  cam.update(dt, this.chars);
  const _localChar = this.chars.find(c => c._isLocalPlayer);
  if (_localChar && _localChar.alive) {
    cam._tx = _localChar.x;
    cam._ty = _localChar.y;
    cam._tz = cam._bz() * 1.18;
  }
};

/** Atualiza modo Duos vs Boss (3 personagens) */
function _updateDuosBoss(dt, chars, projs) {
  const [p1, p2, boss] = chars;

  // Boss ataca o duo member com mais HP (ou mais próximo)
  const bossTarget = [p1, p2].filter(c => c?.alive)
    .sort((a, b) => b.hp - a.hp)[0] || null;

  if (p1) p1.update(dt, boss, projs);
  if (p2) p2.update(dt, boss, projs);
  if (boss) boss.update(dt, bossTarget, projs);
}

/** Update de projéteis para o modo online (host) */
function _updateProjectiles(dt, chars, projs) {
  for (const p of projs) {
    p.update(dt);
    if (!p.alive) continue;
    for (const target of chars) {
      if (!target.alive || p.owner === target) continue;
      if (p.hits(target)) {
        target.takeDamage(p.dmg || PROJ_DMG);
        p.alive = false;
        break;
      }
    }
  }
  // Remove projéteis mortos
  for (let i = projs.length - 1; i >= 0; i--) {
    if (!projs[i].alive) projs.splice(i, 1);
  }
}

/** Host verifica vitória */
function _checkOnlineWin() {
  const ns = NET.state;
  const mode = G._onlineMode;

  if (mode === 'pvp') {
    const [c1, c2] = G.chars;
    if (!c1.alive && !c2.alive) {
      G.onlineGameOver('Empate');
      NET.sendGameOver('Empate');
    } else if (!c1.alive) {
      const winner = NET.state.players[1] || 'P2';
      G.onlineGameOver(winner);
      NET.sendGameOver(winner);
    } else if (!c2.alive) {
      const winner = NET.state.players[0] || 'P1';
      G.onlineGameOver(winner);
      NET.sendGameOver(winner);
    }
  } else if (mode === 'duos_boss') {
    const [p1, p2, boss] = G.chars;
    const duosDead = !p1.alive && !p2.alive;
    const bossDead = !boss.alive;
    if (bossDead) {
      G.onlineGameOver('Duos venceram!');
      NET.sendGameOver('Duos venceram!');
    } else if (duosDead) {
      G.onlineGameOver(`${boss.name} venceu!`);
      NET.sendGameOver(`${boss.name} venceu!`);
    }
  }
}

G.onlineGameOver = function(winner) {
  if (this.state !== 'playing') return;
  this.state      = 'result';
  this.winnerText = winner;
  // Mostra botão novamente
  if (_onlineBtn) _onlineBtn.style.display = 'block';
  console.log('[ONLINE] game over:', winner);
  _lobbyUI.showResult(winner);
};

/** Aplica input remoto a um PlayerCharacter */
function _applyRemoteInputToChar(char, ri) {
  // Injeta diretamente nas propriedades de movimento do char
  // PlayerCharacter usa playerInput; chars remotos precisam de um mock
  char._remoteMove = ri;
}

// ── PATCH: PlayerCharacter._move para chars remotos ──────────
// Adicione isto DENTRO da classe PlayerCharacter em char_player.js,
// no início do método _move():
//
//   _move(dt) {
//     const inp = this._remoteMove || playerInput;  // ← PATCH
//     // ... resto do código usando `inp` em vez de `playerInput`
//   }
//
// E no método _shoot():
//   _shoot(dt, other, projs) {
//     const inp = this._remoteMove || playerInput;  // ← PATCH
//     if (inp.shootTap) { ... }
//     if (inp._aimActive || inp._mouseAimActive) { ... }
//     ...
//   }

// ── SERIALIZAÇÃO DE ESTADO ────────────────────────────────────
function _serializeState() {
  return {
    t: performance.now(),
    chars: G.chars.map(c => ({
      x: c.x, y: c.y, vx: c.vx, vy: c.vy,
      hp: c.hp, maxHp: c.maxHp, alive: c.alive,
      hitFlash: c.hitFlash, charge: c.charge,
      // animação
      _walkFrame: c._walkFrame, _legAngle: c._legAngle,
      _facing: c._facing,
      // FIX MIRA: sincroniza a linha de mira do inimigo para o guest
      _aimAngle: c._aimAngle,
      _showAim:  c._showAim,
      // boss
      _isBoss: c._isBoss,
    })),
    projs: G.projs.map(p => ({
      x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      ownerIdx: G.chars.indexOf(p.owner),
      sz: p.sz, color: p.color, alive: p.alive,
    })),
    state: G.state,
    winnerText: G.winnerText,
  };
}

/** Guest aplica estado recebido */
function _applyReceivedState(s) {
  if (!s || !s.chars) return;

  s.chars.forEach((cs, i) => {
    const c = G.chars[i];
    if (!c) return;
    // Interpolação simples (lerp 50%)
    c.x       = lerp(c.x, cs.x, 0.5);
    c.y       = lerp(c.y, cs.y, 0.5);
    c.vx      = cs.vx; c.vy = cs.vy;
    c.hp      = cs.hp; c.maxHp = cs.maxHp;
    c.alive   = cs.alive;
    c.hitFlash= cs.hitFlash;
    c.charge  = cs.charge;
    if (cs._facing    != null) c._facing    = cs._facing;
    if (cs._aimAngle  != null) c._aimAngle  = cs._aimAngle; // FIX MIRA
    if (cs._showAim   != null) c._showAim   = cs._showAim;
  });

  // Sincroniza projéteis
  // (simplificado: substitui completamente a lista)
  G.projs = s.projs
    .filter(ps => ps.alive)
    .map(ps => {
      const owner = G.chars[ps.ownerIdx] || G.chars[0];
      const p = new Proj(ps.x, ps.y, ps.vx, ps.vy, owner, ps.sz, ps.color);
      return p;
    });

  if (s.state === 'result' && G.state !== 'result') {
    G.onlineGameOver(s.winnerText);
  }
}

// ── LOBBY UI ──────────────────────────────────────────────────
const _lobbyUI = (() => {
  let _panel = null;
  let _currentPanel = 'none';
  let _notifications = [];

  function _create() {
    if (_panel) return;
    _panel = document.createElement('div');
    _panel.id = 'online-lobby';
    Object.assign(_panel.style, {
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.85)',
      display: 'none', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999,
      fontFamily: 'monospace', color: '#fff',
    });
    document.body.appendChild(_panel);
  }

  function show() {
    _create();
    _panel.style.display = 'flex';
  }

  function hide() {
    if (_panel) _panel.style.display = 'none';
  }

  function setStatus(msg, type) {
    const el = _panel?.querySelector('#lobby-status');
    if (!el) return;
    el.textContent  = msg;
    el.style.color  = type === 'err' ? '#e74c3c' : type === 'warn' ? '#f39c12' : '#2ecc71';
  }

  function setCanStart(can) {
    const btn = _panel?.querySelector('#btn-start-game');
    if (btn) {
      btn.disabled = !can;
      btn.style.opacity = can ? '1' : '0.5';       // FIX 6: feedback visual
      btn.style.cursor  = can ? 'pointer' : 'not-allowed';
    }
  }

  function addPlayer(idx, username) {
    const slot = _panel?.querySelector(`#player-slot-${idx}`);
    if (slot) slot.textContent = `P${idx+1}: ${username}`;
  }

  function applyRemoteConfig(charIndices, bossIndex, customChars) {
    // Guest atualiza UI com config do host
    const el = _panel?.querySelector('#room-config-info');
    if (el) el.textContent = `Boss: idx=${bossIndex}`;
  }

  function showResult(winner) {
    show();
    showPanel('result', winner);
  }

  function showPanel(name, data) {
    if (!_panel) return;
    _currentPanel = name;
    _panel.innerHTML = _buildPanel(name, data);
    _bindEvents(name);
  }

  function refreshFriends() {
    if (_currentPanel === 'friends') {
      NET.getFriends(data => showPanel('friends', data));
    }
  }

  function showNotification(msg, actions) {
    _create();
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      background: '#1a1a2e', border: '2px solid #9b59b6',
      borderRadius: '8px', padding: '12px 16px',
      zIndex: 10000, maxWidth: '280px', fontSize: '14px',
    });
    el.innerHTML = `<div style="margin-bottom:8px">${msg}</div>`;
    (actions || []).forEach(a => {
      const btn = document.createElement('button');
      btn.textContent = a.label;
      Object.assign(btn.style, {
        marginRight: '8px', padding: '4px 12px',
        background: '#9b59b6', border: 'none', color: '#fff',
        borderRadius: '4px', cursor: 'pointer',
      });
      btn.onclick = () => { a.action?.(); el.remove(); };
      el.appendChild(btn);
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function doJoinRoom(code) {
    NET.joinRoom(code, res => {
      if (res.error) return showNotification(`Erro: ${res.error}`);
      showPanel('room_guest', res);
    });
  }

  // ── PANEL BUILDER ────────────────────────────────────────
  function _buildPanel(name, data) {
    const S = (s) => `style="${s}"`;
    const btn = (id, label, extra='') =>
      `<button id="${id}" ${S(`margin:6px;padding:10px 20px;background:#9b59b6;
        border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:15px;${extra}`)}>${label}</button>`;

    const inp = (id, placeholder, type='text') =>
      `<input id="${id}" type="${type}" placeholder="${placeholder}"
        ${S(`margin:6px;padding:8px;background:#2c2c3e;border:1px solid #9b59b6;
          color:#fff;border-radius:4px;font-size:14px;width:200px`)} />`;

    if (name === 'menu') return `
      <h2 ${S('color:#9b59b6;margin-bottom:20px')}>🎮 Jogar Online</h2>
      <div id="lobby-status" ${S('min-height:20px;margin-bottom:12px;color:#2ecc71')}></div>
      ${inp('inp-username','Seu nome (2-20 chars')}
      <div>
        ${btn('btn-register','Entrar / Registrar')}
      </div>
      <hr ${S('width:80%;border-color:#333;margin:16px 0')} />
      ${btn('btn-create-room','Criar Sala')}
      <div ${S('display:flex;align-items:center;gap:8px;margin-top:8px')}>
        ${inp('inp-room-code','Código da sala')}
        ${btn('btn-join-room','Entrar')}
      </div>
      <hr ${S('width:80%;border-color:#333;margin:16px 0')} />
      ${btn('btn-friends','👥 Amigos')}
      ${btn('btn-close-lobby','✖ Fechar','')}
    `;

    if (name === 'room_host') return `
      <h2 ${S('color:#9b59b6')}>🏠 Sua Sala</h2>
      <div ${S('font-size:22px;letter-spacing:4px;color:#f39c12;margin:8px')}>${data?.code || NET.state.roomCode}</div>
      <div id="lobby-status" ${S('min-height:20px;margin:8px;color:#2ecc71')}>Aguardando jogadores...</div>
      <div ${S('margin:12px 0')}>
        <div id="player-slot-0" ${S('color:#5b2d8e')}>P1: ${NET.state.username} (você)</div>
        <div id="player-slot-1" ${S('color:#aaa')}>P2: esperando...</div>
        <div id="player-slot-2" ${S('color:#aaa;display:none')}>P3: esperando...</div>
      </div>
      <div ${S('margin:12px 0')}>
        <b>Modo:</b>
        <select id="sel-mode" ${S('margin-left:8px;padding:4px;background:#2c2c3e;color:#fff;border:1px solid #9b59b6;border-radius:4px')}>
          <option value="pvp">Player vs Player</option>
          <option value="duos_boss">Duos vs Boss</option>
        </select>
      </div>
      <div id="boss-config" ${S('display:none;margin:8px 0')}>
        <b>Personagem Boss:</b>
        <select id="sel-boss" ${S('margin-left:8px;padding:4px;background:#2c2c3e;color:#fff;border:1px solid #9b59b6;border-radius:4px')}>
          ${(typeof CHAR_TYPES !== 'undefined' ? CHAR_TYPES : [])
            .filter((t,i) => !t.isPlayer && !t.isCustomSlot)
            .map((t,i) => `<option value="${i+1}">${t.name}</option>`).join('')}
        </select>
      </div>
      <div id="room-config-info"></div>
      <div ${S('margin-top:16px')}>
        ${btn('btn-start-game','▶ Iniciar','opacity:0.5')}
        ${btn('btn-invite-friend','👥 Convidar amigo')}
      </div>
      ${btn('btn-leave-room','Sair da sala','background:#c0392b')}
    `;

    if (name === 'room_guest') return `
      <h2 ${S('color:#9b59b6')}>🎮 Sala: ${data?.hostUsername || ''}</h2>
      <div id="lobby-status" ${S('min-height:20px;margin:8px;color:#2ecc71')}>Conectado! Aguardando host...</div>
      <div id="room-config-info" ${S('color:#aaa;font-size:13px;margin:8px')}>
        Modo: ${data?.mode === 'duos_boss' ? 'Duos vs Boss' : 'Player vs Player'}
      </div>
      <div ${S('margin:12px')}>
        <div id="player-slot-0" ${S('color:#aaa')}>P1: ${data?.players?.[0] || 'Host'}</div>
        <div id="player-slot-1" ${S('color:#5b2d8e')}>P2: ${NET.state.username} (você)</div>
      </div>
      ${btn('btn-leave-room','Sair da sala','background:#c0392b')}
    `;

    if (name === 'friends') return `
      <h2 ${S('color:#9b59b6')}>👥 Amigos</h2>
      <div ${S('display:flex;gap:8px;margin-bottom:12px')}>
        ${inp('inp-add-friend','Nome do amigo')}
        ${btn('btn-add-friend','Adicionar')}
      </div>
      <div id="lobby-status" ${S('min-height:20px;margin-bottom:8px')}></div>
      <div id="friends-list" ${S('max-height:300px;overflow-y:auto;width:280px')}>
        ${(data?.friends || []).map(f => `
          <div ${S('display:flex;justify-content:space-between;align-items:center;padding:6px;border-bottom:1px solid #333')}>
            <span ${S(`color:${f.online ? '#2ecc71' : '#aaa'}`)}>${f.username}${f.online ? ' ●' : ''}</span>
            ${NET.state.isHost && f.online ? `<button class="btn-invite" data-name="${f.username}"
              ${S('padding:2px 8px;background:#9b59b6;border:none;color:#fff;border-radius:4px;cursor:pointer')}>Convidar</button>` : ''}
          </div>`).join('')}
        ${(data?.pendingFrom || []).map(name => `
          <div ${S('padding:6px;border-bottom:1px solid #333;color:#f39c12')}>
            Pedido de ${name}
            <button class="btn-accept-friend" data-name="${name}"
              ${S('margin-left:8px;padding:2px 6px;background:#2ecc71;border:none;color:#fff;border-radius:4px;cursor:pointer')}>✓</button>
            <button class="btn-decline-friend" data-name="${name}"
              ${S('margin-left:4px;padding:2px 6px;background:#e74c3c;border:none;color:#fff;border-radius:4px;cursor:pointer')}>✗</button>
          </div>`).join('')}
      </div>
      ${btn('btn-back','← Voltar')}
    `;

    if (name === 'result') return `
      <h2 ${S('color:#f39c12;font-size:28px')}>Fim de Jogo</h2>
      <div ${S('font-size:22px;margin:16px;color:#fff')}>${data}</div>
      ${btn('btn-play-again','Jogar Novamente')}
      ${btn('btn-back-menu','Menu','background:#666')}
    `;

    return `<div>Panel desconhecido: ${name}</div>`;
  }

  // ── EVENT BINDING ────────────────────────────────────────
  function _bindEvents(name) {
    const q = id => _panel?.querySelector('#'+id);
    const on = (id, ev, fn) => q(id)?.addEventListener(ev, fn);

    if (name === 'menu') {
      on('btn-register', 'click', () => {
        const username = q('inp-username')?.value?.trim();
        if (!username) return;
        if (!NET.connected) NET.connect();
        // Aguarda conexão se necessário
        const doReg = () => NET.register(username, res => {
          if (res.error) return setStatus(res.error, 'err');
          setStatus(`Olá, ${username}!`, 'ok');
        });
        NET.connected ? doReg() : setTimeout(doReg, 1200);
      });

      on('btn-create-room', 'click', () => {
        if (!NET.state.username) return setStatus('Registre um nome primeiro', 'err');
        if (!NET.connected) return setStatus('Conectando...', 'warn');
        NET.createRoom({ mode: 'pvp', charIndices: [0, 0], bossIndex: -1, customChars: [] }, res => {
          if (res.error) return setStatus(res.error, 'err');
          showPanel('room_host', res);
        });
      });

      on('btn-join-room', 'click', () => {
        const code = q('inp-room-code')?.value?.trim();
        if (!code) return setStatus('Digite o código da sala', 'err');
        if (!NET.state.username) return setStatus('Registre um nome primeiro', 'err');
        doJoinRoom(code);
      });

      on('btn-friends', 'click', () => {
        NET.getFriends(data => showPanel('friends', data));
      });

      on('btn-close-lobby', 'click', hide);
    }

    if (name === 'room_host') {
      const modeEl = q('sel-mode');
      const bossCfg = q('boss-config');

      modeEl?.addEventListener('change', () => {
        const m = modeEl.value;
        if (bossCfg) bossCfg.style.display = m === 'duos_boss' ? 'block' : 'none';
        // Atualiza slot P3 visibilidade
        const slot2 = q('player-slot-2');
        if (slot2) slot2.style.display = m === 'duos_boss' ? 'block' : 'none';

        const bossIdx = parseInt(q('sel-boss')?.value || '7');
        NET.updateRoom({ mode: m, charIndices: [0,0], bossIndex: m==='duos_boss'?bossIdx:-1 }, () => {});
      });

      q('sel-boss')?.addEventListener('change', () => {
        const bossIdx = parseInt(q('sel-boss').value);
        NET.updateRoom({ bossIndex: bossIdx }, () => {});
      });

      on('btn-start-game', 'click', () => {
        const mode    = q('sel-mode')?.value || 'pvp';
        const bossIdx = parseInt(q('sel-boss')?.value || '7');
        NET.updateRoom({ mode, charIndices: [0,0], bossIndex: mode==='duos_boss'?bossIdx:-1 }, () => {
          NET.startGame(res => {
            if (res?.error) setStatus(res.error, 'err');
          });
        });
      });

      on('btn-invite-friend', 'click', () => {
        NET.getFriends(data => showPanel('friends', data));
      });

      on('btn-leave-room', 'click', () => {
        NET.leaveRoom();
        showPanel('menu');
      });
    }

    if (name === 'room_guest') {
      on('btn-leave-room', 'click', () => {
        NET.leaveRoom();
        showPanel('menu');
      });
    }

    if (name === 'friends') {
      on('btn-add-friend', 'click', () => {
        const name = q('inp-add-friend')?.value?.trim();
        if (!name) return;
        NET.addFriend(name, res => {
          setStatus(res.error ? res.error : `Pedido enviado para ${name}!`, res.error ? 'err' : 'ok');
        });
      });

      _panel.querySelectorAll('.btn-invite').forEach(btn => {
        btn.addEventListener('click', () => {
          NET.inviteFriend(btn.dataset.name, res => {
            setStatus(res.error ? res.error : 'Convite enviado!', res.error ? 'err' : 'ok');
          });
        });
      });

      _panel.querySelectorAll('.btn-accept-friend').forEach(btn => {
        btn.addEventListener('click', () => NET.respondFriend(btn.dataset.name, true, () => refreshFriends()));
      });

      _panel.querySelectorAll('.btn-decline-friend').forEach(btn => {
        btn.addEventListener('click', () => NET.respondFriend(btn.dataset.name, false, () => refreshFriends()));
      });

      on('btn-back', 'click', () => showPanel('menu'));
    }

    if (name === 'result') {
      on('btn-play-again', 'click', () => {
        if (NET.state.isHost) {
          NET.startGame(() => {});
        }
        hide();
      });

      on('btn-back-menu', 'click', () => {
        NET.leaveRoom();
        hide();
        G.returnToMenu?.();
      });
    }
  }

  return { show, hide, showPanel, setStatus, setCanStart, addPlayer, applyRemoteConfig,
           showResult, showNotification, doJoinRoom, refreshFriends };
})();

// ── BOTÃO "ONLINE" NO MENU PRINCIPAL ─────────────────────────
let _onlineBtn = null;

function initOnlineButton() {
  const btn = document.createElement('button');
  _onlineBtn = btn;
  btn.textContent = '🌐 Jogar Online';
  Object.assign(btn.style, {
    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
    padding: '10px 24px', background: '#9b59b6', border: 'none',
    color: '#fff', borderRadius: '8px', cursor: 'pointer',
    fontSize: '16px', fontFamily: 'monospace', zIndex: 100,
    boxShadow: '0 4px 12px rgba(155,89,182,0.4)',
  });
  btn.onclick = () => {
    NET.connect();
    _lobbyUI.show();
    _lobbyUI.showPanel('menu');
  };
  document.body.appendChild(btn);
}

// Aguarda o DOM estar pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOnlineButton);
} else {
  initOnlineButton();
}

// ── FIX 5: returnToMenu re-exibe o botão online ───────────────
// Patch aplicado aqui porque online.js carrega depois de game.js
const _origReturnToMenu = G.returnToMenu;
G.returnToMenu = function() {
  _origReturnToMenu.call(this);
  if (_onlineBtn) _onlineBtn.style.display = '';
};
