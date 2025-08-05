const app = require('./app');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

dotenv.config();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const connectedUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected with socket ID: ${socket.id}`);
  connectedUsers.set(socket.userId, socket.id);
  socket.join(`user_${socket.userId}`);
  console.log(`User ${socket.userId} joined room: user_${socket.userId}`);

  // Allow client to explicitly join their user room (for robustness)
  socket.on('join_user_room', (userId) => {
    if (userId && userId === socket.userId) {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} explicitly joined user room: user_${userId}`);
    }
  });

  // Handle ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong');
  });

  socket.on('join_chat', (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`User ${socket.userId} joined chat: ${chatId}`);
  });

  socket.on('leave_chat', (chatId) => {
    socket.leave(`chat_${chatId}`);
    console.log(`User ${socket.userId} left chat: ${chatId}`);
  });

  socket.on('typing_start', (data) => {
    console.log(`User ${socket.userId} started typing in chat: ${data.chatId}`);
    socket.to(`chat_${data.chatId}`).emit('user_typing', {
      userId: socket.userId,
      chatId: data.chatId,
      isTyping: true
    });
  });

  socket.on('typing_stop', (data) => {
    console.log(`User ${socket.userId} stopped typing in chat: ${data.chatId}`);
    socket.to(`chat_${data.chatId}`).emit('user_typing', {
      userId: socket.userId,
      chatId: data.chatId,
      isTyping: false
    });
  });

  // --- Call signaling logic ---
  socket.on('call_user', async (data) => {
    const { toUserId, fromUserId, callType, channelName, agoraToken, callerName, callerAvatar } = data;
    console.log(`[CALL] call_user event received:`, data);
    const userRoom = `user_${toUserId}`;
    const roomSockets = io.sockets.adapter.rooms.get(userRoom);
    if (roomSockets && roomSockets.size > 0) {
      // User is online in the room, send real-time incoming call event
      console.log(`[CALL] Callee (${toUserId}) is online. Emitting incoming_call to room ${userRoom}`);
      io.to(userRoom).emit('incoming_call', {
        fromUserId, // caller's userId
        callType,
        channelName,
        agoraToken,
        callerName, // send caller's name
        callerAvatar, // send caller's avatar
      });
    } else {
      // User is offline, send push notification
      console.log(`[CALL] Callee (${toUserId}) is offline. Sending push notification.`);
      try {
        const notificationService = require('./utils/notificationService');
        await notificationService.sendCallNotification(
          toUserId,
          callerName || 'Someone',
          callType,
          channelName,
          callerAvatar || null,
          fromUserId
        );
        console.log(`[CALL] Push notification sent to user ${toUserId}`);
      } catch (err) {
        console.error('[CALL] Error sending offline call notification:', err);
      }
    }
  });

  socket.on('call_response', (data) => {
    const { toUserId, response } = data;
    const callerSocketId = connectedUsers.get(toUserId);
    console.log(`[CALL] call_response event received:`, data);
    if (callerSocketId) {
      console.log(`[CALL] Emitting call_response to socket ${callerSocketId}`);
      io.to(callerSocketId).emit('call_response', data);
    } else {
      console.log(`[CALL] Caller (${toUserId}) is not online.`);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`User ${socket.userId} disconnected: ${reason}`);
    connectedUsers.delete(socket.userId);
  });

  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.userId}:`, error);
  });
});

app.set('io', io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { server, io };