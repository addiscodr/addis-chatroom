import 'dotenv/config';
import express from 'express';
import { createServer } from 'http'; // Fixed: Missing import
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import userRoutes from './routes/user.routes.js';
import chatRoutes from './routes/chat.routes.js';
import {
  createMessage,
  getUndeliveredMessages,
  getUserLastSeen,
  markMessageAsDelivered,
  markMessageAsRead,
  updateMessageStatus,
  updateUserLastSeen,
} from './services/chat.service.js';
import Message from './models/message.js';
import User from './models/user.js';
import { getRoomId } from './utils/chat.helper.js';

connectDB();
const app = express();

app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } }); // Fixed: Added 'new'

const onlineUsers = new Map(); // Fixed: Added 'new'

io.on('connection', (socket) => {
  console.log('New client connected: ', socket.id);

  let currentUserId = null;

  socket.on('register_user', ({ userId }) => {
    if (!userId) return;

    currentUserId = userId;
    onlineUsers.set(userId, socket.id);

    console.log(`User ${userId} registered with socket ${socket.id}`);

    checkPendingMessages(userId); // Fixed: Passed userId argument
  });

  socket.on('join_room', async ({ userId, partnerId }) => {
    if (!userId || !partnerId) {
      console.log('Invalid join_room request: missing userId or partnerId');
      return;
    }

    currentUserId = userId;
    onlineUsers.set(userId, socket.id);

    const roomId = getRoomId(userId, partnerId);
    socket.join(roomId);
    console.log(`User ${userId} joined room: ${roomId}`);

    try {
      const undeliveredMessages = await getUndeliveredMessages(
        userId,
        partnerId,
      );
      const undeliveredCount = await markMessageAsDelivered(userId, partnerId);

      if (undeliveredCount > 0) {
        console.log(
          `Marked ${undeliveredCount} messages as delivered for ${userId}`,
        );

        undeliveredMessages.forEach((message) => {
          io.to(roomId).emit('message_status', {
            messageId: message.messageId,
            status: 'delivered',
            sender: message.sender,
            receiver: message.receiver,
          });
        });
      }

      io.to(roomId).emit('user_status', {
        userId: userId,
        status: 'online',
      });

      if (onlineUsers.has(partnerId)) {
        socket.emit('user_status', {
          userId: partnerId, // Fixed logic: Check and send partner's status, not your own
          status: 'online',
        });
      } else {
        const lastSeen = await getUserLastSeen(partnerId);
        socket.emit('user_status', {
          userId: partnerId,
          status: 'offline',
          lastSeen: lastSeen || new Date().toISOString(), // Fixed: instantiation
        });
      }
    } catch (error) {
      console.error('Error handling room join: ', error);
    }
  });

  socket.on('send_message', async (message) => {
    if (
      !message.sender ||
      !message.receiver ||
      !message.message ||
      !message.messageId
    ) {
      console.error('Invalid message format: ', message); // Fixed: message.error is not a function
      return;
    }

    const roomId = getRoomId(message.sender, message.receiver);

    await createMessage({
      ...message,
      status: 'sent',
      roomId: roomId,
    });

    console.log(
      `Message in room ${roomId} from ${message.sender} to ${message.receiver}: ${message.message}`, // Fixed log fields
    );

    if (onlineUsers.has(message.receiver)) {
      message.status = 'delivered';
      await updateMessageStatus(message.messageId, 'delivered');
    } else {
      message.status = 'sent';
    }

    io.to(roomId).emit('new_message', message);

    if (onlineUsers.has(message.receiver)) {
      const receiverSocketId = onlineUsers.get(message.receiver);
      const receiverSocket = io.sockets.sockets.get(receiverSocketId);

      if (receiverSocket && !receiverSocket.rooms.has(roomId)) {
        // Fixed: rooms.has()
        const sender = await User.findById(message.sender).select('username');
        receiverSocket.emit('new_message_notification', {
          senderId: message.sender,
          senderName: sender?.username || 'Unknown',
          messageId: message.messageId,
          message: message.message,
        });
      }
    }
  });

  const typingTimeouts = new Map(); // Fixed: Added 'new'

  socket.on('typing_start', ({ userId, receiverId }) => {
    if (!userId || !receiverId) return;

    const roomId = getRoomId(userId, receiverId);
    const key = `${userId}_${receiverId}`;

    if (typingTimeouts.has(key)) {
      // Fixed logical evaluation
      clearTimeout(typingTimeouts.get(key));
    }

    socket.to(roomId).emit('typing_indicator', {
      userId,
      isTyping: true,
    });

    const timeout = setTimeout(() => {
      socket.to(roomId).emit('typing_indicator', {
        userId,
        isTyping: false,
      });
      typingTimeouts.delete(key);
    }, 5000);

    typingTimeouts.set(key, timeout);
  });

  socket.on('typing_end', ({ userId, receiverId }) => {
    if (!userId || !receiverId) return;

    const roomId = getRoomId(userId, receiverId);
    const key = `${userId}_${receiverId}`;

    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key));
      typingTimeouts.delete(key);
    }

    socket.to(roomId).emit('typing_indicator', {
      userId,
      isTyping: false,
    });
  });

  socket.on(
    'message_delivered',
    async ({ messageId, senderId, receiverId }) => {
      try {
        await updateMessageStatus(messageId, 'delivered');
        const roomId = getRoomId(senderId, receiverId);

        io.to(roomId).emit('message_status', {
          messageId,
          status: 'delivered',
          sender: senderId,
          receiver: receiverId,
        });
      } catch (error) {
        console.error(error);
      }
    },
  );

  socket.on('messages_read', async ({ messageIds, senderId, receiverId }) => {
    try {
      const roomId = getRoomId(senderId, receiverId);

      for (const messageId of messageIds) {
        await updateMessageStatus(messageId, 'read');

        io.to(roomId).emit('message_status', {
          messageId: messageId,
          status: 'read',
          sender: senderId,
          receiver: receiverId,
        });
      }
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('mark_messages_read', async ({ userId, partnerId }) => {
    try {
      const count = await markMessageAsRead(userId, partnerId);
      const roomId = getRoomId(userId, partnerId); // Fixed reference variables

      if (count > 0) {
        io.to(roomId).emit('messages_all_read', {
          reader: userId,
          sender: partnerId,
        });
      }

      if (onlineUsers.has(partnerId)) {
        const senderSocketId = onlineUsers.get(partnerId);
        const senderSocket = io.sockets.sockets.get(senderSocketId);

        if (senderSocket && !senderSocket.rooms.has(roomId)) {
          // Fixed property typos (.rooms)
          senderSocket.emit('message_all_read', {
            reader: userId,
            sender: partnerId,
          });
        }
      }
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('user_status_change', async ({ userId, status, lastSeen }) => {
    if (status === 'offline') {
      await updateUserLastSeen(userId, lastSeen);
      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
      }

      io.emit('user_status', {
        userId: userId,
        status: 'offline',
        lastSeen: lastSeen,
      });
    } else {
      onlineUsers.set(userId, socket.id);
      io.emit('user_status', {
        userId: userId,
        status: 'online',
      });
    }
  });

  socket.on('disconnect', async () => {
    if (currentUserId) {
      if (onlineUsers.get(currentUserId) === socket.id) {
        onlineUsers.delete(currentUserId);
      }

      const lastSeen = new Date().toISOString(); // Fixed Constructor
      await updateUserLastSeen(currentUserId, lastSeen);

      io.emit('user_status', {
        userId: currentUserId,
        status: 'offline',
        lastSeen: lastSeen,
      });
    }
  });
});

async function checkPendingMessages(userId) {
  try {
    const pendingMessages = await Message.find({
      receiver: userId,
      status: 'sent',
    }).populate('sender', 'username');

    if (pendingMessages.length > 0) {
      const messagesBySender = {};
      pendingMessages.forEach((msg) => {
        if (!messagesBySender[msg.sender._id]) {
          messagesBySender[msg.sender._id] = [];
        }
        messagesBySender[msg.sender._id].push(msg); // Fixed Object syntax invocation
      });

      const userSocket = io.sockets.sockets.get(onlineUsers.get(userId));

      if (userSocket) {
        Object.keys(messagesBySender).forEach((senderId) => {
          const count = messagesBySender[senderId].length;
          const senderName = messagesBySender[senderId][0].sender.username;

          userSocket.emit('pending_messages', {
            senderId,
            senderName,
            count,
            latestMessage: messagesBySender[senderId][0].message, // Fixed typo 'lastestMessage'
          });
        });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server started on port: ${PORT}`);
});
