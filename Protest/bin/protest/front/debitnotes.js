let DEBIT_TEMPLATES = [];
let DEBIT_EQUIP_AUTOFILL = null;
let DEBIT_EQUIP_AUTOFILL_SERIAL = {};

class DebitNotes extends Window {
    constructor(args) {
        super();

        const now = new Date();
        const gap = new Date(now - 86400000 * 365);

        this.args = args ? args : {
            keywords: "",
            from: `${gap.getFullYear()}-${(gap.getMonth() + 1).toString().padStart(2, "0")}-${(gap.getDate().toString().padStart(2, "0"))}`,
            to: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${(now.getDate().toString().padStart(2, "0"))}`,
            short: true,
            long: false,
            returned: false
        };

        this.last = null;
        this.selected = null;

        this.AddCssDependencies("debitnotes.css");
        this.AddCssDependencies("list.css");

        this.setTitle("Debit notes");
        this.setIcon("res/charges.svgz");

        this.content.style.overflow = "auto";

        const listbox = document.createElement("div");
        listbox.style.display = "grid";
        listbox.style.gridTemplateColumns = "72px 200px auto";
        listbox.style.gridTemplateRows = "repeat(3, 32px) 8px repeat(3, 28px) auto 8px";
        listbox.style.alignItems = "baseline";

        listbox.className = "debit-list-pane";
        this.content.appendChild(listbox);

        const lblSearch = document.createElement("div");
        lblSearch.style.gridArea = "1 / 1";
        lblSearch.innerHTML = "Search:";
        listbox.appendChild(lblSearch);

        this.txtSearch = document.createElement("input");
        this.txtSearch.style.gridArea = "1 / 2";
        this.txtSearch.type = "search";
        this.txtSearch.value = this.args.keywords;
        listbox.appendChild(this.txtSearch);

        const lblFrom = document.createElement("div");
        lblFrom.style.gridArea = "2 / 1";
        lblFrom.innerHTML = "From:";
        listbox.appendChild(lblFrom);

        this.dateFrom = document.createElement("input");
        this.dateFrom.style.gridArea = "2 / 2";
        this.dateFrom.type = "date";
        this.dateFrom.value = this.args.from;
        listbox.appendChild(this.dateFrom);

        const lblTo = document.createElement("div");
        lblTo.style.gridArea = "3 / 1";
        lblTo.innerHTML = "To:";
        listbox.appendChild(lblTo);

        this.dateTo = document.createElement("input");
        this.dateTo.style.gridArea = "3 / 2";
        this.dateTo.type = "date";
        this.dateTo.value = this.args.to;
        listbox.appendChild(this.dateTo);

        const lblFilter = document.createElement("div");
        lblFilter.style.gridArea = "5 / 1";
        lblFilter.innerHTML = "Filters:";
        listbox.appendChild(lblFilter);

        const divShort = document.createElement("div");
        divShort.style.gridArea = "5 / 2";
        divShort.style.paddingLeft = "4px";
        listbox.appendChild(divShort);
        this.chkShort = document.createElement("input");
        this.chkShort.type = "checkbox";
        this.chkShort.checked = this.args.short;
        divShort.appendChild(this.chkShort);
        this.AddCheckBoxLabel(divShort, this.chkShort, "Short-term");

        const divLong = document.createElement("div");
        divLong.style.gridArea = "6 / 2";
        divLong.style.paddingLeft = "4px";
        listbox.appendChild(divLong);
        this.chkLong = document.createElement("input");
        this.chkLong.type = "checkbox";
        this.chkLong.checked = this.args.long;
        divLong.appendChild(this.chkLong);
        this.AddCheckBoxLabel(divLong, this.chkLong, "Long-term");

        const divReturned = document.createElement("div");
        divReturned.style.gridArea = "7 / 2";
        divReturned.style.paddingLeft = "4px";
        listbox.appendChild(divReturned);
        this.chkReturned = document.createElement("input");
        this.chkReturned.type = "checkbox";
        this.chkReturned.checked = this.args.returned;
        divReturned.appendChild(this.chkReturned);
        this.AddCheckBoxLabel(divReturned, this.chkReturned, "Returned");

        this.list = document.createElement("div");
        this.list.className = "no-entries";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.gridArea = "8 / 1 / 9 / 3";
        this.list.style.width = "100%";
        this.list.style.height = "100%";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "scroll";
        listbox.appendChild(this.list);

        this.preview = document.createElement("div");
        this.preview.className = "debit-preview-outer";
        this.content.append(this.preview);


        this.options = document.createElement("div");
        this.options.className = "debit-options";
        this.content.append(this.options);

        this.btnNew = document.createElement("input");
        this.btnNew.style.backgroundImage = "url(res/new_user.svgz)";
        this.btnNew.classList.add("light-button");
        this.btnNew.classList.add("light-button-withicon");
        this.btnNew.type = "button";
        this.btnNew.value = "New";
        this.options.appendChild(this.btnNew);

        this.btnPrint = document.createElement("input");
        this.btnPrint.style.backgroundImage = "url(res/printer.svgz)";
        this.btnPrint.classList.add("light-button");
        this.btnPrint.classList.add("light-button-withicon");
        this.btnPrint.type = "button";
        this.btnPrint.value = "Print";
        this.options.appendChild(this.btnPrint);

        this.btnDublicate = document.createElement("input");
        this.btnDublicate.style.backgroundImage = "url(res/copy.svgz)";
        this.btnDublicate.classList.add("light-button");
        this.btnDublicate.classList.add("light-button-withicon");
        this.btnDublicate.type = "button";
        this.btnDublicate.value = "Dublicate";
        this.options.appendChild(this.btnDublicate);

        this.btnReturned = document.createElement("input");
        this.btnReturned.style.backgroundImage = "url(res/retured.svgz)";
        this.btnReturned.classList.add("light-button");
        this.btnReturned.classList.add("light-button-withicon");
        this.btnReturned.type = "button";
        this.btnReturned.value = "Mark as returned";
        this.options.appendChild(this.btnReturned);

        this.btnDelete = document.createElement("input");
        this.btnDelete.style.backgroundImage = "url(res/delete.svgz)";
        this.btnDelete.classList.add("light-button");
        this.btnDelete.classList.add("light-button-withicon");
        this.btnDelete.type = "button";
        this.btnDelete.value = "Delete";
        this.options.appendChild(this.btnDelete);

        this.txtSearch.onchange =   () => this.GetNotes(false);
        this.dateFrom.onchange =    () => this.GetNotes(false);
        this.dateTo.onchange =      () => this.GetNotes(false);
        this.chkShort.onchange =    () => this.GetNotes(false);
        this.chkLong.onchange =     () => this.GetNotes(false);
        this.chkReturned.onchange = () => this.GetNotes(false);

        this.btnNew.onclick = () => this.New();
        this.btnPrint.onclick = () => this.Print();
        this.btnDublicate.onclick = () => this.Dublicate();
        this.btnReturned.onclick = () => this.Return();
        this.btnDelete.onclick = () => this.Delete();

        this.GetNotes(false);
        this.GetTemplates();
        this.AdjustButtons();

        setTimeout(() => { this.AfterResize(); }, 200);
    }

    AfterResize() { //override
        super.AfterResize();
        if (this.options.getBoundingClientRect().width < 550)
            this.options.classList.add("debit-options-collapsed");
        else
            this.options.classList.remove("debit-options-collapsed");
    }

    GetNotes(append = true) {
        this.args = {
            keywords: this.txtSearch.value,
            from: this.dateFrom.value,
            to: this.dateTo.value,
            short: this.chkShort.checked,
            long: this.chkLong.checked,
            returned: this.chkReturned.checked
        };

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                this.UpdateList(split, append, this.selected);
                this.selected = null;

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        let filters = "";
        filters += this.chkShort.checked ? "1" : "0";
        filters += this.chkLong.checked ? "1" : "0";
        filters += this.chkReturned.checked ? "1" : "0";

        if (append) {
            xhr.open("GET", `getdebitnotes&keywords=${this.txtSearch.value}&from=${this.dateFrom.value}&to=${this.dateTo.value}&filters=${filters}&last=${this.last}`, true);
            xhr.send();
        } else {
            xhr.open("GET", `getdebitnotes&keywords=${this.txtSearch.value}&from=${this.dateFrom.value}&to=${this.dateTo.value}&filters=${filters}&last=null`, true);
            xhr.send();
            this.preview.innerHTML = "";
            this.AdjustButtons();
        }
    }

    UpdateList(split, append = false, lastSelection = null) {
        if (!append) 
            this.list.innerHTML = "";

        let i = 0;
        while (i < split.length - 9) {
            let code = split[i++];
            let fn = split[i++];
            let ln = split[i++];
            let title = split[i++];
            let department = split[i++];
            let date = split[i++];
            let it = split[i++];
            let template = split[i++];
            let equip = split[i++];
            let status = split[i++];

            this.AddToList(code, fn, ln, title, department, date, it, template, equip, status, lastSelection);
        }
    }

    AddToList(code, fn, ln, title, department, date, it, template, equip, status, lastSelection) {
        const entry = document.createElement("div");
        entry.className = "debit-entry";
        this.list.appendChild(entry);

        const label = document.createElement("div");
        label.innerHTML = fn + " " + ln;
        entry.appendChild(label);

        if (status == "returned") {
            const lblRerurned = document.createElement("div");
            lblRerurned.innerHTML = "Re";
            entry.appendChild(lblRerurned);
        }

        entry.onclick = () => {
            if (this.lastselected) 
                this.lastselected.style.backgroundColor = "";

            entry.style.backgroundColor = "var(--select-color)";
            this.lastselected = entry;

            this.Preview(code, fn, ln, title, department, date, it, template, equip, status);
            setTimeout(() => {
                this.selected = [code, fn, ln, title, department, date, it, template, equip, status, entry];
                this.AdjustButtons();
            }, 0);
        };

        if (lastSelection && lastSelection[0] == code)
            entry.onclick();
    }

    Preview(code, fn, ln, title, department, date, it, template, equip, status) {
        this.preview.innerHTML = "";

        const page = document.createElement("div");
        page.style.backgroundColor = "rgb(224,224,224)";
        page.style.color = "rgb(32,32,32)";
        page.style.maxWidth = "800px";
        page.style.minHeight = "500px";
        page.style.padding = "8px 24px";
        page.style.fontFamily = "var(--global-font-family)";
        this.preview.appendChild(page);

        const underline_style = "rgb(32,32,32) solid 2px";

        const barcode = document.createElement("div");
        barcode.innerHTML = code;
        barcode.style.fontSize = "11px";
        barcode.style.textAlign = "right";
        page.appendChild(barcode);

        const grid = document.createElement("div");
        grid.style.margin = "12px 20px 20px 20px";
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "120px auto 120px auto";
        grid.style.gridTemplateRows = "96px 64px repeat(3, 40px)";
        grid.style.alignItems = "center";
        page.appendChild(grid);

        const divLogo = document.createElement("div");
        divLogo.style.gridArea = "1 / 1 / span 1 / span 4";
        divLogo.style.textAlign = "center";
        divLogo.style.maxHeight = "100px";
        grid.appendChild(divLogo);

        const imgLogo = document.createElement("img");
        imgLogo.src = "other/logo.svgz";
        divLogo.appendChild(imgLogo);

        const lblDebitNoteTitle = document.createElement("div");
        lblDebitNoteTitle.innerHTML = "Debit note";
        lblDebitNoteTitle.style.textAlign = "center";
        lblDebitNoteTitle.style.fontWeight = "bold";
        lblDebitNoteTitle.style.fontSize = "larger";
        lblDebitNoteTitle.style.gridArea = "2 / 1 / span 1 / span 4";
        grid.appendChild(lblDebitNoteTitle);

        const lblDateLabel = document.createElement("div");
        lblDateLabel.innerHTML = "Issued date:";
        lblDateLabel.style.gridArea = "3 / 1 / span 1 / span 1";
        lblDateLabel.style.fontWeight = "bold";
        grid.append(lblDateLabel);
        const lblDate = document.createElement("div");
        lblDate.innerHTML = date;
        lblDate.style.gridArea = "3 / 2 / span 1 / span 1";
        lblDate.style.borderBottom = underline_style;
        lblDate.style.marginRight = "20px";
        grid.append(lblDate);

        const lblFnLabel = document.createElement("div");
        lblFnLabel.innerHTML = "First name:";
        lblFnLabel.style.gridArea = "4 / 1 / span 1 / span 1";
        lblFnLabel.style.fontWeight = "bold";
        grid.append(lblFnLabel);
        const lblFn = document.createElement("div");
        lblFn.innerHTML = fn;
        lblFn.style.gridArea = "4 / 2 / span 1 / span 1";
        lblFn.style.borderBottom = underline_style;
        lblFn.style.marginRight = "20px";
        grid.append(lblFn);

        const lblLnLabel = document.createElement("div");
        lblLnLabel.innerHTML = "Last name:";
        lblLnLabel.style.gridArea = "4 / 3 / span 1 / span 1";
        lblLnLabel.style.fontWeight = "bold";
        grid.append(lblLnLabel);
        const lblLn = document.createElement("div");
        lblLn.innerHTML = ln;
        lblLn.style.gridArea = "4 / 4 / span 1 / span 1";
        lblLn.style.borderBottom = underline_style;
        lblLn.style.marginRight = "20px";
        grid.append(lblLn);

        const lblTitleLabel = document.createElement("div");
        lblTitleLabel.innerHTML = "Title:";
        lblTitleLabel.style.gridArea = "5 / 1 / span 1 / span 1";
        lblTitleLabel.style.fontWeight = "bold";
        grid.append(lblTitleLabel);
        const lblTitle = document.createElement("div");
        lblTitle.innerHTML = title;
        lblTitle.style.gridArea = "5 / 2 / span 1 / span 1";
        lblTitle.style.borderBottom = underline_style;
        lblTitle.style.marginRight = "20px";
        grid.append(lblTitle);

        const lblDepLabel = document.createElement("div");
        lblDepLabel.innerHTML = "Department:";
        lblDepLabel.style.gridArea = "5 / 3 / span 1 / span 1";
        lblDepLabel.style.fontWeight = "bold";
        grid.append(lblDepLabel);
        const lblDep = document.createElement("div");
        lblDep.innerHTML = department;
        lblDep.style.gridArea = "5 / 4 / span 1 / span 1";
        lblDep.style.borderBottom = underline_style;
        lblDep.style.marginRight = "20px";
        grid.append(lblDep);

        for (let i = 1; i < grid.childNodes.length; i++) {
            grid.childNodes[i].style.padding = "0 8px";
            grid.childNodes[i].style.maxHeight = "44px";
            grid.childNodes[i].style.overflow = "hidden";
            grid.childNodes[i].style.textOverflow = "ellipsis";
        }


        if (status == "returned") {
            const divReturned = document.createElement("div");
            divReturned.style.textAlign = "center";
            page.appendChild(divReturned);

            const lblReturned = document.createElement("div");
            lblReturned.innerHTML = "Returned";
            lblReturned.style.display = "inline-block";
            lblReturned.style.fontSize = "16px";
            lblReturned.style.fontWeight = "800";
            lblReturned.style.color = "red";
            lblReturned.style.padding = "2px";
            lblReturned.style.border = "red 2px solid";
            lblReturned.style.borderRadius = "4px";
            lblReturned.style.transform = "rotate(-20deg) scale(3)";
            lblReturned.style.mixBlendMode = "multiply";
            lblReturned.style.animation = "stamped .2s 1";
            divReturned.appendChild(lblReturned);
        }


        const tableEquip = document.createElement("table");
        tableEquip.style.margin = "40px 20px";
        tableEquip.style.paddingRight = "40px";
        tableEquip.style.width = "100%";
        tableEquip.style.color = "rgb(32,32,32)";
        page.append(tableEquip);

        const eq_Header = document.createElement("tr");
        tableEquip.appendChild(eq_Header);

        const eq_h_descr = document.createElement("th");
        eq_h_descr.style.minWidth = "40px";
        eq_h_descr.style.border = "1px solid black";
        eq_h_descr.innerHTML = "Description";
        eq_Header.appendChild(eq_h_descr);

        const eq_h_quant = document.createElement("th");
        eq_h_quant.style.minWidth = "40px";
        eq_h_quant.style.border = "1px solid black";
        eq_h_quant.innerHTML = "Quantity";
        eq_Header.appendChild(eq_h_quant);

        const eq_h_serial = document.createElement("th");
        eq_h_serial.style.minWidth = "40px";
        eq_h_serial.style.border = "1px solid black";
        eq_h_serial.innerHTML = "Serial number";
        eq_Header.appendChild(eq_h_serial);

        let eq_split = equip.split(";");
        for (let i = 0; i < eq_split.length - 1; i += 3) {
            const row = document.createElement("tr");
            tableEquip.appendChild(row);

            const eq_name = document.createElement("td");
            eq_name.style.border = "1px solid black";
            eq_name.innerHTML = eq_split[i];
            row.appendChild(eq_name);

            const eq_quan = document.createElement("td");
            eq_quan.style.border = "1px solid black";
            eq_quan.innerHTML = eq_split[i + 1];
            row.appendChild(eq_quan);

            const eq_seri = document.createElement("td");
            eq_seri.style.border = "1px solid black";
            eq_seri.innerHTML = eq_split[i + 2];
            row.appendChild(eq_seri);
        }

        const divTemplate = document.createElement("div");
        divTemplate.style.margin = "40px 20px";
        divTemplate.innerHTML = template;
        page.append(divTemplate);


        const divSignature = document.createElement("div");
        divSignature.style.margin = "20px";
        divSignature.style.display = "grid";
        divSignature.style.gridAutoColumns = "240px auto 240px";
        divSignature.style.gridTemplateRows = "28px 28px 80px";
        divSignature.style.textAlign = "center";
        divSignature.style.padding = "40px";
        page.appendChild(divSignature);

        const lblBehalfOfIt = document.createElement("div");
        lblBehalfOfIt.innerHTML = "Issued by";
        lblBehalfOfIt.gridArea = "1 / 1";
        divSignature.appendChild(lblBehalfOfIt);

        const lblBehalfOfEmployee = document.createElement("div");
        lblBehalfOfEmployee.innerHTML = "Employee <i>(or behalf of)</i>";
        lblBehalfOfEmployee.style.gridArea = "1 / 3";
        divSignature.appendChild(lblBehalfOfEmployee);

        const lblItName = document.createElement("div");
        lblItName.innerHTML = it;
        lblItName.style.gridArea = "2 / 1";
        divSignature.appendChild(lblItName);

        const lblEmployeeName = document.createElement("div");
        lblEmployeeName.innerHTML = fn + " " + ln;
        lblEmployeeName.style.gridArea = "2 / 3";
        divSignature.appendChild(lblEmployeeName);

        const lblItSign = document.createElement("div");
        lblItSign.style.gridArea = "3 / 1";
        lblItSign.style.borderBottom = "black solid 2px";
        divSignature.appendChild(lblItSign);

        const lblEmployeeSign = document.createElement("div");
        lblEmployeeSign.style.gridArea = "3 / 3";
        lblEmployeeSign.style.borderBottom = "black solid 2px";
        divSignature.appendChild(lblEmployeeSign);
    }

    AdjustButtons() {
        if (this.btnPrint.hasAttribute("disabled")) this.btnPrint.removeAttribute("disabled");
        if (this.btnDublicate.hasAttribute("disabled")) this.btnDublicate.removeAttribute("disabled");
        if (this.btnReturned.hasAttribute("disabled")) this.btnReturned.removeAttribute("disabled");
        if (this.btnDelete.hasAttribute("disabled")) this.btnDelete.removeAttribute("disabled");

        if (this.preview.innerHTML === "") {
            this.btnPrint.setAttribute("disabled", true);
            this.btnDublicate.setAttribute("disabled", true);
            this.btnReturned.setAttribute("disabled", true);
            this.btnDelete.setAttribute("disabled", true);

        } else if (this.selected && this.selected[9] === "returned") {
            this.btnReturned.setAttribute("disabled", true);
            this.btnDelete.setAttribute("disabled", true);
        }
    }

    GetTemplates() {
        if (DEBIT_TEMPLATES.length != 0) return;

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length > 1)
                    for (let i = 0; i < split.length - 1; i += 2)
                        DEBIT_TEMPLATES.push([split[i], split[i + 1]]);

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "getdebitnotestemplate", true);
        xhr.send();
    }

    GenerateEquipAutoComplete(force = false) {
        if (DEBIT_EQUIP_AUTOFILL != null && !force) return;

        DEBIT_EQUIP_AUTOFILL = document.createElement("datalist");
        DEBIT_EQUIP_AUTOFILL.id = "DEBIT_EQUIP_AUTOFILL";
        DEBIT_EQUIP_AUTOFILL.style.display = "none";

        for (let i = 0; i < db_equip.length; i++) {
            let type = (db_equip[i]["TYPE"] == undefined) ? "" : db_equip[i]["TYPE"][0];
            if (type.length == 0) continue;

            let manufacturer = (db_equip[i]["MANUFACTURER"] == undefined) ? "" : db_equip[i]["MANUFACTURER"][0];
            let model = (db_equip[i]["MODEL"] == undefined) ? "" : db_equip[i]["MODEL"][0];
            if (manufacturer.length == 0 && model.length == 0) continue;

            let description = (manufacturer + " " + type + ((model.length > 0) ? " - " + model : " ")).trim();
            let serialno = (db_equip[i]["SERIAL NUMBER"] == undefined) ? "" : db_equip[i]["SERIAL NUMBER"][0];

            if (!DEBIT_EQUIP_AUTOFILL_SERIAL.hasOwnProperty(description)) {
                const option = document.createElement("option");
                option.value = description;
                DEBIT_EQUIP_AUTOFILL.appendChild(option);

                DEBIT_EQUIP_AUTOFILL_SERIAL[description] = [];
            }

            if (!DEBIT_EQUIP_AUTOFILL_SERIAL[description].includes(serialno))
                DEBIT_EQUIP_AUTOFILL_SERIAL[description].push(serialno);
        }

        this.content.appendChild(DEBIT_EQUIP_AUTOFILL);
    }

    New() {
        const dialog = this.DialogBox("100%");
        if (dialog === null) return;

        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;
        const buttonBox = dialog.buttonBox;
        const innerBox = dialog.innerBox;

        this.GenerateEquipAutoComplete(false);

        innerBox.parentNode.style.left = "2px";
        innerBox.parentNode.style.right = "2px";
        innerBox.parentNode.style.borderRadius= "0";

        const grid = document.createElement("div");
        grid.className = "debit-create-dialog";
        innerBox.appendChild(grid);

        btnOK.value = "Create";
        innerBox.parentElement.style.width = "calc(100% - 4px)";
        innerBox.parentElement.style.maxWidth = "calc(100% - 4px)";

        const lblFirstName = document.createElement("div");
        lblFirstName.innerHTML = "First name:";
        lblFirstName.style.gridArea = "1 / 1 / span 1 / span 1";
        grid.appendChild(lblFirstName);
        const txtFirstName = document.createElement("input");
        txtFirstName.type = "text";
        txtFirstName.style.gridArea = "1 / 2 / span 1 / span 1";
        grid.appendChild(txtFirstName);

        const lblLastName = document.createElement("div");
        lblLastName.innerHTML = "Last name:";
        lblLastName.style.gridArea = "2 / 1 / span 1 / span 1";
        grid.appendChild(lblLastName);
        const txtLastName = document.createElement("input");
        txtLastName.type = "text";
        txtLastName.style.gridArea = "2 / 2 / span 1 / span 1";
        grid.appendChild(txtLastName);

        const lblTitle = document.createElement("div");
        lblTitle.innerHTML = "Title:";
        lblTitle.style.gridArea = "3 / 1 / span 1 / span 1";
        grid.appendChild(lblTitle);
        const txtTitle = document.createElement("input");
        txtTitle.type = "text";
        txtTitle.style.gridArea = "3 / 2 / span 1 / span 1";
        grid.appendChild(txtTitle);

        const lblDep = document.createElement("div");
        lblDep.innerHTML = "Department:";
        lblDep.style.gridArea = "4 / 1 / span 1 / span 1";
        grid.appendChild(lblDep);
        const txtDep = document.createElement("input");
        txtDep.type = "text";
        txtDep.style.gridArea = "4 / 2 / span 1 / span 1";
        grid.appendChild(txtDep);

        const btnFindUser = document.createElement("input");
        btnFindUser.type = "button";
        btnFindUser.value = "Find...";
        btnFindUser.style.gridArea = "4 / 3 / span 1 / span 1";
        btnFindUser.style.maxWidth = "72px";
        grid.appendChild(btnFindUser);

        const lblDateL = document.createElement("div");
        lblDateL.innerHTML = "Issued date:";
        lblDateL.style.gridArea = "1 / 4 / span 1 / span 1";
        grid.appendChild(lblDateL);
        let now = new Date();
        const lblDateV = document.createElement("div");
        lblDateV.innerHTML = now.getDate() + "-" + (1 + now.getMonth()) + "-" + now.getFullYear();
        lblDateV.style.gridArea = "1 / 5 / span 1 / span 1";
        grid.appendChild(lblDateV);

        const lblBehalfOfIT = document.createElement("div");
        lblBehalfOfIT.innerHTML = "Issued by:";
        lblBehalfOfIT.style.gridArea = "2 / 4 / span 1 / span 1";
        grid.appendChild(lblBehalfOfIT);
        const txtBehalfOfIT = document.createElement("input");
        txtBehalfOfIT.type = "text";
        txtBehalfOfIT.style.gridArea = "2 / 5 / span 1 / span 1";
        grid.appendChild(txtBehalfOfIT);

        const lblTemplate = document.createElement("div");
        lblTemplate.innerHTML = "Template:";
        lblTemplate.style.gridArea = "3 / 4 / span 1 / span 1";
        grid.appendChild(lblTemplate);
        const txtTemplate = document.createElement("select");
        txtTemplate.style.gridArea = "3 / 5 / span 1 / span 1";
        grid.appendChild(txtTemplate);

        const lblTemplatePreview = document.createElement("div");
        lblTemplatePreview.style.gridArea = "3 / 6 / span 1 / span 2";
        lblTemplatePreview.style.overflow = "hidden";
        lblTemplatePreview.style.textOverflow = "ellipsis";
        lblTemplatePreview.style.fontSize = "10px";
        lblTemplatePreview.style.paddingTop = "8px";
        lblTemplatePreview.style.paddingLeft = "8px";
        lblTemplatePreview.style.maxWidth = "400px";
        lblTemplatePreview.style.maxHeight = "150px";
        lblTemplatePreview.style.visibility = "hidden";
        lblTemplatePreview.style.transition = ".2s";
        grid.appendChild(lblTemplatePreview);

        const lblType = document.createElement("div");
        lblType.innerHTML = "Short-term:";
        lblType.style.gridArea = "4 / 4 / span 1 / span 1";
        grid.appendChild(lblType);
        const divType = document.createElement("div");
        divType.style.gridArea = "4 / 5 / span 1 / span 1";
        grid.appendChild(divType);
        const chkType = document.createElement("input");
        chkType.type = "checkbox";
        divType.appendChild(chkType);
        this.AddCheckBoxLabel(divType, chkType, "&nbsp;");

        for (let i = 0; i < DEBIT_TEMPLATES.length; i++) {
            let newOption = document.createElement("option");
            newOption.value = i;
            newOption.innerHTML = DEBIT_TEMPLATES[i][0];
            txtTemplate.appendChild(newOption);
            if (i == 0) {
                txtTemplate.value = "0";
                lblTemplatePreview.innerHTML = DEBIT_TEMPLATES[i][1];
            }
        }

        txtTemplate.onchange = () => {
            lblTemplatePreview.innerHTML = DEBIT_TEMPLATES[txtTemplate.value][1];
        };

        txtTemplate.onfocus = txtTemplate.onmouseenter = () => {
            lblTemplatePreview.style.visibility = "visible";
            lblTemplatePreview.style.opacity = "1";
        };
        txtTemplate.onblur = txtTemplate.onmouseleave = () => {
            lblTemplatePreview.style.visibility = "hidden";
            lblTemplatePreview.style.opacity = "0";
        };

        const btnAddEquip = document.createElement("input");
        btnAddEquip.type = "button";
        btnAddEquip.value = "Add";
        btnAddEquip.style.gridArea = "6 / 2 / span 1 / span 1";
        btnAddEquip.style.maxWidth = "72px";
        btnAddEquip.style.margin = "0 40px";
        innerBox.appendChild(btnAddEquip);

        const lstEquip = document.createElement("div");
        lstEquip.className = "debit-equip-list";
        innerBox.appendChild(lstEquip);

        const AddEquip = () => {
            const newEntry = document.createElement("div");
            newEntry.className = "debit-equip-entry";
            lstEquip.appendChild(newEntry);

            const txtDescription = document.createElement("input");
            txtDescription.type = "text";
            txtDescription.placeholder = "Description";
            txtDescription.setAttribute("list", "DEBIT_EQUIP_AUTOFILL");
            newEntry.appendChild(txtDescription);

            const txtQuantity = document.createElement("input");
            txtQuantity.type = "number";
            txtQuantity.min = 1;
            txtQuantity.max = 9999;
            txtQuantity.value = 1;
            newEntry.appendChild(txtQuantity);

            const txtSerialNo = document.createElement("input");
            txtSerialNo.type = "text";
            txtSerialNo.placeholder = "Serial number";
            newEntry.appendChild(txtSerialNo);

            const btnRemove = document.createElement("div");
            newEntry.appendChild(btnRemove);

            let id = "i" + new Date().getTime();
            const datalist = document.createElement("datalist");
            datalist.id = id;
            newEntry.appendChild(datalist);
            txtSerialNo.setAttribute("list", id);

            txtDescription.onchange =
                txtDescription.oninput = () => {
                    if (DEBIT_EQUIP_AUTOFILL_SERIAL.hasOwnProperty(txtDescription.value))
                        if (DEBIT_EQUIP_AUTOFILL_SERIAL[txtDescription.value].length == 1) {
                            txtSerialNo.value = DEBIT_EQUIP_AUTOFILL_SERIAL[txtDescription.value][0];

                        } else {
                            if (!DEBIT_EQUIP_AUTOFILL_SERIAL[txtDescription.value].includes(txtSerialNo.value)) txtSerialNo.value = "";
                            while (datalist.firstChild != null)
                                datalist.removeChild(datalist.firstChild);

                            for (let i = 0; i < DEBIT_EQUIP_AUTOFILL_SERIAL[txtDescription.value].length; i++) {
                                let option = document.createElement("option");
                                option.value = DEBIT_EQUIP_AUTOFILL_SERIAL[txtDescription.value][i];
                                datalist.appendChild(option);
                            }
                        }
                };

            btnRemove.onclick = () => { lstEquip.removeChild(newEntry); };

            return [txtDescription, txtQuantity, txtSerialNo];
        };

        btnFindUser.onclick = () => {
            const container = document.createElement("div");
            container.style.position = "absolute";
            container.style.left = "0";
            container.style.right = "0";
            container.style.top = "0";
            container.style.bottom = "0";
            container.style.zIndex = "4";
            container.style.backgroundColor = "rgba(32,32,32,.66)";
            innerBox.style.filter = "blur(2px)";
            innerBox.parentElement.appendChild(container);

            const dialog = document.createElement("div");
            dialog.style.backgroundColor = "rgb(203,203,203)";
            dialog.style.position = "absolute";
            dialog.style.top = dialog.style.bottom = "32px";
            dialog.style.left = dialog.style.right = "96px";
            dialog.style.borderRadius = "8px";
            dialog.style.padding = "8px";
            dialog.style.boxShadow = "rgba(0,0,0,.4) 0 12px 16px";
            dialog.style.overflow = "hidden";
            container.appendChild(dialog);

            //const pnlFilter = this.document.createElement("div");
            //dialog.appendChild(pnlFilter);

            const txtFind = document.createElement("input");
            txtFind.type = "text";
            txtFind.placeholder = "Search";
            dialog.appendChild(txtFind);

            const divUsers = document.createElement("div");
            divUsers.className = "no-results";
            divUsers.style.position = "absolute";
            divUsers.style.left = divUsers.style.right = "0";
            divUsers.style.top = divUsers.style.bottom = "48px";
            divUsers.style.overflowY = "auto";
            dialog.appendChild(divUsers);

            const pnlButtons = document.createElement("div");
            pnlButtons.style.bottom = "8px";
            pnlButtons.style.width = "100%";
            pnlButtons.style.heigth = "40px";
            pnlButtons.style.position = "absolute";
            pnlButtons.style.textAlign = "center";
            dialog.appendChild(pnlButtons);

            const btnCancel = document.createElement("input");
            btnCancel.type = "button";
            btnCancel.value = "Cancel";
            btnCancel.style.bottom = "8px";
            pnlButtons.appendChild(btnCancel);

            txtFind.onchange =
            txtFind.oninput = () => {
                    divUsers.innerHTML = "";

                let keywords = [];
                if (txtFind.value.trim().length > 0)
                    keywords = txtFind.value.trim().toLowerCase().split(" ");

                let USER_LIST_ORDER;
                if (localStorage.getItem("columns_users"))
                    USER_LIST_ORDER = JSON.parse(localStorage.getItem("columns_users"));
                else
                    USER_LIST_ORDER = ["TITLE", "DEPARTMENT", "FIRST NAME", "LAST NAME", "USERNAME", "E-MAIL", "TELEPHONE NUMBER", "MOBILE NUMBER"];

                for (let i = 0; i < db_users.length; i++) {
                    let match = true;

                    for (let j = 0; j < keywords.length; j++) {
                        let flag = false;
                        for (let k in db_users[i]) {
                            if (k.startsWith(".")) continue;
                            if (db_users[i][k][0].toLowerCase().indexOf(keywords[j]) > -1)
                                flag = true;
                        }
                        if (!flag) {
                            match = false;
                            continue;
                        }
                    }

                    if (!match) continue;

                    let firstname = (db_users[i].hasOwnProperty("FIRST NAME")) ? db_users[i]["FIRST NAME"][0] : "";
                    let lastname = (db_users[i].hasOwnProperty("LAST NAME")) ? db_users[i]["LAST NAME"][0] : "";
                    if (firstname.length == 0 || lastname.length == 0) continue;

                    let title = (db_users[i].hasOwnProperty("TITLE")) ? db_users[i]["TITLE"][0] : "";
                    let department = (db_users[i].hasOwnProperty("DEPARTMENT")) ? db_users[i]["DEPARTMENT"][0] : "";

                    const element = document.createElement("div");
                    element.className = "lst-obj-ele";
                    this.content.appendChild(element);

                    const icon = document.createElement("div");
                    icon.className = "lst-obj-ico";
                    icon.style.backgroundImage = "url(res/user.svgz)";
                    element.appendChild(icon);

                    for (let j = 0; j < 6; j++) {
                        if (!db_users[i].hasOwnProperty(USER_LIST_ORDER[j])) continue;

                        const newLabel = document.createElement("div");
                        newLabel.innerHTML = db_users[i][USER_LIST_ORDER[j]][0];
                        newLabel.className = "lst-obj-lbl-" + j;
                        element.appendChild(newLabel);
                    }

                    element.ondblclick = () => {
                        txtFirstName.value = firstname;
                        txtLastName.value = lastname;
                        txtTitle.value = title;
                        txtDep.value = department;

                        btnCancel.onclick();
                    };

                    divUsers.appendChild(element);
                }
            };

            btnCancel.onclick = () => {
                innerBox.style.filter = "none";
                innerBox.parentElement.removeChild(container);
            };

            txtFind.focus();
            txtFind.onchange();
        };

        btnAddEquip.onclick = () => {
            AddEquip();
        };

        btnOK.addEventListener("click", () => {
            let eq_string = "";
            for (let i = 0; i < lstEquip.childNodes.length; i++)
                for (let j = 0; j < 3; j++) {
                    while (lstEquip.childNodes[i].childNodes[0].value.indexOf(";") > -1)
                        lstEquip.childNodes[i].childNodes[j].value = lstEquip.childNodes[i].childNodes[j].value.replace(";", "");
                    eq_string += lstEquip.childNodes[i].childNodes[j].value + ";";
                }

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    if (xhr.response != "failed")
                        this.GetNotes(false);

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            let data = "";
            data += "fn=" +  txtFirstName.value;
            data += "&ln=" + txtLastName.value;
            data += "&tl=" + txtTitle.value;
            data += "&dp=" + txtDep.value;
            data += "&it=" + txtBehalfOfIT.value;
            data += "&tt=" + txtTemplate.value;
            data += "&eq=" + eq_string;
            data += "&sh=" + chkType.checked.toString().toLowerCase();

            xhr.open("POST", "createdebitnote", true);
            xhr.send(data);
        });

        return {
            txtFirstName: txtFirstName,
            txtLastName: txtLastName,
            txtTitle: txtTitle,
            txtDep: txtDep,
            txtBehalfOfIT: txtBehalfOfIT,
            txtTemplate: txtTemplate,
            chkType: chkType,
            lstEquip: lstEquip,
            AddEquip: AddEquip
        };
    }

    Print() {
        if (this.preview.innerHTML == "") return;

        const newPrintWin = window.open();
        newPrintWin.document.write("<html><body>" + this.preview.innerHTML + "</body></html>");
        newPrintWin.document.title = "Debit note";
        newPrintWin.document.body.childNodes[0].style.backgroundColor = "white";
        newPrintWin.onload = () => { newPrintWin.print(); };
        newPrintWin.document.close();
        setTimeout(() => { newPrintWin.close(); }, 50);
    }

    Return() {
        if (this.preview.innerHTML == "") return;
        if (this.selected == null) return;
        if (this.selected[9] == "returned") return;

        this.ConfirmBox("Are you sure you want to mark this debit note as returned?").addEventListener("click", () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {

                    if (xhr.responseText == "ok")
                        this.GetNotes(false);
                    else
                        this.ConfirmBox(xhr.responseText , true);

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("GET", `markdebit&code=${this.selected[0]}&type=${this.selected[9]}`, true);
            xhr.send();
        });
    }

    Dublicate() {
        if (this.preview.innerHTML == "") return;
        if (this.selected == null) return;

        const obj = this.New();
        const txtFirstName = obj.txtFirstName;
        const txtLastName = obj.txtLastName;
        const txtTitle = obj.txtTitle;
        const txtDep = obj.txtDep;
        const txtBehalfOfIT = obj.txtBehalfOfIT;
        const txtTemplate = obj.txtTemplate;
        const chkType = obj.chkType;
        const lstEquip = obj.lstEquip;
        const AddEquip = obj.AddEquip;

        txtFirstName.value = this.selected[1];
        txtLastName.value = this.selected[2];
        txtTitle.value = this.selected[3];
        txtDep.value = this.selected[4];
        txtBehalfOfIT.value = this.selected[6];
        chkType.checked = this.selected[9] == "short";

        const equip = this.selected[8].split(";");
        for (let i = 0; i < equip.length-1; i+=3) {
            const e = AddEquip();
            e[0].value = equip[i];
            e[1].value = equip[i+1];
            e[2].value = equip[i+2];
        }
    }

    Delete() {
        if (this.preview.innerHTML == "") return;
        if (this.selected == null) return;
        if (this.selected[9] == "returned") {
            this.ConfirmBox("You are not allowed to delete a debit note that is marked as \"returned\"", true);
            return;
        }

        this.ConfirmBox("Are you sure you want to delete this debit note?").addEventListener("click", () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {

                    if (xhr.responseText == "ok") {
                        this.list.removeChild(this.selected[10]);
                        this.preview.innerHTML = "";
                        this.AdjustButtons();
                    } else {
                        this.ConfirmBox(xhr.responseText, true);
                    }

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("GET", `deldebit&code=${this.selected[0]}&type=${this.selected[9]}`, true);
            xhr.send();
        });
    }
}