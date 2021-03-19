/*
An interface for accessing logs, abstracting indexAccess and blockAccess
*/

const path = require('path');

const indexAccess = require('./FileAccess/indexAccess');
const blockAccess = require('./FileAccess/blockAccess');
const log = require('./../Log');

class logAccess{
    logsIndexPath;
    logsFolderPath;

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

    constructor(logsFolderPath, logsIndexPath){
        this.logsFolderPath = logsFolderPath;
        this.logsIndexPath = logsIndexPath;
        // Create the index file if it doesn't exist
        indexAccess.createIndex(logsIndexPath);
        // Initialise pendingWrites for chaining write operations
        this.pendingWrites = Promise.resolve("This value doesn't matter");
    }

    addLogEntry(logObject){  // Takes in an instance of Log
        // Add a new entry
        return new Promise((resolve, reject) => {
            // Add promise to pendingWrites chain to be executed after previous write method is finished
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    if (!(logObject instanceof log)){
                        reject("logObject is not of type Log");
                        return;
                    }
                    // Convert log to raw Buffer format used by blockAccess.addEntry
                    let logTimestamp = logObject.time.getTime();  // Logs in the block are ordered by timestamp

                    // Must also store length of text in order to read it again
                    let logText = Buffer.from(logObject.text);
                    let textLength = Buffer.alloc(8);
                    textLength.writeBigInt64BE(BigInt(logText.length));

                    let rawData = Buffer.concat([textLength, logText]);
                    // Write to the next free block
                    let result = await blockAccess.addEntry(this.logsIndexPath, this.logsFolderPath, logTimestamp, rawData);
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

    wipeLogEntries(startTime, endTime){
        // Overwrites all log entries between two timestamps (inclusive) with 0s
        // Promise contains number of entries overwritten
        return new Promise(async (resolve, reject) => {
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    // First search the index to get all blocks that contain entries in the given range
                    let blocks = await indexAccess.getBlocks(this.logsIndexPath, startTime, endTime);
                    let wipedCount = 0;  // The number of entries wiped
                    for (let i = 0; i < blocks.length; i++){
                        // Search each of the blocks for all entries in the given range
                        let blockPath = path.format({dir: this.logsFolderPath, base: `${blocks[i]}.wki`});
                        wipedCount += await blockAccess.wipeEntries(blockPath, startTime, endTime);
                    }
                    resolve(wipedCount);
                }
                catch (reason){
                    reject(reason);
                }
            });         
        });
    }

    getLogEntries(startTime, endTime){
        // Gets all entries between the two timestamps (inclusive)
        return new Promise(async (resolve, reject) => {
            try{
                // First search the index to get all blocks that contain entries in the given range
                let blocks = await indexAccess.getBlocks(this.logsIndexPath, startTime, endTime);
                let entries = [];
                for (let i = 0; i < blocks.length; i++){
                    // Search each of the blocks for all entries in the given range
                    let blockPath = path.format({dir: this.logsFolderPath, base: `${blocks[i]}.wki`});
                    let blockEntries = await blockAccess.getEntries(blockPath, startTime, endTime);
                    // Convert each returned entry to a Log object
                    for (let j = 0; j < blockEntries.length; j++){
                        let currentEntry = blockEntries[j];
                        let currentEntryTime = new Date(Number(currentEntry.readBigInt64BE(8)));
                        let textLength = Number(currentEntry.readBigInt64BE(16));
                        let currentEntryText = currentEntry.subarray(24, 24 + textLength).toString();

                        // Create log object
                        entries.push(new log(currentEntryText, currentEntryTime));
                    }
                }
                resolve(entries);
            }
            catch (reason){
                reject(reason);
            }
            
        });
    }
}
module.exports = logAccess;