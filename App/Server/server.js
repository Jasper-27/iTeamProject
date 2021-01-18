const sendAllPreviousMessages = false;  // When a user connects, send them all previous messages
const Message = require("./Message");
const dataAccess = require("./dataAccess");
const profanity = require("./ProfanityFilter");
const io = require('socket.io')(3000, {
  cors: {
    // Must allow cross origin resource sharing (otherwise server won't accept traffic from localhost)
    origin: "*"
  }
});

const users = {}
var messagesFile = new dataAccess.MessagesAccess();
messagesFile.getData();  // Load all previous messages
var profanityFilter = new profanity("*", true);

io.on('connection', socket => {

  socket.on('new-user', name => {
    if (name == null || name == undefined || name == "") name = "unknown";
    users[socket.id] = name;
    socket.broadcast.emit('user-connected', name);
    console.log("User " + name + " Connected"); 
    sendPreviousMessages(socket);
  })

  socket.on('send-chat-message', message => {
    // Write the new message to file
    let filteredMessage = profanityFilter.filter(message);
    let name = users[socket.id];
    if (name == null || name == undefined || name == "") name = "unknown";
    messagesFile.appendData(new Message(name, filteredMessage));
    socket.broadcast.emit('chat-message', { message: filteredMessage, name: users[socket.id] });
    // Must also send message to user that sent it
    console.log(message)

    //If message is blank. don't spam people 
    //This is done client side as well for redundency
    if (message == ""){
      return
    }
    socket.emit('chat-message', {message: filteredMessage, name: "You"});
  })

  socket.on('disconnect', () => {
    socket.broadcast.emit('user-disconnected', users[socket.id]);
    delete users[socket.id];
  })

  socket.on('get-users', () => {
    socket.broadcast.emit(users); 
  })
})

function sendPreviousMessages(socket){
  // Send all previous messages to the newly connected user
  if (sendAllPreviousMessages){
    for (let i = 0; i < messagesFile.messagesBuffer.length; i++){
      let msg = messagesFile.messagesBuffer[i];
      socket.emit("chat-message", {message: msg.content, name: msg.senderId});
    }
  }
}

