// ---------- API Configuration ----------
const API_BASE_URL = 'http://localhost:5000/api';
const USER_ID = 'demo-user-' + Math.random().toString(36).substr(2, 9);

// ---------- Splash Screen Transition ----------
document.getElementById('play-btn').addEventListener('click', function() {
  const splash = document.getElementById('splash-screen');
  splash.classList.add('hidden');
  
  setTimeout(() => {
    splash.style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    initializeUser();
  }, 500);
});

// ---------- Utility ----------
const el = id => document.getElementById(id);
const formatINR = v => `₹${Number(v).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}`;

function toast(msg, duration = 1800){
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), duration);
}

// ---------- Game State ----------
const STATE = {
  balance: 1000,
  bet: 10,
  mines: 3,
  total: 25,
  clientSeed: 'tukda-bhai',
  nonce: 0,
  roundActive: false,
  opened: new Set(),
  mineSet: new Set(),
  multiplier: 1,
  currentGameId: null,
  serverSeedHash: '',
};

const AUTO = {
  running: false,
  remaining: 0,
  targetClicks: 1,
  intervalMs: 1200,
  timer: null,
  roundClicks: 0,
};

// ---------- UI Setup ----------
const grid = el('grid');
const betInput = el('bet');
const mineRange = el('mineCount');
const mineView = el('mineCountView');
const clientSeedInput = el('clientSeed');
const startBtn = el('start');
const cashoutBtn = el('cashout');
const revealAllBtn = el('revealAll');
const addFunds = el('addFunds');

function drawGrid(){
  grid.innerHTML = '';
  for(let i=0;i<STATE.total;i++){
    const d = document.createElement('button');
    d.className = 'tile';
    d.dataset.idx = i;
    d.addEventListener('click', ()=>onTile(i,d));
    grid.appendChild(d);
  }
  updateKpis();
}

function updateKpis(){
  el('balance').textContent = formatINR(STATE.balance);
  el('betView').textContent = formatINR(STATE.bet);
  el('multView').textContent = `${STATE.multiplier.toFixed(2)}×`;
  const pot = STATE.bet * STATE.multiplier;
  el('potView').textContent = formatINR(pot);

  const safeTotal = STATE.total - STATE.mines;
  el('revealedView').textContent = `${STATE.opened.size} / ${safeTotal}`;
  el('nonce').textContent = String(STATE.nonce);

  // auto status
  el('autoStatus').textContent = AUTO.running ? `running (${AUTO.remaining} left)` : 'idle';
}

function refreshControls(){
  betInput.value = STATE.bet;
  mineRange.value = STATE.mines;
  mineView.textContent = STATE.mines;
  clientSeedInput.value = STATE.clientSeed;

  betInput.disabled = STATE.roundActive;
  mineRange.disabled = STATE.roundActive;
  clientSeedInput.disabled = STATE.roundActive;
  startBtn.disabled = STATE.roundActive;
  cashoutBtn.disabled = !STATE.roundActive || STATE.opened.size===0;
}

// ---------- API Calls ----------
async function apiCall(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    toast('Error: ' + error.message);
    throw error;
  }
}

async function initializeUser() {
  try {
    const userData = await apiCall(`/users/${USER_ID}`);
    STATE.balance = userData.balance;
    STATE.nonce = userData.gamesPlayed || 0;
    updateKpis();
    toast('Welcome! Balance loaded.');
  } catch (error) {
    console.error('Failed to initialize user:', error);
  }
}

async function newRound(){
  // Validate bet
  STATE.bet = Math.max(1, Math.floor(Number(betInput.value)||10));
  if(STATE.bet > STATE.balance){ 
    toast('Insufficient balance'); 
    stopAuto(); 
    return; 
  }

  STATE.clientSeed = clientSeedInput.value.trim() || 'client';
  STATE.mines = Math.max(1, Math.min(24, Number(mineRange.value)||3));
  STATE.nonce += 1;

  try {
    // Call backend to create game
    const gameData = await apiCall('/games/create', 'POST', {
      userId: USER_ID,
      betAmount: STATE.bet,
      minesCount: STATE.mines,
      clientSeed: STATE.clientSeed,
      nonce: STATE.nonce
    });

    // Update state with backend response
    STATE.currentGameId = gameData.game._id;
    STATE.serverSeedHash = gameData.game.serverSeedHash;
    STATE.balance = gameData.balance;
    STATE.roundActive = true;
    STATE.opened = new Set();
    STATE.mineSet = new Set(); // Will be revealed only when game ends
    STATE.multiplier = 1;
    AUTO.roundClicks = 0;

    // UI Update
    drawGrid();
    refreshControls();
    const seedPreview = STATE.serverSeedHash.slice(0, 16);
    el('seedHash').textContent = `serverSeedHash: ${seedPreview}…`;
    el('serverSeed').textContent = 'Hidden until round ends';
    toast('Round started!');
  } catch (error) {
    console.error('Failed to create game:', error);
    stopAuto();
  }
}

function revealTile(idx, btn, isMine){
  btn.classList.add('revealed');
  if(isMine){
    btn.classList.add('mine');
    btn.innerHTML = '<img src="img/bomb.gif" width="80" height="80" alt="Mine">';
  }else{
    btn.classList.add('safe');
    btn.innerHTML = '<img src="img/diamond.gif" width="80" height="80" alt="Mine">';
  }
  btn.disabled = true;
}

function revealAll(minePositions){
  const tiles = grid.querySelectorAll('.tile');
  tiles.forEach((b,i)=>{
    if(!b.classList.contains('revealed')){
      b.classList.add('revealed');
      if(minePositions.includes(i)){
        b.classList.add('mine'); 
        b.innerHTML='<img src="img/bomb.gif" width="80" height="80" alt="Mine">';
      }else{ 
        b.classList.add('safe'); 
        b.innerHTML='<img src="img/diamond.gif" width="80" height="80" alt="Mine">'; 
      }
      b.disabled = true;
    }
  });
}

function endRound(serverSeed = '', minePositions = []){
  STATE.roundActive = false;
  refreshControls();
  if (minePositions.length > 0) {
    revealAll(minePositions);
  }
  if (serverSeed) {
    el('serverSeed').textContent = serverSeed;
  }
  el('seedHash').textContent = 'seed: –';
  if(AUTO.running){
    AUTO.remaining = Math.max(0, AUTO.remaining - 1);
    updateKpis();
  }
}

function playClick(){ const a = el('sndClick'); a && a.play().catch(()=>{}); }
function playBlast(){ const a = el('sndBlast'); a && a.play().catch(()=>{}); }

async function onTile(idx, btn){
  if(!STATE.roundActive) return;
  if(btn.classList.contains('revealed')) return;
  if(!STATE.currentGameId) return;

  try {
    // Call backend to reveal tile
    const result = await apiCall(`/games/${STATE.currentGameId}/reveal`, 'POST', {
      tileIndex: idx
    });

    if (result.isMine) {
      // Hit a mine - game lost
      playBlast();
      revealTile(idx, btn, true);
      STATE.balance = result.balance;
      toast('Boom! You hit a mine. -' + formatINR(STATE.bet));
      endRound(result.game.serverSeed, result.game.minePositions);
      updateKpis();
    } else {
      // Safe tile
      playClick();
      revealTile(idx, btn, false);
      STATE.opened.add(idx);
      STATE.multiplier = result.game.currentMultiplier;
      updateKpis();
      cashoutBtn.disabled = false;

      if(AUTO.running){
        AUTO.roundClicks += 1;
        if(AUTO.roundClicks >= AUTO.targetClicks){
          await cashout();
        }
      }
    }
  } catch (error) {
    console.error('Failed to reveal tile:', error);
    toast('Error revealing tile');
  }
}

async function cashout(){
  if(!STATE.roundActive || STATE.opened.size===0) return;
  if(!STATE.currentGameId) return;

  try {
    const result = await apiCall(`/games/${STATE.currentGameId}/cashout`, 'POST');
    
    const profit = result.game.profit;
    STATE.balance = result.balance;
    toast('Cashed out: +' + formatINR(profit));
    endRound(result.game.serverSeed, result.game.minePositions);
    updateKpis();
  } catch (error) {
    console.error('Failed to cashout:', error);
    toast('Error cashing out');
  }
}

// ---------- Auto Play ----------
function randomUnopenedIndex(){
  const tiles = [];
  for(let i=0;i<STATE.total;i++){
    if(!STATE.opened.has(i)){
      const btn = grid.children[i];
      if(!btn.classList.contains('revealed')) tiles.push(i);
    }
  }
  if(!tiles.length) return -1;
  return tiles[Math.floor(Math.random()*tiles.length)];
}

async function autoTick(){
  if(!AUTO.running){ return; }
  if(AUTO.remaining <= 0){ stopAuto(); return; }

  if(!STATE.roundActive){
    await newRound();
    return;
  }
  // If round active, click a random cell
  const idx = randomUnopenedIndex();
  if(idx === -1){ await cashout(); return; }
  const btn = grid.children[idx];
  await onTile(idx, btn);
}

function startAuto(){
  AUTO.remaining = Math.max(1, Number(el('autoCount').value)||1);
  AUTO.targetClicks = Math.max(1, Math.min(24, Number(el('autoClicks').value)||1));
  AUTO.intervalMs = Math.max(300, Number(el('autoMs').value)||1200);
  if(AUTO.running) stopAuto();
  AUTO.running = true;
  el('autoStatus').textContent = `running (${AUTO.remaining} left)`;
  AUTO.timer = setInterval(autoTick, AUTO.intervalMs);
  setTimeout(autoTick, 50);
  toast('Auto started');
}

function stopAuto(){
  AUTO.running = false;
  if(AUTO.timer) clearInterval(AUTO.timer);
  AUTO.timer = null;
  el('autoStatus').textContent = 'idle';
  toast('Auto stopped');
}

// ---------- Events ----------
betInput.addEventListener('change', ()=>{ 
  STATE.bet = Math.max(1, Math.floor(Number(betInput.value)||10)); 
  updateKpis(); 
});

mineRange.addEventListener('input', ()=>{ 
  STATE.mines = Number(mineRange.value); 
  mineView.textContent = STATE.mines; 
  updateKpis(); 
});

clientSeedInput.addEventListener('change', ()=>{ 
  STATE.clientSeed = clientSeedInput.value; 
});

startBtn.addEventListener('click', newRound);
cashoutBtn.addEventListener('click', cashout);

revealAllBtn.addEventListener('click', async ()=>{ 
  if (STATE.currentGameId && STATE.roundActive) {
    try {
      const gameData = await apiCall(`/games/${STATE.currentGameId}`);
      if (gameData.minePositions) {
        revealAll(gameData.minePositions);
      }
    } catch (error) {
      console.error('Failed to reveal all:', error);
    }
  }
});

addFunds.addEventListener('click', async ()=>{ 
  try {
    const result = await apiCall(`/users/${USER_ID}/add-funds`, 'POST', {
      amount: 1000
    });
    STATE.balance = result.balance;
    updateKpis(); 
    toast('Funds added: +₹1,000');
  } catch (error) {
    console.error('Failed to add funds:', error);
  }
});

el('autoStart').addEventListener('click', startAuto);
el('autoStop').addEventListener('click', stopAuto);

// ---------- Init ----------
drawGrid();
refreshControls();
updateKpis();