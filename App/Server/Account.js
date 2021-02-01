// Class for containing account data
class Account{
    userId;
    userName;
    firstName;
    lastName;
    password;
    profilePicture;

    constructor(userId, userName, firstName, lastName, password){
        if (typeof userId == "number"){
            this.userId = userId;
        }
        else{
            let dataType = typeof userId;
            throw "userId expected a number but " + dataType + " was given";
        }
        if (typeof userName == "string"){
            this.userName = userName;
        }
        else{
            let dataType = typeof userName;
            throw "userName expected a string but " + dataType + " was given";
        }
        if (typeof firstName == "string"){
            this.firstName = firstName;
        }
        else{
            let dataType = typeof firstName;
            throw "firstName expected a string but " + dataType + " was given";
        }
        if (typeof lastName == "string"){
            this.lastName = lastName;
        }
        else{
            let dataType = typeof lastName;
            throw "lastName expected a string but " + dataType + "was given";
        }
        if (typeof password == "string"){
            this.password = password;
        }
        else{
            let dataType = typeof password;
            throw "password expected a string but " + dataType + "was given";
        }

        // Hardcode profile pictures for now, until adding profile pictures is added to register menu
        let nameLowerCase = userName.toLowerCase();
        if (nameLowerCase.charCodeAt(0) -97 < 12){
            // For usernames beginning with A-K use pic1
            this.profilePicture = "pic1.jpg";
        }
        else if (nameLowerCase.charCodeAt(0) - 97 < 20){
            // For usernames beginning with L - T
            this.profilePicture = "pic2.jpg";
        }
        else{
            this.profilePicture = "pic3.jpg"
        }
    }
}
module.exports = Account;