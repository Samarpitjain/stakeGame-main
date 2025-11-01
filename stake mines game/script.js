// ========== Configuration ==========
const API_BASE_URL = window.API_BASE_URL ||'http://localhost:5000/api';
const USER_ID = 'demo-user-' + Math.random().toString(36).substr(2, 9);

// ========== State Management ==========
const STATE = {
  balance: 1000,
  bet: 10,
  mines: 3,
  gridSize: 25,
  clientSeed: 'tukda-bhai',
  nonce: 0,
  roundActive: false,
  opened: new Set(),
  minePositions: new Set(),
  multiplier: 1,
  currentGameId: null,
  serverSeedHash: '',
  profit: 0
};

const AUTO = {
  running: false,
  remaining: 0,
  targetTiles: 3,
  intervalMs: 1500,
  timer: null,
  roundClicks: 0
};

// ========== DOM Elements ==========
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

// ========== Utility Functions ==========
const formatCurrency = (amount) => {
  return `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const showToast = (message, type = 'info') => {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

const playSound = (soundId) => {
  const sound = $(soundId);
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
};

// ========== API Functions ==========
const apiCall = async (endpoint, method = 'GET', body = null) => {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error || 'API request failed');
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    showToast(error.message, 'error');
    throw error;
  }
};

const initializeUser = async () => {
  try {
    const userData = await apiCall(`/users/${USER_ID}`);
    STATE.balance = userData.balance;
    STATE.nonce = userData.gamesPlayed || 0;
    updateUI();
    showToast('Welcome! Balance loaded.', 'success');
  } catch (error) {
    console.error('Failed to initialize user:', error);
  }
};

// ========== Game Functions ==========
const createGameBoard = () => {
  const board = $('gameBoard');
  board.innerHTML = '';
  
  for (let i = 0; i < STATE.gridSize; i++) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.index = i;
    tile.addEventListener('click', () => handleTileClick(i, tile));
    board.appendChild(tile);
  }
};

const startGame = async () => {
  const betInput = $('betAmount');
  const clientSeedInput = $('clientSeed');
  const minesSlider = $('minesSlider');
  
  STATE.bet = Math.max(1, parseFloat(betInput.value) || 10);
  STATE.clientSeed = clientSeedInput.value.trim() || 'default';
  STATE.mines = parseInt(minesSlider.value) || 3;
  
  if (STATE.bet > STATE.balance) {
    showToast('Insufficient balance!', 'error');
    return;
  }
  
  STATE.nonce += 1;
  
  try {
    const gameData = await apiCall('/games/create', 'POST', {
      userId: USER_ID,
      betAmount: STATE.bet,
      minesCount: STATE.mines,
      clientSeed: STATE.clientSeed,
      nonce: STATE.nonce
    });
    
    STATE.currentGameId = gameData.game._id;
    STATE.serverSeedHash = gameData.game.serverSeedHash;
    STATE.balance = gameData.balance;
    STATE.roundActive = true;
    STATE.opened = new Set();
    STATE.minePositions = new Set();
    STATE.multiplier = 1;
    STATE.profit = 0;
    AUTO.roundClicks = 0;
    
    // Reset click handler from previous round
    if ($('serverSeedHash')) {
      $('serverSeedHash').onclick = null; 
    }

    createGameBoard();
    updateUI();
    
    // Display HASH preview
    const hashPreview = STATE.serverSeedHash.substring(0, 16);
    $('serverSeedHash').textContent = hashPreview + '...';
    
    showToast(`Game started! Client seed: "${STATE.clientSeed}"`, 'success');
  } catch (error) {
    console.error('Failed to create game:', error);
    stopAuto();
  }
};

const handleTileClick = async (index, tile) => {
  if (!STATE.roundActive) return;
  if (tile.classList.contains('revealed')) return;
  if (!STATE.currentGameId) return;
  
  try {
    const result = await apiCall(`/games/${STATE.currentGameId}/reveal`, 'POST', {
      tileIndex: index
    });
    
    if (result.isMine) {
      // Hit mine
      playSound('bombSound');
      revealTile(tile, true);
      STATE.balance = result.balance;
      STATE.profit = -STATE.bet;
      
      // Reveal all mines
      if (result.game.minePositions) {
        result.game.minePositions.forEach(pos => {
          STATE.minePositions.add(pos);
        });
        revealAllTiles();
      }
      
      endGame();
      addToRecentGames(false, STATE.profit);
      
      // MODIFICATION: Reveal full server seed on loss and add copy functionality
      if (result.game.serverSeed) {
        const fullSeed = result.game.serverSeed;
        $('serverSeedHash').textContent = fullSeed;
        $('serverSeedHash').onclick = () => {
          navigator.clipboard.writeText(fullSeed)
            .then(() => showToast('Server Seed copied!', 'info'))
            .catch(() => showToast('Failed to copy server seed.', 'error'));
        };
        showToast('Server Seed revealed (click to copy)', 'info');
      }
      
      showToast(`💥 Mine hit! Lost ${formatCurrency(STATE.bet)}`, 'error');
    } else {
      // Safe tile
      playSound('clickSound');
      revealTile(tile, false);
      STATE.opened.add(index);
      STATE.multiplier = result.game.currentMultiplier;
      STATE.profit = (STATE.bet * STATE.multiplier) - STATE.bet;
      updateUI();
      
      if (AUTO.running) {
        AUTO.roundClicks += 1;
        if (AUTO.roundClicks >= AUTO.targetTiles) {
          await cashout();
        }
      }
    }
  } catch (error) {
    console.error('Failed to reveal tile:', error);
  }
};

const revealTile = (tile, isMine) => {
  tile.classList.add('revealed');
  if (isMine) {
    tile.classList.add('mine');
    tile.innerHTML = '<img src="img/bomb.gif" alt="Mine">';
  } else {
    tile.classList.add('safe');
    tile.innerHTML = '<img src="img/diamond.gif" alt="Gem">';
  }
  tile.disabled = true;
};

const revealAllTiles = () => {
  const tiles = $$('.tile');
  tiles.forEach((tile, index) => {
    if (!tile.classList.contains('revealed')) {
      if (STATE.minePositions.has(index)) {
        setTimeout(() => revealTile(tile, true), index * 50);
      } else {
        setTimeout(() => revealTile(tile, false), index * 50);
      }
    }
  });
};

const cashout = async () => {
  if (!STATE.roundActive || STATE.opened.size === 0) return;
  if (!STATE.currentGameId) return;
  
  try {
    const result = await apiCall(`/games/${STATE.currentGameId}/cashout`, 'POST');
    
    STATE.profit = result.game.profit;
    STATE.balance = result.balance;
    
    if (result.game.minePositions) {
      result.game.minePositions.forEach(pos => {
        STATE.minePositions.add(pos);
      });
      revealAllTiles();
    }
    
    endGame();
    addToRecentGames(true, STATE.profit);
    
    // MODIFICATION: Reveal full server seed on cashout and add copy functionality
    if (result.game.serverSeed) {
        const fullSeed = result.game.serverSeed;
        $('serverSeedHash').textContent = fullSeed;
        $('serverSeedHash').onclick = () => {
            navigator.clipboard.writeText(fullSeed)
                .then(() => showToast('Server Seed copied!', 'info'))
                .catch(() => showToast('Failed to copy server seed.', 'error'));
        };
        showToast('Server Seed revealed (click to copy)', 'info');
    }

    showToast(`💰 Cashed out! Won ${formatCurrency(STATE.profit)}`, 'success');
  } catch (error) {
    console.error('Failed to cashout:', error);
  }
};

const endGame = () => {
  STATE.roundActive = false;
  updateUI();
  
  if (AUTO.running) {
    AUTO.remaining = Math.max(0, AUTO.remaining - 1);
    if (AUTO.remaining <= 0) {
      stopAuto();
    }
  }
};

// ========== Auto Play Functions ==========
const startAuto = async () => {
  AUTO.remaining = Math.max(1, parseInt($('autoCount').value) || 10);
  AUTO.targetTiles = Math.max(1, parseInt($('autoTiles').value) || 3);
  
  if (AUTO.running) stopAuto();
  
  AUTO.running = true;
  $('autoStatus').textContent = `Running (${AUTO.remaining} left)`;
  
  showToast('Auto mode started', 'info');
  autoTick();
};

const autoTick = async () => {
  if (!AUTO.running || AUTO.remaining <= 0) {
    stopAuto();
    return;
  }
  
  if (!STATE.roundActive) {
    // Start new game
    const autoBet = parseFloat($('autoBetAmount').value) || 10;
    const autoMines = parseInt($('autoMinesSlider').value) || 3;
    
    $('betAmount').value = autoBet;
    $('minesSlider').value = autoMines;
    
    await startGame();
    
    setTimeout(() => {
      if (AUTO.running) autoPlayTiles();
    }, 500);
  }
};

const autoPlayTiles = async () => {
  if (!AUTO.running || !STATE.roundActive) return;
  
  const availableTiles = [];
  const tiles = $$('.tile');
  
  tiles.forEach((tile, index) => {
    if (!tile.classList.contains('revealed')) {
      availableTiles.push({ tile, index });
    }
  });
  
  if (availableTiles.length === 0) {
    await cashout();
    setTimeout(autoTick, AUTO.intervalMs);
    return;
  }
  
  // Pick random tile
  const random = availableTiles[Math.floor(Math.random() * availableTiles.length)];
  await handleTileClick(random.index, random.tile);
  
  // Continue or cashout
  if (AUTO.running && STATE.roundActive && AUTO.roundClicks < AUTO.targetTiles) {
    setTimeout(autoPlayTiles, 300);
  } else if (AUTO.running && STATE.roundActive) {
    await cashout();
    setTimeout(autoTick, AUTO.intervalMs);
  } else if (!STATE.roundActive) {
    setTimeout(autoTick, AUTO.intervalMs);
  }
};

const stopAuto = () => {
  AUTO.running = false;
  AUTO.remaining = 0;
  if (AUTO.timer) {
    clearInterval(AUTO.timer);
    AUTO.timer = null;
  }
  $('autoStatus').textContent = 'Idle';
  updateUI();
  showToast('Auto mode stopped', 'info');
};

// ========== UI Update Functions ==========
const updateUI = () => {
  // Balance
  $('balanceDisplay').textContent = formatCurrency(STATE.balance);
  
  // Stats
  $('profitDisplay').textContent = formatCurrency(STATE.profit);
  $('multiplierDisplay').textContent = `${STATE.multiplier.toFixed(2)}x`;
  
  const safeCount = STATE.gridSize - STATE.mines;
  $('gemsRevealedDisplay').textContent = `${STATE.opened.size} / ${safeCount}`;
  
  // Mines count
  $('minesDisplay').textContent = STATE.mines;
  $('gemsCount').textContent = STATE.gridSize - STATE.mines;
  $('minesCount').textContent = STATE.mines;
  
  // Auto mode
  if ($('autoMinesDisplay')) {
    const autoMines = parseInt($('autoMinesSlider').value) || 3;
    $('autoMinesDisplay').textContent = autoMines;
  }
  
  // Nonce
  $('nonceDisplay').textContent = STATE.nonce;
  
  // Buttons
  const startBtn = $('startBtn');
  const cashoutBtn = $('cashoutBtn');
  const autoStartBtn = $('autoStartBtn');
  const autoStopBtn = $('autoStopBtn');
  
  if (STATE.roundActive) {
    startBtn.classList.add('hidden');
    cashoutBtn.classList.remove('hidden');
    cashoutBtn.querySelector('.btn-amount').textContent = formatCurrency(STATE.bet * STATE.multiplier);
  } else {
    startBtn.classList.remove('hidden');
    cashoutBtn.classList.add('hidden');
  }
  
  if (AUTO.running) {
    autoStartBtn.classList.add('hidden');
    autoStopBtn.classList.remove('hidden');
  } else {
    autoStartBtn.classList.remove('hidden');
    autoStopBtn.classList.add('hidden');
  }
  
  // Disable controls during active game
  $('betAmount').disabled = STATE.roundActive;
  $('minesSlider').disabled = STATE.roundActive;
  $('clientSeed').disabled = STATE.roundActive;
};

// ========== Recent Games ==========
const addToRecentGames = (isWin, profit) => {
  const container = $('recentGames');
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();
  
  const item = document.createElement('div');
  item.className = 'recent-game-item';
  item.innerHTML = `
    <span>${isWin ? '💎' : '💣'} ${STATE.mines} mines</span>
    <span class="game-result ${isWin ? 'win' : 'loss'}">
      ${profit >= 0 ? '+' : ''}${formatCurrency(profit)}
    </span>
  `;
  
  container.insertBefore(item, container.firstChild);
  
  // Keep only last 10 games
  while (container.children.length > 10) {
    container.removeChild(container.lastChild);
  }
};

// ========== Event Listeners ==========
document.addEventListener('DOMContentLoaded', () => {
  createGameBoard();
  updateUI();
  initializeUser();
  
  // Mode tabs
  $$('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const mode = tab.dataset.mode;
      if (mode === 'manual') {
        $('manual-controls').classList.remove('hidden');
        $('auto-controls').classList.add('hidden');
      } else {
        $('manual-controls').classList.add('hidden');
        $('auto-controls').classList.remove('hidden');
      }
    });
  });
  
  // Bet buttons
  $$('.bet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const input = $('betAmount');
      let value = parseFloat(input.value) || 10;
      
      if (action === 'half') value = Math.max(1, value / 2);
      if (action === 'double') value = value * 2;
      
      input.value = value.toFixed(2);
      STATE.bet = value;
      updateUI();
    });
  });
  
  // Mines slider
  $('minesSlider').addEventListener('input', (e) => {
    STATE.mines = parseInt(e.target.value);
    updateUI();
  });
  
  $('autoMinesSlider')?.addEventListener('input', (e) => {
    const mines = parseInt(e.target.value);
    $('autoMinesDisplay').textContent = mines;
  });
  
  // Buttons
  $('startBtn').addEventListener('click', startGame);
  $('cashoutBtn').addEventListener('click', cashout);
  $('autoStartBtn')?.addEventListener('click', startAuto);
  $('autoStopBtn')?.addEventListener('click', stopAuto);
  
  $('addFundsBtn').addEventListener('click', async () => {
    try {
      const result = await apiCall(`/users/${USER_ID}/add-funds`, 'POST', {
        amount: 1000
      });
      STATE.balance = result.balance;
      updateUI();
      showToast('Added ₹1,000 to balance', 'success');
    } catch (error) {
      console.error('Failed to add funds:', error);
    }
  });
  
  // Client seed change notification
  $('clientSeed').addEventListener('change', (e) => {
    const newSeed = e.target.value.trim();
    if (newSeed) {
      showToast(`Client seed will be: "${newSeed}" (next round)`, 'info');
    }
  });
});

// ========== Keyboard Shortcuts ==========
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !STATE.roundActive) {
    e.preventDefault();
    startGame();
  }
  if (e.code === 'Enter' && STATE.roundActive && STATE.opened.size > 0) {
    e.preventDefault();
    cashout();
  }
});