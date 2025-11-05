// controllers/fairnessController.js
const { sha256, generateMinePositions, generateSeedHash } = require('../utils/seedUtils');
const Game = require('../models/Game');
const User = require('../models/User');

/**
 * Verify fairness with custom seeds (Independent verification)
 * POST /api/fairness/verify
 */
exports.verifyFairness = async (req, res) => {
  try {
    const { serverSeed, clientSeed, nonce, minesCount, gridSize = 25 } = req.body;

    if (!serverSeed || !clientSeed) {
      return res.status(400).json({ 
        error: 'Missing required fields: serverSeed, clientSeed' 
      });
    }

    if (nonce === undefined || nonce < 0) {
      return res.status(400).json({ 
        error: 'Valid nonce is required (must be >= 0)' 
      });
    }

    if (!minesCount || minesCount < 1 || minesCount > 24) {
      return res.status(400).json({ 
        error: 'Mines count must be between 1 and 24' 
      });
    }

    const serverSeedHash = sha256(serverSeed);
    const minePositions = generateMinePositions(
      serverSeed,
      clientSeed,
      nonce,
      gridSize,
      minesCount
    );

    const combinedHash = generateSeedHash(serverSeed, clientSeed, nonce);

    const matrix = Array(gridSize).fill(null).map((_, idx) => ({
      position: idx,
      isMine: minePositions.includes(idx),
      row: Math.floor(idx / 5),
      col: idx % 5
    }));

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
        combinedHash
      },
      message: '✅ Independent verification complete'
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
 * Verify a specific game by ID (After seed rotation)
 * GET /api/fairness/verify-game/:gameId
 */
exports.verifyGameById = async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status === 'active') {
      return res.status(400).json({ 
        error: 'Cannot verify active game. Complete the game first.' 
      });
    }

    // Get user to check if seed was revealed
    const user = await User.findOne({ userId: game.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if seed has been revealed via rotation
    const isRevealed = user.previousServerSeed && 
                       user.previousNonce >= game.nonce;

    if (!isRevealed) {
      return res.json({
        success: false,
        verified: false,
        message: '🔒 Server seed not yet revealed. Please rotate your seed pair to verify this game.',
        game: {
          gameId: game._id,
          status: game.status,
          serverSeedHash: game.serverSeedHash,
          clientSeed: game.clientSeed,
          nonce: game.nonce
        },
        action: 'Rotate seed pair at /api/games/seeds/:userId/rotate'
      });
    }

    // Verify with revealed seed
    const computedHash = sha256(user.previousServerSeed);
    const hashMatches = computedHash === game.serverSeedHash;

    const regeneratedPositions = generateMinePositions(
      user.previousServerSeed,
      game.clientSeed,
      game.nonce,
      game.gridSize,
      game.minesCount
    );

    const sortedOriginal = [...game.minePositions].sort((a, b) => a - b);
    const sortedRegenerated = [...regeneratedPositions].sort((a, b) => a - b);
    const positionsMatch = JSON.stringify(sortedOriginal) === JSON.stringify(sortedRegenerated);

    const matrix = Array(game.gridSize).fill(null).map((_, idx) => ({
      position: idx,
      isMine: game.minePositions.includes(idx),
      wasRevealed: game.revealedTiles.includes(idx),
      row: Math.floor(idx / 5),
      col: idx % 5
    }));

    const combinedHash = generateSeedHash(user.previousServerSeed, game.clientSeed, game.nonce);

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
        serverSeed: user.previousServerSeed, // 🔓 Revealed!
        serverSeedHash: game.serverSeedHash,
        computedHash,
        hashMatches,
        clientSeed: game.clientSeed,
        nonce: game.nonce,
        minesCount: game.minesCount,
        gridSize: game.gridSize,
        combinedHash
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
        : '❌ Verification failed. Possible tampering detected.'
    });
  } catch (error) {
    console.error('Verify game error:', error);
    res.status(500).json({ 
      error: 'Failed to verify game', 
      details: error.message 
    });
  }
};

/**
 * Get verification status for multiple games
 * POST /api/fairness/batch-verify
 */
exports.batchVerifyGames = async (req, res) => {
  try {
    const { userId, gameIds } = req.body;

    if (!userId || !gameIds || !Array.isArray(gameIds)) {
      return res.status(400).json({ 
        error: 'userId and gameIds array required' 
      });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const games = await Game.find({ 
      _id: { $in: gameIds },
      userId 
    });

    const verifications = games.map(game => {
      const isRevealed = user.previousServerSeed && 
                         user.previousNonce >= game.nonce;
      
      if (!isRevealed || game.status === 'active') {
        return {
          gameId: game._id,
          canVerify: false,
          reason: game.status === 'active' ? 'Game still active' : 'Seed not revealed'
        };
      }

      const computedHash = sha256(user.previousServerSeed);
      const hashMatches = computedHash === game.serverSeedHash;
      
      const regeneratedPositions = generateMinePositions(
        user.previousServerSeed,
        game.clientSeed,
        game.nonce,
        game.gridSize,
        game.minesCount
      );

      const positionsMatch = JSON.stringify(
        [...game.minePositions].sort()
      ) === JSON.stringify(
        [...regeneratedPositions].sort()
      );

      return {
        gameId: game._id,
        canVerify: true,
        verified: hashMatches && positionsMatch,
        hashMatches,
        positionsMatch,
        nonce: game.nonce
      };
    });

    res.json({
      success: true,
      userId,
      totalGames: verifications.length,
      verifications
    });
  } catch (error) {
    console.error('Batch verify error:', error);
    res.status(500).json({ 
      error: 'Failed to batch verify games', 
      details: error.message 
    });
  }
};

module.exports = {
  verifyFairness: exports.verifyFairness,
  verifyGameById: exports.verifyGameById,
  batchVerifyGames: exports.batchVerifyGames
};