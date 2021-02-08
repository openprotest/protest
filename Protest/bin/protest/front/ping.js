const PING_HISTORY_LEN = 16; //6-20

class Ping extends Console {
    constructor(args) {
        super();

        this.args = args ? args : {
            entries     : [],
            timeout     : 1000,
            method      : "icmp",
            moveToBottom: false
        };

        this.count = 0;
        this.hashtable = {};
        this.request = "";
        this.ws = null;

        this.setTitle(this.args.method == "icmp" ? "Ping" : "ARP ping");
        this.setIcon("res/ping.svgz");

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);

        this.btnClear = document.createElement("div");
        this.btnClear.style.backgroundImage = "url(res/l_clear.svgz)";
        this.btnClear.setAttribute("tip-below", "Clear");
        this.toolbox.appendChild(this.btnClear);

        this.btnOptions = document.createElement("div");
        this.btnOptions.style.backgroundImage = "url(res/l_options.svgz)";
        this.btnOptions.setAttribute("tip-below", "Options");
        this.toolbox.appendChild(this.btnOptions);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        if (this.args.entries) { //restore entries from previous session
            let temp = this.args.entries;
            this.args.entries = [];
            for (let i = 0; i < temp.length; i++) 
                this.Push(temp[i]);
        }

        this.btnDownload.addEventListener("click", event => {
            const NL = String.fromCharCode(13) + String.fromCharCode(10);
            const TB = String.fromCharCode(9);

            let text = "";
            for (let key in this.hashtable) {
                text += this.hashtable[key].hostname;
                for (let i = 10; i < PING_HISTORY_LEN; i++)
                    text += TB + ((this.hashtable[key].ping[i] == -1) ? "" : this.hashtable[key].ping[i]);
                text += NL;
            }

            if (text.length == 0) return;

            const pseudo = document.createElement("a");
            pseudo.style.display = "none";
            this.win.appendChild(pseudo);

            const NOW = new Date();
            pseudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            pseudo.setAttribute("download", "ping_" +
                NOW.getFullYear() +
                ((NOW.getMonth() < 10) ? "0" + NOW.getMonth() : NOW.getMonth()) +
                ((NOW.getDate() < 10) ? "0" + NOW.getDate() : NOW.getDate()) + "_" +
                ((NOW.getHours() < 10) ? "0" + NOW.getHours() : NOW.getHours()) +
                ((NOW.getMinutes() < 10) ? "0" + NOW.getMinutes() : NOW.getMinutes()) +
                ((NOW.getSeconds() < 10) ? "0" + NOW.getSeconds() : NOW.getSeconds()) +
                ".txt");

            pseudo.click(null);
        });

        this.btnClear.addEventListener("click", event => {
            const btnOK = this.ConfirmBox("Are you sure you want to clear the list?");
            if (btnOK) btnOK.addEventListener("click", () => {
                let split = this.request.split(";");
                for (let i = 0; i < split.length; i++) {
                    if (split[i].length == 0) continue;
                    this.Remove(this.hashtable[split[i]].hostname);
                }
            });
        });

        this.btnOptions.addEventListener("click", event => {
            const dialog = this.DialogBox("214px");
            if (dialog === null) return;
            const btnOK = dialog.btnOK;
            const innerBox = dialog.innerBox;

            innerBox.parentElement.style.maxWidth = "600px";
            innerBox.style.padding = "16px 0px 0px 16px";

            const lblTimeout = document.createElement("div");
            lblTimeout.innerHTML = "Time out (ms):";
            lblTimeout.style.display = "inline-block";
            lblTimeout.style.minWidth = "120px";
            innerBox.appendChild(lblTimeout);

            const txtTimeout = document.createElement("input");
            txtTimeout.type = "number";
            txtTimeout.min = "1";
            txtTimeout.max = "5000";
            txtTimeout.value = this.args.timeout;
            txtTimeout.style.width = "100px";
            innerBox.appendChild(txtTimeout);

            innerBox.appendChild(document.createElement("br"));

            const lblPingMethod = document.createElement("div");
            lblPingMethod.innerHTML = "Ping method:";
            lblPingMethod.style.display = "inline-block";
            lblPingMethod.style.minWidth = "120px";
            innerBox.appendChild(lblPingMethod);

            const selPingMethod = document.createElement("select");
            selPingMethod.style.minWidth = "100px";
            innerBox.appendChild(selPingMethod);

            const optICMP = document.createElement("option");
            optICMP.innerHTML = "ICMP";
            optICMP.value = "icmp";
            selPingMethod.appendChild(optICMP);

            const optARP = document.createElement("option");
            optARP.innerHTML = "ARP";
            optARP.value = "arp";
            selPingMethod.appendChild(optARP);

            selPingMethod.value = this.args.method;

            innerBox.appendChild(document.createElement("br"));

            const lblDisplayMode = document.createElement("div");
            lblDisplayMode.innerHTML = "Display mode:";
            lblDisplayMode.style.display = "inline-block";
            lblDisplayMode.style.minWidth = "120px";
            innerBox.appendChild(lblDisplayMode);

            const selDisplayMode = document.createElement("select");
            selDisplayMode.style.minWidth = "100px";
            innerBox.appendChild(selDisplayMode);

            const optNormal = document.createElement("option");
            optNormal.innerHTML = "Normal";
            optNormal.value = "normal";
            selDisplayMode.appendChild(optNormal);

            const optTied = document.createElement("option");
            optTied.innerHTML = "Tied";
            optTied.value = "tied";
            selDisplayMode.appendChild(optTied);

            if (this.list.className != "no-entries")
                selDisplayMode.selectedIndex = 1;

            innerBox.appendChild(document.createElement("br"));
            innerBox.appendChild(document.createElement("br"));

            const chkMoveToBottom = document.createElement("input");
            chkMoveToBottom.type = "checkbox";
            chkMoveToBottom.checked = this.args.moveToBottom;
            innerBox.appendChild(chkMoveToBottom);
            this.AddCheckBoxLabel(innerBox, chkMoveToBottom, "Move to bottom on status changed.");

            innerBox.appendChild(document.createElement("br"));
            innerBox.appendChild(document.createElement("br"));

            {
                const pnlLegend = document.createElement("div");
                pnlLegend.style.width = "300px";
                pnlLegend.style.overflow = "hidden";
                innerBox.appendChild(pnlLegend);

                const tblLegend = document.createElement("table");
                tblLegend.style.color = "#202020";
                tblLegend.style.borderCollapse = "collapse";
                tblLegend.style.margin = "4px";
                pnlLegend.appendChild(tblLegend);

                const tr1 = document.createElement("tr");
                tblLegend.appendChild(tr1);

                const tr2 = document.createElement("tr");
                tblLegend.appendChild(tr2);

                const tr3 = document.createElement("tr");
                tblLegend.appendChild(tr3);

                const tr4 = document.createElement("tr");
                tblLegend.appendChild(tr4);

                const td1a = document.createElement("td");
                td1a.style.borderRadius = "8px 8px 0 0";
                td1a.style.width = "24px";
                td1a.style.height = "24px";
                td1a.style.background = "linear-gradient(to bottom, hsl(96,66%,50%)0%, hsl(146,66%,50%)100%)";
                tr1.appendChild(td1a);
                const td1b = document.createElement("td");
                td1b.style.minWidth = "96px";
                td1b.style.paddingLeft = "8px";
                td1b.innerHTML = "0&nbsp;<sup>ms</sup>";
                tr1.appendChild(td1b);

                const td2a = document.createElement("td");
                td2a.style.width = "24px";
                td2a.style.height = "24px";
                td2a.style.background = "linear-gradient(to bottom, hsl(146,66%,50%)0%, hsl(196,66%,50%)100%)";
                tr2.appendChild(td2a);
                const td2b = document.createElement("td");
                td2b.style.paddingLeft = "8px";
                td2b.innerHTML = "250&nbsp;<sup>ms</sup>";
                tr2.appendChild(td2b);

                const td3a = document.createElement("td");
                td3a.style.width = "24px";
                td3a.style.height = "24px";
                td3a.style.background = "linear-gradient(to bottom, hsl(196,66%,50%)0%, hsl(246,66%,50%)100%)";
                tr3.appendChild(td3a);
                const td3b = document.createElement("td");
                td3b.style.paddingLeft = "8px";
                td3b.innerHTML = "500&nbsp;<sup>ms</sup>";
                tr3.appendChild(td3b);

                const td4a = document.createElement("td");
                td4a.style.borderRadius = "0 0 8px 8px";
                td4a.style.width = "24px";
                td4a.style.height = "24px";
                td4a.style.background = "linear-gradient(to bottom, hsl(246,66%,50%)0%, hsl(345,66%,50%)100%)";
                tr4.appendChild(td4a);
                const td4b = document.createElement("td");
                td4b.style.paddingLeft = "8px";
                td4b.innerHTML = "750&nbsp;<sup>ms</sup>";
                tr4.appendChild(td4b);

                const td5a = document.createElement("td");
                td5a.style.borderRadius = "8px";
                td5a.style.width = "24px";
                td5a.style.height = "24px";
                td5a.style.backgroundColor = "rgb(255,0,0)";
                tr1.appendChild(td5a);
                const td5b = document.createElement("td");
                td5b.style.minWidth = "96px";
                td5b.style.paddingLeft = "8px";
                td5b.innerHTML = "Timed out";
                tr1.appendChild(td5b);

                const td6a = document.createElement("td");
                td6a.style.borderRadius = "8px";
                td6a.style.width = "24px";
                td6a.style.height = "24px";
                td6a.style.backgroundColor = "rgb(255,102,0)";
                tr2.appendChild(td6a);
                const td6b = document.createElement("td");
                td6b.style.paddingLeft = "8px";
                td6b.innerHTML = "Error";
                tr2.appendChild(td6b);
            }

            selPingMethod.onchange = () => {
                if (selPingMethod.value == "arp")
                    txtTimeout.setAttribute("disabled", true);

                else if (txtTimeout.disabled)
                    txtTimeout.removeAttribute("disabled");
            };

            btnOK.addEventListener("click", () => {
                this.args.timeout = txtTimeout.value;
                this.args.method= selPingMethod.value;
                this.args.moveToBottom = chkMoveToBottom.checked;

                if (!this.isClosed && this.ws != null && this.ws.readyState === 1) {//ready
                    this.ws.send("timeout:" + this.args.timeout);
                    this.ws.send("method:" + this.args.method);
                }

                if (selDisplayMode.selectedIndex == 0) //normal
                    this.list.className = "no-entries";
                else if (selDisplayMode.selectedIndex == 1) //tied
                    this.list.className = "tied-list  no-entries";

                this.setTitle(selPingMethod.value == "arp" ? "ARP ping" : "Ping");
                this.InvalidateRecyclerList();
            });
        });

        this.list.onscroll = () => this.InvalidateRecyclerList();
    }

    Push(name) { //override
        if (!super.Push(name)) return;
        this.Filter(name);
    }

    Close() { //override
        if (this.ws != null) this.ws.close();
        super.Close();
    }

    Toogle() { //override
        super.Toogle();
        setTimeout(() => { this.InvalidateRecyclerList(); }, ANIM_DURATION);
    }

    Minimize() { //override
        super.Minimize();
        this.content.style.display = (this.isMinimized) ? "none" : "initial"; //hide content when minimize for faster animation.
    }

    AfterResize() { //override
        this.InvalidateRecyclerList();
    }

    BringToFront() { //override
        super.BringToFront();

        this.task.style.backgroundColor = "rgb(56,56,56)";
        this.icon.style.filter = "brightness(6)";
    }

    Filter(hostname) {
        let size0 = this.list.childNodes.length;

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

        } else
            this.Add(hostname);

        let size1 = this.list.childNodes.length;

        if (size0 == 0 && size1 > 63) //for 64 or more entries, switch to tied mode
            this.list.className = "tied-list no-entries";

        this.InvalidateRecyclerList();
    }

    Add(hostname) {
        if (hostname.length === 0) return;

        for (let key in this.hashtable)
            if (this.hashtable[key].hostname == hostname) {
                this.list.appendChild(this.hashtable[key].element);
                return;
            }

        const div = document.createElement("div");
        div.className = "list-element";
        this.list.appendChild(div);

        const name = document.createElement("div");
        name.className = "list-label";
        name.innerHTML = hostname;
        div.appendChild(name);

        const graph = document.createElement("div");
        graph.className = "list-graph";
        div.appendChild(graph);

        const msg = document.createElement("div");
        msg.className = "list-msg";
        div.appendChild(msg);

        const remove = document.createElement("div");
        remove.className = "list-remove";
        div.appendChild(remove);

        remove.onclick = () => { this.Remove(hostname); };

        let ping = [];
        let ping_e = [];
        for (let i = 0; i < PING_HISTORY_LEN; i++) {
            let p = document.createElement("div");
            p.style.left = 5 * i + "%";
            graph.appendChild(p);
            ping_e.push(p);
            ping.push(-1);
        }

        for (let i = 0; i < db_equip.length; i++) //db icon
            if (db_equip[i].hasOwnProperty("IP"))
                if (db_equip[i].IP[0] == hostname) {

                    const icon = document.createElement("div");
                    icon.className = "list-icon";
                    icon.style.backgroundImage = `url(${GetEquipIcon(db_equip[i].TYPE)})`;
                    div.appendChild(icon);

                    icon.ondblclick = () => {
                        for (let j = 0; j < db_equip.length; j++) //just in case of modification
                            if (db_equip[j].hasOwnProperty("IP") && db_equip[j].IP[0] === hostname) {
                                for (let k = 0; k < $w.array.length; k++)
                                    if ($w.array[k] instanceof Equip && $w.array[k].filename == db_equip[j][".FILENAME"][0]) {
                                        $w.array[k].Minimize(); //minimize/restore
                                        return;
                                    }
                                new Equip(db_equip[j][".FILENAME"][0]);
                                return;
                            }
                        div.removeChild(icon);
                        div.ondblclick = null;
                    };

                    break;
                }

        this.hashtable[this.count] = {
            hostname: hostname,
            element: div,
            msg: msg,
            graph: graph,
            ping: ping,
            ping_e: ping_e
        };

        this.request += this.count + ";";

        if (this.ws != null && this.ws.readyState === 0) { //connection
            this.count += 1;

        } else if (this.ws != null && this.ws.readyState === 1) { //ready
            this.ws.send("add:" + this.count + ";" + hostname);
            this.count += 1;

        } else {
            this.Connect();
            this.count += 1;
        }

        this.args.entries.push(hostname);
    }

    Remove(hostname) {
        let index = -1;
        for (let key in this.hashtable)
            if (this.hashtable[key].hostname == hostname) index = key;
        if (index == -1) return;

        this.list.removeChild(this.hashtable[index].element);
        delete this.hashtable[index];

        this.request = this.request.replace(index + ";", "");

        if (this.ws.readyState === 1) {
            this.ws.send("remove:" + index);
            if (this.request.length == 0) this.ws.close();
        }

        this.AfterResize();

        index = this.args.entries.indexOf(hostname);
        if (index > -1)
            this.args.entries.splice(index, 1);
    }

    Connect() {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        if (this.ws != null)
            try {
                this.ws.close();
            } catch (error) { };

        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/ping");

        this.ws.onopen = () => {
            let split = this.request.split(";");
            let i = 0;

            this.ws.send("timeout:" + this.args.timeout);
            this.ws.send("method:" + this.args.method);

            while (i < split.length) {
                let req = "";
                while (req.length < 768 && i < split.length) {
                    if (split[i].length > 0) req += split[i] + ";" + this.hashtable[split[i]].hostname + ";";
                    i++;
                }
                this.ws.send("add:" + req);
            }

            for (let i = 0; i < this.list.childNodes.length; i++) //remove warnings, if exist
                if (this.list.childNodes[i].id == "self_destruct")
                    this.list.removeChild(this.list.childNodes[i]);

            this.ws.send("ping:all");
        };

        this.ws.onclose = () => {
            if (this.request.length === 0) return;

            const error_message = document.createElement("div");
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

        this.ws.onmessage = (event) => {
            let payload = event.data.split(String.fromCharCode(127));
            if (payload.length < 2) return; //not valid

            this.InvalidateList(payload);

            setTimeout(() => {
                if (this.request.length > 0 &&
                    !this.isClosed &&
                    this.ws != null && this.ws.readyState === 1) {
                    this.ws.send("ping:all");
                }
            }, 1000);
        };

        //this.ws.onerror = (error)=> { console.log(error); };
    }

    InvalidateList(payload) {
        if (this.ws.readyState != 1) return; //if not connected return        

        for (let i = 0; i < payload.length - 1; i += 2) {
            let index = payload[i];
            let value = payload[i + 1];

            if (this.hashtable.hasOwnProperty(index)) {

                for (let j = 0; j < PING_HISTORY_LEN - 1; j++) this.hashtable[index].ping[j] = this.hashtable[index].ping[j + 1];
                this.hashtable[index].ping[PING_HISTORY_LEN - 1] = value;

                if (isNaN(value)) {
                    this.hashtable[index].msg.innerHTML = value;
                    this.hashtable[index].msg.style.fontSize = "small";
                } else {
                    this.hashtable[index].msg.innerHTML = `${value}&nbsp;<sup>ms</sup>`;
                    this.hashtable[index].msg.style.fontSize = "medium";
                }

                for (let j = 0; j < PING_HISTORY_LEN; j++) {
                    this.hashtable[index].ping_e[j].style.backgroundColor = PingColor(this.hashtable[index].ping[j]);
                    if (isNaN(this.hashtable[index].ping[j]))
                        this.hashtable[index].ping_e[j].setAttribute("tip-below", this.hashtable[index].ping[j]);
                    else
                        this.hashtable[index].ping_e[j].setAttribute("tip-below", this.hashtable[index].ping[j] < 0 ? "" : this.hashtable[index].ping[j] + "ms");
                }

                if (this.args.moveToBottom) { //move elements to bottom (if changed)
                    let p0 = (isNaN(this.hashtable[index].ping[PING_HISTORY_LEN - 1])) ? 4 : 5;
                    let p1 = (isNaN(this.hashtable[index].ping[PING_HISTORY_LEN - 2])) ? 4 : 5;
                    if (p0 != p1 && this.hashtable[index].element != this.list.childNodes[this.list.childNodes.length - 1]) {//if status changed and not already last
                        this.list.appendChild(this.hashtable[index].element);
                        this.list.scrollTop = this.list.scrollHeight;
                        this.hashtable[index].graph.style.display = "initial";
                    }
                }

            }
        }

    }

    InvalidateRecyclerList() { //override
        for (let key in this.hashtable)
            if (this.hashtable[key].element.offsetTop - this.list.scrollTop < -30 ||
                this.hashtable[key].element.offsetTop - this.list.scrollTop > this.list.clientHeight) {
                this.hashtable[key].graph.style.display = "none";
            } else {
                this.hashtable[key].graph.style.display = "initial";
            }
    }
}

function PingColor(pingResult) {
    if (isNaN(pingResult))
        return (pingResult == "TimedOut") ? "red" : "rgb(255,102,0)";

    else if (pingResult == -1)
        return "rgb(192,192,192)";

    return "hsl(" + Math.round(96 + pingResult * 250 / 1000) + ",66%,50%)";
}