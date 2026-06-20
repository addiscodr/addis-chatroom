import 'dotenv/config';
import express from 'express';
import { connectDB } from './config/db.js';
import userRoutes from './routes/user.routes.js';
import chatRoutes from './routes/chat.routes.js';

connectDB();
const app = express();

app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server started on port: ${PORT}`);
});

// continue from 53:45
