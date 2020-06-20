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

        //this.setTitle("Equip");
        //this.setIcon("res/gear.svgz");

        this.args = filename;
        this.entry = db_equip.find(e => e[".FILENAME"][0] === filename);
        this.filename = filename;

        if (!this.entry) {
            this.btnPopout.style.visibility = "hidden";
            this.ConfirmBox("Equipment do not exist.", true).addEventListener("click", () => this.Close());
            return;
        }

        this.AddCssDependencies("dbview.css");

        if (!this.entry.hasOwnProperty("NAME") || this.entry["NAME"][0].length == 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.entry["NAME"][0]);

        this.setIcon(GetEquipIcon(this.entry["TYPE"]));

        this.content.style.overflowY = "auto";

        const buttons = document.createElement("div");
        buttons.className = "db-buttons";
        this.content.appendChild(buttons);

        const btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        buttons.appendChild(btnEdit);

        const btnFetch = document.createElement("input");
        btnFetch.type = "button";
        btnFetch.value = "Fetch";
        buttons.appendChild(btnFetch);

        const btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.value = "Delete";
        buttons.appendChild(btnDelete);

        this.sidetools = document.createElement("div");
        this.sidetools.className = "db-sidetools";
        this.content.appendChild(this.sidetools);

        const scroll = document.createElement("div");
        scroll.className = "db-scroll";
        this.content.appendChild(scroll);

        this.live = document.createElement("div");
        this.live.className = "db-live";
        scroll.appendChild(this.live);

        this.properties = document.createElement("div");
        this.properties.className = "db-proberties";
        scroll.appendChild(this.properties);

        this.InitializeComponent();
    }

    AfterResize() { //override

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
                const button = this.LiveButton("res/ping.svgz", ips[i]);
                const div = button.div;
                const roundtrip = button.sub;

                this.live.appendChild(div);

                const dot = document.createElement("div");
                dot.style.display = "inline-block";
                dot.style.border = "#202020 1px solid";
                dot.style.borderRadius = "50%";
                dot.style.width = "10px";
                dot.style.height= "10px";
                dot.style.marginRight = "4px";
                dot.style.marginBottom = "-2px";
                roundtrip.appendChild(dot);

                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        let reply = xhr.responseText;
                        dot.style.backgroundColor = PingColor(reply);
                        roundtrip.innerHTML += isNaN(reply) ? reply : `${reply}ms`;
                    }
                };
                xhr.open("GET", "ping&ip=" + ips[i], true);
                xhr.send();

                div.onclick = ()=> {
                    let winPing = null;
                    for (let i = $w.array.length - 1; i > -1; i--)
                        if ($w.array[i] instanceof Ping) {
                            winPing = $w.array[i];
                            break;
                        }

                    if (winPing === null) {
                        new Ping().Filter(this.entry["IP"][0]);
                    } else {
                        winPing.Filter(this.entry["IP"][0]);
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

                usage.style.width = "100px";
                usage.style.borderRadius = "2px";
                usage.style.boxShadow = "#202020 0 0 0 1px inset, #202020 0 0 0 inset";
                usage.innerHTML = "&nbsp;";
                div.appendChild(usage);

                usage.style.transition = "box-shadow .4s";
                setTimeout(() => {
                    let used = parseInt(disks[i+1]);
                    let total = parseInt(disks[i+2]);
                    usage.style.boxShadow = `#202020 0 0 0 1px inset, #404040 ${100*used/total}px 0 0  inset`;
                }, 400);
            }
        }

        if (this.entry.hasOwnProperty("OWNER")) {
            let owners = this.entry["OWNER"][0].split(";").map(o => o.trim());
            for (let i = 0; i < owners.length; i++) {
                let owner = (owners[i].indexOf("\\") > -1) ? owners[i].split("\\")[1] : owners[i];

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

            if (ports.includes(445) && this.entry.hasOwnProperty("OPERATING SYSTEM")) { //Power control 445
                const btnOff = this.SideButton("res/turnoff.svgz", "Power off");
                this.sidetools.appendChild(btnOff);
                btnOff.onclick = () => {
                    if (btnOff.hasAttribute("busy")) return;
                    this.ConfirmBox("Are you sure you want to turn off this device?").addEventListener("click", () => {
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

            }

            if (ports.includes(80) && this.entry.hasOwnProperty("IP")) {
                const btnAction = this.SideButton("res/earth.svgz", "HTTP");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("http://" + this.entry["IP"][0].split(";")[0].trim());
            }

            if (ports.includes(443) && this.entry.hasOwnProperty("IP")) {
                const btnAction = this.SideButton("res/earth.svgz", "HTTPs");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("https://" + this.entry["IP"][0].split(";")[0].trim());
                
            }

            if (ports.includes(21) && this.entry.hasOwnProperty("IP")) {
                const btnAction = this.SideButton("res/shared.svgz", "FTP");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("ftp://" + this.entry["IP"][0].split(";")[0].trim());
            }

            if (ports.includes(989) && this.entry.hasOwnProperty("IP")) {
                const btnAction = this.SideButton("res/shared.svgz", "FTPs");
                this.sidetools.appendChild(btnAction);
                btnAction.onclick = () => window.open("ftps://" + this.entry["IP"][0].split(";")[0].trim());
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

    PushProperty(equip, name, done) {
        if (!equip.hasOwnProperty(name)) return;
        let newProperty = this.Property(name, equip[name][0], equip[name][1]);
        if (done != null) done.push(name);
        this.properties.appendChild(newProperty);
    }

    LiveButton(icon, label) {
        let div = document.createElement("div");
        div.innerHTML = label;
        div.style.backgroundImage = `url(${icon})`;
        this.live.appendChild(div);

        let sub = document.createElement("div");
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
        let button = document.createElement("div");

        let divLabel = document.createElement("div");
        divLabel.style.backgroundImage = "url(" + icon + ")";
        divLabel.innerHTML = label;
        button.appendChild(divLabel);

        return button;
    }

    AddGroup(icon, title) {
        let newGroup = document.createElement("div");
        newGroup.className = "db-property-group";

        let ico = document.createElement("div");
        if (icon.length > 0) ico.style.backgroundImage = "url(" + icon + ")";
        newGroup.appendChild(ico);

        let label = document.createElement("div");
        label.innerHTML = title;
        newGroup.appendChild(label);

        if (this.properties.childNodes.length > 0)
            if (this.properties.childNodes[this.properties.childNodes.length - 1].className == "db-property-group")
                this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length - 1]);

        this.properties.appendChild(newGroup);
    }

    AddProperty(n, v, m) {
        let newProperty = document.createElement("div");
        newProperty.className = "db-property";

        let label = document.createElement("div");
        label.innerHTML = n.toUpperCase();
        newProperty.appendChild(label);

        if (n.includes("PASSWORD")) { //password
            let value = document.createElement("div");
            newProperty.appendChild(value);

            let btnShow = document.createElement("input");
            btnShow.type = "button";
            btnShow.value = "Show";
            value.appendChild(btnShow);

            let btnStamp = document.createElement("input");
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
                value.removeChild(btnShow);

                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) { //OK
                        value.innerHTML = xhr.responseText;

                        let countdown = document.createElement("span");
                        countdown.className = "password-countdown";
                        countdown.style.transition = "all 20s linear 0s";
                        value.appendChild(countdown);

                        let cd_left = document.createElement("div");
                        cd_left.appendChild(document.createElement("div"));
                        countdown.appendChild(cd_left);

                        let cd_right = document.createElement("div");
                        cd_right.appendChild(document.createElement("div"));
                        countdown.appendChild(cd_right);

                        setTimeout(() => {
                            if (!this.isClosed) {
                                //btnShow.style.animation = "fade-in .4s";
                                //btnStamp.style.animation = "fade-in .4s";
                                value.innerHTML = "";
                                value.appendChild(btnShow);
                                value.appendChild(btnStamp);
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

                xhr.open("GET", "ramsg&stpe&" + this.filename + ":" + n, true);
                xhr.send();
            };

        } else if (v.includes(";")) {
            let value = document.createElement("div");

            let values = v.split(";");
            for (let i = 0; i < values.length; i++) {
                if (values[i].trim().length == 0) continue;
                let subvalue = document.createElement("div");
                subvalue.innerHTML = values[i] + "&thinsp;";;
                value.appendChild(subvalue);
            }

            newProperty.appendChild(value);

        } else if (v.startsWith("bar:")) { //bar
            let value = document.createElement("div");

            let split = v.split(":");
            for (let i = 1; i < split.length - 3; i += 4) {
                let used = parseFloat(split[i + 1]);
                let size = parseFloat(split[i + 2]);

                let bar = document.createElement("div");
                bar.className = "db-progress-bar";

                let caption = document.createElement("div");
                caption.innerHTML = split[i] + "&thinsp;";

                let progress = document.createElement("div");
                progress.style.boxShadow = "rgb(64,64,64) " + 100 * used / size + "px 0 0 inset";

                let text = document.createElement("div");
                text.innerHTML = "&thinsp;" + split[i + 1] + "/" + split[i + 2] + " " + split[i + 3];

                bar.appendChild(caption);
                bar.appendChild(progress);
                bar.appendChild(text);
                value.appendChild(bar);
            }

            newProperty.appendChild(value);

        } else {
            let value = document.createElement("div");
            value.innerHTML = v;
            newProperty.appendChild(value);
        }

        if (m.length > 0) {
            let comme = document.createElement("div");
            comme.innerHTML = m;
            newProperty.appendChild(comme);
        }

        return newProperty;
    }

    New() {

    }

    Edit() {

    }
}