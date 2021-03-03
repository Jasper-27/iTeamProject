const sendAllPreviousMessages = false;  // When a user connects, send them all previous messages
const Message = require("./Message");
const dataAccess = require("./dataAccess");
const profanity = require("./ProfanityFilter");
const loggingSystem = require("./Log"); 
const Settings = require("./Settings.js"); 


const io = require('socket.io')(3000, {
  cors: {
    // Must allow cross origin resource sharing (otherwise server won't accept traffic from localhost)
    origin: "*"
  }
});

const users = {}; 
var messagesFile = new dataAccess.MessagesAccess();
var accountsFile = new dataAccess.AccountsAccess();
var logger = new dataAccess.LogAccess(); 

messagesFile.getData();  // Load all previous messages
var profanityFilter = new profanity("*", true);

//reading settings from settings file 
 let settings = Settings.readSettings();



//for getting the connected users 
var connected = []; 

console.log("*****************************************");
console.log("*          😉 WINKI SERVER 😉           *");      
console.log("*****************************************");
console.log(); 



io.on('connection', socket => {

  //when new user is added to the server
  socket.on('new-user', name => {
    if (name == null || name == undefined || name == "") name = "unknown";
    users[socket.id] = name;
    socket.broadcast.emit('user-connected', name);
    sendPreviousMessages(socket);

    // hang on, isn't this done twice?  // This bit never runs Hmmmmmm
    console.log("User " + name + " Connected");
    logger.log("User " + name + " Connected"); 
  })

  // When user tries to login
  socket.on('login', credentials => {
    // Check if credentials are valid
    if (typeof credentials.username == "string" && typeof credentials.password == "string"){
      let userId = accountsFile.checkCredentials(credentials.username, credentials.password);
      if (userId != -1){
        // The details are correct, store the userId in users dictionary
        users[socket.id] = userId;
        let name = accountsFile.getAccount(userId).userName;
        // Tell client that login was successful
        io.to(socket.id).emit('login-success');
        // Add socket to the "authorised" room so they can receive messages
        socket.join('authorised');
        socket.to('authorised').emit('user-connected', name); // Announce that the user has connected
        io.to(socket.id).emit("send-username", name); // tells the new user what their name is
        // Send all previous messages (if that setting is enabled)
        
        sendPreviousMessages(socket);  // doesn't do anything atm. 
        
        //Log that the user connected 
        console.log("👋 User " + name + " logged in");
        logger.log(name + " logged in"); 

        // adds the username to list of connected users (provided it isn't there already)
        if (connected.indexOf(name) < 0){
          connected.push(name); 
          socket.to('authorised').emit('send-users', connected); 
        }

        //Sends settings to the client 
        io.to(socket.id).emit('settings', settings);

        return;
      }
    }
      // Tell client that login failed
      socket.emit('login-fail');
      logger.log("Failed login attempt"); //This may get a bit much 
      console.log("⚠️ Failed login attempt!") ;
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
        console.log("👍 New account created: " + details.username); 
      }
    }
  })

  socket.on('send-chat-message', message => {
    // Check that the client is logged in, and discard their messages otherwise
    if (typeof users[socket.id] == "number"){
      // Make sure message has a suitable type value
      if (!(typeof message.type == "string" && (message.type === "text" || message.type === "image" || message.type === "file"))){
        // Ignore the message
        console.log("🚨 An message with an invalid type was received");
        return;
      }
      let name = accountsFile.getAccount(users[socket.id]).userName;
      // Write the new message to file
      let filteredMessage = message.content;
      // Only filter text based messages for profanity
      if (message.type === "text") filteredMessage = profanityFilter.filter(filteredMessage);
      if (name == null || name == undefined || name == "") name = "unknown";
      messagesFile.appendData(new Message(name, message.type, filteredMessage, message.fileName));
      socket.to('authorised').emit('chat-message', { message: {type: message.type, content: filteredMessage, fileName: message.fileName}, name: name });
      // console.log("🟢 " + name + ": " + message); 

      //If message is blank. don't spam people 
      //This is done client side as well for redundancy
      if (message.content == ""){
        console.log("🚨 An empty message got through");
        return;
      }

      if (message.type === "text" && message.content.length > settings.messageLimit){ // again, just for redundancy 
        console.log("🚨 A message that was too long got though");
        return;
      }

      // Testing
      if (message.type == "file") {

        var extension = message.fileName;
        var blacklist = settings.restrictedFiles;

        for (var i of blacklist) {
          
          if (extension.includes(i)) {

            console.log("Bad file trying to be sent!");

            return;
          }
        }
      }
      
      // Must also send message to user that sent it
      socket.emit('chat-message', {message: {type: message.type, content: filteredMessage, fileName: message.fileName}, name: name});


      // Checks to see if the message was @ing anyone 
      if (message.type === "text"){
        if (message.content.includes("@")){
          message.content.split(" ").forEach((item, index) => {
            if (item.charAt(0) == "@"){
              socket.to('authorised').emit('mentioned', { target: item.substring(1), sender: name} );
            }
          });
        }
      }
    }
  })

  socket.on('disconnect', () => {
    let name = accountsFile.getAccount(users[socket.id]).userName;
    // Only continue if name exists (meaning user was properly connected and logged in)
    if (typeof name == "string"){
      socket.to('authorised').emit('user-disconnected', name);
      //logs that the user disconnected at this time
      logger.log(name + " disconnected"); 
      console.log("💔 " + name + " disconnected"); 

      delete users[socket.id]; // remove the user from the connected users (but doesn't delete them, sets to null i think)

      //removes the users name from the client list when they log out
      var index = connected.indexOf(name);
      if (index > -1) {
          connected.splice(index, 1);
      }
      socket.to('authorised').emit('send-users', connected); 
    }
  })


  // allows the client to request a list of new users. tried to remove this but everything broke
  socket.on('get-users', out => {
    // console.log("➡️  sending the connected users")
    socket.to('authorised').emit('send-users', connected); 
  })
})


// This part of the application isn't actually doing anything. It worked for a bit then got turned off. 
function sendPreviousMessages(socket){
  // Send all previous messages to the newly connected user
  if (sendAllPreviousMessages){
    for (let i = 0; i < messagesFile.messagesBuffer.length; i++){
      let msg = messagesFile.messagesBuffer[i];
      socket.emit("chat-message", {message: msg.content, name: msg.senderId});
    }
  }
}