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

convertBlock(__dirname + "/../data/logsTest7/6.wki", __dirname + "/../data/logsTest7/6Readable.wki");
convertIndex(__dirname + "/../data/index_test7.wdx", __dirname + "/../data/index_readable7.wdx")