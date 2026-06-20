import { fetchChatMessages, chatRoom } from '../services/chat.service.js';

export const getMessages = async (req, res) => {
  const { senderId, receiverId, page, limit } = req.query;

  try {
    const message = await fetchChatMessages({
      currentUserId: req.userId,
      senderId,
      receiverId,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    res.json(message);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching messages' });
  }
};

export const getChatRoom = async (req, res) => {
  try {
    const rooms = await chatRoom(req.userId);
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms' });
  }
};
