/*
An interface for accessing messages, abstracting indexAccess and blockAccess
*/

const path = require('path');

const indexAccess = require('./FileAccess/indexAccess');
const blockAccess = require('./FileAccess/blockAccess');
const treeAccess = require('./FileAccess/treeAccess');
const message = require('./../Message');

class messagesAccess{
    messagesIndexPath;
    messagesFolderPath;

    /*
    The fileAccess logic works using node.js's asynchronous system of callbacks and promises to allow it to be non-blocking
    But it is not designed for concurrent writes (node only allows one disk access at a time anyway) and has no protections to handle race conditions
    These race conditions can arise if multiple modification methods (e.g. createAccount) are called very close to one another, as each method is composed of many callbacks which node will schedule and it is possible that the scheduling will overlap e.g.:
        - Suppose modificationMethod is composed of 2 callbacks:
            - Callback 1
            - Callback 2
        - We call modificationMethod twice in quick succession (first call = modificationA, second call = modificationB)
        - The first callbacks of modificationB may be run before the last of modificationA e.g. node might schedule them like this:
            - modificationA callback 1
            - modificationB callback 1
            - modificationA callback 2
            - modificationB callback 2
        - This leads to a race condition, as certain data is shared between the modifications
    
    We must therefore ensure that each write method is only called after any previous write methods have completed
    This pendingWrites variable is used for that purpose:
        - It is initialised as an empty promise
        - Then whenever we want to call a write method, we attach it to pendingWrites.then() so it will be run once the current one is complete
        - We will then sotre the promise returned by .then() in pendingWrites, allowing another .then() to be added later
        - This allows us to build a chain of promises, with each one executing once the previous has finished
    */
   pendingWrites;

    constructor(messagesFolderPath, messagesIndexPath){
        this.messagesFolderPath = messagesFolderPath;
        this.messagesIndexPath = messagesIndexPath;
        // Create the index file if it doesn't exist
        indexAccess.createIndex(messagesIndexPath);
        // Initialise pendingWrites for chaining write operations
        this.pendingWrites = Promise.resolve("This value doesn't matter");
    }

    addMessage(messageObject){  // Takes in an instance of Message
        // Add a new message
        return new Promise((resolve, reject) => {
            // Add promise to pendingWrites chain to be executed after previous write method is finished
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    if (!(messageObject instanceof message)){
                        reject("messageObject is not of type Message");
                        return;
                    }
                    // Convert message to raw Buffer format used by blockAccess.addEntry
                    let messageTimestamp = messageObject.timeStamp.getTime();  // Messages in the block are ordered by timestamp
                    let senderName = treeAccess.stringToBuffer(messageObject.senderUsername, 32);
                    // Store type as a number to use less space and to make it a fixed size
                    let messageTypeNumber;
                    if (messageObject.type === "text") messageTypeNumber = 1;
                    else if (messageObject.type === "file") messageTypeNumber = 2;
                    else if (messageObject.type === "image") messageTypeNumber = 3;
                    let messageType = Buffer.alloc(1);
                    messageType.writeInt8(messageTypeNumber);

                    // Must also store length of messageContent and filename in order to be able to read them again
                    let messageContent = Buffer.from(messageObject.content);
                    let contentLength = Buffer.alloc(8);
                    contentLength.writeBigInt64BE(BigInt(messageContent.length));
                    let messageFilename = Buffer.from(messageObject.fileName);
                    let filenameLength = Buffer.alloc(8);
                    filenameLength.writeBigInt64BE(BigInt(messageFilename.length));

                    let rawData = Buffer.concat([senderName, messageType, contentLength, messageContent, filenameLength, messageFilename]);
                    // Write to the next free block
                    let result = await blockAccess.addEntry(this.messagesIndexPath, this.messagesFolderPath, messageTimestamp, rawData);
                    if (result === true){
                        resolve(true);
                    }
                    else reject(result);
                }
                catch (reason){
                    reject(reason);
                }
            });
        });
    }

    getMessages(startTime, endTime){
        // Gets all messages between the two timestamps (inclusive)
        return new Promise(async (resolve, reject) => {
            try{
                // First search the index to get all blocks that contain messages in the given range
                let blocks = await indexAccess.getBlocks(this.messagesIndexPath, startTime, endTime);
                let messages = [];
                for (let i = 0; i < blocks.length; i++){
                    // Search each of the blocks for all messages in the given range
                    let blockPath = path.format({dir: this.messagesFolderPath, base: `${blocks[i]}.wki`});
                    let blockMessages = await blockAccess.getEntries(blockPath, startTime, endTime);
                    // Convert each returned entry to a Message object
                    for (let j = 0; j < blockMessages.length; j++){
                        let currentMessage = blockMessages[j];
                        let currentMessageTime = new Date(Number(currentMessage.readBigInt64BE(8)));
                        let currentMessageUsername = treeAccess.bufferToString(currentMessage.subarray(16, 48));
                        let currentMessageType = currentMessage.readInt8(48);
                        // Convert back to string form
                        if (currentMessageType === 1) currentMessageType = "text";
                        else if (currentMessageType === 2) currentMessageType = "file";
                        else if (currentMessageType === 3) currentMessageType = "image";
                        
                        let contentLength = Number(currentMessage.readBigInt64BE(49));
                        let currentMessageContent = currentMessage.subarray(57, 57 + contentLength).toString();
                        let filenameLength = Number(currentMessage.readBigInt64BE(57 + contentLength));
                        let currentMessageFileName = currentMessage.subarray(57 + contentLength + 8, 57 + contentLength + 8 + filenameLength).toString();

                        // Create message object
                        messages.push(new message(currentMessageUsername, currentMessageType, currentMessageContent, currentMessageFileName, currentMessageTime));
                    }
                }
                resolve(messages);
            }
            catch (reason){
                reject(reason);
            }
            
        });
    }
}
module.exports = messagesAccess;