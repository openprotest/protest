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

        super([208, 208, 208]);

        this.hashEdit = {};

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
            const btnAdd = obj[1];
            const btnCancel = btnAdd.parentElement.childNodes[1];
            const container = obj[2];

            { //fetch button on new
                let divFetch = document.createElement("div");
                divFetch.style.position = "absolute";
                divFetch.style.visibility = "hidden";
                divFetch.style.left = "30%";
                divFetch.style.top = "28px";
                divFetch.style.width = "40%";
                divFetch.style.minWidth = "220px";
                divFetch.style.borderRadius = "8px";
                divFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
                divFetch.style.backgroundColor = "rgb(208,208,208)";
                divFetch.style.padding = "16px 8px";
                divFetch.style.overflow = "hidden";
                divFetch.style.textAlign = "center";
                container.parentElement.parentElement.appendChild(divFetch);

                let txtFetchUser = document.createElement("input");
                txtFetchUser.type = "text";
                txtFetchUser.placeholder = "Username";
                divFetch.appendChild(txtFetchUser);

                divFetch.appendChild(document.createElement("br"));
                divFetch.appendChild(document.createElement("br"));

                let btnFetchOk = document.createElement("input");
                btnFetchOk.type = "button";
                btnFetchOk.value = "Fetch";
                divFetch.appendChild(btnFetchOk);

                let btnFetchCancel = document.createElement("input");
                btnFetchCancel.type = "button";
                btnFetchCancel.value = "Cancel";
                divFetch.appendChild(btnFetchCancel);

                let btnFetch = document.createElement("div");
                btnFetch.setAttribute("tip-below", "Fetch");
                btnFetch.style.position = "absolute";
                btnFetch.style.left = "0px";
                btnFetch.style.top = "32px";
                btnFetch.style.width = "56px";
                btnFetch.style.height = "56px";
                btnFetch.style.borderRadius = "0 8px 8px 0";
                btnFetch.style.backgroundColor = "rgb(208,208,208)";
                btnFetch.style.backgroundImage = "url(res/fetch.svgz)";
                btnFetch.style.backgroundPosition = "center";
                btnFetch.style.backgroundSize = "48px 48px";
                btnFetch.style.backgroundRepeat = "no-repeat";
                btnFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
                btnFetch.style.transition = ".2s";
                container.parentElement.parentElement.appendChild(btnFetch);

                btnFetchCancel.onclick = () => { btnFetch.onclick(); };

                let fetchToogle = false;

                btnFetch.onclick = () => {
                    container.parentElement.style.transition = ".2s";
                    container.parentElement.style.transform = fetchToogle ? "none" : "translateY(-25%)";
                    container.parentElement.style.filter = fetchToogle ? "none" : "opacity(0)";
                    container.parentElement.style.visibility = fetchToogle ? "visible" : "hidden";
                    divFetch.style.transition = ".2s";
                    divFetch.style.transform = fetchToogle ? "translateY(-25%)" : "none";
                    divFetch.style.filter = fetchToogle ? "opacity(0)" : "none";
                    divFetch.style.visibility = fetchToogle ? "hidden" : "visible";
                    btnFetch.style.backgroundImage = fetchToogle ? "url(res/fetch.svgz)" : "url(res/close.svgz)";
                    btnFetch.setAttribute("tip-below", fetchToogle ? "Fetch" : "Cancel");

                    fetchToogle = !fetchToogle;

                    if (fetchToogle) setTimeout(() => { txtFetchUser.focus(); }, 1);
                };

                btnFetchOk.onclick = ()=> {
                    if (txtFetchUser.value.length == 0) return;

                    let waitbox = document.createElement("span");
                    waitbox.className = "waitbox";
                    waitbox.style.top = "0";
                    container.parentElement.parentElement.appendChild(waitbox);

                    waitbox.appendChild(document.createElement("div"));

                    let waitLabel = document.createElement("span");
                    waitLabel.innerHTML = "Doing stuff. Please wait.";
                    waitLabel.className = "wait-label";
                    waitLabel.style.top = "0";
                    container.parentElement.parentElement.appendChild(waitLabel);

                    btnFetch.style.opacity = "0";
                    btnFetch.style.visibility = "hidden";
                    divFetch.style.opacity = "0";
                    divFetch.style.visibility = "hidden";

                    this.hashEdit = {};
                    container.innerHTML = "";

                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200) { //OK
                            let split = xhr.responseText.split(String.fromCharCode(127));
                            for (let i = 0; i < split.length - 1; i += 2)
                                this.EditProp(split[i], split[i + 1], false, container);

                            btnFetch.onclick();
                            container.parentElement.parentElement.removeChild(waitbox);
                            container.parentElement.parentElement.removeChild(waitLabel);
                        }

                        if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                            this.ConfirmBox("Server is unavailable.", true);
                    };

                    xhr.open("GET", "adverify&username=" + txtFetchUser.value, true);
                    xhr.send();
                };

                txtFetchUser.onkeyup = event => {
                    if (event.keyCode == 13) //enter
                        btnFetchOk.onclick();
                };
            }

            btnAdd.parentElement.childNodes[0].onclick =() => {
                btnAdd.setAttribute("disabled", true);
                btnAdd.parentElement.childNodes[0].setAttribute("disabled", true);

                let payload = "";
                for (let k in this.hashEdit)
                    payload += this.hashEdit[k][1].value + String.fromCharCode(127) + this.hashEdit[k][2].value + String.fromCharCode(127);

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

                            for (let i = 0; i < $w.array.length; i++) //update userslist
                                if ($w.array[i] instanceof UserList) {
                                    let element = document.createElement("div");
                                    element.className = "eql-element";
                                    element.id = "u" + filename;
                                    $w.array[i].list.push(obj);
                                    $w.array[i].content.appendChild(element);
                                    $w.array[i].FillElement(element, obj);
                                    $w.array[i].AfterResize();
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
            value.appendChild(btnShow);

            let btnStamp = document.createElement("input");
            btnStamp.type = "button";
            btnStamp.value = " ";
            btnStamp.style.minWidth = "40px";
            btnStamp.style.height = "32px";
            btnStamp.style.backgroundImage = "url(res/l_stamp.svg)";
            btnStamp.style.backgroundSize = "28px 28px";
            btnStamp.style.backgroundPosition = "center";
            btnStamp.style.backgroundRepeat = "no-repeat";
            value.appendChild(btnStamp);

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
                                //btnShow.style.animation = "fade-in .4s";
                                //btnStamp.style.animation = "fade-in .4s";
                                value.innerHTML = "";
                                value.appendChild(btnShow);
                                value.appendChild(btnStamp);
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

            btnStamp.onclick = () => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) { //OK                       
                        if (xhr.responseText != "ok")
                            this.ConfirmBox(xhr.responseText, true);
                    } else if (xhr.readyState == 4 && xhr.status == 0)  //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };

                xhr.open("GET", "ramsg&stpu&" + this.filename + ":" + n, true);
                xhr.send();
            };            
            
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

        btnAdd.onclick = () => { this.EditProp("", "", false, container, this.hashEdit)[1].focus(); };

        let autofill = document.createElement("datalist"); //Autofill
        autofill.id = "ur_autofill";
        for (let i=0; i<USER_ORDER.length; i++) {
            if (Array.isArray(USER_ORDER[i])) continue;
            let opt = document.createElement("option");
            opt.value = USER_ORDER[i];
            autofill.appendChild(opt);
        }
        container.appendChild(autofill);        

        let done = [];
        for (let i=0; i<USER_ORDER.length; i++)
            if(!Array.isArray(USER_ORDER[i])) {
                if (user[USER_ORDER[i]] == undefined) continue;
                this.EditProp(USER_ORDER[i], user[USER_ORDER[i]][0], false, container);
                done.push(USER_ORDER[i]);
            }
            
        for (let k in user) 
            if (!done.includes(k, 0)) {
                if (user[k] == undefined && k!="") continue;
                this.EditProp(k, user[k][0], (k==".FILENAME"), container);
            }

        const ok_click = btnOK.onclick;

        btnOK.value = "Save";
        btnOK.onclick = ()=> {
            btnOK.setAttribute("disabled", true);
            let payload = "";
            for (let k in this.hashEdit)
                payload += this.hashEdit[k][1].value + String.fromCharCode(127) + this.hashEdit[k][2].value + String.fromCharCode(127);

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

                        for (let i=0; i<$w.array.length; i++) //update userlist
                            if ($w.array[i] instanceof UserList) {
                                let elements = $w.array[i].content.querySelectorAll("[id=u"+this.filename+"]");
                                for (let j=0; j<elements.length; j++) {
                                    elements[j].innerHTML = "";
                                    $w.array[i].FillElement(elements[j], obj);
                                }
                                $w.array[i].AfterResize();
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

        return [this.hashEdit, btnAdd, container];
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
                    this.hashEdit = {};
                    const obj = this.Edit(user);
                    const btnAdd    = obj[1];
                    const container = obj[2];
                    this.Verify_Compare(split, container);
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

    Verify_Compare(split, container) {
        for (let i=0; i<split.length-1; i+=2) 
            if (this.hashEdit.hasOwnProperty(split[i])) {
                if (this.hashEdit[split[i]][2].value.toLowerCase() == split[i+1].toLowerCase())
                    this.hashEdit[split[i]][2].style.backgroundImage = "url(res/check.svgz)";
                else {
                    this.hashEdit[split[i]][2].style.backgroundImage = "url(res/change.svgz)";
                    this.hashEdit[split[i]][2].value = split[i+1];
                }                
            } else {
                let entry = this.EditProp(split[i], split[i+1], false, container);
                if (entry != undefined) entry[2].style.backgroundImage = "url(res/newentry.svgz)";
            }
    }

    EditProp(name, value, readonly, container) {
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
            delete this.hashEdit[name];
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
        this.hashEdit[key] = [newProperty, txtName, txtValue];
        return this.hashEdit[key];
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

                        for (let i=0; i<$w.array.length; i++)
                            if ($w.array[i] instanceof UserList) {

                                for (let j = 0; j < $w.array[i].list.length; j++)
                                    if ($w.array[i].list[j][".FILENAME"][0] == this.filename)
                                        $w.array[i].list.splice(j, 1);

                                let elements = $w.array[i].content.querySelectorAll("[id=u" + this.filename + "]");
                                for (let j=0; j<elements.length; j++)
                                    $w.array[i].content.removeChild(elements[j]);

                                $w.array[i].AfterResize();
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