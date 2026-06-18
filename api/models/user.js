import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = mongoose.schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

userSchema.methods.correctPassword = async function (candidatePassword, userPassword){
    return await bcrypt.compare(candidatePassword, userPassword)
}
