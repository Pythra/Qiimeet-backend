const axios = require('axios');
const notificationController = require('../controllers/notificationController');

class NotificationService {
  constructor() {
    this.expoPushUrl = 'https://exp.host/--/api/v2/push/send';
  }

  async sendPushNotification(expoToken, title, body, data = {}) {
    if (!expoToken) {
      console.log('No Expo token provided for notification');
      return false;
    }

    try {
      const message = {
        to: expoToken,
        sound: 'default',
        title: title,
        body: body,
        data: data,
      };

      console.log('[Push] Sending push notification:', JSON.stringify(message, null, 2));

      const response = await axios.post(this.expoPushUrl, message, {
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
      });

      console.log('[Push] Expo response:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.data && response.data.data.status === 'ok') {
        console.log('[Push] Push notification sent successfully');
        return true;
      } else {
        console.log('[Push] Failed to send push notification:', response.data);
        return false;
      }
    } catch (error) {
      console.error('[Push] Error sending push notification:', error?.response?.data || error.message || error);
      return false;
    }
  }

  // Log notification to database and send push notification
  async logAndSendNotification(recipientId, senderId, type, title, body, data = {}) {
    try {
      // First, log the notification to database
      const notification = await notificationController.createNotification(
        recipientId, 
        senderId, 
        type, 
        title, 
        body, 
        data
      );

      if (!notification) {
        console.error('[Notification] Failed to create notification in database');
        return false;
      }

      // Then send push notification
      const User = require('../models/User');
      const targetUser = await User.findById(recipientId);
      
      if (targetUser && targetUser.expoNotificationToken) {
        const pushSent = await this.sendPushNotification(
          targetUser.expoNotificationToken,
          title,
          body,
          data
        );

        // Update notification with push status
        if (pushSent) {
          await notification.updateOne({
            isPushSent: true,
            pushSentAt: new Date()
          });
        }

        return pushSent;
      }

      return true; // Notification logged even if no push token
    } catch (error) {
      console.error('[Notification] Error in logAndSendNotification:', error);
      return false;
    }
  }

  async sendConnectionRequestNotification(targetUserId, requesterName, requesterId) {
    const title = 'New Connection Request';
    const body = `${requesterName} wants to connect with you!`;
    const data = {
      type: 'connection_request',
      requesterId: requesterId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      requesterId,
      'connection_request',
      title,
      body,
      data
    );
  }

  async sendConnectionRejectedNotification(targetUserId, rejecterName, rejecterId) {
    const title = 'Connection Request Rejected';
    const body = `${rejecterName} has rejected your connection request, try connecting with someone else.`;
    const data = {
      type: 'connection_rejected',
      rejecterId: rejecterId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      rejecterId,
      'connection_rejected',
      title,
      body,
      data
    );
  }

  async sendConnectionAcceptedNotification(targetUserId, accepterName, accepterId) {
    const title = 'Connection Request Accepted';
    const body = `${accepterName} has accepted your connection request! You can now start chatting.`;
    const data = {
      type: 'connection_accepted',
      accepterId: accepterId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      accepterId,
      'connection_accepted',
      title,
      body,
      data
    );
  }

  async sendConnectionCanceledNotification(targetUserId, cancelerName, cancelerId) {
    const title = 'Connection Request Canceled';
    const body = `${cancelerName} has canceled the connection request.`;
    const data = {
      type: 'connection_canceled',
      cancelerId: cancelerId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      cancelerId,
      'connection_canceled',
      title,
      body,
      data
    );
  }

  async sendNewMessageNotification(targetUserId, senderName, senderId, messagePreview) {
    const title = "You've got a new message.";
    const body = messagePreview || 'Start a meaningful chat.. love might be just one reply away!';
    const data = {
      type: 'new_message',
      senderId: senderId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      senderId,
      'new_message',
      title,
      body,
      data
    );
  }

  async sendNewMatchNotification(targetUserId, matcherName, matcherId) {
    const title = 'New match alert!';
    const body = 'You both liked each other, ready to connect?';
    const data = {
      type: 'new_match',
      matcherId: matcherId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      matcherId,
      'new_match',
      title,
      body,
      data
    );
  }

  async sendProfileVisitNotification(targetUserId, visitorName, visitorId) {
    const title = `${visitorName} visited your profile`;
    const body = '';
    const data = {
      type: 'profile_visit',
      visitorId: visitorId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      visitorId,
      'profile_visit',
      title,
      body,
      data
    );
  }

  async sendLikeReceivedNotification(targetUserId, likerName, likerId) {
    const title = 'New like received!';
    const body = `${likerName} liked your profile!`;
    const data = {
      type: 'like_received',
      likerId: likerId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      likerId,
      'like_received',
      title,
      body,
      data
    );
  }

  async sendCallNotification(targetUserId, callerName, callType, channelName, callerAvatar = null, callerId) {
    const title = callType === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call';
    const body = `${callerName || 'Someone'} is calling you${callType === 'video' ? ' (video)' : ' (voice)'}!`;
    const data = {
      type: 'call_invite',
      callType,
      channelId: channelName,
      callerName: callerName || 'Someone',
      callerAvatar: callerAvatar || undefined,
      callerId: callerId,
    };

    return await this.logAndSendNotification(
      targetUserId,
      callerId,
      'call_invite',
      title,
      body,
      data
    );
  }
}

module.exports = new NotificationService(); 