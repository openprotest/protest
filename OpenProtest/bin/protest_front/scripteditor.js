/*
 0: i columns

 o: output
 i: input

 c: column
 h: checkbox (preset)
 n: numeric (preset, min, max)
 t: text (preset)
 m: multiline
*/

const TOOLS_ARRAY = [
    {name:"Protest users",       color:"rgb(232,118,0)", p:[["o","Users"]]},
    {name:"Protest equipment",   color:"rgb(232,118,0)", p:[["o","Equipment"]]},
    {name:"Domain users",        color:"rgb(232,118,0)", p:[["o","Users"]]},
    {name:"Domain workstations", color:"rgb(232,118,0)", p:[["o","Workstations"]]},
    {name:"IP subnet",           color:"rgb(232,118,0)", p:[["t","Subnet","192.168.0.0"], ["n","CIDR prefix",24,4,30], ["o","Subnet"]]},
    {name:"Single value",        color:"rgb(232,118,0)", p:[["t","Value"], ["o","Value"]]},

    //{name:"SNMP query",   color:"rgb(32,32,32)", p:[["i","Host"], ["c","Column"], ["m","Query",""], ["h","Async","True"], ["o","Output"]]},
    {name:"WMI query",    color:"rgb(32,32,32)", p:[["i","Host"], ["c","Column"], ["m","Query",""], ["h","Async","True"], ["o","Output"]]},
    {name:"PS Exec",      color:"rgb(32,32,32)", p:[["i","Host"], ["c","Column"], ["m","Command",""], ["h","Async","True"], ["o","Output"]]},
    {name:"Secure Shell", color:"rgb(32,32,32)", p:[["i","Host"], ["c","Column"], ["m","Command",""], ["h","Async","True"], ["o","Output"]]},

    {name:"ARP",         color:"rgb(232,0,0)", p:[["i","Host"], ["c","Column"], ["h","Async","True"], ["o","Output"]]},
    {name:"DNS",         color:"rgb(232,0,0)", p:[["i","Host"], ["c","Column"], ["h","Async","True"], ["o","Output"]]},
    {name:"Ping",        color:"rgb(232,0,0)", p:[["i","Host"], ["c","Column"], ["h","Async","True"], ["n","Time out",1000,200,5000], ["o","Output"]]},
    {name:"Trace route", color:"rgb(232,0,0)", p:[["i","Host"], ["c","Column"], ["h","Async","True"], ["o","Output"]]},
    {name:"Port scan",   color:"rgb(232,0,0)", p:[["i","Host"], ["c","Column"], ["h","Async","True"], ["n","From",1,1,65535], ["n","To",49152,1,65535], ["o","Output"]]},
    {name:"Locate IP",   color:"rgb(232,0,0)", p:[["i","Host"], ["c","Column"], ["h","Async","True"], ["o","Output"]]},
    {name:"MAC loopup",  color:"rgb(232,0,0)", p:[["i","Host"], ["c","Column"], ["h","Async","True"], ["o","Output"]]},

    {name:"Sort",    color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Sorted"], ["o","Reversed sorted"]]},
    {name:"Reverse", color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Reversed"]]},
    {name:"Unique",  color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Unique"]]},
    {name:"Column",  color:"rgb(0,118,232)", p:[["i","Input"], ["c","Column"], ["o","Column"]]},
    {name:"Contain", color:"rgb(0,118,232)", p:[["i","Input"], ["t","Value",""], ["c","Column"], ["o","Contain"], ["o","Don't contain"]]},
    
    {name:"Equal",          color:"rgb(111,212,43)", p:[["i","Input"], ["t","Value",""], ["c","Column"], ["o","Equal"], ["o","Not equal"]]},
    {name:"Greater than",   color:"rgb(111,212,43)", p:[["i","Input"], ["n","Value"], ["c","Column"], ["o","Greater"], ["o","Not greater"]]},
    {name:"Less than",      color:"rgb(111,212,43)", p:[["i","Input"], ["n","Value"], ["c","Column"], ["o","Less"], ["o","Not less"]]},
    {name:"Absolute value", color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Absolute value"]]},
    {name:"Round",          color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Rounded"]]},
    {name:"Maximum",        color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Maximum"]]},
    {name:"Minimum",        color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Minimum"]]},
    {name:"Mean",           color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Mean"]]}, //average
    {name:"Median",         color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Median"]]},
    {name:"Mode",           color:"rgb(111,212,43)", p:[["i","Input"], ["c","Column"], ["o","Mode"]]},

    {name:"Text file",  color:"rgb(118,0,232)", p:[["i","Input"], ["t","Filename",""]]},
    {name:"CSV file",   color:"rgb(118,0,232)", p:[["i","Input"], ["t","Filename",""]]},
    {name:"JSON file",  color:"rgb(118,0,232)", p:[["i","Input"], ["t","Filename",""]]},
    {name:"XML file",   color:"rgb(118,0,232)", p:[["i","Input"], ["t","Filename",""]]},
    {name:"HTML file",  color:"rgb(118,0,232)", p:[["i","Input"], ["t","Filename",""]]},
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
        this.links = [];
        this.selectedTool = null;
        this.selectedNode = null;
        this.activeNode = null;
        this.activeSlot = null;
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
        this.svg.setAttribute("width", 400);
        this.svg.setAttribute("height", 300);
        this.box.appendChild(this.svg);

        this.linksGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.linksGroup.setAttribute("stroke", "black");
        this.linksGroup.setAttribute("stroke-width", 3);
        this.linksGroup.setAttribute("fill", "rgba(0,0,0,0)");
        this.svg.appendChild(this.linksGroup);

        this.line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.line.setAttribute("stroke", "var(--select-color)");
        this.line.setAttribute("stroke-width", 3);
        this.svg.appendChild(this.line);

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

        this.parametersOptions = document.createElement("div");
        this.parametersOptions.className = "script-parameters-options";
        this.parameters.appendChild(this.parametersOptions);

        const btnDuplicate = document.createElement("input");
        btnDuplicate.type = "button";
        btnDuplicate.style.backgroundImage = "url(res/l_copy.svgz)";
        btnDuplicate.setAttribute("tip", "Duplicate");
        this.parametersOptions.appendChild(btnDuplicate);

        const btnUnlink = document.createElement("input");
        btnUnlink.type = "button";
        btnUnlink.style.backgroundImage = "url(res/l_unkink.svgz)";
        btnUnlink.setAttribute("tip-below", "Unlink");
        this.parametersOptions.appendChild(btnUnlink);

        const btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.style.backgroundImage = "url(res/l_delete.svgz)";
        btnDelete.setAttribute("tip-below", "Delete");
        this.parametersOptions.appendChild(btnDelete);

        this.parametersList = document.createElement("div");
        this.parametersList.className = "script-parameters-list";
        this.parameters.appendChild(this.parametersList);


        this.ghost.onmouseup = event => this.Ghost_onmouseup(event);

        this.win.addEventListener("mouseleave", () => {
            this.ghost.style.visibility = "hidden";
            if (this.activeSlot != null) {
                this.line.setAttribute("d", "");
                this.activeSlot[1].setAttribute("fill", "rgb(96,96,96)");
                this.activeSlot = null;
            }
        });

        this.win.addEventListener("mousedown", event => {
            this.ResizeToFit();
        });

        this.win.addEventListener("mousemove", event => {
            this.Node_onmousemove(event);
            if (this.selectedTool != null) this.selectedTool.ScriptListTool_onmousemove(event);
            if (this.activeSlot != null) this.selectedNode.Slot_onmousemove(event);

            if (event.buttons == 1) 
                this.ResizeToFit(); //resize svg to fit
        });

        this.win.addEventListener("mouseup", event => {
            this.ghost.style.visibility = "hidden";
            this.Node_onmouseup(event);
            if (this.activeSlot != null) this.selectedNode.Slot_onmouseup(event);
            this.activeSlot = null;
        });

        this.txtToolsFilter.oninput = event => { this.LoadToolsList(this.txtToolsFilter.value); };

        this.LoadToolsList(null);
    }

    ResizeToFit() {
        let maxX = this.box.offsetWidth, maxY = this.box.offsetHeight;
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i].x + 200 > maxX) maxX = this.nodes[i].x+200;
            if (this.nodes[i].y + 100 > maxY) maxY = this.nodes[i].y+100;
        }

        if (maxX == this.box.offsetWidth && maxY == this.box.offsetHeight) {
            this.svg.setAttribute("width", maxX-20);
            this.svg.setAttribute("height", maxY-20);
        } else {
            this.svg.setAttribute("width", maxX+50);
            this.svg.setAttribute("height", maxY+50);
        }
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

    ShowParameters(node, force=false) {
        if (this.selectedNode === node && !force) return;

        if (this.selectedNode !== null) {
            this.selectedNode.container.setAttribute("stroke", "rgb(0,0,0)");
            this.selectedNode.container.setAttribute("stroke-width", ".5");
            for (let i = 0; i < this.selectedNode.slots.length; i++) {
                this.selectedNode.slots[i][1].setAttribute("stroke", "rgb(0,0,0)");
                this.selectedNode.slots[i][1].setAttribute("stroke-width", ".5");
            }
        }

        node.container.setAttribute("stroke", "var(--select-color)");
        node.container.setAttribute("stroke-width", "3");
        for (let i = 0; i < node.slots.length; i++) {
            node.slots[i][1].setAttribute("stroke", "var(--select-color)");
            node.slots[i][1].setAttribute("stroke-width", "2");
        }

        this.selectedNode = node;
        this.selectedName.innerHTML = node.name;

        this.svg.removeChild(node.g); //Bring to front
        this.svg.appendChild(node.g);

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
            if (node.parameters[i][0] == "i") { //input
                value = document.createElement("div");
                value.innerHTML = "null";
                for (let i = 0; i < this.links.length; i++) //find linked node
                    if (this.selectedNode === this.links[i][2][5]) {
                        value.innerHTML = this.links[i][1][5].name;
                        break;
                    }

            } else if (node.parameters[i][0] == "t") { //text
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
                value.style.backgroundColor = "var(--control-color)";
                value.style.color = "rgb(32,32,32)";
                value.onclick = () => {
                    //TODO:
                };

            } else {
                value = document.createElement("div");
                value.innerHTML = "";
            }
            value.setAttribute("i", i);
            newPara.appendChild(value);

            value.onchange = () => {
                let index = parseInt(value.getAttribute("i"));
                node.values[index] = value.value;
            };
     
            if (node.parameters[i][0] != "m" && node.parameters[i][0] != "h") {
                let button = document.createElement("div");
                newPara.appendChild(button);
                button.onclick = () => {
                    if (value.tagName === "div") return;
                    value.value = node.parameters[i].length>2 ? node.parameters[i][2] : "";
                    value.onchange();
                };
            }

        }
    }

    Link(primary, secondary) {
        if ((primary[0]!="o" || secondary[0]=="o") && (primary[0]=="o" || secondary[0]!="o")) { //check slot type
            console.log("You can only link output with input.");
            return;
        }

        if (primary[5] === secondary[5]) {
            console.log("A node can't link into it self.");
            return;
        }

        //type, slot, label, x, y, node
        let p = primary[0]=="o" ? primary : secondary;
        let s = primary[0] == "o" ? secondary : primary;

        this.Unlink(s);

        const newPath = this.container = document.createElementNS("http://www.w3.org/2000/svg", "path");
        newPath.setAttribute("d", this.DrawLine(p, s));
        this.linksGroup.appendChild(newPath);
        
        this.links.push([newPath, p, s]);

        if (s[5] === this.selectedNode) //update parameters
            this.ShowParameters(s[5], true);
    }

    Unlink(slot) {
        for (let i = 0; i < this.links.length; i++)
            if (slot === this.links[i][1] || slot === this.links[i][2]) {
                this.linksGroup.removeChild(this.links[i][0]);
                this.links.splice(i, 1);
                return;
            }        
    }

    DrawLine(p, s) {
        let x1, y1, x2, y2, x3, y3, x4, y4;

        x1 = p[5].x + p[3];
        y1 = p[5].y + p[4];
        x4 = s[5].x + s[3];
        y4 = s[5].y + s[4];

        if (x1 < x4) {
            let minX = Math.min(x1, x4);
            x2 = minX + (x1-minX) *.7 + (x4-minX) *.3;
            y2 = y1;
            x3 = minX + (x1-minX) *.3 + (x4-minX) *.7;
            y3 = y4;
        } else {
            let d = Math.min(Math.abs(x1-x4), 128);
            x2 = x1 + d*.9;
            x3 = x4 - d*.9;

            let minY = Math.min(y1, y4);
            if (y1 < y4) {
                y2 = y1 + 32 + ((y1-minY) *.3 + (y4-minY) *.7);
                y3 = y4 - 32 - ((y4-minY) *.7 + (y1-minY) *.3);
            } else {
                y2 = y1 - 32 - ((y1-minY) *.3 + (y4-minY) *.7);
                y3 = y4 + 32 + ((y4-minY) *.7 + (y1-minY) *.3);
            }
        }

        return "M " + x1 + " " + y1 + " C " + x2 + " " + y2 + " " + x3 + " " + y3 + " " + x4 + " " + y4;
    }

    Ghost_onmouseup(event) {
        let pos = this.ghost.style.transform.replace("translate(", "").replace(")", "").split(",");
        let x = parseInt(pos[0].trim().replace("px", "")) - this.box.offsetLeft + this.box.scrollLeft;
        let y = parseInt(pos[1].trim().replace("px", "")) - this.box.offsetTop + this.box.scrollTop - 38;

        const newNode = new ScriptNode(this.selectedTool, this);
        newNode.MoveTo(x, y);
        newNode.Attach(this.svg);

        newNode.g.onmousedown = event => this.Node_onmousedown(event, newNode);
        newNode.g.onmousemove = event => this.Node_onmousemove(event);
        newNode.g.onmouseup = event => this.Node_onmouseup(event);

        this.nodes.push(newNode);

        this.ShowParameters(newNode);
        this.ResizeToFit();
    }

    Node_onmousedown(event, node) {
        if (event.buttons != 1) return;
        this.activeNode = node;

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

        for (let i = 0; i < this.links.length; i++)
            if (this.activeNode === this.links[i][1][5] || this.activeNode === this.links[i][2][5])
                this.links[i][0].setAttribute("d", this.DrawLine(this.links[i][1], this.links[i][2]));
    }

    Node_onmouseup(event) {
        this.activeNode = null;
    }
}

class ScriptListTool {
    constructor(name, color, parameters, editor) {
        this.name = name;
        this.color = color;
        this.p = parameters;
        this.editor = editor;

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
    }

    Attach(container) {
        container.appendChild(this.element);
    }

    ScriptListTool_onmousedown(event) {
        if (event.buttons != 1) return;
        this.editor.ghost.style.visibility = "visible";
        this.ScriptListTool_onmousemove(event);
        this.editor.selectedTool = this;
        this.editor.ghost.innerHTML = this.name;
    }

    ScriptListTool_onmousemove(event) {
        if (event.buttons == 1 && this.editor.ghost.style.visibility == "visible") { //left click
            let a = Math.max((event.pageX - this.editor.win.offsetLeft - 100) / 100, 0);
            let x = Math.max(event.pageX - this.editor.win.offsetLeft - 100, 230);
            let y = event.pageY - this.editor.win.offsetTop - this.editor.content.offsetTop;
            
            this.editor.ghost.style.backgroundColor = "rgba(64,64,64," + Math.min(a, .75) + ")";
            this.editor.ghost.style.opacity = a;
            this.editor.ghost.style.transform = "translate(" + x + "px," + y + "px)";
            this.editor.ghost.style.backdropFilter = "blur(" + Math.min(a*4, 4) + "px)";
            
            event.stopPropagation();
        }
    }

    ScriptListTool_onmouseup(event) {
        this.editor.ghost.style.visibility = "hidden";
    }
}

class ScriptNode {
    constructor(tool, editor) {
        this.x = 0;
        this.y = 0;
        this.editor = editor;
        this.name = tool.name;
        this.parameters = [];
        this.values     = [];
        this.slots      = [];
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

            if (tool.p[i][0] == "i" || tool.p[i][0] == "o") { //input or output
                let slot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                slot.id = "dot";
                slot.setAttribute("r", 7);
                slot.setAttribute("cx", tool.p[i][0]=="o" ? 200 : 0);
                slot.setAttribute("cy", top);
                slot.setAttribute("fill", "rgb(96,96,96)");
                slot.setAttribute("stroke", "rgb(0,0,0)");
                slot.setAttribute("stroke-width", ".5");
                this.g.appendChild(slot);

                let label = document.createElementNS("http://www.w3.org/2000/svg", "text");
                label.innerHTML = tool.p[i][1];
                label.setAttribute("dominant-baseline", "middle");
                label.setAttribute("text-anchor", tool.p[i][0]=="o" ? "end" : "start");
                label.setAttribute("x", tool.p[i][0]=="o" ? 188 : 12);
                label.setAttribute("y", top+1);
                label.setAttribute("fill", "rgb(224,224,224)");
                this.g.appendChild(label);

                //type, slot, label, x, y, node
                this.slots.push([tool.p[i][0], slot, label, tool.p[i][0]=="o" ? 200 : 0, top, this]);

                top += 24;

                slot.onmousedown = event => this.Slot_onmousedown(event);
                slot.onmousemove = event => this.Slot_onmousemove(event);
                slot.onmouseup = event => this.Slot_onmouseup(event);
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

    GetColumns() {
        //TODO: ...
        return null;
    }
    
    Slot_onmousedown(event) {
        this.editor.ShowParameters(this);
        
        for (let i = 0; i < this.slots.length; i++) //find active slot
            if (this.slots[i][1] === event.target) {
                this.editor.activeSlot = this.slots[i];
                break;
            }

        this.editor.activeSlot[1].setAttribute("fill", "var(--select-color)");

        this.editor.offsetX = this.x + this.editor.activeSlot[3];
        this.editor.offsetY = this.y + this.editor.activeSlot[4];
        this.editor.x0 = event.clientX;
        this.editor.y0 = event.clientY;

        event.stopPropagation();
    }

    Slot_onmousemove(event) {
        if (event.buttons != 1) return;
        if (this.editor.activeSlot === null) return;

        let x1 = this.x + this.editor.activeSlot[3];
        let y1 = this.y + this.editor.activeSlot[4];
        let x2 = this.editor.offsetX - (this.editor.x0 - event.clientX);
        let y2 = this.editor.offsetY - (this.editor.y0 - event.clientY);

        this.editor.line.setAttribute("d", "M " + x1 + " " + y1 + " L " + x2 + " " + y2);
    }

    Slot_onmouseup(event) {
        if (this.editor.activeSlot === null) return;

        let secondary = null;

        if (event.target.tagName == "circle" && event.target.id == "dot")
            for (let i = 0; i < this.slots.length; i++) //find second slot
                if (this.slots[i][1] === event.target) {
                    secondary = this.slots[i];
                    break;
                }
        
        if (secondary === null) {//on miss-click, find closer node and link to first slot
            let x = this.editor.offsetX - (this.editor.x0 - event.clientX);
            let y = this.editor.offsetY - (this.editor.y0 - event.clientY);

            let closer_node = null;
            for (let i = 0; i < this.editor.nodes.length; i++)
                if (this.editor.nodes[i].x < x && this.editor.nodes[i].x + 200 > x && this.editor.nodes[i].y < y && this.editor.nodes[i].y + 75 > y) {
                    closer_node = this.editor.nodes[i];
                    break;
                }                                    

            if (closer_node != null)
                if (this.editor.activeSlot[0] == "o") { //output, link to 1st input
                    for (let i = 0; i < closer_node.slots.length; i++)
                        if (closer_node.slots[i][0]=="i") {
                            secondary = closer_node.slots[i];
                            break;
                        }

                } else { //input, link to 1st output
                    for (let i = 0; i < closer_node.slots.length; i++)
                        if (closer_node.slots[i][0]=="o") {
                            secondary = closer_node.slots[i];
                            break;
                        }
                }
        }        

        if (secondary != null) this.editor.Link(this.editor.activeSlot, secondary);

        this.editor.line.setAttribute("d", "");
        this.editor.activeSlot[1].setAttribute("fill", "rgb(96,96,96)");
        this.editor.activeSlot = null;
    }
}

new ScriptEditor();