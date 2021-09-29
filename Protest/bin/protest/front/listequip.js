const EQUIP_ICON = {
"access point"        : "res/accesspoint.svgz",
"antenna"             : "res/antenna.svgz",
"camera"              : "res/camera.svgz",
"copy machine"        : "res/copymachine.svgz",
"fax"                 : "res/fax.svgz",
"firewall"            : "res/firewall.svgz",
"lamp"                : "res/lamp.svgz",
"laptop"              : "res/laptop.svgz",
"nas"                 : "res/server.svgz",
"media player"        : "res/mediaplayer.svgz",
"music player"        : "res/mediaplayer.svgz",
"multiprinter"        : "res/multiprinter.svgz",
"mobile phone"        : "res/mobilephone.svgz",
"pc tower"            : "res/pc.svgz",
"telephone"           : "res/phone.svgz",
"printer"             : "res/printer.svgz",
"point of sale"       : "res/pos.svgz",
"pos"                 : "res/pos.svgz",
"pos printer"         : "res/posprinter.svgz",
"router"              : "res/router.svgz",
"scanner"             : "res/scanner.svgz",
"serial to ethernet"  : "res/serialconverter.svgz",
"serial converter"    : "res/serialconverter.svgz",
"server"              : "res/server.svgz",
"switch"              : "res/switch.svgz",
"multilayer switch"   : "res/l3switch.svgz",
"tv"                  : "res/tv.svgz",
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

        this.SetTitle("Equipment");
        this.SetIcon("res/database_equip.svgz");

        this.defaultColumns = ["NAME", "TYPE", "HOSTNAME", "IP", "MANUFACTURER", "MODEL", "OWNER", "LOCATION"];

        if (localStorage.getItem("columns_equip"))
            this.columns = JSON.parse(localStorage.getItem("columns_equip"));
        else
            this.columns = this.defaultColumns;

        this.db = db_equip;

        this.typeslist = [];
        this.hasTypes = true;

        this.InitDropdown();
        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.UpdateTitlebar();
        this.RefreshList();
        this.OnUiReady();
        this.UpdateFilters();
    }

    InitDropdown() {
        this.btnDropdown = document.createElement("div");
        this.btnDropdown.className = "tool-with-submenu";
        this.btnDropdown.style.backgroundImage = "url(res/l_dropdown.svgz)";
        this.btnDropdown.style.boxShadow = "none";
        this.btnDropdown.tabIndex = 0;
        this.toolbox.appendChild(this.btnDropdown);

        this.dropdownSubmenu = document.createElement("div");
        this.dropdownSubmenu.className = "tool-submenu";
        this.btnDropdown.appendChild(this.dropdownSubmenu);

        const itmPing = document.createElement("div");
        itmPing.innerHTML = "Ping";
        itmPing.style.paddingLeft = "32px";
        itmPing.style.backgroundImage = "url(res/ping.svgz)";
        itmPing.style.backgroundSize = "24px 24px ";
        itmPing.style.backgroundPosition = "4px 50%";
        itmPing.style.backgroundRepeat = "no-repeat";
        this.dropdownSubmenu.appendChild(itmPing);

        const itmDns = document.createElement("div");
        itmDns.innerHTML = "DNS lookup";
        itmDns.style.paddingLeft = "32px";
        itmDns.style.backgroundImage = "url(res/dns.svgz)";
        itmDns.style.backgroundSize = "24px 24px ";
        itmDns.style.backgroundPosition = "4px 50%";
        itmDns.style.backgroundRepeat = "no-repeat";
        this.dropdownSubmenu.appendChild(itmDns);

        const itmTrace = document.createElement("div");
        itmTrace.innerHTML = "Trace route";
        itmTrace.style.paddingLeft = "32px";
        itmTrace.style.backgroundImage = "url(res/traceroute.svgz)";
        itmTrace.style.backgroundSize = "24px 24px ";
        itmTrace.style.backgroundPosition = "4px 50%";
        itmTrace.style.backgroundRepeat = "no-repeat";
        this.dropdownSubmenu.appendChild(itmTrace);

        const itmPortScan = document.createElement("div");
        itmPortScan.innerHTML = "Port scan";
        itmPortScan.style.paddingLeft = "32px";
        itmPortScan.style.backgroundImage = "url(res/portscan.svgz)";
        itmPortScan.style.backgroundSize = "24px 24px ";
        itmPortScan.style.backgroundPosition = "4px 50%";
        itmPortScan.style.backgroundRepeat = "no-repeat";
        //this.dropdownSubmenu.appendChild(itmPortScan);

        const itmLocate = document.createElement("div");
        itmLocate.innerHTML = "Locate IP";
        itmLocate.style.paddingLeft = "32px";
        itmLocate.style.backgroundImage = "url(res/locate.svgz)";
        itmLocate.style.backgroundSize = "24px 24px ";
        itmLocate.style.backgroundPosition = "4px 50%";
        itmLocate.style.backgroundRepeat = "no-repeat";
        this.dropdownSubmenu.appendChild(itmLocate);

        const itmMacResolve = document.createElement("div");
        itmMacResolve.innerHTML = "MAC lookup";
        itmMacResolve.style.paddingLeft = "32px";
        itmMacResolve.style.backgroundImage = "url(res/maclookup.svgz)";
        itmMacResolve.style.backgroundSize = "24px 24px ";
        itmMacResolve.style.backgroundPosition = "4px 50%";
        itmMacResolve.style.backgroundRepeat = "no-repeat";
        this.dropdownSubmenu.appendChild(itmMacResolve);

        this.btnDropdown.onfocus = () => {
            if (this.popoutWindow)
                this.dropdownSubmenu.style.maxHeight = this.content.clientHeight - 64 + "px";
            else
                this.dropdownSubmenu.style.maxHeight = container.clientHeight - this.win.offsetTop - 64 + "px";

            this.BringToFront();
        };

        itmPing.onclick = () => {
            let entries = [];
            for (let i = 0; i < this.view.length; i++)
                if (this.view[i].hasOwnProperty("IP") && this.view[i].IP[0].length > 0)
                    this.view[i].IP[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));
                else if (this.view[i].hasOwnProperty("HOSTNAME") && this.view[i].HOSTNAME[0].length > 0)
                    this.view[i].HOSTNAME[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));

            if (entries.length > 0)
                new Ping({ entries: entries, timeout: 1000, method: "icmp", moveToBottom: false });
        };

        itmDns.onclick = () => {
            let entries = [];
            for (let i = 0; i < this.view.length; i++)
                if (this.view[i].hasOwnProperty("HOSTNAME") && this.view[i].HOSTNAME[0].length > 0)
                    this.view[i].HOSTNAME[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));

            if (entries.length > 0)
                new DnsLookup({ entries: entries });
        };

        itmTrace.onclick = () => {
            let entries = [];
            for (let i = 0; i < this.view.length; i++)
                if (this.view[i].hasOwnProperty("IP") && this.view[i].IP[0].length > 0)
                    this.view[i].IP[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));
                else if (this.view[i].hasOwnProperty("HOSTNAME") && this.view[i].HOSTNAME[0].length > 0)
                    this.view[i].HOSTNAME[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));

            if (entries.length > 0)
                new TraceRoute({ entries: entries });
        };

        itmPortScan.onclick = () => {
            let entries = [];
            for (let i = 0; i < this.view.length; i++)
                if (this.view[i].hasOwnProperty("IP") && this.view[i].IP[0].length > 0)
                    this.view[i].IP[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));
                else if (this.view[i].hasOwnProperty("HOSTNAME") && this.view[i].HOSTNAME[0].length > 0)
                    this.view[i].HOSTNAME[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));

            if (entries.length > 0)
                new PortScan({ entries: entries, rangeFrom: 1, rangeTo: 1023 });
        };

        itmLocate.onclick = () => {
            let entries = [];
            for (let i = 0; i < this.view.length; i++)
                if (this.view[i].hasOwnProperty("IP") && this.view[i].IP[0].length > 0)
                    this.view[i].IP[0].split(";").map(o => o.trim()).forEach(o => entries.push(o));

            if (entries.length > 0)
                new LocateIp({ entries: entries });
        };

        itmMacResolve.onclick = () => {
            let entries = [];
            for (let i = 0; i < this.view.length; i++)
                if (this.view[i].hasOwnProperty("MAC ADDRESS") && this.view[i]["MAC ADDRESS"][0].length > 0)
                    this.view[i]["MAC ADDRESS"][0].split(";").map(o => o.trim()).forEach(o => entries.push(o));

            if (entries.length > 0)
                new MacLookup({ entries: entries });
        };
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