"use strict";
class Certificates extends List {
	constructor(args) {
		super(args);

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("Certificates");
		this.SetIcon("mono/certificate.svg");

		const columns = ["name", "date", "size"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create task", "mono/add.svg?light");
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
			this.ListCerts();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
		}
	}

	ListCerts() {
		this.list.textContent = "";

		for (let key in this.link.data) {
			const element = document.createElement("div");
			element.id = key;
			element.className = "list-element";
			this.list.appendChild(element);

			this.InflateElement(element, this.link.data[key]);

			if (this.args.select && this.args.select === key) {
				this.selected = element;
				element.style.backgroundColor = "var(--clr-select)";
			}

			element.ondblclick = ()=> this.PasswordDialog(key);
		}
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
		const response = await fetch(`config/cert/info?name=${name}&password=${password}`);
		if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

		const json = await response.json();
		if (json.error) throw(json.error);

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
		};

		CreateLine("Subject", json.subject);
		CreateLine("Issuer", json.issuer);
		CreateLine("Friendly name", json.friendlyName);
		CreateLine("Thumbprint", json.thumbprint);
		CreateLine("Serial number", json.serialNumber);

		CreateLine("Issued at", json.issuedAt);
		CreateLine("Expires at", json.expiresAt);

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
		innerBox.style.gridTemplateColumns = "auto 150px 275px auto";
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
				this.ListCerts();
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
				const response = await fetch(`config/cert/delete?name=${encodeURIComponent(this.args.select)}`);
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				this.selected = null;
				this.args.select = null;

				this.link = json;
				this.ListCerts();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg")
			}
		});
	}

	UploadDialog() {
		const dialog = this.DialogBox("280px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Done";
		cancelButton.style.display = "none";

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
		dropArea.append(message);

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
		dropArea.ondrop = async event=> {
			event.preventDefault();

			if (isBusy) return;

			dropArea.style.backgroundColor = "";
			dropArea.style.border = "2px dashed var(--clr-dark)";

			if (event.dataTransfer.files.length !== 1) {
				message.textContent = "Please drop a single file.";
				return;
			}

			let file = event.dataTransfer.files[0];
			let extension = file.name.split(".");
			extension = extension[extension.length-1].toLowerCase();

			if (extension !== "pfx") {
				message.textContent = "Unsupported file type.";
				return;
			}

			const formData = new FormData();
			formData.append("file", file);

			isBusy = true;
			message.textContent = "Uploading file... This might take a second.";
			dropArea.style.border = "2px solid var(--clr-dark)";

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "32px";
			spinner.style.marginBottom = "16px";
			spinner.appendChild(document.createElement("div"));
			dropArea.appendChild(spinner);

			try {
				const response = await fetch("config/cert/upload", {
					method: "POST",
					body: formData
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.link = json;
				this.ListCerts();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
			finally {
				isBusy = false;
				message.textContent = "Drop a certificate file here to upload it";
				dropArea.style.border = "2px dashed var(--clr-dark)";
				dropArea.removeChild(spinner);
			}
		};

		innerBox.appendChild(dropArea);
	}

	Download() {
		let link = document.createElement("a");
		link.download = "name";
		link.href = `config/cert/download?name=${encodeURIComponent(this.args.select)}`;
		link.click();
		link.remove();
	}

	InflateElement(element, entry) { //overrides
		element.style.backgroundImage = "url(mono/certificate.svg)";

		for (let i = 0; i < this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in entry)) continue;

			const newAttr = document.createElement("div");
			element.appendChild(newAttr);

			switch (this.columnsElements[i].textContent) {
				case "name": newAttr.textContent = entry["name"].v; break;
				case "date": newAttr.textContent = new Date(UI.TicksToUnixDate(entry["date"].v)).toLocaleDateString(UI.regionalFormat);break;
				case "size": newAttr.textContent = UI.SizeToString(entry["size"].v); break;
			}

			if (i === 0) {
				newAttr.style.top = "5px";
				newAttr.style.left = "36px";
				newAttr.style.width = `calc(${this.columnsElements[0].style.width} - 36px)`;
				newAttr.style.whiteSpace = "nowrap";
				newAttr.style.overflow = "hidden";
				newAttr.style.textOverflow = "ellipsis";
			}
			else {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;
			}
		}

		element.onclick = ()=> {
			if (this.selected) this.selected.style.backgroundColor = "";

			this.args.select = entry.name.v;

			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};
	}
}