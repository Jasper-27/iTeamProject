/* 
Class for searching and modifying index files
Index files record which block contains each message or log entry

Index format (| symbols not included in file, just here to make it easier to read):
Number of entries (8 bytes)|Lowest timestamp (8 bytes)|Highest timestamp (8 bytes)|entries (24 bytes each)

Entry format:
Lowest timestamp in block (8 bytes)|Highest timestamp in block (8 bytes)|block number (8 bytes)
*/

const { timeStamp } = require('console');
const fs = require('fs');
const path = require('path');

class indexAccess{
    static async createIndex(filePath, overwrite=false){  // If there is already a valid index file at the location and overwrite is false, it won't be overwritten
        // Create a new index file at the given path
        if (overwrite === true || (await this.isValidIndex(filePath)) === false){
            // Only proceed if overwrite is true or if there is not already a valid index file
            // Create directory
            try{
                // If the path given directly in a root directory, this will throw an error.  But the error won't matter as the direcotry does not need to be created anyway
                fs.mkdirSync(path.dirname(filePath), {recursive: true});
            }
            catch{}
            // Create the file with all headers containing 0
            fs.writeFileSync(filePath, new Uint8Array(24));
        }
    }

    static isValidIndex(filePath){  // May or may not return a promise, so result must be awaited on
        /*
        Check that specified index file:
        a) exists
        b) has permissions allowing node to read and write to it
        c) is correctly formatted
        */
       try{
           fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);  // R_OK checks that this process has read permissions, W_OK checks write permissions.  By ORing them together we can check both.  Throws an error if permissions are incorrect
           // Create promise to be returned (must return a promise as there is no synchronous way to use the read stream)
           let resolvePromise;  // To be called with true / false when the result is ready
           let promisedResult = new Promise((resolve, reject) => {
               resolvePromise = resolve;
           });
           // Check file is correctly formatted
           let stream = fs.createReadStream(filePath, {highWaterMark: 8});  // Use highWatermark of 8 to read in 8 bytes at a time (as each header is 8 bytes)
           let test = 0;
           let tests = [
               null,  // File has valid item count
               null,  // File has valid lowest timestamp
               null,  // File has valid highest timestamp
        ]
           stream.on('readable', () => {
               try{
                    if (0 <= stream.read(8).readBigInt64BE()){
                        // The header is a valid non negative integer so this test has passed
                        tests[test] = true;
                        test++;
                        if (2 < test){
                            // All tests have passed
                            resolvePromise(true);
                            stream.close();
                        }
                    }
                else{
                    // The header is not valid so return false
                    resolvePromise(false);
                    stream.close();
                }
            }
            catch{
                resolvePromise(false);
                stream.close();
            }
           });
           return promisedResult;
       }
       catch (e){
           return false;
       }
    }

    static getBlocks(filePath, startTime, endTime){
        // Return the block numbers for every block that contains values between the provided timestamps

        // First set up a promise that the method will return
        let promisedResult = new Promise((resolve, reject) => {
        fs.open(filePath, "r", (err, descriptor) =>{
            // First compare with index headers to check the given timestamps are within the range of the file (if not then we already know the index does not have what we are looking for so there is no need to search)
            // There is no promise based implementation of fs.read so messy nested callbacks must be used instead
            fs.read(descriptor, {length: 24, position: 0, buffer: Buffer.alloc(24)}, (err, bytesRead, data) =>{
                let indexLength = Number(data.readBigInt64BE(0));
                let lowestTimestamp = Number(data.readBigInt64BE(8));
                let highestTimestamp = Number(data.readBigInt64BE(16));
                if (indexLength === 0 || highestTimestamp < startTime || lowestTimestamp > endTime){
                    // Return empty list, as index does not contain what we are looking for
                    resolve([]);
                }
                else{
                    let firstEntry, currentEntry, lastEntry;
                    // First create a callback to be used "recursively" to find a block whose time range includes start time (not really recursive, as the callback registers itself with fs.read rather than calling itself (this means the recursion limit won't be an issue))
                    let searchIndex = function(err, bytesRead, data){
                        let smallestTime = Number(data.readBigInt64BE(0));
                        let largestTime = Number(data.readBigInt64BE(8));
                        if (smallestTime <= startTime && startTime <= largestTime){
                            // We have found the first block that contains timestamps in the given range
                            let blockNumber = Number(data.readBigInt64BE(16));
                            console.log(`Found block: ${blockNumber}`);
                        }
                        else if (startTime <= smallestTime){
                            // startTime is smaller than (or equal to) smallestTime, so we know the correct entries must be before this one
                            lastEntry = currentEntry;
                            currentEntry = Math.floor((firstEntry + lastEntry) / 2);
                            if (currentEntry === lastEntry){
                                // The entry is not in the index
                                resolve([]);
                            }
                            else{
                                fs.read(descriptor, {length: 24, buffer: Buffer.alloc(24), position: 24 + (currentEntry * 24)}, searchIndex);
                            }
                        }
                        else{
                            // startTime is larger than (or equal to) largestTime, so we know the correct entries must be after this one
                            firstEntry = currentEntry;
                            currentEntry = Math.floor((firstEntry + lastEntry) / 2);
                            if (currentEntry === firstEntry){
                                // The entry is not in the index
                                resolve([]);
                            }
                            else{
                                fs.read(descriptor, {length: 24, buffer: Buffer.alloc(24), position: 24 + (currentEntry * 24)}, searchIndex);
                            }
                        }
                    }
                    // Use binary search to find the first entry whose time range includes startTime
                    firstEntry = 0;
                    lastEntry = indexLength;
                    currentEntry = Math.floor((firstEntry + lastEntry) / 2);
                    fs.read(descriptor, {length: 24, buffer: Buffer.alloc(24), position: 24 + (currentEntry * 24)}, searchIndex);        
                }

            })

        });
    });
    }
}

//indexAccess.createIndex(__dirname + "/../data/index_test.wki", overwrite=true)

/*
let indexLength = 50000;
let smallestStamp, largestStamp;
let the_time = 12345678910;
let data = Buffer.alloc(24 + (24 * indexLength));
smallestStamp = the_time;
for (let i = 0; i < indexLength; i++){
    data.writeBigInt64BE(BigInt(the_time), 24 + (i * 24));
    the_time += 5000
    data.writeBigInt64BE(BigInt(the_time), 24 + (i * 24) + 8);
    largestStamp = the_time;
    the_time += 5000
    data.writeBigInt64BE(BigInt(i), 24 + (i * 24) + 16);
}
// Write headers
data.writeBigInt64BE(BigInt(indexLength));
data.writeBigInt64BE(BigInt(smallestStamp), 8);
data.writeBigInt64BE(BigInt(largestStamp), 16);

fs.writeFileSync(__dirname + "/../data/index_test.wki", data);
*/

indexAccess.getBlocks(__dirname + "/../data/index_test.wki", 12545673910, 12678934510)
