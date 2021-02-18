// Test dataAccess for reading messages and accounts

const fs = require("fs");
const Message = require("./Message");
const dataAccess = require("./dataAccess");
const monitoring = require("./performance_monitoring");

var monitor = new monitoring();

// Old system

// First clear existing files
if (fs.existsSync(__dirname + "/data/messages.json")) fs.unlinkSync(__dirname + "/data/messages.json");
if (fs.existsSync(__dirname + "/data/accounts.json")) fs.unlinkSync(__dirname + "/data/accounts.json");

const mode = "Accounts";
// Then test files

if (mode == "Messages"){
    // Messages
    var size = 100;  // Size in bytes
    var messagesFile = new dataAccess.MessagesAccess();

    // Record time taken and memory usage for adding a message as file size grows
    while (size < 1000001){
        console.log(`Filling Messages to ${size}`);
        // Add messages to file until its size is roughly equal to size variable
        let actualFileSize = 0;
        while (actualFileSize < size){
            messagesFile.appendData(new Message("testSenderId", "text", "This message is approximately fifty bytes in total", "notAFile.jpeg"));
            actualFileSize = fs.statSync(__dirname + "/data/messages.json").size;
        }

        // Now add one more item and see how long it takes, and record the memory usage
        let testMessage = new Message("monitoringPoint", "text", "The time taken to write this message is being recorded", "monitoring.png");
        monitor.startTimer();
        messagesFile.appendData(testMessage);
        monitor.endTimer(size, "Messages");
        monitor.getMemoryUsage(size, "Messages");

        size *= 10;
    }
    monitor.saveFile();
}
else{
    // Messages
    var size = 100;  // Size in bytes
    var accountsFile = new dataAccess.AccountsAccess();
    var highestId = 0;

    // Record time taken and memory usage for adding a message as file size grows
    while (size < 1000001){
        console.log(`Filling Accounts to ${size}`);
        // Add messages to file until its size is roughly equal to size variable
        let actualFileSize = 0;
        while (actualFileSize < size){
            accountsFile.createAccount(`testUser${highestId}`, "ThisIsNotARealUserSoItDoesNotHaveAFirstName", "ThisIsNotARealUserSoItDoesNotHaveALastName", "password");
            highestId++;
            actualFileSize = fs.statSync(__dirname + "/data/accounts.json").size;
        }

        // Now get the Id of the middle user (in case start and end are be optimised by javascript so might not give accurate indicator of performance)
        let middleID = Math.ceil(highestId / 2);
        monitor.startTimer();
        accountsFile.getAccount(middleID);
        monitor.endTimer(size, "Accounts");
        monitor.getMemoryUsage(size, "Accounts");

        size *= 10;
    }
    monitor.saveFile();
}
