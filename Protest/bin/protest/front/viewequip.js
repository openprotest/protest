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
        this.ShowInterfaces();
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

        this.live = document.createElement("div");
        this.live.className = "db-live";
        this.scroll.appendChild(this.live);

        this.interfaces = document.createElement("div");
        this.interfaces.className = "db-interfaces";
        this.interfaces.style.display = this.entry && this.entry.hasOwnProperty(".INTERFACES") ? "block" : "none";
        this.scroll.appendChild(this.interfaces);

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
            this.rightside.appendChild(this.interfaces);
            this.rightside.appendChild(this.liveinfo);

        } else {
            if (this.rightside.style.display === "none") return;
            this.rightside.style.display = "none";
            this.rightside.classList.remove("db-rightside");

            this.scroll.appendChild(this.live);
            this.scroll.appendChild(this.interfaces);
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
                
                if (AUTHORIZATION.wmi === 1 && this.entry.IP) {
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

                if (AUTHORIZATION.remoteagent === 1 && this.entry.IP) {
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

                if (AUTHORIZATION.remoteagent === 1 && this.entry.IP) {
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

            if (this.entry["TYPE"][0].toUpperCase() == "ROUTER" || this.entry["TYPE"][0].toUpperCase() == "SWITCH") { //conficuration and interfacecs
                let marginFlag = false;

                if (ports.includes(22)) {
                    const btnConfig = this.SideButton("res/configfile.svgz", "Configuration");
                    btnConfig.style.marginTop = "16px";
                    this.sidetools.appendChild(btnConfig);
                    btnConfig.onclick = () => this.Configuration();
                    marginFlag = true;
                } else if (ports.includes(23)) {
                    const btnConfig = this.SideButton("res/configfile.svgz", "Configuration");
                    btnConfig.style.marginTop = "16px";
                    this.sidetools.appendChild(btnConfig);
                    btnConfig.onclick = () => this.Configuration(23);
                    marginFlag = true;
                }

                const btnInterface = this.SideButton("res/interfaces.svgz", "Interfaces");
                if (!marginFlag) btnInterface.style.marginTop = "16px";
                this.sidetools.appendChild(btnInterface);
                btnInterface.onclick = () => this.Interfaces();
            }

        }
    }

    ShowInterfaces() {
        this.interfaces.style.display = this.entry.hasOwnProperty(".INTERFACES") ? "block" : "none";
        this.interfaces.innerHTML = "";

        if (!this.entry.hasOwnProperty(".INTERFACES")) return;

        let obj = JSON.parse(this.entry[".INTERFACES"][0]);

        if (!obj.hasOwnProperty("i")) return;
        if (obj.i.length === 0) return;

        if (!this.floading) {
            this.floading = document.createElement("div");
            this.floading.style.position = "absolute";
            this.floading.style.minWidth = "150px";
            this.floading.style.minHeight = "50px";
            this.floading.style.padding = "4px 8px";
            this.floading.style.borderRadius = "4px";
            this.floading.style.backgroundColor = "rgba(32,32,32,1)";
            this.floading.style.fontSize = "small";
            this.floading.style.boxShadow = "rgba(0,0,0,.5) 0 4px 4px";
            this.floading.style.transition = ".1s";
            this.floading.style.opacity = "0";
            this.floading.style.visibility = "hidden";
            this.content.appendChild(this.floading);
        }

        const frame = document.createElement("div");
        frame.className = "db-int-frame";
        this.interfaces.appendChild(frame);

        let numbering = obj.n ? obj.n : "vertical";
        let list = [];

        for (let i = 0; i < obj.i.length; i++) {
            const front = document.createElement("div");
            front.className = "int-port";
            frame.appendChild(front);

            const icon = document.createElement("div");
            switch (obj.i[i].i) {
                case "Ethernet": icon.style.backgroundImage = "url(res/ethernetport.svgz)"; break;
                case "SFP"     : icon.style.backgroundImage = "url(res/sfpport.svgz)"; break;
                case "USB"     : icon.style.backgroundImage = "url(res/usbport.svgz)"; break;
                case "Serial"  : icon.style.backgroundImage = "url(res/serialport.svgz)"; break;
            }
            front.appendChild(icon);

            if (obj.i[i].i === "Ethernet" || obj.i[i].i === "SFP") {
                icon.appendChild(document.createElement("div")); //led1
                icon.appendChild(document.createElement("div")); //led2
            }

            const num = document.createElement("div");
            num.innerHTML = frame.childNodes.length;
            front.appendChild(num);

            list.push({
                frontElement: front,
                number: num,
                port: obj.i[i].i,
                speed: obj.i[i].s,
                vlan: obj.i[i].v,
                comment: obj.i[i].c,
                link: obj.i[i].l === null ? null : db_equip.find(o => o[".FILENAME"][0] === obj.i[i].l)
            });

            front.onmouseenter = () => {
                this.floading.innerHTML = "";

                const divSpeedColor = document.createElement("div");
                divSpeedColor.style.display = "inline-block";
                divSpeedColor.style.width =  "8px";
                divSpeedColor.style.height = "8px";
                divSpeedColor.style.borderRadius = "2px";
                divSpeedColor.style.marginRight = "4px";
                divSpeedColor.style.backgroundColor = list[i].speedColor;
                divSpeedColor.style.boxShadow = `0 0 4px ${list[i].speedColor}`;
                this.floading.appendChild(divSpeedColor);

                if (obj.i[i].s !== "N/A") this.floading.innerHTML += obj.i[i].s + " ";
                this.floading.innerHTML += obj.i[i].i + "<br>";

                const divVlanColor = document.createElement("div");
                divVlanColor.style.display = "inline-block";
                divVlanColor.style.width = "8px";
                divVlanColor.style.height = "8px";
                divVlanColor.style.borderRadius = "2px";
                divVlanColor.style.marginRight = "4px";
                divVlanColor.style.backgroundColor = list[i].vlanColor ? list[i].vlanColor : "transparent";
                divVlanColor.style.boxShadow = `0 0 4px ${list[i].vlanColor}`;
                this.floading.appendChild(divVlanColor);

                this.floading.innerHTML += "VLAN: " + obj.i[i].v + "<br>";

                if (obj.i[i].c.length > 0) this.floading.innerHTML += obj.i[i].c;

                if (list[i].link) {
                    const divLink = document.createElement("div");
                    divLink.style.padding = "4px";
                    divLink.style.marginTop = "8px";
                    divLink.style.border = "1px solid #C0C0C0";
                    divLink.style.borderRadius = "4px";
                    this.floading.appendChild(divLink);

                    const linkIcon = document.createElement("div");
                    
                    linkIcon.style.backgroundImage = `url(${GetEquipIcon(list[i].link["TYPE"])})`;
                    linkIcon.style.backgroundRepeat = "no-repeat";
                    linkIcon.style.backgroundPosition = "center";
                    linkIcon.style.backgroundSize = "contain";
                    linkIcon.style.width = "100%";
                    linkIcon.style.height = "36px";
                    linkIcon.style.filter = "invert(1)";
                    divLink.appendChild(linkIcon);

                    let name = null;
                    if (list[i].link.hasOwnProperty("NAME")) {
                        name = list[i].link["NAME"][0];
                        const linkName = document.createElement("div");
                        linkName.innerHTML = name;
                        divLink.appendChild(linkName);
                    }

                    if (list[i].link.hasOwnProperty("HOSTNAME") && list[i].link["HOSTNAME"][0] !== name) {
                        const linkHostname = document.createElement("div");
                        linkHostname.innerHTML = list[i].link["HOSTNAME"][0];
                        divLink.appendChild(linkHostname);
                    }

                    if (list[i].link.hasOwnProperty("IP")) {
                        const linkIp = document.createElement("div");
                        linkIp.innerHTML = list[i].link["IP"][0];
                        divLink.appendChild(linkIp);
                    }

                    list[i].frontElement.ondblclick = () => {
                        let filename = list[i].link[".FILENAME"][0];
                        for (let i = 0; i < $w.array.length; i++)
                            if ($w.array[i] instanceof Equip && $w.array[i].filename === filename) {
                                $w.array[i].Minimize(); //minimize/restore
                                return;
                            }

                        new Equip(filename);
                    };
                }

                let xpos = front.getBoundingClientRect().x - this.win.getBoundingClientRect().x;
                if (xpos > this.content.getBoundingClientRect().width - this.floading.getBoundingClientRect().width - 8)
                    xpos = this.content.getBoundingClientRect().width - this.floading.getBoundingClientRect().width - 8;

                this.floading.style.left = `${xpos}px`;
                this.floading.style.top = `${front.getBoundingClientRect().y - this.win.getBoundingClientRect().y + 20}px`;
                this.floading.style.opacity = "1";
                this.floading.style.visibility = "visible";
            };

            front.onmouseleave = () => {
                this.floading.style.opacity = "0";
                this.floading.style.visibility = "hidden";
            };

        }

        this.InitInterfaceComponents(frame, numbering, list, false);
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
                subvalue.innerHTML = values[i];
                value.appendChild(subvalue);

                const thinsp = document.createElement("div");
                thinsp.innerHTML = "&thinsp;";
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
            //subvalue.innerHTML = `${v}&nbsp;`;
            subvalue.innerHTML = v;
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

        const remove = document.createElement("div");
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

                if (xhr.readyState == 4 && xhr.status == 200)
                    if (xhr.responseText.startsWith("{")) {
                        let json = JSON.parse(xhr.responseText);
                        this.Update(json.obj);

                        let filename = json.obj[".FILENAME"][0];
                        this.filename = filename;
                        this.args = filename;

                    } else {
                        this.ConfirmBox(xhr.responseText, true);
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
        this.ShowInterfaces();
        this.LiveInfo();
    }

    Configuration(fetchprotocol = 22) {
        const dialog = this.DialogBox("calc(100% - 34px)");
        if (dialog === null) return;

        const btnOK     = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        buttonBox.removeChild(btnCancel);

        const btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        btnEdit.style.float = "left";
        buttonBox.appendChild(btnEdit);

        innerBox.classList.add("config-code-box");
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
        if (fetchprotocol === 22) dialog.innerBox.parentNode.parentNode.appendChild(btnFetch);

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

        let hasCred = this.entry.hasOwnProperty("USERNAME") && this.entry.hasOwnProperty("PASSWORD");
        if (!hasCred) hasCred = this.entry.hasOwnProperty("SSH USERNAME") && this.entry.hasOwnProperty("SSH PASSWORD");

        const lblFetchUsername = document.createElement("div");
        lblFetchUsername.style.display = "inline-block";
        lblFetchUsername.style.minWidth = "96px";
        lblFetchUsername.innerHTML = "Username:";

        const txtFetchUsername = document.createElement("input");
        txtFetchUsername.type = "text";

        const lblFetchPassword = document.createElement("div");
        lblFetchPassword.style.display = "inline-block";
        lblFetchPassword.style.minWidth = "96px";
        lblFetchPassword.innerHTML = "Password:";

        const txtFetchPassword = document.createElement("input");
        txtFetchPassword.type = "password";
        
        if (!hasCred) {
            divFetch.appendChild(lblFetchUsername);
            divFetch.appendChild(txtFetchUsername);
            divFetch.appendChild(document.createElement("br"));
            divFetch.appendChild(lblFetchPassword);
            divFetch.appendChild(txtFetchPassword);
        } else {
            const lblMessage = document.createElement("div");
            lblMessage.style.display = "inline-block";
            lblMessage.innerHTML = "Are you sure you want to fetch data from this device using SSH?";
            divFetch.appendChild(lblMessage);
        }

        divFetch.appendChild(document.createElement("br"));
        divFetch.appendChild(document.createElement("br"));

        /*const chkFetchRemember = document.createElement("input");
        chkFetchRemember.type = "checkbox";
        divFetch.appendChild(chkFetchRemember);
        this.AddCheckBoxLabel(divFetch, chkFetchRemember, "Remember credentials");

        divFetch.appendChild(document.createElement("br"));
        divFetch.appendChild(document.createElement("br"));*/

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
                lines[i] = lines[i].replaceAll("\\\"", "\\&quot;");

                const divLine = document.createElement("div");
                
                if (lines[i].startsWith("#") || lines[i].startsWith("!")) { //comment
                    divLine.innerHTML = lines[i];
                    divLine.style.color = "#9C6";
                    divLine.style.fontStyle = "italic";
                    innerBox.appendChild(divLine);

                } else if (lines[i].startsWith("/")) { //location
                    divLine.innerHTML = lines[i];
                    divLine.style.color = "#8FD";
                    divLine.style.paddingTop = ".5em";
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

                        if (line[j].startsWith("\"") && line[j].length > 2) { //quot
                            const newSpan = document.createElement("span");
                            newSpan.innerHTML = line[j];
                            newSpan.style.color = "#D98";
                            divLine.appendChild(newSpan);

                        } else {
                            let p = 0;

                            /*if (j == 0) { //verb
                                while (line[0].substring(0, p).trim().length === 0 && p < line[0].length)
                                    p++;                                
                                p = line[0].indexOf(" ", p);

                                const span = document.createElement("span");
                                span.innerHTML = line[0].substring(0, p);
                                span.style.color = "#A8F";
                                divLine.appendChild(span);
                            }*/

                            while (p < line[j].length) {
                                let ep = line[j].indexOf("=", p); //equal position
                                if (ep < 0) break;

                                let sp = line[j].lastIndexOf(" ", ep); //space position
                                if (sp < 0) break;

                                if (p != sp) {
                                    const spanA = document.createElement("span");
                                    spanA.innerHTML = j==0 ? line[j].substring(p, sp).replaceAll(" ", "&ensp;") : line[j].substring(p, sp);
                                    divLine.appendChild(spanA);
                                }
                                
                                const spanB = document.createElement("span");
                                spanB.innerHTML = j==0 ? line[j].substring(sp, ep+1).replaceAll(" ", "&ensp;") : line[j].substring(sp, ep+1);
                                spanB.style.color = "#5BE";
                                divLine.appendChild(spanB);

                                p = ep+1;
                            }

                            if (p < line[j].length) {
                                const spanC = document.createElement("span");
                                spanC.innerHTML = j==0 ? line[j].substring(p).replaceAll(" ", "&ensp;") : line[j].substring(p);
                                divLine.appendChild(spanC);
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

            if (xhr.readyState == 4 && xhr.status == 200) //OK
                DisplayScript(xhr.responseText.split("\n"));
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

            xhrFetch.open("POST", `config/fetch&file=${this.filename}`, true);
            if (hasCred) 
                xhrFetch.send();
            else
                xhrFetch.send(`${txtFetchUsername.value}${String.fromCharCode(127)}${txtFetchPassword.value}`);
        };

        btnFetchCancel.onclick = () => { btnFetch.onclick(); };

        btnEdit.onclick = () => {
            innerBox.contentEditable = true;

            const btnSave = document.createElement("input");
            btnSave.type = "button";
            btnSave.value = "Save";

            buttonBox.removeChild(btnEdit);
            buttonBox.removeChild(btnOK);

            buttonBox.appendChild(btnSave);
            buttonBox.appendChild(btnCancel);

            btnSave.onclick = ()=> {
                const xhrSave = new XMLHttpRequest();
                xhrSave.onreadystatechange = () => {
                    if (xhrSave.status == 403) location.reload(); //authorization
                    
                    if (xhrSave.readyState == 4 && xhrSave.status == 200) //OK
                        if (xhrSave.responseText == "ok") {
                            innerBox.contentEditable = false;                            
                            buttonBox.appendChild(btnEdit);
                            buttonBox.appendChild(btnOK);
                            buttonBox.removeChild(btnSave);
                            buttonBox.removeChild(btnCancel);

                            DisplayScript(innerBox.innerText.split("\n"));
                        } else {
                            btnCancel.onclick();
                            this.ConfirmBox(xhrSave.responseText, true);
                        }
                };
                xhrSave.open("POST", "config/set&file=" + this.filename, true);
                xhrSave.send(innerBox.innerText);
            };
        };

    }

    Interfaces() {
        const dialog = this.DialogBox("calc(100% - 34px)");
        if (dialog === null) return;

        const btnOK     = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox  = dialog.innerBox;

        innerBox.parentElement.style.maxWidth = "80%";
        innerBox.style.padding = "20px";

        const btnFetch = document.createElement("div");
        btnFetch.setAttribute("tip-below", "Auto-populate");
        btnFetch.style.position = "absolute";
        btnFetch.style.left = "0px";
        btnFetch.style.top = "32px";
        btnFetch.style.width = "56px";
        btnFetch.style.height = "56px";
        btnFetch.style.paddingLeft = "4px";
        btnFetch.style.borderRadius = "0 8px 8px 0";
        btnFetch.style.backgroundColor = "rgb(208,208,208)";
        btnFetch.style.backgroundImage = "url(res/configfile.svgz)";
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

        const frame = document.createElement("div");
        frame.className = "int-frame";
        innerBox.appendChild(frame);

        const divNumbering = document.createElement("div");
        divNumbering.style.marginTop = "24px";
        innerBox.appendChild(divNumbering);

        const lblNumbering = document.createElement("div");
        lblNumbering.innerHTML = "Numbering: ";
        lblNumbering.style.display = "inline-block";
        lblNumbering.style.width = "120px";
        divNumbering.appendChild(lblNumbering);

        const txtNumbering = document.createElement("select");
        txtNumbering.style.width = "120px";
        divNumbering.appendChild(txtNumbering);
        let numbering = ["Vertical", "Horizontal"];
        for (let i = 0; i < numbering.length; i++) {
            const optNumbering = document.createElement("option");
            optNumbering.value = numbering[i].toLowerCase();
            optNumbering.innerHTML = numbering[i];
            txtNumbering.appendChild(optNumbering);
        }

        const divAdd = document.createElement("div");
        divAdd.style.marginTop = "8px";
        innerBox.appendChild(divAdd);

        const lblAdd = document.createElement("div");
        lblAdd.innerHTML = "Add interface: ";
        lblAdd.style.display = "inline-block";
        lblAdd.style.width = "120px";
        divAdd.appendChild(lblAdd);

        const txtPort = document.createElement("select");
        txtPort.style.minWidth = "120px";
        divAdd.appendChild(txtPort);
        let portsArray = ["Ethernet", "SFP", "USB", "Serial"];
        for (let i = 0; i < portsArray.length; i++) {
            const optPort = document.createElement("option");
            optPort.value = portsArray[i];
            optPort.innerHTML = portsArray[i];
            txtPort.appendChild(optPort);
        }

        const txtSpeed = document.createElement("select");
        txtSpeed.style.minWidth = "120px";
        divAdd.appendChild(txtSpeed);
        let speedArray = [
            "N/A",
            "10 Mbps", "100 Mbps", "1 Gbps", "2.5 Gbps","5 Gbps", "10 Gbps",
            "25 Gbps", "40 Gbps", "100 Gbps", "200 Gbps", "400 Gbps", "800 Gbps"
        ];
        for (let i = 0; i < speedArray.length; i++) {
            const optSpeed = document.createElement("option");
            optSpeed.value = speedArray[i];
            optSpeed.innerHTML = speedArray[i];
            txtSpeed.appendChild(optSpeed);
        }
        txtSpeed.value = "1 Gbps";

        const lblX = document.createElement("div");
        lblX.innerHTML = " x ";
        lblX.style.display = "inline-block";
        lblX.style.marginLeft = "8px";
        divAdd.appendChild(lblX);

        const txtMulti = document.createElement("input");
        txtMulti.type = "number";
        txtMulti.min = 1;
        txtMulti.max = 48;
        txtMulti.value = 1;
        txtMulti.style.width = "50px";
        divAdd.appendChild(txtMulti);

        const btnAdd = document.createElement("input");
        btnAdd.type = "button";
        btnAdd.value = "Add";
        divAdd.appendChild(btnAdd);


        const divTitle = document.createElement("div");
        divTitle.style.position = "absolute";
        divTitle.style.whiteSpace = "nowrap";
        divTitle.style.overflow = "hidden";
        divTitle.style.left = "16px";
        divTitle.style.right = "16px";
        divTitle.style.top = "280px";
        divTitle.style.height = "20px";
        divTitle.className = "int-title";
        innerBox.appendChild(divTitle);

        let titleArray = ["Interface", "Speed", "VLAN", "Link"];
        for (let i = 0; i < titleArray.length; i++) {
            const newLabel = document.createElement("div");
            newLabel.innerHTML = titleArray[i];
            divTitle.appendChild(newLabel);
        }

        const divList = document.createElement("div");
        divList.style.position = "absolute";
        divList.style.left = "16px";
        divList.style.right = "0";
        divList.style.top = "304px";
        divList.style.bottom = "16px";
        divList.style.overflowX = "hidden";
        divList.style.overflowY = "scroll";
        innerBox.appendChild(divList);
 
        let list = [];

        txtNumbering.onchange = () => this.InitInterfaceComponents(frame, txtNumbering.value, list, true);

        btnAdd.onclick = () => {
            if (list.length + parseInt(txtMulti.value) > 52) return;
            for (let i = 0; i < txtMulti.value; i++)
                AddInterface(txtPort.value, txtSpeed.value, 1, null, "");
        };

        let lastSelect = null;
        let lastMouseY = 0;
        let lastElementY = 0;

        const AddInterface = (port, speed, vlan, link, comment) => {
            const front = document.createElement("div");
            front.className = "int-port";
            front.style.gridArea = `1 / ${frame.childNodes.length+1}`;
            frame.appendChild(front);

            const icon = document.createElement("div");
            front.appendChild(icon);

            const num = document.createElement("div");
            num.innerHTML = frame.childNodes.length;
            front.appendChild(num);

            icon.appendChild(document.createElement("div")); //led1
            icon.appendChild(document.createElement("div")); //led2

            const listElement = document.createElement("div");
            listElement.className = "int-list-element";
            listElement.style.top = `${divList.childNodes.length * 36}px`;
            divList.appendChild(listElement);

            const divMove = document.createElement("div");
            divMove.style.display = "inline-block";
            listElement.appendChild(divMove);

            const txtP = document.createElement("select");
            listElement.appendChild(txtP);
            for (let i = 0; i < portsArray.length; i++) {
                const optPort = document.createElement("option");
                optPort.value = portsArray[i];
                optPort.innerHTML = portsArray[i];
                txtP.appendChild(optPort);
            }

            const txtS = document.createElement("select");
            listElement.appendChild(txtS);
            for (let i = 0; i < speedArray.length; i++) {
                const optSpeed = document.createElement("option");
                optSpeed.value = speedArray[i];
                optSpeed.innerHTML = speedArray[i];
                txtS.appendChild(optSpeed);
            }

            const txtV = document.createElement("input");
            txtV.type = "number";
            txtV.min = 0;
            txtV.max = 4095;
            txtV.value = vlan;
            listElement.appendChild(txtV);

            const txtL = document.createElement("input");
            txtL.type = "text";
            txtL.setAttribute("readonly", true);
            listElement.appendChild(txtL);

            if (link && link.length > 0) {
                let linkedEquip = db_equip.find(o => o[".FILENAME"][0] === link);
                if (linkedEquip) {
                    let value;
                    if (linkedEquip.hasOwnProperty("HOSTNAME") && linkedEquip["HOSTNAME"][0].length > 0)
                        value = linkedEquip["HOSTNAME"][0];
                    else if (linkedEquip.hasOwnProperty("NAME") && linkedEquip["NAME"][0].length > 0)
                        value = linkedEquip["NAME"][0];
                    else if (linkedEquip.hasOwnProperty("IP") && linkedEquip["IP"][0].length > 0)
                        value = linkedEquip["IP"][0];
                    else if (linkedEquip.hasOwnProperty("TYPE") && linkedEquip["TYPE"][0].length > 0)
                        value = linkedEquip["TYPE"][0];
                    else if (linkedEquip.hasOwnProperty(".FILENAME") && linkedEquip[".FILENAME"][0].length > 0)
                        value = linkedEquip[".FILENAME"][0];

                    txtL.value = value;
                    txtL.style.backgroundImage = `url(${GetEquipIcon(linkedEquip["TYPE"])})`;
                }
            }

            const txtC = document.createElement("input");
            txtC.type = "text";
            txtC.placeholder = "comment";
            txtC.value= comment;
            listElement.appendChild(txtC);

            const remove = document.createElement("input");
            remove.type = "button";
            remove.setAttribute("aria-label", "Remove interface");
            listElement.appendChild(remove);

            let obj = {
                frontElement: front,
                listElement   : listElement,
                numberElement : num,
                txtPort  : txtP,
                txtSpeed : txtS,
                txtVlan  : txtV,
                txtComm  : txtC,
                link: link
            };
            list.push(obj);

            front.onclick = () => listElement.scrollIntoView({ behavior: "smooth", block: "center" });
            front.onmouseover = () => divMove.style.backgroundColor = "var(--select-color)";
            front.onmouseleave = () => divMove.style.backgroundColor = "";

            divMove.onmousedown = event => {
                if (event.buttons !== 1) return;
                lastSelect = obj;
                lastMouseY = event.clientY;
                lastElementY = parseInt(lastSelect.listElement.style.top.replace("px", ""));

                lastSelect.listElement.style.zIndex = "1";
                lastSelect.listElement.style.backgroundColor = "var(--pane-color)";
                lastSelect.listElement.style.transition = "transition .2s";
                lastSelect.frontElement.style.backgroundColor = "var(--select-color)";
                lastSelect.frontElement.style.boxShadow = "0 -3px 0px 3px var(--select-color)";
                lastSelect.listElement.childNodes[0].style.backgroundColor = "var(--select-color)";
            };

            innerBox.parentElement.onmouseup = event => {
                if (lastSelect === null) return;
                lastSelect.listElement.style.zIndex = "0";
                lastSelect.listElement.style.transform = "none";
                lastSelect.listElement.style.boxShadow = "none";
                lastSelect.listElement.style.transition = ".2s";
                lastSelect.frontElement.style.backgroundColor = "";
                lastSelect.frontElement.style.boxShadow = "";
                lastSelect.listElement.childNodes[0].style.backgroundColor = "";

                lastSelect = null;
                SortList();
                this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
            };

            innerBox.parentElement.onmousemove = event => {
                if (lastSelect === null) return;
                if (event.buttons !== 1) return;
                let pos = lastElementY - (lastMouseY - event.clientY);
                if (pos < 0) pos = 0;
                lastSelect.listElement.style.transform = "scale(1.05)";
                lastSelect.listElement.style.boxShadow = "0 0 4px rgba(0,0,0,.5)";
                lastSelect.listElement.style.top = `${pos}px`;
                SortList();
                this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
            };

            txtP.onchange = () => {
                switch (txtP.value) {
                    case "Ethernet": icon.style.backgroundImage = "url(res/ethernetport.svgz)"; break;
                    case "SFP"     : icon.style.backgroundImage = "url(res/sfpport.svgz)"; break;
                    case "USB"     : icon.style.backgroundImage = "url(res/usbport.svgz)"; break;
                    case "Serial"  : icon.style.backgroundImage = "url(res/serialport.svgz)"; break;
                }
                this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
            };

            txtS.onchange =
            txtV.onchange = () => {
                this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
            };

            txtL.ondblclick = () => {
                if (obj.link.length > 0) {
                    obj.link = "";
                    txtL.value = "";
                    txtL.style.backgroundImage = "url(res/gear.svgz)";
                }
            };

            txtL.onclick = () => {
                if (obj.link !== null && obj.link.length > 0) return;

                this.AddCssDependencies("list.css");

                const dim = document.createElement("div");
                dim.style.top = "0";
                dim.className = "win-dim";
                innerBox.parentElement.appendChild(dim);

                const frame = document.createElement("div");
                frame.style.position = "absolute";
                frame.style.overflow = "hidden";
                frame.style.width = "100%";
                frame.style.maxWidth = "1000px";
                frame.style.height = "calc(100% - 80px)";
                frame.style.left = " max(calc(50% - 516px), 0px)";
                frame.style.top = "40px";
                frame.style.padding = "8px";
                frame.style.boxSizing = "border-box";
                frame.style.borderRadius = "8px";
                frame.style.backgroundColor = "var(--pane-color)";
                frame.style.boxShadow = "rgba(0,0,0,.2) 0 12px 16px";
                dim.appendChild(frame);

                const txtFind = document.createElement("input");
                txtFind.type = "text";
                txtFind.placeholder = "Search";
                frame.appendChild(txtFind);

                const divEquip = document.createElement("div");
                divEquip.className = "no-results";
                divEquip.style.position = "absolute";
                divEquip.style.left = divEquip.style.right = "0";
                divEquip.style.top = "48px";
                divEquip.style.bottom = "52px";
                divEquip.style.overflowY = "auto";
                frame.appendChild(divEquip);

                const btnCloseLink = document.createElement("input");
                btnCloseLink.type = "button";
                btnCloseLink.value = "Close";
                btnCloseLink.style.position = "absolute";
                btnCloseLink.style.width = "72px";
                btnCloseLink.style.left = "calc(50% - 30px)";
                btnCloseLink.style.bottom = "8px";
                frame.appendChild(btnCloseLink);

                btnCloseLink.onclick = () => {
                    btnCloseLink.onclick = () => { };
                    dim.style.filter = "opacity(0)";
                    setTimeout(() => { innerBox.parentElement.removeChild(dim); }, 200);
                };

                txtFind.onchange = txtFind.oninput = () => {
                    divEquip.innerHTML = "";

                    let keywords = [];
                    if (txtFind.value.trim().length > 0)
                        keywords = txtFind.value.trim().toLowerCase().split(" ");

                    let EQUIP_LIST_ORDER;
                    if (localStorage.getItem("columns_users"))
                        EQUIP_LIST_ORDER = JSON.parse(localStorage.getItem("columns_equip"));
                    else
                        EQUIP_LIST_ORDER = ["NAME", "TYPE", "HOSTNAME", "IP", "MANUFACTURER", "MODEL", "OWNER", "LOCATION"];

                    for (let i = 0; i < db_equip.length; i++) {
                        let match = true;

                        for (let j = 0; j < keywords.length; j++) {
                            let flag = false;
                            for (let k in db_equip[i]) {
                                if (k.startsWith(".")) continue;
                                if (db_equip[i][k][0].toLowerCase().indexOf(keywords[j]) > -1)
                                    flag = true;
                            }
                            if (!flag) {
                                match = false;
                                continue;
                            }
                        }

                        if (!match) continue;

                        const element = document.createElement("div");
                        element.className = "lst-obj-ele";
                        divEquip.appendChild(element);

                        const icon = document.createElement("div");
                        icon.className = "lst-obj-ico";
                        icon.style.backgroundImage = db_equip[i].hasOwnProperty("TYPE") ? `url(${GetEquipIcon(db_equip[i]["TYPE"])})` : "url(res/gear.svgz)";
                        element.appendChild(icon);

                        let filename = db_equip[i][".FILENAME"][0];

                        let value;
                        if (db_equip[i].hasOwnProperty("HOSTNAME") && db_equip[i]["HOSTNAME"][0].length > 0)
                            value = db_equip[i]["HOSTNAME"][0];
                         else if (db_equip[i].hasOwnProperty("NAME") && db_equip[i]["NAME"][0].length > 0)
                            value = db_equip[i]["NAME"][0];
                         else if (db_equip[i].hasOwnProperty("IP") && db_equip[i]["IP"][0].length > 0)
                            value = db_equip[i]["IP"][0];
                         else if (db_equip[i].hasOwnProperty("TYPE") && db_equip[i]["TYPE"][0].length > 0)
                            value = db_equip[i]["TYPE"][0];
                         else if (db_equip[i].hasOwnProperty(".FILENAME") && db_equip[i][".FILENAME"][0].length > 0)
                            value = db_equip[i][".FILENAME"][0];

                        for (let j = 0; j < 6; j++) {
                            if (!db_equip[i].hasOwnProperty(EQUIP_LIST_ORDER[j])) continue;
                            if (db_equip[i][EQUIP_LIST_ORDER[j]][0].length === 0) continue;
                            const newLabel = document.createElement("div");
                            newLabel.innerHTML = db_equip[i][EQUIP_LIST_ORDER[j]][0];
                            newLabel.className = "lst-obj-lbl-" + j;
                            element.appendChild(newLabel);
                        }

                        element.ondblclick = () => {
                            obj.link = filename;
                            txtL.value = value;
                            txtL.style.backgroundImage = icon.style.backgroundImage;
                            btnCloseLink.onclick();
                        };
                    }

                };

                txtFind.focus();

                setTimeout(() => { txtFind.onchange(); }, 1);
            };
            
            remove.onclick = () => {
                divList.removeChild(listElement);
                frame.removeChild(front);
                list.splice(list.indexOf(obj), 1);
                SortList();
                this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
            };

            txtP.value = port;
            txtS.value = speed;
            txtP.onchange();

            SortList();
            this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
        };

        const SortList = () => {
            list.sort((a, b) => {
                return a.listElement.getBoundingClientRect().top - b.listElement.getBoundingClientRect().top;
            });

            for (let i = 0; i < list.length; i++) {
                list[i].numberElement.innerHTML = i+1;
                if (lastSelect === null || list[i].listElement !== lastSelect.listElement)
                    list[i].listElement.style.top = `${i * 36}px`;
            }
        };

        this.InitInterfaceComponents(frame, txtNumbering.value, list, true);

        btnOK.addEventListener("click", () => {

            let payload = "";
            for (const p in this.entry) {
                if (p === ".INTERFACES") continue;
                payload += `${p}${String.fromCharCode(127)}${this.entry[p][0]}${String.fromCharCode(127)}`;
            }

            let interfaces = {
                i: [],
                n: txtNumbering.value
            };

            for (let i = 0; i < list.length; i++) {
                interfaces.i.push({
                    i: list[i].txtPort.value,
                    s: list[i].txtSpeed.value,
                    v: parseInt(list[i].txtVlan.value),
                    c: list[i].txtComm.value,
                    l: list[i].link
                });
            }

            payload += `.INTERFACES${String.fromCharCode(127)}${JSON.stringify(interfaces)}${String.fromCharCode(127)}`;

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.status == 403) location.reload(); //authorization

                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);

                if (xhr.readyState == 4 && xhr.status == 200)
                    if (xhr.responseText.startsWith("{"))
                        this.Update(JSON.parse(xhr.responseText).obj);
                    else
                        this.ConfirmBox(xhr.responseText, true);
            };

            xhr.open("POST", "db/saveequip&" + this.filename, true);
            xhr.send(payload);
        });

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

            btnFetch.style.backgroundImage = fetchToogle ? "url(res/configfile.svgz)" : "url(res/close.svgz)";
            btnFetch.setAttribute("tip-below", fetchToogle ? "Fetch" : "Cancel");

            fetchToogle = !fetchToogle;


            if (fetchToogle) {
                divFetch.innerHTML = "";

                const iconsContainer = document.createElement("div");
                iconsContainer.style.textAlign = "center";
                divFetch.appendChild(iconsContainer);

                let iconslist = ["res/configfile.svgz", "res/arrow.svgz", "res/interfaces.svgz"];
                for (let i = 0; i < iconslist.length; i++) {
                    const icon = document.createElement("div");
                    icon.style.display = "inline-block";
                    icon.style.width = "48px";
                    icon.style.height = "48px";
                    icon.style.backgroundImage = `url(${iconslist[i]})`;
                    icon.style.backgroundSize = "contain";
                    iconsContainer.appendChild(icon);
                }

                const message = document.createElement("div");
                message.innerHTML = "Are you sure you want to populate the interfaces from the device configuration?";
                //message.style.textAlign = "left";
                message.style.padding = "16px";
                divFetch.appendChild(message);

                const btnFetchOk = document.createElement("input");
                btnFetchOk.type = "button";
                btnFetchOk.value = "Fetch";
                divFetch.appendChild(btnFetchOk);

                const btnFetchCancel = document.createElement("input");
                btnFetchCancel.type = "button";
                btnFetchCancel.value = "Cancel";
                divFetch.appendChild(btnFetchCancel);

                btnFetchOk.onclick = () => {
                    const xhrFetchFromConfig = new XMLHttpRequest();
                    xhrFetchFromConfig.onreadystatechange = () => {
                        if (xhrFetchFromConfig.status == 403) location.reload(); //authorization

                        if (xhrFetchFromConfig.readyState == 4 && xhrFetchFromConfig.status == 200) {
                            //
                        }
                    };
                    xhrFetchFromConfig.open("GET", "config/getint=" + this.filename, true);
                    xhrFetchFromConfig.send();
                };

                btnFetchCancel.onclick = () => { btnFetch.onclick(); };
            }
        };

        if (this.entry.hasOwnProperty(".INTERFACES")) {
            let obj = JSON.parse(this.entry[".INTERFACES"][0]);
            for (let i = 0; i < obj.i.length; i++)
                AddInterface(obj.i[i].i, obj.i[i].s, obj.i[i].v, obj.i[i].l, obj.i[i].c);
        } else {
            for (let i = 0; i < 4; i++)
                AddInterface("Ethernet", "1 Gbps", 1, null, "");
        }
    }

    InitInterfaceComponents(frame, numbering, list, editMode) {
        let isMixedInterface = editMode ?
            !list.every(o => o.txtPort.value === list[0].txtPort.value) :
            !list.every(o => o.port === list[0].port);

        let rows = 1, columns = 4;
        if (list.length > 0)
            if (list.length < 16 || list.length < 20 && isMixedInterface) {
                rows = 1;
                columns = list.length;
            } else if (list.length <= 52) {
                rows = 2;
                columns = Math.ceil(list.length / 2);
            } else {
                rows = Math.ceil(list.length / 24);
                columns = Math.ceil(list.length / rows);
            }

        if (numbering === "vertical")
            for (let i = 0; i < list.length; i++)
                list[i].frontElement.style.gridArea = `${i % rows + 1} / ${Math.floor(i / rows) + 1}`;
        else
            for (let i = 0; i < list.length; i++)
                list[i].frontElement.style.gridArea = `${Math.floor(i / columns) + 1} / ${(i % columns) + 1}`;

        let size = columns <= 12 ? 50 : 40;

        if (size === 50)
            for (let i = 0; i < list.length; i++) {
                list[i].frontElement.childNodes[0].style.gridTemplateColumns = "8% 7px auto 7px 8%";
                list[i].frontElement.childNodes[0].style.gridTemplateRows = "auto 4px 16%";
            }
        else 
            for (let i = 0; i < list.length; i++) {
                list[i].frontElement.childNodes[0].style.gridTemplateColumns = "8% 5px auto 5px 8%";
                list[i].frontElement.childNodes[0].style.gridTemplateRows = "auto 3px 24%";
            }

        let vlans = [];
        for (let i = 0; i < list.length; i++) {
            let v = editMode ? list[i].txtVlan.value : list[i].vlan;
            if (!vlans.includes(v)) vlans.push(v);
        }

        for (let i = 0; i < list.length; i++) {
            let led1 = list[i].frontElement.childNodes[0].childNodes[0];
            let led2 = list[i].frontElement.childNodes[0].childNodes[1];

            if (led1) {
                list[i].speedColor = this.GetSpeedColor(editMode ? list[i].txtSpeed.value : list[i].speed);
                led1.style.backgroundColor = list[i].speedColor;
                led1.style.boxShadow = `0 0 4px ${list[i].speedColor}`;
            }

            if (led2) {
                list[i].vlanColor = this.GetVlanColor(editMode ? list[i].txtVlan.value : list[i].vlan, vlans);
                led2.style.backgroundColor = list[i].vlanColor;
                led2.style.boxShadow = `0 0 4px ${list[i].vlanColor}`;
            }

            list[i].frontElement.style.width = `${size - 2}px`;
        }

        frame.style.width = `${columns * size + 28}px`;
        frame.style.gridTemplateColumns = `repeat(${columns}, ${size}px)`;
        frame.style.gridTemplateRows = `repeat(${rows}, $50px)`;
    }

    GetSpeedColor(speed) {
        switch (speed) {
            case "10 Mbps" : return "hsl(20,95%,60%)";
            case "100 Mbps": return "hsl(40,95%,60%)";
            case "1 Gbps"  : return "hsl(60,95%,60%)";
            case "2.5 Gbps": return "hsl(70,95%,60%)";
            case "5 Gbps"  : return "hsl(80,95%,60%)";
            case "10 Gbps" : return "hsl(130,95%,60%)";
            case "25 Gbps" : return "hsl(150,95%,60%)";
            case "40 Gbps" : return "hsl(170,95%,60%)";
            case "100 Gbps": return "hsl(190,95%,60%)";
            case "200 Gbps": return "hsl(210,95%,60%)";
            case "400 Gbps": return "hsl(275,95%,60%)";
            case "800 Gbps": return "hsl(295,95%,60%)";
            default: return "transparent";
        }
    }

    GetVlanColor(vlan, array) {
        if (array.length < 2) return "transparent";
        let index = array.indexOf(vlan);
        if (index === -1) return "transparent";
        return `hsl(${(240 + index * 1.61803398875 * 360) % 360},95%,60%)`;
    }
}