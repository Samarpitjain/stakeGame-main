const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameControllers');

// Create new game
router.post('/create', gameController.createGame);

// Reveal a tile
router.post('/:gameId/reveal', gameController.revealTile);

// Cash out
router.post('/:gameId/cashout', gameController.cashout);

// Get game details
router.get('/:gameId', gameController.getGame);

// Get game history for user
router.get('/history/:userId', gameController.getGameHistory);

// Verify game fairness
router.post('/:gameId/verify', gameController.verifyGame);

module.exports = router;