class Fetch extends Window {
    constructor() {
        super();
        this.setTitle("Fetch");
        this.setIcon("res/fetch.svgz");

        this.win.style.height = "60%";

        this.content.style.overflowY = "auto";
        this.InitializeComponents();

        this.escAction = () => { this.Close(); };

        this.GetCurrentNetworkInfo();
    }

    GetCurrentNetworkInfo() {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length == 1) return;

                let firstAddress = split[0].split(".");
                let lastAddress = split[1].split(".");
                let domain = split[2];               

                this.ipFrom.SetIp(firstAddress[0], firstAddress[1], firstAddress[2], firstAddress[3]);
                this.ipTo.SetIp(lastAddress[0], lastAddress[1], lastAddress[2], lastAddress[3]);
                this.txtDomain.value = domain;

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "getcurrentnetworkinfo", true);
        xhr.send();
    }

    InitializeComponents() {
        let div1 = document.createElement("div");
        div1.style.textAlign = "center";
        div1.style.paddingTop = "24px";
        this.content.appendChild(div1);

        let div2 = document.createElement("div");
        div2.style.textAlign = "center";
        div2.style.paddingTop = "16px";
        div2.style.backgroundColor = "rgb(96,96,96)";
        div2.style.borderRadius = "4px 4px 0 0";
        div2.style.margin = "0 8px 0 8px";
        this.content.appendChild(div2);

        let div3_0 = document.createElement("div");
        div3_0.style.paddingTop = "16px";
        div3_0.style.backgroundColor = "rgb(96,96,96)";
        div3_0.style.paddingBottom = "8px";
        div3_0.style.borderRadius = "0 0 4px 4px";
        div3_0.style.margin = "0 8px 0 8px";
        this.content.appendChild(div3_0);

        let div3 = document.createElement("div");
        div3.style.paddingTop = "16px";
        div3.style.maxWidth = "480px";
        div3.style.height = "220px";
        div3.style.margin = "auto";
        div3.style.padding = "8px 16px";
        div3.style.borderRadius = "2px";
        div3.style.overflow = "hidden";
        div3.style.transition = ".2s";
        div3_0.appendChild(div3);

        let div4 = document.createElement("div");
        div4.style.textAlign = "center";
        div4.style.paddingTop = "16px";
        div4.style.paddingBottom = "16px";
        this.content.appendChild(div4);

        let btnEquipIP = document.createElement("button");
        btnEquipIP.innerHTML = "Fetch equipment";
        btnEquipIP.style.whiteSpace = "nowrap";
        btnEquipIP.style.minWidth = "0";
        btnEquipIP.style.maxWidth = "200px";
        btnEquipIP.style.width = "calc(33% - 24px)";
        btnEquipIP.style.height = "64px";
        btnEquipIP.style.color = "#C0C0C0";
        btnEquipIP.style.backgroundColor = "rgb(72,72,72)";
        btnEquipIP.style.backgroundImage = "url(res/l_gear.svgz)";
        btnEquipIP.style.backgroundRepeat = "no-repeat";
        btnEquipIP.style.backgroundSize = "40px 40px";
        btnEquipIP.style.backgroundPosition = "4px center";
        btnEquipIP.style.boxSizing = "content-box";
        btnEquipIP.style.borderRadius = "8px 8px 0 0";
        btnEquipIP.style.border = "0";
        btnEquipIP.style.marginBottom = "0";
        btnEquipIP.style.overflow = "hidden";
        btnEquipIP.style.animation = "none";
        div1.appendChild(btnEquipIP);

        let subEquipIP = document.createElement("div");
        subEquipIP.innerHTML = "(from IP range)";
        subEquipIP.style.fontSize = "small";
        subEquipIP.style.fontStyle = "italic";
        btnEquipIP.appendChild(subEquipIP);

        let btnEquipAD = document.createElement("button");
        btnEquipAD.style.whiteSpace = "nowrap";
        btnEquipAD.innerHTML = "Fetch equipment";
        btnEquipAD.style.minWidth = "0";
        btnEquipAD.style.maxWidth = "200px";
        btnEquipAD.style.width = "calc(33% - 24px)";
        btnEquipAD.style.height = "64px";
        btnEquipAD.style.color = "#C0C0C0";
        btnEquipAD.style.backgroundColor = "rgb(72,72,72)";
        btnEquipAD.style.backgroundImage = "url(res/l_gear.svgz)";
        btnEquipAD.style.backgroundRepeat = "no-repeat";
        btnEquipAD.style.backgroundSize = "40px 40px";
        btnEquipAD.style.backgroundPosition = "4px center";
        btnEquipAD.style.boxSizing = "content-box";
        btnEquipAD.style.borderRadius = "8px 8px 0 0";
        btnEquipAD.style.border = "0";
        btnEquipAD.style.marginBottom = "0";
        btnEquipAD.style.overflow = "hidden";
        btnEquipAD.style.animation = "none";
        div1.appendChild(btnEquipAD);

        let subEquipAD = document.createElement("div");
        subEquipAD.innerHTML = "(from domain)";
        subEquipAD.style.fontSize = "small";
        subEquipAD.style.fontStyle = "italic";
        btnEquipAD.appendChild(subEquipAD);

        let btnUsersAD = document.createElement("button");
        btnUsersAD.style.whiteSpace = "nowrap";
        btnUsersAD.innerHTML = "Fetch users";
        btnUsersAD.style.minWidth = "0";
        btnUsersAD.style.maxWidth = "200px";
        btnUsersAD.style.width = "calc(33% - 24px)";
        btnUsersAD.style.height = "64px";
        btnUsersAD.style.color = "#C0C0C0";
        btnUsersAD.style.backgroundColor = "rgb(72,72,72)";
        btnUsersAD.style.backgroundImage = "url(res/l_user.svgz)";
        btnUsersAD.style.backgroundRepeat = "no-repeat";
        btnUsersAD.style.backgroundSize = "40px 40px";
        btnUsersAD.style.backgroundPosition = "4px center";
        btnUsersAD.style.boxSizing = "content-box";
        btnUsersAD.style.borderRadius = "8px 8px 0 0";
        btnUsersAD.style.border = "0";
        btnUsersAD.style.marginBottom = "0";
        btnUsersAD.style.overflow = "hidden";
        btnUsersAD.style.animation = "none";
        div1.appendChild(btnUsersAD);

        let subUsersAD = document.createElement("div");
        subUsersAD.innerHTML = "(from domain)";
        subUsersAD.style.fontSize = "small";
        subUsersAD.style.fontStyle = "italic";
        btnUsersAD.appendChild(subUsersAD);

        /* - - - options - - - */

        let lblPortScan = document.createElement("div");
        lblPortScan.innerHTML = "Port scan: ";
        lblPortScan.style.width = "40%";
        lblPortScan.style.marginTop = "4px";
        div3.appendChild(lblPortScan);
        let selPortScan = document.createElement("select");
        selPortScan.style.width = "50%";
        div3.appendChild(selPortScan);
        this.AddSelectOption(selPortScan, "No port scan", "no");
        this.AddSelectOption(selPortScan, "Basic", "ba");
        this.AddSelectOption(selPortScan, "Full", "fu");

        let lblDuplicate = document.createElement("div");
        lblDuplicate.innerHTML = "If duplicate: ";
        lblDuplicate.style.width = "40%";
        lblDuplicate.style.marginTop = "4px";
        div3.appendChild(lblDuplicate);
        let selDuplicate = document.createElement("select");
        selDuplicate.style.width = "50%";
        div3.appendChild(selDuplicate);
        this.AddSelectOption(selDuplicate, "Ignore -do nothing", "ig");
        this.AddSelectOption(selDuplicate, "Create new -keep both", "ne");
        this.AddSelectOption(selDuplicate, "Overwrite", "ov");
        this.AddSelectOption(selDuplicate, "Append new properties", "ap");
        //this.AddSelectOption(selDuplicate, "Merge", "me");

        let lblUnreachable = document.createElement("div");
        lblUnreachable.innerHTML = "If unreachable: ";
        lblUnreachable.style.width = "40%";
        lblUnreachable.style.marginTop = "4px";
        div3.appendChild(lblUnreachable);
        let selUnreachable = document.createElement("select");
        selUnreachable.style.width = "50%";
        div3.appendChild(selUnreachable);
        this.AddSelectOption(selUnreachable, "Do nothing", 0);
        this.AddSelectOption(selUnreachable, "Try again in an hour", 1);
        this.AddSelectOption(selUnreachable, "Try again in 2 hours", 2);
        this.AddSelectOption(selUnreachable, "Try again in 4 hours", 4);
        this.AddSelectOption(selUnreachable, "Try again in 6 hours", 6);
        this.AddSelectOption(selUnreachable, "Try again in 8 hours", 8);
        this.AddSelectOption(selUnreachable, "Try again in 12 hours", 12);
        this.AddSelectOption(selUnreachable, "Try again in 24 hours", 24);

        let lblAuthentication = document.createElement("div");
        lblAuthentication.innerHTML = "Impersonation level: ";
        lblAuthentication.style.width = "40%";
        lblAuthentication.style.marginTop = "4px";
        div3.appendChild(lblAuthentication);
        let selAuthentication = document.createElement("select");
        selAuthentication.style.width = "50%";
        div3.appendChild(selAuthentication);
        this.AddSelectOption(selAuthentication, "Anonymous", "an");
        this.AddSelectOption(selAuthentication, "Identify", "id");
        this.AddSelectOption(selAuthentication, "Impersonate", "im");
        this.AddSelectOption(selAuthentication, "Delegate", "de");

        let lblUsername = document.createElement("div");
        lblUsername.innerHTML = "Username: ";
        lblUsername.style.width = "40%";
        lblUsername.style.marginTop = "4px";
        div3.appendChild(lblUsername);
        let txtUsername = document.createElement("input");
        txtUsername.type = "text";
        txtUsername.style.width = "40%";
        txtUsername.style.marginTop = "4px";
        txtUsername.placeholder = "e.g. .\\administrator";
        div3.appendChild(txtUsername);

        let lblPassword = document.createElement("div");
        lblPassword.innerHTML = "Password: ";
        lblPassword.style.width = "40%";
        lblPassword.style.marginTop = "4px";
        div3.appendChild(lblPassword);
        let txtPassword = document.createElement("input");
        txtPassword.type = "password";
        txtPassword.style.width = "40%";
        txtPassword.style.marginTop = "4px";
        div3.appendChild(txtPassword);

        for (let i = 0; i < div3.childNodes.length; i++) { //align elemets in div3
            div3.childNodes[i].style.float = "left";
            div3.childNodes[i].style.marginBottom = "4px";
        }

        let btnOK = document.createElement("input");
        btnOK.type = "button";
        btnOK.value = "Fetch";
        btnOK.style.minWidth = "96px";
        btnOK.style.height = "32px";
        div4.appendChild(btnOK);

        let btnCancel = document.createElement("input");
        btnCancel.type = "button";
        btnCancel.value = "Close";
        btnCancel.style.minWidth = "96px";
        btnCancel.style.height = "32px";
        div4.appendChild(btnCancel);

        let option = -1;

        this.txtDomain = document.createElement("input");
        this.txtDomain.type = "text";

        this.ipFrom = new IpBox();
        this.ipTo = new IpBox();
        this.ipFrom.exitElement = this.ipTo.textBoxes[0];
        this.ipTo.enterElement = this.ipFrom.textBoxes[3];
        this.ipTo.exitElement = btnOK;

        btnEquipIP.onclick = () => { //eq-ip
            div2.innerHTML = "";

            btnEquipIP.style.backgroundColor = "rgb(96,96,96)";
            btnEquipAD.style.backgroundColor = "rgb(72,72,72)";
            btnUsersAD.style.backgroundColor = "rgb(72,72,72)";

            option = 1;

            let lblFrom = document.createElement("div");
            lblFrom.innerHTML = "From ";
            lblFrom.style.display = "inline";
            div2.appendChild(lblFrom);

            let divFrom = document.createElement("div");
            divFrom.style.display = "inline";
            div2.appendChild(divFrom);
            this.ipFrom.Attach(divFrom);

            let lblTo = document.createElement("div");
            lblTo.innerHTML = " to ";
            lblTo.style.display = "inline";
            div2.appendChild(lblTo);

            let divTo = document.createElement("div");
            divTo.style.display = "inline";
            div2.appendChild(divTo);
            this.ipTo.Attach(divTo);

            lblPortScan.style.display = selPortScan.style.display = "block";
            lblDuplicate.style.display = selDuplicate.style.display = "block";
            lblUnreachable.style.display = selUnreachable.style.display = "block";
            lblAuthentication.style.display = selAuthentication.style.display = "block";
            lblUsername.style.display = txtUsername.style.display = "block";
            lblPassword.style.display = txtPassword.style.display = "block";

            div3.style.height = "220px";
        };

        btnEquipAD.onclick = () => {
            div2.innerHTML = "";

            btnEquipIP.style.backgroundColor = "rgb(72,72,72)";
            btnEquipAD.style.backgroundColor = "rgb(96,96,96)";
            btnUsersAD.style.backgroundColor = "rgb(72,72,72)";

            option = 2;

            let lblDomain = document.createElement("div");
            lblDomain.innerHTML = "Domain: ";
            lblDomain.style.display = "inline";
            div2.appendChild(lblDomain);

            div2.appendChild(this.txtDomain);

            lblPortScan.style.display = selPortScan.style.display = "block";
            lblDuplicate.style.display = selDuplicate.style.display = "block";
            lblUnreachable.style.display = selUnreachable.style.display = "block";
            lblAuthentication.style.display = selAuthentication.style.display = "block";
            lblUsername.style.display = txtUsername.style.display = "block";
            lblPassword.style.display = txtPassword.style.display = "block";

            div3.style.height = "220px";
        };

        btnUsersAD.onclick = () => {
            div2.innerHTML = "";

            btnEquipIP.style.backgroundColor = "rgb(72,72,72)";
            btnEquipAD.style.backgroundColor = "rgb(72,72,72)";
            btnUsersAD.style.backgroundColor = "rgb(96,96,96)";

            option = 3;

            let lblDomain = document.createElement("div");
            lblDomain.innerHTML = "Domain: ";
            lblDomain.style.display = "inline";
            div2.appendChild(lblDomain);

            div2.appendChild(this.txtDomain);

            lblPortScan.style.display = selPortScan.style.display = "none";
            lblDuplicate.style.display = selDuplicate.style.display = "block";
            lblUnreachable.style.display = selUnreachable.style.display = "none";
            lblAuthentication.style.display = selAuthentication.style.display = "none";
            lblUsername.style.display = txtUsername.style.display = "none";
            lblPassword.style.display = txtPassword.style.display = "none";

            div3.style.height = "32px";
        };

        this.txtDomain.onchange = () => {
            txtUsername.placeholder = "e.g. " + (this.txtDomain.value.length > 0 ? this.txtDomain.value : ".") + "\\administrator";
        };

        btnOK.onclick = () => {
            let query = "";

            if (option == 1) { //eq-ip
                if (this.ipFrom.GetIpDecimal() > this.ipTo.GetIpDecimal()) {
                    this.ConfirmBox("Enter valid IP range and try again.", true);
                    return;
                }
                query = "fetchequip&ip=" + this.ipFrom.GetIpString() + "-" + this.ipTo.GetIpString();
                query += "&portscan=" + selPortScan.value;
                query += "&dublicate=" + selDuplicate.value;
                query += "&unreachable=" + selUnreachable.value;
                query += "&implevel=" + selAuthentication.value;
                query += "&un=" + txtUsername.value;
                query += "&ps=" + txtPassword.value;
            } else if (option == 2) { //eq-ad
                if (this.txtDomain.value.length == 0) {
                    this.ConfirmBox("Enter domain and try again.", true);
                    return;
                }
                query = "fetchequip&domain=" + this.txtDomain.value;
                query += "&portscan=" + selPortScan.value;
                query += "&dublicate=" + selDuplicate.value;
                query += "&unreachable=" + selUnreachable.value;
                query += "&implevel=" + selAuthentication.value;
                query += "&un=" + txtUsername.value;
                query += "&ps=" + txtPassword.value;

            } else if (option == 3) { //us-ad
                if (this.txtDomain.value.length == 0) {
                    this.ConfirmBox("Enter domain and try again.", true);
                    return;
                }
                query = "fetchusers&domain=" + this.txtDomain.value;
                query += "&dublicate=" + selDuplicate.value;
            }

            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) //OK
                    this.ConfirmBox("A task has been created and started.", true).onclick = ()=> {
                        this.Close();
                    };

                if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            xhr.open("POST", query, true);
            xhr.send();
        };

        btnCancel.onclick = ()=> this.Close();

        selDuplicate.value = "ap";
        selAuthentication.value = "im";
        selPortScan.value = "ba";

        btnEquipIP.onclick();
    }

    AddSelectOption(select, optionText, optionValue) {
        let newOption = document.createElement("option");
        newOption.innerHTML = optionText;
        newOption.value = optionValue;
        select.appendChild(newOption);
    }
}