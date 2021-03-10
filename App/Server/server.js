const Message = require("./Message");
const dataAccess_old = require("./dataAccess");  // Old system still used for logging, will move over in future
const DataAccess = require("./DataAccess/dataAccess");
const profanity = require("./ProfanityFilter");
const Settings = require("./Settings.js"); 

const messagesFolderPath = __dirname + "/data/messages";
const messagesIndexPath = __dirname + "/data/messages/messages_index.wdx";
const logsFolderPath = __dirname + "/not/implemented/yet";
const logsIndexPath = __dirname + "/not/implemented.yet";
const accountsFilePath = __dirname + "/data/accounts/accounts.wac";
const profilePicturesFilePath = __dirname + "/not/implemented.yet";


var Storage = new DataAccess(messagesFolderPath, messagesIndexPath, logsFolderPath, logsIndexPath, accountsFilePath, profilePicturesFilePath);
// The new storage system does not yet provide logging, so old one must still be used for now
var logger = new dataAccess_old.LogAccess(); 

const users = {}  // Maps socket ids to usernames
let loggedInUsers = {}  // Contains access token for user, uses usernames as keys


//-----------------------------------------------------------------------------------------------------------------
//// Login API 

const cors = require('cors')
const express = require('express');
const Account = require("./Account");

const app = express()
const APIport = 8080

app.use ( express.json() )
app.use( cors() ) 

app.post('/login', async (req, res) => {  // Function must be async to allow use of await
    
  const { password } = req.body; 
  const { username } = req.body;

  // Checks to see if the user is in the file. 
  let user = await Storage.checkAccountCredentials(username, password);   // Returns an account object if credentials match 
  if (user instanceof Account){
    let name = user.userName;

    // generate the users token
    let token = require('crypto').randomBytes(64).toString('hex'); 

    loggedInUsers[name] = {
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

socketPort = 4500

const io = require('socket.io')(socketPort, {
  cors: {
    // Must allow cross origin resource sharing (otherwise server won't accept traffic from localhost)
    origin: "*"
  }
});

logger.log("Server started")

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

  socket.on('attempt-auth', async data =>{
    let username = data.username
    let token = data.token

    if (username == null){
      return
    }
    if (token == null){
      return
    }

    let user = await Storage.getAccount(username)  // If an account is returned, we know the user exists.  Otherwise they don't

    if (!(user instanceof Account)){
      console.log("User not found")
      return
    }
    
    if (loggedInUsers[user.userName] == null){
      console.log("User error")
      return
    }

    if (loggedInUsers[user.userName].token === token){
      // Tell client that login was successful
      io.to(socket.id).emit('login-success');

      // Add socket to the "authorised" room so they can receive messages
      socket.join('authorised');
      socket.to('authorised').emit('user-connected', username); // Announce that the user has connected
      io.to(socket.id).emit("send-username", username); // tells the new user what their name is

      users[socket.id] = username;
      
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
  socket.on('create-account', async details => {
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
      try{
        let creationSuccessful = await Storage.createAccount(details.username, details.firstName, details.lastName, details.password);
        if (creationSuccessful === true){
          socket.emit('register-success');
          logger.log("New account created: " + details.username);
          console.log("👍 New account created: " + details.username); 
        }
        else{
          socket.emit('register-fail', 'Unable to create account');
        }
      }
      catch (reason){
        if (reason === "Username taken"){
          socket.emit('register-fail', 'Username taken');
        }
        else{
          socket.emit('register-fail', 'Unable to create account');
        }
      }
    }
  })

  socket.on('send-chat-message', message => {
    // Check that the client is logged in, and discard their messages otherwise
    if (typeof users[socket.id] == "string"){
      // Make sure message has a suitable type value
      if (!(typeof message.type == "string" && (message.type === "text" || message.type === "image" || message.type === "file"))){
        // Ignore the message
        console.log("🚨 An message with an invalid type was received");
        return;
      }
      let name = users[socket.id];

      // Write the new message to file
      let filteredMessage = message.content;
      // Only filter text based messages for profanity
      if (message.type === "text") filteredMessage = profanityFilter.filter(filteredMessage);
      if (name == null || name == undefined || name == "") name = "unknown";
      // Although async, this should not be awaited as we don't need to know the result.  This means we can just run addMessage in the background and move on
      Storage.addMessage(new Message(name, message.type, filteredMessage, message.fileName));

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
    let name = users[socket.id];
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