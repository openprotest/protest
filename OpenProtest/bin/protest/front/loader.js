let db_equip = [];
let db_users = [];

document.body.onunload = () => { storeSession(); };

(function loadFiles() {
    let loader = document.createElement("div");
    loader.className = "loader";
    document.body.appendChild(loader);

    let loader_container = document.createElement("div");
    loader_container.className = "loader-container";
    loader.appendChild(loader_container);
    
    let loader_progress = document.createElement("div");
    loader_progress.className = "loader-progress";
    loader_container.appendChild(loader_progress);

    let loader_decr = document.createElement("div");
    loader_decr.className = "loader-description";
    loader.appendChild(loader_decr);

    let listStyle = [
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

    let primaryScripts = [
        "sidemenu.js",
        "window.js"
    ];

    let secondaryScripts = [
        "ipbox.js",
        "list.js",
        "console.js",
        "tabs.js"
    ];

    let tertiaryScripts = [
        "fetch.js",
        "netcalc.js",
        "passwordgen.js",
        "ping.js",
        "dnslookup.js",
        "dhcpdiscover.js",
        "traceroute.js",
        "portscan.js",
        "locateip.js",
        "maclookup.js",
        "webcheck.js",
        "speedtest.js",
        "wmi.js",
        "scripts.js",
        "scripteditor.js",
        "log.js",
        "settings.js"
    ];

    let count = 0;
    let total = listStyle.length + primaryScripts.length + secondaryScripts.length + tertiaryScripts.length;
    const callbackHandle = (status, filename)=> {
        loader_progress.style.width = 100 * ++count / total + "%";
        loader_decr.innerHTML = filename;

        if (listStyle.length + primaryScripts.length == count) { //load secondary
            for (let i = 0; i < secondaryScripts.length; i++)
                loadScript(secondaryScripts[i], callbackHandle);

        } else if (listStyle.length + primaryScripts.length + secondaryScripts.length == count) { //load tertiary
            for (let i = 0; i < tertiaryScripts.length; i++)
                loadScript(tertiaryScripts[i], callbackHandle);

        } else if (count == total) { //all done
            setTimeout(() => {
                loader.style.filter = "opacity(0)";
                setTimeout(() => { document.body.removeChild(loader); }, 200);
                setTimeout(() => { restoreSession(); }, 250); //restore previous session
            }, 200);
        }
    };

    for (let i=0; i< listStyle.length; i++)
        loadStyle(listStyle[i], callbackHandle);    

    for (let i=0; i< primaryScripts.length; i++)
        loadScript(primaryScripts[i], callbackHandle);
})();

function loadStyle(filename, callback) {
    if (document.head.querySelectorAll("link[href$='" + filename + "']").length > 0) {
        callback("exists", filename);
        return;
    }

    let csslink = document.createElement("link");
    csslink.rel = "stylesheet";
    csslink.href = filename;
    document.head.appendChild(csslink);
    
    csslink.onload = ()=> callback("done", filename);
    csslink.onerror = ()=> callback("error", filename);
}

function loadScript(filename, callback) {
    if (document.head.querySelectorAll("script[src$='" + filename + "']").length > 0) {
        callback("exists", filename);
        return;
    }

    let script = document.createElement("script");
    script.setAttribute("defer", true);
    script.src = filename;
    document.body.appendChild(script);

    script.onload = ()=> callback("done", filename);
    script.onerror = ()=> callback("error", filename);
}

function storeSession() {
    let session = [];
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

function restoreSession() {
    let session = JSON.parse(localStorage.getItem("session"));
    if (session == null || session.length == 0) return;
    //if (!confirm("Restore previous session")) return;

    for (let i = 0; i < session.length; i++) {
        let win;
        switch (session[i].class) {
            case "Fetch"        : win = new Fetch(); break;
            case "Netcalc"      : win = new Netcalc(); break;
            case "Passgen"      : win = new Passgen(); break;
            case "Ping"         : win = new Ping(session[i].args); break;
            case "DnsLookup"    : win = new DnsLookup(session[i].args); break;
            case "DhcpDiscover" : win = new DhcpDiscover(); break;
            case "TraceRoute"   : win = new TraceRoute(session[i].args); break;
            case "PortScan"     : win = new PortScan(session[i].args); break;
            case "LocateIp"     : win = new LocateIp(session[i].args); break;
            case "MacLookup"    : win = new MacLookup(session[i].args); break;
            case "WebCheck"     : win = new WebCheck(session[i].args); break;
            case "SpeedTest"    : win = new SpeedTest(session[i].args); break;
            case "Wmi"          : win = new Wmi(session[i].args); break;
            case "Scripts"      : win = new Scripts(session[i].args); break;
            case "ScriptEditor" : win = new ScriptEditor(session[i].args); break;
            case "Log"          : win = new Log(session[i].args); break;
            case "Settings"     : win = new Settings(session[i].args); break;
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