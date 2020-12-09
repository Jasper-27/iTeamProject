const express = require("express"); 
//const { Socket } = require("socket.io-client");
const app = express();
const port = 1234;
const http = require("http").createServer(); 

const io = require("socket.io")(http); 

io.on("connection", (socket) => {

    // When connect, send message 
    //socket.emit("welcome", "Welcome to my server"); 
    console.log("Client connected"); 


    socket.on('disconnect', function (){
        console.log("Client Disconnected")
    }); 

    socket.on("send-message", (data) => {
        console.log("message: ", data); 
    }); 


    
}); 

http.listen(port, () => {
    console.log("Server is listing on localhost: " + port); 
}); 