// A class for handling reading and writing to / from the Json files
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const Message = require("./Message");
const Account = require("./Account");
const Log = require("./Log")
const saltRounds = 10;  // The number of iterations to be done to generate the hash (2^saltRounds)
const messagesFilePath = __dirname + "/data/messages.json";
const accountsFilePath = __dirname + "/data/accounts.json";
const logFilePath = __dirname + "/data/Log.json";
// Use Winki logo as default profile picture
const defaultProfilePictureString = "data:image/png;charset=utf-8;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAMgCAYAAADbcAZoAAAvZnpUWHRSYXcgcHJvZmlsZSB0eXBlIGV4aWYAAHjarZxpdlw3EqX/YxW1BMxALAfjOb2DXn5/F0nKsuWhXKdFS6STmW8AIu4QCDx3/u//ue4///lPCDF5l0vr1Wr1/MmWLQ5+6P7zx96/wef37/sTvU9fr/7udffjF5GX9NPn/3wbn+9h8Hr57QPf5wjz96+7/vWb2L8O9PWL7wMmnZmz+f3zRfJ6/Lwe8teB7Hx+qNbbz5c64+f7+nrju5Svv+u8Q/vwdTL9v/v5hdwYpV14V4rxJF7m35i+riDpb0iD7/o3pB4/r46Ukrn3i/51JQzI727v+7v3Pw/Q7wb5+yf3x9H/8dMfBj+Or9fTH8ayfo0RP/zpL0L588F/Q/zTidOPK4q//8XocfxyO19/79393vO5u5ErI1…D40VxeXobFYkGTyeQP59yfm81mSJhI9G2qVDzlRxrVRLRjUPOv+BzTsF6vh3Mpr0HvDv8uD0nsZUiJCL4f6TWQAiE2/GOPBgss9iJxpnDGGJOcHiU9HrK81pqKoiBrLRlj9HK59FVVXb28vHzBtxIAAP4f+gB93jIiyiFAAADgJ6Vpmk/OuSfn3GBId11H/HdVVeS9J+fclhiR3pNTkSIh5RlIBbWn4lGkwDk1tkNeS1xPBtmvVqtBWCS2m/l8/he+RQAA8HMIEO99ppTSRFRAgAAAwBlR13XYbDZD9mwWCLyXx9baIQg+9i4QfQvy3heDEQueeOqTnHrG5aSHhgVEHFvBxyyqtNZkrUVSPgAA+MWYzWZqOp2SUiqj3vtBRAVGBgAAwEHats3G4/FtVVXBGBO01oGXnNRaB2NMqKoqjMfj27Ztsbw7AAAAIiK6v79XXddlIYS86zobQqhCCJN/AKcid7rGMyhUAAAAAElFTkSuQmCC";

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
    static USERNAMETAKEN = 0;
    accountsBuffer = [];
    // Dictionary linking usernames to userIds to allow faster access
    userNames = {};
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
           this.userNames[user["userName"]] = user["userId"];
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

    getUserId(username){
        // Return the userId for the given username (or -1 if it does not match)
        if (this.accountsBuffer.length == 0){
            this.getData();
        }
        let id = this.userNames[username];
        if (typeof id == "number") return id;
        else return -1;
    }

    getProfilePictureString(userId){
        // Return the profile picture for the given user as a base64 encoded string
        if (this.accountsBuffer.length == 0){
            this.getData();
        }
        let account = this.accountsBuffer[userId];
        // Make sure account exists first
        if (account instanceof Account){
            try{
                // Get the file type of the image
                let filePath = __dirname + "/data/profilepics/" + account.profilePicture;
                let fileType = path.extname(filePath);
                // Get the raw image data and encode it as base64
                let image = fs.readFileSync(filePath).toString("base64");
                // construct a string containing the image and its details in format "data:<media type>/<file type>;<character set>;<encoding>,<data>"
                let base64String = "data:image/" + fileType + ";charset=utf-8;base64," + image;
                return base64String;
            }
            catch{
                return defaultProfilePictureString;
            }
        }
    }

    createAccount(userName, firstName, lastName, password){
        // Make sure accounts buffer is up to date to avoid generating a conflicting userId
        this.getData();
        // Check if username is already taken
        if (this.userNames[userName] != undefined) return AccountsAccess.USERNAMETAKEN;
        // Generate a userId
        let userId = this.accountsBuffer.length;
        // Hash the password
        let hash = bcrypt.hashSync(password, saltRounds);
        let account = new Account(userId, userName, firstName, lastName, hash);
        // Write new account to buffer and file
        this.accountsBuffer.push(account);
        this.userNames[userName] = userId;
        this.writeFile(this.accountsBuffer);
    }

    changePassword(userId, newPassword){
        // Change account password and return true if successful, false otherwise
        // Make sure buffer is up to date
        this.getData();
        if (typeof userId != "number") throw "userId expected a number but " + typeof userId + " was given";
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
        // Check if password matches the given username, and return the userId if so.  Otherwise return -1
        // Make sure accounts buffer is up to date
        this.getData();
        let userId = this.userNames[username];
        if (userId != undefined){
            let account = this.getAccount(userId);
            if (bcrypt.compareSync(password, account.password)){
                return userId;
            }
        }
        return -1;
    }
}

class LogAccess extends DataAccess{
    logBuffer = [];
    constructor(){
        super(logFilePath);
    }

    
    getData(){
       this.logBuffer = [];
       let data = this.readFile();
       for (let i = 0; i < data.length; i++){
           let logEntry = data[i];
           this.logBuffer.push(new Log(logEntry["text"], logEntry["time"]));
       }
    }

    log(text){
        // Make sure buffer is up to date, to avoid conflicting entries 
        this.getData(); 
        // Gets the current time, to add to the log
        let now = new Date(); 
        let newLog = new Log(text, now)
        this.logBuffer.push(newLog); 
        this.writeFile(this.logBuffer);
    }
}

module.exports = {
    MessagesAccess,
    AccountsAccess, 
    LogAccess
};