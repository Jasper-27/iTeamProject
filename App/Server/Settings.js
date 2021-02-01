const fs = require("fs"); 




function readSettings(socket) {

   
    try{
        let rawData = fs.readFileSync('settings.json')
        let settingsJson = JSON.parse(rawData)
        return settingsJson
    }catch{
        console.log("Error, can't read settings file")
        process.exit(1); 
    }
}


// function sendSettings(socket, settings){
//     socket.emit("settings", settings);
//     echo("i think it works")
// }



module.exports = {
  readSettings
}