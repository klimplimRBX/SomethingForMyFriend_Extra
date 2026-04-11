"use strict";
// ── NETWORK.JS — Guy Battle Client Network Module ──────────────
// Depende de: socket.io client (carregado via CDN no index.html)
// Carregar ANTES de game.js, input.js etc.
//
// TROCAR SERVER_URL pela URL do seu app no Render.com:
const NET_SERVER_URL = 'https://SEU-APP.onrender.com';

// ── STATE PÚBLICO ─────────────────────────────────────────────
const NET = (() => {

  let _socket = null;

  const _state = {
    connected:   false,
    username:    null,
    roomCode:    null,
    playerIndex: -1,   // 0 = host, 1 = guest, 2 = guest2 (duos_boss)
    isHost:      false,
    mode:        null, // 'pvp' | 'duos_boss'
    players:     [],   // usernames de todos na sala
    friends:     [],
    pendingFrom: [],
    pendingSent: [],
  };

  // ── HANDLER REGISTRY ────────────────────────────────────────
  const _handlers = {};
  function _emit(event, data) { _handlers[event]?.(data); }

  /** Registra callback para um evento de rede. Exemplo:
   *  NET.on('game_start', data => G.startOnline(data));
   */
  function on(event, fn) { _handlers[event] = fn; }

  // ── CONNECT ─────────────────────────────────────────────────
  function connect() {
    if (_socket?.connected) return;
    // Socket.io deve estar carregado via CDN
    // FIX MOBILE: polling como fallback — mobile browsers bloqueiam WebSocket puro
    _socket = io(NET_SERVER_URL, { transports: ['websocket', 'polling'] });

    _socket.on('connect', () => {
      _state.connected = true;
      _emit('connected');
      console.log('[NET] conectado', _socket.id);
    });

    _socket.on('disconnect', (reason) => {
      _state.connected = false;
      _emit('disconnected', { reason });
      console.log('[NET] desconectado', reason);
    });

    // ── ROOM EVENTS ─────────────────────────────────────────
    _socket.on('player_joined', data => _emit('player_joined', data));
    _socket.on('room_full',     data => _emit('room_full', data));
    _socket.on('room_config',   data => _emit('room_config', data));
    _socket.on('room_closed',   data => {
      _state.roomCode    = null;
      _state.playerIndex = -1;
      _state.isHost      = false;
      _emit('room_closed', data);
    });
    _socket.on('player_left',   data => _emit('player_left', data));

    // ── GAME EVENTS ──────────────────────────────────────────
    _socket.on('game_start',    data => _emit('game_start', data));
    _socket.on('remote_input',  data => _emit('remote_input', data));
    _socket.on('game_state',    data => _emit('game_state', data));
    _socket.on('game_over',     data => _emit('game_over', data));

    // ── FRIEND EVENTS ────────────────────────────────────────
    _socket.on('friend_request',  data => _emit('friend_request', data));
    _socket.on('friend_accepted', data => _emit('friend_accepted', data));
    _socket.on('friend_declined', data => _emit('friend_declined', data));
    _socket.on('room_invite',     data => _emit('room_invite', data));
  }

  // ── AUTH ─────────────────────────────────────────────────────
  function register(username, cb) {
    _socket.emit('register', { username }, res => {
      if (res.ok) _state.username = username;
      cb(res);
    });
  }

  // ── ROOM ─────────────────────────────────────────────────────
  /**
   * Cria sala.
   * @param {object} opts
   * @param {string}   opts.mode        'pvp' | 'duos_boss'
   * @param {number[]} opts.charIndices  índices de CHAR_TYPES para cada slot
   * @param {number}   opts.bossIndex   índice do char que é o boss (-1 se pvp)
   * @param {object[]} opts.customChars  dados de chars customizados
   */
  function createRoom(opts, cb) {
    _socket.emit('create_room', opts, res => {
      if (res.ok) {
        _state.roomCode    = res.code;
        _state.playerIndex = 0;
        _state.isHost      = true;
        _state.mode        = opts.mode;
        _state.players     = [_state.username]; // FIX 3: host preenche seu próprio slot
      }
      cb(res);
    });
  }

  /** Entra por código */
  function joinRoom(code, cb) {
    _socket.emit('join_room', { code: code.trim().toUpperCase() }, res => {
      if (res.ok) {
        _state.roomCode    = res.code || code;
        _state.playerIndex = res.playerIndex;
        _state.isHost      = false;
        _state.mode        = res.mode;
        _state.players     = res.players || [];
      }
      cb(res);
    });
  }

  /** Host atualiza configuração da sala (chars, boss) */
  function updateRoom(opts, cb) {
    _socket.emit('update_room', opts, cb || (() => {}));
  }

  /** Host inicia o jogo */
  function startGame(cb) {
    _socket.emit('start_game', {}, cb || (() => {}));
  }

  function leaveRoom() {
    _socket.emit('leave_room');
    _state.roomCode    = null;
    _state.playerIndex = -1;
    _state.isHost      = false;
  }

  // ── IN-GAME RELAY ────────────────────────────────────────────
  // Taxa: ~20 vezes por segundo (chamado dentro do game loop)
  let _inputThrottle = 0;
  const INPUT_RATE = 1/20; // 50ms

  /**
   * Envia inputs locais pro servidor (guests enviam pro host).
   * Só funciona para guests — host não precisa enviar inputs para si mesmo.
   * Chame isso no game loop (dt disponível).
   */
  function sendInput(dt, input) {
    if (_state.isHost) return; // host não precisa
    _inputThrottle -= dt;
    if (_inputThrottle > 0) return;
    _inputThrottle = INPUT_RATE;
    if (!_socket?.connected || !_state.roomCode) return;
    _socket.volatile.emit('player_input', input); // FIX PING: volatile — descarta se rede congestionada
  }

  /**
   * Host envia estado autoritativo do jogo pros guests.
   * Chame isso no game loop do host.
   */
  let _stateThrottle = 0;
  const STATE_RATE = 1/20;

  function sendGameState(dt, state) {
    if (!_state.isHost) return;
    _stateThrottle -= dt;
    if (_stateThrottle > 0) return;
    _stateThrottle = STATE_RATE;
    if (!_socket?.connected) return;
    _socket.volatile.emit('game_state', state); // FIX PING: volatile
  }

  function sendGameOver(winner) {
    if (!_state.isHost) return;
    _socket.emit('game_over', { winner });
  }

  // ── FRIENDS ──────────────────────────────────────────────────
  function addFriend(username, cb) {
    _socket.emit('friend_request', { toUsername: username }, cb || (() => {}));
  }

  function respondFriend(fromUsername, accept, cb) {
    _socket.emit('friend_respond', { fromUsername, accept }, res => {
      cb?.(res);
    });
  }

  function removeFriend(username, cb) {
    _socket.emit('friend_remove', { username }, cb || (() => {}));
  }

  function inviteFriend(friendUsername, cb) {
    _socket.emit('friend_invite', { friendUsername }, cb || (() => {}));
  }

  function getFriends(cb) {
    _socket.emit('get_friends', {}, data => {
      _state.friends     = data.friends;
      _state.pendingFrom = data.pendingFrom;
      _state.pendingSent = data.pendingSent;
      cb?.(data);
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    connect,
    on,
    register,
    createRoom,
    joinRoom,
    updateRoom,
    startGame,
    leaveRoom,
    sendInput,
    sendGameState,
    sendGameOver,
    addFriend,
    respondFriend,
    removeFriend,
    inviteFriend,
    getFriends,
    get state() { return _state; },
    get connected() { return !!_socket?.connected; },
  };
})();
