const socket = io('http://localhost:3000')
const messageContainer = document.getElementById('message-container')
const messageForm = document.getElementById('send-container')
const messageInput = document.getElementById('message-input')
var currentSendingUser;

const name = prompt('What is your name?')
appendMessage('You joined')
socket.emit('new-user', name)

socket.on('chat-message', data => {
  addMessage(`${data.name}`,`${data.message}`)
  //appendMessage(`${data.name}: ${data.message}`)
})

socket.on('user-connected', name => {
  appendMessage(`${name} connected`)
  getUsers(); 
})

socket.on('user-disconnected', name => {
  appendMessage(`${name} disconnected`)
})

socket.on('get-users', data => {
  data.forEach(user => {
    console.log(user.name)
  });
})


messageForm.addEventListener('submit', e => {
  e.preventDefault()
  const message = messageInput.value

  //stops you from spamming blank
  if (message == ""){
    return
  }

  socket.emit('send-chat-message', message)
  messageInput.value = ''
})

function addMessage(inName, inMessage) {
	

    if (inName == "You") {
		
		appendMessage(inMessage)
		
    }
    else {
      //do something else
		var message = inName + " : " + inMessage;
	  appendMessageRecieve(message)
    }    

}

function appendMessage(message) {
  const messageElement = document.createElement('div')
  messageElement.className = "boxSend sb1";
  messageElement.innerText = message
  messageContainer.scrollTop = messageContainer.scrollHeight;
  messageContainer.append(messageElement)
}

function appendMessageRecieve(message) {
  const messageElement = document.createElement('div')
  messageElement.className = "boxRecieve sb2";
  messageElement.innerText = message
  messageContainer.scrollTop = messageContainer.scrollHeight;
  messageContainer.append(messageElement)
}


function getUsers(){
  socket.emit('get-users')
}