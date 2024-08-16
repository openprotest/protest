class DnsSD extends Console {
	static RECORD_TYPES = [
		["A",     "IPv4 Address",       "hsl(20,85%,50%)",  1],
		["AAAA",  "IPv6 Address",       "hsl(50,85%,50%)",  28],
		["NS",    "Name Server",        "hsl(80,85%,50%)",  2],
		["CNAME", "Canonical Name",     "hsl(140,85%,50%)", 5],
		["SOA",   "Start Of Authority", "hsl(200,85%,55%)", 6] ,
		["PTR",   "Pointer",            "hsl(230,95%,65%)", 12],
		["MX",    "Mail Exchange",      "hsl(260,95%,65%)", 15],
		["TXT",   "Text",               "hsl(290,85%,55%)", 16],
		["SRV",   "Service",            "hsl(320,85%,50%)", 33],
		["NSEC",  "Next secure",        "hsl(0,85%,50%)",   47],
		["ANY",   "All types known",    "hsl(0,85%,100%)",  255]
	];

	constructor(args) {
		super();

		this.args = args ?? {
			entries       : [],
			type          : "ANY",
			timeout       : 1000,
			additionalRrs : false
		};

		this.AddCssDependencies("tools.css");

		this.hashtable = {}; //contains all elements

		this.SetTitle("DNS service discovery");
		this.SetIcon("mono/dns.svg");

		this.SetupToolbar();
		this.reloadButton  = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.clearButton   = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.copyButton   = this.AddToolbarButton("Copy", "mono/copy.svg?light");
		this.AddToolbarSeparator();
		this.recordType    = this.AddToolbarDropdown(this.GetTypeIcon(this.args.type, DnsSD.RECORD_TYPES.find(o=>o[0]===this.args.type)[2]));
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.AddSendToChatButton();

		this.inputBox.placeholder = "_http._tcp.local";

		if (this.args.entries) { //restore entries from previous session
			let temp = this.args.entries;
			this.args.entries = [];
			for (let i = 0; i < temp.length; i++) {
				let split = temp[i].split(",");
				if (split.length < 2) continue;
				this.Push(split[1], split[0]);
			}
		}

		this.reloadButton.addEventListener("click", ()=> {
			if (this.args.entries.length === 0) return;
			let entries = this.args.entries;
			this.list.textContent = "";
			this.hashtable = {};
			this.args.entries = [];

			for (let i = 0; i < entries.length; i++) {
				let split = entries[i].split(",");
				if (split.length < 2) continue;
				this.Push(split[1], split[0]);
			}
		});

		this.clearButton.addEventListener("click", ()=> {
			const okButton = this.ConfirmBox("Are you sure you want to clear the list?");
			if (okButton) okButton.addEventListener("click", ()=> {
				this.list.textContent = "";
				this.hashtable = {};
				this.args.entries = [];
			});
		});

		this.copyButton.addEventListener("click", ()=>{
			const argsCopy = structuredClone(this.args);
			argsCopy.entries = [];
			const copy = new DnsSD(argsCopy);
			const dialog = copy.OptionsDialog();

			const OriginalCancelClickHandler = dialog.cancelButton.onclick;
			dialog.okButton.onclick = ()=> {
				for (let i = 0; i < this.args.entries.length; i++) {
					let split = this.args.entries[i].split(",");
					if (split.length === 1) continue;
					copy.Add(split[1], null);
				}

				OriginalCancelClickHandler();
			};

			dialog.cancelButton.onclick = ()=> {
				copy.Close();
			};
		});

		this.optionsButton.addEventListener("click", ()=> {
			this.OptionsDialog();
		});

		for (let i = 0; i < DnsSD.RECORD_TYPES.length; i++) {
			const type = document.createElement("div");
			type.style.padding = "4px 8px";

			const label = document.createElement("div");
			label.textContent = DnsSD.RECORD_TYPES[i][0];
			label.style.display = "inline-block";
			label.style.color = DnsSD.RECORD_TYPES[i][2];
			label.style.backgroundColor = "#222";
			label.style.fontFamily = "monospace";
			label.style.fontWeight = "600";
			label.style.marginRight = "4px";
			label.style.height = "22px";
			label.style.lineHeight = "22px";
			label.style.padding = "1px 4px";
			label.style.borderRadius = "4px";

			const string = document.createElement("div");
			string.style.display = "inline-block";
			string.textContent = DnsSD.RECORD_TYPES[i][1];

			type.append(label, string);
			this.recordType.list.append(type);

			type.onclick = ()=> {
				this.args.type = DnsSD.RECORD_TYPES[i][0];
				this.recordType.button.style.backgroundImage = `url(${this.GetTypeIcon(DnsSD.RECORD_TYPES[i][0], DnsSD.RECORD_TYPES[i][2])})`;
			};
		}
		this.recordType.menu.style.height = `${DnsSD.RECORD_TYPES.length * 30}px`;
	}

	GetTypeIcon(type, color) {
		let icon = "<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" x=\"0px\" y=\"0px\" width=\"48px\" height=\"48px\" viewBox=\"0 0 48 48\">"+
		"<polygon fill=\"#c0c0c0\" points=\"15.68,1 7,10.96 7,47 41,47 41,1\"/>"+
		`<rect fill=\"${color}\" x=\"12\" y=\"26\" width=\"36\" height=\"16\" rx=\"4\" />`+
		`<text fill=\"#202020\" x=\"30\" y=\"35\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-size=\"${18 - type.length}\" font-family=\"monospace\" font-weight=\"800\">${type}</text>`+
		"</svg>";

		return `data:image/svg+xml;base64,${btoa(icon)}`;
	}

	OptionsDialog() {
		const dialog = this.DialogBox("200px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "580px";
		innerBox.style.padding = "20px 0px 0px 40px";

		const recordTypeLabel = document.createElement("div");
		recordTypeLabel.textContent = "Record type:";
		recordTypeLabel.style.display = "inline-block";
		recordTypeLabel.style.minWidth = "150px";
		innerBox.appendChild(recordTypeLabel);

		const recordTypeInput = document.createElement("select");
		recordTypeInput.style.width = "200px";
		innerBox.appendChild(recordTypeInput);

		for (let i = 0; i < DnsSD.RECORD_TYPES.length; i++) {
			const option = document.createElement("option");
			option.value = DnsSD.RECORD_TYPES[i][0];
			option.textContent = `${DnsSD.RECORD_TYPES[i][0]} - ${DnsSD.RECORD_TYPES[i][1]}`;
			recordTypeInput.appendChild(option);
		}
		recordTypeInput.value = this.args.type;

		innerBox.appendChild(document.createElement("br"));

		const timeoutLabel = document.createElement("div");
		timeoutLabel.textContent = "Time out (ms):";
		timeoutLabel.style.display = "inline-block";
		timeoutLabel.style.minWidth = "150px";
		innerBox.appendChild(timeoutLabel);

		const timeoutInput = document.createElement("input");
		timeoutInput.type = "number";
		timeoutInput.min = 500;
		timeoutInput.max = 5000;
		timeoutInput.value = this.args.timeout;
		timeoutInput.style.width = "200px";
		timeoutInput.value = this.args.timeout;
		innerBox.appendChild(timeoutInput);

		innerBox.appendChild(document.createElement("br"));

		const transportMethodLabel = document.createElement("div");
		transportMethodLabel.textContent = "Transport method:";
		transportMethodLabel.style.display = "inline-block";
		transportMethodLabel.style.minWidth = "150px";
		innerBox.appendChild(transportMethodLabel);

		const transportMethodInput = document.createElement("select");
		transportMethodInput.disabled = true;
		transportMethodInput.style.width = "200px";
		innerBox.appendChild(transportMethodInput);

		const transportOptions = ["UDP"];
		for (let i = 0; i < transportOptions.length; i++) {
			const option = document.createElement("option");
			option.value = transportOptions[i];
			option.textContent = transportOptions[i];
			transportMethodInput.appendChild(option);
		}
		transportMethodInput.value = "UDP";

		const additionalRecordsBox = document.createElement("div");
		additionalRecordsBox.style.paddingTop = "8px";
		innerBox.appendChild(additionalRecordsBox);

		const additionalRecordsToggle = this.CreateToggle("Additional records", this.args.additionalRrs, additionalRecordsBox);

		const Apply = ()=> {
			this.args.type          = recordTypeInput.value;
			this.args.timeout       = timeoutInput.value;
			this.args.additionalRrs = additionalRecordsToggle.checkbox.checked;
			this.recordType.button.style.backgroundImage = `url(${this.GetTypeIcon(this.args.type, DnsSD.RECORD_TYPES.find(o=> o[0] === this.args.type)[2])}`;
		};

		const OnKeydown = event=>{
			if (event.key === "Enter") {
				Apply();
				dialog.okButton.onclick();
			}
		};

		recordTypeInput.addEventListener("keydown", OnKeydown);
		timeoutInput.addEventListener("keydown", OnKeydown);

		okButton.addEventListener("click", ()=> {
			Apply();
		});

		recordTypeInput.focus();

		return dialog;
	}

	Push(name, type=null) { //overrides
		if (!super.Push(name)) return;
		this.Filter(name, type);
	}

	Filter(domain, type=null) {
		if (domain.indexOf(";", 0) > -1) {
			let ips = domain.split(";");
			for (let i = 0; i < ips.length; i++) this.Add(ips[i].trim());

		}
		else if (domain.indexOf(",", 0) > -1) {
			let ips = domain.split(",");
			for (let i = 0; i < ips.length; i++) this.Add(ips[i].trim());
		}
		else {
			this.Add(domain, type);
		}
	}

	async Add(query, type=null) {
		if (query.length === 0) return;

		const entryKey = `${type ?? this.args.type},${query}`;

		if (entryKey in this.hashtable) {
			this.list.appendChild(this.hashtable[entryKey].element);
			return;
		}

		const element = document.createElement("div");
		element.className = "tool-element";
		this.list.appendChild(element);

		const expandedButton = document.createElement("div");
		expandedButton.className = "tool-button-expanded";

		const name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.setAttribute("label", type ? type : this.args.type);
		name.textContent = query;

		const result = document.createElement("div");
		result.className = "tool-result collapsed";
		result.textContent = "";

		const status = document.createElement("div");
		status.className = "tool-status";
		status.textContent = "";
		element.appendChild(status);

		const remove = document.createElement("div");
		remove.className = "tool-remove";

		element.append(expandedButton, name, result,remove);

		this.hashtable[entryKey] = {
			element: element,
			result: result,
			status: status,
			expand: false,
			list: []
		};

		remove.onclick = ()=> { this.Remove(entryKey); };

		expandedButton.onclick = ()=> {
			if (this.hashtable[entryKey].expand) {
				this.hashtable[entryKey].expand = false;
				element.style.height = "32px";
				expandedButton.style.transform = "rotate(-90deg)";
				result.className = "tool-result collapsed";
				result.scrollTop = 0;
			}
			else {
				this.hashtable[entryKey].expand = true;
				element.style.height = "auto";
				expandedButton.style.transform = "rotate(0deg)";
				result.className = "tool-result expanded";
			}
		};

		this.args.entries.push(entryKey);

		try {
			let url = `tools/dnssdlookup?query=${encodeURIComponent(query)}&type=${type ?? this.args.type}&timeout=${this.args.timeout}`;
			if (this.args.additionalRrs)  url += "&additionalrrs=true";

			const response = await fetch(url);

			if (response.status !== 200) {
				LOADER.HttpErrorHandler(response.status);
			}

			const json = await response.json();

			if (json.req && json.res) {
				const hexBox = document.createElement("div");
				hexBox.style.position = "absolute";
				hexBox.style.width = "24px";
				hexBox.style.height = "24px";
				hexBox.style.right = "32px";
				hexBox.style.top = "4px";
				hexBox.style.backgroundSize = "contain";
				hexBox.style.backgroundImage = "url(mono/hexviewer.svg?light)";
				hexBox.style.cursor = "pointer";
				element.appendChild(hexBox);

				hexBox.onclick = ()=>{
					new HexViewer({
						protocol:"mdns",
						exchange:[
							{direction:"query", data:json.req},
							{direction:"response", data:json.res}
						]
					});
				};
			}

			if (json.error) {
				expandedButton.style.display = "none";

				const code = document.createElement("span");
				code.style.color = "var(--clr-error)";
				code.style.fontWeight = "bold";
				code.style.marginRight = "8px";
				code.textContent = json.errorcode > 0 ? `error code ${json.errorcode}:` : json.error;
				result.appendChild(code);

				if (json.errorcode > 0) {
					const text = document.createElement("span");
					text.textContent = json.error;
					result.appendChild(text);
				}

				return;
			}

			if (json.replace) {
				name.textContent = json.replace;
			}

			for (let i = 0; i < json.answer.length; i++) {
				const box = document.createElement("div");
				box.setAttribute("after-label", json.answer[i].remote);
				box.className = "tool-after-label-far";
				result.appendChild(box);

				let type = DnsSD.RECORD_TYPES.find(o=>o[0]===json.answer[i].type);

				const label = document.createElement("div");
				label.textContent = json.answer[i].type;
				label.style.display = "inline-block";
				label.style.color = type ? type[2] : "hsl(0,85%,100%)";
				label.style.backgroundColor = "#222";
				label.style.fontFamily = "monospace";
				label.style.fontWeight = "600";
				label.style.marginRight = "4px";
				label.style.padding = "1px 4px";
				label.style.borderRadius = "4px";
				label.style.height = "18px";
				label.style.lineHeight = "20px";
				label.style.userSelect = "none";

				const string = document.createElement("div");
				string.style.display = "inline";
				string.style.paddingRight = "4px";
				string.textContent = json.answer[i].name;

				box.append(label, string);
			}
		}
		catch (ex) {
			console.error(ex);
		}
		finally {
			status.style.visibility = "hidden";
		}
	}

	Remove(domain) {
		if (!(domain in this.hashtable)) return;
		this.list.removeChild(this.hashtable[domain].element);
		delete this.hashtable[domain];

		const index = this.args.entries.indexOf(domain);
		if (index > -1) { this.args.entries.splice(index, 1); }
	}
}