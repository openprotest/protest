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

class ListEquip extends List {
    constructor(args) {
        super();

        this.args = args ? args : { value: "" };

        this.setTitle("Equipment");
        this.setIcon("res/database_equip.svgz");

        this.columns = ["NAME", "TYPE", "HOSTNAME", "IP", "MANUFACTURER", "MODEL", "OWNER", "LOCATION"];
        this.db = db_equip;

        this.UpdateTitlebar();
        this.RefreshList();
        this.OnUiReady();
    }

    InflateElement(element, entry, c_type) { //override
        //if (c_type.length > 0 && !EQUIP_TYPES.includes(entry["TYPE"][0].toLowerCase())) {
        //    EQUIP_TYPES.push(c_type);
            //TODO: this.AddTypeFilter(c_type);
        //}

        element.id = "e" + entry[".FILENAME"][0];

        let icon = document.createElement("div");
        icon.className = "lst-obj-ico";
        icon.style.backgroundImage = "url(" + GetEquipIcon(entry["TYPE"]) + ")";
        element.appendChild(icon);

        for (let j = 0; j < 8; j++) {
            if (!entry.hasOwnProperty(this.columns[j])) continue;

            let newLabel = document.createElement("div");
            newLabel.innerHTML = entry[this.columns[j]][0];
            newLabel.className = "lst-obj-lbl-" + j;
            element.appendChild(newLabel);
        }

        if (!element.ondblclick)
            element.ondblclick = (event) => {
                for (let i = 0; i < $w.array.length; i++)
                    if ($w.array[i] instanceof Equip && $w.array[i].filename == entry[".FILENAME"][0]) {
                        $w.array[i].Minimize(); //minimize/restore
                        return;
                    }

                new Equip(entry);
                event.stopPropagation();
            };
    }

}