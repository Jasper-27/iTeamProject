/* 
Class for searching and modifying index files
Index files record which block contains each message or log entry

Index format (| symbols not included in file, just here to make it easier to read):
Number of entries (8 bytes)|Lowest timestamp (8 bytes)|Highest timestamp (8 bytes)|entries (24 bytes each)

Entry format:
Lowest timestamp in block (8 bytes)|Highest timestamp in block (8 bytes)|block number (8 bytes)
*/

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
                    if (startTime < lowestTimestamp) startTime = lowestTimestamp;  // Search will only work if startTime fits within the range of timestamps in the index
                    let blocks = [];  // Numbers of all the blocks that can contain timestamps in the given range
                    let firstEntry, currentEntry, lastEntry;
                    /*
                    The "findFirstSuitableBlock" callback searches the file to find the first block that can contain timestamps in the range we are looking for
                    The "findNextSuitableBlocks" callback then finds all the following blocks that can contain timestamps in the range we are looking for
                    */
                    // First create a callback to be used "recursively" to find all blocks within the given timestamp range given the first suitable block (not really recursive, as the callback registers itself with fs.read rather than calling itself (this means the recursion limit won't be an issue))
                    let findNextSuitableBlocks = function(err, bytesRead, data){
                        for (let i = 0; i < bytesRead; i += 24){
                            currentEntry++;
                            let smallestTime = Number(data.readBigInt64BE(i));
                            if (smallestTime <= endTime){
                                // This block can contain entries in the range we are looking for, so add it to blocks
                                blocks.push(Number(data.readBigInt64BE(i + 16)));
                            }
                            else{
                                // This block cannot contain entries in the range we are looking for, so no following ones can either.  So we can stop searching
                                resolve(blocks);
                                return;
                            }
                        }
                        if (currentEntry === indexLength - 1){
                            // The entire file has been searched
                            resolve(blocks);
                        }
                        else{
                            // We still haven't found all suitable blocks, and we have also not reached the end of the index.  So rerun on the next cluster
                            // On most file systems cluster size is 4096 bytes, but 24 byte entries don't fit exactly into 4096 so get 4080 bytes instead
                            fs.read(descriptor, {length: 4080, buffer: Buffer.alloc(4080), position: 24 + ((currentEntry + 1) * 24)}, findNextSuitableBlocks);
                        }

                    }
                    // Another "recursive" callback to find a the first block whose time range includes start time
                    let findFirstSuitableBlock = function(err, bytesRead, data){
                        let smallestTime = Number(data.readBigInt64BE(0));
                        let largestTime = Number(data.readBigInt64BE(8));
                        if (smallestTime <= startTime && startTime <= largestTime){
                            // We have found the first block that contains timestamps in the given range
                            blocks.push(Number(data.readBigInt64BE(16)));
                            // We now need to find all following blocks that can contain timestamps in the given range
                            // On most file systems cluster size is 4096 bytes, but 24 byte entries don't fit exactly into 4096 so get 4080 bytes instead
                            fs.read(descriptor, {length: 4080, buffer: Buffer.alloc(4080), position: 24 + ((currentEntry + 1) * 24)}, findNextSuitableBlocks);
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
                                fs.read(descriptor, {length: 24, buffer: Buffer.alloc(24), position: 24 + (currentEntry * 24)}, findFirstSuitableBlock);
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
                                fs.read(descriptor, {length: 24, buffer: Buffer.alloc(24), position: 24 + (currentEntry * 24)}, findFirstSuitableBlock);
                            }
                        }
                    }
                    // Use binary search to find the first entry whose time range includes startTime
                    firstEntry = 0;
                    lastEntry = indexLength;
                    currentEntry = Math.floor((firstEntry + lastEntry) / 2);
                    fs.read(descriptor, {length: 24, buffer: Buffer.alloc(24), position: 24 + (currentEntry * 24)}, findFirstSuitableBlock);        
                }

            })

        });
    });
    return promisedResult;
    }
}

