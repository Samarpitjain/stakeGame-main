// ============================================
// CONFIGURATION
// ============================================
const API_URL = 'https://mine-game-api.onrender.com/api';
const USER_ID = 'user_' + Math.random().toString(36).substr(2, 9);

// ============================================
// GAME STATE
// ============================================
const STATE = {
  balance: 0,
  gameId: null,
  active: false,
  revealed: [],
  mines: 3,
  bet: 10,
  multiplier: 1,
  profit: 0,
  serverSeedHash: '',
  clientSeed: '',
  nonce: 0,
  previousServerSeed: null,
  previousServerSeedHash: null,
  previousClientSeed: null,
  previousNonce: null,
  completedGames: [],
  autoMode: false,
  autoRunning: false,
  autoConfig: {
    baseBet: 10,
    rounds: 10,
    mines: 3,
    selectedTiles: [],
    delay: 500,
    onWin: 'reset',
    onWinPercent: 0,
    onLose: 'reset',
    onLosePercent: 0,
    stopOnProfit: null,
    stopOnLoss: null
  },
  autoStats: {
    currentRound: 0,
    totalProfit: 0,
    wins: 0,
    losses: 0
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
async function api(endpoint, method = 'GET', body = null) {
  console.log(`🌐 API ${method} ${endpoint}`, body);
  
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${API_URL}${endpoint}`, options);
    const data = await res.json();
    console.log(`✅ Response:`, data);
    
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (error) {
    console.error(`❌ Error:`, error);
    throw error;
  }
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function formatCurrency(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Copied to clipboard!', 'success');
  }).catch(() => {
    toast('Failed to copy', 'error');
  });
}

// ============================================
// USER INITIALIZATION
// ============================================
async function initUser() {
  try {
    console.log('🚀 Initializing user:', USER_ID);
    const user = await api(`/users/${USER_ID}`);
    
    STATE.balance = user.balance;
    STATE.serverSeedHash = user.seeds.serverSeedHash;
    STATE.clientSeed = user.seeds.clientSeed;
    STATE.nonce = user.seeds.nonce;
    
    updateUI();
    toast('Welcome! Balance loaded.', 'success');
  } catch (error) {
    toast('Error loading user: ' + error.message, 'error');
  }
}

// ============================================
// GAME BOARD
// ============================================
function createBoard() {
  const board = document.getElementById('gameBoard');
  board.innerHTML = '';
  
  for (let i = 0; i < 25; i++) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.index = i;
    tile.onclick = STATE.autoMode ? () => toggleAutoTileSelection(i) : () => revealTile(i);
    if (STATE.autoMode && STATE.autoConfig.selectedTiles.includes(i)) {
      tile.classList.add('auto-selected');
    }
    board.appendChild(tile);
  }
  
  if (STATE.autoMode) {
    updateSelectedTilesCount();
  }
}

// ============================================
// GAME ACTIONS
// ============================================
async function startGame() {
  try {
    const bet = parseFloat(document.getElementById('betAmount').value);
    const mines = parseInt(document.getElementById('minesSlider').value);
    
    if (bet > STATE.balance) {
      toast('Insufficient balance!', 'error');
      return;
    }

    const result = await api('/games/create', 'POST', {
      userId: USER_ID,
      betAmount: bet,
      minesCount: mines
    });

    STATE.gameId = result.game._id;
    STATE.active = true;
    STATE.revealed = [];
    STATE.bet = bet;
    STATE.mines = mines;
    STATE.multiplier = 1;
    STATE.profit = 0;
    STATE.balance = result.balance;
    STATE.nonce = result.nextNonce;

    createBoard();
    updateUI();
    toast('Game started!', 'success');
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
}

async function revealTile(index) {
  if (!STATE.active || STATE.revealed.includes(index)) return;

  try {
    const result = await api(`/games/${STATE.gameId}/reveal`, 'POST', {
      tileIndex: index
    });

    const tile = document.querySelector(`[data-index="${index}"]`);
    STATE.revealed.push(index);

    if (result.isMine) {
      tile.className = 'tile revealed mine';
      tile.textContent = '💣';
      STATE.active = false;
      STATE.profit = result.game.profit;
      STATE.balance = result.balance;
      
      STATE.completedGames.unshift({
        id: STATE.gameId,
        won: false,
        profit: STATE.profit,
        bet: STATE.bet,
        mines: STATE.mines,
        minePositions: result.game.minePositions
      });
      
      setTimeout(() => {
        result.game.minePositions.forEach(pos => {
          if (pos !== index) {
            const mineTile = document.querySelector(`[data-index="${pos}"]`);
            mineTile.className = 'tile revealed mine';
            mineTile.textContent = '💣';
          }
        });
      }, 500);
      
      toast(`Mine hit! Lost ${formatCurrency(STATE.bet)}`, 'error');
      addToHistory(false, STATE.profit);
    } else {
      tile.className = 'tile revealed gem';
      tile.textContent = '💎';
      STATE.multiplier = result.game.currentMultiplier;
      STATE.profit = result.game.potentialPayout - STATE.bet;
    }

    updateUI();
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
}

async function cashout() {
  if (!STATE.active || STATE.revealed.length === 0) return;

  try {
    const result = await api(`/games/${STATE.gameId}/cashout`, 'POST');
    
    STATE.active = false;
    STATE.balance = result.balance;
    STATE.profit = result.game.profit;

    STATE.completedGames.unshift({
      id: STATE.gameId,
      won: true,
      profit: STATE.profit,
      bet: STATE.bet,
      mines: STATE.mines,
      minePositions: result.game.minePositions
    });

    result.game.minePositions.forEach(pos => {
      const tile = document.querySelector(`[data-index="${pos}"]`);
      if (!STATE.revealed.includes(pos)) {
        tile.className = 'tile revealed mine';
        tile.textContent = '💣';
      }
    });

    toast(`Cashed out! Won ${formatCurrency(STATE.profit)}`, 'success');
    addToHistory(true, STATE.profit);
    updateUI();
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
}

// ============================================
// UI UPDATE
// ============================================
function updateUI() {
  document.getElementById('balance').textContent = formatCurrency(STATE.balance);
  document.getElementById('profit').textContent = formatCurrency(STATE.profit);
  document.getElementById('multiplier').textContent = STATE.multiplier.toFixed(2) + 'x';
  
  const safeCount = 25 - STATE.mines;
  document.getElementById('revealed').textContent = `${STATE.revealed.length} / ${safeCount}`;
  
  document.getElementById('gemsCount').textContent = 25 - STATE.mines;
  if (document.getElementById('autoGemsCount')) {
    document.getElementById('autoGemsCount').textContent = 25 - STATE.mines;
  }
  
  document.getElementById('startBtn').classList.toggle('hidden', STATE.active);
  document.getElementById('cashoutBtn').classList.toggle('hidden', !STATE.active);
  
  if (STATE.active) {
    const payout = STATE.bet * STATE.multiplier;
    document.getElementById('cashoutAmount').textContent = formatCurrency(payout);
  }

  document.getElementById('betAmount').disabled = STATE.active;
  document.getElementById('minesSlider').disabled = STATE.active;
}

const allGames = [];

function addToHistory(won, profit) {
  const gameData = {
    id: STATE.gameId,
    won: won,
    profit: profit,
    bet: STATE.bet,
    mines: STATE.mines,
    revealed: [...STATE.revealed],
    minePositions: STATE.completedGames[0]?.minePositions || [],
    nonce: STATE.nonce - 1,
    clientSeed: STATE.clientSeed,
    serverSeedHash: STATE.serverSeedHash,
    timestamp: new Date().toISOString(),
    mode: STATE.autoMode ? 'Auto' : 'Manual'
  };
  
  allGames.unshift(gameData);
  renderRecentGames();
}

function renderRecentGames(showAll = false) {
  const list = document.getElementById('historyList');
  list.innerHTML = '';
  
  const gamesToShow = showAll ? allGames : allGames.slice(0, 5);
  
  gamesToShow.forEach(gameData => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-header">
        <span class="history-id">#${gameData.id.substring(0, 8)}</span>
        <span class="history-mode">${gameData.mode}</span>
      </div>
      <div class="history-details">
        <div class="history-info">
          <span>₹${gameData.bet}</span>
          <span>•</span>
          <span>${gameData.mines}💣</span>
          <span>•</span>
          <span>N:${gameData.nonce}</span>
        </div>
        <span class="history-result ${gameData.won ? 'win' : 'loss'}">
          ${gameData.profit >= 0 ? '+' : ''}${formatCurrency(gameData.profit)}
        </span>
      </div>
    `;
    item.onclick = () => showRoundDetails(gameData);
    list.appendChild(item);
  });
  
  const btn = document.getElementById('viewAllGamesBtn');
  if (btn) {
    btn.textContent = showAll ? 'Show Less' : `View All Games (${allGames.length})`;
    btn.style.display = allGames.length > 5 ? 'block' : 'none';
  }
}

function showRoundDetails(gameData) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const grid = Array(25).fill(null).map((_, idx) => {
    const isMine = gameData.minePositions?.includes(idx);
    const isRevealed = gameData.revealed.includes(idx);
    const icon = isMine ? '💣' : '💎';
    const tileClass = `round-tile ${isMine ? 'mine' : 'safe'} ${isRevealed ? 'revealed' : ''}`;
    return `<div class="${tileClass}">${icon}</div>`;
  }).join('');
  
  overlay.innerHTML = `
    <div class="round-modal">
      <div class="round-modal-header">
        <h2 class="round-modal-title">Round Details</h2>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      
      <div class="round-grid">${grid}</div>
      
      <div class="round-info-grid">
        <div class="round-info-item">
          <div class="round-info-label">Bet Amount</div>
          <div class="round-info-value">₹${gameData.bet}</div>
        </div>
        <div class="round-info-item">
          <div class="round-info-label">Profit</div>
          <div class="round-info-value" style="color: ${gameData.won ? '#00e701' : '#ef4444'}">
            ${gameData.profit >= 0 ? '+' : ''}₹${gameData.profit.toFixed(2)}
          </div>
        </div>
        <div class="round-info-item">
          <div class="round-info-label">Mines</div>
          <div class="round-info-value">${gameData.mines}</div>
        </div>
        <div class="round-info-item">
          <div class="round-info-label">Revealed</div>
          <div class="round-info-value">${gameData.revealed.length} / ${25 - gameData.mines}</div>
        </div>
        <div class="round-info-item">
          <div class="round-info-label">Mode</div>
          <div class="round-info-value">${gameData.mode}</div>
        </div>
        <div class="round-info-item">
          <div class="round-info-label">Nonce</div>
          <div class="round-info-value">${gameData.nonce}</div>
        </div>
      </div>
      
      <div class="round-seeds">
        <div class="round-seed-item">
          <div class="round-seed-label">Game ID</div>
          <div class="round-seed-value">${gameData.id}</div>
        </div>
        <div class="round-seed-item">
          <div class="round-seed-label">Client Seed</div>
          <div class="round-seed-value">${gameData.clientSeed}</div>
        </div>
        <div class="round-seed-item">
          <div class="round-seed-label">Server Seed Hash</div>
          <div class="round-seed-value">${gameData.serverSeedHash}</div>
        </div>
      </div>
      
      <button class="action-btn start-btn" onclick="this.closest('.modal-overlay').remove()">Close</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

// ============================================
// FAIRNESS MODAL
// ============================================
function showFairnessModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">🔒 Provably Fair</h2>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>

      <div class="tab-nav">
        <button class="tab-btn active" onclick="switchTab(event, 'currentSeeds')">Current Seeds</button>
        <button class="tab-btn" onclick="switchTab(event, 'rotateSeed')">Rotate Seeds</button>
        <button class="tab-btn" onclick="switchTab(event, 'verifyGame')">Verify Game</button>
        <button class="tab-btn" onclick="switchTab(event, 'manualVerify')">Manual Verify</button>
      </div>

      <div id="currentSeeds" class="tab-content active">
        <div class="seed-section">
          <h3>🔒 Current Active Seeds</h3>
          <div class="seed-item">
            <span class="seed-label">Server Seed Hash</span>
            <div class="seed-value hash-value">${STATE.serverSeedHash}</div>
            <button class="copy-btn" onclick="copyToClipboard('${STATE.serverSeedHash}')">📋</button>
          </div>
          <div class="seed-item">
            <span class="seed-label">Client Seed</span>
            <div class="seed-value">${STATE.clientSeed}</div>
            <button class="copy-btn" onclick="copyToClipboard('${STATE.clientSeed}')">📋</button>
          </div>
          <div class="seed-item">
            <span class="seed-label">Current Nonce</span>
            <div class="seed-value">${STATE.nonce}</div>
          </div>
          <div class="info-box">
            ⚠️ Server seed is hidden until rotation. Rotate to reveal it for verification.
          </div>
        </div>
      </div>

      <div id="rotateSeed" class="tab-content">
        <div class="seed-section">
          <h3>🔄 Rotate Seed Pair</h3>
          <p style="color: #94a3b8; margin-bottom: 15px;">
            This will reveal your current server seed and generate a new one.
          </p>
          <div class="seed-item">
            <span class="seed-label">New Client Seed (Optional)</span>
            <input type="text" class="seed-input" id="newClientSeed" placeholder="Leave empty for random">
          </div>
          <button class="action-btn" onclick="rotateSeed()">🔄 Rotate Now</button>
          
          ${STATE.previousServerSeed ? `
            <div class="revealed-seed">
              <div class="revealed-seed-label">🔓 REVEALED Server Seed</div>
              <div class="seed-value hash-value">${STATE.previousServerSeed}</div>
              <button class="copy-btn" onclick="copyToClipboard('${STATE.previousServerSeed}')">📋</button>
              <div style="margin-top: 10px; padding: 10px; background: rgba(0, 231, 1, 0.1); border-left: 3px solid #00e701; font-size: 12px;">
                ✅ Use this unhashed seed to verify past games! Final Nonce: ${STATE.previousNonce}
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <div id="verifyGame" class="tab-content">
        <div class="seed-section">
          <h3>✅ Verify Your Game</h3>
          
          ${STATE.completedGames.length > 0 ? `
            <div class="seed-item">
              <span class="seed-label">Select Game</span>
              <select class="seed-input" id="gameToVerify">
                <option value="">-- Choose a game --</option>
                ${STATE.completedGames.map((game, idx) => `
                  <option value="${game.id}">
                    #${idx + 1} - ${game.won ? '✓ Won' : '✗ Lost'} ${formatCurrency(game.profit)} (${game.mines} mines)
                  </option>
                `).join('')}
              </select>
            </div>
            <button class="action-btn" onclick="verifyGameById()">🔍 Verify</button>
          ` : `
            <div class="info-box">Play and complete games first!</div>
          `}
          
          <div id="gameVerifyResult"></div>
          
          ${!STATE.previousServerSeed ? `
            <div class="warning-box">
              ⚠️ Rotate seeds first to reveal server seed for verification.
            </div>
          ` : ''}
        </div>
      </div>

      <div id="manualVerify" class="tab-content">
        <div class="seed-section">
          <h3>🔍 Manual Verification</h3>
          <div class="seed-item">
            <span class="seed-label">Server Seed (Unhashed)</span>
            <input type="text" class="seed-input" id="verifyServerSeed" placeholder="Paste revealed seed" value="${STATE.previousServerSeed || ''}">
          </div>
          <div class="seed-item">
            <span class="seed-label">Client Seed</span>
            <input type="text" class="seed-input" id="verifyClientSeed" value="${STATE.previousClientSeed || STATE.clientSeed}">
          </div>
          <div class="seed-item">
            <span class="seed-label">Nonce</span>
            <input type="number" class="seed-input" id="verifyNonce" value="0" min="0">
          </div>
          <div class="seed-item">
            <span class="seed-label">Mines Count</span>
            <input type="number" class="seed-input" id="verifyMines" value="${STATE.mines}" min="1" max="24">
          </div>
          <button class="action-btn" onclick="verifyFairness()">✓ Calculate</button>
          <div id="verifyResult"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

function switchTab(event, tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tabName).classList.add('active');
  event.target.classList.add('active');
}

// ============================================
// FAIRNESS FUNCTIONS
// ============================================
async function rotateSeed() {
  try {
    const newClientSeed = document.getElementById('newClientSeed')?.value || '';
    
    const payload = {};
    if (newClientSeed) payload.clientSeed = newClientSeed;
    
    const result = await api(`/games/seeds/${USER_ID}/rotate`, 'POST', payload);

    STATE.previousServerSeed = result.revealed.serverSeed;
    STATE.previousServerSeedHash = result.revealed.serverSeedHash;
    STATE.previousClientSeed = result.revealed.clientSeed;
    STATE.previousNonce = result.revealed.finalNonce;
    
    STATE.serverSeedHash = result.next.serverSeedHash;
    STATE.clientSeed = result.next.clientSeed;
    STATE.nonce = result.next.nonce;

    toast('✅ Seed rotated! Previous seed revealed.', 'success');
    
    document.querySelector('.modal-overlay').remove();
    showFairnessModal();
    setTimeout(() => {
      const rotateTab = Array.from(document.querySelectorAll('.tab-btn'))[1];
      if (rotateTab) rotateTab.click();
    }, 100);
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
}

async function verifyGameById() {
  try {
    const gameId = document.getElementById('gameToVerify').value;
    
    if (!gameId) {
      toast('Please select a game', 'error');
      return;
    }

    const result = await api(`/games/${gameId}/verify`, 'GET');
    
    const resultDiv = document.getElementById('gameVerifyResult');
    
    if (!result.canVerify) {
      resultDiv.innerHTML = `
        <div class="warning-box" style="margin-top: 15px;">
          🔒 ${result.message || 'Rotate seeds first!'}
        </div>
      `;
      return;
    }

    const verified = result.verified && result.hashMatches && result.positionsMatch;

    resultDiv.innerHTML = `
      <div style="margin-top: 15px; padding: 15px; background: ${verified ? 'rgba(0, 231, 1, 0.1)' : 'rgba(255, 71, 87, 0.1)'}; border: 1px solid ${verified ? 'rgba(0, 231, 1, 0.3)' : 'rgba(255, 71, 87, 0.3)'}; border-radius: 8px;">
        <div style="color: ${verified ? '#00e701' : '#ff4757'}; font-weight: 700; margin-bottom: 10px;">
          ${verified ? '✅ VERIFIED - Game is Fair!' : '❌ FAILED - Verification Error'}
        </div>
        <div style="font-size: 12px; color: #94a3b8;">
          Hash Match: ${result.hashMatches ? '✓' : '✗'} | 
          Positions Match: ${result.positionsMatch ? '✓' : '✗'}
        </div>
        <div style="margin-top: 10px; font-size: 11px; color: #94a3b8;">
          Server Seed: <span style="font-family: monospace; color: #e2e8f0;">${result.serverSeed?.substring(0, 20)}...</span><br>
          Mine Positions: <span style="color: #00e701;">${result.minePositions?.join(', ')}</span>
        </div>
      </div>
    `;
    
    toast(verified ? 'Game verified!' : 'Verification failed', verified ? 'success' : 'error');
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
}

async function verifyFairness() {
  try {
    const serverSeed = document.getElementById('verifyServerSeed').value;
    const clientSeed = document.getElementById('verifyClientSeed').value;
    const nonce = parseInt(document.getElementById('verifyNonce').value);
    const mines = parseInt(document.getElementById('verifyMines').value);

    if (!serverSeed || !clientSeed || isNaN(nonce) || isNaN(mines)) {
      toast('Fill all fields!', 'error');
      return;
    }

    const result = await api('/fairness/verify', 'POST', {
      serverSeed,
      clientSeed,
      nonce,
      minesCount: mines
    });

    const resultDiv = document.getElementById('verifyResult');
    
    const grid = Array(25).fill(null).map((_, idx) => {
      const isMine = result.result.minePositions.includes(idx);
      const icon = isMine ? '💣' : '💎';
      const tileClass = `round-tile ${isMine ? 'mine' : 'safe'}`;
      return `<div class="${tileClass}">${icon}</div>`;
    }).join('');
    
    resultDiv.innerHTML = `
      <div style="margin-top: 15px; padding: 15px; background: rgba(0, 231, 1, 0.1); border: 1px solid rgba(0, 231, 1, 0.3); border-radius: 8px;">
        <div style="color: #00e701; font-weight: 700; margin-bottom: 10px;">
          ✅ Verification Complete
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 5px;">
          Server Seed Hash:
        </div>
        <div style="font-family: monospace; font-size: 10px; color: #e2e8f0; word-break: break-all; margin-bottom: 10px;">
          ${result.verification.serverSeedHash}
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 10px;">
          Mine Positions: ${result.result.minePositions.join(', ')}
        </div>
        <div class="round-grid" style="margin-bottom: 10px;">${grid}</div>
        <div style="font-size: 11px; color: #94a3b8;">
          Total Mines: ${mines} | Safe Tiles: ${25 - mines}
        </div>
      </div>
    `;
    
    toast('Verification successful!', 'success');
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
}

// ============================================
// ADD FUNDS
// ============================================
async function addFunds() {
  try {
    const result = await api(`/users/${USER_ID}/add-funds`, 'POST', { amount: 1000 });
    STATE.balance = result.balance;
    updateUI();
    toast('Added ₹1,000', 'success');
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
}

// ============================================
// AUTO BET MODE
// ============================================


function selectAutoTile(index) {
  if (STATE.autoRunning) return;
  const tiles = STATE.autoConfig.selectedTiles;
  const idx = tiles.indexOf(index);
  if (idx > -1) {
    tiles.splice(idx, 1);
  } else {
    tiles.push(index);
  }
}

function updateAutoBoard() {
  // Auto board preview removed from UI
}

async function startAutoBet() {
  const bet = parseFloat(document.getElementById('autoBetAmount').value) || 0;
  const mines = parseInt(document.getElementById('autoMinesSlider')?.value || 3);
  const rounds = parseInt(document.getElementById('autoRounds').value) || 10;
  const selectedTiles = STATE.autoConfig.selectedTiles;
  
  if (selectedTiles.length === 0) {
    toast('Please select tiles on the grid first!', 'error');
    return;
  }
  if (bet > STATE.balance) {
    toast('Insufficient balance!', 'error');
    return;
  }
  
  STATE.autoConfig.baseBet = bet;
  STATE.autoConfig.mines = mines;
  STATE.autoConfig.rounds = rounds;
  STATE.autoConfig.delay = parseInt(document.getElementById('autoDelay')?.value || 500);
  
  // Read advanced settings
  const onWinBtn = document.querySelector('#advancedSettings .button-group:nth-child(1) .group-btn.active');
  const onLoseBtn = document.querySelector('#advancedSettings .button-group:nth-child(3) .group-btn.active');
  
  STATE.autoConfig.onWin = onWinBtn?.dataset.value || 'reset';
  STATE.autoConfig.onLose = onLoseBtn?.dataset.value || 'reset';
  STATE.autoConfig.onWinPercent = parseFloat(document.getElementById('onWinPercent')?.value || 0);
  STATE.autoConfig.onLosePercent = parseFloat(document.getElementById('onLosePercent')?.value || 0);
  STATE.autoConfig.stopOnProfit = parseFloat(document.getElementById('stopProfit')?.value) || null;
  STATE.autoConfig.stopOnLoss = parseFloat(document.getElementById('stopLoss')?.value) || null;
  
  STATE.autoRunning = true;
  STATE.autoStats = { currentRound: 0, totalProfit: 0, wins: 0, losses: 0 };
  STATE.bet = bet;
  
  document.getElementById('startAutoBtn').classList.add('hidden');
  document.getElementById('stopAutoBtn').classList.remove('hidden');
  document.querySelectorAll('#autoMode input, #autoMode select').forEach(el => el.disabled = true);
  
  document.querySelectorAll('.tile').forEach(tile => tile.style.pointerEvents = 'none');
  
  runAutoRound();
}

function stopAutoBet() {
  STATE.autoRunning = false;
  document.getElementById('startAutoBtn').classList.remove('hidden');
  document.getElementById('stopAutoBtn').classList.add('hidden');
  document.querySelectorAll('#autoMode input, #autoMode select').forEach(el => el.disabled = false);
  
  document.querySelectorAll('.tile').forEach(tile => tile.style.pointerEvents = 'auto');
  
  toast(`Auto bet stopped. Total: ${formatCurrency(STATE.autoStats.totalProfit)}`, 'info');
}

async function runAutoRound() {
  if (!STATE.autoRunning) return;
  
  STATE.autoStats.currentRound++;
  
  if (STATE.autoStats.currentRound > STATE.autoConfig.rounds) {
    stopAutoBet();
    toast('Auto bet completed!', 'success');
    return;
  }
  
  if (STATE.autoConfig.stopOnProfit && STATE.autoStats.totalProfit >= STATE.autoConfig.stopOnProfit) {
    stopAutoBet();
    toast('Stop on profit reached!', 'success');
    return;
  }
  
  if (STATE.autoConfig.stopOnLoss && STATE.autoStats.totalProfit <= -STATE.autoConfig.stopOnLoss) {
    stopAutoBet();
    toast('Stop on loss reached!', 'error');
    return;
  }
  
  updateAutoStats();
  
  try {
    const result = await api('/games/create', 'POST', {
      userId: USER_ID,
      betAmount: STATE.bet,
      minesCount: STATE.autoConfig.mines
    });
    
    STATE.gameId = result.game._id;
    STATE.active = true;
    STATE.revealed = [];
    STATE.mines = STATE.autoConfig.mines;
    STATE.multiplier = 1;
    STATE.profit = 0;
    STATE.balance = result.balance;
    STATE.nonce = result.nextNonce;
    
    createBoard();
    updateUI();
    
    // Remove auto-selected visual state during game
    document.querySelectorAll('.tile').forEach(tile => {
      tile.classList.remove('auto-selected');
    });
    
    await new Promise(resolve => setTimeout(resolve, STATE.autoConfig.delay));
    
    let hitMine = false;
    for (const tileIndex of STATE.autoConfig.selectedTiles) {
      if (!STATE.autoRunning) return;
      
      const revealResult = await api(`/games/${STATE.gameId}/reveal`, 'POST', {
        tileIndex
      });
      
      const tile = document.querySelector(`[data-index="${tileIndex}"]`);
      STATE.revealed.push(tileIndex);
      
      if (revealResult.isMine) {
        tile.className = 'tile revealed mine';
        tile.textContent = '💣';
        STATE.active = false;
        STATE.profit = revealResult.game.profit;
        STATE.balance = revealResult.balance;
        hitMine = true;
        
        setTimeout(() => {
          revealResult.game.minePositions.forEach(pos => {
            if (pos !== tileIndex) {
              const mineTile = document.querySelector(`[data-index="${pos}"]`);
              if (mineTile) {
                mineTile.className = 'tile revealed mine';
                mineTile.textContent = '💣';
              }
            }
          });
        }, 200);
        
        STATE.completedGames.unshift({
          id: STATE.gameId,
          won: false,
          profit: STATE.profit,
          bet: STATE.bet,
          mines: STATE.mines,
          minePositions: revealResult.game.minePositions
        });
        
        addToHistory(false, STATE.profit);
        STATE.autoStats.losses++;
        STATE.autoStats.totalProfit += STATE.profit;
        
        if (STATE.autoConfig.onLose === 'increase') {
          STATE.bet = STATE.bet * (1 + STATE.autoConfig.onLosePercent / 100);
        } else {
          STATE.bet = STATE.autoConfig.baseBet;
        }
        
        break;
      } else {
        tile.className = 'tile revealed gem';
        tile.textContent = '💎';
        STATE.multiplier = revealResult.game.currentMultiplier;
        STATE.profit = revealResult.game.potentialPayout - STATE.bet;
      }
      
      updateUI();
      await new Promise(resolve => setTimeout(resolve, STATE.autoConfig.delay / 2));
    }
    
    if (!hitMine && STATE.active) {
      const cashoutResult = await api(`/games/${STATE.gameId}/cashout`, 'POST');
      STATE.active = false;
      STATE.balance = cashoutResult.balance;
      STATE.profit = cashoutResult.game.profit;
      
      cashoutResult.game.minePositions.forEach(pos => {
        const tile = document.querySelector(`[data-index="${pos}"]`);
        if (tile && !STATE.revealed.includes(pos)) {
          tile.className = 'tile revealed mine';
          tile.textContent = '💣';
        }
      });
      
      STATE.completedGames.unshift({
        id: STATE.gameId,
        won: true,
        profit: STATE.profit,
        bet: STATE.bet,
        mines: STATE.mines,
        minePositions: cashoutResult.game.minePositions
      });
      
      addToHistory(true, STATE.profit);
      STATE.autoStats.wins++;
      STATE.autoStats.totalProfit += STATE.profit;
      
      if (STATE.autoConfig.onWin === 'increase') {
        STATE.bet = STATE.bet * (1 + STATE.autoConfig.onWinPercent / 100);
      } else {
        STATE.bet = STATE.autoConfig.baseBet;
      }
    }
    
    updateUI();
    updateAutoStats();
    
    await new Promise(resolve => setTimeout(resolve, STATE.autoConfig.delay));
    
    // Reset board and restore selected tiles for next round
    if (STATE.autoRunning) {
      const tiles = document.querySelectorAll('.tile');
      tiles.forEach((tile, idx) => {
        if (tile.classList.contains('revealed')) {
          tile.classList.add('resetting');
          setTimeout(() => {
            tile.classList.remove('revealed', 'gem', 'mine', 'resetting');
            tile.textContent = '';
            if (STATE.autoConfig.selectedTiles.includes(idx)) {
              tile.classList.add('auto-selected');
            }
          }, 200);
        } else if (STATE.autoConfig.selectedTiles.includes(idx)) {
          tile.classList.add('auto-selected');
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    runAutoRound();
  } catch (error) {
    toast('Error: ' + error.message, 'error');
    stopAutoBet();
  }
}

function updateAutoStats() {
  // Stats display removed from UI - stats tracked internally only
  console.log(`Round ${STATE.autoStats.currentRound}/${STATE.autoConfig.rounds} | Profit: ${formatCurrency(STATE.autoStats.totalProfit)} | W/L: ${STATE.autoStats.wins}/${STATE.autoStats.losses}`);
}

// ============================================
// MODE SWITCHING FUNCTIONS
// ============================================
function switchMode(mode) {
  STATE.autoMode = mode === 'auto';
  document.getElementById('manualMode').classList.toggle('hidden', STATE.autoMode);
  document.getElementById('autoMode').classList.toggle('hidden', !STATE.autoMode);
  document.getElementById('manualTab').classList.toggle('active', !STATE.autoMode);
  document.getElementById('autoTab').classList.toggle('active', STATE.autoMode);
  
  if (STATE.autoMode) {
    resetGridVisuals();
    enableAutoTileSelection();
  } else {
    disableAutoTileSelection();
  }
}

function resetGridVisuals() {
  const tiles = document.querySelectorAll('.tile');
  tiles.forEach(tile => {
    if (tile.classList.contains('revealed')) {
      tile.classList.add('resetting');
      setTimeout(() => {
        tile.classList.remove('revealed', 'gem', 'mine', 'resetting');
        tile.textContent = '';
      }, 200);
    }
  });
}

function enableAutoTileSelection() {
  const tiles = document.querySelectorAll('.tile');
  tiles.forEach((tile, index) => {
    tile.onclick = () => toggleAutoTileSelection(index);
    if (STATE.autoConfig.selectedTiles.includes(index)) {
      tile.classList.add('auto-selected');
    }
  });
  updateSelectedTilesCount();
}

function disableAutoTileSelection() {
  const tiles = document.querySelectorAll('.tile');
  tiles.forEach((tile, index) => {
    tile.classList.remove('auto-selected');
    tile.onclick = () => revealTile(index);
  });
}

function toggleAutoTileSelection(index) {
  if (STATE.autoRunning || STATE.active) return;
  
  const tile = document.querySelector(`[data-index="${index}"]`);
  const selectedTiles = STATE.autoConfig.selectedTiles;
  const idx = selectedTiles.indexOf(index);
  
  if (idx > -1) {
    selectedTiles.splice(idx, 1);
    tile.classList.remove('auto-selected');
  } else {
    selectedTiles.push(index);
    tile.classList.add('auto-selected');
  }
  
  updateSelectedTilesCount();
}

function updateSelectedTilesCount() {
  const count = STATE.autoConfig.selectedTiles.length;
  const countEl = document.getElementById('selectedTilesCount');
  if (countEl) {
    countEl.textContent = `${count} selected`;
    countEl.style.color = count > 0 ? '#00e701' : '#7a8a9e';
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.getElementById('startBtn').onclick = startGame;
document.getElementById('cashoutBtn').onclick = cashout;
document.getElementById('fairnessBtn').onclick = showFairnessModal;
document.getElementById('addFundsBtn').onclick = addFunds;
document.getElementById('manualTab').onclick = () => switchMode('manual');
document.getElementById('autoTab').onclick = () => switchMode('auto');
if (document.getElementById('startAutoBtn')) {
  document.getElementById('startAutoBtn').onclick = startAutoBet;
}
if (document.getElementById('stopAutoBtn')) {
  document.getElementById('stopAutoBtn').onclick = stopAutoBet;
}

document.getElementById('minesSlider').onchange = (e) => {
  STATE.mines = parseInt(e.target.value);
  updateUI();
};

setTimeout(() => {
  if (document.getElementById('autoMinesSlider')) {
    document.getElementById('autoMinesSlider').onchange = (e) => {
      const mines = parseInt(e.target.value);
      STATE.autoConfig.mines = mines;
      if (document.getElementById('autoGemsCount')) {
        document.getElementById('autoGemsCount').textContent = 25 - mines;
      }
    };
  }
}, 100);



// Handle On Win button group
setTimeout(() => {
  document.querySelectorAll('#advancedSettings .button-group').forEach((group, index) => {
    group.querySelectorAll('.group-btn').forEach(btn => {
      btn.onclick = () => {
        group.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (index === 0) {
          // On Win
          const winGroup = document.getElementById('onWinPercentGroup');
          if (winGroup) winGroup.classList.toggle('hidden', btn.dataset.value !== 'increase');
        } else if (index === 1) {
          // On Loss
          const loseGroup = document.getElementById('onLosePercentGroup');
          if (loseGroup) loseGroup.classList.toggle('hidden', btn.dataset.value !== 'increase');
        }
      };
    });
  });
}, 100);

if (document.getElementById('advancedToggle')) {
  document.getElementById('advancedToggle').onchange = (e) => {
    document.getElementById('advancedSettings').classList.toggle('hidden', !e.target.checked);
  };
}

document.querySelectorAll('.bet-action-btn').forEach(btn => {
  btn.onclick = () => {
    const isAuto = !document.getElementById('autoMode').classList.contains('hidden');
    const input = document.getElementById(isAuto ? 'autoBetAmount' : 'betAmount');
    let value = parseFloat(input.value) || 0;
    
    if (btn.dataset.action === 'half') {
      value = Math.max(0, value / 2);
    } else if (btn.dataset.action === 'double') {
      value = value * 2;
    }
    
    input.value = value.toFixed(8);
  };
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !STATE.active) {
    e.preventDefault();
    startGame();
  } else if (e.code === 'Enter' && STATE.active && STATE.revealed.length > 0) {
    e.preventDefault();
    cashout();
  }
});

let showingAllGames = false;
document.getElementById('viewAllGamesBtn').onclick = () => {
  showingAllGames = !showingAllGames;
  renderRecentGames(showingAllGames);
};

// ============================================
// INITIALIZE
// ============================================
createBoard();
updateAutoBoard();
updateUI();
initUser();
switchMode('manual');