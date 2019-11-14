class DhcpDiscover extends Window {
    constructor() {
        super();
        
        this.setTitle("DHCP discover");
        this.setIcon("res/dhcp.svgz");

        this.content.style.padding = "32px 32px 0 32px";
        this.content.style.overflowY = "auto";
        this.content.style.textAlign = "center";

        this.btnDiscover = document.createElement("input");
        this.btnDiscover.type = "button";
        this.btnDiscover.value = "Discover";
        this.btnDiscover.style.display = "block-line";
        this.btnDiscover.style.width = "96px";
        this.btnDiscover.style.height = "40px";
        this.btnDiscover.style.margin = "16px";
        this.btnDiscover.style.borderRadius = "4px";
        this.content.appendChild(this.btnDiscover);

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

        this.btnDiscover.onclick = () => {
            this.btnDiscover.setAttribute("disabled", true);
            this.waitbox.style.display = "contents";
            this.result.innerHTML = "";

            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    this.btnDiscover.removeAttribute("disabled", true);
                    this.waitbox.style.display = "none";

                    let res = xhr.responseText.split(String.fromCharCode(127));

                    let div = document.createElement("div");
                    div.style.backgroundColor = "var(--control-color)";
                    div.style.color = "#202020";
                    div.style.margin = "8px 0";
                    div.style.padding = "4px 8px";
                    div.style.borderRadius = "2px";
                    this.result.appendChild(div);

                    let table = document.createElement("table");
                    div.appendChild(table);

                    for (let i = 0; i < res.length; i++) {
                        let result = res[i].split("\n");

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
                        }
                    }

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("GET", "dhcpdiscover", true);
            xhr.send();
        };
    }

}