 
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const isSecure = window.location.href.toLowerCase().startsWith("https://");
const onMobile = (/Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent));

const favicon   = document.getElementById("favicon");

const main      = document.getElementById("main");
const cap       = document.getElementById("cap");
const container = document.getElementById("container");
const punchpane = document.getElementById("punchpane");
const punchmenu = document.getElementById("punchmenu");
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

let punch_toogle = false;
let punch_left = 0;
let punch_top = 0;

function punch_PositionElements(isSelected) {
    if (isSelected) {
        punchmenu.style.transform = `translate(${punch_left}px,${punch_top}px)`;
        punchmenu.style.opacity = "1";
        punchmenu.style.visibility = "visible";
    } else {
        punchmenu.style.transform = `translate(${punch_left}px,${punch_top}px) rotate(-45deg)`;
        punchmenu.style.opacity = "0";
        punchmenu.style.visibility = "hidden";

        punchpane.style.opacity = "0";
        punchpane.style.visibility = "hidden";
    }

    if (punch_toogle) {
        punchmenu.style.borderRadius = "45% 2px 2px 45%";
        punchpane.style.transform = `translate(${punch_left + 32}px,${punch_top}px)`;
    } else {
        punchmenu.style.borderRadius = "45% 45% 1px 45%";
        punchpane.style.transform = `translate(${punch_left + 16}px,${punch_top}px)`;
        punchpane.style.opacity = "0";
        punchpane.style.visibility = "hidden";
    }
}

function punch_CreateIcon(icon, label, punchpane) {
    const div = document.createElement("div");
    div.style.backgroundImage = `url(${icon})`;
    div.setAttribute("tip", label);
    punchpane.appendChild(div);

    return div;
}

function punch_GetType(text) {
    let isEmail = false;
    let isPhone = false;
    let isIp = false;
    let isMac = false;
    let isUrl = false;
    let isHostname = false;
    let isDnsname = false;
    let count = 0;

    if (text.length > 1 && !isIp)
        isPhone = text.match(/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s/0-9]*$/g) != null;

    if (text.length > 1)
        isEmail = text.match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/g) != null;

    let dotSplit = text.split(".");
    if (dotSplit.length == 4 && dotSplit.every(o => o.length > 0))
        if (!isNaN(dotSplit[0]) && !isNaN(dotSplit[1]) && !isNaN(dotSplit[2]) && !isNaN(dotSplit[3]))
            if (dotSplit[0] < 256 && dotSplit[1] < 256 && dotSplit[2] < 256 && dotSplit[3] < 256 && dotSplit[0] > -1 && dotSplit[1] > -1 && dotSplit[2] > -1 && dotSplit[3] > -1)
                isIp = true;

    let macString = text.toLowerCase();
    while (macString.indexOf("-") > -1) macString = macString.replace("-", "");
    while (macString.indexOf(":") > -1) macString = macString.replace(":", "");

    if (macString.length == 12)
        isMac = macString.match(/[0-9,a-f]/g).length == 12;

    isUrl = text.startsWith("http://") || text.startsWith("https://");

    if (text.length > 1 && text.length < 63 && isNaN(text) && !isPhone) {
        let match = text.match(/[0-9,A-Z,^-]/g);
        if (match != null)
            isHostname = match.length == text.length;
    }

    if (!isIp && text.length > 1 && text.indexOf(".") > -1) {
        split = text.split(".");
        for (let i = 0; i < split.length; i++)
            if (isNaN(split[i])) {
                isDnsname = text.match(/[0-9,a-z,A-Z,^.-]/g).length == text.length;
                break;
            }
    }


    if (isHostname || isDnsname) {
        const dns = punch_CreateIcon("res/dns.svgz", "DNS lookup", punchpane);
        dns.style.left = `${1 + count++ * 28}px`;

        dns.onclick = () => {
            let win = $w.array.find(o => o instanceof DnsLookup);
            if (win) {
                win.Filter(text);
                win.BringToFront();
            } else {
                new DnsLookup().Filter(text);
            }
        };
    }

    if (isIp || isHostname || isDnsname) {
        const ping = punch_CreateIcon("res/ping.svgz", "Ping", punchpane);
        ping.style.left = `${1 + count++ * 28}px`;

        const traceroute = punch_CreateIcon("res/traceroute.svgz", "Trace route", punchpane);
        traceroute.style.left = `${1 + count++ * 28}px`;

        const locate = punch_CreateIcon("res/locate.svgz", "Locate IP", punchpane);
        locate.style.left = `${1 + count++ * 28}px`;

        //const portscan = punch_CreateIcon("res/portscan.svgz", "Port scan", punchpane);
        //portscan.style.left = `${1 + iconCount++ * 28}px`;

        ping.onclick = () => {
            let win = $w.array.find(o => o instanceof Ping);
            if (win) {
                win.Filter(text);
                win.BringToFront();
            } else {
                new Ping().Filter(text);
            }
        };

        traceroute.onclick = () => {
            let win = $w.array.find(o => o instanceof TraceRoute);
            if (win) {
                win.Filter(text);
                win.BringToFront();
            } else {
                new TraceRoute().Filter(text);
            }
        };

        locate.onclick = () => {
            let win = $w.array.find(o => o instanceof LocateIp);
            if (win) {
                win.Filter(text);
                win.BringToFront();
            } else {
                new LocateIp().Filter(text);
            }
        };
    }

    if (isMac) {
        const mac = punch_CreateIcon("res/maclookup.svgz", "MAC lookup", punchpane);
        mac.style.left = `${1 + count++ * 28}px`;
        mac.onclick = () => {
            let win = $w.array.find(o => o instanceof MacLookup);
            if (win) {
                win.Filter(text);
                win.BringToFront();
            } else {
                new MacLookup().Filter(text);
            }
        };
    }

    if (isUrl) {
        const webcheck = punch_CreateIcon("res/websitecheck.svgz", "Website check", punchpane);
        webcheck.style.left = `${1 + count++ * 28}px`;
        webcheck.onclick = () => {
            new WebCheck({"value":text});
        };
    }

    if (isEmail) {
        const email = punch_CreateIcon("res/email.svgz", "E-mail", punchpane);
        email.style.left = `${1 + count++ * 28}px`;
        email.onclick = () => {
            window.location.href = `mailto:${text}`;
        };
    }

    if (isPhone) {
        const phone = punch_CreateIcon("res/phone.svgz", "Call", punchpane);
        phone.style.left = `${1 + count++ * 28}px`;
        phone.onclick = () => {
            window.location.href = `tel:${text}`;
        };
    }

    const search = punch_CreateIcon("res/search.svgz", "Search", punchpane);
    search.style.left = `${1 + count++ * 28}px`;

    search.onclick = () => {
        txtSearch.value = text;
        SideMenu_Open();
        SideMenu_Update(text);
    };

    return {
        isEmail    : isEmail,
        isPhone    : isPhone,
        isIp       : isIp,
        isMac      : isMac,
        isUrl      : isUrl,
        isHostname : isHostname,
        isDnsname  : isDnsname,
        count      : count
    };
}

document.onselectionchange = (event) => {
    if (localStorage.getItem("punch_menu") != "true") return;

    const s = document.getSelection();
    let offsetMin = Math.min(s.anchorOffset, s.focusOffset);
    let offsetMax = Math.max(s.anchorOffset, s.focusOffset);
    let isSelected = s.anchorNode && s.anchorNode === s.focusNode && offsetMax - offsetMin > 0;

    if (isSelected) {
        let pos = s.getRangeAt(0).getBoundingClientRect();
        punch_left = Math.max(pos.left - 32, 4);
        punch_top = pos.top - 32;
        if (punch_left < 40) punch_top = Math.max(punch_top, 56 - punch_left);

        let text;
        if (s.anchorNode != s.focusNode)
            text = s.anchorNode.textContent;
        else
            text = s.anchorNode.textContent.substring(s.anchorOffset, s.focusOffset).trim();

        punchpane.innerHTML = "";
        if (text.length < 100) {
            const type = punch_GetType(text);
            punchpane.style.width = `${type.count * 28}px`;
        }
    } 

    punch_toogle = false;
    punch_PositionElements(isSelected);
};

punchmenu.onclick = () => {
    punch_toogle = !punch_toogle;
    
    if (punch_toogle) {
        punchpane.style.opacity = "1";
        punchpane.style.visibility = "visible";

    } else {
        punchpane.style.opacity = "0";
        punchpane.style.visibility = "hidden";
    }

    punch_PositionElements(true);
};

punchpane.onclick = () => {
    //punch_PositionElements(false);
};

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