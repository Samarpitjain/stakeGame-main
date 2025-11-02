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
 * Mulberry32 PRNG (deterministic)
 * Simple, fast, and deterministic pseudo-random number generator
 */
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

/**
 * Generate mine positions using provably fair algorithm
 * FIXED: Now properly deterministic - same inputs always produce same outputs
 */
function generateMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount) {
  // CRITICAL: Combine seeds in the standard provably fair format
  // Format: serverSeed:clientSeed:nonce
  const seedStr = `${serverSeed}:${clientSeed}:${nonce}`;
  
  // Hash the combined seed string
  const hex = sha256(seedStr);
  
  // Convert hash to a single seed integer (using first 8 hex chars = 32 bits)
  const seed = parseInt(hex.slice(0, 8), 16);
  
  // Initialize PRNG with the seed
  const prng = createPRNG(seed);

  // Fisher-Yates shuffle using PRNG
  const arr = Array.from({ length: gridSize }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Return first N positions as mine positions
  return arr.slice(0, minesCount).sort((a, b) => a - b);
}

/**
 * Verify if mine positions match the seeds
 * FIXED: Uses the same seed combination format
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
 * Risk-based multiplier calculation
 */
function calculateMultiplier(currentMultiplier, revealedCount, gridSize, minesCount) {
  const total = gridSize;
  const remainingCells = total - revealedCount;
  const remainingSafe = (total - minesCount) - revealedCount;
  
  if (remainingSafe <= 0) return currentMultiplier;
  
  // Risk bonus calculation (matches standard casino formula)
  const riskStep = 0.5;
  const baseMines = 1;
  const riskBonus = Math.max(0, 1 + riskStep * (minesCount - baseMines));
  
  const step = (remainingCells / remainingSafe) * riskBonus;
  return currentMultiplier * step;
}

/**
 * Generate seed combination hash for verification
 * This is what players can verify independently
 */
function generateSeedHash(serverSeed, clientSeed, nonce) {
  const seedStr = `${serverSeed}:${clientSeed}:${nonce}`;
  return sha256(seedStr);
}

module.exports = {
  generateServerSeed,
  sha256,
  createPRNG,
  generateMinePositions,
  verifyMinePositions,
  calculateMultiplier,
  generateSeedHash
};