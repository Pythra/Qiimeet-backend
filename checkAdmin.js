const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qiimeet');
    console.log('Connected to MongoDB');

    // Find admin user
    const admin = await User.findOne({ email: 'admin@qiimeet.com' });
    
    if (admin) {
      console.log('Admin user found:');
      console.log('Email:', admin.email);
      console.log('Username:', admin.username);
      console.log('isAdmin:', admin.isAdmin);
      console.log('role:', admin.role);
      console.log('verificationStatus:', admin.verificationStatus);
      console.log('phone:', admin.phone);
      console.log('Has password:', !!admin.password);
    } else {
      console.log('Admin user not found');
    }

  } catch (error) {
    console.error('Error checking admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

checkAdmin(); 