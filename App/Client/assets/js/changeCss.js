function changeCSS() {

    var oldlink = document.getElementsByTagName("link").item(1);
	var sheet = document.getElementById('cssSheet').value
	
	var obj = JSON.parse('{ "name":"John", "age":30, "city":"New York"}'); 


    var newlink = document.createElement("link");
    newlink.setAttribute("rel", "stylesheet");
    newlink.setAttribute("href", "assets/css/colour/" + sheet + "/styles-Colour.css");

    document.getElementsByTagName("head").item(0).replaceChild(newlink, oldlink);
}