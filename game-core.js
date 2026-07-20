const ROWS = 6;
const COLS = 7;

const themes = [
  { name: 'Classic', pageA:'#071426', pageB:'#16365f', panel:'rgba(255,255,255,.10)', text:'#f7fbff', muted:'#b9c9dc', board:'#1467d9', edge:'#0a3d8e', slot:'#071426', p1:'#ffcf33', p1e:'#a87600', p2:'#ff4d5f', p2e:'#8d1520', accent:'#69b7ff' },
  { name: 'Neon Arcade', pageA:'#080015', pageB:'#251047', panel:'rgba(20,5,40,.67)', text:'#fff7ff', muted:'#d3b8e5', board:'#7829d8', edge:'#351072', slot:'#07000d', p1:'#2df7d0', p1e:'#008f7b', p2:'#ff3fb4', p2e:'#911264', accent:'#ffe35b' },
  { name: 'Sunset', pageA:'#32102a', pageB:'#ed6a4a', panel:'rgba(68,15,45,.30)', text:'#fff9f3', muted:'#ffe1cf', board:'#7c2e63', edge:'#43163d', slot:'#2c1028', p1:'#ffd166', p1e:'#ac7111', p2:'#ff6b6b', p2e:'#9c2832', accent:'#f8c4a4' },
  { name: 'Ocean', pageA:'#001f2d', pageB:'#087e8b', panel:'rgba(0,45,61,.45)', text:'#ecffff', muted:'#b7e7e8', board:'#00a6a6', edge:'#005f73', slot:'#002b36', p1:'#f4d35e', p1e:'#9c7710', p2:'#ee964b', p2e:'#a24f13', accent:'#9fffcf' },
  { name: 'Forest', pageA:'#0e241c', pageB:'#416b3d', panel:'rgba(9,35,23,.45)', text:'#f4ffef', muted:'#cee2c4', board:'#648b3d', edge:'#2d4a25', slot:'#10241a', p1:'#f3c969', p1e:'#96701a', p2:'#d95d39', p2e:'#7f2e1d', accent:'#b8df81' },
  { name: 'Candy', pageA:'#531c5d', pageB:'#f48fb1', panel:'rgba(96,26,103,.28)', text:'#fff9ff', muted:'#f4d7ef', board:'#7b61ff', edge:'#4932a5', slot:'#32143e', p1:'#7fffd4', p1e:'#2b9d7f', p2:'#ff9ff3', p2e:'#a8499f', accent:'#fff28a' },
  { name: 'Monochrome', pageA:'#090909', pageB:'#4b4b4b', panel:'rgba(255,255,255,.08)', text:'#ffffff', muted:'#c7c7c7', board:'#686868', edge:'#2c2c2c', slot:'#0d0d0d', p1:'#f5f5f5', p1e:'#a5a5a5', p2:'#242424', p2e:'#000000', accent:'#d8d8d8' },
  { name: 'Royal', pageA:'#17082c', pageB:'#4d1f78', panel:'rgba(45,18,72,.55)', text:'#fff8e8', muted:'#dac9e8', board:'#5f3dc4', edge:'#2f1a72', slot:'#160923', p1:'#ffd43b', p1e:'#9b7100', p2:'#e64980', p2e:'#86143f', accent:'#e7c6ff' },
  { name: 'Desert', pageA:'#432818', pageB:'#b56b3d', panel:'rgba(68,35,18,.38)', text:'#fff5df', muted:'#ead0b0', board:'#c07a3d', edge:'#6d3d22', slot:'#402417', p1:'#f2cc8f', p1e:'#9b6d2c', p2:'#3d5a80', p2e:'#1d3557', accent:'#e9b872' },
  { name: 'Space', pageA:'#020617', pageB:'#19204d', panel:'rgba(7,13,36,.62)', text:'#f5f3ff', muted:'#babada', board:'#253c78', edge:'#101c45', slot:'#02040c', p1:'#c4ff4d', p1e:'#648d08', p2:'#9d7bff', p2e:'#4d2fa8', accent:'#52d3ff' }
];

let board = emptyBoard();
let currentPlayer = 1;
let gameOver = false;
let winningCells = [];
let history = [];
let mode = 'local';
let onlineRole = null;
let connected = false;
let themeIndex = Number(localStorage.getItem('connect4-theme') || 0);

const $ = id => document.getElementById(id);
const boardEl = $('board');
const statusText = $('statusText');
const statusNote = $('statusNote');
const turnDisc = $('turnDisc');
const toastEl = $('toast');

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function buildUI() {
  for (let c = 0; c < COLS; c += 1) {
    const btn = document.createElement('button');
    btn.className = 'col-btn';
    btn.textContent = '▼';
    btn.setAttribute('aria-label', `Drop in column ${c + 1}`);
    btn.addEventListener('click', () => handleColumn(c));
    $('columnControls').appendChild(btn);
  }

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.type = 'button';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
      cell.innerHTML = '<span class="piece"></span>';
      cell.addEventListener('click', () => handleColumn(c));
      boardEl.appendChild(cell);
    }
  }

  themes.forEach((theme, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = theme.name;
    $('themeSelect').appendChild(option);

    const swatch = document.createElement('button');
    swatch.className = 'swatch';
    swatch.title = theme.name;
    swatch.setAttribute('aria-label', `Use ${theme.name} theme`);
    swatch.style.setProperty('--sw-board', theme.board);
    swatch.style.setProperty('--sw-p1', theme.p1);
    swatch.style.setProperty('--sw-p2', theme.p2);
    swatch.innerHTML = `<span>${index + 1}</span>`;
    swatch.addEventListener('click', () => applyTheme(index, true));
    $('themeGrid').appendChild(swatch);
  });

  applyTheme(themeIndex, false);
  render();
}

function applyTheme(index, broadcast = true) {
  themeIndex = Number(index);
  const theme = themes[themeIndex] || themes[0];
  const root = document.documentElement;
  const values = {
    '--page-a': theme.pageA, '--page-b': theme.pageB, '--panel': theme.panel,
    '--text': theme.text, '--muted': theme.muted, '--board': theme.board,
    '--board-edge': theme.edge, '--slot': theme.slot, '--p1': theme.p1,
    '--p1-edge': theme.p1e, '--p2': theme.p2, '--p2-edge': theme.p2e,
    '--accent': theme.accent
  };
  Object.entries(values).forEach(([key, value]) => root.style.setProperty(key, value));
  $('themeSelect').value = themeIndex;
  document.querySelectorAll('.swatch').forEach((swatch, i) => swatch.classList.toggle('selected', i === themeIndex));
  localStorage.setItem('connect4-theme', themeIndex);
  updatePieceLabels();
  if (broadcast && mode === 'online' && onlineRole) onlineSetTheme(themeIndex);
}

function updatePieceLabels() {
  $('player1Role').textContent = `${themes[themeIndex].name} Player 1 pieces`;
  $('player2Role').textContent = `${themes[themeIndex].name} Player 2 pieces`;
}

function handleColumn(col) {
  if (gameOver) return toast('Start a new game to keep playing.');
  if (mode === 'online') {
    if (!onlineRole) return toast('Create or join a room first.');
    if (!connected) return toast('Waiting for Player 2 to join.');
    const myPlayer = onlineRole === 'host' ? 1 : 2;
    if (currentPlayer !== myPlayer) return toast("It is the other player's turn.");
    onlineMove(col);
    return;
  }
  makeLocalMove(col);
}

function makeLocalMove(col) {
  if (!Number.isInteger(col) || col < 0 || col >= COLS || gameOver) return false;
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (board[r][col] === 0) { row = r; break; }
  }
  if (row === -1) {
    toast('That column is full.');
    return false;
  }

  history.push({ row, col, player: currentPlayer });
  board[row][col] = currentPlayer;
  const win = findWin(row, col, currentPlayer);
  if (win) {
    gameOver = true;
    winningCells = win;
  } else if (board.every(rowArr => rowArr.every(Boolean))) {
    gameOver = true;
  } else {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
  }
  render();
  return true;
}

function findWin(row, col, player) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    const cells = [[row, col]];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        cells.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

function syncOnlineState(remote) {
  if (!remote) return;
  board = remote.board.map(row => [...row]);
  currentPlayer = remote.currentPlayer || 1;
  winningCells = Array.isArray(remote.winningCells) ? remote.winningCells : [];
  history = Array.isArray(remote.history) ? remote.history : [];
  gameOver = remote.status === 'finished' || remote.status === 'draw';
  connected = remote.playerCount === 2;
  if (Number.isInteger(remote.themeIndex) && remote.themeIndex !== themeIndex) {
    applyTheme(remote.themeIndex, false);
  }
  render();
}

function render() {
  document.querySelectorAll('.cell').forEach(cell => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const value = board[row][col];
    cell.classList.toggle('filled', value !== 0);
    cell.classList.toggle('p1', value === 1);
    cell.classList.toggle('p2', value === 2);
    cell.classList.toggle('winner', winningCells.some(([winRow, winCol]) => winRow === row && winCol === col));
    cell.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}${value ? `, Player ${value} piece` : ', empty'}`);
  });

  $('player1Card').classList.toggle('active', !gameOver && currentPlayer === 1);
  $('player2Card').classList.toggle('active', !gameOver && currentPlayer === 2);
  turnDisc.style.background = currentPlayer === 1 ? 'var(--p1)' : 'var(--p2)';
  turnDisc.style.borderColor = currentPlayer === 1 ? 'var(--p1-edge)' : 'var(--p2-edge)';

  if (gameOver && winningCells.length) {
    const winner = board[winningCells[0][0]][winningCells[0][1]];
    statusText.textContent = `Player ${winner} wins!`;
    statusNote.textContent = mode === 'online' && winner === (onlineRole === 'host' ? 1 : 2) ? 'You won' : 'Four connected';
  } else if (gameOver) {
    statusText.textContent = 'Draw game';
    statusNote.textContent = 'The board is full';
  } else {
    statusText.textContent = `Player ${currentPlayer}'s turn`;
    if (mode === 'online') {
      const myPlayer = onlineRole === 'host' ? 1 : onlineRole === 'guest' ? 2 : null;
      statusNote.textContent = !onlineRole ? 'Create or join a room' : !connected ? 'Waiting for Player 2' : currentPlayer === myPlayer ? 'Your move' : "Opponent's move";
    } else {
      statusNote.textContent = 'Choose any column';
    }
  }

  $('undoBtn').disabled = history.length === 0 || (mode === 'online' && !connected);
}

function resetLocalBoard() {
  board = emptyBoard();
  currentPlayer = 1;
  gameOver = false;
  winningCells = [];
  history = [];
  render();
}

function newGame(broadcast = true) {
  if (broadcast && mode === 'online' && onlineRole) {
    onlineReset();
    return;
  }
  resetLocalBoard();
}

function undo(broadcast = true) {
  if (broadcast && mode === 'online' && onlineRole) {
    onlineUndo();
    return;
  }
  if (!history.length) return;
  const last = history.pop();
  board[last.row][last.col] = 0;
  currentPlayer = last.player;
  gameOver = false;
  winningCells = [];
  render();
}

function setMode(nextMode) {
  mode = nextMode;
  $('localModeBtn').classList.toggle('active', mode === 'local');
  $('onlineModeBtn').classList.toggle('active', mode === 'online');
  $('onlinePanel').classList.toggle('visible', mode === 'online');
  $('onlineHint').classList.toggle('hidden', mode === 'online');
  if (mode === 'local') {
    $('player1Name').textContent = 'Player 1';
    $('player2Name').textContent = 'Player 2';
    resetLocalBoard();
  } else {
    updateOnlineNames();
    render();
  }
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function setConnectionState(state, message) {
  const dot = $('connectionDot');
  dot.className = `dot ${state || ''}`;
  $('connectionText').textContent = message;
}
