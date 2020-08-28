class Watchdog extends Window {
    constructor() {
        super([64,64,64]);

        this.AddCssDependencies("watchdog.css");

        this.args = null;

        this.setTitle("Watchdog");
        this.setIcon("res/watchdog.svgz");

        this.content.style.overflow = "hidden";

        this.list = [];

        this.busy = false;
        this.currentDate = new Date(Date.now() - Date.now() % (1000 * 60 * 60 * 24));
        this.high = this.currentDate.getTime();
        this.low = null;
        this.seeking = false;
        this.timeOffset = 0;
        this.lastdate = null;

        const btnReload = document.createElement("div");
        btnReload.style.backgroundImage = "url(res/l_reload.svgz)";
        btnReload.setAttribute("tip-below", "Reload");
        this.toolbox.appendChild(btnReload);

        const btnSettings = document.createElement("div");
        btnSettings.style.backgroundImage = "url(res/l_tool02.svgz)";
        btnSettings.setAttribute("tip-below", "Settings");
        this.toolbox.appendChild(btnSettings);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        const side = document.createElement("div");
        side.className = "w-dog-side";
        this.content.appendChild(side);

        this.timeline = document.createElement("div");
        this.timeline.className = "w-dog-timeline";
        this.content.appendChild(this.timeline);

        this.view = document.createElement("div");
        this.view.className = "w-dog-view";
        this.content.appendChild(this.view);

        const lblHost = document.createElement("div");
        lblHost.style.gridArea = "1 / 1";
        lblHost.innerHTML = "Host:";
        side.appendChild(lblHost);

        this.txtHost = document.createElement("input");
        this.txtHost.type = "text";
        this.txtHost.placeholder = "ip or hostname";
        this.txtHost.style.gridArea = "1 / 2";
        side.appendChild(this.txtHost);

        const lblProtocol = document.createElement("div");
        lblProtocol.style.gridArea = "2 / 1";
        lblProtocol.innerHTML = "Protocol:";
        side.appendChild(lblProtocol);

        this.txtProtocol = document.createElement("select");
        this.txtProtocol.style.gridArea = "2 / 2";
        side.appendChild(this.txtProtocol);

        const optArp = document.createElement("option");
        optArp.value = "arp";
        optArp.innerHTML = "ARP";
        this.txtProtocol.appendChild(optArp);

        const optIcmp = document.createElement("option");
        optIcmp.value = "icmp";
        optIcmp.innerHTML = "ICMP";
        this.txtProtocol.appendChild(optIcmp);

        const optTcp = document.createElement("option");
        optTcp.value = "tcp";
        optTcp.innerHTML = "TCP";
        this.txtProtocol.appendChild(optTcp);

        this.txtProtocol.value = "icmp";

        const lblPort = document.createElement("div");
        lblPort.style.gridArea = "3 / 1";
        lblPort.innerHTML = "Port:";
        side.appendChild(lblPort);

        this.txtPort = document.createElement("input");
        this.txtPort.type = "number";
        this.txtPort.setAttribute("disabled", true);
        this.txtPort.min = 1;
        this.txtPort.max = 65535;
        this.txtPort.value = 80;
        this.txtPort.style.gridArea = "3 / 2";
        side.appendChild(this.txtPort);

        this.btnAdd = document.createElement("input");
        this.btnAdd.type = "button";
        this.btnAdd.value = "Add";
        this.btnAdd.setAttribute("disabled", true);
        this.btnAdd.className = "light-button light-button-withicon";
        this.btnAdd.style.backgroundImage = "url(res/new_user.svgz)";
        this.btnAdd.style.gridArea = "4 / 2";
        this.btnAdd.style.marginLeft = "72px";
        side.appendChild(this.btnAdd);

        this.btnAdd.onclick = () => this.Add();
        btnReload.onclick = () => this.Reload();
        btnSettings.onclick = () => this.Settings();

        this.txtHost.onchange =
        this.txtHost.oninput = () => {
            if (this.txtHost.value.length > 0)
                this.btnAdd.removeAttribute("disabled");
            else
                this.btnAdd.setAttribute("disabled", true);
        };

        this.txtProtocol.onchange = () => {
            if (this.txtProtocol.value == "tcp")
                this.txtPort.removeAttribute("disabled");
            else
                this.txtPort.setAttribute("disabled", true);
        };

        let mouseX0;
        let lastOffset = 0;
        this.timeline.onmousedown = event => {
            this.seeking = true;
            mouseX0 = event.clientX;
            lastOffset = this.timeOffset;
        };

        this.timeline.onmousemove = event => {
            if (!this.seeking) return;
            if (event.buttons != 1) return;
            let last = this.timeOffset;
            this.timeOffset = (lastOffset - (mouseX0 - event.clientX));
            this.timeOffset -= this.timeOffset % 20;
            if (this.timeOffset < 0) this.timeOffset = 0;
            if (last === this.timeOffset) return;
            this.Seek(this.timeOffset);
        };

        this.timeline.onmouseup = event => {
            this.seeking = false;
            lastOffset = this.timeOffset;
        };

        this.win.addEventListener("mousemove", event => this.timeline.onmousemove(event));
        this.win.addEventListener("mouseup", event => this.timeline.onmouseup(event));

        this.win.addEventListener("mouseleave", () => {
            this.seeking = false;
        });

        this.Reload();
    }

    AfterResize() { //override
        super.AfterResize();
        setTimeout(() => {
            this.DrawTimeline();
        }, 200);
    }

    Reload() {
        if (this.busy) return;

        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        const ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/watchdog");

        ws.onopen = () => {
            this.busy = true;
            ws.send("list");
        };
        
        ws.onmessage = (event) => {
            let payload = event.data.split("\n");

            if (payload.length == 0) return;

            if (payload[0] == "list") {
                
                this.timeline.innerHTML = "";
                const gradientL = document.createElement("div");
                gradientL.style.position = "absolute";
                gradientL.style.background = "linear-gradient(to right,rgb(64,64,64),transparent)";
                gradientL.style.width = gradientL.style.height = "32px";
                gradientL.style.left = gradientL.style.top = "0";
                gradientL.style.zIndex = "2";
                this.timeline.appendChild(gradientL);
                const gradientR = document.createElement("div");
                gradientR.style.position = "absolute";
                gradientR.style.background = "linear-gradient(to right,transparent,rgb(64,64,64))";
                gradientR.style.width = gradientR.style.height = "32px";
                gradientR.style.right = gradientR.style.top = "0";
                gradientR.style.zIndex = "2";
                this.timeline.appendChild(gradientR);

                this.list = [];
                this.view.innerHTML = "";

                this.currentDate = new Date(Date.now() - Date.now() % (1000 * 60 * 60 * 24));
                this.high = this.currentDate.getTime();
                this.low = null;
                this.timeOffset = 0;
                this.lastdate = null;
                this.DrawTimeline();

                for (let i = 1; i < payload.length; i++)
                    if (payload[i].length > 0)
                        this.list.push({
                            name  : payload[i],
                            div   : document.createElement("div"),
                            graph : document.createElement("div"),
                            data: {}
                        });

                this.list.sort((a, b) => a.name.localeCompare(b.name));

                for (let i = 0; i < this.list.length; i++) {
                    const lblName = document.createElement("div");
                    lblName.innerHTML = this.list[i].name;
                    this.list[i].div.appendChild(lblName);

                    this.list[i].div.appendChild(this.list[i].graph);

                    const btnRemove = document.createElement("div");
                    this.list[i].div.appendChild(btnRemove);

                    this.view.appendChild(this.list[i].div);

                    btnRemove.onclick = () => {
                        this.ConfirmBox("Are you sure you want to delete this entry?", false).addEventListener("click", () => {
                            const xhr = new XMLHttpRequest();
                            xhr.onreadystatechange = () => {
                                if (xhr.readyState == 4 && xhr.status == 200)
                                    if (xhr.responseText === "ok")
                                        this.view.removeChild(this.list[i].div);

                                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                            };
                            xhr.open("GET", `watchdog/remove&name=${this.list[i].name}`, true);
                            xhr.send();
                        });
                    };
                }

                ws.send("get");

            } else {
                this.ExtractData(payload);
            }
        };

        ws.onclose = () => {
            this.busy = false;
        };

        //ws.onerror = error => { console.log(error); };
    }

    GetData(date) {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        const ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/watchdog");

        ws.onopen = () => {
            ws.send(`get:${date}`);
        };

        ws.onmessage = (event) => {
            let payload = event.data.split("\n");
            if (payload.length == 0) return;
            if (payload[0] == "get")  this.ExtractData(payload);
        };
    }

    ExtractData(payload) {
        let name = payload[0];
        let date = payload[1];
        let entry = this.list.find(o => o.name === name);

        let dateSplit = date.split("-").map(o => parseInt(o));

        entry.data[date] = [];
        for (let i = 2; i < payload.length; i++) {
            if (payload[i].length == 0) continue;

            let split = payload[i].split(" ");
            let timeSplit = split[0].split(":").map(o => parseInt(o));

            let time = new Date(dateSplit[0], dateSplit[1], dateSplit[2], timeSplit[0], timeSplit[1], timeSplit[2]).getTime();
            let status = isNaN(split[1]) ? split[1] : parseInt(split[1]);
            entry.data[date].push([time, status]);
        }

        this.Plot(entry);
    }

    PlotAll() {
        for (let i = 0; i < this.list.length; i++)
            this.Plot(this.list[i]);
    }

    Plot(entry) {
        const DAY = 1000 * 3600 * 24;
        const VIEWPORT_DAYS = Math.round(this.timeline.offsetWidth / 480) + 1; //480px == a day length
        const FROM = this.currentDate.getTime() - VIEWPORT_DAYS * DAY - (this.timeOffset / 480) * DAY;
        const TO = this.currentDate.getTime() - (this.timeOffset / 480) * DAY;

        for (let i = FROM; i <= TO; i += DAY) {
            let c = new Date(i);
            let key = `${c.getFullYear()}-${(c.getMonth() + 1).toString().padStart(2, "0")}-${c.getDate().toString().padStart(2, "0")}`;

            if (!entry.data.hasOwnProperty(key)) continue;

            let len = entry.graph.childNodes.length;
            for (let j = 0; j < entry.data[key].length; j++)
                if (j < len) { //use old element

                } else { //need to create new
                    const element = document.createElement("div");

                    //entry.data[key][j][0] - VIEWPORT_DAYS * DAY - (this.timeOffset / 480) * DAY
                    let x = ((this.currentDate.getTime() - entry.data[key][j][0]) / DAY) * 20;
                    console.log(x);

                    let status = "";

                    if (entry.data[key][j][1] === "true")
                        status = PingColor(0);
                    else if (entry.data[key][j][1] === "false")
                        status = PingColor("TimedOut");
                    else 
                        status = PingColor(entry.data[key][j][1]);

                    element.style.transform = `translateX(${x}px)`;
                    element.style.backgroundColor = status;
                    entry.graph.appendChild(element);
                }

        }
    }

    Settings() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length == 2)
                    this.SettingsDialog(split[0] === "true", parseInt(split[1]));
                else 
                    this.ConfirmBox(xhr.responseText, true);
            }

            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("GET", "watchdog/getconfig", true);
        xhr.send();
    }

    SettingsDialog(enable, interval) {
        const dialog = this.DialogBox("450px");
        if (dialog === null) return;

        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        innerBox.style.padding = "32px";
        innerBox.style.display = "grid";
        innerBox.style.gridTemplateColumns = "120px 225px auto";
        innerBox.style.gridTemplateRows = "repeat(12, 32px)";
        innerBox.style.alignItems = "center";

        const divEnable = document.createElement("div");
        divEnable.style.gridArea = "1 / 1 / 2 / 3";
        innerBox.appendChild(divEnable);
        const chkEnable = document.createElement("input");
        chkEnable.type = "checkbox";
        divEnable.appendChild(chkEnable);
        this.AddCheckBoxLabel(divEnable, chkEnable, "Enable watchdog");

        const lblInterval = document.createElement("div");
        lblInterval.style.gridArea = "2 / 1";
        lblInterval.style.display = "inline-block";
        lblInterval.innerHTML = "Interval: ";
        innerBox.appendChild(lblInterval);

        const rngInterval = document.createElement("input");
        rngInterval.style.gridArea = "2 / 2";
        rngInterval.type = "range";
        rngInterval.min = 0;
        rngInterval.max = 8;
        rngInterval.value = 5;
        innerBox.appendChild(rngInterval);

        const lblIntervalValue = document.createElement("div");
        lblIntervalValue.style.gridArea = "2 / 3";
        lblIntervalValue.style.display = "inline-block";
        lblIntervalValue.style.marginLeft = "8px";
        lblIntervalValue.innerHTML = "4 hours";
        innerBox.appendChild(lblIntervalValue);


        const divEMail = document.createElement("div");
        divEMail.style.gridArea = "4 / 1 / 5 / 3";
        innerBox.appendChild(divEMail);
        const chkEMail = document.createElement("input");
        chkEMail.type = "checkbox";
        divEMail.appendChild(chkEMail);
        this.AddCheckBoxLabel(divEMail, chkEMail, "Send e-mail notification:");

        const lblSmtpServer = document.createElement("div");
        lblSmtpServer.style.gridArea = "5 / 1";
        lblSmtpServer.innerHTML = "SMTP server:";
        innerBox.appendChild(lblSmtpServer);
        const txtSmtpServer = document.createElement("input");
        txtSmtpServer.style.gridArea = "5 / 2";
        txtSmtpServer.type = "text";
        txtSmtpServer.placeholder = "smtp.gmail.com";
        innerBox.appendChild(txtSmtpServer);

        const lblSmtpPort = document.createElement("div");
        lblSmtpPort.style.gridArea = "6 / 1";
        lblSmtpPort.innerHTML = "Port:";
        innerBox.appendChild(lblSmtpPort);
        const txtSmtpPort = document.createElement("input");
        txtSmtpPort.style.gridArea = "6 / 2";
        txtSmtpPort.type = "number";
        txtSmtpPort.min = 1;
        txtSmtpPort.max = 49151;
        txtSmtpPort.value = 587;
        innerBox.appendChild(txtSmtpPort);

        const lblUsername = document.createElement("div");
        lblUsername.style.gridArea = "7 / 1";
        lblUsername.innerHTML = "Username:";
        innerBox.appendChild(lblUsername);
        const txtUsername = document.createElement("input");
        txtUsername.style.gridArea = "7 / 2";
        txtUsername.type = "text";
        innerBox.appendChild(txtUsername);

        const lblPassword = document.createElement("div");
        lblPassword.style.gridArea = "8 / 1";
        lblPassword.innerHTML = "Password:";
        innerBox.appendChild(lblPassword);
        const txtPassword = document.createElement("input");
        txtPassword.style.gridArea = "8 / 2";
        txtPassword.type = "password";
        innerBox.appendChild(txtPassword);

        const lblRecipient = document.createElement("div");
        lblRecipient.style.gridArea = "9 / 1";
        lblRecipient.innerHTML = "Recipients:";
        innerBox.appendChild(lblRecipient);
        const txtRecipient = document.createElement("input");
        txtRecipient.style.gridArea = "9 / 2";
        txtRecipient.type = "text";
        txtRecipient.placeholder = "user@domain.com";
        innerBox.appendChild(txtRecipient);

        const lblSSL = document.createElement("div");
        lblSSL.style.gridArea = "10 / 1";
        lblSSL.innerHTML = "Enable SSL:";
        innerBox.appendChild(lblSSL);
        const divSSL = document.createElement("div");
        divSSL.style.gridArea = "10 / 2";
        innerBox.appendChild(divSSL);
        const chkSSL = document.createElement("input");
        chkSSL.type = "checkbox";
        divSSL.appendChild(chkSSL);
        this.AddCheckBoxLabel(divSSL, chkSSL, "&nbsp;");


        const timeMapping = [ 5, 15, 30, 60, 2*60, 4*60, 8*60, 24*60, 48*60 ];

        rngInterval.oninput =
        rngInterval.onchange = () => {
            let value = timeMapping[rngInterval.value];
            lblIntervalValue.innerHTML = value > 60 ? value / 60 + " hours" : value + " minutes";
        };

        btnOK.addEventListener("click", () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok")
                    this.ConfirmBox(xhr.responseText, true);

                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("GET", `watchdog/settings&enable=${chkEnable.checked}&interval=${timeMapping[rngInterval.value]}`, true);
            xhr.send();
        });

        chkEnable.checked = enable;

        for (let i = 0; i < timeMapping.length; i++)
            if (timeMapping[i] === interval)
                rngInterval.value = i;

        rngInterval.oninput();
    }

    Add() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200)
                this.Reload();

            if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
        };

        if (this.txtProtocol.value == "tcp")
            xhr.open("GET", `watchdog/add&host=${this.txtHost.value}&proto=${this.txtProtocol.value}&port=${this.txtPort.value}`, true);
        else 
            xhr.open("GET", `watchdog/add&host=${this.txtHost.value}&proto=${this.txtProtocol.value}`, true);
        xhr.send();

        this.txtHost.value = "";
        this.btnAdd.setAttribute("disabled", true);
    }

    Seek(offset) {
        for (let i = 0; i < this.timeline.childNodes.length; i++) {
            if (this.timeline.childNodes[i].tagName != "svg") continue;
            this.timeline.childNodes[i].style.transform = `translateX(${offset}px)`;
        }
        
        this.DrawTimeline();
    }

    DrawTimeline() {
        const DAY = 1000 * 3600 * 24;
        const VIEWPORT_DAYS = Math.round(this.timeline.offsetWidth / 480) + 1; //480px == a day length

        if (this.low === null) this.low = this.high;

        while (this.low > this.high - VIEWPORT_DAYS * DAY - (this.timeOffset/480) * DAY) {
            const svg = this.GenerateDateSvg(new Date(this.low));
            svg.style.top = "0";
            svg.style.right = `${(this.high - this.low) / DAY * 480}px`;
            this.timeline.appendChild(svg);
            this.low -= DAY;
        }
    }

    GenerateDateSvg(date) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", 480);
        svg.setAttribute("height", 32);
        svg.style.outline = "none";

        for (let i = 0; i < 25; i++) {
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", i * 20);
            dot.setAttribute("cy", 28);
            dot.setAttribute("r", i%2==0 ? 2 : 1);
            dot.setAttribute("fill", "#C0C0C0");
            svg.appendChild(dot);
        }

        for (let i = 2; i < 24; i+=2) {
            const lblTime = document.createElementNS("http://www.w3.org/2000/svg", "text");
            lblTime.innerHTML = i.toString().padStart(2, "0") + ":00";
            lblTime.setAttribute("x", i*20);
            lblTime.setAttribute("y", 18);
            lblTime.setAttribute("fill", "#C0C0C0");
            lblTime.setAttribute("text-anchor", "middle");
            lblTime.setAttribute("font-size", "10px");
            //lblTime.style.transformOrigin = `${10 + i*20}px 14px`;
            //lblTime.style.transform = "rotate(-60deg)";
            svg.appendChild(lblTime);
        }

        const l0 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        l0.setAttribute("x", -9);
        l0.setAttribute("y", 3);
        l0.setAttribute("width", 18);
        l0.setAttribute("height", 3);
        l0.setAttribute("fill", "#C0C0C0");
        svg.appendChild(l0);
        const d0 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        d0.setAttribute("x", -9);
        d0.setAttribute("y", 3);
        d0.setAttribute("width", 18);
        d0.setAttribute("height", 18);
        d0.style = "stroke:#C0C0C0;stroke-width:2;fill:rgba(0,0,0,0)";
        svg.appendChild(d0);
        const n0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        n0.innerHTML = date.getDate();
        n0.setAttribute("x", 0);
        n0.setAttribute("y", 17);
        n0.setAttribute("fill", "#C0C0C0");
        n0.setAttribute("font-size", "11px");
        n0.setAttribute("text-anchor", "middle");
        svg.appendChild(n0);

        date.setDate(date.getDate() + 1);
        const l1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        l1.setAttribute("x", 471);
        l1.setAttribute("y", 3);
        l1.setAttribute("width", 18);
        l1.setAttribute("height", 3);
        l1.setAttribute("fill", "#C0C0C0");
        svg.appendChild(l1);
        const d1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        d1.setAttribute("x", 471);
        d1.setAttribute("y", 3);
        d1.setAttribute("width", 18);
        d1.setAttribute("height", 18);
        d1.style = "stroke:#C0C0C0;stroke-width:2;fill:rgba(0,0,0,0)";
        svg.appendChild(d1);
        const n1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        n1.innerHTML = date.getDate();
        n1.setAttribute("x", 480);
        n1.setAttribute("y", 17);
        n1.setAttribute("fill", "#C0C0C0");
        n1.setAttribute("font-size", "11px");
        n1.setAttribute("text-anchor", "middle");
        svg.appendChild(n1);

        /*if (date.getDate() === 1) {
            const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            const lblMonth = document.createElementNS("http://www.w3.org/2000/svg", "text");
            lblMonth.innerHTML = MONTH[date.getMonth()];
            lblMonth.setAttribute("x", 465);
            lblMonth.setAttribute("y", 11);
            lblMonth.setAttribute("fill", "#C0C0C0");
            lblMonth.setAttribute("text-anchor", "middle");
            lblMonth.setAttribute("font-size", "10px");
            lblMonth.style.transformOrigin = "465px 11px";
            lblMonth.style.transform = "rotate(-90deg)";
            svg.appendChild(lblMonth);
        }*/

        return svg;
    }
}