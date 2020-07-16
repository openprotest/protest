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
        let tabEquipDc = this.AddTab("Equipment", "res/gear.svgz", "from a domain");
        let tabUsersDc = this.AddTab("Users",     "res/user.svgz", "from a domain");
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
        this.subContent.style.gridTemplateRows = "24px 36px 16px repeat(10, 36px)";
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


        const lblPortscan = document.createElement("div");
        lblPortscan.style.gridArea = "4 / 3";
        lblPortscan.innerHTML = "Port-scan: ";
        this.subContent.appendChild(lblPortscan);
        const txtPortscan = document.createElement("select");
        txtPortscan.style.gridArea = "4 / 5";
        txtPortscan.style.marginLeft = "0";
        txtPortscan.style.width = "160px";
        this.subContent.appendChild(txtPortscan);
        const lblPortscanComment = document.createElement("div");
        lblPortscanComment.style.gridArea = "4 / 6 / auto / 8";
        lblPortscanComment.style.fontSize = "small";
        lblPortscanComment.style.width = "240px";
        this.subContent.appendChild(lblPortscanComment);

        const optNoScan = document.createElement("option");
        optNoScan.text = "No scan";
        optNoScan.value = "0";
        txtPortscan.appendChild(optNoScan);
        const optBasic = document.createElement("option");
        optBasic.text = "Basic";
        optBasic.value = "1";
        txtPortscan.appendChild(optBasic);
        const optFull = document.createElement("option");
        optFull.text = "Full";
        optFull.value = "2";
        txtPortscan.appendChild(optFull);

        txtPortscan.value = "1";

        const lblConflictContition = document.createElement("div");
        lblConflictContition.style.gridArea = "5 / 3";
        lblConflictContition.innerHTML = "Conflict contition:";
        this.subContent.appendChild(lblConflictContition);
        const txtConflictContition = document.createElement("select");
        txtConflictContition.style.gridArea = "5 / 5";
        txtConflictContition.style.marginLeft = "0";
        txtConflictContition.style.width = "160px";
        this.subContent.appendChild(txtConflictContition);
        const lblConflictContitionComment = document.createElement("div");
        lblConflictContitionComment.style.gridArea = "5 / 6 / auto / 8";
        lblConflictContitionComment.style.fontSize = "small";
        //lblConflictContitionComment.style.width = "240px";
        lblConflictContitionComment.innerHTML = "Trigger a conflict when the condition is met";
        this.subContent.appendChild(lblConflictContitionComment);

        const optIP = document.createElement("option");
        optIP.text = "Same IP";
        optIP.value = "0";
        txtConflictContition.appendChild(optIP);
        const optMAC = document.createElement("option");
        optMAC.text = "Same  MAC";
        optMAC.value = "1";
        txtConflictContition.appendChild(optMAC);
        const optSerialNo = document.createElement("option");
        optSerialNo.text = "Same serial no.";
        optSerialNo.value = "2";
        txtConflictContition.appendChild(optSerialNo);
        const optSmart = document.createElement("option");
        optSmart.text = "Smart detection (score based)";
        optSmart.value = "3";
        txtConflictContition.appendChild(optSmart);

        const lblConflict = document.createElement("div");
        lblConflict.style.gridArea = "6 / 3";
        lblConflict.innerHTML = "Conflict action:";
        this.subContent.appendChild(lblConflict);
        const txtConflict = document.createElement("select");
        txtConflict.style.gridArea = "6 / 5";
        txtConflict.style.marginLeft = "0";
        txtConflict.style.width = "160px";
        this.subContent.appendChild(txtConflict);
        const lblConflictComment = document.createElement("div");
        lblConflictComment.style.gridArea = "6 / 6 / auto / 8";
        lblConflictComment.style.fontSize = "small";
        lblConflictComment.style.width = "240px";
        this.subContent.appendChild(lblConflictComment);

        const optSkip = document.createElement("option");
        optSkip.text = "Skip";
        optSkip.value = "0";
        txtConflict.appendChild(optSkip);
        const optKeepBoth = document.createElement("option");
        optKeepBoth.text = "Keep both";
        optKeepBoth.value = "1";
        txtConflict.appendChild(optKeepBoth);
        const optOverwrite = document.createElement("option");
        optOverwrite.text = "Overwrite";
        optOverwrite.value = "2";
        txtConflict.appendChild(optOverwrite);
        const optAppend = document.createElement("option");
        optAppend.text = "Append";
        optAppend.value = "3";
        txtConflict.appendChild(optAppend);
        const optMerge = document.createElement("option");
        optMerge.text = "Merge";
        optMerge.value = "4";
        txtConflict.appendChild(optMerge);

        txtConflict.value = "4";

        const lblRetries = document.createElement("div");
        lblRetries.style.gridArea = "7 / 3";
        lblRetries.innerHTML = "Retries:";
        this.subContent.appendChild(lblRetries);
        const rngRetries = document.createElement("input");
        rngRetries.type = "range";
        rngRetries.min = 0;
        rngRetries.max = 4;
        rngRetries.value = 1;
        rngRetries.style.gridArea = "7 / 5";
        rngRetries.style.width = "160px";
        this.subContent.appendChild(rngRetries);
        const lblRetriesComment = document.createElement("div");
        lblRetriesComment.style.gridArea = "7 / 6 / auto / 8";
        lblRetriesComment.style.fontSize = "small";
        lblRetriesComment.style.width = "240px";
        this.subContent.appendChild(lblRetriesComment);

        const lblInterval = document.createElement("div");
        lblInterval.style.gridArea = "8 / 3";
        lblInterval.innerHTML = "Retry interval:";
        this.subContent.appendChild(lblInterval);
        const rngInterval = document.createElement("input");
        rngInterval.type = "range";
        rngInterval.min = 1;
        rngInterval.max = 8;
        rngInterval.value = 1;
        rngInterval.style.gridArea = "8 / 5";
        rngInterval.style.width = "160px";
        this.subContent.appendChild(rngInterval);
        const lblIntervalComment = document.createElement("div");
        lblIntervalComment.style.gridArea = "8 / 6 / auto / 8";
        lblIntervalComment.style.fontSize = "small";
        lblIntervalComment.style.width = "240px";
        this.subContent.appendChild(lblIntervalComment);


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

        txtPortscan.onchange = () => {
            switch (parseInt(txtPortscan.value)) {
                case 0: lblPortscanComment.innerHTML = ""; break;
                case 1: lblPortscanComment.innerHTML = "Scan only common protocols"; break;
                case 2: lblPortscanComment.innerHTML = "Scan all ports from 1 to 49151 (slow)"; break;
            }
        };

        txtConflict.onchange = () => {
            switch (parseInt(txtConflict.value)) {
                case 0: lblConflictComment.innerHTML = "Do nothing, keep database's record"; break;
                case 1: lblConflictComment.innerHTML = "Create a new record"; break;
                case 2: lblConflictComment.innerHTML = "Replace with fetched record"; break;
                case 3: lblConflictComment.innerHTML = "Append only new properties"; break;
                case 4: lblConflictComment.innerHTML = "Merge with fetched record"; break;
            }
        };

        rngRetries.oninput = () => {
            if (parseInt(rngRetries.value) == 0) {
                rngInterval.setAttribute("disabled", true);
                lblIntervalComment.innerHTML = "Don't try again";
            } else {
                rngInterval.removeAttribute("disabled");
                rngInterval.oninput();
            }

            if (parseInt(rngRetries.value) == 0)
                lblRetriesComment.innerHTML = "Don't try again";
            else if (parseInt(rngRetries.value) == 1)
                lblRetriesComment.innerHTML = `Try ${rngRetries.value} more time if unreachable`;
            else
                lblRetriesComment.innerHTML = `Try ${rngRetries.value} more times if unreachable`;
        };

        rngInterval.oninput = () => {
            switch (parseInt(rngInterval.value)) {
                case 1: lblIntervalComment.innerHTML = "Try again in an hour if unreachable"; break;
                case 2: lblIntervalComment.innerHTML = "Try again in 2 hours if unreachable"; break;
                case 3: lblIntervalComment.innerHTML = "Try again in 4 hours if unreachable"; break;
                case 4: lblIntervalComment.innerHTML = "Try again in 6 hours if unreachable"; break;
                case 5: lblIntervalComment.innerHTML = "Try again in 8 hours if unreachable"; break;
                case 6: lblIntervalComment.innerHTML = "Try again in 12 hours if unreachable"; break;
                case 7: lblIntervalComment.innerHTML = "Try again in 24 hours if unreachable"; break;
                case 8: lblIntervalComment.innerHTML = "Try again in 48 hours if unreachable"; break;
            }
        };

        txtPortscan.onchange();
        txtConflict.onchange();
        rngRetries.oninput();
        rngInterval.oninput();

        btnCancel.onclick = () => this.Close();

        btnOK.onclick = () => {

            console.log(this.ipFrom.GetIpString());
            console.log(this.ipTo.GetIpString());

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    //TODO:
                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            const strFrom = this.ipFrom.GetIpString();
            const strTo = this.ipTo.GetIpString();

            xhr.open("POST", "fetch_equip_ip", true);
            xhr.send(`from=${strFrom}&to=${strTo}&portscan=${txtPortscan.value}&conflictcontition=${txtConflictContition.value}&conflictaction=${txtConflict.value}&retries=${rngRetries.value}&interval=${rngInterval.value}`);
        };
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


        const lblPortscan = document.createElement("div");
        lblPortscan.style.gridArea = "4 / 3";
        lblPortscan.innerHTML = "Port-scan: ";
        this.subContent.appendChild(lblPortscan);
        const txtPortscan = document.createElement("select");
        txtPortscan.style.gridArea = "4 / 5";
        txtPortscan.style.marginLeft = "0";
        txtPortscan.style.width = "160px";
        this.subContent.appendChild(txtPortscan);
        const lblPortscanComment = document.createElement("div");
        lblPortscanComment.style.gridArea = "4 / 6 / auto / 8";
        lblPortscanComment.style.fontSize = "small";
        lblPortscanComment.style.width = "240px";
        this.subContent.appendChild(lblPortscanComment);

        const optNoScan = document.createElement("option");
        optNoScan.text = "No scan";
        optNoScan.value = "0";
        txtPortscan.appendChild(optNoScan);
        const optBasic = document.createElement("option");
        optBasic.text = "Basic";
        optBasic.value = "1";
        txtPortscan.appendChild(optBasic);
        const optFull = document.createElement("option");
        optFull.text = "Full";
        optFull.value = "2";
        txtPortscan.appendChild(optFull);

        txtPortscan.value = "1";

        const lblConflictContition = document.createElement("div");
        lblConflictContition.style.gridArea = "5 / 3";
        lblConflictContition.innerHTML = "Conflict contition:";
        this.subContent.appendChild(lblConflictContition);
        const txtConflictContition = document.createElement("select");
        txtConflictContition.style.gridArea = "5 / 5";
        txtConflictContition.style.marginLeft = "0";
        txtConflictContition.style.width = "160px";
        this.subContent.appendChild(txtConflictContition);
        const lblConflictContitionComment = document.createElement("div");
        lblConflictContitionComment.style.gridArea = "5 / 6 / auto / 8";
        lblConflictContitionComment.style.fontSize = "small";
        //lblConflictContitionComment.style.width = "240px";
        lblConflictContitionComment.innerHTML = "Trigger a conflict when the condition is met";
        this.subContent.appendChild(lblConflictContitionComment);

        const optIP = document.createElement("option");
        optIP.text = "Same IP";
        optIP.value = "0";
        txtConflictContition.appendChild(optIP);
        const optMAC = document.createElement("option");
        optMAC.text = "Same  MAC";
        optMAC.value = "1";
        txtConflictContition.appendChild(optMAC);
        const optSerialNo = document.createElement("option");
        optSerialNo.text = "Same serial no.";
        optSerialNo.value = "2";
        txtConflictContition.appendChild(optSerialNo);
        const optSmart = document.createElement("option");
        optSmart.text = "Smart detection (score based)";
        optSmart.value = "3";
        txtConflictContition.appendChild(optSmart);

        const lblConflict = document.createElement("div");
        lblConflict.style.gridArea = "6 / 3";
        lblConflict.innerHTML = "Conflict action:";
        this.subContent.appendChild(lblConflict);
        const txtConflict = document.createElement("select");
        txtConflict.style.gridArea = "6 / 5";
        txtConflict.style.marginLeft = "0";
        txtConflict.style.width = "160px";
        this.subContent.appendChild(txtConflict);
        const lblConflictComment = document.createElement("div");
        lblConflictComment.style.gridArea = "6 / 6 / auto / 8";
        lblConflictComment.style.fontSize = "small";
        lblConflictComment.style.width = "240px";
        this.subContent.appendChild(lblConflictComment);

        const optSkip = document.createElement("option");
        optSkip.text = "Skip";
        optSkip.value = "0";
        txtConflict.appendChild(optSkip);
        const optKeepBoth = document.createElement("option");
        optKeepBoth.text = "Keep both";
        optKeepBoth.value = "1";
        txtConflict.appendChild(optKeepBoth);
        const optOverwrite = document.createElement("option");
        optOverwrite.text = "Overwrite";
        optOverwrite.value = "2";
        txtConflict.appendChild(optOverwrite);
        const optAppend = document.createElement("option");
        optAppend.text = "Append";
        optAppend.value = "3";
        txtConflict.appendChild(optAppend);
        const optMerge = document.createElement("option");
        optMerge.text = "Merge";
        optMerge.value = "4";
        txtConflict.appendChild(optMerge);

        txtConflict.value = "4";

        const lblRetries = document.createElement("div");
        lblRetries.style.gridArea = "7 / 3";
        lblRetries.innerHTML = "Retries:";
        this.subContent.appendChild(lblRetries);
        const rngRetries = document.createElement("input");
        rngRetries.type = "range";
        rngRetries.min = 0;
        rngRetries.max = 4;
        rngRetries.value = 1;
        rngRetries.style.gridArea = "7 / 5";
        rngRetries.style.width = "160px";
        this.subContent.appendChild(rngRetries);
        const lblRetriesComment = document.createElement("div");
        lblRetriesComment.style.gridArea = "7 / 6 / auto / 8";
        lblRetriesComment.style.fontSize = "small";
        lblRetriesComment.style.width = "240px";
        this.subContent.appendChild(lblRetriesComment);

        const lblInterval = document.createElement("div");
        lblInterval.style.gridArea = "8 / 3";
        lblInterval.innerHTML = "Retry interval:";
        this.subContent.appendChild(lblInterval);
        const rngInterval = document.createElement("input");
        rngInterval.type = "range";
        rngInterval.min = 1;
        rngInterval.max = 8;
        rngInterval.value = 1;
        rngInterval.style.gridArea = "8 / 5";
        rngInterval.style.width = "160px";
        this.subContent.appendChild(rngInterval);
        const lblIntervalComment = document.createElement("div");
        lblIntervalComment.style.gridArea = "8 / 6 / auto / 8";
        lblIntervalComment.style.fontSize = "small";
        lblIntervalComment.style.width = "240px";
        this.subContent.appendChild(lblIntervalComment);


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

        txtPortscan.onchange = () => {
            switch (parseInt(txtPortscan.value)) {
                case 0: lblPortscanComment.innerHTML = ""; break;
                case 1: lblPortscanComment.innerHTML = "Scan only common protocols"; break;
                case 2: lblPortscanComment.innerHTML = "Scan all ports from 1 to 49151 (slow)"; break;
            }
        };

        txtConflict.onchange = () => {
            switch (parseInt(txtConflict.value)) {
                case 0: lblConflictComment.innerHTML = "Do nothing, keep database's record"; break;
                case 1: lblConflictComment.innerHTML = "Create a new record"; break;
                case 2: lblConflictComment.innerHTML = "Replace with fetched record"; break;
                case 3: lblConflictComment.innerHTML = "Append only new properties"; break;
                case 4: lblConflictComment.innerHTML = "Merge with fetched record"; break;
            }
        };

        rngRetries.oninput = () => {
            if (parseInt(rngRetries.value) == 0) {
                rngInterval.setAttribute("disabled", true);
                lblIntervalComment.innerHTML = "Don't try again";
            } else {
                rngInterval.removeAttribute("disabled");
                rngInterval.oninput();
            }

            if (parseInt(rngRetries.value) == 0)
                lblRetriesComment.innerHTML = "Don't try again";
            else if (parseInt(rngRetries.value) == 1)
                lblRetriesComment.innerHTML = `Try ${rngRetries.value} more time if unreachable`;
            else
                lblRetriesComment.innerHTML = `Try ${rngRetries.value} more times if unreachable`;
        };

        rngInterval.oninput = () => {
            switch (parseInt(rngInterval.value)) {
                case 1: lblIntervalComment.innerHTML = "Try again in an hour if unreachable"; break;
                case 2: lblIntervalComment.innerHTML = "Try again in 2 hours if unreachable"; break;
                case 3: lblIntervalComment.innerHTML = "Try again in 4 hours if unreachable"; break;
                case 4: lblIntervalComment.innerHTML = "Try again in 6 hours if unreachable"; break;
                case 5: lblIntervalComment.innerHTML = "Try again in 8 hours if unreachable"; break;
                case 6: lblIntervalComment.innerHTML = "Try again in 12 hours if unreachable"; break;
                case 7: lblIntervalComment.innerHTML = "Try again in 24 hours if unreachable"; break;
                case 8: lblIntervalComment.innerHTML = "Try again in 48 hours if unreachable"; break;
            }
        };

        txtPortscan.onchange();
        txtConflict.onchange();
        rngRetries.oninput();
        rngInterval.oninput();

        btnCancel.onclick = () => this.Close();

        btnOK.onclick = () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    //TODO:
                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "fetch_equip_dc", true);
            xhr.send(`domain=${this.txtDomain.value}&portscan=${txtPortscan.value}&conflictcontition=${txtConflictContition.value}&conflictaction=${txtConflict.value}&retries=${rngRetries.value}&interval=${rngInterval.value}`);
        };
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


        const lblConflictContition = document.createElement("div");
        lblConflictContition.style.gridArea = "4 / 3";
        lblConflictContition.innerHTML = "Conflict contition:";
        this.subContent.appendChild(lblConflictContition);
        const txtConflictContition = document.createElement("select");
        txtConflictContition.style.gridArea = "4 / 5";
        txtConflictContition.style.marginLeft = "0";
        txtConflictContition.style.width = "160px";
        this.subContent.appendChild(txtConflictContition);
        const lblConflictContitionComment = document.createElement("div");
        lblConflictContitionComment.style.gridArea = "4 / 6 / auto / 8";
        lblConflictContitionComment.style.fontSize = "small";
        //lblConflictContitionComment.style.width = "240px";
        lblConflictContitionComment.innerHTML = "Trigger a conflict when the condition is met";
        this.subContent.appendChild(lblConflictContitionComment);

        const optUN = document.createElement("option");
        optUN.text = "Same username";
        optUN.value = "0";
        txtConflictContition.appendChild(optUN);
        const optSmart = document.createElement("option");
        optSmart.text = "Smart detection (score based)";
        optSmart.value = "3";
        txtConflictContition.appendChild(optSmart);

        const lblConflict = document.createElement("div");
        lblConflict.style.gridArea = "5 / 3";
        lblConflict.innerHTML = "Conflict action:";
        this.subContent.appendChild(lblConflict);
        const txtConflict = document.createElement("select");
        txtConflict.style.gridArea = "5 / 5";
        txtConflict.style.marginLeft = "0";
        txtConflict.style.width = "160px";
        this.subContent.appendChild(txtConflict);
        const lblConflictComment = document.createElement("div");
        lblConflictComment.style.gridArea = "5 / 6 / auto / 8";
        lblConflictComment.style.fontSize = "small";
        lblConflictComment.style.width = "240px";
        this.subContent.appendChild(lblConflictComment);

        const optSkip = document.createElement("option");
        optSkip.text = "Skip";
        optSkip.value = "0";
        txtConflict.appendChild(optSkip);
        const optKeepBoth = document.createElement("option");
        optKeepBoth.text = "Keep both";
        optKeepBoth.value = "1";
        txtConflict.appendChild(optKeepBoth);
        const optOverwrite = document.createElement("option");
        optOverwrite.text = "Overwrite";
        optOverwrite.value = "2";
        txtConflict.appendChild(optOverwrite);
        const optAppend = document.createElement("option");
        optAppend.text = "Append";
        optAppend.value = "3";
        txtConflict.appendChild(optAppend);
        const optMerge = document.createElement("option");
        optMerge.text = "Merge";
        optMerge.value = "4";
        txtConflict.appendChild(optMerge);

        txtConflict.value = "4";

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

        txtConflict.onchange = () => {
            switch (parseInt(txtConflict.value)) {
                case 0: lblConflictComment.innerHTML = "Do nothing, keep database's record"; break;
                case 1: lblConflictComment.innerHTML = "Create a new record"; break;
                case 2: lblConflictComment.innerHTML = "Replace with fetched record"; break;
                case 3: lblConflictComment.innerHTML = "Append only new properties"; break;
                case 4: lblConflictComment.innerHTML = "Merge with fetched record"; break;
            }
        };

        txtConflict.onchange();

        btnCancel.onclick = () => this.Close();

        btnOK.onclick = () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    //TODO:
                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "fetch_users_dc", true);
            xhr.send(`domain=${this.txtDomain.value}&conflictcontition=${txtConflictContition.value}&conflictaction=${txtConflict.value}`);
        };
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
        lblPort.style.gridArea = "4 / 3";
        lblPort.innerHTML = "Port: ";
        this.subContent.appendChild(lblPort);
        const txtPort = document.createElement("input");
        txtPort.type = "number";
        txtPort.min = "1";
        txtPort.max = "65535";
        txtPort.value = "443";
        txtPort.style.gridArea = "4 / 5";
        txtPort.style.marginLeft = "0";
        txtPort.style.width = "160px";
        this.subContent.appendChild(txtPort);
        txtTarget.exitElement = txtPort;

        const lblProtocol = document.createElement("div");
        lblProtocol.style.gridArea = "5 / 3";
        lblProtocol.innerHTML = "Protocol: ";
        this.subContent.appendChild(lblProtocol);
        const txtProtocol = document.createElement("select");
        txtProtocol.style.gridArea = "5 / 5";
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
        lblUsername.style.gridArea = "6 / 3";
        lblUsername.innerHTML = "Username: ";
        this.subContent.appendChild(lblUsername);

        const txtUsername = document.createElement("input");
        txtUsername.type = "text";
        txtUsername.placeholder = ".\\administrator";
        txtUsername.style.gridArea = "6 / 5";
        txtUsername.style.marginLeft = "0";
        txtUsername.style.width = "160px";
        this.subContent.appendChild(txtUsername);

        const lblPassword = document.createElement("div");
        lblPassword.style.gridArea = "7 / 3";
        lblPassword.innerHTML = "Password: ";
        this.subContent.appendChild(lblPassword);
        const txtPassword = document.createElement("input");
        txtPassword.type = "password";
        txtPassword.placeholder = " ";
        txtPassword.style.gridArea = "7 / 5";
        txtPassword.style.marginLeft = "0";
        txtPassword.style.width = "160px";
        this.subContent.appendChild(txtPassword);

        const lblEquip = document.createElement("div");
        lblEquip.style.gridArea = "8 / 3";
        lblEquip.innerHTML = "Import equipment: ";
        this.subContent.appendChild(lblEquip);
        const chkEquipContainer = document.createElement("div");
        chkEquipContainer.style.gridArea = "8 / 5";
        this.subContent.appendChild(chkEquipContainer);
        const chkEquip = document.createElement("input");
        chkEquip.type = "checkbox";
        chkEquip.checked = true;
        chkEquipContainer.appendChild(chkEquip);
        this.AddCheckBoxLabel(chkEquipContainer, chkEquip, "&nbsp;").style="width:4px; min-width:4px";

        const lblUsers = document.createElement("div");
        lblUsers.style.gridArea = "9 / 3";
        lblUsers.innerHTML = "Import users: ";
        this.subContent.appendChild(lblUsers);
        const chkUsersContainer = document.createElement("div");
        chkUsersContainer.style.gridArea = "9 / 5";
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
        description.style.fontSize = "small";  
        this.subContent.appendChild(description);

        btnCancel.onclick = () => this.Close();

        btnOK.onclick = () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "fetch_import", true);
            xhr.send(`ip=${txtTarget.GetIpString()}&port=${txtPort.value}&protocol=${txtProtocol.value}&username=${txtUsername.value}&password=${txtPassword.value}&equip=${chkEquip.checked}&users=${chkUsers.checked}`);
        };
    }

}