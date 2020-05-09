class ListUsers extends List {
    constructor(args) {
        super();

        this.args = args ? args : { value: "" };

        this.setTitle("Users");
        this.setIcon("res/database_users.svgz");

        this.columns = ["TITLE", "DEPARTMENT", "FIRST NAME", "LAST NAME", "USERNAME", "E-MAIL", "TELEPHONE NUMBER", "MOBILE NUMBER"];
        this.db = db_users;


        this.toolbox.removeChild(this.btnFilter);
        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.UpdateTitlebar();
        this.RefreshList();
        this.OnUiReady();
    }

    InflateElement(element, entry) { //override
        element.id = "u" + entry[".FILENAME"][0];

        let icon = document.createElement("div");
        icon.className = "lst-obj-ico";
        icon.style.backgroundImage = "url(res/user.svgz)";
        element.appendChild(icon);

        for (let j = 0; j < 8; j++) {
            if (!entry.hasOwnProperty(this.columns[j])) continue;

            let newLabel = document.createElement("div");
            newLabel.innerHTML = entry[this.columns[j]][0];
            newLabel.className = "lst-obj-lbl-" + j;
            element.appendChild(newLabel);
        }

        if (!element.ondblclick)
            element.ondblclick = (event) => {
                for (let i = 0; i < $w.array.length; i++)
                    if ($w.array[i] instanceof User && $w.array[i].filename == entry[".FILENAME"][0]) {
                        $w.array[i].Minimize(); //minimize/restore
                        return;
                    }

                new Equip(entry);
                event.stopPropagation();
            };
    }

}