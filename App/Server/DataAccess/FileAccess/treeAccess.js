/*
Class for searching and modifying the binary search trees used for storing user accounts
Each account is a "node" in the tree, and can have up to two child nodes

Headers:
- The first 8 bytes of the file contain the length header, which contains the number of nodes in the tree (including ones that have been deleted)
- The second 8 bytes contain a pointer to the next free space
- The third 8 bytes contain a pointer to the root node of the tree

The "next free space" header is used to allow new nodes to be written to the space previously occupied by deleted nodes.  This helps to avoid growing the file unnecessarily.
-Deleting:-
- When a node is deleted, its location in the file is written to the header
- The previous value of the header is written to the first 8 bytes of the newly freed space

-Adding nodes:-
- If the header is 0, the system knows there is no unused space so must add the new node to the end of the file
- Otherwise it instead writes the new node to the location specified in the header
- Before doing this it copies the value in the first 8 bytes of the free space to the header, so the header points to the next free space (if there is one)

Nodes have the following format (| symbols not included in file, just here to make easier to read)
Username (32 bytes)|Numerical value for username (sum of all character codes)(8 bytes)|Left child node position (8 bytes)|Right child node position (8 bytes)|First name (32 bytes)|Last name (32 bytes)|Password (60 bytes)|Profile picture position (8 bytes)*

All these fields are fixed length (as this allows values to be changed without the node needing to be moved) and any values that do not use the full length will be padded with 0s or the unicode padding char
* The "profile picture position" field holds the position of the profile picture entry in a different file.  As if it was stored in this file the node would have to be moved whenever the user wants to change their picture

*/

const fs = require('fs');
const path = require('path');

const idealBufferSize = 348;  // The number of nodes that searchTree should try to read from the file at a time

class treeAccess {

    static headers = {};  // Format: {<filePath>: {length: <number of nodes>, nextFree: <position of next free space>, root: <position of root node>}

    static createTree(filePath, overwrite=false){  // If there is already a file at the location and overwrite is false, it won't be overwritten
        // Create a new file at given path  (WARNING:  This method is not asycnchronous)
        let fileMustBeCreated = overwrite;
        try{
            fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
            // If there was no error, then the file exists and is accessible so we don't need to do anything unless overwite is true
        }
        catch{
            // The file does not exist or cannot be accessed, so must be created
            fileMustBeCreated = true;
        }
        if (fileMustBeCreated === true){
            // Create directory
            try{
                // If the path given directly in a root directory, this will throw an error.  But the error won't matter as the directory does not need to be created anyway
                fs.mkdirSync(path.dirname(filePath), {recursive: true});
            }
            catch{}
            // Create the file with the headers containing, except the root pointer which should point to byte 24 (where the root would be if it existed)
            fs.writeFileSync(filePath, Buffer.alloc(24));
        }
    }

    static searchTree(filePath, username, getParent=false, startPoint){  // If getParent is set to true, it will return the parent of the node we are looking for, not the node itself (useful for deletion)  // If startPoint is provided, the search will begin from that node rather than the root (useful for rearranging on deletion)
        // Return a promise containing the position and data of the node with the given value or, if it does not exist, the position of what would be the parent node if it did exist.  Also provide info as to whether this is the actual node or the parent
        // Format: {fileEmpty: <true|false> (if there are no nodes in file, all other fields will be left blank), nodeExists: <true|false>, position: <position in file> (if nodeExists = true this will be the first byte of the actual node, if false it will be the first byte of what would be the parent node), data: <buffer containing node> (will contain parent node if nodeExists=false)}
        return new Promise((resolve, reject) => {
            let returnData = {fileEmpty: false, nodeExists: null, position: null, data: null};
            fs.open(filePath, "r", async (err, descriptor) => {
                if (err) reject(err);
                else{
                    if (typeof treeAccess.headers[filePath] != "object"){
                        // We do not yet have the length header in memory so must read it from file
                        try{
                            await treeAccess._readHeadersToMemory(filePath);
                        }
                        catch(err){
                            fs.close(descriptor, e =>{
                                if (e) reject(e);
                                else reject(err);
                            });
                            return;
                        }
                    }
                    if (treeAccess.headers[filePath]["root"] == 0){
                        // There is no root node, so the tree must be empty
                        returnData.fileEmpty = true;
                        fs.close(descriptor, e => {
                            if (e) reject(e);
                            else resolve(returnData);
                        });
                    }
                    else{
                        // Define variables for use in searching
                        let usernameValue = treeAccess.calculateUsernameValue(username);
                        let currentPos;
                        let oldPos = 0;
                        let bufferStartPos, bufferEndPos;

                        // Define function for searching tree
                        let search = async (err, bytesRead, data) => {
                            if (err){
                                fs.close(descriptor, e =>{
                                    if (e) reject(e);
                                    else reject(err);
                                });
                            }
                            else{
                                while (bufferStartPos <= currentPos && BigInt(currentPos) + 188n <= bufferEndPos){  // Make sure entire node is in buffer
                                    let positionWithinBuffer = Number(currentPos) - bufferStartPos;
                                    // Compare value rather than username first as comparing numbers is faster than comparing strings
                                    let nodeValue = data.readBigInt64BE(positionWithinBuffer + 32);
                                    if (nodeValue == usernameValue){
                                        // Multiple usernames could have the same value, so we must now also compare the name itself
                                        let nodeUsername = treeAccess.bufferToString(data.subarray(positionWithinBuffer, positionWithinBuffer + 32));
                                        if (nodeUsername == username){
                                            // This is the node we are looking for
                                            if (getParent === true){
                                                // We want the parent node, not the node itself
                                                if (oldPos == 0){
                                                    // The node is the root node, so there is no parent
                                                    returnData["nodeExists"] = false;
                                                }
                                                else{
                                                    returnData["nodeExists"] = true;
                                                    returnData["position"] = Number(oldPos);
                                                    // The parent entry may not be in the buffer, so just read it from disk (checking if it is in buffer isn't worth the extra logic, as operations using getParent do not need to be particularly quick and we know this will only add a single read)
                                                    try{
                                                        returnData["data"] = await new Promise((resolveParentData, rejectParentData) => {
                                                            fs.read(descriptor, {position: Number(oldPos), length: 188, buffer: Buffer.alloc(188)}, (e, bytesRead, parentData) => {
                                                                if (e) rejectParentData(e);
                                                                else resolveParentData(parentData);
                                                            });
                                                        });
                                                    }
                                                    catch (reason){
                                                        fs.close(descriptor, e =>{
                                                            if (e) reject(e);
                                                            else reject(reason);
                                                        });
                                                        return;
                                                    }

                                                }
                                            }
                                            else{
                                                returnData["nodeExists"] = true;
                                                returnData["position"] = Number(currentPos);
                                                // Must copy to a new buffer rather than just using Buffer.subarray, as subarray uses references to the orginial buffer- which will mean the garbage collector is unable to deallocate the entire buffer potentially causing a memory leak
                                                returnData["data"] = Buffer.from(data.subarray(positionWithinBuffer, positionWithinBuffer + 188));
                                            }
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else resolve(returnData);
                                            });
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
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else resolve(returnData);
                                            });
                                            return;
                                        }
                                        else{
                                            // Continue the search from the child node
                                            oldPos = currentPos;
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
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else resolve(returnData);
                                            });
                                            return;
                                        }
                                        else{
                                            oldPos = currentPos;
                                            currentPos = childPos;
                                        }
                                    }
                                }
                                // The node to be searched is outside the current buffer, so must refill the buffer
                                let bufferDetails = treeAccess._calculateBufferDetails(treeAccess.headers[filePath]["length"], Number(currentPos));
                                bufferStartPos = bufferDetails[0];
                                bufferEndPos = bufferDetails[1];
                                fs.read(descriptor, {position: bufferStartPos, length: bufferDetails[2], buffer: Buffer.alloc(bufferDetails[2])}, search); 
                            }
                        };
                        
                        // Start search from root node (or startPoint if it has been provided)
                        if (typeof startPoint != "number") startPoint = treeAccess.headers[filePath]["root"];
                        currentPos = startPoint;
                        let bufferDetails = treeAccess._calculateBufferDetails(treeAccess.headers[filePath]["length"], startPoint);
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
                fs.open(filePath, "r+", async (err, descriptor) => {
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

                        // Write newNode to next free position
                        let nextFreePos = treeAccess.headers[filePath]["nextFree"];
                        if (nextFreePos == 0){
                            // If the next free position header points to 0, there is no more unused space between existing entries, so we must append entry to end of file
                            nextFreePos = 24 + treeAccess.headers[filePath]["length"] * 188;
                        }
                        else{
                            // The first 8 bytes of the free space will contain a pointer to the next free space, so put that pointer in the header before it is overwritten
                            let newHeader = await new Promise((resolveReadPointer, rejectReadPointer) => {
                                fs.read(descriptor, {position: nextFreePos, length: 8, buffer: Buffer.alloc(8)}, (err, bytesRead, data) => {
                                    if (err){
                                        fs.close(descriptor, e => {
                                            if (e) rejectReadPointer(e);
                                            else rejectReadPointer(err);
                                        });
                                    }
                                    else{
                                        resolveReadPointer(Number(data.readBigInt64BE()));
                                    }
                                });
                            });
                            await treeAccess.updateNextFreeHeader(filePath, newHeader);
                        }

                        fs.write(descriptor, newNode, 0, 188, nextFreePos, err => {
                            if (err){
                                fs.close(descriptor, e =>{
                                    if (e) rejectAppend(e);
                                    else rejectAppend(err);
                                });
                            }
                            else{
                                fs.close(descriptor, e => {
                                    if (e) rejectAppend(e);
                                    else resolveAppend(nextFreePos);
                                });
                            }
                        });
                    }
                });
            };

            // Define function to update length header
            let incrementHeader = (newNodePos) => {
                // Only update the length header if the new node was written to new space at the end of the file (rather than being written the space used by a previously deleted node)
                let lengthHeader = treeAccess.headers[filePath]["length"];
                if (newNodePos == 24 + (lengthHeader * 188)){
                    fs.open(filePath, "r+", (err, descriptor) => {
                        let headerBuffer = Buffer.alloc(8);
                        headerBuffer.writeBigInt64BE(BigInt(lengthHeader + 1));
                        fs.write(descriptor, headerBuffer, 0, 8, 0, err => {
                            if (err){
                                fs.close(descriptor, e =>{
                                    if (e) reject(e);
                                    else reject(err);
                                });
                            }
                            else{
                                // Update the in-memory version
                                treeAccess.headers[filePath]["length"] = lengthHeader + 1;
                                fs.close(descriptor, e => {
                                    if (e) reject(e);
                                    else resolve(true);
                                });
                            }
                        });
                    });
                }
                else{
                    resolve(true);
                }
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
                                        if (err){
                                            fs.close(descriptor, e =>{
                                                if (e) rejectUpdateParent(e);
                                                else rejectUpdateParent(err);
                                            });
                                        }
                                        else{
                                            fs.close(descriptor, e => {
                                                if (e) rejectUpdateParent(e);
                                                else resolveUpdateParent(true);
                                            });
                                        }
                                    });
                                }
                            });
                        });
                        incrementHeader(newNodePos);
                    }
                }
                else if (parentData["fileEmpty"] === true){
                    // There are no existing nodes, so we just have to add the new one, update the root pointer, and increment the length header
                    let newNodePos = await new Promise(appendNode);
                    // The new node is the root node, so update root pointer
                    fs.open(filePath, "r+", (err, descriptor) => {
                        if (err) reject(err);
                        else{
                            let newPointer = Buffer.alloc(8);
                            newPointer.writeBigInt64BE(BigInt(newNodePos));
                            fs.write(descriptor, newPointer, 0, 8, 16, err => {
                                if (err){
                                    fs.close(descriptor, e => {
                                        if (e) reject(e);
                                        else reject(err);
                                    });
                                }
                                else{
                                    treeAccess.headers[filePath]["root"] = newNodePos;
                                    incrementHeader(newNodePos);
                                }
                            });
                        }
                    });
                }
            }
            catch(e){
                reject(e);
            }
        });
    }

    static modifyNode(filePath, username, offset, newData){
        // Find the node with the given username and, if it exists, overwrite the data from the given offset
        return new Promise(async (resolve, reject) => {
            if (0 <= offset && offset < 188){
                try{
                    // Find the node
                    let nodeDetails = await treeAccess.searchTree(filePath, username);
                    // Overwrite the data
                    if (nodeDetails["fileEmpty"] === false && nodeDetails["nodeExists"] === true){
                        fs.open(filePath, "r+", (err, descriptor) => {
                            if (err) reject(err);
                            else{
                                fs.write(descriptor, newData, 0, newData.length, nodeDetails["position"] + offset, err => {
                                    if (err){
                                        fs.close(descriptor, e => {
                                            if (e) reject(e);
                                            else reject(err);
                                        });
                                    }
                                    else{
                                        resolve(true);
                                    }
                                });
                            }
                        });
                    }
                    else reject("Requested node does not exist");
                }
                catch (reason){
                    reject(reason);
                }
            }
            else{
                reject("Offset must be between 0 and 187 (inclusive)");
            }
        });
    }

    static removeNode(filePath, username){
        // Find the node with the given username and delete it if it exists
        return new Promise(async (resolve, reject) => {
            try{
                // Find the parent node
                let parentDetails = await treeAccess.searchTree(filePath, username, true);
                if (parentDetails["fileEmpty"] === false){
                    if (parentDetails["nodeExists"] === true){
                        // The parent has been found
                        let parentValue = parentDetails["data"].readBigInt64BE(32);
                        let parentLeftChild = Number(parentDetails["data"].readBigInt64BE(40));
                        let parentRightChild = Number(parentDetails["data"].readBigInt64BE(48));
                        // We need to rearrange the node to be deleted's children to link them directly to the parent node
                        // First get the node to be deleted
                        let nodeToDelete;
                        let parentChildOffset;
                        if (treeAccess.calculateUsernameValue(username) <= parentValue){
                            // If its value is smaller or equal to its parent, it will be on the left
                            parentChildOffset = 40;
                            // Just using searchTree to avoid duplicating code.  It won't really have to do much searching, as we have provided it with the position of the node we want
                            nodeToDelete = await treeAccess.searchTree(filePath, username, false, parentLeftChild);
                        }
                        else{
                            // If larger, then it is on the right
                            parentChildOffset = 48;
                            nodeToDelete = await treeAccess.searchTree(filePath, username, false, parentRightChild);
                        }
                        let nodeToDeleteLeftChild = nodeToDelete["data"].readBigInt64BE(40);
                        let nodeToDeleteRightChild = nodeToDelete["data"].readBigInt64BE(48);
                        // If the node to be deleted has only 0 or 1 children then we can simply replace the parent pointer with the child node's address
                        if (nodeToDeleteLeftChild == 0 || nodeToDeleteRightChild == 0){
                            // Replace parent node pointer to this node with this node's child pointer
                            // Can get pointer with nodeToDeleteLeftChild + nodeToDeleteRightChild
                            fs.open(filePath, "r+", (err, descriptor) => {
                                if (err) reject(err);
                                else{
                                    // If both are 0 this will give 0, if only one is 0 it will give the one that isn't 0
                                    let newPointer = Buffer.alloc(8);
                                    newPointer.writeBigInt64BE(nodeToDeleteLeftChild + nodeToDeleteRightChild);
                                    // Overwrite pointer in parent
                                    fs.write(descriptor, newPointer, 0, 8, parentDetails["position"] + parentChildOffset, err => {
                                        if (err){
                                            fs.close(descriptor, e => {
                                                if (e) reject(e);
                                                else reject(err);
                                            });
                                        }
                                        // Parent pointer now written, so we can delete the node
                                        // To allow this space to be reallocated, we point the "next free" pointer to it, and write the existing value of the pointer to the first 8 bytes
                                        let clearedSpace = Buffer.alloc(188);
                                        clearedSpace.writeBigInt64BE(BigInt(treeAccess.headers[filePath]["nextFree"]));
                                        fs.write(descriptor, clearedSpace, 0, 188, nodeToDelete["position"], async err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else reject(e);
                                                });
                                            }
                                            else{
                                                // The node has been overwritten with the existing next free pointer and 0's
                                                fs.close(descriptor, async e => {
                                                    if (e) reject(e);
                                                    else {
                                                        // Update the "next free" header before ending
                                                        await treeAccess.updateNextFreeHeader(filePath, nodeToDelete["position"]);
                                                        resolve(true);
                                                    }
                                                });
                                            }
                                        });
                                    });
                                }   
                            });
                        }
                        else{
                            // It has two children.  So use the right one (this choice is arbitrary), and use searchTree with startPos option to point next suitable leaf node on right to the left child node
                            // Find next suitable node on the right that we can attach the left subtree to
                            // Get username of left child node
                            fs.open(filePath, "r+", (err, descriptor) => {
                                if (err) reject(err);
                                else{
                                    fs.read(descriptor, {position: Number(nodeToDeleteLeftChild), length: 32, buffer: Buffer.alloc(32)}, async (err, bytesRead, data) => {
                                        // Get username of left child node
                                        let leftChildUsername = treeAccess.bufferToString(data);
                                        // Now use the username and searchTree to find the next node in the right subtree that we can attach the left subtree to
                                        let suitableNode = await treeAccess.searchTree(filePath, leftChildUsername, false, Number(nodeToDeleteRightChild));
                                        // Now add the left tree as the left child of that node
                                        let newPointer = Buffer.alloc(8);
                                        newPointer.writeBigInt64BE(nodeToDeleteLeftChild);
                                        fs.write(descriptor, newPointer, 0, 8, suitableNode["position"] + 40, err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) reject(e);
                                                    else reject(err);
                                                });
                                            }
                                            else{
                                                // Now point parent to right child
                                                newPointer.writeBigInt64BE(nodeToDeleteRightChild);
                                                fs.write(descriptor, newPointer, 0, 8, parentDetails["position"] + 48, err => {
                                                    if (err){
                                                        fs.close(descriptor, e => {
                                                            if (e) reject(e);
                                                            else reject(err);
                                                        });
                                                    }
                                                    else{
                                                        // With all necessary pointers now adjusted, the node to be deleted no longer exists in the tree.  So we can delete it from the file
                                                        // To allow the space to be reallocated, point the "next free" pointer here, and place the existing pointer in the first 8 bytes of the new free space
                                                        let clearedSpace = Buffer.alloc(188);
                                                        clearedSpace.writeBigInt64BE(BigInt(treeAccess.headers[filePath]["nextFree"]));
                                                        fs.write(descriptor, clearedSpace, 0, 188, nodeToDelete["position"], async err => {
                                                            if (err){
                                                                fs.close(descriptor, e => {
                                                                    if (e) reject(e);
                                                                    else reject(e);
                                                                });
                                                            }
                                                            else{
                                                                // The node has been overwritten with 0's
                                                                fs.close(descriptor, async e => {
                                                                    if (e) reject(e);
                                                                    else{
                                                                        // Update "next free" header to point to the newly freed space
                                                                        await treeAccess.updateNextFreeHeader(filePath, nodeToDelete["position"]);
                                                                        resolve(true);
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
                            });
                        }


                    }
                    else if (parentDetails["position"] == null){  // If nodeExists is false and position is null, it means there is no parent.
                        let oldRootPointer = treeAccess.headers[filePath]["root"];  // Must remember current root pointer for when we delete the node, as it will change
                        // There was no parent, this can only happen if the node to be deleted is the root.  In which case we already know its position
                        fs.open(filePath, "r+", async (err, descriptor) => {
                            if (err) reject(err);
                            else{
                                // Need to make one of its children the root node
                                let nodeToDelete = await treeAccess.searchTree(filePath, username);
                                let nodeToDeleteLeftChild = nodeToDelete["data"].readBigInt64BE(40);
                                let nodeToDeleteRightChild = nodeToDelete["data"].readBigInt64BE(48);
                                if (nodeToDeleteLeftChild == 0 || nodeToDeleteRightChild == 0){
                                    // If there is one child, we simply make that child the root (by updating the root pointer).  This same process also works if there are no children
                                    await new Promise((resolveUpdateRoot, rejectUpdateRoot) => {
                                        let newPointer = Buffer.alloc(8);
                                        newPointer.writeBigInt64BE(nodeToDeleteLeftChild + nodeToDeleteRightChild);
                                        fs.write(descriptor, newPointer, 0, 8, 16, err => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) rejectUpdateRoot(e);
                                                    else rejectUpdateRoot(err);
                                                });
                                            }
                                            else{
                                                // Root pointer header in file has been updated, so update the in-memory version
                                                treeAccess.headers[filePath]["root"] = Number(nodeToDeleteLeftChild + nodeToDeleteRightChild);
                                                resolveUpdateRoot(true);
                                            }
                                        });
                                    });
                                }
                                else{
                                    // There are two children, so use the right one as the root (this choice is arbitrary) and insert the left one as child somewhere in the right subtree
                                    await new Promise((resolveUpdateRoot, rejectUpdateRoot) => {
                                        // Get username of left child
                                        fs.read(descriptor, {position: Number(nodeToDeleteLeftChild), length: 32, buffer: Buffer.alloc(32)}, async (err, bytesRead, data) => {
                                            if (err){
                                                fs.close(descriptor, e => {
                                                    if (e) rejectUpdateRoot(e);
                                                    else rejectUpdateRoot(err);
                                                });
                                            }
                                            else{
                                                let leftChildUsername = treeAccess.bufferToString(data);
                                                // Search right subtree to find a suitable parent for the left child
                                                let suitableNode = await treeAccess.searchTree(filePath, leftChildUsername, false, Number(nodeToDeleteRightChild));
                                                // Now add left node as the left child of suitableNode
                                                let newPointer = Buffer.alloc(8);
                                                newPointer.writeBigInt64BE(nodeToDeleteLeftChild);
                                                fs.write(descriptor, newPointer, 0, 8, suitableNode["position"] + 40, err => {
                                                    if (err){
                                                        fs.close(descriptor, e => {
                                                            if (e) rejectUpdateRoot(e);
                                                            else rejectUpdateRoot(err);
                                                        });
                                                    }
                                                    else{
                                                        // Now make right child the root (by updating root pointer header)
                                                        newPointer.writeBigInt64BE(nodeToDeleteRightChild);
                                                        fs.write(descriptor, newPointer, 0, 8, 16, err => {
                                                            if (err){
                                                                fs.close(descriptor, e => {
                                                                    if (e) rejectUpdateRoot(e);
                                                                    else rejectUpdateRoot(err);
                                                                });
                                                            }
                                                            else{
                                                                // We have updated the header on the file, so need to update the in-memory version
                                                                treeAccess.headers[filePath]["root"] = Number(nodeToDeleteRightChild);
                                                                resolveUpdateRoot(true);
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                        });
                                    });
                                }
                                // To allow space to be reallocated, point "next free" header to node to be deleted, and write the existing "next free" pointer to the first 8 bytes of the newly freed space
                                let clearedSpace = Buffer.alloc(188);
                                clearedSpace.writeBigInt64BE(BigInt(treeAccess.headers[filePath]["nextFree"]));
                                fs.write(descriptor, clearedSpace, 0, 188, oldRootPointer, async err => {
                                    if (err){
                                        fs.close(descriptor, e => {
                                            if (e) reject(e);
                                            else reject(e);
                                        });
                                    }
                                    else{
                                        // The node has been overwritten with the next free pointer and 0's
                                        fs.close(descriptor, async e => {
                                            if (e) reject(e);
                                            else{
                                                // Point "next free" header to newly freed space
                                                await treeAccess.updateNextFreeHeader(filePath, oldRootPointer);
                                                resolve(true);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                    else{
                        // If nodeExists = false but position is not null, it means the node we want does not exist
                        reject("Node does not exist");
                    }

                }
                else{
                    reject("Node does not exist");
                }
            }
            catch (reason){
                reject(reason);
            }
        });
    }

    static updateNextFreeHeader(filePath, newValue){
        return new Promise(async (resolve, reject) => {
            // Update the next free pointer header
            if (typeof treeAccess.headers[filePath] != "object"){
                // We don't yet have the headers in memory, so must load them
                await treeAccess._readHeadersToMemory(filePath);
            }
            let newPointer = Buffer.alloc(8);
            newPointer.writeBigInt64BE(BigInt(newValue));
            fs.open(filePath, "r+", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.write(descriptor, newPointer, 0, 8, 8, err => {
                        if (err){
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else{
                                    // Update in-memory version
                                    treeAccess.headers[filePath]["nextFree"] = newValue;
                                    resolve(true);
                                }
                            });
                        }
                    });
                }
            });
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
        let bufferEnd = Math.min(startPoint + (idealBufferSize * 188), 24 + (treeLength * 188));
        let bufferSize = bufferEnd - startPoint;
        return [startPoint, bufferEnd, bufferSize];
    }

    static _readHeadersToMemory(filePath){
        return new Promise((resolve, reject) => {
            fs.open(filePath, "r", (err, descriptor) => {
                if (err) reject(err);
                else{
                    fs.read(descriptor, {position: 0, length: 24, buffer: Buffer.alloc(24)}, (err, bytesRead, data) => {
                        if (err){
                            fs.close(descriptor, e => {
                                if (e) reject(e);
                                else reject(err);
                            });
                        }
                        else{
                            treeAccess.headers[filePath] = {};
                            treeAccess.headers[filePath]["length"] = Number(data.readBigInt64BE(0));
                            treeAccess.headers[filePath]["nextFree"] = Number(data.readBigInt64BE(8));
                            treeAccess.headers[filePath]["root"] = Number(data.readBigInt64BE(16));
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
module.exports = treeAccess;