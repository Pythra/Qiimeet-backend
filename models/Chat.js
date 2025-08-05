const mongoose = require("mongoose");

// Chat Schema
const chatSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  lastMessageTime: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  chatPictures: [{ type: String }], // Array of image URLs for chat pictures
}); 

module.exports = mongoose.model("Chat", chatSchema); 