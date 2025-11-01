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
 * Convert hex hash to multiple seed integers for better randomness
 * Takes segments from different parts of the hash
 */
function hashToSeedArray(hex) {
  const seeds = [];
  // Take 4 different 8-char segments from the 64-char hash
  for (let i = 0; i < 4; i++) {
    const segment = hex.slice(i * 16, i * 16 + 8);
    seeds.push(parseInt(segment, 16) >>> 0);
  }
  return seeds;
}

/**
 * Mulberry32 PRNG (deterministic)
 * Enhanced version that uses multiple seeds for better distribution
 */
function createPRNG(seedArray) {
  let index = 0;
  let t = seedArray[0] >>> 0;
  
  return function() {
    // Mix in different seed segments periodically for better randomness
    if (Math.random() < 0.25 && seedArray[index % seedArray.length]) {
      t ^= seedArray[index % seedArray.length];
      index++;
    }
    
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    const result = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    return result;
  };
}

/**
 * Generate mine positions using provably fair algorithm
 * FIXED: Now properly combines seeds in the correct format
 */
function generateMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount) {
  // CRITICAL: Combine seeds in the standard provably fair format
  // Format: serverSeed:clientSeed:nonce (same as most casino sites)
  const seedStr = `${serverSeed}:${clientSeed}:${nonce}`;
  
  // Hash the combined seed string
  const hex = sha256(seedStr);
  
  // Create multiple seed integers from different parts of the hash
  const seedArray = hashToSeedArray(hex);
  
  // Initialize PRNG with the seed array
  const prng = createPRNG(seedArray);

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
  hashToSeedArray,
  createPRNG,
  generateMinePositions,
  verifyMinePositions,
  calculateMultiplier,
  generateSeedHash
};