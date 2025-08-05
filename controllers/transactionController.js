const Transaction = require('../models/Transaction');
const User = require('../models/User');

// Create a new transaction
const createTransaction = async (req, res) => {
  try {
    const { amount, description, type, reference, paymentMethod, metadata } = req.body;
    const userId = req.userId; // Fixed to use req.userId from auth middleware

    // Validate required fields
    if (!amount || !description || !type) {
      return res.status(400).json({ error: 'Amount, description, and type are required' });
    }

    // Prevent duplicate transaction by reference
    if (reference) {
      const existing = await Transaction.findOne({ reference });
      if (existing) {
        return res.status(409).json({ error: 'Transaction with this reference already exists' });
      }
    }

    // Create transaction
    const transaction = new Transaction({
      user: userId,
      amount,
      description,
      type,
      reference,
      paymentMethod,
      metadata
    });

    await transaction.save();

    // Update user balance if transaction is completed
    if (transaction.status === 'completed') {
      await updateUserBalance(userId, amount, type);
    }

    res.status(201).json({
      success: true,
      transaction: transaction
    });

  } catch (error) {
    // Handle duplicate key error for reference
    if (error.code === 11000 && error.keyPattern && error.keyPattern.reference) {
      return res.status(409).json({ error: 'Duplicate transaction reference' });
    }
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
};

// Get user's transactions
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.userId; // Fixed to use req.userId from auth middleware
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments({ user: userId });

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
};

// Get transaction by ID
const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId; // Fixed to use req.userId from auth middleware

    const transaction = await Transaction.findOne({ _id: id, user: userId });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({
      success: true,
      transaction
    });

  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
};

// Update transaction status
const updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.userId; // Fixed to use req.userId from auth middleware

    const transaction = await Transaction.findOne({ _id: id, user: userId });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const oldStatus = transaction.status;
    transaction.status = status;

    // Update user balance if status changes to completed
    if (status === 'completed' && oldStatus !== 'completed') {
      await updateUserBalance(userId, transaction.amount, transaction.type);
    }

    await transaction.save();

    res.json({
      success: true,
      transaction
    });

  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
};

// Get user balance
const getUserBalance = async (req, res) => {
  try {
    const userId = req.userId; // Fixed to use req.userId from auth middleware

    const user = await User.findById(userId).select('balance');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      balance: user.balance
    });

  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
};

// Helper function to update user balance
const updateUserBalance = async (userId, amount, type) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    if (type === 'credit') {
      user.balance += amount;
    } else if (type === 'debit') {
      user.balance = Math.max(0, user.balance - amount);
    }

    await user.save();
  } catch (error) {
    console.error('Update balance error:', error);
  }
};

// Add this function at the end of the file (and export it)
const deductBalanceForConnection = async (req, res) => {
  try {
    const userId = req.userId;
    const { amount, planTitle, connectionsToAdd } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    if (!connectionsToAdd || connectionsToAdd <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid number of connections' });
    }

    // Fetch user and check balance
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // Check allowedConnections limit
    const maxConnections = 3;
    if (user.allowedConnections + connectionsToAdd > maxConnections) {
      return res.status(400).json({ success: false, message: `You can only have up to ${maxConnections} allowed connections.` });
    }

    // Deduct balance
    user.balance -= amount;
    user.allowedConnections += connectionsToAdd;
    user.availableConnectionsLeftToBuy = Math.max(0, user.availableConnectionsLeftToBuy - connectionsToAdd);
    await user.save();

    // Create transaction record
    const transaction = await Transaction.create({
      user: userId,
      amount,
      type: 'debit',
      description: `Connection payment: ${planTitle || 'Connection'}`,
      paymentMethod: 'wallet',
      metadata: {
        source: 'connection_payment',
        plan: planTitle,
        connectionsAdded: connectionsToAdd
      }
    });

    res.json({ success: true, balance: user.balance, allowedConnections: user.allowedConnections, remainingConnections: user.remainingConnections, transaction });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

module.exports = {
  createTransaction,
  getUserTransactions,
  getTransactionById,
  updateTransactionStatus,
  getUserBalance,
  deductBalanceForConnection
};