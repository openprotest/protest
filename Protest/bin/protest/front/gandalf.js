class Gandalf extends Window {
    constructor() {
        super([64,64,64]);

        this.AddCssDependencies("gandalf.css");

        this.args = null;

        this.setTitle("Gandalf");
        this.setIcon("res/gandalf.svgz");

        this.index = 0;
        this.menuArray = [];
        this.includeList = [];
        this.content.classList.add("gandalf-content");

        const buttons = document.createElement("div");
        buttons.className = "gandalf-buttons";
        this.content.appendChild(buttons);

        this.btnPrevious = document.createElement("input");
        this.btnPrevious.type = "button";
        this.btnPrevious.value = "Previous";
        this.btnPrevious.style.minWidth = "96px";
        this.btnPrevious.style.height = "32px";
        buttons.appendChild(this.btnPrevious);

        this.btnNext = document.createElement("input");
        this.btnNext.type = "button";
        this.btnNext.value = "Next";
        this.btnNext.style.minWidth = "96px";
        this.btnNext.style.height = "32px";
        buttons.appendChild(this.btnNext);

        this.btnPrevious.onclick = () => this.Previous();
        this.btnNext.onclick = () => this.Next();

        this.InitMenus();
        this.GetEntropy();
    }

    InitMenus() {
        for (let i = 0; i < 4; i++) {
            const menu = document.createElement("div");
            menu.className = "gandalf-roll";
            menu.style.opacity = "0";
            menu.style.transform = "translate(+100%)  scale(.8)";
            menu.style.visibility = "hidden";
            this.content.appendChild(menu);
            this.menuArray.push(menu);
        }

        this.menuArray[0].style.textAlign = "center";

        {
            const logo = document.createElement("img");
            logo.style.gridArea = "1 / 2 / 6 / 2";
            logo.style.userSelect = "none";
            logo.style.userDrag = "none";
            logo.style.webkitUserDrag = "none";
            logo.width = "128";
            logo.height = "128";
            logo.src = "res/gandalf.svgz";
            this.menuArray[0].appendChild(logo);

            this.menuArray[0].appendChild(document.createElement("br"));
            this.menuArray[0].appendChild(document.createElement("br"));

            const description = document.createElement("div");
            description.innerHTML = "Gandalf is a security tool designed to help you identify users who use weak passwords. Users bellow the strength threshold will get an email notification asking them to change to a more secure password.";
            description.style.display = "inline-block";
            description.style.fontSize = "large";
            description.style.maxWidth = "720px";
            this.menuArray[0].appendChild(description);

            this.menuArray[0].appendChild(document.createElement("br"));
            this.menuArray[0].appendChild(document.createElement("br"));
            this.menuArray[0].appendChild(document.createElement("br"));

            const quote = document.createElement("div");
            quote.innerHTML = "\"You should not pass.\"<br> - Gandalf";
            quote.style.fontStyle = "italic";
            quote.style.textAlign = "right";
            quote.style.fontSize = "large";
            quote.style.maxWidth = "720px";
            this.menuArray[0].appendChild(quote);
        }

        {
            const lblThreshold = document.createElement("div");
            lblThreshold.innerHTML = "Threshold:";
            lblThreshold.style.display = "inline-block";
            lblThreshold.style.fontWeight = "600";
            lblThreshold.style.minWidth = "150px";
            this.menuArray[1].appendChild(lblThreshold);

            this.rngThreshold = document.createElement("input");
            this.rngThreshold.type = "range";
            this.rngThreshold.min = 20;
            this.rngThreshold.max = 150;
            this.rngThreshold.value = 80;
            this.rngThreshold.style.width = "200px";
            this.menuArray[1].appendChild(this.rngThreshold);

            const lblThresholdValue = document.createElement("div");
            lblThresholdValue.innerHTML = "60-bits";
            lblThresholdValue.style.display = "inline-block";
            lblThresholdValue.style.paddingLeft = "8px";
            this.menuArray[1].appendChild(lblThresholdValue);

            this.menuArray[1].appendChild(document.createElement("br"));
            this.menuArray[1].appendChild(document.createElement("br"));

            const lblTotal = document.createElement("div");
            lblTotal.innerHTML = "Total users:";
            lblTotal.style.display = "inline-block";
            lblTotal.style.fontWeight = "600";
            lblTotal.style.minWidth = "150px";
            this.menuArray[1].appendChild(lblTotal);

            const lblTotalValue = document.createElement("div");
            lblTotalValue.innerHTML = "0";
            lblTotalValue.style.display = "inline-block";
            lblTotalValue.style.minWidth = "100px";
            this.menuArray[1].appendChild(lblTotalValue);

            const lblAsterisk = document.createElement("div");
            lblAsterisk.innerHTML = "* Only users with an email will get counted.";
            lblAsterisk.style.display = "inline-block";
            lblAsterisk.style.fontStyle = "italic";
            this.menuArray[1].appendChild(lblAsterisk);

            this.menuArray[1].appendChild(document.createElement("br"));
            this.menuArray[1].appendChild(document.createElement("br"));

            const lblInclude = document.createElement("div");
            lblInclude.innerHTML = "Include:";
            lblInclude.style.display = "inline-block";
            lblInclude.style.fontWeight = "600";
            lblInclude.style.minWidth = "150px";
            this.menuArray[1].appendChild(lblInclude);

            this.divInclude = document.createElement("div");
            this.menuArray[1].appendChild(this.divInclude);

            let parameters = new Set();
            for (let i = 0; i < db_users.length; i++)
                for (let k in db_users[i])
                    if (k.indexOf("PASSWORD") > -1 && !parameters.has(k))
                        parameters.add(k);

            parameters.forEach((key, value, set) => {
                if (key === "PASSWORD") return;

                const div = document.createElement("div");
                div.style.padding = "4px";
                this.divInclude.appendChild(div);

                const chkInclude = document.createElement("input");
                chkInclude.type = "checkbox";
                chkInclude.checked = true;
                div.appendChild(chkInclude);
                this.AddCheckBoxLabel(div, chkInclude, key);

                this.includeList.push([key, chkInclude]);
            });

            this.rngThreshold.oninput =
            this.rngThreshold.onchange = () => {
                lblThresholdValue.innerHTML = `${this.rngThreshold.value}-bits`;

                if (this.entropy) 
                    lblTotalValue.innerHTML = this.entropy.reduce((sum, c) => {
                        if (c.entropy < this.rngThreshold.value)
                            return ++sum;
                        return sum;
                    }, 0);                
            };

            this.rngThreshold.onchange();
        }

        {
            const lblSmtpTitle = document.createElement("div");
            lblSmtpTitle.innerHTML = "SMTP client setup";
            lblSmtpTitle.style.textAlign = "center";
            lblSmtpTitle.style.textDecoration= "underline";
            lblSmtpTitle.style.fontSize = "large";
            lblSmtpTitle.style.fontWeight= "600";
            this.menuArray[2].appendChild(lblSmtpTitle);

            this.menuArray[2].appendChild(document.createElement("br"));

            const lblSmtpServer = document.createElement("div");
            lblSmtpServer.innerHTML = "SMTP server:";
            lblSmtpServer.style.display = "inline-block";
            lblSmtpServer.style.fontWeight = "600";
            lblSmtpServer.style.minWidth = "150px";
            this.menuArray[2].appendChild(lblSmtpServer);
            this.txtSmtpServer = document.createElement("input");
            this.txtSmtpServer.type = "text";
            this.txtSmtpServer.placeholder = "smtp.gmail.com";
            this.txtSmtpServer.style.width = "250px";
            this.menuArray[2].appendChild(this.txtSmtpServer);

            this.menuArray[2].appendChild(document.createElement("br"));

            const lblSmtpPort = document.createElement("div");
            lblSmtpPort.innerHTML = "Port:";
            lblSmtpPort.style.display = "inline-block";
            lblSmtpPort.style.fontWeight = "600";
            lblSmtpPort.style.minWidth = "150px";
            this.menuArray[2].appendChild(lblSmtpPort);
            this.txtSmtpPort = document.createElement("input");
            this.txtSmtpPort.type = "number";
            this.txtSmtpPort.min = 1;
            this.txtSmtpPort.max = 49151;
            this.txtSmtpPort.value = 587;
            this.txtSmtpPort.style.width = "250px";
            this.menuArray[2].appendChild(this.txtSmtpPort);

            this.menuArray[2].appendChild(document.createElement("br"));

            const lblSender = document.createElement("div");
            lblSender.innerHTML = "Sender:";
            lblSender.style.display = "inline-block";
            lblSender.style.fontWeight = "600";
            lblSender.style.minWidth = "150px";
            this.menuArray[2].appendChild(lblSender);
            this.txtSender = document.createElement("input");
            this.txtSender.type = "text";
            this.txtSender.style.width = "250px";
            this.menuArray[2].appendChild(this.txtSender);

            this.menuArray[2].appendChild(document.createElement("br"));

            const lblUsername = document.createElement("div");
            lblUsername.innerHTML = "Username:";
            lblUsername.style.display = "inline-block";
            lblUsername.style.fontWeight = "600";
            lblUsername.style.minWidth = "150px";
            this.menuArray[2].appendChild(lblUsername);
            this.txtUsername = document.createElement("input");
            this.txtUsername.type = "text";
            this.txtUsername.style.width = "250px";
            this.menuArray[2].appendChild(this.txtUsername);

            this.menuArray[2].appendChild(document.createElement("br"));

            const lblPassword = document.createElement("div");
            lblPassword.innerHTML = "Password:";
            lblPassword.style.display = "inline-block";
            lblPassword.style.fontWeight = "600";
            lblPassword.style.minWidth = "150px";
            this.menuArray[2].appendChild(lblPassword);
            this.txtPassword = document.createElement("input");
            this.txtPassword.type = "password";
            this.txtPassword.style.width = "250px";
            this.menuArray[2].appendChild(this.txtPassword);

            this.menuArray[2].appendChild(document.createElement("br"));

            const lblSSL = document.createElement("div");
            lblSSL.innerHTML = "SSL:";
            lblSSL.style.display = "inline-block";
            lblSSL.style.fontWeight = "600";
            lblSSL.style.minWidth = "150px";
            this.menuArray[2].appendChild(lblSSL);
            const divSSL = document.createElement("div");
            divSSL.style.margin = "4px";
            divSSL.style.display = "inline-block";
            this.menuArray[2].appendChild(divSSL);
            this.chkSSL = document.createElement("input");
            this.chkSSL.type = "checkbox";
            divSSL.appendChild(this.chkSSL);
            this.AddCheckBoxLabel(divSSL, this.chkSSL, "&nbsp;");

            this.menuArray[2].appendChild(document.createElement("br"));
            this.menuArray[2].appendChild(document.createElement("br"));

            const btnCopy = document.createElement("input");
            btnCopy.type = "button";
            btnCopy.value = "Copy conficuration from Watchdog";
            this.menuArray[2].appendChild(btnCopy);

            this.menuArray[2].appendChild(document.createElement("br"));
            this.menuArray[2].appendChild(document.createElement("br"));

            btnCopy.onclick = () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        let split = xhr.responseText.split(String.fromCharCode(127));
                        if (split.length > 10) {
                            this.txtSmtpServer.value = split[5];
                            this.txtSmtpPort.value = parseInt(split[6]);
                            this.txtSender.value = split[7];
                            this.txtUsername.value = split[8];
                            this.txtPassword.value = split[9];
                            this.chkSSL.checked = split[11] === "true"
                        }
                    }
                    if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
                };

                xhr.open("GET", "watchdog/getconfig", true);
                xhr.send();
            };

        }

        {
            this.menuArray[3].style.textAlign = "center";

            const logo = document.createElement("img");
            logo.style.userSelect = "none";
            logo.style.userDrag = "none";
            logo.style.webkitUserDrag = "none";
            logo.width = "128";
            logo.height = "128";
            logo.src = "res/email.svgz";
            this.menuArray[3].appendChild(logo);

            this.menuArray[3].appendChild(document.createElement("br"));
            this.menuArray[3].appendChild(document.createElement("br"));

            const lblDone = document.createElement("div");
            lblDone.innerHTML = "E-mails are on the way!";
            lblDone.style.fontSize = "large";
            lblDone.style.fontWeight = "600";
            lblDone.style.paddingTop = "8px";
            this.menuArray[3].appendChild(lblDone);
        }

        this.menuArray[0].style.opacity = "1";
        this.menuArray[0].style.transform = "none";
        this.menuArray[0].style.animation = "fromRight .4s 1";
        this.menuArray[0].style.visibility = "visible";
        this.btnPrevious.setAttribute("disabled", true);
    }

    GetEntropy() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {

                let split = xhr.responseText.split(String.fromCharCode(127));
                this.entropy = [];

                for (let i = 0; i < split.length - 2; i += 5) {
                    if (split[i] !== "u") continue;

                    let dbEntry = db_users.find(e => e[".FILENAME"][0] === split[i + 1]);
                    if (!dbEntry) continue;
                    if (!dbEntry.hasOwnProperty("E-MAIL")) continue;

                    this.entropy.push({
                        file: split[i+1],
                        name: split[i+2],
                        entropy: parseFloat(split[i+3]),
                        email: dbEntry["E-MAIL"][0]
                    });
                }

                this.rngThreshold.onchange();

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true).addEventListener("click", ()=> this.Close());
        };
        xhr.open("GET", "db/getentropy", true);
        xhr.send();
    }

    Previous() {
        if (this.index === 0) return;

        this.menuArray[this.index].style.opacity = "0";
        this.menuArray[this.index].style.transform = "translate(+100%) scale(.8)";
        this.menuArray[this.index].style.visibility = "hidden";
        this.menuArray[this.index].style.zIndex = 0;

        this.index--;

        this.menuArray[this.index].style.opacity = "1";
        this.menuArray[this.index].style.transform = "none";
        this.menuArray[this.index].style.animation = "fromRight .4s 1";
        this.menuArray[this.index].style.visibility = "visible";
        this.menuArray[this.index].style.zIndex = 1;

        this.btnNext.removeAttribute("disabled");    

        if (this.index === 0)
            this.btnPrevious.setAttribute("disabled", true);

        this.btnNext.value = this.index === 2 ? "Send" : "Next";
    }

    Next() {
        if (this.index === this.menuArray.length - 1) {
            this.Close();
            return;
        }

        if (this.index === 2)
            if (this.txtSmtpServer.value.length === 0 ||
                this.txtSmtpPort.value.length === 0 ||
                this.txtSender.value.length === 0 ||
                this.txtUsername.value.length === 0 ||
                this.txtPassword.value.length === 0) {
                this.ConfirmBox("Incomplete form. All fields are required.", true);
                return;
            }

        this.menuArray[this.index].style.opacity = "0";
        this.menuArray[this.index].style.transform = "translate(-100%) scale(.8)";
        this.menuArray[this.index].style.visibility = "hidden";
        this.menuArray[this.index].style.zIndex = 0;

        this.index++;

        if (this.index === 3) {
            this.btnPrevious.setAttribute("disabled", true);
            this.btnNext.setAttribute("disabled", true);
            this.Send();
            return;
        }

        this.menuArray[this.index].style.opacity = "1";
        this.menuArray[this.index].style.transform = "none";
        this.menuArray[this.index].style.animation = "fromLeft .4s 1";
        this.menuArray[this.index].style.visibility = "visible";
        this.menuArray[this.index].style.zIndex = 1;

        this.btnPrevious.removeAttribute("disabled");

        this.btnNext.value = this.index === 2 ? "Send" : "Next";
    }

    Send() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {

                this.btnNext.removeAttribute("disabled");
                this.btnNext.value = "Close";

                this.menuArray[this.index].style.opacity = "1";
                this.menuArray[this.index].style.transform = "none";
                this.menuArray[this.index].style.animation = "fromLeft .4s 1";
                this.menuArray[this.index].style.visibility = "visible";
                this.menuArray[this.index].style.zIndex = 1;

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true).addEventListener("click", () => this.Close());
        };

        let payload = "";
        payload += `${this.rngThreshold.value}${String.fromCharCode(127)}`;
        payload += `${this.txtSmtpServer.value}${String.fromCharCode(127)}`;
        payload += `${this.txtSmtpPort.value}${String.fromCharCode(127)}`;
        payload += `${this.txtSender.value}${String.fromCharCode(127)}`;
        payload += `${this.txtUsername.value}${String.fromCharCode(127)}`;
        payload += `${this.txtPassword.value}${String.fromCharCode(127)}`;
        payload += `${this.chkSSL.checked}${String.fromCharCode(127)}`;

        for (let i = 0; i < this.includeList.length; i++)
            if (this.includeList[i][1].checked == true)
                payload += `${this.includeList[i][0]}${String.fromCharCode(127)}`;

        xhr.open("POST", "db/gandalf", true);
        xhr.send(payload);

    }
}