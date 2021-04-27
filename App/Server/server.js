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

const fs = require('fs');  // TESTING ONLY
const blobAccess = require('./DataAccess/FileAccess/blobAccess');  // THIS ALSO
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
          "lastCheckIn" : +new Date(),
          "sendStream": null,
          "readStream": null
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

const ss = require('socket.io-stream');

Storage.log("Server started")

var profanityFilter = new profanity("*", true);

//reading settings from settings file 
let settings = Settings.readSettings();

//for getting the connected users 
var connected = []; 

// Used for detecting spam
var clients = [];
var spamTracker;

/* 
List of files available to be streamed (these can be requested by clients to get the files attached to file messages)
The list maps numerical ids to positions in the file for storing images and files
This is necessary as giving the client the positions directly would be insecure, as the client could specify an invalid position
To prevent it growing infinitely, the list is limited to 1000 available files at a time.  When more files become available, the oldest is pushed out
*/
var availableFiles = [];
var availableFilesNextPos = -1;  // Start from -1 so first one will be 0

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
        // Get previous 20 messages and send them to the user
        Storage.getMessagesBeforeTimestamp(999999999999999, 20).then(previousMessages => {
          let messagesToSend = [];
          // Needs to be sent in reverse order so that older messages are further up
          for (let i = previousMessages.length - 1; 0 < i; i--){
            messagesToSend.push({"name": previousMessages[i].senderUsername, "message": {"type": previousMessages[i].type, "content": previousMessages[i].content, "time": previousMessages[i].timeStamp, "fileName": previousMessages[i].fileName}});
          }
          socket.emit('old-messages', messagesToSend);
        });

        let stream = ss.createStream();
        ss(socket).emit('test-image', stream, {name: "overlayTest.jpg"});
        fs.createReadStream(__dirname + "/data/test/jre-8u271-windows-i586-iftw.exe").pipe(stream);
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

  // Broadcast to other users when someone is typing
  socket.on('user_typing', myUsername => {
    try{
      if (loggedInUsers[myUsername] != null){ // stops users without a name from being set as typing. 
        socket.to('authorised').emit('user_typing', myUsername);
      }else{
        console.log("🚨 Typing user is not logged in")
      }
    } catch{
      console.log("🚨🚨 Typing user is not logged in")
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


  socket.on('send-chat-message', message => processChatMessage(socket, message));

  socket.on('request-send-stream', details => {
    // The client is requesting a stream with which they can send a file based message
    try{
      if (loggedInUsers[users[socket.id]].sendStream){
        // Client already has one writable stream open, they can't have another
        socket.emit('reject-send-stream', 'Existing writable stream already open');
      }
      else if (details.type === "file_message"){
        // The client wants to send a file based message
        if (details.size <= settings.fileSizeLimit){
          // Create a message object
          if (details.messageDetails.type != "file" && details.messageDetails.type != "image") socket.emit('reject-send-stream', 'Invalid message');
          // The content and timestamp fields will be provided later once the stream is complete
          let message =  {"type": details.messageDetails.type, "fileName": details.messageDetails.fileName};
          // Create a stream and send it to the client, so they can use it to stream data to the server
          let stream = ss.createStream();
          // Allocate blob space
          blobAccess.allocate(__dirname + "/data/test/testBlob.blb", details.size).then(addr => {
            blobAccess.getWritableStream(__dirname + "/data/test/testBlob.blb", addr).then(fileStream => {
              stream.pipe(fileStream);
              loggedInUsers[users[socket.id]].sendStream = fileStream;
              fileStream.on("finish", () => {
                // Add position to content field of message object
                message.content = addr.toString();
                // Send message to users and save to file
                processChatMessage(socket, message);
                // Destroy the stream when finished
                fileStream.destroy();
                loggedInUsers[users[socket.id]].sendStream = null;
              });
              fileStream.on("close", () => {
                // If stream is closed early, then deallocate the newly allocated space
                if (fileStream.totalLifetimeBytesWritten < details.size){
                  blobAccess.deallocate(__dirname + "/data/test/testBlob.blb", addr).then(() => {
                    if (loggedInUsers[users[socket.id]]){
                      // Only if the user hasn't already been destroyed
                      loggedInUsers[users[socket.id]].sendStream = null;
                    }
                  });
                }   
              });
              ss(socket).emit('accept-send-stream', stream);
            });
          });
          
        }
        else{
          socket.emit('reject-send-stream', 'File is too large');
        }
      }
      
    }
    catch (e){
      socket.emit('reject-send-stream', 'Error Occured');
    }
    
  });

  socket.on('request-read-stream', fileId => {
    // The client is requesting to be streamed a file
    try{
      if (loggedInUsers[users[socket.id]].readStream){
        // They already have a read stream open, they can't have another
        socket.emit('reject-read-stream', 'Existing readable stream already open');
      }
      else if (availableFiles[fileId]){
        // If fileId exists then stream that file from blob
        blobAccess.getReadableStream(__dirname + "/data/test/testBlob.blb", availableFiles[fileId]).then(fileStream => {
          let stream = ss.createStream();
          stream.on("finish", () => {
            stream.destroy();
            loggedInUsers[users[socket.id]].readStream = null;
          });
          loggedInUsers[users[socket.id]].readStream = stream;
          fileStream.pipe(stream);
          ss(socket).emit('accept-read-stream', stream);
        });
      }
      else{
        socket.emit('reject-read-stream', 'Invalid fileId');
      }
    }
    catch{
      socket.emit('reject-read-stream', 'Error Occured');
    }
  });
  socket.on('disconnect', () => {

  try{
    let name = users[socket.id];
    // Only continue if name exists (meaning user was properly connected and logged in)
    if (typeof name == "string"){
      // Close any streams the client had open
      if (loggedInUsers[name].sendStream){
        loggedInUsers[name].sendStream.destroy();
        loggedInUsers[name].sendStream = null;
      }
      if (loggedInUsers[name].readStream){
        loggedInUsers[name].readStream.destroy();
        loggedInUsers[name].readStream = null;
      }
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

async function processChatMessage(socket, message){
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

    if (message.type === "file" || message.type === "image"){
      // The content field will be a position in the file for storing files and images, but must be added to availableFiles
      if (999 <= availableFilesNextPos){
        // Start from 0 again if it goes over the maximum size, replacing the oldest
        availableFilesNextPos = 0;
      }
      else{
        availableFilesNextPos += 1;
      }
      // Place the positon in the file in availableFiles
      availableFiles[availableFilesNextPos] = Number(message.content);
      // Then send the position in availableFiles instead
      filteredMessage = availableFilesNextPos;
    }

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
}

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