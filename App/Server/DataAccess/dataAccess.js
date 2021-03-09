/*
Main interface for accessing DataAccess functionality
Allows one class to be used for all storage operations
*/
const path = require('path');

const usersAccess = require('./usersAccess');
const messagesAccess = require('./messagesAccess');

class DataAccess{
    // File and folder paths
    messagesFolderPath;
    messagesIndexPath;
    logsFolderPath;
    logsIndexPath;
    accountsTreePath;
    profilePicturesPath;
    // Objects for handling file access
    users;
    messages;
    logs;

    constructor(messagesFolderPath, messagesIndexPath, logsFolderPath, logsIndexPath, accountsTreePath, profilePicturesPath){
        // Validate paths
        if (this._isValidPath(messagesFolderPath, true) === false) throw "messagesFolderPath is not a suitable directory path";
        if (this._isValidPath(messagesIndexPath) === false) throw "messagesIndexPath is not a suitable file path";
        if (this._isValidPath(logsFolderPath, true) === false) throw "logsFolderPath is not a suitable directory path";
        if (this._isValidPath(logsIndexPath) === false) throw "logsIndexPath is not a suitable file path";
        if (this._isValidPath(accountsTreePath) === false) throw "accountsTreePath is not a suitable file path";
        if (this._isValidPath(profilePicturesPath) === false) throw "profilePicturesPath is not a suitable file path";
        this.messagesFolderPath = messagesFolderPath;
        this.messagesIndexPath = messagesIndexPath;
        this.logsFolderPath = logsFolderPath;
        this.logsIndexPath = logsIndexPath;
        this.accountsTreePath = accountsTreePath;
        this.profilePicturesPath = profilePicturesPath;

        // Instatiate lower level classes
        this.users = new usersAccess(this.accountsTreePath, this.profilePicturesPath);
        this.messages = new messagesAccess(this.messagesFolderPath, this.messagesIndexPath);
    }

    createAccount(username, firstName, lastName, password){
        // Everything is handled by usersAccess, so just return its promise
        return this.users.createAccount(username, firstName, lastName, password);
    }

    checkAccountCredentials(username, password){
        // Everything is handled by usersAccess, so just return its promise
        return this.users.checkCredentials(username, password);
    }

    getAccount(username){
        // Everything is handled by usersAccess, so just return its promise
        return this.users.getAccount(username);
    }

    addMessage(messageObject){
        // Takes in an instance of the Message class and writes it to disk
        // All handled by messagesAccess, so just return its promise
        return this.messages.addMessage(messageObject);
    }

    getMessages(startTime, endTime){
        // Returns all messages startTime and endTime, the times should be provided as unix timestamps
        // All handled by messagesAccess, so just return its promise
        return this.messages.getMessages(startTime, endTime);
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