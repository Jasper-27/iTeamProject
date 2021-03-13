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

const idealBufferSize = 2730;  // The number of entries that getBlocks should try to read from the file at a time

class indexAccess{
    // Used as arguments to functions to reference headers
    static INDEXLENGTHHEADER = 0;
    static LOWESTTIMESTAMPHEADER = 1;
    static HIGHESTTIMESTAMPHEADER = 2;

    // Hold the headers in memory to reduce number of disk reads
    static headerData = {};  // format: <index filepath>: {INDEXLENGTHHEADER: <value>, LOWESTTIMESTAMPHEADER: <value>, HIGHESTTIMESTAMPHEADER: <value>}

    static async createIndex(filePath, overwrite=false){  // If there is already a valid index file at the location and overwrite is false, it won't be overwritten
        // Create a new index file at the given path
        if (overwrite === true || (await this.isValidIndex(filePath)) === false){
            // Only proceed if overwrite is true or if there is not already a valid index file
            // Create directory
            try{
                // If the path given directly in a root directory, this will throw an error.  But the error won't matter as the directory does not need to be created anyway
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

    static changeLastBlockHighestTimestamp(indexFile, newTimestamp){
        // Update the highest timestamp header of the last block (used by blockAccess when a new item is added)
        return new Promise((resolve, reject) =>{
            let updateBlockEntry = () => {
                let position = 24 + ((indexAccess.headerData[indexFile][indexAccess.INDEXLENGTHHEADER] - 1) * 24) + 8;
                fs.open(indexFile, "r+", (err, descriptor) => {
                    if (err) reject(err);
                    else{
                        let data = Buffer.alloc(8);
                        data.writeBigInt64BE(BigInt(newTimestamp));
                        fs.write(descriptor, data, 0, 8, position, err => {
                            if (err){
                                fs.close(descriptor, e =>{
                                    // If error occured when closing file, report that error
                                    if (e) reject(e);
                                    else reject(err);  // Otherwise report the other error
                                });
                            }
                            else{
                                fs.close(descriptor, e => {
                                    if (e) reject(e);  // If there was an error closing the file, then report it
                                    else resolve(true);  // Otherwise operation was successful so resolve the promise
                                });
                            }
                        });
                    }
                });
            };
            if (typeof indexAccess.headerData[indexFile] != "object"){
                // We don't have an in-memory copy of the index headers so must load them
                this._readHeadersToMemory(indexFile).then(value => {
                    updateBlockEntry();
                }).catch(reason => {reject(reason)});
            }
            else updateBlockEntry();
        });
    }

    static writeHeader(filePath, headers, values){
        // Takes in an array of headers to be written, and an array of values to be written to them
        return new Promise((resolve, reject) => {
            // Prepare data to be written
            let newHeaders = Buffer.alloc(24);
            // Define as a function as it needs to be used in more than one place
            let writeHeaders = () => {
                // Must declare each field of newHeaderData separately due to Javscript's silly syntax rules, which don't allow dots in key definitions
                let newHeaderData = {};
                newHeaderData[indexAccess.INDEXLENGTHHEADER] = indexAccess.headerData[filePath][indexAccess.INDEXLENGTHHEADER];
                newHeaderData[indexAccess.LOWESTTIMESTAMPHEADER] = indexAccess.headerData[filePath][indexAccess.LOWESTTIMESTAMPHEADER];
                newHeaderData[indexAccess.HIGHESTTIMESTAMPHEADER] = indexAccess.headerData[filePath][indexAccess.HIGHESTTIMESTAMPHEADER];
                for (let i = 0; i < headers.length; i++){
                    if (headers[i] === indexAccess.INDEXLENGTHHEADER){
                        newHeaderData[indexAccess.INDEXLENGTHHEADER] = values[i];     
                    }
                    else if (headers[i] === indexAccess.LOWESTTIMESTAMPHEADER){
                        newHeaderData[indexAccess.LOWESTTIMESTAMPHEADER] = values[i];
                    }
                    else if (headers[i] === indexAccess.HIGHESTTIMESTAMPHEADER){
                        newHeaderData[indexAccess.HIGHESTTIMESTAMPHEADER] = values[i];
                    }
                }
                newHeaders.writeBigInt64BE(BigInt(newHeaderData[indexAccess.INDEXLENGTHHEADER]), 0);
                newHeaders.writeBigInt64BE(BigInt(newHeaderData[indexAccess.LOWESTTIMESTAMPHEADER]), 8);
                newHeaders.writeBigInt64BE(BigInt(newHeaderData[indexAccess.HIGHESTTIMESTAMPHEADER]), 16);
                // Write data
                fs.open(filePath, "r+", (err, descriptor) => {
                    if (err) reject(err);
                    else{
                        fs.write(descriptor, newHeaders, 0, 24, 0, err => {
                            if (err){
                                fs.close(descriptor, e =>{
                                    // If error occured when closing file, report that error
                                    if (e) reject(e);
                                    else reject(err);  // Otherwise report the other error
                                });
                            }
                            else{
                                // Update headerData
                                indexAccess.headerData[filePath] = newHeaderData;
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else resolve(true);
                                });
                            }
                        });
                    }
                });
            }
        if (typeof indexAccess.headerData[filePath] != "object"){
            // If headerData has not yet been read for this file then do so now
            indexAccess._readHeadersToMemory(filePath).then(value => {
                writeHeaders();
            });
        }
        else{
            writeHeaders();
        }
        });
    }

    static getHeader(filePath, ...headers){
        // Takes a variable number of header references and promises an array of corresponding values for those headers
        return new Promise((resolve, reject) => {
            // Define as function as needed in two places
        let getHeaderValues = () => {
            let headerValues = [];
            for (let i = 0; i < headers.length; i++){
                if (headers[i] === indexAccess.INDEXLENGTHHEADER){
                    headerValues.push(indexAccess.headerData[filePath][indexAccess.INDEXLENGTHHEADER]);
                }
                else if (headers[i] === indexAccess.LOWESTTIMESTAMPHEADER){
                    headerValues.push(indexAccess.headerData[filePath][indexAccess.LOWESTTIMESTAMPHEADER]);
                }
                else if(headers[i] === indexAccess.HIGHESTTIMESTAMPHEADER){
                    headerValues.push(indexAccess.headerData[filePath][indexAccess.HIGHESTTIMESTAMPHEADER]);
                }
            }
            resolve(headerValues);
        };
            if (typeof indexAccess.headerData[filePath] != "object"){
                // Need to fetch headers from disk as we don't already have them in memory
                indexAccess._readHeadersToMemory(filePath).then(value => {
                    getHeaderValues();
                });
            }
            else getHeaderValues();
        });
        
    }

    static addBlock(filePath, smallestTimestamp, largestTimestamp, blockNumber){
        // Add a block to the index and return a promise indicating whether successful or not
        return new Promise((resolve, reject) => {
            // First check that provided timestamps are valid
            if (typeof smallestTimestamp != "number") reject("smallestTimestamp is not a valid number");
            else if (typeof largestTimestamp != "number") reject("largestTimestamp is not a valid number");
            else if (typeof blockNumber != "number") reject("blockNumber is not a valid number");
            else if (largestTimestamp < smallestTimestamp) reject("largestTimestamp is smaller than smallestTimestamp");
            else{
                // Load file
                fs.open(filePath, "r+", (err, descriptor) => {
                    if (err) reject(err);
                    else{
                        // First read the index headers to find the end of the file
                        let writeFile = () => {
                            let indexLength = Number(indexAccess.headerData[filePath][indexAccess.INDEXLENGTHHEADER]);
                            let indexSmallestTime = Number(indexAccess.headerData[filePath][indexAccess.LOWESTTIMESTAMPHEADER]);
                            let indexLargestTime = Number(indexAccess.headerData[filePath][indexAccess.HIGHESTTIMESTAMPHEADER]);
                            if (smallestTimestamp < indexLargestTime){
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else reject("This block's smallest timestamp is smaller than the previous block's largest one.  This would break the index (so the block has not been added).  This likely indicates an error with timestamp generation");
                                });
                            }
                            else{
                                // Prepare data to be written to file
                                let newEntry = Buffer.alloc(24);
                                newEntry.writeBigInt64BE(BigInt(smallestTimestamp), 0);
                                newEntry.writeBigInt64BE(BigInt(largestTimestamp), 8);
                                newEntry.writeBigInt64BE(BigInt(blockNumber), 16);
                                /*
                                Write the new entry before rewriting the headers.  This has two advantages:
                                a) Searches won't notice the entry unless it is included in the indexLength header.  This means that there will be no issue if a search operation gets scheduled between writing the new entry and rewriting the headers
                                b) This function uses the indexLength header to work out where to write the new entry.  This means that if the operation to rewrite the headers fails but the operation to add the entry has already succeeded, the new entry will simply by overwritten the next time an entry is added
                                */
                                fs.write(descriptor, newEntry, 0, 24, (24 + (indexLength * 24)), (err) => {
                                    if (err){
                                        fs.close(descriptor, e =>{
                                            if (e) reject(e);
                                            else reject(err);
                                        });
                                    }
                                    else{
                                        // Now rewrite the headers
                                        if (smallestTimestamp < indexSmallestTime || indexSmallestTime === 0) indexSmallestTime = smallestTimestamp;  // indexSmallestTime being 0 indicates that this is the first entry
                                        if (indexLargestTime < largestTimestamp) indexLargestTime = largestTimestamp;
                                        indexLength++;
                                        let newHeaders = Buffer.alloc(24);
                                        newHeaders.writeBigInt64BE(BigInt(indexLength), 0);
                                        newHeaders.writeBigInt64BE(BigInt(indexSmallestTime), 8);
                                        newHeaders.writeBigInt64BE(BigInt(indexLargestTime), 16);
                                        // Write
                                        fs.write(descriptor, newHeaders, 0, 24, 0, (err) => {
                                            if (err){ 
                                                fs.close(descriptor, e =>{
                                                    if (e) reject(e);
                                                    else reject(err);
                                                });
                                            }
                                            else{
                                                // Write was successful
                                                indexAccess.headerData[filePath][indexAccess.INDEXLENGTHHEADER] = indexLength;
                                                indexAccess.headerData[filePath][indexAccess.LOWESTTIMESTAMPHEADER] = indexSmallestTime;
                                                indexAccess.headerData[filePath][indexAccess.HIGHESTTIMESTAMPHEADER] = indexLargestTime;
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else resolve(true);
                                                });
                                            }
                                        })
                                    }
                                });
                            }
                            
                        };
                        if (typeof indexAccess.headerData[filePath] != "object"){
                            // We don't already have a copy of index headers in memory so much read them from file
                            indexAccess._readHeadersToMemory(filePath).then(() => writeFile()).catch(reason => reject(reason));
                        }
                        else writeFile();
                    }
                });
            }   
        });
    }

    static async getLastBlockNumber(filePath){
        // Returns a promise containing the block number of the last block in the index (needed by blockAccess to generate new block numbers)
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    // Get number of entries in order to be able to find last entry
                    let findLastEntry = () => {
                        let indexLength = Number(indexAccess.headerData[filePath][indexAccess.INDEXLENGTHHEADER]);
                        // Now jump to the last entry and read its block number
                        fs.read(descriptor, {position: 24 + (24 * (indexLength - 1)) + 16, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) =>{
                            if (err){
                                fs.close(descriptor, e =>{
                                    if (e) reject(e);
                                    else reject(err);
                                });
                            }
                            else{
                                let blockNumber = Number(data.readBigInt64BE(0));
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else resolve(blockNumber);
                                });
                            }
                        });
                    };
                    if (typeof indexAccess.headerData[filePath] != "object"){
                        // We don't already have a copy of the headers in memory so must fetch them
                        indexAccess._readHeadersToMemory(filePath).then(() => findLastEntry()).catch(reason => reject(reason));
                    }
                    else findLastEntry();
                }
            });
            
        });
    }

    static getBlocks(filePath, startTime, endTime){
        // Return a promise containing the block numbers for every block that contains values between the provided timestamps

        // First set up a promise that the method will return
        let promisedResult = new Promise((resolve, reject) => {
        fs.open(filePath, "r", (err, descriptor) =>{
            // First compare with index headers to check the given timestamps are within the range of the file (if not then we already know the index does not have what we are looking for so there is no need to search)
            // There is no promise based implementation of fs.read so messy nested callbacks must be used instead
            let searchIndex = () => {
                let indexLength = Number(indexAccess.headerData[filePath][indexAccess.INDEXLENGTHHEADER]);
                let lowestTimestamp = Number(indexAccess.headerData[filePath][indexAccess.LOWESTTIMESTAMPHEADER]);
                let highestTimestamp = Number(indexAccess.headerData[filePath][indexAccess.HIGHESTTIMESTAMPHEADER]);
                if (indexLength === 0 || highestTimestamp < startTime || lowestTimestamp > endTime){
                    // Return empty list, as index does not contain what we are looking for
                    fs.close(descriptor, e => {
                        if (e) reject(e);
                        else resolve([]);
                    });
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
                            if (currentEntry > indexLength - 1){
                                // The whole file has been searched so the rest of the data in the data buffer will be 0s
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else resolve(blocks);
                                });
                                return;
                            }
                            let smallestTime = Number(data.readBigInt64BE(i));
                            if (smallestTime <= endTime){
                                // This block can contain entries in the range we are looking for, so add it to blocks
                                blocks.push(Number(data.readBigInt64BE(i + 16)));
                            }
                            else{
                                // This block cannot contain entries in the range we are looking for, so no following ones can either.  So we can stop searching
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else resolve(blocks);
                                });
                                return;
                            }
                        }
                        if (currentEntry >= indexLength - 1){
                            // The entire file has been searched
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else resolve(blocks);
                            });
                        }
                        else{
                            // We still haven't found all suitable blocks, and we have also not reached the end of the index.  So rerun on the next cluster
                            // On most file systems cluster size is 4096 bytes, but 24 byte entries don't fit exactly into 4096 so get 4080 bytes instead
                            fs.read(descriptor, {length: 4080, buffer: Buffer.alloc(4080), position: 24 + ((currentEntry + 1) * 24)}, findNextSuitableBlocks);
                        }

                    }
                    let bufferStart, bufferEnd;  // The first and last entries in the current buffer
                    // Another "recursive" callback to find a the first block whose time range includes start time
                    let findFirstSuitableBlock = function(err, bytesRead, data){
                        while (bufferStart <= currentEntry && currentEntry <= bufferEnd){  // If the entry is in the buffer we can continue, otherwise we will have to refill the buffer so that it contains the entry
                            let entryPositionInBuffer = (currentEntry - bufferStart) * 24;
                            let smallestTime = Number(data.readBigInt64BE(entryPositionInBuffer));
                            let largestTime = Number(data.readBigInt64BE(entryPositionInBuffer + 8));
                            if (smallestTime <= startTime && startTime <= largestTime){
                                // We have found the first block that contains timestamps in the given range
                                blocks.push(Number(data.readBigInt64BE(16)));
                                // We now need to find all following blocks that can contain timestamps in the given range
                                // On most file systems cluster size is 4096 bytes, but 24 byte entries don't fit exactly into 4096 so get 4080 bytes instead
                                fs.read(descriptor, {length: 4080, buffer: Buffer.alloc(4080), position: 24 + ((currentEntry + 1) * 24)}, findNextSuitableBlocks);
                                return;
                            }
                            else if (startTime <= smallestTime){
                                // startTime is smaller than (or equal to) smallestTime, so we know the correct entries must be before this one
                                lastEntry = currentEntry;
                                currentEntry = Math.floor((firstEntry + lastEntry) / 2);
                                if (currentEntry === lastEntry){
                                    // The entry is not in the index
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else resolve([]);
                                    });
                                    return;
                                }
                            }
                            else{
                                // startTime is larger than (or equal to) largestTime, so we know the correct entries must be after this one
                                firstEntry = currentEntry;
                                currentEntry = Math.floor((firstEntry + lastEntry) / 2);
                                if (currentEntry === firstEntry){
                                    // The entry is not in the index
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else resolve([]);
                                    });
                                    return;
                                }
                            }
                        }
                        // The entry we need to check is not in the current buffer, so we need to load from the file
                        let details = indexAccess._calculateBufferDetails(indexLength, currentEntry);
                        bufferStart = details[0];
                        bufferEnd = details[1];
                        fs.read(descriptor, {length: details[2] * 24, buffer: Buffer.alloc(details[2] * 24), position: details[3]}, findFirstSuitableBlock);
                    }
                    // Use binary search to find the first entry whose time range includes startTime
                    firstEntry = 0;
                    lastEntry = indexLength;
                    currentEntry = Math.floor((firstEntry + lastEntry) / 2);
                    // Read in 2730 entries at once (~64kb) as this takes about the same amount of time as reading 1 entry
                    let details = indexAccess._calculateBufferDetails(indexLength, currentEntry);
                    bufferStart = details[0];
                    bufferEnd = details[1];
                    fs.read(descriptor, {length: details[2] * 24, buffer: Buffer.alloc(details[2] * 24), position: details[3]}, findFirstSuitableBlock);        
                }

            };
            if (typeof indexAccess.headerData[filePath] != "object"){
                // We don't already have a cached version of the headers so will first need to read them from the file
                indexAccess._readHeadersToMemory(filePath).then(() => searchIndex()).catch(reason => reject(reason));
            }
            else searchIndex();

        });
    });
    return promisedResult;
    }

    static _calculateBufferDetails(indexLength, currentEntry){
        // Return [<first entry in buffer>, <last entry in buffer>, <buffer size (number of entries)>, <point in file to read buffer from>]
        // currentEntry should be middle entry in buffer (as we do not know which side of the entry we will be have to search next)
        // Get first entry
        let bufferStart = Math.max(0, currentEntry - Math.floor(idealBufferSize / 2));  // If there are too few entries before currentEntry we use as many as we can
        // Get last entry
        let bufferEnd = Math.min(indexLength, currentEntry + Math.floor(idealBufferSize / 2));  // If there are too few entries after currentEntry we use as many as we can
        let bufferSize = bufferEnd - bufferStart;
        // Calculate position in file that new buffer should be read from
        let position = 24 + (bufferStart * 24);  // + 24 to skip over the index headers
        return [bufferStart, bufferEnd, bufferSize, position];
    }

    static _readHeadersToMemory(filePath){
        // Read headers from given index file into headerData
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.read(descriptor, {position: 0, buffer: Buffer.alloc(24), length: 24}, (err, bytesRead, data) =>{
                        if (err){
                            fs.close(descriptor, e =>{
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            indexAccess.headerData[filePath] = {};
                            indexAccess.headerData[filePath][indexAccess.INDEXLENGTHHEADER] = Number(data.readBigInt64BE(0));
                            indexAccess.headerData[filePath][indexAccess.LOWESTTIMESTAMPHEADER] = Number(data.readBigInt64BE(8));
                            indexAccess.headerData[filePath][indexAccess.HIGHESTTIMESTAMPHEADER] = Number(data.readBigInt64BE(16));
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else resolve(true);
                            });
                        }
                    });
                }   
            });
        });
    }
}
module.exports = indexAccess;