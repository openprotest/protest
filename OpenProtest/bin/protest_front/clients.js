class Clients extends Window {
    constructor() {
        super();

        this.setTitle("Pro-test clients");
        this.setIcon("res/ptclients.svgz");

        this.content.className += " no-results";
        this.content.style.overflowY = "auto";
        this.content.style.padding = "4px 16px";

        this.GetClients();
    }

    GetClients() {
        while (this.content.firstChild !== null)
            this.content.removeChild(this.content.firstChild);

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) { //OK
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split < 2) return;

                for (let i=0; i<split.length-2; i+=4) {
                    let element = document.createElement("div");
                    element.className = "list-element";
                    this.content.appendChild(element);

                    let label = document.createElement("div");
                    label.className = "list-label";
                    label.innerHTML = split[i+2] + "@" + split[i];
                    element.appendChild(label);

                    let time = document.createElement("div");
                    time.className = "list-result";
                    time.innerHTML = split[i+1];
                    element.appendChild(time);

                    let remove = document.createElement("div");
                    remove.className = "list-remove";
                    remove.innerHTML = "Kick";
                    remove.style.textAlign = "center";
                    remove.style.color = "#222";
                    remove.style.width = "48px";
                    remove.style.borderRadius = "4px";
                    remove.style.backgroundImage = "none";
                    element.appendChild(remove);

                    remove.onclick = () => {
                        let xhrk = new XMLHttpRequest();
                        xhrk.onreadystatechange = () => {
                            if (xhrk.readyState == 4 && xhrk.status == 200 && xhrk.responseText == "ok") //OK
                                this.content.removeChild(element);                         
                        };
                        xhrk.open("GET", "kickclient&ip="+split[i]+"&hash="+split[i+3], true);
                        xhrk.send();
                    };

                }
            }

            if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true).onclick = () => this.Close();
        };

        xhr.open("GET", "getclients", true);
        xhr.send();
    }
}