

const socket = io('http://localhost:4500'); 


// Tell the user when a registration has failed 
socket.on('register-fail', data => {
    alert("Registration failed: " + data);
});

// If register success, notify user
socket.on('register-success', () => {alert('Account created')});

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

// function register(){

//     var password1 = document.getElementById("password1Entry").value 
//     var password2 = document.getElementById("password2Entry").value 
//     var username = document.getElementById("usernameEntry").value 
    
//     if (password1 != password2){
//         alert("Passwords don't match");
//         return; 
//     }else if (username.length > 20){
//         alert("username is too long")
//         return; 
//     }
//     else if (password1.trim() != password1){
//         alert("Passwords can't have blank space");
//         return;
//     }else if (password1.length < 1 || password2.length < 1 || username.length < 1){ 
//         alert("You have missing values");
//         return;
//     }else{
//         socket.emit('create-account', {"username": username.value, "firstName": firstName.value, "lastName": lastName.value, "password": password1.value});
//     }
// }