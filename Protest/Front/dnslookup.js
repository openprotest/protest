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

	constructor(params) {
		super();

		this.params = params ?? {
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

		this.SetTitle(this.params.server === "" ? "DNS lookup" : `DNS lookup: ${this.params.server}`);
		this.SetIcon("mono/dns.svg");

		this.SetupToolbar();
		this.reloadButton  = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.clearButton   = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.cloneButton   = this.AddToolbarButton("Clone", "mono/clone.svg?light");
		this.AddToolbarSeparator();
		this.recordType    = this.AddToolbarDropdown(this.GetTypeIcon(this.params.type, DnsLookup.recordTypes.find(o=>o[0]===this.params.type)[2]));
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.AddSendToChatButton();
		
		if (this.params.entries) { //restore entries from previous session
			let temp = this.params.entries;
			this.params.entries = [];
			for (let i = 0; i < temp.length; i++) {
				let split = temp[i].split(",");
				if (split.length < 2) continue;
				this.Push(split[1], split[0]);
			}
		}

		this.reloadButton.addEventListener("click", ()=> {
			if (this.params.entries.length === 0) return;
			let entries = this.params.entries;
			this.list.textContent = "";
			this.hashtable = {};
			this.params.entries = [];

			for (let i = 0; i < entries.length; i++) {
				let split = entries[i].split(",");
				if (split.length < 2) continue;
				this.Push(split[1], split[0]);
			}
		});

		this.clearButton.addEventListener("click", ()=> {
			const btnOK = this.ConfirmBox("Are you sure you want to clear the list?");
			if (btnOK) btnOK.addEventListener("click", ()=> {
				this.list.textContent = "";
				this.hashtable = {};
				this.params.entries = [];
			});
		});

		this.cloneButton.addEventListener("click", ()=>{
			const paramsCopy = structuredClone(this.params);
			paramsCopy.entries = [];
			const clone = new DnsLookup(paramsCopy);
			const dialog = clone.Options();

			const OriginalCancelClickHandler = dialog.btnCancel.onclick;
			dialog.btnOK.onclick = ()=> {
				for (let i = 0; i < this.params.entries.length; i++) {
					let split = this.params.entries[i].split(",");
					if (split.length === 1) continue;
					clone.Add(split[1], null);
				}

				OriginalCancelClickHandler();
			};
			
			dialog.btnCancel.onclick = ()=> {
				clone.Close();
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
			label.style.padding = "1px 4px";
			label.style.borderRadius = "4px";

			const string = document.createElement("div");
			string.style.display = "inline-block";
			string.textContent = DnsLookup.recordTypes[i][1];

			type.append(label, string);
			this.recordType.list.append(type);

			type.onclick = ()=> {
				this.params.type = DnsLookup.recordTypes[i][0];
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
		
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		innerBox.parentElement.style.maxWidth = "600px";
		innerBox.style.padding = "16px 0px 0px 16px";

		const lblDnsServer = document.createElement("div");
		lblDnsServer.textContent = "DNS server:";
		lblDnsServer.style.display = "inline-block";
		lblDnsServer.style.minWidth = "150px";
		innerBox.appendChild(lblDnsServer);

		const txtDnsServer = document.createElement("input");
		txtDnsServer.type = "text";
		txtDnsServer.placeholder = "system default";
		txtDnsServer.style.width = "200px";
		txtDnsServer.value = this.params.server;
		innerBox.appendChild(txtDnsServer);

		innerBox.appendChild(document.createElement("br"));

		const lblRecordType = document.createElement("div");
		lblRecordType.textContent = "Record type:";
		lblRecordType.style.display = "inline-block";
		lblRecordType.style.minWidth = "150px";
		innerBox.appendChild(lblRecordType);

		const txtRecordType = document.createElement("select");
		txtRecordType.style.width = "200px";
		innerBox.appendChild(txtRecordType);

		for (let i = 0; i < DnsLookup.recordTypes.length; i++) {
			const opt = document.createElement("option");
			opt.value = DnsLookup.recordTypes[i][0];
			opt.textContent = `${DnsLookup.recordTypes[i][0]} - ${DnsLookup.recordTypes[i][1]}`;
			txtRecordType.appendChild(opt);
		}
		txtRecordType.value = this.params.type;

		innerBox.appendChild(document.createElement("br"));

		const lblTimeout = document.createElement("div");
		lblTimeout.textContent = "Time out (ms):";
		lblTimeout.style.display = "inline-block";
		lblTimeout.style.minWidth = "150px";
		innerBox.appendChild(lblTimeout);

		const txtTimeout = document.createElement("input");
		txtTimeout.type = "number";
		txtTimeout.min = 1;
		txtTimeout.max = 5000;
		txtTimeout.value = this.params.timeout;
		txtTimeout.style.width = "200px";
		txtTimeout.value = this.params.timeout;
		innerBox.appendChild(txtTimeout);

		innerBox.appendChild(document.createElement("br"));

		const lblTransportMethod = document.createElement("div");
		lblTransportMethod.textContent = "Transport method:";
		lblTransportMethod.style.display = "inline-block";
		lblTransportMethod.style.minWidth = "150px";
		innerBox.appendChild(lblTransportMethod);

		const txtTransportMethod = document.createElement("select");
		txtTransportMethod.style.width = "200px";
		innerBox.appendChild(txtTransportMethod);

		const transportOptions = ["Auto", "UDP", "TCP", "TLS", "HTTPS"];
		for (let i = 0; i < transportOptions.length; i++) {
			const opt = document.createElement("option");
			opt.value = transportOptions[i];
			opt.textContent = transportOptions[i];
			txtTransportMethod.appendChild(opt);
		}
		txtTransportMethod.value = this.params.transport;

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const chkStandard = document.createElement("input");
		chkStandard.type = "checkbox";
		chkStandard.checked = this.params.isStandard;
		innerBox.appendChild(chkStandard);
		this.AddCheckBoxLabel(innerBox, chkStandard, "Standard");

		innerBox.appendChild(document.createElement("br"));

		const chkInverse = document.createElement("input");
		chkInverse.type = "checkbox";
		chkInverse.checked = this.params.isInverse;
		innerBox.appendChild(chkInverse);
		this.AddCheckBoxLabel(innerBox, chkInverse, "Inverse lookup");

		innerBox.appendChild(document.createElement("br"));

		const chkServerStatus = document.createElement("input");
		chkServerStatus.type = "checkbox";
		chkServerStatus.checked = this.params.serverStatus;
		innerBox.appendChild(chkServerStatus);
		this.AddCheckBoxLabel(innerBox, chkServerStatus, "Request server status");

		innerBox.appendChild(document.createElement("br"));

		const chkTruncated = document.createElement("input");
		chkTruncated.type = "checkbox";
		chkTruncated.checked = this.params.isTruncated;
		innerBox.appendChild(chkTruncated);
		this.AddCheckBoxLabel(innerBox, chkTruncated, "Truncated");

		innerBox.appendChild(document.createElement("br"));

		const chkRecursive = document.createElement("input");
		chkRecursive.type = "checkbox";
		chkRecursive.checked = this.params.isRecursive;
		innerBox.appendChild(chkRecursive);
		this.AddCheckBoxLabel(innerBox, chkRecursive, "Recursive");

		const Apply = ()=> {
			this.params.server       = txtDnsServer.value;
			this.params.type         = txtRecordType.value;
			this.params.timeout      = txtTimeout.value;
			this.params.transport    = txtTransportMethod.value;
			this.params.isStandard   = chkStandard.checked;
			this.params.isInverse    = chkInverse.checked;
			this.params.serverStatus = chkServerStatus.checked;
			this.params.isTruncated  = chkTruncated.checked;
			this.params.isRecursive  = chkRecursive.checked;

			this.recordType.button.style.backgroundImage = `url(${this.GetTypeIcon(this.params.type, DnsLookup.recordTypes.find(o=> o[0] === this.params.type)[2])}`;
			this.SetTitle(this.params.server === "" ? "DNS lookup" : `DNS lookup: ${this.params.server}`);
		};

		const OnKeydown = event=>{
			if (event.key === "Enter") {
				Apply();
				dialog.btnOK.onclick();
			}
		};

		txtDnsServer.addEventListener("keydown", OnKeydown);
		txtRecordType.addEventListener("keydown", OnKeydown);
		txtTimeout.addEventListener("keydown", OnKeydown);
		txtTransportMethod.addEventListener("keydown", OnKeydown);

		txtTransportMethod.onchange = ()=> {
			if (txtTransportMethod.value === "HTTPS") {
				txtTimeout.disabled      = true;
				chkStandard.disabled     = true;
				chkInverse.disabled      = true;
				chkServerStatus.disabled = true;
				chkTruncated.disabled    = true;
				chkRecursive.disabled    = true;
			}
			else {
				txtTimeout.disabled      = false;
				chkStandard.disabled     = false;
				chkInverse.disabled      = false;
				chkServerStatus.disabled = false;
				chkTruncated.disabled    = false;
				chkRecursive.disabled    = false;
			}
		};

		btnOK.addEventListener("click", ()=> {
			Apply();
		});

		txtDnsServer.focus();
		
		return dialog;
	}

	Push(name, type=null) { //override
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

		const entryKey = `${type ?? this.params.type},${domain}`;

		if (entryKey in this.hashtable) {
			this.list.appendChild(this.hashtable[entryKey].element);
			return;
		}

		const element = document.createElement("div");
		element.className = "tool-element";
		this.list.appendChild(element);

		const btnExpanded = document.createElement("div");
		btnExpanded.className = "tool-button-expanded";

		const name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.setAttribute("label", type ? type : this.params.type);
		name.textContent = domain;

		const result = document.createElement("div");
		result.className = "tool-result collapsed";
		result.textContent = "";

		const remove = document.createElement("div");
		remove.className = "tool-remove";

		element.append(btnExpanded, name, result,remove);

		this.hashtable[entryKey] = {
			element: element,
			result: result,
			expand: false,
			list: []
		};

		remove.onclick = ()=> { this.Remove(entryKey); };

		btnExpanded.onclick = ()=> {
			if (this.hashtable[entryKey].expand) {
				this.hashtable[entryKey].expand = false;
				element.style.height = "32px";
				btnExpanded.style.transform = "rotate(-90deg)";
				result.className = "tool-result collapsed";
				result.scrollTop = 0;
			}
			else {
				this.hashtable[entryKey].expand = true;
				element.style.height = "auto";
				btnExpanded.style.transform = "rotate(0deg)";
				result.className = "tool-result expanded";
			}
		};

		this.params.entries.push(entryKey);

		try {
			let url = `tools/dnslookup?domain=${encodeURIComponent(domain)}&type=${type ?? this.params.type}&timeout=${this.params.timeout}`;
			if (this.params.server.length > 0) url += `&server=${encodeURIComponent(this.params.server)}`;
			if (this.params.transport != "Auto") url += `&transport=${this.params.transport.toLowerCase()}`;
			if (this.params.isStandard)   url += "&standard=true";
			if (this.params.isInverse)    url += "&inverse=true";
			if (this.params.serverStatus) url += "&status=true";
			if (this.params.isTruncated)  url += "&truncated=true";
			if (this.params.isRecursive)  url += "&recursive=true";

			const response = await fetch(url);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			
			if (json.req && json.res) {
				const divHex = document.createElement("div");
				divHex.style.position = "absolute";
				divHex.style.width = "24px";
				divHex.style.height = "24px";
				divHex.style.right = "32px";
				divHex.style.top = "4px";
				divHex.style.backgroundSize = "contain";
				divHex.style.backgroundImage = "url(mono/hexviewer.svg?light)";
				divHex.style.cursor = "pointer";
				element.appendChild(divHex);
				divHex.onclick = ()=> new HexViewer({exchange:[{direction:"query", data:json.req},{direction:"response", data:json.res}], protocol:"dns"});
			}
			
			if (json.error) {
				btnExpanded.style.display = "none";
				
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

		const index = this.params.entries.indexOf(domain);
		if (index > -1)
			this.params.entries.splice(index, 1);
	}
}