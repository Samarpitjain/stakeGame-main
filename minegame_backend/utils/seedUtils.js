const crypto = require('crypto');

/**
 * Generate a random server seed
 */
function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a string using SHA-256
 */
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Convert hex hash to 32-bit seed integer
 */
function hashToSeedInt(hex) {
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

/**
 * Mulberry32 PRNG (deterministic)
 * Same implementation as frontend for consistency
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate mine positions using provably fair algorithm
 */
function generateMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount) {
  // Create seed string
  const seedStr = `${serverSeed}|${clientSeed}|${nonce}`;
  const hex = sha256(seedStr);
  const seedInt = hashToSeedInt(hex);
  const prng = mulberry32(seedInt);

  // Shuffle array using PRNG
  const arr = Array.from({ length: gridSize }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Return first N positions as mine positions
  return arr.slice(0, minesCount);
}

/**
 * Verify if mine positions match the seeds
 */
function verifyMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount, minePositions) {
  const generated = generateMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount);
  
  // Check if arrays match
  if (generated.length !== minePositions.length) return false;
  
  const sortedGenerated = [...generated].sort((a, b) => a - b);
  const sortedProvided = [...minePositions].sort((a, b) => a - b);
  
  return sortedGenerated.every((val, idx) => val === sortedProvided[idx]);
}

/**
 * Calculate multiplier for current game state
 */
function calculateMultiplier(currentMultiplier, revealedCount, gridSize, minesCount) {
  const total = gridSize;
  const remainingCells = total - revealedCount;
  const remainingSafe = (total - minesCount) - revealedCount;
  
  if (remainingSafe <= 0) return currentMultiplier;
  
  // Risk bonus (matches frontend)
  const riskStep = 0.5;
  const baseMines = 1;
  const riskBonus = Math.max(0, 1 + riskStep * (minesCount - baseMines));
  
  const step = (remainingCells / remainingSafe) * riskBonus;
  return currentMultiplier * step;
}

module.exports = {
  generateServerSeed,
  sha256,
  hashToSeedInt,
  mulberry32,
  generateMinePositions,
  verifyMinePositions,
  calculateMultiplier
};