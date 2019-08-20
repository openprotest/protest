class TraceRoute extends Console {
    constructor() {
        super();

        this.hashtable = {};      //contains all the ping elements
        this.pending   = [];      //pending request
        this.ws = null;           //websocket
        this.taskIconSpin = null; //spinner on icon task-bar

        this.setTitle("Trace route");
        this.setIcon("res/traceroute.svgz");

        this.taskIconSpin = document.createElement("div");
        this.taskIconSpin.className = "task-icon-spin";
        this.task.appendChild(this.taskIconSpin);

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.toolbox.appendChild(this.btnDownload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";
        
        this.btnDownload.addEventListener("click", (event)=> {
            const NL = String.fromCharCode(13) + String.fromCharCode(10);
            const TB = String.fromCharCode(9);

            let text = "";
            for (let key in this.hashtable) {
                text += key + NL;
                for (let i=0; i<this.hashtable[key].result.childNodes.length; i+=2)
                    text += TB + this.hashtable[key].result.childNodes[i].innerHTML + TB + this.hashtable[key].result.childNodes[i+1].innerHTML + NL;
                text += NL;
            }

            if (text.length == 0) return;

            let psudo = document.createElement("a");
            psudo.style.display = "none";
            this.win.appendChild(psudo);

            const NOW = new Date();
            psudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            psudo.setAttribute("download", "trace_route_" +
                NOW.getFullYear() +
                ((NOW.getMonth() < 10)   ? "0" + NOW.getMonth()   : NOW.getMonth()) +
                ((NOW.getDate() < 10)    ? "0" + NOW.getDate()    : NOW.getDate()) + "_" +
                ((NOW.getHours() < 10)   ? "0" + NOW.getHours()   : NOW.getHours()) +
                ((NOW.getMinutes() < 10) ? "0" + NOW.getMinutes() : NOW.getMinutes()) +
                ((NOW.getSeconds() < 10) ? "0" + NOW.getSeconds() : NOW.getSeconds()) +
                ".txt");

            psudo.click(null);
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

        this.task.style.backgroundColor = "rgb(48,48,48)";
        this.icon.style.filter = "brightness(6)";
    }

    Filter(hostname) {
        if (hostname.indexOf(";", 0) > -1) {
            let ips = hostname.split(";");
            for (let i=0; i<ips.length; i++) this.Add(ips[i].trim());

        } else if (hostname.indexOf(",", 0) > -1) {
            let ips = hostname.split(",");
            for (let i=0; i<ips.length; i++) this.Add(ips[i].trim());

        } else if (hostname.indexOf("-", 0) > -1) {
            var split = hostname.split("-");
            var start = split[0].trim().split(".");
            var end = split[1].trim().split(".");

            var istart = (parseInt(start[0]) << 24) + (parseInt(start[1]) << 16) + (parseInt(start[2]) << 8) + (parseInt(start[3]));
            var iend = (parseInt(end[0]) << 24) + (parseInt(end[1]) << 16) + (parseInt(end[2]) << 8) + (parseInt(end[3]));
            
            if (istart > iend) iend = istart;
            if (iend - istart > 255) iend = istart + 255;
        
            function intToBytes(int) {
                var b = [0, 0, 0, 0];
                var i = 4;
                do {
                    b[--i] = int & (255);
                    int = int >> 8;
                } while (i);
                return b;
            }
            for (var i=istart; i<=iend; i++) this.Add(intToBytes(i).join("."));

        } else {
            this.Add(hostname);
        }
    }

    Add(hostname) {
        if (this.hashtable.hasOwnProperty(hostname)) {
            this.list.appendChild(this.hashtable[hostname].element);
            return;
        }

        this.txtInput.className = "input-box-dark";

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

        let copy = document.createElement("div");
        copy.className = "list-copy";
        element.appendChild(copy);

        this.hashtable[hostname] = {
            element   : element,
            result    : result,
            status    : status,
            expand    : false,
            list      : []
        };

        remove.onclick = ()=> { this.Remove(hostname); };
        
        name.onclick = btnExpand.onclick = ()=> {
            if (this.hashtable[hostname].expand) {
                this.hashtable[hostname].expand = false;
                element.style.height = "32px";
                btnExpand.style.transform = "rotate(-90deg)";
                result.className = "list-result collapsed";
                result.scrollTop = 0;
            } else {
                this.hashtable[hostname].expand = true;
                element.style.height = "200px";
                btnExpand.style.transform = "rotate(0deg)";
                result.className = "list-result expaned enumerated";
            }
        };

        copy.onclick = ()=> {
            for (let i=0; i<result.childNodes.length; i++)
                result.childNodes[i].innerHTML += "; ";

            window.getSelection().selectAllChildren(result);
            document.execCommand('copy');

            for (let i=0; i<result.childNodes.length; i++)
                result.childNodes[i].innerHTML = result.childNodes[i].innerHTML.substring(0, result.childNodes[i].innerHTML.length - 2);
        };

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
            } catch (error) {};
        }

        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/traceroute");

        this.ws.onopen = ()=> {
            for (let i=0; i<this.pending.length; i++)
                this.ws.send(this.pending[i]);

            for (let i=0; i<this.list.childNodes.length; i++) //remove warnings, if exist
                if (this.list.childNodes[i].id == "self_destruct") 
                    this.list.removeChild(this.list.childNodes[i]);
        };

        this.ws.onclose = ()=> {
            if (this.pending.length === 0) return;

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

        this.ws.onerror = error=> console.log(error);

        this.ws.onmessage = (event)=> {
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
                    for (let i=2; i<split.length-1; i+=2)
                        for (let j=0; j<this.hashtable[target].result.childNodes.length; j++)
                            if (this.hashtable[target].result.childNodes[j].innerHTML == split[i]) {
                                this.hashtable[target].result.childNodes[j+1].innerHTML = split[i+1];
                                break;
                            }
                }

            } else 
                if (this.hashtable.hasOwnProperty(name)) {
                    let hop = document.createElement("div");
                    hop.innerHTML = split[1];
                    this.hashtable[name].result.appendChild(hop);

                    let hostname = document.createElement("div");
                    this.hashtable[name].result.appendChild(hostname);
                }
        };

    }

    UpdateTaskIcon() {
        this.taskIconSpin.style.visibility = (this.pending.length===0) ? "hidden" : "visible";
    }

}