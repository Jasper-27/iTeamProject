
const express = require("express");
const app = express();
const port = 1234;

const http = require("http").createServer();

messages = [];

const io = require("socket.io")(http, {
    // Must allow Cross origin resource sharing (otherwise server won't accept traffic from localhost)
    cors: {
        origin: "*"
    }
});

io.on('connection', (socket) => {

    // When connect, send message 
    //socket.emit("welcome", "Welcome to my server"); 
    let username = socket.handshake.query["name"];
    console.log(username + " connected"); 


    socket.on('disconnect', function (){
        console.log("Client Disconnected")
    }); 

    socket.on("send-message", (data) => {
        console.log("message: ", data);
        let messageData = JSON.parse(data);
        let formattedMessage = {"sender": messageData["sender"], "text": messageData["text"]};
        messages.push(formattedMessage);
        broadcastMessage(formattedMessage)
    });  
}); 

function broadcastMessage(message){
    // When message received, broadcast it to all connected clients
    // Convert message to JSON to be sent
    let jsonMessage = JSON.stringify(message);
    // Broadcast to all (including client that sent the message)
    io.sockets.emit("pushMessage", jsonMessage);
}

io.listen(1234);