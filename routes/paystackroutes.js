const express = require('express');
const axios = require('axios');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const crypto = require('crypto');

// POST /api/paystack/init
router.post('/init', async (req, res) => {
  const { email, amount, userId } = req.body;

  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }

  const headers = {
    Authorization: `Bearer sk_test_4d98bfc2ab0ff20be5d6fbcad8bea103372d7e29`,
    'Content-Type': 'application/json'
  };

  const payload = {
    email,
    amount, // already in kobo
    callback_url: `https://expo.dev/redirect?to=qiimeet://payment/success?userId=${userId || ''}`,
    metadata: {
      userId: userId || '',
      custom_fields: [
        {
          display_name: "User ID",
          variable_name: "user_id",
          value: userId || ''
        }
      ]
    }
  };

  try {
    const response = await axios.post('https://api.paystack.co/transaction/initialize', 
      payload, { headers });
    
    res.json({ 
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference
    });
  } catch (error) {
    console.error('Paystack init error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

// POST /api/paystack/verify
router.post('/verify', async (req, res) => {
  const { reference, userId } = req.body;

  if (!reference) {
    return res.status(400).json({ error: 'Reference is required' });
  }

  try {
    console.log('Starting verification for reference:', reference);
    
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer sk_test_4d98bfc2ab0ff20be5d6fbcad8bea103372d7e29`
      }
    });

    const data = response.data.data;
    console.log('Paystack verification response:', { status: data.status, amount: data.amount });

    if (data.status === 'success') {
      // Get user ID from request body, auth middleware, or try to find by email
      let userToUpdate = null;
      let userIdToUse = null;

      if (userId) {
        // User ID provided in request body
        userIdToUse = userId;
        userToUpdate = await User.findById(userId);
        console.log('User found by request userId:', !!userToUpdate);
      } else if (req.userId) {
        // User ID from auth middleware
        userIdToUse = req.userId;
        userToUpdate = await User.findById(req.userId);
        console.log('User found by auth middleware:', !!userToUpdate);
      } else if (data.metadata?.userId) {
        // User ID from Paystack metadata
        userIdToUse = data.metadata.userId;
        userToUpdate = await User.findById(data.metadata.userId);
        console.log('User found by Paystack metadata:', !!userToUpdate);
      } else if (data.customer?.email) {
        // Try to find user by email from Paystack data
        userToUpdate = await User.findOne({ email: data.customer.email });
        if (userToUpdate) {
          userIdToUse = userToUpdate._id;
        }
        console.log('User found by email:', !!userToUpdate, 'Email:', data.customer.email);
      }

      // Create transaction record - only include fields that exist in the schema
      const transactionData = {
        amount: data.amount / 100, // Convert from kobo to naira
        description: 'Wallet funding via Paystack',
        reference: reference,
        metadata: {
          paystackData: data,
          email: data.customer?.email,
          paymentMethod: 'paystack',
          type: 'credit',
          status: 'completed',
          processedViaVerify: true
        }
      };

      // Only add user field if we have a valid user ID
      if (userIdToUse) {
        transactionData.user = userIdToUse;
        console.log('Adding user to transaction:', userIdToUse);
      } else {
        // If no user found, still create transaction but mark it for manual processing
        transactionData.description = 'Wallet funding via Paystack - User not found';
        transactionData.metadata.needsManualProcessing = true;
        transactionData.metadata.email = data.customer?.email;
        console.log('No user found, marking for manual processing');
      }

      console.log('Transaction data to save:', JSON.stringify(transactionData, null, 2));

      // Use findOneAndUpdate with upsert to handle duplicates gracefully
      let transaction;
      try {
        transaction = await Transaction.findOneAndUpdate(
          { reference: reference },
          transactionData,
          { 
            upsert: true, 
            new: true,
            setDefaultsOnInsert: true 
          }
        );
        console.log('Transaction saved successfully:', transaction._id);
      } catch (duplicateError) {
        console.log('Duplicate error caught:', duplicateError.code);
        if (duplicateError.code === 11000) {
          // Transaction already exists, fetch it
          transaction = await Transaction.findOne({ reference: reference });
          console.log('Transaction already exists, fetched existing:', reference);
        } else {
          console.error('Unexpected error during transaction save:', duplicateError);
          throw duplicateError;
        }
      }

      // Update user balance if user was found and transaction is new
      if (userToUpdate && transaction.metadata.processedViaVerify) {
        // Check if balance was already updated for this reference
        const balanceAlreadyUpdated = await User.findOne({
          _id: userToUpdate._id,
          'balanceUpdateHistory': reference
        });

        if (!balanceAlreadyUpdated) {
          const oldBalance = userToUpdate.balance;
          userToUpdate.balance += (data.amount / 100);
          
          // Track that balance was updated for this reference
          if (!userToUpdate.balanceUpdateHistory) {
            userToUpdate.balanceUpdateHistory = [];
          }
          userToUpdate.balanceUpdateHistory.push(reference);
          
          await userToUpdate.save();
          console.log('User balance updated:', oldBalance, '->', userToUpdate.balance, 'for reference:', reference);
        } else {
          console.log('Balance already updated for reference:', reference, 'skipping duplicate update');
        }
      }

      return res.json({ 
        verified: true, 
        amount: data.amount / 100,
        transactionId: transaction._id,
        userUpdated: !!userToUpdate,
        alreadyProcessed: !transaction.metadata.processedViaVerify
      });
    } else {
      console.log('Paystack transaction not successful:', data.gateway_response);
      return res.status(400).json({ verified: false, reason: data.gateway_response });
    }
  } catch (error) {
    console.error('Paystack verify error details:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      stack: error.stack
    });
    
    // Return more specific error information
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Transaction reference not found' });
    } else if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid Paystack API key' });
    } else if (error.code === 11000) {
      return res.status(409).json({ error: 'Transaction already exists' });
    } else {
      return res.status(500).json({ 
        error: 'Payment verification failed',
        details: error.message 
      });
    }
  }
});

// POST /api/paystack/webhook
router.post('/webhook', async (req, res) => {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || 'sk_test_4d98bfc2ab0ff20be5d6fbcad8bea103372d7e29')
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  if (event.event === 'charge.success') {
    const data = event.data;
    
    try {
      // Try to find user by email
      let userToUpdate = null;
      let userIdToUse = null;

      if (data.customer?.email) {
        userToUpdate = await User.findOne({ email: data.customer.email });
        if (userToUpdate) {
          userIdToUse = userToUpdate._id;
        }
      }

      // Create transaction record
      const transactionData = {
        amount: data.amount / 100,
        description: 'Wallet funding via Paystack',
        reference: data.reference,
        metadata: {
          paystackData: data,
          email: data.customer?.email,
          paymentMethod: 'paystack',
          type: 'credit',
          status: 'completed',
          processedViaWebhook: true
        }
      };

      if (userIdToUse) {
        transactionData.user = userIdToUse;
      } else {
        transactionData.description = 'Wallet funding via Paystack - User not found';
        transactionData.metadata.needsManualProcessing = true;
        transactionData.metadata.email = data.customer?.email;
      }

      // Use findOneAndUpdate with upsert to handle duplicates gracefully
      let transaction;
      try {
        transaction = await Transaction.findOneAndUpdate(
          { reference: data.reference },
          transactionData,
          { 
            upsert: true, 
            new: true,
            setDefaultsOnInsert: true 
          }
        );
      } catch (duplicateError) {
        if (duplicateError.code === 11000) {
          // Transaction already exists, fetch it
          transaction = await Transaction.findOne({ reference: data.reference });
          console.log('Webhook: Transaction already exists, fetched existing:', data.reference);
        } else {
          throw duplicateError;
        }
      }

      // Update user balance if user was found and transaction is new
      if (userToUpdate && transaction.metadata.processedViaWebhook) {
        // Check if balance was already updated for this reference
        const balanceAlreadyUpdated = await User.findOne({
          _id: userToUpdate._id,
          'balanceUpdateHistory': data.reference
        });

        if (!balanceAlreadyUpdated) {
          const oldBalance = userToUpdate.balance;
          userToUpdate.balance += (data.amount / 100);
          
          // Track that balance was updated for this reference
          if (!userToUpdate.balanceUpdateHistory) {
            userToUpdate.balanceUpdateHistory = [];
          }
          userToUpdate.balanceUpdateHistory.push(data.reference);
          
          await userToUpdate.save();
          console.log('User balance updated via webhook:', oldBalance, '->', userToUpdate.balance, 'for reference:', data.reference);
        } else {
          console.log('Balance already updated for reference:', data.reference, 'skipping duplicate webhook update');
        }
      }

      console.log('Webhook transaction processed:', data.reference);
    } catch (error) {
      console.error('Webhook processing error:', error);
    }
  }

  res.json({ status: 'success' });
});

// GET /api/paystack/test - Test endpoint for debugging
router.get('/test', async (req, res) => {
  try {
    // Test database connection
    const testTransaction = new Transaction({
      amount: 100,
      description: 'Test transaction',
      reference: 'test-' + Date.now(),
      metadata: { test: true }
    });
    
    await testTransaction.save();
    console.log('Test transaction created:', testTransaction._id);
    
    // Clean up test transaction
    await Transaction.findByIdAndDelete(testTransaction._id);
    console.log('Test transaction cleaned up');
    
    res.json({ 
      success: true, 
      message: 'Database connection and transaction creation working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ 
      error: 'Test failed', 
      details: error.message,
      stack: error.stack 
    });
  }
});

module.exports = router;
