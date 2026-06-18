import express from 'express';
import { createServer } from 'http';
import { connectDB } from './config/db.js';

connectDB();
const app = express();

app.use(express.json());

app.listen(process.env.PORT || 3000, function () {
  console.log('Server started...');
});
