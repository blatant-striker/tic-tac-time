// 4D Tic-Tac-Toe Game Engine
export class Game {
  constructor(mode = 'normal') {
    this.mode = mode; // 'normal' or 'time'
    this.gridSize = 3;
    this.timeSlices = mode === 'time' ? 3 : 1;
    this.currentTime = mode === 'time' ? 1 : 0; // 0=past, 1=present, 2=future
    this.currentPlayer = 'X';
    this.winner = null;
    this.board = this.initBoard();
    this.gameOver = false;
  }

  initBoard() {
    const board = [];
    for (let t = 0; t < this.timeSlices; t++) {
      const timeLayer = [];
      for (let z = 0; z < this.gridSize; z++) {
        const layer = [];
        for (let y = 0; y < this.gridSize; y++) {
          const row = [];
          for (let x = 0; x < this.gridSize; x++) {
            row.push(null);
          }
          layer.push(row);
        }
        timeLayer.push(layer);
      }
      board.push(timeLayer);
    }
    return board;
  }

  makeMove(x, y, z, timeSlice = null) {
    const t = timeSlice !== null ? timeSlice : this.currentTime;
    
    if (this.gameOver) {
      return { success: false, error: 'Game is over' };
    }
    if (t < 0 || t >= this.timeSlices) {
      return { success: false, error: `Invalid time slice: ${t}` };
    }
    if (!this.isValidPosition(x, y, z)) {
      return { success: false, error: `Invalid position: ${x},${y},${z}` };
    }
    if (this.board[t][z][y][x] !== null) {
      return { success: false, error: `Cell already occupied by ${this.board[t][z][y][x]}` };
    }

    this.board[t][z][y][x] = this.currentPlayer;

    // Time travel logic: if changing past, recalculate future
    if (this.mode === 'time' && t < this.currentTime) {
      this.applyTimeParadox(t);
    }

    const winResult = this.checkWin();
    if (winResult.winner) {
      this.winner = winResult.winner;
      this.gameOver = true;
      return { success: true, winner: this.winner, winLine: winResult.line };
    }

    if (this.checkDraw()) {
      this.winner = 'draw';
      this.gameOver = true;
      return { success: true, winner: 'draw' };
    }

    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    return { success: true };
  }

  isValidPosition(x, y, z) {
    return x >= 0 && x < this.gridSize &&
           y >= 0 && y < this.gridSize &&
           z >= 0 && z < this.gridSize;
  }

  applyTimeParadox(changedTime) {
    // Simplified: could add complex ripple effects here
    // For now, we just ensure causality is maintained
  }

  checkWin() {
    const directions = this.generateWinDirections();
    
    for (const dir of directions) {
      const result = this.checkLine(dir);
      if (result.winner) return result;
    }
    
    return { winner: null };
  }

  generateWinDirections() {
    const directions = [];
    const size = this.gridSize;
    const winLength = this.mode === 'time' ? 4 : 3;

    // For normal mode: check all 3D lines
    // For time mode: check all 4D lines
    
    if (this.mode === 'normal') {
      // 3D directions only (single time slice)
      const t = 0;
      
      // Rows (x direction)
      for (let z = 0; z < size; z++) {
        for (let y = 0; y < size; y++) {
          directions.push({
            start: [0, y, z, t],
            step: [1, 0, 0, 0],
            length: 3
          });
        }
      }
      
      // Columns (y direction)
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          directions.push({
            start: [x, 0, z, t],
            step: [0, 1, 0, 0],
            length: 3
          });
        }
      }
      
      // Depth (z direction)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          directions.push({
            start: [x, y, 0, t],
            step: [0, 0, 1, 0],
            length: 3
          });
        }
      }
      
      // 3D diagonals
      this.add3DDiagonals(directions, t);
      
    } else {
      // 4D directions (including time)
      for (let t = 0; t < this.timeSlices; t++) {
        // All 3D directions within each time slice
        this.add3DDirections(directions, t);
      }
      
      // Temporal lines (same position across time)
      for (let z = 0; z < size; z++) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            directions.push({
              start: [x, y, z, 0],
              step: [0, 0, 0, 1],
              length: 3
            });
          }
        }
      }
      
      // 4D diagonals
      this.add4DDiagonals(directions);
    }
    
    return directions;
  }

  add3DDirections(directions, t) {
    const size = this.gridSize;
    
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        directions.push({ start: [0, y, z, t], step: [1, 0, 0, 0], length: 3 });
      }
    }
    
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        directions.push({ start: [x, 0, z, t], step: [0, 1, 0, 0], length: 3 });
      }
    }
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        directions.push({ start: [x, y, 0, t], step: [0, 0, 1, 0], length: 3 });
      }
    }
    
    this.add3DDiagonals(directions, t);
  }

  add3DDiagonals(directions, t) {
    // Face diagonals and space diagonals
    directions.push({ start: [0, 0, 0, t], step: [1, 1, 1, 0], length: 3 });
    directions.push({ start: [2, 0, 0, t], step: [-1, 1, 1, 0], length: 3 });
    directions.push({ start: [0, 2, 0, t], step: [1, -1, 1, 0], length: 3 });
    directions.push({ start: [0, 0, 2, t], step: [1, 1, -1, 0], length: 3 });
    directions.push({ start: [2, 2, 0, t], step: [-1, -1, 1, 0], length: 3 });
    directions.push({ start: [2, 0, 2, t], step: [-1, 1, -1, 0], length: 3 });
    directions.push({ start: [0, 2, 2, t], step: [1, -1, -1, 0], length: 3 });
    directions.push({ start: [2, 2, 2, t], step: [-1, -1, -1, 0], length: 3 });
    
    // XY plane diagonals
    for (let z = 0; z < 3; z++) {
      directions.push({ start: [0, 0, z, t], step: [1, 1, 0, 0], length: 3 });
      directions.push({ start: [2, 0, z, t], step: [-1, 1, 0, 0], length: 3 });
    }
    
    // XZ plane diagonals
    for (let y = 0; y < 3; y++) {
      directions.push({ start: [0, y, 0, t], step: [1, 0, 1, 0], length: 3 });
      directions.push({ start: [2, y, 0, t], step: [-1, 0, 1, 0], length: 3 });
    }
    
    // YZ plane diagonals
    for (let x = 0; x < 3; x++) {
      directions.push({ start: [x, 0, 0, t], step: [0, 1, 1, 0], length: 3 });
      directions.push({ start: [x, 2, 0, t], step: [0, -1, 1, 0], length: 3 });
    }
  }

  add4DDiagonals(directions) {
    // 4D diagonals crossing time and space
    directions.push({ start: [0, 0, 0, 0], step: [1, 1, 1, 1], length: 3 });
    directions.push({ start: [2, 0, 0, 0], step: [-1, 1, 1, 1], length: 3 });
    directions.push({ start: [0, 2, 0, 0], step: [1, -1, 1, 1], length: 3 });
    directions.push({ start: [0, 0, 2, 0], step: [1, 1, -1, 1], length: 3 });
    directions.push({ start: [2, 2, 0, 0], step: [-1, -1, 1, 1], length: 3 });
    directions.push({ start: [2, 0, 2, 0], step: [-1, 1, -1, 1], length: 3 });
    directions.push({ start: [0, 2, 2, 0], step: [1, -1, -1, 1], length: 3 });
    directions.push({ start: [2, 2, 2, 0], step: [-1, -1, -1, 1], length: 3 });
    
    // Mixed temporal-spatial diagonals
    for (let z = 0; z < 3; z++) {
      directions.push({ start: [0, 0, z, 0], step: [1, 1, 0, 1], length: 3 });
      directions.push({ start: [2, 0, z, 0], step: [-1, 1, 0, 1], length: 3 });
    }
    
    for (let y = 0; y < 3; y++) {
      directions.push({ start: [0, y, 0, 0], step: [1, 0, 1, 1], length: 3 });
      directions.push({ start: [2, y, 0, 0], step: [-1, 0, 1, 1], length: 3 });
    }
    
    for (let x = 0; x < 3; x++) {
      directions.push({ start: [x, 0, 0, 0], step: [0, 1, 1, 1], length: 3 });
      directions.push({ start: [x, 2, 0, 0], step: [0, -1, 1, 1], length: 3 });
    }
  }

  checkLine(direction) {
    const { start, step, length } = direction;
    const [startX, startY, startZ, startT] = start;
    const [stepX, stepY, stepZ, stepT] = step;
    
    let firstPlayer = null;
    const line = [];
    
    for (let i = 0; i < length; i++) {
      const x = startX + i * stepX;
      const y = startY + i * stepY;
      const z = startZ + i * stepZ;
      const t = startT + i * stepT;
      
      if (t < 0 || t >= this.timeSlices) return { winner: null };
      if (!this.isValidPosition(x, y, z)) return { winner: null };
      
      const cell = this.board[t][z][y][x];
      
      if (cell === null) return { winner: null };
      if (firstPlayer === null) {
        firstPlayer = cell;
      } else if (cell !== firstPlayer) {
        return { winner: null };
      }
      
      line.push([x, y, z, t]);
    }
    
    return { winner: firstPlayer, line };
  }

  checkDraw() {
    for (let t = 0; t < this.timeSlices; t++) {
      for (let z = 0; z < this.gridSize; z++) {
        for (let y = 0; y < this.gridSize; y++) {
          for (let x = 0; x < this.gridSize; x++) {
            if (this.board[t][z][y][x] === null) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }

  serialize() {
    return JSON.stringify({
      mode: this.mode,
      board: this.board,
      currentPlayer: this.currentPlayer,
      currentTime: this.currentTime,
      winner: this.winner,
      gameOver: this.gameOver
    });
  }

  static deserialize(data) {
    const parsed = JSON.parse(data);
    const game = new Game(parsed.mode);
    game.board = parsed.board;
    game.currentPlayer = parsed.currentPlayer;
    game.currentTime = parsed.currentTime;
    game.winner = parsed.winner;
    game.gameOver = parsed.gameOver;
    return game;
  }
}
