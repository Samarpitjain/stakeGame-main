// routes/fairnessRoutes.js
const express = require('express');
const router = express.Router();
const fairnessController = require('../controllers/fairnessController');

// Verify fairness with custom seeds (independent verification)
router.post('/verify', fairnessController.verifyFairness);

// Verify a specific game by ID (after seed rotation)
router.get('/verify-game/:gameId', fairnessController.verifyGameById);

// Batch verify multiple games
router.post('/batch-verify', fairnessController.batchVerifyGames);

module.exports = router;