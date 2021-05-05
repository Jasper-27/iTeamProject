/*
Main interface for accessing DataAccess functionality
Allows one class to be used for all storage operations
*/
const path = require('path');

const usersAccess = require('./usersAccess');
const messagesAccess = require('./messagesAccess');
const logAccess = require('./logAccess');
const Log = require('../Log');
const blobAccess = require('./FileAccess/blobAccess');

/* 
System can handle asynchronous read operations (unlike writes)
But eventually we will hit a limit on how many files can be open at once (multiple operations opening the same file counts as having multiple files open)
We also don't want reads using too many system resources, especially as a malicious user could otherwise slow down / crash the server by causing too many read operations
Therefore we have a maximum limit to the number of asynchronous reads.
 */
const asyncReadLimit = 20;

class DataAccess{
    // File and folder paths
    messagesFolderPath;
    messagesIndexPath;
    logsFolderPath;
    logsIndexPath;
    accountsTreePath;
    messageAttachmentsPath;
    profilePicturesPath;
    // Objects for handling file access
    users;
    messages;
    logs;

    /*
    asyncReadCount and readBacklog are used to enforce asyncReadLimit
    asyncReadCount will be incremented whenever a new read operation begins, and decremented when it ends
    When a read method is called:
        - If asyncReadCount is less than asyncReadLimit, the operation is called immediately
        - Otherwise the operation is chained to the readBacklog promise using .then() (chained operations run one at a time)
    */
   asyncReadCount;
   readBacklog;

    constructor(messagesFolderPath, messagesIndexPath, logsFolderPath, logsIndexPath, accountsTreePath, messageAttachmentsPath, profilePicturesPath){
        // Validate paths
        if (this._isValidPath(messagesFolderPath, true) === false) throw "messagesFolderPath is not a suitable directory path";
        if (this._isValidPath(messagesIndexPath) === false) throw "messagesIndexPath is not a suitable file path";
        if (this._isValidPath(logsFolderPath, true) === false) throw "logsFolderPath is not a suitable directory path";
        if (this._isValidPath(logsIndexPath) === false) throw "logsIndexPath is not a suitable file path";
        if (this._isValidPath(accountsTreePath) === false) throw "accountsTreePath is not a suitable file path";
        if (this._isValidPath(messageAttachmentsPath) === false) throw "messageAttachmentsPath is not a suitable file path";
        if (this._isValidPath(profilePicturesPath) === false) throw "profilePicturesPath is not a suitable file path";
        this.messagesFolderPath = messagesFolderPath;
        this.messagesIndexPath = messagesIndexPath;
        this.logsFolderPath = logsFolderPath;
        this.logsIndexPath = logsIndexPath;
        this.accountsTreePath = accountsTreePath;
        this.messageAttachmentsPath = messageAttachmentsPath;
        this.profilePicturesPath = profilePicturesPath;

        // Instatiate lower level classes
        this.users = new usersAccess(this.accountsTreePath, this.profilePicturesPath);
        this.messages = new messagesAccess(this.messagesFolderPath, this.messagesIndexPath, this.messageAttachmentsPath);
        this.logs = new logAccess(this.logsFolderPath, this.logsIndexPath);

        // Create attachments blob file if it doesn't already exist
        blobAccess.createBlob(messageAttachmentsPath);
        blobAccess.createBlob(profilePicturesPath);

        // Setup readBacklog
        this.asyncReadCount = 0;
        this.readBacklog = Promise.resolve("The value of this first promise is irrelevant");
    }

    createAccount(username, firstName, lastName, password){
        // Everything is handled by usersAccess, so just return its promise
        return this.users.createAccount(username, firstName, lastName, password);
    }

    deleteAccount(username){
        // Everything is handled by usersAccess, so just return its promise
        return this.users.deleteAccount(username);
    }

    changeFirstName(username, newFirstName){
        return this.users.changeFirstName(username, newFirstName);
    }

    changeLastName(username, newLastName){
        return this.users.changeLastName(username, newLastName);
    }

    changePassword(username, newPassword){
        return this.users.changePassword(username, newPassword);
    }

    checkAccountCredentials(username, password){
        // Will contain the account object if credentials match, or false if not
        return new Promise((resolve, reject) => {
            // Must declare as function, as it will be used in different places depending on whether asyncReadLimit has been met
            let checkCredentials = async () => {
                this.asyncReadCount++;
                try{
                    let result = await this.users.checkCredentials(username, password);
                    this.asyncReadCount--;
                    resolve(result);
                }
                catch(reason){
                    this.asyncReadCount--;
                    reject(reason);
                }
            };
            // If asyncReadCount is less than asyncReadLimit then run the code immediately, otherwise chain it to readBacklog
            if (this.asyncReadCount < asyncReadLimit){
                checkCredentials();
            }
            else{
                this.readBacklog = this.readBacklog.then(checkCredentials);
            }
        });
    }

    getAccount(username){
        return new Promise((resolve, reject) => {
            // Must declare as function, as it will be used in different places depending on whether asyncReadLimit has been met
            let fetchAccount = async () => {
                this.asyncReadCount++;
                try{
                    let result = await this.users.getAccount(username);
                    this.asyncReadCount--;
                    resolve(result);
                }
                catch(reason){
                    this.asyncReadCount--;
                    reject(reason);
                }
            };
            // If asyncReadCount is less than asyncReadLimit then run the code immediately, otherwise chain it to readBacklog
            if (this.asyncReadCount < asyncReadLimit){
                fetchAccount();
            }
            else{
                this.readBacklog = this.readBacklog.then(fetchAccount);
            }
        });
    }

    getChangeProfilePictureStream(username, imageSize){
        return this.users.getChangeProfilePictureStream(username, imageSize);
    }

    getReadProfilePictureStream(position){
        return blobAccess.getReadableStream(this.profilePicturesPath, position);
    }

    addMessage(messageObject){
        // Takes in an instance of the Message class and writes it to disk
        // All handled by messagesAccess, so just return its promise
        return this.messages.addMessage(messageObject);
    }

    deleteMessages(startTime, endTime){
        // "Deletes" all messages between the startTime and endTime (inclusive).  The times should be provided as unix timestamps
        return this.messages.wipeMessages(startTime, endTime);
    }

    getMessages(startTime, endTime){
        // Returns all messages between startTime and endTime (inclusive), the times should be provided as unix timestamps
        return new Promise((resolve, reject) => {
            // Must declare as function, as it will be used in different places depending on whether asyncReadLimit has been met
            let fetchMessages = async () => {
                this.asyncReadCount++;
                try{
                    let result = await this.messages.getMessages(startTime, endTime);
                    this.asyncReadCount--;
                    resolve(result);
                }
                catch(reason){
                    this.asyncReadCount--;
                    reject(reason);
                }
            };
            // If asyncReadCount is less than asyncReadLimit then run the code immediately, otherwise chain it to readBacklog
            if (this.asyncReadCount < asyncReadLimit){
                fetchMessages();
            }
            else{
                this.readBacklog = this.readBacklog.then(fetchMessages);
            }
        });
    }

    getMessagesAfterTimestamp(timestamp, numberOfMessages){
        // Fetch messages newer than the given timestamp
        return new Promise((resolve, reject) => {
            // Must declare as function, as it will be used in different places depending on whether asyncReadLimit has been met
            let fetchMessages = async () => {
                this.asyncReadCount++;
                try{
                    let result = await this.messages.getConsecutiveMessages(timestamp, numberOfMessages);
                    this.asyncReadCount--;
                    resolve(result);
                }
                catch(reason){
                    this.asyncReadCount--;
                    reject(reason);
                }
            };
            // If asyncReadCount is less than asyncReadLimit then run the code immediately, otherwise chain it to readBacklog
            if (this.asyncReadCount < asyncReadLimit){
                fetchMessages();
            }
            else{
                this.readBacklog = this.readBacklog.then(fetchMessages);
            }
        });
    }

    getMessagesBeforeTimestamp(timestamp, numberOfMessages){
        // Fetch messages older than the given timestamp
        return new Promise((resolve, reject) => {
            // Must declare as function, as it will be used in different places depending on whether asyncReadLimit has been met
            let fetchMessages = async () => {
                this.asyncReadCount++;
                try{
                    let result = await this.messages.getConsecutiveMessages(timestamp, numberOfMessages, true);
                    this.asyncReadCount--;
                    resolve(result);
                }
                catch(reason){
                    this.asyncReadCount--;
                    reject(reason);
                }
            };
            // If asyncReadCount is less than asyncReadLimit then run the code immediately, otherwise chain it to readBacklog
            if (this.asyncReadCount < asyncReadLimit){
                fetchMessages();
            }
            else{
                this.readBacklog = this.readBacklog.then(fetchMessages);
            }
        });
    }

    allocateAttachmentsFileSpace(size){
        // Allocate space in the blob file for holding files and images
        return blobAccess.allocate(this.messageAttachmentsPath, size);
    }

    deallocateAttachmentsFileSpace(position){
        // Deallocate a space in the attachments file
        return blobAccess.deallocate(this.messageAttachmentsPath, position);
    }

    getAttachmentWriteStream(position){
        // Return writable stream for writing to allocated space in attachments file
        return blobAccess.getWritableStream(this.messageAttachmentsPath, position);
    }

    getAttachmentReadStream(position){
        // Return readable stream for reading from allocated space in attachments file
        return blobAccess.getReadableStream(this.messageAttachmentsPath, position);
    }

    log(logText){
        // Takes in text and adds it as a log entry
        return this.logs.addLogEntry(new Log(logText, new Date()));
    }

    deleteLogEntries(startTime, endTime){
        // "Delete" all log entries between startTime and endTime (inclusive), the times should be provided as unix timestamps
        return this.logs.wipeLogEntries(startTime, endTime);
    }

    getLogEntries(startTime, endTime){
        // Returns all log entries between startTime and endTime, the times should be provided as unix timestamps
        return new Promise((resolve, reject) => {
            // Must declare as function, as it will be used in different places depending on whether asyncReadLimit has been met
            let fetchEntries = async () => {
                this.asyncReadCount++;
                try{
                    let result = await this.logs.getLogEntries(startTime, endTime);
                    this.asyncReadCount--;
                    resolve(result);
                }
                catch(reason){
                    this.asyncReadCount--;
                    reject(reason);
                }
            };
            // If asyncReadCount is less than asyncReadLimit then run the code immediately, otherwise chain it to readBacklog
            if (this.asyncReadCount < asyncReadLimit){
                fetchEntries();
            }
            else{
                this.readBacklog = this.readBacklog.then(fetchEntries);
            }
        });
    }

    _isValidPath(pathString, directory=false){
        // Check if path is valid (this does not check that it exists, just that the string is correctly formatted).  If directory=true it will check if the path is a valid folder path not a valid file path
        try{
            let decomposed = path.parse(pathString);
            // Check root is not empty or contains whitespace
            if (decomposed.root.length === 0 || decomposed.root.trim() != decomposed.root) return false;
            // Check directory part is not empty
            if (decomposed.dir.length === 0) return false;
            if (directory){
                // Check that file extension IS empty
                if (decomposed.ext.length === 0) return true;
                else return false;
            }
            else{
                // Check that file extension is not empty
                if (decomposed.ext.length !== 0) return true;
                else return false;
            }
        }
        catch{
            return false;
        }
    }
}
module.exports = DataAccess;