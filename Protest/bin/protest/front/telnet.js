class Telnet extends Console {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : "";
        this.ws = null;

        this.setTitle("Telnet");
        this.setIcon("res/telnet.svgz");

        this.btnClear = document.createElement("div");
        this.btnClear.style.backgroundImage = "url(res/l_clear.svgz)";
        this.btnClear.setAttribute("tip-below", "Clear");
        this.toolbox.appendChild(this.btnClear);

        this.btnOptions = document.createElement("div");
        this.btnOptions.style.backgroundImage = "url(res/l_options.svgz)";
        this.btnOptions.setAttribute("tip-below", "Options");
        this.toolbox.appendChild(this.btnOptions);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.list.className = "";

        this.txtInput.placeholder = "";
        this.txtInput.style.left = "8px";
        this.txtInput.style.bottom = "8px";
        this.txtInput.style.width = "calc(100% - 16px)";

        this.ConnectDialog(this.args);
    }

    Close() { //override
        if (this.ws != null) this.ws.close();
        super.Close();
    }

    ConnectDialog(target = "") {
        const dialog = this.DialogBox("128px");
        if (dialog === null) return;

        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        innerBox.style.textAlign = "center";
        innerBox.style.padding = "20px 40px";

        if (target.length === 0) btnOK.setAttribute("disabled", true);

        const lblHost = document.createElement("div");
        lblHost.innerHTML = "Target host:";
        lblHost.style.display = "inline-block";
        lblHost.style.minWidth = "100px";
        innerBox.appendChild(lblHost);

        const txtHost = document.createElement("input");
        txtHost.type = "text";
        txtHost.value = target;
        txtHost.placeholder = "IP address or hostname";
        innerBox.appendChild(txtHost);

        setTimeout(() => { txtHost.focus() }, 50);

        txtHost.oninput = txtHost.onchange = () => {
            if (txtHost.value.length === 0)
                btnOK.setAttribute("disabled", true);
            else 
                btnOK.removeAttribute("disabled");
        };

        txtHost.onkeydown = event => {
            if (txtHost.value.length === 0) return;
            if (event.keyCode === 13) {
                this.Connect(txtHost.value);
                btnCancel.onclick();
            }
        };

        btnOK.addEventListener("click", () => {
            this.Connect(txtHost.value);
        });

        btnCancel.addEventListener("click", () => this.Close());
    }

    Connect(target) {
        this.args = target;
        this.txtInput.focus();

        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        if (this.ws != null)
            try {
                this.ws.close();
            } catch (error) { };

        try {
            this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/telnet");
        } catch { }

        this.ws.onopen = () => {
            this.ws.send(target);
        };

        this.ws.onclose = () => {

        };

        this.ws.onmessage = (event) => {
            let payload = event.data;
        };

        this.ws.onerror = (error)=> { console.log(error); };

    }

}