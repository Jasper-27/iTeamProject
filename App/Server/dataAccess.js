// A class for handling reading and writing to / from the Json files
const fs = require("fs");
const Message = require("./Message");
const messagesFilePath = __dirname + "/data/messages.json";

// Base Json access class
class DataAccess{
    path;
    constructor(path){
        this.path = path;
    }

    createFile(){
        // Create file if it does not exist
        if (!fs.existsSync(this.path)){
            fs.writeFileSync(this.path, JSON.stringify([]));
        }
    }

    readFile(){
        this.createFile();
        let rawData = fs.readFileSync(this.path);
        // Parse rawData into a Javascript object
        return JSON.parse(rawData);
    }

    writeFile(data){
        // Convert data to Json string ready to write to file
        let rawData = JSON.stringify(data);
        fs.writeFileSync(this.path, rawData);
    }
}

// Child classes for types of data
class MessagesAccess extends DataAccess{
    // Keeping messagesBuffer is more efficient, as file can be overwritten without reading first each time
    messagesBuffer = [];
    constructor(){
        super(messagesFilePath);
    }

    getData(){
        // Call readFromFile and parse the result into a list of Messages
        this.messagesBuffer = [];
        let data = this.readFile();
        for (let i = 0; i < data.length; i++){
            let msg = data[i];
            let timeStamp = new Date(msg["timeStamp"]);
            this.messagesBuffer.push(new Message(msg["senderId"], msg["content"], timeStamp));
        }
        return this.messagesBuffer;
    }

    appendData(message){
        if (this.messagesBuffer.length == 0){
            // If buffer is empty, file may not have been read yet meaning writing to it will overwrite all existing data.  So read it first
            this.getData();
        }
        this.messagesBuffer.push(message);
        this.writeFile(this.messagesBuffer);
    }
}
module.exports = {
    MessagesAccess
};