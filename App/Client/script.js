const socket = io('http://localhost:3000');
const messageContainer = document.getElementById('message-container');
const messageForm = document.getElementById('send-container');
const messageInput = document.getElementById('message-input');

// HTML Id of <input> tag for selecting file to be used as profile picture
const profilePicSelectorId = "chooseProfilePicture";
var currentSendingUser;
// Holds the profile picture of the current user
var currentSendingUserPicture;
// Holds the profile pictures of all other connected users
var connectedUserPictures = {};


// settings (these need to be added by a file in future )
var settings 

var connectedUsersList = document.getElementById('users');  // The HTML list that contains the connected users 

login();
appendUserJoinOrDisconnect('You joined'); 
// socket.emit('new-user', name)
getUsers();


socket.on('settings', data => {
  settings = data; 
})


//When a message is sent
socket.on('chat-message', data => {
  addMessage(`${data.name}`,`${data.message}`); 
  //appendMessage(`${data.name}: ${data.message}`)
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
  console.log("sendRunning");
  // console.log(connectedUsers); // Writing whole images to console will be slow
  generateUserList(connectedUsers); 

})

// If login fails, force user to try again
socket.on('login-fail', login);

// On login success, set the profile picture
socket.on('login-success', data => {currentSendingUserPicture = data.profilepic});

// If register fails, force user to try again
socket.on('register-fail', register);

// If register success, notify user
socket.on('register-success', () => {alert('Account created')});

// When the logged in user's profile picture is changed
socket.on('updated-profile-picture', picture => {currentSendingUserPicture = picture});


//When the send button is pressed 
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  const message = messageInput.value;

  if (message.trim() == ""){  //Stops blank messages from being sent 
    return;
  }

  if (message.length > settings.messageLimit){  //Makes sure the message is not longer than the message limit 
    console.log("message is too long");
    alert("Message is too long");
    return
  }

  socket.emit('send-chat-message', message);
  messageInput.value = '';
})

function checkForAting(inText){
  


}


//Decides who sent a message, then adds it to chat
function addMessage(inName, inMessage) {
    if (inName == "You") {
		appendMessage(inMessage);
    }
    else {
		var message = inMessage;
	  appendMessageRecieve(message, inName);
    }    

}

//Adds a message you sent to that chat
function appendMessage(message) {
  // get current time
  var current = new Date();
  var current = current.toLocaleTimeString();
	
  //create the message box (div to hold the bubble)
  var messageBox = document.createElement('div');
  messageBox.className = "msg right-msg";
  messageContainer.append(messageBox);
  
  //add user image
  var userImage = document.createElement('div');
  userImage.className = "msg-img";
  userImage.style.backgroundImage = `url(${currentSendingUserPicture})`;
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
  messageInfoName.innerText = "You";
  
  var messageData = document.createElement('div')
  messageData.className = "msg-text";
  messageData.innerText = message;

  
  messageBubble.appendChild(messageData);
  messageContainer.scrollTop = messageContainer.scrollHeight;
}
                                              
//Adds a message someone else sent to the chat 
function appendMessageRecieve(message, inName) {

  // get current time
  var current = new Date();
  var current = current.toLocaleTimeString();
	
  //create the message box (div to hold the bubble)
  var messageBox = document.createElement('div');
  messageBox.className = "msg left-msg";
  messageContainer.append(messageBox);
  
  //add user image
  var userImage = document.createElement('div');
  userImage.className = "msg-img";
  userImage.style.backgroundImage = `url(${connectedUserPictures[inName]})`;
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
  messageData.innerText = message;
  
  messageBubble.appendChild(messageData);
  
  
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

function appendUserJoinOrDisconnect(message){
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
  messageContainer.scrollTop = messageContainer.scrollHeight;
	
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
    // Add username to list
    var entry = document.createElement('li');
    entry.appendChild(document.createTextNode(item["name"]));
    connectedUsersList.appendChild(entry);
    // Add profile picture to connectedUserPictures
    connectedUserPictures[item["name"]] = item["profilepic"];
  });
}

function changeProfilePicture(){
  // Send request to server to change the users profile picture
  let selector = document.getElementById(profilePicSelectorId);
  if (0 < selector.files.length){  // Only proceed if a file has been selected
    if (selector.files[0].type.split("/")[0] === "image" ){  // Only proceed if the selected file is an image
      // Convert file to base64 and send it to server.  This should be done asyncronously to avoid large files blocking the UI thread
      reader = new FileReader();
      // Set event listener to run asyncronously when conversion is complete
      reader.addEventListener("load", () => {
        // Send base64 string to server
        socket.emit('change-profile-picture', reader.result);
      });
      // Convert the file to base64
      reader.readAsDataURL(selector.files[0]);
  }
    
  }
}

function login(){
  if (prompt("Login or register (login is default)") == "register"){
    register();
  }
  else{
    let username = prompt("Enter username");
    let password = prompt("Enter password");
    socket.emit('login', {"username": username, "password": password});
  }
}

function register(){
  let username = prompt("Enter username");
  let firstName = prompt("Enter first name");
  let lastName = prompt("Enter last name");
  let password = prompt("Enter password");
  socket.emit('create-account', {"username": username, "firstName": firstName, "lastName": lastName, "password": password});
  
  //login the user once the account is created with the given credentials
  socket.emit('login', {"username": username, "password": password});
}