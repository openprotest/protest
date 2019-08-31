const EQUIP_ICON = {
"access point"        : "res/antenna.svgz",
"antenna"             : "res/antenna.svgz",
"camera"              : "res/camera.svgz",
"copy machine"        : "res/copymachine.svgz",
"fax"                 : "res/fax.svgz",
"laptop"              : "res/laptop.svgz",
"multiprinter"        : "res/multiprinter.svgz",
"mobile phone"        : "res/mobilephone.svgz",
"pc"                  : "res/pc.svgz",
"pc tower"            : "res/pc.svgz",
"printer"             : "res/printer.svgz",
"point of sale"       : "res/pos.svgz",
"pos"                 : "res/pos.svgz",
"pos printer"         : "res/posprinter.svgz",
"router"              : "res/router.svgz",
"scanner"             : "res/scanner.svgz",
"serial to ethernet"  : "res/serialconverter.svgz",
"serial converter"    : "res/serialconverter.svgz",
"server"              : "res/server.svgz",
"tv"                  : "res/tv.svgz",
"media player"        : "res/mediaplayer.svgz",
"nas"                 : "res/server.svgz",
"switch"              : "res/switch.svgz",
"tablet"              : "res/tablet.svgz",
"visa machine"        : "res/visamachine.svgz",
"credit card machine" : "res/visamachine.svgz",
"ups"                 : "res/ups.svgz"
};
const EQUIP_PARAM = [
"name",
"type",
"hostname",
"ip",
"manufacturer",
"serial number",
"owner",
"location"];

const EQUIP_LIST_ORDER = ["NAME", "TYPE", "HOSTNAME", "IP", "MANUFACTURER", "MODEL", "OWNER", "LOCATION"];

var EQUIP_TYPES = [];

class EquipList extends Window {
    constructor(strFind = "", strFilter = "", strSoft = "") {
        if (document.head.querySelectorAll("link[href$='equiplist.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "equiplist.css";
            document.head.appendChild(csslink);

            csslink.onload = () => { this.AfterResize(); };
        }

        super([208,208,208]);

        this.list = [];

        this.setTitle("Equipment");
        this.setIcon("res/database_equip.svgz");

        this.strFind   = strFind;
        this.strFilter = strFilter;
        this.strSort   = strSoft.toUpperCase();

        this.content.className = "content no-results";
        this.content.style.overflowY = "scroll";

        this.btnFind = document.createElement("div");
        this.btnFind.style.borderBottom = (this.strFind.length==0)? "none" : "#FF7900 solid 2px";
        this.btnFind.style.backgroundImage = "url(res/l_search.svgz)";
        this.toolbox.appendChild(this.btnFind);

        this.btnFilter = document.createElement("div");
        this.btnFilter.style.borderBottom = (this.strFilter.length==0)? "none" : "#FF7900 solid 2px";
        this.btnFilter.style.backgroundImage = "url(res/l_filter.svgz)";
        this.toolbox.appendChild(this.btnFilter);

        this.btnSort = document.createElement("div");
        this.btnSort.style.borderBottom = (this.strSort.length==0)? "none" : "#FF7900 solid 2px";
        this.btnSort.style.backgroundImage = "url(res/l_sort.svgz)";
        this.toolbox.appendChild(this.btnSort);

        this.txtFind = document.createElement("input");
        this.txtFind.type = "text";
        this.txtFind.placeholder = "Find...";
        this.txtFind.value = this.strFind;
        this.btnFind.appendChild(this.txtFind);

        this.pnlFilter = document.createElement("div");
        this.btnFilter.appendChild(this.pnlFilter);

        this.pnlSort = document.createElement("div");
        this.btnSort.appendChild(this.pnlSort);

        this.btnFind.onclick = ()=> { this.txtFind.focus(); };
        this.btnFilter.onmouseenter = ()=> { this.pnlFilter.style.maxHeight = container.clientHeight - this.win.offsetTop - 64 + "px"; };
        this.btnSort.onmouseenter = ()=> { this.pnlSort.style.maxHeight = container.clientHeight - this.win.offsetTop - 64 + "px"; };

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        this.WaitLoader();

        this.btnFind.ondblclick = ()=> {
            if (this.strFind=="") return;
            this.strFind = ""; this.txtFind.value = "";
            this.DisplayList();
            this.btnFind.style.borderBottom = "none";
        };

        this.btnFilter.ondblclick = ()=> {
            if (this.strFilter=="") return;
            this.strFilter = "";
            this.DisplayList();
            this.btnFilter.style.borderBottom = "none";
        };

        this.btnSort.ondblclick = ()=> {
            if (this.strSort=="") return;
            this.strSort = "";
            this.DisplayList();
            this.btnSort.style.borderBottom = "none";
        };

        this.txtFind.onchange = ()=> {
            this.strFind = this.txtFind.value;
            this.DisplayList();
            this.btnFind.style.borderBottom = (this.strFind.length==0)? "none" : "#FF7900 solid 2px";
        };

        this.content.onscroll = ()=> { this.InvalidateRecyclerList(); };
    }

    Toogle() { //override
        super.Toogle();
        setTimeout(()=>{ this.AfterResize(); }, ANIM_DURATION);
    }

    AfterResize() { //override
        this.InvalidateRecyclerList();
    }

    WaitLoader() {
        if (db_equip === null) {
            if (this.content.childNodes.length == 0) {
                let lblLoading = document.createElement("div");
                lblLoading.innerHTML        = "Loading...";
                lblLoading.style.textAlign  = "center";
                lblLoading.style.marginTop  = "32px";
                lblLoading.style.fontSize   = "24px";
                lblLoading.style.color      = "#888";
                this.content.appendChild(lblLoading);
            }
            setTimeout(()=> this.WaitLoader(), 200);
        } else 
            this.DisplayList();
    }

    async DisplayList() {
        EQUIP_TYPES = [];
        this.list = [];
        this.content.innerHTML = "";
        this.pnlSort.innerHTML = "";
        this.pnlFilter.innerHTML = "";

        let noFilter = document.createElement("div");
        noFilter.innerHTML = "All";
        this.pnlFilter.appendChild(noFilter);
        noFilter.onclick = () => {
            if (this.strFilter == "") return;
            this.strFilter = "";
            this.DisplayList();
            this.btnFilter.style.borderBottom = "none";
        };

        let keywords = [];
        if (this.strFind.length > 0)
            keywords = this.strFind.toLowerCase().split(" ");
               
        for (let i = 0; i < db_equip.length; i++) {
            let c_type = (db_equip[i].hasOwnProperty("TYPE")) ? db_equip[i]["TYPE"][0].toLowerCase() : "";

            if (c_type.length > 0 && !EQUIP_TYPES.includes(c_type))
                EQUIP_TYPES.push(c_type);

            if (this.strFilter.length > 0) //filter
                if (c_type != this.strFilter) continue;

            if (this.strFind.length > 0) { //find
                let match = true;

                for (let j=0; j<keywords.length; j++) {
                    let flag = false;
                    for (let k in db_equip[i]) {
                        //if (k.startsWith(".") && k != ".FILENAME") continue;
                        if (db_equip[i][k][0].toLowerCase().indexOf(keywords[j]) > -1) 
                            flag = true;
                    }
                    if (!flag) {
                        match = false;
                        continue;
                    }
                }

                if (!match) continue;
            }

            this.list.push(db_equip[i]);
        }

        EQUIP_TYPES.sort();
        for (let i=0; i<EQUIP_TYPES.length; i++) //display filters
            this.AddTypeFilter(EQUIP_TYPES[i]);
        
        //sort
        if (this.strSort.length != 0) 
            this.list.sort((a,b)=> {
                if (a[this.strSort]==undefined && b[this.strSort]==undefined) return 0;
                if (a[this.strSort]==undefined) return 1;
                if (b[this.strSort]==undefined) return -1;
                if (a[this.strSort][0] < b[this.strSort][0]) return -1;
                if (a[this.strSort][0] > b[this.strSort][0]) return 1;
                return 0;
            });
        

        this.content.style.display = "none";

        for (let i=0; i<this.list.length; i++) { //display
            let element = document.createElement("div");
            element.className = "eql-element";
            element.id = "e" + this.list[i][".FILENAME"][0];
            this.content.appendChild(element);

            let entry = this.list[i];
            let c_type = (entry.hasOwnProperty("TYPE")) ? entry["TYPE"][0].toLowerCase() : "";

            if (element.offsetTop - this.content.scrollTop > -40 && element.offsetTop - this.content.scrollTop < this.content.clientHeight)
                this.FillElement(element, entry, c_type);
        }

        this.content.style.display = "block";
        
        this.pnlSort.innerHTML = "";
        for (let i=0; i<EQUIP_PARAM.length; i++)
            if (EQUIP_PARAM[i].length > 0) {
                let newSoft = document.createElement("div");
                newSoft.innerHTML = EQUIP_PARAM[i];
                this.pnlSort.appendChild(newSoft);

                newSoft.onclick = event=> {
                    if (this.strSort == EQUIP_PARAM[i]) return;
                    this.strSort = EQUIP_PARAM[i].toUpperCase();
                    this.DisplayList();
                    this.btnSort.style.borderBottom = "#FF7900 solid 2px";
                };
            }

        this.InvalidateRecyclerList();
    }

    FillElement(element, entry, c_type) {
        if (c_type.length > 0 && !EQUIP_TYPES.includes(entry["TYPE"][0].toLowerCase())) {
            EQUIP_TYPES.push(c_type);
            this.AddTypeFilter(c_type);
        }

        let icon = document.createElement("div");
        icon.className = "eql-icon";
        icon.style.backgroundImage = "url(" + GetIcon(entry["TYPE"]) + ")";
        element.appendChild(icon);


        for (let j=0; j<8; j++) {
            if (!entry.hasOwnProperty(EQUIP_LIST_ORDER[j])) continue;

            let newLabel = document.createElement("div");
            newLabel.innerHTML = entry[EQUIP_LIST_ORDER[j]][0];
            newLabel.className = "eql-label" + j;
            element.appendChild(newLabel);
        }
        
        /*for (let k in entry)
            if (typeof entry[k] != "undefined")
                if (!EQUIP_PARAM.includes(k.toLowerCase()) && !k.startsWith(".")) EQUIP_PARAM.push(k.toLowerCase());*/

        element.ondblclick = (event)=> {
            for (let i=0; i<w_array.length; i++)
                if (w_array[i] instanceof Equip && w_array[i].filename == entry[".FILENAME"][0]) {
                    w_array[i].Minimize(); //minimize/restore
                    return;
                }

            new Equip(entry);
            event.stopPropagation();
        };
    }

    AddTypeFilter(c_type) {
        if (c_type.length > 0) {
            let newFilter = document.createElement("div");                
            
            let ico = document.createElement("div");
            ico.style.width = ico.style.height = "20px";
            ico.style.backgroundImage = "url(" + GetIcon([c_type.toLowerCase(), null]) + ")";
            ico.style.backgroundSize = "cover";
            ico.style.filter = "Invert(1)";
            ico.style.float = "left";
            ico.style.marginRight = "4px";
            newFilter.appendChild(ico);

            newFilter.innerHTML += c_type;
            this.pnlFilter.appendChild(newFilter);

            newFilter.onclick = ()=> {
                if (this.strFilter==c_type) return;
                this.strFilter = c_type;
                this.DisplayList();
                this.btnFilter.style.borderBottom = "#FF7900 solid 2px";
            };
        }
    }

    InvalidateRecyclerList() { //override
        for (let i=0; i<this.content.childNodes.length; i++) 
            if (this.content.childNodes[i].offsetTop - this.content.scrollTop < -40 ||
                this.content.childNodes[i].offsetTop - this.content.scrollTop > this.content.clientHeight) {
                this.content.childNodes[i].innerHTML = "";
            } else {
                if (this.content.childNodes[i].childNodes.length > 0) continue;
                let c_type = (this.list[i].hasOwnProperty("TYPE")) ? this.list[i]["TYPE"][0].toLowerCase() : "";
                this.FillElement(this.content.childNodes[i], this.list[i], c_type);
            }
    }
}

function GetIcon(type) {
    if (type == undefined)
        return "/res/gear.svgz";

    else if (typeof type == "object") {
        let filename = EQUIP_ICON[type[0].toLowerCase()];
        if (filename == undefined) 
            return "/res/gear.svgz";
        else 
            return filename;

    } else
        return "/res/gear.svgz";;
}