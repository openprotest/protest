var isSecure = window.location.href.toLowerCase().startsWith("https://");
var isIE = navigator.userAgent.indexOf("MSIE ") > -1 || navigator.userAgent.indexOf("Trident/") > -1;
var onMobile = (/Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent));

var main         = document.getElementById("main");
var cap          = document.getElementById("cap");
var container    = document.getElementById("container");
var bottombar    = document.getElementById("bottombar");
var sidemenu     = document.getElementById("sidemenu");
var searchbox    = document.getElementById("searchbox");
var imgSearch    = document.getElementById("imgSearch");
var txtSearch    = document.getElementById("txtSearch");
var mainSession  = document.getElementById("mainSession");
var mainSettings = document.getElementById("mainSettings");

var mainFloadingElements = [mainSession, mainSettings];

var last_activity = new Date().getTime();

function SetWallpaper(url) {
    let loader = document.createElement("img");
    loader.onload = ()=> {
        bottombar.style.background = "var(--toolbar-bg-alt)";
        main.style.background = "none";
        document.body.style.background = "url(" + url + ")";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
        document.body.style.transition = "background 2s";
        localStorage.setItem("wallpaper", url);

        btnSidemenu.style.background = "var(--toolbar-bg-alt-rev)";
        searchbox.style.background = "var(--toolbar-bg-alt-rev)";
        imgSearch.style.filter = "invert(1)";
        txtSearch.style.color = "rgb(224,224,224)";
        txtSearch.style.textShadow = "rgba(0,0,0,.5) 0 0 4px";

        btnCloseSidemenu.style.filter = "invert(1)";

        for (let i = 0; i < mainFloadingElements.length; i++) {
            mainFloadingElements[i].style.background = "var(--toolbar-bg-alt-rev)";
            for (let j = 0; j < mainFloadingElements[i].childNodes.length; j++) {
                if (mainFloadingElements[i].childNodes[j].tagName != "DIV") continue;
                mainFloadingElements[i].childNodes[j].style.filter = "invert(1)";
            }
        }

    };
    loader.src = url;
}

function RemoveWallpaper() {
    bottombar.style.background = "var(--toolbar-bg)";
    main.style.background = "var(--workplace-bg)";
    document.body.style.background = "none";
    localStorage.removeItem("wallpaper");

    btnSidemenu.style.background = "var(--toolbar-bg-rev)";
    searchbox.style.background = "var(--toolbar-bg-rev)";
    imgSearch.style.filter = "none";
    txtSearch.style.color = "rgb(0,0,0)";
    txtSearch.style.textShadow = "rgba(255,255,255,.5) 0 0 4px";   

    btnCloseSidemenu.style.filter = "none";

    for (let i = 0; i < mainFloadingElements.length; i++) {
        mainFloadingElements[i].style.background = "var(--toolbar-bg-rev)";
        for (let j = 0; j < mainFloadingElements[i].childNodes.length; j++) {
            if (mainFloadingElements[i].childNodes[j].tagName != "DIV") continue;
            mainFloadingElements[i].childNodes[j].style.filter = "none";
        }
    }

}


window.addEventListener("mousedown", ()=> {
    last_activity = new Date().getTime();
});

window.addEventListener("keydown", () => {
    last_activity = new Date().getTime();
});

(function checkSession() {
    setTimeout(() => {
        let timeMapping = { 1:15, 2:30, 3:60, 4:2*60, 5:4*60, 6:8*60, 7:24*60, 8:Infinity};
        let index = localStorage.getItem("session_timeout") == null ? 1 : parseInt(localStorage.getItem("session_timeout"))

        if ((new Date().getTime() - last_activity) > 60 * 1000 * timeMapping[index]) {
            let xhr = new XMLHttpRequest(); //logout
            xhr.onreadystatechange = () => { location.reload(); };
            xhr.open("GET", "logout", true);
            xhr.send();
        }

        checkSession();
    }, 60000);
})();