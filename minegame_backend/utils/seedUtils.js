// utils/seedUtils.js
const crypto = require('crypto');

/**
 * Generate a cryptographically secure server seed
 */
function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a string using SHA-256
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate combined seed hash for verification
 */
function generateSeedHash(serverSeed, clientSeed, nonce) {
  const combined = `${serverSeed}:${clientSeed}:${nonce}`;
  return sha256(combined);
}

/**
 * Generate mine positions using provably fair algorithm
 * Uses HMAC-SHA256 for cryptographic randomness
 */
function generateMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount) {
  const positions = [];
  const usedPositions = new Set();
  
  let currentNonce = 0;
  
  while (positions.length < minesCount) {
    // Create unique seed for each mine position
    const seed = `${serverSeed}:${clientSeed}:${nonce}:${currentNonce}`;
    
    // Generate HMAC-SHA256 hash
    const hash = crypto
      .createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}:${currentNonce}`)
      .digest('hex');
    
    // Convert first 8 characters to number
    const position = parseInt(hash.substring(0, 8), 16) % gridSize;
    
    // Add if not duplicate
    if (!usedPositions.has(position)) {
      positions.push(position);
      usedPositions.add(position);
    }
    
    currentNonce++;
    
    // Safety check to prevent infinite loop
    if (currentNonce > 1000) {
      throw new Error('Failed to generate mine positions');
    }
  }
  
  return positions;
}

/**
 * Verify mine positions match the original generation
 */
function verifyMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount, originalPositions) {
  try {
    const regenerated = generateMinePositions(serverSeed, clientSeed, nonce, gridSize, minesCount);
    
    const sortedOriginal = [...originalPositions].sort((a, b) => a - b);
    const sortedRegenerated = [...regenerated].sort((a, b) => a - b);
    
    return JSON.stringify(sortedOriginal) === JSON.stringify(sortedRegenerated);
  } catch (error) {
    console.error('Verification error:', error);
    return false;
  }
}

/**
 * Calculate multiplier based on revealed tiles
 * Formula: multiplier = (gridSize / (gridSize - minesCount)) ^ revealedCount
 */
function calculateMultiplier(baseMultiplier, revealedCount, gridSize, minesCount) {
  if (revealedCount === 0) return 1.0;
  
  const safeTiles = gridSize - minesCount;
  const multiplierPerTile = gridSize / safeTiles;
  
  // Calculate new multiplier
  const newMultiplier = Math.pow(multiplierPerTile, revealedCount);
  
  // Round to 2 decimal places
  return Math.round(newMultiplier * 100) / 100;
}

/**
 * Generate a random client seed
 */
function generateClientSeed() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  generateServerSeed,
  sha256,
  generateSeedHash,
  generateMinePositions,
  verifyMinePositions,
  calculateMultiplier,
  generateClientSeed
};