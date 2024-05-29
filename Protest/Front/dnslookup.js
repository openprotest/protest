class DnsLookup extends Console {
	static recordTypes = [
		["A",     "IPv4 Address",       "hsl(20,85%,50%)",  1],
		["AAAA",  "IPv6 Address",       "hsl(50,85%,50%)",  28],
		["NS",    "Name Server",        "hsl(80,85%,50%)",  2],
		["CNAME", "Canonical Name",     "hsl(140,85%,50%)", 5],
		["SOA",   "Start Of Authority", "hsl(200,85%,55%)", 6] ,
		["PTR",   "Pointer",            "hsl(230,95%,65%)", 12],
		["MX",    "Mail Exchange",      "hsl(260,95%,65%)", 15],
		["TXT",   "Text",               "hsl(290,85%,55%)", 16],
		["SRV",   "Service",            "hsl(320,85%,50%)", 33],
		["ANY",   "All types known",    "hsl(0,85%,100%)",  255]
	];

	constructor(args) {
		super();

		this.args = args ?? {
			entries      : [],
			server       : "",
			type         : "A",
			timeout      : 2000,
			transport    : "Auto",
			isStandard   : false,
			isInverse    : false,
			serverStatus : false,
			isTruncated  : false,
			isRecursive  : true
		};

		this.AddCssDependencies("tools.css");

		this.hashtable = {}; //contains all elements

		this.SetTitle(this.args.server === "" ? "DNS lookup" : `DNS lookup: ${this.args.server}`);
		this.SetIcon("mono/dns.svg");

		this.SetupToolbar();
		this.reloadButton  = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.clearButton   = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.copyButton   = this.AddToolbarButton("Copy", "mono/copy.svg?light");
		this.AddToolbarSeparator();
		this.recordType    = this.AddToolbarDropdown(this.GetTypeIcon(this.args.type, DnsLookup.recordTypes.find(o=>o[0]===this.args.type)[2]));
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.AddSendToChatButton();

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
			const copy = new DnsLookup(argsCopy);
			const dialog = copy.Options();

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
			this.Options();
		});

		for (let i = 0; i < DnsLookup.recordTypes.length; i++) {
			const type = document.createElement("div");
			type.style.padding = "4px 8px";

			const label = document.createElement("div");
			label.textContent = DnsLookup.recordTypes[i][0];
			label.style.display = "inline-block";
			label.style.color = DnsLookup.recordTypes[i][2];
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
			string.textContent = DnsLookup.recordTypes[i][1];

			type.append(label, string);
			this.recordType.list.append(type);

			type.onclick = ()=> {
				this.args.type = DnsLookup.recordTypes[i][0];
				this.recordType.button.style.backgroundImage = `url(${this.GetTypeIcon(DnsLookup.recordTypes[i][0], DnsLookup.recordTypes[i][2])})`;
			};
		}
		this.recordType.menu.style.height = `${DnsLookup.recordTypes.length * 30}px`;
	}

	GetTypeIcon(type, color) {
		let icon = "<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" x=\"0px\" y=\"0px\" width=\"48px\" height=\"48px\" viewBox=\"0 0 48 48\">"+
		"<polygon fill=\"#c0c0c0\" points=\"15.68,1 7,10.96 7,47 41,47 41,1\"/>"+
		`<rect fill=\"${color}\" x=\"12\" y=\"26\" width=\"36\" height=\"16\" rx=\"4\" />`+
		`<text fill=\"#202020\" x=\"30\" y=\"35\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-size=\"${18 - type.length}\" font-family=\"monospace\" font-weight=\"800\">${type}</text>`+
		"</svg>";

		return `data:image/svg+xml;base64,${btoa(icon)}`;
	}

	Options() {
		const dialog = this.DialogBox("340px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "600px";
		innerBox.style.padding = "16px 0px 0px 16px";

		const dnsServerServer = document.createElement("div");
		dnsServerServer.textContent = "DNS server:";
		dnsServerServer.style.display = "inline-block";
		dnsServerServer.style.minWidth = "150px";
		innerBox.appendChild(dnsServerServer);

		const dnsServerInput = document.createElement("input");
		dnsServerInput.type = "text";
		dnsServerInput.placeholder = "system default";
		dnsServerInput.style.width = "200px";
		dnsServerInput.value = this.args.server;
		innerBox.appendChild(dnsServerInput);

		innerBox.appendChild(document.createElement("br"));

		const recordTypeLabel = document.createElement("div");
		recordTypeLabel.textContent = "Record type:";
		recordTypeLabel.style.display = "inline-block";
		recordTypeLabel.style.minWidth = "150px";
		innerBox.appendChild(recordTypeLabel);

		const recordTypeInput = document.createElement("select");
		recordTypeInput.style.width = "200px";
		innerBox.appendChild(recordTypeInput);

		for (let i = 0; i < DnsLookup.recordTypes.length; i++) {
			const option = document.createElement("option");
			option.value = DnsLookup.recordTypes[i][0];
			option.textContent = `${DnsLookup.recordTypes[i][0]} - ${DnsLookup.recordTypes[i][1]}`;
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
		timeoutInput.min = 1;
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
		transportMethodInput.style.width = "200px";
		innerBox.appendChild(transportMethodInput);

		const transportOptions = ["Auto", "UDP", "TCP", "TLS", "HTTPS"];
		for (let i = 0; i < transportOptions.length; i++) {
			const option = document.createElement("option");
			option.value = transportOptions[i];
			option.textContent = transportOptions[i];
			transportMethodInput.appendChild(option);
		}
		transportMethodInput.value = this.args.transport;

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const standardToggle = this.CreateToggle("Standard", this.args.isStandard, innerBox);
		innerBox.appendChild(document.createElement("br"));

		const inverseToggle = this.CreateToggle("Inverse lookup", this.args.isInverse, innerBox);
		innerBox.appendChild(document.createElement("br"));

		const serverStatusToggle = this.CreateToggle("Request server status", this.args.serverStatus, innerBox);
		innerBox.appendChild(document.createElement("br"));

		const truncatedToggle = this.CreateToggle("Truncated", this.args.isTruncated, innerBox);
		innerBox.appendChild(document.createElement("br"));

		const recursiveToggle = this.CreateToggle("Recursive", this.args.isRecursive, innerBox);
		innerBox.appendChild(document.createElement("br"));

		const Apply = ()=> {
			this.args.server       = dnsServerInput.value;
			this.args.type         = recordTypeInput.value;
			this.args.timeout      = timeoutInput.value;
			this.args.transport    = transportMethodInput.value;
			this.args.isStandard   = standardToggle.checkbox.checked;
			this.args.isInverse    = inverseToggle.checkbox.checked;
			this.args.serverStatus = serverStatusToggle.checkbox.checked;
			this.args.isTruncated  = truncatedToggle.checkbox.checked;
			this.args.isRecursive  = recursiveToggle.checkbox.checked;

			this.recordType.button.style.backgroundImage = `url(${this.GetTypeIcon(this.args.type, DnsLookup.recordTypes.find(o=> o[0] === this.args.type)[2])}`;
			this.SetTitle(this.args.server === "" ? "DNS lookup" : `DNS lookup: ${this.args.server}`);
		};

		const OnKeydown = event=>{
			if (event.key === "Enter") {
				Apply();
				dialog.okButton.onclick();
			}
		};

		dnsServerInput.addEventListener("keydown", OnKeydown);
		recordTypeInput.addEventListener("keydown", OnKeydown);
		timeoutInput.addEventListener("keydown", OnKeydown);
		transportMethodInput.addEventListener("keydown", OnKeydown);

		transportMethodInput.onchange = ()=> {
			if (transportMethodInput.value === "HTTPS") {
				timeoutInput.disabled      = true;
				standardToggle.checkbox.disabled     = true;
				inverseToggle.checkbox.disabled      = true;
				serverStatusToggle.checkbox.disabled = true;
				truncatedToggle.checkbox.disabled    = true;
				recursiveToggle.checkbox.disabled    = true;
			}
			else {
				timeoutInput.disabled      = false;
				standardToggle.checkbox.disabled     = false;
				inverseToggle.checkbox.disabled      = false;
				serverStatusToggle.checkbox.disabled = false;
				truncatedToggle.checkbox.disabled    = false;
				recursiveToggle.checkbox.disabled    = false;
			}
		};

		okButton.addEventListener("click", ()=> {
			Apply();
		});

		dnsServerInput.focus();

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

	async Add(domain, type=null) {
		if (domain.length === 0) return;

		const entryKey = `${type ?? this.args.type},${domain}`;

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
		name.textContent = domain;

		const result = document.createElement("div");
		result.className = "tool-result collapsed";
		result.textContent = "";

		const remove = document.createElement("div");
		remove.className = "tool-remove";

		element.append(expandedButton, name, result,remove);

		this.hashtable[entryKey] = {
			element: element,
			result: result,
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
			let url = `tools/dnslookup?domain=${encodeURIComponent(domain)}&type=${type ?? this.args.type}&timeout=${this.args.timeout}`;
			if (this.args.server.length > 0) url += `&server=${encodeURIComponent(this.args.server)}`;
			if (this.args.transport != "Auto") url += `&transport=${this.args.transport.toLowerCase()}`;
			if (this.args.isStandard)   url += "&standard=true";
			if (this.args.isInverse)    url += "&inverse=true";
			if (this.args.serverStatus) url += "&status=true";
			if (this.args.isTruncated)  url += "&truncated=true";
			if (this.args.isRecursive)  url += "&recursive=true";

			const response = await fetch(url);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

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
				hexBox.onclick = ()=> new HexViewer({exchange:[{direction:"query", data:json.req},{direction:"response", data:json.res}], protocol:"dns"});
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

			if (json.answer) {
				for (let i = 0; i < json.answer.length; i++) {
					const box = document.createElement("div");

					const label = document.createElement("div");
					label.textContent = json.answer[i].type;
					label.style.display = "inline-block";
					label.style.color = DnsLookup.recordTypes.find(o=>o[0]===json.answer[i].type)[2];
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
					string.style.display = "inline-block";
					string.textContent = json.answer[i].name;

					box.append(label, string);
					result.appendChild(box);
				}
			}
			else if (json.Answer) { //over https
				for (let i = 0; i < json.Answer.length; i++) {
					const box = document.createElement("div");

					let type = DnsLookup.recordTypes.find(o=>o[3]===json.Answer[i].type);

					const label = document.createElement("div");
					label.textContent = type[0];
					label.style.display = "inline-block";
					label.style.color = type[2];
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
					string.style.display = "inline-block";
					string.textContent = json.Answer[i].data;

					box.append(label, string);
					result.appendChild(box);
				}
			}
		}
		catch (ex) {
			console.error(ex);
		}
	}

	Remove(domain) {
		if (!(domain in this.hashtable)) return;
		this.list.removeChild(this.hashtable[domain].element);
		delete this.hashtable[domain];

		const index = this.args.entries.indexOf(domain);
		if (index > -1)
			this.args.entries.splice(index, 1);
	}
}