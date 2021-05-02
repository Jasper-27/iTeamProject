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


// Tell the user when a registration has failed 
socket.on('delete-fail', data => {
    alert("Registration failed: " + data);
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
    }
}