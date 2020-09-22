class Telnet extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : "";
        this.history = [];
        this.ws = null;
        this.last = null;

        let historyIndex = -1;

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

        this.list = document.createElement("div");
        this.list.style.position = "absolute";
        this.list.style.overflowY = "auto";
        this.list.style.left = "0";
        this.list.style.right = "0";
        this.list.style.top = "0";
        this.list.style.bottom = "40px";
        this.list.style.margin = "8px 16px";
        this.list.style.fontFamily = "monospace";
        this.list.style.userSelect = "text";
        this.content.appendChild(this.list);

        this.txtInput = document.createElement("input");
        this.txtInput.type = "text";
        this.txtInput.style.position = "absolute";
        this.txtInput.style.left = "8px";
        this.txtInput.style.bottom = "8px";
        this.txtInput.style.width = "calc(100% - 16px)";
        this.txtInput.style.margin = "0";
        this.txtInput.style.border = "0";
        this.txtInput.style.outline = "none";
        this.txtInput.style.boxSizing = "border-box";
        this.content.appendChild(this.txtInput);

        this.txtInput.onkeydown = (event) => {
            if (event.keyCode === 13) { //enter
                this.Push(this.txtInput.value);
                this.list.scrollTop = this.list.scrollHeight;
                this.txtInput.value = "";
                event.preventDefault();
            }

            if (event.keyCode == 38 || event.keyCode == 40) { //up or down
                if (this.history.length == 0) return;

                if (event.keyCode == 38) historyIndex--; //up
                if (event.keyCode == 40) historyIndex++; //down

                if (historyIndex < 0) historyIndex = this.history.length - 1;
                historyIndex %= this.history.length;
                this.txtInput.value = this.history[historyIndex];

                event.preventDefault();

            } else if (event.keyCode != 37 && event.keyCode != 39) { // not left nor rigth
                historyIndex = -1;
            }
        };


        this.defaultElement = this.txtInput;

        this.txtInput.onfocus = () => { this.BringToFront(); };
        this.escAction = () => { this.txtInput.value = ""; };

        this.ConnectDialog(this.args);
    }

    Close() { //override
        if (this.ws != null) this.ws.close();
        super.Close();
    }

    Push(command) { //override
        if (command.length === 0) command = " ";

        if (command === "!!" && this.history.length === 0) return false;

        if (command === "!!") {
            this.Push(this.history[this.history.length - 1]);
            return false;
        }

        this.history.push(command);

        this.AddToList();
        this.last.innerHTML = command;
        this.last.style.color = "#fff";
        this.AddToList();
        this.list.scrollTop = this.list.scrollHeight;

        if (this.ws != null && this.ws.readyState === 1) {//ready
            this.ws.send(command);

        } else {
            this.AddToList();
            this.last.innerHTML = "web socket error";
            this.last.style.color = "var(--theme-color)";
            this.AddToList();
            this.list.scrollTop = this.list.scrollHeight;
        }

        return true;
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
        txtHost.placeholder = "10.0.0.1:23";
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

        this.AddToList();

        this.ws.onopen = () => {
            this.ws.send(target);
        };

        this.ws.onclose = () => {
            this.AddToList();
            this.last.innerHTML = "tcp connection has been terminated";
            this.last.style.color = "var(--theme-color)";
            this.AddToList();
            this.list.scrollTop = this.list.scrollHeight;
        };

        this.ws.onmessage = (event) => {
            let payload = event.data;

            for (let i = 0; i < payload.length; i++)
                switch (payload[i]) {
                    case "\n":
                        if (this.history.length > 0 && this.last.innerHTML.trim() === this.history[this.history.length - 1].trim())
                            this.last.innerHTML = "";
                        else
                            this.AddToList();
                        break;

                    case " ":
                        this.last.innerHTML += "&nbsp;";
                        break;

                    default:
                        this.last.innerHTML += payload[i];
                        break;

                }

            this.list.scrollTop = this.list.scrollHeight;
        };

        this.ws.onerror = error => {
            this.AddToList();
            this.last.innerHTML = error;
            this.last.style.color = "var(--theme-color)";
            this.AddToList();
            this.list.scrollTop = this.list.scrollHeight;
        };

    }

    AddToList() {
        if (this.last && this.last.innerHTML.length == 0) return this.last;
        const div = document.createElement("div");
        div.style.color = "#aaa";
        this.list.appendChild(div);
        this.last = div;
        return div;
    }

}