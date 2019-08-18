class LocateIp extends Console {
    constructor() {
        super();
        
        this.hashtable = {}; //contains all elements

        this.setTitle("Locate IP");
        this.setIcon("res/locate.svgz");
        
        let powered = document.createElement("div");
        powered.innerHTML = "powered by ip2location.com";
        powered.style.position = "absolute";
        powered.style.right = "16px";
        powered.style.bottom = "8px";
        powered.style.fontSize = "12px";
        powered.style.color = "gray";
        this.content.appendChild(powered);

        this.txtInput.style.zIndex = "3";

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";
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

    Filter(ipaddr) {
        if (ipaddr.indexOf(";", 0) > -1) {
            let ips = ipaddr.split(";");
            for (let i=0; i<ips.length; i++) this.Add(ips[i].trim());

        } else if (ipaddr.indexOf(",", 0) > -1) {
            let ips = ipaddr.split(",");
            for (let i=0; i<ips.length; i++) this.Add(ips[i].trim());

        } else if (ipaddr.indexOf("-", 0) > -1) {
            var split = ipaddr.split("-");
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
            this.Add(ipaddr);
        }
    }

    Add(ipaddr) {
        if (ipaddr.length == 0) return;
        if (ipaddr.indexOf(" ") > -1) return;

        if (this.hashtable.hasOwnProperty(ipaddr)) {
            this.list.appendChild(this.hashtable[ipaddr].element);
            return;
        }

        this.txtInput.className = "input-box-dark";

        let element = document.createElement("div");
        element.className = "list-element collapsible-box";
        this.list.appendChild(element);

        let name = document.createElement("div");
        name.className = "list-label";
        name.style.paddingLeft = "24px";
        name.innerHTML = ipaddr;
        element.appendChild(name);

        let result = document.createElement("div");
        result.className = "list-result collapsed100";
        result.innerHTML = "";
        element.appendChild(result);

        let remove = document.createElement("div");
        remove.className = "list-remove";
        element.appendChild(remove);

        this.hashtable[ipaddr] = {
            element : element,
            result  : result
        };

        remove.onclick = ()=> { this.Remove(ipaddr); };

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = ()=> {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(";");

                if (split.length == 1) {
                    let label = document.createElement("div");
                    label.innerHTML = split[0];
                    result.appendChild(label);
                    return;
                }

                let divFlag = document.createElement("div");
                divFlag.style.width = "24px";
                divFlag.style.height = "18px";
                divFlag.style.margin = "8px 8px 0 0";
                if (split[0] != "--") divFlag.style.backgroundImage = "url(flags/" + split[0].toLocaleLowerCase() +".svgz)";
                divFlag.style.animation = "fade-in .2s";
                result.appendChild(divFlag);

                result.innerHTML += split[1] + ", " + split[2] + ", " + split[3];
                
                if (split[4].length > 0 && split[4] != "0,0") {
                    let divLocation = document.createElement("div");
                    divLocation.style.position = "absolute";
                    divLocation.style.width = "24px";
                    divLocation.style.height = "24px";
                    divLocation.style.right = "32px";
                    divLocation.style.top = "4px";
                    divLocation.style.backgroundSize = "contain";
                    divLocation.style.backgroundImage = "url(res/locate.svgz)";
                    divLocation.style.filter = "invert(1)";
                    divLocation.style.cursor = "pointer";
                    element.appendChild(divLocation);

                    divLocation.onclick = () => window.open("http://www.google.com/maps/place/" + split[4]);
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "locateip&" + ipaddr, true);
        xhr.send();
    }

    Remove(ipaddr) {
        if (!this.hashtable.hasOwnProperty(ipaddr)) return;
        this.list.removeChild(this.hashtable[ipaddr].element);
        delete this.hashtable[ipaddr];
    }

}