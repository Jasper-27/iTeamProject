// Provides methods for recording performance statistics for testing file system
const fs = require('fs');

const path = __dirname + "/statistics.json";


class Monitor{
    statistics = {};  // Format {<file size>: {"Messages": {"readTime": [], "memoryUse": []}}, "Accounts": {"readTime": [], "memoryUse": []}}}
    startTime;  // Contains datetime for determining how long operation takes

    constructor(){
        if (!fs.existsSync(path)){
            this.statistics = {};
        }
        else{
            // Read file
            this.statistics = JSON.parse(fs.readFileSync(path));
        }
    }
    startTimer(){
        // This will be called right before starting an I/O operation
        this.startTime = Date.now();
    }

    endTimer(fileSize, type){
        // This will be called when I/O operation is complete
        let timeElapsed = Date.now() - this.startTime;
        if (this.statistics[fileSize] == undefined){
            this.statistics[fileSize] = {"Messages": {"readTime": [], "memoryUsage": []}, "Accounts": {"readTime": [], "memoryUsage": []}};
        }
        if (this.statistics[fileSize][type]["readTime"] instanceof Array){
            this.statistics[fileSize][type]["readTime"].push(timeElapsed)
        }
        else{
            // If entry does not already exist it must be created
            this.statistics[fileSize][type]["readTime"] = [timeElapsed];
        }
    }

    getMemoryUsage(fileSize, type){
        // Get amount of heap space in use
        let memoryUsage = process.memoryUsage().heapUsed;
        if (this.statistics[fileSize] == undefined){
            this.statistics[fileSize] = {"Messages": {"readTime": [], "memoryUsage": []}, "Accounts": {"readTime": [], "memoryUsage": []}};
        }
        if (this.statistics[fileSize][type]["memoryUsage"] instanceof Array){
            this.statistics[fileSize][type]["memoryUsage"].push(memoryUsage)
        }
        else{
            // If entry does not already exist it must be created
            this.statistics[fileSize][type]["memoryUsage"] = [memoryUsage];
        }
    }

    saveFile(){
        // Save statistics to file
        fs.writeFileSync(path, JSON.stringify(this.statistics));
    }
}

module.exports = Monitor;