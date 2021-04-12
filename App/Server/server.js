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


const colour = require("colors")
const cryptico = require("cryptico")


// RSA Encrypion (for key exchange)
const PassPhrase = "This password needs to be different for each install"; 
var private = cryptico.generateRSAKey(PassPhrase, 1024);
var public = cryptico.publicKeyString(private);       

// AES Encryption (for messages)
// var AESPassword = require('crypto').randomBytes(256).toString('hex'); 
var AESKey = cryptico.generateAESKey(PassPhrase, 1024)
var plainKey = bufferToString(AESKey)// convert string to plain text 


//production
const reauthInterval = 60000 // the gap between the server checking when the client last check in
const checkInWindow = 40000 //the time window the client has to check in (needs to be great that set on client)

// //Testing  (remember to change on client)
// const reauthInterval = 5000 // the gap between the server checking when the client last check in
// const checkInWindow = 10000



//-----------------------------------------------------------------------------------------------------------------
//// Login API 

const cors = require('cors')
const express = require('express');


const Account = require("./Account");
const { time } = require("console");


const app = express()
const APIport = 8080


app.use ( express.json() )
app.use( cors() ) 


app.get("/PublicKey", async(req, res) => {
  res.writeHead(200, {"Content-Type": "application/json"});
  res.write(public);
});

app.post('/login', async (req, res) => {  // Function must be async to allow use of await
  try{
    const { hashed_password } = req.body; 
    const { username } = req.body;
    const { client_public_key } = req.body; 

    // console.log(client_public_key)

    let password = cryptico.decrypt(hashed_password, private).plaintext

    let user = await Storage.checkAccountCredentials(username, password);   // Returns an account object if credentials match 
    if (user instanceof Account){
      let name = user.userName;

      // generate the users token
      let token = require('crypto').randomBytes(64).toString('hex'); 

      loggedInUsers[name] = { 
        "token" : token, 
        "lastCheckIn" : +new Date(), 
        "publicKey" : client_public_key
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
  () => console.log(`🔐 Login API online: http://localhost:${APIport}` .green.bold)
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

console.log("*****************************************" .blue);
console.log("*          😉 WINKI SERVER 😉           *" .blue);      
console.log("*****************************************" .blue);
console.log(); 

console.log(`📧 Message socket online: http://localhost:${socketPort}` .green.bold)

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
    console.log("attempt auth")
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

       
        //Sending AES key to the server 
        let encrypted = cryptico.encrypt(plainKey, loggedInUsers[name].publicKey)        
        socket.emit('send-aes', encrypted.cipher)


        // //Testing the encryption 
        // console.log("Starting enc test")
        // let payload = cryptico.encryptAESCBC("Test message", AESKey)
        // console.log(payload)
        // socket.emit('enc-test', payload)

      }else{
        socket.leave('authorised')
        socket.emit('authentication-failed')
        console.log("😭 "+ username + " Had a failed authentication")
      }
    
    }catch(e){
      console.log(e)
      socket.disconnect()
      console.log("user was disconnected because of an error")
    }
 
  })

  // Broadcast to other users when someone is typing
  socket.on('user_typing',  async myUsername => {
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


  socket.on('send-chat-message', message => {
    let name = users[socket.id];

    if (name == null || name == undefined || name == "") { socket.disconnect() } // Think this line is redundent

    // Checks if user sending message has spam flag
    for (let i of clients) {
      if (i.client == name && i.spam == true) {
        console.log("A message from " + i.client + " was detected as spam!");
        return;
      }
    }

    if (messageChecks(message) == false){
      console.log("🚨 message failed checks")
      return
    }

    // handeling text messages
    if (message.type == "text"){
      message.content = decrypt(message.content)
      message.content = profanityFilter.filter(message.content)

      // The @ing code 
      if (message.content.includes("@")){
        message.content.split(" ").forEach((item, index) => {
          if (item.charAt(0) == "@"){
            socket.to('authorised').emit('mentioned', { target: item.substring(1), sender: name} );
          }
        });
      }
    }
    
    if (message.type == "image"){ }

    if (message.type == "file") {
      // Restriced files 
      for (let i of settings.restrictedFiles) {
        if (message.fileName.includes(i)) { return }
      }
    }
  
    // storing the message 
    Storage.addMessage(new Message(name, message.type, message.content, message.fileName))

    if (message.type == 'text') { message.content = encrypt(message.content) } // only encrypt text for now

    // Sending message back to everyone 
    socket.to('authorised').emit('chat-message', {
      message: message, 
      name: name 
    });
    
    // Also send the message back to the user that sent it 
    io.to(socket.id).emit('chat-message',{ 
      message: message, 
      name: name 
    })


    /* This code is bad, needs replacing */ 
    // marks any new messages as spam after 9 messages 
    for (var i of clients) {
      if (i.client == name) {
        i.spamCounter++
        if (i.spamCounter > 9) { i.spam = true }
      } else {
        i.spamCounter--
        if (i.spamCounter < 0) {  i.spamCounter = 0  }
        if (i.spamCounter < 10) { i.spam == false } 
      }
    }
    
  })

  function messageChecks(message){
    
    // Make sure message has a suitable type value
    if (!(typeof message.type == "string" && (message.type === "text" || message.type === "image" || message.type === "file"))){
      console.log("🚨 An message with an invalid type was received");
      return false
    }

    if (message.content == ""){
      console.log("🚨 An empty message got through");
      return false
    }

    if (message.type === "text" && message.content.length > settings.messageLimit){ // again, just for redundancy 
      console.log("🚨 A message that was too long got though");
      return false
    }

    return true
  }

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


  var toggle;

  socket.on('profanityToggle', (profanitySettings) => {

    if (profanitySettings.profanitySettings == 1) {

      profanityFilter.toggleCustom()
      profanityFilter.load();
      socket.emit('toggle-update');
      toggle == 1;
      profanityFilter.savePreset(toggle);
      var emitWords = profanityFilter.readBanlistFromFile();
      socket.emit('get-Profanity', {"words": emitWords});
    }else if (profanitySettings.profanitySettings == 0) {

      profanityFilter.toggleDefault()
      profanityFilter.load();
      socket.emit('toggle-update');
      toggle == 0;
      profanityFilter.savePreset(toggle)
      var emitWords = profanityFilter.readBanlistFromFile();
      socket.emit('get-Profanity' , {"words": emitWords});
    }

  })

  socket.on('profanityCustomWords', (wordsCustom) => {
    // takes wordsCustom and creates a response to be file written in a 1d array
    var res = wordsCustom.wordsCustom.split(" ").join("\n")
    const fs = require("fs")

    s.writeFile("bannedWordsCustom.txt", res, function (err) {
      if(err){
          return console.log(err);
      }
    })
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



function encrypt(data){
  data = Buffer.from(data).toString('base64')
  let encrypted = cryptico.encryptAESCBC(data, AESKey)
  return encrypted
}

function decrypt(data){
  let decrypted = cryptico.decryptAESCBC(data, AESKey)
  decrypted =  Buffer.from(decrypted, 'base64').toString()
  return decrypted
}

function bufferToString(buffer){
  // Convert a Buffer array to a string
  let outputStr = "";
  for (let i of buffer.values()){
      outputStr += String.fromCharCode(i);   
  }
  return outputStr;

}
function stringToBuffer(str){
  // Convert string to buffer
  let buffer = []
  for (let i = 0; i < str.length; i++){
      buffer.push(str.charCodeAt(i))
  }
  return buffer
}