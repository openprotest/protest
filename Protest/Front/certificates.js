class Certificates extends List {
	constructor() {
		super();

		this.AddCssDependencies("list.css");

		const columns = ["name", "status", "start", "task"];
		this.SetupColumns(columns);

		this.columnsOptions.style.display = "none";

		this.SetTitle("Certificates");
		this.SetIcon("mono/certificate.svg");

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create task", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.downloadButton = this.AddToolbarButton("Delete", "mono/download.svg?light");

		//this.createButton.disabled = true;
		this.deleteButton.disabled = true;
		this.downloadButton.disabled = true;

		this.createButton.onclick = () => this.CertDialog(null);
	}

	CertDialog() {
		const dialog = this.DialogBox("420px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Create";

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
			option.value = 256 * Math.pow(2, i);
			option.text = `${256 * Math.pow(2, i)} bits`;
			rsaKeyInput.appendChild(option);
		}
		rsaKeyInput.value = 2048;

		const hashAlgorithms = [ "MD5", "SHA1", "SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-384", "SHA3-512"];
		const hashAlgorithmInput = AddParameter("Hash algorithm", "select", null);
		for (let i=0; i<hashAlgorithms.length; i++) {
			const option = document.createElement("option");
			option.value = hashAlgorithms[i].toLowerCase();
			option.text = hashAlgorithms[i];
			hashAlgorithmInput.appendChild(option);
		}
		hashAlgorithmInput.value = "sha-256";

		const now = new Date();
		const validAfter = AddParameter("Valid after", "input", "date", {value: now.toISOString().substring(0, 10)});

		const after5y = new Date(now.setFullYear(now.getFullYear() + 5));
		const validBefore = AddParameter("Valid before", "input", "date", {value: after5y.toISOString().substring(0, 10)});

		const subjectAlternativeNames = AddParameter("Alternative names", "textarea", null, {placeholder: "comma separated list"});
		subjectAlternativeNames.style.resize = "none";
		
		const passwordInput = AddParameter("Password", "input", "password");

		setTimeout(()=>{ nameInput.focus() }, 200);

		okButton.addEventListener("click", async ()=>{
			let body = `name=${nameInput.value}\n`;
			body += `domain=${domainInput.value}\n`;
			body += `keysize=${rsaKeyInput.value}\n`;
			body += `hash=${hashAlgorithmInput.value}\n`;
			body += `validafter=${validAfter.value}\n`;
			body += `validbefore=${validBefore.value}\n`;
			body += `alternative=${subjectAlternativeNames.value}\n`;
			body += `password=${passwordInput.value}\n`;

			try {
				const response = await fetch("config/cert/create", {
					method: "POST",
					body: body
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				//TODO: list certificates

			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});
	}
}