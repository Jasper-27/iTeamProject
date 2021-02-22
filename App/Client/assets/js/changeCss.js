function changeCSS(cssFile, cssLinkIndex) {

    var oldlink = document.getElementsByTagName("link").item(cssLinkIndex);

    var newlink = document.createElement("link");
    newlink.setAttribute("rel", "stylesheet");
    newlink.setAttribute("href", "assets/css/" + cssFile);

    document.getElementsByTagName("head").item(0).replaceChild(newlink, oldlink);
}