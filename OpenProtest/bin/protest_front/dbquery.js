class DbQuery extends Window {
    constructor() {
        super([208, 208, 208]);

        this.setTitle("DB query");
        this.setIcon("res/databasesearch.svgz");

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.toolbox.appendChild(this.btnDownload);

        this.btnClear = document.createElement("div");
        this.btnClear.style.backgroundImage = "url(res/l_clear.svgz)";
        this.toolbox.appendChild(this.btnClear);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";
    }
}