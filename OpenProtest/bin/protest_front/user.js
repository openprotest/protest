const USER_ORDER = [
    "TITLE", "DEPARTMENT", "DIVISION", "COMPANY",

    ["res/user.svgz", "General"],
    "FIRST NAME", "MIDDLE NAME", "LAST NAME", "DISPLAY NAME", "EMPLOYEE ID",

    ["res/credencial.svgz", "Authentication"],
    "DOMAIN", "USERNAME", "PASSWORD",

    ["res/contact.svgz", "Contact Information"],
    "E-MAIL", "SECONDARY E-MAIL", "TELEPHONE NUMBER", "MOBILE NUMBER", "MOBILE EXTENTION", "FAX",

    ["res/sim.svgz", "SIM Information"],
    "SIM", "PUK", "VOICEMAIL"
];

class User extends Window {
    constructor(user) {
        if (document.head.querySelectorAll("link[href$='equip.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "equip.css";
            document.head.appendChild(csslink);
        }

        super([208,208,208]);

        if (user === null) { //add new entry
            this.setTitle("New user");
            this.setIcon("res/new_user.svgz");

            this.AfterResize = () => { }; //do nothing, elements are missing

            let new_user = {
                "TITLE": ["", ""],
                "DEPARTMENT": ["", ""],
                "FIRST NAME": ["", ""],
                "LAST NAME": ["", ""],
                "USERNAME" : ["", ""],
                "E-MAIL" : ["", ""],
                "TELEPHONE NUMBER": ["", ""],
                "MOBILE NUMBER": ["", ""]
            };

            let obj = this.Edit(new_user);
            const hashEdit = obj[0];
            const btnAdd = obj[1];
            const btnCancel = btnAdd.parentElement.childNodes[1];
            const container = obj[2];            

            btnAdd.parentElement.childNodes[0].onclick = () => {
                btnAdd.setAttribute("disabled", true);
                btnAdd.parentElement.childNodes[0].setAttribute("disabled", true);

                let payload = "";
                for (let k in hashEdit)
                    payload += hashEdit[k][1].value + String.fromCharCode(127) + hashEdit[k][2].value + String.fromCharCode(127);

                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = ()=> {

                    if (xhr.readyState == 4 && xhr.status == 200) { //OK
                        let split = xhr.responseText.split(String.fromCharCode(127));
                        if (split.length > 1) {
                            db_users_ver = split[0];

                            let filename = "";
                            let obj = {};

                            for (let i=2; i<split.length-3; i+=4) {
                                obj[split[i]] = [split[i + 1], split[i + 2]];
                                if (split[i] == ".FILENAME") filename = split[i + 1];
                            }

                            db_users.push(obj); //update db_users

                            for (let i=0; i<w_array.length; i++) //update userslist
                                if (w_array[i] instanceof UserList) {
                                    let element = document.createElement("div");
                                    element.className = "eql-element";
                                    element.id = "u" + filename;
                                    w_array[i].list.push(obj);
                                    w_array[i].content.appendChild(element);
                                    w_array[i].FillElement(element, obj);

                                    w_array[i].AfterResize();
                                }

                            this.Close();
                            new User(obj);

                        } else
                            this.ConfirmBox(xhr.responseText, true).onclick = () => this.Close();
                    }

                    if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true).onclick = ()=> this.Close();
                };

                xhr.open("POST", "saveuser", true);
                xhr.send(payload);
            };

            btnCancel.onclick = () => { this.Close(); };

        } else {
            this.user = user;
            this.filename = user[".FILENAME"][0];
            this.InitializeComponent();
        }
    }

    InitializeComponent() {
        let background = document.createElement("div");
        background.className = "eq-background";
        background.style.backgroundImage = "url(res/user.svgz)";
        this.content.appendChild(background);

        this.setIcon("res/user.svgz");

        this.options = document.createElement("div");
        this.options.className = "eq-options";
        this.content.appendChild(this.options);

        this.properties = document.createElement("div");
        this.properties.className = "eq-list";
        this.content.appendChild(this.properties);

        this.protocols = document.createElement("div");
        this.protocols.className = "eq-protocols";
        this.content.appendChild(this.protocols);

        this.more = document.createElement("div");
        this.more.style.paddingBottom = "16px";
        this.content.appendChild(this.more);

        this.instant = document.createElement("div");
        this.more.appendChild(this.instant);

        let btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        btnEdit.onclick = ()=> this.Edit(this.user);
        this.options.appendChild(btnEdit);

        let btnVerify = document.createElement("input");
        btnVerify.type = "button";
        btnVerify.value = "Fetch";
        btnVerify.onclick = ()=> this.Verify(this.user);
        this.options.appendChild(btnVerify);

        let btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.value = "Delete";
        btnDelete.onclick = ()=> this.Delete(this.user);
        this.options.appendChild(btnDelete);

        this.InitList(this.user);
        this.AfterResize();
    }

    AfterResize() { //override
        if (this.win.clientWidth < 480) {
            this.protocols.style.width = "30px";
            this.properties.style.left = "64px";
            this.options.style.left = "64px";

            this.properties.appendChild(this.more);
            this.more.className = "";

        } else if (this.win.clientWidth < 1250) {
            this.protocols.style.width = "200px";
            this.properties.style.left = "200px";
            this.options.style.left = "200px";

            this.properties.appendChild(this.more);
            this.more.className = "";

        } else {
            this.protocols.style.width = "200px";
            this.properties.style.left = "200px";
            this.options.style.left = "200px";

            this.content.appendChild(this.more);
            this.more.className = "eq-more-side";
        }
    }

    InitList(user) { 
        let done = [];

        this.properties.innerHTML = "";
        this.protocols.innerHTML = "";
        if (this.dot) this.task.removeChild(this.dot);

        if (this.user["TITLE"] == undefined || this.user["TITLE"][0].length == 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.user["TITLE"][0]);

        for (let i=0; i<USER_ORDER.length; i++) 
        if(Array.isArray(USER_ORDER[i])) 
            this.Group((USER_ORDER[i][0] == "^")? GetIcon(user["TYPE"]) : USER_ORDER[i][0], USER_ORDER[i][1]);
        else
            this.PushProperty(user, USER_ORDER[i], done);
    
        this.Group("res/other.svgz", "Other");
        let isGroupEmpty = true;
        for (let k in user) 
            if (!done.includes(k, 0) && !k.startsWith(".")){
                this.PushProperty(user, k, done);
                isGroupEmpty = false;
            }

        if (isGroupEmpty && this.properties.childNodes[this.properties.childNodes.length-1].className == "eq-property-group")
            this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length-1]);

        let seperator1 = document.createElement("div");
        seperator1.style.width = "16px";
        seperator1.style.height = "16px";        
        this.properties.appendChild(seperator1);
        pt_user(this);

        this.more.innerHTML = "";
        this.more.appendChild(this.instant);
        
        let unlock_once = false;
        this.btnUnlock = this.SideBar("res/unlock.svgz", "Unlock");
        this.btnUnlock.onclick = () => {
            if (unlock_once) return;

            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4) unlock_once = false;

                if (xhr.readyState == 4 && xhr.status == 200) //OK
                    if (xhr.responseText == "ok") {
                        this.btnUnlock.childNodes[0].style.filter = "invert(1)";
                        this.btnUnlock.childNodes[0].style.backgroundImage = "url(res/unlock.svgz)"
                    } else
                        this.ConfirmBox(xhr.responseText, true);

                if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("GET", "unlockuser&file=" + this.filename, true);
            xhr.send();
            unlock_once = true;
        };

        let enable_disable_once = false;
        let btnEnable = this.SideBar("res/enable.svgz", "Enable");
        btnEnable.onclick = () => {
            if (enable_disable_once) return;
            this.ConfirmBox("Are you sure you want to enable this user?").addEventListener("click", () => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4) unlock_once = false;

                    if (xhr.readyState == 4 && xhr.status == 200) //OK
                        if (xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);

                    if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                enable_disable_once = true;
                xhr.open("GET", "enableuser&file=" + this.filename, true);
                xhr.send();
            });
        };

        let btnDisable = this.SideBar("res/disable.svgz", "Disable");
        btnDisable.onclick = () => {
            if (enable_disable_once) return;
            this.ConfirmBox("Are you sure you want to disable this user?").addEventListener("click", () => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4) unlock_once = false;

                    if (xhr.readyState == 4 && xhr.status == 200) //OK
                        if (xhr.responseText != "ok")
                            this.ConfirmBox(xhr.responseText, true);

                    if (xhr.readyState == 4 && xhr.status == 0) {//disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                        value.innerHTML = "";
                        value.appendChild(btnShow);
                    }
                };

                enable_disable_once = true;
                xhr.open("GET", "disableuser&file=" + this.filename, true);
                xhr.send();
            });
        };

        if (user.hasOwnProperty("E-MAIL"))
            this.SquareButton("res/email.svgz", "E-mail", this.more).onclick = () => {
                window.location.href = "mailto:" + user["E-MAIL"][0];
            };

        if (user.hasOwnProperty("TELEPHONE NUMBER"))
            this.SquareButton("res/phone.svgz", "Telephone", this.more).onclick = () => {
                window.location.href = "tel:" + user["TELEPHONE NUMBER"][0];
            };

        if (user.hasOwnProperty("MOBILE NUMBER"))
            this.SquareButton("res/mobile.svgz", "Mobile phone", this.more).onclick = () => {
                window.location.href = "tel:" + user["MOBILE NUMBER"][0];
            };

    }
    
    SideBar(icon, label) {
        let divOption = document.createElement("div");
        this.protocols.appendChild(divOption);

        let divIcon = document.createElement("div");
        divIcon.style.backgroundImage = "url("+ icon +")";
        divOption.appendChild(divIcon);
        
        let divLabel = document.createElement("div");
        divLabel.innerHTML = label;
        divOption.appendChild(divLabel);

        return divOption;
    }
    
    SquareButton(icon, label, container) {
        let button = document.createElement("div");
        button.className = "eq-square-button";
        container.appendChild(button);

        let divIcon = document.createElement("div");
        divIcon.style.backgroundImage = "url(" + icon + ")";
        button.appendChild(divIcon);

        let divLabel = document.createElement("div");
        divLabel.innerHTML = label;
        button.appendChild(divLabel);

        return button;
    }

    Group(icon, title) {
        let newGroup = document.createElement("div");
        newGroup.className = "eq-property-group";

        let ico = document.createElement("div");
        if (icon.length > 0) ico.style.backgroundImage = "url("+ icon +")";
        newGroup.appendChild(ico);

        let label = document.createElement("div");
        label.innerHTML = title;
        newGroup.appendChild(label);

        if (this.properties.childNodes.length > 0)
            if (this.properties.childNodes[this.properties.childNodes.length-1].className == "eq-property-group")
                this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length-1]);

        this.properties.appendChild(newGroup);
    }

    PushProperty(user, name, done) {
        if (user[name] == undefined) return;
        
        let newProperty = this.Property(name, user[name][0], user[name][1]);

        if (done != null) done.push(name);
        this.properties.appendChild(newProperty);
    }

    Property(n, v, m) {
        let newProperty = document.createElement("div");
        newProperty.className = "eq-property";

        let label = document.createElement("div");
        label.innerHTML = n.toUpperCase();
        newProperty.appendChild(label);

        if (n.includes("PASSWORD")) { //password
            let value = document.createElement("div");
            newProperty.appendChild(value);

            let btnShow = document.createElement("input");
            btnShow.type = "button";
            btnShow.value = "Show";
            btnShow.onclick = ()=> {
                value.removeChild(btnShow);

                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) { //OK
                        value.innerHTML = xhr.responseText;

                        let countdown = document.createElement("span");
                        countdown.className = "password-countdown";
                        countdown.style.transition = "all 20s linear 0s";
                        value.appendChild(countdown);

                        let cd_left = document.createElement("div");
                        cd_left.appendChild(document.createElement("div"));
                        countdown.appendChild(cd_left);

                        let cd_right = document.createElement("div");
                        cd_right.appendChild(document.createElement("div"));
                        countdown.appendChild(cd_right);

                        setTimeout(() => {
                            if (!this.isClosed) {
                                btnShow.style.animation = "fade-in .4s";
                                value.innerHTML = "";
                                value.appendChild(btnShow);
                            }
                        }, 20000);

                    } else if (xhr.readyState == 4 && xhr.status == 0) { //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                        value.innerHTML = "";
                        value.appendChild(btnShow);
                    }
                };

                xhr.open("GET", "getuserprop&file=" + this.filename + "&property=" + n, true);
                xhr.send();
            };

            value.appendChild(btnShow);
            
        } else if (v.includes(";")) {
            let value = document.createElement("div");

            let values = v.split(";");
            for (let i=0; i<values.length; i++) {
                if (values[i].trim().length == 0) continue;
                let subvalue = document.createElement("div");
                subvalue.innerHTML = values[i];
                value.appendChild(subvalue);
            }

            newProperty.appendChild(value);
            
        } else {
            let value = document.createElement("div");
            value.innerHTML = v;
            newProperty.appendChild(value);
        }

        if (m.length > 0) {
            let comme = document.createElement("div");
            comme.innerHTML = m;
            newProperty.appendChild(comme);
        }

        return newProperty;
    }

    Edit(user) {
        let dialog    = this.DialogBox();
        let btnOK     = dialog[0];
        let container = dialog[1];

        container.style.padding = "8px";

        let btnAdd = document.createElement("input");
        btnAdd.type = "button";
        btnAdd.value = "Add";
        btnAdd.style.position = "absolute";
        btnAdd.style.left = "16px";
        container.parentElement.childNodes[1].appendChild(btnAdd);

        container.parentElement.childNodes[1].style.minWidth = "350px"; //buttonsBox

        btnAdd.onclick = ()=> { this.EditProp("", "", false, container, hashEdit)[1].focus(); };

        let autofill = document.createElement("datalist"); //Autofill
        autofill.id = "ur_autofill";
        for (let i=0; i<USER_ORDER.length; i++) {
            if (Array.isArray(USER_ORDER[i])) continue;
            let opt = document.createElement("option");
            opt.value = USER_ORDER[i];
            autofill.appendChild(opt);
        }
        container.appendChild(autofill);

        let hashEdit = {};

        let done = [];
        for (let i=0; i<USER_ORDER.length; i++)
            if(!Array.isArray(USER_ORDER[i])) {
                if (user[USER_ORDER[i]] == undefined) continue;
                this.EditProp(USER_ORDER[i], user[USER_ORDER[i]][0], false, container, hashEdit);
                done.push(USER_ORDER[i]);
            }
            
        for (let k in user) 
            if (!done.includes(k, 0)) {
                if (user[k] == undefined && k!="") continue;
                this.EditProp(k, user[k][0], (k==".FILENAME"), container, hashEdit);
            }

        const ok_click = btnOK.onclick;

        btnOK.value = "Save";
        btnOK.onclick = ()=> {
            btnOK.setAttribute("disabled", true);
            let payload = "";
            for (let k in hashEdit)
                payload += hashEdit[k][1].value + String.fromCharCode(127) + hashEdit[k][2].value + String.fromCharCode(127);

            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = ()=> {
                if (xhr.readyState == 4) ok_click();

                if (xhr.readyState == 4 && xhr.status == 200) { //OK
                    let split = xhr.responseText.split(String.fromCharCode(127));
                    if (split.length > 1) {
                        db_users_ver = split[0];

                        let obj = {};

                        for (let i=2; i<split.length-3; i+=4)
                            obj[split[i]] = [split[i+1], split[i+2]];

                        for (let i=0; i<user.length; i++) //update db_user
                            if (db_user[i][".FILENAME"][0] == this.filename) {
                                db_user[i] = obj;
                                break;
                            }

                        for (let i=0; i<w_array.length; i++) //update userlist
                            if (w_array[i] instanceof UserList) {
                                let elements = w_array[i].content.querySelectorAll("[id=u"+this.filename+"]");
                                for (let j=0; j<elements.length; j++) {
                                    elements[j].innerHTML = "";
                                    w_array[i].FillElement(elements[j], obj);
                                }
                                w_array[i].AfterResize();
                            }

                        this.user = obj;

                        this.InitList(obj);
                        this.AfterResize();

                    } else
                        this.ConfirmBox(xhr.responseText, true);
                }

                if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("POST", "saveuser", true);
            xhr.send(payload);
        };

        return [hashEdit, btnAdd, container];
    }

    Verify(user) {
        let confirm = document.createElement("div");
        confirm.className = "confirm";
        this.win.appendChild(confirm);

        this.content.style.filter = "blur(2px)";

        let waitbox = document.createElement("span");
        waitbox.className = "waitbox";
        confirm.appendChild(waitbox);

        waitbox.appendChild(document.createElement("div"));

        let waitLabel = document.createElement("span");
        waitLabel.className = "wait-label";
        waitLabel.innerHTML = "Doing stuff. Please wait.";
        confirm.appendChild(waitLabel);

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = ()=> {
            if (xhr.readyState == 4) this.win.removeChild(confirm);

            if (xhr.readyState == 4 && xhr.status == 200) { //OK
                let split = xhr.responseText.split(String.fromCharCode(127));

                if (split.length > 1) {
                    const obj = this.Edit(user);
                    const hashEdit  = obj[0];
                    const btnAdd    = obj[1];
                    const container = obj[2];
                    this.Verify_Compare(hashEdit, split, container);
                } else {
                    this.ConfirmBox(xhr.responseText, true);
                }
            }

            if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("POST", "adverify&file=" + this.filename, true);
        xhr.send();
    }

    Verify_Compare(hashEdit, split, container) {
        for (let i=0; i<split.length-1; i+=2) 
            if (hashEdit.hasOwnProperty(split[i])) {
                if (hashEdit[split[i]][2].value.toLowerCase() == split[i+1].toLowerCase())
                    hashEdit[split[i]][2].style.backgroundImage = "url(res/check.svgz)";
                else {
                    hashEdit[split[i]][2].style.backgroundImage = "url(res/change.svgz)";
                    hashEdit[split[i]][2].value = split[i+1];
                }                
            } else {
                let entry = this.EditProp(split[i], split[i+1], false, container, hashEdit);
                if (entry != undefined) entry[2].style.backgroundImage = "url(res/newentry.svgz)";
            }
    }

    EditProp(name, value, readonly, container, hashEdit) {
        let newProperty = document.createElement("div");
        newProperty.className = "eq-edit-property";
        container.appendChild(newProperty);

        let txtName = document.createElement("input");
        txtName.type = "text";
        txtName.value = name.toUpperCase();
        txtName.setAttribute("list", "ur_autofill");
        if (readonly) txtName.setAttribute("readonly", true);
        newProperty.appendChild(txtName);

        let txtValue = document.createElement("input");
        txtValue.type = "text";
        txtValue.value = (name=="")? "" : value;
        if (readonly) txtValue.setAttribute("readonly", true);
        newProperty.appendChild(txtValue);

        let remove = document.createElement("div");
        if (!readonly) newProperty.appendChild(remove);
        remove.onclick = ()=> {
            if (newProperty.style.filter == "opacity(0)") return; //once
            delete hashEdit[name];
            newProperty.style.filter = "opacity(0)";

            for (let i=0; i<newProperty.childNodes.length; i++) {
                newProperty.childNodes[i].style.height = "0";
                newProperty.childNodes[i].style.margin = "0";
                newProperty.childNodes[i].style.padding = "0";
            }

            setTimeout(()=> {
                container.removeChild(newProperty);
            }, 150);
        };

        let key = (name.length > 0) ? name : new Date().getTime();
        hashEdit[key] = [newProperty, txtName, txtValue];
        return hashEdit[key];
    }

    Delete(user) {
        this.ConfirmBox("Are you sure you want to delete this user?", false).addEventListener("click", ()=>{
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                let split = xhr.responseText.split(String.fromCharCode(127));

                if (xhr.readyState == 4 && xhr.status == 200) { //OK
                    if (split[0] == "ok") {
                        this.Close();

                        db_users_ver = split[1]; 

                        for (let i=0; i<db_users.length; i++) //update db_users
                            if (db_users[i][".FILENAME"][0] == this.filename) {
                                db_users.splice(i, 1);
                                break;
                            }

                        for (let i=0; i<w_array.length; i++)
                            if (w_array[i] instanceof UserList) {

                                for (let j = 0; j < w_array[i].list.length; j++)
                                    if (w_array[i].list[j][".FILENAME"][0] == this.filename)
                                        w_array[i].list.splice(j, 1);

                                let elements = w_array[i].content.querySelectorAll("[id=u" + this.filename + "]");
                                for (let j=0; j<elements.length; j++)
                                    w_array[i].content.removeChild(elements[j]);

                                w_array[i].AfterResize();
                            }

                    } else
                        this.ConfirmBox(xhr.responseText, true);
                }

                if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("POST", "deluser&" + this.filename, true);
            xhr.send();
        });
    }
}