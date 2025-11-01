const User = require('../models/User');

/**
 * Get or create user
 * GET /api/users/:userId
 */
exports.getUser = async (req, res) => {
  console.log('📩 [GET USER] Request received');
  try {
    const { userId } = req.params;
    console.log(`➡️ Extracted userId: ${userId}`);

    console.log('🔍 Searching user in database...');
    let user = await User.findOne({ userId });

    if (!user) {
      console.log('⚠️ User not found — creating new user...');
      user = new User({
        userId,
        username: userId,
        balance: 1000
      });
      console.log('🆕 New user object created:', user);
      await user.save();
      console.log('💾 New user saved successfully');
    } else {
      console.log('✅ Existing user found:', user);
    }

    console.log('📤 Sending response to client...');
    res.json({
      userId: user.userId,
      username: user.username,
      balance: user.balance,
      totalWagered: user.totalWagered,
      totalProfit: user.totalProfit,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      lastActive: user.lastActive
    });
    console.log('✅ [GET USER] Response sent successfully');
  } catch (error) {
    console.error('❌ [GET USER] Error occurred:', error);
    res.status(500).json({ error: 'Failed to get user', details: error.message });
  }
};

/**
 * Update user balance (demo fund add)
 * POST /api/users/:userId/add-funds
 */
exports.addFunds = async (req, res) => {
  console.log('📩 [ADD FUNDS] Request received');
  try {
    const { userId } = req.params;
    const { amount = 1000 } = req.body;

    console.log(`➡️ Extracted userId: ${userId}`);
    console.log(`💰 Requested amount to add: ${amount}`);

    if (amount < 0) {
      console.log('⚠️ Invalid amount — must be positive');
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    console.log('🔍 Searching user in database...');
    let user = await User.findOne({ userId });

    if (!user) {
      console.log('⚠️ User not found — creating new user with given funds...');
      user = new User({
        userId,
        username: userId,
        balance: amount
      });
    } else {
      console.log('✅ User found — updating balance...');
      user.addFunds(amount);
      console.log(`💸 Funds added. New balance: ${user.balance}`);
    }

    console.log('💾 Saving user...');
    await user.save();
    console.log('✅ User saved successfully');

    console.log('📤 Sending response to client...');
    res.json({
      success: true,
      balance: user.balance,
      amountAdded: amount
    });
    console.log('✅ [ADD FUNDS] Response sent successfully');
  } catch (error) {
    console.error('❌ [ADD FUNDS] Error occurred:', error);
    res.status(500).json({ error: 'Failed to add funds', details: error.message });
  }
};

/**
 * Get user statistics
 * GET /api/users/:userId/stats
 */
exports.getUserStats = async (req, res) => {
  console.log('📩 [GET USER STATS] Request received');
  try {
    const { userId } = req.params;
    console.log(`➡️ Extracted userId: ${userId}`);

    console.log('🔍 Searching user in database...');
    const user = await User.findOne({ userId });

    if (!user) {
      console.log('⚠️ User not found — sending 404');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('📊 Calculating statistics...');
    const winRate = user.gamesPlayed > 0
      ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2)
      : 0;

    console.log('📈 Computed winRate:', winRate + '%');

    console.log('📤 Sending response to client...');
    res.json({
      userId: user.userId,
      username: user.username,
      balance: user.balance,
      statistics: {
        totalWagered: user.totalWagered,
        totalProfit: user.totalProfit,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        gamesLost: user.gamesLost,
        winRate: `${winRate}%`,
        lastActive: user.lastActive
      }
    });
    console.log('✅ [GET USER STATS] Response sent successfully');
  } catch (error) {
    console.error('❌ [GET USER STATS] Error occurred:', error);
    res.status(500).json({ error: 'Failed to get user stats', details: error.message });
  }
};

module.exports = exports;
