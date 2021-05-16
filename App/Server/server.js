const Message = require("./Message");
const DataAccess = require("./DataAccess/dataAccess");
const profanity = require("./ProfanityFilter");
const Settings = require("./Settings.js");

const messagesFolderPath = __dirname + "/data/messages";
const messagesIndexPath = __dirname + "/data/messages/messages_index.wdx";
const logsFolderPath = __dirname + "/data/logs";
const logsIndexPath = __dirname + "/data/logs/logs_index.wdx";
const accountsFilePath = __dirname + "/data/accounts/accounts.wac";
const attachmentsPath = __dirname + "/data/attachments/attachedFiles.blb";
const profilePicturesFilePath = __dirname + "/data/accounts/profilePictures.blb";

var Storage = new DataAccess(messagesFolderPath, messagesIndexPath, logsFolderPath, logsIndexPath, accountsFilePath, attachmentsPath, profilePicturesFilePath);

let users = {}  // Maps socket ids to usernames
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


var adminSecret = require('crypto').randomBytes(256).toString('hex'); 
var AdminAESKey = cryptico.generateAESKey(PassPhrase, 1024)

var adminPassword = "password"

let admins = [] // list of admin sockets 



//-----------------------------------------------------------------------------------------------------------------
//// API 

const cors = require('cors')
const express = require('express');


const Account = require("./Account");


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
      let encrypted_token = cryptico.encrypt(token, client_public_key).cipher // encrypted cipher for sending 

      loggedInUsers[name] = { 
        "token" : token, 
        "lastCheckIn" : +new Date(), 
        "publicKey" : client_public_key,
        "lastOldMessageRequest": 0,
        "sendStream": null,
        "readStream": null,
        "profilePicturePos": user.profilePictureLocation  // The position in the profile pictures blob file where the user's picture can be found
      }

      res.send({
        message: `Authentication success`,
        token: `${ encrypted_token }`,    // the response
      })

      console.log("🔑 User: " + username + " has logged in")
      Storage.log("User: " + username + " has logged in")

    }else{
      res.status(406).send({message: 'Incorrect credentials'})
    }
  }catch (err){
    res.status(500).send({message: 'An internal error occurred'});
    console.log("⚠ An unexpected error occurred on login attempt");
    Storage.log("An unexpected error occured on login attempt");
  }

})



/* Admin login */

app.post('/AdminLogin', async (req, res) => {  // Function must be async to allow use of await
  try{
    const { hashed_password } = req.body; 
    const { client_public_key } = req.body; 

    // console.log(client_public_key)

    let password = cryptico.decrypt(hashed_password, private).plaintext


    if (password == adminPassword){

      let encrypted_secret = cryptico.encrypt(adminSecret, client_public_key).cipher // encrypted cipher for sending 

      res.status(200).send({
        message: `Authentication success`,
        token: `${ encrypted_secret }`    // the response
      })

      console.log("🧠 an Admin has logged in")
      Storage.log("Admin has logged in ")

    }else{
      console.log("incorrect Admin credentials")
      res.status(406).send({message: 'Incorrect credentials'})
    }

  }catch (err){
    res.status(500).send({message: 'An internal error occurred'});
    console.log("⚠ An unexpected error occurred on login attempt");
    Storage.log("An unexpected error occured on login attempt");

    console.log(err)
  }

})



//Start the API listening on PORT
app.listen( 
  APIport, 
  () => console.log(`🔐 Login API online at port: ${APIport} \n` .green.bold)
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
const { Transform } = require("stream");
const e = require("cors");

Storage.log("Server started")

var profanityFilter = new profanity("*", true);

//reading settings from settings file 
let settings = Settings.readSettings();

//for getting the connected users 
var connected = []; 

// Used for detecting spam
var clients = {};
var spamTracker;

// List of the 20 most recent messages (to avoid needing to read disk when sending old messages every time a user connects)
var mostRecentMessages = [];

/* 
List of files available to be streamed (these can be requested by clients to get the files attached to file messages)
The list maps numerical ids to positions in the file for storing images and files
This is necessary as giving the client the positions directly would be insecure, as the client could specify an invalid position
To prevent it growing infinitely, the list is limited to 1000 available files at a time.  When more files become available, the oldest is pushed out
*/
var availableFiles = [];
var availableFilesNextPos = -1;  // Start from -1 so first one will be 0
var availableFilesIndeces = {};  // Like availableFiles but does the opposite- maps file positions to indeces in availableFiles

console.log("*****************************************" .cyan);
console.log("*          😉 WINKI SERVER 😉           *" .cyan);      
console.log("*****************************************" .cyan);
console.log(); 

console.log(`📧 Message socket online at port: ${socketPort}` .green.bold)

io.on('connection', socket => {
  // Admin stuff auth

  socket.on(`admin-auth`, data => {

    if (data == adminSecret){
      // console.log("🎉🎉 " + socket.id)
      admins.push(socket.id)
    }
  })

  // Every min re-authenticate the clients. 
   const heartBeatReauth = setInterval(function() {
    checkAuth(socket)
  }, reauthInterval)  - /// TEMPORARILY DISABLED AS CAUSING ISSUES WITH ADMIN INTERFACE.  MUST BE RE-ENABLED


  //checking the user is still who they are during
  socket.on('renew-auth', async data => {
    let username = data.username
    let token = decrypt(data.token)
    let timestamp = +new Date()
    // console.log("⌚:  " + timestamp)

    let name = await verifyToken(username, token) 
    if (name == null){ return }

    try{
      if (loggedInUsers[name].token === token){ //if the token is valid
        let newtoken = require('crypto').randomBytes(64).toString('hex'); 

        io.to(socket.id).emit('refresh-token', encrypt(newtoken))  // sends the user their new token
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
      console.log("👢" + socket.id + "Kicked out")
    } 

  })


  //checking the user credentials when signing in
  socket.on('attempt-auth', async data =>{

    try{
      let username = data.username
      let token = cryptico.decrypt(data.token, private).plaintext

      //Checks the username and token are valid. Returns null if they are not
      let name = await verifyToken(username, token)

      if (name == null){
        socket.emit('auth-failed')
        return
      }
  
      //Checks the username and token are for the user in question
      if (loggedInUsers[name].token === token){
        // Tell client that login was successful
        io.to(socket.id).emit('auth-success');

        // Add socket to the "authorised" room so they can receive messages
        socket.join('authorised');
        socket.to('authorised').emit('user-connected', username); // Announce that the user has connected
        io.to(socket.id).emit("send-username", username); // tells the new user what their name is

        users[socket.id] = name

        // adds the username to list of connected users (provided it isn't there already)
        if (connected.indexOf(username) < 0){
          connected.push(username);     
          if (clients[username] == undefined){
            spamTracker = {client: username, spamCounter: 0, spam: false};
            clients[username] = spamTracker;
          }
        }


        sendUsers(socket) // Sends the new users list to everyone

        io.to(socket.id).emit('settings', settings); //Sends settings to the client 
        console.log("👋 User " + username + " connected");
       
        //Sending AES key to the server 
        let encrypted = cryptico.encrypt(plainKey, loggedInUsers[name].publicKey)        
        socket.emit('send-aes', encrypted.cipher)
        
        // Tell client that login was successful, and send the user's spam count
        let userSpamCount = 0;
        if (clients[username] != undefined) userSpamCount = clients[username].spamCounter;
        socket.emit('login-success', userSpamCount);

        // Get previous 20 messages and send them to the user
        sendOldMessages(socket, 999999999999999);
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
          // Create Transform stream to sit in between stream and fileStream and decrypt data
          let decryptorStream = new Transform({transform: (data, encoding, callback) => {
            callback(null, decrypt(data.toString()));  // (error, data)
          }});
          // Allocate blob space
          Storage.allocateAttachmentsFileSpace(details.size).then(addr => {
            Storage.getAttachmentWriteStream(addr).then(fileStream => {
              stream.pipe(decryptorStream);
              decryptorStream.pipe(fileStream);
              loggedInUsers[users[socket.id]].sendStream = fileStream;
              let cancelled = false;
              fileStream.on("finish", () => {
                if (details.size <= fileStream.totalLifetimeBytesWritten && cancelled === false){
                  // Add position and size to content field of message object
                  message.content = `${addr.toString()}:${details.size}`;
                  // Send message to users and save to file
                  processChatMessage(socket, message);
                  // Destroy the stream when finished
                  fileStream.destroy();
                  loggedInUsers[users[socket.id]].sendStream = null;
                }
              });
              fileStream.on("close", () => {
                // If stream is closed early, then deallocate the newly allocated space
                if (fileStream.totalLifetimeBytesWritten < details.size){
                  cancelled = true;
                  Storage.deallocateAttachmentsFileSpace(addr).then(() => {
                    if (loggedInUsers[users[socket.id]]){
                      // Only if the user hasn't already been destroyed
                      loggedInUsers[users[socket.id]].sendStream = null;
                    }
                  });
                }   
              });
              ss(socket).emit('accept-send-stream', stream);
            },
            reason => {
              // An error occured when trying to get a write stream
              Storage.log(`Unable to create write stream. User: ${users[socket.id]} : ${reason}`);
              console.log(`Unable to create write stream. User: ${users[socket.id]} : ${reason}`);
              socket.emit('reject-send-stream', 'Error Occured');
            });
          },
          reason => {
            // An error occured when trying to allocate
            Storage.log(`Unable to allocate attachment space. User: ${users[socket.id]} : ${reason}`);
            console.log(`Unable to allocate attachment space. User: ${users[socket.id]} : ${reason}`);
            socket.emit('reject-send-stream', 'Error Occured');
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
        Storage.getAttachmentReadStream(availableFiles[fileId]).then(fileStream => {
          let stream = ss.createStream();
          // Create Transform stream to sit in between stream and fileStream and encrypt data
          let encryptorStream = new Transform({transform: (data, encoding, callback) => {
            callback(null, encrypt(data));
          }});
          let closeStream = () => {
            stream.destroy();
            encryptorStream.destroy();
            fileStream.destroy();
            loggedInUsers[users[socket.id]].readStream = null;
            // Notify client that the server will now permit another read stream (as this one has been fully closed)
            socket.emit('read-stream-allowed');
          };
          stream.on("finish", closeStream);
          socket.once('close-read-stream-early', closeStream);
          loggedInUsers[users[socket.id]].readStream = stream;
          fileStream.pipe(encryptorStream);
          encryptorStream.pipe(stream);
          ss(socket).emit('accept-read-stream', stream);
        }, 
        reason => {
          Storage.log(`Unable create read stream. User: ${users[socket.id]} : ${reason}`);
          console.log(`Unable to create read stream: User ${users[socket.id]} : ${reason}`);
          socket.emit('reject-read-stream', 'Error Occured');
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

  socket.on('request-change-pfp-stream', async imageDetails => {
    try{    // Client is requesting a stream with which they can change the user's profile picture
      if (100000 < imageDetails.fileSize){
        socket.emit('reject-change-pfp-stream', "Must be less than 100Kb");
        return;
      }
      let userStream = ss.createStream();
      let fileStream = await Storage.getChangeProfilePictureStream(users[socket.id], imageDetails.fileSize);
      loggedInUsers[users[socket.id]].sendStream = userStream;
      userStream.pipe(fileStream);
      fileStream.on("close", async () => {
        // Destroy stream and allow user to open another one
        fileStream.destroy();
        userStream.destroy();
        // Update loggedInUsers with the new picture location
        let accountData = await Storage.getAccount(users[socket.id]);
        if (accountData instanceof Account) {
          loggedInUsers[users[socket.id]].profilePicturePos = accountData.profilePictureLocation;
        }
        if (loggedInUsers[users[socket.id]] != undefined) loggedInUsers[users[socket.id]].sendStream = null;
      });
      ss(socket).emit('accept-change-pfp-stream', userStream);
    }
    catch(reason){
      Storage.log(`Unable to change profile picture for ${users[socket.id]}: ${reason}`);
      console.log(`Unable to change profile picture for ${users[socket.id]}: ${reason}`)
    }
  });

  socket.on('request-pfp-stream', requestedUsers => {
    try{
      // Client is requesting a stream to access profile pictures of logged in users
      if (loggedInUsers[users[socket.id]] == undefined){
        return;  // User not logged in
      }

      let pictureLocations = [];
      if (requestedUsers === "all"){
        // Send for all
        for (let usr in loggedInUsers){
          pictureLocations.push([usr, loggedInUsers[usr].profilePicturePos])
        }
      }
      else{
        // Requesting the picture for a specific user
        if (loggedInUsers[requestedUsers] == undefined){
          socket.emit('reject-pfp-stream', 'User not found');
        }
        else{
          pictureLocations.push([requestedUsers, loggedInUsers[requestedUsers].profilePicturePos]);
        }
      }
      let userStream = ss.createStream({allowHalfOpen: true});
      let fileStream;
      // Create a Tranform stream to sit in between fileStreams and userStream and determine when a particular image is complete

      let monitorStream = new Transform({transform: (data, encoding, callback) => {
        callback(null, data);  // (error, data)
        // Create an attribute to record how much data has been written for the current fileStream
        if (monitorStream.currentStreamAmountWritten == undefined) monitorStream.currentStreamAmountWritten = 0;
        monitorStream.currentStreamAmountWritten += data.length;
        // If all data has been read from the current fileStream, then run a custom callback
        if (fileStream && fileStream.maxAllowedReadLength <= monitorStream.currentStreamAmountWritten){
          monitorStream.currentStreamAmountWritten = 0;  // Reset ready for new stream
          if (monitorStream.onCurrentPipedStreamDone != undefined) monitorStream.onCurrentPipedStreamDone();
        }
      }});
      // For each in pictureLocations, get a stream from Storage and pipe it to userStream
      
      let sendPictures = async () => {
        if (0 < pictureLocations.length){
          let thisPicture = pictureLocations.pop();
          let useDefault = false;
          if (thisPicture[1] == 0){
            // If location is 0 then tell client to use default
            useDefault = true;
          }
          socket.emit('next-pfp', {"name": encrypt(thisPicture[0]), "useDefault": useDefault});  // Announce start of new user's pic, and send the username
          socket.once('ack-next-pfp', async () => {
            if (useDefault === true){
              // Just move onto the next one straight away
              sendPictures();
            }
            else{
              fileStream = await Storage.getReadProfilePictureStream(thisPicture[1]);
              // Attach custom callback to monitorStream to run when it is finished with the current picture
              monitorStream.onCurrentPipedStreamDone = () => {
                fileStream.unpipe(monitorStream);
                socket.emit('end-pfp', {"totalSize": fileStream.maxAllowedReadLength});
                socket.once('ack-end-pfp', () => {
                  // Move on to the next user
                  sendPictures();
                });
              };
              fileStream.pipe(monitorStream, {"end": false});
            }
          });
        }
        else{
          // All pictures have been read, so end stream
          userStream.end();
          if (loggedInUsers[users[socket.id]] != undefined) loggedInUsers[users[socket.id]].sendStream = null;
        }
      };
      monitorStream.pipe(userStream);
      loggedInUsers[users[socket.id]].sendStream = userStream;
      ss(socket).emit('accept-pfp-stream', userStream);
      sendPictures();
    }
    catch(err){
      Storage.log(err);
      console.log(err);
    }
  });

  socket.on('disconnect', () => {

    try{
      if (admins.includes(socket.id)){
        console.log("🧠 Bye Bye admin ")
        Storage.log("Admin has disconnected")
  
        var index = admins.indexOf(socket.id);
        if (index > -1) {
          admins.splice(index, 1);
        }

        if (socket.id > -1) {
          admins.splice(socket.id, 1);
        }
  
        // delete users[socket.id]
  
      }
    }catch{
      console.log("⚠ error while disconnecting an admin")
    }
    
   
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
        socket.to('authorised').emit('user-disconnected', encrypt(name));
        //logs that the user disconnected at this time
        Storage.log(name + " disconnected"); 
        console.log("💔 " + name + " disconnected"); 

        delete users[socket.id]; // remove the user from the connected users (but doesn't delete them, sets to null i think)

        //removes the users name from the client list when they log out
        var index = connected.indexOf(name);
        if (index > -1) {
          connected.splice(index, 1);
        }
        sendUsers(socket)
      }
    }
    catch{
      console.log("error removing user, could have been kicked")
    }
  })

  // Client wants the 20 messages preceding the given timestamp
  socket.on('request-old-messages', timestamp => sendOldMessages(socket, timestamp));

  // allows the client to request a list of new users. tried to remove this but everything broke
  socket.on('get-users', out => {
    sendUsers(socket)
  })

  var toggle;

  socket.on('profanityToggle', (data) => {

    try{
      // data = decrypt_admin(data)
      // profanitySettings = JSON.parse(data)

      profanitySettings = data
      
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
  

    }catch{
      console.log("⚠ proffanity error")
    }
    
    
  })

  socket.on('profanityCustomWords', (wordsCustom) => {
    // takes wordsCustom and creates a response to be file written in a 1d array
    var res = wordsCustom.wordsCustom.split(" ").join("\n")
    const fs = require("fs") // !This shouldn't be here - Jasper 

    // Writes to the bannedWordsCustom file that is used
    fs.writeFile("bannedWordsCustom.txt", res, function (err) {
      if(err){
          return console.log(err);
      }
    })
  })


  // Admin =====================================================================================================

  // Registering


  socket.on('test', data => {
    console.log("🔬 start test")
    console.log(data)
    console.log("")
    console.log(decrypt_admin(data))
  })

  // When user tries to create account
  socket.on('create-account', async data => {

    data = decrypt_admin(data)    
    let details = JSON.parse(data)

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




  // Deleting 

  socket.on('delete-account', async data => {
    try{
      data = decrypt_admin(data)    
      let details = JSON.parse(data)

      // Make sure given values are valid
      if (typeof details.username != "string"){
        socket.emit('delete-fail', 'Invalid username');
      }else{
        // Details are valid
        try{
          let deleteSuccessful = await Storage.deleteAccount(details.username);
          if (deleteSuccessful === true){
            socket.emit('delete-success');
            Storage.log("Account deleted : " + details.username);
            console.log("👍 Account deleted: " + details.username); 
          }
          else{
            socket.emit('delete-fail', 'Unable to delete account');
          }
        }
        catch (reason){
          console.log("⚠ delete fail " + reason)
          socket.emit('delete-fail', reason);
        }
      }

    }catch{
      console.log("⚠ error decrypting data")
    }
   

    
    
  })

  // Reading
  socket.on('read-account', async details => {
    
    let readSuccess = await Storage.getAccount(details.user);

    console.log("👍 Account Read: " + readSuccess.userName); 
    socket.emit('read-success', {"userName": readSuccess.userName, "firstName": readSuccess.firstName, "lastName": readSuccess.lastName});

  })

  // Updating 

  socket.on('update-name' , async (data) => {
    try{

      data = decrypt_admin(data)    
      let user = JSON.parse(data)

      let accountFirst = await Storage.changeFirstName(user.userId, user.firstName);
      let accountLast = await Storage.changeLastName(user.userId, user.lastName);
  
      // let account = await Storage.getAccount(user.userId)
      // console.log(account)

      console.log("📜 " + user.userId + " Name change ")
      Storage.log("Name change: " + user.userId)

    }catch{
      console.log("⚠ Error updating name")
    }
  })


  // Updating password 
  socket.on('update-Password', async (data) => {
    try{

      data = decrypt_admin(data)
      user = JSON.parse(data)

      let account = await Storage.getAccount(user.userName)
      let passChange = await Storage.changePassword(user.userName, user.newPass);

      socket.emit('update-Password-Status', 1);
      console.log("🔑 " + user.userName + " Password updated")
      Storage.log(user.userName + " Password updated")

    }catch{
      console.log("⚠ Error changing password")
      socket.emit("update-Password-Status", 0)
    }
    
  })

})

async function processChatMessage(socket, message){
  // Check that the client is logged in, and discard their messages otherwise
  let name = users[socket.id]
  if (name == null || name == undefined || name == "") {
    socket.disconnect()
    return
  }
  
  if (typeof users[socket.id] == "string"){
    
    if (messageChecks(message) == false){
      console.log("🚨 message failed checks")
      return
    }
    
    // Checks if user sending message has spam flag
    
      var client = clients[name];
      if (client != undefined && client.spam == true) {
        console.log("A message from " + name + " was detected as spam!");
        return;
      }
    
    
    // Decrypt content field
    if (message.type === "text") message.content = decrypt(message.content)
    
    
    // Write the new message to file
    let filteredMessage = message.content;
    // Only filter text based messages for profanity
    if (message.type === "text") filteredMessage = profanityFilter.filter(filteredMessage);

    let messageObj = new Message(name, message.type, filteredMessage, message.fileName);
    // Although async, this should not be awaited as we don't need to know the result.  This means we can just run addMessage in the background and move on
    Storage.addMessage(messageObj);
    // Also push to list of 20 most recent messages
    mostRecentMessages.push(messageObj);
    if (20 < mostRecentMessages.length){
      // Keep to maximum of 20 by pushing out old message
      mostRecentMessages.shift();
    }

    if (message.type === "file" || message.type === "image"){
      // If a file, the message object will contain the postion within the blob file that the file can be found, not the file itself.  So add to list of available files so client can request the file if it needs it
      let splitFileDetails = message.content.split(":");  // Content field is in format: "<position in blob file>:<file size (bytes)>" so split
      message.fileSize = Number(splitFileDetails[1]);
      filteredMessage = addToAvailableFiles(Number(splitFileDetails[0])).toString();
    }
    
    // Encrypt and send to users
    let content = encrypt(filteredMessage)
    let fileName;
    if (message.fileName != undefined) fileName = encrypt(message.fileName)

    socket.to('authorised').emit('chat-message', {
      message: {
        type: message.type, 
        content: content, 
        fileName: fileName,
        fileSize: message.fileSize  // This simply will be undefined if not a file
      }, 
      name: name 
    });


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
    
    // Must also send message to user that sent it
    socket.emit('chat-message', {
      message:{
        type: message.type, 
        content: content, 
        fileName: fileName,
        fileSize: message.fileSize
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
    for (var c in clients) {
      var i = clients[c];
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

  if (message.type === "text" && message.content.length > settings.messageLimit || message.content.length > 40000 || (message.fileName != undefined && 255 < message.fileName.length)){ // again, just for redundancy.  Absolute limit is 40000 
    console.log("🚨 A message that was too long got though");
    return false
  }

  return true
}

function sendOldMessages(socket, timestamp){
  // Send the 20 messages preceding the given timestamp
  if (typeof timestamp != "number" || timestamp < 0 || typeof users[socket.id] != "string" || Date.now() - loggedInUsers[users[socket.id]].lastOldMessageRequest < 1000) return;  // Either invalid timestamp value, user not logged in, or less than 1 second has passed since client's previous request for old messages so do nothing
  let sendMessages = (previousMessages) => {
    let messagesToSend = [];
    // Needs to be sent in reverse order so that older messages are further up
    for (let i = previousMessages.length - 1; 0 <= i; i--){
      let content = previousMessages[i].content;  // Must use a variable as otherwise the lastOldMessages array might be modified
      let fileSize;
      if (previousMessages[i].type === "file" || previousMessages[i].type === "image"){
        // Add to list of available files
        let splitFileDetails = previousMessages[i].content.split(":");
        fileSize = Number(splitFileDetails[1]);
        content = addToAvailableFiles(Number(splitFileDetails[0])).toString();
      }
      messagesToSend.push({"name": encrypt(previousMessages[i].senderUsername), "message": {"type": previousMessages[i].type, "content": encrypt(content), "time": +previousMessages[i].timeStamp, "fileName": encrypt(previousMessages[i].fileName), "fileSize": fileSize}});
    }
    // Record time of this request to prevent user sending another for 1 second
    loggedInUsers[users[socket.id]].lastOldMessageRequest = Date.now();
    socket.emit('old-messages', messagesToSend);
  };
  if (timestamp === 999999999999999){
    // Request is for the most recent messages so use the in memory list rather than reading disk
    if (0 < mostRecentMessages.length){
      sendMessages(mostRecentMessages);
    }
    else{
      // First need to fetch the 20 most recent messages (get 21 and discard latest as Storage returns messages including the one with the given timestamp)
      Storage.getMessagesBeforeTimestamp(timestamp, 21).then(messages => {
        messages.pop();
        mostRecentMessages = messages;
        sendMessages(mostRecentMessages);
      });
    }
  }
  else{
    Storage.getMessagesBeforeTimestamp(timestamp, 21).then(messages => {
      messages.pop()
      sendMessages(messages);
    });
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
 
  //removes the users name from the client list when they log outr
  var index = connected.indexOf(username);
  if (index > -1) {
    connected.splice(index, 1);
  }
  sendUsers(socket) 
}

function sendUsers(socket){
  let con = JSON.stringify(connected);
  socket.to('authorised').emit('send-users', encrypt(con));
}

function checkAuth(socket){
  try{

    // admin stuff

   
    if (admins.includes(socket.id)){
      // console.log("🎉 " + socket.id)
      return
    }

    let username = users[socket.id]
    if ( username == null ) { 

      /*
         There is a bug here. For some reason this line prints every auth cycle, after an admin logs out. 
         The admin is not in the users list. 
         and the function shouldn't run, because of the above return statement 

      */
      // console.log("👢 " + socket.id + " Kicked as username was null ")  


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
  decrypted = Buffer.from(decrypted, 'base64').toString()
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

function addToAvailableFiles(position){
  // Add a file position to the list of available files
  if (availableFilesIndeces[position] == undefined){
    // Only add to availableFiles if it isn't already there

    if (999 <= availableFilesNextPos){
      // Start from 0 again if it goes over the maximum size, replacing the oldest
      availableFilesNextPos = 0;
    }
    else{
      availableFilesNextPos += 1;
    }
    // Remove the existing file from availableFiles and replace it
    delete availableFilesIndeces[availableFiles[availableFilesNextPos]];
    // Place the positon in the file in availableFiles
    availableFiles[availableFilesNextPos] = position;
    availableFilesIndeces[position] = availableFilesNextPos;
    return availableFilesNextPos;
  }
  else return availableFilesIndeces[position];
}

function decrypt_admin(data){
  data = cryptico.decrypt(data, private)
  // let out = null 

  // console.log(data)

  // console.log(data.plaintext)
  data = Buffer.from(data.plaintext, 'base64').toString()

  let out = data.split(" , ")

  if (out[1] == adminSecret){
    return out[0]
  }else{      // This else is triggered when a non-admin tries to use admin commands

   
    console.log("⚠⚠ Admin failed security check. ⚠⚠")
    Storage.log("Admin failed security check")

    return
  }
}