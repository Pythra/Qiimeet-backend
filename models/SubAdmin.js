const mongoose = require('mongoose');

const subAdminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  permissions: {
    userManagement: { type: Boolean, default: false },
    feesManagement: { type: Boolean, default: false },
    verification: { type: Boolean, default: false },
    disputeManagement: { type: Boolean, default: false },
    subscriptionPlans: { type: Boolean, default: false },
    earnings: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Make it optional for now
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Additional indexes can be added here if needed

// Method to check if sub-admin has a specific permission
subAdminSchema.methods.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

// Method to get all permissions
subAdminSchema.methods.getPermissions = function() {
  return Object.keys(this.permissions).filter(key => this.permissions[key]);
};

module.exports = mongoose.model('SubAdmin', subAdminSchema); 