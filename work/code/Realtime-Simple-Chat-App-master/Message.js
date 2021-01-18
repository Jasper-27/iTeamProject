// Class for containing message data
class Message{
    timeStamp;
    senderId;
    content;

    constructor(senderId, content, timeStamp){
        if (timeStamp != undefined && timeStamp instanceof Date){
            this.timeStamp = timeStamp;
        }
        else{
            // Generate a timestamp from current time
            this.timeStamp = new Date();
        }
        // Enforce data types here to avoid unexpected errors elsewhere
        if (typeof senderId == "string"){
            this.senderId = senderId;
        }
        else{
            let dataType = typeof senderId;
            throw "senderId expected a string but " + dataType + " was given";
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