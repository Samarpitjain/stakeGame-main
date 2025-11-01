// routes/fairnessRoutes.js
const express = require('express');
const router = express.Router();
const fairnessController = require('../controllers/fairnessController');

// Verify fairness with custom seeds
router.post('/verify', fairnessController.verifyFairness);

// Generate new server seed
router.get('/new-seed', fairnessController.generateNewServerSeed);

// Verify a specific game by ID
router.get('/verify-game/:gameId', fairnessController.verifyGameById);

module.exports = router;