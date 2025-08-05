const mongoose = require('mongoose');

const ConnectionFeeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number, required: true },
  description: { type: String, required: true }
});

module.exports = mongoose.model('ConnectionFee', ConnectionFeeSchema); 