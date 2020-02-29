var DEBITNOTE_EQUIP_AUTOFILL = null;
var DEBITNOTE_EQUIP_AUTOFILL_SERIAL = {};
var DEBITNOTE_TEMPLATES = [];

class DebitNotes extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='debitnotes.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "debitnotes.css";
            document.head.appendChild(csslink);
        }

        if (document.head.querySelectorAll("link[href$='equiplist.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "equiplist.css";
            document.head.appendChild(csslink);
        }

        super();

        this.setTitle("Debit notes");
        this.setIcon("res/charges.svgz");

        this.current = null;

        this.btnAdd = document.createElement("div");
        this.btnAdd.innerHTML = "Add";
        this.btnAdd.style.color = "#C0C0C0";
        this.btnAdd.style.backgroundImage = "url(res/l_new.svgz)";
        this.btnAdd.style.backgroundSize = "20px";
        this.btnAdd.style.backgroundPosition = "0 1px";
        this.btnAdd.style.width = "auto";
        this.btnAdd.style.padding = "0 2px 0 22px";
        this.btnAdd.style.marginTop = "1px";
        this.toolbox.appendChild(this.btnAdd);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        this.panel1 = document.createElement("div");
        this.panel1.className = "debit-note-panel1";
        this.content.appendChild(this.panel1);

        this.panel2 = document.createElement("div");
        this.panel2 = document.createElement("div");
        this.panel2.className = "no-results debit-note-panel2";
        this.content.appendChild(this.panel2);

        this.panel3 = document.createElement("div");
        this.panel3.className = "debit-note-panel3";
        this.content.appendChild(this.panel3);

        this.content.style.overflow = "hidden";
        this.content.style.display = "grid";
        this.content.style.gridTemplateColumns = "300px 300px auto";
        //this.content.style.gridTemplateRows = "342px auto";


        this.txtFilter = document.createElement("input");
        this.txtFilter.type = "text";
        this.txtFilter.placeholder = "Search";
        this.txtFilter.className = "";
        this.txtFilter.style.width = "80%";
        this.txtFilter.style.marginTop = "8px";
        this.panel1.appendChild(this.txtFilter);

        this.btnShowAll = document.createElement("input");
        this.btnShowAll.type = "button";
        this.btnShowAll.value = "All";
        this.panel1.appendChild(this.btnShowAll);

        this.btnShowPending = document.createElement("input");
        this.btnShowPending.type = "button";
        this.btnShowPending.value = "Pending";
        this.panel1.appendChild(this.btnShowPending);

        this.calendar = document.createElement("div");
        this.calendar.style.marginLeft = "25px";
        this.calendar.style.marginTop = "16px";
        this.panel1.appendChild(this.calendar);
        this.objCalendar = new Calendar();
        this.objCalendar.Attach(this.calendar);


        this.btnAdd.onclick =()=> { this.AddNew(); };

        let lastFilter = "";
        this.txtFilter.onchange = () => {
            if (lastFilter == this.txtFilter.value) return;

            if (this.objCalendar.selected == null)
                this.FilterAll();
            else
                this.FilterDate();

            lastFilter = this.txtFilter.value;
        };

        this.txtFilter.onkeydown = event => {
            if (event.keyCode == 13)  //enter
                this.txtFilter.onchange();
        };

        this.objCalendar.onchange =()=> { //override
            this.FilterDate();
        };

        this.btnShowAll.onclick = ()=> { this.FilterAll(); };
        this.btnShowPending.onclick = ()=> { this.FilterPending(); };

        this.list = [];

        this.AfterResize();
        this.FilterPending();

        this.GetTemplates();
    }

    AddToList(code, fn, ln, title, department, date, it, template, equip, returned) {
        let entry = document.createElement("div");
        entry.className = "debit-note-entry";
        this.panel2.appendChild(entry);

        let label = document.createElement("div");
        label.innerHTML = fn + " " + ln;
        entry.appendChild(label);

        let optPrint = document.createElement("div");
        optPrint.className = "debit-note-entry-opt";
        entry.appendChild(optPrint);

        let optReturn = document.createElement("div");
        optReturn.className = "debit-note-entry-opt";
        if (returned) optReturn.style.opacity = ".25";
        entry.appendChild(optReturn);

        let optDelete = document.createElement("div");
        optDelete.className = "debit-note-entry-opt";
        if (returned) optDelete.style.opacity = ".25";
        entry.appendChild(optDelete);

        entry.onclick = () => {
            if (this.current) this.current.style.backgroundColor = "rgba(0,0,0,0)";
            this.current = entry;
            entry.style.backgroundColor = "var(--select-color)";

            this.Preview(code, fn, ln, title, department, date, it, template, equip, returned);
        };

        optPrint.title = "Print";
        optPrint.onclick = event => {
            event.stopPropagation();
            entry.onclick();

            let newPrintWin = window.open();
            newPrintWin.document.write("<html><body>" + this.panel3.innerHTML + "</body></html>");
            newPrintWin.document.title = "Debit note";
            newPrintWin.document.body.childNodes[0].style.backgroundColor = "white";
            newPrintWin.onload = () => { newPrintWin.print(); };
            newPrintWin.document.close();
            setTimeout(() => { newPrintWin.close(); }, 50);
        };

        if (!returned) {
            optDelete.title = "Delete";
            optDelete.onclick = event => {
                event.stopPropagation();
                this.ConfirmBox("Are you sure you want to delete this debit note?").addEventListener("click", () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200) {
                            this.panel2.removeChild(entry);
                            this.panel3.innerHTML = "";

                        } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                            this.ConfirmBox("Server is unavailable.", true);
                    };

                    xhr.open("GET", "deldebitnote&" + code, true);
                    xhr.send();
                });
            };

            optReturn.title = "Mark as returned";
            optReturn.onclick = event => {
                event.stopPropagation();
                this.ConfirmBox("Are you sure you want to mark this debit note as returned?").addEventListener("click", () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200) {
                            if (xhr.responseText != "failed") {
                                code = xhr.responseText;
                                returned = true;
                                entry.onclick();

                                optReturn.style.opacity = ".25";
                                optDelete.style.opacity = ".25";

                                optReturn.onclick = null;
                                optDelete.onclick = null;

                                let lblRerurned = document.createElement("div");
                                lblRerurned.innerHTML = "Re";
                                entry.appendChild(lblRerurned);

                            } else {
                                this.ConfirmBox("Failed to check debit note.", true);
                            }
                        } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                            this.ConfirmBox("Server is unavailable.", true);
                    };

                    xhr.open("GET", "markdebitnote&" + code, true);
                    xhr.send();
                });
            };
        }

        if (returned) {
            let lblRerurned = document.createElement("div");
            lblRerurned.innerHTML = "Re";
            entry.appendChild(lblRerurned);
        }
    }

    Preview(code, fn, ln, title, department, date, it, template, equip, returned) {
        this.panel3.innerHTML = "";

        let page = document.createElement("div");
        page.style.backgroundColor = "rgb(224,224,224)";
        page.style.color = "rgb(32,32,32)";
        page.style.maxWidth = "800px";
        page.style.minHeight = "500px";
        page.style.padding = "8px 24px";
        //font-family: var(--global-font-family);
        page.style.fontFamily = "Segoe UI";
        this.panel3.appendChild(page);

        let underline_style = "rgb(32,32,32) solid 2px";

        let barcode = document.createElement("div");
        barcode.innerHTML = code;
        barcode.style.fontSize = "11px";
        barcode.style.textAlign = "right";
        page.appendChild(barcode);
        
        let grid = document.createElement("div");
        grid.style.margin = "12px 20px 20px 20px";
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "120px auto 120px auto";
        grid.style.gridTemplateRows = "96px 64px repeat(3, 40px)";
        grid.style.alignItems = "center";
        page.appendChild(grid);

        let divLogo = document.createElement("div");
        divLogo.style.gridArea = "1 / 1 / span 1 / span 4";
        divLogo.style.textAlign = "center";
        divLogo.style.maxHeight = "100px";
        grid.appendChild(divLogo);

        let imgLogo = document.createElement("img");
        imgLogo.src = "other/logo.svgz";
        divLogo.appendChild(imgLogo);

        let lblDebitNoteTitle = document.createElement("div");
        lblDebitNoteTitle.innerHTML = "Debit note";
        lblDebitNoteTitle.style.textAlign = "center";
        lblDebitNoteTitle.style.fontWeight = "bold";
        lblDebitNoteTitle.style.fontSize = "larger";
        lblDebitNoteTitle.style.gridArea = "2 / 1 / span 1 / span 4";
        grid.appendChild(lblDebitNoteTitle);

        let lblDateLabel = document.createElement("div");
        lblDateLabel.innerHTML = "Date:";
        lblDateLabel.style.gridArea = "3 / 1 / span 1 / span 1";
        lblDateLabel.style.fontWeight = "bold";
        grid.append(lblDateLabel);
        let lblDate = document.createElement("div");
        lblDate.innerHTML = date;
        lblDate.style.gridArea = "3 / 2 / span 1 / span 1";
        lblDate.style.borderBottom = underline_style;
        lblDate.style.marginRight = "20px";
        grid.append(lblDate);

        let lblFnLabel = document.createElement("div");
        lblFnLabel.innerHTML = "Firstname:";
        lblFnLabel.style.gridArea = "4 / 1 / span 1 / span 1";
        lblFnLabel.style.fontWeight = "bold";
        grid.append(lblFnLabel);
        let lblFn = document.createElement("div");
        lblFn.innerHTML = fn;
        lblFn.style.gridArea = "4 / 2 / span 1 / span 1";
        lblFn.style.borderBottom = underline_style;
        lblFn.style.marginRight = "20px";
        grid.append(lblFn);

        let lblLnLabel = document.createElement("div");
        lblLnLabel.innerHTML = "Lastname:";
        lblLnLabel.style.gridArea = "4 / 3 / span 1 / span 1";
        lblLnLabel.style.fontWeight = "bold";
        grid.append(lblLnLabel);
        let lblLn = document.createElement("div");
        lblLn.innerHTML = ln;
        lblLn.style.gridArea = "4 / 4 / span 1 / span 1";
        lblLn.style.borderBottom = underline_style;
        lblLn.style.marginRight = "20px";
        grid.append(lblLn);

        let lblTitleLabel = document.createElement("div");
        lblTitleLabel.innerHTML = "Title:";
        lblTitleLabel.style.gridArea = "5 / 1 / span 1 / span 1";
        lblTitleLabel.style.fontWeight = "bold";
        grid.append(lblTitleLabel);
        let lblTitle = document.createElement("div");
        lblTitle.innerHTML = title;
        lblTitle.style.gridArea = "5 / 2 / span 1 / span 1";
        lblTitle.style.borderBottom = underline_style;
        lblTitle.style.marginRight = "20px";
        grid.append(lblTitle);

        let lblDepLabel = document.createElement("div");
        lblDepLabel.innerHTML = "Department:";
        lblDepLabel.style.gridArea = "5 / 3 / span 1 / span 1";
        lblDepLabel.style.fontWeight = "bold";
        grid.append(lblDepLabel);
        let lblDep = document.createElement("div");
        lblDep.innerHTML = department;
        lblDep.style.gridArea = "5 / 4 / span 1 / span 1";
        lblDep.style.borderBottom = underline_style;
        lblDep.style.marginRight = "20px";
        grid.append(lblDep);

        for (let i=1; i<grid.childNodes.length; i++) {
            grid.childNodes[i].style.padding = "0 8px";
            grid.childNodes[i].style.maxHeight = "44px";
            grid.childNodes[i].style.overflow = "hidden";
            grid.childNodes[i].style.textOverflow = "ellipsis";
        }


        if (returned) {
            let divReturned = document.createElement("div");
            divReturned.style.textAlign = "center";
            page.appendChild(divReturned);

            let lblReturned = document.createElement("div");
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
            divReturned.appendChild(lblReturned);
        }


        let tableEquip = document.createElement("table");
        tableEquip.style.margin = "40px 20px";
        tableEquip.style.paddingRight = "40px";
        tableEquip.style.width = "100%";
        page.append(tableEquip);

        let eq_Header = document.createElement("tr");
        tableEquip.appendChild(eq_Header);

        let eq_h_descr = document.createElement("th");
        eq_h_descr.style.minWidth = "40px";
        eq_h_descr.style.border = "1px solid black";
        eq_h_descr.innerHTML = "Description";
        eq_Header.appendChild(eq_h_descr);

        let eq_h_quant = document.createElement("th");
        eq_h_quant.style.minWidth = "40px";
        eq_h_quant.style.border = "1px solid black";
        eq_h_quant.innerHTML = "Quantity";
        eq_Header.appendChild(eq_h_quant);

        let eq_h_serial = document.createElement("th");
        eq_h_serial.style.minWidth = "40px";
        eq_h_serial.style.border = "1px solid black";
        eq_h_serial.innerHTML = "Serial number";
        eq_Header.appendChild(eq_h_serial);
        
        let eq_split = equip.split(";");
        for (let i = 0; i < eq_split.length - 1; i += 3) {
            let row = document.createElement("tr");
            tableEquip.appendChild(row);

            let eq_name = document.createElement("td");
            eq_name.style.border = "1px solid black";
            eq_name.innerHTML = eq_split[i];
            row.appendChild(eq_name);

            let eq_quan = document.createElement("td");
            eq_quan.style.border = "1px solid black";
            eq_quan.innerHTML = eq_split[i+1];
            row.appendChild(eq_quan);

            let eq_seri = document.createElement("td");
            eq_seri.style.border = "1px solid black";
            eq_seri.innerHTML = eq_split[i+2];
            row.appendChild(eq_seri);
        }

        let divTemplate = document.createElement("div");
        divTemplate.style.margin = "40px 20px";
        divTemplate.innerHTML = template;
        page.append(divTemplate);


        let divSignature = document.createElement("div");
        divSignature.style.margin = "20px";
        divSignature.style.display = "grid";
        divSignature.style.gridAutoColumns = "240px auto 240px";
        divSignature.style.gridTemplateRows = "28px 28px 80px";
        divSignature.style.textAlign = "center";
        divSignature.style.padding = "40px";
        page.appendChild(divSignature);

        let lblBehalfOfIt = document.createElement("div");
        lblBehalfOfIt.innerHTML = "For and on behalf of IT";
        lblBehalfOfIt.gridArea = "1 / 1";
        divSignature.appendChild(lblBehalfOfIt);

        let lblBehalfOfEmployee = document.createElement("div");
        lblBehalfOfEmployee.innerHTML = "For and on behalf of employee";
        lblBehalfOfEmployee.style.gridArea = "1 / 3";
        divSignature.appendChild(lblBehalfOfEmployee);
        
        let lblItName = document.createElement("div");
        lblItName.innerHTML = it;
        lblItName.style.gridArea = "2 / 1";
        divSignature.appendChild(lblItName);

        let lblEmployeeName = document.createElement("div");
        lblEmployeeName.innerHTML = fn + " " + ln;
        lblEmployeeName.style.gridArea = "2 / 3";
        divSignature.appendChild(lblEmployeeName);

        let lblItSign = document.createElement("div");
        lblItSign.style.gridArea = "3 / 1";
        lblItSign.style.borderBottom = "black solid 2px";
        divSignature.appendChild(lblItSign);

        let lblEmployeeSign = document.createElement("div");
        lblEmployeeSign.style.gridArea = "3 / 3";
        lblEmployeeSign.style.borderBottom = "black solid 2px";
        divSignature.appendChild(lblEmployeeSign);
    }

    GetNotes(filter, date, pending) {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = ()=> {
            if (xhr.readyState == 4 && xhr.status == 200) {
                this.panel2.innerHTML = "";
                this.list = [];

                let split = xhr.responseText.split(String.fromCharCode(127));
                let i = 0;

                this.panel3.innerHTML = "";

                while (i < split.length - 1) {
                    let code = split[i++];
                    let fn = split[i++];
                    let ln = split[i++];
                    let title = split[i++];
                    let department = split[i++];
                    let date = split[i++];
                    let it = split[i++];
                    let template = split[i++];
                    let equip = split[i++];
                    let returned = (split[i++] == "true");
                    
                    this.AddToList(code, fn, ln, title, department, date, it, template, equip, returned);
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        let args = "&filter=" + this.txtFilter.value;
        if (pending) args += "&pending=true";
        else args += "&date=" + date;

        xhr.open("GET", "getdebitnotes" + args, true);
        xhr.send();
    }

    GetTemplates() {
        if (DEBITNOTE_TEMPLATES.length != 0) return;

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = ()=> {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length > 1) 
                    for (let i=0; i<split.length-1; i+=2)
                        DEBITNOTE_TEMPLATES.push([split[i], split[i+1]]);

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "getdebitnotestemplate", true);
        xhr.send();
    }

    GenerateEquipAutoComplite(force=false) {
        if (DEBITNOTE_EQUIP_AUTOFILL!=null && !force) return;

        DEBITNOTE_EQUIP_AUTOFILL = document.createElement("datalist");
        DEBITNOTE_EQUIP_AUTOFILL.id = "DEBITNOTE_EQUIP_AUTOFILL";
        DEBITNOTE_EQUIP_AUTOFILL.style.display = "none";

        for (let i=0; i<db_equip.length; i++) {
            let type = (db_equip[i]["TYPE"] == undefined) ? "" : db_equip[i]["TYPE"][0];
            if (type.length == 0) continue;

            let manufacturer = (db_equip[i]["MANUFACTURER"]  == undefined) ? "" : db_equip[i]["MANUFACTURER"][0];
            let model        = (db_equip[i]["MODEL"]         == undefined) ? "" : db_equip[i]["MODEL"][0];
            if (manufacturer.length==0 && model.length==0) continue;

            let description = (manufacturer + " " + type + ((model.length > 0) ? " - " + model : " ")).trim();
            let serialno = (db_equip[i]["SERIAL NUMBER"] == undefined) ? "" : db_equip[i]["SERIAL NUMBER"][0];

            if (!DEBITNOTE_EQUIP_AUTOFILL_SERIAL.hasOwnProperty(description)) {
                let option = document.createElement("option");
                option.value = description;
                DEBITNOTE_EQUIP_AUTOFILL.appendChild(option);

                DEBITNOTE_EQUIP_AUTOFILL_SERIAL[description] = [];
            }

            if (!DEBITNOTE_EQUIP_AUTOFILL_SERIAL[description].includes(serialno))
                DEBITNOTE_EQUIP_AUTOFILL_SERIAL[description].push(serialno);
        }

        this.content.appendChild(DEBITNOTE_EQUIP_AUTOFILL);
    }
        
    AddNew() {
        this.GenerateEquipAutoComplite(false);

        const dialog = this.DialogBox("100%");
        if (dialog === null) return;
        const btnOK = dialog.btnOK;
        const innerBox = dialog.innerBox;

        let grid = document.createElement("div");
        grid.className = "debit-note-create-dialog";
        innerBox.appendChild(grid);
        
        btnOK.value = "Create";
        innerBox.parentElement.style.width = "calc(100% - 4px)";
        innerBox.parentElement.style.maxWidth = "calc(100% - 4px)";

        let lblFirstName = document.createElement("div");
        lblFirstName.innerHTML = "First name:";
        lblFirstName.style.gridArea = "1 / 1 / span 1 / span 1";
        grid.appendChild(lblFirstName);
        let txtFirstName = document.createElement("input");
        txtFirstName.type = "text";
        txtFirstName.style.gridArea = "1 / 2 / span 1 / span 1";
        grid.appendChild(txtFirstName);

        let lblLastName = document.createElement("div");
        lblLastName.innerHTML = "Last name:";
        lblLastName.style.gridArea = "2 / 1 / span 1 / span 1";
        grid.appendChild(lblLastName);
        let txtLastName = document.createElement("input");
        txtLastName.type = "text";
        txtLastName.style.gridArea = "2 / 2 / span 1 / span 1";
        grid.appendChild(txtLastName);

        let lblTitle = document.createElement("div");
        lblTitle.innerHTML = "Title:";
        lblTitle.style.gridArea = "3 / 1 / span 1 / span 1";
        grid.appendChild(lblTitle);
        let txtTitle = document.createElement("input");
        txtTitle.type = "text";
        txtTitle.style.gridArea = "3 / 2 / span 1 / span 1";
        grid.appendChild(txtTitle);

        let lblDep = document.createElement("div");
        lblDep.innerHTML = "Department:";
        lblDep.style.gridArea = "4 / 1 / span 1 / span 1";
        grid.appendChild(lblDep);
        let txtDep = document.createElement("input");
        txtDep.type = "text";
        txtDep.style.gridArea = "4 / 2 / span 1 / span 1";
        grid.appendChild(txtDep);

        let btnFindUser = document.createElement("input");
        btnFindUser.type = "button";
        btnFindUser.value = "Find...";
        btnFindUser.style.gridArea = "4 / 3 / span 1 / span 1";
        btnFindUser.style.maxWidth = "72px";
        grid.appendChild(btnFindUser);

        let lblDateL = document.createElement("div");
        lblDateL.innerHTML = "Date:";
        lblDateL.style.gridArea = "1 / 4 / span 1 / span 1";
        grid.appendChild(lblDateL);
        let now = new Date();
        let lblDateV = document.createElement("div");
        lblDateV.innerHTML = now.getDate() + "-" + (1 + now.getMonth()) + "-" + now.getFullYear();
        lblDateV.style.gridArea = "1 / 5 / span 1 / span 1";
        grid.appendChild(lblDateV);

        let lblBehalfOfIT = document.createElement("div");
        lblBehalfOfIT.innerHTML = "Behalf of IT:";
        lblBehalfOfIT.style.gridArea = "2 / 4 / span 1 / span 1";
        grid.appendChild(lblBehalfOfIT);
        let txtBehalfOfIT = document.createElement("input");
        txtBehalfOfIT.type = "text";
        txtBehalfOfIT.style.gridArea = "2 / 5 / span 1 / span 1";
        grid.appendChild(txtBehalfOfIT);

        let lblTemplate = document.createElement("div");
        lblTemplate.innerHTML = "Template:";
        lblTemplate.style.gridArea = "3 / 4 / span 1 / span 1";
        grid.appendChild(lblTemplate);
        let txtTemplate = document.createElement("select");
        txtTemplate.style.gridArea = "3 / 5 / span 1 / span 1";
        grid.appendChild(txtTemplate);

        let lblTemplatePreview = document.createElement("div");
        lblTemplatePreview.style.gridArea = "3 / 6 / span 1 / span 2";
        lblTemplatePreview.style.overflow = "hidden";
        lblTemplatePreview.style.textOverflow = "ellipsis";
        lblTemplatePreview.style.fontSize = "10px";
        lblTemplatePreview.style.paddingTop = "8px";
        lblTemplatePreview.style.paddingLeft = "8px";
        lblTemplatePreview.style.maxWidth = "400px";
        lblTemplatePreview.style.visibility = "hidden";
        grid.appendChild(lblTemplatePreview);
        
        for (let i=0; i<DEBITNOTE_TEMPLATES.length; i++) {
            let newOption = document.createElement("option");
            newOption.value = i;
            newOption.innerHTML = DEBITNOTE_TEMPLATES[i][0];
            txtTemplate.appendChild(newOption);
            if (i==0) {
                txtTemplate.value = "0";
                lblTemplatePreview.innerHTML = DEBITNOTE_TEMPLATES[i][1];
            }
        }

        txtTemplate.onchange = ()=> {
            lblTemplatePreview.innerHTML = DEBITNOTE_TEMPLATES[txtTemplate.value][1];
        };

        txtTemplate.onfocus = txtTemplate.onmouseenter = ()=> {
            lblTemplatePreview.style.visibility = "visible";
        };
        txtTemplate.onblur = txtTemplate.onmouseleave = ()=> {
            lblTemplatePreview.style.visibility = "hidden";
        };

        let btnAddEquip = document.createElement("input");
        btnAddEquip.type = "button";
        btnAddEquip.value = "Add";
        btnAddEquip.style.gridArea = "6 / 2 / span 1 / span 1";
        btnAddEquip.style.maxWidth = "72px";
        btnAddEquip.style.margin = "0 40px";
        innerBox.appendChild(btnAddEquip);

        let lstEquip = document.createElement("div");
        lstEquip.className = "debit-note-equip-list";
        innerBox.appendChild(lstEquip);

        btnFindUser.onclick =()=> {
            let container = document.createElement("div");
            container.style.position = "relative";
            container.style.width = "100%";
            container.style.height = "100%";
            container.style.zIndex = "4";
            container.style.backgroundColor = "rgba(32,32,32,.66)";
            innerBox.style.filter = "blur(2px)";
            innerBox.parentElement.appendChild(container);

            let dialog = document.createElement("div");
            dialog.style.backgroundColor = "rgb(203,203,203)";
            dialog.style.position = "absolute";
            dialog.style.top = dialog.style.bottom = "32px";
            dialog.style.left = dialog.style.right = "96px";
            dialog.style.borderRadius = "8px";
            dialog.style.padding = "8px";
            dialog.style.boxShadow = "rgba(0,0,0,.4) 0 12px 16px";
            dialog.style.overflow = "hidden";
            container.appendChild(dialog);

            //let pnlFilter = this.document.createElement("div");
            //dialog.appendChild(pnlFilter);

            let txtFind = document.createElement("input");
            txtFind.type = "text";
            txtFind.placeholder = "Search";
            dialog.appendChild(txtFind);

            let lstUsers = document.createElement("div");
            lstUsers.className = "no-results";
            lstUsers.style.position = "absolute";
            lstUsers.style.left = lstUsers.style.right = "0";
            lstUsers.style.top = lstUsers.style.bottom = "48px";
            lstUsers.style.overflowY = "auto";
            dialog.appendChild(lstUsers);

            let pnlButtons = document.createElement("div");
            pnlButtons.style.bottom = "8px";
            pnlButtons.style.width = "100%";
            pnlButtons.style.heigth = "40px";
            pnlButtons.style.position = "absolute";
            pnlButtons.style.textAlign = "center";
            dialog.appendChild(pnlButtons);

            let btnCancel = document.createElement("input");
            btnCancel.type = "button";
            btnCancel.value = "Cancel";
            btnCancel.style.bottom = "8px";
            pnlButtons.appendChild(btnCancel);

            txtFind.onchange =
            txtFind.oninput = ()=> {
                lstUsers.innerHTML = "";

                let keywords = [];
                if (txtFind.value.trim().length > 0)
                    keywords = txtFind.value.trim().toLowerCase().split(" ");

                for (let i = 0; i < db_users.length; i++) {
                    let match = true;

                    for (let j=0; j<keywords.length; j++) {
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

                    let element = document.createElement("div");
                    element.className = "eql-element";
                    this.content.appendChild(element);

                    let icon = document.createElement("div");
                    icon.className = "eql-icon";
                    icon.style.backgroundImage = "url(res/user.svgz)";
                    element.appendChild(icon);

                    for (let j=0; j<6; j++) {
                        if (!db_users[i].hasOwnProperty(USER_LIST_ORDER[j])) continue;

                        let newLabel = document.createElement("div");
                        newLabel.innerHTML = db_users[i][USER_LIST_ORDER[j]][0];
                        newLabel.className = "eql-label" + j;
                        element.appendChild(newLabel);
                    }

                    element.ondblclick = () => {
                        txtFirstName.value = firstname;
                        txtLastName.value = lastname;
                        txtTitle.value = title;
                        txtDep.value = department;

                        btnCancel.onclick();
                    };

                    lstUsers.appendChild(element);
                }
            };

            btnCancel.onclick = () => {
                innerBox.style.filter = "none";
                innerBox.parentElement.removeChild(container);
            };

            txtFind.focus();
            txtFind.onchange();
        };

        btnAddEquip.onclick =()=> {
            let newEntry = document.createElement("div");
            newEntry.className = "debit-note-equip-entry";
            lstEquip.appendChild(newEntry);

            let txtDescription = document.createElement("input");
            txtDescription.type = "text";
            txtDescription.placeholder = "Description";
            txtDescription.setAttribute("list", "DEBITNOTE_EQUIP_AUTOFILL");
            newEntry.appendChild(txtDescription);

            let txtQuantity = document.createElement("input");
            txtQuantity.type = "number";
            txtQuantity.min = 1;
            txtQuantity.max = 9999;
            txtQuantity.value = 1;
            newEntry.appendChild(txtQuantity);

            let txtSerialNo = document.createElement("input");
            txtSerialNo.type = "text";
            txtSerialNo.placeholder = "Serial number";
            newEntry.appendChild(txtSerialNo);

            let btnRemove = document.createElement("div");
            newEntry.appendChild(btnRemove);

            let id = "i" + new Date().getTime();
            let datalist = document.createElement("datalist");
            datalist.id = id;
            newEntry.appendChild(datalist);
            txtSerialNo.setAttribute("list", id);

            txtDescription.onchange = 
            txtDescription.oninput = ()=> {
                if (DEBITNOTE_EQUIP_AUTOFILL_SERIAL.hasOwnProperty(txtDescription.value))
                    if (DEBITNOTE_EQUIP_AUTOFILL_SERIAL[txtDescription.value].length == 1) {
                        txtSerialNo.value = DEBITNOTE_EQUIP_AUTOFILL_SERIAL[txtDescription.value][0];

                    } else {
                        if (!DEBITNOTE_EQUIP_AUTOFILL_SERIAL[txtDescription.value].includes(txtSerialNo.value)) txtSerialNo.value = "";
                        while (datalist.firstChild != null)
                            datalist.removeChild(datalist.firstChild);

                        for (let i = 0; i < DEBITNOTE_EQUIP_AUTOFILL_SERIAL[txtDescription.value].length; i++) {
                            let option = document.createElement("option");  
                            option.value = DEBITNOTE_EQUIP_AUTOFILL_SERIAL[txtDescription.value][i];
                            datalist.appendChild(option);
                        }
                    }
            };

            btnRemove.onclick = ()=> { lstEquip.removeChild(newEntry); };
        };

        btnOK.addEventListener("click", ()=> {
            let removeAmp = (value) => {
                while (value.indexOf("&") > -1) value = value.replace("&", "");
                return value;
            };

            let eq_string = "";
            for (let i = 0; i < lstEquip.childNodes.length; i++)
                for (let j = 0; j < 3; j++) {
                    while (lstEquip.childNodes[i].childNodes[0].value.indexOf(";") > -1)
                        lstEquip.childNodes[i].childNodes[j].value = lstEquip.childNodes[i].childNodes[j].value.replace(";", "");
                    eq_string += lstEquip.childNodes[i].childNodes[j].value + ";";
                }

            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange =() => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    if (xhr.response != "failed")
                        this.FilterPending();

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            let data = "";
            data += "&fn=" + removeAmp(txtFirstName.value);
            data += "&ln=" + removeAmp(txtLastName.value);
            data += "&tl=" + removeAmp(txtTitle.value);
            data += "&dp=" + removeAmp(txtDep.value);
            data += "&it=" + removeAmp(txtBehalfOfIT.value);
            data += "&tt=" + removeAmp(txtTemplate.value);
            data += "&eq=" + removeAmp(eq_string);

            xhr.open("GET", "createdebitnote" + data, true);
            xhr.send();
        });

        btnAddEquip.click();
    }
       
    FilterAll() {
        this.objCalendar.ClearSelection();

        this.btnShowAll.style.borderBottom = "var(--theme-color) 4px solid";
        this.btnShowPending.style.borderBottom = "none";
        this.calendar.style.opacity = "1";
        this.calendar.style.visibility = "visible";
        this.content.style.gridTemplateRows = "366px auto";

        this.GetNotes(this.txtFilter.value, "", false);
    }

    FilterPending() {
        this.btnShowAll.style.borderBottom = "none";
        this.btnShowPending.style.borderBottom = "var(--theme-color) 4px solid";
        this.calendar.style.opacity = "0";
        this.calendar.style.visibility = "hidden";
        this.content.style.gridTemplateRows = "100px auto";

        this.GetNotes(this.txtFilter.value, "", true);
    }

    FilterDate() {
        let datevalue = this.objCalendar.GetDate();

        if (datevalue == null) {
            this.FilterAll();
            return;
        }

        let date = new Date(datevalue);
        date = date.getFullYear() + (date.getMonth() + 1).toString().padStart(2, "0") + date.getDate().toString().padStart(2, "0");
        this.GetNotes(this.txtFilter.value, date, false);
    }

    Close() { //override
        this.list = [];
        this.panel2.innerHTML = "";
        super.Close();
    }

    AfterResize() { //override
        if (this.content.clientWidth > 1200) {
            this.panel1.style.gridColumn = "1";
            this.panel1.style.gridRow = "1 / 3";
            this.panel2.style.gridColumn = "2";
            this.panel2.style.gridRow = "1 / 3";
            this.panel3.style.gridColumn = "3 / 3";
            this.panel3.style.gridRow = "1 / 3";
        } else {
            this.panel1.style.gridColumn = "1";
            this.panel1.style.gridRow = "1";
            this.panel2.style.gridColumn = "1";
            this.panel2.style.gridRow = "2";
            this.panel3.style.gridColumn = "2 / 4";
            this.panel3.style.gridRow = "1 / 3";
        }
    }

}