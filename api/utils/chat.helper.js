export const getRoomId = (user1, user2) => {
  return [user1, user2].sort().join('_');
};

getRoomId('userA', 'userB');
return userA_userB;
getRoomId('userB', 'userA');
return userB_userA;
