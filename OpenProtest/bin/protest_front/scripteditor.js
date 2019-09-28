const TOOLS_ARRAY = [
    {name:"Protest users",            color:"rgb(232,118,0)"},
    {name:"Protest equipment",        color:"rgb(232,118,0)"},
    {name:"Acrive dir. users",        color:"rgb(232,118,0)"},
    {name:"Acrive dir. workstations", color:"rgb(232,118,0)"},
    {name:"WMI query",    color:"rgb(232,118,0)"},
    {name:"SNMP query",   color:"rgb(232,118,0)"},
    {name:"PS Exec",      color:"rgb(232,118,0)"},
    {name:"Secure Shell", color:"rgb(232,118,0)"},

    {name:"ARP",         color:"rgb(232,118,0)"},
    {name:"DNS",         color:"rgb(232,118,0)"},
    {name:"Ping",        color:"rgb(232,118,0)"},
    {name:"Trace route", color:"rgb(232,118,0)"},
    {name:"Port scan",   color:"rgb(232,118,0)"},
    {name:"Locate IP",   color:"rgb(232,118,0)"},
    {name:"MAC loopup",  color:"rgb(232,118,0)"},

    {name:"Find",    color:"rgb(232,232,0)"},
    {name:"Unique",  color:"rgb(232,232,0)"},
    {name:"Sort",    color:"rgb(232,232,0)"},
    {name:"Maximum", color:"rgb(232,232,0)"},
    {name:"Minimum", color:"rgb(232,232,0)"},
    {name:"Mean",    color:"rgb(232,232,0)"}, //Average
    {name:"Median",  color:"rgb(232,232,0)"},
    {name:"Mode",    color:"rgb(232,232,0)"},

];

class ScriptEditor extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='scripts.css']").length==0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "scripts.css";
            document.head.appendChild(csslink);
        }
        
        super([64,64,64]);
        this.setTitle("Script editor");
        this.setIcon("res/scripts.svgz");

        this.selectedTool = "";
        this.selectedNode = null;
        this.activeNode = null;
        this.offsetX = 0;
        this.offsetY = 0;
        this.x0 = 0;
        this.y0 = 0;

        this.InitizialeComponent();
    }

    InitizialeComponent() {
        this.box = document.createElement("div");
        this.box.className = "script-edit-box";
        this.content.appendChild(this.box);

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("width", 1920);
        this.svg.setAttribute("height", 1080);
        this.box.appendChild(this.svg);

        this.tools = document.createElement("div");
        this.tools.className = "script-tools-pane";
        this.content.appendChild(this.tools);

        this.txtToolsFilter = document.createElement("input");
        this.txtToolsFilter.type = "search";
        this.txtToolsFilter.placeholder = "Find";
        this.txtToolsFilter.className = "script-tools-filter";
        this.tools.appendChild(this.txtToolsFilter);

        this.toolsList = document.createElement("div");
        this.toolsList.className = "script-tools-list";
        this.tools.appendChild(this.toolsList);

        this.ghost = document.createElement("div");
        this.ghost.className = "script-ghost-node";
        this.win.appendChild(this.ghost);

        this.properties = document.createElement("div");
        this.properties.className = "script-properties";
        this.content.appendChild(this.properties);

        this.propertiesName = document.createElement("div");
        this.propertiesName.className = "script-selected-name";
        this.properties.appendChild(this.propertiesName);

        this.ghost.onmouseup = event => this.Ghost_onmouseup(event);

        this.win.addEventListener("mouseup", ()=> { this.ghost.style.visibility = "hidden"; });

        this.win.addEventListener("mousemove", event=> this.Node_onmousemove(event) );
        this.win.addEventListener("mouseup", event=> this.Node_onmouseup(event));

        this.txtToolsFilter.oninput = event => {
            this.LoadToolsList(this.txtToolsFilter.value);
        };

        this.LoadToolsList(null);
    }

    LoadToolsList(filter) {
        this.toolsList.innerHTML = "";

        if (filter === null) filter = "";
        filter = filter.toLowerCase();

        for (let i = 0; i < TOOLS_ARRAY.length; i++) {
            if (TOOLS_ARRAY[i].name.toLowerCase().indexOf(filter) == -1) continue;
            const newTool = new ScriptListTool(TOOLS_ARRAY[i].name, TOOLS_ARRAY[i].color, this);
            newTool.Attach(this.toolsList);
        }
    }

    ShowProperties(node) {
        if (this.selectedNode !== null) {
            this.selectedNode.container.setAttribute("stroke", "rgb(0,0,0)");
            this.selectedNode.container.setAttribute("stroke-width", ".5");
        }

        node.container.setAttribute("stroke", "var(--select-color)");
        node.container.setAttribute("stroke-width", "3");

        this.selectedNode = node;
        this.propertiesName.innerHTML = node.title;
    }

    Ghost_onmouseup(event) {
        let pos = this.ghost.style.transform.replace("translate(", "").replace(")", "").split(",");
        let x = parseInt(pos[0].trim().replace("px", "")) - this.box.offsetLeft;
        let y = parseInt(pos[1].trim().replace("px", "")) - this.box.offsetTop - 38;

        const newNode = new ScriptNode(this.selectedTool);
        newNode.MoveTo(x, y);
        newNode.Attach(this.svg);

        newNode.g.onmousedown = event => this.Node_onmousedown(event, newNode);
        newNode.g.onmousemove = event => this.Node_onmousemove(event);
        newNode.g.onmouseup = event => this.Node_onmouseup(event);

        this.ShowProperties(newNode);
    }

    Node_onmousedown(event, node) {
        if (event.buttons != 1) return;
        this.activeNode = node;

        this.svg.removeChild(node.g); //Bring to front
        this.svg.appendChild(node.g);

        this.offsetX = this.activeNode.x;
        this.offsetY = this.activeNode.y;
        this.x0 = event.clientX;
        this.y0 = event.clientY;

        this.ShowProperties(node);
    }

    Node_onmousemove(event) {
        if (this.activeNode === null) return;
        if (event.buttons != 1) return;

        let x = this.offsetX - (this.x0 - event.clientX);
        let y = this.offsetY - (this.y0 - event.clientY);

        if (x < 0) x = 0;
        if (y < 0) y = 0;
        this.activeNode.MoveTo(x, y);
    }

    Node_onmouseup(event) {
        this.activeNode = null;
    }
    
}

class ScriptListTool {
    constructor(name, color, parent) {
        this.parent = parent;
        this.name = name;

        this.element = document.createElement("div");
        this.element.innerHTML = name;
        this.element.className = "script-edit-box-item";

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
        this.parent.selectedTool = this.name;
        this.parent.ghost.innerHTML = this.name;
    }

    ScriptListTool_onmousemove(event) {
        if (event.buttons % 2 == 1 && this.parent.ghost.style.visibility == "visible") { //left click
            let a = Math.max((event.pageX - this.parent.win.offsetLeft - 100) / 100, 0);
            let x = Math.max(event.pageX - this.parent.win.offsetLeft - 100, 230);
            let y = event.pageY - this.parent.win.offsetTop - this.parent.content.offsetTop;
            
            this.parent.ghost.style.backgroundColor = "rgba(64,64,64," + Math.min(a, .75) + ")";
            this.parent.ghost.style.opacity = a;
            this.parent.ghost.style.transform = "translate(" + x + "px," + y + "px)";
            this.parent.ghost.style.backdropFilter = "blur(" + Math.min(a*4, 4) + "px)";
            
            event.stopPropagation();
        }
    }

    ScriptListTool_onmouseup(event) {
        this.parent.ghost.style.visibility = "hidden";
    }
}

class ScriptNode {
    constructor(title, color) {
        this.title = title;
        this.x = 0;
        this.y = 0;

        this.g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        //this.g.setAttribute("x", 0);
        //this.g.setAttribute("y", 0);

        this.container = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        this.container.setAttribute("width", 200);
        this.container.setAttribute("height", 75);
        this.container.setAttribute("rx", 4);
        this.container.setAttribute("ry", 4);
        this.container.setAttribute("fill", "rgb(64,64,64)");
        this.container.setAttribute("stroke", "rgb(0,0,0)");
        this.container.setAttribute("stroke-width", ".5");
        this.g.appendChild(this.container);

        this.txtTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
        this.txtTitle.innerHTML = title;
        this.txtTitle.setAttribute("font-weight", "600");
        this.txtTitle.setAttribute("dominant-baseline", "middle");
        this.txtTitle.setAttribute("text-anchor", "middle");
        this.txtTitle.setAttribute("text-decoration", "underline");
        this.txtTitle.setAttribute("x", 100);
        this.txtTitle.setAttribute("y", 14);
        this.txtTitle.setAttribute("fill", "rgb(224,224,224)");
        this.g.appendChild(this.txtTitle);

        this.input = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this.input.id = "dot";
        this.input.setAttribute("r", 6);
        this.input.setAttribute("cx", 0);
        this.input.setAttribute("cy", 38);
        this.input.setAttribute("fill", "rgb(96,96,96)");
        this.input.setAttribute("stroke", "rgb(0,0,0)");
        this.input.setAttribute("stroke-width", ".5");
        this.g.appendChild(this.input);

        this.output = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this.output.id = "dot";
        this.output.setAttribute("r", 6);
        this.output.setAttribute("cx", 200);
        this.output.setAttribute("cy", 38);
        this.output.setAttribute("fill", "rgb(96,96,96)");
        this.output.setAttribute("stroke", "rgb(0,0,0)");
        this.output.setAttribute("stroke-width", ".5");
        this.g.appendChild(this.output);

        this.input.onmousedown = event => {
            event.stopPropagation();
        };

        this.output.onmousedown = event => {
            event.stopPropagation();
        };
    }

    Attach(container) {
        container.appendChild(this.g);
    }

    MoveTo(x, y) {
        this.x = x;
        this.y = y;
        this.g.setAttribute("transform", "translate(" + x + "," + y + ")");
    }
    
}

new ScriptEditor();