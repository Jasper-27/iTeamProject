/*
Class for searching and modifying block files
Blocks are files that contain messages or logs.  They allow for faster access as messages / logs aren't all in one big file

Block format (| symbols not included in file, just here to make easier to read):
Is block full? (1 byte)|Number of entries in block (8 bytes)|Next free space position(8 bytes)|Middle entry position (8 bytes)|Entries (variable length)

Entry format:
Entry length (8 bytes)|timestamp (8 bytes)|data (variable length)

As the entries are variable length, the entry length field is needed to allow us to jump to the next entry
The data field can contain multiple fields, but it is not the responsibility of blockAccess.  It is provided as a parameter
*/

const fs = require('fs');
const path = require('path');
const indexAccess = require('./indexAccess');
const fixedQueue = require('./../fixedQueue');

const idealBufferSize = 65536;  // The amount of data getEntries should try to read from the file at a time (unlike in indexAccess, this must be a number of bytes rather than number of entries as block entries vary in size (and can be very large))
const blockSize = 1000;  // The number of entries per block

class blockAccess{
    static BLOCKFULLHEADER = 0;
    static ENTRYCOUNTHEADER = 1;
    static NEXTFREEHEADER = 2;
    static MIDDLEHEADER = 3;

    // Hold headers of current non-full block in memory to save on disk reads
    static headerData = {};  // Format: <block folder path>: {BLOCKFULLHEADER: <value>, ENTRYCOUNTHEADER: <value>, NEXTFREEHEADER: <value>, MIDDLEHEADER: <value>};
    /*
    When a block becomes full, a new block will be created when a new message / log entry needs to be added.
    However, if messages / log entries need to be added while a block is being created we need to make sure that this does not cause multiple blocks to be created
    As this could result in duplicate block numbers and incomplete blocks.
    To solve this, when a new block begins being created the block folder path is added as a key to the blocksBeingCreated dictionary.  The value for the key will be an array of items to be added.
    This will tell any other attempts to create a block not to bother, and they will instead put their entries to be written in the array for the key, and the original createBlock process will add them to the new block
    */
    static blocksBeingCreated = {};

    static async createBlock(indexFilePath, blockFolderPath, firstEntryTimestamp, firstEntryData){
        // An empty block cannot be created (as otherwise there would be no timestamps to use in the index) so the firstEntry... parameters contain the details for the first entry to be added once the block is created
        // Must be asynchronous so return a promise
        return new Promise((resolve, reject) =>{
            // Check parameters are valid
            if (typeof firstEntryTimestamp != "number") reject("firstEntryTimestamp is not valid number");
            else if (!(firstEntryData instanceof Buffer)) reject("firstEntryData is not a 'Buffer' object");
            else{
                // Get number of last block to generate new block number
                indexAccess.getLastBlockNumber(indexFilePath).then(oldBlockNumber => {
                    if (blockAccess.blocksBeingCreated[blockFolderPath] instanceof Array){
                        // Another block is already in the process of being created, so just add our entry to the corresponding array and it will be added when the block is created
                        blockAccess.blocksBeingCreated[blockFolderPath].push([firstEntryTimestamp, firstEntryData]);
                        resolve("Another block already being created");
                    }
                    else{
                        // Add array to blocksBeingCreated to show that block creation is in progress
                        blockAccess.blocksBeingCreated[blockFolderPath] = [[firstEntryTimestamp, firstEntryData]];
                        let newBlockNumber = oldBlockNumber + 1;
                        let blockPath = path.format({dir: blockFolderPath, base: `${newBlockNumber}.wki`});
                        // Create the folder if necessary
                        fs.mkdir(blockFolderPath, {recursive: true}, err => {
                            // Create the file
                            fs.open(blockPath, "w", (err, descriptor) => {
                                if (err) reject(err);
                                else{
                                    let lastTimestamp;
                                    // Write headers to the file
                                    // This is done as a promise to allow us to iteratively chain .then()s for adding each entry
                                    let writeHeaders = new Promise((resolveHeaders, rejectHeaders) => {
                                        let headers = Buffer.alloc(25);
                                        headers.writeInt8(0, 0);  // 0 means block is not full
                                        headers.writeBigInt64BE(0n, 1);  // Entry count
                                        headers.writeBigInt64BE(25n, 9);  // Next free location is at byte 25, after the headers
                                        headers.writeBigInt64BE(0n, 17);  // There are no entries yet so there cannot be a middle entry
                                        fs.write(descriptor, headers, 0, 25, 0, err => {
                                            if (err){ 
                                                fs.close(descriptor, e =>{
                                                    if (e) rejectHeaders(e);
                                                    else rejectHeaders(err);
                                                });
                                            }
                                            else{
                                                // Update the in-memory copy of the headers with those for the new block
                                                let newHeaderData = {};
                                                newHeaderData[blockAccess.BLOCKFULLHEADER] = 0;
                                                newHeaderData[blockAccess.ENTRYCOUNTHEADER] = 0;
                                                newHeaderData[blockAccess.NEXTFREEHEADER] = 25;
                                                newHeaderData[blockAccess.MIDDLEHEADER] = 0;
                                                blockAccess.headerData[blockFolderPath] = newHeaderData;
                                                // Close file and resolve promise
                                                fs.close(descriptor, e => {
                                                    if (e) rejectHeaders(e);
                                                    else resolveHeaders(true);
                                                });
                                            }
                                        });
                                    });
                                    // Now use a loop to chain operations for adding the entries in blocksBeingCreated
                                    while (blockAccess.blocksBeingCreated[blockFolderPath].length > 0){
                                        let entry = blockAccess.blocksBeingCreated[blockFolderPath].shift();
                                        lastTimestamp = entry[0];
                                        writeHeaders = writeHeaders.then(value => {
                                            return this.writeEntryToBlock(blockPath, entry[0], entry[1]);
                                        });
                                    }
                                    writeHeaders.then(() => {
                                        // The block is now created, so add it to index
                                        return indexAccess.addBlock(indexFilePath, firstEntryTimestamp, lastTimestamp, newBlockNumber);
                                    })
                                    .then(() => {
                                        // Remove from blocksBeingCreated and finish
                                        blockAccess.blocksBeingCreated[blockFolderPath] = null;
                                        resolve(true);
                                    });
                                }
                            });
                        });
                    }
                }, err => {reject(err);})
            }
        });

    }

    static addEntry(indexFilePath, blockFolderPath, entryTimestamp, entryData){
        // Add a new entry to the currently unfinished block (creating a new block if necessary)
        return new Promise((resolve, reject) => {
            // Make sure timestamp of new entry is not lower than previous one, as searching relies on chronological ordering
            // The index will have the timestamp as a header, and indexAccess will most likely have a copy in memory so it makes sense to get it from there
            indexAccess.getHeader(indexFilePath, indexAccess.HIGHESTTIMESTAMPHEADER).then(returnedHeaders => {
                if (entryTimestamp < returnedHeaders[0]) reject("The new entry's timestamp is smaller than the previous entry's one.  This would break the block (so the entry has not been added).  This likely indicates an error with timestamp generation");
                else{
                    // First must find last block
                    indexAccess.getLastBlockNumber(indexFilePath).then(blockNumber => {
                        if (blockNumber === 0){
                            // If the last block number is 0, there are no blocks yet so we must create one
                            blockAccess.createBlock(indexFilePath, blockFolderPath, entryTimestamp, entryData).then(value => {
                                resolve(true);
                            }).catch(reason => {
                                reject(reason);
                            });
                            return;
                        }
                        let blockPath = path.format({dir: blockFolderPath, base: `${blockNumber}.wki`});
                        // Define as function as needed in two places
                        let addEntryToBlock = () => {
                            // Check that current block is not full
                            if (0 < blockAccess.headerData[blockFolderPath][blockAccess.BLOCKFULLHEADER]){
                                // Either there are no blocks yet, or the last block is full, so we must create a new block and add the entry to that
                                blockAccess.createBlock(indexFilePath, blockFolderPath, entryTimestamp, entryData).then(value => {
                                    resolve(true);
                                }).catch(reason => {
                                    reject(reason);
                                });
                            }
                            else{
                                // Block is not full, so write the entry to it
                                blockAccess.writeEntryToBlock(blockPath, entryTimestamp, entryData).then(value => {
                                    // Now update the index
                                    indexAccess.changeLastBlockHighestTimestamp(indexFilePath, entryTimestamp).then(() => {
                                        indexAccess.writeHeader(indexFilePath, [indexAccess.HIGHESTTIMESTAMPHEADER], [entryTimestamp]).then(() => {
                                            // The entry has been written, the block headers have been updated, the timestamp of the last index entry has been updated, and the index headers have been updated so we are done
                                            resolve(true);
                                        });
                                    });
                                }).catch(reason => {
                                    reject(reason);
                                });
                            }
                        };
                        if (typeof blockAccess.headerData[blockFolderPath] != "object"){
                            // We don't have an in-memory copy of block headers yet, so must fetch one
                            blockAccess._readHeadersToMemory(blockPath).then(value => {
                                addEntryToBlock();
                            }).catch(reason => {reject(reason)});

                        }
                        else{
                            addEntryToBlock();
                        }
                    });
                }
            });
        });
    }

    static async writeEntryToBlock(blockPath, entryTimestamp, entryData){
        // Write an entry to the block (this does not handle updating the index)
        return new Promise((resolve, reject) => {
            // Create entry to be written
            let entryLength = 16 + entryData.length;  // 16 for length and timestamp fields
            let entry = Buffer.concat([bigIntToBuffer(BigInt(entryLength)), bigIntToBuffer(BigInt(entryTimestamp)), entryData]);
            fs.open(blockPath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    let blockFolderPath = path.dirname(blockPath);
                    // Define as function as needed in two places
                    let writeEntry = () =>  {
                        let entryCount = BigInt(blockAccess.headerData[blockFolderPath][blockAccess.ENTRYCOUNTHEADER]);
                        let nextFreePosition = BigInt(blockAccess.headerData[blockFolderPath][blockAccess.NEXTFREEHEADER]);
                        let middleEntryPosition = BigInt(blockAccess.headerData[blockFolderPath][blockAccess.MIDDLEHEADER]);
                        // Write the new entry
                        fs.write(descriptor, entry, 0, Number(entryLength), Number(nextFreePosition), (err, bytesWritten, written) => {
                            if (err) reject(err);
                            else{
                                // Create function for modifying the headers (needs to be defined up here as it is needed in two places)
                                let updateHeaders = () => {
                                    let blockIsFull = 0;
                                    if (entryCount >= blockSize) blockIsFull = 1;
                                    let headers = Buffer.concat([
                                        intToBuffer(blockIsFull),
                                        bigIntToBuffer(BigInt(entryCount)),
                                        bigIntToBuffer(BigInt(nextFreePosition)),
                                        bigIntToBuffer(BigInt(middleEntryPosition))
                                    ]);
                                    fs.write(descriptor, headers, 0, 25, 0, (err) => {
                                        if (err){ 
                                            fs.close(descriptor, e =>{
                                                if (e) reject(e);
                                                else reject(err);
                                            });
                                        }
                                        else{
                                            // Update the in-memory versions of the headers
                                            blockAccess.headerData[blockFolderPath][blockAccess.BLOCKFULLHEADER] = blockIsFull;
                                            blockAccess.headerData[blockFolderPath][blockAccess.ENTRYCOUNTHEADER] = entryCount;
                                            blockAccess.headerData[blockFolderPath][blockAccess.NEXTFREEHEADER] = nextFreePosition;
                                            blockAccess.headerData[blockFolderPath][blockAccess.MIDDLEHEADER] = middleEntryPosition;
                                            // The item and headers have been written, so we are done
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else resolve(true);
                                            });
                                        }
                                    });
                                }
                                // Update the headers
                                nextFreePosition += BigInt(entryLength);
                                entryCount++;
                                // The middle entry only needs to be updated on every other addition
                                if (entryCount == 1){
                                    // This is the first entry
                                    middleEntryPosition = 25;
                                    updateHeaders();
                                }
                                else if(entryCount % 2n == 0){
                                    // Change middle entry only when entryCount is even
                                    fs.read(descriptor, {position: Number(middleEntryPosition), length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                                        // To update middle entry we need to find the length of the existing middle entry
                                        if (err) reject(err);
                                        else{
                                            let middleEntryLength = data.readBigInt64BE(0);
                                            middleEntryPosition += middleEntryLength;
                                            // Now update the headers
                                            updateHeaders();
                                        }
                                    })
                                }
                                else{
                                    updateHeaders();
                                }
                            }
                        });
                    }
                    if (typeof blockAccess.headerData[blockFolderPath] != "object"){
                        // We don't already have the headers in memory so must load them
                        blockAccess._readHeadersToMemory(blockPath).then(() => {
                            writeEntry();
                        }).catch(reason => {reject(reason)});
                    }
                    else writeEntry();
                }
            });
            
        });
    }

    static getEntriesBetween(blockPath, startTime, endTime){
        // Return promise containing all entries in the given block with timestamps between startTime and endTime (inclusive)
        // Searching is primarily done with linear search, but we do have a header pointing to the middle entry so we can use that to narrow the search down to half of the file
        return new Promise((resolve, reject) => {
            fs.open(blockPath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    // The only block whose headers are stored in memory is the currently non-full one, therefore we will have to read the headers for this block from disk
                    fs.read(descriptor, {position: 1, buffer: Buffer.alloc(24), length: 24}, (err, bytesRead, data) => { // Read from byte 1 not 0 as the BLOCKFULLHEADER is irrelevant for searching
                        let entryCount = Number(data.readBigInt64BE(0));
                        let nextFreePosition = Number(data.readBigInt64BE(8));  // This is useful for knowing where the file ends
                        let middleEntryPosition = Number(data.readBigInt64BE(16));  // This is needed to find the middle entry so we (ideally) only have to search half of the file

                        let bufferStartPos, bufferEndPos, currentPos;
                        let foundEntries = [];
                        // Define function for linear search as it will to call itself "recursively" (not really recursive, but it will have to provide itself as a callback to fs.read)
                        let findAllSuitableEntries = (err, bytesRead, data) => {
                            if (err) reject(err);
                            else{
                                while (bufferStartPos <= currentPos && currentPos + 16 <= bufferEndPos){  // Make sure at least the length and timestamp headers of the current entry are inside the buffer
                                    let positionWithinBuffer = currentPos - bufferStartPos;  // Translate the currentPos (which represents a position within the whole file) to a position within the current buffer
                                    let currentEntrySize = Number(data.readBigInt64BE(positionWithinBuffer));
                                    let currentEntryTimestamp = data.readBigInt64BE(positionWithinBuffer + 8);
                                    if (startTime <= currentEntryTimestamp && currentEntryTimestamp <= endTime){
                                        // The current entry's timestamp fits within the requested range so add to foundEntries
                                        if ((currentPos + currentEntrySize) - 1 <= bufferEndPos){
                                            // The entire entry is contained within the buffer so simply read it into foundEntries
                                            /* 
                                            Need to use Buffer.from to create a copy of the buffer data, as subarray will just return a new buffer referencing the data in the old one.
                                            While this may seem less efficient, it is actually more as the Javascript garbage collector will be unable to deallocate ANY of the memory in the current buffer if there are any references to it (even though only part of the buffer is referenced)
                                            Doing it this way is therefore necessary to prevent a memory leak
                                            */
                                            let itemBuffer = Buffer.from(data.subarray(positionWithinBuffer, positionWithinBuffer + currentEntrySize));
                                            foundEntries.push(itemBuffer);
                                        }
                                        else{
                                            // Not all of the entry is contained within the buffer, so we will need to read the entire entry before we can add it to foundEntries
                                            fs.read(descriptor, {position: currentPos, length: currentEntrySize, buffer: Buffer.alloc(currentEntrySize)}, (err, bytesRead, data) => {
                                                if (err) reject(err);
                                                else{
                                                    foundEntries.push(data);
                                                    // Now continue searching
                                                    bufferStartPos = currentPos;
                                                    bufferEndPos = currentPos + currentEntrySize - 1;
                                                    currentPos += currentEntrySize;
                                                    findAllSuitableEntries(null, bytesRead, data);  // Rerun the function with this buffer (it will refill it)
                                                }
                                            });
                                            return;
                                        } 
                                    }
                                    else if (endTime < currentEntryTimestamp){
                                        // We have gone past the end of the range we want so can stop searching
                                        fs.close(descriptor, e => {
                                            if (e) reject(e);
                                            else resolve(foundEntries);
                                        });
                                        return;
                                    }
                                    // Check next entry
                                    currentPos += currentEntrySize;  // Position of next entry is calculated by adding this entry's length to its position
                                }
                                if (nextFreePosition <= currentPos){
                                    // We have reached the end of the file so stop searching
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else resolve(foundEntries);
                                    });
                                }
                                else{
                                    // Refill the buffer with new data starting from currentPos and continue the search
                                    let bufferDetails = this._calculateBufferDetails(currentPos, nextFreePosition);
                                    bufferStartPos = bufferDetails[0];
                                    bufferEndPos = bufferDetails[1];
                                    fs.read(descriptor, {position: currentPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, findAllSuitableEntries);
                                }
                            }
                        };
                        // Get middle entry
                        fs.read(descriptor, {position: middleEntryPosition + 8, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                            if (err) reject(err);
                            else{
                                let middleEntryTimestamp = data.readBigInt64BE(0);
                                // If the timestamp of the middle entry is greater than startTime then start searching from the beginning of the block
                                if (startTime < middleEntryTimestamp || middleEntryTimestamp == -1){  // Middle entry timestamp may be -1 if the entry was deleted.  In this case search from start of file as that ensures all items will be searched if necessary
                                    currentPos = 25;
                                }
                                else{
                                    // If it is less than or equal to startTime then we know what we want is in the second half of the block so start searching from the middle entry
                                    currentPos = middleEntryPosition;
                                }
                                let bufferDetails = blockAccess._calculateBufferDetails(currentPos, nextFreePosition);
                                bufferStartPos = bufferDetails[0];
                                bufferEndPos = bufferDetails[1];
                                fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, findAllSuitableEntries);
                            }
                            
                        });
                        
                    });             
                }
            })
        });
    }

    static getEntriesNear(blockPath, timeStamp, numberOfEntries, getPrecedingEntries=false){
        // Return promise containing a number of entries (specified by numberOfEntries) before or after the given timestamp (or as many entries as we can).  If getPrecedingEntries is true, it will get the entries before the timestamp, and if false it will get ones after
        // Returns the entry positions, NOT the entry data itself (unlike getEntriesBetween)
        return new Promise((resolve, reject) => {
            fs.open(blockPath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    // The only block whose headers are stored in memory is the currently non-full one, therefore we will have to read the headers for this block from disk
                    fs.read(descriptor, {position: 1, buffer: Buffer.alloc(24), length: 24}, (err, bytesRead, data) => { // Read from byte 1 not 0 as the BLOCKFULLHEADER is irrelevant for searching
                        let nextFreePosition = Number(data.readBigInt64BE(8));  // This is useful for knowing where the file ends
                        let middleEntryPosition = Number(data.readBigInt64BE(16));  // This is needed to find the middle entry so we (ideally) only have to search half of the file
                        let middleEntryTimestamp;
                        var searchingFromMidpoint = false;

                        let bufferStartPos, bufferEndPos, currentPos, currentEntryTimestamp;
                        let foundEntries = new fixedQueue(numberOfEntries);
                        // Define function for linear search as it will to call itself "recursively" (not really recursive, but it will have to provide itself as a callback to fs.read)
                        let findAllSuitableEntries = async (err, bytesRead, data) => {
                            if (err) reject(err);
                            else{
                                // Find the first entry that is greater than timeStamp
                                while (bufferStartPos <= currentPos && currentPos + 16 <= bufferEndPos){  // Make sure at least the length and timestamp headers of the current entry are inside the buffer
                                    let positionWithinBuffer = currentPos - bufferStartPos;  // Translate the currentPos (which represents a position within the whole file) to a position within the current buffer
                                    let currentEntrySize = Number(data.readBigInt64BE(positionWithinBuffer));
                                    currentEntryTimestamp = data.readBigInt64BE(positionWithinBuffer + 8);
                                    if (currentEntryTimestamp <= timeStamp){
                                        if (getPrecedingEntries === true){
                                            // If we are looking for x entries before the timestamp, then record each entry until we reach the timestamp or the end of the file.  fiexedQueue will automatically push out older entries if we have more than we need
                                            if (currentEntryTimestamp != -1){
                                                // Ignore deleted entries
                                                // Add entry position to end of foundEntries
                                                foundEntries.push(currentPos);
                                            }
                                        }
                                    }
                                    else if (getPrecedingEntries === true){
                                        // The current entry is greater than timeStamp, so wont find any more preceding entries past this point
                                        if (searchingFromMidpoint && foundEntries.usedSize < numberOfEntries){
                                            /* 
                                            If we are searching for preceding entries and haven't found enough yet, and began from the midpoint then get more from before the midpoint
                                            We can do this by recursively calling this method to get as many entries as we need preceding the midpoint
                                            */
                                           let entriesStillNeeded = numberOfEntries - foundEntries.usedSize;
                                           let entriesFromBeforeMidpoint = await blockAccess.getEntriesNear(blockPath, Number(middleEntryTimestamp), entriesStillNeeded, true);
                                           // Now merge the two fixedQueues together
                                           foundEntries.merge(entriesFromBeforeMidpoint, true);
                                        }
                                        fs.close(descriptor, e => {
                                            if (e) reject(e);
                                            else resolve(foundEntries);
                                        });
                                        return;
                                    }
                                    else{
                                        // If we are looking for entries after the timestamp, then we don't start recording entries until one greater than the timestamp has been found
                                        if (foundEntries.usedSize === numberOfEntries){
                                            // We have found enough entries so can stop searching
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else resolve(foundEntries);
                                            });
                                            return;
                                        }
                                        else{
                                            foundEntries.push(currentPos);
                                        }
                                    }
                                    // Check next entry
                                    currentPos += currentEntrySize;  // Position of next entry is calculated by adding this entry's length to its position
                                }
                                if (nextFreePosition <= currentPos){
                                    // We have reached the end of the file
                                    if (foundEntries.usedSize < numberOfEntries){
                                        /* 
                                        If we are searching for preceding entries and haven't found enough yet, and began from the midpoint then get more from before the midpoint
                                        We can do this by recursively calling this method to get as many entries as we need preceding the midpoint
                                        */
                                       let entriesStillNeeded = numberOfEntries - foundEntries.usedSize;
                                       let entriesFromBeforeMidpoint = await blockAccess.getEntriesNear(blockPath, Number(middleEntryTimestamp), entriesStillNeeded, true);
                                       // Now merge the two fixedQueues together
                                       foundEntries.merge(entriesFromBeforeMidpoint, true);
                                    }
                                    // Exit and resolve foundEntries
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else resolve(foundEntries);
                                    });
                                    return;
                                }
                                else{
                                    // Refill the buffer with new data starting from currentPos and continue the search
                                    let bufferDetails = this._calculateBufferDetails(currentPos, nextFreePosition);
                                    bufferStartPos = bufferDetails[0];
                                    bufferEndPos = bufferDetails[1];
                                    fs.read(descriptor, {position: currentPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, findAllSuitableEntries);
                                }
                            }
                        };
                        // Get middle entry
                        fs.read(descriptor, {position: middleEntryPosition + 8, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                            if (err) reject(err);
                            else{
                                middleEntryTimestamp = data.readBigInt64BE(0);
                                // If the timestamp of the middle entry is greater than timeStamp then start searching from the beginning
                                /* What to do if the timestamp to be searched for is equal to the middle entry depends on whether getPrecedingEntries is true
                                    If it is true, then we should start searching from the beginning because we want to search entries before the timestamp
                                    If false, we should start searching from midpoint because we want to search the entries after the timestamp
                                */
                                if (timeStamp < middleEntryTimestamp || (timeStamp == middleEntryTimestamp && getPrecedingEntries === true) || middleEntryTimestamp == -1){
                                    currentPos = 25;
                                }
                                else{
                                    // If it is less than or equal to timeStamp then start searching from the middle entry
                                    currentPos = middleEntryPosition;
                                    searchingFromMidpoint = true;
                                }
                                let bufferDetails = blockAccess._calculateBufferDetails(currentPos, nextFreePosition);
                                bufferStartPos = bufferDetails[0];
                                bufferEndPos = bufferDetails[1];
                                fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, findAllSuitableEntries);
                            }
                            
                        });
                        
                    });             
                }
            })
        });
    }

    static getEntriesFromPositions(blockPath, positions){  // Positions should be an array or fixedQueue
        // Reads entries starting at the positions given
        return new Promise((resolve, reject) => {
            if (positions instanceof fixedQueue){
                positions = positions.queue;
            }
            let entries = [];
            fs.open(blockPath, "r", async (err, descriptor) => {
                if (err) reject(err);
                else{
                    try{
                        let nextFreePosition = await new Promise((resolveHeader, rejectHeader) => {
                            fs.read(descriptor, {position: 9, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                                if (err) rejectHeader(err);
                                else{
                                    resolveHeader(Number(data.readBigInt64BE()));
                                }
                            });
                        });
                        let bufferStartPos, bufferEndPos, currentPos;
                        let readEntries = (err, bytesRead, data) => {
                            if (err){
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else reject(err);
                                });
                                return;
                            }
                            while (bufferStartPos <= currentPos && currentPos + 8 <= bufferEndPos){  // Make sure at least the length field is inside the buffer
                                let positionWithinBuffer = currentPos - bufferStartPos;
                                let entryLength = Number(data.readBigInt64BE(positionWithinBuffer));
                                if (bufferEndPos < currentPos + entryLength){  // Make sure entire entry is contained in the buffer
                                    break;
                                }
                                else{
                                    // Read entry data
                                    let itemBuffer = Buffer.from(data.subarray(positionWithinBuffer, positionWithinBuffer + entryLength));
                                    entries.push(itemBuffer);
                                    if (0 < positions.length){
                                        // If there are more positions to be read then change currentPos and repeat
                                        currentPos = positions.shift();
                                        if (!(25 <= currentPos && currentPos < nextFreePosition)){
                                            // The position is outside the range of valid positions in this block
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else reject("Position not in block");
                                            });
                                            return;
                                        }
                                    }
                                    else{
                                        // We have read all the entries, so resolve and exit
                                        fs.close(descriptor, e => {
                                            if (e) reject(e);
                                            else resolve(entries);
                                        });
                                        return;
                                    }
                                }
                            }
                            // currentPos is outside the buffer, so refill it
                            let bufferDetails = blockAccess._calculateBufferDetails(currentPos, nextFreePosition);
                            bufferStartPos = bufferDetails[0];
                            bufferEndPos = bufferDetails[1];
                            fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, readEntries);
                        }
                        if (0 < positions.length){
                            currentPos = positions.shift();
                            if (!(25 <= currentPos && currentPos < nextFreePosition)){
                                // The position is outside the range of valid positions in this block
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else reject("Position not in block");
                                });
                            }
                            else{
                                // Start searching
                                let bufferDetails = blockAccess._calculateBufferDetails(currentPos, nextFreePosition);
                                bufferStartPos = bufferDetails[0];
                                bufferEndPos = bufferDetails[1];
                                fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, readEntries);
                            }
                        }
                        else{
                            // No positions were requested
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else resolve([]);
                            });
                        }
                    }
                    catch (reason){
                        fs.close(descriptor, e => {
                            if (e) reject(e);
                            else reject(err);
                        });
                    }
                }
            });
        });
    }


    static wipeEntries(blockPath, startTime, endTime){
        /* 
        Due to the way blocks are formatted, we cannot delete entries (or we would have to rewrite the whole file from the deleted entry)
        So instead we will leave the length field intact, set the timestamp to -1 (so it will never be returned by getEntries), and overwrite the rest of the entry with 0s

        This process is almost identical to getEntries, except instead of returing the found entries we "delete" them
        */
        return new Promise((resolve, reject) => {
            fs.open(blockPath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    // The only block whose headers are stored in memory is the currently non-full one, therefore we will have to read the headers for this block from disk
                    fs.read(descriptor, {position: 1, buffer: Buffer.alloc(24), length: 24}, (err, bytesRead, data) => { // Read from byte 1 not 0 as the BLOCKFULLHEADER is irrelevant for searching
                        let nextFreePosition = Number(data.readBigInt64BE(8));  // This is useful for knowing where the file ends
                        let middleEntryPosition = Number(data.readBigInt64BE(16));  // This is needed to find the middle entry so we (ideally) only have to search half of the file

                        let bufferStartPos, bufferEndPos, currentPos;
                        let deletedCount = 0;
                        // Define function for linear search as it will to call itself "recursively" (not really recursive, but it will have to provide itself as a callback to fs.read)
                        let findAllSuitableEntries = async (err, bytesRead, data) => {
                            if (err) reject(err);
                            else{
                                while (bufferStartPos <= currentPos && currentPos + 16 <= bufferEndPos){  // Make sure at least the length and timestamp headers of the current entry are inside the buffer
                                    let positionWithinBuffer = currentPos - bufferStartPos;  // Translate the currentPos (which represents a position within the whole file) to a position within the current buffer
                                    let currentEntrySize = Number(data.readBigInt64BE(positionWithinBuffer));
                                    let currentEntryTimestamp = data.readBigInt64BE(positionWithinBuffer + 8);
                                    if (startTime <= currentEntryTimestamp && currentEntryTimestamp <= endTime){
                                        // The current entry's timestamp fits within the requested range so "delete" it
                                        try{
                                            // Do the deleting inside a promise so we can await it
                                            await new Promise((resolveDelete, rejectDelete) => {
                                                let wipedEntry = Buffer.alloc(currentEntrySize);
                                                wipedEntry.writeBigInt64BE(BigInt(currentEntrySize));
                                                wipedEntry.writeBigInt64BE(BigInt(-1), 8);
                                                // Rewrite entry with timestamp set to -1 and data set to 0s
                                                fs.write(descriptor, wipedEntry, 0, currentEntrySize, currentPos, err => {
                                                    if (err){
                                                        fs.close(descriptor, e => {
                                                            if (e) rejectDelete(e);
                                                            else rejectDelete(err);
                                                        });
                                                    }
                                                    else resolveDelete(true);
                                                });
                                            });
                                            deletedCount++;
                                        }
                                        catch (reason){
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else reject(reason);
                                            });
                                        } 
                                    }
                                    else if (endTime < currentEntryTimestamp){
                                        // We have gone past the end of the range we want so can stop searching
                                        fs.close(descriptor, e => {
                                            if (e) reject(e);
                                            else resolve(deletedCount);
                                        });
                                        return;
                                    }
                                    // Check next entry
                                    currentPos += currentEntrySize;  // Position of next entry is calculated by adding this entry's length to its position
                                }
                                if (nextFreePosition <= currentPos){
                                    // We have reached the end of the file so stop searching
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else resolve(deletedCount);
                                    });
                                }
                                else{
                                    // Refill the buffer with new data starting from currentPos and continue the search
                                    let bufferDetails = this._calculateBufferDetails(currentPos, nextFreePosition);
                                    bufferStartPos = bufferDetails[0];
                                    bufferEndPos = bufferDetails[1];
                                    fs.read(descriptor, {position: currentPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, findAllSuitableEntries);
                                }
                            }
                        };
                        // Get middle entry
                        fs.read(descriptor, {position: middleEntryPosition + 8, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                            if (err) reject(err);
                            else{
                                let middleEntryTimestamp = data.readBigInt64BE(0);
                                // If the timestamp of the middle entry is greater than startTime then start searching from the beginning of the block
                                if (startTime < middleEntryTimestamp){
                                    currentPos = 25;
                                }
                                else{
                                    // If it is less than or equal to startTime then we know what we want is in the second half of the block so start searching from the middle entry
                                    currentPos = middleEntryPosition;
                                }
                                let bufferDetails = blockAccess._calculateBufferDetails(currentPos, nextFreePosition);
                                bufferStartPos = bufferDetails[0];
                                bufferEndPos = bufferDetails[1];
                                fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, findAllSuitableEntries);
                            }
                            
                        });
                        
                    });             
                }
            })
        });
    }

    static _calculateBufferDetails(position, endOfFilePosition){
        // Calculate values for fs.read to read idealBufferSize around the given position (or as close as possible if the file is not big enough)
        // Return [<first position in buffer>, <last position in buffer>, <buffer size (bytes)>]
        let firstPosition = position;
        let lastPosition = Math.min(firstPosition + idealBufferSize, endOfFilePosition);  // Do not read more than is in file
        let bufferSize = lastPosition - firstPosition;
        return [firstPosition, lastPosition, bufferSize];
    }

    static _readHeadersToMemory(filePath){
        // Read headers from given block file into headerData
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.read(descriptor, {position: 0, buffer: Buffer.alloc(25), length: 25}, (err, bytesRead, data) =>{
                        if (err){
                            fs.close(descriptor, e =>{
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            let blockFolderPath = path.dirname(filePath);
                            // Must declare each key separately due to Javascript's silly syntax rules, which don't allow dots in a key definition
                            blockAccess.headerData[blockFolderPath] = {};
                            blockAccess.headerData[blockFolderPath][blockAccess.BLOCKFULLHEADER] = Number(data.readInt8(0));
                            blockAccess.headerData[blockFolderPath][blockAccess.ENTRYCOUNTHEADER] = Number(data.readBigInt64BE(1));
                            blockAccess.headerData[blockFolderPath][blockAccess.NEXTFREEHEADER] = Number(data.readBigInt64BE(9));
                            blockAccess.headerData[blockFolderPath][blockAccess.MIDDLEHEADER] = Number(data.readBigInt64BE(17));
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

function bigIntToBuffer(bigInt){
    let buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(bigInt);
    return buffer;
}

function intToBuffer(int){
    let buffer = Buffer.alloc(1);
    buffer.writeInt8(int);
    return buffer;
}
module.exports = blockAccess;