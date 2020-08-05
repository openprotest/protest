class NtpClient extends Window {
    constructor() {
        super();
        this.setTitle("NTP client");
        this.setIcon("res/clock.svgz");

        this.id = null;

        this.content.style.padding = "32px 16px 0 16px";
        this.content.style.overflowY = "auto";
        this.content.style.textAlign = "center";

        let lblServer = document.createElement("div");
        lblServer.innerHTML = "Time server:";
        this.content.appendChild(lblServer);

        this.txtServer = document.createElement("input");
        this.txtServer.type = "text";
        this.txtServer.style.fontSize = "larger";
        this.txtServer.style.width = "60%";
        this.txtServer.style.maxWidth = "480px";
        this.txtServer.placeholder = "time.nist.gov";
        this.content.appendChild(this.txtServer);

        const box = document.createElement("div");
        box.style.width = "480px";
        box.style.minHeight = "100px";
        box.style.margin = "40px auto";
        box.style.padding = "16px 24px";
        box.style.backgroundColor = "var(--pane-color)";
        box.style.color = "rgb(16,16,16)";
        box.style.borderRadius = "4px";
        box.style.userSelect = "text";
        this.content.appendChild(box);

        this.lblLive = document.createElement("div");
        this.lblLive.style.color = "#202020";
        this.lblLive.style.fontFamily = "monospace";
        this.lblLive.style.fontSize = "72px";
        this.lblLive.style.fontWeight = "800";
        this.lblLive.innerHTML = "00:00:00";
        box.appendChild(this.lblLive);

        this.lblStuff = document.createElement("div");
        this.lblStuff.style.textAlign = "left";
        box.appendChild(this.lblStuff);

        this.btnSend = document.createElement("input");
        this.btnSend.type = "button";
        this.btnSend.value = "Send request";
        this.btnSend.style.width = "128px";
        this.btnSend.style.minHeight = "40px";
        this.btnSend.style.margin = "2px";
        this.btnSend.style.marginTop = "16px";
        this.btnSend.style.borderRadius = "4px";
        box.appendChild(this.btnSend);
        
        this.btnSend.onclick = () => this.Request(Date.now());

        this.txtServer.onkeydown = event => {
            if (event.keyCode == 13) this.btnSend.onclick();
        };
    }

    Request(id) {
        this.btnSend.setAttribute("disabled", true);

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4) this.btnSend.removeAttribute("disabled");

            if (xhr.readyState == 4 && xhr.status == 200) {
                if (xhr.responseText.length == 0) {
                    this.ConfirmBox("Request timed out.", true);
                    return;
                }

                let timestamp = Date.now();
                let json = JSON.parse(xhr.responseText);

                if (json.local && json.transmit) {
                    this.id = id;

                    this.lblStuff.innerHTML  = `Roundtrip: <b>${json.roundtrip}ms</b><br>`;
                    this.lblStuff.innerHTML += `Transmited time: <b>${json.transmit}</b><br>`;
                    this.lblStuff.innerHTML += `Local time: <b>${json.local}</b>`;

                    let split = json.local.split(":").map(o => parseInt(o));
                    setTimeout(() => {
                        let local = new Date(0, 0, 0, split[0], split[1], split[2], split[3]).getTime() + json.roundtrip / 2;
                        this.Update(id, timestamp, local);
                    }, 1000 - split[3]);

                } else {
                    this.id = null;
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) {
                this.ConfirmBox("Server is unavailable.", true);
            }
        };
        xhr.open("GET", `ntprequest&server=${this.txtServer.value.length == 0 ? "time.nist.gov" : this.txtServer.value}`, true);
        xhr.send();
    }

    Update(id, timestamp, local) {
        if (this.isClosed) return;
        if (id != this.id) return;

        let now = new Date();
        let def = now - timestamp;
        let d = new Date(local + def);
        this.lblLive.innerHTML = `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;

        setTimeout(() => { this.Update(id, timestamp, local) }, 1000);
    }
}