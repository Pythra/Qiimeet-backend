const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const auth = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Create a new transaction
router.post('/', transactionController.createTransaction);

// Get user's transactions with pagination
router.get('/', transactionController.getUserTransactions);

// Get specific transaction by ID
router.get('/:id', transactionController.getTransactionById);

// Update transaction status
router.patch('/:id/status', transactionController.updateTransactionStatus);

// Get user balance
router.get('/balance/current', transactionController.getUserBalance);

// Deduct balance and create a transaction (for connection payment)
router.post('/deduct', transactionController.deductBalanceForConnection);

module.exports = router;