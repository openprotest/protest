const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

var mainSession = document.getElementById("mainSession");
var mainSettings = document.getElementById("mainSettings");

var analog_h = document.getElementById("analog_clock_h");
var analog_m = document.getElementById("analog_clock_m");
var date_month = document.getElementById("date_month");
var date_date  = document.getElementById("date_date");
var date_day   = document.getElementById("date_day");

mainSession.onclick = () => {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
        if (xhr.readyState == 4 && xhr.status == 200) {
            if (xhr.responseText == "ok")
                location.reload();

        } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
            console.log("Server is unavailable.");
    };
    xhr.open("GET", "logout");
    xhr.send();
};

mainSettings.onclick = () => {
    let settings = new Window();
    settings.setTitle("Settings");
    settings.setIcon("res/tool02.svgz");
    settings.win.style.backgroundColor = "rgba(64,64,64,.95)";
    settings.content.style.backgroundColor = "rgba(64,64,64,0)";
};

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
    date_day.innerHTML = dayNames[now.getDay()];

    if (now.getMonth() === 0 && now.getDate() === 1) { //new year
        date_date.innerHTML = "&#129346;";
    } else if (now.getMonth() === 1 && now.getDate() === 14) { //valentines day
        date_date.innerHTML = "&#10084;";        
    } else if (now.getMonth() === 2 && now.getDate() === 14) { //PI day
        date_date.innerHTML = "&#120645;";
    } else if (now.getMonth() === 6 && now.getDate() === 31) { //sys admin day
        date_date.innerHTML = "&#128374;";
    } else {
        date_date.innerHTML = now.getDate();
    }

    setTimeout(() => updateClock(), 60000);
})();