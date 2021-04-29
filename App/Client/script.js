const socket = io('http://localhost:4500');
const messageContainer = document.getElementById('message-container'); 
const messageForm = document.getElementById('send-container');
const messageInput = document.getElementById('message-input'); 
const fileSelectButton = document.getElementById("choose-file-button");
const messageFileSelector = document.getElementById("choose-file-dialog");  // The <input type="file"/> element for selecting a file to send

var sendMessage;  // Holds a reference to the function for sending messages (will switch between sendText and sendFile)
var currentSendingUser;
var oldestMessageTime;  // Holds the datetime of the oldest message in messageContainer (needed to fetch older messages)

var myUsername = ""; 

var typingTimer = false;
var timeout = null;

// settings 
var settings 

var connectedUsersList = document.getElementById('users');  // The HTML list that contains the connected users 

// Used for detecting spam
var spamCounter = 0;
var spam = false;

getUsers();

attemptAuth()

let image = [];
ss(socket).on('test-image', stream => {
  stream.on('data', chunk => {
    console.log(chunk);
    for (let i in chunk){
      image.push(i);
    }
  });
});

// gets a username sent from the server
socket.on('send-username', data => {
  myUsername = data; 
  console.log("My username is: " + myUsername)
}) 

//Syncing settings with the server
socket.on('settings', data => {
  settings = data; 
})


//When a message is sent
socket.on('chat-message', data => {  // Messages will be recieved in format: {name: "<username of sender>", message: {type: "<text/image/file>", content: "<data>", fileName: "<name of file sent (only for file / image messages)>"}}
  addMessage(data.name, data.message); 
})

//This code runs if the user gets mentioned in a message
socket.on('mentioned', data => {
  if (data.target == myUsername){
    msgAlert('You got mentioned by:', data.sender)
  }
})

// When a user connects 
socket.on('user-connected', name => {
  var message = `${name} connected`;
  appendUserJoinOrDisconnect(message);
  getUsers(); 
})

//When a user disconnects 
socket.on('user-disconnected', name => {
  var message =(`${name} disconnected`);
  appendUserJoinOrDisconnect(message);
  getUsers(); 
})


//When the client is sent a list of users, update the display with that list
socket.on('send-users', connectedUsers => {
  console.log(connectedUsers); 
  generateUserList(connectedUsers); 
})

// When the client is sent old messages from before they connected
socket.on('old-messages', messages => {
  if (messages instanceof Array){
    let oldScrollHeight = messageContainer.scrollHeight;
    for (let i = 0; i < messages.length; i++){
      let message = messages[i];
      oldestMessageTime = message.message.time;
      addMessage(message.name, message.message, true);
    }
    // Recalculate scrollTop so that it is still scrolled to the same place as before the old messages where added
    messageContainer.scrollTop = messageContainer.scrollHeight - oldScrollHeight;
  }
});

// Request older messages when scrollbar is brought all the way up
messageContainer.onscroll = () => {
  if (messageContainer.scrollTop == 0){
    // If scrolled all the way to the top then request another 20 of the previous messages
    // Wait until the user releases the mouse on the scrollbar, otherwise it will immediately scroll even further up once messages have loaded
    let mouseReleased = () => {
      // Only continue if still scrolled to the top
      if (messageContainer.scrollTop == 0){
        if (oldestMessageTime == undefined) oldestMessageTime = 999999999999999;
        socket.emit('request-old-messages', oldestMessageTime);
      }
      // Clear listener for next time
      messageContainer.removeEventListener("mouseup", mouseReleased);
    };
    messageContainer.addEventListener("mouseup", mouseReleased);
  }
}



// Functions for sending messages
function sendText(){
  let message = messageInput.value;

  if (message.trim() == ""){  //Stops blank messages from being sent 
    return;
  }

  if (message.length > settings.messageLimit){  //Makes sure the message is not longer than the message limit 
    console.log("message is too long");
    msgAlert('Alert:', 'Message is too long.')
    return; 
  }

  // Blocks message if client has exceeded spam limit
  if (spam == true) {
    msgAlert('Alert:', 'Your message was detected as spam!')
    return;
  }


  socket.emit('send-chat-message', {type: "text", content: message});
  // console.log("Message sent: " + message)
  messageInput.value = ''; 
}

// function which creates an alert that doesn't pause JS
function msgAlert(TITLE,MESSAGE) {
  "use strict";   
  document.getElementById("msg").innerHTML = `<span class='closebtn' onclick="this.parentElement.style.visibility='hidden';"'>&times;</span><strong>   ${TITLE}  </strong>  ${MESSAGE}`;
  msg.style.visibility = 'visible';
}

function updateUploadProgress(sent, total){
  // Update the message in the message input box with the current progress while uploading a file
  let percentage = Math.floor((sent / total) * 100);
  messageInput.value = `Sending ${percentage}%`;
}

function sendFile(){

  // Only proceed if a file has been selected
  if (0 < messageFileSelector.files.length){
    file = messageFileSelector.files[0];
    message = {type: "", content: "", fileName: file.name};  // File messages also have a filename field


    // Client-side file extension blocking
    var restrictedFiles = settings.restrictedFiles;

    for (var i of restrictedFiles) {
      
      // Checks filename for the blacklisted file extensions
      if (file.name.search(i) != -1) {

        console.log("Invalid File Type");
        msgAlert('Alert:', 'File type not allowed! Please chose another file.')
        
        
        // User-friendliness
        exitSendFileMode();
        showFileSelector();

        return;
      }
    }


    // Set message type 
    if (file.type.split("/")[0] === "image") message.type = "image";
    else message.type = "file";
    // Convert file to base64 and send.  This should be done asyncronously to avoid large files blocking the UI thread
    reader = new FileReader();
    // Add code to event listener to run asyncronously when conversion to base64 is complete
    reader.addEventListener("load", () => {
      // Send message
      message.content = reader.result;
      // ISSUE: Disconnection issue occurs here when sending large files.  The client gets disconnected if the file is larger than the servers io.engine.maxHttpBufferSize
      // TEMPORARY SOLUTION:
      if (999900 < JSON.stringify(message).length){  // Limit is 1,000,000 but use 999,000 here to be safe
        msgAlert('Alert:', ' File is too big.')
        return;
      }

      socket.emit('send-chat-message', message);
    });
    // Start conversion to base64
    reader.readAsDataURL(file);
    // Return to normal text mode
    exitSendFileMode();
  }
}



// Send text is the default
sendMessage = sendText;

//When the send button is pressed 
messageForm.addEventListener('submit', e => {
  e.preventDefault(); 
  sendMessage();
})

//Decides who sent a message, then adds it to chat
function addMessage(inName, inMessage, oldMessage=false) {
  if (inName == myUsername) {
		appendMessage(inMessage, oldMessage);
  }
  else {
		var message = inMessage;
		appendMessageRecieve(message, inName, oldMessage);
  }    

}

function addMessageElement(element, insertAtBeginning=false){
  /* 
  Adds given HTML element to messageContainer
  If insertAtBeginning is true it will be inserted at the start (rather than appended to the end)
    - This is used when displaying old messages from before the user connected
  */
  if (insertAtBeginning === true){
    let firstChild = messageContainer.children[0];
    if (firstChild == undefined){
      // The new element is the first one
      messageContainer.append(element);
    }
    else{
      messageContainer.insertBefore(element, firstChild);
    }
  }
  else{
    messageContainer.append(element);
  }
}

//Adds a message you sent to that chat.  If oldMessage is true, the message will be inserted above all the other messages
function appendMessage(message, oldMessage=false) {
  // Need to take into account the current height of messageContainer before adding new element changes it, so do it up here
  let needsScroll = true;
  if (oldMessage === true || messageContainer.scrollTop != messageContainer.scrollHeight - messageContainer.offsetHeight) needsScroll = false;
  // get message time
  if (oldMessage === true){
    // If oldMessage use the time from the message
    var current = new Date(message.time);
  }
  else{
    // Otherwise use time from user's machine, as this will use their timezone
    var current = new Date();
  }
  current = current.toLocaleTimeString();
	
  //create the message box (div to hold the bubble)
  var messageBox = document.createElement('div');
  messageBox.className = "msg right-msg";
  addMessageElement(messageBox, oldMessage);
  
  //add user image
  var userImage = document.createElement('div');
  userImage.className = "msg-img";
  userImage.style.backgroundImage = "url(https://image.flaticon.com/icons/svg/145/145867.svg)";
  messageBox.appendChild(userImage);
  
  //specify and add the actual bubble 
  var messageBubble = document.createElement('div');
  messageBubble.className = "msg-bubble";
  messageBox.appendChild(messageBubble)
  
  //create time and date divs
  var messageInfoTime = document.createElement('div');
  var messageInfoName = document.createElement('div');
  messageInfoTime.className = "msg-info-time";
  messageInfoName.className = "msg-info-name";
  messageBubble.appendChild(messageInfoTime);
  messageBubble.appendChild(messageInfoName);
  messageInfoTime.innerText = current;
  messageInfoName.innerText = "You (" + myUsername + ")";
  
  var messageData;
  // How the message is displayed depends on the type of content
  if (message.type === "text"){
    messageData = document.createElement('div');
    messageData.className = "msg-text";
    messageData.innerText = message.content;
  }
  else if (message.type === "image"){
    messageData = document.createElement('img');
    messageData.className = "image-message msg-image";
    // messageData.src = message.content;
    fetchFile("image", message.fileName, message.content, messageData);
  }
  else if (message.type === "file"){
    messageData = document.createElement('div');
    messageData.className = "msg-text";
    let downloadBtn = document.createElement('a');
    // Specify that the link is to download, and specify the file name
    downloadBtn.download = message.fileName;
    downloadBtn.innerText = message.fileName;
    downloadBtn.href = message.content;
    messageData.appendChild(downloadBtn);
  }

  
  messageBubble.appendChild(messageData);
  // Only scroll to the bottom on a new message being added if the user is already scrolled to the bottom (otherwise they may be trying to read old messages)
  if (needsScroll){
    // If this is a new message, then scroll down to the bottom
    if (message.type === "image"){
      // For images, messageData may not always be fully loaded by the end of this function so scrollHeight can be innacurate.  So change the scrollTop in an event handler once messageData is fully loaded instead
      messageData.onload = () => messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    else{
      // However, for other types of messages do the scrolling here, as div elements fo not have an onload event
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  }

  spamCounter++;

  if (spamCounter > 9) {
    spam = true;
  }
}
                                              
//Adds a message someone else sent to the chat 
function appendMessageRecieve(message, inName, oldMessage=false) {
  // Need to take into account the current height of messageContainer before adding new element changes it, so do it up here
  let needsScroll = true;
  if (oldMessage === true || messageContainer.scrollTop != messageContainer.scrollHeight - messageContainer.offsetHeight) needsScroll = false;
  // get message time
  if (oldMessage === true){
    // If oldMessage use the time from the message
    var current = new Date(message.time);
  }
  else{
    // Otherwise use time from user's machine, as this will use their timezone
    var current = new Date();
  }
  current = current.toLocaleTimeString();
	
  //create the message box (div to hold the bubble)
  var messageBox = document.createElement('div');
  messageBox.className = "msg left-msg";
  addMessageElement(messageBox, oldMessage);
  
  //add user image
  var userImage = document.createElement('div');
  userImage.className = "msg-img";
  userImage.style.backgroundImage = "url(https://image.flaticon.com/icons/svg/327/327779.svg)";
  messageBox.appendChild(userImage);
  
  //specify and add the actual bubble 
  var messageBubble = document.createElement('div');
  messageBubble.className = "msg-bubble";
  messageBox.appendChild(messageBubble);
  
  //create time and date divs
  var messageInfoTime = document.createElement('div');
  var messageInfoName = document.createElement('div');
  messageInfoTime.className = "msg-info-time";
  messageInfoName.className = "msg-info-name";
  messageBubble.appendChild(messageInfoTime);
  messageBubble.appendChild(messageInfoName);
  messageInfoTime.innerText = current;
  messageInfoName.innerText = inName;
  
  var messageData = document.createElement('div');
  messageData.className = "msg-text";

  var messageData;
  // How the message is displayed depends on the type of content
  if (message.type === "text"){
    messageData = document.createElement('div');
    messageData.className = "msg-text";
     //check if the user is being @ed and make it bold 
    var inc = message.content.includes("@" + myUsername);
  

    //if they are being @ed.
    if (inc == true) {
      messageData.innerText = message.content;
      messageData.style.fontWeight = "bold";
    } 
    //if they are not being @ed then display the un-edited message
    else{
      messageData.innerText = message.content;
    }
  }
  else if (message.type === "image"){
    messageData = document.createElement('img');
    messageData.className = "image-message msg-image";
    messageData.src = message.content;
  }
  else if (message.type === "file"){
    messageData = document.createElement('div');
    messageData.className = "msg-text";
    let downloadBtn = document.createElement('a');
    // Specify that the link is for downloading, and specify the file name
    downloadBtn.download = message.fileName;
    downloadBtn.innerText = message.fileName;
    downloadBtn.href = message.content;
    messageData.appendChild(downloadBtn);
  }
  
  messageBubble.appendChild(messageData);
  // Only scroll to the bottom on a new message being added if the user is already scrolled to the bottom (otherwise they may be trying to read old messages)
  if (needsScroll){
    // If this is a new message, then scroll down to the bottom
    if (message.type === "image"){
      // For images, messageData may not always be fully loaded by the end of this function so scrollHeight can be innacurate.  So change the scrollTop in an event handler once messageData is fully loaded instead
      messageData.onload = () => messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    else{
      // However, for other types of messages do the scrolling here, as div elements do not have an onload event
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  }

  
  spamCounter--;

  if (spamCounter < 10) {

    spam = false;
  }

  if (spamCounter < 0) {

    spamCounter = 0;
  }
}

function appendUserJoinOrDisconnect(message){
  // Need to take into account the current height of messageContainer before adding new element changes it, so do it up here
  let needsScroll = true;
  if (messageContainer.scrollTop != messageContainer.scrollHeight - messageContainer.offsetHeight) needsScroll = false;
	// get current time
  var current = new Date();
  var current = current.toLocaleTimeString();
	
  //create the message box (div to hold the bubble)
  var messageBox = document.createElement('div');
  messageBox.className = "msg-System";
  messageContainer.append(messageBox);
  
  //add user image
  var userImage = document.createElement('div');
  messageBox.appendChild(userImage);
  
  //specify and add the actual bubble 
  var messageBubble = document.createElement('div');
  messageBubble.className = "msg-bubble";
  messageBox.appendChild(messageBubble);
  
  //create time and date divs
  var messageInfoTime = document.createElement('div');
  var messageInfoName = document.createElement('div');
  messageInfoTime.className = "msg-info-time";
  messageInfoName.className = "msg-info-name";
  messageBubble.appendChild(messageInfoTime);
  messageBubble.appendChild(messageInfoName);
  messageInfoTime.innerText = current;
  messageInfoName.innerText = "System";
  
  var messageData = document.createElement('div');
  messageData.innerText = message;
  
  messageBubble.appendChild(messageData);
  if (needsScroll){
    // Only scroll down to the notification if the user is already fully scrolled down (otherwise they may be trying to read old messages)
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }
	
}
// asks the server for a list of currently connected users 
function getUsers(){
  console.log("runningFunction");
  socket.emit('get-users', "");
}

// Fills up the connected users list on the client interface 
function generateUserList(list){
  connectedUsersList.innerHTML = ""; 
  list.forEach((item, index) => {
    var entry = document.createElement('li');
    entry.appendChild(document.createTextNode(item));
    connectedUsersList.appendChild(entry);
  });
}


// Add event handler for when a file is selected
messageFileSelector.onchange = () => {
  if (0 < messageFileSelector.files.length){
    // A file has been selected, display the name of the file in the message input area
    messageInput.disabled = true;     // Disable the input box
    // Add filename to input box
    messageInput.value = messageFileSelector.files[0].name;
    // Change "choose file" button to cancel file sending
    fileSelectButton.innerText = "Cancel";
    fileSelectButton.onclick = exitSendFileMode;

    // Override sendMessage to sendFile
    sendMessage = sendFile;
  }
};



function exitSendFileMode(){
  // Exit send file mode and allow text messages to be sent
  // Clear messageInput
  messageInput.value = "";
  // Re-enable messageInput
  messageInput.disabled = false;
  
  // Change "choose file" button back to its usual functionality (displaying file selector)
  fileSelectButton.innerText = "Choose File";
  fileSelectButton.onclick = showFileSelector;

  // Override sendMessage back to sendText
  sendMessage = sendText;
}

function showFileSelector(){
  // Trigger the selector dialog
  messageFileSelector.click();
}

// Token authentication stuff ===========================================

socket.on('auth-maintained', () => {
  console.log("😊 Authentication successful")
})

socket.on('auth-renew-failed', () => {
  alert("⚠ Authentication failed! ⚠")

})


socket.on('refresh-token', newToken => {
  sessionStorage.token = newToken
  console.log("😊 Authentication successful")
})

function attemptAuth(){
  socket.emit('attempt-auth', {"token": sessionStorage.token, "username" : sessionStorage.username})
}



// Listen for when client starts typing
messageInput.addEventListener('keypress', inUsername => { 
  // If user presses a key, system recognises that the variable is set to false
  if(typingTimer == false){
    inUsername = myUsername;
    // Emits the first notification to the server
    socket.emit('user_typing', inUsername);
    // Proof by logging on the console
    console.log('typing')
    // After the first keypress, the variable is set to true which kicks off the timer
    typingTimer = true;
    // Timer has a method which sets the typingTimer back to false and starts the process again if a user types a key
    setTimeout(timer, 3000)
  }
})

// Recieves broadcast from server about someone else typing and updates div
socket.on('user_typing', myUsername => {
  // Sets the div to visible
  feedback.style.visibility = 'visible';
  // Outputting which user is typing.
  feedback.innerHTML = '<p><em>' + myUsername + ' is typing... </em></p>';
  // Sets a timer triggered by the original key press. 
  // After 4 seconds the div will become invisible until it is triggered again.
  clearTimeout(timeout)
  timeout = setTimeout(invisible, 4000)
})

// Function which makes the feedback div invisible.
function invisible(){
  feedback.style.visibility = 'hidden';
}
// Function which sets typingTimer to false which starts again when a user hits a key.
function timer(){
  typingTimer = false;
}

function renewAuth(){
  console.log("renewAuth")
  socket.emit('renew-auth', {"token": sessionStorage.token, "username" : sessionStorage.username})
}

var requestedFileDetails = {};  // The type and filename of the requested file
function fetchFile(messageType, fileName, fileId, elementToInsertFile){
  requestedFileDetails = {"type": messageType, "fileName": fileName, "elementForFile": elementToInsertFile};
  // Fetch the file from the server via a stream
  socket.emit('request-read-stream', fileId);
}

var fileToSend;
function sendFileStream(file){  // Takes a JS file object and opens a stream to the server to send it
  fileToSend = file;
  let base64Length = 4 * Math.ceil(file.size / 3);  // Calculate the size of the string once this is converted to base64
  // Must also take the descriptor string into account ("data:<content type>/<file type>;base64,")
  base64Length += file.type.length + 13;  // file.type will give the <content type>/<file type> part of the string, and 13 is length of "data:;base64,"
  // Create a message details object in same format as normal text messages
  let messageDetails = {"type": "", "fileName": ""};
  if (file.type.split("/")[0] === "image") messageDetails.type = "image";
  else messageDetails.type = "file";
  messageDetails.fileName = file.name;
  // Send a request to the server to open up a writeable stream so this file can be sent
  socket.emit('request-send-stream', {"type": "file_message", "size": base64Length, "messageDetails": messageDetails});  // Type specifies whether this is part of a message or a profile picture
}

socket.on('reject-send-stream', reason => {
  if (reason === "File is too large"){
    msgAlert("Unable to send", `File must be less than ${settings.fileSizeLimit / 1000}KB`);
  }
  else{
    msgAlert("Unable to send", reason);
  }
});

ss(socket).on('accept-send-stream', stream => {
  // The server has accepted the write stream request and opened a stream, so send the file through it
  // First convert to base64
  if (fileToSend){
    // Only continue if fileToSend is defined
    let reader = new FileReader();
    reader.addEventListener("load", () => {
      // Once converted to base64, start sending to server

      // First set the cancel button to close the stream early if pressed
      fileSelectButton.onclick = () => {
        stream.end(exitSendFileMode);
      };
      // Divide string into suitably sized chunks and send one after the other using the stream
      let cursor = 0;
      // Function for writing data to the stream
      let write = () => {
        // Try to write to stream if it isn't full
        if (cursor < reader.result.length){
          if (stream._writableState.needDrain === false){
            // Otherwise wait until it drains
            stream.write(reader.result.slice(cursor, cursor + 16384), () => {
              cursor += 16384;
              // Update progress message
              updateUploadProgress(cursor, reader.result.length);
              write();
            });
          }
          else{
            // Otherwise wait until it drains
            stream.once('drain', write);
          }
        }
        else{
          // The file has been fully sent, so close the stream
          stream.end();
          exitSendFileMode();
        }
      };
      write();
    });
    reader.readAsDataURL(fileToSend);
  }
});

ss(socket).on('accept-read-stream', stream => {
  // This still holds the entire file in the client's memory
  let fileData = "";
  stream.on('data', chunk => {
    fileData += chunk;
  });
  stream.on("finish", () => {
    if (requestedFileDetails.type === "file"){
      requestedFileDetails.elementForFile.href = fileData;
    }
    else if (requestedFileDetails.type === "image"){
      requestedFileDetails.elementForFile.src = fileData;
    }
  });
});

sendFile = () => {
  sendFileStream(messageFileSelector.files[0]);
};

// Checking in with the server every X amount of times 
const heartBeatReauth = setInterval(function() { renewAuth() }, 20000)

// =============================================================================
