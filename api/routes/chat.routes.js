import express from 'express';
import { getChatRoom, getMessages } from '../controller/chat.controller.js';

import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/messages', authMiddleware, getMessages);
router.get('/chat-room', authMiddleware, getChatRoom);

export default router;
