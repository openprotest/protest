class Documentation extends Window {
    constructor(args) {
        super();

        this.args = args ? args : {
            keywords: ""
        };

        this.AddCssDependencies("documentation.css");
        this.AddCssDependencies("list.css");

        this.setTitle("Documentation");
        this.setIcon("res/documentation.svgz");

        this.content.style.overflow = "auto";

        this.sidebar = document.createElement("div");
        this.sidebar.className = "doc-list-pane";
        this.content.appendChild(this.sidebar);

        const lblSearch = document.createElement("div");
        lblSearch.style.gridArea = "1 / 1";
        lblSearch.innerHTML = "Search:";
        this.sidebar.appendChild(lblSearch);

        this.txtSearch = document.createElement("input");
        this.txtSearch.style.gridArea = "1 / 2";
        this.txtSearch.type = "search";
        this.txtSearch.value = this.args.keywords;
        this.sidebar.appendChild(this.txtSearch);

        this.list = document.createElement("div");
        this.list.className = "no-entries";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.gridArea = "3 / 1 / 4 / 3";
        this.list.style.width = "100%";
        this.list.style.height = "100%";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "scroll";
        this.sidebar.appendChild(this.list);

        this.options = document.createElement("div");
        this.options.className = "doc-options";
        this.content.append(this.options);

        this.btnNew = document.createElement("input");
        this.btnNew.type = "button";
        this.btnNew.value = "New";
        this.btnNew.classList.add("light-button");
        this.btnNew.classList.add("light-button-withicon");
        this.btnNew.style.backgroundImage = "url(res/new_user.svgz)";
        this.btnNew.style.animation = "fade-in .4s 1";
        this.options.appendChild(this.btnNew);

        this.btnEdit = document.createElement("input");
        this.btnEdit.type = "button";
        this.btnEdit.value = "Edit";
        this.btnEdit.classList.add("light-button");
        this.btnEdit.classList.add("light-button-withicon");
        this.btnEdit.style.backgroundImage = "url(res/change.svgz)";
        this.btnEdit.style.animation = "fade-in .4s 1";
        this.options.appendChild(this.btnEdit);

        this.btnDelete = document.createElement("input");
        this.btnDelete.type = "button";
        this.btnDelete.value = "Delete";
        this.btnDelete.classList.add("light-button");
        this.btnDelete.classList.add("light-button-withicon");
        this.btnDelete.style.backgroundImage = "url(res/delete.svgz)";
        this.btnDelete.style.animation = "fade-in .4s 1";
        this.options.appendChild(this.btnDelete);

        this.btnSave = document.createElement("input");
        this.btnSave.type = "button";
        this.btnSave.value = "Save";
        this.btnSave.classList.add("light-button");
        this.btnSave.classList.add("light-button-withicon");
        this.btnSave.style.backgroundImage = "url(res/save.svgz)";
        this.btnSave.style.animation = "fade-in .4s 1";
        this.options.appendChild(this.btnSave);

        this.btnDiscard = document.createElement("input");
        this.btnDiscard.type = "button";
        this.btnDiscard.value = "Discard";
        this.btnDiscard.classList.add("light-button");
        this.btnDiscard.classList.add("light-button-withicon");
        this.btnDiscard.style.backgroundImage = "url(res/delete.svgz)";
        this.btnDiscard.style.animation = "fade-in .4s 1";
        this.options.appendChild(this.btnDiscard);


        this.body = document.createElement("div");
        this.body.className = "doc-body-outer";

        this.content.append(this.body);

        this.lblTitle = document.createElement("div");
        this.lblTitle.innerHTML = "Title:";
        this.lblTitle.className = "lblTitle";
        this.body.appendChild(this.lblTitle);
        this.txtTitle = document.createElement("input");
        this.txtTitle.type = "text";
        this.txtTitle.className = "txtTitle";
        this.body.appendChild(this.txtTitle);

        this.body.appendChild(document.createElement("br"));

        this.lblRelated = document.createElement("div");
        this.lblRelated.innerHTML = "Related devices:";
        this.lblRelated.className = "lblRelated";
        this.body.appendChild(this.lblRelated);
        this.divRelated = document.createElement("div");
        this.divRelated.className = "divRelated";
        this.body.appendChild(this.divRelated);

        this.body.appendChild(document.createElement("br"));

        this.btnAddRelated = document.createElement("input");
        this.btnAddRelated.type = "button";
        this.btnAddRelated.classList.add("light-button");
        this.btnAddRelated.style.backgroundImage = "url(res/new_equip.svgz)";
        this.btnAddRelated.style.right = "4px";
        this.btnAddRelated.style.top = "50px";
        this.btnAddRelated.style.minWidth = "28px";
        this.btnAddRelated.style.width = "28px";
        this.btnAddRelated.style.height = "28px";
        this.btnAddRelated.style.borderRadius = "0 8px 8px 0";
        this.btnAddRelated.style.backgroundRepeat = "no-repeat";
        this.btnAddRelated.style.backgroundSize = "24px 24px";
        this.btnAddRelated.style.backgroundPosition = "center center";

        this.body.appendChild(this.btnAddRelated);

        this.divContentContainer = document.createElement("div");
        this.divContentContainer.className = "divContentContainer";
        this.body.appendChild(this.divContentContainer);

        this.divContent = document.createElement("div");
        this.divContent.style.width = "100%";
        this.divContent.style.minHeight = "100%";
        this.divContent.style.outline = "none";
        this.divContentContainer.appendChild(this.divContent);

        this.btnBold = document.createElement("button");
        this.btnBold.style.backgroundImage = "url(res/bold.svg)";
        this.btnBold.style.left = "0px";
        this.btnBold.classList.add("light-button");
        this.btnBold.classList.add("doc-edit-button");
        this.body.appendChild(this.btnBold);

        this.btnItalic = document.createElement("button");
        this.btnItalic.style.backgroundImage = "url(res/italic.svg)";
        this.btnItalic.style.left = "36px";
        this.btnItalic.classList.add("light-button");
        this.btnItalic.classList.add("doc-edit-button");
        this.body.appendChild(this.btnItalic);

        this.btnUnderline = document.createElement("button");
        this.btnUnderline.style.backgroundImage = "url(res/underline.svg)";
        this.btnUnderline.style.left = "72px";
        this.btnUnderline.classList.add("light-button");
        this.btnUnderline.classList.add("doc-edit-button");
        this.body.appendChild(this.btnUnderline);

        this.btnOList = document.createElement("button");
        this.btnOList.style.backgroundImage = "url(res/orderedlist.svg)";
        this.btnOList.style.left = "108px";
        this.btnOList.classList.add("light-button");
        this.btnOList.classList.add("doc-edit-button");
        this.body.appendChild(this.btnOList);

        this.btnUList = document.createElement("button");
        this.btnUList.style.backgroundImage = "url(res/unorderedlist.svg)";
        this.btnUList.style.left = "144px";
        this.btnUList.classList.add("light-button");
        this.btnUList.classList.add("doc-edit-button");
        this.body.appendChild(this.btnUList);

        this.btnCode = document.createElement("button");
        this.btnCode.style.backgroundImage = "url(res/code.svg)";
        this.btnCode.style.left = "180px";
        this.btnCode.classList.add("light-button");
        this.btnCode.classList.add("doc-edit-button");
        this.body.appendChild(this.btnCode);

        this.btnLink = document.createElement("button");
        this.btnLink.style.backgroundImage = "url(res/link.svg)";
        this.btnLink.style.left = "216px";
        this.btnLink.classList.add("light-button");
        this.btnLink.classList.add("doc-edit-button");
        this.body.appendChild(this.btnLink);

        this.txtSearch.onchange = () => this.GetDocs();

        this.btnNew.onclick = () => this.New();
        this.btnEdit.onclick = () => this.Edit();
        this.btnDelete.onclick = () => this.Delete();
        this.btnSave.onclick = () => this.Save();
        this.btnDiscard.onclick = () => this.Discard();

        this.btnAddRelated.onclick = () => this.AddRelatedDialog();

        this.btnBold.onclick = () => { document.execCommand("bold", false, null); };
        this.btnItalic.onclick = () => { document.execCommand("italic", false, null); };
        this.btnUnderline.onclick = () => { document.execCommand("underline", false, null); };
        this.btnOList.onclick = () => { document.execCommand("insertOrderedList", false, null); };
        this.btnUList.onclick = () => { document.execCommand("insertUnorderedList", false, null); };

        this.btnCode.onclick = () => {
            let sel, range;
            if (window.getSelection && (sel = window.getSelection()).rangeCount) {
                range = sel.getRangeAt(0);
                if (range.startContainer.className != "") return;

                var div = document.createElement("div");
                div.className = "doc-code";
                range.insertNode(div);
                range.setStart(div, 0);

                sel.removeAllRanges();
                sel.addRange(range);
            }
        };

        this.btnLink.onclick = () => {
            let sel = window.getSelection();
            let range = sel.getRangeAt(0);

            const dialog = this.DialogBox("125px");
            if (dialog === null) return;

            const btnOK = dialog.btnOK;
            const btnCancel = dialog.btnCancel;
            const buttonBox = dialog.buttonBox;
            const innerBox = dialog.innerBox;

            innerBox.style.textAlign = "center";

            innerBox.appendChild(document.createElement("br"));

            const lblLink = document.createElement("div");
            lblLink.innerHTML = "Link:";
            lblLink.style.display = "inline-block";
            innerBox.appendChild(lblLink);

            const txtLink = document.createElement("input");
            txtLink.type = "text";
            txtLink.placeholder = "https://github.com/veniware";
            txtLink.style.width = "calc(80% - 64px)";
            innerBox.appendChild(txtLink);

            const Ok_onclick = btnOK.onclick;
            btnOK.onclick = () => {
                if (txtLink.value.length > 0) {
                    sel.removeAllRanges();
                    sel.addRange(range);
                    document.execCommand("createLink", false, txtLink.value);
                    document.getSelection().anchorNode.parentElement.target = '_blank';
                    Ok_onclick();
                }
            };

            txtLink.onkeydown = event => {
                if ((event.keyCode === 13)) {
                    btnOK.focus();
                    return;
                }

                if ((event.keyCode === 27))
                    btnCancel.onclick();
            };

            setTimeout(() => txtLink.focus(), 10);
        };

        setTimeout(() => { this.AfterResize(); }, 200);

        this.ReadMode();
        this.GetDocs();
        this.AdjustButtons();
    }

    AfterResize() { //override
        super.AfterResize();
        if (this.options.getBoundingClientRect().width < 260)
            this.options.classList.add("doc-options-collapsed");
        else
            this.options.classList.remove("doc-options-collapsed");
    }

    GetDocs() {
        this.args = {
            keywords: this.txtSearch.value,
        };

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));

                if (split.length > 1) {
                    this.UpdateList(split, this.selected);
                } else {
                    this.txtTitle.value = "";
                    this.divRelated.innerHTML = "";
                    this.list.innerHTML = "";
                }

                this.selected = null;
                this.AdjustButtons();

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        if (this.txtSearch.value.length == 0)
            xhr.open("GET", "docs/get", true);
        else
            xhr.open("GET", `docs/get&keywords=${this.txtSearch.value}`, true);
        xhr.send();
    }

    UpdateList(split) {
        this.txtTitle.value = "";
        this.divRelated.innerHTML = "";
        this.list.innerHTML = "";

        for (let i = 0; i < split.length; i++) {
            if (split[i].length == 0) continue;
            const entry = this.AddToList(split[i]);

            if (this.selected && this.selected === split[i])
                entry.onclick();
        }

        this.AdjustButtons();
    }

    AddToList(name) {
        const entry = document.createElement("div");
        entry.className = "doc-entry";
        entry.innerHTML = name;
        this.list.appendChild(entry);

        entry.onclick = () => {
            if (this.lastselected)
                this.lastselected.style.backgroundColor = "";

            entry.style.backgroundColor = "var(--select-color)";
            this.lastselected = entry;
            this.selected = name;

            this.Preview(name);
        };

        return entry;
    }

    Preview(name) {
        if (name === null) {
            this.txtTitle.value = "";
            this.divRelated.innerHTML = "";
            this.divContent.innerHTML = "";
            this.AdjustButtons();
            this.selected = null;
            return;
        }

        this.txtTitle.value = name;
        this.AdjustButtons();

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                this.divRelated.innerHTML = "";
                this.divContent.innerHTML = xhr.responseText;

                let commentStop = xhr.responseText.indexOf("-->", 0);
                if (xhr.responseText.startsWith("<!--") && commentStop > -1) {
                    let comment = xhr.responseText.substring(4, commentStop);
                    let related = JSON.parse(comment);

                    for (let i = 0; i < related.length - 3; i+=4)
                        this.AddRelated(related[i], related[i+1], related[i+2], related[i+3]);
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("GET", `docs/view&name=${name}`, true);
        xhr.send();
    }

    AdjustButtons() {
        if (this.btnEdit.hasAttribute("disabled")) this.btnEdit.removeAttribute("disabled");
        if (this.btnDelete.hasAttribute("disabled")) this.btnDelete.removeAttribute("disabled");

        if (this.txtTitle.value.length === 0) {
            this.btnEdit.setAttribute("disabled", true);
            this.btnDelete.setAttribute("disabled", true);
        }
    }

    ReadMode() {
        this.sidebar.style.transform = "none";
        this.sidebar.style.filter = "none";
        this.sidebar.style.visibility = "visible";

        this.options.style.left = "";
        this.body.style.left = "";

        this.btnNew.style.display = "inline-block";
        this.btnEdit.style.display = "inline-block";
        this.btnDelete.style.display = "inline-block";
        this.btnSave.style.display = "none";
        this.btnDiscard.style.display = "none";

        this.txtTitle.readOnly = true;

        this.divRelated.classList.remove("doc-related-editable");
        this.divRelated.style.right = "8px";
        this.btnAddRelated.style.opacity = "0";
        this.btnAddRelated.style.visibility = "hidden";
        this.divContent.contentEditable = false;

        this.btnBold.style.opacity = "0";
        this.btnBold.style.visibility = "hidden";
        this.btnItalic.style.opacity = "0";
        this.btnItalic.style.visibility = "hidden";
        this.btnUnderline.style.opacity = "0";
        this.btnUnderline.style.visibility = "hidden";
        this.btnOList.style.opacity = "0";
        this.btnOList.style.visibility = "hidden";
        this.btnUList.style.opacity = "0";
        this.btnUList.style.visibility = "hidden";
        this.btnCode.style.opacity = "0";
        this.btnCode.style.visibility = "hidden";
        this.btnLink.style.opacity = "0";
        this.btnLink.style.visibility = "hidden";

        this.divContentContainer.style.top = "104px";

        setTimeout(() => this.AfterResize(), 400);
    }

    EditMode() {
        this.sidebar.style.transform = "translateX(-300px)";
        this.sidebar.style.filter = "opaciry(0)";
        this.sidebar.style.visibility = "hidden";

        this.options.style.left = "4px";
        this.body.style.left = "4px";

        this.btnNew.style.display = "none";
        this.btnEdit.style.display = "none";
        this.btnDelete.style.display = "none";
        this.btnSave.style.display = "inline-block";
        this.btnDiscard.style.display = "inline-block";

        this.txtTitle.readOnly = false;

        this.divRelated.classList.add("doc-related-editable");
        this.divRelated.style.right = "36px";
        this.btnAddRelated.style.opacity = "1";
        this.btnAddRelated.style.visibility = "visible";
        this.divContent.contentEditable = true;

        this.btnBold.style.opacity = "1";
        this.btnBold.style.visibility = "visible";
        this.btnItalic.style.opacity = "1";
        this.btnItalic.style.visibility = "visible";
        this.btnUnderline.style.opacity = "1";
        this.btnUnderline.style.visibility = "visible";
        this.btnOList.style.opacity = "1";
        this.btnOList.style.visibility = "visible";
        this.btnUList.style.opacity = "1";
        this.btnUList.style.visibility = "visible";
        this.btnCode.style.opacity = "1";
        this.btnCode.style.visibility = "visible";
        this.btnLink.style.opacity = "1";
        this.btnLink.style.visibility = "visible";

        this.divContentContainer.style.top = "144px";

        setTimeout(() => this.AfterResize(), 400);
    }

    New() {
        this.EditMode();

        this.divContent.innerHTML = "";

        const table = document.createElement("table");
        this.divContent.appendChild(table);

        const tr1 = document.createElement("tr");
        table.appendChild(tr1);
        const td1_1 = document.createElement("td");
        td1_1.innerHTML = "Author";
        tr1.appendChild(td1_1);
        const td1_2 = document.createElement("td");
        tr1.appendChild(td1_2);

        const tr2 = document.createElement("tr");
        table.appendChild(tr2);
        const td2_1 = document.createElement("td");
        td2_1.innerHTML = "Location";
        tr2.appendChild(td2_1);
        const td2_2 = document.createElement("td");
        tr2.appendChild(td2_2);

        const tr3 = document.createElement("tr");
        table.appendChild(tr3);
        const td3_1 = document.createElement("td");
        td3_1.innerHTML = "Time spent";
        tr3.appendChild(td3_1);
        const td3_2 = document.createElement("td");
        tr3.appendChild(td3_2);

        this.divContent.appendChild(document.createElement("br"));

        const desc = document.createElement("div");
        desc.innerHTML = "Description:";
        //desc.style.fontSize = "large";
        desc.style.fontWeight = 600;
        desc.style.textDecoration = "underline";
        this.divContent.appendChild(desc);

        this.divContent.appendChild(document.createElement("br"));
        this.divContent.appendChild(document.createElement("br"));
        this.divContent.appendChild(document.createElement("br"));


        this.txtTitle.value = "";
        this.divRelated.innerHTML = "";
        this.txtTitle.focus();
    }

    Edit() {
        this.EditMode();
    }

    Delete() {
        if (!this.selected) return;

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                if (xhr.responseText == "ok") {
                    this.GetDocs();
                    this.Preview(null);
                } else {
                    this.ConfirmBox(xhr.responseText);
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("GET", `docs/delete&name=${this.selected}`, true);
        xhr.send();
    }

    Save() {
        if (this.txtTitle.value.length == 0) {
            this.ConfirmBox("Please enter a title", true).addEventListener("click", () => this.txtTitle.focus());
            return;
        }

        let name_lower = this.txtTitle.value.toLowerCase();
        let exist = false;
        for (let i = 0; i < this.list.childNodes.length; i++)
            if (this.list.childNodes[i].innerHTML.toLowerCase() === name_lower) {
                exist = true;
                break;
            }
        
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                if (xhr.responseText == "ok") {
                    if (exist) {
                        this.ReadMode();
                    } else {
                        const entry = this.AddToList(this.txtTitle.value);
                        this.ReadMode();
                        setTimeout(() => entry.onclick(), 0);
                    }
                } else {
                    this.ConfirmBox(xhr.responseText, true);
                }
            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        let payload = "";
        payload += this.txtTitle.value + String.fromCharCode(127);
        payload += this.divContent.innerHTML + String.fromCharCode(127);

        for (let i = 0; i < this.divRelated.childNodes.length; i++) {
            payload += this.divRelated.childNodes[i].getAttribute("file") + String.fromCharCode(127);
            payload += this.divRelated.childNodes[i].style.backgroundImage + String.fromCharCode(127);
            payload += this.divRelated.childNodes[i].getAttribute("label1") + String.fromCharCode(127);
            payload += this.divRelated.childNodes[i].getAttribute("label2") + String.fromCharCode(127);
        }

        if (exist) {
            this.ConfirmBox("An entry with this name already exists. Do you want to overwrite it?").addEventListener("click", () => {
                xhr.open("POST", "docs/create", true);
                xhr.send(payload);
            });

        } else {
            xhr.open("POST", "docs/create", true);
            xhr.send(payload);
        }

    }

    Discard() {
        this.ReadMode();
        this.Preview(this.selected);
    }

    AddRelatedDialog() {
        const dialog = this.DialogBox("85%");
        if (dialog === null) return;

        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        innerBox.style.padding = "8px";

        btnOK.style.display = "none";

        const txtFind = document.createElement("input");
        txtFind.type = "text";
        txtFind.placeholder = "Search";
        innerBox.appendChild(txtFind);

        const divEquip = document.createElement("div");
        divEquip.className = "no-results";
        divEquip.style.position = "absolute";
        divEquip.style.left = divEquip.style.right = "0";
        divEquip.style.top = "48px";
        divEquip.style.bottom = "0";
        divEquip.style.overflowY = "auto";
        innerBox.appendChild(divEquip);

        txtFind.onchange = txtFind.oninput = () => {
            divEquip.innerHTML = "";

            let keywords = [];
            if (txtFind.value.trim().length > 0)
                keywords = txtFind.value.trim().toLowerCase().split(" ");

            let EQUIP_LIST_ORDER;
            if (localStorage.getItem("columns_users"))
                EQUIP_LIST_ORDER = JSON.parse(localStorage.getItem("columns_equip"));
            else
                EQUIP_LIST_ORDER = ["NAME", "TYPE", "HOSTNAME", "IP", "MANUFACTURER", "MODEL", "OWNER", "LOCATION"];

            for (let i = 0; i < db_equip.length; i++) {
                let match = true;

                for (let j = 0; j < keywords.length; j++) {
                    let flag = false;
                    for (let k in db_equip[i]) {
                        if (k.startsWith(".")) continue;
                        if (db_equip[i][k][0].toLowerCase().indexOf(keywords[j]) > -1)
                            flag = true;
                    }
                    if (!flag) {
                        match = false;
                        continue;
                    }
                }

                if (!match) continue;

                let name = "";
                if (db_equip[i].hasOwnProperty("NAME"))
                    name = db_equip[i]["NAME"][0];
                else if (db_equip[i].hasOwnProperty("HOSTNAME"))
                    name = db_equip[i]["HOSTNAME"][0];
                else if (db_equip[i].hasOwnProperty("IP"))
                    name = db_equip[i]["IP"][0];

                let unique = "";
                if (db_equip[i].hasOwnProperty("SERIAL NUMBER"))
                    unique = db_equip[i]["SERIAL NUMBER"][0];
                else if (db_equip[i].hasOwnProperty("MAC ADDRESS"))
                    unique = db_equip[i]["MAC ADDRESS"][0];

                if (name.length === 0 && unique.length === 0) continue;

                const element = document.createElement("div");
                element.className = "lst-obj-ele";
                divEquip.appendChild(element);

                const icon = document.createElement("div");
                icon.className = "lst-obj-ico";
                icon.style.backgroundImage = db_equip[i].hasOwnProperty("TYPE") ? `url(${GetEquipIcon(db_equip[i]["TYPE"])})` : "url(res/gear.svgz)";
                element.appendChild(icon);

                for (let j = 0; j < 6; j++) {
                    if (!db_equip[i].hasOwnProperty(EQUIP_LIST_ORDER[j])) continue;
                    const newLabel = document.createElement("div");
                    newLabel.innerHTML = db_equip[i][EQUIP_LIST_ORDER[j]][0];
                    newLabel.className = "lst-obj-lbl-" + j;
                    element.appendChild(newLabel);
                }

                element.ondblclick = () => {
                    this.AddRelated(
                        db_equip[i][".FILENAME"][0],
                        `url(${GetEquipIcon(db_equip[i]["TYPE"])})`,
                        name,
                        unique
                    );

                    btnCancel.onclick();
                };

                divEquip.appendChild(element);
            }
        };

        txtFind.focus();
        txtFind.onchange();
    }

    AddRelated(filename, icon, label1, label2) {
        const related = document.createElement("div");
        related.setAttribute("file", filename);
        related.setAttribute("label1", label1);
        related.setAttribute("label2", label2);
        related.style.backgroundImage = icon;
        this.divRelated.appendChild(related);

        const divRemove = document.createElement("div");
        related.appendChild(divRemove);

        related.onclick = () => {
            for (let j = 0; j < $w.array.length; j++)
                if ($w.array[j] instanceof Equip && $w.array[j].filename === filename) {
                    $w.array[j].Minimize(); //minimize/restore
                    return;
                }

            new Equip(filename);
            event.stopPropagation();
        };

        divRemove.onclick = event => {
            event.stopPropagation();
            this.divRelated.removeChild(related);
        };
    }
}