class Backup extends Window {
    constructor() {
        super([64, 64, 64]);

        this.args = null;

        this.setTitle("Backup");
        this.setIcon("res/backup.svgz");

        this.btnNew = document.createElement("div");
        this.btnNew.style.backgroundImage = "url(res/l_new.svgz)";
        this.btnNew.setAttribute("tip-below", "Create backup");
        this.toolbox.appendChild(this.btnNew);

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

        this.btnNew.onclick = () => this.CreateBackup();
        this.btnReload.onclick = () => this.GetBackup();

        this.GetBackup();
    }

    CreateBackup() {
        const dialog = this.DialogBox("125px");
        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        innerBox.style.paddingTop = "16px";
        innerBox.style.textAlign = "center";

        const lblName = document.createElement("div");
        lblName.innerHTML = "Name: ";
        lblName.style.display = "inline-block";
        innerBox.appendChild(lblName);

        var now = new Date();

        const txtName = document.createElement("input");
        txtName.type = "text";
        txtName.value = `backup_${now.getFullYear()}_${(now.getMonth()+1).toString().padStart(2,"0")}_${now.getDate().toString().padStart(2,"0")}`;
        txtName.style.width = "calc(80% - 64px)";
        innerBox.appendChild(txtName);

        txtName.oninput = () => {
            if (txtName.value.length == 0)
                btnOK.setAttribute("disabled", true);
            else if (btnOK.hasAttribute("disabled"))
                btnOK.removeAttribute("disabled");
        };

        const Ok_click = btnOK.onclick;

        btnOK.onclick = () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    if (xhr.responseText == "ok")
                        this.GetBackup();

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("GET", `createbackup&name=${txtName.value}`, true);
            xhr.send();
            Ok_click();
        };

        setTimeout(() => txtName.focus(), 0);
    }

    GetBackup() {
        this.list.innerHTML = "";

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {

            if (xhr.readyState == 4 && xhr.status == 200) { //OK
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split < 2) return;

                for (let i = 0; i < split.length - 2; i += 3) {
                    const element = document.createElement("div");
                    element.className = "generic-list-element";
                    element.style.backgroundImage = "url(res/backup.svgz)";
                    this.list.appendChild(element);

                    const label = document.createElement("div");
                    label.className = "generic-label1";
                    label.innerHTML = split[i];
                    element.appendChild(label);

                    const time = document.createElement("div");
                    time.className = "generic-label2";
                    time.innerHTML = split[i + 1];
                    element.appendChild(time);

                    const btnDelete = document.createElement("input");
                    btnDelete.type = "button";
                    btnDelete.value = "Delete";
                    btnDelete.className = "generic-action";
                    btnDelete.style.color = "rgb(224,224,224)";
                    element.appendChild(btnDelete);

                    btnDelete.onclick = () => {
                        if (this.ConfirmBox("Are you sure you want to delete this backup?").addEventListener("click", () => {
                            const xhrk = new XMLHttpRequest();
                            xhrk.onreadystatechange = () => {
                                if (xhrk.readyState == 4 && xhrk.status == 200 && xhrk.responseText == "ok")
                                    this.list.removeChild(element);
                            };
                            xhrk.open("GET", "deletebackup&name=" + split[i], true);
                            xhrk.send();
                        }));
                    };
                }
            }

        };

        xhr.open("GET", "getbackups", true);
        xhr.send();
    }
}