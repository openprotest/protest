const PROTOCOL = {
7	 : "Echo",
13	 : "Daytime	Daytime Protocol",
17	 : "QOTD	Quote of the Day",
18	 : "MSP	Message Send Protocol",
19	 : "CHARGEN	Character Generator Protocol",
20	 : "FTP	File Transfer Protocol - data",
21	 : "FTP	File Transfer Protocol - control",
22	 : "SSH	Secure Shell",
23	 : "Telnet",
25	 : "SMTP	Simple Message Transfer Protocol",
37	 : "TimeP	Time Protocol",
38	 : "RAP	Route Access Protocol",
39	 : "RLP	Resource Location Protocol",
42	 : "WINS	Windows Internet Name Service",
43	 : "WHOIS	Who Is Protocol",
49	 : "TACACS	Terminal Access Controller Access-Control System",
53	 : "DNS	Domain Name Server",
67	 : "DHCP	Dynamic Host Configuration Protocol",
70	 : "Gopher	Gopher Protocol",
71	 : "NETRJS	Remote Job Entry",
72	 : "NETRJS	Remote Job Entry",
73	 : "NETRJS	Remote Job Entry",
74	 : "NETRJS	Remote Job Entry",
80	 : "HTTP	Hypertext Transfer Protocol",
81	 : "TOR	The Onion Router",
88	 : "Kerberos	Kerberos authentication system",
92	 : "NPP	Network Printing Protocol",
109	 : "POP2	Post Office Protocol",
110	 : "POP3	Post Office Protocol",
111	 : "ONC RPC	Open Network Computing Remote Procedure Call",
118	 : "SQL	Structured Query Language Services",
119	 : "NNTP	Network News Transfer Protocol",
123	 : "NTP	Network Time Protocol",
135	 : "RPC	Remote Procedure Call",
137	 : "NetBIOS	Name Service",
139	 : "NetBIOS	Session Service",
143	 : "IMAP	Internet Message Access Protocol",
153	 : "SGMP	Simple Gateway Monitoring Protocol",
156	 : "SQL	Structured Query Language Service",
170	 : "Print server",
194	 : "IRC	Internet Relay Chat",
213	 : "IPX	Internetwork Packet Exchange",
218	 : "MPP	Message posting protoacol",
220	 : "IMAP	Internet Message Access Protocol",
264	 : "BGMP	Border Gateway Multicast Protocol",
389	 : "LDAP	Lightweight Directory Access Protocol",
443	 : "HTTP over SSL/TSL",
445	 : "SMB	Server Message Block",
515	 : "LPD	TCP/IP Print Server",
554	 : "RTSP	Real Time Streaming Protocol",
587	 : "MSA	Message Aubmission Agent",
625	 : "ODProxy	Open Directory Proxy",
631	 : "IPP	Internet Printing Protocol",
636	 : "LDAP over SSL/TSL",
853	 : "DNS over SSL/TSL",
989	 : "FTPS over SSL/TSL	File Transfer Protocol - data",
990	 : "FTPS over SSL/TSL	File Transfer Protocol - control",
992	 : "Telnet over SSL/TSL",
993	 : "IMAP over SSL/TSL",
995	 : "POP3 over SSL/TSL",
1433 : "MS-SQL	Microsoft SQL server",
3389 : "RDP	Remote Desktop Protocol",
5500 : "VNC	Virtual Network Computer",
5800 : "VNC	Virtual Network Computer",
5801 : "VNC	Virtual Network Computer",
5900 : "uVNC	Virtual Network Computer",
5901 : "uVNC	Virtual Network Computer",
5902 : "uVNC	Virtual Network Computer",
5903 : "uVNC	Virtual Network Computer",
7680 : "WUDO	Windows Update Delivery Optimization",
8080 : "HTTP alternate	Hypertext Transfer Protocol",
8443 : "HTTP over SSL/TSL alternate	",
9100 : "Print Server",
10000: "NDMP	Network Data Management Protocol"
};

class PortScan extends Console {
    constructor() {
        super();

        this.rangeFrom = 1;
        this.rangeTo   = 1023;

        this.hashtable = {};      //contains all the ping elements
        this.pending   = [];      //pending request
        this.ws = null;           //websocket
        this.taskIconSpin = null; //spinner on icon task-bar

        this.setTitle("TCP port scan");
        this.setIcon("res/portscan.svgz");

        this.taskIconSpin = document.createElement("div");
        this.taskIconSpin.className = "task-icon-spin";
        this.task.appendChild(this.taskIconSpin);

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);
        
        this.btnOptions = document.createElement("div");
        this.btnOptions.style.backgroundImage = "url(res/l_options.svgz)";
        this.btnOptions.setAttribute("tip-below", "Options");
        this.toolbox.appendChild(this.btnOptions);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";
        
        this.btnDownload.addEventListener("click", event=> {
            const NL = String.fromCharCode(13) + String.fromCharCode(10);
            const TB = String.fromCharCode(9);

            let text = "";
            for (let key in this.hashtable) {
                text += key + TB;
                text += this.hashtable[key].list.join(", ");
                text += NL;
            }

            if (text.length == 0) return;

            let psudo = document.createElement("a");
            psudo.style.display = "none";
            this.win.appendChild(psudo);

            const NOW = new Date();
            psudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            psudo.setAttribute("download", "ports_" +
                NOW.getFullYear() +
                ((NOW.getMonth() < 10)   ? "0" + NOW.getMonth()   : NOW.getMonth()) +
                ((NOW.getDate() < 10)    ? "0" + NOW.getDate()    : NOW.getDate()) + "_" +
                ((NOW.getHours() < 10)   ? "0" + NOW.getHours()   : NOW.getHours()) +
                ((NOW.getMinutes() < 10) ? "0" + NOW.getMinutes() : NOW.getMinutes()) +
                ((NOW.getSeconds() < 10) ? "0" + NOW.getSeconds() : NOW.getSeconds()) +
                ".txt");

            psudo.click(null);
        });

        let options_once = false;
        this.btnOptions.onclick = event=> {
            if (options_once) return;
            options_once = true;

            let dialog    = this.DialogBox("128px");
            let btnOK     = dialog[0];
            let container = dialog[1];

            container.style.textAlign = "center";

            let lblPortRange = document.createElement("div");
            lblPortRange.innerHTML = "Port range: ";
            lblPortRange.style.padding = "8px 0 4px 0";
            lblPortRange.style.fontWeight = "600";
            lblPortRange.style.textDecoration = "underline";
            container.appendChild(lblPortRange);

            let lblFrom = document.createElement("div");
            lblFrom.innerHTML = "From ";
            lblFrom.style.display = "inline";
            container.appendChild(lblFrom);

            let txtFrom = document.createElement("input");
            txtFrom.type = "number";
            txtFrom.min = 1;
            txtFrom.max = 65534;
            txtFrom.value = this.rangeFrom;
            txtFrom.style.display = "inline";
            container.appendChild(txtFrom);

            let lblTo = document.createElement("div");
            lblTo.innerHTML = " to ";
            lblTo.style.display = "inline";
            container.appendChild(lblTo);

            let txtTo = document.createElement("input");
            txtTo.type = "number";
            txtTo.min = 2;
            txtTo.max = 65535;
            txtTo.value = this.rangeTo;
            txtTo.style.display = "inline";
            container.appendChild(txtTo);

            txtFrom.onchange = ()=> {
                if (parseInt(txtFrom.value) >= parseInt(txtTo.value)) txtTo.value = parseInt(txtFrom.value) + 1;
            };

            txtTo.onchange = ()=> {
                if (parseInt(txtFrom.value) >= parseInt(txtTo.value)) txtFrom.value = parseInt(txtTo.value) - 1;
            };

            const ok_click = btnOK.onclick;
            
            btnOK.onclick = ()=> {
                this.rangeFrom = parseInt(txtFrom.value);
                this.rangeTo = parseInt(txtTo.value);
                ok_click();
                options_once = false;
            };

            let btnCancel = btnOK.parentElement.childNodes[1];
            btnCancel.addEventListener("click", ()=>{
                options_once = false;
            });   
        };
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
                result.className = "list-result expaned";
            }
        };

        this.pending.push(hostname);

        if (this.ws != null && this.ws.readyState === 1) { //ready
            this.ws.send(hostname + ";" + this.rangeFrom + ";" + this.rangeTo);
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

        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/portscan");

        this.ws.onopen = ()=> {
            for (let i=0; i<this.pending.length; i++)
                this.ws.send(this.pending[i] + ";" + this.rangeFrom + ";" + this.rangeTo);

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

        this.ws.onerror = (error)=> { console.log(error); };

        this.ws.onmessage = (event)=> {
            let split = event.data.split(String.fromCharCode(127));
            let name = split[0];

            if (name == "unreachable") {
                let msg = document.createElement("div");
                msg.innerHTML = "Unreachable";
                msg.style.color = "var(--theme-color)";
                this.hashtable[split[1]].result.appendChild(msg);
            }

            if (name == "over" || name == "unreachable") {
                name = split[1];
                if (this.hashtable.hasOwnProperty(name)) {
                    this.hashtable[name].status.style.visibility = "hidden";
                    if (this.pending.includes(name)) this.pending.splice(this.pending.indexOf(name), 1);
                }

                this.UpdateTaskIcon();

            } else {
                if (this.hashtable.hasOwnProperty(name))
                    for (let i=1; i<split.length; i++) {
                        if (split[i].length == 0) continue;

                        let port = document.createElement("div");
                        port.innerHTML = split[i];
                        this.hashtable[name].result.appendChild(port);

                        let protocol = document.createElement("div");
                        protocol.innerHTML = (PROTOCOL.hasOwnProperty(parseInt(split[i]))) ? PROTOCOL[parseInt(split[i])] : "";
                        this.hashtable[name].result.appendChild(protocol);

                        this.hashtable[name].list.push(split[i]);
                    }
            }
        };

    }

    UpdateTaskIcon() {
        this.taskIconSpin.style.visibility = (this.pending.length===0) ? "hidden" : "visible";
    }

}