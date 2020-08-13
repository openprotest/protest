class Log extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : {
            autoscroll: true,
            opaque : false
        };

        this.setTitle("Log");
        this.setIcon("res/log.svgz");

        this.isLoading = true;

        this.content.style.display = "grid";
        this.content.style.margin = "4px 0";
        this.content.style.gridTemplateColumns = "auto minmax(50px, 1200px) auto";
        this.content.style.gridTemplateRows = "32px auto";

        const options = document.createElement("div");
        options.style.gridArea = "1 / 2";
        options.style.padding = "0px 16px";
        options.style.overflow = "hidden";
        this.content.appendChild(options);

        this.list = document.createElement("div");
        this.list.className = "no-results";
        this.list.style.gridArea = "2 / 2";
        this.list.style.border = "1px solid var(--pane-color)";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.color = "#202020";
        this.list.style.fontFamily = "monospace";
        this.list.style.margin = "0 8px 8px 8px";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "auto";
        this.content.appendChild(this.list);

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

        this.chkAutoScroll.onchange = () => { this.args.autoscroll = this.chkAutoScroll.checked; };

        this.chkOpaque.onchange = () => {
            this.args.opaque = this.chkOpaque.checked;
            this.SetOpaque(this.chkOpaque.checked);
        };

        this.SetOpaque(this.chkOpaque.checked);

        this.GetLog();
    }

    Popout() {
        const btnUnpop = super.Popout();

        this.divOpaque.style.visibility = "hidden";
        this.chkOpaque.checked = false;

        if (this.popoutWindow && this.args.opaque)
            this.SetOpaque(false);

        btnUnpop.addEventListener("click", () => {
            this.divOpaque.style.visibility = "visible";
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
            text = text.replace(" ", "&thinsp;");

        const element = document.createElement("div");
        element.className = "generic-list-element generic-list-element-tied";
        element.innerHTML = text;
        this.list.appendChild(element);

        if (this.args.autoscroll) element.scrollIntoView();
    }

    SetOpaque(opaque) {
        if (opaque) {
            this.win.style.backgroundColor = "rgba(64,64,64,.7)";
            this.content.style.backgroundColor = "transparent";
            this.list.style.backgroundColor = "transparent";
            this.list.style.color = "#FFF";
        } else {
            this.win.style.backgroundColor = "";
            this.content.style.backgroundColor = "";
            this.list.style.backgroundColor = "var(--pane-color)";
            this.list.style.color = "#202020";
        }

    }

}