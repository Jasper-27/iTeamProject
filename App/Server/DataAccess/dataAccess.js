/*
Main interface for accessing DataAccess functionality
*/
const path = require('path');

class DataAccess{
    messagesFolderPath;
    messagesIndexPath;
    logsFolderPath;
    logsIndexPath;
    accountsTreePath;
    profilePicturesPath;

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
    }

    _isValidPath(pathString, directory=false){
        // Check if path is valid (this does not check that it exists, just that the string is correctly formatted).  If directory=true it will check if the path is a valid folder path not a valid file path
        try{
            decomposed = path.parse(pathString);
            // Check root is not empty or contains whitespace
            if (decomposed.root.length === 0 || decomposed.root.trim() != decomposed.root) return false;
            // Check directory part is not empty
            if (decomposed.dir.length === 0) return false;
            if (directory){
                // Check that file part IS empty
                if (directory.base.length === 0) return true;
                else return false;
            }
            else{
                // Check that file part is not empty
                if (directory.base.length !== 0) return true;
                else return false;
            }
        }
        catch{
            return false;
        }
    }
}