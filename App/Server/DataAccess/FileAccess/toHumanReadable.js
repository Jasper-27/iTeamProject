const fs = require('fs');

function convertBlock(filePath, readablePath){
    fs.open(filePath, "r", (err, descriptor) => {
        fs.read(descriptor, (err, bytesRead, data) => {
            let newFile = "";
            // Read headers to newFile
            newFile += data.readInt8(0);
            newFile += "|";
            newFile += data.readBigInt64BE(1);
            newFile += "|";
            newFile += data.readBigInt64BE(9);
            newFile += "|";
            newFile += data.readBigInt64BE(17);
            newFile += "||";
            let position = 25;
            while (position < bytesRead){
                newFile += "-"
                let size = data.readBigInt64BE(position);
                newFile += size;
                newFile += "|"
                newFile += data.readBigInt64BE(position + 8);
                newFile += "|";
                newFile += data.subarray(position + 16, position + Number(size)).toString();
                position += Number(size);
            }
            fs.writeFileSync(readablePath, newFile);
        });
    });
}

function convertIndex(filePath, readablePath){
    fs.open(filePath, "r", (err, descriptor) => {
        fs.read(descriptor, (err, bytesRead, data) => {
            let newFile = "";
            // Read headers to newFile
            newFile += data.readBigInt64BE(0);
            newFile += "|";
            newFile += data.readBigInt64BE(8);
            newFile += "|";
            newFile += data.readBigInt64BE(16);
            newFile += "||";
            let position = 24;
            while (position < bytesRead){
                newFile += "-"
                newFile += data.readBigInt64BE(position);
                newFile += "|"
                newFile += data.readBigInt64BE(position + 8);
                newFile += "|";
                newFile += data.readBigInt64BE(position + 16);
                position += 24;
            }
            fs.writeFileSync(readablePath, newFile);
        });
    });
}

function convertTree(filePath, readablePath){
    fs.open(filePath, "r", (err, descriptor) => {
        fs.read(descriptor, (err, bytesRead, data) => {
            let newFile = "";
            // Read header to newFile
            newFile += data.readBigInt64BE(0);
            newFile += "||";
            let position = 8;
            while (position < bytesRead){
                newFile += "-"
                // Read username
                newFile += data.subarray(position, position + 32).toString();
                newFile += "|"
                // Read numerical value of username
                newFile += data.readBigInt64BE(position + 32);
                newFile += "|";
                // Read left child pointer
                newFile += data.readBigInt64BE(position + 40);
                newFile += "|";
                // Right child pointer
                newFile += data.readBigInt64BE(position + 48);
                newFile += "|";
                // Read first name
                newFile += data.subarray(position + 56, position + 88).toString();
                newFile += "|";
                // Read last name
                newFile += data.subarray(position + 88, position + 120).toString();
                newFile += "|";
                // Read password
                newFile += data.subarray(position + 120, position + 180).toString();
                newFile += "|";
                // Read profile picture position
                newFile += data.readBigInt64BE(position + 180);
                position += 188;
            }
            fs.writeFileSync(readablePath, newFile);
        });
    });
}