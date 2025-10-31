import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { AppwriteService } from './appwrite.js';
import { UI } from './ui.js';

class App {
  constructor() {
    this.game = null;
    this.renderer = null;
    this.appwrite = new AppwriteService();
    this.ui = new UI();
    this.mySymbol = null;
    this.currentGameMode = null;

    this.setupEventListeners();
    this.ui.showMenu();
  }

  setupEventListeners() {
    this.ui.onModeSelect((mode) => this.startGame(mode));
    this.ui.onTimeChange((direction) => this.changeTime(direction));
    this.ui.onLeaveGame(() => this.leaveGame());
    this.ui.onCancelWait(() => this.cancelWaiting());
    this.ui.onPlayAgain(() => this.playAgain());
  }

  async startGame(mode) {
    try {
      this.currentGameMode = mode;
      this.ui.showWaiting();

      // Find or create game
      const gameDoc = await this.appwrite.findAvailableGame(mode);
      
      // Determine player symbol
      this.mySymbol = this.appwrite.getPlayerSymbol(gameDoc);

      // Subscribe to game updates
      this.appwrite.subscribeToGame(gameDoc.$id, (payload) => {
        this.onGameUpdate(payload);
      });

      // If game is already playing (we joined an existing game)
      if (gameDoc.status === 'playing') {
        this.initializeGame(gameDoc);
      }
    } catch (error) {
      console.error('Failed to start game:', error);
      this.ui.showStatus('Failed to start game. Please try again.', 'error');
      this.ui.showMenu();
    }
  }

  initializeGame(gameDoc) {
    // Create game instance
    this.game = new Game(gameDoc.gameMode);
    
    // Load board state if exists
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
    this.game.currentTime = gameDoc.currentTime;

    // Show game UI
    this.ui.showGame(gameDoc.gameMode);

    // Create renderer
    const container = this.ui.getCanvasContainer();
    this.renderer = new Renderer(container, this.game, (x, y, z) => {
      this.onCellClick(x, y, z);
    });

    // Update UI
    this.updateUI(gameDoc);
  }

  onGameUpdate(gameDoc) {
    // If game just started
    if (gameDoc.status === 'playing' && !this.game) {
      this.initializeGame(gameDoc);
      return;
    }

    if (!this.game) return;

    // Update game state
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
    this.game.currentTime = gameDoc.currentTime;

    // Check for winner
    if (gameDoc.winner) {
      this.game.winner = gameDoc.winner;
      this.game.gameOver = true;
      this.onGameEnd(gameDoc.winner);
      return;
    }

    // Update renderer
    if (this.renderer) {
      this.renderer.updateMarkers();
    }

    // Update UI
    this.updateUI(gameDoc);
  }

  async onCellClick(x, y, z) {
    if (!this.game || this.game.gameOver) return;

    // Get current game state
    const gameDoc = await this.appwrite.getGame(this.appwrite.currentGameId);
    
    // Check if it's my turn
    if (!this.appwrite.isMyTurn(gameDoc)) {
      this.ui.showStatus("It's not your turn!", 'warning');
      return;
    }

    // Make move
    const result = this.game.makeMove(x, y, z, this.game.currentTime);

    if (!result.success) {
      this.ui.showStatus('Invalid move!', 'error');
      return;
    }

    // Update renderer
    this.renderer.updateMarkers();

    // Update game in database
    await this.appwrite.updateGame(
      this.game.board,
      this.game.currentPlayer,
      this.game.currentTime,
      this.game.winner
    );

    // Check for win
    if (result.winner) {
      if (result.winLine) {
        this.renderer.drawWinLine(result.winLine);
      }
      this.onGameEnd(result.winner);
    }
  }

  changeTime(direction) {
    if (!this.game) return;

    const newTime = this.game.currentTime + direction;
    if (newTime >= 0 && newTime < this.game.timeSlices) {
      this.game.currentTime = newTime;
      this.renderer.createGrid();
      this.ui.updateTimeDisplay(newTime);
      this.ui.updateTimeButtons(newTime, this.game.timeSlices);
    }
  }

  updateUI(gameDoc) {
    const isMyTurn = this.appwrite.isMyTurn(gameDoc);
    this.ui.updateCurrentPlayer(gameDoc.currentPlayer, isMyTurn);
    
    if (this.game.mode === 'time') {
      this.ui.updateTimeDisplay(this.game.currentTime);
      this.ui.updateTimeButtons(this.game.currentTime, this.game.timeSlices);
    }
  }

  onGameEnd(winner) {
    setTimeout(() => {
      this.ui.showGameOver(winner, this.mySymbol);
    }, 1000);
  }

  async leaveGame() {
    if (this.appwrite.currentGameId) {
      // Clean up game if no one has joined yet
      const gameDoc = await this.appwrite.getGame(this.appwrite.currentGameId);
      if (gameDoc.status === 'waiting') {
        await this.appwrite.deleteGame(this.appwrite.currentGameId);
      }
    }
    
    this.cleanup();
    this.ui.showMenu();
  }

  async cancelWaiting() {
    if (this.appwrite.currentGameId) {
      await this.appwrite.deleteGame(this.appwrite.currentGameId);
    }
    
    this.cleanup();
    this.ui.showMenu();
  }

  playAgain() {
    this.cleanup();
    this.ui.showMenu();
  }

  cleanup() {
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    
    this.appwrite.unsubscribeFromGame();
    this.game = null;
    this.mySymbol = null;
    this.currentGameMode = null;
  }
}

// Initialize app
new App();
