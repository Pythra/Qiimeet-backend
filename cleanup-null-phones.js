const mongoose = require('mongoose');
const User = require('./models/User');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qiimeet', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function cleanupNullPhones() {
  try {
    console.log('Starting cleanup of users with null phone numbers...');
    
    // Find all users with null or undefined phone numbers
    const usersWithNullPhone = await User.find({
      $or: [
        { phone: null },
        { phone: undefined },
        { phone: '' }
      ]
    });
    
    console.log(`Found ${usersWithNullPhone.length} users with null/empty phone numbers`);
    
    if (usersWithNullPhone.length > 0) {
      // Delete these users
      const result = await User.deleteMany({
        $or: [
          { phone: null },
          { phone: undefined },
          { phone: '' }
        ]
      });
      
      console.log(`Deleted ${result.deletedCount} users with null/empty phone numbers`);
    }
    
    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the cleanup
cleanupNullPhones(); 