const Game = require('../models/Game');
const User = require('../models/User');
const {
  generateServerSeed,
  sha256,
  generateMinePositions,
  verifyMinePositions,
  calculateMultiplier
} = require('../utils/seedUtils');

// 🧩 CREATE GAME
exports.createGame = async (req, res) => {
  try {
    const { userId, betAmount, minesCount } = req.body;

    if (!userId || !betAmount || !minesCount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (betAmount < 1 || minesCount < 1 || minesCount > 24) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId, username: userId, balance: 1000 });
      await user.save();
    }

    if (user.balance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const gridSize = 25;
    const minePositions = generateMinePositions(user.serverSeed, user.clientSeed, user.nonce, gridSize, minesCount);

    const game = new Game({
      userId,
      betAmount,
      minesCount,
      gridSize,
      serverSeed: user.serverSeed,
      serverSeedHash: user.serverSeedHash,
      clientSeed: user.clientSeed,
      nonce: user.nonce,
      minePositions,
      status: 'active',
      currentMultiplier: 1.0
    });

    await game.save();
    user.updateBalance(-betAmount);
    await user.save();

    res.status(201).json({
      success: true,
      game: {
        _id: game._id,
        betAmount: game.betAmount,
        minesCount: game.minesCount,
        serverSeedHash: game.serverSeedHash,
        clientSeed: game.clientSeed,
        nonce: game.nonce,
        currentMultiplier: game.currentMultiplier,
        status: game.status,
        gridSize: game.gridSize
      },
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create game' });
  }
};

// 💥 REVEAL TILE
exports.revealTile = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { tileIndex } = req.body;

    if (tileIndex === undefined || tileIndex < 0 || tileIndex > 24) {
      return res.status(400).json({ error: 'Invalid tile index' });
    }

    const game = await Game.findById(gameId);
    if (!game || game.status !== 'active' || game.revealedTiles.includes(tileIndex)) {
      return res.status(400).json({ error: 'Invalid game state' });
    }

    const isMine = game.minePositions.includes(tileIndex);

    if (isMine) {
      game.revealedTiles.push(tileIndex);
      game.status = 'lost';
      game.endedAt = new Date();
      game.profit = -game.betAmount;
      game.payoutAmount = 0;
      await game.save();

      const user = await User.findOne({ userId: game.userId });
      if (user) {
        user.recordGameResult(game.betAmount, game.profit, false);
        await user.save();
      }

      return res.json({
        success: false,
        isMine: true,
        game: {
          _id: game._id,
          status: game.status,
          revealedTiles: game.revealedTiles,
          currentMultiplier: game.currentMultiplier,
          profit: game.profit,
          serverSeed: game.serverSeed,
          minePositions: game.minePositions
        },
        balance: user ? user.balance : 0,
        nonce: user ? user.nonce : 0
      });
    } else {
      game.revealedTiles.push(tileIndex);
      game.currentMultiplier = calculateMultiplier(
        game.currentMultiplier,
        game.revealedTiles.length,
        game.gridSize,
        game.minesCount
      );
      await game.save();

      return res.json({
        success: true,
        isMine: false,
        game: {
          _id: game._id,
          status: game.status,
          revealedTiles: game.revealedTiles,
          currentMultiplier: game.currentMultiplier,
          potentialPayout: game.betAmount * game.currentMultiplier
        }
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to reveal tile' });
  }
};

// 💰 CASHOUT
exports.cashout = async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId);
    if (!game || game.status !== 'active' || game.revealedTiles.length === 0) {
      return res.status(400).json({ error: 'Invalid game state' });
    }

    const payout = game.betAmount * game.currentMultiplier;
    const profit = payout - game.betAmount;

    game.status = 'cashed_out';
    game.payoutAmount = payout;
    game.profit = profit;
    game.endedAt = new Date();
    await game.save();

    const user = await User.findOne({ userId: game.userId });
    if (user) {
      user.updateBalance(payout);
      user.recordGameResult(game.betAmount, profit, true);
      await user.save();
    }

    res.json({
      success: true,
      game: {
        _id: game._id,
        status: game.status,
        payoutAmount: game.payoutAmount,
        profit: game.profit,
        currentMultiplier: game.currentMultiplier,
        serverSeed: game.serverSeed,
        minePositions: game.minePositions
      },
      balance: user ? user.balance : 0,
      nonce: user ? user.nonce : 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cash out' });
  }
};

// 🕹️ GET GAME
exports.getGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const response = {
      _id: game._id,
      userId: game.userId,
      betAmount: game.betAmount,
      minesCount: game.minesCount,
      gridSize: game.gridSize,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      revealedTiles: game.revealedTiles,
      currentMultiplier: game.currentMultiplier,
      status: game.status,
      payoutAmount: game.payoutAmount,
      profit: game.profit,
      startedAt: game.startedAt,
      endedAt: game.endedAt
    };

    if (game.status !== 'active') {
      response.serverSeed = game.serverSeed;
      response.minePositions = game.minePositions;
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get game' });
  }
};

// 🧾 GAME HISTORY
exports.getGameHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, skip = 0 } = req.query;

    const games = await Game.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('-serverSeed -minePositions');

    const total = await Game.countDocuments({ userId });
    res.json({ games, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get game history' });
  }
};

// ✅ VERIFY GAME
exports.verifyGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findById(gameId);
    if (!game || game.status === 'active') {
      return res.status(400).json({ error: 'Cannot verify' });
    }

    const computedHash = sha256(game.serverSeed);
    const hashMatches = computedHash === game.serverSeedHash;
    const positionsMatch = verifyMinePositions(
      game.serverSeed,
      game.clientSeed,
      game.nonce,
      game.gridSize,
      game.minesCount,
      game.minePositions
    );

    res.json({
      verified: hashMatches && positionsMatch,
      serverSeed: game.serverSeed,
      serverSeedHash: game.serverSeedHash,
      computedHash,
      hashMatches,
      positionsMatch,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      minePositions: game.minePositions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify game' });
  }
};

// Get user seeds
exports.getUserSeeds = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      serverSeedHash: user.serverSeedHash,
      clientSeed: user.clientSeed,
      nonce: user.nonce
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get seeds' });
  }
};

// Rotate seed pair
exports.rotateSeedPair = async (req, res) => {
  try {
    const { userId } = req.params;
    const { clientSeed } = req.body;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const oldServerSeed = user.serverSeed;
    user.rotateSeedPair(clientSeed);
    await user.save();

    res.json({
      oldServerSeed,
      newServerSeedHash: user.serverSeedHash,
      clientSeed: user.clientSeed,
      nonce: user.nonce
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rotate seeds' });
  }
};

// Update client seed
exports.updateClientSeed = async (req, res) => {
  try {
    const { userId } = req.params;
    const { clientSeed } = req.body;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.clientSeed = clientSeed;
    await user.save();

    res.json({ clientSeed: user.clientSeed });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update client seed' });
  }
};

module.exports = exports;
