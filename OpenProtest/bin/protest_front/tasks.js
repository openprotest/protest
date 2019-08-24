class Tasks extends Window {
    constructor() {
        super();
        this.setTitle("Tasks");
        this.setIcon("res/task.svgz");

        let divTabs = document.createElement("div");
        divTabs.style.textAlign = "center";
        divTabs.style.paddingTop = "16px";
        this.content.appendChild(divTabs);

        let btnTasks = document.createElement("input");
        btnTasks.type = "button";
        btnTasks.value = "Tasks";
        divTabs.appendChild(btnTasks);

        let btnOnGoing = document.createElement("input");
        btnOnGoing.type = "button";
        btnOnGoing.value = "On-going";
        divTabs.appendChild(btnOnGoing);

        let btnResults = document.createElement("input");
        btnResults.type = "button";
        btnResults.value = "Results";
        divTabs.appendChild(btnResults);

        btnTasks.style.whiteSpace      = btnOnGoing.style.whiteSpace      = btnResults.style.whiteSpace = "nowrap";
        btnTasks.style.minWidth        = btnOnGoing.style.minWidth        = btnResults.style.minWidth   = "0";
        btnTasks.style.maxWidth        = btnOnGoing.style.maxWidth        = btnResults.style.maxWidth   = "150px";
        btnTasks.style.width           = btnOnGoing.style.width           = btnResults.style.width      = "calc(33% - 8px)";
        btnTasks.style.height          = btnOnGoing.style.height          = btnResults.style.height     = "48px";
        btnTasks.style.color           = btnOnGoing.style.color           = btnResults.style.color      =  "#C0C0C0";
        btnTasks.style.backgroundColor = btnOnGoing.style.backgroundColor = btnResults.style.backgroundColor = "rgb(72,72,72)";
        btnTasks.style.borderRadius    = btnOnGoing.style.borderRadius    = btnResults.style.borderRadius = "8px 8px 0 0";
        btnTasks.style.marginBottom    = btnOnGoing.style.marginBottom    = btnResults.style.marginBottom = "0";
        btnTasks.style.overflow        = btnOnGoing.style.overflow        = btnResults.style.overflow     = "hidden";

        let divContent = document.createElement("div");
        divContent.style.paddingTop = "16px";
        divContent.style.background = "linear-gradient(rgb(96,96,96) 0, rgb(96,96,96) 16px, transparent 20px, transparent 100%)";
        divContent.style.position = "absolute";
        divContent.style.left = "0";
        divContent.style.right = "0";
        divContent.style.top = "68px";
        divContent.style.bottom = "0";
        this.content.appendChild(divContent);

        btnTasks.onclick = ()=> {
            btnTasks.style.backgroundColor = "rgb(96,96,96)";
            btnOnGoing.style.backgroundColor = "rgb(72,72,72)";
            btnResults.style.backgroundColor = "rgb(72,72,72)";
        };

        btnOnGoing.onclick = ()=> {
            btnTasks.style.backgroundColor = "rgb(72,72,72)";
            btnOnGoing.style.backgroundColor = "rgb(96,96,96)";
            btnResults.style.backgroundColor = "rgb(72,72,72)";
        };

        btnResults.onclick = ()=> {
            btnTasks.style.backgroundColor = "rgb(72,72,72)";
            btnOnGoing.style.backgroundColor = "rgb(72,72,72)";
            btnResults.style.backgroundColor = "rgb(96,96,96)";
        };

        btnTasks.onclick();
    }
}