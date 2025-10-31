export class UI {
  constructor() {
    this.elements = {
      auth: document.getElementById('auth'),
      mainMenu: document.getElementById('mainMenu'),
      modeSelect: document.getElementById('modeSelect'),
      aiDifficulty: document.getElementById('aiDifficulty'),
      lobby: document.getElementById('lobby'),
      room: document.getElementById('room'),
      game: document.getElementById('game'),
      gameOver: document.getElementById('gameOver'),
      currentPlayerDisplay: document.getElementById('currentPlayerDisplay'),
      gameModeDisplay: document.getElementById('gameModeDisplay'),
      timeControls: document.getElementById('timeControls'),
      timeDisplay: document.getElementById('timeDisplay'),
      status: document.getElementById('status'),
      winnerText: document.getElementById('winnerText'),
      canvasContainer: document.getElementById('canvas-container'),
      userDisplay: document.getElementById('userDisplay'),
      lobbyList: document.getElementById('lobbyList')
    };
  }

  showAuth() {
    this.hideAll();
    this.elements.auth.classList.remove('hidden');
  }

  showMainMenu(userName) {
    // Repurposed: show landing page instead of removed main menu
    this.hideAll();
    this.elements.auth.classList.remove('hidden');
    if (this.elements.userDisplay && userName) {
      this.elements.userDisplay.textContent = `👤 ${userName}`;
    }
  }

  showModeSelect() {
    this.hideAll();
    this.elements.modeSelect.classList.remove('hidden');
  }

  showAIDifficulty() {
    this.hideAll();
    this.elements.aiDifficulty.classList.remove('hidden');
  }

  showLobby() {
    this.hideAll();
    this.elements.lobby.classList.remove('hidden');
  }

  showRoom(roomCode, roomLink) {
    this.hideAll();
    if (this.elements.room) {
      this.elements.room.classList.remove('hidden');
      const codeInput = document.getElementById('roomCode');
      const linkInput = document.getElementById('roomLink');
      if (codeInput) codeInput.value = roomCode || '';
      if (linkInput) linkInput.value = roomLink || '';
    }
  }

  showGame(gameMode) {
    this.hideAll();
    this.elements.game.classList.remove('hidden');
    
    const modeText = gameMode === 'time' ? '⏰ Fight Across Time Mode' : '🎯 Normal 3D Mode';
    this.elements.gameModeDisplay.textContent = modeText;
    
    if (gameMode === 'time') {
      this.elements.timeControls.classList.remove('hidden');
    } else {
      this.elements.timeControls.classList.add('hidden');
    }
  }


  showGameOver(winner, mySymbol, scenarioText) {
    this.elements.gameOver.classList.remove('hidden');
    
    if (winner === 'draw') {
      this.elements.winnerText.textContent = "🤝 It's a Draw!";
    } else if (scenarioText) {
      this.elements.winnerText.textContent = scenarioText;
    } else if (winner === mySymbol) {
      this.elements.winnerText.textContent = "🎉 You Win!";
    } else {
      this.elements.winnerText.textContent = "😢 You Lose!";
    }
  }

  hideAll() {
    // Hide only screen-level elements, not child elements like canvas
    const screensToHide = [
      'auth', 'mainMenu', 'modeSelect', 'aiDifficulty', 
      'lobby', 'room', 'game', 'gameOver'
    ];
    
    screensToHide.forEach(key => {
      const el = this.elements[key];
      if (el && el.classList) {
        el.classList.add('hidden');
      }
    });
  }

  updateCurrentPlayer(player, isMyTurn, isAI = false) {
    let turnText = '';
    if (isAI) {
      turnText = player === 'O' ? ' (AI thinking...)' : ' (Your turn)';
    } else {
      turnText = isMyTurn ? ' (Your turn)' : ' (Opponent\'s turn)';
    }
    this.elements.currentPlayerDisplay.innerHTML = 
      `Current Player: <strong>${player}</strong>${turnText}`;
  }

  updateTimeDisplay(currentTime) {
    const timeNames = ['Past (T1)', 'Present (T2)', 'Future (T3)'];
    this.elements.timeDisplay.textContent = timeNames[currentTime];
  }

  showStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status status-${type}`;
    
    setTimeout(() => {
      this.elements.status.textContent = '';
      this.elements.status.className = 'status';
    }, 3000);
  }

  getCanvasContainer() {
    return this.elements.canvasContainer;
  }

  updateLobbyList(lobbies, onJoinCallback) {
    if (!this.elements.lobbyList) return;
    
    this.elements.lobbyList.innerHTML = '';
    
    if (lobbies.length === 0) {
      this.elements.lobbyList.innerHTML = '<p class="no-lobbies">No lobbies available. Creating new game...</p>';
      return;
    }
    
    lobbies.forEach(lobby => {
      const lobbyItem = document.createElement('div');
      lobbyItem.className = 'lobby-item';
      const roomName = lobby.roomName ? `<div class="lobby-room-name">🏠 ${lobby.roomName}</div>` : '';
      const passwordIcon = lobby.hasPassword ? '🔒 ' : '';
      lobbyItem.innerHTML = `
        <div class="lobby-info">
          ${roomName}
          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <span class="lobby-host">👤 Created by: ${lobby.host?.name || 'Player'}</span>
            <span class="lobby-mode">${passwordIcon}${lobby.gameMode === 'time' ? '⏰ Time' : '🎯 Normal'}</span>
          </div>
        </div>
        <button class="btn btn-primary btn-small" data-lobby-id="${lobby.id}">Join</button>
      `;
      
      lobbyItem.querySelector('button').addEventListener('click', () => {
        onJoinCallback(lobby.id);
      });
      
      this.elements.lobbyList.appendChild(lobbyItem);
    });
  }

  updateTimeButtons(currentTime, maxTime) {
    this.buttons.prevTime.disabled = currentTime === 0;
    this.buttons.nextTime.disabled = currentTime === maxTime - 1;
  }
}
