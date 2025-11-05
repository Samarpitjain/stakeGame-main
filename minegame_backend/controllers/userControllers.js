// controllers/userController.js
const User = require('../models/User');

// Get or create user
exports.getUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    let user = await User.findOne({ userId });
    
    if (!user) {
      user = new User({ 
        userId, 
        username: userId, 
        balance: 1000 
      });
      await user.save();
    }

    res.json({
      userId: user.userId,
      username: user.username,
      balance: user.balance,
      seeds: {
        serverSeedHash: user.serverSeedHash,
        clientSeed: user.clientSeed,
        nonce: user.nonce
      },
      stats: {
        totalWagered: user.totalWagered,
        totalProfit: user.totalProfit,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        gamesLost: user.gamesLost
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Add funds (demo only)
exports.addFunds = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount = 1000 } = req.body;

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.updateBalance(amount);
    await user.save();

    res.json({
      success: true,
      balance: user.balance,
      message: `Added ${amount} to balance`
    });
  } catch (error) {
    console.error('Add funds error:', error);
    res.status(500).json({ error: 'Failed to add funds' });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const winRate = user.gamesPlayed > 0 
      ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2)
      : 0;

    res.json({
      userId: user.userId,
      username: user.username,
      balance: user.balance,
      stats: {
        totalWagered: user.totalWagered,
        totalProfit: user.totalProfit,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        gamesLost: user.gamesLost,
        winRate: `${winRate}%`
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
};

module.exports = {
  getUser: exports.getUser,
  addFunds: exports.addFunds,
  getUserStats: exports.getUserStats
};