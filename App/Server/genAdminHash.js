const bcrypt = require('bcrypt');
const fs = require('fs');

// get the password from command line
const args = process.argv.slice(2)

// Generate Salt
const salt = bcrypt.genSaltSync(10);

// Hash Password
const hash = bcrypt.hashSync(args[0], salt);

// Write the hash to the file
fs.writeFile(__dirname + '/data/adminPass.txt', hash, function (err) {
  if (err) return console.log(err);
  console.log('😊 Password updated');
});