/*
An interface for accessing user accounts, abstracting treeAccess and blobAccess
*/
const bcrypt = require('bcrypt');

const treeAccess = require('./FileAccess/treeAccess');
const blobAccess = require('./FileAccess/blobAccess');
const account = require('./../Account');

const saltRounds = 10;  // The number of iterations to be done to generate the hash (2^saltRounds)

class usersAccess{
    accountsTreePath;
    profilePicturesBlobPath;
    
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

    constructor(accountsTreePath, profilePicturesBlobPath){
        this.accountsTreePath = accountsTreePath;
        // Create the file if it does not exist
        treeAccess.createTree(accountsTreePath);
        this.profilePicturesBlobPath = profilePicturesBlobPath;
        // Initialise an immediately resolved promise
        this.pendingWrites = Promise.resolve("This value doesn't matter");
    }

    getAccount(username){
        // Return a promise containing the account with the given username (or reject if it does not exist)
        return new Promise(async (resolve, reject) => {
            try{
                // Get raw account data from tree
                let accountInfo = await treeAccess.searchTree(this.accountsTreePath, username);
                if (accountInfo["fileEmpty"] === true || accountInfo["nodeExists"] === false){
                    // Account with that username does not exist
                    reject("Requested account does not exist");
                }
                else{
                    // treeAccess will return the data as the node.js Buffer type, which contains raw bytes, so we must convert it to an Account object
                    let firstName = treeAccess.bufferToString(accountInfo["data"].subarray(56, 88));
                    let lastName = treeAccess.bufferToString(accountInfo["data"].subarray(88, 120));
                    let password = treeAccess.bufferToString(accountInfo["data"].subarray(120, 180));
                    // The actual profile picture is not stored in the tree, this will just be the position of the profile picture in the profile pictures file
                    let profilePictureLocation = Number(accountInfo["data"].readBigInt64BE(180));
                    let userAccount = new account(username, firstName, lastName, password, profilePictureLocation);
                    // The profile picture may not be needed, so it will be fetched later when it is needed
                    resolve(userAccount);
                }
            }
            catch(err){
                reject(err);
            }
        });
    }

    checkCredentials(username, password){
        // Return promise containing the account if the details are correct, or false if the details are wrong
        return new Promise(async (resolve, reject) => {
            try{
                let userAccount = await this.getAccount(username);
                // Compare the passwords
                let match = await bcrypt.compare(password, userAccount.password);
                if (match === true){
                    // The passwords match so return the account
                    resolve(userAccount);
                }
                else{
                    // The passwords don't match
                    resolve(false);
                }
            }
            catch(reason){
                if (reason == "Requested account does not exist"){
                    resolve(false);
                }
                else reject(reason);
            }
        });
    }

    createAccount(username, firstName, lastName, password){
        return new Promise(async (resolve, reject) => {
            // Add new promise to the pendingWrites chain to be executed once previous one is done
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    // Hash password
                    let passwordHash = await bcrypt.hash(password, saltRounds);
                    // Create raw Buffer from data
                    let rawData = Buffer.concat([treeAccess.stringToBuffer(firstName, 32), treeAccess.stringToBuffer(lastName, 32), treeAccess.stringToBuffer(passwordHash, 60), new Uint8Array(8)]);
                    // Then add node to tree
                    await treeAccess.addNode(this.accountsTreePath, username, rawData);
                    resolve(true);
                }
                catch(err){
                    if (err == "Node with that username already exists"){
                        reject("Username taken");
                    }
                    else reject(err);
                }
            });
        });
    }

    changeFirstName(username, newFirstName){
        return new Promise(async (resolve, reject) => {
            // Add new promise to the pendingWrites chain to be executed once previous one is done
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    // Create raw Buffer from data
                    let rawData = treeAccess.stringToBuffer(newFirstName, 32);
                    // Then update file
                    await treeAccess.modifyNode(this.accountsTreePath, username, 56, rawData);  // First name is stored in bytes 56 - 88 of the entry
                    resolve(true);
                }
                catch(err){
                    if (err == "Requested node does not exist") reject("Account does not exist");
                    else reject(err);
                }
            });
        });
    }

    changeLastName(username, newLastName){
        return new Promise(async (resolve, reject) => {
            // Add new promise to the pendingWrites chain to be executed once previous one is done
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    // Create raw Buffer from data
                    let rawData = treeAccess.stringToBuffer(newLastName, 32);
                    // Then update file
                    await treeAccess.modifyNode(this.accountsTreePath, username, 88, rawData);  // Last name is stored in bytes 88 - 120 of the entry
                    resolve(true);
                }
                catch(err){
                    if (err == "Requested node does not exist") reject("Account does not exist");
                    else reject(err);
                }
            });
        });
    }

    changePassword(username, newPassword){
        return new Promise(async (resolve, reject) => {
            // Add new promise to the pendingWrites chain to be executed once previous one is done
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    // Hash password
                    let passwordHash = await bcrypt.hash(newPassword, saltRounds);
                    // Create raw Buffer from data
                    let rawData = treeAccess.stringToBuffer(passwordHash, 60);
                    // Then update file
                    await treeAccess.modifyNode(this.accountsTreePath, username, 120, rawData);  // Password is stored in bytes 120 - 180 of the entry
                    resolve(true);
                }
                catch(err){
                    if (err == "Requested node does not exist") reject("Account does not exist");
                    else reject(err);
                }
            });
        });
    }


    deleteAccount(username){
        return new Promise((resolve, reject) => {
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    // Delete profile picture if necessary
                    let account = await this.getAccount(username);
                    if (account.profilePictureLocation != 0){
                        await this.deleteProfilePicture(account.profilePictureLocation);
                    }
                    resolve(await treeAccess.removeNode(this.accountsTreePath, username));
                }
                catch (reason){
                    reject(reason);
                }
            });
        });
    }

    getChangeProfilePictureStream(username, imageSize){
        return new Promise((resolve, reject) => {
            this.pendingWrites = this.pendingWrites.then(async () => {
                try{
                    // If there is an existing picture, delete it and overwrite with 0's
                    let account = await this.getAccount(username);
                    let profilePicturePos = account.profilePictureLocation;
                    if (profilePicturePos != 0){
                        // The account already has a profile picture, which must be deleted first
                        await this.deleteProfilePicture(profilePicturePos);
                    }
                    // Allocate space for new picture
                    let position = await blobAccess.allocate(this.profilePicturesBlobPath, imageSize);
                    let stream = await blobAccess.getWritableStream(this.profilePicturesBlobPath, position);
                    let cancelled = false;
                    stream.on("close", () => {
                        // If stream is closed early, then deallocate the newly allocated space
                        if (stream.totalLifetimeBytesWritten < imageSize){
                            cancelled = true;
                            // Change the user's profile picture location to 0 as the old one has already been deleted
                            let rawBytes = Buffer.alloc(8);
                            rawBytes.writeBigInt64BE(0n);
                            treeAccess.modifyNode(this.accountsTreePath, username, 180, rawBytes).then(() => {
                                blobAccess.deallocate(this.profilePicturesBlobPath, position).catch(reason => {
                                    console.log(`Unable to deallocate new profile picture space: ${reason}`);
                                });
                            }, reason => {
                                console.log(`Couldn't change user ${username} profile picture location to 0 after failure`);
                            });
                        }
                    });
                    stream.on("finish", () => {
                        if (imageSize <= stream.totalLifetimeBytesWritten && cancelled === false){
                            // Update the user's account details with the new location
                            let rawBytes = Buffer.alloc(8);
                            rawBytes.writeBigInt64BE(BigInt(position));
                            treeAccess.modifyNode(this.accountsTreePath, username, 180, rawBytes).catch(reason => {
                                console.log(`Couldn't change user ${username} profile picture location`);
                            });
                        }
                    });
                    // Return stream to write new picture to file
                    resolve(stream);
                }
                catch (reason){
                    reject(reason);
                }
            });
        });
    }

    deleteProfilePicture(position){
        // Deallocate and zero out a user's profile picture in the blob file
        return new Promise(async (resolve, reject) => {
            try{
                let stream = await blobAccess.getWritableStream(this.profilePicturesBlobPath, position);
                stream.on("close", () => {
                    // Once the stream closes, deallocate
                    blobAccess.deallocate(this.profilePicturesBlobPath, position).then(() => {
                        resolve(true);
                    }, reason => {
                        console.log(`Failed to deallocate profile picture: ${reason}`);
                    })
                });
                let zeroes = Buffer.alloc(16384);
                let overwrite = async () => {
                    // Try to write to stream if it isn't full
                    if (stream._writableState.needDrain === false){
                        // Otherwise wait until it drains
                        stream.write(zeroes, () => {
                            overwrite();
                        });
                    }
                    else{
                        // Otherwise wait until it drains
                        stream.once('drain', overwrite);
                    }
                };
                overwrite();
            }
            catch(reason){
                reject(reason);
            }
        });
    }
}
module.exports = usersAccess;