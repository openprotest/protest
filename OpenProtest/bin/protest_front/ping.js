const PING_HISTORY_LEN = 16; //6-20

class Ping extends Console {
    constructor() {
        super();

        this.count = 0;
        this.hashtable = {};    //contains all the ping elements
        this.request = "";      //
        this.ws = null;         //websocket
        this.taskIconDots = []; //dots on icon task-bar

        this.moveToBottom = false;

        this.setTitle("Ping");
        this.setIcon("res/ping.svgz");
        for (let i=0; i<6; i++) {
            let dot = document.createElement("div");
            dot.style.display = "none";
            dot.className = "task-icon-dots";
            this.task.appendChild(dot);
            this.taskIconDots.push(dot);
        }

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.toolbox.appendChild(this.btnDownload);
        
        this.btnClear = document.createElement("div");
        this.btnClear.style.backgroundImage = "url(res/l_clear.svgz)";
        this.toolbox.appendChild(this.btnClear);

        this.btnOptions = document.createElement("div");
        this.btnOptions.style.backgroundImage = "url(res/l_options.svgz)";
        this.toolbox.appendChild(this.btnOptions);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        this.btnDownload.addEventListener("click", event=> {
            const NL = String.fromCharCode(13) + String.fromCharCode(10);
            const TB = String.fromCharCode(9);

            let text = "";
            for (let key in this.hashtable) {
                text += this.hashtable[key].hostname;
                for (let i=10; i<PING_HISTORY_LEN; i++) 
                    text += TB + ((this.hashtable[key].ping[i] == -1) ? "" : this.hashtable[key].ping[i]);
                text += NL;
            }

            if (text.length == 0) return;

            let psudo = document.createElement("a");
            psudo.style.display = "none";
            this.win.appendChild(psudo);

            const NOW = new Date();
            psudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            psudo.setAttribute("download", "ping_" +
                NOW.getFullYear() +
                ((NOW.getMonth() < 10)   ? "0" + NOW.getMonth()   : NOW.getMonth()) +
                ((NOW.getDate() < 10)    ? "0" + NOW.getDate()    : NOW.getDate()) + "_" +
                ((NOW.getHours() < 10)   ? "0" + NOW.getHours()   : NOW.getHours()) +
                ((NOW.getMinutes() < 10) ? "0" + NOW.getMinutes() : NOW.getMinutes()) +
                ((NOW.getSeconds() < 10) ? "0" + NOW.getSeconds() : NOW.getSeconds()) +
                ".txt");

            psudo.click(null);
        });

        this.btnClear.addEventListener("click", event=> {
            this.ConfirmBox("Are you sure you want to clear the list?").addEventListener("click", ()=> {
                let split = this.request.split(";");
                for (let i=0; i<split.length; i++) {
                    if (split[i].length == 0) continue;
                    this.Remove(this.hashtable[split[i]].hostname);
                }
            });
        });

        this.btnOptions.addEventListener("click", event => {
            let obj = this.DialogBox("170px");
            let btnOK = obj[0];
            let innerBox = obj[1];

            innerBox.parentElement.style.maxWidth = "600px";
            innerBox.style.padding = "16px 0px 0px 16px";

            let chkMoveToBottom = document.createElement("input");
            chkMoveToBottom.type = "checkbox";
            chkMoveToBottom.checked = this.moveToBottom;
            innerBox.appendChild(chkMoveToBottom);
            this.AddCheckBoxLabel(innerBox, chkMoveToBottom, "Move to bottom on status changed.");

            innerBox.appendChild(document.createElement("br"));
            innerBox.appendChild(document.createElement("br"));

            let lblDisplayMode = document.createElement("div");
            lblDisplayMode.innerHTML = "Display mode: ";
            lblDisplayMode.style.display = "inline-block";
            innerBox.appendChild(lblDisplayMode);

            let selDisplayMode = document.createElement("select");
            innerBox.appendChild(selDisplayMode);

            let optNormal = document.createElement("option");
            optNormal.innerHTML = "Normal";
            optNormal.value = "normal";
            selDisplayMode.appendChild(optNormal);

            let optTied = document.createElement("option");
            optTied.innerHTML = "Tied";
            optTied.value = "tied";
            selDisplayMode.appendChild(optTied);

            if (this.list.className != "no-entries") 
                selDisplayMode.selectedIndex = 1;
            
            innerBox.appendChild(document.createElement("br"));
            innerBox.appendChild(document.createElement("br"));

            {
                let pnlLegend = document.createElement("div");
                pnlLegend.style.width = "300px";
                pnlLegend.style.overflow = "hidden";
                innerBox.appendChild(pnlLegend);

                let tblLegend = document.createElement("table");
                tblLegend.style.borderCollapse = "collapse";
                tblLegend.style.margin = "4px";
                pnlLegend.appendChild(tblLegend);

                let tr1 = document.createElement("tr");
                tblLegend.appendChild(tr1);

                let tr2 = document.createElement("tr");
                tblLegend.appendChild(tr2);

                let tr3 = document.createElement("tr");
                tblLegend.appendChild(tr3);

                let tr4 = document.createElement("tr");
                tblLegend.appendChild(tr4);

                let td1a = document.createElement("td");
                td1a.style.borderRadius = "8px 8px 0 0";
                td1a.style.width = "24px";
                td1a.style.height = "24px";
                td1a.style.background = "linear-gradient(to bottom, hsl(96,66%,50%)0%, hsl(146,66%,50%)100%)";
                tr1.appendChild(td1a);
                let td1b = document.createElement("td");
                td1b.style.minWidth = "96px";
                td1b.style.paddingLeft = "8px";
                td1b.innerHTML = "0ms";
                tr1.appendChild(td1b);

                let td2a = document.createElement("td");
                td2a.style.width = "24px";
                td2a.style.height = "24px";
                td2a.style.background = "linear-gradient(to bottom, hsl(146,66%,50%)0%, hsl(196,66%,50%)100%)";
                tr2.appendChild(td2a);
                let td2b = document.createElement("td");
                td2b.style.paddingLeft = "8px";
                td2b.innerHTML = "250ms";
                tr2.appendChild(td2b);

                let td3a = document.createElement("td");
                td3a.style.width = "24px";
                td3a.style.height = "24px";
                td3a.style.background = "linear-gradient(to bottom, hsl(196,66%,50%)0%, hsl(246,66%,50%)100%)";
                tr3.appendChild(td3a);
                let td3b = document.createElement("td");
                td3b.style.paddingLeft = "8px";
                td3b.innerHTML = "500ms";
                tr3.appendChild(td3b);

                let td4a = document.createElement("td");
                td4a.style.borderRadius = "0 0 8px 8px";
                td4a.style.width = "24px";
                td4a.style.height = "24px";
                td4a.style.background = "linear-gradient(to bottom, hsl(246,66%,50%)0%, hsl(345,66%,50%)100%)";
                tr4.appendChild(td4a);
                let td4b = document.createElement("td");
                td4b.style.paddingLeft = "8px";
                td4b.innerHTML = "750ms";
                tr4.appendChild(td4b);

                let td5a = document.createElement("td");
                td5a.style.borderRadius = "8px";
                td5a.style.width = "24px";
                td5a.style.height = "24px";
                td5a.style.backgroundColor = "rgb(255,0,0)";
                tr1.appendChild(td5a);
                let td5b = document.createElement("td");
                td5b.style.minWidth = "96px";
                td5b.style.paddingLeft = "8px";
                td5b.innerHTML = "Timed Out";
                tr1.appendChild(td5b);

                let td6a = document.createElement("td");
                td6a.style.borderRadius = "8px";
                td6a.style.width = "24px";
                td6a.style.height = "24px";
                td6a.style.backgroundColor = "rgb(255,102,0)";
                tr2.appendChild(td6a);
                let td6b = document.createElement("td");
                td6b.style.paddingLeft = "8px";
                td6b.innerHTML = "Error";
                tr2.appendChild(td6b);
            }
            
            btnOK.addEventListener("click", ()=> {
                this.moveToBottom = chkMoveToBottom.checked;

                if (selDisplayMode.selectedIndex == 0) //normal
                    this.list.className = "no-entries";
                else if (selDisplayMode.selectedIndex == 1) //tied
                    this.list.className = "tied-list  no-entries";

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
        setTimeout(()=>{ this.InvalidateRecyclerList(); }, ANIM_DURATION);
    }

    Minimize() { //override
        super.Minimize();
        this.content.style.display = (this.isMinimized)? "none" : "initial"; //hide content when minimize for faster animation.
    }

    AfterResize() { //override
        this.InvalidateRecyclerList();
    }

    BringToFront() { //override
        super.BringToFront();

        this.task.style.backgroundColor = "rgb(48,48,48)";
        this.icon.style.filter = "brightness(6)";
    }

    async Filter(hostname) {
        let size0 = this.list.childNodes.length;

        if (hostname.indexOf(";", 0) > -1) {
            let ips = hostname.split(";");
            for (let i=0; i<ips.length; i++) await this.Add(ips[i].trim());

        } else if (hostname.indexOf(",", 0) > -1) {
            let ips = hostname.split(",");
            for (let i=0; i<ips.length; i++) await this.Add(ips[i].trim());

        } else if (hostname.indexOf("-", 0) > -1) {
            let split = hostname.split("-");
            let start = split[0].trim().split(".");
            let end = split[1].trim().split(".");

            let istart = (parseInt(start[0]) << 24) + (parseInt(start[1]) << 16) + (parseInt(start[2]) << 8) + (parseInt(start[3]));
            let iend = (parseInt(end[0]) << 24) + (parseInt(end[1]) << 16) + (parseInt(end[2]) << 8) + (parseInt(end[3]));
            
            if (istart > iend) iend = istart;
            if (iend - istart > 255) iend = istart + 255;

            function intToBytes(int) {
                let b = [0, 0, 0, 0];
                let i = 4;
                do {
                    b[--i] = int & (255);
                    int = int >> 8;
                } while (i);
                return b;
            }
            for (let i=istart; i<=iend; i++)
                await this.Add(intToBytes(i).join("."));
                
        } else
            await this.Add(hostname);

        let size1 = this.list.childNodes.length;

        if (size0 == 0 && size1 > 63) //if 64 or more entries, switch to tied mode
            this.list.className = "tied-list  no-entries";
        
        this.InvalidateRecyclerList();
    }

    Add(hostname) {
        if (hostname.length === 0) return;

        this.txtInput.className = "input-box-dark";

        for (let key in this.hashtable)
            if (this.hashtable[key].hostname == hostname) {
                this.list.appendChild(this.hashtable[key].element);
                return;
            }

        let div = document.createElement("div");
        div.className = "list-element";
        this.list.appendChild(div);
        
        let name = document.createElement("div");
        name.className = "list-label";
        name.innerHTML = hostname;
        div.appendChild(name);

        let graph = document.createElement("div");
        graph.className = "list-graph";
        div.appendChild(graph);

        let msg = document.createElement("div");
        msg.className = "list-msg";
        div.appendChild(msg);

        let remove = document.createElement("div");
        remove.className = "list-remove";
        div.appendChild(remove);
        
        remove.onclick = () => { this.Remove(hostname); };

        let ping   = [];
        let ping_e = [];
        for (let i=0; i<PING_HISTORY_LEN; i++) {
            let p = document.createElement("div");
            p.style.left = 5 * i + "%";
            graph.appendChild(p);
            ping_e.push(p);
            ping.push(-1);
        }

        for (let i=0; i<db_equip.length; i++) //db icon
            if (db_equip[i].hasOwnProperty("IP"))
                if (db_equip[i].IP[0] == hostname) {

                    let icon = document.createElement("div");
                    icon.className = "list-icon";
                    icon.style.backgroundImage = "url("+ GetIcon(db_equip[i].TYPE); +")";
                    div.appendChild(icon);

                    icon.ondblclick = ()=> {
                        for (let j=0; j<db_equip.length; j++) //just in case of modification
                            if (db_equip[j].hasOwnProperty("IP") && db_equip[j].IP[0] == hostname) {
                                for (let k = 0; k < w_array.length; k++)
                                    if (w_array[k] instanceof Equip && w_array[k].filename == db_equip[j][".FILENAME"][0]) {
                                        w_array[k].Minimize(); //minimize/restore
                                        return;
                                    }
                                new Equip(db_equip[j]);
                                return;
                            }
                        div.removeChild(icon);
                        div.ondblclick = null;
                    };

                    break;
                }

        this.hashtable[this.count] = {
            hostname: hostname,
            element:  div,
            msg:      msg,
            graph:    graph,
            ping:     ping,
            ping_e:   ping_e
        };

        this.request += this.count + ";";

        if (this.ws != null && this.ws.readyState === 0) { //connection
            this.count += 1;

        } else if (this.ws != null && this.ws.readyState === 1) { //ready
            this.ws.send("add:" +  this.count + ";" + hostname);
            this.count += 1;

        } else {
            this.Connect();
            this.count += 1;
        }

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

        this.UpdateTaskIcon();
        this.AfterResize();
    }

    Connect() {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        if (this.ws != null) {
            try {
                this.ws.close();
            } catch (error) {};
        }
        
        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/ping");

        this.ws.onopen = ()=> {
            let split = this.request.split(";");
            let i=0;
            
            while (i < split.length) {
                let req = "";
                while (req.length < 768 && i < split.length) {
                    if (split[i].length > 0) req += split[i] + ";" + this.hashtable[split[i]].hostname + ";";
                    i++;
                }
                this.ws.send("add:" + req);
            }

            for (let i=0; i<this.list.childNodes.length; i++) //remove warnings, if exist
                if (this.list.childNodes[i].id == "self_destruct") 
                    this.list.removeChild(this.list.childNodes[i]);

            this.ws.send("ping:all");
        };

        this.ws.onclose = ()=> {
            if (this.request.length === 0) return;

            let error_message = document.createElement("div");
            error_message.id = "self_destruct";
            error_message.innerHTML = "Connection is closed. <u>Click to reconnect</u>";
            error_message.style.color = "var(--theme-color)";
            error_message.style.cursor = "pointer";
            this.list.appendChild(error_message);
            this.list.scrollTop = this.list.scrollHeight;

            error_message.onclick= ()=> {
                for (let i=0; i<this.list.childNodes.length; i++)
                    if (this.list.childNodes[i].id == "self_destruct") 
                        this.list.removeChild(this.list.childNodes[i]);
                this.Connect();
            };
        };

        this.ws.onmessage = (event)=> {
            let payload = event.data.split(String.fromCharCode(127));
            if (payload.length < 2) return; //not valid

            this.InvalidateList(payload);
            this.UpdateTaskIcon();

            setTimeout(()=> {
                if (this.request.length > 0 &&
                    !this.isClosed &&
                    this.ws !=null && this.ws.readyState === 1) {
                    this.ws.send("ping:all");
                }
            }, 1250);
        };

        //this.ws.onerror = (error)=> { console.log(error); };
    }

    InvalidateList(payload) {
        if (this.ws.readyState != 1) return; //if not connected return        

        for (let i=0; i<payload.length-1; i+=2) {
            let index  = payload[i];
            let value = payload[i+1];

            if (this.hashtable.hasOwnProperty(index)) {

                for (let j=0; j<PING_HISTORY_LEN-1; j++) this.hashtable[index].ping[j] = this.hashtable[index].ping[j+1];
                this.hashtable[index].ping[PING_HISTORY_LEN-1] = value;

                if (isNaN(value)) {
                    this.hashtable[index].msg.innerHTML = value;
                    this.hashtable[index].msg.style.fontSize = "small";
                } else {
                    this.hashtable[index].msg.innerHTML = value + "ms";
                    this.hashtable[index].msg.style.fontSize = "medium";
                }

                for (let j=0; j<PING_HISTORY_LEN; j++) {
                    this.hashtable[index].ping_e[j].style.backgroundColor = PingColor(this.hashtable[index].ping[j]);
                    if (isNaN(this.hashtable[index].ping[j]))
                        this.hashtable[index].ping_e[j].setAttribute("ms", this.hashtable[index].ping[j]);
                    else
                        this.hashtable[index].ping_e[j].setAttribute("ms", this.hashtable[index].ping[j] < 0 ? "" : this.hashtable[index].ping[j]+"ms");
                }

                if (this.moveToBottom) { //move elements to bottom (if changed)
                    let p0 = (isNaN(this.hashtable[index].ping[PING_HISTORY_LEN-1])) ? 4 : 5;
                    let p1 = (isNaN(this.hashtable[index].ping[PING_HISTORY_LEN-2])) ? 4 : 5;
                    if (p0 != p1 && this.hashtable[index].element != this.list.childNodes[this.list.childNodes.length-1]) {//if status changed and not already last
                        this.list.appendChild(this.hashtable[index].element);
                        this.list.scrollTop = this.list.scrollHeight
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

    UpdateTaskIcon() {
        for (let i=0; i<6; i++) 
            this.taskIconDots[5-i].style.display = "none";

        if (this.list.childNodes.length == 0) return;
        if (this.list.childNodes[0].childNodes.length < 2) return;
        
        let firstGraph = this.list.childNodes[0].childNodes[1];
        for (let i=0; i<6; i++) {
            this.taskIconDots[5-i].style.backgroundColor = firstGraph.childNodes[firstGraph.childNodes.length - 1 - i].style.backgroundColor;
            this.taskIconDots[5-i].style.display = "initial";
        }
    }
}

function PingColor(pingResult) {
    if (isNaN(pingResult))
        return (pingResult == "TimedOut") ? "red" : "rgb(255,102,0)";

    else if (pingResult == -1)
        return "rgb(192,192,192)";
    
    return "hsl(" + Math.round(96 + pingResult*250/1000) + ",66%,50%)"
}