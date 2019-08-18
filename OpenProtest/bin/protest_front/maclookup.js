class MacLookup extends Console {
    constructor() {
        super();
        
        this.hashtable = {}; //contains all elements

        this.setTitle("MAC lookup");
        this.setIcon("res/maclookup.svgz");

        this.txtInput.placeholder = "mac address";

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

    Filter(macaddr) {
        if (macaddr.indexOf(";", 0) > -1) {
            let ips = macaddr.split(";");
            for (let i=0; i<ips.length; i++) this.Add(ips[i].trim());

        } else if (macaddr.indexOf(",", 0) > -1) {
            let ips = macaddr.split(",");
            for (let i=0; i<ips.length; i++) this.Add(ips[i].trim());

        } else {
            this.Add(macaddr);
        }
    }

    Add(macaddr) {
        if (this.hashtable.hasOwnProperty(macaddr)) {
            this.list.appendChild(this.hashtable[macaddr].element);
            return;
        }

        this.txtInput.className = "input-box-dark";

        let element = document.createElement("div");
        element.className = "list-element collapsible-box";
        this.list.appendChild(element);

        let name = document.createElement("div");
        name.className = "list-label";
        name.style.paddingLeft = "24px";
        name.innerHTML = macaddr;
        element.appendChild(name);

        let result = document.createElement("div");
        result.className = "list-result collapsed100";
        result.innerHTML = "";
        element.appendChild(result);

        let remove = document.createElement("div");
        remove.className = "list-remove";
        element.appendChild(remove);

        this.hashtable[macaddr] = {
            element : element,
            result  : result
        };

        remove.onclick = ()=> { this.Remove(macaddr); };

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = ()=> {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let label = document.createElement("div");
                label.innerHTML = xhr.responseText;
                result.appendChild(label);
            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "maclookup&" + macaddr, true);
        xhr.send();
    }

    Remove(macaddr) {
        if (!this.hashtable.hasOwnProperty(macaddr)) return;
        this.list.removeChild(this.hashtable[macaddr].element);
        delete this.hashtable[macaddr];
    }

}