class Watchdog extends Window {
    constructor() {
        super([64,64,64]);

        this.args = null;

        this.setTitle("Watchdog");
        this.setIcon("res/watchdog.svgz");

        this.content.style.overflow = "hidden";

        this.list = [];

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
        side.style.position = "absolute";
        side.style.display = "grid";
        side.style.gridTemplateColumns = "84px 150px";
        side.style.gridTemplateRows = "repeat(4, 32px)";
        side.style.alignItems = "baseline";
        side.style.left = "8px";
        side.style.top = "40px";
        side.style.bottom = "8px";
        side.style.width = "250px";
        side.style.overflowY = "auto";
        this.content.appendChild(side);

        const timeline = document.createElement("div");
        timeline.style.position = "absolute";
        timeline.style.left = "250px";
        timeline.style.right = "8px";
        timeline.style.top = "4";
        timeline.style.height = "40px";
        this.content.appendChild(timeline);

        this.view = document.createElement("div");
        this.view.style.position = "absolute";
        this.view.style.left = "262px";
        this.view.style.right = "8px";
        this.view.style.top = "40px";
        this.view.style.bottom = "8px";
        this.view.style.borderRadius = "4px";
        this.view.style.backgroundColor = "var(--pane-color)";
        this.view.style.color = "#202020";
        this.view.style.overflowY = "scroll";
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

        this.Reload();
    }

    Reload() {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        if (this.ws != null)
            try {
                this.ws.close();
            } catch (error) { };

        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/watchdog");

        this.ws.onopen = () => {
            this.ws.send("list");
        };
        
        this.ws.onmessage = (event) => {
            let payload = event.data.split("\n");
            if (payload.length == 0) return;

            if (payload[0] == "list") {
                this.list = [];

                for (let i = 1; i < payload.length; i++)
                    this.list.push({
                        name  : payload[i],
                        div   : document.createElement("div"),
                        graph : document.createElement("div")
                    });

                this.list.sort((a, b) => a.name.localeCompare(b.name));
                
                for (let i = 0; i < this.list.length; i++) {
                    this.list[i].div.innerHTML = this.list[i].name;
                    this.view.appendChild(this.list[i].div);
                }

                this.ws.send("get");
            } else {

            }
        };

        //this.ws.onclose = () => { };

        //this.ws.onerror = (error) => { console.log(error); };
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


}