const USER_ORDER = [
    "TITLE", "DEPARTMENT", "DIVISION", "COMPANY",

    ["res/user.svgz", "General"],
    "FIRST NAME", "MIDDLE NAME", "LAST NAME", "DISPLAY NAME", "EMPLOYEE ID",

    ["res/credencial.svgz", "Authentication"],
    "DOMAIN", "USERNAME", "PASSWORD",

    ["res/contact.svgz", "Contact Information"],
    "E-MAIL", "SECONDARY E-MAIL", "TELEPHONE NUMBER", "MOBILE NUMBER", "MOBILE EXTENTION", "FAX",

    ["res/sim.svgz", "SIM Information"],
    "SIM", "PUK", "VOICEMAIL"
];

class User extends Window {
    constructor(filename) {
        super([56,56,56]);

        this.setTitle("User");
        this.setIcon("res/user.svgz");

        this.args = filename;
        this.entry = db_users.find(e => e[".FILENAME"][0] === filename);

        if (!this.entry) {
            this.btnPopout.style.visibility = "hidden";
            this.ConfirmBox("User do not exist.", true).addEventListener("click", () => this.Close());
            return;
        }

        this.AddCssDependencies("dbview.css");

        this.content.style.overflowY = "auto";

        const buttons = document.createElement("div");
        buttons.className = "db-buttons";
        this.content.appendChild(buttons);

        const btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        buttons.appendChild(btnEdit);

        const btnFetch = document.createElement("input");
        btnFetch.type = "button";
        btnFetch.value = "Fetch";
        buttons.appendChild(btnFetch);

        const btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.value = "Delete";
        buttons.appendChild(btnDelete);

        this.properties = document.createElement("div");
        this.properties.className = "db-proberties";
        this.content.appendChild(this.properties);

        this.InitializeComponent();
    }

    InitializeComponent() {

    }

    New() {

    }

    Edit() {

    }
}