const { timeStamp } = require("console");
const fs = require("fs"); 

//Creates a message class
class message{
    timeStamp
    senderID
    content
}

//The file where the messages are stored
var messageFile = "messages.json"


//Creates a message file if it does not allready exist 
if (fs.existsSync(messageFile)) {
    
  }else{
    fs.writeFileSync(messageFile, JSON.stringify([], null, 2));
    //var userFile = 'users.json'
}



//Creating the users array from the json
let rawdata = fs.readFileSync(messageFile);
let messages = JSON.parse(rawdata);


//adds the message to the array of messages 
function addMessage(sender, messageContent){
    new_TimeStamp = new Date().toLocaleString();
    new_Message = {timeStamp:new_TimeStamp, senderID:sender, content:messageContent}
    messages.push(new_Message)
    console.log("adding message:" +  new_Message)
}


//saves the array of messages to the file
function saveToFiles(){
    console.log("Saving messages to file")
    console.log(messages)
    fs.writeFileSync(messageFile, JSON.stringify(messages, null, 2));
}


//Just demonstrating 
addMessage("Abbie", "This message should be added to the bottom")
console.log("Message added")
saveToFiles()
console.log("Message saved")