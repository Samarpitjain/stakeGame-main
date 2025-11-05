// middleware/security.js - Fort Knox Security
const AuditLog = require('../models/AuditLog');

// 🕵️ Track request metadata
const requestMetadata = (req, res, next) => {
  req.metadata = {
    startTime: Date.now(),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') || 'unknown'
  };
  next();
};

// 🚫 Prevent server seed exposure in any query
const preventSeedExposure = (req, res, next) => {
  const dangerousParams = ['serverSeed', 'encryptedServerSeed', 'previousEncryptedSeed'];
  
  // Check query params
  for (const param of dangerousParams) {
    if (req.query[param] || req.body[param]) {
      console.log(`🚨 [SECURITY] Attempted server seed exposure by IP: ${req.metadata.ipAddress}`);
      
      AuditLog.log({
        userId: req.body.userId || req.params.userId || 'unknown',
        action: 'suspicious_activity',
        details: { 
          reason: 'Attempted server seed exposure',
          param,
          endpoint: req.originalUrl
        },
        ipAddress: req.metadata.ipAddress,
        userAgent: req.metadata.userAgent,
        endpoint: req.originalUrl,
        method: req.method,
        success: false
      });
      
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Access denied'
      });
    }
  }
  
  next();
};

// ⏱️ Rate limiting per user
const userRateLimits = new Map();

const userRateLimit = (maxRequests = 20, windowMs = 60000) => {
  return (req, res, next) => {
    const userId = req.body.userId || req.params.userId;
    
    if (!userId) {
      return next();
    }
    
    const now = Date.now();
    const userKey = `${userId}:${req.originalUrl}`;
    
    if (!userRateLimits.has(userKey)) {
      userRateLimits.set(userKey, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const limit = userRateLimits.get(userKey);
    
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    
    if (limit.count >= maxRequests) {
      console.log(`🚨 [SECURITY] Rate limit exceeded for user ${userId} on ${req.originalUrl}`);
      
      AuditLog.log({
        userId,
        action: 'suspicious_activity',
        details: { 
          reason: 'Rate limit exceeded',
          endpoint: req.originalUrl,
          attempts: limit.count
        },
        ipAddress: req.metadata.ipAddress,
        userAgent: req.metadata.userAgent,
        endpoint: req.originalUrl,
        method: req.method,
        success: false
      });
      
      return res.status(429).json({ 
        error: 'Too many requests',
        message: 'Please slow down'
      });
    }
    
    limit.count++;
    next();
  };
};

// 🔍 Detect suspicious patterns
const suspiciousPatternDetection = async (req, res, next) => {
  const userId = req.body.userId || req.params.userId;
  
  if (!userId) {
    return next();
  }
  
  // Store in request for use in controllers
  req.suspiciousPatterns = {
    rapidRequests: false,
    unusualEndpoint: false,
    suspiciousUserAgent: false
  };
  
  // Check for bot-like user agent
  const userAgent = req.metadata.userAgent.toLowerCase();
  if (userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.includes('scraper')) {
    req.suspiciousPatterns.suspiciousUserAgent = true;
    console.log(`🤖 [SECURITY] Bot detected: ${userAgent}`);
  }
  
  next();
};

// 🛡️ Block banned users
const checkUserBlock = async (req, res, next) => {
  const userId = req.body.userId || req.params.userId;
  
  if (!userId) {
    return next();
  }
  
  try {
    const User = require('../models/User');
    const user = await User.findOne({ userId }).select('isBlocked blockReason');
    
    if (user && user.isBlocked) {
      console.log(`🔒 [SECURITY] Blocked user ${userId} attempted access`);
      
      AuditLog.log({
        userId,
        action: 'suspicious_activity',
        details: { 
          reason: 'Blocked user attempted access',
          blockReason: user.blockReason
        },
        ipAddress: req.metadata.ipAddress,
        userAgent: req.metadata.userAgent,
        endpoint: req.originalUrl,
        method: req.method,
        success: false
      });
      
      return res.status(403).json({ 
        error: 'Account blocked',
        message: 'Your account has been blocked. Please contact support.'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ [SECURITY] Error checking user block:', error);
    next();
  }
};

// 📊 Response logger
const responseLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    const responseTime = Date.now() - req.metadata.startTime;
    
    console.log(`📡 [${req.method}] ${req.originalUrl} | ${res.statusCode} | ${responseTime}ms | IP: ${req.metadata.ipAddress}`);
    
    // Log to database for critical endpoints
    if (req.originalUrl.includes('/create') || req.originalUrl.includes('/cashout') || req.originalUrl.includes('/rotate')) {
      const userId = req.body.userId || req.params.userId || 'unknown';
      
      AuditLog.log({
        userId,
        action: req.originalUrl.includes('/create') ? 'game_created' : 
                req.originalUrl.includes('/cashout') ? 'game_cashed_out' : 'seed_rotated',
        details: { 
          statusCode: res.statusCode,
          responseTime 
        },
        ipAddress: req.metadata.ipAddress,
        userAgent: req.metadata.userAgent,
        endpoint: req.originalUrl,
        method: req.method,
        success: res.statusCode < 400,
        responseTime
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// 🔐 Sanitize sensitive data from responses (last line of defense)
const sanitizeResponse = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Remove any accidental server seed exposure
    if (data && typeof data === 'object') {
      delete data.serverSeed;
      delete data.encryptedServerSeed;
      delete data.previousEncryptedSeed;
      
      // Recursively sanitize nested objects
      const sanitize = (obj) => {
        if (obj && typeof obj === 'object') {
          delete obj.serverSeed;
          delete obj.encryptedServerSeed;
          delete obj.previousEncryptedSeed;
          
          Object.keys(obj).forEach(key => {
            if (typeof obj[key] === 'object') {
              sanitize(obj[key]);
            }
          });
        }
      };
      
      sanitize(data);
    }
    
    originalJson.call(this, data);
  };
  
  next();
};

// 🚨 Error handler with logging
const errorHandler = async (err, req, res, next) => {
  console.error('❌ [ERROR]', err);
  
  const userId = req.body.userId || req.params.userId || 'unknown';
  
  await AuditLog.log({
    userId,
    action: 'api_error',
    details: { 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    ipAddress: req.metadata?.ipAddress,
    userAgent: req.metadata?.userAgent,
    endpoint: req.originalUrl,
    method: req.method,
    success: false,
    errorMessage: err.message
  });
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  requestMetadata,
  preventSeedExposure,
  userRateLimit,
  suspiciousPatternDetection,
  checkUserBlock,
  responseLogger,
  sanitizeResponse,
  errorHandler
};