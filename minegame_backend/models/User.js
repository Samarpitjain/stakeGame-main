// models/User.js
const mongoose = require('mongoose');
const { generateServerSeed, sha256 } = require('../utils/seedUtils');

const userSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  username: { 
    type: String, 
    required: true 
  },
  balance: { 
    type: Number, 
    default: 1000 
  },
  
  // Current active seed pair (HIDDEN from user until rotation)
  serverSeed: { 
    type: String, 
    required: true 
  },
  serverSeedHash: { 
    type: String, 
    required: true 
  },
  clientSeed: { 
    type: String, 
    required: true,
    default: function() {
      return Math.random().toString(36).substring(2, 15);
    }
  },
  nonce: { 
    type: Number, 
    default: 0 
  },
  
  // Previous seed pair (revealed after rotation)
  previousServerSeed: { 
    type: String 
  },
  previousServerSeedHash: { 
    type: String 
  },
  previousClientSeed: { 
    type: String 
  },
  previousNonce: { 
    type: Number 
  },
  
  // Statistics
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
  }
}, {
  timestamps: true
});

// Initialize user with first server seed BEFORE validation
userSchema.pre('validate', function(next) {
  if (this.isNew && !this.serverSeed) {
    this.serverSeed = generateServerSeed();
    this.serverSeedHash = sha256(this.serverSeed);
  }
  next();
});

// Update balance
userSchema.methods.updateBalance = function(amount) {
  this.balance += amount;
  return this.balance;
};

// Increment nonce after each game
userSchema.methods.incrementNonce = function() {
  this.nonce += 1;
  return this.nonce;
};

// Rotate seed pair (like Stake's "Next Server Seed" button)
userSchema.methods.rotateSeedPair = function(newClientSeed = null) {
  // Save current seeds as previous (now revealed)
  this.previousServerSeed = this.serverSeed;
  this.previousServerSeedHash = this.serverSeedHash;
  this.previousClientSeed = this.clientSeed;
  this.previousNonce = this.nonce;
  
  // Generate new seed pair
  this.serverSeed = generateServerSeed();
  this.serverSeedHash = sha256(this.serverSeed);
  this.clientSeed = newClientSeed || Math.random().toString(36).substring(2, 15);
  this.nonce = 0; // Reset nonce for new seed pair
  
  return {
    revealedServerSeed: this.previousServerSeed,
    newServerSeedHash: this.serverSeedHash,
    newClientSeed: this.clientSeed,
    newNonce: this.nonce
  };
};

// Record game result
userSchema.methods.recordGameResult = function(wagered, profit, won) {
  this.totalWagered += wagered;
  this.totalProfit += profit;
  this.gamesPlayed += 1;
  if (won) {
    this.gamesWon += 1;
  } else {
    this.gamesLost += 1;
  }
};

module.exports = mongoose.model('User', userSchema);