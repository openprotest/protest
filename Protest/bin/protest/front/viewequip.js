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
    "MEMORY", "TOTAL MEMORY", "MEMORY MODULES", "RAM SLOT", "RAM SPEED", "RAM SLOT USED", "RAM TYPE", "RAM FORM FACTOR",

    ["res/diskdrive.svgz", "Disk Drive"],
    "DISK DRIVE", "PHYSICAL DISK", "LOGICAL DISK",

    ["res/videocard.svgz", "Video Card"],
    "VIDEO CONTROLLER", "VIDEO DRIVER",

    ["res/os.svgz", "Operating System"],
    "OPERATING SYSTEM", "OS ARCHITECTURE", "OS VERSION", "OS BUILD", "SERVICE PACK", "OS SERIAL NO", "OS INSTALL DATE",

    ["res/user.svgz", "Owner"],
    "OWNER", "OWNER FULLNAME", "LOCATION",

    ["res/directory.svgz", "Active Directory"],
    "DISTINGUISHED NAME", "DNS HOSTNAME", "CREATED ON DC",

    ["res/credencial.svgz", "Credentials"],
    "DOMAIN", "USERNAME", "PASSWORD", "LA PASSWORD", "SSH USERNAME", "SSH PASSWORD"
];

class Equip extends Window {
    constructor(filename) {
        super([56,56,56]);

        this.args = filename;

        this.AddCssDependencies("dbview.css");

        this.pingButtons = {};

        if (this.args === null) {
            this.New();
            return;
        }

        this.setTitle("Equipment");
        this.setIcon("res/gear.svgz");
        
        this.entry = db_equip.find(e => e[".FILENAME"][0] === filename);
        this.filename = filename;
        this.hasConfigFile = false;

        if (!this.entry) {
            this.btnPopout.style.visibility = "hidden";
            this.ConfirmBox("Equipment do not exist.", true).addEventListener("click", () => this.Close());
            this.AfterResize = () => {};
            return;
        }

        if (!this.entry.hasOwnProperty("NAME") || this.entry["NAME"][0].length == 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.entry["NAME"][0]);

        this.setIcon(GetEquipIcon(this.entry["TYPE"]));

        this.InitializeComponent();
        this.Plot();
        this.LiveInfo();
        setTimeout(() => { this.AfterResize(); }, 200);
    }

    InitializeComponent() {
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

        if (AUTHORIZATION.database < 2) {
            btnEdit.setAttribute("disabled", true);
            btnFetch.setAttribute("disabled", true);
            btnDelete.setAttribute("disabled", true);
        }

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
        this.rightside.style.display = "none";
        this.rightside.className = "db-rightside";
        this.content.appendChild(this.rightside);
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
    
    Plot() {
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

        const overwriteProto = {};
        if (this.entry.hasOwnProperty(".OVERWRITEPROTOCOL"))
            this.entry[".OVERWRITEPROTOCOL"][0].split(";").map(o => o.trim()).forEach(o => {
                let s = o.split(":");
                if (s.length === 2) overwriteProto[s[0]] = s[1];
            });
        else if (this.entry.hasOwnProperty("OVERWRITEPROTOCOL"))
            this.entry["OVERWRITEPROTOCOL"][0].split(";").map(o => o.trim()).forEach(o => {
                let s = o.split(":");
                if (s.length === 2) overwriteProto[s[0]] = s[1];
            });

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

        if (AUTHORIZATION.utilities === 1 && this.entry.IP) { //IPs
            let ips = this.entry.IP[0].split(";").map(o=>o.trim());
            for (let i = 0; i < ips.length; i++) {
                if (ips[i].length === 0) continue;

                const button = this.LiveButton("res/ping.svgz", ips[i]);
                const div = button.div;
                //const roundtrip = button.sub;

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
                    usage.style.boxShadow = `#202020 0 0 0 1px inset, #404040 ${72*used/total}px 0 0 inset`;
                }, 400);

                div.onclick = () => {
                    if (this.entry.IP) {
                        let ip = this.entry.IP[0].split(";").map(o=>o.trim())[0];
                        new FileBrowser({ path: ip + "/" + disks[i] + "$", filename: this.filename });
                    }

                    /*const xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.status == 403) location.reload(); //authorization
                        if (xhr.readyState == 4 && xhr.status == 200) if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ra&smb&" + this.filename + "&" + disks[i] + "$", true);
                    xhr.send();*/
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

        if (this.entry.hasOwnProperty("MAC ADDRESS") && AUTHORIZATION.remotehosts === 1) {
            const btnWoL = this.SideButton("res/wol.svgz", "Wake on LAN");
            this.sidetools.appendChild(btnWoL);
            btnWoL.onclick = () => {
                if (btnWoL.hasAttribute("busy")) return;
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.status == 403) location.reload(); //authorization
                    if (xhr.readyState == 4) btnWoL.removeAttribute("busy");
                    if (xhr.readyState == 4 && xhr.status == 200) //OK
                        if (xhr.responseText == "ok") this.ConfirmBox("Magic package has been sent successfully.", true);
                        else this.ConfirmBox(xhr.responseText, true);
                    else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                btnWoL.setAttribute("busy", true);
                xhr.open("GET", "mngh/wakeup&file=" + this.filename, true);
                xhr.send();
            };
        }

        if (this.entry.hasOwnProperty("PORTS")) {
            let ports = this.entry["PORTS"][0].split(";").map(o => parseInt(o.trim()));

            if (ports.includes(445) && this.entry.hasOwnProperty("OPERATING SYSTEM")) { //wmi service 445

                if (AUTHORIZATION.remotehosts === 1) {
                    const btnOff = this.SideButton("res/turnoff.svgz", "Power off");
                    this.sidetools.appendChild(btnOff);
                    btnOff.onclick = () => {
                        if (btnOff.hasAttribute("busy")) return;
                        this.ConfirmBox("Are you sure you want to power off this device?").addEventListener("click", () => {
                            const xhr = new XMLHttpRequest();
                            xhr.onreadystatechange = () => {
                                if (xhr.status == 403) location.reload(); //authorization
                                if (xhr.readyState == 4) btnOff.removeAttribute("busy");
                                if (xhr.readyState == 4 && xhr.status == 200)
                                    if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                                if (xhr.readyState == 4 && xhr.status == 0)
                                    this.ConfirmBox("Server is unavailable.", true);
                            };
                            btnOff.setAttribute("busy", true);
                            xhr.open("GET", "mngh/shutdown&file=" + this.filename, true);
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
                                if (xhr.status == 403) location.reload(); //authorization
                                if (xhr.readyState == 4) btnReboot.removeAttribute("busy");
                                if (xhr.readyState == 4 && xhr.status == 200)
                                    if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                                if (xhr.readyState == 4 && xhr.status == 0)
                                    this.ConfirmBox("Server is unavailable.", true);
                            };
                            btnReboot.setAttribute("busy", true);
                            xhr.open("GET", "mngh/reboot&file=" + this.filename, true);
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
                                if (xhr.status == 403) location.reload(); //authorization
                                if (xhr.readyState == 4) btnLogoff.removeAttribute("busy");
                                if (xhr.readyState == 4 && xhr.status == 200)
                                    if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                                if (xhr.readyState == 4 && xhr.status == 0)
                                    this.ConfirmBox("Server is unavailable.", true);
                            };
                            btnLogoff.setAttribute("busy", true);
                            xhr.open("GET", "mngh/logoff&file=" + this.filename, true);
                            xhr.send();
                        });
                    };
                }
                
                if (AUTHORIZATION.wmi === 1 && this.entryIP) {
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

                if (AUTHORIZATION.remoteagent === 1 && this.entryIP) {
                    const btnMgmt = this.SideButton("res/compmgmt.svgz", "PC Management"); //compmgmt
                    this.sidetools.appendChild(btnMgmt);
                    btnMgmt.onclick = () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        xhr.open("GET", "ra&cmg&" + this.filename, true);
                        xhr.send();
                    };
                }

                if (AUTHORIZATION.remoteagent === 1 && this.entryIP) {
                    const btnPse = this.SideButton("res/psremote.svgz", "PS Remoting"); //psexec
                    this.sidetools.appendChild(btnPse);
                    btnPse.onclick = () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        xhr.open("GET", "ra&pse&" + this.filename, true);
                        xhr.send();
                    };
                }
            }

            if (this.entry.IP) {

                if (AUTHORIZATION.telnet === 1) //telnet
                    if (overwriteProto.telnet) {
                        const btnTelnet = this.SideButton("res/telnet.svgz", "Telnet");
                        this.sidetools.appendChild(btnTelnet);
                        btnTelnet.onclick = () => new Telnet(this.entry["IP"][0].split(";")[0].trim() + ":" + overwriteProto.telnet);
                        
                    } else if (ports.includes(23)) {
                        const btnTelnet = this.SideButton("res/telnet.svgz", "Telnet");
                        this.sidetools.appendChild(btnTelnet);
                        btnTelnet.onclick = () => new Telnet(this.entry["IP"][0].split(";")[0].trim());
                    }

                if (AUTHORIZATION.remoteagent === 1 && (ports.includes(22) || overwriteProto.ssh)) { //ssh
                    const btnSsh = this.SideButton("res/ssh.svgz", "Secure shell");
                    this.sidetools.appendChild(btnSsh);
                    btnSsh.onclick = () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        xhr.open("GET", "ra&ssh&" + this.filename, true);
                        xhr.send();
                    };
                }

                if (AUTHORIZATION.remotehosts === 1 && ports.includes(445)) { //smb
                    const btnSmb = this.SideButton("res/shared.svgz", "SMB");
                    this.sidetools.appendChild(btnSmb);
                    btnSmb.onclick = () => {
                        if (this.entry.IP) {
                            let ip = this.entry.IP[0].split(";").map(o => o.trim())[0];
                            new FileBrowser({ path: ip, filename: this.filename, view: "grid" });
                        }

                        /*const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        xhr.open("GET", "ra&smb&" + this.filename, true);
                        xhr.send();*/
                    };
                }

                if (overwriteProto.http) { //http
                    const btnAction = this.SideButton("res/earth.svgz", "HTTP");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("http://" + this.entry["IP"][0].split(";")[0].trim() + ":" + overwriteProto.http);
                } else if (ports.includes(80)) {
                    const btnAction = this.SideButton("res/earth.svgz", "HTTP");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("http://" + this.entry["IP"][0].split(";")[0].trim());
                }

                if (overwriteProto.https) { //https
                    const btnAction = this.SideButton("res/earth.svgz", "HTTPs");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("https://" + this.entry["IP"][0].split(";")[0].trim() + ":" + overwriteProto.https);
                } else if (ports.includes(443)) { //https
                    const btnAction = this.SideButton("res/earth.svgz", "HTTPs");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("https://" + this.entry["IP"][0].split(";")[0].trim());
                }

                if (overwriteProto.ftp) { //ftp
                    const btnAction = this.SideButton("res/shared.svgz", "FTP");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("ftp://" + this.entry["IP"][0].split(";")[0].trim() + ":" + overwriteProto.ftp);
                } else if (ports.includes(21)) {
                    const btnAction = this.SideButton("res/shared.svgz", "FTP");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("ftp://" + this.entry["IP"][0].split(";")[0].trim());
                }

                if (overwriteProto.ftps) {
                    const btnAction = this.SideButton("res/shared.svgz", "FTP");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("ftps://" + this.entry["IP"][0].split(";")[0].trim() + ":" + overwriteProto.ftps);

                } else if (ports.includes(989)) { //ftps
                    const btnAction = this.SideButton("res/shared.svgz", "FTPs");
                    this.sidetools.appendChild(btnAction);
                    btnAction.onclick = () => window.open("ftps://" + this.entry["IP"][0].split(";")[0].trim());
                }

                if (AUTHORIZATION.remoteagent === 1 && (ports.includes(3389) || overwriteProto.rdp)) { //rdp
                    const btnRdp = this.SideButton("res/rdp.svgz", "Remote desktop");
                    this.sidetools.appendChild(btnRdp);
                    btnRdp.onclick = () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        xhr.open("GET", "ra&rdp&" + this.filename, true);
                        xhr.send();
                    };
                }

                if (AUTHORIZATION.remoteagent === 1 && (ports.includes(5900) || overwriteProto.uvnc)) { //uvnc
                    const btnUvnc = this.SideButton("res/uvnc.svgz", "UltraVNC");
                    this.sidetools.appendChild(btnUvnc);
                    btnUvnc.onclick = () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        xhr.open("GET", "ra&vnc&" + this.filename, true);
                        xhr.send();
                    };
                }

                if (AUTHORIZATION.remoteagent === 1 && (ports.includes(8291) || overwriteProto.winbox)) { //winbox
                    const btnWinbox = this.SideButton("res/mikrotik.svgz", "Winbox");
                    this.sidetools.appendChild(btnWinbox);
                    btnWinbox.onclick = () => {
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        xhr.open("GET", "ra&winbox&" + this.filename, true);
                        xhr.send();
                    };
                }

                if (AUTHORIZATION.remotehosts === 1 && ports.includes(9100)) { //print test
                    const btnPrintTest = this.SideButton("res/printer.svgz", "Print test page");
                    this.sidetools.appendChild(btnPrintTest);
                    btnPrintTest.onclick = () => {
                        if (btnPrintTest.hasAttribute("busy")) return;
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = () => {
                            if (xhr.status == 403) location.reload(); //authorization
                            if (xhr.readyState == 4) btnPrintTest.removeAttribute("busy");
                            if (xhr.readyState == 4 && xhr.status == 200)
                                if (xhr.responseText != "ok")
                                    this.ConfirmBox(xhr.responseText, true);
                                else
                                    this.ConfirmBox("Test sent successfully.", true);
                            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                        };
                        btnPrintTest.setAttribute("busy", true);
                        xhr.open("GET", "mngh/printtest&target=" + this.entry["IP"][0].split(";")[0].trim(), true);
                        xhr.send();
                    };
                }

            }
        }

        if (this.entry["TYPE"][0].toUpperCase() == "ROUTER" || this.entry["TYPE"][0].toUpperCase() == "SWITCH" && this.entry.hasOwnProperty("PORTS")) {//conficuration
            const btnConfig = this.SideButton(GetEquipIcon(this.entry["TYPE"]), "Configuration");
            btnConfig.style.marginTop = "12px";
            this.sidetools.appendChild(btnConfig);
            btnConfig.onclick = () => this.Config();
        }
    }

    LiveInfo() {
        if (AUTHORIZATION.remotehosts === 0) return;
        if (!this.entry.hasOwnProperty("IP") && !this.entry.hasOwnProperty("HOSTNAME")) return;

        this.liveinfo.innerHTML = "";

        this.CameraSnap();

        const icon = this.task.querySelector(".icon"); //remove old dots
        this.task.innerHTML = "";
        this.task.appendChild(icon);

        if (this.socketBusy) return;

        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        this.socketBusy = true;
        const ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/liveinfo_equip");

        ws.onopen = () => {
            ws.send(this.filename);
        };

        ws.onclose = () => {
            this.socketBusy = false;
        };

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

            if (split[0].startsWith("!")) {
                this.liveinfo.appendChild(this.AddWarning(split[1]));
            } else {
                const newProperty = this.AddProperty(split[0], split[1], split[2]);
                this.liveinfo.appendChild(newProperty);
            }
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
            btnShow.style.color = "rgb(192,192,192)";
            btnShow.style.fontWeight = "600";
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

            if (AUTHORIZATION.password === 0) {
                btnShow.setAttribute("disabled", true);
                btnStamp.setAttribute("disabled", true);
            }

            btnShow.onclick = () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.status == 403) location.reload(); //authorization

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

                xhr.open("GET", "db/getequiprop&file=" + this.filename + "&property=" + n, true);
                xhr.send();
            };

            btnStamp.onclick = () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.status == 403) location.reload(); //authorization

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
                subvalue.innerHTML = values[i] + "&thinsp;";
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

            const subvalue = document.createElement("div");
            subvalue.innerHTML = `${v}&nbsp;`;
            value.appendChild(subvalue);

            newProperty.appendChild(value);
        }

        if (m.length > 0) {
            const comme = document.createElement("div");
            comme.innerHTML = m;
            newProperty.appendChild(comme);
        }

        return newProperty;
    }

    AddWarning(text) {
        const newProperty = document.createElement("div");
        newProperty.style.backgroundColor = "rgb(255,186,0)";
        newProperty.style.color = "#101010";
        newProperty.className = "db-property";

        const label = document.createElement("div");
        label.style.fontWeight = "600";
        label.style.width = "calc(100% - 16px)";
        label.style.paddingLeft = "32px";
        label.style.marginLeft = "4px";
        label.style.backgroundImage = "url(res/warning.svgz)";
        label.style.backgroundSize = "22px 22px";
        label.style.backgroundPosition = "4px center";
        label.style.backgroundRepeat = "no-repeat";
        label.innerHTML = text;
        newProperty.appendChild(label);

        return newProperty;
    }

    EditProperty(name, value, readonly, container) {
        const newProperty = document.createElement("div");
        newProperty.className = "db-edit-property";
        container.appendChild(newProperty);

        const txtName = document.createElement("input");
        txtName.type = "text";
        txtName.value = name.toUpperCase();
        txtName.setAttribute("list", "eq_autofill");
        if (readonly) txtName.setAttribute("readonly", true);
        newProperty.appendChild(txtName);

        const txtValue = document.createElement("input");
        txtValue.type = "text";
        txtValue.value = (name == "") ? "" : value;
        if (readonly) txtValue.setAttribute("readonly", true);
        newProperty.appendChild(txtValue);

        txtName.oninput = () => {
            if (txtName.value == "TYPE")
                txtValue.setAttribute("list", "eq_autofill_type");
            else
                txtValue.removeAttribute("list");
        };
        txtName.oninput();

        let remove = document.createElement("div");
        if (!readonly) newProperty.appendChild(remove);
        remove.onclick = () => {
            if (newProperty.style.filter == "opacity(0)") return; //once
            newProperty.style.filter = "opacity(0)";
            newProperty.style.height = "0";

            for (let i = 0; i < newProperty.childNodes.length; i++) {
                newProperty.childNodes[i].style.height = "0";
                newProperty.childNodes[i].style.margin = "0";
                newProperty.childNodes[i].style.padding = "0";
            }

            setTimeout(() => {
                container.removeChild(newProperty);
            }, 150);
        };

        return {
            name: txtName,
            value: txtValue,
        };
    }

    New() {
        this.InitializeComponent();
        setTimeout(() => { this.AfterResize(); }, 200);

        this.btnPopout.style.display = "none";

        this.setTitle("New equipment");
        this.setIcon("res/new_equip.svgz");

        this.entry = {
            "NAME": ["", ""],
            "TYPE": ["", ""],
            "IP": ["", ""],
            "HOSTNAME": ["", ""],
            "MANUFACTURER": ["", ""],
            "MODEL": ["", ""],
            "OWNER": ["", ""],
            "LOCATION": ["", ""]
        };

        const dialog = this.Edit();
        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;

        const btnFetch = document.createElement("div");
        btnFetch.setAttribute("tip-below", "Fetch");
        btnFetch.style.position = "absolute";
        btnFetch.style.left = "0px";
        btnFetch.style.top = "32px";
        btnFetch.style.width = "56px";
        btnFetch.style.height = "56px";
        btnFetch.style.paddingLeft = "4px";
        btnFetch.style.borderRadius = "0 8px 8px 0";
        btnFetch.style.backgroundColor = "rgb(208,208,208)";
        btnFetch.style.backgroundImage = "url(res/fetch.svgz)";
        btnFetch.style.backgroundPosition = "center";
        btnFetch.style.backgroundSize = "48px 48px";
        btnFetch.style.backgroundRepeat = "no-repeat";
        btnFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
        btnFetch.style.transition = ".2s";
        dialog.innerBox.parentNode.parentNode.appendChild(btnFetch);

        const divFetch = document.createElement("div");
        divFetch.style.position = "absolute";
        divFetch.style.visibility = "hidden";
        divFetch.style.left = "30%";
        divFetch.style.top = "28px";
        divFetch.style.width = "40%";
        divFetch.style.maxWidth = "400px";
        divFetch.style.minWidth = "220px";
        divFetch.style.borderRadius = "8px";
        divFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
        divFetch.style.backgroundColor = "rgb(208,208,208)";
        divFetch.style.padding = "16px 8px";
        divFetch.style.overflow = "hidden";
        divFetch.style.textAlign = "center";
        dialog.innerBox.parentElement.parentElement.appendChild(divFetch);

        const txtFetchHost = document.createElement("input");
        txtFetchHost.type = "text";
        txtFetchHost.placeholder = "Host";
        divFetch.appendChild(txtFetchHost);

        divFetch.appendChild(document.createElement("br"));
        divFetch.appendChild(document.createElement("br"));

        const btnFetchOk = document.createElement("input");
        btnFetchOk.type = "button";
        btnFetchOk.value = "Fetch";
        divFetch.appendChild(btnFetchOk);

        const btnFetchCancel = document.createElement("input");
        btnFetchCancel.type = "button";
        btnFetchCancel.value = "Cancel";
        divFetch.appendChild(btnFetchCancel);

        let fetchToogle = false;
        btnFetch.onclick = () => {
            dialog.innerBox.parentElement.style.transition = ".2s";
            dialog.innerBox.parentElement.style.transform = fetchToogle ? "none" : "translateY(-25%)";
            dialog.innerBox.parentElement.style.filter = fetchToogle ? "none" : "opacity(0)";
            dialog.innerBox.parentElement.style.visibility = fetchToogle ? "visible" : "hidden";

            divFetch.style.transition = ".2s";
            divFetch.style.filter = fetchToogle ? "opacity(0)" : "none";
            divFetch.style.transform = fetchToogle ? "translateY(-25%)" : "none";
            divFetch.style.visibility = fetchToogle ? "hidden" : "visible";

            btnFetch.style.backgroundImage = fetchToogle ? "url(res/fetch.svgz)" : "url(res/close.svgz)";
            btnFetch.setAttribute("tip-below", fetchToogle ? "Fetch" : "Cancel");

            fetchToogle = !fetchToogle;
        };

        btnFetchCancel.onclick = () => { btnFetch.onclick(); };

        btnFetchOk.onclick = () => {
            if (txtFetchHost.value.length == 0) return;

            btnFetch.style.filter = "opacity(0)";
            btnFetch.style.visibility = "hidden";
            divFetch.style.filter = "opacity(0)";
            divFetch.style.transform ="translateY(-25%)";
            divFetch.style.visibility = "hidden";

            const waitbox = document.createElement("span");
            waitbox.className = "waitbox";
            waitbox.style.top = "0";
            dialog.innerBox.parentElement.parentElement.appendChild(waitbox);

            waitbox.appendChild(document.createElement("div"));

            const waitLabel = document.createElement("span");
            waitLabel.innerHTML = "Doing stuff. Please wait.";
            waitLabel.className = "wait-label";
            waitLabel.style.top = "0";
            dialog.innerBox.parentElement.parentElement.appendChild(waitLabel);

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.status == 403) location.reload(); //authorization

                if (xhr.readyState == 4 && xhr.status == 200) { //OK
                    dialog.innerBox.innerHTML = "";

                    let split = xhr.responseText.split(String.fromCharCode(127));
                    for (let i=0; i<split.length-1; i+=3) {
                        const entry = this.EditProperty(split[i], split[i+1], false, dialog.innerBox);
                        entry.value.style.paddingRight = "24px";
                        entry.value.style.width = "calc(60% - 200px)";

                        let lblSource = document.createElement("div");
                        lblSource.innerHTML = split[i + 2];
                        entry.value.parentNode.appendChild(lblSource);
                    }

                    btnFetch.onclick();
                    dialog.innerBox.parentElement.parentElement.removeChild(waitbox);
                    dialog.innerBox.parentElement.parentElement.removeChild(waitLabel);
                }

                if (xhr.readyState == 4 && xhr.status == 0) { //disconnected
                    dialog.Abort();
                    this.ConfirmBox("Server is unavailable.", true);
                }
            };

            xhr.open("GET", "fetch/fetchequip&host=" + txtFetchHost.value, true);
            xhr.send();
        };

        txtFetchHost.onkeyup = event => {
            if (event.keyCode == 13) //enter
                btnFetchOk.onclick();
        };

        btnOK.addEventListener("click", () => {
            this.Plot();
            this.LiveInfo();
        });

        btnCancel.addEventListener("click", () => {
            this.Close();
        });

        this.demo = {
            txtFetchHost: txtFetchHost,
            btnFetch: btnFetch,
            btnFetchOk: btnFetchOk
        };
    }

    Edit() {
        const dialog = this.DialogBox("100%");
        if (dialog === null) return;

        const innerBox  = dialog.innerBox;
        const buttonBox = dialog.buttonBox;
        const btnOK     = dialog.btnOK;

        innerBox.style.overflowY = "auto";
        innerBox.style.padding = "8px";
        btnOK.value = "Save";

        const autofill = document.createElement("datalist"); //autofill
        autofill.id = "eq_autofill";
        innerBox.appendChild(autofill);
        for (let i = 0; i < EQUIP_ORDER.length; i++) {
            if (Array.isArray(EQUIP_ORDER[i])) continue;
            const opt = document.createElement("option");
            opt.value = EQUIP_ORDER[i];
            autofill.appendChild(opt);
        }

        const autofill_type = document.createElement("datalist"); //autofill if type
        autofill_type.id = "eq_autofill_type";
        innerBox.appendChild(autofill_type);
        for (let o in EQUIP_ICON) {
            const opt = document.createElement("option");
            opt.value = o.toUpperCase();
            autofill_type.appendChild(opt);
        }

        for (let i = 0; i < EQUIP_ORDER.length; i++)
            if (!Array.isArray(EQUIP_ORDER[i])) {
                if (this.entry[EQUIP_ORDER[i]] == undefined) continue;
                this.EditProperty(EQUIP_ORDER[i], this.entry[EQUIP_ORDER[i]][0], false, innerBox);
            }

        for (let k in this.entry)
            if (!EQUIP_ORDER.includes(k, 0)) {
                if (this.entry[k] == undefined && k != "") continue;
                this.EditProperty(k, this.entry[k][0], (k == ".FILENAME"), innerBox);
            }

        const btnAdd = document.createElement("input");
        btnAdd.type = "button";
        btnAdd.value = "Add";
        btnAdd.style.position = "absolute";
        btnAdd.style.left = "0px";
        buttonBox.appendChild(btnAdd);

        btnAdd.onclick = () => {
            let property = this.EditProperty("", "", false, innerBox);
            property.name.focus();
        };

        btnOK.addEventListener("click", ()=> {
            let properties = innerBox.querySelectorAll(".db-edit-property");

            let payload = "";
            for (let i = 0; i < properties.length; i++) {
                let c = properties[i].childNodes;
                payload += `${c[0].value}${String.fromCharCode(127)}${c[1].value}${String.fromCharCode(127)}`;
            }

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.status == 403) location.reload(); //authorization

                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);

                if (xhr.readyState == 4 && xhr.status == 200) {

                    if (xhr.responseText.startsWith("{")) {
                        let json = JSON.parse(xhr.responseText);
                        this.Update(json.obj);

                        let filename = json.obj[".FILENAME"][0];
                        this.filename = filename;
                        this.args = filename;

                    } else {
                        this.ConfirmBox(xhr.responseText, true);
                    }
                }
            };

            if (this.filename)
                xhr.open("POST", "db/saveequip&" + this.filename, true);
            else
                xhr.open("POST", "db/saveequip", true);

            xhr.send(payload);
        });

        return dialog;
    }

    Fetch() {
        const dialog = this.Edit();
        const innerBox  = dialog.innerBox;
        const buttonBox = dialog.buttonBox;
        const btnOK     = dialog.btnOK;
        const btnCancel = dialog.btnCancel;

        innerBox.parentNode.style.display = "none";
        innerBox.innerHTML = "";

        let waitbox = document.createElement("span");
        waitbox.className = "waitbox";
        waitbox.style.top = "0";
        innerBox.parentNode.parentNode.appendChild(waitbox);

        waitbox.appendChild(document.createElement("div"));

        let waitLabel = document.createElement("span");
        waitLabel.innerHTML = "Doing stuff. Please wait.";
        waitLabel.className = "wait-label";
        waitLabel.style.top = "0";
        innerBox.parentNode.parentNode.appendChild(waitLabel);

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4) {

                if (xhr.status == 0) {
                    dialog.Abort();
                    this.ConfirmBox("Server is unavailable.", true);
                    return;
                }

                if (xhr.status == 403) location.reload(); //authorization                    

                if (xhr.status == 200) {

                    let split = xhr.responseText.split(String.fromCharCode(127));
                    if (split.length == 1) {
                        dialog.Abort();
                        this.ConfirmBox(xhr.responseText, true);
                        return;
                    }

                    let names = new Set(Object.keys(this.entry));
                    for (let i = 0; i < split.length - 1; i += 3) {
                        const entry = this.EditProperty(split[i], split[i+1], false, innerBox);

                        if (names.has(split[i])) { //exists
                            if (this.entry[split[i]][0].toLowerCase() == split[i+1].toLowerCase()) { //same
                                entry.value.style.backgroundImage = "url(res/check.svgz)";
                            } else { //modified
                                entry.value.style.backgroundImage = "url(res/change.svgz)";
                            }
                            names.delete(split[i]);
                        } else { //new
                            entry.value.style.backgroundImage = "url(res/newentry.svgz)";
                        }

                        entry.value.style.paddingRight = "24px";
                        entry.value.style.width = "calc(60% - 200px)";

                        let lblSource = document.createElement("div");
                        lblSource.innerHTML = split[i+2];
                        entry.value.parentNode.appendChild(lblSource);
                    }

                    for (let name of names) {
                        const entry = this.EditProperty(name, this.entry[name][0], name===".FILENAME", innerBox);
                        //entry.value.style.paddingRight = "24px";
                        entry.value.style.width = "calc(60% - 200px)";
                    }

                    innerBox.parentNode.parentNode.removeChild(waitbox);
                    innerBox.parentNode.parentNode.removeChild(waitLabel);
                    innerBox.parentNode.style.display = "block";
                }
            }

        };

        xhr.open("GET", `fetch/fetchequip&filename=${this.filename}`, true);
        xhr.send();
    }

    Delete() {
        this.ConfirmBox("Are you sure you want to delete this entry?").addEventListener("click", () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.status == 403) location.reload(); //authorization

                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);

                if (xhr.readyState == 4 && xhr.status == 200)
                    if (xhr.responseText == "ok") {
                        this.Close();
                    } else {
                        this.ConfirmBox(xhr.responseText, true);
                    }
            };

            xhr.open("GET", "db/delequip&" + this.filename, true);
            xhr.send();
        });
    }

    Config() {
        const dialog = this.DialogBox("calc(100% - 34px)");
        if (dialog === null) return;

        const btnOK     = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        buttonBox.removeChild(btnCancel);

        innerBox.classList.add("code-box");
        innerBox.style.margin = "8px";

        innerBox.parentElement.style.maxWidth = "100%";
        innerBox.parentElement.style.backgroundColor = "#202020";

        const btnFetch = document.createElement("div");
        btnFetch.setAttribute("tip-below", "Fetch");
        btnFetch.style.position = "absolute";
        btnFetch.style.left = "0px";
        btnFetch.style.top = "32px";
        btnFetch.style.width = "56px";
        btnFetch.style.height = "56px";
        btnFetch.style.paddingLeft = "4px";
        btnFetch.style.borderRadius = "0 8px 8px 0";
        btnFetch.style.backgroundColor = "rgb(208,208,208)";
        btnFetch.style.backgroundImage = "url(res/fetch.svgz)";
        btnFetch.style.backgroundPosition = "center";
        btnFetch.style.backgroundSize = "48px 48px";
        btnFetch.style.backgroundRepeat = "no-repeat";
        btnFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
        btnFetch.style.transition = ".2s";
        dialog.innerBox.parentNode.parentNode.appendChild(btnFetch);

        const divFetch = document.createElement("div");
        divFetch.style.position = "absolute";
        divFetch.style.visibility = "hidden";
        divFetch.style.left = "30%";
        divFetch.style.top = "28px";
        divFetch.style.width = "40%";
        divFetch.style.maxWidth = "400px";
        divFetch.style.minWidth = "220px";
        divFetch.style.borderRadius = "8px";
        divFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
        divFetch.style.backgroundColor = "rgb(208,208,208)";
        divFetch.style.padding = "16px 8px";
        divFetch.style.overflow = "hidden";
        divFetch.style.textAlign = "center";
        dialog.innerBox.parentElement.parentElement.appendChild(divFetch);


        const lblFetchUsername = document.createElement("div");
        lblFetchUsername.style.display = "inline-block";
        lblFetchUsername.style.minWidth = "96px";
        lblFetchUsername.innerHTML = "Username:";
        divFetch.appendChild(lblFetchUsername);

        const txtFetchUsername = document.createElement("input");
        txtFetchUsername.type = "text";
        txtFetchUsername.value = this.entry.hasOwnProperty("USERNAME") ? this.entry["USERNAME"][0].split(";")[0].trim() : "";
        divFetch.appendChild(txtFetchUsername);

        const lblFetchPassword = document.createElement("div");
        lblFetchPassword.style.display = "inline-block";
        lblFetchPassword.style.minWidth = "96px";
        lblFetchPassword.innerHTML = "Password:";
        divFetch.appendChild(lblFetchPassword);

        const txtFetchPassword = document.createElement("input");
        txtFetchPassword.type = "password";
        txtFetchPassword.placeholder = "unchanged";
        divFetch.appendChild(txtFetchPassword);

        divFetch.appendChild(document.createElement("br"));
        divFetch.appendChild(document.createElement("br"));

        const chkFetchRemember = document.createElement("input");
        chkFetchRemember.type = "checkbox";
        divFetch.appendChild(chkFetchRemember);
        this.AddCheckBoxLabel(divFetch, chkFetchRemember, "Remember");

        divFetch.appendChild(document.createElement("br"));
        divFetch.appendChild(document.createElement("br"));

        const btnFetchOk = document.createElement("input");
        btnFetchOk.type = "button";
        btnFetchOk.value = "Fetch";
        divFetch.appendChild(btnFetchOk);

        const btnFetchCancel = document.createElement("input");
        btnFetchCancel.type = "button";
        btnFetchCancel.value = "Cancel";
        divFetch.appendChild(btnFetchCancel);

        const DisplayScript = lines => {
            innerBox.innerHTML = "";            
            for (let i = 0; i < lines.length; i++) {
                //lines[i] = lines[i].replaceAll("\\\"", "\\&quot;");

                const divLine = document.createElement("div");
                
                if (lines[i].startsWith("#") || lines[i].startsWith("!")) { //comment
                    divLine.innerHTML = lines[i];
                    divLine.style.color = "#9C6";
                    divLine.style.fontStyle = "italic";
                    innerBox.appendChild(divLine);

                } else if (lines[i].startsWith("/")) { //location
                    divLine.innerHTML = lines[i];
                    divLine.style.color = "#8FD";
                    divLine.style.paddingTop = "8px";
                    innerBox.appendChild(divLine);

                } else {
                    let line = [];

                    let temp = lines[i].split("\"");
                    for (let j = 0; j < temp.length; j++)
                        if (j%2===0)
                            line.push(temp[j]);
                        else 
                            line.push(`\"${temp[j]}\"`);
                   
                    for (let j = 0; j < line.length; j++) {
                        if (line[j].length === 0) continue;

                        let equalPos = line[j].indexOf("=");

                        if (line[j].startsWith("\"") && line[j].length > 2) { //quot
                            const newSpan = document.createElement("span");
                            newSpan.innerHTML = line[j];
                            newSpan.style.color = "#D98"; //"#C99";
                            divLine.appendChild(newSpan);

                        } else {
                            let p = 0;
                            while (p < line[j].length) {
                                let ep = line[j].indexOf("=", p); //equal pos
                                if (ep < 0) break;

                                let sp = line[j].lastIndexOf(" ", ep); //space pos
                                if (sp < 0) break;

                                if (p != sp) {
                                    const spanA = document.createElement("span");
                                    spanA.innerHTML = line[j].substring(p, sp);
                                    divLine.appendChild(spanA);
                                }
                                
                                const spanB = document.createElement("span");
                                spanB.innerHTML = line[j].substring(sp, ep+1);
                                spanB.style.color = "#5BE";
                                divLine.appendChild(spanB);

                                p = ep+1;
                            }

                            if (p < line[j].length) {
                                const span = document.createElement("span");
                                span.innerHTML = line[j].substring(p);
                                divLine.appendChild(span);
                            }
                        }
                    }

                    innerBox.appendChild(divLine);
                }

            }
        };

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization

            if (xhr.readyState == 4 && xhr.status == 200) { //OK
                DisplayScript(xhr.responseText.split("\n"));
            }
        };
        xhr.open("GET", "config/get&file=" + this.filename, true);
        xhr.send();


        let fetchToogle = false;
        btnFetch.onclick = () => {
            dialog.innerBox.parentElement.style.transition = ".2s";
            dialog.innerBox.parentElement.style.transform = fetchToogle ? "none" : "translateY(-25%)";
            dialog.innerBox.parentElement.style.filter = fetchToogle ? "none" : "opacity(0)";
            dialog.innerBox.parentElement.style.visibility = fetchToogle ? "visible" : "hidden";

            divFetch.style.transition = ".2s";
            divFetch.style.filter = fetchToogle ? "opacity(0)" : "none";
            divFetch.style.transform = fetchToogle ? "translateY(-25%)" : "none";
            divFetch.style.visibility = fetchToogle ? "hidden" : "visible";

            btnFetch.style.backgroundImage = fetchToogle ? "url(res/fetch.svgz)" : "url(res/close.svgz)";
            btnFetch.setAttribute("tip-below", fetchToogle ? "Fetch" : "Cancel");

            fetchToogle = !fetchToogle;
        };

        btnFetchOk.onclick = () => {
            if (txtFetchUsername.value.length == 0) return;

            btnFetch.style.filter = "opacity(0)";
            btnFetch.style.visibility = "hidden";
            divFetch.style.filter = "opacity(0)";
            divFetch.style.transform = "translateY(-25%)";
            divFetch.style.visibility = "hidden";

            const waitbox = document.createElement("span");
            waitbox.className = "waitbox";
            waitbox.style.top = "0";
            dialog.innerBox.parentElement.parentElement.appendChild(waitbox);

            waitbox.appendChild(document.createElement("div"));

            const waitLabel = document.createElement("span");
            waitLabel.innerHTML = "Doing stuff. Please wait.";
            waitLabel.className = "wait-label";
            waitLabel.style.top = "0";
            dialog.innerBox.parentElement.parentElement.appendChild(waitLabel);

            const xhrFetch = new XMLHttpRequest();
            xhrFetch.onreadystatechange = () => {
                if (xhrFetch.status == 403) location.reload(); //authorization

                if (xhrFetch.readyState == 4 && xhrFetch.status == 200) { //OK
                    DisplayScript(xhrFetch.responseText.split("\n"));

                    btnFetch.onclick();
                    dialog.innerBox.parentElement.parentElement.removeChild(waitbox);
                    dialog.innerBox.parentElement.parentElement.removeChild(waitLabel);
                }

                if (xhrFetch.readyState == 4 && xhrFetch.status == 0) { //disconnected
                    dialog.Abort();
                    this.ConfirmBox("Server is unavailable.", true);
                }
            };

            xhrFetch.open("GET", "config/fetch&file=" + this.filename, true);
            xhrFetch.send();
        };

        btnFetchCancel.onclick = () => { btnFetch.onclick(); };
    }

    Update(obj) {
        this.entry = obj;

        this.setIcon(GetEquipIcon(this.entry["TYPE"]));
        if (!this.entry.hasOwnProperty("NAME") || this.entry["NAME"][0].length == 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.entry["NAME"][0]);

        this.sidetools.innerHTML = "";
        this.live.innerHTML = "";
        this.Plot();
        this.LiveInfo();
    }
}