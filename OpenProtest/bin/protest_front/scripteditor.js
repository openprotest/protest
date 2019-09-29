//o: output
//i: input
//p: optional input

//c: column
//h: checkbox (preset)
//n: numeric (preset, min, max)
//t: text (preset)
//m: multiline

const TOOLS_ARRAY = [
    {name:"Protest users",       color:"rgb(232,118,0)", p:[["o","Output"]]},
    {name:"Protest equipment",   color:"rgb(232,118,0)", p:[["o","Output"]]},
    {name:"Domain users",        color:"rgb(232,118,0)", p:[["o","Output"]]},
    {name:"Domain workstations", color:"rgb(232,118,0)", p:[["o","Output"]]},

    {name:"SNMP query",   color:"rgb(32,32,32)", p:[["p","Host",""], ["m","Query",""], ["h","Async","True"], ["o","Output"]]},
    {name:"WMI query",    color:"rgb(32,32,32)", p:[["p","Host",""], ["m","Query",""], ["h","Async","True"], ["o","Output"]]},
    {name:"PS Exec",      color:"rgb(32,32,32)", p:[["p","Host",""], ["m","Command",""], ["h","Async","True"], ["o","Output"]]},
    {name:"Secure Shell", color:"rgb(32,32,32)", p:[["p","Host",""], ["m","Command",""], ["h","Async","True"], ["o","Output"]]},

    {name:"ARP",         color:"rgb(232,0,0)", p:[["p","Host",""], ["h","Async","True"], ["o","Output"]]},
    {name:"DNS",         color:"rgb(232,0,0)", p:[["p","Host",""], ["h","Async","True"], ["o","Output"]]},
    {name:"Ping",        color:"rgb(232,0,0)", p:[["p","Host",""], ["h","Async","True"], ["n","Time out",1000,200,5000], ["o","Output"]]},
    {name:"Trace route", color:"rgb(232,0,0)", p:[["p","Host",""], ["h","Async","True"], ["o","Output"]]},
    {name:"Port scan",   color:"rgb(232,0,0)", p:[["p","Host",""], ["h","Async","True"], ["n","From",1,1,65535], ["n","To",49152,1,65535], ["o","Output"]]},
    {name:"Locate IP",   color:"rgb(232,0,0)", p:[["p","Host",""], ["h","Async","True"], ["o","Output"]]},
    {name:"MAC loopup",  color:"rgb(232,0,0)", p:[["p","Host",""], ["h","Async","True"], ["o","Output"]]},

    {name:"Unique",   color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Sort",     color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Column",   color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Output"]]},
    {name:"Equals",   color:"rgb(0,118,232)", p:[["i","Input"], ["t","Value",""], ["c","Column"], ["o","Output"]]},
    {name:"Contains", color:"rgb(0,118,232)", p:[["i","Input"], ["t","Value",""], ["c","Column"], ["o","Output"]]},

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

        this.parameters = document.createElement("div");
        this.parameters.className = "script-parameters";
        this.content.appendChild(this.parameters);

        this.selectedName = document.createElement("div");
        this.selectedName.className = "script-selected-name";
        this.parameters.appendChild(this.selectedName);

        this.parametersList = document.createElement("div");
        this.parametersList.className = "script-parameters-list";
        this.parameters.appendChild(this.parametersList);

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

    ShowParameters(node) {
        if (this.selectedNode === node) return;

        if (this.selectedNode !== null) {
            this.selectedNode.container.setAttribute("stroke", "rgb(0,0,0)");
            this.selectedNode.container.setAttribute("stroke-width", ".5");
            for (let i = 0; i < this.selectedNode.links.length; i++) {
                this.selectedNode.links[i][1].setAttribute("stroke", "rgb(0,0,0)");
                this.selectedNode.links[i][1].setAttribute("stroke-width", ".5");
            }
        }

        node.container.setAttribute("stroke", "var(--select-color)");
        node.container.setAttribute("stroke-width", "3");
        for (let i = 0; i < node.links.length; i++) {
            node.links[i][1].setAttribute("stroke", "var(--select-color)");
            node.links[i][1].setAttribute("stroke-width", "2");
        }

        this.selectedNode = node;
        this.selectedName.innerHTML = node.name;

        //Show parameters
        this.parametersList.innerHTML = "";
        for (let i = 0; i < node.parameters.length; i++) {
            if (node.parameters[i][0]=="o") continue; //skip ouputs

            let newPara = document.createElement("div");
            this.parametersList.appendChild(newPara);

            let label = document.createElement("div");
            label.innerHTML = node.parameters[i][1] + ":";
            newPara.appendChild(label);

            let value;
            if (node.parameters[i][0] == "t" || node.parameters[i][0] == "p") { //text
                value = document.createElement("input");
                value.type = "text";
                value.value = node.values[i]===null ? "" : node.values[i];

            } else if (node.parameters[i][0] == "n") { //number
                value = document.createElement("input");
                value.type = "number";
                value.min = node.parameters[i][3];
                value.max = node.parameters[i][4];
                value.value = node.values[i]===null ? value.min : node.values[i];

            } else if (node.parameters[i][0] == "h") { //checkbox
                value = document.createElement("select");

                let optTrue = document.createElement("option");
                optTrue.innerHTML = "True";
                optTrue.value = "True";
                value.appendChild(optTrue);

                let optFalse = document.createElement("option");
                optFalse.innerHTML = "False";
                optFalse.value = "False";
                value.appendChild(optFalse);

                value.value = node.values[i] === null ? value.min : node.values[i];

            } else if (node.parameters[i][0] == "c") { //column
                value = document.createElement("select");

            } else if (node.parameters[i][0] == "m") { //multiline
                value = document.createElement("input");
                value.type = "button";
                value.value = "Edit";
                value.onclick = () => {
                    //TODO:
                };

            } else { //i
                value = document.createElement("div");
                value.innerHTML = "null";
            }
            value.setAttribute("i", i);
            newPara.appendChild(value);

            value.onchange = event => {
                let index = parseInt(event.target.getAttribute("i"));
                node.values[index] = value.value;
            };
     
            if (node.parameters[i][0] != "m" && node.parameters[i][0] != "h") {
                let button = document.createElement("div");
                newPara.appendChild(button);
                button.onclick = () => {
                    if (value.tagName === "div") return;
                    value.value = "";
                };
            }

        }
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

        this.ShowParameters(newNode);
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

        this.ShowParameters(node);
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
    constructor(name, color, parameters, parent) {
        this.name = name;
        this.color = color;
        this.p = parameters;
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
        this.x = 0;
        this.y = 0;
        this.name = tool.name;
        this.parameters = [];
        this.values     = [];
        this.links      = [];
        this.columns    = [];

        this.g = document.createElementNS("http://www.w3.org/2000/svg", "g");

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
        this.titleText.setAttribute("x", 100);
        this.titleText.setAttribute("y", 14);
        this.titleText.setAttribute("fill", "rgb(224,224,224)");
        this.g.appendChild(this.titleText);

        let top = 38;

        for (let i = 0; i < tool.p.length; i++) {
            this.parameters.push(tool.p[i]); //copy
            this.values.push(tool.p[i].length > 2 ? tool.p[i][2] : null);

            if (tool.p[i][0] == "i" || tool.p[i][0] == "p" || tool.p[i][0] == "o") { //input or output
                let link = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                link.id = "dot";
                link.setAttribute("r", 6);
                link.setAttribute("cx", tool.p[i][0]=="o" ? 200 : 0);
                link.setAttribute("cy", top-1);
                link.setAttribute("fill", "rgb(96,96,96)");
                link.setAttribute("stroke", "rgb(0,0,0)");
                link.setAttribute("stroke-width", ".5");
                this.g.appendChild(link);

                let label = document.createElementNS("http://www.w3.org/2000/svg", "text");
                label.innerHTML = tool.p[i][1];
                label.setAttribute("dominant-baseline", "middle");
                label.setAttribute("text-anchor", tool.p[i][0]=="o" ? "end" : "start");
                label.setAttribute("x", tool.p[i][0]=="o" ? 188 : 12);
                label.setAttribute("y", top);
                label.setAttribute("fill", "rgb(224,224,224)");
                this.g.appendChild(label);

                this.links.push([tool.p[i][0], link, label]);

                link.onmousedown = event => { event.stopPropagation(); };

                top += 24;
            }
        }

        this.container.setAttribute("height", Math.max(top-10, 75));
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