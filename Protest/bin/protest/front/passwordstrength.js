class PasswordStrength extends ListWindow {

    constructor(args) {
        super(args);

        this.setTitle("Password strength");
        this.setIcon("res/strength.svgz");

        this.AddCssDependencies("passwordstrength.css");

        this.columns = ["Name", "", "Entropy", "", "Strength", "", "Modified date", ""];
        this.UpdateTitlebar();

        this.columnsOptions.style.display = "none";
        this.toolbox.removeChild(this.btnFilter);
        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.db = [];
        this.view = [];       

        this.GetEntropy();
    }

    UpdateTitlebar() { //override
        super.UpdateTitlebar();

        let labels = this.titleLabels;
        labels[0].style.left = "28px";
        labels[0].style.maxWidth = "calc(35% - 32px)";
        labels[1].style.left = "35%";
        labels[1].style.maxWidth = "15%";
        labels[2].style.left = "50%";
        labels[3].style.left = "75%";
    }

    GetEntropy(callback) {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {

                let split = xhr.responseText.split(String.fromCharCode(127));
                let list = [];

                for (let i=0; i<split.length-2; i+=5) {
                    list.push({
                        type: split[i],
                        file: split[i+1],
                        name: split[i+2],
                        entropy: parseFloat(split[i+3]),
                        date: split[i+4]
                    });
                }

                this.db = list;
                this.RefreshList();
                //this.OnUiReady();

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "getentropy", true);
        xhr.send();
    }

    RefreshList() {
        this.view = [];
        this.list.innerHTML = "";

        let keywords = this.txtFind.value.length > 0 ? this.txtFind.value.split(" ") : [];
        keywords = keywords.map(o => o.toLowerCase());

        for (let i = 0; i < this.db.length; i++) {
            let match = true;

            for (let j = 0; j < keywords.length; j++)
                if (this.db[i].name.toLowerCase().indexOf(keywords[j]) == -1) {
                    match = false;
                    continue;
                }

            if (!match) continue;

            this.view.push(this.db[i]);
        }

        if (this.args.sort.length > 0) { //sort
            let param = this.args.sort.toLowerCase();
            if (param == "strength") param = "entropy";
            if (param == "modified date") param = "date";

            this.view.sort((a, b) => {
                if (a[param] < b[param]) return -1;
                if (a[param] > b[param]) return 1;
                return 0;
            });
        }

        this.list.style.display = "none";
        for (let i = 0; i < this.view.length; i++) { //display
            let element = document.createElement("div");
            element.id = `id${this.view[i].file}`;
            element.className = "lst-strength-ele";
            this.list.appendChild(element);
        }
        this.list.style.display = "block";

        this.UpdateViewport();
    }

    InflateElement(element, entry) {
        super.InflateElement(element, entry);

        const icon = document.createElement("div");
        icon.className = "lst-strength-ico";
        icon.style.backgroundImage = entry.type == "u" ? "url(res/user.svgz)" : "url(res/gear.svgz)";
        element.appendChild(icon);

        const lblName = document.createElement("div");
        lblName.innerHTML = entry.name;
        lblName.className = "lst-strength-lbl-0";
        element.appendChild(lblName);

        const lblEntropy = document.createElement("div");
        lblEntropy.innerHTML = `${entry.entropy}-bits`;
        lblEntropy.className = "lst-strength-lbl-2";
        element.appendChild(lblEntropy);

        const bar = StrengthBar(entry.entropy);

        const divBar = document.createElement("div");
        divBar.className = "lst-strength-bar";
        divBar.style.boxShadow = `${bar[0]} ${bar[1]}px 0 0 inset`;
        element.appendChild(divBar);

        const lblStrength = document.createElement("div");
        lblStrength.innerHTML = bar[2];
        lblStrength.className = "lst-strength-lbl-4";
        element.appendChild(lblStrength);

        const lblModidied = document.createElement("div");
        lblModidied.innerHTML = entry.date;
        lblModidied.className = "lst-strength-lbl-6";
        element.appendChild(lblModidied);

        if (!element.ondblclick) {
            element.ondblclick = (event) => {

                if (entry.type === "e") { //equip
                    for (let k = 0; k < $w.array.length; k++)
                        if ($w.array[k] instanceof Equip && $w.array[k].filename == entry.file) {
                            $w.array[k].Minimize(); //minimize/restore
                            return;
                        }

                    new Equip(entry.file);
                    
                } else { //user
                    for (let k = 0; k < $w.array.length; k++)
                        if ($w.array[k] instanceof User && $w.array[k].filename == entry.file) {
                            $w.array[k].Minimize(); //minimize/restore
                            return;
                        }

                    new User(entry.file);
                }

            };
        }
    }
}