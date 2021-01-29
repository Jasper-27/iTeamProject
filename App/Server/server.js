const sendAllPreviousMessages = false;  // When a user connects, send them all previous messages
const Message = require("./Message");
const dataAccess = require("./dataAccess");
const profanity = require("./ProfanityFilter");
const loggingSystem = require("./Log"); 

const io = require('socket.io')(3000, {
  cors: {
    // Must allow cross origin resource sharing (otherwise server won't accept traffic from localhost)
    origin: "*"
  }
});

const users = {}
var messagesFile = new dataAccess.MessagesAccess();
var accountsFile = new dataAccess.AccountsAccess();
var logger = new dataAccess.LogAccess(); 

messagesFile.getData();  // Load all previous messages
var profanityFilter = new profanity("*", true);

//We should turn these into a settings file at some point 
var messageLimit = 255; 



io.on('connection', socket => {


  //when new user is added to the server
  socket.on('new-user', name => {
    if (name == null || name == undefined || name == "") name = "unknown";
    users[socket.id] = name;
    socket.broadcast.emit('user-connected', name);
    console.log("User " + name + " Connected");
    sendPreviousMessages(socket);
    logger.log("User " + name + " Connected");
  })

  // When user tries to login
  socket.on('login', credentials => {
    // Check if credentials are valid
    let userId = accountsFile.checkCredentials(credentials.username, credentials.password);
    if (userId != -1){
      // The details are correct, store the userId in users dictionary
      users[socket.id] = userId;
      let name = accountsFile.getAccount(userId).userName;
      // Tell client that login was successful
      socket.emit('login-success');
      // Add socket to the "authorised" room so they can receive messages
      socket.join('authorised');
      // Announce that the user has connected
      socket.to('authorised').emit('user-connected', name);
      // Send all previous messages (if that setting is enabled)
      sendPreviousMessages(socket);

      //Log that the user connected 
      console.log("User " + name + " connected");
      logger.log(name + " connected"); 
    }
    else{
      // Tell client that login failed
      socket.emit('login-fail');
      logger.log("Failed login attempt")
    }
  })

  // When user tries to create account
  socket.on('create-account', details => {
    // Make sure given values are valid
    if (typeof details.username != "string"){
      socket.emit('register-fail', 'Invalid username');
    }
    else if (typeof details.firstName != "string"){
      socket.emit('register-fail', 'Invalid first name');
    }
    else if (typeof details.lastName != "string"){
      socket.emit('register-fail', 'Invalid last name');
    }
    else if (typeof details.password != "string"){
      socket.emit('register-fail', 'Invalid password');
    }
    else{
      // Details are valid
      if (accountsFile.createAccount(details.username, details.firstName, details.lastName, details.password) == dataAccess.AccountsAccess.USERNAMETAKEN){
        socket.emit('register-fail', 'Username taken');
      }
      else{
        socket.emit('register-success');
        logger.log("New account created: " + details.username);
      }
    }
  })

  socket.on('send-chat-message', message => {
    // Check that the client is logged in, and discard their messages otherwise
    if (typeof users[socket.id] == "number"){
      let name = accountsFile.getAccount(users[socket.id]).userName;
      // Write the new message to file
      let filteredMessage = profanityFilter.filter(message);
      if (name == null || name == undefined || name == "") name = "unknown";
      messagesFile.appendData(new Message(name, filteredMessage));
      socket.to('authorised').emit('chat-message', { message: filteredMessage, name: name });
      console.log(message)

      //If message is blank. don't spam people 
      //This is done client side as well for redundancy
      if (message == ""){
        return
      }

      if (message.length > messageLimit){ // again, just for redundancy 
        console.log("A message that was too long got though")
        return
      }


      // Must also send message to user that sent it
      socket.emit('chat-message', {message: filteredMessage, name: "You"});
    }
  })

  socket.on('disconnect', () => {
    let name = accountsFile.getAccount(users[socket.id]).userName;
    socket.to('authorised').emit('user-disconnected', name);
    //logs that the user disconnected at this time
    logger.log(name + " disconnected"); 

    delete users[socket.id]; // remove the user from the connected users
  })

  // functionality not added yet
  socket.on('get-users', () => {
    socket.to('authorised').emit(users); 
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

