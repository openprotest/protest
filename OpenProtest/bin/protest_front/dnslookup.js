class DnsLookup extends Console {
    constructor() {
        super();
        
        this.hashtable = {};      //contains all elements

        this.setTitle("DNS lookup");
        this.setIcon("res/dns.svgz");

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        this.btnDownload.addEventListener("click", (event)=> {
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
            psudo.setAttribute("download", "dns_" +
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

/*        } else if (hostname.indexOf("-", 0) > -1) {
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
            for (let i = istart; i <= iend; i++) this.Add(intToBytes(i).join("."));
*/
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
        result.className = "list-result collapsed100";
        result.innerHTML = "";
        element.appendChild(result);

        let remove = document.createElement("div");
        remove.className = "list-remove";
        element.appendChild(remove);

        this.hashtable[hostname] = {
            element   : element,
            result    : result,
            expand    : false,
            list      : []
        };

        remove.onclick = ()=> { this.Remove(hostname); };

        name.onclick = btnExpand.onclick = ()=> {
            if (this.hashtable[hostname].expand) {
                this.hashtable[hostname].expand = false;
                element.style.height = "32px";
                btnExpand.style.transform = "rotate(-90deg)";
                result.className = "list-result collapsed100";
                result.scrollTop = 0;
            } else {
                this.hashtable[hostname].expand = true;
                element.style.height = "200px";
                btnExpand.style.transform = "rotate(0deg)";
                result.className = "list-result expaned100";
            }
        };

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = ()=> {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));

                for (let i=0; i<split.length; i++) {
                    split[i] = split[i].trim();
                    if (split[i].length == 0) continue;

                    let label = document.createElement("div");
                    label.innerHTML = split[i];
                    result.appendChild(label);

                    this.hashtable[hostname].list.push(split[i]);
                }
            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "dnslookup&" + hostname, true);
        xhr.send();
    }

    Remove(hostname) {
        if (!this.hashtable.hasOwnProperty(hostname)) return;
        this.list.removeChild(this.hashtable[hostname].element);
        delete this.hashtable[hostname];
    }

}