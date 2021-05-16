// const { userInfo } = require("node:os");

const socket = io('http://' + self.location.host.split(':')[0] + ':4500'); // sets the ip and port to use with socket.io

var profanitySettings = 0;

loadProfanity();

adminAuth()

//When the server connection is lost 
socket.on('disconnect', () => {
    document.location.href = "./index.html";
})


function adminAuth(){
    socket.emit(`admin-auth`, sessionStorage.getItem('Admin_token'))
}

// Banned words list ========================================================

function bannedWordsDefault(){
    profanitySettings = 0;
    socket.emit('profanityToggle', {"profanitySettings": profanitySettings});
    console.log(profanitySettings);
    document.getElementById('profanityListCustom').readOnly = true;
}

// This is what happens when u click submit
function submitWordsCustom(){
    let wordsCustom = document.getElementById('profanityListCustom').value;
    console.log(wordsCustom);
    socket.emit('profanityCustomWords',{'wordsCustom': wordsCustom});

    // Toggles profanity list to custon
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

// ======================================================================


// Updating user details =================================================

function updatePassword(){
    console.log("update-password")
    let userName = document.getElementById("userNameText").value;
    let newPass = document.getElementById("newPassText").value;

    if (userName === "" || newPass === ""){
        alert("missing inputs");
        return
    }

    // socket.emit('update-Password', {"userName":userName, "oldPass":oldPass, "newPass":newPass});   
    socket.emit('update-Password', {"userName":userName,  "newPass":newPass});   // removed the old pass requrement as this is to reset passwords 
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

    if (userId === "" || firstName === "" || lastName === ""){
        alert("Missing Inputs");
        return
    }

    socket.emit('update-Name', {"userId":userId, "firstName":firstName, "lastName":lastName});
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
        socket.emit('create-account', {"username": usernameinput, "firstName": firstName.value, "lastName": lastName.value, "password": passwordValue});
    }


    // Checks to see if details are valid, then sends them on to the server. 

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
        socket.emit('delete-account', {"username": usernameinput});
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
    "use strict";   
    document.getElementById("readAccounts").innerHTML = `<span class='closebtn' onclick="this.parentElement.style.visibility='hidden';"'>&times;</span><strong>   ${TITLE}  </strong>  ${FIRST} ${LAST}`;
    readAccounts.style.visibility = 'visible';
    return;
  }

socket.on('read-success', (userData) => {
    // alert("username: " + userData.userName + ", first name: " + userData.firstName)
    msgAlert2(userData.userName, userData.firstName, userData.lastName)
})

socket.on('read-fail', () => {
    alert("fail");
})
