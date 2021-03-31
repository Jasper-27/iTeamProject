// Class for containing message data
class Message{
    timeStamp;
    senderUsername;
    type;
    content;
    fileName;

    constructor(senderUsername, type, content, fileName, timeStamp){
        if (typeof fileName == "string"){
            this.fileName = fileName;
        }
        else{
            // Text based messages do not have fileNames, so just use empty string
            this.fileName = "";
        }
        if (timeStamp != undefined && timeStamp instanceof Date){
            this.timeStamp = timeStamp;
        }
        else{
            // Generate a timestamp from current time
            this.timeStamp = new Date();
        }
        // Enforce data types here to avoid unexpected errors elsewhere
        if (typeof senderUsername == "string"){
            this.senderUsername = senderUsername;
        }
        else{
            let dataType = typeof senderUsername;
            throw "senderUsername expected a string but " + dataType + " was given";
        }
        if (typeof type == "string"){
            if (type === "text" || type === "image" || type === "file"){
                this.type = type;
            }
            else{
                throw type + " is not a valid message type";
            }
        }
        else{
            throw "type expected a string but " + typeof type + " was given";
        }
        if (typeof content == "string"){
            this.content = content;
        }
        else{
            let dataType = typeof content;
            throw "content expected a string but " + dataType + " was given";
        }
    }
}
module.exports = Message;