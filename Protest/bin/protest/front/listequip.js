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

function GetEquipIcon(type) {
    if (type == undefined)
        return "res/gear.svgz";

    else if (typeof type == "object") {
        let filename = EQUIP_ICON[type[0].toLowerCase()];
        if (filename == undefined)
            return "res/gear.svgz";
        else
            return filename;
    } else
        return "res/gear.svgz";
}

class ListEquip extends ListWindow {
    constructor(args) {
        super(args);

        this.setTitle("Equipment");
        this.setIcon("res/database_equip.svgz");

        this.defaultColumns = ["NAME", "TYPE", "HOSTNAME", "IP", "MANUFACTURER", "MODEL", "OWNER", "LOCATION"];

        if (localStorage.getItem("columns_equip"))
            this.columns = JSON.parse(localStorage.getItem("columns_equip"));
        else
            this.columns = this.defaultColumns;

        this.db = db_equip;

        this.typeslist = [];
        this.hasTypes = true;

        this.UpdateTitlebar();
        this.RefreshList();
        this.OnUiReady();
        this.UpdateFilters();
    }

    InflateElement(element, entry, type) { //override
        super.InflateElement(element, entry, type);

        const icon = document.createElement("div");
        icon.className = "lst-obj-ico";
        icon.style.backgroundImage = "url(" + GetEquipIcon(entry["TYPE"]) + ")";
        element.appendChild(icon);

        for (let j = 0; j < 8; j++) {
            if (!entry.hasOwnProperty(this.columns[j])) continue;
            if (entry[this.columns[j]][0].length == 0) continue;

            const newLabel = document.createElement("div");
            newLabel.innerHTML = entry[this.columns[j]][0];
            newLabel.className = "lst-obj-lbl-" + j;
            element.appendChild(newLabel);
        }

        if (!element.ondblclick)
            element.ondblclick = (event) => {
                let filename = entry[".FILENAME"][0];
                for (let i = 0; i < $w.array.length; i++)
                    if ($w.array[i] instanceof Equip && $w.array[i].filename === filename) {
                        $w.array[i].Minimize(); //minimize/restore
                        return;
                    }

                new Equip(filename);
                event.stopPropagation();
            };
    }

    UpdateFilters() {
        this.filterSubmenu.innerHTML = "";
        if (this.typeslist.length === 0) return;

        this.typeslist.sort();

        for (let i = 0; i < this.typeslist.length; i++) {
            let newItem = document.createElement("div");
            this.filterSubmenu.appendChild(newItem);

            let icon = document.createElement("div");
            icon.style.backgroundImage = `url(${GetEquipIcon([this.typeslist[i]])})`;
            newItem.appendChild(icon);

            let label = document.createElement("div");
            label.innerHTML = this.typeslist[i];
            newItem.appendChild(label);

            if (this.args.filter == this.typeslist[i].toLowerCase()) {
                this.btnFilter.style.borderBottom = "var(--theme-color) solid 2px";
                newItem.style.boxShadow = "rgb(64,64,64) 0 0 0 2px inset";
            }

            newItem.onclick = () => {
                for (let j = 0; j < this.filterSubmenu.childNodes.length; j++)
                    this.filterSubmenu.childNodes[j].style.boxShadow = "none";

                this.btnFilter.style.borderBottom = "var(--theme-color) solid 2px";
                newItem.style.boxShadow = "rgb(64,64,64) 0 0 0 2px inset";

                this.args.filter = this.typeslist[i].toLowerCase();

                this.RefreshList();
            };
        }

    }
}