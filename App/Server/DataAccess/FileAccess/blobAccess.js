/*
Class for searching and modifying blob files.
Blob files are used to store large amounts of immutable data, profile pictures in this case

File allocates space in 128 byte "chunks", data will usually require many chunks
File headers point to the next free chunk, and the first bytes of a free chunk in a contiguous area of free chunks will contain the size of the free area and address of the next free chunk

Headers:
Next free chunk (8 bytes)|Total chunks used (8 bytes)
- Total chunks used still includes chunks that have been deallocated

Free chunk format (only first free chunk in a free area):
Number of free chunks in area (8 bytes)|First chunk address of next free area (8 bytes)

Entry format:
Number of chunks allocated (8 bytes)|Actual length of data (8 bytes)|data (variable length)

Blob files are not designed to be searchable, as they are just large pools of space where other classes can store their data- it is up to the classes to remember where in the blob file they put it
*/

const fs = require('fs');

class blobAccess{

    static createBlob(filePath, overwrite=false){  // If there is already a blob file at the given path, and overwrite is true the file will be recreated
        // WARNING:  This method is not asynchronous
        let fileMustBeCreated = overwrite;
        try{
            // Check that we have both read and write access to the file
            fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
        }
        catch{
            fileMustBeCreated = true;
        }
        if (fileMustBeCreated === true){
            // Create directory
            try{
                // If the path given directly in a root directory, this will throw an error.  But the error won't matter as the directory does not need to be created anyway
                fs.mkdirSync(path.dirname(filePath), {recursive: true});
            }
            catch{}
            // Create the file with the headers containing 0
            fs.writeFileSync(filePath, Buffer.alloc(16));
        }
    }

    static getData(filePath, position){
        // Return the data in the entry at the given position
        return new Promise((resolve, reject) => {
            
        });
    }

    static writeToEntry(filePath, position, data){
        // Overwrite the data in the entry at the given position
    }

    static allocate(filePath, amount){
        // Create an entry with enough chunks to hold given amount, and return the start position of the entry (to create new entries this can be used followed by writeToEntry)
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    // Calculate the number of 128 byte chunks needed to store the data and its metadata
                    let chunksNeeded = Math.ceil((amount + 16) / 128);
                    // Read headers
                    fs.read(descriptor, {position: 0, length: 16, buffer: Buffer.alloc(16)}, (err, bytesRead, data) => {
                        if (err){
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            // A free area contains one or more free chunks
                            let freeAreaPointerAddr = 0;  // The address of the nextFreeArea pointer itself
                            let nextFreeArea = Number(data.readBigInt64BE(0));
                            let chunksUsed = Number(data.readBigInt64BE(8));
                            let freeAreaSize;  // Size of the current free area in chunks
                            // Search the chain of free areas until we either find one big enough or run out
                            let findFreeArea = (err, bytesRead, data) => {
                                if (err){
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else reject(err);
                                    });
                                }
                                else{
                                    freeAreaSize = Number(data.readBigInt64BE(0));
                                    let thisFreeArea = nextFreeArea;
                                    nextFreeArea = Number(data.readBigInt64BE(8));
                                    if (freeAreaSize == chunksNeeded){
                                        // We have found a free area of exactly the right size
                                        // Update nextFreeArea pointer to point to next free area
                                        let rawBytes = Buffer.alloc(16);
                                        rawBytes.writeBigInt64BE(BigInt(nextFreeArea));
                                        rawBytes.writeBigInt64BE(0n, 8);
                                        fs.write(descriptor, rawBytes, 0, 8, freeAreaPointerAddr, err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else reject(err);
                                                });
                                            }
                                            else{
                                                // Now update the newly allocated area with the correct details
                                                rawBytes.writeBigInt64BE(BigInt(chunksNeeded));
                                                fs.write(descriptor, rawBytes, 0, 16, thisFreeArea, err => {
                                                    if (err){
                                                        fs.close(descriptor, e => {
                                                            if (e) reject(e);
                                                            else reject(err);
                                                        });
                                                    }
                                                    else{
                                                        // Return the allocated address
                                                        fs.close(descriptor, e => {
                                                            if (e) reject(e);
                                                            else resolve(thisFreeArea);
                                                        });
                                                    }
                                                });
                                            }
                                        });
                                    }
                                    else if (chunksNeeded < freeAreaSize){
                                        // Separate the extra chunks in this free area into a new free area
                                        let newFreeArea = thisFreeArea + (chunksNeeded * 128);
                                        let newAreaDetails = Buffer.alloc(16);
                                        newAreaDetails.writeBigInt64BE(BigInt(freeAreaSize - chunksNeeded));
                                        newAreaDetails.writeBigInt64BE(BigInt(nextFreeArea), 8);
                                        fs.write(descriptor, newAreaDetails, 0, 16, newFreeArea, err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else reject(err);
                                                });
                                            }
                                            else{
                                                // Update nextFreeArea pointer to point to this new free area
                                                let newFreeAreaRaw = Buffer.alloc(8);
                                                newFreeAreaRaw.writeBigInt64BE(BigInt(newFreeArea));
                                                fs.write(descriptor, newFreeAreaRaw, 0, 8, freeAreaPointerAddr, err => {
                                                    if (err){
                                                        fs.close(descriptor, e => {
                                                            if (e) reject(e);
                                                            else reject(err);
                                                        });
                                                    }
                                                    else{
                                                        // Update the newly allocated area with the correct size
                                                        let allocatedDetailsRaw = Buffer.alloc(16);
                                                        allocatedDetailsRaw.writeBigInt64BE(BigInt(chunksNeeded));
                                                        allocatedDetailsRaw.writeBigInt64BE(0n, 8);
                                                        fs.write(descriptor, allocatedDetailsRaw, 0, 16, thisFreeArea, err => {
                                                            if (err){
                                                                if (e) reject(e);
                                                                else reject(err);
                                                            }
                                                            else{
                                                                // Return the address of the newly allocated area
                                                                fs.close(descriptor, e => {
                                                                    if (e) reject(e);
                                                                    else resolve(thisFreeArea);
                                                                });
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                        });
                                    }
                                    else{
                                        // Try the next free area (if there is one)
                                        if (nextFreeArea === 0){
                                            // There isn't another free area, so we need to write to the end of the file
                                            let newSpaceAddress = 16 + (chunksUsed * 128)  // End of file = space used by headers + space used by all chunks
                                            // Write the size of the new free area
                                            let rawBytes = Buffer.alloc(16);
                                            rawBytes.writeBigInt64BE(BigInt(chunksNeeded));
                                            rawBytes.writeBigInt64BE(0n, 8);
                                            fs.write(descriptor, rawBytes, 0, 16, newSpaceAddress, err => {
                                                if (err){
                                                    fs.close(descriptor, e => {
                                                        if (e) reject(e);
                                                        else reject(err);
                                                    });
                                                }
                                                else{
                                                    // Now update the chunksUsed header
                                                    rawBytes.writeBigInt64BE(BigInt(chunksUsed + chunksNeeded));
                                                    fs.write(descriptor, rawBytes, 0, 8, 8, err => {
                                                        if (err){
                                                            fs.close(descriptor, e => {
                                                                if (e) reject(e);
                                                                else reject(err);
                                                            })
                                                        }
                                                        else{
                                                            // Return the address of the newly allocated space
                                                            fs.close(descriptor, e => {
                                                                if (e) reject(e);
                                                                else resolve(newSpaceAddress);
                                                            });
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                        else{
                                            // Try next free area
                                            freeAreaPointerAddr = thisFreeArea + 8;
                                            fs.read(descriptor, {position: nextFreeArea, length: 16, buffer: Buffer.alloc(16)}, findFreeArea);
                                        }
                                    }
                                }
                            };
                            if (nextFreeArea === 0){
                                // There isn't another free area, so we need to write to the end of the file
                                let newSpaceAddress = 16 + (chunksUsed * 128)  // End of file = space used by headers + space used by all chunks
                                // Write the size of the new free area
                                let rawBytes = Buffer.alloc(16);
                                rawBytes.writeBigInt64BE(BigInt(chunksNeeded));
                                rawBytes.writeBigInt64BE(0n, 8);
                                fs.write(descriptor, rawBytes, 0, 16, newSpaceAddress, err => {
                                    if (err){
                                        fs.close(descriptor, e => {
                                            if (e) reject(e);
                                            else reject(err);
                                        });
                                    }
                                    else{
                                        // Now update the chunksUsed header
                                        rawBytes.writeBigInt64BE(BigInt(chunksUsed + chunksNeeded));
                                        fs.write(descriptor, rawBytes, 0, 8, 8, err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else reject(err);
                                                })
                                            }
                                            else{
                                                // Return the address of the newly allocated space
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else resolve(newSpaceAddress);
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                            else{
                                fs.read(descriptor, {position: nextFreeArea, length: 16, buffer: Buffer.alloc(16)}, findFreeArea);
                            }
                        }
                        
                    });
                }
            });
            
        });
    }

    static deallocate(filePath, position){
        // Deallocate the entry at the given position
    }
}
