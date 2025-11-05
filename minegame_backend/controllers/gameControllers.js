// controllers/gameController.js
const Game = require('../models/Game');
const User = require('../models/User');
const {
  generateMinePositions,
  verifyMinePositions,
  calculateMultiplier,
  sha256
} = require('../utils/seedUtils');

// 🎮 CREATE GAME (Like Stake - Server seed stays hidden)
exports.createGame = async (req, res) => {
  try {
    const { userId, betAmount, minesCount } = req.body;

    // Validation
    if (!userId || !betAmount || !minesCount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (betAmount < 1 || minesCount < 1 || minesCount > 24) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    // Get or create user
    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId, username: userId, balance: 1000 });
      await user.save();
    }

    // Check balance
    if (user.balance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const gridSize = 25;
    
    // ⚠️ CRITICAL FIX: Use CURRENT nonce BEFORE incrementing
    const gameNonce = user.nonce;
    
    console.log('🎮 CREATE GAME - SEED INFO:');
    console.log('Server Seed (Hidden):', user.serverSeed);
    console.log('Server Seed Hash:', user.serverSeedHash);
    console.log('Client Seed:', user.clientSeed);
    console.log('Nonce (CURRENT):', gameNonce);
    
    // Generate mine positions using CURRENT seed pair + nonce
    const minePositions = generateMinePositions(
      user.serverSeed,
      user.clientSeed,
      gameNonce, // Use current nonce
      gridSize,
      minesCount
    );
    
    console.log('Generated Mine Positions:', minePositions);

    // Create game with HIDDEN server seed
    const game = new Game({
      userId,
      betAmount,
      minesCount,
      gridSize,
      serverSeed: user.serverSeed, // Stored but NOT revealed
      serverSeedHash: user.serverSeedHash,
      clientSeed: user.clientSeed,
      nonce: gameNonce, // Store the nonce that was ACTUALLY USED
      minePositions,
      status: 'active',
      currentMultiplier: 1.0
    });

    await game.save();
    
    console.log('Game Created with ID:', game._id);
    console.log('Game Nonce Stored:', game.nonce);
    
    // Deduct bet amount
    user.updateBalance(-betAmount);
    
    // NOW increment nonce for NEXT game (AFTER storing current one)
    user.incrementNonce();
    await user.save();
    
    console.log('User Nonce AFTER increment (for next game):', user.nonce);
    console.log('─────────────────────────────────────────\n');

    // Response WITHOUT unhashed server seed
    res.status(201).json({
      success: true,
      game: {
        _id: game._id,
        betAmount: game.betAmount,
        minesCount: game.minesCount,
        gridSize: game.gridSize,
        serverSeedHash: game.serverSeedHash, // Only hash shown
        clientSeed: game.clientSeed,
        nonce: game.nonce, // The nonce USED for this game
        currentMultiplier: game.currentMultiplier,
        status: game.status
      },
      balance: user.balance,
      nextNonce: user.nonce // Next nonce for next game
    });
  } catch (error) {
    console.error('❌ Create game error:', error);
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
    if (!game || game.status !== 'active') {
      return res.status(400).json({ error: 'Invalid game state' });
    }

    if (game.revealedTiles.includes(tileIndex)) {
      return res.status(400).json({ error: 'Tile already revealed' });
    }

    console.log(`\n🎯 REVEAL TILE ${tileIndex} - Game ${gameId}`);

    const isMine = game.minePositions.includes(tileIndex);

    if (isMine) {
      console.log('💥 HIT A MINE!');
      
      // HIT A MINE - Game Lost
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
          minePositions: game.minePositions,
        },
        balance: user ? user.balance : 0
      });
    } else {
      console.log('✅ Safe tile!');
      
      // Safe tile revealed
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
    console.error('❌ Reveal tile error:', error);
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

    console.log(`\n💰 CASHOUT - Game ${gameId}`);

    const payout = game.betAmount * game.currentMultiplier;
    const profit = payout - game.betAmount;

    console.log('Payout Amount:', payout);
    console.log('Profit:', profit);

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
        minePositions: game.minePositions,
      },
      balance: user ? user.balance : 0
    });
  } catch (error) {
    console.error('❌ Cashout error:', error);
    res.status(500).json({ error: 'Failed to cash out' });
  }
};

// 🔄 ROTATE SEED PAIR (Like Stake's "Next Server Seed" button)
exports.rotateSeedPair = async (req, res) => {
  try {
    const { userId } = req.params;
    const { clientSeed } = req.body;

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('\n🔄 ROTATING SEED PAIR');
    console.log('─────────────────────────────────────────');
    console.log('BEFORE ROTATION:');
    console.log('Current Server Seed (will be revealed):', user.serverSeed);
    console.log('Current Server Seed Hash:', user.serverSeedHash);
    console.log('Current Client Seed:', user.clientSeed);
    console.log('Current Nonce:', user.nonce);
    console.log('─────────────────────────────────────────');

    // Rotate and get revealed seed
    const rotation = user.rotateSeedPair(clientSeed);
    await user.save();

    console.log('AFTER ROTATION:');
    console.log('Revealed Server Seed (previous):', rotation.revealedServerSeed);
    console.log('New Server Seed (hidden):', user.serverSeed);
    console.log('New Server Seed Hash:', rotation.newServerSeedHash);
    console.log('New Client Seed:', rotation.newClientSeed);
    console.log('New Nonce:', rotation.newNonce);
    console.log('─────────────────────────────────────────\n');

    res.json({
      success: true,
      message: 'Seed pair rotated successfully',
      revealed: {
        serverSeed: rotation.revealedServerSeed, // 🔓 NOW REVEALED!
        serverSeedHash: user.previousServerSeedHash,
        clientSeed: user.previousClientSeed,
        finalNonce: user.previousNonce
      },
      next: {
        serverSeedHash: rotation.newServerSeedHash,
        clientSeed: rotation.newClientSeed,
        nonce: rotation.newNonce
      }
    });
  } catch (error) {
    console.error('❌ Rotate seed error:', error);
    res.status(500).json({ error: 'Failed to rotate seed pair' });
  }
};

// 📊 GET CURRENT SEEDS (Without revealing server seed)
exports.getCurrentSeeds = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('\n📊 GET CURRENT SEEDS');
    console.log('Current Server Seed Hash:', user.serverSeedHash);
    console.log('Current Client Seed:', user.clientSeed);
    console.log('Current Nonce:', user.nonce);
    if (user.previousServerSeed) {
      console.log('Previous Server Seed (Revealed):', user.previousServerSeed);
    }
    console.log('─────────────────────────────────────────\n');

    res.json({
      current: {
        serverSeedHash: user.serverSeedHash,
        clientSeed: user.clientSeed,
        nonce: user.nonce
      },
      previous: user.previousServerSeed ? {
        serverSeed: user.previousServerSeed,
        serverSeedHash: user.previousServerSeedHash,
        clientSeed: user.previousClientSeed,
        finalNonce: user.previousNonce
      } : null
    });
  } catch (error) {
    console.error('❌ Get seeds error:', error);
    res.status(500).json({ error: 'Failed to get seeds' });
  }
};

// ✏️ UPDATE CLIENT SEED (User can change anytime)
exports.updateClientSeed = async (req, res) => {
  try {
    const { userId } = req.params;
    const { clientSeed } = req.body;

    if (!clientSeed || clientSeed.length < 1) {
      return res.status(400).json({ error: 'Invalid client seed' });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('\n✏️ UPDATE CLIENT SEED');
    console.log('Old Client Seed:', user.clientSeed);
    console.log('New Client Seed:', clientSeed);
    console.log('─────────────────────────────────────────\n');

    user.clientSeed = clientSeed;
    await user.save();

    res.json({
      success: true,
      clientSeed: user.clientSeed,
      message: 'Client seed updated successfully'
    });
  } catch (error) {
    console.error('❌ Update client seed error:', error);
    res.status(500).json({ error: 'Failed to update client seed' });
  }
};

// 🎲 GET GAME DETAILS
exports.getGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findById(gameId);
    
    if (!game) {
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
      response.minePositions = game.minePositions;
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Get game error:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
};

// 📜 GAME HISTORY
exports.getGameHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, skip = 0 } = req.query;

    const games = await Game.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('-serverSeed');

    const total = await Game.countDocuments({ userId });
    
    res.json({ 
      games, 
      total, 
      limit: parseInt(limit), 
      skip: parseInt(skip) 
    });
  } catch (error) {
    console.error('❌ Get history error:', error);
    res.status(500).json({ error: 'Failed to get game history' });
  }
};

// ✅ VERIFY GAME (After rotation reveals server seed)
exports.verifyGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status === 'active') {
      return res.status(400).json({ 
        error: 'Cannot verify active game' 
      });
    }

    const user = await User.findOne({ userId: game.userId });
    
    console.log('\n✅ VERIFY GAME:', gameId);
    console.log('─────────────────────────────────────────');
    console.log('Game Nonce:', game.nonce);
    console.log('Game Client Seed:', game.clientSeed);
    console.log('Game Server Seed Hash:', game.serverSeedHash);
    console.log('Game Mine Positions:', game.minePositions);
    console.log('─────────────────────────────────────────');
    
    // Check if this game's seed has been revealed
    const isRevealed = user.previousServerSeed && 
                       user.previousNonce >= game.nonce;

    console.log('Previous Server Seed:', user.previousServerSeed);
    console.log('Previous Nonce:', user.previousNonce);
    console.log('Is Revealed:', isRevealed);

    if (!isRevealed) {
      console.log('❌ Seed not yet revealed\n');
      return res.json({
        verified: false,
        message: 'Server seed not yet revealed. Rotate your seed pair to verify this game.',
        canVerify: false
      });
    }

    // Verify using revealed seed
    const computedHash = sha256(user.previousServerSeed);
    const hashMatches = computedHash === game.serverSeedHash;
    
    console.log('Computed Hash:', computedHash);
    console.log('Hash Matches:', hashMatches);
    
    const regeneratedPositions = generateMinePositions(
      user.previousServerSeed,
      game.clientSeed,
      game.nonce,
      game.gridSize,
      game.minesCount
    );
    
    console.log('Regenerated Mine Positions:', regeneratedPositions);
    
    const positionsMatch = verifyMinePositions(
      user.previousServerSeed,
      game.clientSeed,
      game.nonce,
      game.gridSize,
      game.minesCount,
      game.minePositions
    );
    
    console.log('Positions Match:', positionsMatch);
    console.log('─────────────────────────────────────────\n');

    res.json({
      verified: hashMatches && positionsMatch,
      canVerify: true,
      serverSeed: user.previousServerSeed,
      serverSeedHash: game.serverSeedHash,
      computedHash,
      hashMatches,
      positionsMatch,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      minePositions: game.minePositions,
      regeneratedPositions
    });
  } catch (error) {
    console.error('❌ Verify game error:', error);
    res.status(500).json({ error: 'Failed to verify game' });
  }
};

module.exports = exports;