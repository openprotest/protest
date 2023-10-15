class Gandalf extends Window {
	constructor(args) {
		super(args);

		this.SetTitle("Gandalf");
		this.SetIcon("mono/gandalf.svg");

		this.AddCssDependencies("gandalf.css");

		this.index = 0;
		this.menuArray = [];
		this.includeList = {};
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

		this.btnPrevious.onclick = ()=> this.Previous();
		this.btnNext.onclick = ()=> this.Next();

		this.InitMenus();
		this.GetEntropy();
		this.GetSmtpProfiles();
	}

	async GetEntropy(callback) {
		try {
			const response = await fetch("db/getentropy");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			const json = await response.json();
			if (json.error) throw(json.error);

			this.entropy = json;
			this.rngThreshold.oninput();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg").addEventListener("click", ()=> this.Close());
		}
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
			logo.src = "mono/gandalf.svg";
			this.menuArray[0].appendChild(logo);

			this.menuArray[0].appendChild(document.createElement("br"));
			this.menuArray[0].appendChild(document.createElement("br"));

			const description = document.createElement("div");
			description.textContent = "Gandalf is a security tool designed to help you identify users who use weak passwords. Users bellow the strength threshold will get an email notification asking them to change to a more secure password.";
			description.style.display = "inline-block";
			description.style.fontSize = "large";
			description.style.maxWidth = "720px";
			this.menuArray[0].appendChild(description);

			this.menuArray[0].appendChild(document.createElement("br"));
			this.menuArray[0].appendChild(document.createElement("br"));
			this.menuArray[0].appendChild(document.createElement("br"));

			const quote = document.createElement("div");
			quote.textContent = "\"You shall not pass.\"";
			quote.style.fontStyle = "italic";
			quote.style.textAlign = "right";
			quote.style.fontSize = "large";
			quote.style.maxWidth = "720px";
			this.menuArray[0].appendChild(quote);

			const quote2 = document.createElement("div");
			quote2.textContent = "- Gandalf";
			quote2.style.fontStyle = "italic";
			quote2.style.textAlign = "right";
			quote2.style.fontSize = "large";
			quote2.style.maxWidth = "720px";
			this.menuArray[0].appendChild(quote2);
		}

		{
			const lblThreshold = document.createElement("div");
			lblThreshold.textContent = "Threshold:";
			lblThreshold.style.display = "inline-block";
			lblThreshold.style.fontWeight = "600";
			lblThreshold.style.minWidth = "150px";
			this.menuArray[1].appendChild(lblThreshold);

			this.rngThreshold = document.createElement("input");
			this.rngThreshold.type = "range";
			this.rngThreshold.min = 18;
			this.rngThreshold.max = 128;
			this.rngThreshold.value = 65;
			this.rngThreshold.style.width = "200px";
			this.menuArray[1].appendChild(this.rngThreshold);

			const lblThresholdValue = document.createElement("div");
			lblThresholdValue.textContent = "60-bits";
			lblThresholdValue.style.display = "inline-block";
			lblThresholdValue.style.paddingLeft = "8px";
			this.menuArray[1].appendChild(lblThresholdValue);

			this.menuArray[1].appendChild(document.createElement("br"));
			this.menuArray[1].appendChild(document.createElement("br"));

			const lblTotal = document.createElement("div");
			lblTotal.textContent = "Total users:";
			lblTotal.style.display = "inline-block";
			lblTotal.style.fontWeight = "600";
			lblTotal.style.minWidth = "150px";
			this.menuArray[1].appendChild(lblTotal);

			const lblTotalValue = document.createElement("div");
			lblTotalValue.textContent = "0";
			lblTotalValue.style.display = "inline-block";
			lblTotalValue.style.minWidth = "100px";
			this.menuArray[1].appendChild(lblTotalValue);

			const lblAsterisk = document.createElement("div");
			lblAsterisk.textContent = "* Only users with an email address will be counted.";
			lblAsterisk.style.display = "inline-block";
			lblAsterisk.style.fontStyle = "italic";
			this.menuArray[1].appendChild(lblAsterisk);

			this.menuArray[1].appendChild(document.createElement("br"));
			this.menuArray[1].appendChild(document.createElement("br"));

			const lblInclude = document.createElement("div");
			lblInclude.textContent = "Include:";
			lblInclude.style.display = "inline-block";
			lblInclude.style.fontWeight = "600";
			lblInclude.style.minWidth = "150px";
			this.menuArray[1].appendChild(lblInclude);

			this.divInclude = document.createElement("div");
			this.menuArray[1].appendChild(this.divInclude);

			let parameters = new Set();
			for (let user in LOADER.users.data) {
				for (let attr in LOADER.users.data[user]) {
					if (attr.indexOf("password") > -1 && !parameters.has(attr))
						parameters.add(attr);
				}
			}

			for (let i = 0; i < LOADER.users.data.length; i++)
				for (let k in LOADER.users.data[i])
					if (k.indexOf("password") > -1 && !parameters.has(k))
						parameters.add(k);

			lblInclude.style.visibility = parameters.size === 1 ? "hidden" : "visible";

			parameters.forEach((key, value, set)=> {
				if (key === "password") return;

				const div = document.createElement("div");
				div.style.padding = "4px";
				this.divInclude.appendChild(div);

				const chkInclude = document.createElement("input");
				chkInclude.type = "checkbox";
				chkInclude.checked = true;
				div.appendChild(chkInclude);
				this.AddCheckBoxLabel(div, chkInclude, key);

				this.includeList[key] = chkInclude;

				chkInclude.onchange = ()=> this.rngThreshold.oninput();
			});

			this.rngThreshold.oninput =
			this.rngThreshold.onchange = ()=> {
				let strength = "";
				if      (this.rngThreshold.value < 19)  strength = "Forbidden";
				else if (this.rngThreshold.value < 28)  strength = "Very weak";
				else if (this.rngThreshold.value < 36)  strength = "Weak";
				else if (this.rngThreshold.value < 60)  strength = "Reasonable";
				else if (this.rngThreshold.value < 128) strength = "Strong";
				else                                    strength = "Overkill";

				lblThresholdValue.textContent = `${this.rngThreshold.value}-bits (${strength} or bellow)`;

				if (this.entropy)
					lblTotalValue.textContent = this.entropy.reduce((sum, entry)=> {
						if (entry.entropy < this.rngThreshold.value)
							if ((this.includeList[entry.attr] && this.includeList[entry.attr].checked) || entry.attr === "password")
								return ++sum;
						return sum;
					}, 0);
			};

			this.rngThreshold.oninput();
		}

		{
			const lblSmtpTitle = document.createElement("div");
			lblSmtpTitle.textContent = "SMTP client setup";
			lblSmtpTitle.style.textAlign = "center";
			lblSmtpTitle.style.textDecoration= "underline";
			lblSmtpTitle.style.fontSize = "large";
			lblSmtpTitle.style.fontWeight= "600";
			this.menuArray[2].appendChild(lblSmtpTitle);

			this.menuArray[2].appendChild(document.createElement("br"));

			const lblSmtpProfile = document.createElement("div");
			lblSmtpProfile.textContent = "SMTP profile:";
			lblSmtpProfile.style.display = "inline-block";
			lblSmtpProfile.style.fontWeight = "600";
			lblSmtpProfile.style.minWidth = "150px";
			this.menuArray[2].appendChild(lblSmtpProfile);
			this.txtSmtpProfile = document.createElement("select");
			this.txtSmtpProfile.style.width = "250px";
			this.txtSmtpProfile.style.boxSizing = "content-box";
			this.menuArray[2].appendChild(this.txtSmtpProfile);

			this.menuArray[2].appendChild(document.createElement("br"));

			const lblSmtpServer = document.createElement("div");
			lblSmtpServer.textContent = "SMTP server:";
			lblSmtpServer.style.display = "inline-block";
			lblSmtpServer.style.fontWeight = "600";
			lblSmtpServer.style.minWidth = "150px";
			this.menuArray[2].appendChild(lblSmtpServer);
			this.txtSmtpServer = document.createElement("input");
			this.txtSmtpServer.type = "text";
			this.txtSmtpServer.disabled = true;
			this.txtSmtpServer.placeholder = "smtp.gmail.com";
			this.txtSmtpServer.style.width = "250px";
			this.menuArray[2].appendChild(this.txtSmtpServer);

			this.menuArray[2].appendChild(document.createElement("br"));

			const lblSmtpPort = document.createElement("div");
			lblSmtpPort.textContent = "Port:";
			lblSmtpPort.style.display = "inline-block";
			lblSmtpPort.style.fontWeight = "600";
			lblSmtpPort.style.minWidth = "150px";
			this.menuArray[2].appendChild(lblSmtpPort);
			this.txtSmtpPort = document.createElement("input");
			this.txtSmtpPort.type = "number";
			this.txtSmtpPort.disabled = true;
			this.txtSmtpPort.min = 1;
			this.txtSmtpPort.max = 49151;
			this.txtSmtpPort.value = 587;
			this.txtSmtpPort.style.width = "250px";
			this.menuArray[2].appendChild(this.txtSmtpPort);

			this.menuArray[2].appendChild(document.createElement("br"));

			const lblSender = document.createElement("div");
			lblSender.textContent = "Sender:";
			lblSender.style.display = "inline-block";
			lblSender.style.fontWeight = "600";
			lblSender.style.minWidth = "150px";
			this.menuArray[2].appendChild(lblSender);
			this.txtSender = document.createElement("input");
			this.txtSender.type = "text";
			this.txtSender.disabled = true;
			this.txtSender.style.width = "250px";
			this.menuArray[2].appendChild(this.txtSender);

			this.menuArray[2].appendChild(document.createElement("br"));

			const lblUsername = document.createElement("div");
			lblUsername.textContent = "Username:";
			lblUsername.style.display = "inline-block";
			lblUsername.style.fontWeight = "600";
			lblUsername.style.minWidth = "150px";
			this.menuArray[2].appendChild(lblUsername);
			this.txtUsername = document.createElement("input");
			this.txtUsername.type = "text";
			this.txtUsername.disabled = true;
			this.txtUsername.style.width = "250px";
			this.menuArray[2].appendChild(this.txtUsername);

			this.menuArray[2].appendChild(document.createElement("br"));

			const lblPassword = document.createElement("div");
			lblPassword.textContent = "Password:";
			lblPassword.style.display = "inline-block";
			lblPassword.style.fontWeight = "600";
			lblPassword.style.minWidth = "150px";
			this.menuArray[2].appendChild(lblPassword);
			this.txtPassword = document.createElement("input");
			this.txtPassword.type = "password";
			this.txtPassword.disabled = true;
			this.txtPassword.style.width = "250px";
			this.menuArray[2].appendChild(this.txtPassword);

			this.menuArray[2].appendChild(document.createElement("br"));

			const lblSsl = document.createElement("div");
			lblSsl.textContent = "SSL:";
			lblSsl.style.display = "inline-block";
			lblSsl.style.fontWeight = "600";
			lblSsl.style.minWidth = "150px";
			this.menuArray[2].appendChild(lblSsl);
			const divSSL = document.createElement("div");
			divSSL.style.margin = "4px";
			divSSL.style.display = "inline-block";
			this.menuArray[2].appendChild(divSSL);
			this.chkSsl = document.createElement("input");
			this.chkSsl.type = "checkbox";
			this.chkSsl.disabled = true;
			divSSL.appendChild(this.chkSsl);
			const sslLabel = this.AddCheckBoxLabel(divSSL, this.chkSsl, ".");
			sslLabel.style.paddingLeft = "8px";
			sslLabel.style.color = "transparent";

			this.menuArray[2].appendChild(document.createElement("br"));
			this.menuArray[2].appendChild(document.createElement("br"));
		}

		{
			this.menuArray[3].style.textAlign = "center";

			const logo = document.createElement("img");
			logo.style.userSelect = "none";
			logo.style.userDrag = "none";
			logo.style.webkitUserDrag = "none";
			logo.width = "128";
			logo.height = "128";
			logo.src = "mono/email.svg";
			this.menuArray[3].appendChild(logo);

			this.menuArray[3].appendChild(document.createElement("br"));
			this.menuArray[3].appendChild(document.createElement("br"));

			const lblDone = document.createElement("div");
			lblDone.textContent = "E-mails are on the way!";
			lblDone.style.fontSize = "large";
			lblDone.style.fontWeight = "600";
			lblDone.style.paddingTop = "8px";
			this.menuArray[3].appendChild(lblDone);
		}

		this.menuArray[0].style.opacity = "1";
		this.menuArray[0].style.transform = "none";
		this.menuArray[0].style.visibility = "visible";
		this.btnPrevious.disabled = true;
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
		this.menuArray[this.index].style.visibility = "visible";
		this.menuArray[this.index].style.zIndex = 1;

		this.btnNext.disabled = false;

		if (this.index === 0)
			this.btnPrevious.disabled = true;

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
			//this.btnPrevious.disabled = true;
			this.btnNext.disabled = true;
			this.Send();
			return;
		}

		this.menuArray[this.index].style.opacity = "1";
		this.menuArray[this.index].style.transform = "none";
		this.menuArray[this.index].style.visibility = "visible";
		this.menuArray[this.index].style.zIndex = 1;

		this.btnPrevious.disabled = false;
		this.btnNext.value = this.index === 2 ? "Send" : "Next";
	}

	async GetSmtpProfiles() {
		try {
			const response = await fetch("config/smtpprofiles/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw(json.error);

			for (let i = 0; i < json.length; i++) {
				const newOption = document.createElement("option");
				newOption.value = i;
				newOption.text = json[i].server;
				this.txtSmtpProfile.appendChild(newOption);
			}

			this.txtSmtpProfile.onchange = ()=>{
				this.txtSmtpServer.value = json[this.txtSmtpProfile.value].server;
				this.txtSmtpPort.value = json[this.txtSmtpProfile.value].port;
				this.txtSender.value = json[this.txtSmtpProfile.value].sender;
				this.txtUsername.value = json[this.txtSmtpProfile.value].username;
				this.txtPassword.value = "placeholder";
				this.chkSsl.checked = json[this.txtSmtpProfile.value].ssl;
				this.smtpGuid = json[this.txtSmtpProfile.value].guid;
			};

			this.txtSmtpProfile.onchange();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async Send() {
		let payload = "";
		payload += `${this.rngThreshold.value}${String.fromCharCode(127)}`;
		payload += `${this.smtpGuid}${String.fromCharCode(127)}`;

		for (let k in this.includeList)
		if (this.includeList[k].checked == true)
			payload += `${k}${String.fromCharCode(127)}`;

		try {
			const response = await fetch("db/gandalf", {
				method: "POST",
				body: payload
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			const json = await response.json();

			if (json.error) throw(json.error);

			this.menuArray[this.index].style.opacity = "1";
			this.menuArray[this.index].style.transform = "none";
			this.menuArray[this.index].style.visibility = "visible";
			this.menuArray[this.index].style.zIndex = 1;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}
}