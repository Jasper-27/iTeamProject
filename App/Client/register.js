const socket = io('http://localhost:3000'); 
        



// If register fails, force user to try again
socket.on('register-fail', data => {
    alert("Registration failed: " + data)
});

// If register success, notify user
socket.on('register-success', () => {alert('Account created')});




function login(){
    // Adds the username and password to the session storage
    sessionStorage.setItem('session_pass', document.getElementById("pass").value); 
    sessionStorage.setItem('session_user', document.getElementById("user").value)

    window.location.replace("./app.html"); //changes to the main app window 

}

//When the send button is pressed 
function register(){
    
    if (password1.value != password2.value){
        alert("Passwords don't match")
        return; 
    }else if (password1.value.trim() != password1.value){
        alert("Passwords can't have blank space")
        return
    }else if (password1.value.length < 1 || password2.value.length < 1 || username.value.length < 1){ 
        alert("You have missing values")
        return
    }else{
        socket.emit('create-account', {"username": username.value, "firstName": firstName.value, "lastName": lastName.value, "password": password1.value});
    }
}