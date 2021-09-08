class TraceRoute extends Console {
    constructor(args) {
        super();

        this.args = args ? args : { entries: [] };

        this.hashtable = {};      //contains all the ping elements
        this.pending = [];        //pending request
        this.ws = null;           //websocket
        this.taskIconSpin = null; //spinner on icon task-bar

        this.SetTitle("Trace route");
        this.SetIcon("res/traceroute.svgz");

        this.taskIconSpin = document.createElement("div");
        this.taskIconSpin.className = "task-icon-spin";
        this.task.appendChild(this.taskIconSpin);

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);

        this.btnClear = document.createElement("div");
        this.btnClear.style.backgroundImage = "url(res/l_clear.svgz)";
        this.btnClear.setAttribute("tip-below", "Clear");
        this.toolbox.appendChild(this.btnClear);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        if (this.args.entries) { //restore entries from previous session
            let temp = this.args.entries;
            this.args.entries = [];
            for (let i = 0; i < temp.length; i++)
                this.Push(temp[i]);
        }

        this.btnDownload.addEventListener("click", (event) => {
            const NL = String.fromCharCode(13) + String.fromCharCode(10);
            const TB = String.fromCharCode(9);

            let text = "";
            for (let key in this.hashtable) {
                text += key + NL;
                for (let i = 0; i < this.hashtable[key].result.childNodes.length; i += 2)
                    text += TB + this.hashtable[key].result.childNodes[i].innerHTML.trim() + TB + this.hashtable[key].result.childNodes[i + 1].innerHTML.trim() + NL;
                text += NL;
            }

            text = text.replaceAll("&thinsp;", " ");

            if (text.length == 0) return;

            const pseudo = document.createElement("a");
            pseudo.style.display = "none";
            this.win.appendChild(pseudo);

            const NOW = new Date();
            pseudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            pseudo.setAttribute("download", "trace_route_" +
                NOW.getFullYear() +
                ((NOW.getMonth() < 10) ? "0" + NOW.getMonth() : NOW.getMonth()) +
                ((NOW.getDate() < 10) ? "0" + NOW.getDate() : NOW.getDate()) + "_" +
                ((NOW.getHours() < 10) ? "0" + NOW.getHours() : NOW.getHours()) +
                ((NOW.getMinutes() < 10) ? "0" + NOW.getMinutes() : NOW.getMinutes()) +
                ((NOW.getSeconds() < 10) ? "0" + NOW.getSeconds() : NOW.getSeconds()) +
                ".txt");

            pseudo.click(null);
        });

        this.btnClear.addEventListener("click", (event) => {
            const btnOK = this.ConfirmBox("Are you sure you want to clear the list?");
            if (btnOK) btnOK.addEventListener("click", () => {
                this.args.entries = [];
                this.list.innerHTML = "";
                this.hashtable = {};
                this.pending = [];
                this.UpdateTaskIcon();
            });
        });
    }

    Push(name) { //override
        if (!super.Push(name)) return;
        this.Filter(name);
    }

    Close() { //override
        super.Close();
        if (this.ws != null) this.ws.close();
    }

    BringToFront() { //override
        super.BringToFront();

        this.task.style.backgroundColor = "rgb(56,56,56)";
        this.icon.style.filter = "brightness(6)";
    }

    Filter(hostname) {
        if (hostname.indexOf(";", 0) > -1) {
            let ips = hostname.split(";");
            for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());

        } else if (hostname.indexOf(",", 0) > -1) {
            let ips = hostname.split(",");
            for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());

        } else if (hostname.indexOf("-", 0) > -1) {
            let split = hostname.split("-");
            let start = split[0].trim().split(".");
            let end = split[1].trim().split(".");

            if (start.length == 4 && end.length == 4 && start.every(o => !isNaN(o)) && end.every(o => !isNaN(o))) {
                let istart = (parseInt(start[0]) << 24) + (parseInt(start[1]) << 16) + (parseInt(start[2]) << 8) + (parseInt(start[3]));
                let iend = (parseInt(end[0]) << 24) + (parseInt(end[1]) << 16) + (parseInt(end[2]) << 8) + (parseInt(end[3]));

                if (istart > iend) iend = istart;
                if (iend - istart > 1024) iend = istart + 1024;

                function intToBytes(int) {
                    let b = [0, 0, 0, 0];
                    let i = 4;
                    do {
                        b[--i] = int & (255);
                        int = int >> 8;
                    } while (i);
                    return b;
                }
                for (let i = istart; i <= iend; i++)
                    this.Add(intToBytes(i).join("."));

            } else {
                this.Add(hostname);
            }

        } else if (hostname.indexOf("/", 0) > -1) {
            let cidr = parseInt(hostname.split("/")[1].trim());
            if (isNaN(cidr)) return;

            let ip = hostname.split("/")[0].trim();
            let ipBytes = ip.split(".");
            if (ipBytes.length != 4) return;

            ipBytes = ipBytes.map(o => parseInt(o));

            let bits = "1".repeat(cidr).padEnd(32, "0");
            let mask = [];
            mask.push(parseInt(bits.substr(0, 8), 2));
            mask.push(parseInt(bits.substr(8, 8), 2));
            mask.push(parseInt(bits.substr(16, 8), 2));
            mask.push(parseInt(bits.substr(24, 8), 2));

            let net = [], broadcast = [];
            for (let i = 0; i < 4; i++) {
                net.push(ipBytes[i] & mask[i]);
                broadcast.push(ipBytes[i] | (255 - mask[i]));
            }

            this.Filter(net.join(".") + " - " + broadcast.join("."));

        } else {
            this.Add(hostname);
        }
    }

    Add(hostname) {
        if (this.hashtable.hasOwnProperty(hostname)) {
            this.list.appendChild(this.hashtable[hostname].element);
            return;
        }

        let element = document.createElement("div");
        element.className = "list-element collapsible-box";
        this.list.appendChild(element);

        let btnExpand = document.createElement("div");
        btnExpand.className = "list-btnExpand";
        element.appendChild(btnExpand);

        let name = document.createElement("div");
        name.className = "list-label";
        name.style.paddingLeft = "24px";
        name.innerHTML = hostname;
        element.appendChild(name);

        let result = document.createElement("div");
        result.className = "list-result collapsed";
        result.innerHTML = "";
        element.appendChild(result);

        let status = document.createElement("div");
        status.className = "list-status";
        status.innerHTML = "";
        element.appendChild(status);

        let remove = document.createElement("div");
        remove.className = "list-remove";
        element.appendChild(remove);

        this.hashtable[hostname] = {
            element: element,
            result: result,
            status: status,
            expand: false,
            list: []
        };

        remove.onclick = () => { this.Remove(hostname); };

        btnExpand.onclick = () => {
            if (this.hashtable[hostname].expand) {
                this.hashtable[hostname].expand = false;
                element.style.height = "32px";
                btnExpand.style.transform = "rotate(-90deg)";
                result.className = "list-result collapsed";
                result.scrollTop = 0;
            } else {
                this.hashtable[hostname].expand = true;
                element.style.height = "auto";
                btnExpand.style.transform = "rotate(0deg)";
                result.className = "list-result expaned enumerated";
            }
        };

        this.args.entries.push(hostname);

        this.pending.push(hostname);

        if (this.ws != null && this.ws.readyState === 1) { //ready
            this.ws.send(hostname);
        } else if (this.ws === null || (this.ws != null && this.ws.readyState != 0)) { //not connecting
            this.Connect();
        }

        this.UpdateTaskIcon();
    }

    Remove(hostname) {
        if (!this.hashtable.hasOwnProperty(hostname)) return;
        this.list.removeChild(this.hashtable[hostname].element);
        delete this.hashtable[hostname];

        if (this.pending.includes(hostname)) this.pending.splice(this.pending.indexOf(hostname), 1);

        if (this.pending.length === 0)
            if (this.ws != null && this.ws.readyState === 1) this.ws.close();

        const index = this.args.entries.indexOf(hostname);
        if (index > -1)
            this.args.entries.splice(index, 1);

        this.UpdateTaskIcon();
    }

    Connect() {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        if (this.ws != null) {
            try {
                this.ws.close();
            } catch (error) { };
        }

        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/traceroute");

        this.ws.onopen = () => {
            for (let i = 0; i < this.pending.length; i++)
                this.ws.send(this.pending[i]);

            for (let i = 0; i < this.list.childNodes.length; i++) //remove warnings, if exist
                if (this.list.childNodes[i].id == "self_destruct")
                    this.list.removeChild(this.list.childNodes[i]);
        };

        this.ws.onclose = () => {
            if (this.pending.length === 0) return;

            let error_message = document.createElement("div");
            error_message.id = "self_destruct";
            error_message.innerHTML = "Connection is closed. <u>Click to reconnect</u>";
            error_message.style.color = "var(--theme-color)";
            error_message.style.cursor = "pointer";
            this.list.appendChild(error_message);
            this.list.scrollTop = this.list.scrollHeight;

            error_message.onclick = () => {
                for (let i = 0; i < this.list.childNodes.length; i++)
                    if (this.list.childNodes[i].id == "self_destruct")
                        this.list.removeChild(this.list.childNodes[i]);
                this.Connect();
            };
        };

        this.ws.onerror = error => console.log(error);

        this.ws.onmessage = (event) => {
            let split = event.data.split(String.fromCharCode(127));
            let name = split[0];

            if (name == "over" || name == "unreachable") {
                name = split[1];
                if (this.hashtable.hasOwnProperty(name)) {
                    this.hashtable[name].status.style.visibility = "hidden";
                    if (this.pending.includes(name)) this.pending.splice(this.pending.indexOf(name), 1);
                }
                this.UpdateTaskIcon();

            } else if (name == "[hostnames]") {
                let target = split[1];
                if (this.hashtable.hasOwnProperty(target)) {
                    for (let i = 2; i < split.length; i+=2)
                        for (let j = 0; j < this.hashtable[target].result.childNodes.length; j += 2)
                            if (this.hashtable[target].result.childNodes[j].innerHTML.trim() == split[i]) {
                                this.hashtable[target].result.childNodes[j + 1].innerHTML = `${split[i + 1]}&thinsp;`;
                                break;
                            }
                }
            } else
                if (this.hashtable.hasOwnProperty(name)) {
                    let hop = document.createElement("div");
                    hop.innerHTML = `${split[1]}&thinsp;`;
                    this.hashtable[name].result.appendChild(hop);

                    let hostname = document.createElement("div");
                    this.hashtable[name].result.appendChild(hostname);

                    //if (split.length == 3)
                    //    hostname.setAttribute("roundrtip", split[2]+"ms");
                }
        };

    }

    UpdateTaskIcon() {
        this.taskIconSpin.style.visibility = (this.pending.length === 0) ? "hidden" : "visible";
    }

}