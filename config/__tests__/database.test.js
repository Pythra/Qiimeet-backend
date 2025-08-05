const mongoose = require('mongoose');
const connectDB = require('../database');

describe('Database Connection', () => {
  beforeAll(async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/qiimeet_test';
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('should connect to test database', async () => {
    await connectDB();
    expect(mongoose.connection.readyState).toBe(1);
  });

  it('should handle connection errors', async () => {
    process.env.MONGODB_URI = 'mongodb://invalid:27017/qiimeet_test';
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    await connectDB();
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
