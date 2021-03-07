/*
Class for searching and modifying the binary search trees used for storing user accounts
Each account is a "node" in the tree, and can have up to two child nodes

The first 8 bytes of the file contain the length header, which contains the number of nodes in the tree

Nodes have the following format (| symbols not included in file, just here to make easier to read)
Username (32 bytes)|Numerical value for username (sum of all character codes)(8 bytes)|Left child node position (8 bytes)|Right child node position (8 bytes)|First name (32 bytes)|Last name (32 bytes)|Password (60 bytes)|Profile picture position (8 bytes)*

All these fields are fixed length (as this allows values to be changed without the node needing to be moved) and any values that do not use the full length will be padded with 0s or the unicode padding char
* The "profile picture position" field holds the position of the profile picture entry in a different file.  As if it was stored in this file the node would have to be moved whenever the user wants to change their picture

*/

const fs = require('fs');

const idealBufferSize = 348;  // The number of nodes that searchTree should try to read from the file at a time

class treeAccess {

    static lengthHeader = {};  // Format: {<filePath>: <number of nodes>}

    static searchTree(filePath, username){
        // Return a promise containing the position and data of the node with the given value or, if it does not exist, the position of what would be the parent node if it did exist.  Also provide info as to whether this is the actual node or the parent
        // Format: {fileEmpty: <true|false> (if there are no nodes in file, all other fields will be left blank), nodeExists: <true|false>, position: <position in file> (if nodeExists = true this will be the first byte of the actual node, if false it will be the first byte of what would be the parent node), data: <buffer containing node> (will contain parent node if nodeExists=false)}
        return new Promise((resolve, reject) => {
            let returnData = {fileEmpty: false, nodeExists: null, position: null, data: null};
            fs.open(filePath, "r", async (err, descriptor) => {
                if (err) reject(err);
                else{
                    if (typeof treeAccess.lengthHeader[filePath] != "number"){
                        // We do not yet have the length header in memory so must read it from file
                        try{
                            await treeAccess._readHeadersToMemory(filePath);
                        }
                        catch(e){
                            reject(e);
                            return;
                        }
                    }
                    if (treeAccess.lengthHeader[filePath] == 0){
                        // There are no nodes in the tree
                        returnData.fileEmpty = true;
                        resolve(returnData);
                    }
                    else{
                        // Define variables for use in searching
                        let usernameValue = treeAccess.calculateUsernameValue(username);
                        let currentPos = 8;
                        let bufferStartPos, bufferEndPos;

                        // Define function for searching tree
                        let search = (err, bytesRead, data) => {
                            if (err) reject(err);
                            else{
                                while (bufferStartPos <= currentPos && currentPos <= bufferEndPos){
                                    let positionWithinBuffer = Number(currentPos) - bufferStartPos;
                                    // Compare value rather than username first as comparing numbers is faster than comparing strings
                                    let nodeValue = data.readBigInt64BE(positionWithinBuffer + 32);
                                    if (nodeValue == usernameValue){
                                        // Multiple usernames could have the same value, so we must now also comapre the name itself
                                        let nodeUsername = treeAccess.bufferToString(data.subarray(positionWithinBuffer, positionWithinBuffer + 32));
                                        if (nodeUsername == username){
                                            // This is the node we are looking for
                                            returnData["nodeExists"] = true;
                                            returnData["position"] = Number(currentPos);
                                            // Must copy to a new buffer rather than just using Buffer.subarray, as subarray uses references to the orginial buffer- which will mean the garbage collector is unable to deallocate the entire buffer potentially causing a memory leak
                                            returnData["data"] = Buffer.from(data.subarray(positionWithinBuffer, positionWithinBuffer + 188));
                                            resolve(returnData);
                                            return;
                                        }
                                    }
                                    // Not the node we are looking for, so move on to one of its children (if it has any)
                                    if (usernameValue <= nodeValue){
                                        // If usernameValue is less than or equal to this node's value then we move to its left child node
                                        let childPos = data.readBigInt64BE(positionWithinBuffer + 40);
                                        if (childPos == 0){  // 0 represents a null pointer
                                            // This node does not have a left child, so the node we are looking for does not exist
                                            returnData["nodeExists"] = false;
                                            returnData["position"] = Number(currentPos);
                                            returnData["data"] = Buffer.from(data.subarray(positionWithinBuffer, positionWithinBuffer + 188));
                                            resolve(returnData);
                                            return;
                                        }
                                        else{
                                            // Continue the search from the child node
                                            currentPos = childPos;
                                        }
                                    }
                                    else{
                                        // If usernameValue is greater than this node's value then we move to the right child node
                                        let childPos = data.readBigInt64BE(positionWithinBuffer + 48);
                                        if (childPos == 0){
                                            // This node does not have a right child, so the node we are looking for does not exist
                                            returnData["nodeExists"] = false;
                                            returnData["position"] = Number(currentPos);
                                            returnData["data"] = Buffer.from(data.subarray(positionWithinBuffer, positionWithinBuffer + 188));
                                            resolve(returnData);
                                            return;
                                        }
                                        else{
                                            currentPos = childPos;
                                        }
                                    }
                                }
                                // The node to be searched is outside the current buffer, so must refill the buffer
                                let bufferDetails = treeAccess._calculateBufferDetails(treeAccess.lengthHeader[filePath], Number(currentPos));
                                bufferStartPos = bufferDetails[0];
                                bufferEndPos = bufferDetails[1];
                                fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, search); 
                            }
                        };
                        
                        // Start search from root node
                        let bufferDetails = treeAccess._calculateBufferDetails(treeAccess.lengthHeader[filePath], 8);
                        bufferStartPos = bufferDetails[0];
                        bufferEndPos = bufferDetails[1];
                        fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, search);
                    }
                }
            });
        });
    }

    static addNode(filePath, username, nodeData){
        // Add the given node to the file
        // nodeData should be a buffer containing first name, last name, password, profile picture
        return new Promise(async (resolve, reject) => {
            // First find the parent node
            let parentData;
            try{
                parentData = await treeAccess.searchTree(filePath, username);
            }
            catch(err){
                reject(err);
                return;
            }

            // Define function to be used as promise for appending a new node
            let appendNode = (resolveAppend, rejectAppend) => {
                // Promise should contain start position of new node
                fs.open(filePath, "r+", (err, descriptor) => {
                    if (err) rejectAppend(err);
                    else{
                        let usernameBuffer = treeAccess.stringToBuffer(username, 32);
                        let newNode = Buffer.alloc(188);
                        // Copy usernameBuffer into newNode
                        usernameBuffer.copy(newNode, 0, 0);
                        // Copy username value into newNode
                        newNode.writeBigInt64BE(BigInt(treeAccess.calculateUsernameValue(username)), 32);
                        // Child node pointers will be 0
                        newNode.writeBigInt64BE(0n, 40);
                        newNode.writeBigInt64BE(0n, 48);
                        // Copy nodeData into newNode at byte 56
                        nodeData.copy(newNode, 56, 0);
                        // Write newNode to end of file
                        fs.write(descriptor, newNode, 0, 188, 8 + treeAccess.lengthHeader[filePath] * 188, err => {
                            if (err) rejectAppend(err);
                            else resolveAppend(8 + treeAccess.lengthHeader[filePath] * 188);
                        });
                    }
                });
            };

            // Define function to update header
            let incrementHeader = () => {
                fs.open(filePath, "r+", (err, descriptor) => {
                    let lengthHeader = treeAccess.lengthHeader[filePath] + 1;
                    let headerBuffer = Buffer.alloc(8);
                    headerBuffer.writeBigInt64BE(BigInt(lengthHeader));
                    fs.write(descriptor, headerBuffer, 0, 8, 0, err => {
                        if (err) reject(err);
                        else{
                            // Update the in-memory version
                            treeAccess.lengthHeader[filePath] = lengthHeader;
                            resolve(true);
                        }
                    });
                });
            }

            try{
                if (parentData["fileEmpty"] === false){
                    if (parentData["nodeExists"] === true){
                        reject("Node with that username already exists");
                        return;
                    }
                    else if (parentData["nodeExists"] === false){
                        // Write the new node to the file, then update the parent's correct child pointer to point to it
                        let newNodePos = await new Promise(appendNode);  // Use a promise so we can await it
                        // Now update the parent node's child pointers and the length header
                        await new Promise((resolveUpdateParent, rejectUpdateParent) => {
                            // Must get the value of the parent so we can decide which side the child should go
                            let parentValue = parentData["data"].readBigInt64BE(32);
                            let usernameValue = treeAccess.calculateUsernameValue(username);
                            let pointerPos;
                            if (usernameValue <= parentValue){
                                // Smaller than or equal to parent, so put on left
                                pointerPos = parentData["position"] + 40;
                            }
                            else{
                                // Larger, put on right
                                pointerPos = parentData["position"] + 48;
                            }
                            fs.open(filePath, "r+", (err, descriptor) => {
                                if (err) reject(err);
                                else{
                                    let newPointer = Buffer.alloc(8);
                                    newPointer.writeBigInt64BE(BigInt(newNodePos));
                                    fs.write(descriptor, newPointer, 0, 8, pointerPos, err => {
                                        if (err) rejectUpdateParent(err);
                                        else resolveUpdateParent(pointerPos);
                                    });
                                }
                            });
                        });
                        incrementHeader();
                    }
                }
                else if (parentData["fileEmpty"] === true){
                    // There are no existing nodes, so we just have to append the new one and increment the length header
                    await new Promise(appendNode);
                    incrementHeader();
                }
            }
            catch(e){
                reject(e);
            }
        });
    }

    static calculateUsernameValue(username){
        // Sum the unicode character codes for the username
        let total = 0;
        for (let i = 0; i < username.length; i++){
            total += username.charCodeAt(i);
        }
        return total;
    }

    static bufferToString(buffer){
        // Convert a Buffer array to a string (removing any padding)
        let outputStr = "";
        for (let i of buffer.values()){
            // Ignore padding chars
            if (i != 128){
                outputStr += String.fromCharCode(i);
            }
        }
        return outputStr;
    }

    static stringToBuffer(str, bufferLength){
        // Convert string to a buffer of specified length, left padding or cutting if necessary
        let stringBuffer = Buffer.from(str);
        let paddingNeeded = bufferLength - stringBuffer.length;
        if (0 < paddingNeeded){
            // Create buffer containing unicode padding characters
            let padding = Buffer.alloc(paddingNeeded, 128);
            return Buffer.concat([padding, stringBuffer]);
        }
        else if (bufferLength < stringBuffer.length){
            // String is too big so cut the end off
            return Buffer.from(stringBuffer.subarray(0, bufferLength));  // .from to avoid memory leak
        }
        return stringBuffer;
        
    }

    static _calculateBufferDetails(treeLength, startPoint){
        // treeLength = total number of entries, startPoint = the start position of the first entry in the buffer
        let bufferEnd = Math.min(startPoint + (idealBufferSize * 188), 8 + (treeLength * 188));
        let bufferSize = bufferEnd - startPoint;
        return [startPoint, bufferEnd, bufferSize];
    }

    static _readHeadersToMemory(filePath){
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.read(descriptor, {position: 0, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                        if (err) reject(err);
                        else{
                            treeAccess.lengthHeader[filePath] = Number(data.readBigInt64BE(0));
                            resolve(true);
                        }
                    });
                }
            });
        });
    }
}

let val;
/*
treeAccess.searchTree(__dirname + "/../data/accounts.wat", "Alex").then(value => {
    val = value;
    console.log(value);
}, reason => {
    val = reason;
console.log(reason)});
*/

treeAccess.addNode(__dirname + "/../data/accounts.wat", "AnotherName", Buffer.alloc(132)).then(value => {
    console.log(value);
}).catch(reason => {
    console.log(reason);
});