const SUBMENU_WIDTH = 360;

const TOOLS = [
{ isGroup:true, lbl:"Inventory" },
{ lbl:"Equipment",                             ico:"res/database_equip.svgz", grp:"database", sqr:true,  f:arg=> new ListEquip({find:"",filter:"",sort:""}) },
{ lbl:"Users",                                 ico:"res/database_users.svgz", grp:"database", sqr:true,  f:arg=> new ListUsers({find:"",filter:"",sort:""}) },
{ lbl:"Fetch",                                 ico:"res/fetch.svgz",          grp:"database", sqr:true,  f:arg=> new Fetch(arg) },
{ lbl:"Fetch equipment from IP range",         ico:"res/fetch.svgz",          grp:"database", sqr:false, f:arg=> new Fetch("equipip")},
{ lbl:"Fetch equipment from Domain Controler", ico:"res/fetch.svgz",          grp:"database", sqr:false, f:arg=> new Fetch("equipdc")},
{ lbl:"Fetch users from Domain Controller",    ico:"res/fetch.svgz",          grp:"database", sqr:false, f:arg=> new Fetch("usersdc")},
{ lbl:"Import from another Pro-test",          ico:"res/fetch.svgz",          grp:"database", sqr:false, f:arg=> new Fetch("protest")},
{ lbl:"New equipment",                         ico:"res/new_equip.svgz",      grp:"database", sqr:true,  f:arg=> new Equip(null) },
{ lbl:"New user",                              ico:"res/new_user.svgz",       grp:"database", sqr:true,  f:arg=> new User(null) },
{ lbl:"Password strength",                     ico:"res/strength.svgz",       grp:"database", sqr:true,  f:arg=> new PasswordStrength({find:"",sort:""}) },
{ lbl:"Gandalf",                               ico:"res/gandalf.svgz",        grp:"database", sqr:false, f:arg=> new Gandalf() },

{ isGroup:true, lbl:"Documentation" },
{ lbl:"Documentation",      ico:"res/documentation.svgz",  grp:"documentation", sqr:true,  f:arg=> new Documentation() },
{ lbl:"Debit notes",        ico:"res/charges.svgz",        grp:"debitnotes",    sqr:true,  f:arg=> new DebitNotes() },
{ lbl:"Watchdog",           ico:"res/watchdog.svgz",       grp:"watchdog",      sqr:true,  f:arg=> new Watchdog() },

{ isGroup:true, lbl:"Tools and utilities" },
{ lbl:"Ping",               ico:"res/ping.svgz",           grp:"utilities", sqr:true,  f:arg=> new Ping(arg) },
{ lbl:"ARP Ping",           ico:"res/ping.svgz",           grp:"utilities", sqr:false, f:arg=> new Ping({entries:[],timeout:500,method:"arp",moveToBottom:false}) },
{ lbl:"DNS lookup",         ico:"res/dns.svgz",            grp:"utilities", sqr:true,  f:arg=> new DnsLookup(arg) },
{ lbl:"DHCP discover",      ico:"res/dhcp.svgz",           grp:"utilities", sqr:true,  f:arg=> new DhcpDiscover(arg) },
{ lbl:"NTP client",         ico:"res/clock.svgz",          grp:"utilities", sqr:true,  f:arg=> new NtpClient(arg) },
{ lbl:"Trace route",        ico:"res/traceroute.svgz",     grp:"utilities", sqr:true,  f:arg=> new TraceRoute(arg) },
{ lbl:"TCP port scan",      ico:"res/portscan.svgz",       grp:"utilities", sqr:true,  f:arg=> new PortScan(arg) },
{ lbl:"Locate IP",          ico:"res/locate.svgz",         grp:"utilities", sqr:true,  f:arg=> new LocateIp(arg) },
{ lbl:"MAC lookup",         ico:"res/maclookup.svgz",      grp:"utilities", sqr:true,  f:arg=> new MacLookup(arg) },
{ lbl:"Website check",      ico:"res/websitecheck.svgz",   grp:"utilities", sqr:true,  f:arg=> new WebCheck(arg) },
//{ lbl:"Speed test",         ico:"res/speedtest.svgz",      grp:"utilities", sqr:true,  f:arg=> new SpeedTest() },

{ lbl:"Scripts",            ico:"res/scripts.svgz",       grp:"scripts",   sqr:true,  f:arg=> new Scripts() },
{ lbl:"Script reports",     ico:"res/reportfile.svgz",    grp:"scripts",   sqr:false, f:arg=> new Scripts("reports") },
{ lbl:"Ongoing scripts",    ico:"res/ongoingscript.svgz", grp:"scripts",   sqr:false, f:arg=> new Scripts("ongoing") },
{ lbl:"WMI console",        ico:"res/wmi.svgz",           grp:"wmi",       sqr:true,  f:arg=> new Wmi() },
{ lbl:"Telnet",             ico:"res/telnet.svgz",        grp:"telnet",    sqr:true,  f:arg=> new Telnet() },
//{ lbl:"Secure shell",       ico:"res/ssh.svgz",           grp:"telnet",    sqr:true,  f:arg=> new Window() },
{ lbl:"Encoder",            ico:"res/encoder.svgz",       grp:"*",         sqr:true,  f:arg=> new Encoder() },
{ lbl:"Network calculator", ico:"res/netcalc.svgz",       grp:"utilities", sqr:true,  f:arg=> new Netcalc(arg) },
{ lbl:"Password generator", ico:"res/passgen.svgz",       grp:"*",         sqr:true,  f:arg=> new Passgen() },
//{ lbl:"Tasks",              ico:"res/task.svgz",          grp:"database",    sqr:true,  f:arg=> new Tasks() },
//{ lbl:"Mapped drives",      ico:"res/mappeddrive.svgz",   grp:"domainusers", sqr:true,  f:arg=> new MappedDrives() },

{ isGroup:true, lbl:"Manage Pro-test and help" },
{ lbl:"Backup",             ico:"res/backup.svgz",        grp:"backup",      sqr:true,  f:arg=> new Backup() },
{ lbl: "Pro-test clients",  ico: "res/ptclients.svgz",    grp:"manageusers", sqr:true,  f:arg=> new Clients() },
{ lbl: "Pro-test access control", ico: "res/unlock.svgz", grp:"manageusers", sqr:false, f:arg=> new Clients("acl") },
{ lbl:"Log",                ico:"res/log.svgz",           grp:"log",         sqr:true,  f:arg=> new Log() },
{ lbl:"User guide",         ico:"res/userguide.svgz",     grp:"*", sqr:true,  f:arg=> new Guide() },
{ lbl:"Screen capture",     ico:"res/screencapture.svgz", grp:"*", sqr:false, f:arg=> btnScreenCapture.onclick() },
{ lbl:"Settings",           ico:"res/tool02.svgz",        grp:"*", sqr:false, f:arg=> new Settings() },
{ lbl:"Appearrance",        ico:"res/tv.svgz",            grp:"*", sqr:false, f:arg=> new Settings() },
//{ lbl:"Menu icons",         ico:"res/desktop.svgz",       grp:"*", sqr:false, f:arg=> new Settings("icons") },
{ lbl:"Session",            ico:"res/hourglass.svgz",     grp:"*", sqr:false, f:arg=> new Settings("session") },
{ lbl:"Update",             ico:"res/update.svgz",        grp:"*", sqr:false, f:arg=> new Settings("update") },
{ lbl:"License",            ico:"res/gpl.svgz",           grp:"*", sqr:false, f:arg=> new Settings("legal") },
{ lbl:"About",              ico:"res/logo.svgz",          grp:"*", sqr:false, f:arg=> new Settings("about") },
{ lbl:"Logout",             ico:"res/logoff.svgz",        grp:"*", sqr:false, f:arg=> btnLogout.onclick() },
];

let AUTHORIZATION = {};

let sidemenu_dynamicicon = false;

let sidemenu_isopen = false;
let sidemenu_index = -1;
let sidemenu_list = [];
let sidemenu_session = [];

let sidemenu_lastShiftPress = 0;
let lastSearchValue = "";

//SideMenu_Update("");

btnSidemenu.onclick = event => { if (event.button == 0) SideMenu_Open(); };

document.body.addEventListener("mousemove", event => {
    if (!sidemenu_dynamicicon) return;
    if (onMobile) return;
    if (sidemenu_isopen) return;

    let y = 0;
    if (event.x < 128) y = event.y - 32;
    if (event.x > 96) y *= (192 - event.x) / 96;

    if (y < 8) {
        y = 0;
        btnSidemenu.style.borderRadius = "4px 8px 48px 8px";
        btnSidemenu.style.height = "48px";
        imgSearch.style.transform = "none";

    } else if (y > container.clientHeight - 72) {
        y = container.clientHeight - 49;
        btnSidemenu.style.borderRadius = "8px 48px 8px 6px";
        btnSidemenu.style.height = "48px";
        imgSearch.style.transform = "translate(31px,6px) rotate(90deg)";

    } else {
        btnSidemenu.style.height = "64px";
        btnSidemenu.style.borderRadius = "14px 40px 40px 14px";
        imgSearch.style.transform = "translate(14px,4px) rotate(40deg)";
    }

    btnSidemenu.style.transform = "translateY(" + y + "px)";
});

container.onclick = event => {
    if (event == null) return;
    if (event.clientX > 2) return;

    if (sidemenu_dynamicicon) SideMenu_Open();
    else if (event.clientY < window.innerHeight / 4 && event.clientY > 0) SideMenu_Open();
};

document.body.onkeyup = event => {
    if (event.code == "ShiftLeft") {
        if (Date.now() - sidemenu_lastShiftPress < 500) {
            sidemenu_lastShiftPress = 0;
            Toogle();
        } else {
            sidemenu_lastShiftPress = Date.now();
        }
    } else
        sidemenu_lastShiftPress = 0;
};

txtSearch.onkeydown = event => {
    if (event.keyCode == 27) { //esc
        event.stopPropagation();
        if (txtSearch.value.length > 0) {
            txtSearch.value = "";
            SideMenu_Update("");
        } else {
            SideMenu_Close();
        }
        return;
    }

    if (event.keyCode == 13) { //enter
        if (event.ctrlKey) {
            sidemenu_list[sidemenu_index].onmousedown(null);
            txtSearch.focus();
            setTimeout(txtSearch.focus(), 10);
        } else {
            if (sidemenu_index > -1)
                sidemenu_list[sidemenu_index].onclick(event);
        }
    }

    if (event.keyCode == 38) { //up
        event.preventDefault();

        if (sidemenu_list.length > 0) {
            if (sidemenu_index > -1) sidemenu_list[sidemenu_index].style.backgroundColor = "rgb(208,208,208)";
            sidemenu_index--;
            if (sidemenu_index < 0) sidemenu_index = sidemenu_list.length - 1;
            if (sidemenu_index > -1) sidemenu_list[sidemenu_index].style.backgroundColor = "var(--select-color)";
        }
    }

    if (event.keyCode == 40) { //down
        event.preventDefault();

        if (sidemenu_list.length > 0) {
            if (sidemenu_index > -1) sidemenu_list[sidemenu_index].style.backgroundColor = "rgb(208,208,208)";
            sidemenu_index++;
            if (sidemenu_index >= sidemenu_list.length) sidemenu_index = 0;
            sidemenu_list[sidemenu_index].style.backgroundColor = "var(--select-color)";
        }
    }

    if (sidemenu_list.length > 0 && (event.keyCode == 38 || event.keyCode == 40)) { //scroll into view
        if (sidemenu_list[sidemenu_index].offsetTop - lstSideMenu.scrollTop > lstSideMenu.clientHeight - sidemenu_list[sidemenu_index].clientHeight)
            lstSideMenu.scrollTop = -lstSideMenu.clientHeight + sidemenu_list[sidemenu_index].clientHeight + sidemenu_list[sidemenu_index].offsetTop;
        if (sidemenu_list[sidemenu_index].offsetTop - lstSideMenu.scrollTop < 0)
            lstSideMenu.scrollTop = sidemenu_list[sidemenu_index].offsetTop;
    }

};

txtSearch.oninput = event => {
    if (lastSearchValue == txtSearch.value.trim()) return;

    lastSearchValue = txtSearch.value.trim();

    let current = txtSearch.value;
    setTimeout(() => {
        if (current != txtSearch.value) return;
        SideMenu_Update(txtSearch.value.toLocaleLowerCase());
    }, 200);
};

btnCloseSidemenu.onclick = event => {
    event.stopPropagation();

    if (txtSearch.value.length > 0) {
        txtSearch.value = "";
        SideMenu_Update("");
    } else
        SideMenu_Close();
};

btnScreenCapture.onclick = () => {
    SideMenu_Close();
    new ScreenCapture();
};

btnSettings.onclick = () => {
    SideMenu_Close();
    new Settings();
};

btnLogout.onclick = () => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
        if (xhr.readyState==4 && xhr.status==200)
            if (xhr.responseText == "ok") location.reload();
    };
    xhr.open("GET", "logout");
    xhr.send();
};

cap.onclick = () => { SideMenu_Close(); };

function NewEquip() {
    let win = new Equip();
    return win;
}

function NewUser() {
    let win = new User();
    return win;
}

function SideMenu_Update(filter) {
    lstSideMenu.innerHTML = "";
    sidemenu_list = [];
    sidemenu_index = -1;

    if (filter.length == 0) { //menu
        for (let i = 0; i < TOOLS.length; i++) {
            if (TOOLS[i].isGroup) {
                if (lstSideMenu.childNodes.length > 0 && lstSideMenu.childNodes[lstSideMenu.childNodes.length - 1].className === "")
                    lstSideMenu.removeChild(lstSideMenu.childNodes[lstSideMenu.childNodes.length - 1]);

                CreateGroupLabel(TOOLS[i].lbl);
                continue;
            }

            if (!TOOLS[i].sqr) continue;
            if (TOOLS[i].grp != "*" && AUTHORIZATION[TOOLS[i].grp] == 0) continue;

            const item = CreateSquareItem(TOOLS[i].lbl, TOOLS[i].ico, TOOLS[i].f);
            sidemenu_list.push(item);
            lstSideMenu.appendChild(item);
        }

    } else {
        for (let i = 0; i < TOOLS.length; i++)
            if (TOOLS[i].lbl.toLocaleLowerCase().indexOf(filter) > -1) {
                if (TOOLS[i].grp != "*" && AUTHORIZATION[TOOLS[i].grp] == 0) continue;

                const item = CreateSideItem(TOOLS[i].lbl, TOOLS[i].ico, "", "", TOOLS[i].f);
                sidemenu_list.push(item);
                lstSideMenu.appendChild(item);
            }
    }

    if (filter.length == 0) return;

    let keywords = filter.toLowerCase().split(" ");

    for (let i = 0; i < db_equip.length; i++) { //find equip
        let match = true;

        for (let j = 0; j < keywords.length; j++) {
            let flag = false;
            for (let k in db_equip[i]) {
                if (db_equip[i][k][0].toLowerCase().indexOf(keywords[j]) > -1)
                    flag = true;
            }
            if (!flag) {
                match = false;
                continue;
            }
        }

        if (!match) continue;

        let current = db_equip[i];
        const f = () => {
            for (let j = 0; j < $w.array.length; j++)
                if ($w.array[j] instanceof Equip && $w.array[j].filename == current[".FILENAME"][0]) {
                    $w.array[j].Pop();
                    return $w.array[j];
                }
            return new Equip(current[".FILENAME"][0]);
        };

        let label = current.hasOwnProperty("NAME") ? current["NAME"][0] : (current.hasOwnProperty("HOSTNAME") ? current["HOSTNAME"][0] : "");
        let type = current.hasOwnProperty("TYPE") ? current["TYPE"][0] : "";
        let ip = current.hasOwnProperty("IP") ? current["IP"][0] : "";

        let item = CreateSideItem(label, GetEquipIcon([type]), type, ip, f);
        sidemenu_list.push(item);
        lstSideMenu.appendChild(item);
    }

    for (let i = 0; i < db_users.length; i++) { //find users
        let match = true;

        for (let j = 0; j < keywords.length; j++) {
            let flag = false;
            for (let k in db_users[i]) {
                if (db_users[i][k][0].toLowerCase().indexOf(keywords[j]) > -1)
                    flag = true;
            }
            if (!flag) {
                match = false;
                continue;
            }
        }

        if (!match) continue;

        let current = db_users[i];
        const f = () => {
            for (let j = 0; j < $w.array.length; j++)
                if ($w.array[j] instanceof User && $w.array[j].filename == current[".FILENAME"][0]) {
                    $w.array[j].Pop();
                    return $w.array[j];
                }
            return new User(current[".FILENAME"][0]);
        };

        let label = current.hasOwnProperty("DISPLAY NAME") ? current["DISPLAY NAME"][0] : (current.hasOwnProperty("TITLE") ? current["TITLE"][0] : "");
        let department = current.hasOwnProperty("DEPARTMENT") ? current["DEPARTMENT"][0] : "";
        let contact = current.hasOwnProperty("TELEPHONE NUMBER") ? current["TELEPHONE NUMBER"][0] : "";

        let item = CreateSideItem(label, "res/user.svgz", department, contact, f);
        sidemenu_list.push(item);
        lstSideMenu.appendChild(item);
    }

    if (sidemenu_list.length > 0) {
        sidemenu_index = 0;
        sidemenu_list[0].style.backgroundColor = "var(--select-color)";
    }
}

function CreateSideItem(label, icon, t1, t2, func) {
    let item = document.createElement("div");
    item.style.backgroundImage = "url(" + icon + ")";
    item.className = "sidemenu-item";

    let divLabel = document.createElement("div");
    divLabel.innerHTML = label;
    item.appendChild(divLabel);

    if (t1.length > 0) {
        let divDescription = document.createElement("div");
        divDescription.innerHTML = t1;
        item.appendChild(divDescription);
    }

    if (t2.length > 0) {
        let divMore = document.createElement("div");
        divMore.innerHTML = t2;
        item.appendChild(divMore);
    }

    CreateItemEvents(item, func);

    return item;
}

function CreateGroupLabel(name) {
    const label = document.createElement("div");
    label.innerHTML = name + ":";
    label.style.padding = "4px 0px 2px 8px";
    label.style.fontWeight = "700";
    label.style.backgroundColor = "rgb(32,32,32)";
    label.style.position = "sticky";
    label.style.top = "0";
    lstSideMenu.appendChild(label);
}

function CreateSquareItem(label, icon, func) {
    let item = document.createElement("div");
    item.style.backgroundImage = "url(" + icon + ")";
    item.className = "sidemenu-square-item";

    let divLabel = document.createElement("div");
    divLabel.innerHTML = label;
    item.appendChild(divLabel);

    CreateItemEvents(item, func);

    return item;
}

function CreateItemEvents(item, func) {
    item.onclick = event => {
        event.stopPropagation();
        SideMenu_Close();
        txtSearch.value = "";
        SideMenu_Update("");
        func();
    };

    item.onmousedown = event => {
        if (event !== null && event.button != 1) return;
        if (event !== null) event.preventDefault();

        //minimize other windows
        if (sidemenu_session.length == 0)
            for (let i = 0; i < $w.array.length; i++)
                if (!$w.array[i].isMinimized) $w.array[i].Minimize(true);

        //check if listed already
        let listed = false;
        let win = func();
        if (!sidemenu_session.includes(win))
            sidemenu_session.push(win);

        //reposition
        let w = Math.ceil(Math.sqrt(sidemenu_session.length));
        let h;
        for (h = w; h > 0; h--)
            if (w * h < sidemenu_session.length) break;
        h++;

        for (let i = 0; i < sidemenu_session.length; i++)
            sidemenu_session[i].win.style.transition = ".2s";

        if (sidemenu_session.length > 1)
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    let index = y * w + x;
                    if (index >= sidemenu_session.length) break;
                    sidemenu_session[index].win.style.left = 100 * x / w + "%";
                    sidemenu_session[index].win.style.top = 100 * y / h + "%";
                    sidemenu_session[index].win.style.width = (100 / w) + "%";
                    sidemenu_session[index].win.style.height = (100 / h) + "%";
                    sidemenu_session[index].isMaximized = false;
                }

        setTimeout(() => {
            for (let i = 0; i < sidemenu_session.length; i++)
                sidemenu_session[i].AfterResize();
        }, 400);
    };
}

function SideMenu_Open() {
    cap.style.visibility = "visible";
    sidemenu.style.transform = "translateX(0)";

    btnSidemenu.style.borderRadius = "0";
    btnSidemenu.style.boxShadow = "none";

    btnSidemenu.style.transform = "none";
    btnSidemenu.style.height = "48px";

    imgSearch.style.transform = "scale(1.25)";
    txtSearch.style.visibility = "visible";
    btnCloseSidemenu.style.visibility = "visible";

    txtSearch.focus();
    setTimeout(() => txtSearch.focus(), 40);
    setTimeout(() => txtSearch.focus(), 80);

    sidemenu_isopen = true;
}

function SideMenu_Close() {
    for (let i = 0; i < sidemenu_session.length; i++)
        sidemenu_session[i].win.style.transition = "none";

    sidemenu_session = [];
    lastSearchValue = "";

    cap.style.visibility = "hidden";
    sidemenu.style.transform = "translateX(calc(-100% - 8px))";

    btnSidemenu.style.borderRadius = "4px 8px 48px 8px";
    btnSidemenu.style.boxShadow = "rgba(0,0,0,.2) 2px 2px 2px";
    imgSearch.style.transform = "none";
    txtSearch.style.visibility = "hidden";
    btnCloseSidemenu.style.visibility = "hidden";

    sidemenu_isopen = false;

    setTimeout(() => {
        txtSearch.value = "";
        SideMenu_Update("");
    }, 100);
}

function Toogle() {
    if (sidemenu_isopen)
        SideMenu_Close();
    else
        SideMenu_Open();
}