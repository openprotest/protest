class Log extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : {
            autoscroll: true,
            opaque: false,
            ontop: false
        };

        this.setTitle("Log");
        this.setIcon("res/log.svgz");

        this.isLoading = true;

        this.content.style.display = "grid";
        this.content.style.margin = "4px 0";
        this.content.style.gridTemplateColumns = "auto minmax(50px, 1200px) auto";
        this.content.style.gridTemplateRows = "auto 22px";

        this.list = document.createElement("div");
        this.list.className = "no-results";
        this.list.style.gridArea = "1 / 2";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.color = "#202020";
        this.list.style.fontFamily = "monospace";
        this.list.style.margin = "0px 8px 4px 8px";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "auto";
        this.content.appendChild(this.list);

        const options = document.createElement("div");
        options.style.gridArea = "2 / 2";
        options.style.padding = "0px 16px";
        options.style.overflow = "hidden";
        this.content.appendChild(options);

        const divAutoScroll = document.createElement("div");
        divAutoScroll.style.display = "inline-block";
        divAutoScroll.style.paddingRight = "32px";
        divAutoScroll.style.paddingBottom = "8px";
        options.appendChild(divAutoScroll);
        this.chkAutoScroll = document.createElement("input");
        this.chkAutoScroll.type = "checkbox";
        this.chkAutoScroll.checked = this.args.autoscroll;
        divAutoScroll.appendChild(this.chkAutoScroll);
        this.AddCheckBoxLabel(divAutoScroll, this.chkAutoScroll, "Auto-scroll");

        this.divOpaque = document.createElement("div");
        this.divOpaque.style.display = "inline-block";
        this.divOpaque.style.paddingRight = "32px";
        this.divOpaque.style.paddingBottom = "8px";
        options.appendChild(this.divOpaque);
        this.chkOpaque = document.createElement("input");
        this.chkOpaque.type = "checkbox";
        this.chkOpaque.checked = this.args.opaque;
        this.divOpaque.appendChild(this.chkOpaque);
        this.AddCheckBoxLabel(this.divOpaque, this.chkOpaque, "Opaque");

        this.divOntop = document.createElement("div");
        this.divOntop.style.display = "inline-block";
        this.divOntop.style.paddingRight = "32px";
        this.divOntop.style.paddingBottom = "8px";
        options.appendChild(this.divOntop);
        this.chkOntop = document.createElement("input");
        this.chkOntop.type = "checkbox";
        this.chkOntop.checked = this.args.ontop;
        this.divOntop.appendChild(this.chkOntop);
        this.AddCheckBoxLabel(this.divOntop, this.chkOntop, "Always on top");

        this.chkAutoScroll.onchange = () => { this.args.autoscroll = this.chkAutoScroll.checked; };

        this.chkOpaque.onchange = () => {
            this.args.opaque = this.chkOpaque.checked;
            this.SetOpaque(this.chkOpaque.checked);
        };

        this.chkOntop.onchange = () => {
            this.args.ontop = this.chkOpaque.checked;
            this.SetOntop(this.chkOntop.checked);
        };

        this.SetOpaque(this.chkOpaque.checked);
        this.SetOntop(this.chkOntop.checked);
        this.GetLog();
    }

    Popout() {
        const btnUnpop = super.Popout();

        this.divOpaque.style.visibility = "hidden";
        this.divOntop.style.visibility = "hidden";
        this.chkOpaque.checked = false;

        if (this.popoutWindow && this.args.opaque)
            this.SetOpaque(false);

        btnUnpop.addEventListener("click", () => {
            this.divOpaque.style.visibility = "visible";
            this.divOntop.style.visibility = "visible";
        });
    }

    GetLog() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split("\n");
                for (let i = 0; i < split.length-1; i++)
                    this.Add(split[i]);

                this.isLoading = false;
            }
        };

        xhr.open("GET", "getlog", true);
        xhr.send();
    }

    Add(text) {
        while (text.indexOf("\t") > -1)
            text = text.replace("\t", "&emsp;&emsp;");

        while (text.indexOf(" ") > -1)
            text = text.replace(" ", "&nbsp;");

        const element = document.createElement("div");
        element.className = "generic-list-element generic-list-element-tied";
        element.innerHTML = text;
        this.list.appendChild(element);

        if (this.args.autoscroll) element.scrollIntoView();
    }

    SetOpaque(opaque) {
        if (opaque) {
            this.win.style.backgroundColor = "rgba(64,64,64,.7)";
            //this.win.style.border = "1px solid var(--select-color)";
            this.win.style.boxShadow = "var(--select-color) 0 0 1px 1px";
            this.resize.style.borderBottom = "16px solid var(--select-color)";
            this.content.style.backgroundColor = "transparent";
            this.list.style.border = "1px solid var(--select-color)";
            this.list.style.backgroundColor = "transparent";
            this.list.style.color = "#FFF";

            this.btnClose.style.backgroundColor = "var(--select-color)";
            this.btnMaximize.style.backgroundColor = "var(--select-color)";
            this.btnMinimize.style.backgroundColor = "var(--select-color)";
            this.btnPopout.style.backgroundColor = "var(--select-color)";

        } else {
            this.win.style.backgroundColor = "";
            //this.win.style.border = "";
            this.win.style.boxShadow = "";
            this.resize.style.borderBottom = "";
            this.content.style.backgroundColor = "";
            this.list.style.border = "none";
            this.list.style.backgroundColor = "var(--pane-color)";
            this.list.style.color = "#202020";

            this.btnMaximize.style.backgroundColor = "";
            this.btnMinimize.style.backgroundColor = "";
            this.btnPopout.style.backgroundColor = "";
        }

    }

    SetOntop(ontop) {
        if (ontop) {
            this.BringToFront = () => {
                super.BringToFront();
                this.win.style.zIndex = "9999999";
            };

            this.win.style.zIndex = "9999999";

        } else {
            this.BringToFront = () => {
                super.BringToFront();
            };
            this.win.style.zIndex = ++$w.count;
        }
    }
}