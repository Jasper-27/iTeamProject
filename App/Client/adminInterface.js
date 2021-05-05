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

function updatePassword(){
    let userName = document.getElementById("userNameText").value;
    let oldPass = document.getElementById("oldPassText").value;
    let newPass = document.getElementById("newPassText").value;

    if (userName === "" || oldPass === "" || newPass === ""){
        alert("missing inputs");
    }

    socket.emit('update-Password', {"userName":userName, "oldPass":oldPass, "newPass":newPass});

    socket.on('update-Password-Status' , (passStatus) => {

        if (passStatus === 1){
            alert("Password Updated");
        }
        if (passStatus === 0){
            alert("Password Failed to update");
        }

    })
}

function updateName(){

    let userId = document.getElementById("userIdText").value;
    let firstName = document.getElementById("userFirstText").value;
    let lastName = document.getElementById("userLastText").value;

    if (userId === "" || firstName === "" || lastName === ""){
        alert("Missing Inputs");
    }

    socket.emit('update-Name', {"userId":userId, "firstName":firstName, "lastName":lastName});


    socket.on('update-Name-Status' , (nameStatus) => {


        if (nameStatus === 1){
            alert("Name updated!");
        }
        if (nameStatus === 0){
            alert("Name failed to update!");
        }
    })


}


