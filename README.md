# 😉 WinkieMessenger #
## COMP2003 iTeam Group Project ## 

### About the project ###
WinkieMessenger is a self hosted group chat application, with support for images and files. It is made for groups who want a secure platform where they control their own data. 

### How to run 

There are three main parts of the application. The server, the admin site, and the app site. To set up the server do the following from the application directory: 

``` sh
# Starting the server 
cd App/Server
npm update
node server.js

# Starting the app web server 
cd App/Client
npx serve

# Starting the Admin web server 
cd App/Admin
npx serve

```

If you want to be able to access the web-application over the internet you will need to setup port forwarding. 


### How to change the default admin password ###
To set/change the default admin password on the server you need to run the genAdminHash.js script file, passing the new password in as an argument. For example to set the password as "password" : 

``` sh
cd /App/Server
node genAdminHash.js password
```

### Stuff we used 
[Cryptico for implementing RSA encryption](https://github.com/wwwtyro/cryptico "Their website")

### Credits ###
Hannah Brown - https://github.com/hannahmaebrown <br>
Alex Redmond - https://github.com/AlexFF000 <br>
Tom Nash - https://github.com/Tom451 <br>
Etienne Brand - https://github.com/etiennebrandd<br>
Jasper Cox - https://github.com/Jasper-27 <br>
Callum Gorman-Williams - https://github.com/CallumGWilliams <br>

