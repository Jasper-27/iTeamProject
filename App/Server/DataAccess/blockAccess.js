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

const blockSize = 1000;  // The number of entries per block

class blockAccess{
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
                            fs.open(blockPath, "w", err => {
                                if (err) reject(err);
                                else{
                                    let lastTimestamp;
                                    // Write headers to the file
                                    // This is done as a promise to allow us to iteratively chain .then()s for adding each entry
                                    let writeHeaders = new Promise((resolveHeaders, rejectHeaders) => {
                                        let headers = Buffer.alloc(25);
                                        headers.writeInt8(0);  // 0 means block is not full
                                        headers.writeBigInt64BE(0n);  // Entry count
                                        headers.writeBigInt64BE(25n);  // Next free location is at byte 25, after the headers
                                        headers.writeBigInt64BE(0n);  // There are no entries yet so there cannot be a middle entry
                                        resolveHeaders();
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

    static async writeEntryToBlock(blockPath, entryTimestamp, entryData){
        // Write an entry to the block (this does not handle updating the index)
        return new Promise((resolve, reject) => {
            // Create entry to be written
            let entryLength = 16 + entryData.length;  // 16 for length and timestamp fields
            let entry = Buffer.concat([bigIntToBuffer(BigInt(entryLength)), bigIntToBuffer(BigInt(entryTimestamp)), entryData]);
            fs.open(blockPath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    // Read entry count, next free, and middle entry headers
                    fs.read(descriptor, {length: 24, buffer: Buffer.alloc(24), position: 1}, (err, bytesRead, data) => {
                        let entryCount = data.readBigInt64BE(0);
                        let nextFreePosition = data.readBigInt64BE(8);
                        let middleEntryPosition = data.readBigInt64BE(16);
                        // Write the new entry
                        fs.write(descriptor, entry, 0, entryLength, nextFreePosition, err => {
                            if (err) reject(err);
                            else{
                                // Create function for modifying the headers (needs to be defined up here as it is needed in two places)
                                let updateHeaders = () => {
                                    let blockIsFull = 0;
                                    if (entryCount === blockSize) blockIsFull = 1;
                                    let headers = Buffer.concat([
                                        intToBuffer(blockIsFull),
                                        bigIntToBuffer(BigInt(entryCount)),
                                        bigIntToBuffer(BigInt(nextFreePosition)),
                                        bigIntToBuffer(BigInt(middleEntryPosition))
                                    ]);
                                    fs.write(descriptor, headers, 0, 25, 0, (err) => {
                                        if (err) reject(err);
                                        // The item and headers have been written, so we are done
                                        else resolve(true);
                                    });
                                }
                                // Update the headers
                                nextFreePosition += BigInt(entryLength);
                                entryCount++;
                                // The middle entry only needs to be updated on every other addition
                                if (entryCount === 1){
                                    // This is the first entry
                                    middleEntryPosition = 25;
                                }
                                else if(entryCount % 2n === 0){
                                    // Change middle entry only when entryCount is even
                                    fs.read(descriptor, {position:middleEntryPosition, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
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
                    });
                }
            })
            
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