const socket = io('http://' + self.location.host.split(':')[0] + ':4500'); // sets the ip and port to use with socket.io

var profanitySettings = 0;

loadProfanity();
adminAuth()

//When the server connection is lost 
socket.on('disconnect', () => {
    document.location.href = "./index.html";
})


function adminAuth(){
    socket.emit(`admin-auth`, rsaEncrypt(sessionStorage.getItem('admin_secret')))
}

// Banned words list ========================================================

function bannedWordsDefault(){
    profanitySettings = 0;
    socket.emit('profanityToggle', {"profanitySettings": profanitySettings});
    console.log(profanitySettings);
    document.getElementById('profanityListCustom').readOnly = true;

    document.getElementById("btnDefault").style.background = "#0275d8";
    document.getElementById("btnCustom").style.background = "#343a40";
    document.getElementById("btnSubmitWords").innerHTML = "Submit";
}

// This is what happens when u click submit
function submitWordsCustom(){
    let wordsCustom = document.getElementById('profanityListCustom').value;
    console.log(wordsCustom);
    socket.emit('profanityCustomWords',{'wordsCustom': wordsCustom});

    // Toggles profanity list to custon
    let profanitySettings = 1;
    socket.emit('profanityToggle', {"profanitySettings": profanitySettings});

    document.getElementById("btnSubmitWords").innerHTML = "Done!";

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

    document.getElementById("btnCustom").style.background = "#343a40"
    document.getElementById("btnDefault").style.background = "#0275d8"
    document.getElementById("btnSubmitWords").innerHTML = "Submit";
}


// =====================================================================

// Changing settings  ===========================================


// Function when file size limit is changed
function changeFileSize() {

    var newFileSize = Number(document.getElementById("txtFileSize").value);

    newFileSize = rsaEncrypt(newFileSize)

    socket.emit('changeFileSize', newFileSize);
}


// Function when message limit is changed
function changeMsgLimit() {

    var newMsgLimit = Number(document.getElementById("txtMessageLength").value);

    if (newMsgLimit > 40000) {
        newMsgLimit = 40000;
    }
    if (newMsgLimit < 50) {
        newMsgLimit = 50;
    }

    newMsgLimit = rsaEncrypt(newMsgLimit)

    socket.emit('changeMsgLimit', newMsgLimit);
}

// Function when banned file extensions is changed
function changeBannedFiles() {

    var newBannedFiles = document.getElementById("bannedFileExtensions").value.split("\n");

    newBannedFiles = rsaEncrypt(newBannedFiles)

    socket.emit('changeBannedFiles', newBannedFiles);


}


// =====================================================================


// Updating user details =================================================

function updatePassword(){
    console.log("update-password")
    let userName = document.getElementById("userNameText").value;
    let newPass = document.getElementById("newPassText").value;

    if (userName === "" || newPass === ""){
        alert("missing inputs");
        return
    }

    let data = {"userName":userName,  "newPass":newPass}
    let dataString = JSON.stringify(data)
    dataString = rsaEncrypt(dataString)

    socket.emit('update-Password', dataString);   // removed the old pass requrement as this is to reset passwords 
}

socket.on('update-Password-Status' , (passStatus) => {
    if (passStatus === 1){
        alert("Password Updated");
        document.getElementById("userNameText").value = ""
        document.getElementById("newPassText").value = ""
    }
    if (passStatus === 0){
        alert("Password Failed to update");
    }
})

function updateName(){

    let userId = document.getElementById("userIdText").value;
    let firstName = document.getElementById("userFirstText").value;
    let lastName = document.getElementById("userLastText").value;

    // clear values 
    document.getElementById("userIdText").value = ""
    document.getElementById("userFirstText").value = ""
    document.getElementById("userLastText").value = ""

    if (userId === "" || firstName === "" || lastName === ""){
        alert("Missing Inputs");
        return
    }

    let user = {"userId":userId, "firstName":firstName, "lastName":lastName}
    let userString = JSON.stringify(user)
    userString = rsaEncrypt(userString)

    socket.emit('update-name', userString);
}

socket.on('update-Name-Status' , (nameStatus) => {
    if (nameStatus === 1){
        alert("Name updated!");
        document.getElementById("userNameText").value = ""
        document.getElementById("newPassText").value = ""
    }
    if (nameStatus === 0){
        alert("Name failed to update!");
    }
})

// =====================================================================

// User registration =================================================

// Tell the user when a registration has failed 
socket.on('register-fail', data => {
    alert("Registration failed: " + data);
});

// If register success, notify user
socket.on('register-success', () => {
    alert('Account created')

    document.getElementById("password1Entry").value = ""
    document.getElementById("password2Entry").value = ""
    document.getElementById("usernameEntry").value = ""
});

// Checks to see if details are valid, then sends them on to the server. 
function register(){
	var passwordValue = document.getElementById("password1Entry").value 
	var password2Value = document.getElementById("password2Entry").value 
	var usernameinput = document.getElementById("usernameEntry").value 

	
	//blank check 
	if (usernameinput == null){
		alert("UserName Empty");
        return; 
	}else if(usernameinput.length > 20 ){
		alert("Username Too Long");
        return; 
    }else if (passwordValue != password2Value){  //check if passwords are the same, if not error 
        alert("Passwords not the same");
        return; 
    }else if (passwordValue.trim() != passwordValue){  // ensure that the password does not have a blank space
        alert("Passwords can't have blank space");
        return;
    }else if (passwordValue.length < 1 || password2Value.length < 1 || usernameinput.length < 1){  //if the HTML doesnt catch blank entry 
        alert("You have missing values");
        return;
    }else{

        let user = {"username": usernameinput, "firstName": firstName.value, "lastName": lastName.value, "password": passwordValue}
        let userString = JSON.stringify(user)
        userString = rsaEncrypt(userString)
        socket.emit('create-account', userString)
    }
}

// ===============================================================================


// Deleting users ==================================================================

// Tell the user when a registration has failed 
socket.on('delete-fail', data => {
    alert("Delete failed: " + data);
});

// If register success, notify user
socket.on('delete-success', () => {
    alert('Account Deleted')
});

// Checks to see if details are valid, then sends them on to the server. 
function deleteUser(){
	var usernameinput = document.getElementById("username_delete").value 
	
	//check 
	if (usernameinput == null){
		alert("UserName Empty");
        return; 
	}else{

        let the_json = {"username" : usernameinput}
        let data = JSON.stringify(the_json)
        data = rsaEncrypt(data)

        socket.emit('delete-account', data);
        document.getElementById("username_delete").value = ""

    }
}
//  =================================================================================


//  Read users ======================================================================

function readUser(){
    var username_input = document.getElementById("read").value

    //check 
	if (username_input === ""){
		alert("UserName Empty");
        return; 
	}else{
        socket.emit('read-account', {"user": username_input});
        document.getElementById("read").value = ""
        console.log(username_input);

    }


}

function msgAlert2(TITLE,FIRST,LAST) {
    // "use strict";   
    console.log("nun");
    document.getElementById("readAccounts").innerHTML = `<span class='closebtn' onclick="this.parentElement.style.visibility='hidden';"'>&times;</span><strong>Username: ${TITLE}  </strong>\nFirst Name: ${FIRST}\nLast Name: ${LAST}`;
    readAccounts.style.visibility = 'visible';
    // return;
}

socket.on('read-success', (userData) => {

    console.log("nun")
    // alert("username: " + userData.userName + ", first name: " + userData.firstName)
    msgAlert2(userData.userName, userData.firstName, userData.lastName)
})

socket.on('read-fail', () => {
    alert("couldn't read account details");
})

// ================================================================================

// Encryption ==========================================================================

function rsaEncrypt(data){
    data = btoa(unescape(encodeURIComponent(data + " , " + sessionStorage.getItem('admin_secret'))))

    let encrypted = cryptico.encrypt(data, sessionStorage.getItem('serverPublic'))

    if (encrypted.cipher != null){
        return encrypted.cipher
    }else{
        return 0
    }
}


// =================================================================================

