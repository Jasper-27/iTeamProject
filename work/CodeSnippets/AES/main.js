const cryptico = require("cryptico")


let private = cryptico.generateRSAKey("butt", 1024)
let private2 = cryptico.generateRSAKey("butt", 1024)

if (private == private2){
    console.log("😃")
}else{
    console.log("😔")
}


let key = cryptico.generateAESKey("boobs", 1024)


let StringKey = bufferToString(key)
console.log("StringKey: " + StringKey)

let BufKey = stringToBuffer(StringKey)
console.log("BufKey: " + BufKey)


if (BufKey === key){
    console.log("😅")
}else{
    console.log("😭")
}

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