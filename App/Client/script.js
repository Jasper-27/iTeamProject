const socket = io('http://localhost:3000'); 
const messageContainer = document.getElementById('message-container'); 
const messageForm = document.getElementById('send-container');
const messageInput = document.getElementById('message-input'); 
var currentSendingUser;

var myUsername = ""; 


// settings 
var settings 

var connectedUsersList = document.getElementById('users');  // The HTML list that contains the connected users 

login();
// appendUserJoinOrDisconnect('You joined'); 
// socket.emit('new-user', name)
getUsers();

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
socket.on('chat-message', data => {
  addMessage(`${data.name}`,`${data.message}`); 
})

//This code runs if the user gets mentioned in a message
socket.on('mentioned', data => {
  if (data.target == myUsername){
    alert("You got mentioned by " + data.sender)
	
	
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

// If login fails, force user to try again
socket.on('login-fail', () => {
  alert("Login failed"); 
  window.location.replace("./loginPage.html");
});


//When the send button is pressed 
messageForm.addEventListener('submit', e => {
  e.preventDefault();
  let message = messageInput.value;

  if (message.trim() == ""){  //Stops blank messages from being sent 
    return;
  }

  if (message.length > settings.messageLimit){  //Makes sure the message is not longer than the message limit 
    console.log("message is too long");
    alert("Message is too long");
    return; 
  }

  socket.emit('send-chat-message', message);
  messageInput.value = '';
})



//Decides who sent a message, then adds it to chat
function addMessage(inName, inMessage) {
  if (inName == myUsername) {
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
  
  //check if the user is being @ed and make it bold 
  var inc = message.includes("@" + myUsername);
  
  //if they are being @ed.
  if (inc == true) {
    messageData.innerText = message;
    messageData.style.fontWeight = "bold";
  } 
  //if they are not being @ed then display the un-edited message
  else{
    messageData.innerText = message;
  }
  
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
    var entry = document.createElement('li');
    entry.appendChild(document.createTextNode(item));
    connectedUsersList.appendChild(entry);
  });
}

// gets the login details from session storage, then connects with those
function login(){

  //Gets the username and password from the session storage
  let username = sessionStorage.session_user; 
  let password = sessionStorage.session_pass; 
  socket.emit('login', {"username": username, "password": password});
  
}

