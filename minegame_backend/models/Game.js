const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  betAmount: {
    type: Number,
    required: true,
    min: 1
  },
  minesCount: {
    type: Number,
    required: true,
    min: 1,
    max: 24
  },
  gridSize: {
    type: Number,
    default: 25
  },
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
    required: true,
    default: 0
  },
  minePositions: {
    type: [Number],
    required: true
  },
  revealedTiles: {
    type: [Number],
    default: []
  },
  currentMultiplier: {
    type: Number,
    default: 1.0
  },
  status: {
    type: String,
    enum: ['active', 'won', 'lost', 'cashed_out'],
    default: 'active'
  },
  payoutAmount: {
    type: Number,
    default: 0
  },
  profit: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date
  },
  isServerSeedRevealed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster queries
gameSchema.index({ userId: 1, createdAt: -1 });
gameSchema.index({ status: 1 });

// Method to reveal server seed after game ends
gameSchema.methods.revealServerSeed = function() {
  this.isServerSeedRevealed = true;
  return this.serverSeed;
};

// Method to calculate multiplier based on revealed tiles
gameSchema.methods.calculateMultiplier = function() {
  const opened = this.revealedTiles.length;
  const total = this.gridSize;
  const mines = this.minesCount;
  const remainingCells = total - opened;
  const remainingSafe = (total - mines) - opened;
  
  if (remainingSafe <= 0) return this.currentMultiplier;
  
  // Risk bonus calculation (matches frontend)
  const riskStep = 0.5;
  const baseMines = 1;
  const riskBonus = Math.max(0, 1 + riskStep * (mines - baseMines));
  
  const step = (remainingCells / remainingSafe) * riskBonus;
  return this.currentMultiplier * step;
};

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;