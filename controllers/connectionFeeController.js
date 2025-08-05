const ConnectionFee = require('../models/ConnectionFee');

exports.getAll = async (req, res) => {
  try {
    const fees = await ConnectionFee.find();
    res.json({ success: true, fees });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const fee = new ConnectionFee(req.body);
    await fee.save();
    res.json({ success: true, fee });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const fee = await ConnectionFee.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, fee });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await ConnectionFee.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}; 