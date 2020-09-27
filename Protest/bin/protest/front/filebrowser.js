class FileBrowser extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : {
            path: "127.0.0.1/c$"
        };

        this.history = [];
        this.historyIndex = -1;
        this.view = "list";

        this.AddCssDependencies("filebrowser.css");

        this.setTitle("File browser");
        this.setIcon("res/shared.svgz");

        this.content.classList.add("smb-content");
        this.content.style.overflow = "hidden";

        const bar = document.createElement("dir");
        bar.className = "smb-bar";
        this.content.appendChild(bar);

        const side = document.createElement("dir");
        side.className = "smb-side";
        this.content.appendChild(side);

        this.list = document.createElement("dir");
        this.list.className = "smb-list smb-listview";
        this.content.appendChild(this.list);

        this.btnBack = document.createElement("div");
        this.btnBack.className = "smb-nav-button";
        this.btnBack.style.filter = "contrast(.1)";
        this.btnBack.style.backgroundImage = "url(res/l_goback.svgz)";
        this.btnBack.style.marginLeft = "16px";
        bar.appendChild(this.btnBack);

        this.btnForward = document.createElement("div");
        this.btnForward.className = "smb-nav-button";
        this.btnForward.style.filter = "contrast(.1)";
        this.btnForward.style.backgroundImage = "url(res/l_goforward.svgz)";
        bar.appendChild(this.btnForward);

        this.btnUp = document.createElement("div");
        this.btnUp.className = "smb-nav-button";
        this.btnUp.style.backgroundImage = "url(res/l_goup.svgz)";
        bar.appendChild(this.btnUp);

        this.btnReload = document.createElement("div");
        this.btnReload.className = "smb-nav-button";
        this.btnReload.style.backgroundImage = "url(res/l_reload.svgz)";
        bar.appendChild(this.btnReload);

        this.btnOpen= document.createElement("div");
        this.btnOpen.className = "smb-nav-button";
        this.btnOpen.style.backgroundImage = "url(res/l_folder.svgz)";
        bar.appendChild(this.btnOpen);

        this.pathContainer = document.createElement("div");
        this.pathContainer.className = "smb-path";
        bar.appendChild(this.pathContainer);

        this.btnView = document.createElement("div");
        this.btnView.className = "smb-nav-button btnView-list";
        this.btnView.style.position = "absolute";
        this.btnView.style.right = "2px";
        bar.appendChild(this.btnView);

        for (let i = 0; i < 4; i++) 
            this.btnView.appendChild(document.createElement("div"));
        
        this.btnBack.onclick    = () => this.GoBack();
        this.btnForward.onclick = () => this.GoForward();
        this.btnUp.onclick      = () => this.GoUp();
        this.btnReload.onclick  = () => this.GoTo(this.args.path);        

        this.btnView.onclick = () => {
            if (this.btnView.className == "smb-nav-button btnView-list") {
                this.btnView.className = "smb-nav-button btnView-grid";
                this.list.className = "smb-list smb-gridview";
            } else {
                this.btnView.className = "smb-nav-button btnView-list";
                this.list.className = "smb-list smb-listview";
            }
        };

        this.btnOpen.onclick = () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("GET", `ra&smb&&${this.args.path}`, true);
            xhr.send();
        };

        this.GoTo(this.args.path);
    }

    Load(path) {
        this.list.innerHTML = "";

        this.btnBack.style.filter = this.historyIndex < 1 ? "contrast(.1)" : "none";
        this.btnForward.style.filter = this.historyIndex >= this.history.length - 1 ? "contrast(.1)" : "none";
        
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length == 1 && split[0].length > 0) {
                    this.ConfirmBox(split, true);
                    return;
                }

                this.args = { path: path };
                this.list.innerHTML = "";
                this.pathContainer.innerHTML = "";

                for (let i = 0; i < split.length - 5; i += 5) { //plot
                    const entry = document.createElement("div");
                    entry.className = "smb-entry";
                    entry.style.backgroundImage = split[i] === "d" ? "url(res/g_folder.svgz)" : "url(res/g_file.svgz)";
                    this.list.appendChild(entry);

                    const lblName = document.createElement("div");
                    lblName.innerHTML = split[i+1];
                    entry.appendChild(lblName);

                    const lblSize = document.createElement("div");
                    lblSize.innerHTML = split[i+3];
                    entry.appendChild(lblSize);

                    const lblDate = document.createElement("div");
                    lblDate.innerHTML = split[i+4];
                    entry.appendChild(lblDate);

                    if (split[i] === "d")
                        entry.ondblclick = () => this.GoTo(path + "/" + split[i+1]);                    
                }
                
                let pathSplit = path.split("/");
                for (let i = 0; i < pathSplit.length; i++) {
                    const entry = document.createElement("div");
                    entry.innerHTML = pathSplit[i];
                    this.pathContainer.appendChild(entry);

                    if (i === 0)
                        entry.style.backgroundColor = "transparent";

                    if (i > 0)
                        entry.onclick = () => {
                            let p = "";
                            for (let j = 0; j <= i; j++) p += (j > 0 ? "/" : "") + pathSplit[j];
                            this.GoTo(p);
                        };
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("GET", `files/get&path=smb:${path}`, true);
        xhr.send();
    }

    GoTo(path) {
        this.history.push(path);
        this.historyIndex = this.history.length - 1;

        this.Load(path);
    }

    GoBack() {
        if (this.history.length === 0) return;

        if (--this.historyIndex < 0)
            this.historyIndex = 0;

        if (this.history[this.historyIndex] === this.args.path) return;

        this.Load(this.history[this.historyIndex]);
    }

    GoForward() {
        if (this.history.length === 0) return;

        if (++this.historyIndex > this.history.length - 1)
            this.historyIndex = this.history.length - 1;

        if (this.history[this.historyIndex] === this.args.path) return;

        this.Load(this.history[this.historyIndex]);
    }

    GoUp() {
        let split = this.args.path.split("/");
        let path = "";
        for (let i = 0; i < split.length - 1; i++)
            path += (i > 0 ? "/" : "") + split[i];

        if (path.indexOf("/") === -1) return;

        if (path.length > 0) this.GoTo(path);        
    }

}