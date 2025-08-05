const Notification = require('../models/Notification');
const User = require('../models/User');

// Create a new notification
exports.createNotification = async (recipientId, senderId, type, title, body, data = {}) => {
  try {
    const notification = new Notification({
      recipientId,
      senderId,
      type,
      title,
      body,
      data
    });
    
    await notification.save();
    console.log(`[Notification] Created notification: ${type} for user ${recipientId}`);
    return notification;
  } catch (error) {
    console.error('[Notification] Error creating notification:', error);
    return null;
  }
};

// Get notifications for a user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const notifications = await Notification.find({ recipientId: userId })
      .populate('senderId', 'username profilePictures')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Notification.countDocuments({ recipientId: userId });
    
    res.json({
      success: true,
      notifications,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('[Notification] Error fetching notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.userId;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipientId: userId },
      { isRead: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    
    res.json({ success: true, notification });
  } catch (error) {
    console.error('[Notification] Error marking notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    
    await Notification.updateMany(
      { recipientId: userId, isRead: false },
      { isRead: true }
    );
    
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('[Notification] Error marking all notifications as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notifications as read' });
  }
};

// Get unread notification count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.userId;
    
    const count = await Notification.countDocuments({
      recipientId: userId,
      isRead: false
    });
    
    res.json({ success: true, count });
  } catch (error) {
    console.error('[Notification] Error getting unread count:', error);
    res.status(500).json({ success: false, error: 'Failed to get unread count' });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.userId;
    
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipientId: userId
    });
    
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('[Notification] Error deleting notification:', error);
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
}; 