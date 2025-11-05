// models/Game.js
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // Game configuration
  betAmount: { 
    type: Number, 
    required: true 
  },
  minesCount: { 
    type: Number, 
    required: true 
  },
  gridSize: { 
    type: Number, 
    default: 25 
  },
  
  // Provably fair seeds (serverSeed stays HIDDEN until rotation)
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
    required: true 
  },
  nonce: { 
    type: Number, 
    required: true 
  },
  
  // Game state
  minePositions: [{ 
    type: Number 
  }],
  revealedTiles: [{ 
    type: Number 
  }],
  status: { 
    type: String, 
    enum: ['active', 'cashed_out', 'lost'],
    default: 'active'
  },
  
  // Game results
  currentMultiplier: { 
    type: Number, 
    default: 1.0 
  },
  payoutAmount: { 
    type: Number, 
    default: 0 
  },
  profit: { 
    type: Number, 
    default: 0 
  },
  
  // Timestamps
  startedAt: { 
    type: Date, 
    default: Date.now 
  },
  endedAt: { 
    type: Date 
  }
}, {
  timestamps: true
});

// Index for faster queries
gameSchema.index({ userId: 1, createdAt: -1 });
gameSchema.index({ status: 1 });

module.exports = mongoose.model('Game', gameSchema);