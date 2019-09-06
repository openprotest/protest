const EQUIP_ORDER = [
    "NAME", "TYPE",
    
    ["res/portscan.svgz", "Network"],
    "IP", "IPV6", "MASK", "HOSTNAME", "MAC ADDRESS", "DHCP ENABLED", "PORTS", "NETWORK ADAPTER SPEED",

    ["^", "Device"],
    "MANUFACTURER", "MODEL", "SERIAL NUMBER", "CHASSI TYPE", "DESCRIPTION",

    ["res/motherboard.svgz", "Motherboard"],
    "MOTHERBOARD", "MOTHERBOARD MANUFACTURER", "MOTHERBOARD SERIAL NUMBER", "BIOS",

    ["res/cpu.svgz", "Processor"],
    "PROCESSOR", "CPU CORES", "CPU FREQUENCY", "CPU ARCHITECTURE", "L1 CACHE", "L2 CACHE", "L3 CACHE",

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
    "DOMAIN", "USERNAME", "PASSWORD", "LA PASSWORD"
];

class Equip extends Window {
    constructor(equip) {
        if (document.head.querySelectorAll("link[href$='equip.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "equip.css";
            document.head.appendChild(csslink);
        }

        super([208,208,208]);

        if (equip === null) { //add new entry
            this.setTitle("New equipment");
            this.setIcon("res/new_equip.svgz");

            this.AfterResize = () => {}; //do nothing, elements are missing

            let new_equip = {
                "NAME": ["",""],
                "TYPE": ["",""],
                "HOSTNAME": ["",""],
                "IP": ["",""],
                "MANUFACTURER": ["",""],
                "MODEL": ["",""],
                "OWNER": ["",""],
                "LOCATION": ["",""]
            };

            let obj = this.Edit(new_equip);
            const hashEdit = obj[0];
            const btnAdd = obj[1];
            const btnCancel = btnAdd.parentElement.childNodes[1];
            const container = obj[2];            

            btnAdd.parentElement.childNodes[0].onclick = ()=> {
                btnAdd.setAttribute("disabled", true);
                btnAdd.parentElement.childNodes[0].setAttribute("disabled", true);

                let payload = "";
                for (let k in hashEdit)
                    payload += hashEdit[k][1].value + String.fromCharCode(127) + hashEdit[k][2].value + String.fromCharCode(127);

                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {

                    if (xhr.readyState == 4 && xhr.status == 200) { //OK
                        let split = xhr.responseText.split(String.fromCharCode(127));
                        if (split.length > 1) {
                            db_equip_ver = split[0];

                            let filename = "";
                            let type = "";
                            let obj = {};

                            for (let i=2; i<split.length-3; i+=4) {
                                obj[split[i]] = [split[i + 1], split[i + 2]];
                                if (split[i] == "TYPE") type = split[i + 1];
                                if (split[i] == ".FILENAME") filename = split[i + 1];
                            }
                            
                            db_equip.push(obj); //update db_equip
                            
                            for (let i=0; i<$w.array.length; i++) //update equiplist
                                if ($w.array[i] instanceof EquipList) {
                                    let element = document.createElement("div");
                                    element.className = "eql-element";
                                    element.id = "e" + filename;
                                    $w.array[i].list.push(obj);
                                    $w.array[i].content.appendChild(element);
                                    $w.array[i].FillElement(element, obj, type);
                                    $w.array[i].AfterResize();
                                }

                            this.Close();
                            new Equip(obj);
                        } else 
                            this.ConfirmBox(xhr.responseText, true).onclick = ()=> this.Close();
                    }

                    if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true).onclick = ()=> this.Close();
                };

                xhr.open("POST", "saveequip", true);
                xhr.send(payload);
            };

            btnCancel.onclick = () => { this.Close(); };

        } else {
            this.equip = equip;
            this.filename = equip[".FILENAME"][0];
            this.InitializeComponent();
        }
    }

    InitializeComponent() { //override
        this.backgroundIcon = document.createElement("div");
        this.backgroundIcon.className = "eq-background";
        this.backgroundIcon.style.backgroundImage = "url(" + GetIcon(this.equip["TYPE"]) + ")";
        this.content.appendChild(this.backgroundIcon);

        this.content.style.overflowY = "hidden";
        this.content.style.padding = "0px 16px";
        
        this.options = document.createElement("div");
        this.options.className = "eq-options";
        this.content.appendChild(this.options);

        this.properties = document.createElement("div");
        this.properties.className = "eq-list";
        this.content.appendChild(this.properties);

        this.protocols = document.createElement("div");
        this.protocols.className = "eq-protocols";
        this.content.appendChild(this.protocols);

        this.more = document.createElement("div");
        this.more.style.paddingBottom = "16px";
        this.content.appendChild(this.more);

        this.instant = document.createElement("div");
        this.more.appendChild(this.instant);

        let btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        btnEdit.onclick = ()=> this.Edit(this.equip);
        this.options.appendChild(btnEdit);

        let btnVerify = document.createElement("input");
        btnVerify.type = "button";
        btnVerify.value = "Fetch";
        btnVerify.onclick = ()=> this.Verify(this.equip);
        this.options.appendChild(btnVerify);

        let btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.value = "Delete";
        btnDelete.onclick = ()=> this.Delete(this.equip);
        this.options.appendChild(btnDelete);

        this.InitList(this.equip);
        this.AfterResize();
    }

    AfterResize() { //override
        if (this.win.clientWidth < 480) {
            this.protocols.style.width = "30px";
            this.properties.style.left = "64px";
            this.options.style.left = "64px";

            this.properties.appendChild(this.more);
            this.more.className = "";

        } else if (this.win.clientWidth < 1250) {
            this.protocols.style.width = "200px";
            this.properties.style.left = "200px";
            this.options.style.left = "200px";

            this.properties.appendChild(this.more);
            this.more.className = "";

        } else {
            this.protocols.style.width = "200px";
            this.properties.style.left = "200px";
            this.options.style.left = "200px";

            this.content.appendChild(this.more);
            this.more.className = "eq-more-side";
        }
    }

    InitList(equip) {
        let done = [];

        this.properties.innerHTML = "";
        this.protocols.innerHTML = "";
        if (this.dot) this.task.removeChild(this.dot);

        if (!this.equip.hasOwnProperty("NAME") || this.equip["NAME"][0].length == 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.equip["NAME"][0]);

        this.setIcon(GetIcon(this.equip["TYPE"]));
        this.backgroundIcon.style.backgroundImage = "url(" + GetIcon(this.equip["TYPE"]) + ")";

        for (let i=0; i<EQUIP_ORDER.length; i++)
            if(Array.isArray(EQUIP_ORDER[i]))
                this.Group((EQUIP_ORDER[i][0] == "^")? GetIcon(equip["TYPE"]) : EQUIP_ORDER[i][0], EQUIP_ORDER[i][1]);
            else
                this.PushProperty(equip, EQUIP_ORDER[i], done);
        
        this.Group("res/other.svgz", "Other");
        let isGroupEmpty = true;
        for (let k in equip)
            if (!done.includes(k, 0) && !k.startsWith(".")) {
                this.PushProperty(equip, k, done);
                isGroupEmpty = false;
            }

        if (isGroupEmpty && this.properties.childNodes[this.properties.childNodes.length-1].className == "eq-property-group")
            this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length-1]);
        
        let seperator1 = document.createElement("div");
        seperator1.style.width = "16px";
        seperator1.style.height = "16px";
        this.properties.appendChild(seperator1);
        pt_equip(this);

        this.more.innerHTML = "";
        this.more.appendChild(this.instant);

        let btnPing = this.SideBar("res/ping.svgz", "Ping");

        if (equip.hasOwnProperty("IP")) {
            this.pingResult = document.createElement("div");
            this.pingResult.style.backgroundColor = PingColor(-1);
            this.pingResult.className = "eq-ping-dot";
            btnPing.childNodes[1].appendChild(this.pingResult);

            this.pingLabel = document.createElement("div");
            this.pingLabel.className = "eq-ping-label";
            btnPing.childNodes[1].appendChild(this.pingLabel);

            this.dot = document.createElement("div");
            this.dot.className = "task-icon-dots";
            this.dot.style.backgroundColor = this.pingResult.style.backgroundColor;
            this.dot.style.width = "18%";
            this.dot.style.height = "18%";
            this.task.appendChild(this.dot);
        } else {
            btnPing.style.display = "none";
        }
        
        btnPing.onclick = ()=> {
            if (!equip.hasOwnProperty("IP")) return;
            let winPing = null;
            for (let i=$w.array.length-1; i>-1; i--)
                if ($w.array[i] instanceof Ping) {
                    winPing = $w.array[i];
                    break;
                }
            if (winPing === null)
                new Ping().Filter(equip["IP"][0]);

            else {
                winPing.Filter(equip["IP"][0]);
                winPing.BringToFront();
            }
        };

        if (equip.hasOwnProperty("MAC ADDRESS")) {
            let btnWoL = this.SideBar("res/wol.svgz", "Wake on LAN");
            let wol_once = false;
            btnWoL.onclick = () => {
                if (wol_once) return;
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4) wol_once = false;

                    if (xhr.readyState == 4 && xhr.status == 200) //OK
                        if (xhr.responseText == "ok") this.ConfirmBox("Magic package has been sent successfully.", true);
                        else this.ConfirmBox(xhr.responseText, true);
                    else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                wol_once = true;
                xhr.open("GET", "wakeup&file=" + this.filename, true);
                xhr.send();
            };
        }

        if (equip.hasOwnProperty("PORTS")) {
            let ports_split = this.equip["PORTS"][0].split(";").map(o => parseInt(o.trim()));

            if (ports_split.includes(445) && equip.hasOwnProperty("OPERATING SYSTEM")) { //Power control 445
                let btnTurnOff = this.SideBar("res/turnoff.svgz", "Turn off");
                let turnoff_once = false;
                btnTurnOff.onclick = () => {
                    if (turnoff_once) return;
                    this.ConfirmBox("Are you sure you want to turn off this device?").addEventListener("click", () => {
                        let xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = ()=> {
                            if (xhr.readyState == 4) turnoff_once = false;
                            if (xhr.readyState == 4 && xhr.status == 200)
                                if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0)
                                this.ConfirmBox("Server is unavailable.", true);
                        };
                        turnoff_once = true;
                        xhr.open("GET", "shutdown&file=" + this.filename, true);
                        xhr.send();
                    });
                };

                let btnRestart = this.SideBar("res/restart.svgz", "Restart");
                let restart_once = false;
                btnRestart.onclick = () => {
                    if (restart_once) return;
                    this.ConfirmBox("Are you sure you want to restart this device?").addEventListener("click", () => {
                        let xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = ()=> {
                            if (xhr.readyState == 4) restart_once = false;
                            if (xhr.readyState == 4 && xhr.status == 200)
                                if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0)
                                this.ConfirmBox("Server is unavailable.", true);
                        };
                        restart_once = true;
                        xhr.open("GET", "reboot&file=" + this.filename, true);
                        xhr.send();
                    });
                };

                let btnLogoff = this.SideBar("res/logoff.svgz", "Log off");
                let logoff_once = false;
                btnLogoff.onclick = () => {
                    if (logoff_once) return;
                    this.ConfirmBox("Are you sure you want to lock this device?").addEventListener("click", () => {
                        let xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = ()=> {
                            if (xhr.readyState == 4) logoff_once = false;
                            if (xhr.readyState == 4 && xhr.status == 200)
                                if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                            if (xhr.readyState == 4 && xhr.status == 0)
                                this.ConfirmBox("Server is unavailable.", true);
                        };
                        logoff_once = true;
                        xhr.open("GET", "logoff&file=" + this.filename, true);
                        xhr.send();
                    });
                };

                let smb_once = false;
                if (this.equip.hasOwnProperty("LOGICAL DISK")) { //for each logical disk
                    let split = this.equip["LOGICAL DISK"][0].split(":");
                    for (let i = 1; i < split.length - 3; i += 4) {
                        let btnDrive = this.SquareButton("res/diskdrive.svgz", "Drive " + split[i], this.more);
                        btnDrive.onclick = ()=> {
                            if (smb_once) return;
                            let xhr = new XMLHttpRequest();
                            xhr.onreadystatechange = () => {
                                if (xhr.readyState == 4) smb_once = false;
                                if (xhr.readyState == 4 && xhr.status == 200) if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                            };
                            smb_once = true;
                            xhr.open("GET", "ramsg&smb&" + this.filename + "&" + split[i] + "$", true);
                            xhr.send();
                        };
                    }
                }
            } //end of power control 445
            
            if (ports_split.includes(80) && equip.hasOwnProperty("IP"))
                this.SquareButton("res/earth.svgz", "HTTP", this.more).onclick = () => {
                    window.open("http://" + equip["IP"][0].split(";")[0].trim());
                };

            if (ports_split.includes(443) && equip.hasOwnProperty("IP"))
                this.SquareButton("res/earth.svgz", "HTTPs", this.more).onclick = () => {
                    window.open("https://" + equip["IP"][0].split(";")[0].trim());
                };

            if (ports_split.includes(21) && equip.hasOwnProperty("IP"))
                this.SquareButton("res/shared.svgz", "FTP", this.more).onclick = () => {
                    window.open("ftp://" + equip["IP"][0].split(";")[0].trim());
                };

            if (ports_split.includes(989) && equip.hasOwnProperty("IP"))
                this.SquareButton("res/shared.svgz", "FTPs", this.more).onclick = () => {
                    window.open("ftps://" + equip["IP"][0].split(";")[0].trim());
                };

            if (ports_split.includes(22)) { //SSH
                let btnSSH = this.SideBar("res/ssh.svgz", "Secure Shell");
                btnSSH.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ramsg&ssh&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports_split.includes(445) && equip.hasOwnProperty("OPERATING SYSTEM")) {
                let btnPSE = this.SideBar("res/psremote.svgz", "PS Remoting"); //PSExec
                btnPSE.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ramsg&pse&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports_split.includes(3389)) { //RDP
                let btnRDP = this.SideBar("res/rdp.svgz", "Remote desktop");
                btnRDP.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ramsg&rdp&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports_split.includes(5900)) { //UltraVNC
                let btnUVNC = this.SideBar("res/uvnc.svgz", "UltraVNC");
                btnUVNC.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "ramsg&vnc&" + this.filename, true);
                    xhr.send();
                };
            }

            if (ports_split.includes(9100) && equip.hasOwnProperty("IP")) { //print test
                let btnPrintTest = this.SideBar("res/printer.svgz", "Print test page");
                btnPrintTest.onclick = () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200)
                            if (xhr.responseText != "ok")
                                this.ConfirmBox(xhr.responseText, true);
                            else
                                this.ConfirmBox("Test sent successfully.", true);

                        if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "printtest&target=" + equip["IP"][0].split(";")[0].trim(), true);
                    xhr.send();
                };
            }

            if (ports_split.includes(445) && equip.hasOwnProperty("OPERATING SYSTEM")) {            
                if (equip.hasOwnProperty("IP")) {
                    this.SquareButton("res/console.svgz", "Processes", this.more).onclick = () => {
                        let win = new Wmi(equip["IP"][0].split(";")[0].trim(), "SELECT CreationDate, ExecutablePath, Name, ProcessId \nFROM Win32_Process");
                        win.setIcon("res/console.svgz");
                        if (!this.equip.hasOwnProperty("NAME") || this.equip["NAME"][0].length == 0)
                            win.setTitle("[untitled] - Processes");
                        else
                            win.setTitle(this.equip["NAME"][0] + " - Processes");
                    };

                    this.SquareButton("res/service.svgz", "Services", this.more).onclick = () => {
                        let win = new Wmi(equip["IP"][0].split(";")[0].trim(), "SELECT DisplayName, Name, ProcessId, State \nFROM Win32_Service");
                        win.setIcon("res/service.svgz");
                        if (!this.equip.hasOwnProperty("NAME") || this.equip["NAME"][0].length == 0)
                            win.setTitle("[untitled] - Services");
                        else
                            win.setTitle(this.equip["NAME"][0] + " - Services");
                    };
                }
            }
        }

        if (equip.hasOwnProperty("OWNER")) {
            setTimeout(() => {
                let owners_split = this.equip["OWNER"][0].split(";").map(o => o.trim());
                for (let i = 0; i < owners_split.length; i++) {
                    if (owners_split[i].length == 0) continue;

                    let owner = (owners_split[i].indexOf("\\") > -1) ? owners_split[i].split("\\")[1] : owners_split[i];
                    for (let j = 0; j < db_users.length; j++)
                        
                        if (db_users[j].hasOwnProperty("USERNAME") && db_users[j]["USERNAME"][0] == owner) {
                            let filename = db_users[j][".FILENAME"][0];
                            this.SquareButton("res/user.svgz", owner, this.more).onclick = () => {                                                               
                                for (let k = 0; k < $w.array.length; k++)
                                    if ($w.array[k] instanceof User && $w.array[k].filename == filename) {
                                        $w.array[k].Minimize(); //minimize/restore
                                        return;
                                    }
                                if (db_users[j][".FILENAME"][0] == filename) new User(db_users[j]);
                            };
                            break;
                        }
                }
            }, 1);
        }

    }

    SideBar(icon, label) {
        let divOption = document.createElement("div");
        this.protocols.appendChild(divOption);

        let divIcon = document.createElement("div");
        divIcon.style.backgroundImage = "url("+ icon +")";
        divOption.appendChild(divIcon);
        
        let divLabel = document.createElement("div");
        divLabel.innerHTML = label;
        divOption.appendChild(divLabel);

        return divOption;
    }

    SquareButton(icon, label, container) {
        let button = document.createElement("div");
        button.className = "eq-square-button";
        container.appendChild(button);

        let divIcon = document.createElement("div");
        divIcon.style.backgroundImage = "url(" + icon + ")";
        button.appendChild(divIcon);

        let divLabel = document.createElement("div");
        divLabel.innerHTML = label;
        button.appendChild(divLabel);

        return button;
    }

    Group(icon, title) {
        let newGroup = document.createElement("div");
        newGroup.className = "eq-property-group";

        let ico = document.createElement("div");
        if (icon.length > 0) ico.style.backgroundImage = "url("+ icon +")";
        newGroup.appendChild(ico);

        let label = document.createElement("div");
        label.innerHTML = title;
        newGroup.appendChild(label);

        if (this.properties.childNodes.length > 0)
            if (this.properties.childNodes[this.properties.childNodes.length-1].className == "eq-property-group")
                this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length-1]);

        this.properties.appendChild(newGroup);
    }

    PushProperty(equip, name, done) {
        if (!equip.hasOwnProperty(name)) return;
        
        let newProperty = this.Property(name, equip[name][0], equip[name][1]);

        if (done != null) done.push(name);
        this.properties.appendChild(newProperty);
    }

    Property(n, v, m) {
        let newProperty = document.createElement("div");
        newProperty.className = "eq-property";

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
            for (let i=0; i<values.length; i++) {
                if (values[i].trim().length == 0) continue;
                let subvalue = document.createElement("div");
                subvalue.innerHTML = values[i];
                value.appendChild(subvalue);
            }

            newProperty.appendChild(value);
            
        } else if (v.startsWith("bar:")) { //bar
            let value = document.createElement("div");

            let split = v.split(":");
            for (let i = 1; i < split.length - 3; i += 4) {
                let used = parseFloat(split[i+1]);
                let size = parseFloat(split[i+2]);

                let bar = document.createElement("div");
                bar.className = "eq-progress-bar";

                let caption = document.createElement("div");
                caption.innerHTML = split[i];

                let progress = document.createElement("div");
                progress.style.boxShadow = "var(--theme-color) " + 100*used/size + "px 0 0 inset";

                let text = document.createElement("div");
                text.innerHTML = split[i+1] + "/" + split[i+2] + " " + split[i+3];

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

    Edit(equip) {
        let dialog    = this.DialogBox();
        let btnOK     = dialog[0];
        let container = dialog[1];

        let hashEdit = {};

        container.style.padding = "8px";

        let btnAdd = document.createElement("input");
        btnAdd.type = "button";
        btnAdd.value = "Add";
        btnAdd.style.position = "absolute";
        btnAdd.style.left = "16px";
        container.parentElement.childNodes[1].appendChild(btnAdd);

        container.parentElement.childNodes[1].style.minWidth = "350px"; //buttonsBox

        btnAdd.onclick = ()=> { this.EditProp("", "", false, container, hashEdit)[1].focus(); };

        let autofill = document.createElement("datalist"); //Autofill
        autofill.id = "eq_autofill";
        for (let i=0; i<EQUIP_ORDER.length; i++) {
            if (Array.isArray(EQUIP_ORDER[i])) continue;
            let opt = document.createElement("option");
            opt.value = EQUIP_ORDER[i];
            autofill.appendChild(opt);
        }
        container.appendChild(autofill);

        let autofill_type = document.createElement("datalist"); //Autofill if type
        autofill_type.id = "eq_autofill_type";
        for (let o in EQUIP_ICON) {
            let opt = document.createElement("option");
            opt.value = o.toUpperCase();
            autofill_type.appendChild(opt);
        }
        container.appendChild(autofill_type);

        let done = [];
        for (let i=0; i<EQUIP_ORDER.length; i++)
            if(!Array.isArray(EQUIP_ORDER[i])) {
                if (equip[EQUIP_ORDER[i]] == undefined) continue;
                this.EditProp(EQUIP_ORDER[i], equip[EQUIP_ORDER[i]][0], false, container, hashEdit);
                done.push(EQUIP_ORDER[i]);
            }


        for (let k in equip)
            if (!done.includes(k, 0)) {
                if (equip[k] == undefined && k!="") continue;
                this.EditProp(k, equip[k][0], (k==".FILENAME"), container, hashEdit);
            }
                
        const ok_click = btnOK.onclick;

        btnOK.value = "Save";
        btnOK.onclick = ()=> {
            btnOK.setAttribute("disabled", true);
            let payload = "";
            for (let k in hashEdit)
                payload += hashEdit[k][1].value + String.fromCharCode(127) + hashEdit[k][2].value + String.fromCharCode(127);

            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = ()=> {
                if (xhr.readyState == 4) ok_click();

                if (xhr.readyState == 4 && xhr.status == 200) { //OK
                    let split = xhr.responseText.split(String.fromCharCode(127));
                    if (split.length > 1) {
                        db_equip_ver = split[0];

                        let type = "";
                        let obj = {};

                        for (let i=2; i<split.length-3; i+=4) {
                            obj[split[i]] = [split[i+1], split[i+2]];
                            if (split[i] == "TYPE") type = split[i+1];
                        }

                        for (let i=0; i<db_equip.length; i++) //update db_equip
                            if (db_equip[i][".FILENAME"][0] == this.filename) {
                                db_equip[i] = obj;
                                break;
                            }

                        for (let i=0; i<$w.array.length; i++) //update equiplist
                            if ($w.array[i] instanceof EquipList) {
                                let elements = $w.array[i].content.querySelectorAll("[id=e"+this.filename+"]");
                                for (let j=0; j<elements.length; j++) {
                                    elements[j].innerHTML = "";
                                    $w.array[i].FillElement(elements[j], obj, type);
                                }
                                $w.array[i].AfterResize();
                            }

                        this.equip = obj;

                        this.InitList(obj);
                        this.AfterResize();

                    } else
                        this.ConfirmBox(xhr.responseText, true);
                }

                if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("POST", "saveequip", true);
            xhr.send(payload);
        };

        return [hashEdit, btnAdd, container];
    }

    Verify(equip) {
        let confirm = document.createElement("div");
        confirm.className = "confirm";
        this.win.appendChild(confirm);

        this.content.style.filter = "blur(2px)";

        let waitbox = document.createElement("span");
        waitbox.className = "waitbox";
        confirm.appendChild(waitbox);

        waitbox.appendChild(document.createElement("div"));

        let waitLabel = document.createElement("span");
        waitLabel.className = "wait-label";
        waitLabel.innerHTML = "Doing stuff. Please wait.";
        confirm.appendChild(waitLabel);

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = ()=> {
            if (xhr.readyState == 4) this.win.removeChild(confirm);

            if (xhr.readyState == 4 && xhr.status == 200) { //OK
                let split = xhr.responseText.split(String.fromCharCode(127));

                if (split.length > 1) {
                    const obj = this.Edit(equip);
                    const hashEdit  = obj[0];
                    const btnAdd    = obj[1];
                    const container = obj[2];
                    this.Verify_Compare(hashEdit, split, container);
                } else {
                    this.ConfirmBox(xhr.responseText, true);
                }
            }

            if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("POST", "wmiverify&file=" + this.filename, true);
        xhr.send();
    }

    Verify_Compare(hashEdit, split, container) {
        for (let i=0; i<split.length-1; i+=2) 
            if (hashEdit.hasOwnProperty(split[i])) { //exists
                if (hashEdit[split[i]][2].value.toLowerCase() == split[i + 1].toLowerCase()) { //same
                    hashEdit[split[i]][2].style.backgroundImage = "url(res/check.svgz)";
                } else { //modified
                    if (split[i] != "TYPE") { //ignore TYPE modifications if a TYPE exists
                        hashEdit[split[i]][2].style.backgroundImage = "url(res/change.svgz)";
                        hashEdit[split[i]][2].value = split[i + 1];
                    }
                }
            } else { //new
                let entry = this.EditProp(split[i], split[i+1], false, container, hashEdit);
                if (entry != undefined) entry[2].style.backgroundImage = "url(res/newentry.svgz)";
            }
    }

    EditProp(name, value, readonly, container, hashEdit) {
        let newProperty = document.createElement("div");
        newProperty.className = "eq-edit-property";
        container.appendChild(newProperty);

        let txtName = document.createElement("input");
        txtName.type = "text";
        txtName.value = name.toUpperCase();
        txtName.setAttribute("list", "eq_autofill");
        if (readonly) txtName.setAttribute("readonly", true);
        newProperty.appendChild(txtName);

        let txtValue = document.createElement("input");
        txtValue.type = "text";
        txtValue.value = (name=="")? "" : value;
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
        remove.onclick = ()=> {
            if (newProperty.style.filter == "opacity(0)") return; //once
            delete hashEdit[name];
            newProperty.style.filter = "opacity(0)";

            for (let i=0; i<newProperty.childNodes.length; i++) {
                newProperty.childNodes[i].style.height = "0";
                newProperty.childNodes[i].style.margin = "0";
                newProperty.childNodes[i].style.padding = "0";
            }

            setTimeout(()=> {
                container.removeChild(newProperty);
            }, 150);
        };
                
        let key = (name.length > 0) ? name : new Date().getTime();
        hashEdit[key] = [newProperty, txtName, txtValue];
        return hashEdit[key];
    }

    Delete(equip) {
        this.ConfirmBox("Are you sure you want to delete this device?", false).addEventListener("click", ()=>{
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                let split = xhr.responseText.split(String.fromCharCode(127));

                if (xhr.readyState == 4 && xhr.status == 200) { //OK
                    if (split[0] == "ok") {
                        this.Close();

                        db_equip_ver = split[1];

                        for (let i=0; i<db_equip.length; i++) //update db_equip
                            if (db_equip[i][".FILENAME"][0] == this.filename) {
                                db_equip.splice(i, 1);
                                break;
                            }

                        for (let i=0; i<$w.array.length; i++)
                            if ($w.array[i] instanceof EquipList) {

                                for (let j = 0; j < $w.array[i].list.length; j++)
                                    if ($w.array[i].list[j][".FILENAME"][0] == this.filename)
                                        $w.array[i].list.splice(j, 1);

                                let elements = $w.array[i].content.querySelectorAll("[id=e" + this.filename + "]");
                                for (let j = 0; j < elements.length; j++)
                                    $w.array[i].content.removeChild(elements[j]);

                                $w.array[i].AfterResize();
                            }

                    } else
                        this.ConfirmBox(xhr.responseText, true);
                }

                if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("POST", "delequip&" + this.filename, true);
            xhr.send();
        });
    }

}