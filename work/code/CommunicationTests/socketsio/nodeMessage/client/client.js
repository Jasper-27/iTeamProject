var socket;
var Username;


// The server address
// let socket = mgr.connect("http://localhost:1234");




function connect(username){
    Username = username;
    socket = io("http://localhost:1234", {
    query: `name=${username}`,
    });
    socket.connect();
    // Set up listeners
    setListeners();
    
}

function setListeners(){
    // Set up listeners
    socket.on("connect", () => {
        console.log("Connected");
        //socket.emit()
    })
    socket.on("welcome", (data) => {
        console.log("Received: ", data); 
        socket.emit("check", "Check")
    }); 
    
    socket.on("pushMessage", (data) => {
        parsedData = JSON.parse(data);
        receiveMessage(parsedData["sender"], parsedData["text"]);
    }
    );
}

function sendMessage(msg){
    console.log("Me: " + msg)
    // Convert message to correct format for sending
    let formattedMessage = {"sender": Username, "text": msg};
    // Convert to JSON and send
    socket.emit("send-message", JSON.stringify(formattedMessage));
}; 

function receiveMessage(sender, msg){
    // Add a new message to the list
    let table = document.getElementById("messages");
    let row = document.createElement("tr");
    let senderCell = document.createElement("td");
    senderCell.innerText = sender;
    let messageCell = document.createElement("td");
    messageCell.innerText = msg;
    row.append(senderCell);
    row.append(messageCell);
    table.append(row);
}