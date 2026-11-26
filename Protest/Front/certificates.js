"use strict";
class Certificates extends List {
	constructor(args) {
		super(args);

		Window.AddCssDependencies("list.css");

		this.SetTitle("Certificates");
		this.SetIcon("mono/certificate.svg");

		const columns = [
			"name",
			{label:"status", render:entry=> this.StyleStatusLabel(document.createElement("div"), entry.status?.v)},
			{label:"issued at", value:entry=> this.FormatValidityDate(entry["issued at"]?.v)},
			{label:"expired at", value:entry=> this.FormatValidityDate(entry["expired at"]?.v)}
		];

		if (this.args.sort === "date" || this.args.sort === "size") this.args.sort = "";
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";
		this.listBox.onDoubleClick = (entry, element)=> this.PasswordDialog(element.id);

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create certificate", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.AddToolbarSeparator();
		this.uploadButton = this.AddToolbarButton("Upload", "mono/upload.svg?light");
		this.downloadButton = this.AddToolbarButton("Download", "mono/download.svg?light");

		this.createButton.onclick = () => this.CreateDialog();
		this.deleteButton.onclick = () => this.Delete();
		this.uploadButton.onclick = () => this.UploadDialog();
		this.downloadButton.onclick = () => this.Download();

		this.UpdateAuthorization();

		this.GetCertFiles();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("certificates:write");
		this.createButton.disabled = !this.canWrite;
		this.deleteButton.disabled = !this.canWrite;
		this.uploadButton.disabled = !this.canWrite;
		this.downloadButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	async GetCertFiles() {
		try {
			const response = await fetch("config/cert/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.link = json;
			this.RefreshList();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	RefreshList() { //overrides
		if (this.link?.data) {
			const now = Date.now();
			for (const entry of Object.values(this.link.data)) {
				const status = this.GetValidityStatus(entry["issued at"]?.v, entry["expired at"]?.v, now);
				if (status) entry.status = {v:status};
				else delete entry.status;
			}
		}
		super.RefreshList();
	}

	FormatValidityDate(value) {
		const timestamp = Date.parse(value);
		return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString(UI.regionalFormat) : "--";
	}

	GetValidityStatus(issuedAt, expiresAt, now = Date.now()) {
		const start = Date.parse(issuedAt);
		const end = Date.parse(expiresAt);
		if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;

		if (now < start) return "Not yet valid";
		if (now > end) return "Expired";
		return "Valid";
	}

	StyleStatusLabel(label, status) {
		label.textContent = status ?? "";
		label.style.fontWeight = "bold";

		switch (status) {
			case "Not yet valid": label.style.color = "hsl(from rgb(0,162,232) h s calc(l / 1.4))"; break;
			case "Valid"        : label.style.color = `hsl(from ${UI.PingColor(0)} h s calc(l / 1.8))`; break;
			case "Expired"      : label.style.color = "hsl(from var(--clr-critical) h s calc(l / 1.2))"; break;
		}

		return label;
	}

	PasswordDialog(name) {
		const dialog = this.DialogBox("108px");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const passwordLabel = document.createElement("div");
		passwordLabel.textContent = "Password:";
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.height = "32px";
		passwordLabel.style.lineHeight = "32px";
		passwordLabel.style.paddingRight = "8px";

		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.marginTop = "20px";
		passwordInput.style.width = "min(calc(100% - 8px), 200px)";

		dialog.innerBox.append(passwordLabel, passwordInput);

		passwordInput.focus();

		dialog.okButton.onclick = async ()=> {
			dialog.cancelButton.onclick();
			setTimeout(async()=>{
				try {
					await this.CertInto(name, passwordInput.value);
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			}, WIN.ANIME_DURATION);
		};

		passwordInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		};
	}

	async CertInto(name, password) {
		const entry = this.link?.data[name];
		const response = await fetch(`config/cert/info?name=${encodeURIComponent(name)}`, {
			method: "POST",
			body: JSON.stringify({password: password})
		});
		if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

		const json = await response.json();
		if (json.error) throw(json.error);

		const status = this.GetValidityStatus(json.issuedAt, json.expiresAt);
		if (json.validitySaved && status && entry && this.link?.data[name] === entry) {
			entry["issued at"] = {v:new Date(json.issuedAt).toISOString()};
			entry["expired at"] = {v:new Date(json.expiresAt).toISOString()};
			this.RefreshList();
		}

		const dialog = this.DialogBox("80%");
		if (dialog === null) return;

		const {cancelButton, innerBox} = dialog;
		cancelButton.style.display = "none";

		innerBox.style.padding = "20px 20px 0 20px";
		innerBox.style.userSelect = "text";
		innerBox.parentElement.style.top = "10%";
		innerBox.parentElement.style.maxWidth = "800px";

		const CreateLine = (name, value)=> {
			const container = document.createElement("div");
			container.style.padding = "4px 0";
			innerBox.appendChild(container);

			const nameLabel = document.createElement("div");
			nameLabel.textContent = `${name}:`;
			nameLabel.style.display = "inline-block";
			nameLabel.style.width = "max(100px, 35%)";
			nameLabel.style.overflow = "hidden";
			nameLabel.style.textOverflow = "ellipsis";
			nameLabel.style.whiteSpace = "nowrap";

			const valueLabel = document.createElement("div");
			valueLabel.textContent = value;
			valueLabel.style.display = "inline-block";
			valueLabel.style.fontWeight = "bold";
			valueLabel.style.width = "calc(100% - max(100px, 35%))";
			valueLabel.style.overflow = "hidden";
			valueLabel.style.textOverflow = "ellipsis";

			container.append(nameLabel, valueLabel);
			return valueLabel;
		};

		CreateLine("Subject", json.subject);
		CreateLine("Issuer", json.issuer);
		CreateLine("Friendly name", json.friendlyName);
		CreateLine("Thumbprint", json.thumbprint);
		CreateLine("Serial number", json.serialNumber);

		CreateLine("Issued at", json.issuedAt);
		CreateLine("Expires at", json.expiresAt);
		this.StyleStatusLabel(CreateLine("Status", ""), status);

		CreateLine("Has private key", json.hasPrivateKey);

		CreateLine("Signature algorithm", json.signatureAlgorithm);
		CreateLine("Public key algorithm", json.publicKeyAlgorithm);

		CreateLine("Version", json.version);
		CreateLine("Key size", json.keySize);

		CreateLine("DNS Names", json.dnsNames);

	}

	CreateDialog() {
		const dialog = this.DialogBox("420px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Create";

		innerBox.parentElement.style.maxWidth = "640px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 150px auto auto";
		innerBox.style.gridTemplateRows = "repeat(6, 38px) 72px";
		innerBox.style.alignItems = "center";

		let counter = 0;
		const AddParameter = (name, tag, type, properties) => {
			counter++;

			const label = document.createElement("div");
			label.style.gridArea = `${counter} / 2`;
			label.textContent = `${name}:`;

			const input = document.createElement(tag);
			input.style.gridArea = `${counter} / 3`;
			if (type) {
				input.type = type;
			}

			for (let param in properties) {
				input[param] = properties[param];
			}

			innerBox.append(label, input);

			return input;
		};

		const nameInput = AddParameter("Name", "input", "text");

		const domainInput = AddParameter("Domain", "input", "text");

		const rsaKeyInput = AddParameter("RSA key size", "select", null);
		for (let i=0; i<5; i++) {
			const option = document.createElement("option");
			option.value = 256 * 2 ** i;
			option.text = `${option.value} bits`;
			rsaKeyInput.appendChild(option);
		}
		rsaKeyInput.value = 2048;

		const hashAlgorithmInput = AddParameter("Hash algorithm", "select", null);
		for (const algorithm of ["MD5", "SHA1", "SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-384", "SHA3-512"]) {
			const option = document.createElement("option");
			option.value = algorithm.toLowerCase();
			option.text = algorithm;
			hashAlgorithmInput.appendChild(option);
		}
		hashAlgorithmInput.value = "sha-256";

		const now = new Date();
		const validAfter = AddParameter("Valid after", "input", "date", {value: now.toISOString().substring(0, 10)});

		const after5y = new Date(now.setFullYear(now.getFullYear() + 5));
		const validBefore = AddParameter("Valid before", "input", "date", {value: after5y.toISOString().substring(0, 10)});

		const subjectAlternativeInput = AddParameter("Alternative names", "textarea", null, {placeholder: "comma separated list"});
		subjectAlternativeInput.style.resize = "none";

		const passwordInput = AddParameter("Password", "input", "password");

		setTimeout(()=>nameInput.focus(), 200);

		okButton.onclick = async ()=> {
			let requiredFieldMissing = false;
			let requiredFields = [nameInput, domainInput];

			for (let i=0; i<requiredFields.length; i++) {
				if (requiredFields[i].value.length === 0) {
					if (!requiredFieldMissing) requiredFields[i].focus();
					requiredFields[i].required = true;
					requiredFieldMissing = true;
					requiredFields[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredFields[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			let body = `name=${nameInput.value}\n`;
			body += `domain=${domainInput.value}\n`;
			body += `keysize=${rsaKeyInput.value}\n`;
			body += `hash=${hashAlgorithmInput.value}\n`;
			body += `validafter=${validAfter.value}\n`;
			body += `validbefore=${validBefore.value}\n`;
			body += `alternative=${subjectAlternativeInput.value}\n`;
			body += `password=${passwordInput.value}\n`;

			try {
				const response = await fetch("config/cert/create", {
					method: "POST",
					body: body
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.link = json;
				this.RefreshList();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}

			dialog.Close();
		};
	}

	Delete() {
		if (this.args.select === null) return;

		this.ConfirmBox("Are you sure you want delete this certificate?").addEventListener("click", async()=> {
			try {
				const response = await fetch(`config/cert/delete?name=${encodeURIComponent(this.args.select)}`, { method: "POST" });
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				this.selected = null;
				this.args.select = null;

				this.link = json;
				this.RefreshList();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});
	}

	UploadDialog() {
		const dialog = this.DialogBox("260px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Upload";
		okButton.disabled = true;

		const dropArea = document.createElement("div");
		dropArea.style.minHeight = "20px";
		dropArea.style.margin = "16px";
		dropArea.style.padding = "32px 0";
		dropArea.style.border = "2px dashed var(--clr-dark)";
		dropArea.style.borderRadius = "8px";
		dropArea.style.transition = ".4s";

		const message = document.createElement("div");
		message.textContent = "Drop a certificate file here to upload it";
		message.style.color = "var(--clr-dark)";
		message.style.fontWeight = "600";
		message.style.textAlign = "center";
		message.style.overflowWrap = "anywhere";
		message.setAttribute("aria-live", "polite");
		dropArea.append(message);

		const passwordLabel = document.createElement("label");
		passwordLabel.textContent = "Certificate password (optional)";
		passwordLabel.style.margin = "0 16px";
		passwordLabel.style.display = "none";

		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.autocomplete = "off";
		passwordInput.style.display = "block";
		passwordInput.style.width = "100%";
		passwordLabel.appendChild(passwordInput);

		let file = null;
		let isBusy = false;

		dropArea.ondragover = ()=> {
			if (isBusy) return;
			dropArea.style.backgroundColor = "var(--clr-control)";
			dropArea.style.border = "2px solid var(--clr-dark)";
			return false;
		};
		dropArea.ondragleave = ()=> {
			if (isBusy) return;
			dropArea.style.backgroundColor = "";
			dropArea.style.border = "2px dashed var(--clr-dark)";
		};
		dropArea.ondrop = event=> {
			event.preventDefault();

			if (isBusy) return;

			dropArea.style.backgroundColor = "";
			dropArea.style.border = "2px dashed var(--clr-dark)";

			file = null;
			passwordInput.value = "";
			passwordLabel.style.display = "none";
			okButton.disabled = true;

			if (event.dataTransfer.files.length !== 1) {
				message.textContent = "Please drop a single file.";
				return;
			}

			const droppedFile = event.dataTransfer.files[0];
			if (!droppedFile.name.toLowerCase().endsWith(".pfx")) {
				message.textContent = "Unsupported file type.";
				return;
			}

			file = droppedFile;
			message.textContent = file.name;
			passwordLabel.style.display = "block";
			okButton.disabled = false;
			passwordInput.focus();
		};

		passwordInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.click();
		};

		okButton.onclick = async ()=> {
			if (!file || isBusy) return;

			const formData = new FormData();
			formData.append("file", file);
			if (passwordInput.value) formData.append("password", passwordInput.value);

			isBusy = true;
			okButton.disabled = cancelButton.disabled = passwordInput.disabled = true;
			message.textContent = "Uploading certificate...";

			try {
				const response = await fetch("config/cert/upload", {
					method: "POST",
					body: formData
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.link = json;
				this.RefreshList();
				passwordInput.value = "";
				dialog.Close();
			}
			catch (ex) {
				message.textContent = ex;
			}
			finally {
				isBusy = false;
				okButton.disabled = cancelButton.disabled = passwordInput.disabled = false;
			}
		};

		innerBox.append(dropArea, passwordLabel);
	}

	Download() {
		let link = document.createElement("a");
		link.download = "name";
		link.href = `config/cert/download?name=${encodeURIComponent(this.args.select)}`;
		link.click();
		link.remove();
	}

	InflateElement(element, entry) { //overrides
		super.InflateElement(element, entry);
		element.style.backgroundImage = "url(mono/certificate.svg)";
	}
}
