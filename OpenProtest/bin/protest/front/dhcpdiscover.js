class DhcpDiscover extends Window {
    constructor() {
        super();
        this.setTitle("DHCP discover");
        this.setIcon("res/dhcp.svgz");

        this.content.style.padding = "32px 32px 0 32px";
        this.content.style.overflowY = "auto";
        this.content.style.textAlign = "center";

        let grid = document.createElement("div");
        grid.style.overflow = "auto";
        grid.style.padding = "16px";
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "auto 200px 150px 150px auto";
        grid.style.gridTemplateRows = "repeat(3, 32px)";
        grid.style.alignItems = "center";
        grid.style.color = "var(--control-color)";
        this.content.appendChild(grid);

        let lblTimeout = document.createElement("div");
        lblTimeout.innerHTML = "Request timeout (ms):";
        lblTimeout.style.textAlign = "right";
        lblTimeout.style.gridColumn = "2";
        lblTimeout.style.gridRow = "1";
        grid.appendChild(lblTimeout);

        this.txtTimeout = document.createElement("input");
        this.txtTimeout.type = "number";
        this.txtTimeout.min = 500;
        this.txtTimeout.max = 5000;
        this.txtTimeout.value = 2000;
        this.txtTimeout.style.gridColumn = "3";
        this.txtTimeout.style.gridRow = "1";
        grid.appendChild(this.txtTimeout);

        let lblMacAddress = document.createElement("div");
        lblMacAddress.innerHTML = "Spoof MAC address:";
        lblMacAddress.style.textAlign = "right";
        lblMacAddress.style.gridColumn = "2";
        lblMacAddress.style.gridRow = "2";
        grid.appendChild(lblMacAddress);

        this.txtMacAddress = document.createElement("input");
        this.txtMacAddress.type = "text";
        this.txtMacAddress.placeholder = "default";
        this.txtMacAddress.style.gridColumn = "3";
        this.txtMacAddress.style.gridRow = "2";
        grid.appendChild(this.txtMacAddress);

        let lblAccept = document.createElement("div");
        lblAccept.innerHTML = "Accept the offer:";
        lblAccept.style.textAlign = "right";
        lblAccept.style.gridColumn = "2";
        lblAccept.style.gridRow = "3";
        grid.appendChild(lblAccept);

        let divAccept = document.createElement("div");
        divAccept.style.gridColumn = "3";
        divAccept.style.gridRow = "3";
        grid.appendChild(divAccept);

        this.chkAccept = document.createElement("input");
        this.chkAccept.type = "checkbox";
        divAccept.appendChild(this.chkAccept);
        this.AddCheckBoxLabel(divAccept, this.chkAccept, "&nbsp;").style.paddingLeft = "8px";

        this.btnDiscover = document.createElement("input");
        this.btnDiscover.type = "button";
        this.btnDiscover.value = "Discover";
        this.btnDiscover.style.display = "block-line";
        this.btnDiscover.style.width = "96px";
        this.btnDiscover.style.height = "48px";
        this.btnDiscover.style.margin = "16px";
        this.btnDiscover.style.borderRadius = "4px";
        this.btnDiscover.style.gridArea = "1 / 4 / span 2 / span 1";
        grid.appendChild(this.btnDiscover);

        this.result = document.createElement("div");
        this.result.style.textAlign = "left";
        this.result.style.width = "100%";
        this.result.style.padding = "8px";
        this.result.style.boxSizing = "border-box";
        this.result.style.overflowX = "hidden";
        this.result.style.userSelect = "text";
        this.result.style.webkitUserSelect = "text";
        this.content.appendChild(this.result);

        this.waitbox = document.createElement("div");
        this.waitbox.className = "waitbox";
        this.waitbox.style.display = "none";
        this.waitbox.style.width = "50%";
        this.content.appendChild(this.waitbox);

        let waitball = document.createElement("div");
        waitball.style.margin = "16px auto";
        this.waitbox.appendChild(waitball);

        this.btnDiscover.onclick = () => this.Discover();
    }

    Discover() {
        if (this.txtMacAddress.value.length > 0 && this.txtMacAddress.value.length != 12) {
            this.ConfirmBox("Invalid MAC address", true);
            return;
        }

        this.btnDiscover.setAttribute("disabled", true);
        this.waitbox.style.display = "contents";
        this.result.innerHTML = "";

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                this.btnDiscover.removeAttribute("disabled", true);
                this.waitbox.style.display = "none";

                let res = xhr.responseText.split(String.fromCharCode(127));

                for (let i = 0; i < res.length; i++) {
                    let result = res[i].split("\n");
                    if (result.length < 2) continue;

                    let div = document.createElement("div");
                    div.className = "collapsed-box";
                    this.result.appendChild(div);

                    let title = document.createElement("div");
                    div.appendChild(title);

                    let table = document.createElement("table");
                    table.style.display = "none";
                    div.appendChild(table);
                    
                    for (let j = 0; j < result.length; j++) {
                        let tr = document.createElement("tr");
                        table.appendChild(tr);

                        let split = result[j].split(":");
                        if (split.length == 1) continue;                        

                        let td1 = document.createElement("td");
                        td1.innerHTML = split[0];
                        tr.appendChild(td1);

                        let td2 = document.createElement("td");
                        td2.innerHTML = split[1];
                        tr.appendChild(td2);

                        if (split[0] == "dhcp message type")
                            title.innerHTML = split[1].substring(4);

                        if (split[0] == "transaction id" || split[0] == "offered ip" || split[0] == "requested ip address" || split[0] == "dhcp server identifier")
                            td2.style.fontWeight = "bold";
                    }

                    title.onclick = ()=> {
                        div.className = table.style.display == "none" ? "expaned-box" : "collapsed-box";
                        table.style.display = table.style.display == "none" ? "block" : "none";
                    };
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) { //disconnected
                this.ConfirmBox("Server is unavailable.", true);
                this.btnDiscover.removeAttribute("disabled", true);
                this.waitbox.style.display = "none";
            }
        };
        xhr.open("GET", "dhcpdiscover&timeout=" + this.txtTimeout.value + "&mac=" + this.txtMacAddress.value + "&accept=" + this.chkAccept.checked, true);
        xhr.send();
    }

}