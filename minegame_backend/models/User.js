const mongoose = require('mongoose');
const { generateServerSeed, sha256 } = require('../utils/seedUtils');

const userSchema = new mongoose.Schema({
  serverSeed: {
    type: String,
    default: () => generateServerSeed()
  },
  serverSeedHash: {
    type: String
  },
  clientSeed: {
    type: String,
    default: 'default-client-seed'
  },
  nonce: {
    type: Number,
    default: 0
  },
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
  this.nonce += 1;
  if (won) {
    this.gamesWon += 1;
  } else {
    this.gamesLost += 1;
  }
  this.lastActive = Date.now();
};

// Method to rotate seed pair
userSchema.methods.rotateSeedPair = function(newClientSeed) {
  this.serverSeed = generateServerSeed();
  this.serverSeedHash = sha256(this.serverSeed);
  if (newClientSeed) this.clientSeed = newClientSeed;
  this.nonce = 0;
};

// Pre-save hook to ensure serverSeedHash is set
userSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('serverSeed')) {
    this.serverSeedHash = sha256(this.serverSeed);
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;