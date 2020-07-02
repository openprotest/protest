const EQUIP_ORDER = [
    "NAME", "TYPE",

    ["res/portscan.svgz", "Network"],
    "IP", "IPV6", "MASK", "HOSTNAME", "MAC ADDRESS", "DHCP ENABLED", "PORTS", "NETWORK ADAPTER SPEED",

    [".", "Device"],
    "MANUFACTURER", "MODEL", "SERIAL NUMBER", "CHASSI TYPE", "DESCRIPTION",

    ["res/motherboard.svgz", "Motherboard"],
    "MOTHERBOARD", "MOTHERBOARD MANUFACTURER", "MOTHERBOARD SERIAL NUMBER", "BIOS",

    ["res/cpu.svgz", "Processor"],
    "PROCESSOR", "CPU CORES", "CPU FREQUENCY", "CPU ARCHITECTURE", "CPU CACHE", "L1 CACHE", "L2 CACHE", "L3 CACHE",

    ["res/ram.svgz", "Memory"],
    "MEMORY", "TOTAL RAM", "RAM SLOT", "RAM SPEED", "RAM SLOT USED", "RAM TYPE", "RAM FORM FACTOR",

    ["res/diskdrive.svgz", "Disk Drive"],
    "DISK DRIVE", "PHYSICAL DISK", "LOGICAL DISK",

    ["res/videocard.svgz", "Video Card"],
    "VIDEO CONTROLLER", "VIDEO DRIVER",

    ["res/os.svgz", "Operating System"],
    "OPERATING SYSTEM", "OS ARCHITECTURE", "OS VERSION", "OS BUILD", "SERVICE PACK", "OS SERIAL NO", "OS INSTALL DATE",

    ["res/user.svgz", "Owner"],
    "OWNER", "OWNER FULLNAME", "LOCATION",

    ["res/credencial.svgz", "Credential"],
    "DOMAIN", "USERNAME", "PASSWORD", "LA PASSWORD", "SSH USERNAME", "SSH PASSWORD"
];

class Equip extends Window {
    constructor(filename) {
        super([56,56,56]);

        this.setTitle("Equipment");
        this.setIcon("res/gear.svgz");

        this.args = filename;
        this.entry = db_equip.find(e => e[".FILENAME"][0] === filename);
        this.filename = filename;
        this.pingButtons = {};

        if (!this.entry) {
            this.btnPopout.style.visibility = "hidden";
            this.ConfirmBox("Equipment do not exist.", true).addEventListener("click", () => this.Close());
            this.AfterResize = () => {};
            return;
        }

        this.AddCssDependencies("dbview.css");

        if (!this.entry.hasOwnProperty("NAME") || this.entry["NAME"][0].length == 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.entry["NAME"][0]);

        this.setIcon(GetEquipIcon(this.entry["TYPE"]));

        this.content.style.overflowY = "auto";

        this.buttons = document.createElement("div");
        this.buttons.className = "db-buttons";
        this.content.appendChild(this.buttons);

        const btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        this.buttons.appendChild(btnEdit);
        btnEdit.onclick = () => this.Edit();

        const btnFetch = document.createElement("input");
        btnFetch.type = "button";
        btnFetch.value = "Fetch";
        this.buttons.appendChild(btnFetch);
        btnFetch.onclick = () => this.Fetch();

        const btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.value = "Delete";
        this.buttons.appendChild(btnDelete);
        btnDelete.onclick = () => this.Delete();

        this.sidetools = document.createElement("div");
        this.sidetools.className = "db-sidetools";
        this.content.appendChild(this.sidetools);

        this.scroll = document.createElement("div");
        this.scroll.className = "db-scroll";
        this.content.appendChild(this.scroll);

        /*const fade = document.createElement("div");
        fade.style.position = "sticky";
        fade.style.top = "0";
        fade.style.height = "16px";
        fade.style.background = "linear-gradient(rgb(56, 56, 56), transparent)";
        this.scroll.appendChild(fade);*/

        this.live = document.createElement("div");
        this.live.className = "db-live";
        this.scroll.appendChild(this.live);

        this.liveinfo = document.createElement("div");
        this.liveinfo.className = "db-liveinfo";
        this.scroll.appendChild(this.liveinfo);

        this.properties = document.createElement("div");
        this.properties.className = "db-proberties";
        this.scroll.appendChild(this.properties);

        this.rightside = document.createElement("div");
        this.rightside.className = "db-rightside";
        this.content.appendChild(this.rightside);

        this.InitializeComponent();
        this.LiveInfo();
        setTimeout(() => { this.AfterResize(); }, 200);
    }

    AfterResize() { //override
        if (this.content.getBoundingClientRect().width < 800) {
            this.sidetools.style.width = "36px";
            this.scroll.style.left = "56px";
            this.buttons.style.left = "56px";
        } else {
            this.sidetools.style.width = "";
            this.scroll.style.left = "";
            this.buttons.style.left = "";
        }

        if (this.content.getBoundingClientRect().width > 1440) {
            if (this.rightside.style.display === "block") return;
            this.rightside.style.display = "block";
            this.rightside.classList.add("db-rightside");

            this.rightside.appendChild(this.live);
            this.rightside.appendChild(this.liveinfo);
        } else {
            if (this.rightside.style.display === "none") return;
            this.rightside.style.display = "none";
            this.rightside.classList.remove("db-rightside");

            this.scroll.appendChild(this.live);
            this.scroll.appendChild(this.liveinfo);
            this.scroll.appendChild(this.properties);
        }
    }

    InitializeComponent() {
        let done = [];
        this.properties.innerHTML = "";

        for (let i = 0; i < EQUIP_ORDER.length; i++)
            if (Array.isArray(EQUIP_ORDER[i])) {
                this.AddGroup((EQUIP_ORDER[i][0] === ".") ? GetEquipIcon(this.entry["TYPE"]) : EQUIP_ORDER[i][0], EQUIP_ORDER[i][1]);
            } else {
                if (!this.entry.hasOwnProperty(EQUIP_ORDER[i])) continue;
                const newProperty = this.AddProperty(EQUIP_ORDER[i], this.entry[EQUIP_ORDER[i]][0], this.entry[EQUIP_ORDER[i]][1]);
                if (done != null) done.push(EQUIP_ORDER[i]);
                this.properties.appendChild(newProperty);
            }

        this.AddGroup("res/other.svgz", "Other");
        let isGroupEmpty = true;
        for (let k in this.entry)
            if (!done.includes(k, 0) && !k.startsWith(".")) {
                if (!this.entry.hasOwnProperty(k)) continue;
                const newProperty = this.AddProperty(k, this.entry[k][0], this.entry[k][1]);
                if (done != null) done.push(k);
                this.properties.appendChild(newProperty);

                isGroupEmpty = false;
            }

        if (isGroupEmpty && this.properties.childNodes[this.properties.childNodes.length - 1].className == "db-property-group")
            this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length - 1]);

        if (this.entry.IP) { //IPs
            let ips = this.entry.IP[0].split(";").map(o=>o.trim());
            for (let i = 0; i < ips.length; i++) {
                if (ips[i].length === 0) continue;

                const button = this.LiveButton("res/ping.svgz", ips[i]);
                const div = button.div;
                const roundtrip = button.sub;

                this.live.appendChild(div);

                this.pingButtons[ips[i]] = button;

                div.onclick = ()=> {
                    let winPing = null;
                    for (let i = $w.array.length - 1; i > -1; i--)
                        if ($w.array[i] instanceof Ping) {
                            winPing = $w.array[i];
                            break;
                        }

                    if (winPing === null) {
                        new Ping().Filter(ips[i]);
                    } else {
                        winPing.Filter(ips[i]);
                        winPing.BringToFront();
                    }
                };
            }
        }

        if (this.entry.hasOwnProperty("LOGICAL DISK")) { //Disks
            const disks = this.entry["LOGICAL DISK"][0].split(":").map(o => o.trim());
            for (let i = 1; i < disks.length; i += 4) {
                const button = this.LiveButton("res/diskdrive.svgz", `Drive ${disks[i]}`);
                const div = button.div;
                const usage = button.sub;

                this.live.appendChild(div);

                usage.style.width = "72px";
                usage.style.borderRadius = "2px";
                usage.style.boxShadow = "#202020 0 0 0 1px inset, #202020 0 0 0 inset";
                usage.innerHTML = "&nbsp;";
                div.appendChild(usage);

                usage.style.transition = "box-shadow .4s";
                setTimeout(() => {
                    let used = parseInt(disks[i+1]);
                    let total = parseInt(disks[i+2]);
                    usage.style.boxShadow = `#202020 0 0 0 1px inset, #404040 ${72*used/total}px 0 0  inset`;
                }, 400);

                div.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200) if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&smb&" + this.filename + "&" + disks[i] + "$", true);
                    xhr.send();
                };
            }
        }

        if (this.entry.hasOwnProperty("OWNER")) { //users
            let owners = this.entry["OWNER"][0].split(";").map(o => o.trim());
            for (let i = 0; i < owners.length; i++) {
                let owner = (owners[i].indexOf("\\") > -1) ? owners[i].split("\\")[1] : owners[i];
                if (owner.length === 0) continue;

                for (let j = 0; j < db_users.length; j++) {
                    if (db_users[j].hasOwnProperty("USERNAME") && db_users[j]["USERNAME"][0] == owner) {
                        let filename = db_users[j][".FILENAME"][0];

                        const btnUser = this.LiveButton("res/user.svgz", owner);
                        btnUser.div.onclick = ()=> {
                            for (let k = 0; k < $w.array.length; k++)
                                if ($w.array[k] instanceof User && $w.array[k].filename == filename) {
                                    $w.array[k].Minimize(); //minimize/restore
                                    return;
                                }
                            if (db_users[j][".FILENAME"][0] == filename) new User(db_users[j][".FILENAME"][0]);
                        };
                        break;
                    }
                }

            }
        }

        if (this.entry.hasOwnProperty("MAC ADDRESS")) {
            const btnWoL = this.SideButton("res/wol.svgz", "Wake on LAN");
            this.sidetools.appendChild(btnWoL);
            btnWoL.onclick = () => {
                if (btnWoL.hasAttribute("busy")) return;
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4) btnWoL.removeAttribute("busy");
                    if (xhr.readyState == 4 && xhr.status == 200) //OK
                        if (xhr.responseText == "ok") this.ConfirmBox("Magic package has been sent successfully.", true);
                        else this.ConfirmBox(xhr.responseText, true);
                    else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                btnWoL.setAttribute("busy", true);
                xhr.open("GET", "wakeup&file=" + this.filename, true);
                xhr.send();
            };
        }

        if (this.entry.hasOwnProperty("PORTS")) {
            let ports = this.entry["PORTS"][0].split(";").map(o => parseInt(o.trim()));

            if (ports.includes(445) && this.entry.hasOwnProperty("OPERATING SYSTEM")) { //wmi service 445

                const btnOff = this.SideButton("res/turnoff.svgz", "Power off");
                this.sidetools.appendChild(btnOff);
                btnOff.onclick = () => {
                    if (btnOff.hasAttribute("busy")) return;
                    this.ConfirmBox("Are you sure you want to power off this device?").addEventListener("click", () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.readyState == 4) btnOff.removeAttribute("busy");
                            if (xhr.readyState == 4 && xhr.status == 200)
                                if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0)
                                this.ConfirmBox("Server is unavailable.", true);
                        };
                        btnOff.setAttribute("busy", true);
                        xhr.open("GET", "shutdown&file=" + this.filename, true);
                        xhr.send();
                    });
                };

                const btnReboot = this.SideButton("res/restart.svgz", "Reboot");
                this.sidetools.appendChild(btnReboot);
                btnReboot.onclick = () => {
                    if (btnReboot.hasAttribute("busy")) return;
                    this.ConfirmBox("Are you sure you want to reboot this device?").addEventListener("click", () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.readyState == 4) btnReboot.removeAttribute("busy");
                            if (xhr.readyState == 4 && xhr.status == 200)
                                if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0)
                                this.ConfirmBox("Server is unavailable.", true);
                        };
                        btnReboot.setAttribute("busy", true);
                        xhr.open("GET", "reboot&file=" + this.filename, true);
                        xhr.send();
                    });
                };

                const btnLogoff = this.SideButton("res/logoff.svgz", "Log off");
                this.sidetools.appendChild(btnLogoff);
                btnLogoff.onclick = () => {
                    if (btnLogoff.hasAttribute("busy")) return;
                    this.ConfirmBox("Are you sure you want to log off this device?").addEventListener("click", () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.readyState == 4) btnLogoff.removeAttribute("busy");
                            if (xhr.readyState == 4 && xhr.status == 200)
                                if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0)
                                this.ConfirmBox("Server is unavailable.", true);
                        };
                        btnLogoff.setAttribute("busy", true);
                        xhr.open("GET", "logoff&file=" + this.filename, true);
                        xhr.send();
                    });
                };
                
                if (this.entry.hasOwnProperty("IP")) {
                    const btnProcesses = this.SideButton("res/console.svgz", "Processes");
                    this.sidetools.appendChild(btnProcesses);
                    btnProcesses.onclick = () => {
                        let win = new Wmi({ target:this.entry["IP"][0].split(";")[0].trim(), query:"SELECT CreationDate, ExecutablePath, Name, ProcessId \nFROM Win32_Process"});
                        win.setIcon("res/console.svgz");
                        if (!this.entry.hasOwnProperty("NAME") || this.entry["NAME"][0].length == 0)
                            win.setTitle("[untitled] - Processes");
                        else
                            win.setTitle(this.entry["NAME"][0] + " - Processes");
                    };

                    const btnServices = this.SideButton("res/service.svgz", "Services");
                    this.sidetools.appendChild(btnServices);
                    btnServices.onclick = () => {
                        let win = new Wmi({target: this.entry["IP"][0].split(";")[0].trim(), query:"SELECT DisplayName, Name, ProcessId, State \nFROM Win32_Service"});
                        win.setIcon("res/service.svgz");
                        if (!this.entry.hasOwnProperty("NAME") || this.entry["NAME"][0].length == 0)
                            win.setTitle("[untitled] - Services");
                        else
                            win.setTitle(this.entry["NAME"][0] + " - Services");
                    };
                }

                const btnMgmt = this.SideButton("res/compmgmt.svgz", "PC Management"); //compmgmt
                this.sidetools.appendChild(btnMgmt);
                btnMgmt.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&cmg&" + this.filename, true);
                    xhr.send();
                };

                let btnPse = this.SideButton("res/psremote.svgz", "PS Remoting"); //psexec
                this.sidetools.appendChild(btnPse);
                btnPse.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&pse&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports.includes(22)) { //ssh
                let btnSsh = this.SideButton("res/ssh.svgz", "Secure shell");
                this.sidetools.appendChild(btnSsh);
                btnSsh.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&ssh&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports.includes(445) && this.entry.hasOwnProperty("IP")) { //smb
                const btnSmb = this.SideButton("res/shared.svgz", "SMB");
                this.sidetools.appendChild(btnSmb);
                btnSmb.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&smb&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports.includes(80) && this.entry.hasOwnProperty("IP")) { //http
                const btnAction = this.SideButton("res/earth.svgz", "HTTP");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("http://" + this.entry["IP"][0].split(";")[0].trim());
            }

            if (ports.includes(443) && this.entry.hasOwnProperty("IP")) { //https
                const btnAction = this.SideButton("res/earth.svgz", "HTTPs");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("https://" + this.entry["IP"][0].split(";")[0].trim());
            }

            if (ports.includes(21) && this.entry.hasOwnProperty("IP")) { //ftp
                const btnAction = this.SideButton("res/shared.svgz", "FTP");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("ftp://" + this.entry["IP"][0].split(";")[0].trim());
            }

            if (ports.includes(989) && this.entry.hasOwnProperty("IP")) { //ftps
                const btnAction = this.SideButton("res/shared.svgz", "FTPs");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("ftps://" + this.entry["IP"][0].split(";")[0].trim());
            }

            if (ports.includes(3389) && this.entry.hasOwnProperty("IP")) { //rdp
                let btnRdp = this.SideButton("res/rdp.svgz", "Remote desktop");
                this.sidetools.appendChild(btnRdp);
                btnRdp.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&rdp&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports.includes(5900) && this.entry.hasOwnProperty("IP")) { //uvnc
                let btnUvnc = this.SideButton("res/uvnc.svgz", "UltraVNC");
                this.sidetools.appendChild(btnUvnc);
                btnUvnc.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&vnc&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports.includes(9100) && this.entry.hasOwnProperty("IP")) { //print test
                let btnPrintTest = this.SideButton("res/printer.svgz", "Print test page");
                this.sidetools.appendChild(btnPrintTest);
                btnPrintTest.onclick = () => {
                    if (btnPrintTest.hasAttribute("busy")) return;
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4) btnPrintTest.removeAttribute("busy");
                        if (xhr.readyState == 4 && xhr.status == 200)
                            if (xhr.responseText != "ok")
                                this.ConfirmBox(xhr.responseText, true);
                            else
                                this.ConfirmBox("Test sent successfully.", true);

                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    btnPrintTest.setAttribute("busy", true);
                    xhr.open("GET", "printtest&target=" + this.entry["IP"][0].split(";")[0].trim(), true);
                    xhr.send();
                };
            }

        }

    }

    LiveInfo() {
        if (!this.entry.hasOwnProperty("IP") && !this.entry.hasOwnProperty("HOSTNAME")) return;

        this.liveinfo.innerHTML = "";

        this.CameraSnap();

        const icon = this.task.querySelector(".icon"); //remove old dots
        this.task.innerHTML = "";
        this.task.appendChild(icon);
        
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        const ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/liveinfo_equip");

        ws.onopen = () => { ws.send(this.filename); };

        ws.onmessage = (event) => {
            let split = event.data.split(String.fromCharCode(127));

            if (split[0].startsWith(".roundtrip:")) {
                let ping = split[0].split(":");
                let ip = ping[1];

                if (this.pingButtons.hasOwnProperty(ip)) {
                    let button = this.pingButtons[ip];
                    button.sub.innerHTML = "";

                    const dot = document.createElement("div");
                    dot.style.display = "inline-block";
                    dot.style.border = "#202020 1px solid";
                    dot.style.borderRadius = "50%";
                    dot.style.width = "10px";
                    dot.style.height = "10px";
                    dot.style.marginRight = "4px";
                    dot.style.marginBottom = "-2px";
                    dot.style.backgroundColor = PingColor(split[1]);
                    button.sub.appendChild(dot);

                    button.sub.innerHTML += isNaN(split[1]) ? split[1] : `${split[1]}ms`;

                    if (this.task.childNodes.length < 6) {
                        this.dot = document.createElement("div");
                        this.dot.className = "task-icon-dots";
                        this.dot.style.backgroundColor = dot.style.backgroundColor;
                        this.task.appendChild(this.dot);
                    }
                }
            }

            if (split[0].startsWith(".")) return; //hidden property
            const newProperty = this.AddProperty(split[0], split[1], split[2]);
            this.liveinfo.appendChild(newProperty);
        };
    }

    CameraSnap() {
        if (!this.entry.hasOwnProperty("IP")) return;
        if (!this.entry.hasOwnProperty("PORTS")) return;
        if (!this.entry.hasOwnProperty("TYPE")) return;

        if (this.entry["TYPE"][0].toUpperCase() != "CAMERA") return;

        let ports = this.entry["PORTS"][0].split(";").map(o => parseInt(o.trim()));
        if (!ports.includes(80)) return;

        let div = document.createElement("div");
        div.style.display = "none";
        div.style.overflow = "hidden";
        div.style.textAlign = "center";
        div.style.backgroundColor = "transparent";
        this.liveinfo.appendChild(div);

        let ip = this.entry["IP"][0].split(";")[0];

        let snap = document.createElement("img");
        snap.height = 300;
        snap.style.border = "var(--pane-color) 2px solid";
        snap.style.borderRadius = "4px";
        snap.src = `http://${ip}/snap.jpeg`;
        div.appendChild(snap);

        snap.onload = () => {
            div.style.display = "block";
        };

        snap.onerror = () => {
            this.liveinfo.removeChild(div);
        };
    }

    LiveButton(icon, label) {
        const div = document.createElement("div");
        div.innerHTML = label;
        div.style.backgroundImage = `url(${icon})`;
        this.live.appendChild(div);

        const sub = document.createElement("div");
        sub.style.fontSize = "smaller";
        sub.style.height = "14px";
        sub.innerHTML = "&nbsp;";
        div.appendChild(sub);

        return {
            div: div,
            sub: sub
        };
    }

    SideButton(icon, label) {
        const button = document.createElement("div");

        const divLabel = document.createElement("div");
        divLabel.style.backgroundImage = "url(" + icon + ")";
        divLabel.innerHTML = label;
        button.appendChild(divLabel);

        return button;
    }

    AddGroup(icon, title) {
        const newGroup = document.createElement("div");
        newGroup.className = "db-property-group";

        const ico = document.createElement("div");
        if (icon.length > 0) ico.style.backgroundImage = "url(" + icon + ")";
        newGroup.appendChild(ico);

        const label = document.createElement("div");
        label.innerHTML = title;
        newGroup.appendChild(label);

        if (this.properties.childNodes.length > 0)
            if (this.properties.childNodes[this.properties.childNodes.length - 1].className == "db-property-group")
                this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length - 1]);

        this.properties.appendChild(newGroup);
    }

    AddProperty(n, v, m) {
        const newProperty = document.createElement("div");
        newProperty.className = "db-property";

        const label = document.createElement("div");
        label.innerHTML = n.toUpperCase();
        newProperty.appendChild(label);

        if (n.includes("PASSWORD")) { //password
            const value = document.createElement("div");
            newProperty.appendChild(value);

            const preview = document.createElement("span");
            value.appendChild(preview);

            const countdown = document.createElement("span");
            countdown.className = "password-countdown";
            countdown.style.display = "none";
            value.appendChild(countdown);

            const cd_left = document.createElement("div");
            cd_left.appendChild(document.createElement("div"));
            countdown.appendChild(cd_left);

            const cd_right = document.createElement("div");
            cd_right.appendChild(document.createElement("div"));
            countdown.appendChild(cd_right);

            const btnShow = document.createElement("input");
            btnShow.type = "button";
            btnShow.value = "Show";
            value.appendChild(btnShow);

            const btnStamp = document.createElement("input");
            btnStamp.type = "button";
            btnStamp.value = " ";
            btnStamp.style.minWidth = "40px";
            btnStamp.style.height = "32px";
            btnStamp.style.backgroundImage = "url(res/l_stamp.svg)";
            btnStamp.style.backgroundSize = "28px 28px";
            btnStamp.style.backgroundPosition = "center";
            btnStamp.style.backgroundRepeat = "no-repeat";
            value.appendChild(btnStamp);

            btnShow.onclick = () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) { //OK
                        preview.innerHTML = xhr.responseText;
                        countdown.style.display = "inline-block";
                        btnShow.style.display = "none";

                        setTimeout(() => {
                            if (!this.isClosed) {
                                preview.innerHTML = "";
                                countdown.style.display = "none";
                                btnShow.style.display = "inline-block";
                            }
                        }, 20000);

                    } else if (xhr.readyState == 4 && xhr.status == 0) { //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                        value.innerHTML = "";
                        value.appendChild(btnShow);
                    }
                };

                xhr.open("GET", "getequiprop&file=" + this.filename + "&property=" + n, true);
                xhr.send();
            };

            btnStamp.onclick = () => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) { //OK                       
                        if (xhr.responseText != "ok")
                            this.ConfirmBox(xhr.responseText, true);
                    } else if (xhr.readyState == 4 && xhr.status == 0)  //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };

                xhr.open("GET", "ra&stpe&" + this.filename + ":" + n, true);
                xhr.send();
            };

        } else if (v.includes(";")) {
            const value = document.createElement("div");

            let values = v.split(";");
            for (let i = 0; i < values.length; i++) {
                if (values[i].trim().length == 0) continue;
                const subvalue = document.createElement("div");
                subvalue.innerHTML = values[i] + "&thinsp;";;
                value.appendChild(subvalue);
            }

            newProperty.appendChild(value);

        } else if (v.startsWith("bar:")) { //bar
            const value = document.createElement("div");

            let split = v.split(":");
            for (let i = 1; i < split.length - 3; i += 4) {
                let used = parseFloat(split[i + 1]);
                let size = parseFloat(split[i + 2]);

                const bar = document.createElement("div");
                bar.className = "db-progress-bar";

                const caption = document.createElement("div");
                caption.innerHTML = split[i] + "&thinsp;";

                const progress = document.createElement("div");
                progress.style.boxShadow = "rgb(64,64,64) " + 100 * used / size + "px 0 0 inset";

                const text = document.createElement("div");
                text.innerHTML = "&thinsp;" + split[i + 1] + "/" + split[i + 2] + " " + split[i + 3];

                bar.appendChild(caption);
                bar.appendChild(progress);
                bar.appendChild(text);
                value.appendChild(bar);
            }

            newProperty.appendChild(value);

        } else {
            const value = document.createElement("div");
            value.innerHTML = v;
            newProperty.appendChild(value);
        }

        if (m.length > 0) {
            const comme = document.createElement("div");
            comme.innerHTML = m;
            newProperty.appendChild(comme);
        }

        return newProperty;
    }

    New() {

    }

    Edit() {

    }

    Fetch() {

    }

    Delete() {
        this.ConfirmBox("Are you sure you want to delete this entry?").addEventListener("click", () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") {
                    this.Close();
                }

                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("GET", "delequip&file=" + this.filename, true);
            xhr.send();
        });
    }
}