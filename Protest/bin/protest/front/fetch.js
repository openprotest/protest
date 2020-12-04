class Fetch extends Tabs {
    constructor(args) {
        super();

        this.args = args ? args : "";

        this.setTitle("Fetch");
        this.setIcon("res/fetch.svgz");

        this.txtDomain = document.createElement("input");
        this.ipFrom = new IpBox();
        this.ipTo = new IpBox();

        this.lblStatusValue = document.createElement("div");
        this.lblStatusValue.style.textTransform = "capitalize";
        this.lblStatusValue.style.fontWeight = "600";
        this.lblStatusValue.innerHTML = "";

        this.lblProgressValue = document.createElement("div");
        this.lblProgressValue.style.textTransform = "capitalize";
        this.lblProgressValue.style.fontWeight = "600";
        this.lblProgressValue.innerHTML = "0/0";

        this.lblEtcValue = document.createElement("div");
        this.lblEtcValue.style.fontWeight = "600";
        this.lblEtcValue.innerHTML = "Calculating";

        this.divProgress = document.createElement("div");
        this.divProgress.style.backgroundColor = "#404040";
        this.divProgress.style.width = "0";
        this.divProgress.style.height = "100%";
        this.divProgress.style.transition = ".4s";

        const tabEquipIp = this.AddTab("Equipment", "res/gear.svgz", "from IP range");
        const tabEquipDc = this.AddTab("Equipment", "res/gear.svgz", "from a domain");
        const tabUsersDc = this.AddTab("Users",     "res/user.svgz", "from a domain");
        const tabProtest = this.AddTab("Database",  "res/logo.svgz", "from other Pro-test");
        this.tabTask     = this.AddTab("Fetching",  "res/ball.svgz", "");

        this.tabTask.style.position = "absolute";
        this.tabTask.style.left = "0";
        this.tabTask.style.right = "0";
        this.tabTask.style.top = "max(216px, 100% - 48px)";
        this.tabTask.style.visibility = "hidden";
        
        this.txtDomain.type = "text";
        this.txtDomain.style.gridArea = "2 / 5";
        this.txtDomain.style.marginLeft = "0px";
        this.txtDomain.style.marginRight = "0px";

        tabEquipIp.style.height = "42px";
        tabEquipDc.style.height = "42px";
        tabUsersDc.style.height = "42px";
        tabProtest.style.height = "42px";

        tabEquipIp.onclick   = () => this.ShowEquipIp();
        tabEquipDc.onclick   = () => this.ShowEquipDc();
        tabUsersDc.onclick   = () => this.ShowUsersDc();
        tabProtest.onclick   = () => this.ShowProtest();
        this.tabTask.onclick = () => this.ShowFetching();

        switch (this.args) {
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

            /*case "task":
                this.tabTask.className = "v-tab-selected";
                this.tabTask.onclick();
                break;*/

            default:
                tabEquipIp.className = "v-tab-selected";
                this.ShowEquipIp(true);
        }

        this.subContent.style.display = "grid";
        this.subContent.style.gridTemplateColumns = "auto 100px 150px 8px 200px 50px auto";
        this.subContent.style.gridTemplateRows = "24px 36px 16px repeat(10, 36px)";
        this.subContent.style.alignItems = "center";
        this.subContent.style.overflow = "auto";

        this.GetCurrentNetworkInfo();
        this.CheckFetchTaskStatus();
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

    CheckFetchTaskStatus() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let json = JSON.parse(xhr.responseText);
                this.status = json;

                if (json.status == "fetching" || json.status == "idle") {
                    this.tabTask.style.visibility = "visible";
                    this.tabTask.style.animation = "slide-in .4s 1";

                } else if (json.status == "pending") {
                    this.tabTask.style.visibility = "visible";
                    this.tabTask.style.animation = "slide-in .4s 1";
                }

                if (this.tabTask.style.visibility == "visible" && this.args == "task") {
                    this.ShowFetching();
                    this.DeselectAllTabs();
                    this.tabTask.className = "v-tab-selected";
                }
            }
        };
        xhr.open("GET", "fetch/gettaskstatus", true);
        xhr.send();
    }

    ShowEquipIp(ignoreArgs = false) {
        if (!ignoreArgs) this.args = "equipip";

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

        /*const optSmart = document.createElement("option");
        optSmart.text = "Smart conflict detection";
        optSmart.value = "0";
        txtConflictContition.appendChild(optSmart);*/
        const optIP = document.createElement("option");
        optIP.text = "Same IP address";
        optIP.value = "1";
        txtConflictContition.appendChild(optIP);
        const optMAC = document.createElement("option");
        optMAC.text = "Same hostname";
        optMAC.value = "2";
        txtConflictContition.appendChild(optMAC);
        const optHostname = document.createElement("option");
        optHostname.text = "Same MAC address";
        optHostname.value = "3";
        txtConflictContition.appendChild(optHostname);

        txtConflictContition.value = "1";

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
        rngInterval.min = 0;
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
                case 0: lblIntervalComment.innerHTML = "Try again in half-hour if unreachable"; break;
                case 1: lblIntervalComment.innerHTML = "Try again in an hour if unreachable";   break;
                case 2: lblIntervalComment.innerHTML = "Try again in 2 hours if unreachable";   break;
                case 3: lblIntervalComment.innerHTML = "Try again in 4 hours if unreachable";   break;
                case 4: lblIntervalComment.innerHTML = "Try again in 6 hours if unreachable";   break;
                case 5: lblIntervalComment.innerHTML = "Try again in 8 hours if unreachable";   break;
                case 6: lblIntervalComment.innerHTML = "Try again in 12 hours if unreachable";  break;
                case 7: lblIntervalComment.innerHTML = "Try again in 24 hours if unreachable";  break;
                case 8: lblIntervalComment.innerHTML = "Try again in 48 hours if unreachable";  break;
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
                    if (xhr.response == "ok") {
                        this.tabTask.style.visibility = "visible";
                        this.tabTask.style.animation = "slide-in .4s 1";

                        this.DeselectAllTabs();
                        this.tabTask.className = "v-tab-selected";
                        this.ShowFetching();

                    } else {
                        this.ConfirmBox(xhr.response, true);
                    }
                    
                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };

            const strFrom = this.ipFrom.GetIpString();
            const strTo = this.ipTo.GetIpString();

            xhr.open("POST", "fetch/equip_ip", true);
            xhr.send(`from=${strFrom}&to=${strTo}&portscan=${txtPortscan.value}&conflictcontition=${txtConflictContition.value}&conflictaction=${txtConflict.value}&retries=${rngRetries.value}&interval=${rngInterval.value}`);
        };
    }

    ShowEquipDc() {
        this.args = "equipdc";

        this.subContent.innerHTML = "";

        const lblDomain = document.createElement("div");
        lblDomain.innerHTML = "Domain: ";
        lblDomain.style.gridArea = "2 / 3";
        this.subContent.appendChild(lblDomain);

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

        /*const optSmart = document.createElement("option");
        optSmart.text = "Smart conflict detection";
        optSmart.value = "0";
        txtConflictContition.appendChild(optSmart);*/
        const optIP = document.createElement("option");
        optIP.text = "Same IP address";
        optIP.value = "1";
        txtConflictContition.appendChild(optIP);
        const optMAC = document.createElement("option");
        optMAC.text = "Same hostname";
        optMAC.value = "2";
        txtConflictContition.appendChild(optMAC);
        const optHostname = document.createElement("option");
        optHostname.text = "Same MAC address";
        optHostname.value = "3";
        txtConflictContition.appendChild(optHostname);

        txtConflictContition.value = "2";

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
        rngInterval.min = 0;
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
                case 0: lblIntervalComment.innerHTML = "Try again in half-hour if unreachable"; break;
                case 1: lblIntervalComment.innerHTML = "Try again in an hour if unreachable";   break;
                case 2: lblIntervalComment.innerHTML = "Try again in 2 hours if unreachable";   break;
                case 3: lblIntervalComment.innerHTML = "Try again in 4 hours if unreachable";   break;
                case 4: lblIntervalComment.innerHTML = "Try again in 6 hours if unreachable";   break;
                case 5: lblIntervalComment.innerHTML = "Try again in 8 hours if unreachable";   break;
                case 6: lblIntervalComment.innerHTML = "Try again in 12 hours if unreachable";  break;
                case 7: lblIntervalComment.innerHTML = "Try again in 24 hours if unreachable";  break;
                case 8: lblIntervalComment.innerHTML = "Try again in 48 hours if unreachable";  break;
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
                    if (xhr.response == "ok") {
                        this.tabTask.style.visibility = "visible";
                        this.tabTask.style.animation = "slide-in .4s 1";

                        this.DeselectAllTabs();
                        this.tabTask.className = "v-tab-selected";
                        this.ShowFetching();

                    } else {
                        this.ConfirmBox(xhr.response, true);
                    }

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "fetch/equip_dc", true);
            xhr.send(`domain=${this.txtDomain.value}&portscan=${txtPortscan.value}&conflictcontition=${txtConflictContition.value}&conflictaction=${txtConflict.value}&retries=${rngRetries.value}&interval=${rngInterval.value}`);
        };
    }

    ShowUsersDc() {
        this.args = "usersdc";

        this.subContent.innerHTML = "";

        const lblDomain = document.createElement("div");
        lblDomain.innerHTML = "Domain: ";
        lblDomain.style.gridArea = "2 / 3";
        this.subContent.appendChild(lblDomain);

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

        /*const optSmart = document.createElement("option");
        optSmart.text = "Smart conflict detection";
        optSmart.value = "0";
        txtConflictContition.appendChild(optSmart);*/
        const optUN = document.createElement("option");
        optUN.text = "Same username";
        optUN.value = "1";
        txtConflictContition.appendChild(optUN);

        //txtConflictContition.value = "1";

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
                    if (xhr.response == "ok") {
                        this.tabTask.style.visibility = "visible";
                        this.tabTask.style.animation = "slide-in .4s 1";

                        this.DeselectAllTabs();
                        this.tabTask.className = "v-tab-selected";
                        this.ShowFetching();

                    } else {
                        this.ConfirmBox(xhr.response, true);
                    }

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "fetch/users_dc", true);
            xhr.send(`domain=${this.txtDomain.value}&conflictcontition=${txtConflictContition.value}&conflictaction=${txtConflict.value}`);
        };
    }

    ShowProtest() {
        this.args = "protest";

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
        buttonsContainer.style.gridArea = "11 / 2 / auto / 7";        
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
                    if (xhr.response == "ok") this.CheckFetchTaskStatus();

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "fetch/import", true);
            xhr.send(`ip=${txtTarget.GetIpString()}&port=${txtPort.value}&protocol=${txtProtocol.value}&username=${txtUsername.value}&password=${txtPassword.value}&equip=${chkEquip.checked}&users=${chkUsers.checked}`);
        };
    }

    ShowFetching() {
        this.subContent.innerHTML = "";
        this.args = "task";

        const lblName = document.createElement("div");
        lblName.style.gridArea = "2 / 7 / auto / 2";
        lblName.style.textAlign = "center";
        lblName.style.fontWeight = "600";
        lblName.style.textDecoration = "underline";
        if (this.status) lblName.innerHTML = this.status.name;
        this.subContent.appendChild(lblName);

        const lblStatus = document.createElement("div");
        lblStatus.style.gridArea = "4 / 3";
        lblStatus.innerHTML = "Status: ";
        this.subContent.appendChild(lblStatus);
        this.lblStatusValue.style.gridArea = "4 / 5";
        this.subContent.appendChild(this.lblStatusValue);

        const lblDate = document.createElement("div");
        lblDate.style.gridArea = "5 / 3";
        lblDate.innerHTML = "Started date: ";
        this.subContent.appendChild(lblDate);
        const lblDateValue = document.createElement("div");
        lblDateValue.style.gridArea = "5 / 5";
        lblDateValue.style.fontWeight = "600";
        if (this.status) lblDateValue.innerHTML = this.status.started;
        this.subContent.appendChild(lblDateValue);

        const lblProgress = document.createElement("div");
        lblProgress.style.gridArea = "6 / 3";
        lblProgress.innerHTML = "Progress: ";
        this.subContent.appendChild(lblProgress);
        this.lblProgressValue.style.gridArea = "6 / 5";
        //if (this.status) this.lblProgressValue.innerHTML = `${this.status.completed}/${this.status.total}`;
        this.subContent.appendChild(this.lblProgressValue);

        const lblEtc = document.createElement("div");
        lblEtc.style.gridArea = "7 / 3";
        lblEtc.innerHTML = "ETC: ";
        this.subContent.appendChild(lblEtc);
        this.lblEtcValue.style.gridArea = "7 / 5";
        //if (this.status) this.lblEtcValue.innerHTML = this.status.etc;
        this.subContent.appendChild(this.lblEtcValue);

        const divProgressBar = document.createElement("div");
        divProgressBar.style.gridArea = "8 / 3 / auto / 6";
        divProgressBar.style.height = "16px";
        divProgressBar.style.border = "#404040 2px solid";
        divProgressBar.style.borderRadius = "4px";
        this.subContent.appendChild(divProgressBar);
        //if (this.status) this.divProgress.style.width = `${100 * this.status.completed / this.status.total}%`
        divProgressBar.appendChild(this.divProgress);

        const buttonsContainer = document.createElement("div");
        buttonsContainer.style.gridArea = "10 / 3 / auto / 6";
        buttonsContainer.style.textAlign = "center";
        this.subContent.appendChild(buttonsContainer);

        const btnAbort = document.createElement("input");
        btnAbort.type = "button";
        btnAbort.value = "Abort";
        btnAbort.style.minWidth = "96px";
        btnAbort.style.height = "28px";
        buttonsContainer.appendChild(btnAbort);

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let json = JSON.parse(xhr.responseText);

                if (json.status == "pending") {
                    this.ShowPending(json);

                } else if (json.status == "fetching" || json.status == "idle") {
                    lblName.innerHTML = json.name;
                    lblDateValue.innerHTML = json.started;
                    this.lblStatusValue.innerHTML = json.status;
                    this.lblProgressValue.innerHTML = `${json.completed}/${json.total}`;
                    this.lblEtcValue.innerHTML = json.etc;
                    this.divProgress.style.width = `${(100 * json.completed) / json.total}%`;

                } else {
                    this.tabTask.style.visibility = "hidden";
                    this.tabTask.style.animation = "none";
                    this.DeselectAllTabs();
                    this.tabsList[0].className = "v-tab-selected";
                    this.tabsList[0].onclick();
                }
            }
        };
        xhr.open("GET", "fetch/gettaskstatus", true);
        xhr.send();

        btnAbort.onclick = () => {

            this.ConfirmBox("Are you sure you want to abort this task?").addEventListener("click", () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        if (xhr.response == "ok") {
                            this.tabTask.style.visibility = "hidden";
                            this.tabTask.style.animation = "none";
                            this.DeselectAllTabs();
                            this.tabsList[0].className = "v-tab-selected";
                            this.tabsList[0].onclick();
                        } else {
                            this.ConfirmBox(xhr.response, true);
                        }
                    } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                xhr.open("GET", "fetch/abort", true);
                xhr.send();
            });

        };
    }

    ShowPending(json) {
        this.subContent.innerHTML = "";

        const lblName = document.createElement("div");
        lblName.style.gridArea = "2 / 7 / auto / 2";
        lblName.style.textAlign = "center";
        lblName.style.fontWeight = "600";
        lblName.style.textDecoration = "underline";
        if (this.status) lblName.innerHTML = json.name;
        this.subContent.appendChild(lblName);

        const lblStart = document.createElement("div");
        lblStart.style.gridArea = "4 / 3";
        lblStart.innerHTML = "Started date: ";
        this.subContent.appendChild(lblStart);
        const lblStartValue = document.createElement("div");
        lblStartValue.style.gridArea = "4 / 5";
        lblStartValue.style.fontWeight = "600";
        if (this.status) lblStartValue.innerHTML = json.started;
        this.subContent.appendChild(lblStartValue);

        const lblFinish = document.createElement("div");
        lblFinish.style.gridArea = "5 / 3";
        lblFinish.innerHTML = "Finished date: ";
        this.subContent.appendChild(lblFinish);
        const lblFinishValue = document.createElement("div");
        lblFinishValue.style.gridArea = "5 / 5";
        lblFinishValue.style.fontWeight = "600";
        if (this.status) lblFinishValue.innerHTML = json.finished;
        this.subContent.appendChild(lblFinishValue);

        const lblSuccess = document.createElement("div");
        lblSuccess.style.gridArea = "6 / 3";
        lblSuccess.innerHTML = "Successfully fetched: ";
        this.subContent.appendChild(lblSuccess);
        const lblSuccessValue = document.createElement("div");
        lblSuccessValue.style.gridArea = "6 / 5";
        lblSuccessValue.style.fontWeight = "600";
        if (this.status) lblSuccessValue.innerHTML = json.successful;
        this.subContent.appendChild(lblSuccessValue);

        const lblUnuccess = document.createElement("div");
        lblUnuccess.style.gridArea = "7 / 3";
        lblUnuccess.innerHTML = "Unsuccessful: ";
        this.subContent.appendChild(lblUnuccess);
        const lblUnuccessValue = document.createElement("div");
        lblUnuccessValue.style.gridArea = "7 / 5";
        lblUnuccessValue.style.fontWeight = "600";
        if (this.status) lblUnuccessValue.innerHTML = json.unsuccessful;
        this.subContent.appendChild(lblUnuccessValue);


        const buttonsContainer = document.createElement("div");
        buttonsContainer.style.gridArea = "10 / 2 / auto / 7";
        buttonsContainer.style.textAlign = "center";
        this.subContent.appendChild(buttonsContainer);

        const btnOK = document.createElement("input");
        btnOK.type = "button";
        btnOK.value = "Approve";
        btnOK.style.minWidth = "96px";
        btnOK.style.height = "28px";
        buttonsContainer.appendChild(btnOK);

        const btnDiscard = document.createElement("input");
        btnDiscard.type = "button";
        btnDiscard.value = "Discard";
        btnDiscard.style.minWidth = "96px";
        btnDiscard.style.height = "28px";
        buttonsContainer.appendChild(btnDiscard);

        btnOK.onclick = () => {

            this.ConfirmBox("Are you sure you want to approve the fetched dataset?").addEventListener("click", () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        if (xhr.response == "ok") {
                            this.tabTask.style.visibility = "hidden";
                            this.tabTask.style.animation = "none";
                            this.DeselectAllTabs();
                            this.tabsList[0].className = "v-tab-selected";
                            this.tabsList[0].onclick();
                        } else {
                            this.ConfirmBox(xhr.response, true);
                        }

                    } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                xhr.open("GET", "fetch/approve", true);
                xhr.send();
            });

        };

        btnDiscard.onclick = () => {

            this.ConfirmBox("Are you sure you want to discard the fetched dataset?").addEventListener("click", () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        if (xhr.response == "ok") {
                            this.tabTask.style.visibility = "hidden";
                            this.tabTask.style.animation = "none";
                            this.DeselectAllTabs();
                            this.tabsList[0].className = "v-tab-selected";
                            this.tabsList[0].onclick();
                        } else {
                            this.ConfirmBox(xhr.response, true);
                        }

                    } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                xhr.open("GET", "fetch/discard", true);
                xhr.send();
            });

        };
    }

}