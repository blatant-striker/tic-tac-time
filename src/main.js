import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { AppwriteService } from './appwrite.js';
import { AuthService } from './auth.js';
import { AIPlayer } from './ai.js';
import { Lobby } from './lobby.js';
import { UI } from './ui.js';

class App {
  constructor() {
    this.game = null;
    this.renderer = null;
    this.appwrite = new AppwriteService();
    this.auth = new AuthService(this.appwrite.getClient());
    this.lobby = new Lobby(this.appwrite, this.auth);
    this.ui = new UI();
    
    this.gameMode = null; // 'single' or 'multi'
    this.currentGameMode = null; // 'normal' or 'time'
    this.aiPlayer = null;
    this.aiDifficulty = null;
    this.mySymbol = null;
    this.isAIGame = false;
    this.isLocalGame = false;
    this.settings = this.loadSettings();
    this.lobbyCache = [];
    this.prevBoard = null; // Track previous board for diffing opponent last move
    
    // Timer and confirmation
    this.turnTimer = null;
    this.timeLeft = 30;
    this.pendingMove = null;

    this.init();
  }

  async sha256(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  applyLobbyFilter(term) {
    try {
      const q = String(term || '').trim().toLowerCase();
      const list = Array.isArray(this.lobbyCache) ? this.lobbyCache.slice() : [];
      const filtered = q
        ? list.filter(lb => {
            const host = (lb.host?.name || 'player').toLowerCase();
            const id = String(lb.id || '').toLowerCase();
            const mode = String(lb.gameMode || '').toLowerCase();
            const roomName = String(lb.roomName || '').toLowerCase();
            return host.includes(q) || id.includes(q) || mode.includes(q) || roomName.includes(q);
          })
        : list;
      filtered.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      this.ui.updateLobbyList(filtered, (id) => this.joinLobby(id));
    } catch (e) {
      console.warn('applyLobbyFilter failed:', e?.message || e);
      this.ui.updateLobbyList([], () => {});
    }
  }

  handleLocalMultiplayerQuick() {
    // No login required for local multiplayer
    this.gameMode = 'local';
    this.ui.showModeSelect();
  }

  async createRoom() {
    try {
      // Enforce auth for multiplayer room creation
      if (!this.auth.isLoggedIn()) { this.showAuthModal('login'); return; }
      if (this.auth.getUser()?.labels?.includes('guest')) { this.showAuthModal('signup'); return; }

      // Read password protection options
      const cb = document.getElementById('roomPasswordProtected');
      const pw = document.getElementById('roomPassword');
      const rn = document.getElementById('roomName');
      let passwordHash = null;
      if (cb && cb.checked && pw && pw.value) {
        passwordHash = await this.sha256(pw.value);
      }

      const roomName = rn && rn.value ? rn.value.trim().slice(0, 40) : '';
      const player1Name = this.auth.getUserName();
      const gameDoc = await this.appwrite.createGame(this.currentGameMode, { passwordHash, roomName, player1Name });
      this.mySymbol = this.appwrite.getPlayerSymbol(gameDoc);

      this.appwrite.subscribeToGame(gameDoc.$id, (payload) => {
        this.onGameUpdate(payload);
      });

      const roomCode = gameDoc.$id;
      const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      this.ui.showRoom(roomCode, roomLink);
      this.updateRoomUI(gameDoc);
    } catch (error) {
      this.showToast('Failed to create room: ' + error.message, 'error');
      this.ui.showLobby();
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  async init() {
    // Check if user is logged in
    const user = await this.auth.getCurrentUser();
    
    // Check for room URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
      // Store room ID for later if user needs to login first
      sessionStorage.setItem('pending_room_join', roomId);
      
      if (user) {
        // User is logged in, attempt to join room directly
        await this.handleDirectRoomJoin(roomId);
      } else {
        // User not logged in, show login and they'll be redirected after
        this.showAuth();
        this.showToast('Please login to join this room', 'info');
      }
    } else {
      if (user) {
        this.showMainMenu();
      } else {
        this.showAuth();
      }
    }

    this.setupEventListeners();
    // Apply settings to UI if present
    this.applySettingsToUI();
  }

  showAuth() {
    this.ui.showAuth();
    const ud = document.getElementById('userDisplay');
    if (ud) {
      ud.textContent = '';
      ud.classList.add('hidden');
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('ttt_settings');
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        reducedMotion: !!parsed.reducedMotion,
        highGraphics: parsed.highGraphics !== false,
        sound: !!parsed.sound
      };
    } catch {
      return { reducedMotion: false, highGraphics: true, sound: true };
    }
  }

  saveSettings() {
    localStorage.setItem('ttt_settings', JSON.stringify(this.settings));
  }

  applySettingsToUI() {
    const rm = document.getElementById('settingReducedMotion');
    const hg = document.getElementById('settingHighGraphics');
    const snd = document.getElementById('settingSound');
    if (rm) rm.checked = !!this.settings.reducedMotion;
    if (hg) hg.checked = !!this.settings.highGraphics;
    if (snd) snd.checked = !!this.settings.sound;
  }

  showProfileModal() {
    const modal = document.getElementById('profileModal');
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const userName = this.auth.getUserName() || 'Guest';
    const user = this.auth.getUser();
    if (nameEl) nameEl.textContent = userName;
    if (emailEl) emailEl.textContent = user?.email || '';
    modal?.classList.remove('hidden');
    this.applySettingsToUI();
  }

  hideProfileModal() {
    document.getElementById('profileModal')?.classList.add('hidden');
  }

  showCreateRoomModal() {
    const m = document.getElementById('createRoomModal');
    if (m) m.classList.remove('hidden');
    const cb = document.getElementById('roomPasswordProtected');
    const pw = document.getElementById('roomPassword');
    const rn = document.getElementById('roomName');
    if (cb && pw) {
      cb.checked = false;
      pw.disabled = true;
      pw.value = '';
      pw.classList.add('hidden');
    }
    rn?.focus();
  }

  hideCreateRoomModal() {
    const m = document.getElementById('createRoomModal');
    if (m) m.classList.add('hidden');
  }

  showAuthModal(type) {
    const modal = document.getElementById('authModal');
    const title = document.getElementById('modalTitle');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    modal.classList.remove('hidden');
    
    if (type === 'login') {
      title.textContent = 'Login';
      loginForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
    } else {
      title.textContent = 'Sign Up';
      signupForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  }

  hideAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
  }

  async handleQuickPlay() {
    const result = await this.auth.signInAnonymous();
    if (result.success) {
      this.gameMode = 'single';
      this.aiDifficulty = 'medium';
      this.currentGameMode = 'normal';
      this.startSinglePlayerGame();
    } else {
      this.showToast('Failed to start: ' + result.error, 'error');
    }
  }

  async handleSinglePlayerQuick() {
    // No login/guest required for single-player
    this.gameMode = 'single';
    this.aiDifficulty = 'medium'; // default
    // Let the user choose game type next
    this.ui.showModeSelect();
  }

  async handleMultiplayerQuick() {
    if (!this.auth.isLoggedIn()) {
      this.showAuthModal('login');
      return;
    }
    
    if (this.auth.getUser()?.labels?.includes('guest')) {
      this.showAuthModal('signup');
      return;
    }
    
    this.gameMode = 'multi';
    this.ui.showModeSelect();
  }

  async handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      this.showToast('Please fill in all fields', 'error');
      return;
    }

    const btn = document.getElementById('loginBtn');
    if (btn) btn.disabled = true;
    const result = await this.auth.signIn(email, password);
    if (btn) btn.disabled = false;
    if (result.success) {
      this.hideAuthModal();
      this.showToast('Welcome back!', 'success');
      
      // Check for pending room join
      const pendingRoomId = sessionStorage.getItem('pending_room_join');
      if (pendingRoomId) {
        sessionStorage.removeItem('pending_room_join');
        await this.handleDirectRoomJoin(pendingRoomId);
      } else {
        this.showMainMenu();
      }
    } else {
      this.showToast('Login failed: ' + result.error, 'error');
    }
  }

  async handleSignup() {
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;

    if (!name || !email || !password) {
      this.showToast('Please fill in all fields', 'error');
      return;
    }

    const btn = document.getElementById('signupBtn');
    if (btn) btn.disabled = true;
    const result = await this.auth.signUp(email, password, name);
    if (btn) btn.disabled = false;
    if (result.success) {
      this.hideAuthModal();
      this.showToast('Account created successfully!', 'success');
      
      // Check for pending room join
      const pendingRoomId = sessionStorage.getItem('pending_room_join');
      if (pendingRoomId) {
        sessionStorage.removeItem('pending_room_join');
        await this.handleDirectRoomJoin(pendingRoomId);
      } else {
        this.showMainMenu();
      }
    } else {
      this.showToast(result.error, 'error');
      if (result.shouldLogin) {
        setTimeout(() => {
          document.getElementById('loginEmail').value = email;
          document.getElementById('loginPassword').focus();
          this.showAuthModal('login');
        }, 300);
      }
    }
  }

  async handleGuestLogin() {
    const result = await this.auth.signInAnonymous();
    if (result.success) {
      this.showToast('Playing as guest', 'success');
      this.showMainMenu();
    } else {
      this.showToast('Guest login failed: ' + result.error, 'error');
    }
  }

  showMainMenu() {
    this.hideHeaderLeaveBtn();
    const isUser = this.auth.isLoggedIn() && !this.auth.getUser()?.labels?.includes('guest');
    const name = isUser ? this.auth.getUserName() : null;
    this.ui.showMainMenu(name);
    const ud = document.getElementById('userDisplay');
    if (ud) {
      if (name) {
        ud.textContent = `👤 ${name}`;
        ud.classList.remove('hidden');
      } else {
        ud.textContent = '';
        ud.classList.add('hidden');
      }
    }
  }

  setupEventListeners() {
    // View control arrows - snap to cube faces
    document.getElementById('viewTop')?.addEventListener('click', () => {
      this.renderer?.snapToView('top');
    });
    document.getElementById('viewBottom')?.addEventListener('click', () => {
      this.renderer?.snapToView('bottom');
    });
    document.getElementById('viewLeft')?.addEventListener('click', () => {
      this.renderer?.snapToView('left');
    });
    document.getElementById('viewRight')?.addEventListener('click', () => {
      this.renderer?.snapToView('right');
    });
    
    // Keyboard arrow keys support - snap to cube faces
    document.addEventListener('keydown', (e) => {
      if (!this.renderer) return;
      
      switch(e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.renderer.snapToView('top');
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.renderer.snapToView('bottom');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.renderer.snapToView('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.renderer.snapToView('right');
          break;
        default:
          break;
      }
    });

    // Landing page quick actions
    document.getElementById('singlePlayerQuickBtn')?.addEventListener('click', () => this.handleSinglePlayerQuick());
    document.getElementById('multiplayerQuickBtn')?.addEventListener('click', () => this.handleMultiplayerQuick());
    document.getElementById('localMultiplayerBtn')?.addEventListener('click', () => this.handleLocalMultiplayerQuick());

    // Auth modal controls
    document.getElementById('showLoginBtn')?.addEventListener('click', () => this.showAuthModal('login'));
    document.getElementById('showSignupBtn')?.addEventListener('click', () => this.showAuthModal('signup'));
    document.getElementById('closeModal')?.addEventListener('click', () => this.hideAuthModal());
    document.getElementById('loginBtn')?.addEventListener('click', () => this.handleLogin());
    document.getElementById('signupBtn')?.addEventListener('click', () => this.handleSignup());
    document.getElementById('switchToSignup')?.addEventListener('click', (e) => { e.preventDefault(); this.showAuthModal('signup'); });
    document.getElementById('switchToLogin')?.addEventListener('click', (e) => { e.preventDefault(); this.showAuthModal('login'); });

    // Header user menu
    document.getElementById('userDisplay')?.addEventListener('click', () => {
      if (!this.auth.isLoggedIn() || this.auth.getUser()?.labels?.includes('guest')) {
        this.showAuthModal('login');
        return;
      }
      this.showProfileModal();
    });
    document.getElementById('closeProfileModal')?.addEventListener('click', () => this.hideProfileModal());
    document.getElementById('logoutConfirmBtn')?.addEventListener('click', async () => {
      await this.auth.signOut();
      this.hideProfileModal();
      this.showAuth();
    });
    document.getElementById('settingReducedMotion')?.addEventListener('change', (e) => {
      this.settings.reducedMotion = !!e.target.checked;
      this.saveSettings();
    });
    document.getElementById('settingHighGraphics')?.addEventListener('change', (e) => {
      this.settings.highGraphics = !!e.target.checked;
      this.saveSettings();
    });
    document.getElementById('settingSound')?.addEventListener('change', (e) => {
      this.settings.sound = !!e.target.checked;
      this.saveSettings();
    });

    document.getElementById('multiplayerBtn')?.addEventListener('click', () => {
      if (!this.auth.isLoggedIn()) {
        this.showAuthModal('login');
        return;
      }
      if (this.auth.getUser()?.labels?.includes('guest')) {
        this.showAuthModal('signup');
        return;
      }
      this.gameMode = 'multi';
      this.ui.showModeSelect();
    });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await this.auth.signOut();
      this.showAuth();
    });

    // Mode selection (exclusive highlight + navigate)
    document.querySelectorAll('[data-game-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Exclusive selection styling
        document.querySelectorAll('#gameTypeGrid .option-card')
          .forEach(c => c.classList.remove('selected'));
        e.currentTarget.classList.add('selected');

        this.currentGameMode = e.currentTarget.dataset.gameMode;
        if (this.gameMode === 'single') {
          this.startSinglePlayerGame();
        } else if (this.gameMode === 'local') {
          this.startLocalMultiplayerGame();
        } else {
          // Enforce auth for multiplayer
          if (!this.auth.isLoggedIn()) { this.showAuthModal('login'); return; }
          if (this.auth.getUser()?.labels?.includes('guest')) { this.showAuthModal('signup'); return; }
          this.showLobby();
        }
      });
    });

    document.getElementById('backFromMode')?.addEventListener('click', () => {
      this.showMainMenu();
    });

    // AI difficulty
    document.querySelectorAll('[data-difficulty]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.aiDifficulty = e.currentTarget.dataset.difficulty;
        this.startSinglePlayerGame();
      });
    });

    document.getElementById('backFromDifficulty')?.addEventListener('click', () => {
      this.ui.showModeSelect();
    });

    // Lobby
    document.getElementById('createLobby')?.addEventListener('click', () => {
      this.showCreateRoomModal();
    });

    document.getElementById('refreshLobbies')?.addEventListener('click', () => {
      this.refreshLobbyList();
    });

    document.getElementById('backFromLobby')?.addEventListener('click', () => {
      this.ui.showModeSelect();
    });

    document.getElementById('joinByCodeBtn')?.addEventListener('click', async () => {
      const code = document.getElementById('joinCodeInput')?.value?.trim();
      const pwd = document.getElementById('joinPasswordInput')?.value || '';
      if (!code) {
        this.showToast('Enter a room code', 'error');
        return;
      }
      try {
        await this.joinLobby(code, pwd);
      } catch (e) {
        this.showToast('Failed to join by code', 'error');
      }
    });

    document.getElementById('lobbySearch')?.addEventListener('input', (e) => {
      this.applyLobbyFilter(e.target.value);
    });

    // Room controls
    document.getElementById('copyRoomCode')?.addEventListener('click', async () => {
      const val = document.getElementById('roomCode')?.value || '';
      try { await navigator.clipboard.writeText(val); this.showToast('Code copied', 'success'); } catch {}
    });
    document.getElementById('copyRoomLink')?.addEventListener('click', async () => {
      const val = document.getElementById('roomLink')?.value || '';
      try { await navigator.clipboard.writeText(val); this.showToast('Link copied', 'success'); } catch {}
    });
    document.getElementById('cancelRoom')?.addEventListener('click', () => this.cancelRoom());
    document.getElementById('startGame')?.addEventListener('click', async () => {
      try { await this.appwrite.updateStatus('playing'); } catch (e) { this.showToast('Failed to start game', 'error'); }
    });

    // Create Room Modal
    document.getElementById('roomPasswordProtected')?.addEventListener('change', (e) => {
      const pw = document.getElementById('roomPassword');
      if (pw) {
        pw.disabled = !e.target.checked;
        if (e.target.checked) {
          pw.classList.remove('hidden');
        } else {
          pw.classList.add('hidden');
        }
        if (!e.target.checked) pw.value = '';
      }
    });
    document.getElementById('confirmCreateRoom')?.addEventListener('click', async () => {
      await this.createRoom();
      this.hideCreateRoomModal();
    });
    document.getElementById('cancelCreateRoom')?.addEventListener('click', () => this.hideCreateRoomModal());
    document.getElementById('cancelCreateRoomBtn')?.addEventListener('click', () => this.hideCreateRoomModal());

    // Game controls
    document.getElementById('prevTime')?.addEventListener('click', () => this.changeTime(-1));
    document.getElementById('nextTime')?.addEventListener('click', () => this.changeTime(1));
    document.getElementById('headerLeaveBtn')?.addEventListener('click', () => this.leaveGame());
    document.getElementById('playAgain')?.addEventListener('click', () => this.playAgain());
    document.getElementById('backToBoard')?.addEventListener('click', () => this.backToBoard());
    document.getElementById('mainMenuBtn')?.addEventListener('click', () => this.mainMenuFromGameOver());
    document.getElementById('restartFromView')?.addEventListener('click', () => this.playAgain());
    
    // Confirmation controls
    document.getElementById('confirmMove')?.addEventListener('click', () => this.confirmPendingMove());
    document.getElementById('cancelMove')?.addEventListener('click', () => this.cancelPendingMove());
  }

  async showLobby() {
    // Enforce auth for lobby view
    if (!this.auth.isLoggedIn()) { this.showAuthModal('login'); return; }
    if (this.auth.getUser()?.labels?.includes('guest')) { this.showAuthModal('signup'); return; }

    this.ui.showLobby();
    await this.refreshLobbyList();
  }

  async refreshLobbyList() {
    const lobbies = await this.lobby.findLobbies(this.currentGameMode);
    const minutes = 10;
    const now = Date.now();
    const freshLobbies = lobbies.filter(lb => (now - (lb.updatedAt || lb.createdAt || now)) <= minutes * 60 * 1000);
    this.lobbyCache = freshLobbies;
    this.applyLobbyFilter(document.getElementById('lobbySearch')?.value || '');

    // If there are stale waiting rooms, run client-side cleanup (throttled)
    try {
      const staleCount = lobbies.filter(lb => (now - (lb.updatedAt || lb.createdAt || now)) > minutes * 60 * 1000).length;
      if (staleCount > 0) {
        const last = parseInt(localStorage.getItem('ttt_last_cleanup') || '0', 10);
        if (now - last > 60 * 1000) { // throttle: 1 minute
          await this.appwrite.cleanupStaleGames(minutes);
          localStorage.setItem('ttt_last_cleanup', String(now));
        }
      }
    } catch (e) {
      // Non-fatal
      console.warn('Stale cleanup failed:', e?.message || e);
    }
  }

  async handleDirectRoomJoin(roomId) {
    try {
      // Clear URL parameter
      window.history.replaceState({}, '', window.location.pathname);
      
      // Fetch room details
      const doc = await this.appwrite.getGame(roomId);
      if (!doc) {
        this.showToast('Room not found', 'error');
        this.showMainMenu();
        return;
      }
      
      if (doc.status !== 'waiting' && doc.status !== 'ready') {
        this.showToast('This room is no longer available', 'error');
        this.showMainMenu();
        return;
      }
      
      // Check if password protected
      if (doc.passwordHash) {
        const pwd = window.prompt('This room is password protected. Enter password:') || '';
        const enteredHash = pwd ? await this.sha256(pwd) : '';
        if (enteredHash !== doc.passwordHash) {
          this.showToast('Incorrect password', 'error');
          this.showMainMenu();
          return;
        }
      }
      
      // Set game mode based on room
      this.currentGameMode = doc.gameMode;
      
      // Join the room
      await this.joinLobby(roomId, null);
    } catch (error) {
      this.showToast('Failed to join room: ' + error.message, 'error');
      this.showMainMenu();
    }
  }

  async joinLobby(lobbyId, providedPassword = null) {
    try {
      // Enforce auth before joining
      if (!this.auth.isLoggedIn()) { this.showAuthModal('login'); return; }
      if (this.auth.getUser()?.labels?.includes('guest')) { this.showAuthModal('signup'); return; }

      // Pre-check password requirement
      let doc = null;
      try {
        doc = await this.appwrite.getGame(lobbyId);
      } catch {}
      if (!doc) throw new Error('Room not found');
      if (doc.status !== 'waiting' && doc.status !== 'ready') throw new Error('Game not joinable');

      if (doc.passwordHash) {
        let pwd = providedPassword;
        if (!pwd) {
          pwd = window.prompt('This room is password protected. Enter password:') || '';
        }
        const enteredHash = pwd ? await this.sha256(pwd) : '';
        if (enteredHash !== doc.passwordHash) {
          this.showToast('Incorrect room password', 'error');
          return;
        }
      }

      const game = await this.lobby.joinLobby(lobbyId);
      // Subscribe and show room in ready state; host will press Start
      this.appwrite.subscribeToGame(game.$id, (payload) => this.onGameUpdate(payload));
      const roomCode = game.$id;
      const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      this.ui.showRoom(roomCode, roomLink);
      this.updateRoomUI(game);
    } catch (error) {
      this.showToast('Failed to join lobby: ' + error.message, 'error');
      this.refreshLobbyList();
    }
  }

  async createMultiplayerGame() {
    try {
      // Enforce auth for multiplayer quick matchmaking
      if (!this.auth.isLoggedIn()) { this.showAuthModal('login'); return; }
      if (this.auth.getUser()?.labels?.includes('guest')) { this.showAuthModal('signup'); return; }

      const gameDoc = await this.appwrite.findAvailableGame(this.currentGameMode);
      this.mySymbol = this.appwrite.getPlayerSymbol(gameDoc);

      this.appwrite.subscribeToGame(gameDoc.$id, (payload) => {
        this.onGameUpdate(payload);
      });

      if (gameDoc.status === 'playing') {
        this.initializeMultiplayerGame(gameDoc);
      } else {
        // Wait for opponent in room view
        const roomCode = gameDoc.$id;
        const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
        this.ui.showRoom(roomCode, roomLink);
      }
    } catch (error) {
      this.showToast('Failed to create game: ' + error.message, 'error');
      this.ui.showModeSelect();
    }
  }

  startSinglePlayerGame() {
    this.isAIGame = true;
    this.mySymbol = 'X';
    this.aiPlayer = new AIPlayer(this.aiDifficulty);
    
    this.game = new Game(this.currentGameMode);
    this.ui.showGame(this.currentGameMode);
    this.hideViewOnlyBar();
    this.showHeaderLeaveBtn();
    
    const container = this.ui.getCanvasContainer();
    this.renderer = new Renderer(container, this.game, (x, y, z) => {
      this.onCellClick(x, y, z);
    }, { reducedMotion: !!this.settings.reducedMotion });

    this.ui.updateCurrentPlayer(this.game.currentPlayer, true, true);
    
    if (this.currentGameMode === 'time') {
      this.ui.updateTimeDisplay(this.game.currentTime);
      const prevBtn = document.getElementById('prevTime');
      const nextBtn = document.getElementById('nextTime');
      if (prevBtn) prevBtn.disabled = this.game.currentTime === 0;
      if (nextBtn) nextBtn.disabled = this.game.currentTime === this.game.timeSlices - 1;
    }
    
    // No timer in single-player
  }

  startLocalMultiplayerGame() {
    this.isAIGame = false;
    this.isLocalGame = true;
    this.mySymbol = null; // Not used for local results

    this.game = new Game(this.currentGameMode);
    this.ui.showGame(this.currentGameMode);
    this.hideViewOnlyBar();
    this.showHeaderLeaveBtn();

    const container = this.ui.getCanvasContainer();
    this.renderer = new Renderer(container, this.game, (x, y, z) => {
      this.onCellClick(x, y, z);
    }, { reducedMotion: !!this.settings.reducedMotion });

    this.ui.updateCurrentPlayer(this.game.currentPlayer, true, false);
    if (this.currentGameMode === 'time') {
      this.ui.updateTimeDisplay(this.game.currentTime);
      const prevBtn = document.getElementById('prevTime');
      const nextBtn = document.getElementById('nextTime');
      if (prevBtn) prevBtn.disabled = this.game.currentTime === 0;
      if (nextBtn) nextBtn.disabled = this.game.currentTime === this.game.timeSlices - 1;
    }
    // No timer in local multiplayer
  }

  initializeMultiplayerGame(gameDoc) {
    this.isAIGame = false;
    this.game = new Game(gameDoc.gameMode);
    
    if (gameDoc.board) {
      try {
        const boardData = JSON.parse(gameDoc.board);
        if (boardData.length > 0) {
          // Determine last move before updating board
          const last = this.findLastMove(this.prevBoard, boardData);
          this.game.board = boardData;
          const mySymbol = this.appwrite.getPlayerSymbol(gameDoc);
          if (last) {
            if (this.game.mode === 'time' && typeof last.t === 'number') {
              this.game.currentTime = last.t;
              this.ui.updateTimeDisplay(this.game.currentTime);
              const prevBtn = document.getElementById('prevTime');
              const nextBtn = document.getElementById('nextTime');
              if (prevBtn) prevBtn.disabled = this.game.currentTime === 0;
              if (nextBtn) nextBtn.disabled = this.game.currentTime === this.game.timeSlices - 1;
              if (this.renderer) this.renderer.createGrid();
            }
            if (this.renderer) {
              if (last.val === mySymbol) {
                this.renderer.highlightSelfCell(last.x, last.y, last.z);
              } else {
                this.renderer.highlightOpponentCell(last.x, last.y, last.z);
              }
              this.renderer.updateMarkers();
              this.renderer.snapToView('front');
            }
          }
          this.prevBoard = boardData;
        }
      } catch (e) {
        console.error('Failed to parse board:', e);
      }
    }
    
    this.game.currentPlayer = gameDoc.currentPlayer;
    this.game.currentTime = gameDoc.currentTime;

    this.ui.showGame(gameDoc.gameMode);
    this.hideViewOnlyBar();
    this.showHeaderLeaveBtn();

    const container = this.ui.getCanvasContainer();
    this.renderer = new Renderer(container, this.game, (x, y, z) => {
      this.onCellClick(x, y, z);
    }, { reducedMotion: !!this.settings.reducedMotion });

    this.updateUI(gameDoc);
    // Track initial board for diffing
    try { this.prevBoard = JSON.parse(gameDoc.board || '[]'); } catch { this.prevBoard = null; }
  }

  onGameUpdate(gameDoc) {
    // Handle room ready state
    if (gameDoc.status === 'ready' && !this.game) {
      // Stay in room until host starts
      this.updateRoomUI(gameDoc);
      return;
    }

    if (gameDoc.status === 'playing' && !this.game) {
      this.initializeMultiplayerGame(gameDoc);
      return;
    }

    if (!this.game) return;

    if (gameDoc.board) {
      try {
        const boardData = JSON.parse(gameDoc.board);
        if (boardData.length > 0) {
          this.game.board = boardData;
        }
      } catch (e) {
        console.error('Failed to parse board:', e);
      }
    }

    this.game.currentPlayer = gameDoc.currentPlayer;
    const prevTime = this.game.currentTime;
    const nextTime = gameDoc.currentTime;
    const timeChanged = this.game.mode === 'time' && typeof nextTime === 'number' && nextTime !== prevTime;
    this.game.currentTime = nextTime;

    if (gameDoc.winner) {
      this.game.winner = gameDoc.winner;
      this.game.gameOver = true;
      this.onGameEnd(gameDoc.winner);
      return;
    }

    if (this.renderer) {
      if (timeChanged) {
        const dir = nextTime - prevTime;
        this.renderer.animateTimeCarousel(dir);
      } else {
        this.renderer.updateMarkers();
      }
    }

    this.updateUI(gameDoc);
  }

  async onCellClick(x, y, z) {
    if (!this.game || this.game.gameOver) return;

    // For multiplayer, check turn
    if (!this.isAIGame && !this.isLocalGame) {
      if (!this.appwrite.currentGameId) return;
      const gameDoc = await this.appwrite.getGame(this.appwrite.currentGameId);
      if (!this.appwrite.isMyTurn(gameDoc)) {
        this.ui.showStatus("It's not your turn!", 'warning');
        return;
      }
    }

    // For AI game, check if it's player's turn
    if (this.isAIGame && this.game.currentPlayer !== this.mySymbol) {
      return;
    }
    
    // Check if cell is already occupied
    const t = this.game.currentTime;
    if (this.game.board[t][z][y][x] !== null) {
      this.ui.showStatus('Cell already occupied!', 'error');
      return;
    }

    // Show confirmation panel
    this.pendingMove = { x, y, z };
    this.showConfirmation();
  }
  
  showConfirmation() {
    const { x, y, z } = this.pendingMove;
    
    // Highlight the pending cell in the renderer
    this.renderer.highlightPendingCell(x, y, z);
    
    const confirmPanel = document.getElementById('confirmPanel');
    const confirmPlayer = document.getElementById('confirmPlayer');
    confirmPlayer.textContent = this.game.currentPlayer;
    confirmPanel.classList.remove('hidden');
  }
  
  hideConfirmation() {
    // Clear the pending cell highlight
    if (this.renderer) {
      this.renderer.clearPendingHighlight();
    }
    
    const confirmPanel = document.getElementById('confirmPanel');
    confirmPanel.classList.add('hidden');
    this.pendingMove = null;
  }
  
  cancelPendingMove() {
    this.hideConfirmation();
  }
  
  async confirmPendingMove() {
    if (!this.pendingMove) return;
    
    const { x, y, z } = this.pendingMove;
    this.hideConfirmation();
    // Clear opponent highlight and mark our last move in green
    if (this.renderer) {
      this.renderer.clearOpponentHighlight();
    }
    this.stopTimer();

    const result = this.game.makeMove(x, y, z, this.game.currentTime);

    if (!result.success) {
      this.ui.showStatus(result.error || 'Invalid move!', 'error');
      return;
    }

    if (this.renderer) {
      this.renderer.highlightSelfCell(x, y, z);
      this.renderer.updateMarkers();
    }

    if (result.winner) {
      if (result.winLine) {
        this.renderer.drawWinLine(result.winLine);
        this.renderer.highlightWinningCells(result.winLine);
      }
      this.onGameEnd(result.winner);
      
      if (!this.isAIGame) {
        await this.appwrite.updateGame(
          this.game.board,
          this.game.currentPlayer,
          this.game.currentTime,
          this.game.winner
        );
      }
      return;
    }

    if (this.isAIGame) {
      // AI's turn
      this.ui.updateCurrentPlayer(this.game.currentPlayer, false, true);
      
      setTimeout(async () => {
        const aiMove = await this.makeAIMove();
        if (aiMove && aiMove.winner) {
          if (aiMove.winLine) {
            this.renderer.drawWinLine(aiMove.winLine);
            this.renderer.highlightWinningCells(aiMove.winLine);
          }
          this.onGameEnd(aiMove.winner);
        } else {
          this.ui.updateCurrentPlayer(this.game.currentPlayer, true, true);
        }
      }, 500);
    } else if (this.isLocalGame) {
      // Local multiplayer: just update current player UI, no timers
      this.ui.updateCurrentPlayer(this.game.currentPlayer, true, false);
    } else {
      await this.appwrite.updateGame(
        this.game.board,
        this.game.currentPlayer,
        this.game.currentTime
      );
      this.startTimer();
    }
  }
  
  startTimer() {
    this.stopTimer();
    if (this.isAIGame || this.isLocalGame) return; // No timer for single-player or local multiplayer
    this.timeLeft = (this.game?.mode === 'time') ? 60 : 30;
    this.updateTimerDisplay();
    
    const timerEl = document.getElementById('headerTimer');
    timerEl.classList.remove('hidden');
    
    this.turnTimer = setInterval(() => {
      this.timeLeft--;
      this.updateTimerDisplay();
      
      if (this.timeLeft <= 0) {
        this.handleTimeout();
      }
    }, 1000);
  }
  
  stopTimer() {
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }
    const timerEl = document.getElementById('headerTimer');
    timerEl.classList.add('hidden');
  }
  
  updateTimerDisplay() {
    const display = document.getElementById('headerTimerDisplay');
    display.textContent = this.timeLeft;
    
    if (this.timeLeft <= 5) {
      display.classList.add('warning');
    } else {
      display.classList.remove('warning');
    }
  }
  
  async handleTimeout() {
    this.stopTimer();
    this.hideConfirmation();
    
    // Current player loses due to timeout
    const winner = this.game.currentPlayer === 'X' ? 'O' : 'X';
    this.game.winner = winner;
    this.game.gameOver = true;
    
    if (!this.isAIGame) {
      await this.appwrite.updateGame(
        this.game.board,
        this.game.currentPlayer,
        this.game.currentTime,
        winner
      );
    }
    
    this.showToast('Time expired! You lose.', 'error');
    this.onGameEnd(winner);
  }

  async makeAIMove() {
    const move = this.aiPlayer.makeMove(this.game);
    if (!move) return null;

    const [x, y, z, t] = move;
    const result = this.game.makeMove(x, y, z, t);
    
    if (this.game.mode === 'time' && typeof t === 'number') {
      const prev = this.game.currentTime;
      this.game.currentTime = t;
      this.ui.updateTimeDisplay(t);
      const prevBtn = document.getElementById('prevTime');
      const nextBtn = document.getElementById('nextTime');
      if (prevBtn) prevBtn.disabled = t === 0;
      if (nextBtn) nextBtn.disabled = t === this.game.timeSlices - 1;
      if (this.renderer) this.renderer.animateTimeCarousel(t - prev);
    }
    if (this.renderer) {
      this.renderer.highlightOpponentCell(x, y, z);
      this.renderer.updateMarkers();
    }
    
    return result;
  }

  changeTime(direction) {
    if (!this.game) return;

    const newTime = this.game.currentTime + direction;
    if (newTime >= 0 && newTime < this.game.timeSlices) {
      this.game.currentTime = newTime;
      if (this.renderer) this.renderer.animateTimeCarousel(direction);
      this.ui.updateTimeDisplay(newTime);
      
      const prevBtn = document.getElementById('prevTime');
      const nextBtn = document.getElementById('nextTime');
      if (prevBtn) prevBtn.disabled = newTime === 0;
      if (nextBtn) nextBtn.disabled = newTime === this.game.timeSlices - 1;
    }
  }

  updateUI(gameDoc) {
    const isMyTurn = this.appwrite.isMyTurn(gameDoc);
    this.ui.updateCurrentPlayer(gameDoc.currentPlayer, isMyTurn, false);
    
    if (this.game.mode === 'time') {
      this.ui.updateTimeDisplay(this.game.currentTime);
    }
    
    // Start timer on player's turn, stop on opponent's turn
    if (isMyTurn) {
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  onGameEnd(winner) {
    this.stopTimer();
    this.hideHeaderLeaveBtn();
    this.hideViewOnlyBar();
    // Compute and draw win visuals if available (multiplayer path)
    try {
      if (winner && winner !== 'draw' && this.game && this.renderer) {
        const res = this.game.checkWin?.();
        if (res && res.winner && Array.isArray(res.line)) {
          this.renderer.drawWinLine(res.line);
          this.renderer.highlightWinningCells(res.line);
        }
      }
    } catch {}
    const scenarioText = this.getWinScenarioText(winner);
    setTimeout(() => {
      this.ui.showGameOver(winner, this.mySymbol, scenarioText);
      // Update Play Again button label based on mode
      const playBtn = document.getElementById('playAgain');
      if (playBtn) {
        if (this.isAIGame || this.isLocalGame) playBtn.textContent = 'Play Again';
        else playBtn.textContent = 'Ready';
      }
    }, 1000);
  }

  getWinScenarioText(winner) {
    try {
      if (!this.game || !winner || winner === 'draw') return null;
      const res = this.game.checkWin?.();
      const line = res?.line;
      if (!Array.isArray(line) || line.length < 2) return `${winner} wins!`;
      const p0 = line[0];
      const p1 = line[1];
      const dx = (p1[0] - p0[0]) || 0;
      const dy = (p1[1] - p0[1]) || 0;
      const dz = (p1[2] - p0[2]) || 0;
      const dt = (p1[3] - p0[3]) || 0;
      const spatial = Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0;
      if (dt !== 0 && !spatial) return `${winner} wins across time!`;
      if (dt !== 0 && spatial) return `${winner} wins across space and time!`;
      return `${winner} wins in space!`;
    } catch {
      return `${winner} wins!`;
    }
  }

  backToBoard() {
    // Hide game over overlay but keep board visible for free viewing
    const overlay = document.getElementById('gameOver');
    if (overlay) overlay.classList.add('hidden');
    // Re-show leave button so player can exit
    this.showHeaderLeaveBtn();
    // Show view-only restart bar with appropriate label
    const bar = document.getElementById('viewOnlyBar');
    const btn = document.getElementById('restartFromView');
    if (bar && btn) {
      btn.textContent = (this.isAIGame || this.isLocalGame) ? 'Play Again' : 'Ready';
      bar.classList.remove('hidden');
    }
    // Ensure win visuals persist
    try {
      if (this.game?.winner && this.game.winner !== 'draw' && this.renderer) {
        const res = this.game.checkWin?.();
        if (res && res.winner && Array.isArray(res.line)) {
          this.renderer.drawWinLine(res.line);
          this.renderer.highlightWinningCells(res.line);
        }
      }
    } catch {}
  }

  hideViewOnlyBar() {
    const bar = document.getElementById('viewOnlyBar');
    if (bar) bar.classList.add('hidden');
  }

  showHeaderLeaveBtn() {
    const leaveBtn = document.getElementById('headerLeaveBtn');
    leaveBtn.classList.remove('hidden');
  }
  
  hideHeaderLeaveBtn() {
    const leaveBtn = document.getElementById('headerLeaveBtn');
    leaveBtn.classList.add('hidden');
  }

  async leaveGame() {
    const wasAI = this.isAIGame;
    const wasLocal = this.isLocalGame;
    if (!wasAI && !wasLocal && this.appwrite.currentGameId) {
      const gameDoc = await this.appwrite.getGame(this.appwrite.currentGameId);
      if (gameDoc.status === 'waiting') {
        await this.appwrite.deleteGame(this.appwrite.currentGameId);
      }
    }
    
    this.cleanup();
    
    // Navigate based on game mode
    if (wasAI || wasLocal) {
      // Single player - go to landing page
      this.showAuth();
    } else {
      // Multiplayer - go back to lobby
      this.showLobby();
    }
  }

  async cancelRoom() {
    if (this.appwrite.currentGameId) {
      try {
        const gameDoc = await this.appwrite.getGame(this.appwrite.currentGameId);
        if (gameDoc.status === 'waiting') {
          await this.appwrite.deleteGame(this.appwrite.currentGameId);
        }
      } catch {}
    }
    this.appwrite.reset();
    this.ui.showLobby();
    this.refreshLobbyList();
  }

  playAgain() {
    // Single/local: restart same mode immediately
    if (this.isAIGame) {
      const gm = this.currentGameMode;
      const dif = this.aiDifficulty;
      this.cleanup();
      this.gameMode = 'single';
      this.aiDifficulty = dif;
      this.currentGameMode = gm;
      this.startSinglePlayerGame();
      return;
    }
    if (this.isLocalGame) {
      const gm = this.currentGameMode;
      this.cleanup();
      this.gameMode = 'local';
      this.currentGameMode = gm;
      this.startLocalMultiplayerGame();
      return;
    }

    // Multiplayer: mark ready for rematch and return to room
    (async () => {
      try {
        await this.appwrite.resetForRematch(this.currentGameMode);
      } catch (e) {
        this.showToast('Failed to set ready for rematch', 'error');
      }
      // Tear down renderer only, keep subscription
      if (this.renderer) {
        this.renderer.destroy();
        this.renderer = null;
      }
      this.game = null;
      // Show waiting room again
      const roomCode = this.appwrite.currentGameId;
      const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      this.ui.showRoom(roomCode, roomLink);
      try {
        const gameDoc = await this.appwrite.getGame(roomCode);
        this.updateRoomUI(gameDoc);
      } catch {}
    })();
  }

  mainMenuFromGameOver() {
    this.cleanup();
    this.showMainMenu();
  }

  cleanup() {
    this.stopTimer();
    this.hideConfirmation();
    this.hideHeaderLeaveBtn();
    
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    
    if (!this.isAIGame) {
      this.appwrite.unsubscribeFromGame();
    }
    
    this.game = null;
    this.mySymbol = null;
    this.aiPlayer = null;
    this.isAIGame = false;
    this.isLocalGame = false;
    this.prevBoard = null;
  }

  updateRoomUI(gameDoc) {
    // Toggle Start button for host when player2 present and status is 'ready'
    const startBtn = document.getElementById('startGame');
    const waiting = document.querySelector('#room .loading');
    const player1NameEl = document.getElementById('player1Name');
    const player2NameEl = document.getElementById('player2Name');
    
    const isHost = this.appwrite.playerId === gameDoc.player1;
    const hasGuest = !!gameDoc.player2;
    
    // Update player names
    if (player1NameEl) {
      player1NameEl.textContent = gameDoc.player1Name || 'Host';
      player1NameEl.style.color = 'var(--text-bright)';
    }
    if (player2NameEl) {
      if (hasGuest) {
        player2NameEl.textContent = gameDoc.player2Name || 'Guest';
        player2NameEl.style.color = 'var(--text-bright)';
      } else {
        player2NameEl.textContent = 'Waiting for opponent...';
        player2NameEl.style.color = 'var(--text-dim)';
      }
    }
    
    if (waiting) {
      const roomName = gameDoc.roomName ? ` in "${gameDoc.roomName}"` : '';
      if (hasGuest) {
        waiting.textContent = isHost 
          ? `${gameDoc.player2Name || 'Opponent'} joined. Ready to start!` 
          : 'Waiting for host to start...';
      } else {
        waiting.textContent = `Waiting for opponent${roomName}...`;
      }
    }
    if (startBtn) {
      if (isHost && hasGuest && gameDoc.status === 'ready') {
        startBtn.classList.remove('hidden');
      } else {
        startBtn.classList.add('hidden');
      }
    }
  }

  findLastMove(prevBoard, newBoard) {
    try {
      if (!prevBoard || !newBoard || newBoard.length === 0) return null;
      const timeSlices = newBoard.length;
      for (let t = 0; t < timeSlices; t++) {
        const gridSize = newBoard[t].length;
        for (let z = 0; z < gridSize; z++) {
          for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
              const before = (((prevBoard||[])[t]||[])[z]||[])[y]?.[x] ?? null;
              const after = newBoard[t][z][y][x];
              if ((before === null || before === undefined) && (after === 'X' || after === 'O')) {
                return { x, y, z, t, val: after };
              }
            }
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

// Initialize app
new App();
