 
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const isSecure = window.location.href.toLowerCase().startsWith("https://");
const onMobile = (/Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent));

const main      = document.getElementById("main");
const cap       = document.getElementById("cap");
const container = document.getElementById("container");
const bottombar = document.getElementById("bottombar");
const sidemenu  = document.getElementById("sidemenu");
const searchbox = document.getElementById("searchbox");
const imgSearch = document.getElementById("imgSearch");

const btnSidemenu      = document.getElementById("btnSidemenu");
const txtSearch        = document.getElementById("txtSearch");
const btnCloseSidemenu = document.getElementById("btnCloseSidemenu");
const lstSideMenu      = document.getElementById("lstSideMenu");

const analog_h   = document.getElementById("analog_clock_h");
const analog_m   = document.getElementById("analog_clock_m");
const date_month = document.getElementById("date_month");
const date_date  = document.getElementById("date_date");
const date_day   = document.getElementById("date_day");

main.style.transition = "filter 1s";
main.style.filter = "none";

let last_activity = new Date().getTime();

window.addEventListener("mousedown", ()=> {
    last_activity = new Date().getTime();
});

window.addEventListener("keydown", () => {
    last_activity = new Date().getTime();
});

//check every minute, if no action for [session_timeout] then auto-logout
(function checkSession() {
    setTimeout(() => {
        let timeMapping = { 1:15, 2:30, 3:60, 4:2*60, 5:4*60, 6:8*60, 7:24*60, 8:Infinity};
        let index = localStorage.getItem("session_timeout") == null ? 1 : parseInt(localStorage.getItem("session_timeout"));

        if ((new Date().getTime() - last_activity) > 60 * 1000 * timeMapping[index]) {
            let xhr = new XMLHttpRequest(); //logout
            xhr.onreadystatechange = () => { location.reload(); };
            xhr.open("GET", "logout", true);
            xhr.send();
        }

        checkSession();
    }, 60000);
})();

(function() { //init clock
    let svg_analog = document.getElementById("analog_clock");
    for (let i = 0; i < 12; i++) {
        let newDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        newDot.setAttribute("r", i%3==0 ? 2.5 : 1.5);
        newDot.setAttribute("cx", 48 + Math.sin(i*30/57.29577951)*36);
        newDot.setAttribute("cy", 48 - Math.cos(i*30/57.29577951)*36);
        newDot.setAttribute("fill", "#202020");
        svg_analog.appendChild(newDot);
    }
})();

(function updateClock() {
    const S = 96;
    let now = new Date();
    let m = now.getMinutes();
    let h = (now.getHours() % 12) + m / 60;

    analog_m.style.transform = "rotate(" + m * 6 + "deg)";
    analog_h.style.transform = "rotate(" + h * 30 + "deg)";

    date_month.innerHTML = monthNames[now.getMonth()];
    date_date.innerHTML = now.getDate();
    date_day.innerHTML = dayNames[now.getDay()];

    setTimeout(() => updateClock(), 60000);
})();