

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
		console.log("username1");
        return; 
	}
	else if(usernameinput.length > 20 ){
		alert("Username Too Long");
		console.log("username2");
        return; 
	}
	
	
	//check if passwords are the same, if not error 
    if (passwordValue != password2Value){
        alert("Passwords not the same");
		console.log("password1");
        return; 
		
	// ensure that the password does not have a blank space
    }else if (passwordValue.trim() != passwordValue){
        alert("Passwords can't have blank space");
		console.log("password2");
        return;
		
	//if the HTML doesnt catch blank entry 
    }else if (passwordValue.length < 1 || password2Value.length < 1 || usernameinput.length < 1){ 
        alert("You have missing values");
		console.log("password3");
        return;
    }else{
		alert("User Created")
        socket.emit('create-account', {"username": usernameinput, "firstName": firstName.value, "lastName": lastName.value, "password": passwordValue});
		console.log("done");
    }
}