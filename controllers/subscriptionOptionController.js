const SubscriptionOption = require('../models/SubscriptionOption');

exports.getAll = async (req, res) => {
  try {
    const options = await SubscriptionOption.find();
    res.json({ success: true, options });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const option = new SubscriptionOption(req.body);
    await option.save();
    res.json({ success: true, option });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const option = await SubscriptionOption.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, option });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await SubscriptionOption.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}; 