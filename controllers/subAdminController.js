const SubAdmin = require('../models/SubAdmin');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Generate a random password
const generatePassword = () => {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Create a new sub-admin
exports.createSubAdmin = async (req, res) => {
  try {
    console.log('Creating sub-admin with data:', req.body);
    const { email, displayName, permissions } = req.body;
    const createdBy = req.user?.id || 'temp-admin'; // Temporary fallback since auth is removed

    // Validate required fields
    if (!email || !displayName) {
      console.log('Missing required fields:', { email, displayName });
      return res.status(400).json({ 
        success: false, 
        error: 'Email and display name are required' 
      });
    }

    console.log('Checking for existing sub-admin with email:', email.toLowerCase());
    // Check if email already exists
    const existingSubAdmin = await SubAdmin.findOne({ email: email.toLowerCase() });
    if (existingSubAdmin) {
      console.log('Email already exists:', email);
      return res.status(409).json({ 
        success: false, 
        error: 'Email already exists' 
      });
    }

    console.log('Generating password...');
    // Generate random password
    const password = generatePassword();
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Creating new sub-admin object...');
    // Create new sub-admin
    const newSubAdmin = new SubAdmin({
      email: email.toLowerCase(),
      displayName,
      password: hashedPassword,
      permissions: permissions || {},
      createdBy: createdBy === 'temp-admin' ? undefined : createdBy // Don't set createdBy if it's temp-admin
    });

    console.log('Saving sub-admin to database...');
    await newSubAdmin.save();
    console.log('Sub-admin saved successfully:', newSubAdmin._id);

    res.status(201).json({
      success: true,
      message: 'Sub-admin created successfully',
      subAdmin: {
        id: newSubAdmin._id,
        email: newSubAdmin.email,
        displayName: newSubAdmin.displayName,
        permissions: newSubAdmin.permissions,
        status: newSubAdmin.status,
        createdAt: newSubAdmin.createdAt
      },
      generatedPassword: password // Return the generated password
    });

  } catch (error) {
    console.error('Error creating sub-admin:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create sub-admin',
      details: error.message
    });
  }
};

// Get all sub-admins
exports.getSubAdmins = async (req, res) => {
  try {
    console.log('Fetching sub-admins...');
    const subAdmins = await SubAdmin.find({})
      .select('-password')
      .populate({
        path: 'createdBy',
        select: 'username email',
        match: { _id: { $exists: true } } // Only populate if the referenced document exists
      })
      .sort({ createdAt: -1 });

    console.log('Found sub-admins:', subAdmins.length);

    res.json({
      success: true,
      subAdmins: subAdmins.map(subAdmin => ({
        id: subAdmin._id,
        email: subAdmin.email,
        displayName: subAdmin.displayName,
        permissions: subAdmin.permissions,
        status: subAdmin.status,
        lastLogin: subAdmin.lastLogin,
        createdAt: subAdmin.createdAt,
        createdBy: subAdmin.createdBy ? {
          id: subAdmin.createdBy._id,
          username: subAdmin.createdBy.username,
          email: subAdmin.createdBy.email
        } : null
      }))
    });

  } catch (error) {
    console.error('Error fetching sub-admins:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch sub-admins',
      details: error.message
    });
  }
};

// Update sub-admin permissions
exports.updateSubAdminPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions, status } = req.body;

    const subAdmin = await SubAdmin.findById(id);
    if (!subAdmin) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sub-admin not found' 
      });
    }

    // Update permissions if provided
    if (permissions) {
      subAdmin.permissions = { ...subAdmin.permissions, ...permissions };
    }

    // Update status if provided
    if (status) {
      subAdmin.status = status;
    }

    await subAdmin.save();

    res.json({
      success: true,
      message: 'Sub-admin updated successfully',
      subAdmin: {
        id: subAdmin._id,
        email: subAdmin.email,
        displayName: subAdmin.displayName,
        permissions: subAdmin.permissions,
        status: subAdmin.status,
        lastLogin: subAdmin.lastLogin,
        createdAt: subAdmin.createdAt
      }
    });

  } catch (error) {
    console.error('Error updating sub-admin:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update sub-admin' 
    });
  }
};

// Delete sub-admin
exports.deleteSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const subAdmin = await SubAdmin.findById(id);
    if (!subAdmin) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sub-admin not found' 
      });
    }

    await SubAdmin.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Sub-admin deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting sub-admin:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete sub-admin' 
    });
  }
};

// Reset sub-admin password
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const subAdmin = await SubAdmin.findById(id);
    if (!subAdmin) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sub-admin not found' 
      });
    }

    // Generate new password
    const newPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    subAdmin.password = hashedPassword;
    await subAdmin.save();

    res.json({
      success: true,
      message: 'Password reset successfully',
      newPassword: newPassword
    });

  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset password' 
    });
  }
};

// Get sub-admin by ID
exports.getSubAdminById = async (req, res) => {
  try {
    const { id } = req.params;

    const subAdmin = await SubAdmin.findById(id)
      .select('-password')
      .populate({
        path: 'createdBy',
        select: 'username email',
        match: { _id: { $exists: true } }
      });

    if (!subAdmin) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sub-admin not found' 
      });
    }

    res.json({
      success: true,
      subAdmin: {
        id: subAdmin._id,
        email: subAdmin.email,
        displayName: subAdmin.displayName,
        permissions: subAdmin.permissions,
        status: subAdmin.status,
        lastLogin: subAdmin.lastLogin,
        createdAt: subAdmin.createdAt,
        createdBy: subAdmin.createdBy ? {
          id: subAdmin.createdBy._id,
          username: subAdmin.createdBy.username,
          email: subAdmin.createdBy.email
        } : null
      }
    });

  } catch (error) {
    console.error('Error fetching sub-admin:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch sub-admin' 
    });
  }
}; 