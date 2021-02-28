const sendAllPreviousMessages = false;  // When a user connects, send them all previous messages
const Message = require("./Message");
const dataAccess = require("./dataAccess");
const profanity = require("./ProfanityFilter");
const loggingSystem = require("./Log"); 
const Settings = require("./Settings.js"); 


let loggedInUsers = {}


//-----------------------------------------------------------------------------------------------------------------
//// Login API 

const cors = require('cors')
const express = require('express')

const app = express()
const APIport = 8080

app.use ( express.json() )
app.use( cors() ) 

app.post('/login', (req, res) => {
    
  const { password } = req.body; 
  const { username } = req.body; 

  // Checks to see if the userID is in the file. The array is a primary key (not username)
  let userId = accountsFile.checkCredentials(username, password);  
  if (userId != -1){
    let name = accountsFile.getAccount(userId).userName;

    // generate the users token
    let token = require('crypto').randomBytes(64).toString('hex'); 

    loggedInUsers[userId] = {
      "username" : username, 
      "token" : token
    }

    res.send({
      message: `Authentication success`,
      token: `${ token }`,    // the response 
    })

    console.log("🔑 User: " + username + " has logged in")
    logger.log("User: " + username + " has logged in")

  }else{
    res.status(406).send({message: 'Incorrect credentials'})
  }
})

//Start the API listening on PORT
app.listen( 
  APIport, 
  () => console.log(`🔐 Login API online: http://localhost:${APIport}`)
)

//-----------------------------------------------------------------------------------------------------------------

socketPort = 3000

const io = require('socket.io')(socketPort, {
  cors: {
    // Must allow cross origin resource sharing (otherwise server won't accept traffic from localhost)
    origin: "*"
  }
});

const users = {}; 
var messagesFile = new dataAccess.MessagesAccess();
var accountsFile = new dataAccess.AccountsAccess();
var logger = new dataAccess.LogAccess(); 

logger.log("Server started")

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

console.log(`📧 Message socket online: http://localhost:${socketPort}`)

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

  socket.on('attempt-auth', data =>{
    let username = data.username
    let token = data.token

    if (username == null){
      console.log("Username is null")
      return
    }
    if (token == null){
      console.log("token is null")
      return
    }

    let id = accountsFile.getUserId(username)  // If the ID comes back as anything but -1 we know the user exists 

    if (id == -1){
      console.log("User not found")
      return
    }
    
    if (loggedInUsers[id] == null){
      console.log("User error")
      return
    }

    if (loggedInUsers[id].token === token){
      // Tell client that login was successful
      io.to(socket.id).emit('login-success');

      // Add socket to the "authorised" room so they can receive messages
      socket.join('authorised');
      socket.to('authorised').emit('user-connected', username); // Announce that the user has connected
      io.to(socket.id).emit("send-username", username); // tells the new user what their name is

      users[socket.id] = id; // The old uses array still needs the userId in it

      // adds the username to list of connected users (provided it isn't there already)
      if (connected.indexOf(username) < 0){
        connected.push(username); 
        socket.to('authorised').emit('send-users', connected);  
      }

      io.to(socket.id).emit('settings', settings); //Sends settings to the client 

      console.log("👋 User " + username + " connected");

    }else{
      socket.emit('authentication-failed')
      console.log("😭 "+ username + " Had a failed authentication")
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
      let name = accountsFile.getAccount(users[socket.id]).userName; // the old way 

      // Write the new message to file
      let filteredMessage = message.content;
      // Only filter text based messages for profanity
      if (message.type === "text") filteredMessage = profanityFilter.filter(filteredMessage);
      if (name == null || name == undefined || name == "") name = "unknown";
      messagesFile.appendData(new Message(name, message.type, filteredMessage, message.fileName));

      socket.to('authorised').emit('chat-message', {
        message: {
          type: message.type, 
          content: filteredMessage, 
          fileName: message.fileName
        }, 
        name: name 
      });

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

      // Must also send message to user that sent it
      socket.emit('chat-message', {
        message:{
          type: message.type, 
          content: filteredMessage, 
          fileName: message.fileName
        }, 
        name: name
      });

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
