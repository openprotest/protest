class ScriptEditor extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='scripts.css']").length==0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "scripts.css";
            document.head.appendChild(csslink);
        }

        super([160,160,160]);
        this.setTitle("Script editor");
        this.setIcon("res/scripts.svgz");

        this.InitizialeComponent();
    }

    InitizialeComponent() {
        this.tools = document.createElement("div");
        this.tools.className = "script-tools-list";
        this.content.appendChild(this.tools);

        this.box = document.createElement("div");
        this.box.className = "script-edit-box";
        this.content.appendChild(this.box);

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("width", 800);
        this.svg.setAttribute("height", 600);
        this.box.appendChild(this.svg);

        this.ghost = document.createElement("div");
        this.ghost.className = "script-ghost-node";
        this.win.appendChild(this.ghost);

        this.win.addEventListener("mouseup", () => { this.ghost.style.visibility = "hidden"; });

        for (let i = 0; i < 5; i++) {
            const newTool = new ScriptListTool("Tool test " + i, this, null);
            newTool.Attach(this.tools);
        }

        this.ghost.onmouseup = event => this.Ghost_onmouseup(event);

    }

    Ghost_onmouseup(event) {
        let pos = this.ghost.style.transform.replace("translate(", "").replace(")", "").split(",");
        let x = parseInt(pos[0].trim().replace("px", "")) - this.box.offsetLeft;
        let y = parseInt(pos[1].trim().replace("px", "")) - this.box.offsetTop - 75/2;

        const newNode = new ScriptNode("test");
        newNode.element.setAttribute("x", x);
        newNode.element.setAttribute("y", y);
        newNode.Attach(this.svg);
        
    }
    
}

class ScriptListTool {
    constructor(name, parent, action) {
        this.parent = parent;
        this.name = name;

        this.element = document.createElement("div");
        this.element.innerHTML = name;
        this.element.className = "script-edit-box-item";

        //this.element.onclick = action;
        this.element.onmousedown = event => this.ScriptListTool_onmousedown(event);
        this.element.onmousemove = event => this.ScriptListTool_onmousemove(event);
        this.element.onmouseup = event => this.ScriptListTool_onmouseup(event);

        parent.win.addEventListener("mousemove", event => this.ScriptListTool_onmousemove(event));
        parent.win.addEventListener("mouseleave", event => { this.parent.ghost.style.visibility = "hidden" });

    }

    Attach(container) {
        container.appendChild(this.element);
    }

    ScriptListTool_onmousedown(event) {
        this.parent.ghost.style.visibility = "visible";
        this.ScriptListTool_onmousemove(event);
        this.parent.ghost.innerHTML = this.name;
    }

    ScriptListTool_onmousemove(event) {
        if (event.buttons % 2 == 1 && this.parent.ghost.style.visibility == "visible") { //left click
            let a = Math.max((event.pageX - this.parent.win.offsetLeft - 100) / 100, 0);
            let x = Math.max(event.pageX - this.parent.win.offsetLeft - 100, 230);
            let y = event.pageY - this.parent.win.offsetTop - this.parent.content.offsetTop;
            
            this.parent.ghost.style.backgroundColor = "rgba(64,64,64," + Math.min(a, .8) + ")";
            this.parent.ghost.style.opacity = a;
            this.parent.ghost.style.backdropFilter = "blur(" + Math.min(a*4, 4) + "px)";
            this.parent.ghost.style.transform = "translate(" + x + "px," + y + "px)";
            
            event.stopPropagation();
        }

    }

    ScriptListTool_onmouseup(event) {
        this.parent.ghost.style.visibility = "hidden"
        console.log(this.name);
    }
}

class ScriptNode {
    constructor(title) {
        this.element = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        //this.element.setAttribute("x", 0);
        //this.element.setAttribute("y", 0);
        this.element.setAttribute("width", 200);
        this.element.setAttribute("height", 75);
        this.element.setAttribute("rx", 4);
        this.element.setAttribute("ry", 4);
        this.element.setAttribute("fill", "rgb(32,32,32)");
    }

    Attach(container) {
        container.appendChild(this.element);
    }
}

new ScriptEditor();