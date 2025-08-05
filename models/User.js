const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    phone: { 
      type: String, 
      unique: true,
      required: true,
      validate: {
        validator: function(v) {
          return v && v.trim().length > 0;
        },
        message: 'Phone number cannot be empty'
      }
    },
    username: String,
    email: String,
    goal: String,
    height: String,
    gender:String,
    interests: [String],
    kids: String,
    career: String,
    zodiac: String,
    location: String,
    age: Number,
    religon: String,
    personality: String,
    bio: {
      type: String,
      default: ''
    },
    languages: {
      type: [String],
      default: []
    },
    lifestyle: [String],
    education: String,
    allowedConnections: {
      type: Number,
      default: 0, // How many connections user has paid for
      min: 0,
      max: 3
    },
    // How many more connections the user can buy (capped at 3 total)
    availableConnectionsLeftToBuy: {
      type: Number,
      default: 3,
      min: 0,
      max: 3
    },
    remainingConnections: {
      type: Number,
      default: 0, // Will be calculated as allowedConnections - usedConnections
      min: 0,
      max: 3
    },
    dateOfBirth: Date,
    height: String,
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    balanceUpdateHistory: {
      type: [String],
      default: []
    },
    profilePictures: {
      type: [String],
      validate: [
        function (arr) {
          // Allow undefined or empty array if not required
          if (!arr || arr.length === 0) return true;
          return Array.isArray(arr) && arr.length >= 2 && arr.length <= 6;
        },
        "User must have between 2 and 6 profile pictures",
      ], 
    },
    identityPictures: {
      type: [String],
      validate: [
        function (arr) {
          // Allow undefined, empty array, or exactly 2 images
          if (!arr || arr.length === 0) return true;
          return Array.isArray(arr) && arr.length === 2;
        },
        "Identity pictures must be exactly 2 images (front and back) if provided",
      ], 
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'false', 'true'],
      default: 'false'
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    dislikes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    likers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    requesters: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    requests: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    connections: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    pastConnections: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    expoNotificationToken: {
      type: String,
      default: null
    },
    // Track when each outgoing connection request was sent
    requestTimestamps: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sentAt: { type: Date, default: Date.now }
    }],
    // Admin/Role fields
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'moderator', 'support', 'user'],
      default: 'user',
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
