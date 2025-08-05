const mongoose = require("mongoose");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const notificationService = require("../utils/notificationService");

// Helper to calculate remainingConnections
function getRemainingConnections(user) {
  const allowed = user.allowedConnections || 0;
  const active = Array.isArray(user.connections) ? user.connections.length : 0;
  const pending = Array.isArray(user.requests) ? user.requests.length : 0;
  return Math.max(0, allowed - (active + pending));
}

// 1. Save verified phone number
exports.registerPhone = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone is required" });

  let user = await User.findOne({ phone });
  if (!user) user = await User.create({ phone });

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });

  res.json({ token });
};

// 2. Update preferences
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Log incoming profilePictures


    // Accept S3 URLs for profilePictures
    if (req.body.profilePictures) {
      // Ensure it's an array
      if (!Array.isArray(req.body.profilePictures)) {
        req.body.profilePictures = [req.body.profilePictures];
      }
      
      // Only keep valid URLs (http/https) or non-empty strings
      req.body.profilePictures = req.body.profilePictures.filter(p => 
        typeof p === 'string' && p.trim() && (p.startsWith('http') || p.startsWith('https'))
      );
      
      // Log filtered profilePictures
  
    }

    Object.assign(user, req.body);
    await user.save();
    res.json(user);
  } catch (err) {
    console.error('Error in updateProfile:', err);
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
};

// 3. Get profile
exports.getMyProfile = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  // Calculate usedConnections as accepted + pending
  const usedConnections = (Array.isArray(user.connections) ? user.connections.length : 0) + (Array.isArray(user.requests) ? user.requests.length : 0);
  const remainingConnections = Math.max(0, user.allowedConnections - usedConnections);
  res.json({
    ...user.toObject(),
    usedConnections,
    remainingConnections,
    availableConnectionsLeftToBuy: user.availableConnectionsLeftToBuy
  });
};

// 4. Delete user
exports.deleteProfile = async (req, res) => {
  await User.findByIdAndDelete(req.userId);
  res.json({ message: "Account deleted" });
};

// 5. Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 6. Add requester to a user's requesters array
exports.addRequester = async (req, res) => {
  const { targetUserId } = req.body; // the user being requested
  const requesterId = req.userId; // the user making the request (from auth middleware)
  const io = req.app.get('io');

  if (!targetUserId) return res.status(400).json({ error: "Target user required" });
  if (targetUserId === requesterId) return res.status(400).json({ error: "Cannot request yourself" });

  try {
    // Check if requester has available tickets
    const requester = await User.findById(requesterId);
    if (!requester) return res.status(404).json({ error: "Requester not found" });

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ error: "Target user not found" });

    // User can only send a request if they have NO active connections and NO pending requests (with any user)
    if ((requester.connections && requester.connections.length > 0) || (requester.requests && requester.requests.length > 0)) {
      return res.status(400).json({ error: "You can only have one active connection or one pending request at a time." });
    }

    // Calculate available tickets
    const usedTickets = (Array.isArray(requester.connections) ? requester.connections.length : 0) + (Array.isArray(requester.requests) ? requester.requests.length : 0);
    const availableTickets = (requester.allowedConnections || 0) - usedTickets;
    if (availableTickets <= 0) {
      return res.status(403).json({ 
        error: "No connection tickets available", 
        code: "NO_CONNECTIONS",
        allowedConnections: requester.allowedConnections,
        availableTickets
      });
    }

    // Add requester to target user's requesters array
    await User.findByIdAndUpdate(
      targetUserId,
      { $addToSet: { requesters: requesterId } }
    );

    // Add target user to requester's requests array
    await User.findByIdAndUpdate(
      requesterId,
      { $addToSet: { requests: targetUserId } }
    );

    // Add or update requestTimestamps for this request
    await User.findByIdAndUpdate(
      requesterId,
      { $pull: { requestTimestamps: { userId: targetUserId } } }
    );
    await User.findByIdAndUpdate(
      requesterId,
      { $push: { requestTimestamps: { userId: targetUserId, sentAt: new Date() } } }
    );

    // Get requester's name for notification
    const requesterName = requester?.username || requester?.name || 'Someone';

    // Send push notification to target user
    await notificationService.sendConnectionRequestNotification(targetUserId, requesterName);

    // Emit real-time update to target user
    if (io) {
      io.to(`user_${targetUserId}`).emit('connection_request_update', {
        type: 'new_request',
        requesterId: requesterId,
        requesterName: requesterName
      });
    }

    res.json({ 
      success: true
    });
  } catch (err) {
    console.error('Error in addRequester:', err);
    res.status(500).json({ error: "Failed to add requester" });
  }
};

// 7. Get all users who requested to connect with the current user
exports.getRequesters = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await User.findById(userId).populate('requesters');
    res.json({ requesters: user.requesters });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch requesters" });
  }
};

// 8. Accept connection between two users
exports.acceptConnection = async (req, res) => {
  const { targetUserId } = req.body; // the user being accepted
  const userId = req.userId; // the user accepting (from auth middleware)
  const io = req.app.get('io');

  if (!targetUserId) return res.status(400).json({ error: "Target user required" });
  if (targetUserId === userId) return res.status(400).json({ error: "Cannot connect to yourself" });

  try {
    // Check if user already has a connection
    const user = await User.findById(userId);
    if (user.connections && user.connections.length > 0) {
      return res.status(400).json({ error: "You already have an active connection. You must end it before accepting a new one." });
    }
    // Add each user to the other's connections array
    await User.findByIdAndUpdate(userId, { $addToSet: { connections: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $addToSet: { connections: userId } });
    
    // Remove from requesters and requests arrays
    await User.findByIdAndUpdate(userId, { $pull: { requesters: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $pull: { requests: userId } });
    
    // Remove requestTimestamps entry
    await User.findByIdAndUpdate(userId, { $pull: { requestTimestamps: { userId: targetUserId } } });
    
    // Remove from pastConnections for both users when they reconnect
    await User.findByIdAndUpdate(userId, { $pull: { pastConnections: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $pull: { pastConnections: userId } });
    // Decrement allowedConnections for the requester (targetUserId)
    const requester = await User.findById(targetUserId);
    if (requester && typeof requester.allowedConnections === 'number' && requester.allowedConnections > 0) {
      requester.allowedConnections -= 1;
      await requester.save();
    }
    // Send notification to requester (targetUserId)
    const accepter = user?.username || user?.name || 'Someone';
    await notificationService.sendConnectionAcceptedNotification(targetUserId, accepter, userId);
    
    // Emit real-time updates to both users
    if (io) {

      
      // Notify the requester that their connection was accepted
      io.to(`user_${targetUserId}`).emit('connection_accepted', {
        type: 'connection_accepted',
        accepterId: userId,
        accepterName: accepter
      });
      
      // Notify the accepter that the connection was established
      io.to(`user_${userId}`).emit('connection_accepted', {
        type: 'connection_established',
        requesterId: targetUserId,
        requesterName: requester?.username || requester?.name || 'Someone'
      });
    } else {

    }
    
    res.status(200).json({ message: 'Connection accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept connection' });
  }
};



// 9. Get all users connected to the current user
exports.getConnections = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await User.findById(userId).populate('connections');
    res.json({ connections: user.connections });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch connections" });
  }
};

// 10. Check if user can send a connection request
exports.canSendRequest = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const remainingConnections = getRemainingConnections(user);
    res.json({ 
      canSend: remainingConnections > 0,
      allowedConnections: user.allowedConnections,
      remainingConnections,
      maxConnections: 3
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to check connection status" });
  }
};

// 11. Reject connection request
exports.rejectConnection = async (req, res) => {
  const { targetUserId } = req.body; // the user being rejected
  const userId = req.userId; // the user rejecting (from auth middleware)

  if (!targetUserId) return res.status(400).json({ error: "Target user required" });
  if (targetUserId === userId) return res.status(400).json({ error: "Cannot reject yourself" });

  try {
    // Remove from requesters and requests arrays
    await User.findByIdAndUpdate(userId, { $pull: { requesters: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $pull: { requests: userId } });
    // Remove requestTimestamps entry
    await User.findByIdAndUpdate(targetUserId, { $pull: { requestTimestamps: { userId: userId } } });
    // Send notification to requester (targetUserId)
    const rejecter = (await User.findById(userId))?.username || (await User.findById(userId))?.name || 'Someone';
    await notificationService.sendConnectionRejectedNotification(targetUserId, rejecter, userId);
    res.status(200).json({ message: 'Connection rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject connection' });
  }
};

// 12. Expire connection request (remove from requests/requesters after 24h)
exports.expireRequest = async (req, res) => {
  const { targetUserId } = req.body;
  const userId = req.userId;

  if (!targetUserId) return res.status(400).json({ error: "Target user required" });
  if (targetUserId === userId) return res.status(400).json({ error: "Cannot expire yourself" });

  try {
    // Remove from requests/requesters
    await User.findByIdAndUpdate(userId, { $pull: { requests: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $pull: { requesters: userId } });
    // Remove requestTimestamps entry
    await User.findByIdAndUpdate(userId, { $pull: { requestTimestamps: { userId: targetUserId } } });
    // DO NOT increment allowedConnections here!
    res.status(200).json({ message: 'Request expired and removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to expire request' });
  }
};

// 10. Update notification token
exports.updateNotificationToken = async (req, res) => {
  const { expoNotificationToken } = req.body;
  const userId = req.userId;

  if (!expoNotificationToken) {
    return res.status(400).json({ error: "Notification token is required" });
  }

  try {
    await User.findByIdAndUpdate(userId, { expoNotificationToken });
    res.json({ success: true, message: "Notification token updated" });
  } catch (err) {
    console.error('Error updating notification token:', err);
    res.status(500).json({ error: "Failed to update notification token" });
  }
};

// 11. Update likes/dislikes and handle likers
exports.updateLikesDislikes = async (req, res) => {
  try {
    const { likes, dislikes } = req.body;
    const userId = req.userId;
    const io = req.app.get('io');





    // Get current user's previous likes to determine what changed
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const previousLikes = currentUser.likes || [];
    const newLikes = likes || [];
    

    
    // Convert string IDs to ObjectIds for proper comparison
    const newLikesObjectIds = newLikes.map(id => new mongoose.Types.ObjectId(id));
    const previousLikesStrings = previousLikes.map(id => id.toString());
    

    
    // Find newly added likes (users that weren't liked before but are now)
    const newlyLikedUsers = newLikesObjectIds.filter(newUserId => 
      !previousLikesStrings.includes(newUserId.toString())
    );
    

    
    // Update current user's likes and dislikes
    await User.findByIdAndUpdate(userId, {
      likes: newLikes,
      dislikes: dislikes || []
    });

    // Add current user to the likers list of ALL liked users (not just newly liked)
    // This ensures that even if you've liked someone before, they still have you in their likers
    for (const likedUserId of newLikesObjectIds) {
      
      const updateResult = await User.findByIdAndUpdate(
        likedUserId,
        { $addToSet: { likers: userId } },
        { new: true }
      );
      
      
      // Emit real-time update to the liked user
      if (io) {
        io.to(`user_${likedUserId}`).emit('like_update', {
          type: 'new_like',
          likerId: userId,
          likerName: currentUser.name || currentUser.username
        });
      }
    }

    // Remove current user from likers list of users that are no longer liked
    const unlikedUsers = previousLikes.filter(prevUserId => 
      !newLikesObjectIds.some(newUserId => newUserId.toString() === prevUserId.toString())
    );

    
    for (const unlikedUserId of unlikedUsers) {
      
      await User.findByIdAndUpdate(
        unlikedUserId,
        { $pull: { likers: userId } }
      );
      
      // Emit real-time update to the unliked user
      if (io) {
        io.to(`user_${unlikedUserId}`).emit('like_update', {
          type: 'like_removed',
          likerId: userId
        });
      }
    }

    // Clean up any inconsistencies: remove current user from likers of users not in their likes
    await cleanupLikersInconsistency(userId, newLikes);

    // Get updated user data
    const updatedUser = await User.findById(userId);

    res.json(updatedUser);
  } catch (err) {
    console.error('Error in updateLikesDislikes:', err);
    res.status(500).json({ error: "Failed to update likes/dislikes" });
  }
};

// Helper function to clean up inconsistencies between likes and likers
const cleanupLikersInconsistency = async (userId, userLikes) => {
  try {

    
    // Find all users who have this user in their likers array
    const usersWithThisUserInLikers = await User.find({
      likers: userId
    });
    
    
    
    // For each user who has this user in their likers, check if this user actually likes them
    for (const otherUser of usersWithThisUserInLikers) {
      const otherUserId = otherUser._id.toString();
      const isInUserLikes = userLikes.includes(otherUserId);
      
      
      
      // If this user doesn't like the other user, remove this user from their likers
      if (!isInUserLikes) {

        await User.findByIdAndUpdate(
          otherUserId,
          { $pull: { likers: userId } }
        );
      }
    }
    

  } catch (error) {
    console.error('Error in cleanupLikersInconsistency:', error);
  }
};

// Clean up all inconsistencies in the database (admin function)
exports.cleanupAllLikersInconsistencies = async (req, res) => {
  try {

    
    // Get all users
    const allUsers = await User.find({});
    let totalInconsistencies = 0;
    
    for (const user of allUsers) {
      const userLikes = user.likes || [];
      const userLikers = user.likers || [];
      
      // Check each user in likers array
      for (const likerId of userLikers) {
        const liker = await User.findById(likerId);
        if (liker) {
          const likerLikes = liker.likes || [];
          const isInLikerLikes = likerLikes.includes(user._id.toString());
          
          if (!isInLikerLikes) {
    
            totalInconsistencies++;
            
            // Remove the inconsistent entry
            await User.findByIdAndUpdate(
              user._id,
              { $pull: { likers: likerId } }
            );
          }
        }
      }
    }
    

    res.json({ 
      success: true, 
      message: `Cleaned up ${totalInconsistencies} inconsistencies between likes and likers arrays`,
      inconsistenciesFixed: totalInconsistencies
    });
  } catch (error) {
    console.error('Error in global cleanup:', error);
    res.status(500).json({ error: "Failed to cleanup inconsistencies" });
  }
};

// Clean up inconsistencies for the current user only (more efficient)
exports.cleanupUserLikersInconsistencies = async (req, res) => {
  try {
    const userId = req.userId;

    
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const userLikes = currentUser.likes || [];
    const userLikers = currentUser.likers || [];
    let inconsistenciesFixed = 0;
    
    
    
    // Check each user in likers array
    for (const likerId of userLikers) {
      const liker = await User.findById(likerId);
      if (liker) {
        const likerLikes = liker.likes || [];
        const isInLikerLikes = likerLikes.includes(userId.toString());
        
        if (!isInLikerLikes) {
  
          inconsistenciesFixed++;
          
          // Remove the inconsistent entry
          await User.findByIdAndUpdate(
            userId,
            { $pull: { likers: likerId } }
          );
        }
      }
    }
    
    // Also check if there are users who have this user in their likers but this user doesn't like them
    const usersWithThisUserInLikers = await User.find({
      likers: userId
    });
    
    for (const otherUser of usersWithThisUserInLikers) {
      const otherUserId = otherUser._id.toString();
      const isInUserLikes = userLikes.includes(otherUserId);
      
      if (!isInUserLikes) {

        inconsistenciesFixed++;
        
        // Remove this user from their likers
        await User.findByIdAndUpdate(
          otherUserId,
          { $pull: { likers: userId } }
        );
      }
    }
    

    res.json({ 
      success: true, 
      message: `Cleaned up ${inconsistenciesFixed} inconsistencies for user`,
      inconsistenciesFixed: inconsistenciesFixed
    });
  } catch (error) {
    console.error('Error in user cleanup:', error);
    res.status(500).json({ error: "Failed to cleanup user inconsistencies" });
  }
};

// Send OTP to phone number
exports.sendOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Validate phone number format (Nigerian numbers)
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const numberWithoutLeadingZero = cleanNumber.startsWith('0') ? cleanNumber.substring(1) : cleanNumber;
    
    if (numberWithoutLeadingZero.length !== 10) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    const firstDigit = numberWithoutLeadingZero[0];
    if (!['7', '8', '9'].includes(firstDigit)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Send OTP via Termii
    const url = 'https://api.ng.termii.com/api/sms/otp/send';
    const payload = {
      api_key: process.env.TERMII_API_KEY,
      message_type: 'NUMERIC',
      to: `234${numberWithoutLeadingZero}`,
      from: 'N-Alert',
      channel: 'dnd',
      pin_attempts: 10,
      pin_time_to_live: 5,
      pin_length: 6,
      pin_placeholder: '< 1234 >',
      message_text: 'Your Qiimeet authentication pin is < 1234 >. It expires in 10 minutes',
      pin_type: 'NUMERIC',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (data.pinId) {
      res.json({ 
        success: true, 
        pinId: data.pinId,
        message: 'OTP sent successfully' 
      });
    } else {
      console.error('Termii API error:', data);
      res.status(500).json({ 
        error: 'Failed to send OTP',
        details: data.message || 'Unknown error'
      });
    }
  } catch (err) {
    console.error('OTP send error:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { pinId, pin, phoneNumber } = req.body;
    
    if (!pinId || !pin || !phoneNumber) {
      return res.status(400).json({ error: "Pin ID, pin, and phone number are required" });
    }

    // Validate phone number format
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const numberWithoutLeadingZero = cleanNumber.startsWith('0') ? cleanNumber.substring(1) : cleanNumber;
    
    if (numberWithoutLeadingZero.length !== 10) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    const firstDigit = numberWithoutLeadingZero[0];
    if (!['7', '8', '9'].includes(firstDigit)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Verify OTP via Termii
    const url = 'https://api.ng.termii.com/api/sms/otp/verify';
    const payload = {
      api_key: process.env.TERMII_API_KEY,
      pin_id: pinId,
      pin: pin,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (data.verified === true) {
      // Find or create user
      let user = await User.findOne({ phone: numberWithoutLeadingZero });
      if (!user) {
        user = await User.create({ phone: numberWithoutLeadingZero });
      }

      // Generate JWT token
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "30d",
      });

      res.json({ 
        success: true, 
        token,
        message: 'OTP verified successfully' 
      });
    } else {
      res.status(400).json({ 
        error: 'Invalid OTP',
        details: data.message || 'Verification failed'
      });
    }
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};

// Get the sentAt timestamp for a specific outgoing connection request
exports.getRequestTimestamp = async (req, res) => {
  const userId = req.userId;
  const { targetUserId } = req.query;
  if (!targetUserId) return res.status(400).json({ error: 'Target user required' });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const entry = user.requestTimestamps.find(rt => rt.userId.toString() === targetUserId);
    if (!entry) return res.status(404).json({ error: 'No request timestamp found' });
    res.json({ sentAt: entry.sentAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get request timestamp' });
  }
};

// Cancel (remove) a connection between two users
exports.cancelConnection = async (req, res) => {
  const { targetUserId } = req.body;
  const userId = req.userId;
  const io = req.app.get('io');
  
  if (!targetUserId) return res.status(400).json({ error: 'Target user required' });
  if (targetUserId === userId) return res.status(400).json({ error: 'Cannot cancel yourself' });
  
  try {
    // Get user data for notifications
    const [user, targetUser] = await Promise.all([
      User.findById(userId),
      User.findById(targetUserId)
    ]);
    
    // Remove each user from the other's connections array
    await User.findByIdAndUpdate(userId, { $pull: { connections: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $pull: { connections: userId } });
    // Add each user to the other's pastConnections array
    await User.findByIdAndUpdate(userId, { $addToSet: { pastConnections: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $addToSet: { pastConnections: userId } });
    
    // Emit real-time updates to both users
    if (io) {
      const cancelerName = user?.username || user?.name || 'Someone';
      const targetName = targetUser?.username || targetUser?.name || 'Someone';
      
      // Notify the target user that connection was canceled
      io.to(`user_${targetUserId}`).emit('connection_canceled', {
        type: 'connection_canceled',
        cancelerId: userId,
        cancelerName: cancelerName
      });
      
      // Notify the canceler that connection was canceled
      io.to(`user_${userId}`).emit('connection_canceled', {
        type: 'connection_canceled',
        targetId: targetUserId,
        targetName: targetName
      });
    }
    
    res.status(200).json({ message: 'Connection cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel connection' });
  }
};

// Block a user: remove connection and add to blockedUsers
exports.blockUser = async (req, res) => {
  const { targetUserId } = req.body;
  const userId = req.userId;
  const io = req.app.get('io');
  
  if (!targetUserId) return res.status(400).json({ error: 'Target user required' });
  if (targetUserId === userId) return res.status(400).json({ error: 'Cannot block yourself' });
  
  try {
    // Get user data for notifications
    const [user, targetUser] = await Promise.all([
      User.findById(userId),
      User.findById(targetUserId)
    ]);
    
    // Remove each user from the other's connections array
    await User.findByIdAndUpdate(userId, { $pull: { connections: targetUserId } });
    await User.findByIdAndUpdate(targetUserId, { $pull: { connections: userId } });
    // Add target user to blocker's blockedUsers array
    await User.findByIdAndUpdate(userId, { $addToSet: { blockedUsers: targetUserId } });
    
    // Emit real-time updates to both users
    if (io) {
      const blockerName = user?.username || user?.name || 'Someone';
      const targetName = targetUser?.username || targetUser?.name || 'Someone';
      
      // Notify the target user that they were blocked
      io.to(`user_${targetUserId}`).emit('connection_blocked', {
        type: 'connection_blocked',
        blockerId: userId,
        blockerName: blockerName
      });
      
      // Notify the blocker that the user was blocked
      io.to(`user_${userId}`).emit('connection_blocked', {
        type: 'connection_blocked',
        targetId: targetUserId,
        targetName: targetName
      });
    }
    
    res.status(200).json({ message: 'User blocked and connection removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to block user' });
  }
};

// Verify OTP for phone number update
exports.verifyPhoneUpdate = async (req, res) => {
  try {
    const { pinId, pin, phoneNumber } = req.body;
    const userId = req.userId; // Get from auth middleware

    if (!pinId || !pin || !phoneNumber) {
      return res.status(400).json({ error: "Pin ID, pin, and phone number are required" });
    }

    // Validate phone number format
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const numberWithoutLeadingZero = cleanNumber.startsWith('0') ? cleanNumber.substring(1) : cleanNumber;
    
    if (numberWithoutLeadingZero.length !== 10) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    if (!['7', '8', '9'].includes(numberWithoutLeadingZero[0])) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Check if phone number already exists (excluding current user)
    const existingUser = await User.findOne({ 
      phone: numberWithoutLeadingZero,
      _id: { $ne: userId }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: "Phone number already exists" });
    }

    // Verify OTP via Termii
    const url = 'https://api.ng.termii.com/api/sms/otp/verify';
    const payload = {
      api_key: process.env.TERMII_API_KEY,
      pin_id: pinId,
      pin: pin,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (data.verified === true) {
      // Update user's phone number
      await User.findByIdAndUpdate(userId, { 
        phone: numberWithoutLeadingZero 
      });

      res.json({ 
        success: true,
        message: 'Phone number updated successfully' 
      });
    } else {
      res.status(400).json({ 
        error: 'Invalid OTP',
        details: data.message || 'Verification failed'
      });
    }
  } catch (err) {
    console.error('Phone update verification error:', err);
    res.status(500).json({ error: 'Failed to verify phone update' });
  }
};

// Get blocked users for the current user
exports.getBlockedUsers = async (req, res) => {
  try {
    const userId = req.userId;
    
    const user = await User.findById(userId).populate('blockedUsers', 'username name age profilePictures verificationStatus');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const blockedUsers = user.blockedUsers || [];
    
    res.json({
      success: true,
      blockedUsers: blockedUsers.map(user => ({
        id: user._id,
        username: user.username || user.name,
        name: user.name,
        age: user.age,
        profilePicture: user.profilePictures && user.profilePictures.length > 0 ? user.profilePictures[0] : null,
        verified: user.verificationStatus === 'true'
      }))
    });
  } catch (err) {
    console.error('Error fetching blocked users:', err);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
};

// Unblock a user
exports.unblockUser = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.userId;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    if (targetUserId === userId) {
      return res.status(400).json({ error: 'Cannot unblock yourself' });
    }

    // Remove target user from blockedUsers array
    await User.findByIdAndUpdate(userId, { 
      $pull: { blockedUsers: targetUserId } 
    });

    res.json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (err) {
    console.error('Error unblocking user:', err);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
};