/* 
Class for searching and modifying index files
Index files record which block contains each message or log entry
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
}
