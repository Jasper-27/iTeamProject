// Class for containing account data
class Account{
    userId;
    userName;
    firstName;
    lastName;
    password;
    profilePicture;

    constructor(userId, userName, firstName, lastName, password, profilePicture){
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
        if (typeof profilePicture == "string"){
            this.profilePicture = profilePicture;
        }
        else{
            throw "profilePicture expected a string but " + typeof profilePicture + " was given";
        }
    }
}
module.exports = Account;