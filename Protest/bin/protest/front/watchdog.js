class Watchdog extends Window {
    constructor() {
        super([64,64,64]);

        this.args = null;

        this.setTitle("Watchdog");
        this.setIcon("res/watchdog.svgz");

        this.content.style.overflow = "hidden";

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
        side.style.overflowY = "scroll";
        this.content.appendChild(side);

        const timeline = document.createElement("div");
        timeline.style.position = "absolute";
        timeline.style.left = "250px";
        timeline.style.right = "8px";
        timeline.style.top = "4";
        timeline.style.height = "40px";
        this.content.appendChild(timeline);

        const view = document.createElement("div");
        view.style.position = "absolute";
        view.style.left = "250px";
        view.style.right = "8px";
        view.style.top = "40px";
        view.style.bottom = "8px";
        view.style.borderRadius = "4px";
        view.style.backgroundColor = "var(--pane-color)";
        view.style.overflowY = "scroll";
        this.content.appendChild(view);

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
        btnSettings.onclick = () => this.SettingsDialog();

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

        this.ws.onopen = () => { };

        this.ws.onclose = () => { };

        this.ws.onmessage = (event) => { };

        this.ws.onerror = (error) => { console.log(error); };

    }

    SettingsDialog() {
        const dialog = this.DialogBox("250px");
        if (dialog === null) return;

        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

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