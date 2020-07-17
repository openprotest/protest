class Documentation extends Window {
    constructor() {
        super();

        this.setTitle("Documentation");
        this.setIcon("res/documentation.svgz");

        const div = document.createElement("div");
        div.style.fontSize = "22px";
        div.style.padding = "48px";
        div.style.textAlign = "center";
        div.innerHTML = "This feature is under construction. It will be available soon.";
        this.content.appendChild(div);
    }
}