// AI Opponent for Tic-Tac-Time
export class AIPlayer {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty; // 'easy', 'medium', 'hard', 'impossible'
    this.symbol = 'O';
    this.opponentSymbol = 'X';
  }

  makeMove(game) {
    switch (this.difficulty) {
      case 'easy':
        return this.randomMove(game);
      case 'medium':
        return Math.random() < 0.5 ? this.randomMove(game) : this.smartMove(game);
      case 'hard':
        return this.smartMove(game);
      case 'impossible':
        return this.minimaxMove(game);
      default:
        return this.randomMove(game);
    }
  }

  randomMove(game) {
    const availableMoves = this.getAvailableMoves(game);
    if (availableMoves.length === 0) return null;
    
    const move = availableMoves[Math.floor(Math.random() * availableMoves.length)];
    return move;
  }

  smartMove(game) {
    // Try to win first
    const winMove = this.findWinningMove(game, this.symbol);
    if (winMove) return winMove;

    // Block opponent's winning move
    const blockMove = this.findWinningMove(game, this.opponentSymbol);
    if (blockMove) return blockMove;

    // Take center if available
    const centerMove = this.getCenterMove(game);
    if (centerMove) return centerMove;

    // Take corners
    const cornerMove = this.getCornerMove(game);
    if (cornerMove) return cornerMove;

    // Random move as fallback
    return this.randomMove(game);
  }

  minimaxMove(game) {
    // For impossible difficulty, use minimax with alpha-beta pruning
    const depth = game.mode === 'time' ? 3 : 5; // Limit depth for 4D
    let bestScore = -Infinity;
    let bestMove = null;

    const availableMoves = this.getAvailableMoves(game);
    
    for (const move of availableMoves) {
      const [x, y, z, t] = move;
      
      // Try move
      const originalPlayer = game.currentPlayer;
      game.board[t][z][y][x] = this.symbol;
      game.currentPlayer = this.opponentSymbol;

      const score = this.minimax(game, depth - 1, -Infinity, Infinity, false);

      // Undo move
      game.board[t][z][y][x] = null;
      game.currentPlayer = originalPlayer;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove || this.randomMove(game);
  }

  minimax(game, depth, alpha, beta, isMaximizing) {
    // Check terminal state
    const winResult = game.checkWin();
    if (winResult.winner === this.symbol) return 10 + depth;
    if (winResult.winner === this.opponentSymbol) return -10 - depth;
    if (depth === 0 || this.getAvailableMoves(game).length === 0) return 0;

    if (isMaximizing) {
      let maxScore = -Infinity;
      const moves = this.getAvailableMoves(game);
      
      for (const [x, y, z, t] of moves) {
        game.board[t][z][y][x] = this.symbol;
        const score = this.minimax(game, depth - 1, alpha, beta, false);
        game.board[t][z][y][x] = null;
        
        maxScore = Math.max(score, maxScore);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      const moves = this.getAvailableMoves(game);
      
      for (const [x, y, z, t] of moves) {
        game.board[t][z][y][x] = this.opponentSymbol;
        const score = this.minimax(game, depth - 1, alpha, beta, true);
        game.board[t][z][y][x] = null;
        
        minScore = Math.min(score, minScore);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minScore;
    }
  }

  findWinningMove(game, player) {
    const availableMoves = this.getAvailableMoves(game);
    
    for (const [x, y, z, t] of availableMoves) {
      // Try move
      game.board[t][z][y][x] = player;
      const winResult = game.checkWin();
      game.board[t][z][y][x] = null;
      
      if (winResult.winner === player) {
        return [x, y, z, t];
      }
    }
    
    return null;
  }

  getCenterMove(game) {
    const center = Math.floor(game.gridSize / 2);
    const availableMoves = this.getAvailableMoves(game);
    
    // Try center of current time slice
    const centerMove = availableMoves.find(
      ([x, y, z, t]) => x === center && y === center && z === center && t === game.currentTime
    );
    
    return centerMove || null;
  }

  getCornerMove(game) {
    const corners = [
      [0, 0, 0], [0, 0, 2], [0, 2, 0], [0, 2, 2],
      [2, 0, 0], [2, 0, 2], [2, 2, 0], [2, 2, 2]
    ];
    
    const availableMoves = this.getAvailableMoves(game);
    const t = game.currentTime;
    
    for (const [x, y, z] of corners) {
      const move = availableMoves.find(
        ([mx, my, mz, mt]) => mx === x && my === y && mz === z && mt === t
      );
      if (move) return move;
    }
    
    return null;
  }

  getAvailableMoves(game) {
    const moves = [];
    
    for (let t = 0; t < game.timeSlices; t++) {
      for (let z = 0; z < game.gridSize; z++) {
        for (let y = 0; y < game.gridSize; y++) {
          for (let x = 0; x < game.gridSize; x++) {
            if (game.board[t][z][y][x] === null) {
              moves.push([x, y, z, t]);
            }
          }
        }
      }
    }
    
    return moves;
  }
}
