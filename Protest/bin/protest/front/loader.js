let db_equip = [], db_users = [];
let db_equip_ver = 0, db_users_ver = 0;

let loader_styles = [
    "sidemenu.css",
    "window.css",
    "tip.css",
    "button.css",
    "textbox.css",
    "checkbox.css",
    "range.css",
    "tools.css",
    //"tabs.css",
    //"wmi.css",
    //"scripts.css"
];

(function LoadStuff() {
    const loader = document.createElement("div");
    loader.className = "loader";
    document.body.appendChild(loader);

    const loader_container = document.createElement("div");
    loader_container.className = "loader-container";
    loader.appendChild(loader_container);
    
    const loader_progress = document.createElement("div");
    loader_progress.className = "loader-progress";
    loader_container.appendChild(loader_progress);

    const loader_decr = document.createElement("div");
    loader_decr.className = "loader-description";
    loader.appendChild(loader_decr);

    const primaryScripts = [
        "sidemenu.js",
        "window.js"
    ];

    const secondaryScripts = [
        "keepalive.js",
        "ipbox.js",
        "list.js",
        "console.js",
        "tabs.js"
    ];

    const tertiaryScripts = [
        "settings.js",
        "listequip.js",
        "listusers.js",
        "viewequip.js",
        "viewuser.js",
        "fetch.js",
        "passwordstrength.js",
        "gandalf.js",
        "documentation.js",
        "debitnotes.js",
        "watchdog.js",
        //"topology.js",
        "ping.js",
        "dnslookup.js",
        "dhcpdiscover.js",
        "ntpclient.js",
        "traceroute.js",
        "portscan.js",
        "locateip.js",
        "maclookup.js",
        "webcheck.js",
        "scripts.js",
        "scripteditor.js",
        "wmi.js",
        "telnet.js",
        "encoder.js",
        "netcalc.js",
        "passwordgen.js",
        "backup.js",
        "clients.js",
        "log.js",
        "guide.js",
        "filebrowser.js"
    ];

    let count = 0;
    let total = loader_styles.length + primaryScripts.length + secondaryScripts.length + tertiaryScripts.length + 2;
    const callbackHandle = (status, filename)=> {
        loader_progress.style.width = 100 * ++count / total + "%";
        loader_decr.innerHTML = filename;

        if (loader_styles.length + primaryScripts.length === count) { //load secondary
            for (let i = 0; i < secondaryScripts.length; i++)
                LoadScript(secondaryScripts[i], callbackHandle);

        } else if (loader_styles.length + primaryScripts.length + secondaryScripts.length === count) { //load tertiary
            for (let i = 0; i < tertiaryScripts.length; i++)
                LoadScript(tertiaryScripts[i], callbackHandle);

        } else if (count === total - 2) { //js is done, load db
            btnSidemenu.style.filter = "none";

            LoadEquip(callbackHandle);
            LoadUsers(callbackHandle);

        } else if (count === total) { //all done
            initKeepAlive();

            loader.style.filter = "opacity(0)";

            setTimeout(() => {
                setTimeout(() => { document.body.removeChild(loader); }, 200);
                setTimeout(() => { RestoreSession(); }, 250); //restore previous session
            }, 200);
        }
    };

    for (let i=0; i<loader_styles.length; i++)
        LoadStyle(loader_styles[i], callbackHandle);

    for (let i=0; i<primaryScripts.length; i++)
        LoadScript(primaryScripts[i], callbackHandle);

})();

function LoadStyle(filename, callback) {
    if (document.head.querySelectorAll(`link[href$='${filename}']`).length > 0) {
        callback("exists", filename);
        return;
    }

    const csslink = document.createElement("link");
    csslink.rel = "stylesheet";
    csslink.href = filename;
    document.head.appendChild(csslink);
    
    csslink.onload = ()=> callback("ok", filename);
    csslink.onerror = ()=> callback("error", filename);
}

function LoadScript(filename, callback) {
    if (document.head.querySelectorAll(`script[src$='${filename}']`).length > 0) {
        callback("exists", filename);
        return;
    }

    const script = document.createElement("script");
    script.setAttribute("defer", true);
    script.src = filename;
    document.body.appendChild(script);

    script.onload = ()=> callback("ok", filename);
    script.onerror = ()=> callback("error", filename);
}

function LoadEquip(callback) {
    const xhr = new XMLHttpRequest();
    xhr.onload = ()=> {
        let split = xhr.responseText.split(String.fromCharCode(127));
        db_equip_ver = parseInt(split[0]);
        db_equip = [];

        let i=1;
        while (i < split.length-1) {
            let len = parseInt(split[i]);
            let obj = {};
            for (let j = i + 1; j < i + len * 4; j += 4)
                obj[split[j]] = [split[j+1], split[j+2]];

            db_equip.push(obj);
            i += 1 + len * 4;
        }

        callback("ok", "equipment");
    };

    xhr.onerror = ()=> callback("error", "equipment");

    xhr.open("GET", "db/getequiptable", true);
    xhr.send();
}

function LoadUsers(callback) {
    const xhr = new XMLHttpRequest();
    xhr.onload = ()=> {
        let split = xhr.responseText.split(String.fromCharCode(127));
        db_users_ver = parseInt(split[0]);
        db_users = [];

        let i=1;
        while (i < split.length-1) {
            let len = parseInt(split[i]);
            let obj = {};
            for (let j = i + 1; j < i + len * 4; j += 4)
                obj[split[j]] = [split[j+1], split[j+2]];

            db_users.push(obj);
            i += 1 + len * 4;
        }

        callback("ok", "users");
    };

    xhr.onerror = ()=> callback("error", "users");

    xhr.open("GET", "db/getuserstable", true);
    xhr.send();
}

function StoreSession() {
    let session = [];

    if (localStorage.getItem("restore_session") === "true")
        for (let i = 0; i < $w.array.length; i++)
            session.push({
                class       : $w.array[i].constructor.name,
                args        : $w.array[i].args,
                isMaximized : $w.array[i].isMaximized,
                isMinimized : $w.array[i].isMinimized,
                position    : $w.array[i].position,
                left        : $w.array[i].win.style.left,
                top         : $w.array[i].win.style.top,
                width       : $w.array[i].win.style.width,
                height      : $w.array[i].win.style.height
            });

    localStorage.setItem("session", JSON.stringify(session));

    return session;
}

function RestoreSession() {
    let session = JSON.parse(localStorage.getItem("session"));

    if (session === null) {
        const win = new Guide("first");
        win.win.style.left = "10%";
        win.win.style.top = "10%";
        win.win.style.width = "80%";
        win.win.style.height = "80%";
    } 

    if (localStorage.getItem("restore_session") != "true") return;
    if (session == null || session.length == 0) return;    

    for (let i = 0; i < session.length; i++) {
        let win;
        switch (session[i].class) {
            case "ListEquip"        : win = new ListEquip(session[i].args); break;
            case "ListUsers"        : win = new ListUsers(session[i].args); break;
            case "Equip"            : win = new Equip(session[i].args); break;
            case "User"             : win = new User(session[i].args); break;
            case "Fetch"            : win = new Fetch(session[i].args); break;
            case "PasswordStrength" : win = new PasswordStrength(session[i].args); break;
            case "Gandalf"          : win = new Gandalf(session[i].args); break;
            case "Documentation"    : win = new Documentation(session[i].args); break;
            case "DebitNotes"       : win = new DebitNotes(session[i].args); break;
            case "Watchdog"         : win = new Watchdog(session[i].args); break;
            //case "Topology"         : win = new Topology(session[i].args); break;
            case "Ping"             : win = new Ping(session[i].args); break;
            case "DnsLookup"        : win = new DnsLookup(session[i].args); break;
            case "DhcpDiscover"     : win = new DhcpDiscover(); break;
            case "NtpClient"        : win = new NtpClient(session[i].args); break;
            case "TraceRoute"       : win = new TraceRoute(session[i].args); break;
            case "PortScan"         : win = new PortScan(session[i].args); break;
            case "LocateIp"         : win = new LocateIp(session[i].args); break;
            case "MacLookup"        : win = new MacLookup(session[i].args); break;
            case "WebCheck"         : win = new WebCheck(session[i].args); break;
            case "Scripts"          : win = new Scripts(session[i].args); break;
            case "ScriptEditor"     : win = new ScriptEditor(session[i].args); break;
            case "ScriptReport"     : win = new ScriptReport(session[i].args); break;
            case "Wmi"              : win = new Wmi(session[i].args); break;
            case "Telnet"           : win = new Telnet(session[i].args); break;
            case "Encoder"          : win = new Encoder(session[i].args); break;
            case "Netcalc"          : win = new Netcalc(); break;
            case "Passgen"          : win = new Passgen(); break;
            case "Backup"           : win = new Backup(session[i].args); break;
            case "Clients"          : win = new Clients(session[i].args); break;
            case "Log"              : win = new Log(session[i].args); break;
            case "Guide"            : win = new Guide(session[i].args); break;
            case "FileBrowser"      : win = new FileBrowser(session[i].args); break;
            case "Settings"         : win = new Settings(session[i].args); break;
        }

        if (win) {
            if (session[i].isMaximized) win.Toogle();
            if (session[i].isMinimized) win.Minimize();
            win.position = session[i].position;

            if (!$w.always_maxxed) {
                win.win.style.left   = session[i].left;
                win.win.style.top    = session[i].top;
                win.win.style.width  = session[i].width;
                win.win.style.height = session[i].height;
            }
        }
    }

}