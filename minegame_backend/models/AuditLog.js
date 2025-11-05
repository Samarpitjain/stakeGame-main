// models/AuditLog.js - Complete activity tracking
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true,
    index: true
  },
  
  action: { 
    type: String, 
    required: true,
    enum: [
      'user_created',
      'game_created',
      'tile_revealed',
      'game_cashed_out',
      'game_lost',
      'seed_rotated',
      'client_seed_updated',
      'balance_updated',
      'game_verified',
      'suspicious_activity',
      'user_blocked',
      'api_error'
    ],
    index: true
  },
  
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Security tracking
  ipAddress: { 
    type: String 
  },
  userAgent: { 
    type: String 
  },
  
  // Request details
  endpoint: { 
    type: String 
  },
  method: { 
    type: String 
  },
  
  // Results
  success: { 
    type: Boolean, 
    default: true 
  },
  errorMessage: { 
    type: String 
  },
  
  // Performance
  responseTime: { 
    type: Number  // in milliseconds
  }
}, {
  timestamps: true
});

// Indexes for querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ success: 1 });
auditLogSchema.index({ createdAt: -1 });

// Auto-delete old logs after 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Static method to create log entry
auditLogSchema.statics.log = async function(data) {
  try {
    await this.create(data);
    console.log(`📝 [AUDIT] ${data.action} | User: ${data.userId} | Success: ${data.success}`);
  } catch (error) {
    console.error('❌ [AUDIT] Failed to create log:', error.message);
  }
};

module.exports = mongoose.model('AuditLog', auditLogSchema);