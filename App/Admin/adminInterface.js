const socket = io('http://' + self.location.host.split(':')[0] + ':4500'); // sets the ip and port to use with socket.io

var profanitySettings = 0;

loadProfanity();


function bannedWordsDefault(){

    profanitySettings = 0;
    socket.emit('profanityToggle', {"profanitySettings": profanitySettings});
    console.log(profanitySettings);
    document.getElementById('profanityListCustom').readOnly = true;


}

function submitWordsCustom(){

    let wordsCustom = document.getElementById('profanityListCustom').value;
    console.log(wordsCustom);
    socket.emit('profanityCustomWords',{'wordsCustom': wordsCustom});


    let profanitySettings = 1;
    socket.emit('profanityToggle', {"profanitySettings": profanitySettings});

}
function loadProfanity(){
    socket.on('get-Profanity', (words) => {
        console.log(words);
    document.getElementById('profanityListCustom').value = words.words;
})
}

function bannedWordsCustom() {
    document.getElementById("profanityListCustom").readOnly = false;
    profanitySettings = 1;
    socket.emit('profanityToggle', {"profanitySettings": profanitySettings});
    console.log("profanity settings = " + profanitySettings);


}



