// controllers/fairnessController.js
const { sha256, generateMinePositions } = require('../utils/seedUtils');

/**
 * Verify game fairness by regenerating mine positions
 * POST /api/fairness/verify
 */
exports.verifyFairness = async (req, res) => {
  try {
    const { serverSeed, clientSeed, nonce, minesCount, gridSize = 25 } = req.body;

    // Validation
    if (!serverSeed || !clientSeed) {
      return res.status(400).json({ 
        error: 'Missing required fields: serverSeed, clientSeed' 
      });
    }

    if (!nonce || nonce < 0) {
      return res.status(400).json({ 
        error: 'Valid nonce is required' 
      });
    }

    if (!minesCount || minesCount < 1 || minesCount > 24) {
      return res.status(400).json({ 
        error: 'Mines count must be between 1 and 24' 
      });
    }

    // Generate server seed hash
    const serverSeedHash = sha256(serverSeed);

    // Regenerate mine positions using provably fair algorithm
    const minePositions = generateMinePositions(
      serverSeed,
      clientSeed,
      nonce,
      gridSize,
      minesCount
    );

    // Create fairness matrix (5x5 grid visualization)
    const matrix = Array(gridSize).fill(null).map((_, idx) => ({
      position: idx,
      isMine: minePositions.includes(idx),
      revealed: false
    }));

    // Calculate safe tiles
    const safeTiles = [];
    for (let i = 0; i < gridSize; i++) {
      if (!minePositions.includes(i)) {
        safeTiles.push(i);
      }
    }

    res.json({
      success: true,
      verification: {
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        minesCount,
        gridSize
      },
      result: {
        minePositions: minePositions.sort((a, b) => a - b),
        safeTiles: safeTiles.sort((a, b) => a - b),
        matrix,
        seedCombination: `${serverSeed}|${clientSeed}|${nonce}`,
        combinedHash: sha256(`${serverSeed}|${clientSeed}|${nonce}`)
      },
      message: 'Fairness verification complete. Mine positions regenerated successfully.'
    });
  } catch (error) {
    console.error('Fairness verification error:', error);
    res.status(500).json({ 
      error: 'Failed to verify fairness', 
      details: error.message 
    });
  }
};

/**
 * Generate a new server seed for next game
 * GET /api/fairness/new-seed
 */
exports.generateNewServerSeed = async (req, res) => {
  try {
    const { generateServerSeed } = require('../utils/seedUtils');
    
    const serverSeed = generateServerSeed();
    const serverSeedHash = sha256(serverSeed);

    res.json({
      success: true,
      serverSeedHash,
      message: 'New server seed generated. The actual seed will be revealed after the game.'
    });
  } catch (error) {
    console.error('Generate seed error:', error);
    res.status(500).json({ 
      error: 'Failed to generate server seed', 
      details: error.message 
    });
  }
};

/**
 * Verify a specific game by game ID
 * GET /api/fairness/verify-game/:gameId
 */
exports.verifyGameById = async (req, res) => {
  try {
    const { gameId } = req.params;
    const Game = require('../models/Game');

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status === 'active') {
      return res.status(400).json({ 
        error: 'Cannot verify active game. Game must be completed first.' 
      });
    }

    // Verify server seed hash
    const computedHash = sha256(game.serverSeed);
    const hashMatches = computedHash === game.serverSeedHash;

    // Regenerate mine positions
    const regeneratedPositions = generateMinePositions(
      game.serverSeed,
      game.clientSeed,
      game.nonce,
      game.gridSize,
      game.minesCount
    );

    // Check if positions match
    const sortedOriginal = [...game.minePositions].sort((a, b) => a - b);
    const sortedRegenerated = [...regeneratedPositions].sort((a, b) => a - b);
    const positionsMatch = JSON.stringify(sortedOriginal) === JSON.stringify(sortedRegenerated);

    // Create matrix
    const matrix = Array(game.gridSize).fill(null).map((_, idx) => ({
      position: idx,
      isMine: game.minePositions.includes(idx),
      wasRevealed: game.revealedTiles.includes(idx)
    }));

    res.json({
      success: true,
      verified: hashMatches && positionsMatch,
      game: {
        gameId: game._id,
        status: game.status,
        betAmount: game.betAmount,
        payoutAmount: game.payoutAmount,
        profit: game.profit
      },
      verification: {
        serverSeed: game.serverSeed,
        serverSeedHash: game.serverSeedHash,
        computedHash,
        hashMatches,
        clientSeed: game.clientSeed,
        nonce: game.nonce,
        minesCount: game.minesCount,
        gridSize: game.gridSize
      },
      result: {
        originalMinePositions: sortedOriginal,
        regeneratedMinePositions: sortedRegenerated,
        positionsMatch,
        revealedTiles: game.revealedTiles,
        matrix
      },
      message: hashMatches && positionsMatch 
        ? '✅ Game is provably fair! All verifications passed.' 
        : '❌ Verification failed. Game may not be fair.'
    });
  } catch (error) {
    console.error('Verify game error:', error);
    res.status(500).json({ 
      error: 'Failed to verify game', 
      details: error.message 
    });
  }
};

module.exports = exports;