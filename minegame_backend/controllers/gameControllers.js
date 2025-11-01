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
  console.log('\n🎮 [CREATE GAME] Request received');
  try {
    const { userId, betAmount, minesCount, clientSeed, nonce } = req.body;
    console.log('➡️ Request body:', req.body);

    if (!userId || !betAmount || !minesCount || !clientSeed) {
      console.log('⚠️ Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: userId, betAmount, minesCount, clientSeed' });
    }

    if (betAmount < 1) {
      console.log('⚠️ Invalid bet amount:', betAmount);
      return res.status(400).json({ error: 'Bet amount must be at least 1' });
    }

    if (minesCount < 1 || minesCount > 24) {
      console.log('⚠️ Invalid mines count:', minesCount);
      return res.status(400).json({ error: 'Mines count must be between 1 and 24' });
    }

    console.log('🔍 Fetching user from DB...');
    let user = await User.findOne({ userId });
    if (!user) {
      console.log('👤 User not found — creating new user');
      user = new User({ userId, username: userId, balance: 1000 });
      await user.save();
      console.log('💾 New user saved:', user);
    }

    console.log(`💰 Checking balance: ${user.balance} vs bet ${betAmount}`);
    if (user.balance < betAmount) {
      console.log('❌ Insufficient balance');
      return res.status(400).json({ error: 'Insufficient balance', balance: user.balance, required: betAmount });
    }

    console.log('🧠 Generating server seed...');
    const serverSeed = generateServerSeed();
    const serverSeedHash = sha256(serverSeed);
    console.log('🔐 Server seed hash:', serverSeedHash);

    const gridSize = 25;
    const gameNonce = nonce || 1;
    console.log('🎲 Generating mine positions...');
    const minePositions = generateMinePositions(serverSeed, clientSeed, gameNonce, gridSize, minesCount);
    console.log('💣 Mines:', minePositions);

    console.log('🆕 Creating new game object...');
    const game = new Game({
      userId,
      betAmount,
      minesCount,
      gridSize,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce: gameNonce,
      minePositions,
      status: 'active',
      currentMultiplier: 1.0
    });

    await game.save();
    console.log('💾 Game saved:', game._id);

    user.updateBalance(-betAmount);
    await user.save();
    console.log(`💸 Deducted bet. New balance: ${user.balance}`);

    console.log('📤 Sending create game response...');
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
    console.log('✅ [CREATE GAME] Completed successfully');
  } catch (error) {
    console.error('❌ [CREATE GAME] Error:', error);
    res.status(500).json({ error: 'Failed to create game', details: error.message });
  }
};

// 💥 REVEAL TILE
exports.revealTile = async (req, res) => {
  console.log('\n🧱 [REVEAL TILE] Request received');
  try {
    const { gameId } = req.params;
    const { tileIndex } = req.body;
    console.log(`➡️ Game ID: ${gameId}, Tile Index: ${tileIndex}`);

    if (tileIndex === undefined || tileIndex < 0 || tileIndex > 24) {
      console.log('⚠️ Invalid tile index');
      return res.status(400).json({ error: 'Invalid tile index' });
    }

    const game = await Game.findById(gameId);
    if (!game) {
      console.log('❌ Game not found');
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'active') {
      console.log('⚠️ Game not active');
      return res.status(400).json({ error: 'Game is not active' });
    }

    if (game.revealedTiles.includes(tileIndex)) {
      console.log('⚠️ Tile already revealed');
      return res.status(400).json({ error: 'Tile already revealed' });
    }

    const isMine = game.minePositions.includes(tileIndex);
    console.log(`🎯 Tile ${tileIndex} is ${isMine ? 'a MINE 💣' : 'safe ✅'}`);

    if (isMine) {
      console.log('💥 Player hit a mine — game lost');
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
        console.log('📉 User stats updated');
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
        balance: user ? user.balance : 0
      });
    } else {
      console.log('✅ Safe tile — calculating new multiplier');
      game.revealedTiles.push(tileIndex);
      game.currentMultiplier = calculateMultiplier(
        game.currentMultiplier,
        game.revealedTiles.length,
        game.gridSize,
        game.minesCount
      );
      await game.save();

      console.log(`🧮 Updated multiplier: ${game.currentMultiplier}`);
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
    console.error('❌ [REVEAL TILE] Error:', error);
    res.status(500).json({ error: 'Failed to reveal tile', details: error.message });
  }
};

// 💰 CASHOUT
exports.cashout = async (req, res) => {
  console.log('\n💵 [CASHOUT] Request received');
  try {
    const { gameId } = req.params;
    console.log(`➡️ Game ID: ${gameId}`);

    const game = await Game.findById(gameId);
    if (!game) {
      console.log('❌ Game not found');
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'active') {
      console.log('⚠️ Game not active');
      return res.status(400).json({ error: 'Game is not active' });
    }

    if (game.revealedTiles.length === 0) {
      console.log('⚠️ No tiles revealed yet');
      return res.status(400).json({ error: 'No tiles revealed yet' });
    }

    const payout = game.betAmount * game.currentMultiplier;
    const profit = payout - game.betAmount;
    console.log(`💰 Payout: ${payout}, Profit: ${profit}`);

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
      console.log('💾 User balance and stats updated');
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
      balance: user ? user.balance : 0
    });
    console.log('✅ [CASHOUT] Completed successfully');
  } catch (error) {
    console.error('❌ [CASHOUT] Error:', error);
    res.status(500).json({ error: 'Failed to cash out', details: error.message });
  }
};

// 🕹️ GET GAME
exports.getGame = async (req, res) => {
  console.log('\n📋 [GET GAME] Request received');
  try {
    const { gameId } = req.params;
    console.log(`➡️ Game ID: ${gameId}`);

    const game = await Game.findById(gameId);
    if (!game) {
      console.log('❌ Game not found');
      return res.status(404).json({ error: 'Game not found' });
    }

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
      console.log('🧩 Including full game details (inactive)');
    }

    res.json(response);
    console.log('✅ [GET GAME] Response sent');
  } catch (error) {
    console.error('❌ [GET GAME] Error:', error);
    res.status(500).json({ error: 'Failed to get game', details: error.message });
  }
};

// 🧾 GAME HISTORY
exports.getGameHistory = async (req, res) => {
  console.log('\n📜 [GET GAME HISTORY] Request received');
  try {
    const { userId } = req.params;
    const { limit = 20, skip = 0 } = req.query;
    console.log(`➡️ userId: ${userId}, limit: ${limit}, skip: ${skip}`);

    const games = await Game.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('-serverSeed -minePositions');

    const total = await Game.countDocuments({ userId });
    console.log(`📊 Found ${games.length} games (total: ${total})`);

    res.json({ games, total, limit: parseInt(limit), skip: parseInt(skip) });
    console.log('✅ [GET GAME HISTORY] Sent successfully');
  } catch (error) {
    console.error('❌ [GET GAME HISTORY] Error:', error);
    res.status(500).json({ error: 'Failed to get game history', details: error.message });
  }
};

// ✅ VERIFY GAME
exports.verifyGame = async (req, res) => {
  console.log('\n🔍 [VERIFY GAME] Request received');
  try {
    const { gameId } = req.params;
    console.log(`➡️ Game ID: ${gameId}`);

    const game = await Game.findById(gameId);
    if (!game) {
      console.log('❌ Game not found');
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status === 'active') {
      console.log('⚠️ Cannot verify active game');
      return res.status(400).json({ error: 'Cannot verify active game' });
    }

    console.log('🔐 Verifying server seed hash...');
    const computedHash = sha256(game.serverSeed);
    const hashMatches = computedHash === game.serverSeedHash;
    console.log('🧮 Hash match:', hashMatches);

    console.log('💣 Verifying mine positions...');
    const positionsMatch = verifyMinePositions(
      game.serverSeed,
      game.clientSeed,
      game.nonce,
      game.gridSize,
      game.minesCount,
      game.minePositions
    );
    console.log('✅ Positions match:', positionsMatch);

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
    console.log('✅ [VERIFY GAME] Completed successfully');
  } catch (error) {
    console.error('❌ [VERIFY GAME] Error:', error);
    res.status(500).json({ error: 'Failed to verify game', details: error.message });
  }
};

module.exports = exports;
