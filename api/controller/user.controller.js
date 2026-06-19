import { register, login } from '../services/auth.service.js';

export const registerUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await register(username, password);
    return res.status(201).json(user);
  } catch (error) {
    return res.status(500).json({ message: 'Error registering use' });
  }
};

export const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const response = await login(username, password);
    if (!response) {
      return res.status(401).json({ message: 'Login Failed' });
    }
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ message: 'Login Error' });
  }
};
