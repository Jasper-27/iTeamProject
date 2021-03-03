
const socket = io('http://localhost:4500'); 

// Tell the user when a registration has failed 
socket.on('register-fail', data => {
    alert("Registration failed: " + data);
});

// If register success, notify user
socket.on('register-success', () => {alert('Account created')});

// Checks to see if details are valid, then sends them on to the server. 
function register(){
    
    if (password1.value != password2.value){
        alert("Passwords don't match");
        return; 
    }else if (password1.value.trim() != password1.value){
        alert("Passwords can't have blank space");
        return;
    }else if (password1.value.length < 1 || password2.value.length < 1 || username.value.length < 1){ 
        alert("You have missing values");
        return;
    }else{
        socket.emit('create-account', {"username": username.value, "firstName": firstName.value, "lastName": lastName.value, "password": password1.value});
    }
}