class Fetch extends Tabs {
    constructor(args) {
        super();

        this.args = args ? args : {value:""};

        this.setTitle("Fetch");
        this.setIcon("res/fetch.svgz");

        this.txtDomain = document.createElement("input");
        this.ipFrom = new IpBox();
        this.ipTo = new IpBox();

        let tabEquipIp = this.AddTab("Equipment", "res/gear.svgz", "from IP range");
        let tabEquipDc = this.AddTab("Equipment", "res/gear.svgz", "from DC");
        let tabUsersDc = this.AddTab("Users",     "res/user.svgz", "from DC");
        let tabProtest = this.AddTab("Database",  "res/logo.svgz", "from other Pro-test");

        tabEquipIp.style.height = "42px";
        tabEquipDc.style.height = "42px";
        tabUsersDc.style.height = "42px";
        tabProtest.style.height = "42px";

        tabEquipIp.onclick = () => this.ShowEquipIp();
        tabEquipDc.onclick = () => this.ShowEquipDc();
        tabUsersDc.onclick = () => this.ShowUsersDc();
        tabProtest.onclick = () => this.ShowProtest();

        switch (this.args.value) {
            case "equipdc":
                tabEquipDc.className = "v-tab-selected";
                tabEquipDc.onclick();
                break;

            case "usersdc":
                tabUsersDc.className = "v-tab-selected";
                tabUsersDc.onclick();
                break;

            case "protest":
                tabProtest.className = "v-tab-selected";
                tabProtest.onclick();
                break;

            default:
                tabEquipIp.className = "v-tab-selected";
                tabEquipIp.onclick();
        }

        this.subContent.style.display = "grid";
        this.subContent.style.gridTemplateColumns = "auto 100px 150px 8px 200px 50px auto";
        this.subContent.style.gridTemplateRows = "repeat(14, 32px)";
        this.subContent.style.alignItems = "center";
        this.subContent.style.overflow = "auto";

        this.GetCurrentNetworkInfo();
    }

    GetCurrentNetworkInfo() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let json = JSON.parse(xhr.responseText);

                let firstAddress = json.firstIp ? json.firstIp.split(".") : [10,0,0,1];
                let lastAddress  = json.lastIp  ? json.lastIp.split(".") : [10,0,0,254];
                let domain       = json.domain  ? json.domain : "";

                this.ipFrom.SetIp(firstAddress[0], firstAddress[1], firstAddress[2], firstAddress[3]);
                this.ipTo.SetIp(lastAddress[0], lastAddress[1], lastAddress[2], lastAddress[3]);
                this.txtDomain.value = domain;

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "getcurrentnetworkinfo", true);
        xhr.send();
    }

    ShowEquipIp() {
        this.args.value = "equipip";

        this.subContent.innerHTML = "";

        const btnOK = document.createElement("input");
        const btnCancel = document.createElement("input");

        this.ipFrom.exitElement = this.ipTo.textBoxes[0];
        this.ipTo.enterElement = this.ipFrom.textBoxes[3];
        this.ipTo.exitElement = btnOK;

        let divFrom = document.createElement("div");
        divFrom.style.gridArea = "2 / 2 / auto / 7";
        divFrom.style.textAlign = "center";
        this.subContent.appendChild(divFrom);

        let lblFrom = document.createElement("div");
        lblFrom.innerHTML = "From ";
        lblFrom.style.display = "inline";
        divFrom.appendChild(lblFrom);

        this.ipFrom.Attach(divFrom);

        let lblTo = document.createElement("div");
        lblTo.innerHTML = " to ";
        lblTo.style.display = "inline";
        divFrom.appendChild(lblTo);

        this.ipTo.Attach(divFrom);

        const buttonsContainer = document.createElement("div");
        buttonsContainer.style.gridArea = "10 / 2 / auto / 7";
        buttonsContainer.style.textAlign = "center";
        this.subContent.appendChild(buttonsContainer);
        
        btnOK.type = "button";
        btnOK.value = "Fetch";
        btnOK.style.minWidth = "96px";
        btnOK.style.height = "28px";
        buttonsContainer.appendChild(btnOK);
        
        btnCancel.type = "button";
        btnCancel.value = "Close";
        btnCancel.style.minWidth = "96px";
        btnCancel.style.height = "28px";
        buttonsContainer.appendChild(btnCancel);

        btnOK.onclick = () => { };
        btnCancel.onclick = () => this.Close();
    }

    ShowEquipDc() {
        this.args.value = "equipdc";

        this.subContent.innerHTML = "";

        const lblDomain = document.createElement("div");
        lblDomain.innerHTML = "Domain: ";
        lblDomain.style.gridArea = "2 / 3";
        this.subContent.appendChild(lblDomain);

        
        this.txtDomain.type = "text";
        this.txtDomain.innerHTML = "Domain: ";
        this.txtDomain.style.gridArea = "2 / 5";
        this.subContent.appendChild(this.txtDomain);


        const buttonsContainer = document.createElement("div");
        buttonsContainer.style.gridArea = "10 / 2 / auto / 7";
        buttonsContainer.style.textAlign = "center";
        this.subContent.appendChild(buttonsContainer);

        const btnOK = document.createElement("input");
        btnOK.type = "button";
        btnOK.value = "Fetch";
        btnOK.style.minWidth = "96px";
        btnOK.style.height = "28px";
        buttonsContainer.appendChild(btnOK);

        const btnCancel = document.createElement("input");
        btnCancel.type = "button";
        btnCancel.value = "Close";
        btnCancel.style.minWidth = "96px";
        btnCancel.style.height = "28px";
        buttonsContainer.appendChild(btnCancel);

        btnOK.onclick = () => { };
        btnCancel.onclick = () => this.Close();
    }

    ShowUsersDc() {
        this.args.value = "usersdc";

        this.subContent.innerHTML = "";

        const lblDomain = document.createElement("div");
        lblDomain.innerHTML = "Domain: ";
        lblDomain.style.gridArea = "2 / 3";
        this.subContent.appendChild(lblDomain);


        this.txtDomain.type = "text";
        this.txtDomain.innerHTML = "Domain: ";
        this.txtDomain.style.gridArea = "2 / 5";
        this.subContent.appendChild(this.txtDomain);


        const buttonsContainer = document.createElement("div");
        buttonsContainer.style.gridArea = "10 / 2 / auto / 7";
        buttonsContainer.style.textAlign = "center";
        this.subContent.appendChild(buttonsContainer);

        const btnOK = document.createElement("input");
        btnOK.type = "button";
        btnOK.value = "Fetch";
        btnOK.style.minWidth = "96px";
        btnOK.style.height = "28px";
        buttonsContainer.appendChild(btnOK);

        const btnCancel = document.createElement("input");
        btnCancel.type = "button";
        btnCancel.value = "Close";
        btnCancel.style.minWidth = "96px";
        btnCancel.style.height = "28px";
        buttonsContainer.appendChild(btnCancel);

        btnOK.onclick = () => { };
        btnCancel.onclick = () => this.Close();
    }

    ShowProtest() {
        this.args.value = "protest";

        this.subContent.innerHTML = "";

        const lblProtest = document.createElement("div");
        lblProtest.style.gridArea = "2 / 3";
        lblProtest.innerHTML = "Targets IP: ";
        this.subContent.appendChild(lblProtest);

        const txtTargetContainer = document.createElement("div");
        txtTargetContainer.style.gridArea = "2 / 5";
        this.subContent.appendChild(txtTargetContainer);
        const txtTarget = new IpBox();
        txtTarget.SetIp(127,0,0,1);
        txtTarget.Attach(txtTargetContainer);


        const lblPort = document.createElement("div");
        lblPort.style.gridArea = "3 / 3";
        lblPort.innerHTML = "Port: ";
        this.subContent.appendChild(lblPort);

        const txtPort = document.createElement("input");
        txtPort.type = "number";
        txtPort.min = "1";
        txtPort.max = "65535";
        txtPort.value = "443";
        txtPort.style.gridArea = "3 / 5";
        txtPort.style.marginLeft = "0";
        txtPort.style.width = "160px";
        this.subContent.appendChild(txtPort);
        txtTarget.exitElement = txtPort;

        const lblProtocol = document.createElement("div");
        lblProtocol.style.gridArea = "4 / 3";
        lblProtocol.innerHTML = "Protocol: ";
        this.subContent.appendChild(lblProtocol);

        const txtProtocol = document.createElement("select");
        txtProtocol.style.gridArea = "4 / 5";
        txtProtocol.style.marginLeft = "0";
        txtProtocol.style.width = "calc(160px + 16px)";
        this.subContent.appendChild(txtProtocol);

        const optHttp = document.createElement("option");
        optHttp.text = "HTTP";
        optHttp.value = "http";
        txtProtocol.appendChild(optHttp);
        const optHttps = document.createElement("option");
        optHttps.text = "HTTPs";
        optHttps.value = "https";
        txtProtocol.appendChild(optHttps);

        txtProtocol.value = "https";

        const lblUsername = document.createElement("div");
        lblUsername.style.gridArea = "5 / 3";
        lblUsername.innerHTML = "Username: ";
        this.subContent.appendChild(lblUsername);

        const txtUsername = document.createElement("input");
        txtUsername.type = "text";
        txtUsername.placeholder = ".\\administrator";
        txtUsername.style.gridArea = "5 / 5";
        txtUsername.style.marginLeft = "0";
        txtUsername.style.width = "160px";
        this.subContent.appendChild(txtUsername);


        const lblPassword = document.createElement("div");
        lblPassword.style.gridArea = "6 / 3";
        lblPassword.innerHTML = "Password: ";
        this.subContent.appendChild(lblPassword);

        const txtPassword = document.createElement("input");
        txtPassword.type = "password";
        txtPassword.style.gridArea = "6 / 5";
        txtPassword.style.marginLeft = "0";
        txtPassword.style.width = "160px";
        this.subContent.appendChild(txtPassword);


        const lblEquip = document.createElement("div");
        lblEquip.style.gridArea = "7 / 3";
        lblEquip.innerHTML = "Import equipment: ";
        this.subContent.appendChild(lblEquip);

        const chkEquipContainer = document.createElement("div");
        chkEquipContainer.style.gridArea = "7 / 5";
        this.subContent.appendChild(chkEquipContainer);
        const chkEquip = document.createElement("input");
        chkEquip.type = "checkbox";
        chkEquip.checked = true;
        chkEquipContainer.appendChild(chkEquip);
        this.AddCheckBoxLabel(chkEquipContainer, chkEquip, "&nbsp;").style="width:4px; min-width:4px";

        const lblUsers = document.createElement("div");
        lblUsers.style.gridArea = "8 / 3";
        lblUsers.innerHTML = "Import users: ";
        this.subContent.appendChild(lblUsers);

        const chkUsersContainer = document.createElement("div");
        chkUsersContainer.style.gridArea = "8 / 5";
        this.subContent.appendChild(chkUsersContainer);
        const chkUsers = document.createElement("input");
        chkUsers.type = "checkbox";
        chkUsers.checked = true;
        chkUsersContainer.appendChild(chkUsers);
        this.AddCheckBoxLabel(chkUsersContainer, chkUsers, "&nbsp;").style = "width:4px; min-width:4px";

        const buttonsContainer = document.createElement("div");
        buttonsContainer.style.gridArea = "10 / 2 / auto / 7";        
        buttonsContainer.style.textAlign = "center";
        this.subContent.appendChild(buttonsContainer);

        const btnOK = document.createElement("input");
        btnOK.type = "button";
        btnOK.value = "Fetch";
        btnOK.style.minWidth = "96px";
        btnOK.style.height = "28px";
        buttonsContainer.appendChild(btnOK);

        const btnCancel = document.createElement("input");
        btnCancel.type = "button";
        btnCancel.value = "Close";
        btnCancel.style.minWidth = "96px";
        btnCancel.style.height = "28px";
        buttonsContainer.appendChild(btnCancel);

        const description = document.createElement("div");
        description.innerHTML = "Use this utility to import entries from another Pro-tests database.<br>It is recommended to import on a blank database. Conflicts and duplicate records will not be managed.";
        description.style.gridArea = "12 / 2 / 14 / 7";  
        this.subContent.appendChild(description);

        btnCancel.onclick = () => this.Close();

        btnOK.onclick = () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "fetch_importdata", true);
            xhr.send(`ip=${txtTarget.GetIpString()}&port=${txtPort.value}&protocol=${txtProtocol.value}&username=${txtUsername.value}&password=${txtPassword.value}&equip=${chkEquip.checked}&users=${chkUsers.checked}`);
        };
    }

}