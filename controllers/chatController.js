const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const notificationService = require('../utils/notificationService');

// Create a new chat between two users (improved)
const createChat = async (req, res) => {
  try {
    const { participant1Id, participant2Id } = req.body;
    
    // Validate that both users exist
    const user1 = await User.findById(participant1Id);
    const user2 = await User.findById(participant2Id);
    
    if (!user1 || !user2) {
      return res.status(404).json({ message: 'One or both users not found' });
    }
    
    // Check if chat already exists between these users
    const existingChat = await Chat.findOne({
      participants: { $all: [participant1Id, participant2Id], $size: 2 }
    });
    
    if (existingChat) {
      console.log('Chat already exists:', existingChat.chatId);
      return res.status(200).json({ 
        message: 'Chat already exists', 
        chat: existingChat 
      });
    }
    
    // Generate unique chat ID (using a consistent format)
    const sortedParticipants = [participant1Id, participant2Id].sort();
    const chatId = `${sortedParticipants[0]}_${sortedParticipants[1]}_${Date.now()}`;
    
    console.log('Creating new chat with ID:', chatId);
    
    // Create new chat
    const newChat = new Chat({
      chatId,
      participants: [participant1Id, participant2Id],
      chatPictures: [] // Initialize empty array
    });
    
    await newChat.save();
    
    console.log('Chat created successfully:', newChat.chatId);
    
    res.status(201).json({ 
      message: 'Chat created successfully', 
      chat: newChat 
    });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Add chat pictures to a chat (improved)
const addChatPictures = async (req, res) => {
  try {
    const { chatId, pictures } = req.body;
    
    if (!chatId || !Array.isArray(pictures) || pictures.length === 0) {
      return res.status(400).json({ message: 'chatId and pictures array are required' });
    }
    
    console.log('Looking for chat with ID:', chatId);
    console.log('Pictures to add:', pictures);
    
    // Find chat by chatId
    const chat = await Chat.findOne({ chatId });
    if (!chat) {
      console.log('Chat not found with ID:', chatId);
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // Only allow authenticated users who are participants in the chat
    if (!chat.participants.some(p => p.toString() === req.userId)) {
      return res.status(403).json({ message: 'Not authorized to modify this chat' });
    }
    
    // Add pictures to chatPictures array (avoid duplicates)
    const existingPictures = chat.chatPictures || [];
    const newPictures = pictures.filter(pic => !existingPictures.includes(pic));
    chat.chatPictures = [...existingPictures, ...newPictures];
    
    await chat.save();
    
    console.log('Chat pictures updated successfully');
    
    res.status(200).json({ 
      message: 'Chat pictures updated', 
      chatPictures: chat.chatPictures 
    });
  } catch (error) {
    console.error('Error adding chat pictures:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Send a message (unchanged but with better logging)
const sendMessage = async (req, res) => {
  try {
    const { senderId, receiverId, chatId, message, messageType = 'text' } = req.body;
    
    if (!senderId || !receiverId || !chatId || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Validate that sender and receiver are different
    if (senderId === receiverId) {
      return res.status(400).json({ message: 'Sender and receiver cannot be the same' });
    }
    
    // Ensure chat exists for this chatId
    let chat = await Chat.findOne({ chatId });
    if (!chat) {
      // Try to find a chat between these two users (in case chatId is not deterministic)
      chat = await Chat.findOne({
        participants: { $all: [senderId, receiverId], $size: 2 }
      });
      if (!chat) {
        // Create new chat
        chat = new Chat({
          chatId,
          participants: [senderId, receiverId],
          chatPictures: []
        });
        await chat.save();
        console.log('Chat created in sendMessage:', chatId);
      }
    }
    
    console.log('Creating message:', { 
      senderId, 
      receiverId, 
      chatId, 
      messageType,
      messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
    });
    
    const newMessage = new Message({
      senderId,
      receiverId,
      chatId,
      message,
      messageType
    });
    
    await newMessage.save();
    
    // Update chat with last message info
    await Chat.findOneAndUpdate(
      { chatId },
      { lastMessage: newMessage._id, lastMessageTime: newMessage.timestamp }
    );
    
    const populatedMessage = await Message.findById(newMessage._id)
      .populate('senderId', 'username profilePictures')
      .populate('receiverId', 'username profilePictures');
    
    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`chat_${chatId}`).emit('new_message', {
        message: populatedMessage,
        chatId: chatId
      });
      io.to(`user_${receiverId}`).emit('message_notification', {
        message: populatedMessage,
        chatId: chatId
      });
    }
    
    // Send push notification to receiver
    try {
      const receiver = await User.findById(receiverId);
      const sender = await User.findById(senderId);
      if (receiver && receiver.expoNotificationToken) {
        const senderName = sender?.username || sender?.name || 'Someone';
        const notificationMessage = messageType === 'image' ? '📷 Image' : 
          (message.length > 100 ? message.substring(0, 100) + '...' : message);
        
        await notificationService.sendPushNotification(
          receiver.expoNotificationToken,
          `New message from ${senderName}`,
          notificationMessage,
          { type: 'chat_message', chatId, senderId }
        );
      }
    } catch (notifyErr) {
      console.error('Error sending push notification for chat message:', notifyErr);
    }
    
    console.log('Message sent successfully:', newMessage._id);
    
    res.status(201).json({ 
      message: 'Message sent successfully', 
      messageData: populatedMessage 
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get chat history
const getChatHistory = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    let messages = await Message.find({ chatId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('senderId', 'username profilePictures')
      .populate('receiverId', 'username profilePictures');

    // Only reverse if fetching more than 1 message
    if (parseInt(limit) > 1) {
      messages = messages.reverse();
    }

    console.log('[getChatHistory] chatId:', chatId, 'limit:', limit, 'messages:', messages.map(m => ({ id: m._id, text: m.text || m.message, type: m.messageType, ts: m.timestamp })));

    res.status(200).json({ 
      messages,
      total: messages.length
    });
  } catch (error) {
    console.error('Error getting chat history:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get user's chats
const getUserChats = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'username profilePictures')
      .populate('lastMessage')
      .sort({ lastMessageTime: -1 });
    
    res.status(200).json({ chats });
  } catch (error) {
    console.error('Error getting user chats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Mark message as read
const markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await Message.findByIdAndUpdate(
      messageId,
      { isRead: true, isDelivered: true },
      { new: true }
    );
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Emit socket event to notify sender about message read status
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${message.senderId.toString()}`).emit('message_status_update', {
        messageId: message._id.toString(),
        chatId: message.chatId,
        status: 'read',
        isRead: true
      });
    }
    
    res.status(200).json({ 
      message: 'Message marked as read', 
      messageData: message 
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Mark message as delivered
const markMessageAsDelivered = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await Message.findByIdAndUpdate(
      messageId,
      { isDelivered: true },
      { new: true }
    );
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Emit socket event to notify sender about message delivered status
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${message.senderId.toString()}`).emit('message_status_update', {
        messageId: message._id.toString(),
        chatId: message.chatId,
        status: 'delivered',
        isDelivered: true
      });
    }
    
    res.status(200).json({ 
      message: 'Message marked as delivered', 
      messageData: message 
    });
  } catch (error) {
    console.error('Error marking message as delivered:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createChat,
  sendMessage,
  getChatHistory,
  getUserChats,
  markMessageAsRead,
  markMessageAsDelivered,
  addChatPictures
};