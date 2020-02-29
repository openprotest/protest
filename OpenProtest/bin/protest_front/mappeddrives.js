class MappedDrives extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='mappeddrives.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "mappeddrives.css";
            document.head.appendChild(csslink);
        }

        if (document.head.querySelectorAll("link[href$='equiplist.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "equiplist.css";
            document.head.appendChild(csslink);
        }

        super();

        this.selectedDevice = "";
        this.selectedUser = "";

        this.setTitle("Mapped drives");
        this.setIcon("res/mappeddrive.svgz");
        
        this.content.style.overflowX = "auto";
        this.content.style.display = "grid";
        this.content.style.gridTemplateColumns = "minmax(236px,15%) auto auto";
        this.content.style.gridTemplateRows = "56px auto";

        let search_box = document.createElement("div");
        search_box.className = "mapped-search-box";
        this.content.appendChild(search_box);

        this.txtSearch = document.createElement("input");
        this.txtSearch.type = "text";
        this.txtSearch.placeholder = "Search";
        search_box.appendChild(this.txtSearch);

        this.list = document.createElement("div");
        this.list.className = "no-results mapped-user-list";
        this.content.appendChild(this.list);

        let user_opt = document.createElement("div");
        user_opt.style.gridArea = "1 / 2";
        this.content.appendChild(user_opt);

        this.div_target_user = document.createElement("div");
        this.div_target_user.className = "mapped-target";
        this.div_target_user.setAttribute("label", "no user");
        user_opt.appendChild(this.div_target_user);

        this.div_target_user_icon = document.createElement("div");
        this.div_target_user_icon.style.backgroundImage = "url(res/user.svgz)";
        this.div_target_user.appendChild(this.div_target_user_icon);

        let pc_opt = document.createElement("div");
        pc_opt.style.textAlign = "right";
        pc_opt.style.gridArea = "1 / 3";
        this.content.appendChild(pc_opt);

        this.div_target_pc = document.createElement("div");
        this.div_target_pc.className = "mapped-target";
        this.div_target_pc.setAttribute("label", "no device");
        this.div_target_pc.style.cursor = "pointer";
        pc_opt.appendChild(this.div_target_pc);

        this.div_target_pc_icon = document.createElement("div");
        this.div_target_pc_icon.style.backgroundImage = "url(res/gear.svgz)";
        this.div_target_pc.appendChild(this.div_target_pc_icon);
        
        let user_profile = document.createElement("div");
        user_profile.className = "no-results mapped-user-record";
        this.content.appendChild(user_profile);

        let pc_profile = document.createElement("div");
        pc_profile.className = "no-results mapped-pc-record";
        this.content.appendChild(pc_profile);

        this.txtSearch.oninput = () => { this.ListUsers(); };

        this.div_target_user.ondblclick = () => {
            this.list.style.animation = "focus-pop .2s";
            setTimeout(() => {
                this.list.style.animation = "none";
            }, ANIM_DURATION);
        };

        this.div_target_pc.onclick = () => { this.ListEquip(); };

        this.WaitLoader();
        this.AfterResize();
    }

    WaitLoader() {
        if (!db_users || db_users == null) 
            setTimeout(() => this.WaitLoader(), 200);
        else
            this.ListUsers();
    }

    ListUsers() {
        let filter = this.txtSearch.value.toLowerCase();
        this.list.innerHTML = "";

        let current = null;

        {
            let global = document.createElement("div");
            this.list.appendChild(global);

            let icon = document.createElement("div");
            icon.style.backgroundImage = "url(res/earth.svgz)";
            global.appendChild(icon);

            let label = document.createElement("div");
            label.innerHTML = "GLOBAL";
            global.appendChild(label);

            global.onclick = () => {
                if (current) current.style.backgroundColor = "rgba(0,0,0,0)";
                global.style.backgroundColor = "var(--select-color)";
                current = global;

                this.selectedUser = label.innerHTML;
                this.GetUserProfile();

                this.div_target_user.setAttribute("label", "GLOBAL");
                this.div_target_user_icon.style.backgroundImage = "url(res/earth.svgz)";
            };
        }

        {
            let newGroup = document.createElement("div");
            this.list.appendChild(newGroup);

            let icon = document.createElement("div");
            icon.style.backgroundImage = "url(res/department.svgz)";
            newGroup.appendChild(icon);

            let label = document.createElement("div");
            label.innerHTML = "Group test";
            newGroup.appendChild(label);

            newGroup.onclick = () => {
                if (current) current.style.backgroundColor = "rgba(0,0,0,0)";
                newGroup.style.backgroundColor = "var(--select-color)";
                current = newGroup;

                this.selectedUser = label.innerHTML;
                this.GetUserProfile();

                this.div_target_user.setAttribute("label", label.innerHTML);
                this.div_target_user_icon.style.backgroundImage = "url(res/department.svgz)";
            };
        }

        for (let i = 0; i < db_users.length; i++) {
            if (!db_users[i].hasOwnProperty("PASSWORD")) continue;
            if (!db_users[i].hasOwnProperty("USERNAME")) continue;
            if (db_users[i]["USERNAME"][0].length == 0) continue;
            if (db_users[i]["USERNAME"][0].toLowerCase().indexOf(filter) == -1) continue;

            let newUser = document.createElement("div");
            this.list.appendChild(newUser);

            newUser.appendChild(document.createElement("div")); //icon
            
            let label = document.createElement("div");
            label.innerHTML = db_users[i]["USERNAME"][0];
            newUser.appendChild(label);

            newUser.onclick = () => {
                if (current) current.style.backgroundColor = "rgba(0,0,0,0)";
                newUser.style.backgroundColor = "var(--select-color)";
                current = newUser;

                this.selectedUser = db_users[i][".FILENAME"][0];
                this.GetUserProfile();

                this.div_target_user.setAttribute("label", label.innerHTML);
                this.div_target_user_icon.style.backgroundImage = "url(res/user.svgz)";
            };
        }
    }

    ListEquip() {
        const dialog   = this.DialogBox("640px");
        const btnOK    = dialog.btnOK;
        const innerBox = dialog.innerBox;

        let txtSearch_eq = document.createElement("input");
        txtSearch_eq.type = "text";
        txtSearch_eq.placeholder = "Search devices";
        txtSearch_eq.style.width = "200px";
        txtSearch_eq.style.margin = "8px 16px 0px 8px";
        innerBox.appendChild(txtSearch_eq);

        let chkAdServEnabled = document.createElement("input");
        chkAdServEnabled.type = "checkbox";
        chkAdServEnabled.checked = true;
        //innerBox.appendChild(chkAdServEnabled);
        //this.AddCheckBoxLabel(innerBox, chkAdServEnabled, "Show only MS Dir. Services enabled devices");

        let list_target = document.createElement("div");
        list_target.className = "no-results";
        list_target.style.position = "absolute";
        list_target.style.left = "8px";
        list_target.style.right = "8px";
        list_target.style.top = "48px";
        list_target.style.bottom = "8px";
        list_target.style.overflowY = "scroll";
        innerBox.appendChild(list_target);
        
        txtSearch_eq.oninput = () => {
            list_target.innerHTML = "";

            let keywords = [];
            if (txtSearch_eq.value.trim().length > 0)
                keywords = txtSearch_eq.value.trim().toLowerCase().split(" ");

            for (let i = 0; i < db_equip.length; i++) {
                if (!db_equip[i].hasOwnProperty("IP")) continue;
                if (db_equip[i]["IP"][0].length == 0) continue;

                if (chkAdServEnabled.checked) {
                    if (!db_equip[i].hasOwnProperty("PORTS")) continue;
                    let ports = db_equip[i]["PORTS"][0].split(";").map(o => o.trim());
                    if (!ports.includes("445")) continue;
                }

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

                let element = document.createElement("div");
                element.className = "eql-element";
                this.content.appendChild(element);

                let icon = document.createElement("div");
                icon.className = "eql-icon";
                icon.style.backgroundImage = "url(" + GetIcon(db_equip[i]["TYPE"]) + ")";
                element.appendChild(icon);

                for (let j = 0; j < 6; j++) {
                    if (!db_equip[i].hasOwnProperty(EQUIP_LIST_ORDER[j])) continue;

                    let newLabel = document.createElement("div");
                    newLabel.innerHTML = db_equip[i][EQUIP_LIST_ORDER[j]][0];
                    newLabel.className = "eql-label" + j;
                    element.appendChild(newLabel);

                    list_target.appendChild(element);

                    element.ondblclick = () => {
                        this.div_target_pc_icon.style.backgroundImage = "url(" + GetIcon(db_equip[i]["TYPE"]) + ")";
                        this.div_target_pc.setAttribute("label", db_equip[i]["IP"][0].split(";")[0].trim());
                        btnOK.onclick();

                        this.selectedDevice = db_equip[i]["IP"][0].split(";")[0].trim();
                        this.GetPcProfile();
                    };
                }
            }
        };      

        chkAdServEnabled.onchange = () => { txtSearch_eq.oninput(); };

        btnOK.style.display = "none";
        txtSearch_eq.focus();
        txtSearch_eq.oninput();
    }

    GetUserProfile() {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) { //OK
            }

            if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("GET", "getnetdrives&" + this.selectedUser, true);
        xhr.send();
    }

    GetPcProfile() {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) { //OK
            }

            if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("GET", "getnetdrives&host=" + this.selectedDevice + "&user=" + this.selectedUser, true);
        xhr.send();
    }

}
