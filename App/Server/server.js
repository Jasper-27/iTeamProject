const Message = require("./Message");
const DataAccess = require("./DataAccess/dataAccess");
const profanity = require("./ProfanityFilter");
const Settings = require("./Settings.js"); 

const messagesFolderPath = __dirname + "/data/messages";
const messagesIndexPath = __dirname + "/data/messages/messages_index.wdx";
const logsFolderPath = __dirname + "/data/logs";
const logsIndexPath = __dirname + "/data/logs/logs_index.wdx";
const accountsFilePath = __dirname + "/data/accounts/accounts.wac";
const profilePicturesFilePath = __dirname + "/not/implemented.yet";

var Storage = new DataAccess(messagesFolderPath, messagesIndexPath, logsFolderPath, logsIndexPath, accountsFilePath, profilePicturesFilePath);

const users = {}  // Maps socket ids to usernames
let loggedInUsers = {}  // Contains access token for user, uses usernames as keys


//-----------------------------------------------------------------------------------------------------------------
//// Login API 

const cors = require('cors')
const express = require('express');

const Account = require("./Account");


const app = express()
const APIport = 8080


//production
const reauthInterval = 60000 // the gap between the server checking when the client last check in
const checkInWindow = 40000 //the time window the client has to check in (needs to be great that set on client)

// //Testing  (remember to change on client)
// const reauthInterval = 5000 // the gap between the server checking when the client last check in
// const checkInWindow = 10000


app.use ( express.json() )
app.use( cors() ) 

app.post('/login', async (req, res) => {  // Function must be async to allow use of await
    try{
      const { password } = req.body; 
      const { username } = req.body;

      // Checks to see if the user is in the file. 
      let user = await Storage.checkAccountCredentials(username, password);   // Returns an account object if credentials match 
      if (user instanceof Account){
        let name = user.userName;

        // generate the users token
        let token = require('crypto').randomBytes(64).toString('hex'); 

        loggedInUsers[name] = { 
          "token" : token, 
          "lastCheckIn" : +new Date()
        }

        res.send({
          message: `Authentication success`,
          token: `${ token }`,    // the response 
        })

        console.log("🔑 User: " + username + " has logged in")
        Storage.log("User: " + username + " has logged in")

      }else{
        res.status(406).send({message: 'Incorrect credentials'})
      }
    }
    catch (err){
      res.status(500).send({message: 'An internal error occurred'});
      console.log("⚠ An unexpected error occurred on login attempt");
      Storage.log("An unexpected error occured on login attempt");
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

Storage.log("Server started")

var profanityFilter = new profanity("*", true);

//reading settings from settings file 
let settings = Settings.readSettings();

//for getting the connected users 
var connected = []; 

// Used for detecting spam
var clients = [];
var spamTracker;
//var spamCounter;
//var spam = false;

console.log("*****************************************");
console.log("*          😉 WINKI SERVER 😉           *");      
console.log("*****************************************");
console.log(); 

console.log(`📧 Message socket online: http://localhost:${socketPort}`)

io.on('connection', socket => {


  // Every min re-authenticate the clients. 
  const heartBeatReauth = setInterval(function() { 
    checkAuth(socket)
  }, reauthInterval)

  //checking the user is still who they are during
  socket.on('renew-auth', async data => {
    let username = data.username
    let token = data.token
    let timestamp = +new Date()
    // console.log("⌚:  " + timestamp)

    let name = await verifyToken(username, token) 
    

    // console.log("👵 " + token)
    let newtoken = require('crypto').randomBytes(64).toString('hex'); 
    // console.log("👶 " + newtoken)

    if (name == null){ return }

    try{
      if (loggedInUsers[name].token === token){ //if the token is valid
        io.to(socket.id).emit('refresh-token', newtoken)  // sends the user their new token
        loggedInUsers[name].token = newtoken
        loggedInUsers[name].lastCheckIn = timestamp
      }else{ // if it isn't 
        socket.emit('auth-renew-failed')
        console.log("🚨 " + username + " has used an invalid token" )
        disconnectUser(socket, username)
        socket.disconnect()
      }
    }catch{
      socket.disconnect()
    }
    

  })


  //checking the user credentials when signing in
  socket.on('attempt-auth', async data =>{
    let username = data.username
    let token = data.token

    //Checks the username and token are valid. Returns null if they are not
    let name = await verifyToken(username, token)

    if (name == null){
      socket.emit('auth-failed')
      return
    }

    try{
      //Checks the username and token are for the user in question
      if (loggedInUsers[name].token === token){
        // Tell client that login was successful
        io.to(socket.id).emit('login-success');

        // Add socket to the "authorised" room so they can receive messages
        socket.join('authorised');
        socket.to('authorised').emit('user-connected', username); // Announce that the user has connected
        io.to(socket.id).emit("send-username", username); // tells the new user what their name is

        users[socket.id] = name;

        // adds the username to list of connected users (provided it isn't there already)
        if (connected.indexOf(username) < 0){
          connected.push(username); 
          socket.to('authorised').emit('send-users', connected);  


          spamTracker = {client: username, spamCounter: 0, spam: false};
          clients.push(spamTracker);
        }

        io.to(socket.id).emit('settings', settings); //Sends settings to the client 

        console.log("👋 User " + username + " connected");

      }else{
        socket.leave('authorised')
        socket.emit('authentication-failed')
        console.log("😭 "+ username + " Had a failed authentication")
      }
    
    }catch{
      socket.disconnect()
    }
 
  })


  /*
    THIS NEEDS TO BE MOVED TO THE ADMIN INTERFACE AT SOME POINT
  */
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
          Storage.log("New account created: " + details.username);
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

      // Block blacklisted files
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

      // Checks if user sending message has spam flag
      for (var j of clients) {

        if (j.client == name && j.spam == true) {
          console.log("A message from " + j.client + " was detected as spam!");
          return;
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

      // Finds the client who has just sent a message
      for (var i of clients) {

        if (i.client == name) {

          // Increments spam counter
          i.spamCounter = i.spamCounter + 1;

          // Applies spam flag to user if counter exceeds 9
          if (i.spamCounter > 9) {

            i.spam = true;
          }
        }
        // Decrements user counter when someone else sends a message
        else {
          i.spamCounter = i.spamCounter - 1;

          // Doesn't allow counter to go below 0
          if (i.spamCounter < 0) {

            i.spamCounter = 0;
          }
          if (i.spamCounter < 10) {

            i.spam = false;
          }
        }
      }
    }
  })

  socket.on('disconnect', () => {

  try{
    let name = users[socket.id];
    // Only continue if name exists (meaning user was properly connected and logged in)
    if (typeof name == "string"){
      socket.to('authorised').emit('user-disconnected', name);
      //logs that the user disconnected at this time
      Storage.log(name + " disconnected"); 
      console.log("💔 " + name + " disconnected"); 

      delete users[socket.id]; // remove the user from the connected users (but doesn't delete them, sets to null i think)

      //removes the users name from the client list when they log out
      var index = connected.indexOf(name);
      if (index > -1) {
          connected.splice(index, 1);
      }
      socket.to('authorised').emit('send-users', connected);
    }
    }catch{
      console.log("error removing user, could have been kicked")
    }
   
  })

  // allows the client to request a list of new users. tried to remove this but everything broke
  socket.on('get-users', out => {
    socket.to('authorised').emit('send-users', connected);
  })
})


async function verifyToken(username, token) {
  if (username == null){
    return
  }
  if (token == null){
    return
  }
  try{
    let user = await Storage.getAccount(username)
    if (loggedInUsers[user.userName] == null){
      return "no user"
    }
    return user.userName;
  }
  catch(reason){
    if (reason == "Requested account does not exist"){
      console.log("User not found")
      return
    }
  }
}


function disconnectUser(socket, username){


  console.log("🚨 " + username + " failed authentication" )
  logger.log("🚨 " + username + " failed authentication ")

  delete users[socket.id]; // remove the user from the connected users (but doesn't delete them, sets to null i think)

   // you know, just to be extra sure 
   socket.leave('authorised')
   socket.disconnect(); 
 
  //removes the users name from the client list when they log out
  var index = connected.indexOf(username);
  if (index > -1) {
      connected.splice(index, 1);
  }
  socket.to('authorised').emit('send-users', connected); 
}


function checkAuth(socket){
  try{
    let username = users[socket.id]
    if ( username == null ) { 
      socket.disconnect()
      return 
    }

    let currentTime = +new Date()
    
    if (currentTime - loggedInUsers[username].lastCheckIn > checkInWindow){ // If there has been x time between checking in 
      console.log("🚨 " + username + " did not check in soon enough")
      disconnectUser(socket, username)
    }else{
      // console.log("✅ " + username + " checked in on time")
    }
  }catch{
    console.log("⚠ Error disconnecting socket")
    socket.disconnect()
  }
}