const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  balance: {
    type: Number,
    default: 1000,
    min: 0
  },
  totalWagered: {
    type: Number,
    default: 0
  },
  totalProfit: {
    type: Number,
    default: 0
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  gamesWon: {
    type: Number,
    default: 0
  },
  gamesLost: {
    type: Number,
    default: 0
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Method to update balance
userSchema.methods.updateBalance = function(amount) {
  this.balance += amount;
  if (this.balance < 0) this.balance = 0;
  return this.balance;
};

// Method to add funds (demo)
userSchema.methods.addFunds = function(amount) {
  this.balance += amount;
  return this.balance;
};

// Method to record game result
userSchema.methods.recordGameResult = function(betAmount, profit, won) {
  this.totalWagered += betAmount;
  this.totalProfit += profit;
  this.gamesPlayed += 1;
  if (won) {
    this.gamesWon += 1;
  } else {
    this.gamesLost += 1;
  }
  this.lastActive = Date.now();
};

const User = mongoose.model('User', userSchema);

module.exports = User;