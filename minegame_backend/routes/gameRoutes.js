// routes/gameRoutes.js
const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameControllers');

// 🎮 Game Management
router.post('/create', gameController.createGame);
router.post('/:gameId/reveal', gameController.revealTile);
router.post('/:gameId/cashout', gameController.cashout);
router.get('/:gameId', gameController.getGame);
router.get('/history/:userId', gameController.getGameHistory);

// 🔐 Provably Fair (Stake-like)
router.get('/seeds/:userId', gameController.getCurrentSeeds);
router.post('/seeds/:userId/rotate', gameController.rotateSeedPair);
router.post('/seeds/:userId/client', gameController.updateClientSeed);
router.post('/:gameId/verify', gameController.verifyGame);

module.exports = router;