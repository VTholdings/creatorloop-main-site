/**
 * CreatorLoop™ Tetris Engine
 * Custom HTML5 Canvas-based Tetris game
 * Branded with CreatorLoop color palette
 */

const COLS = 10;
const ROWS = 20;
const BLOCK = 28; // px per block

// CreatorLoop branded piece colors
const PIECE_COLORS = [
  null,
  '#C8A84B', // I — Gold
  '#7B3FE4', // O — Purple
  '#00D4FF', // T — Cyan
  '#E05555', // S — Red
  '#6DC86D', // Z — Green
  '#FF8C42', // J — Orange
  '#E0C060', // L — Gold light
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

class Tetris {
  constructor(canvasId, nextCanvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.nextCanvas = document.getElementById(nextCanvasId);
    this.nextCtx = this.nextCanvas.getContext('2d');

    this.canvas.width = COLS * BLOCK;
    this.canvas.height = ROWS * BLOCK;
    this.nextCanvas.width = 4 * BLOCK;
    this.nextCanvas.height = 4 * BLOCK;

    this.reset();
    this.bindControls();
    this.bindTouch();
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.gameOver = false;
    this.paused = false;
    this.running = false;
    this.dropInterval = 800;
    this.lastDrop = 0;
    this.animId = null;
    this.piece = null;
    this.nextPiece = this.randomPiece();
    this.updateStats();
  }

  randomPiece() {
    const type = Math.floor(Math.random() * 7) + 1;
    return {
      type,
      matrix: PIECES[type].map(row => [...row]),
      x: Math.floor(COLS / 2) - Math.ceil(PIECES[type][0].length / 2),
      y: 0,
    };
  }

  spawnPiece() {
    this.piece = this.nextPiece;
    this.piece.x = Math.floor(COLS / 2) - Math.ceil(this.piece.matrix[0].length / 2);
    this.piece.y = 0;
    this.nextPiece = this.randomPiece();
    this.drawNext();
    if (this.collides(this.piece, 0, 0)) {
      this.endGame();
    }
  }

  collides(piece, dx, dy, matrix) {
    const m = matrix || piece.matrix;
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const nx = piece.x + c + dx;
        const ny = piece.y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && this.board[ny][nx]) return true;
      }
    }
    return false;
  }

  rotate(matrix) {
    const N = matrix.length;
    const M = matrix[0].length;
    const result = Array.from({ length: M }, () => Array(N).fill(0));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < M; c++) {
        result[c][N - 1 - r] = matrix[r][c];
      }
    }
    return result;
  }

  tryRotate() {
    const rotated = this.rotate(this.piece.matrix);
    if (!this.collides(this.piece, 0, 0, rotated)) {
      this.piece.matrix = rotated;
    } else if (!this.collides(this.piece, 1, 0, rotated)) {
      this.piece.x += 1;
      this.piece.matrix = rotated;
    } else if (!this.collides(this.piece, -1, 0, rotated)) {
      this.piece.x -= 1;
      this.piece.matrix = rotated;
    }
  }

  moveLeft()  { if (!this.collides(this.piece, -1, 0)) this.piece.x--; }
  moveRight() { if (!this.collides(this.piece,  1, 0)) this.piece.x++; }

  softDrop() {
    if (!this.collides(this.piece, 0, 1)) {
      this.piece.y++;
      this.score += 1;
    } else {
      this.lock();
    }
    this.updateStats();
  }

  hardDrop() {
    while (!this.collides(this.piece, 0, 1)) {
      this.piece.y++;
      this.score += 2;
    }
    this.lock();
    this.updateStats();
  }

  lock() {
    for (let r = 0; r < this.piece.matrix.length; r++) {
      for (let c = 0; c < this.piece.matrix[r].length; c++) {
        if (!this.piece.matrix[r][c]) continue;
        const y = this.piece.y + r;
        const x = this.piece.x + c;
        if (y >= 0) this.board[y][x] = this.piece.matrix[r][c];
      }
    }
    this.clearLines();
    this.spawnPiece();
  }

  clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(c => c !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800];
      this.score += (points[cleared] || 800) * this.level;
      this.lines += cleared;
      this.level = Math.floor(this.lines / 10) + 1;
      this.dropInterval = Math.max(100, 800 - (this.level - 1) * 70);
      this.updateStats();
    }
  }

  updateStats() {
    const scoreEl = document.getElementById('cl-score');
    const levelEl = document.getElementById('cl-level');
    const linesEl = document.getElementById('cl-lines');
    if (scoreEl) scoreEl.textContent = this.score.toLocaleString();
    if (levelEl) levelEl.textContent = this.level;
    if (linesEl) linesEl.textContent = this.lines;
  }

  drawBlock(ctx, x, y, color, size) {
    const s = size || BLOCK;
    const pad = 1;
    ctx.fillStyle = color;
    ctx.fillRect(x * s + pad, y * s + pad, s - pad * 2, s - pad * 2);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x * s + pad, y * s + pad, s - pad * 2, 3);
    ctx.fillRect(x * s + pad, y * s + pad, 3, s - pad * 2);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x * s + s - pad - 3, y * s + pad, 3, s - pad * 2);
    ctx.fillRect(x * s + pad, y * s + s - pad - 3, s - pad * 2, 3);
  }

  drawBoard() {
    // Background
    this.ctx.fillStyle = '#0D0D0D';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Grid lines
    this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    this.ctx.lineWidth = 0.5;
    for (let r = 0; r < ROWS; r++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, r * BLOCK);
      this.ctx.lineTo(this.canvas.width, r * BLOCK);
      this.ctx.stroke();
    }
    for (let c = 0; c < COLS; c++) {
      this.ctx.beginPath();
      this.ctx.moveTo(c * BLOCK, 0);
      this.ctx.lineTo(c * BLOCK, this.canvas.height);
      this.ctx.stroke();
    }

    // Locked pieces
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.board[r][c]) {
          this.drawBlock(this.ctx, c, r, PIECE_COLORS[this.board[r][c]]);
        }
      }
    }

    // Ghost piece
    if (this.piece) {
      let ghostY = this.piece.y;
      while (!this.collides(this.piece, 0, ghostY - this.piece.y + 1)) ghostY++;
      if (ghostY !== this.piece.y) {
        this.ctx.globalAlpha = 0.2;
        for (let r = 0; r < this.piece.matrix.length; r++) {
          for (let c = 0; c < this.piece.matrix[r].length; c++) {
            if (this.piece.matrix[r][c]) {
              this.drawBlock(this.ctx, this.piece.x + c, ghostY + r, PIECE_COLORS[this.piece.type]);
            }
          }
        }
        this.ctx.globalAlpha = 1;
      }

      // Active piece
      for (let r = 0; r < this.piece.matrix.length; r++) {
        for (let c = 0; c < this.piece.matrix[r].length; c++) {
          if (this.piece.matrix[r][c]) {
            this.drawBlock(this.ctx, this.piece.x + c, this.piece.y + r, PIECE_COLORS[this.piece.type]);
          }
        }
      }
    }
  }

  drawNext() {
    this.nextCtx.fillStyle = '#111111';
    this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    if (!this.nextPiece) return;
    const m = this.nextPiece.matrix;
    const offsetX = Math.floor((4 - m[0].length) / 2);
    const offsetY = Math.floor((4 - m.length) / 2);
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        if (m[r][c]) {
          this.drawBlock(this.nextCtx, offsetX + c, offsetY + r, PIECE_COLORS[this.nextPiece.type]);
        }
      }
    }
  }

  gameLoop(timestamp) {
    if (this.gameOver || this.paused) return;
    if (timestamp - this.lastDrop > this.dropInterval) {
      if (!this.collides(this.piece, 0, 1)) {
        this.piece.y++;
      } else {
        this.lock();
      }
      this.lastDrop = timestamp;
    }
    this.drawBoard();
    this.animId = requestAnimationFrame(ts => this.gameLoop(ts));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.spawnPiece();
    this.drawNext();
    this.lastDrop = performance.now();
    this.animId = requestAnimationFrame(ts => this.gameLoop(ts));

    // Track game start
    if (typeof gtag !== 'undefined') gtag('event', 'game_start', { event_category: 'tetris' });
    const starts = parseInt(localStorage.getItem('cl_game_starts') || '0') + 1;
    localStorage.setItem('cl_game_starts', starts);
  }

  pause() {
    if (!this.running || this.gameOver) return;
    this.paused = !this.paused;
    if (!this.paused) {
      this.lastDrop = performance.now();
      this.animId = requestAnimationFrame(ts => this.gameLoop(ts));
    }
    const pauseBtn = document.getElementById('cl-pause-btn');
    if (pauseBtn) pauseBtn.textContent = this.paused ? 'RESUME' : 'PAUSE';
  }

  endGame() {
    this.gameOver = true;
    this.running = false;
    cancelAnimationFrame(this.animId);

    // Track game end
    const played = parseInt(localStorage.getItem('cl_games_played') || '0') + 1;
    localStorage.setItem('cl_games_played', played);
    const hi = parseInt(localStorage.getItem('cl_high_score') || '0');
    if (this.score > hi) localStorage.setItem('cl_high_score', this.score);

    // Show game over overlay
    const overlay = document.getElementById('cl-game-over');
    const finalScore = document.getElementById('cl-final-score');
    if (overlay) overlay.classList.remove('hidden');
    if (finalScore) finalScore.textContent = this.score.toLocaleString();
  }

  restart() {
    cancelAnimationFrame(this.animId);
    const overlay = document.getElementById('cl-game-over');
    if (overlay) overlay.classList.add('hidden');
    this.reset();
    this.start();
  }

  bindControls() {
    document.addEventListener('keydown', e => {
      if (!this.running || this.gameOver) return;
      switch (e.code) {
        case 'ArrowLeft':  e.preventDefault(); this.moveLeft(); break;
        case 'ArrowRight': e.preventDefault(); this.moveRight(); break;
        case 'ArrowDown':  e.preventDefault(); this.softDrop(); break;
        case 'ArrowUp':    e.preventDefault(); this.tryRotate(); break;
        case 'Space':      e.preventDefault(); this.hardDrop(); break;
        case 'KeyP':       e.preventDefault(); this.pause(); break;
      }
      this.drawBoard();
    });
  }

  bindTouch() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    this.canvas.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchend', e => {
      if (!this.running || this.gameOver) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = Date.now() - touchStartTime;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < 10 && absDy < 10 && dt < 200) {
        this.tryRotate();
      } else if (absDx > absDy) {
        if (dx > 20) this.moveRight();
        else if (dx < -20) this.moveLeft();
      } else {
        if (dy > 20) this.softDrop();
        else if (dy < -30) this.hardDrop();
      }
      this.drawBoard();
      e.preventDefault();
    }, { passive: false });
  }
}

// Initialize on DOM ready
window.clTetris = null;
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('cl-tetris-canvas');
  if (!canvas) return;

  clTetris = new Tetris('cl-tetris-canvas', 'cl-next-canvas');

  const startBtn = document.getElementById('cl-start-btn');
  const startOverlay = document.getElementById('cl-start-overlay');
  const restartBtn = document.getElementById('cl-restart-btn');
  const pauseBtn = document.getElementById('cl-pause-btn');

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (startOverlay) startOverlay.classList.add('hidden');
      clTetris.start();
    });
  }
  if (restartBtn) {
    restartBtn.addEventListener('click', () => clTetris.restart());
  }
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => clTetris.pause());
  }

  // Also allow START THE GAME button on Loop Entrance to scroll to game
  const startGameBtn = document.getElementById('start-game-btn');
  if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      const gameSection = document.getElementById('game-section');
      if (gameSection) gameSection.scrollIntoView({ behavior: 'smooth' });
    });
  }
});
