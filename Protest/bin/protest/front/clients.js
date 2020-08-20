class Clients extends Window {

    constructor(args) {
        super([64,64,64]);

        this.args = null;

        this.setTitle("Clients");
        this.setIcon("res/ptclients.svgz");

        this.btnReload = document.createElement("div");
        this.btnReload.style.backgroundImage = "url(res/l_reload.svgz)";
        this.btnReload.setAttribute("tip-below", "Reload");
        this.toolbox.appendChild(this.btnReload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.content.style.display = "grid";
        this.content.style.gridTemplateColumns = "auto minmax(50px, 900px) auto";
        this.content.style.gridTemplateRows = "auto";

        this.list = document.createElement("div");
        this.list.className = "no-results";
        this.list.style.gridArea = "1 / 2";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.color = "#202020";
        this.list.style.margin = "0 8px 8px 8px";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "auto";
        this.content.appendChild(this.list);

        this.btnReload.onclick = () => this.GetClients();

        this.GetClients();
    }

    GetClients() {
        while (this.list.firstChild !== null)
            this.list.removeChild(this.list.firstChild);

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split < 2) return;

                for (let i = 0; i < split.length - 2; i += 4) {
                    const element = document.createElement("div");
                    element.className = "generic-list-element";
                    element.style.backgroundImage = "url(res/user.svgz)";
                    this.list.appendChild(element);

                    const label = document.createElement("div");
                    label.className = "generic-label1";
                    label.innerHTML = split[i + 2] + "@" + split[i];
                    element.appendChild(label);

                    const time = document.createElement("div");
                    time.className = "generic-label2";
                    time.innerHTML = split[i + 1];
                    element.appendChild(time);

                    const btnKick = document.createElement("input");
                    btnKick.type = "button";
                    btnKick.value = "Kick";
                    btnKick.className = "generic-action";
                    btnKick.style.color = "rgb(224,224,224)";
                    element.appendChild(btnKick);

                    btnKick.onclick = () => {
                        const xhrk = new XMLHttpRequest();
                        xhrk.onreadystatechange = () => {
                            if (xhrk.readyState == 4 && xhrk.status == 200 && xhrk.responseText == "ok")
                                this.list.removeChild(element);
                        };
                        xhrk.open("GET", "clients/kick&ip=" + split[i] + "&hash=" + split[i+3], true);
                        xhrk.send();
                    };
                }
            }

        };

        xhr.open("GET", "clients/get", true);
        xhr.send();
    }
}