const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(auth);

// Chat routes
router.post('/create', chatController.createChat);
router.post('/send-message', chatController.sendMessage);
router.get('/history/:chatId', chatController.getChatHistory);
router.get('/user/:userId', chatController.getUserChats);
router.put('/message/:messageId/read', chatController.markMessageAsRead);
router.put('/message/:messageId/delivered', chatController.markMessageAsDelivered);
router.put('/pictures', chatController.addChatPictures);

module.exports = router; 