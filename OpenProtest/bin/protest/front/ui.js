 
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const isSecure = window.location.href.toLowerCase().startsWith("https://");
const onMobile = (/Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent));

const favicon   = document.getElementById("favicon");

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

window.addEventListener("mousedown", () => {
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
    }, 60000); // every minute
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

function RgbToHsl(color) {
    let r = color[0] / 255;
    let g = color[1] / 255;
    let b = color[2] / 255;

    let cmin = Math.min(r, g, b);
    let cmax = Math.max(r, g, b);
    let delta = cmax - cmin;

    let h, s, l;

    if (delta == 0) h = 0;
    else if (cmax == r) h = ((g - b) / delta) % 6;
    else if (cmax == g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);

    if (h < 0) h += 360;

    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return [h, s, l];
}
function SetAccentColor(accent) {
    let rgbString = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
    let hsl = this.RgbToHsl(accent);

    let step1 = `hsl(${hsl[0]-4},${hsl[1]}%,${hsl[2]*.78}%)`;
    let step2 = `hsl(${hsl[0]+7},${hsl[1]}%,${hsl[2]*.9}%)`; //--select-color
    let step3 = `hsl(${hsl[0]-4},${hsl[1]}%,${hsl[2]*.8}%)`;
    let gradient = `linear-gradient(to bottom, ${step1}0%, ${step2}92%, ${step3}100%)`;

    let root = document.documentElement;
    root.style.setProperty("--theme-color", rgbString);
    root.style.setProperty("--select-color", step2);
    root.style.setProperty("--toolbar-bg", gradient);
    root.style.setProperty("--toolbar-bg-rev", `linear-gradient(to bottom, ${step3}0%, ${step2}2%, ${step1}100%)`);

    let ico = "<svg version=\"1.1\" xmlns:serif=\"http://www.serif.com/\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" x=\"0px\" y=\"0px\" width=\"48px\" height=\"48px\"  viewBox=\"0 0 48 48\" enable-background=\"new 0 0 48 48\" xml:space=\"preserve\">"+
        "<g fill=\""+step2+"\">"+
        "<path d=\"M26.935,0.837h7.491l0.624,14.984l-8.24,1.873L26.935,0.837z\"/>"+
        "<path d=\"M38.172,19.068l-3.871,8.866l-22.974,9.489l0.125-8.44l13.412-2.299V15.821L1.712,20.566l1.998,26.221 l42.579,0.375l-0.249-30.466L38.172,19.068z\"/>"+
        "<path d=\"M4.459,0.837l0.374,16.857l8.741-1.873l-0.5-14.984H4.459z\"/>"+
        "<path d=\"M15.821,0.837h7.304L24,13.2l-8.054,1.498L15.821,0.837z\"/>"+
        "<path d=\"M37.672,0.837h7.367l1.249,12.986l-8.491,1.998L37.672,0.837z\"/>"+
        "</g></svg>";

    favicon.href = "data:image/svg+xml;base64," + btoa(ico);

}