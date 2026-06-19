import mongoose from 'mongoose';
import message from '../models/message.js';
import { getRoomId } from '../utils/chat.helper.js';
import User from '../models/user.js';

export const createMessage = async (messageData) => {
  try {
    const message = Message({
      chatRoomId: messageData.roomId,
      messageId: messageData.messageId,
      sender: messageData.sender,
      receiver: messageData.receiver,
      message: messageData.message,
      status: messageData.status || 'sent',
    });

    await message.save();
    return message;
  } catch (error) {
    throw error;
  }
};

export const fetchChatMessages = async ({
  currentUserId,
  senderId,
  receiverId,
  page = 1,
  limit = 20,
}) => {
  const roomId = getRoomId(senderId, receiverId);
  const query = { chatRoomId: roomId };

  try {
    if (currentUserId === receiverId) {
      const undeliveryQuery = {
        chatRoomId: roomId,
        receiver: mongoose.Types.ObjectId(currentUserId),
        sender: mongoose.Types.ObjectId(senderId),
        status: 'sent',
      };

      const undeliveredUpdate = await Message.updateMany(undeliveryQuery, {
        $set: { status: 'delivered' },
      });

      if (undeliveredUpdate.modifiedCount > 0) {
        console.log(
          `Updated ${undeliveredUpdate.modifiedCount} messages delivered status`,
        );
      }
    }

    const messages = await Message.aggregate(
      {
        $match: query,
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: (page - 1) * limit, // skip for pagination
      },
      {
        $limit: limit,
      },
      {
        $addFields: {
          isMine: {
            $eq: ['$sender', { $toObjectId: currentUserId }],
          },
        },
      },
    );

    return messages.reverse();
  } catch (error) {
    throw Error('Failed To Retrieve Messages');
  }
};

export const updateMessageStatus = async (messageId, status) => {
  try {
    const message = await Message.findOneAndUpdate(
      { messageId: messageId },
      { status: status },
      { new: true },
    );
  } catch (error) {
    throw error;
  }
};

export const getUndeliveredMessages = async (userId, partnerId) => {
  try {
    const message = await Message.find({
      receiver: userId,
      sender: partnerId,
      status: 'sent',
    }).sort({ createdAt: 1 });

    return message;
  } catch (error) {
    throw error;
  }
};

export const updateUserLastSeen = async (userId, lastSeen) => {
  try {
    const user = await User.findOneAndUpdate(
      userId,
      { lastSeen: lastSeen },
      { new: true },
    );

    return user;
  } catch (error) {
    throw error;
  }
};

export const markMessageAsDelivered = async (userId, partnerId) => {
  try {
    const result = await Message.updateMany(
      {
        receiver: ObjectId(userId),
        sender: ObjectId(partnerId),
        status: 'sent',
      },
      {
        $set: {
          status: 'delivered',
        },
      },
    );

    return result.modifiedCount;
  } catch (error) {
    throw error;
  }
};

export const markMessageAsRead = async (userId, partnerId) => {
  try {
    const result = await Message.updateMany(
      {
        receiver: ObjectId(userId),
        sender: ObjectId(partnerId),
        status: ['sent', 'delivered'],
      },
      {
        $set: {
          status: 'read',
        },
      },
    );

    return result.modifiedCount;
  } catch (error) {
    throw error;
  }
};

export const getUserLastSeen = async (userId) => {
  try {
    const user = await User.findById(userId).select('lastSeen');

    if (!user) {
      return null;
    }

    return user.lastSeen ? user.lastSeen.toISOString() : null;
  } catch (error) {
    throw error;
  }
};

export const getUserOnlineStatus = async (userId) => {
  try {
    const user = await User.findById(userId).select('isOnline lastSeen');

    if (!user) {
      return { isOnline: false, lastSeen: null };
    }

    return {
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen ? user.lastSeen.toISOString() : false,
    };
  } catch (error) {
    throw error;
  }
};

export const chatRoom = async (userId) => {
  try {
    const userObjectId = ObjectId(userId);
    const privateChatQuery = {
      $or: [{ sender: userObjectId }, { receiver: userObjectId }],
    };

    const privateChats = await Message.aggregate([
      { $match: privateChatQuery },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $ne: ['$sender', userObjectId] }, $sender, $receiver],
          },
          latestMessageTime: { $first: '$createdAt' },
          latestMessage: { $first: '$message' },
          sender: { $first: '$sender' },
          messages: {
            $push: {
              sender: '$sender',
              receiver: '$receiver',
              status: '$status',
            },
          },
        },
      },

      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      {
        $unwind: '$userDetails',
      },
      {
        $project: {
          _id: 0,
          chatType: 'private',
          messageId: '$latestMessageId',
          username: '$userDetails.username',
          userId: '$userDetails._id',
          latestMessageTime: 1,
          latestMessage: 1,
          senderId: 1,
          unreadCount: {
            $size: {
              $filter: {
                input: '$message',
                as: 'msg',
                cond: {
                  $and: [
                    { $eq: ['$$msg.receiver', userObjectId] },
                    { $in: ['$$msg.status', ['sent', 'delivered']] },
                  ],
                },
              },
            },
          },
          latestMessageStatus: {
            $cond: [
              { $eq: ['$sender', userObjectId] },
              {
                $arrayElementAt: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$messages',
                          as: 'msg',
                          cond: { $eq: ['$$msg.sender', userObjectId] },
                        },
                      },
                      as: 'm',
                      in: '$$m.status',
                    },
                  },
                  0,
                ],
              },
              null,
            ],
          },
        },
      },
    ]);

    return privateChats.sort((a, b) => {
      return Date(b.latestMessageTime) - Data(a.latestMessageTime);
    });
  } catch (error) {
    throw error;
  }
};
