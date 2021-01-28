// A class for handling reading and writing to / from the Json files
const fs = require("fs");
const bcrypt = require("bcrypt");
const Message = require("./Message");
const Account = require("./Account");
const saltRounds = 10;  // The number of iterations to be done to generate the hash (2^saltRounds)
const messagesFilePath = __dirname + "/data/messages.json";
const accountsFilePath = __dirname + "/data/accounts.json";

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

class AccountsAccess extends DataAccess{
    accountsBuffer = [];
    constructor(){
        super(accountsFilePath);
    }

    getData(){
        /* Call readFromFile and load in accountsBuffer
        Unlike in MessagesAccess, the buffer should not be returned, as nothing outside this class should have direct access to accounts
        */
       this.accountsBuffer = [];
       let data = this.readFile();
       for (let i = 0; i < data.length; i++){
           let user = data[i];
           this.accountsBuffer.push(new Account(user["userId"], user["userName"], user["firstName"], user["lastName"], user["password"]));
       }
    }

    getAccount(userId){
        // Return the account with the specified id
        if (this.accountsBuffer.length == 0){
            // Data may still need to be loaded if buffer is empty
            this.getData();
        }
        let account = this.accountsBuffer[userId];
        if (account instanceof Account){
            return account;
        }
        else{
            return -1;
        }
    }

    createAccount(userName, firstName, lastName, password){
        // Make sure accounts buffer is up to date to avoid generating a conflicting userId
        this.getData();
        // Generate a userId
        let userId = this.accountsBuffer.length;
        // Hash the password
        let hash = bcrypt.hashSync(password, saltRounds);
        let account = new Account(userId, userName, firstName, lastName, hash);
        // Write new account to buffer and file
        this.accountsBuffer.push(account);
        this.writeFile(this.accountsBuffer);
    }

    changePassword(userId, newPassword){
        // Change account password and return true if successful, false otherwise
        // Make sure buffer is up to date
        this.getData();
        if (typeof userId != "number")throw "userId expected a number but " + typeof userId + " was given";
        if (typeof newPassword != "string") throw "password expected a string but " + typeof newPassword + " was given";
        let hash = bcrypt.hashSync(newPassword, saltRounds);
        let account = this.accountsBuffer[userId];
        if (account instanceof Account){
            // Update account if it exists
            account.password = hash;
            this.writeFile(this.accountsBuffer);
            return true;
        }
        return false;
    }

    checkCredentials(username, password){
        // Check details against each account, and return userId of account that they match (or -1 if no match)
        // Make sure accounts buffer is up to date
        this.getData();
        for (let i = 0; i < this.accountsBuffer.length; i++){
            let account = this.accountsBuffer[i];
            if (account.userName === username && bcrypt.compareSync(password, account.password)){
                return account.userId;
            }
        }
        return -1;
    }
}
module.exports = {
    MessagesAccess,
    AccountsAccess
};