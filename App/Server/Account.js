// Class for containing account data
class Account{
    userName;
    firstName;
    lastName;
    password;
    /* To avoid wasting memory and disk reads, only load the actual profile picture data when it is needed.
    The profilePictureLocation field contains the address of the profile picture in the profile pictures file
    */
    profilePictureLocation;

    constructor(userName, firstName, lastName, password, profilePictureLocation=0){
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
        if (typeof profilePictureLocation == "number"){
            this.profilePictureLocation = profilePictureLocation;
        }
        else{
            throw "profilePictureLocation expected a number but " + typeof profilePictureLocation + " was given";
        }
    }
}
module.exports = Account;