const express = require("express");
const {
  getAllUsers,
  getAllUsersForHome,
  getFilteredUsersForHome,
  getUserById,
  getAllTransactions,
  getTransactionStats,
  getDashboardStats,
  createAdmin,
  getAdmins
} = require("../controllers/adminController");
const {
  createSubAdmin,
  getSubAdmins,
  updateSubAdminPermissions,
  deleteSubAdmin,
  resetPassword,
  getSubAdminById
} = require("../controllers/subAdminController");
const connectionFeeController = require('../controllers/connectionFeeController');
const subscriptionOptionController = require('../controllers/subscriptionOptionController');
const auth = require('../middleware/auth');

const router = express.Router();

// Get dashboard statistics
router.get("/dashboard/stats", getDashboardStats);

// Get all users for admin panel
router.get("/users", getAllUsers);

// Get all users for home screen with complete data
router.get("/users/home", getAllUsersForHome);

// Get filtered users for home screen based on user preferences
router.post("/users/home/filtered", getFilteredUsersForHome);

// Get specific user by ID
router.get("/users/:id", getUserById);

// Get all transactions for admin panel
router.get("/transactions", getAllTransactions);

// Get transaction statistics for admin panel
router.get("/transactions/stats", getTransactionStats);

// Create a new admin
router.post("/admins", createAdmin);

// List all admins
router.get("/admins", getAdmins);

// Sub-Admin CRUD operations
router.post("/sub-admins", createSubAdmin);
router.get("/sub-admins", getSubAdmins);
router.get("/sub-admins/:id", getSubAdminById);
router.put("/sub-admins/:id", updateSubAdminPermissions);
router.delete("/sub-admins/:id", deleteSubAdmin);
router.post("/sub-admins/:id/reset-password", resetPassword);

// Connection Fees CRUD
router.get('/connection-fees', connectionFeeController.getAll);
router.post('/connection-fees', connectionFeeController.create);
router.put('/connection-fees/:id', connectionFeeController.update);
router.delete('/connection-fees/:id', connectionFeeController.remove);
// Subscription Options CRUD
router.get('/subscription-options', subscriptionOptionController.getAll);
router.post('/subscription-options', subscriptionOptionController.create);
router.put('/subscription-options/:id', subscriptionOptionController.update);
router.delete('/subscription-options/:id', subscriptionOptionController.remove);

module.exports = router; 