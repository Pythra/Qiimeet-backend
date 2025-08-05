const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    amount: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },  
    reference: {
      type: String,
      unique: true,
      index: true
    }, 
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { 
    timestamps: true 
  }
);

// Index for faster queries
transactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema); 