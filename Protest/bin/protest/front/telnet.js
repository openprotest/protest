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

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.list = document.createElement("div");
        this.list.style.color = "#ccc";
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

        this.txtInput.onfocus = () =>  this.BringToFront();
        this.escAction = () => { this.txtInput.value = ""; };

        this.btnClear.onclick = () => {
            this.list.innerHTML = "";
            this.PushLine();
        };

        this.ConnectDialog(this.args);
    }

    Close() { //override
        if (this.ws != null) this.ws.close();
        super.Close();
    }

    Push(command) { //override
        if (command.length === 0) command = "\n";

        if (command === "!!" && this.history.length === 0) return false;

        if (command === "!!") {
            this.Push(this.history[this.history.length - 1]);
            return false;
        }

        if (command.length > 0 && command !== "\r" && command !== "\n")
            this.history.push(command);

        this.PushLine();
        this.last.innerHTML = "> " + command;
        this.last.style.color = "#fff";
        this.PushLine();
        this.list.scrollTop = this.list.scrollHeight;

        if (this.ws != null && this.ws.readyState === 1) {//ready
            this.ws.send(command);

        } else {
            this.PushLine();
            this.last.innerHTML = "web socket error";
            this.last.style.color = "var(--theme-color)";
            this.PushLine();
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

        btnOK.value = "Connect";
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

        setTimeout(()=> { txtHost.focus() }, 50);

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

        if (this.ws != null) {
            try {
                this.ws.close();
            } catch (error) { };
        }
        try {
            this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/telnet");
        } catch { }

        this.PushLine();

        this.ws.onopen = () => {
            this.ws.send(target);
        };

        this.ws.onclose = () => {
            let message = this.PushLine();
            message.innerHTML = "tcp connection has been terminated <u>click to reconnect</u>";
            message.style.color = "var(--theme-color)";
            message.style.cursor = "pointer";
            message.onclick = event => {
                message.onclick = () => { };
                message.style.cursor = "";
                message.innerHTML = "tcp connection has been terminated";
                this.list.appendChild(document.createElement("hr"));
                this.PushLine();
                this.Connect(target);
                this.list.scrollTop = this.list.scrollHeight;
            };            
            this.list.scrollTop = this.list.scrollHeight;
        };

        let front     = "#ccc";
        let back      = "transparent";
        let bold      = false;
        let underline = false;

        this.ws.onmessage = (event) => {
            let payload = event.data;
            let line = payload.split("\n");

            for (let i = 0; i < line.length; i++) {
                let s = line[i].indexOf(String.fromCharCode(27));

                if (s > 0) { //styled

                    let split = line[i].split(String.fromCharCode(27)); //esc
                    for (let j = 0; j < split.length; j++) {

                        let          e = split[j].indexOf("m"); //ansi stop
                        if (e == -1) e = split[j].indexOf("J"); //clear screen
                        if (e == -1) e = split[j].indexOf("K"); //clear line

                        if (e == -1) e = split[j].indexOf("A"); //move cursor |
                        if (e == -1) e = split[j].indexOf("B"); //move cursor |
                        if (e == -1) e = split[j].indexOf("C"); //move cursor |
                        if (e == -1) e = split[j].indexOf("D"); //move cursor | cursor navigation
                        if (e == -1) e = split[j].indexOf("E"); //move cursor | is not supported
                        if (e == -1) e = split[j].indexOf("F"); //move cursor |
                        if (e == -1) e = split[j].indexOf("G"); //move cursor |
                        if (e == -1) e = split[j].indexOf("H"); //move cursor |

                        if (e == -1) e = split[j].indexOf(" ");

                        let ansi = split[j].substring(0, e+1);
                        switch (ansi) {
                            case "[0m":
                                front = "#ccc";
                                back = "transparent";
                                bold = false;
                                underline = false;
                                break;

                            case "[1m": bold = true; break;
                            case "[4m": underline = true; break;

                            case "[7m":
                                front = "#222";
                                back = "#ccc";
                                break;

                            case "[30m": front = "#000"; break;
                            case "[31m": front = "#d00"; break;
                            case "[32m": front = "#0d0"; break;
                            case "[33m": front = "#0dd"; break;
                            case "[34m": front = "#00d"; break;
                            case "[35m": front = "#d0d"; break;
                            case "[36m": front = "#0dd"; break;
                            case "[37m": front = "#ddd"; break;

                            case "[30;1m": front = "#222"; bold = true; break;
                            case "[31;1m": front = "#f22"; bold = true; break;
                            case "[32;1m": front = "#2f2"; bold = true; break;
                            case "[33;1m": front = "#2ff"; bold = true; break;
                            case "[34;1m": front = "#22f"; bold = true; break;
                            case "[35;1m": front = "#f2f"; bold = true; break;
                            case "[36;1m": front = "#2ff"; bold = true; break;
                            case "[37;1m": front = "#fff"; bold = true; break;

                            case "[40m": back = "#000"; break;
                            case "[41m": back = "#d00"; break;
                            case "[42m": back = "#0d0"; break;
                            case "[43m": back = "#0dd"; break;
                            case "[44m": back = "#00d"; break;
                            case "[45m": back = "#d0d"; break;
                            case "[46m": back = "#0dd"; break;
                            case "[47m": back = "#ddd"; break;

                            case "[40;1m": back = "#000"; bold = true; break;
                            case "[41;1m": back = "#d00"; bold = true; break;
                            case "[42;1m": back = "#0d0"; bold = true; break;
                            case "[43;1m": back = "#0dd"; bold = true; break;
                            case "[44;1m": back = "#00d"; bold = true; break;
                            case "[45;1m": back = "#d0d"; bold = true; break;
                            case "[46;1m": back = "#0dd"; bold = true; break;
                            case "[47;1m": back = "#ddd"; bold = true; break;

                            case "[0J": case "[1J": case "[2J":
                                this.PushLine();
                                this.last.style.height = this.content.clientHeight;
                                this.PushLine();
                                break;

                            case "[0K": case "[1K": case "[2K":
                                this.last.innerHTML = "";
                                break;
                        }

                        this.PushText(split[j].replace(ansi, ""), front, back, bold, underline);
                    }            

                } else { //plain
                    if (front == "#ccc" && back == "transparent")
                        this.last.innerHTML += line[i].replaceAll(" ", "&nbsp;");
                    else 
                        this.PushText(line[i], front, back);
                }

                if (line[i].endsWith("\r")) {
                    if (i == 0 && //negate echo
                        this.history.length > 0 &&
                        this.last.innerHTML.trim() === this.history[this.history.length - 1].trim()) {
                        this.last.innerHTML = "";
                    } else {
                        this.PushLine();
                    }
                }
            }

            this.list.scrollTop = this.list.scrollHeight;
        };

        //this.ws.onerror = error => console.log(error);
    }

    PushText(text, front, back, bold = false, underline = false) {
        const div = document.createElement("div");
        div.style.display = "inline-block";
        if (front != "#ccc") div.style.color = front;
        if (back != "transparent") div.style.backgroundColor = back;
        if (bold) div.style.fontWeight = "600";
        if (underline) div.style.textDecoration = "underline";
        div.innerHTML = text.replaceAll(" ", "&nbsp;");
        this.last.appendChild(div);
    }

    PushLine() {
        if (this.last && this.last.innerHTML.length == 0) return this.last;
        const div = document.createElement("div");
        this.list.appendChild(div);
        this.last = div;
        return div;
    }

}