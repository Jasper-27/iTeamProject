const Message = require("./Message");
const dataAccess = require("./dataAccess");
const io = require('socket.io')(3000, {
  cors: {
    // Must allow cross origin resource sharing (otherwise server won't accept traffic from localhost)
    origin: "*"
  }
});

const users = {}
var messagesFile = new dataAccess.MessagesAccess();

io.on('connection', socket => {
  socket.on('new-user', name => {
    users[socket.id] = name;
    socket.broadcast.emit('user-connected', name);
  })
  socket.on('send-chat-message', message => {
    // Write the new message to file
    messagesFile.appendData(new Message(users[socket.id], message));
    socket.broadcast.emit('chat-message', { message: message, name: users[socket.id] });
  })
  socket.on('disconnect', () => {
    socket.broadcast.emit('user-disconnected', users[socket.id]);
    delete users[socket.id];
  })
})