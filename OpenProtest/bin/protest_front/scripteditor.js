//o: output
//i: input
//p: optional input

//c: column
//n: numeric property, min, max
//t: text property
//m: multiline
//s: separator

const TOOLS_ARRAY = [
    {name:"Protest users",            color:"rgb(232,118,0)", p:[["o","Output"]]},
    {name:"Protest equipment",        color:"rgb(232,118,0)", p:[["o","Output"]]},
    {name:"Acrive dir. users",        color:"rgb(232,118,0)", p:[["o","Output"]]},
    {name:"Acrive dir. workstations", color:"rgb(232,118,0)", p:[["o","Output"]]},

    {name:"SNMP query",   color:"rgb(32,32,32)", p:[["p","Host"], ["m","Query"], ["o","Output"]]},
    {name:"WMI query",    color:"rgb(32,32,32)", p:[["p","Host"], ["m","Query"], ["o","Output"]]},
    {name:"PS Exec",      color:"rgb(32,32,32)", p:[["p","Host"], ["m","Command"], ["o","Output"]]},
    {name:"Secure Shell", color:"rgb(32,32,32)", p:[["p","Host"], ["m","Command"], ["o","Output"]]},

    {name:"ARP",         color:"rgb(232,0,0)", p:[["p","Host"], ["o","Output"]]},
    {name:"DNS",         color:"rgb(232,0,0)", p:[["p","Host"], ["o","Output"]]},
    {name:"Ping",        color:"rgb(232,0,0)", p:[["p","Host"], ["n","Time out"], ["o","Output"]]},
    {name:"Trace route", color:"rgb(232,0,0)", p:[["p","Host"], ["o","Output"]]},
    {name:"Port scan",   color:"rgb(232,0,0)", p:[["p","Host"], ["n","From"], ["n","To"], ["o","Output"]]},
    {name:"Locate IP",   color:"rgb(232,0,0)", p:[["p","Host"], ["o","Output"]]},
    {name:"MAC loopup",  color:"rgb(232,0,0)", p:[["p","Host"], ["o","Output"]]},

    {name:"Unique",   color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Sort",     color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Column",   color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Equals",   color:"rgb(0,118,232)", p:[["i","Input"], ["t","Value"], ["c","Column"], ["o","Output"]]},
    {name:"Contains", color:"rgb(0,118,232)", p:[["i","Input"], ["t","Value"], ["c","Column"], ["o","Output"]]},

    {name:"Absolute value", color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Round",          color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Maximum",        color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Minimum",        color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Mean",           color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Output"]]}, //average
    {name:"Median",         color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Mode",           color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},

    {name:"Text file",  color:"rgb(118,0,232)", p:[["i","Input"]]},
    {name:"CSV file",   color:"rgb(118,0,232)", p:[["i","Input"]]},
    {name:"JSON file",  color:"rgb(118,0,232)", p:[["i","Input"]]},
    {name:"XML file",   color:"rgb(118,0,232)", p:[["i","Input"]]},
    {name:"HTML file",  color:"rgb(118,0,232)", p:[["i","Input"]]},
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

        this.nodes = [];
        this.selectedTool = null;
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
            const newTool = new ScriptListTool(TOOLS_ARRAY[i].name, TOOLS_ARRAY[i].color, TOOLS_ARRAY[i].p, this);
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

        this.nodes.push(newNode);

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
    constructor(name, color, paramiters, parent) {
        this.name = name;
        this.color = color;
        this.p = paramiters;
        this.parent = parent;

        this.element = document.createElement("div");
        //this.element.innerHTML = name;
        this.element.className = "script-edit-box-item";

        let dot = document.createElement("div");
        dot.style.display = "inline-block";
        dot.style.width = dot.style.height = "11px";
        dot.style.marginRight = "8px";
        dot.style.border = "rgb(64,64,64) solid 1px";
        dot.style.borderRadius = "50%";
        dot.style.backgroundColor = color;
        this.element.appendChild(dot);

        let label = document.createElement("div");
        label.style.display = "inline-block";
        label.innerHTML = name;
        this.element.appendChild(label);

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
        if (event.buttons != 1) return;
        this.parent.ghost.style.visibility = "visible";
        this.ScriptListTool_onmousemove(event);
        this.parent.selectedTool = this;
        this.parent.ghost.innerHTML = this.name;
    }

    ScriptListTool_onmousemove(event) {
        if (event.buttons == 1 && this.parent.ghost.style.visibility == "visible") { //left click
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
    constructor(tool) {
        this.title = tool.name;
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

        this.titleBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        this.titleBox.setAttribute("x", 2);
        this.titleBox.setAttribute("y", 2);
        this.titleBox.setAttribute("width", 196);
        this.titleBox.setAttribute("height", 20);
        this.titleBox.setAttribute("rx", 4);
        this.titleBox.setAttribute("ry", 4);
        this.titleBox.setAttribute("fill", tool.color);
        this.titleBox.setAttribute("opacity", .4);
        this.g.appendChild(this.titleBox);

        this.titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        this.titleText.innerHTML = tool.name;
        this.titleText.setAttribute("font-weight", "600");
        this.titleText.setAttribute("dominant-baseline", "middle");
        this.titleText.setAttribute("text-anchor", "middle");
        //this.titleText.setAttribute("text-decoration", "underline");
        this.titleText.setAttribute("x", 100);
        this.titleText.setAttribute("y", 14);
        this.titleText.setAttribute("fill", "rgb(224,224,224)");
        this.g.appendChild(this.titleText);

        let top = 38;

        for (let i = 0; i < tool.p.length; i++) {

            console.log(tool.p);

            if (tool.p[i][0]=="o") { //output
                let outp = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                outp.id = "dot";
                outp.setAttribute("r", 6);
                outp.setAttribute("cx", 200);
                outp.setAttribute("cy", top);
                outp.setAttribute("fill", "rgb(96,96,96)");
                outp.setAttribute("stroke", "rgb(0,0,0)");
                outp.setAttribute("stroke-width", ".5");
                this.g.appendChild(outp);

                let label = document.createElementNS("http://www.w3.org/2000/svg", "text");
                label.innerHTML = tool.p[i][1];
                label.setAttribute("dominant-baseline", "middle");
                label.setAttribute("text-anchor", "end");
                label.setAttribute("x", 188);
                label.setAttribute("y", top);
                label.setAttribute("fill", "rgb(224,224,224)");
                this.g.appendChild(label);

                outp.onmousedown = event => { event.stopPropagation(); };

                top += 24;

            } else if (tool.p[i][0] == "i" || tool.p[i][0] == "p") { //input
                let inp = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                inp.id = "dot";
                inp.setAttribute("r", 6);
                inp.setAttribute("cx", 0);
                inp.setAttribute("cy", top);
                inp.setAttribute("fill", "rgb(96,96,96)");
                inp.setAttribute("stroke", "rgb(0,0,0)");
                inp.setAttribute("stroke-width", ".5");
                this.g.appendChild(inp);

                let label = document.createElementNS("http://www.w3.org/2000/svg", "text");
                label.innerHTML = tool.p[i][1];
                label.setAttribute("dominant-baseline", "middle");
                label.setAttribute("text-anchor", "start");
                label.setAttribute("x", 12);
                label.setAttribute("y", top);
                label.setAttribute("fill", "rgb(224,224,224)");
                this.g.appendChild(label);

                inp.onmousedown = event => { event.stopPropagation(); };

                top += 24;
            }
        }

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