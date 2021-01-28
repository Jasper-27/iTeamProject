const socket = io('http://localhost:3000')
const messageContainer = document.getElementById('message-container')
const messageForm = document.getElementById('send-container')
const messageInput = document.getElementById('message-input')
var currentSendingUser;


// settings (these need to be added by a file in future )
var lengthLimit = 255

login();
appendMessage('You joined')
// socket.emit('new-user', name)


//When a message is sent
socket.on('chat-message', data => {
  addMessage(`${data.name}`,`${data.message}`)
  //appendMessage(`${data.name}: ${data.message}`)
})

// When a user connects 
socket.on('user-connected', name => {
  appendMessage(`${name} connected`)
  getUsers(); 
})

//When a user disconnects 
socket.on('user-disconnected', name => {
  appendMessage(`${name} disconnected`)
})

socket.on('get-users', data => {
  data.forEach(user => {
    console.log(user.name)
  });
})

// If login fails, force user to try again
socket.on('login-fail', login);

// If register fails, force user to try again
socket.on('register-fail', register);

// If register success, notify user
socket.on('register-success', () => {alert('Account created')});


//When the send button is pressed 
messageForm.addEventListener('submit', e => {
  e.preventDefault()
  const message = messageInput.value

  //stops you from spamming blank
  if (message.trim() == ""){
    return
  }

  alert(message.length)
  if (message.length > lengthLimit){
    console.log("message is too long")
    alert("Message is too long");
    return
  }

  socket.emit('send-chat-message', message)
  messageInput.value = ''
})


//Decides who sent a message, then adds it to chat
function addMessage(inName, inMessage) {
    if (inName == "You") {
		appendMessage(inMessage)
    }
    else {
		var message = inName + " : " + inMessage;
	  appendMessageRecieve(message)
    }    

}


//Adds a message you sent to that chat
function appendMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.className = "boxSend sb1";
  messageElement.innerText = message;
  messageContainer.append(messageElement);
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

//Adds a message someone else sent to the chat 
function appendMessageRecieve(message) {
  const messageElement = document.createElement('div')
  messageElement.className = "boxRecieve sb2";
  messageElement.innerText = message;
  messageContainer.append(messageElement);
  messageContainer.scrollTop = messageContainer.scrollHeight;
}


function getUsers(){
  socket.emit('get-users');
}

function login(){
  if (prompt("Login or register (login is default") == "register"){
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
}