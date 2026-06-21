export const getRoomId = (user1, user2) => {
  return [user1, user2].sort().join('_');
};

getRoomId('userA', 'userB');

getRoomId('userB', 'userA');
