class ListWindow extends Window {
    constructor(args) {
        super([64, 64, 64]);

        this.args = args ? args : { find:"", filter:"", sort:"" };
        this.selected = null;

        this.AddCssDependencies("list.css");

        //this.columns = ["NAME", "TYPE", "HOSTNAME", "IP", "MANUFACTURER", "MODEL", "OWNER", "LOCATION"];

        this.titlebar = document.createElement("div");
        this.titlebar.className = "list-titlebar";
        this.content.appendChild(this.titlebar);

        this.columnsOptions = document.createElement("div");
        this.columnsOptions.role = "button";
        this.columnsOptions.ariaLabel = "Edit columns";
        this.columnsOptions.className = "list-titlebar-options";
        this.titlebar.appendChild(this.columnsOptions);

        this.list = document.createElement("div");
        this.list.className = "list-view no-entries";
        this.content.appendChild(this.list);

        this.btnFilter = document.createElement("div");
        this.btnFilter.className = "tool-with-submenu";
        this.btnFilter.style.backgroundImage = "url(res/l_filter.svgz)";
        this.btnFilter.tabIndex = 0;
        this.toolbox.appendChild(this.btnFilter);

        this.filterSubmenu = document.createElement("div");
        this.filterSubmenu.className = "tool-submenu";
        this.btnFilter.appendChild(this.filterSubmenu);

        this.btnSort = document.createElement("div");
        this.btnSort.className = "tool-with-submenu";
        this.btnSort.style.backgroundImage = "url(res/l_sort.svgz)";
        this.btnSort.tabIndex = 0;
        this.toolbox.appendChild(this.btnSort);

        this.sortSubmenu = document.createElement("div");
        this.sortSubmenu.className = "tool-submenu";
        this.btnSort.appendChild(this.sortSubmenu);

        this.btnFind = document.createElement("div");
        this.btnFind.classList.add("win-toolbox-text");
        this.btnFind.style.backgroundImage = "url(res/l_search.svgz)";
        this.btnFind.style.cursor = "text";
        this.btnFind.style.backgroundPosition = "1px 50%";
        this.btnFind.style.overflow = "hidden";
        this.toolbox.appendChild(this.btnFind);

        this.txtFind = document.createElement("input");
        this.txtFind.type = "text";        
        this.txtFind.style.color = "rgb(224,224,224)";
        this.txtFind.style.margin = "2px 0px";
        this.txtFind.style.padding = "0";
        this.txtFind.style.paddingLeft = "26px";
        this.txtFind.style.width = "calc(100% - 26px)";
        this.txtFind.style.background = "none";
        this.txtFind.style.animation = "none";
        this.btnFind.appendChild(this.txtFind);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.lblTotal = document.createElement("div");
        this.lblTotal.className = "list-total";
        this.lblTotal.innerHTML = "0 / 0";
        this.content.appendChild(this.lblTotal);
        this.lblTotal.onmousedown = event => {
            this.BringToFront();
            event.stopPropagation();
        };

        this.view = [];
        this.db = null;
        this.titleLabels = [];

        this.btnFilter.onfocus = () => {
            if (this.popoutWindow) {
                this.filterSubmenu.style.maxHeight = this.content.clientHeight - 64 + "px";
            } else {
                this.filterSubmenu.style.maxHeight = container.clientHeight - this.win.offsetTop - 64 + "px";
            }
            this.BringToFront();
        };

        this.btnFilter.ondblclick = () => {
            this.args.filter = "";
            this.btnFilter.style.borderBottom = "none";
            for (let j = 0; j < this.filterSubmenu.childNodes.length; j++)
                this.filterSubmenu.childNodes[j].style.boxShadow = "none";

            this.RefreshList();
        };

        this.btnSort.onfocus = () => {
            if (this.popoutWindow) {
                this.sortSubmenu.style.maxHeight = this.content.clientHeight - 64 + "px";
            } else {
                this.sortSubmenu.style.maxHeight = container.clientHeight - this.win.offsetTop - 64 + "px";
            }
            this.BringToFront();
        };

        this.btnSort.ondblclick = () => {
            this.args.sort = "";
            this.btnSort.style.borderBottom = "none";
            for (let j = 0; j < this.sortSubmenu.childNodes.length; j++)
                this.sortSubmenu.childNodes[j].style.boxShadow = "none";

            this.RefreshList();
        };


        this.btnFind.onclick =
        this.btnFind.onfocus =
        this.txtFind.onfocus = () => {
            this.txtFind.focus();
            this.BringToFront();
        };

        this.btnFind.ondblclick = () => {
            this.txtFind.value = "";
            this.txtFind.onchange();
        };
        this.txtFind.onkeyup = event => {
            if (event.key === "Escape") {
                this.txtFind.value = "";
                this.txtFind.onchange();
            }
        };

        this.txtFind.onchange = () => {
            this.RefreshList();
            this.btnFind.style.backgroundColor = this.txtFind.value.length === 0 ? "" : "rgb(96,96,96)";
            this.btnFind.style.borderBottom = this.txtFind.value.length === 0 ? "none" : "var(--theme-color) solid 2px";
            this.btnFind.style.width = this.txtFind.value.length === 0 ? "" : "180px";
            this.args.find = this.txtFind.value;
        };

        this.columnsOptions.onclick = () => this.CustomizeColumns();
        this.list.onscroll = () => this.UpdateViewport();

        if (args.find && args.find.length > 0) {
            this.txtFind.value = args.find;
            this.btnFind.style.borderBottom = this.txtFind.value.length === 0 ? "none" : "var(--theme-color) solid 2px";
        }
    }

    OnUiReady(count=0) {
        if (this.list.clientHeight === 0 && count < 500)
            setTimeout(() => { this.OnUiReady(++count) }, 25);
        else
            this.UpdateViewport();
    }

    UpdateTitlebar() {
        if (this.titleLabels.length === 0)
            for (let i = 0; i < 4; i++) {
                let lblTitle = document.createElement("div");
                lblTitle.className = "list-title-" + i;
                this.titlebar.appendChild(lblTitle);
                this.titleLabels.push(lblTitle);
            }        

        for (let i = 0; i < this.titleLabels.length; i++)
            if (this.columns[i * 2 + 1].length === 0) 
                this.titleLabels[i].innerHTML = this.columns[i*2].toLowerCase();
            else 
                this.titleLabels[i].innerHTML = `${this.columns[i*2]}/${this.columns[i*2+1]}`.toLowerCase();
        
        this.sortSubmenu.innerHTML = "";

        for (let i=0; i<this.columns.length; i++) {
            if (this.columns[i].length === 0) continue;

            let newItem = document.createElement("div");
            newItem.innerHTML = this.columns[i].toLowerCase();
            this.sortSubmenu.appendChild(newItem);

            if (this.args.sort == this.columns[i].toLowerCase()) {
                this.btnSort.style.borderBottom = "var(--theme-color) solid 2px";
                newItem.style.boxShadow = "rgb(64,64,64) 0 0 0 2px inset";
            }

            newItem.onclick = () => {
                for (let j = 0; j < this.sortSubmenu.childNodes.length; j++)
                    this.sortSubmenu.childNodes[j].style.boxShadow = "none";

                this.btnSort.style.borderBottom = "var(--theme-color) solid 2px";
                newItem.style.boxShadow = "rgb(64,64,64) 0 0 0 2px inset";

                this.args.sort = this.columns[i].toLowerCase();

                this.RefreshList();
            };
        }
    }

    CustomizeColumns() {
        const dialog = this.DialogBox("320px");
        if (dialog === null) return;

        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        const btnApplyAll = document.createElement("input");
        btnApplyAll.type = "button";
        btnApplyAll.value = "Apply to all";
        buttonBox.appendChild(btnApplyAll);

        btnOK.value = "Apply";
        buttonBox.appendChild(btnOK);

        buttonBox.appendChild(btnCancel);

        const divBoxes = document.createElement("div");
        divBoxes.className = "property-box";
        innerBox.appendChild(divBoxes);

        let target = -1;
        const boxes = [];
        for (let i = 0; i < 8; i++) {
            const box = document.createElement("div");
            box.innerHTML = this.columns[i].toLowerCase();
            boxes.push(box);

            boxes[i].ondragover = event => {
                event.preventDefault();
            };

            boxes[i].ondragenter = event => {
                for (let j = 0; j < 8; j++)
                    boxes[j].style.backgroundColor = "var(--control-color)";

                boxes[i].style.backgroundColor = "var(--select-color)";
                target = i;
                event.stopPropagation();
            };
        }

        innerBox.ondragenter = event => {
            for (let j = 0; j < 8; j++)
                boxes[j].style.backgroundColor = "var(--control-color)";
            target = -1;
        };

        divBoxes.appendChild(boxes[0]);
        divBoxes.appendChild(boxes[2]);
        divBoxes.appendChild(boxes[4]);
        divBoxes.appendChild(boxes[6]);
        divBoxes.appendChild(boxes[1]);
        divBoxes.appendChild(boxes[3]);
        divBoxes.appendChild(boxes[5]);
        divBoxes.appendChild(boxes[7]);

        const divProperties = document.createElement("div");
        divProperties.className = "properties-list";
        innerBox.appendChild(divProperties);

        const txtFilter = document.createElement("input");
        txtFilter.type = "text";
        txtFilter.placeholder = "Find..";
        txtFilter.style.marginLeft = "0";
        txtFilter.style.marginRight = "0";
        txtFilter.style.marginTop = "4px";
        txtFilter.style.width = "calc(100% - 16px)";
        divProperties.appendChild(txtFilter);

        const listProperties = document.createElement("div");
        divProperties.appendChild(listProperties);

        const btnReset = document.createElement("input");
        btnReset.type = "button";
        btnReset.value = "Reset default";
        btnReset.style.position = "absolute";
        btnReset.style.left = "4px";
        btnReset.style.bottom = "4px";
        innerBox.appendChild(btnReset);

        let allColumns = [];
        for (let i = 0; i < this.db.length; i++)
            for (const p in this.db[i])
                if (allColumns.indexOf(p) === -1)
                    allColumns.push(p);
        allColumns.sort();


        const Filter = () => {
            listProperties.innerHTML = "";

            for (let i = 0; i < allColumns.length; i++) {
                let keyword = txtFilter.value.toLowerCase();
                if (allColumns[i].toLowerCase().indexOf(keyword) > -1) {
                    let newProp = document.createElement("div");
                    newProp.innerHTML = allColumns[i].toLowerCase();
                    newProp.draggable = true;
                    listProperties.appendChild(newProp);

                    newProp.ondragstart = () => {
                        target = -1;
                    };

                    newProp.ondragend = () => {
                        if (target > -1) {
                            boxes[target].innerHTML = allColumns[i].toLowerCase();
                            for (let j = 0; j < 8; j++)
                                boxes[j].style.backgroundColor = "var(--control-color)";

                            target = -1;
                        }
                    };

                }
            }
        };

        btnReset.onclick = () => {
            if (!this.defaultColumns) return;
            for (let i = 0; i < 8; i++)
                boxes[i].innerHTML = this.defaultColumns[i].toLowerCase();
        };


        btnApplyAll.addEventListener("click", event => {
            this.columns = [
                boxes[0].innerHTML.toUpperCase(), boxes[1].innerHTML.toUpperCase(),
                boxes[2].innerHTML.toUpperCase(), boxes[3].innerHTML.toUpperCase(),
                boxes[4].innerHTML.toUpperCase(), boxes[5].innerHTML.toUpperCase(),
                boxes[6].innerHTML.toUpperCase(), boxes[7].innerHTML.toUpperCase()];

            if (this instanceof ListEquip)
                localStorage.setItem("columns_equip", JSON.stringify(this.columns));
            else if (this instanceof ListUsers)
                localStorage.setItem("columns_users", JSON.stringify(this.columns));

            this.UpdateTitlebar();
            this.RefreshList();
            btnCancel.onclick();
        });

        btnOK.addEventListener("click", event => {
            this.columns = [
                boxes[0].innerHTML.toUpperCase(), boxes[1].innerHTML.toUpperCase(),
                boxes[2].innerHTML.toUpperCase(), boxes[3].innerHTML.toUpperCase(),
                boxes[4].innerHTML.toUpperCase(), boxes[5].innerHTML.toUpperCase(),
                boxes[6].innerHTML.toUpperCase(), boxes[7].innerHTML.toUpperCase()];

            this.UpdateTitlebar();
            this.RefreshList();
        });


        txtFilter.oninput = Filter;
        Filter();
    }

    RefreshList() {
        this.view = [];
        this.list.innerHTML = "";

        let keywords = this.txtFind.value.length > 0 ? this.txtFind.value.split(" ") : [];

        for (let i = 0; i < this.db.length; i++) {

            if (this.hasTypes) {
                let type = (this.db[i].hasOwnProperty("TYPE")) ? this.db[i]["TYPE"][0].toLowerCase() : "";
                if (type && type.length > 0 && !this.typeslist.includes(type))
                    this.typeslist.push(type);

                if (this.args.filter.length > 0)
                    if (this.args.filter != type)
                        continue;
            }

            if (keywords.length > 0) { //find
                let match = true;

                for (let j = 0; j < keywords.length; j++) {
                    let flag = false;
                    for (let k in this.db[i]) {
                        //if (k.startsWith(".") && k != ".FILENAME") continue;
                        if (this.db[i][k][0].toLowerCase().indexOf(keywords[j]) > -1)
                            flag = true;
                    }
                    if (!flag) {
                        match = false;
                        continue;
                    }
                }

                if (!match) continue;
            }

            this.view.push(this.db[i]);
        }

        if (this.args.sort.length > 0) { //sort
            let param = this.args.sort.toUpperCase();
            this.view.sort((a, b) => {
                if (a[param] == undefined && b[param] == undefined) return 0;
                if (a[param] == undefined) return 1;
                if (b[param] == undefined) return -1;
                if (a[param][0] < b[param][0]) return -1;
                if (a[param][0] > b[param][0]) return 1;
                return 0;
            });
        }

        this.list.style.display = "none";

        for (let i = 0; i < this.view.length; i++) { //display
            let element = document.createElement("div");
            element.id = `id${this.view[i][".FILENAME"][0]}`;
            element.className = "lst-obj-ele";
            this.list.appendChild(element);
        }

        this.list.style.display = "block";

        this.UpdateViewport();
    }

    InflateElement(element, entry, c_type) { //overridable
        element.onclick = () => {
            if (this.selected) 
                this.selected.style.backgroundColor = "";

            this.selected = element;
            element.style.backgroundColor = "var(--select-color)";
        };
    }

    AfterResize() { //override
        this.UpdateViewport();
    }

    UpdateViewport() {
        for (let i = 0; i < this.list.childNodes.length; i++)
            if (this.list.childNodes[i].offsetTop - this.list.scrollTop < -40 ||
                this.list.childNodes[i].offsetTop - this.list.scrollTop > this.list.clientHeight) {
                this.list.childNodes[i].innerHTML = "";
            } else {
                if (this.list.childNodes[i].childNodes.length > 0) continue;
                let type = (this.view[i].hasOwnProperty("TYPE")) ? this.view[i]["TYPE"][0].toLowerCase() : "";
                this.InflateElement(this.list.childNodes[i], this.view[i], type);
            }

        if (this.db)
            this.lblTotal.innerHTML = "Total:&nbsp;" + (this.db.length === this.view.length ? this.db.length : this.view.length + " / " + this.db.length);
    }

}