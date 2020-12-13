const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const app = express();
const port = 1234;

messages = [];  // Holds messages
userMessagesReceived = {};  // Contains number of most recent message received by each user

// Allow Cross origin resource sharing
app.use(cors());
app.use(bodyParser.json())

// POST used for connecting to server
app.post('/', (req, res) => {
    let username = req.header("UserName");
    // Add username to userMessagesReceived
    userMessagesReceived[username] = 0;
    console.log(username + " connected");
});

// PUT used to send messages to server
app.put('/', (req, res) => {
    let messageData = req.body;
    let formattedMessage = {"sender": messageData["sender"], "text": messageData["text"]};
    messages.push(formattedMessage);
    console.log(formattedMessage["sender"] + ": " + formattedMessage["text"]);
});

// GET used to request messages from server
app.get('/', (req, res) => {
    let username = req.header("UserName");
    let messagesToSend = getMessagesToSend(username);
    res.send(JSON.stringify(messagesToSend));
    
})

function getMessagesToSend(username){
    // Load any messages that the client with given username has not yet been sent into an array
    // Get the number of the last message the user was sent
    let lastMessageReceived = userMessagesReceived[username];
    // Get the total number of messages sent.
    let messagesTotal = messages.length;

    let messagesToSend = [];
    for (let i = lastMessageReceived; i < messagesTotal; i++){
        messagesToSend.push(messages[i]);
    }
    // Update userMessagesReceived
    userMessagesReceived[username] = messagesTotal;
    return messagesToSend;
    
}

app.listen(port);
