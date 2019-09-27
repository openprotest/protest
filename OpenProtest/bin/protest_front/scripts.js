class Scripts extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='scripts.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "scripts.css";
            document.head.appendChild(csslink);
        }

        super();
        this.setTitle("Scripts");
        this.setIcon("res/scripts.svgz");

        this.InitizialeComponent();
    }

    InitizialeComponent() {
        const btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Editor";
        this.content.appendChild(btnEdit);

        btnEdit.onclick = () => {
            new ScriptEditor();
        };
    }
}