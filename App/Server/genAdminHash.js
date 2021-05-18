const bcrypt = require('bcrypt');
const fs = require('fs');



// get the password from command line
const args = process.argv.slice(2)


// Generate Salt
const salt = bcrypt.genSaltSync(10);

// Hash Password
const hash = bcrypt.hashSync(args[0], salt);

// console.log(hash);


// console.log(isValidPass)
// $2b$10$Wdj1lOudt3JXEc6TBI2C6.Wafuv33FRdv9jRd9qtVdPYWmKmbtiTm


fs.writeFile('data/adminPass.txt', hash, function (err) {
  if (err) return console.log(err);
  console.log('saved password');
});