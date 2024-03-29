const socket = io('http://' + self.location.host.split(':')[0] + ':4500'); // sets the ip and port to use with socket.io
const messageContainer = document.getElementById('message-container'); 
const messageForm = document.getElementById('send-container');
const messageInput = document.getElementById('message-input'); 
const fileSelectButton = document.getElementById("choose-file-button");
const messageFileSelector = document.getElementById("choose-file-dialog");  // The <input type="file"/> element for selecting a file to send
const feedback = document.getElementById("feedback");
const changePfpButton = document.getElementById('PfpButton');
const pfpModal = document.getElementById('changePfpModal');
const pfpImageSelector = document.getElementById('pfpInput');


var AESKey = ""

const defaultProfilePicture = "logo.png";

const fileSizeWarningThreshold = 5000000;  // Bytes. A warning will be displayed before downloading files larger than this

var sendMessage;  // Holds a reference to the function for sending messages (will switch between sendText and sendFileStream)

var currentSendingUser;
var oldestMessageTime;  // Holds the datetime of the oldest message in messageContainer (needed to fetch older messages)

var myUsername = ""; 

var typingTimer = false;
var timeout = null;

// settings 
var settings 

var connectedUsersList = document.getElementById('users');  // The HTML list that contains the connected users 
var connectedUsersListPopUp = document.getElementById('usersPopup'); //


profilePictures = {};  // Format {<username>:<profile picture (as base64 string)>}
usersListImageElements = {};  // Holds references to the HTML image elements for each user in the connected users list.  Format: {<username>: <HTML element>}
changePfpButton.src = defaultProfilePicture;

// Used for detecting spam
var spamCounter = 0;
var spam = false;

// getUsers();

attemptAuth()


socket.on('send-aes', data =>{
  
  //Decrypt the data 
  let rsaPass = sessionStorage.getItem('rsaPass')
  let private = cryptico.generateRSAKey(rsaPass, 1024); 
  let dec = cryptico.decrypt(data, private)

  AESKey = stringToBuffer(dec.plaintext) // Set the AESKe
  
})


//When the server connection is lost 
socket.on('disconnect', () => {
  document.location.href = "./loginPage.html";
})

// gets a username sent from the server
socket.on('send-username', data => {
  myUsername = data; 
  profilePictures[myUsername] = defaultProfilePicture;

}) 

//Syncing settings with the server
socket.on('settings', data => {
  settings = data; 
})


//When a message is sent
socket.on('chat-message', data => {  // Messages will be recieved in format: {name: "<username of sender>", message: {type: "<text/image/file>", content: "<data>", fileName: "<name of file sent (only for file / image messages)>"}}
  data.message.content = decrypt(data.message.content)
  if (data.message.fileName) data.message.fileName = decrypt(data.message.fileName);
  addMessage(data.name, data.message)
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
  // Request new user's profile picture
  socket.emit('request-pfp-stream', name);
})

//When a user disconnects 
socket.on('user-disconnected', name => {
  var message =(`${decrypt(name)} disconnected`);
  appendUserJoinOrDisconnect(message);
  getUsers(); 
  // Destroy user's profile picture to save memory
  delete profilePictures[name];
})


//When the client is sent a list of users, update the display with that list (triggered by get users)
socket.on('send-users', connectedUsers => {
  let usersList = JSON.parse(decrypt(connectedUsers))
  generateUserList(usersList)
})


// When the client is sent old messages from before they connected
socket.on('old-messages', messages => {
  if (messages instanceof Array){
    let oldScrollHeight = messageContainer.scrollHeight;
    for (let i = 0; i < messages.length; i++){
      let message = messages[i];
      oldestMessageTime = message.message.time;
      // Decrypt
      message.name = decrypt(message.name);
      message.message.content = decrypt(message.message.content);
      message.message.fileName = decrypt(message.message.fileName);
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
    let loadOlderMessages = () => {
      // Only continue if still scrolled to the top
      if (messageContainer.scrollTop == 0){
        if (oldestMessageTime == undefined) oldestMessageTime = 999999999999999;
        socket.emit('request-old-messages', oldestMessageTime);
      }
      // Clear listener for next time
      messageContainer.removeEventListener("mouseup", loadOlderMessages);
    };
    // Wait 0.5s and then load older messages if still scrolled to the top (prevents scrolling too far when using scrollwheel / touchscreen)
    setTimeout(loadOlderMessages, 500);
    // Scroll when the mouse is released on the scrollbar if still scrolled to the top (prevents scrolling too far if using scroll bar)
    messageContainer.addEventListener("mouseup", loadOlderMessages);
  }
}


// Functions for sending messages
function sendText(){
  let message = messageInput.value;

  if (message.trim() == ""){  return  } // stops blank messages

  if (message.length > settings.messageLimit || message.length > 40000){  //Makes sure the message is not longer than the message limit (or the absolute maximum of 40000)
    console.log("message is too long");
    msgAlert('Alert:', 'Message is too long.')
    return; 
  }

  // Blocks message if client has exceeded spam limit
  if (spam == true) {
    msgAlert('Alert:', 'Your message was detected as spam!')
    return;
  }

  socket.emit('send-chat-message', {type: "text", content: encrypt(message)})
  messageInput.value = ''
}

// function which creates an alert that doesn't pause JS
function msgAlert(TITLE,MESSAGE) {
  "use strict";   
  document.getElementById("errormessage").innerHTML = `<span class='closebtn' onclick="this.parentElement.style.visibility='hidden';"'>&times;</span><strong>   ${TITLE}  </strong>  ${MESSAGE}`;
  errormessage.style.visibility = 'visible';
}


function updateUploadProgress(sent, total){
  // Update the message in the message input box with the current progress while uploading a file
  let percentage = Math.floor((sent / total) * 100);
  messageInput.value = `Sending ${percentage}%`;
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
  userImage.style.backgroundImage = `url(${profilePictures[myUsername]})`;
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
    // Add file info to message bubble so user can choose whether to fetch from server (this is automatically done for new messages)
    messageData = document.createElement('img');
    let fetchDataLink = createFetchMessageLink(message, messageData);
    messageBubble.appendChild(fetchDataLink);
    if (messageContainer.scrollTop == messageContainer.scrollHeight - messageContainer.offsetHeight) messageData.onload = () => messageContainer.scrollTop = messageContainer.scrollHeight;
    messageData.className = "image-message msg-image";
    // If this is a new message then fetch it automatically
    if (oldMessage === false && message.fileSize < fileSizeWarningThreshold) fetchDataLink.click();
  }
  else if (message.type === "file"){
    messageData = document.createElement('div');
    messageData.className = "msg-text";
    let downloadBtn = document.createElement('a');
    // Hide downloadBtn until the file has been fetched from server
    downloadBtn.hidden = true;
    let fetchDataLink = createFetchMessageLink(message, downloadBtn);
    messageBubble.appendChild(fetchDataLink);
    // Specify that the link is to download, and specify the file name
    downloadBtn.download = message.fileName;
    downloadBtn.innerText = message.fileName;
    downloadBtn.href = message.content;
    messageData.appendChild(downloadBtn);
    if (oldMessage === false && message.fileSize < fileSizeWarningThreshold) fetchDataLink.click();
  }

  
  messageBubble.appendChild(messageData);
  // Only scroll to the bottom on a new message being added if the user is already scrolled to the bottom (otherwise they may be trying to read old messages)
  if (needsScroll){
    // If this is a new message, then scroll down to the bottom
    if (message.type === "image"){
      // For images, messageData may not always be fully loaded by the end of this function so scrollHeight can be innacurate.  So change the scrollTop in an event handler once messageData is fully loaded instead
      messageData.onload = () => messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    // However, for other types of messages do the scrolling here, as div elements fo not have an onload event
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }

  if (oldMessage === false){
    spamCounter++;
    if (spamCounter > 9) {
      spam = true;
    }
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
  // If this user's pfp is not available (e.g. because this is an old message) then use the default
  let profilePic = defaultProfilePicture;
  if (profilePictures[inName] != undefined) profilePic = profilePictures[inName];
  userImage.style.backgroundImage = `url(${profilePic})`;
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
    // Add file info to message bubble so user can choose whether to fetch from server (this is automatically done for new messages)
    messageData = document.createElement('img');
    let fetchDataLink = createFetchMessageLink(message, messageData);
    messageBubble.appendChild(fetchDataLink);
    messageData.className = "image-message msg-image";
    if (messageContainer.scrollTop == messageContainer.scrollHeight - messageContainer.offsetHeight) messageData.onload = () => messageContainer.scrollTop = messageContainer.scrollHeight;
    // If this is a new message then fetch it automatically
    if (oldMessage === false && message.fileSize < fileSizeWarningThreshold) fetchDataLink.click();
  }
  else if (message.type === "file"){
    messageData = document.createElement('div');
    messageData.className = "msg-text";
    let downloadBtn = document.createElement('a');
    // Hide downloadBtn until the file has been fetched from server
    downloadBtn.hidden = true;
    let fetchDataLink = createFetchMessageLink(message, downloadBtn);
    messageBubble.appendChild(fetchDataLink);
    // Specify that the link is to download, and specify the file name
    downloadBtn.download = message.fileName;
    downloadBtn.innerText = message.fileName;
    downloadBtn.href = message.content;
    messageData.appendChild(downloadBtn);
    if (oldMessage === false && message.fileSize < fileSizeWarningThreshold) fetchDataLink.click();
  }
  
  messageBubble.appendChild(messageData);
  // Only scroll to the bottom on a new message being added if the user is already scrolled to the bottom (otherwise they may be trying to read old messages)
  if (needsScroll){
    // If this is a new message, then scroll down to the bottom
    if (message.type === "image"){
      // For images, messageData may not always be fully loaded by the end of this function so scrollHeight can be innacurate.  So change the scrollTop in an event handler once messageData is fully loaded instead
      messageData.onload = () => messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    // However, for other types of messages do the scrolling here, as div elements do not have an onload event
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }

  if (oldMessage === false) {
    spamCounter--
    if (spamCounter < 10) { spam = false  }
    if (spamCounter < 0) {  spamCounter = 0 }
  }
}

function createFetchMessageLink(message, messageDataDiv, fileDetails=document.createElement('a')){
  // Return HTML element to fetch file on click
  //let fileDetails = document.createElement('a');
  fileDetails.innerText = `Load ${message.fileName} (${bytesToBestUnit(message.fileSize)})`;
  // Add warning if file is larger than 5mb as it may be too large for users browser
  if (fileSizeWarningThreshold < message.fileSize){
    fileDetails.innerText += " (File is very large, loading it could make your browser unstable)";
  }
  fileDetails.className = "fetch-file-link";
  fileDetails.onclick = () => fetchFile(message.type, message.fileName, message.fileSize, message.content, fileDetails, messageDataDiv);
  return fileDetails
}

function bytesToBestUnit(size){
  // Convert a number of bytes to the KB, MB, or GB (using base 10, not base 2 e.g. 1KB = 1000B not 1024)
  // Limit to 2 decimal places
  switch (Math.floor(Math.log10(size))){
    case 0:
    case 1:
    case 2:
      return `${size}B`;
    case 3:
    case 4:
    case 5:
      return `${(size / 1000).toFixed(2)}KB`;
    case 6:
    case 7:
    case 8:
      return `${(size / 1000000).toFixed(2)}MB`;
    default:
      return `${(size / 1000000000).toFixed(2)}GB`
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
  messageBox.className = "msg middle-msg";
  messageContainer.appendChild(messageBox);
  

  
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
  socket.emit('get-users', "");
}

// Fills up the connected users list on the client interface 
function generateUserList(list){
  // get current time
  var current = new Date();
  var current = current.toLocaleTimeString();
	
  connectedUsersList.innerHTML = " ";
  connectedUsersListPopup = document.getElementById('usersPopup');
  connectedUsersListPopUp.innerHTML = " ";

  list.forEach((item, index) => {
    // Add entry to profilePictures using default image
    if (profilePictures[item] === undefined) profilePictures[item] = defaultProfilePicture;
    var entry = document.createElement('li');
    var entryPopup = document.createElement('li');
    
	
	connectedUsersList.appendChild(entry);
  connectedUsersListPopUp.appendChild(entryPopup)
	
	var chatList = document.createElement('div');
	chatList.className = "chatList";
  var chatListPopup = document.createElement('div');
	chatListPopup.className = "chatList";
	
	entry.appendChild(chatList);
  entryPopup.appendChild(chatListPopup);
	
	var img = document.createElement('div');
	img.className = "img";
  img.style = "max-width: 5vh; height: auto;";
	
	chatList.appendChild(img);
	
	var icon = document.createElement('i');
	icon.className ="fa fa-circle";
	var image1 = document.createElement('img');
	image1.src = profilePictures[item];
  image1.alt = `${item}'s profile picture`;
	
	img.appendChild(icon);
	img.appendChild(image1);
	
  // Add image reference to list so it can be changed if profile picture changes
  usersListImageElements[item] = image1;
	
	var desc = document.createElement('div');
	desc.className = "feedback";
  var descPopUp = document.createElement('div');
	descPopUp.className = "feedback";
	
	var name = document.createElement('h5')
	name.innerText = item;
  var namePopUp = document.createElement('h5')
	namePopUp.innerText = item;
	
	desc.appendChild(name);
  descPopUp.appendChild(namePopUp);
	
	var small = document.createElement('small');
	small.innerText = "Last seen: " + current;
  var smallPopUp = document.createElement('small');
	smallPopUp.innerText = "Last seen: " + current;
	
	desc.appendChild(small);
  descPopUp.appendChild(smallPopUp);
		
	chatList.appendChild(desc);
  chatListPopup.appendChild(descPopUp);
  

  
	
    //entry.appendChild(document.createTextNode(item));
    //connectedUsersList.appendChild(entry);
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

    // Override sendMessage to sendFileStream
    sendMessage = sendFileStream;
  }
};

function exitSendFileMode(){
  // Exit send file mode and allow text messages to be sent
  // Clear messageInput
  messageInput.value = "";
  // Re-enable messageInput
  messageInput.disabled = false;
  
  // Change "choose file" button back to its usual functionality (displaying file selector)
  
  var icon = document.createElement('i');
  icon.className ="fa fa-photo";
	
  fileSelectButton.innerText = "";
  fileSelectButton.appendChild(icon);
  fileSelectButton.onclick = showFileSelector;

  // Override sendMessage back to sendText
  sendMessage = sendText;
}

function showFileSelector(){
  // Trigger the selector dialog
  messageFileSelector.click();
}

// Token authentication stuff ===========================================
socket.on('login-success', (spamCount) => {
  // Server sends users existing spam count on login, so client and serverside spam filters can be synchronised
  spamCounter = spamCount;
  if (10 <= spamCounter) spam = true;
  // On successful login, request profile pictures of logged in users
  socket.emit('request-pfp-stream', 'all');
});

socket.on('auth-maintained', () => {
  console.log("😊 Authentication successful")
})


socket.on('auth-renew-failed', () => {
  alert("⚠ Authentication failed! ⚠")
})


socket.on('refresh-token', newToken => {
  sessionStorage.token = decrypt(newToken)
})

function attemptAuth(){
  try{
    let token = cryptico.encrypt(sessionStorage.token, sessionStorage.serverPublic).cipher
    socket.emit('attempt-auth', {"token": token, "username" : sessionStorage.username})
  }catch{
    alert("ERROR with token, will disconnect soon")
  }
}

function renewAuth(){
  socket.emit('renew-auth', {"token": encrypt(sessionStorage.token), "username" : sessionStorage.username})
}

// Checking in with the server every X amount of times 
const heartBeatReauth = setInterval(function() { renewAuth() }, 20000)

// =============================================================================


// Listen for when client starts typing
messageInput.addEventListener('keydown', inUsername => { 
  // If user presses a key, system recognises that the variable is set to false
  if(typingTimer == false){
    inUsername = myUsername;
    // Emits the first notification to the server
    socket.emit('user_typing', inUsername);
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
  feedback.innerHTML =  myUsername + ' is typing...';
  // Sets a timer triggered by the original key press. 
  // After 4 seconds the div will become invisible until it is triggered again.
  clearTimeout(timeout)
  timeout = setTimeout(invisible, 4000)
})

socket.on('pfp-changed', data => {
  // Server sent a notification that the given user's profile picture has been updated
  let user = decrypt(data);
  socket.emit('request-pfp-stream', user);
});

// Function which makes the feedback div invisible.
function invisible(){
  feedback.style.visibility = 'hidden';
}
// Function which sets typingTimer to false which starts again when a user hits a key.
function timer(){
  typingTimer = false;
}

function encrypt(data){
  data = btoa(unescape(encodeURIComponent(data)));
  let encrypted = cryptico.encryptAESCBC(data, AESKey)
  return encrypted
}

function decrypt(data){
  let decrypted = cryptico.decryptAESCBC(data, AESKey)
  decrypted = decodeURIComponent(escape(window.atob(decrypted)));
  return decrypted
}

var fetchFilePromise = Promise.resolve("");  // Promise for chaining fetch file operations
var requestedFileDetails = {};  // The type and filename of the requested file
function fetchFile(messageType, fileName, fileSize, fileId, loadProgressDiv, elementToInsertFile){
  // Use a promise to allow requests to fetch files to be done one at a time (as the server does not allow the same client to fetch multiple at once)
  fetchFilePromise = fetchFilePromise.then(() => {return new Promise((resolve, reject) => {
    requestedFileDetails = {"type": messageType, "fileName": fileName, "fileSize": fileSize, "fileId": fileId,"loadProgressDiv": loadProgressDiv, "elementForFile": elementToInsertFile, "promiseRejector": reject, "promiseResolver": resolve};
    // Change the link for fetching the file into a progress message
    loadProgressDiv.onclick = () => {};  // Remove listener to prevent this being called again
    loadProgressDiv.className = "";
    loadProgressDiv.innerText = "Requesting file from server";
    // Fetch the file from the server via a stream
    socket.emit('request-read-stream', fileId);
  })});
  
}

var fileToSend;
function sendFileStream(){  // Takes a JS file object and opens a stream to the server to send it
  if (0 < messageFileSelector.files.length){
    var file = messageFileSelector.files[0];
  }
  else return;
  // Prevent file names over 255 chars
  if (255 < file.name.length){
    msgAlert("Cant send file:", "File name must be under 255 characters");
    return;
  }
  // Client-side file extension blocking
  var restrictedFiles = settings.restrictedFiles;

  for (var i of restrictedFiles) {
    
    // Checks filename for the blacklisted file extensions
    if (file.name.search(i) != -1) {

      console.log("Invalid File Type");
      msgAlert('Alert:', 'File type not allowed! Please choose another file.')
      
      
      // User-friendliness
      exitSendFileMode();
      showFileSelector();

      return;
    }
  }
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

function selectPfp(){
  // Open pfp selector
  pfpImageSelector.click();
}

var newProfilePicture;
function changeProfilePicture(){
  let feedbackMessageDiv = document.getElementById("changePfpFeedback");
  feedbackMessageDiv.display = "none";
  if (0 < pfpImageSelector.files.length){
    if (pfpImageSelector.files[0].type.split("/")[0] === "image"){
      newProfilePicture = pfpImageSelector.files[0];
      socket.emit('request-change-pfp-stream', {"fileSize": (4 * Math.ceil(newProfilePicture.size / 3)) + newProfilePicture.type.length + 13});
      pfpModal.style.display = "none";
    }
    else{
      feedbackMessageDiv.innerText = "File must be an image";
      feedbackMessageDiv.style.display = "block";
    }
    
  }
  else{
    feedbackMessageDiv.innerText = "No image selected";
    feedbackMessageDiv.style.display = "block";
  }
}

socket.on('reject-change-pfp-stream', reason => {
  msgAlert("Unable to change profile picture", reason);
});

ss(socket).on('accept-change-pfp-stream', stream => {
  let reader = new FileReader();
  reader.onload = () => {
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
        }
      };
      write();
  };
  reader.readAsDataURL(newProfilePicture);
});

socket.on('reject-send-stream', reason => {
  if (reason === "File is too large"){
    msgAlert("Unable to send", `File must be less than ${bytesToBestUnit(settings.fileSizeLimit)}`);
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
            stream.write(encrypt(reader.result.slice(cursor, cursor + 16384)), () => {
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

socket.on('reject-read-stream', reason => {
  msgAlert("Unable to fetch file", reason);
  requestedFileDetails.promiseRejector(reason);
});

ss(socket).on('accept-read-stream', stream => {
  // This still holds the entire file in the client's memory
  let fileData = "";
  let cancelled = false;
  // Change load file link to cancel button
  requestedFileDetails.loadProgressDiv.onclick = () => {
    cancelled = true;
    socket.emit('close-read-stream-early');
    requestedFileDetails.content = requestedFileDetails.fileId;
    createFetchMessageLink(requestedFileDetails, requestedFileDetails.elementForFile, requestedFileDetails.loadProgressDiv)
  };
  stream.on('data', chunk => {
    if (cancelled === false){
      requestedFileDetails.loadProgressDiv.innerText = `Fetching (${Math.floor((fileData.length / requestedFileDetails.fileSize) * 100)}%).  Click to cancel`;
      fileData += decrypt(chunk.toString());
    }
  });
  stream.on("finish", () => {
    // Remove the progress message
    requestedFileDetails.loadProgressDiv.remove();
    if (requestedFileDetails.type === "file"){
      requestedFileDetails.elementForFile.hidden = false;
      requestedFileDetails.elementForFile.href = fileData;
    }
    else if (requestedFileDetails.type === "image"){
      requestedFileDetails.elementForFile.src = fileData;
    }
  });
  socket.once('read-stream-allowed', () => {
    // The server has indicated that it will now allow another stream
    // Resolve the promise, allowing the next scheduled file to be fetched
    console.log("Stream closed");
    requestedFileDetails.promiseResolver();
  });
});

socket.on('reject-pfp-stream', reason => {
  msgAlert("Unable to fetch profile pictures", reason);
});

ss(socket).on('accept-pfp-stream', stream => {
  let currentUser;  // The username of the user whose profile picture is currently being sent
  let data = "";
  let currentPictureTotalSize;
  let onCurrentImageComplete;

  let endPfp = (totalSize) => {
    // Make sure picture has been fully sent first
    if (totalSize.totalSize <= data.length){
      profilePictures[currentUser] = data;
      // Update profile picture in connected users list
      if (usersListImageElements[currentUser] != undefined) usersListImageElements[currentUser].src = data;
      if (currentUser === myUsername) changePfpButton.src = data;
      socket.once('next-pfp', startNewPic);
      // Acknowledge that we are ready for the next picture
      socket.emit('ack-end-pfp');
    }
    else{
      // Otherwise set up callback to be run when it has been fully sent
      currentPictureTotalSize = totalSize.totalSize;
      onCurrentImageComplete = () => {
        currentPictureTotalSize = null;
        onCurrentImageComplete = null;
        profilePictures[currentUser] = data;
        // Update profile picture in connected users list
        if (usersListImageElements[currentUser] != undefined) usersListImageElements[currentUser].src = data;
        if (currentUser === myUsername) changePfpButton.src = data;
        socket.once('next-pfp', startNewPic);
        // Acknowledge that we are ready for the next picture
        socket.emit('ack-end-pfp');
      };
    }
    
  };

  let startNewPic = details => {
    // Another profile pic
    if (details.useDefault === true){
      profilePictures[decrypt(details.name)] = defaultProfilePicture;
      socket.once('next-pfp', startNewPic);
      // Acknowledge that we have processed it, so server knows to start next one
      socket.emit('ack-next-pfp');
    }
    else{
      // The image will be sent using the stream
      currentUser = decrypt(details.name);
      data = "";
      socket.once('end-pfp', endPfp);
      socket.emit('ack-next-pfp');
    }
  };
  socket.once('next-pfp', startNewPic);
  
  
  stream.on("data", chunk => {
    data += chunk.toString();
    if (currentPictureTotalSize && currentPictureTotalSize <= data.length){
      // Run callback if it has been defined
      if (onCurrentImageComplete) onCurrentImageComplete();
    }
  });
});


function stringToBuffer(str){
  // Convert string to buffer
  let buffer = []
  for (let i = 0; i < str.length; i++){
    buffer.push(str.charCodeAt(i))
  }
  return buffer
}


function bufferToString(buffer){
  // Convert a Buffer array to a string
  let outputStr = "";
  for (let i of buffer.values()){
      outputStr += String.fromCharCode(i);   
  }
  return outputStr;

}

