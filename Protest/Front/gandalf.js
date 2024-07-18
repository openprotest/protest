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

		this.previousButton = document.createElement("input");
		this.previousButton.type = "button";
		this.previousButton.value = "Previous";
		this.previousButton.style.minWidth = "96px";
		this.previousButton.style.height = "32px";
		buttons.appendChild(this.previousButton);

		this.nextButton = document.createElement("input");
		this.nextButton.type = "button";
		this.nextButton.value = "Next";
		this.nextButton.style.minWidth = "96px";
		this.nextButton.style.height = "32px";
		buttons.appendChild(this.nextButton);

		this.previousButton.onclick = ()=> this.Previous();
		this.nextButton.onclick = ()=> this.Next();

		
		this.InitMenus();

		setTimeout(async ()=>{
			await this.GetEntropy();
			this.GetSmtpProfiles();
		},0);

	}

	async GetEntropy(callback) {
		try {
			const response = await fetch("db/getentropy");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			const json = await response.json();
			if (json.error) throw(json.error);

			this.entropy = json;
			this.thresholdRange.oninput();
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
			description.textContent = "Gandalf serves as a security tool designed to help you identify users with weak and vulnerable passwords. Individuals falling below the strength threshold will receive an email prompt, urging them to switch to a more robust and secure password.";
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
			const thresholdLabel = document.createElement("div");
			thresholdLabel.textContent = "Threshold:";
			thresholdLabel.style.display = "inline-block";
			thresholdLabel.style.fontWeight = "600";
			thresholdLabel.style.minWidth = "150px";
			this.menuArray[1].appendChild(thresholdLabel);

			this.thresholdRange = document.createElement("input");
			this.thresholdRange.type = "range";
			this.thresholdRange.min = 18;
			this.thresholdRange.max = 128;
			this.thresholdRange.value = 65;
			this.thresholdRange.style.width = "200px";
			this.menuArray[1].appendChild(this.thresholdRange);

			const thresholdValueLabel = document.createElement("div");
			thresholdValueLabel.textContent = "60-bits";
			thresholdValueLabel.style.display = "inline-block";
			thresholdValueLabel.style.paddingLeft = "8px";
			this.menuArray[1].appendChild(thresholdValueLabel);

			this.menuArray[1].appendChild(document.createElement("br"));
			this.menuArray[1].appendChild(document.createElement("br"));

			const totalLabel = document.createElement("div");
			totalLabel.textContent = "Total users:";
			totalLabel.style.display = "inline-block";
			totalLabel.style.fontWeight = "600";
			totalLabel.style.minWidth = "150px";
			this.menuArray[1].appendChild(totalLabel);

			const totalValueLabel = document.createElement("div");
			totalValueLabel.textContent = "0";
			totalValueLabel.style.display = "inline-block";
			totalValueLabel.style.minWidth = "100px";
			this.menuArray[1].appendChild(totalValueLabel);

			const asteriskLabel = document.createElement("div");
			asteriskLabel.textContent = "* Only users with an email address will be counted.";
			asteriskLabel.style.display = "inline-block";
			asteriskLabel.style.fontStyle = "italic";
			this.menuArray[1].appendChild(asteriskLabel);

			this.menuArray[1].appendChild(document.createElement("br"));
			this.menuArray[1].appendChild(document.createElement("br"));

			const includeLabel = document.createElement("div");
			includeLabel.textContent = "Include:";
			includeLabel.style.display = "inline-block";
			includeLabel.style.fontWeight = "600";
			includeLabel.style.minWidth = "150px";
			this.menuArray[1].appendChild(includeLabel);

			this.divInclude = document.createElement("div");
			this.menuArray[1].appendChild(this.divInclude);

			let parameters = new Set();
			for (let user in LOADER.users.data) {
				for (let attr in LOADER.users.data[user]) {
					if (attr.indexOf("password") > -1 && !parameters.has(attr)) {
						parameters.add(attr);
					}
				}
			}

			for (let i = 0; i < LOADER.users.data.length; i++) {
				for (let k in LOADER.users.data[i]) {
					if (k.indexOf("password") > -1 && !parameters.has(k)) {
						parameters.add(k);
					}
				}
			}

			includeLabel.style.visibility = parameters.size === 1 ? "hidden" : "visible";

			parameters.forEach((key, value, set)=> {
				if (key === "password") return;

				const div = document.createElement("div");
				div.style.padding = "4px";
				this.divInclude.appendChild(div);

				const toggle = this.CreateToggle(key, true, div);
				this.includeList[key] = toggle.checkbox;
				toggle.checkbox.onchange = ()=> this.thresholdRange.oninput();
			});

			this.thresholdRange.oninput =
			this.thresholdRange.onchange = ()=> {
				let strength = "";
				if      (this.thresholdRange.value < 19)  strength = "Forbidden";
				else if (this.thresholdRange.value < 28)  strength = "Very weak";
				else if (this.thresholdRange.value < 36)  strength = "Weak";
				else if (this.thresholdRange.value < 60)  strength = "Reasonable";
				else if (this.thresholdRange.value < 128) strength = "Strong";
				else                                      strength = "Overkill";

				thresholdValueLabel.textContent = `${this.thresholdRange.value}-bits (${strength} or bellow)`;

				if (this.entropy)
					totalValueLabel.textContent = this.entropy.reduce((sum, entry)=> {
						if (entry.entropy < this.thresholdRange.value)
							if ((this.includeList[entry.attr] && this.includeList[entry.attr].checked) || entry.attr === "password")
								return ++sum;
						return sum;
					}, 0);
			};

			this.thresholdRange.oninput();
		}

		{
			const smtpTitleLabel = document.createElement("div");
			smtpTitleLabel.textContent = "SMTP client setup";
			smtpTitleLabel.style.textAlign = "center";
			smtpTitleLabel.style.textDecoration= "underline";
			smtpTitleLabel.style.fontSize = "large";
			smtpTitleLabel.style.fontWeight= "600";
			this.menuArray[2].appendChild(smtpTitleLabel);

			this.menuArray[2].appendChild(document.createElement("br"));

			const smtpProfileLabel = document.createElement("div");
			smtpProfileLabel.textContent = "SMTP profile:";
			smtpProfileLabel.style.display = "inline-block";
			smtpProfileLabel.style.fontWeight = "600";
			smtpProfileLabel.style.minWidth = "150px";
			this.menuArray[2].appendChild(smtpProfileLabel);
			this.smtpProfileInput = document.createElement("select");
			this.smtpProfileInput.style.width = "250px";
			this.smtpProfileInput.style.boxSizing = "content-box";
			this.menuArray[2].appendChild(this.smtpProfileInput);

			this.menuArray[2].appendChild(document.createElement("br"));

			const smtpServerLabel = document.createElement("div");
			smtpServerLabel.textContent = "SMTP server:";
			smtpServerLabel.style.display = "inline-block";
			smtpServerLabel.style.fontWeight = "600";
			smtpServerLabel.style.minWidth = "150px";
			this.menuArray[2].appendChild(smtpServerLabel);
			this.smtpServerInput = document.createElement("input");
			this.smtpServerInput.type = "text";
			this.smtpServerInput.disabled = true;
			this.smtpServerInput.placeholder = "smtp.gmail.com";
			this.smtpServerInput.style.width = "250px";
			this.menuArray[2].appendChild(this.smtpServerInput);

			this.menuArray[2].appendChild(document.createElement("br"));

			const smtpPortLabel = document.createElement("div");
			smtpPortLabel.textContent = "Port:";
			smtpPortLabel.style.display = "inline-block";
			smtpPortLabel.style.fontWeight = "600";
			smtpPortLabel.style.minWidth = "150px";
			this.menuArray[2].appendChild(smtpPortLabel);
			this.smtpPortInput = document.createElement("input");
			this.smtpPortInput.type = "number";
			this.smtpPortInput.disabled = true;
			this.smtpPortInput.min = 1;
			this.smtpPortInput.max = 49151;
			this.smtpPortInput.value = 587;
			this.smtpPortInput.style.width = "250px";
			this.menuArray[2].appendChild(this.smtpPortInput);

			this.menuArray[2].appendChild(document.createElement("br"));

			const senderLabel = document.createElement("div");
			senderLabel.textContent = "Sender:";
			senderLabel.style.display = "inline-block";
			senderLabel.style.fontWeight = "600";
			senderLabel.style.minWidth = "150px";
			this.menuArray[2].appendChild(senderLabel);
			this.senderInput = document.createElement("input");
			this.senderInput.type = "text";
			this.senderInput.disabled = true;
			this.senderInput.style.width = "250px";
			this.menuArray[2].appendChild(this.senderInput);

			this.menuArray[2].appendChild(document.createElement("br"));

			const usernameLabel = document.createElement("div");
			usernameLabel.textContent = "Username:";
			usernameLabel.style.display = "inline-block";
			usernameLabel.style.fontWeight = "600";
			usernameLabel.style.minWidth = "150px";
			this.menuArray[2].appendChild(usernameLabel);
			this.usernameInput = document.createElement("input");
			this.usernameInput.type = "text";
			this.usernameInput.disabled = true;
			this.usernameInput.style.width = "250px";
			this.menuArray[2].appendChild(this.usernameInput);

			this.menuArray[2].appendChild(document.createElement("br"));

			const passwordLabel = document.createElement("div");
			passwordLabel.textContent = "Password:";
			passwordLabel.style.display = "inline-block";
			passwordLabel.style.fontWeight = "600";
			passwordLabel.style.minWidth = "150px";
			this.menuArray[2].appendChild(passwordLabel);
			this.passwordInput = document.createElement("input");
			this.passwordInput.type = "password";
			this.passwordInput.disabled = true;
			this.passwordInput.style.width = "250px";
			this.menuArray[2].appendChild(this.passwordInput);

			this.menuArray[2].appendChild(document.createElement("br"));

			const sslLabel = document.createElement("div");
			sslLabel.textContent = "SSL:";
			sslLabel.style.display = "inline-block";
			sslLabel.style.fontWeight = "600";
			sslLabel.style.minWidth = "150px";
			this.menuArray[2].appendChild(sslLabel);
			const sslBox = document.createElement("div");
			sslBox.style.margin = "4px";
			sslBox.style.display = "inline-block";
			this.menuArray[2].appendChild(sslBox);

			this.sslToggle = this.CreateToggle(".", true, sslBox);
			this.sslToggle.label.style.paddingLeft = "8px";
			this.sslToggle.label.style.color = "transparent";

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

			const doneLabel = document.createElement("div");
			doneLabel.textContent = "E-mails are on the way!";
			doneLabel.style.fontSize = "large";
			doneLabel.style.fontWeight = "600";
			doneLabel.style.paddingTop = "8px";
			this.menuArray[3].appendChild(doneLabel);
		}

		this.menuArray[0].style.opacity = "1";
		this.menuArray[0].style.transform = "none";
		this.menuArray[0].style.visibility = "visible";
		this.previousButton.disabled = true;
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

		this.nextButton.disabled = false;

		if (this.index === 0)
			this.previousButton.disabled = true;

		this.nextButton.value = this.index === 2 ? "Send" : "Next";
	}

	Next() {
		if (this.index === this.menuArray.length - 1) {
			this.Close();
			return;
		}

		if (this.index === 2)
			if (this.smtpServerInput.value.length === 0 ||
				this.smtpPortInput.value.length === 0 ||
				this.senderInput.value.length === 0 ||
				this.usernameInput.value.length === 0 ||
				this.passwordInput.value.length === 0) {
				this.ConfirmBox("Incomplete form. All fields are required.", true);
				return;
			}

		this.menuArray[this.index].style.opacity = "0";
		this.menuArray[this.index].style.transform = "translate(-100%) scale(.8)";
		this.menuArray[this.index].style.visibility = "hidden";
		this.menuArray[this.index].style.zIndex = 0;

		this.index++;

		if (this.index === 3) {
			//this.previousButton.disabled = true;
			this.nextButton.disabled = true;
			this.Send();
			return;
		}

		this.menuArray[this.index].style.opacity = "1";
		this.menuArray[this.index].style.transform = "none";
		this.menuArray[this.index].style.visibility = "visible";
		this.menuArray[this.index].style.zIndex = 1;

		this.previousButton.disabled = false;
		this.nextButton.value = this.index === 2 ? "Send" : "Next";
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
				this.smtpProfileInput.appendChild(newOption);
			}

			this.smtpProfileInput.onchange = ()=>{
				if (!this.smtpProfileInput.value) return;
				this.smtpServerInput.value = json[this.smtpProfileInput.value].server;
				this.smtpPortInput.value = json[this.smtpProfileInput.value].port;
				this.senderInput.value = json[this.smtpProfileInput.value].sender;
				this.usernameInput.value = json[this.smtpProfileInput.value].username;
				this.passwordInput.value = "placeholder";
				this.sslToggle.checkbox.checked = json[this.smtpProfileInput.value].ssl;
				this.smtpGuid = json[this.smtpProfileInput.value].guid;
			};

			this.smtpProfileInput.onchange();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async Send() {
		let payload = "";
		payload += `${this.thresholdRange.value}${String.fromCharCode(127)}`;
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