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

    constructor(accountsTreePath, profilePicturesBlobPath){
        this.accountsTreePath = accountsTreePath;
        this.profilePicturesBlobPath = profilePicturesBlobPath;
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
                    let profilePictureLocation = accountInfo["data"].readBigInt64BE(80);
                    let userAccount = new account(0, username, firstName, lastName, password);
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
                reject(err);
            }
        });
    }
}