"use strict";
class QrGenerator extends Window {
	static loadPromise = null;

	static QUIET_ZONE = 4;
	static MIN_SIZE = 64;
	static MAX_SIZE = 4096;
	static LEVELS = {
		L: "Low (7%)",
		M: "Medium (15%)",
		Q: "Quartile (25%)",
		H: "High (30%)"
	};

	static TYPES = [
		{
			name  : "Text",
			fields: [{key:"text", multiline:true, height:"88px", placeholder:"Text"}],
			encode: f=> f.text
		},
		{
			name  : "URL",
			fields: [{key:"url", label:"URL", placeholder:"https://", wide:true}],
			encode: f=> {
				const url = f.url.trim();
				if (url.length === 0) return "";
				return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`; //"host:port" is not a scheme
			}
		},
		{
			name  : "Email",
			fields: [{key:"address", label:"Email", placeholder:"name@example.com", wide:true}],
			encode: f=> {
				const address = f.address.trim();
				return address.length > 0 ? `mailto:${encodeURI(address)}` : "";
			}
		},
		{
			name  : "Phone",
			fields: [{key:"number", label:"Number", placeholder:"+357 22 000000"}],
			encode: f=> {
				const number = f.number.replace(/[^\d+*#]/g, "");
				return number.length > 0 ? `tel:${number}` : "";
			}
		},
		{
			name  : "vCard",
			fields: [
				{key:"first",   label:"First name"},
				{key:"last",    label:"Last name"},
				{key:"org",     label:"Organization"},
				{key:"title",   label:"Job title"},
				{key:"phone",   label:"Phone"},
				{key:"mobile",  label:"Mobile"},
				{key:"email",   label:"Email"},
				{key:"website", label:"Website"},
				{key:"address", label:"Address", multiline:true, height:"44px"}
			],
			encode: f=> {
				if (Object.values(f).every(o=> o.trim().length === 0)) return "";

				const esc = value=> value.trim().replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, "\\n");
				const lines = ["BEGIN:VCARD", "VERSION:3.0"];
				lines.push(`N:${esc(f.last)};${esc(f.first)};;;`);
				const fullName = `${f.first.trim()} ${f.last.trim()}`.trim() || f.org.trim() || f.email.trim();
				lines.push(`FN:${esc(fullName)}`); //required, readers show it as the contact name
				if (f.org.trim())     lines.push(`ORG:${esc(f.org)}`);
				if (f.title.trim())   lines.push(`TITLE:${esc(f.title)}`);
				if (f.phone.trim())   lines.push(`TEL;TYPE=WORK,VOICE:${esc(f.phone)}`);
				if (f.mobile.trim())  lines.push(`TEL;TYPE=CELL:${esc(f.mobile)}`);
				if (f.email.trim())   lines.push(`EMAIL:${esc(f.email)}`);
				if (f.website.trim()) lines.push(`URL:${esc(f.website)}`);
				if (f.address.trim()) lines.push(`ADR;TYPE=WORK:;;${esc(f.address)};;;;`);
				lines.push("END:VCARD");
				return lines.join("\r\n");
			}
		},
		{
			name  : "Map",
			fields: [
				{key:"latitude",  label:"Latitude",  placeholder:"35.1856"},
				{key:"longitude", label:"Longitude", placeholder:"33.3823"},
				{key:"label",     label:"Label",     placeholder:"optional", wide:true}
			],
			encode: f=> {
				if (f.latitude.trim().length === 0 && f.longitude.trim().length === 0) return "";
				const latitude  = Number(f.latitude.trim());
				const longitude = Number(f.longitude.trim());
				if (f.latitude.trim().length === 0 || isNaN(latitude) || latitude < -90 || latitude > 90) throw new Error("Latitude must be between -90 and 90");
				if (f.longitude.trim().length === 0 || isNaN(longitude) || longitude < -180 || longitude > 180) throw new Error("Longitude must be between -180 and 180");
				const label = f.label.trim();
				return label.length > 0
					? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`
					: `geo:${latitude},${longitude}`;
			}
		},
		{
			name  : "Wi-Fi",
			fields: [
				{key:"ssid",     label:"Network (SSID)"},
				{key:"password", label:"Password", disabledWhen: f=> f.security === "nopass"},
				{key:"security", label:"Security", options:[["WPA", "WPA/WPA2/WPA3"], ["WEP", "WEP"], ["nopass", "None"]]},
				{key:"hidden",   label:"Hidden network", toggle:true}
			],
			encode: f=> {
				if (f.ssid.length === 0) return "";

				//special characters are escaped with a backslash
				const esc = value=> value.replace(/([\\;,:"])/g, "\\$1");
				let payload = `WIFI:T:${f.security};S:${esc(f.ssid)};`;
				if (f.security !== "nopass") payload += `P:${esc(f.password)};`;
				if (f.hidden) payload += "H:true;";
				return `${payload};`;
			}
		}
	];

	constructor(args) {
		super();

		this.args = {
			type       : QrGenerator.TYPES.some(o=> o.name === args?.type) ? args.type : "Text",
			level      : args?.level in QrGenerator.LEVELS ? args.level : "M",
			width      : QrGenerator.ClampSize(args?.width ?? 1024),
			height     : QrGenerator.ClampSize(args?.height ?? 1024),
			dark       : QrGenerator.IsColor(args?.dark) ? args.dark : "#000000",
			light      : QrGenerator.IsColor(args?.light) ? args.light : "#ffffff",
			transparent: args?.transparent === true,
			format     : args?.format === "svg" ? "svg" : "png"
		};

		this.SetTitle("QR code generator");
		this.SetIcon("mono/qrcode.svg");

		this.model = null;

		this.content.style.padding = "16px";

		const container = document.createElement("div");
		container.style.height = "calc(100% - 16px)";
		container.style.maxWidth = "800px";
		container.style.maxHeight = "600px";
		container.style.margin = "0 auto";
		container.style.padding = "12px";
		container.style.boxSizing = "border-box";
		container.style.backgroundColor = "var(--clr-pane)";
		container.style.color = "var(--clr-dark)";
		container.style.borderRadius = "4px";
		container.style.display = "grid";
		container.style.gridTemplateColumns = "300px minmax(0, 1fr)";
		container.style.gridTemplateRows = "auto auto minmax(0, 1fr) 44px";
		container.style.gap = "8px 16px";
		container.style.overflow = "auto";
		this.content.appendChild(container);

		this.typeBox = new FewBox(QrGenerator.TYPES.map(o=> o.name));
		this.typeBox.container.style.gridArea = "1 / 1 / 2 / 3";
		this.typeBox.container.style.maxWidth = "none";
		this.typeBox.container.style.margin = "0 0 12px 0";
		container.appendChild(this.typeBox.container);

		this.form = document.createElement("div");
		this.form.style.gridArea = "2 / 1 / 3 / 3";
		this.form.style.display = "grid";
		this.form.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
		this.form.style.gap = "4px 16px";
		this.form.style.maxHeight = "196px"; //the vcard fields in two columns
		this.form.style.marginBottom = "12px";
		this.form.style.padding = "4px"; //room for the 3px focus outline, the scrolling area clips it otherwise
		this.form.style.overflowY = "auto";
		container.appendChild(this.form);

		const options = document.createElement("div");
		options.style.gridArea = "3 / 1 / 5 / 2";
		options.style.display = "flex";
		options.style.flexDirection = "column";
		options.style.gap = "4px";
		options.style.overflowY = "auto";
		container.appendChild(options);

		const AddOption = (text, control)=> {
			const pair = document.createElement("div");
			pair.style.display = "flex";
			pair.style.alignItems = "center";
			pair.style.minHeight = "32px";

			const label = document.createElement("div");
			label.textContent = text;
			label.style.width = "116px";
			label.style.flexShrink = "0";
			label.style.textAlign = "right";
			label.style.paddingRight = "8px";

			pair.append(label, control);
			options.appendChild(pair);
		};

		const CreateSizeInput = value=> {
			const input = document.createElement("input");
			input.type = "number";
			input.min = QrGenerator.MIN_SIZE;
			input.max = QrGenerator.MAX_SIZE;
			input.value = value;
			return input;
		};

		//the inputs of the options column share one width, the color buttons keep theirs
		const SetOptionWidth = input=> {
			input.style.width = "160px";
			input.style.boxSizing = "border-box";
		};

		const CreateColorInput = value=> {
			const input = document.createElement("input");
			input.type = "color";
			input.value = value;
			input.style.width = "48px";
			input.style.height = "28px";
			input.style.padding = "4px 8px";
			return input;
		};

		this.levelInput = document.createElement("select");
		for (const level in QrGenerator.LEVELS) {
			this.levelInput.append(new Option(QrGenerator.LEVELS[level], level));
		}
		this.levelInput.value = this.args.level;

		this.formatInput = document.createElement("select");
		this.formatInput.append(new Option("PNG", "png"), new Option("SVG", "svg"));
		this.formatInput.value = this.args.format;

		this.widthInput  = CreateSizeInput(this.args.width);
		this.heightInput = CreateSizeInput(this.args.height);

		this.darkInput  = CreateColorInput(this.args.dark);
		this.lightInput = CreateColorInput(this.args.light);

		const transparentBox = document.createElement("div");
		this.transparentToggle = this.CreateToggle("Transparent", this.args.transparent, transparentBox);

		SetOptionWidth(this.levelInput);
		SetOptionWidth(this.widthInput);
		SetOptionWidth(this.heightInput);

		AddOption("Error correction:", this.levelInput);
		AddOption("Width (px):",       this.widthInput);
		AddOption("Height (px):",      this.heightInput);
		AddOption("Foreground:",       this.darkInput);
		AddOption("Background:",       this.lightInput);
		AddOption("",                  transparentBox);

		this.previewBox = document.createElement("div");
		this.previewBox.style.position = "relative";
		this.previewBox.style.display = "flex";
		this.previewBox.style.alignItems = "center";
		this.previewBox.style.justifyContent = "center";
		this.previewBox.style.overflow = "hidden";
		this.previewBox.style.gridArea = "3 / 2";
		container.appendChild(this.previewBox);

		this.previewCanvas = document.createElement("canvas");
		this.previewCanvas.style.borderRadius = "2px";
		this.previewBox.appendChild(this.previewCanvas);

		this.messageBox = document.createElement("div");
		this.messageBox.style.position = "absolute";
		this.messageBox.style.fontWeight = "600";
		this.messageBox.style.textAlign = "center";
		this.previewBox.appendChild(this.messageBox);

		const buttons = document.createElement("div");
		buttons.style.gridArea = "4 / 2";
		buttons.style.display = "flex";
		buttons.style.alignItems = "center";
		buttons.style.justifyContent = "center";
		buttons.style.gap = "4px";
		container.appendChild(buttons);

		this.saveButton = document.createElement("input");
		this.saveButton.type = "button";
		this.saveButton.value = "Save";
		this.saveButton.className = "with-icon";
		this.saveButton.style.backgroundImage = "url(mono/floppy.svg?light)";
		buttons.append(this.formatInput, this.saveButton);

		this.typeBox.Select(QrGenerator.TYPES.findIndex(o=> o.name === this.args.type));
		this.BuildForm();

		this.typeBox.container.onchange = ()=> {
			this.args.type = QrGenerator.TYPES[this.typeBox.index].name;
			this.BuildForm();
			this.Generate();
		};

		this.levelInput.onchange = ()=> {
			this.args.level = this.levelInput.value;
			this.Generate();
		};

		this.formatInput.onchange = ()=> {
			this.args.format = this.formatInput.value;
		};

		this.widthInput.onchange = this.heightInput.onchange = ()=> {
			this.args.width  = QrGenerator.ClampSize(this.widthInput.value);
			this.args.height = QrGenerator.ClampSize(this.heightInput.value);
			this.widthInput.value  = this.args.width;
			this.heightInput.value = this.args.height;
			this.DrawPreview();
		};

		this.darkInput.oninput = ()=> {
			this.args.dark = this.darkInput.value;
			this.DrawPreview();
		};

		this.lightInput.oninput = ()=> {
			this.args.light = this.lightInput.value;
			this.DrawPreview();
		};

		this.transparentToggle.checkbox.onchange = ()=> {
			this.args.transparent = this.transparentToggle.checkbox.checked;
			this.lightInput.disabled = this.args.transparent;
			this.DrawPreview();
		};
		this.lightInput.disabled = this.args.transparent;

		this.saveButton.onclick = ()=> this.Save();

		this.Generate();
	}

	BuildForm() {
		const type = QrGenerator.TYPES.find(o=> o.name === this.args.type);
		this.form.textContent = "";
		this.fields = {};

		for (const field of type.fields) {
			const pair = document.createElement("div");
			pair.style.display = "flex";
			pair.style.alignItems = field.multiline ? "start" : "center";
			pair.style.minHeight = "32px";
			if (field.multiline || field.wide) pair.style.gridColumn = "1 / -1";
			this.form.appendChild(pair);

			if (field.label) {
				const label = document.createElement("div");
				label.textContent = field.toggle ? "" : `${field.label}:`; //a toggle carries its own text
				label.style.width = "112px";
				label.style.flexShrink = "0";
				label.style.textAlign = "right";
				label.style.paddingRight = "8px";
				if (field.multiline) label.style.paddingTop = "6px";
				pair.appendChild(label);
			}

			let input;
			if (field.toggle) {
				const box = document.createElement("div");
				pair.appendChild(box);
				input = this.CreateToggle(field.label, false, box).checkbox;
				input.onchange = ()=> this.Generate();
				this.fields[field.key] = input;
				continue;
			}
			else if (field.options) {
				input = document.createElement("select");
				for (const [value, text] of field.options) {
					input.append(new Option(text, value));
				}
				input.onchange = ()=> this.Generate();
			}
			else if (field.multiline) {
				input = document.createElement("textarea");
				input.style.resize = "none";
				input.style.height = field.height;
				input.style.fontFamily = "monospace";
				input.oninput = ()=> this.Generate();
			}
			else {
				input = document.createElement("input");
				input.type = "text";
				input.oninput = ()=> this.Generate();
			}

			input.spellcheck = false;
			input.placeholder = field.placeholder ?? "";
			input.style.flex = "1";
			input.style.minWidth = "0";
			input.style.margin = "0";
			input.style.boxSizing = "border-box";
			pair.appendChild(input);

			this.fields[field.key] = input;
		}

		this.UpdateFields();
	}

	//disables the fields that don't apply to the other values, e.g. the password of an open wi-fi network
	UpdateFields() {
		const values = this.Values();
		for (const field of QrGenerator.TYPES.find(o=> o.name === this.args.type).fields) {
			if (field.disabledWhen) this.fields[field.key].disabled = field.disabledWhen(values);
		}
	}

	Values() {
		const values = {};
		for (const key in this.fields) {
			values[key] = this.fields[key].type === "checkbox" ? this.fields[key].checked : this.fields[key].value;
		}
		return values;
	}

	Encode() {
		return QrGenerator.TYPES.find(o=> o.name === this.args.type).encode(this.Values());
	}

	static ClampSize(value) {
		const size = parseInt(value);
		if (isNaN(size)) return 1024;
		return Math.min(Math.max(size, QrGenerator.MIN_SIZE), QrGenerator.MAX_SIZE);
	}

	static IsColor(value) {
		return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
	}

	static CreateModel(text, level) {
		const bytes = Array.from(new TextEncoder().encode(text));
		if (bytes.length !== text.length) bytes.unshift(0xef, 0xbb, 0xbf);

		const model = new QRCode(document.createElement("div"), {text: "0", width: 1, height: 1, correctLevel: level})._oQRCode;
		model.dataList[0].parsedData = bytes;

		for (let version = 1; version <= 40; version++) {
			model.typeNumber = version;
			model.dataCache = null;
			try {
				model.make();
				return model;
			}
			catch {} //too small for the data, try the next version
		}

		throw new Error("Too long data");
	}

	static LoadLibrary() {
		QrGenerator.loadPromise ??= new Promise((resolve, reject)=> {
			if (typeof QRCode !== "undefined") {
				resolve();
				return;
			}

			const script = document.createElement("script");
			script.src = "qrcode/qrcode.js";
			script.onload = ()=> resolve();
			script.onerror = ()=> {
				QrGenerator.loadPromise = null;
				script.remove();
				reject(new Error("Failed to load the QR code library"));
			};
			document.head.appendChild(script);
		});

		return QrGenerator.loadPromise;
	}

	async Generate() {
		this.model = null;
		this.UpdateFields();

		let text;
		try {
			text = this.Encode();
		}
		catch (ex) {
			this.ShowMessage(ex.message);
			return;
		}

		if (text.length > 0) {
			try {
				await QrGenerator.LoadLibrary();
			}
			catch (ex) {
				this.ShowMessage(ex.message);
				return;
			}

			try {
				if (text !== this.Encode()) return; //a newer input is already generating
			}
			catch {
				return;
			}

			try {
				this.model = QrGenerator.CreateModel(text, QRCode.CorrectLevel[this.args.level]);
				this.messageBox.textContent = "";
			}
			catch {
				this.messageBox.textContent = "Too long for a QR code, shorten the text or lower the error correction";
			}
		}
		else {
			this.messageBox.textContent = this.args.type === "Text" ? "Type something to generate a QR code" : "Fill in the fields to generate a QR code";
		}

		this.saveButton.disabled = this.model === null;
		this.previewCanvas.style.visibility = this.model ? "visible" : "hidden";
		this.DrawPreview();
	}

	ShowMessage(message) {
		this.model = null;
		this.messageBox.textContent = message;
		this.saveButton.disabled = true;
		this.previewCanvas.style.visibility = "hidden";
	}

	Draw(canvas, width, height) {
		const modules = this.model.getModuleCount();
		const total = modules + QrGenerator.QUIET_ZONE * 2;

		canvas.width = width;
		canvas.height = height;

		const ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, width, height);

		if (!this.args.transparent) {
			ctx.fillStyle = this.args.light;
			ctx.fillRect(0, 0, width, height);
		}

		ctx.fillStyle = this.args.dark;
		for (let row = 0; row < modules; row++) {
			const y0 = Math.round((row + QrGenerator.QUIET_ZONE) * height / total);
			const y1 = Math.round((row + QrGenerator.QUIET_ZONE + 1) * height / total);

			for (let col = 0; col < modules; col++) {
				if (!this.model.isDark(row, col)) continue;
				const x0 = Math.round((col + QrGenerator.QUIET_ZONE) * width / total);
				const x1 = Math.round((col + QrGenerator.QUIET_ZONE + 1) * width / total);
				ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
			}
		}
	}

	DrawPreview() {
		if (!this.model) return;

		const boxWidth  = this.previewBox.clientWidth;
		const boxHeight = this.previewBox.clientHeight;
		if (boxWidth <= 0 || boxHeight <= 0) return;

		const scale = Math.min(boxWidth / this.args.width, boxHeight / this.args.height, 1);
		this.Draw(this.previewCanvas, Math.max(Math.floor(this.args.width * scale), 1), Math.max(Math.floor(this.args.height * scale), 1));
	}

	AfterResize() { //overrides
		super.AfterResize();
		this.DrawPreview();
	}

	Save() {
		if (!this.model) return;

		if (this.args.format === "svg") {
			this.Download(new Blob([this.ToSvg()], {type: "image/svg+xml"}), "svg");
			return;
		}

		const canvas = document.createElement("canvas");
		this.Draw(canvas, this.args.width, this.args.height);
		canvas.toBlob(blob=> {
			if (blob) this.Download(blob, "png");
		}, "image/png");
	}

	ToSvg() {
		const modules = this.model.getModuleCount();
		const total = modules + QrGenerator.QUIET_ZONE * 2;

		let path = "";
		for (let row = 0; row < modules; row++) {
			for (let col = 0; col < modules; col++) {
				if (!this.model.isDark(row, col)) continue;
				path += `M${col + QrGenerator.QUIET_ZONE},${row + QrGenerator.QUIET_ZONE}h1v1h-1z`;
			}
		}

		const background = this.args.transparent ? "" : `<rect width="${total}" height="${total}" fill="${this.args.light}"/>`;

		return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.args.width}" height="${this.args.height}" viewBox="0 0 ${total} ${total}" preserveAspectRatio="none" shape-rendering="crispEdges">`
			+ background
			+ `<path d="${path}" fill="${this.args.dark}"/>`
			+ `</svg>`;
	}

	Download(blob, extension) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;

		const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		link.download = `qrcode_${stamp}.${extension}`;

		document.body.appendChild(link);
		link.click();
		link.remove();

		setTimeout(()=> URL.revokeObjectURL(url), 1000);
	}
}
