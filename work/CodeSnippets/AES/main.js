const cryptico = require("cryptico")


// Creating string 

let key = cryptico.generateAESKey("boobs", 1024)


// Coverty String to buffer
let StringKey = bufferToString(key)
console.log("StringKey: " + StringKey)


//This is where the string would be sent over the network


//converting it back 
let BufKey = stringToBuffer(StringKey)
console.log("BufKey: " + BufKey)


//comparing converted version to the original
if (BufKey === key){
    console.log("😅")
}else{
    console.log("😭")
}


/// They both look the fucking same 
console.log(BufKey)
console.log(key)



function bufferToString(buffer){
    // Convert a Buffer array to a string
    let outputStr = "";
    for (let i of buffer.values()){
        outputStr += String.fromCharCode(i);   
    }
    return outputStr;
}

function stringToBuffer(str){
    // Convert string to buffer
    let buffer = []
    for (let i = 0; i < str.length; i++){
        buffer.push(str.charCodeAt(i))
    }
    return buffer
}