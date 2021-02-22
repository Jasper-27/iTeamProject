function changeCSS(cssFile) {

	window.alert("Working.")
	
    var oldlink = document.getElementsByTagName("link").item(cssLinkIndex);

    var newlink = document.createElement("link");
    newlink.setAttribute("rel", "stylesheet");
    newlink.setAttribute("href", "assets/css/colour/" + cssFile + "/styles-Colour.css");

    document.getElementsByTagName("head").item(0).replaceChild(newlink, oldlink);
}