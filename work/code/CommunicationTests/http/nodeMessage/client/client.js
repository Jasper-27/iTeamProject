const connection = new XMLHttpRequest();
var Username;


function connect(username){
    Username = username;
    let url = `http://localhost:1234/?name=${username}`;
    // Connect to server
    connection.open("POST", "http://localhost:1234", true);
    connection.setRequestHeader("UserName", Username);
    connection.send();
    // Check for messages every 0.5 seconds
    setInterval(poll, 500);
}

function poll(){
   
        // Continuously ask server for any new messages
        connection.open("GET", "http:\\localhost:1234", true);
        connection.setRequestHeader("UserName", Username);
        connection.send();
        // Listen for response
        connection.onreadystatechange = () => {
            if (connection.readyState == XMLHttpRequest.DONE){
                // Response has been received
                let newMessages = JSON.parse(connection.responseText);
                for (let i in newMessages){
                    let message = newMessages[i];
                    receiveMessage(message["sender"], message["text"]);
                }
            }
        }
    
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
    let jsonMessage = JSON.stringify(formattedMessage);
    connection.open("PUT", "http://localhost:1234", true);
    connection.setRequestHeader("Content-Type", "application/json");
    connection.send(jsonMessage);
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