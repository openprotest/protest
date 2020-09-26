class SmbBrowser extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : {
            path: "\\127.0.0.1"
        };

        this.AddCssDependencies("smbbrowser.css");

        this.setTitle("SMB");
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
        this.list.className = "smb-list";
        this.content.appendChild(this.list);

        const btnBack = document.createElement("div");
        btnBack.className = "smb-nav-button";
        btnBack.style.backgroundImage = "url(res/l_goback.svgz)";
        btnBack.style.marginLeft = "32px";
        bar.appendChild(btnBack);

        const btnForward = document.createElement("div");
        btnForward.className = "smb-nav-button";
        btnForward.style.backgroundImage = "url(res/l_goforward.svgz)";
        bar.appendChild(btnForward);

        const btnUp = document.createElement("div");
        btnUp.className = "smb-nav-button";
        btnUp.style.backgroundImage = "url(res/l_goup.svgz)";
        bar.appendChild(btnUp);

        const btnReload = document.createElement("div");
        btnReload.className = "smb-nav-button";
        btnReload.style.backgroundImage = "url(res/l_reload.svgz)";
        bar.appendChild(btnReload);

        const path = document.createElement("div");
        path.className = "smb-path";
        bar.appendChild(path);

    }

    Load(path) {
        this.list.innerHTML = "";
    }

}