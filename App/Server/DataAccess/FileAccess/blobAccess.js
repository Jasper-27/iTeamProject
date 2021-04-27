/*
Class for searching and modifying blob files.
Blob files are used to store large amounts of immutable data, profile pictures in this case

File allocates space in 128 byte "chunks", data will usually require many chunks
File headers point to the next free chunk, and the first bytes of a free chunk in a contiguous area of free chunks will contain the size of the free area and address of the next free chunk

Headers:
Next free chunk (8 bytes)|Total chunks used (8 bytes)
- Total chunks used still includes chunks that have been deallocated

Free chunk format (only first free chunk in a free area):
Area is allocated?* (1 byte)|Number of free chunks in area (8 bytes)|First chunk address of next free area (8 bytes)
    *Contains 1 if deallocated

Entry format:
Area is allocated?* (1 byte)|Number of chunks allocated (8 bytes)|Actual length of data (8 bytes)|data (variable length)
    *Contains 2 if allocated
Blob files are not designed to be searchable, as they are just large pools of space where other classes can store their data- it is up to the classes to remember where in the blob file they put it
*/

const fs = require('fs');
const { PassThrough } = require('stream');

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

    static getReadableStream(filePath, position){
        // Return a stream to read the data in the entry at the given position
        return new Promise((resolve, reject) => {
            // First get the amount of data to read
            fs.open(filePath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.read(descriptor, {position: position + 9, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                        if (err){
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            let dataLength = Number(data.readBigInt64BE());
                            let stream = fs.createReadStream(filePath, {fd: descriptor, start: position + 17, end: position + dataLength - 1});
                            resolve(stream);
                        }
                    });
                }
            });
        });
    }

    static getWritableStream(filePath, position){
        // Set up a writable stream to write to the file
        return new Promise((resolve, reject) => {
            // First get the maximum size of the allocated space so we can stop the stream if it tries to write more than allowed
            fs.open(filePath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.read(descriptor, {position: position + 1, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                        if (err){
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            let maxLength = Number(data.readBigInt64BE()) * 128;
                            let stream = fs.createWriteStream(filePath, {start: position + 17});
                            // Create a PassThrough stream to monitor the data to close the stream if too much data is sent
                            let monitorStream = PassThrough();
                            // Create totalLifetimeBytesWritten attribute of monitorStream to record total bytes sent through stream
                            monitorStream.totalLifetimeBytesWritten = 0;
                            monitorStream.on("data", chunk => {
                                monitorStream.totalLifetimeBytesWritten += chunk.length;
                                if (maxLength <= monitorStream.totalLifetimeBytesWritten){
                                    // Producer attempted to write too much data, so close the stream
                                    monitorStream.close();
                                }
                            });
                            // Listen on stream close to update length field in blob
                            monitorStream.on("close", () => {
                                let lengthWritten = Buffer.alloc(8);
                                lengthWritten.writeBigInt64BE(BigInt(monitorStream.totalLifetimeBytesWritten));
                                fs.write(descriptor, lengthWritten, 0, 8, position + 9, (err) => {
                                    stream.end();
                                    fs.close(descriptor, e => {
                                        if (e) throw e;
                                        else if (err) throw err;
                                    });
                                });
                            });
                            // Connect monitorStream to stream
                            monitorStream.pipe(stream);
                            resolve(monitorStream);
                        }
                    });
                }
            });
        });
    }

    static allocate(filePath, amount){
        // Create an entry with enough chunks to hold given amount, and return the start position of the entry (to create new entries this can be used followed by writeToEntry)
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    // Calculate the number of 128 byte chunks needed to store the data and its metadata
                    let chunksNeeded = Math.ceil((amount + 17) / 128);
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
                                    freeAreaSize = Number(data.readBigInt64BE(1));
                                    let thisFreeArea = nextFreeArea;
                                    nextFreeArea = Number(data.readBigInt64BE(9));
                                    if (freeAreaSize == chunksNeeded){
                                        // We have found a free area of exactly the right size
                                        // Update nextFreeArea pointer to point to next free area
                                        let rawBytes = Buffer.alloc(17);
                                        rawBytes.writeBigInt64BE(BigInt(nextFreeArea), 1);
                                        rawBytes.writeBigInt64BE(0n, 9);
                                        fs.write(descriptor, rawBytes, 1, 8, freeAreaPointerAddr, err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else reject(err);
                                                });
                                            }
                                            else{
                                                // Now update the newly allocated area with the correct details
                                                rawBytes.writeInt8(2);  // Set first byte to 2 to show that this space is allocated
                                                rawBytes.writeBigInt64BE(BigInt(chunksNeeded), 1);
                                                rawBytes.writeBigInt64BE(0n, 9);  // Set actual bytes used to 0 as the space has just been allocated but nothing has been written yet
                                                fs.write(descriptor, rawBytes, 0, 17, thisFreeArea, err => {
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
                                        let newAreaDetails = Buffer.alloc(17);
                                        newAreaDetails.writeBigInt64BE(BigInt(freeAreaSize - chunksNeeded), 1);
                                        newAreaDetails.writeBigInt64BE(BigInt(nextFreeArea), 9);
                                        fs.write(descriptor, newAreaDetails, 0, 17, newFreeArea, err => {
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
                                                        let allocatedDetailsRaw = Buffer.alloc(17);
                                                        allocatedDetailsRaw.writeInt8(2);  // Set first byte to 2 to show that chunk is allocated
                                                        allocatedDetailsRaw.writeBigInt64BE(BigInt(chunksNeeded), 1);
                                                        allocatedDetailsRaw.writeBigInt64BE(0n, 9);
                                                        fs.write(descriptor, allocatedDetailsRaw, 0, 17, thisFreeArea, err => {
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
                                            let rawBytes = Buffer.alloc(17);
                                            rawBytes.writeInt8(2);  // Set first byte to 2 to show that space is allocated
                                            rawBytes.writeBigInt64BE(BigInt(chunksNeeded), 1);
                                            rawBytes.writeBigInt64BE(0n, 9);  // Set actual bytes used to 0 as the space has just been allocated but nothing has been written yet
                                            fs.write(descriptor, rawBytes, 0, 17, newSpaceAddress, err => {
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
                                            freeAreaPointerAddr = thisFreeArea + 9;
                                            fs.read(descriptor, {position: nextFreeArea, length: 17, buffer: Buffer.alloc(17)}, findFreeArea);
                                        }
                                    }
                                }
                            };
                            if (nextFreeArea === 0){
                                // There isn't another free area, so we need to write to the end of the file
                                let newSpaceAddress = 16 + (chunksUsed * 128)  // End of file = space used by headers + space used by all chunks
                                // Write the size of the new free area
                                let rawBytes = Buffer.alloc(17);
                                rawBytes.writeInt8(2);
                                rawBytes.writeBigInt64BE(BigInt(chunksNeeded), 1);
                                rawBytes.writeBigInt64BE(0n, 9);
                                fs.write(descriptor, rawBytes, 0, 17, newSpaceAddress, err => {
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
                                fs.read(descriptor, {position: nextFreeArea, length: 17, buffer: Buffer.alloc(17)}, findFreeArea);
                            }
                        }
                        
                    });
                }
            });
            
        });
    }

    static deallocate(filePath, position){
        // Deallocate the entry at the given position
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.read(descriptor, {position: 0, buffer: Buffer.alloc(8), length: 8}, (err, bytesRead, data) => {
                        if (err){
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            let nextFreeArea = data.readBigInt64BE();
                            // Read details of the area to be deallocated
                            fs.read(descriptor, {position: position, buffer: Buffer.alloc(17), length: 17}, (err, bytesRead, data) => {
                                if (err){
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else reject(err);
                                    });
                                }
                                else{
                                    let freedAreaSize = Number(data.readBigInt64BE(1));
                                    let writeChunkDetails = () => {
                                        // Write the details of the new space to its first 17 bytes and finish
                                        let detailsRaw = Buffer.alloc(17);
                                        detailsRaw.writeInt8(1);  // Set first byte to 1 to show space is deallocated
                                        detailsRaw.writeBigInt64BE(BigInt(freedAreaSize), 1);  // Write size of newly freed area to bytes 1 - 9
                                        detailsRaw.writeBigInt64BE(BigInt(nextFreeArea), 9);  // Write address of next free area to bytes 9 - 17
                                        fs.write(descriptor, detailsRaw, 0, 17, position, err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else reject(err);
                                                });
                                            }
                                            else{
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else resolve(true);
                                                });
                                            }
                                        });
                                    };
                                    // Find out if next area is also free
                                    fs.read(descriptor, {position: position + (freedAreaSize * 128), length: 17, buffer: Buffer.alloc(17)}, (err, bytesRead, data) => {
                                        if (err){
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else reject(err);
                                            });
                                        }
                                        else{
                                            if (data.readInt8(0) == 1){
                                                // The next space is also deallocated so merge the newly freed one with it
                                                nextFreeArea = data.readBigInt64BE(9);
                                                let nextFreeAreaSize = Number(data.readBigInt64BE(1));
                                                // Find the nextFree pointer that points to this area and update it with the position of the newly freed block
                                                let pointerAddress = 0;
                                                let findPointer = (err, bytesRead, data) => {
                                                    if (err){
                                                        fs.close(descriptor, e => {
                                                            if (e) reject(e);
                                                            else reject(err);
                                                        });
                                                    }
                                                    else{
                                                        if (data.readBigInt64BE() == position + (freedAreaSize * 128)){
                                                            // Update the pointer to point to newly freed space instead
                                                            let rawBytes = Buffer.alloc(8);
                                                            rawBytes.writeBigInt64BE(BigInt(position));
                                                            fs.write(descriptor, rawBytes, 0, 8, pointerAddress, err => {
                                                                if (err){
                                                                    fs.close(descriptor, e => {
                                                                        if (e) reject(e);
                                                                        else reject(err);
                                                                    });
                                                                }
                                                                else{
                                                                    freedAreaSize += nextFreeAreaSize;  // Increase size field of newly freed area as it now also includes the free area following it
                                                                    writeChunkDetails();
                                                                }
                                                            });
                                                        }
                                                        else{
                                                            pointerAddress = Number(data.readBigInt64BE()) + 1;
                                                            fs.read(descriptor, {position: pointerAddress, length: 8, buffer: Buffer.alloc(8)}, findPointer);
                                                        }
                                                    }
                                                };
                                                fs.read(descriptor, {position: 0, length: 8, buffer: Buffer.alloc(8)}, findPointer);
                                                
                                            }
                                            else{
                                                // Write newly freed position to nextFree header
                                                let positionRaw = Buffer.alloc(8);
                                                positionRaw.writeBigInt64BE(BigInt(position));
                                                fs.write(descriptor, positionRaw, 0, 8, 0, err => {
                                                    if (err){
                                                        fs.close(descriptor, e => {
                                                            if (e) reject(e);
                                                            else reject(err);
                                                        });
                                                    }
                                                    else{
                                                        // Finally write the correct details to the newly deallocated space
                                                        writeChunkDetails();
                                                    }
                                                });
                                            }
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
    }
}
module.exports = blobAccess;