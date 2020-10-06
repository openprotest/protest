class WebCheck extends Window {
    constructor(args) {
        super();

        this.args = args ? args : { value: "" };

        this.setTitle("Website check");
        this.setIcon("res/websitecheck.svgz");

        this.content.style.padding = "32px 32px 0 32px";
        this.content.style.overflowY = "auto";
        this.content.style.textAlign = "center";

        this.txtTarget = document.createElement("input");
        this.txtTarget.placeholder = "URI";
        this.txtTarget.type = "text";
        this.txtTarget.maxLength = "64";
        this.txtTarget.style.fontSize = "larger";
        this.txtTarget.style.width = "60%";
        this.txtTarget.style.maxWidth = "720px";
        this.txtTarget.style.textAlign = "center";
        this.txtTarget.value = this.args.value;
        this.content.appendChild(this.txtTarget);

        this.defaultElement = this.txtTarget;
        this.txtTarget.focus();

        this.btnCheck = document.createElement("input");
        this.btnCheck.type = "button";
        this.btnCheck.value = "Check";
        this.btnCheck.style.display = "block-line";
        this.btnCheck.style.width = "96px";
        this.btnCheck.style.height = "40px";
        this.btnCheck.style.margin = "16px";
        this.btnCheck.style.borderRadius = "4px";
        this.content.appendChild(this.btnCheck);

        this.result = document.createElement("div");
        this.result.style.textAlign = "left";
        this.result.style.width = "100%";
        this.result.style.padding = "8px";
        this.result.style.boxSizing = "border-box";
        this.result.style.overflowX = "hidden";
        this.result.style.userSelect = "text";
        this.content.appendChild(this.result);

        this.waitbox = document.createElement("div");
        this.waitbox.className = "waitbox";
        this.waitbox.style.display = "none";
        this.waitbox.style.width = "50%";
        this.content.appendChild(this.waitbox);

        let waitball = document.createElement("div");
        waitball.style.margin = "16px auto";
        this.waitbox.appendChild(waitball);

        this.ws = null; //websocket

        this.txtTarget.onkeydown = event => {
            if (event.keyCode == 13) this.btnCheck.onclick();
        };

        this.txtTarget.oninput = event => {
            this.args.value = this.txtTarget.value;
        };

        this.btnCheck.onclick = () => {
            if (this.txtTarget.value.length == 0) {
                this.ConfirmBox("No uri", true);
                return;
            }

            this.txtTarget.value = this.txtTarget.value.trim();

            if (this.txtTarget.value.indexOf("://") == -1) this.txtTarget.value = "http://" + this.txtTarget.value;

            this.txtTarget.setAttribute("disabled", true);
            this.btnCheck.setAttribute("disabled", true);
            this.waitbox.style.display = "contents";
            this.Check();
        };
    }

    Check() {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/webcheck");

        this.ws.onopen = () => {
            this.result.innerHTML = "";
            this.ws.send(this.txtTarget.value);
        };

        this.ws.onmessage = event => {
            let result = event.data;
            result = result.replaceAll("\n", "<br>");

            let div = document.createElement("div");
            div.style.backgroundColor = "var(--control-color)";
            div.style.color = "#202020";
            div.style.margin = "8px 0";
            div.style.padding = "4px 8px";
            div.style.borderRadius = "2px";
            div.innerHTML = result;
            this.result.appendChild(div);
        };

        this.ws.onclose = () => {
            this.txtTarget.removeAttribute("disabled", true);
            this.btnCheck.removeAttribute("disabled", true);
            this.waitbox.style.display = "none";
        };

        this.ws.onerror = (error) => {
            this.ConfirmBox("Server is unavailable.", true);
        };
    }

    Close() { //override
        super.Close();
        if (this.ws != null) this.ws.close();
    }

}