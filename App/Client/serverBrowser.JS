class Server {
    constructor(address, port, name) {
        this.address = address;
        this.port = port;
        this.name = name; 
    }
}

let server1 = new Server("192.168.0.2", 666, "Jasper's awesome server")


// var fruitsList = document.getElementById('fruits'),
//     li = document.createElement('li'),
//     clone;
//     ['apples','bananas','cranberries'].forEach(function (fruit, index) {
//     clone = li.cloneNode();
//     clone.textContent = index + ': ' + fruit;
//     fruitsList.appendChild(clone);
// });

function connect(){
    alert("TestFunc")
}