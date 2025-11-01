
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userControllers');

// Get or create user
router.get('/:userId', userController.getUser);

// Add funds (demo)
router.post('/:userId/add-funds', userController.addFunds);

// Get user statistics
router.get('/:userId/stats', userController.getUserStats);

module.exports = router;