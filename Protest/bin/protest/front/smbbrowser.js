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

        const bar = document.createElement("dir");
        bar.className = "smb-bar";
        this.content.appendChild(bar);

        const side = document.createElement("dir");
        side.className = "smb-side";
        this.content.appendChild(side);

        this.list = document.createElement("dir");
        this.list.className = "smb-list";
        this.content.appendChild(this.list);
    }

    Load(path) {
        this.list.innerHTML = "";
    }

}