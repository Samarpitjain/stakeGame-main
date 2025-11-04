// Configuration
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:5000/api';
const USER_ID = 'demo-user-' + Math.random().toString(36).substr(2, 9);

// State
const STATE = {
  balance: 1000,
  bet: 10,
  mines: 3,
  gridSize: 25,
  clientSeed: 'default-client-seed',
  serverSeed: '',
  serverSeedHash: '',
  nonce: 0,
  roundActive: false,
  opened: new Set(),
  minePositions: new Set(),
  multiplier: 1,
  currentGameId: null,
  profit: 0,
  autoMode: false,
  selectedTiles: new Set(),
  recentGames: [],
  showAllGames: false
};

const AUTO = {
  running: false,
  totalBets: 0,
  currentBet: 0,
  betAmount: 10,
  baseBet: 10,
  mines: 3,
  selectedTiles: [],
  onWin: 'reset',
  onWinPercent: 0,
  onLoss: 'reset',
  onLossPercent: 0,
  stopOnProfit: null,
  stopOnLoss: null,
  totalProfit: 0,
  roundsPlayed: 0,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  bestWinStreak: 0,
  bestLossStreak: 0,
  streakType: null
};

const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

const formatCurrency = (amount) => `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const apiCall = async (endpoint, method = 'GET', body = null) => {
  try {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'API request failed');
    return data;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
};

const initializeUser = async () => {
  try {
    const userData = await apiCall(`/users/${USER_ID}`);
    STATE.balance = userData.balance;
    const seedData = await apiCall(`/games/seeds/${USER_ID}`);
    STATE.serverSeed = seedData.serverSeed || generateServerSeed();
    STATE.serverSeedHash = seedData.serverSeedHash;
    STATE.clientSeed = seedData.clientSeed;
    STATE.nonce = seedData.nonce;
    updateUI();
    showToast('Welcome! Balance loaded.', 'success');
  } catch (error) {
    STATE.serverSeed = generateServerSeed();
    STATE.serverSeedHash = await sha256Sync(STATE.serverSeed);
    updateUI();
  }
};

function generateServerSeed() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Sync(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function createPRNG(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let z = t;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount) {
  const seedStr = `${serverSeed}:${clientSeed}:${nonce}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash = hash & hash;
  }
  
  const prng = createPRNG(Math.abs(hash));
  const arr = Array.from({ length: gridSize }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, minesCount).sort((a, b) => a - b);
}

function calculateMultiplier(revealedCount, gridSize, minesCount) {
  const total = gridSize;
  const mines = minesCount;
  let multiplier = 1;
  
  for (let i = 0; i < revealedCount; i++) {
    const remainingCells = total - i;
    const remainingSafe = (total - mines) - i;
    if (remainingSafe <= 0) break;
    
    const riskStep = 0.5;
    const baseMines = 1;
    const riskBonus = Math.max(0, 1 + riskStep * (mines - baseMines));
    const step = (remainingCells / remainingSafe) * riskBonus;
    multiplier *= step;
  }
  
  return multiplier;
}

const createGameBoard = () => {
  const board = $('gameBoard');
  board.innerHTML = '';
  for (let i = 0; i < STATE.gridSize; i++) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.index = i;
    
    if (STATE.autoMode && STATE.selectedTiles.has(i) && !STATE.roundActive) {
      tile.classList.add('selected');
    }
    
    tile.addEventListener('click', () => {
      if (STATE.autoMode && !STATE.roundActive) {
        toggleTileSelection(i, tile);
      } else if (STATE.roundActive) {
        handleTileClick(i, tile);
      }
    });
    
    
    board.appendChild(tile);
  }
};


const toggleTileSelection = (index, tile) => {
  if (STATE.selectedTiles.has(index)) {
    STATE.selectedTiles.delete(index);
    tile.classList.remove('selected');
  } else {
    STATE.selectedTiles.add(index);
    tile.classList.add('selected');
  }
  updateSelectedCount();
};


const updateSelectedCount = () => {
  if ($('selectedCount')) {
    $('selectedCount').textContent = STATE.selectedTiles.size;
  }
};

const clearSelection = () => {
  STATE.selectedTiles.clear();
  $$('.tile').forEach(tile => tile.classList.remove('selected'));
  updateSelectedCount();
};

const startGame = async () => {
  const betInput = $('betAmount');
  STATE.bet = Math.max(1, parseFloat(betInput.value) || 10);
  STATE.mines = parseInt($('minesSlider').value) || 3;
  
  if (STATE.bet > STATE.balance) {
    showToast('Insufficient balance!', 'error');
    return false;
  }
  
  STATE.balance -= STATE.bet;
  STATE.nonce += 1;
  STATE.roundActive = true;
  STATE.opened = new Set();
  STATE.minePositions = new Set(generateMinePositions(STATE.serverSeed, STATE.clientSeed, STATE.nonce, STATE.gridSize, STATE.mines));
  STATE.multiplier = 1;
  STATE.profit = 0;
  
  if (!AUTO.running) {
    createGameBoard();
  }
  
  updateUI();
  updateFairnessPanel();
  
  if (!AUTO.running) {
    showToast('Game started!', 'success');
  }
  
  return true;
};


const handleTileClick = async (index, tile) => {
  if (!STATE.roundActive || tile.classList.contains('revealed')) return;
  
  const isMine = STATE.minePositions.has(index);
  
  if (isMine) {
    playSound('bombSound');
    revealTile(tile, true);
    STATE.profit = -STATE.bet;
    
    revealAllTiles();
    
    endGame(false);
    addToRecentGames(false, STATE.profit);
    
    if (!AUTO.running) {
      showToast(`💥 Mine hit! Lost ${formatCurrency(STATE.bet)}`, 'error');
    }
  } else {
    playSound('clickSound');
    revealTile(tile, false);
    STATE.opened.add(index);
    STATE.multiplier = calculateMultiplier(STATE.opened.size, STATE.gridSize, STATE.mines);
    STATE.profit = (STATE.bet * STATE.multiplier) - STATE.bet;
    updateUI();
    
    if (AUTO.running && STATE.opened.size >= AUTO.selectedTiles.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
      await cashout();
    }
  }
};


const revealTile = (tile, isMine) => {
  tile.classList.add('revealed');
  tile.classList.remove('selected');
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
      const isMine = STATE.minePositions.has(index);
      setTimeout(() => revealTile(tile, isMine), index * 30);
    }
  });
};


const cashout = async () => {
  if (!STATE.roundActive || STATE.opened.size === 0) return;
  
  const payout = STATE.bet * STATE.multiplier;
  STATE.profit = payout - STATE.bet;
  STATE.balance += payout;
  
  revealAllTiles();
  
  endGame(true);
  addToRecentGames(true, STATE.profit);
  
  if (!AUTO.running) {
    showToast(`💰 Cashed out! Won ${formatCurrency(STATE.profit)}`, 'success');
  }
};


const endGame = (won) => {
  STATE.roundActive = false;
  updateUI();
  updateFairnessPanel();
  
  if (AUTO.running) {
    setTimeout(() => {
      resetBoardForAuto();
      handleAutoResult(won);
    }, 2000);
  }
};


const resetBoardForAuto = () => {
  const tiles = $$('.tile');
  tiles.forEach((tile, index) => {
    tile.classList.remove('revealed', 'mine', 'safe');
    tile.innerHTML = '';
    tile.disabled = false;
    
    if (STATE.selectedTiles.has(index)) {
      tile.classList.add('selected');
    }
  });
};


const startAuto = () => {
  if (STATE.selectedTiles.size === 0) {
    showToast('Please select tiles first!', 'error');
    return;
  }
  
  AUTO.totalBets = Math.max(1, parseInt($('autoRounds').value) || 10);
  AUTO.betAmount = parseFloat($('autoBetAmount').value) || 10;
  AUTO.baseBet = AUTO.betAmount;
  AUTO.mines = parseInt($('autoMinesSlider').value) || 3;
  AUTO.selectedTiles = Array.from(STATE.selectedTiles);
  
  AUTO.onWin = $('onWinAction').value;
  AUTO.onWinPercent = parseFloat($('onWinPercent').value) || 0;
  AUTO.onLoss = $('onLossAction').value;
  AUTO.onLossPercent = parseFloat($('onLossPercent').value) || 0;
  
  const profitInput = $('stopOnProfit').value;
  const lossInput = $('stopOnLoss').value;
  AUTO.stopOnProfit = profitInput ? parseFloat(profitInput) : null;
  AUTO.stopOnLoss = lossInput ? parseFloat(lossInput) : null;
  
  AUTO.currentBet = 0;
  AUTO.totalProfit = 0;
  AUTO.roundsPlayed = 0;
  AUTO.wins = 0;
  AUTO.losses = 0;
  AUTO.currentStreak = 0;
  AUTO.bestWinStreak = 0;
  AUTO.bestLossStreak = 0;
  AUTO.streakType = null;
  AUTO.running = true;
  
  lockAutoInputs(true);
  updateAutoStats();
  showToast('Auto mode started', 'info');
  
  autoLoop();
};

const autoLoop = async () => {
  if (!AUTO.running) return;
  
  if (AUTO.currentBet >= AUTO.totalBets) {
    stopAuto(true);
    return;
  }
  
  if (AUTO.stopOnProfit && AUTO.totalProfit >= AUTO.stopOnProfit) {
    showToast(`✓ Profit target reached: ${formatCurrency(AUTO.totalProfit)}`, 'success');
    stopAuto(true);
    return;
  }
  
  if (AUTO.stopOnLoss && AUTO.totalProfit <= -Math.abs(AUTO.stopOnLoss)) {
    showToast(`✗ Loss limit reached: ${formatCurrency(AUTO.totalProfit)}`, 'error');
    stopAuto(true);
    return;
  }
  
  if (AUTO.betAmount > STATE.balance) {
    showToast('Insufficient balance for next bet', 'error');
    stopAuto(true);
    return;
  }
  
  $('betAmount').value = AUTO.betAmount.toFixed(2);
  $('minesSlider').value = AUTO.mines;
  
  const started = await startGame();
  if (!started) {
    stopAuto(false);
    return;
  }
  
  await new Promise(resolve => setTimeout(resolve, 300));
  
  if (AUTO.running && STATE.roundActive) {
    await autoPlayTiles();
  }
};

const autoPlayTiles = async () => {
  if (!AUTO.running || !STATE.roundActive) return;
  
  const tiles = $$('.tile');
  
  for (let i = 0; i < AUTO.selectedTiles.length && AUTO.running && STATE.roundActive; i++) {
    const tileIndex = AUTO.selectedTiles[i];
    const tile = tiles[tileIndex];
    
    if (tile && !tile.classList.contains('revealed')) {
      await handleTileClick(tileIndex, tile);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    if (!STATE.roundActive) break;
  }
};

const handleAutoResult = (won) => {
  AUTO.currentBet++;
  AUTO.roundsPlayed++;
  AUTO.totalProfit += STATE.profit;
  
  if (won) {
    AUTO.wins++;
    
    if (AUTO.streakType === 'win') {
      AUTO.currentStreak++;
    } else {
      AUTO.currentStreak = 1;
      AUTO.streakType = 'win';
    }
    
    if (AUTO.currentStreak > AUTO.bestWinStreak) {
      AUTO.bestWinStreak = AUTO.currentStreak;
    }
    
    if (AUTO.onWin === 'increase') {
      AUTO.betAmount = AUTO.betAmount * (1 + AUTO.onWinPercent / 100);
    } else {
      AUTO.betAmount = AUTO.baseBet;
    }
  } else {
    AUTO.losses++;
    
    if (AUTO.streakType === 'loss') {
      AUTO.currentStreak++;
    } else {
      AUTO.currentStreak = 1;
      AUTO.streakType = 'loss';
    }
    
    if (AUTO.currentStreak > AUTO.bestLossStreak) {
      AUTO.bestLossStreak = AUTO.currentStreak;
    }
    
    if (AUTO.onLoss === 'increase') {
      AUTO.betAmount = AUTO.betAmount * (1 + AUTO.onLossPercent / 100);
    } else {
      AUTO.betAmount = AUTO.baseBet;
    }
  }
  
  updateAutoStats();
  
  setTimeout(() => {
    if (AUTO.running) autoLoop();
  }, 800);
};

const stopAuto = (showSummary = false) => {
  AUTO.running = false;
  lockAutoInputs(false);
  updateAutoStats();
  updateUI();
  
  if (showSummary && AUTO.roundsPlayed > 0) {
    showAutoSummary();
  } else {
    showToast('Auto mode stopped', 'info');
  }
};

const lockAutoInputs = (lock) => {
  const inputs = ['autoBetAmount', 'autoRounds', 'autoMinesSlider', 
                  'onWinAction', 'onWinPercent', 'onLossAction', 'onLossPercent', 
                  'stopOnProfit', 'stopOnLoss'];
  inputs.forEach(id => {
    const el = $(id);
    if (el) el.disabled = lock;
  });
  
  $$('.tile').forEach(tile => {
    if (lock) {
      tile.style.pointerEvents = STATE.roundActive ? 'auto' : 'none';
    } else {
      tile.style.pointerEvents = 'auto';
    }
  });
};

const updateAutoStats = () => {
  const profitColor = AUTO.totalProfit >= 0 ? '#00e701' : '#ff4545';
  
  $('autoStatus').innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <div>Rounds: ${AUTO.roundsPlayed} / ${AUTO.totalBets}</div>
      <div style="color: ${profitColor}; font-weight: 700;">
        P/L: ${formatCurrency(AUTO.totalProfit)}
      </div>
      <div style="font-size: 11px; color: #7a8599;">
        W: ${AUTO.wins} | L: ${AUTO.losses}
      </div>
    </div>
  `;
};

const showAutoSummary = () => {
  const modal = document.createElement('div');
  modal.className = 'auto-summary-modal';
  modal.innerHTML = `
    <div class="auto-summary-content">
      <div class="summary-header">
        <h2>🎯 Auto Bet Summary</h2>
        <button class="close-summary-btn">✕</button>
      </div>
      <div class="summary-body">
        <div class="summary-stat">
          <span class="stat-label">Total Rounds</span>
          <span class="stat-value">${AUTO.roundsPlayed}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Total Profit/Loss</span>
          <span class="stat-value ${AUTO.totalProfit >= 0 ? 'profit' : 'loss'}">
            ${AUTO.totalProfit >= 0 ? '+' : ''}${formatCurrency(AUTO.totalProfit)}
          </span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Wins / Losses</span>
          <span class="stat-value">${AUTO.wins} / ${AUTO.losses}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Win Rate</span>
          <span class="stat-value">${((AUTO.wins / AUTO.roundsPlayed) * 100).toFixed(1)}%</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Best Win Streak</span>
          <span class="stat-value profit">${AUTO.bestWinStreak}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Best Loss Streak</span>
          <span class="stat-value loss">${AUTO.bestLossStreak}</span>
        </div>
      </div>
      <button class="action-button start-button close-summary-action">
        <span class="btn-text">Close</span>
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const closeModal = () => {
    modal.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => modal.remove(), 300);
  };
  
  modal.querySelector('.close-summary-btn').addEventListener('click', closeModal);
  modal.querySelector('.close-summary-action').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
};

const toggleFairnessPanel = () => {
  const panel = $('fairnessPanel');
  panel.classList.toggle('open');
  updateFairnessPanel();
};

const updateFairnessPanel = () => {
  if ($('activeSeedHash')) {
    $('activeSeedHash').textContent = STATE.serverSeedHash.substring(0, 32) + '...';
  }
  if ($('activeClientSeed')) {
    $('activeClientSeed').value = STATE.clientSeed;
  }
  if ($('activeNonce')) {
    $('activeNonce').textContent = STATE.nonce;
  }
};

const rotateSeedPair = async () => {
  try {
    const newClientSeed = $('activeClientSeed').value || 'default-client-seed';
    const result = await apiCall(`/games/seeds/${USER_ID}/rotate`, 'POST', { clientSeed: newClientSeed });
    
    showToast(`Old Server Seed: ${result.oldServerSeed.substring(0, 16)}...`, 'info');
    STATE.serverSeed = generateServerSeed();
    STATE.serverSeedHash = result.newServerSeedHash;
    STATE.clientSeed = result.clientSeed;
    STATE.nonce = result.nonce;
    updateFairnessPanel();
    showToast('Seed pair rotated!', 'success');
  } catch (error) {
    STATE.serverSeed = generateServerSeed();
    STATE.serverSeedHash = await sha256Sync(STATE.serverSeed);
    STATE.clientSeed = $('activeClientSeed').value || 'default-client-seed';
    STATE.nonce = 0;
    updateFairnessPanel();
    showToast('Seed pair rotated (offline mode)!', 'success');
  }
};

const verifyFairness = async () => {
  const serverSeed = $('verifyServerSeed').value;
  const clientSeed = $('verifyClientSeed').value;
  const nonce = parseInt($('verifyNonce').value);
  const mines = parseInt($('verifyMines').value);
  
  if (!serverSeed || !clientSeed || isNaN(nonce) || isNaN(mines)) {
    showToast('Please fill all fields', 'error');
    return;
  }
  
  const hash = await sha256Sync(serverSeed);
  const minePositions = generateMinePositions(serverSeed, clientSeed, nonce, 25, mines);
  
  $('verifyResult').innerHTML = `
    <div class="verify-result">
      <p><strong>Server Seed Hash:</strong> ${hash}</p>
      <p><strong>Mine Positions:</strong> ${minePositions.join(', ')}</p>
      <p class="success">✓ Verification Complete</p>
    </div>
  `;
};

const updateUI = () => {
  $('balanceDisplay').textContent = formatCurrency(STATE.balance);
  $('profitDisplay').textContent = formatCurrency(STATE.profit);
  $('multiplierDisplay').textContent = `${STATE.multiplier.toFixed(2)}x`;
  
  const safeCount = STATE.gridSize - STATE.mines;
  $('gemsRevealedDisplay').textContent = `${STATE.opened.size} / ${safeCount}`;
  
  $('minesDisplay').textContent = STATE.mines;
  $('gemsCount').textContent = STATE.gridSize - STATE.mines;
  $('minesCount').textContent = STATE.mines;
  
  if ($('autoMinesDisplay')) {
    const autoMines = parseInt($('autoMinesSlider').value) || 3;
    $('autoMinesDisplay').textContent = autoMines;
  }
  
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
  
  $('betAmount').disabled = STATE.roundActive || AUTO.running;
  $('minesSlider').disabled = STATE.roundActive || AUTO.running;
};

const addToRecentGames = (isWin, profit) => {
  STATE.recentGames.unshift({
    isWin,
    profit,
    mines: STATE.mines,
    timestamp: Date.now()
  });
  
  renderRecentGames();
};

const renderRecentGames = () => {
  const container = $('recentGames');
  container.innerHTML = '';
  
  if (STATE.recentGames.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎮</span>
        <span>Play your first game!</span>
      </div>
    `;
    return;
  }
  
  const gamesToShow = STATE.showAllGames ? STATE.recentGames : STATE.recentGames.slice(0, 3);
  
  gamesToShow.forEach(game => {
    const item = document.createElement('div');
    item.className = 'recent-game-item';
    item.innerHTML = `
      <span>${game.isWin ? '💎' : '💣'} ${game.mines} mines</span>
      <span class="game-result ${game.isWin ? 'win' : 'loss'}">
        ${game.profit >= 0 ? '+' : ''}${formatCurrency(game.profit)}
      </span>
    `;
    container.appendChild(item);
  });
  
  if (STATE.recentGames.length > 3) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'view-all-btn';
    toggleBtn.textContent = STATE.showAllGames ? 'Show Less' : `View All (${STATE.recentGames.length})`;
    toggleBtn.addEventListener('click', () => {
      STATE.showAllGames = !STATE.showAllGames;
      renderRecentGames();
    });
    container.appendChild(toggleBtn);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  createGameBoard();
  updateUI();
  updateSelectedCount();
  renderRecentGames();
  initializeUser();
  
  $$('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const mode = tab.dataset.mode;
      STATE.autoMode = mode === 'auto';
      
      if (mode === 'manual') {
        $('manual-controls').classList.remove('hidden');
        $('auto-controls').classList.add('hidden');
        clearSelection();
      } else {
        $('manual-controls').classList.add('hidden');
        $('auto-controls').classList.remove('hidden');
      }
      
      createGameBoard();
    });
  });
  
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
  
  $('minesSlider').addEventListener('input', (e) => {
    STATE.mines = parseInt(e.target.value);
    updateUI();
  });
  
  $('autoMinesSlider')?.addEventListener('input', (e) => {
    const mines = parseInt(e.target.value);
    $('autoMinesDisplay').textContent = mines;
  });
  
  $('startBtn').addEventListener('click', startGame);
  $('cashoutBtn').addEventListener('click', cashout);
  $('autoStartBtn')?.addEventListener('click', startAuto);
  $('autoStopBtn')?.addEventListener('click', () => stopAuto(false));
  $('clearSelectionBtn')?.addEventListener('click', clearSelection);
  
  $('addFundsBtn').addEventListener('click', async () => {
    try {
      const result = await apiCall(`/users/${USER_ID}/add-funds`, 'POST', { amount: 1000 });
      STATE.balance = result.balance;
      updateUI();
      showToast('Added ₹1,000 to balance', 'success');
    } catch (error) {
      STATE.balance += 1000;
      updateUI();
      showToast('Added ₹1,000 to balance (offline)', 'success');
    }
  });
  
  $('fairnessBtn')?.addEventListener('click', toggleFairnessPanel);
  $('closeFairnessBtn')?.addEventListener('click', toggleFairnessPanel);
  $('rotateSeedBtn')?.addEventListener('click', rotateSeedPair);
  $('verifyBtn')?.addEventListener('click', verifyFairness);
  
  $$('.advanced-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const content = toggle.nextElementSibling;
      content.classList.toggle('open');
      toggle.classList.toggle('open');
    });
  });
  
  $$('.action-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const percentInput = e.target.parentElement.querySelector('.percent-input');
      if (percentInput) {
        percentInput.style.display = e.target.value === 'increase' ? 'flex' : 'none';
      }
    });
  });
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !STATE.roundActive && !AUTO.running && !STATE.autoMode) {
    e.preventDefault();
    startGame();
  }
  if (e.code === 'Enter' && STATE.roundActive && STATE.opened.size > 0) {
    e.preventDefault();
    cashout();
  }
});

