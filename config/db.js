const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qiimeet', {
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: true,
      maxPoolSize: 10,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:');
    if (error.code === 'ECONNREFUSED') {
      console.error('Make sure MongoDB is running on your local machine');
    }
    console.error(error);
    process.exit(1);
  }
};

module.exports = connectDB;
