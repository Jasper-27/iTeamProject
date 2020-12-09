const { read } = require("fs");
const { send } = require("process");
const io = require("socket.io-client");


// The server address 
let socket = io.connect("http://localhost:1234"); 

socket.on("welcome", (data) => {
    console.log("Received: ", data); 
    socket.emit("check", "Check")
}); 



function sendMessage(msg){
    console.log("Me: " + msg)
    socket.emit("send-message", msg)
}; 


sendMessage("This is a message")