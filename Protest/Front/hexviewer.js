class HexViewer extends Window {
	static DNS_RECORD_TYPES = {
		1: "A",
		2: "NS",
		5: "CNAME",
		6: "SOA",
		12: "PTR",
		15: "MX",
		16: "TXT",
		28: "AAAA",
		33: "SRV",
		47: "NSEC",
		255: "ANY",
	};

	static DNS_RECORD_COLORS = {
		1 : "hsl(20,85%,50%)",
		2 : "hsl(80,85%,50%)",
		5 : "hsl(140,85%,50%)",
		6 : "hsl(200,85%,55%)",
		12: "hsl(230,95%,65%)",
		15: "hsl(260,95%,65%)",
		16: "hsl(290,85%,55%)",
		28: "hsl(50,85%,50%)",
		33: "hsl(320,85%,50%)",
		47: "hsl(0,85%,50%)",
		255: "hsl(0,85%,100%)"
	};

	static DNS_CLASSES = {
		1: "Internet",
		2: "CSNET",
		3: "Chaos",
		4: "Hesiod",
	};

	static DHCP_OPTIONS = [
		"Pad", //0
		"Subnet mask",
		"Time offset",
		"Router",
		"Time server",
		"Name server",
		"Domain name server",
		"Log server",
		"Quote server",
		"LPR server",

		"Impress server", //10
		"Resource location server",
		"Host name",
		"Boot file size",
		"Merit dump file",
		"Domain name",
		"Swap server",
		"Root path",
		"Extensions path",
		"IP forwarding",

		"Non-local source routing", //20
		"Policy filter",
		"Maximum datagram reassembly size",
		"Default IP TTL",
		"Path MTU aging timeout",
		"Path MTU plateau table",
		"Interface MTU",
		"All subnets are local",
		"Broadcast address",
		"Perform mask discovery",

		"Mask supplier", //30
		"Perform router discovery",
		"Router solicitation address",
		"Static route",
		"Trailer encapsulation",
		"ARPCacheTimeout",
		"Ethernet encapsulation",
		"TCP default TTL",
		"TCP keepalive interval",
		"TCP keepalive garbage",

		"NIS domain", //40
		"NIS servers",
		"NTP servers",
		"Vendor-specific information",
		"NetBIOS name server",
		"NetBIOS datagram distribution server",
		"NetBIOS node type",
		"NetBIOS scope",
		"X Window font server",
		"X Window display manager",

		"Requested IP address", //50
		"IP address lease time",
		"Option overload",
		"DHCP message type",
		"Server identifier",
		"Parameter request list",
		"Message",
		"Maximum DHCP message size",
		"Renewal time value",
		"Rebinding time value",

		"Vendor class identifier", //60
		"Client-identifier",
		"NetWare/IP domain name",
		"NetWare/IP information",
		"NIS domain",
		"NIS servers",
		"TFTP server name",
		"Bootfile name",
		"Mobile IP home agent",
		"SMTP server",

		"POP3 server", //70
		"NNTP server",
		"WWW server",
		"Finger server",
		"IRC server",
		"StreetTalk server",
		"STDA server",
		"User class",
		"Directory agent",
		"Service scope",

		"Rapid commit", //80
		"Client FQDN",
		"Relay agent information",
		"iSNS",
		"",
		"NDS servers",
		"NDS tree name",
		"NDS context",
		"BCMCS bontroller domain name list",
		"BCMCS bontroller IPv4 address",

		"Authentication", //90
		"Client last transaction time",
		"Associated IP",
		"Client system architecture type",
		"Client network device interface",
		"LDAP",
		"",
		"UUID/GUID client identifier",
		"User authentication",
		"GEOCONF_CIVIC",

		"PCode", //100
		"TCode",
		"",
		"",
		"",
		"",
		"",
		"",
		"IPv6-only preferred",
		"OPTION_DHCP4O6_S46_SADDR",

		"", //110
		"",
		"Netinfo address",
		"Netinfo tag",
		"DHCP Captive-Portal",
		"",
		"Auto-configure",
		"Name service search",
		"Subnet selection",
		"Domain search",

		"SIP servers", //120
		"Classless static route",
		"CableLabs client configuration",
		"V-I Vendor Class",
		"V-I Vendor-Specific Information",
		"",
		"",
		"",
		"Etherboot signature",
		"",

		"", //130
		"",
		"",
		"",
		"",
		"",
		"OPTION_PANA_AGENT",
		"OPTION_V4_LOST",
		"OPTION_CAPWAP_AC_V4",
		"OPTION-IPv4_Address-MoS",

		"OPTION-IPv4_FQDN-MoS", //140
		"SIP UA Configuration Service Domains",
		"OPTION-IPv4_Address-ANDSF",
		"OPTION_V4_SZTP_REDIRECT",
		"GeoLoc",
		"RDNSS FORCERENEW_NONCE_CAPABLE",
		"RDNSS Selection",
		"OPTION_V4_DOTS_RI",
		"OPTION_V4_DOTS_ADDRESS",
		"",

		"Etherboot", //150
		"Status code",
		"Base time",
		"start time of state",
		"Query start time",
		"Query end time",
		"DHCP state",
		"Data source",
		"OPTION_V4_PCP_SERVER",
		"OPTION_V4_PORTPARAMS",

		"", //160
		"OPTION_MUD_URL_V4",
		"OPTION_V4_DNR",
		"",
		"",
		"",
		"",
		"",
		"",
		"",

		"", "", "", "", "", "", "", "", "", "", //170
		"", "", "", "", "", "", "", "", "", "", //180
		"", "", "", "", "", "", "", "", "", "", //190

		"", //200
		"",
		"",
		"",
		"",
		"",
		"",
		"",
		"PXELINUX magic",
		"Configuration file",

		"Path prefix", //210
		"Reboot time",
		"OPTION_6RD",
		"OPTION_V4_ACCESS_DOMAIN",
		"",
		"",
		"",
		"",
		"",
		"",

		"Subnet allocation", //220
		"VSS",
		"",
		"",
		"",
		"",
		"",
		"",
		"",
		"",

		"", "", "", "", "", "", "", "", "", "", //230
		"", "", "", "", "", "", "", "", "", "", //240

		"", //250
		"",
		"",
		"",
		"",
		"End"
	];

	constructor(args) {
		super();

		this.args = args;

		this.listCount = 0;
		this.lastIndentationValue = 0;
		this.lastIndentationElement = null;

		this.SetIcon("mono/hexviewer.svg");
		this.SetTitle("Hex viewer");

		this.AddCssDependencies("hexviewer.css");

		this.content.classList.add("hexviewer-content");

		this.list = document.createElement("div");
		this.list.className = "hexviewer-list";

		this.hexBox = document.createElement("div");
		this.hexBox.className = "hexviewer-hexbox";

		this.asciiBox = document.createElement("div");
		this.asciiBox.className = "hexviewer-asciibox";

		this.details = document.createElement("div");
		this.details.className = "hexviewer-details";

		this.content.append(this.list, this.hexBox, this.asciiBox, this.details);

		this.hexBox.onscroll = ()=> {
			this.asciiBox.scrollTop = this.hexBox.scrollTop;
		};

		this.asciiBox.onscroll = ()=> {
			this.hexBox.scrollTop = this.asciiBox.scrollTop;
		};

		this.Plot(this.args.exchange, this.args.protocol);
	}

	Plot(exchange, protocol) {
		this.hexBox.textContent = "";
		this.asciiBox.textContent = "";
		this.list.textContent = "";

		const PlotPacket = (direction, data)=> {
			const hexSeparator = document.createElement("div");
			hexSeparator.textContent = direction;
			hexSeparator.className = "hexviewer-separator";
			this.hexBox.appendChild(hexSeparator);

			const asciiSeparator = document.createElement("div");
			asciiSeparator.textContent = direction;
			asciiSeparator.className = "hexviewer-separator";
			this.asciiBox.appendChild(asciiSeparator);

			const listSeparator = document.createElement("div");
			listSeparator.textContent = direction;
			listSeparator.className = "hexviewer-separator";
			this.list.appendChild(listSeparator);

			const hexContainer = document.createElement("div");
			this.hexBox.appendChild(hexContainer);

			const charContainer = document.createElement("div");
			this.asciiBox.appendChild(charContainer);

			for (let j=0; j<data.length; j++) {
				const hex = document.createElement("div");
				hex.textContent = data[j].toString(16).padStart(2, "0");
				hexContainer.appendChild(hex);

				const char = document.createElement("div");
				charContainer.appendChild(char);

				if (data[j] < 33) {
					char.textContent = ".";
				}
				else {
					char.textContent = String.fromCharCode(data[j]);
				}

				hex.onmouseenter = char.onmouseenter = ()=>{
					hex.style.boxShadow = char.style.boxShadow = "#000 0 0 0 2px inset";
					this.details.textContent = `0x${j.toString(16).padStart(4, "0")}`;
				};

				hex.onmouseleave = char.onmouseleave = ()=>{
					hex.style.boxShadow = char.style.boxShadow = "";
					this.details.textContent = "";
				};
			}

			switch (protocol) {
				case "dns"  : this.PopulateDnsLabels(hexContainer, charContainer, data); break;
				case "mdns" : this.PopulateDnsLabels(hexContainer, charContainer, data); break;
				case "ntp"  : this.PopulateNtpLabels(hexContainer, charContainer, data); break;
				case "dhcp" : this.PopulateDhcpLabels(hexContainer, charContainer, data); break;
			}

			this.listCount = 0;
			this.lastIndentationValue = 0;
			this.lastIndentationElement = null;
		};

		for (let i=0; i<exchange.length; i++) {
			if (exchange[i].data.length > 0) {
				if (exchange[i].data[0] instanceof Array) {
					for (let j=0; j<exchange[i].data.length; j++) {
						PlotPacket(exchange[i].direction, exchange[i].data[j]);
					}
				}
				else {
					PlotPacket(exchange[i].direction, exchange[i].data);
				}
			}
		}
	}

	PopulateLabel(label, indentation, hexContainer, charContainer, offset, length, isDnsPointers=false) {
		const element = document.createElement("div");
		element.style.paddingLeft = `${8 + indentation * 20}px`;
		this.list.appendChild(element);

		const textBox = document.createElement("div");
		textBox.textContent = label;
		element.appendChild(textBox);

		this.listCount++;

		if (indentation > 0) {
			element.style.setProperty("--indentation", `${indentation * 20 - 8}px`);
			element.className = "hexviewer-label-T";
		}

		if (this.lastIndentationValue !== indentation) {
			const d = window.getComputedStyle(this.lastIndentationElement).getPropertyValue("--indentation");
			if (d) {
				this.lastIndentationElement.className = "hexviewer-label-L";
			}
		}

		if (this.lastIndentationValue < indentation) {
			const dot = document.createElement("div");
			dot.style.position = "absolute";
			dot.style.left = `${indentation * 20 - 10}px`;
			dot.style.top = "0";
			dot.style.width = "6px";
			dot.style.height = "6px";
			dot.style.borderRadius = "3px";
			dot.style.backgroundColor = "var(--clr-light)";
			element.appendChild(dot);
		}

		if (indentation > 0 && this.lastIndentationValue > indentation) {
			const connect = document.createElement("div");
			connect.style.position = "absolute";
			connect.style.left = `${indentation * 20 - 8}px`;
			connect.style.bottom = "100%";
			connect.style.width = "2px";
			connect.style.height = "50px";
			connect.style.backgroundColor = "var(--clr-light)";
			element.appendChild(connect);

			const index = this.listCount;
			const children = this.list.childNodes;

			for (let i=index-1; i>=0; i--) {
				const d = window.getComputedStyle(children[i]).getPropertyValue("--indentation");
				if (!d) continue;

				const v = parseInt(d);
				if (v === indentation * 20 - 8) {
					connect.style.height = `${(index - i) * 26 - 16}px`;
					break;
				}
			}
		}

		this.lastIndentationValue = indentation;
		this.lastIndentationElement = element;

		element.onclick = ()=> {
			const listElements = this.list.childNodes;
			const hexElements = hexContainer.childNodes;
			const charElements = charContainer.childNodes;

			for (let i=0; i<this.hexBox.childNodes.length; i++) {
				if (this.hexBox.childNodes[i].className === "hexviewer-separator") continue;
				for (let j = 0; j < this.hexBox.childNodes[i].childNodes.length; j++) {
					this.hexBox.childNodes[i].childNodes[j].style.color = "";
					this.asciiBox.childNodes[i].childNodes[j].style.color = "";
					this.hexBox.childNodes[i].childNodes[j].style.backgroundColor = "";
					this.asciiBox.childNodes[i].childNodes[j].style.backgroundColor = "";
				}
			}

			for (let i=0; i<hexElements.length; i++) {
				hexElements[i].style.color = charElements[i].style.color = "";
				hexElements[i].style.backgroundColor = charElements[i].style.backgroundColor = "";
			}

			for (let i=0; i<listElements.length; i++) {
				listElements[i].style.color = "";
				listElements[i].style.backgroundColor = "";
			}

			for (let i=offset; i<Math.min(offset + length, hexElements.length); i++) {
				hexElements[i].style.color = charElements[i].style.color = "#000";
				hexElements[i].style.backgroundColor = charElements[i].style.backgroundColor = "var(--clr-select)";

				hexElements[i].scrollIntoView({ block:"center", inline:"center" });
				charElements[i].scrollIntoView({ block:"center", inline:"center" });
			}

			if (isDnsPointers) {
				if (true) {
					let byteA = parseInt("0x"+hexElements[offset].textContent, 16);
					let byteB = parseInt("0x"+hexElements[offset+1].textContent, 16);
					let pIndex = ((byteA & 0x3F) << 8) | byteB;

					while (pIndex < hexElements.length - 1) {
						byteA = parseInt("0x"+hexElements[pIndex].textContent, 16);
						if (byteA === 0) { break; }

						if ((byteA & 0xC0) === 0xC0) {
							byteB = parseInt("0x"+hexElements[pIndex+1].textContent, 16);
							pIndex = ((byteA & 0x3F) << 8) | byteB;
							continue;
						}

						hexElements[pIndex].style.color = "#000";
						hexElements[pIndex].style.backgroundColor = "var(--clr-warning)";

						charElements[pIndex].style.color = "#000";
						charElements[pIndex].style.backgroundColor = "var(--clr-warning)";

						pIndex++;
					}
				}
			}

			element.style.color = "#000";
			element.style.backgroundColor = "var(--clr-select)";
		};

		return element;
	}

	PopulateDnsLabels(hexContainer, charContainer, stream) {
		const transactionId = stream[0].toString(16).padStart(2,"0") + stream[1].toString(16).padStart(2,"0");
		this.PopulateLabel(`Transaction ID: 0x${transactionId}`, 0, hexContainer, charContainer, 0, 2);

		const flags = stream[2].toString(16).padStart(2,"0") + stream[3].toString(16).padStart(2,"0");
		this.PopulateLabel(`Flags: 0x${flags}`, 0, hexContainer, charContainer, 2, 2);

		let isResponse = (stream[2] & 0b10000000) > 0;
		let options = (stream[2] & 0b01111000) >> 3;
		let isAuthoritative = (stream[2] & 0b00000100) > 0;
		let isTruncated = (stream[2] & 0b00000010) > 0;
		let isRecursive = (stream[2] & 0b00000001) > 0;
		this.PopulateLabel(`Response: ${isResponse}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Options: ${options}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Authoritative: ${isAuthoritative}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Truncated: ${isTruncated}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Recursive: ${isRecursive}`, 1, hexContainer, charContainer, 2, 1);

		if (isResponse) {
			let isRecursionAvailable = (stream[3] & 0b10000000) > 0;
			let isAnswerAuthenticated = (stream[3] & 0b00100000) > 0;
			let nonAuthenticatedData = (stream[3] & 0b00010000) > 0;
			let replyCode = stream[3] & 0b00001111;
			this.PopulateLabel(`Recursion is available: ${isRecursionAvailable}`, 1, hexContainer, charContainer, 3, 1);
			this.PopulateLabel(`Answer is authenticated: ${isAnswerAuthenticated}`, 1, hexContainer, charContainer, 3, 1);
			this.PopulateLabel(`Non authenticated data: ${nonAuthenticatedData}`, 1, hexContainer, charContainer, 3, 1);
			this.PopulateLabel(`Reply code: ${replyCode}`, 1, hexContainer, charContainer, 3, 1);
		}

		const qCount = stream[4] << 8 | stream[5];
		this.PopulateLabel(`Questions: ${qCount}`, 0, hexContainer, charContainer, 4, 2);

		const anCount = stream[6] << 8 | stream[7];
		this.PopulateLabel(`Answers RRs:  ${anCount}`, 0, hexContainer, charContainer, 6, 2);

		const auCount = stream[8] << 8 | stream[9];
		this.PopulateLabel(`Authority RRs: ${auCount}`, 0, hexContainer, charContainer, 8, 2);

		const adCount = stream[10] << 8 | stream[11];
		this.PopulateLabel(`Additional RRs: ${adCount}`, 0, hexContainer, charContainer, 10, 2);

		let index = 12;
		let count = 0;

		while (index < stream.length && count < qCount) { //questions
			const start = index;
			let end = index;

			if ((stream[index] & 0xC0) === 0xC0) { //pointer
				end += 2;
			}
			else {
				while (end < stream.length && stream[end] !== 0 && (stream[end] & 0xC0) !== 0xC0) {
					end++;
				}

				if (stream[end] === 0) { //null termination
					end++;
				}
				else if ((stream[end] & 0xC0) === 0xC0) { //pointer
					end += 2;
				}
			}

			const first = this.PopulateLabel("Name", 1, hexContainer, charContainer, start, end - start - 1, true);
			index = end;

			const type = (stream[index] << 8) | stream[index+1];
			const typeLabel = this.PopulateLabel(`Type: ${type}`, 1, hexContainer, charContainer, index, 2);
			index += 2;

			if (HexViewer.DNS_RECORD_TYPES[type]) {
				const recordTypeLabel = document.createElement("div");
				recordTypeLabel.className = "hexviewer-record-type-label";
				recordTypeLabel.style.color = HexViewer.DNS_RECORD_COLORS[type];
				recordTypeLabel.textContent = HexViewer.DNS_RECORD_TYPES[type];
				typeLabel.firstChild.appendChild(recordTypeLabel);
			}

			const cacheFlashFlag = stream[index] & 0x80;
			if (cacheFlashFlag > 0) {
				this.PopulateLabel(`Cache-flush: true`, 1, hexContainer, charContainer, index, 2);
			}

			const class_ = stream[index+1];
			this.PopulateLabel(`Class: ${class_} ${HexViewer.DNS_CLASSES[class_] ? `(${HexViewer.DNS_CLASSES[class_]})` : ""}`, 1, hexContainer, charContainer, index, 2);
			index += 2;

			const element = this.PopulateLabel("Question:", 0, hexContainer, charContainer, start, index - start, true);
			this.list.insertBefore(element, first);

			count++;
		}

		const totalRecords = qCount + anCount + auCount + adCount;
		while (index < stream.length && count < totalRecords) { //records
			const start = index;
			let end = index;

			if ((stream[index] & 0xC0) === 0xC0) { //pointer
				end += 2;
			}
			else {
				while (end < stream.length && stream[end] !== 0 && (stream[end] & 0xC0) !== 0xC0) {
					end++;
				}

				if (stream[end] === 0) { //null termination
					end++;
				}
				else if ((stream[end] & 0xC0) === 0xC0) { //pointer
					end += 2;
				}
			}

			const first = this.PopulateLabel("Name", 1, hexContainer, charContainer, start, end - start, true);
			index = end;

			const type = (stream[index] << 8) | stream[index+1];
			const typeLabel = this.PopulateLabel(`Type: ${type}`, 1, hexContainer, charContainer, index, 2);
			index += 2;

			if (HexViewer.DNS_RECORD_TYPES[type]) {
				const recordTypeLabel = document.createElement("div");
				recordTypeLabel.className = "hexviewer-record-type-label";
				recordTypeLabel.style.color = HexViewer.DNS_RECORD_COLORS[type];
				recordTypeLabel.textContent = HexViewer.DNS_RECORD_TYPES[type];
				typeLabel.firstChild.appendChild(recordTypeLabel);
			}

			const cacheFlashFlag = stream[index] & 0x80;
			if (cacheFlashFlag > 0) {
				this.PopulateLabel(`Cache-flush: true`, 1, hexContainer, charContainer, index, 2);
			}

			const class_ = stream[index+1];
			this.PopulateLabel(`Class: ${class_} ${HexViewer.DNS_CLASSES[class_] ? `(${HexViewer.DNS_CLASSES[class_]})` : ""}`, 1, hexContainer, charContainer, index, 2);
			index += 2;

			const ttl = (stream[index] << 24) | (stream[index+1] << 16) | (stream[index+2] << 8) | stream[index+3];
			this.PopulateLabel(`TTL: ${ttl}`, 1, hexContainer, charContainer, index, 4);
			index += 4;

			const len = (stream[index] << 8) | stream[index+1];
			this.PopulateLabel(`Length: ${len}`, 1, hexContainer, charContainer, index, 2);
			index += 2;

			let data;
			switch (type) {
			case 1: //A
				if (len === 4) {
					data = `${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`;
					this.PopulateLabel(data, 1, hexContainer, charContainer, index, len);
				}
				break;

			case 28: //AAAA
				if (len === 16) {
					data = "";
					for (let j = 0; j < 16; j+=2) {
						if (j > 0) data += ":";
						data += stream[index + j].toString(16).padStart(2, "0");
						data += stream[index + j + 1].toString(16).padStart(2, "0");
					}
					this.PopulateLabel(UI.CompressIPv6(data), 1, hexContainer, charContainer, index, len);
				}
				break;

			case 33: //SRV
				const priority = (stream[index] << 8) | stream[index + 1];
				const weight = (stream[index + 2] << 8) | stream[index + 3];
				const port = (stream[index + 4] << 8) | stream[index + 5];

				let targetOffset = index + 6;
				if ((stream[targetOffset] & 0xC0) === 0xC0) { //pointer
					targetOffset += 2;
				}
				else {
					while (targetOffset < stream.length && stream[targetOffset] !== 0 && (stream[targetOffset] & 0xC0) !== 0xC0) {
						targetOffset++;
					}

					if (stream[targetOffset] === 0) { //null termination
						targetOffset++;
					}
					else if ((stream[targetOffset] & 0xC0) === 0xC0) { //pointer
						targetOffset += 2;
					}
				}

				this.PopulateLabel(`Priority: ${priority}`, 1, hexContainer, charContainer, index, 2);
				this.PopulateLabel(`Weight: ${weight}`, 1, hexContainer, charContainer, index + 2, 2);
				this.PopulateLabel(`Port: ${port}`, 1, hexContainer, charContainer, index + 4, 2);
				this.PopulateLabel("Target", 1, hexContainer, charContainer, index + 6, targetOffset - (index + 6), true);
				break;

			case 47: //NSEC
				this.PopulateLabel("Next domain name", 1, hexContainer, charContainer, index, 2, true);
				break;

			default:
				this.PopulateLabel("Answer", 1, hexContainer, charContainer, index, len);
				break;
			}

			index += len;

			end = index;

			let element;
			if (count < qCount + anCount) {
				element = this.PopulateLabel("Answer: ", 0, hexContainer, charContainer, start, end - start);
			}
			else if (count < qCount + anCount + auCount) {
				element = this.PopulateLabel("Authority: ", 0, hexContainer, charContainer, start, end - start);
			}
			else if (count < qCount + anCount + auCount + adCount) {
				element = this.PopulateLabel("Additional: ", 0, hexContainer, charContainer, start, end - start);
			}
			this.list.insertBefore(element, first);

			count++;
		}
	}

	PopulateNtpLabels(hexContainer, charContainer, stream) {
		this.PopulateLabel("Flags", 0, hexContainer, charContainer, 0, 1);

		this.PopulateLabel("Peer clock stratum", 0, hexContainer, charContainer, 1, 1);
		this.PopulateLabel("Peer polling interval", 0, hexContainer, charContainer, 2, 1);
		this.PopulateLabel("Peer clock precision", 0, hexContainer, charContainer, 3, 1);

		this.PopulateLabel("Root delay", 0, hexContainer, charContainer, 4, 4);
		this.PopulateLabel("Root dispersion", 0, hexContainer, charContainer, 8, 4);

		this.PopulateLabel("Reference ID", 0, hexContainer, charContainer, 12, 4);
		this.PopulateLabel("Reference timestamp", 0, hexContainer, charContainer, 16, 8);

		this.PopulateLabel("Original timestamp", 0, hexContainer, charContainer, 24, 8);
		this.PopulateLabel("Receive timestamp", 0, hexContainer, charContainer, 32, 8);
		this.PopulateLabel("Transmit timestamp", 0, hexContainer, charContainer, 40, 8);
	}

	PopulateDhcpLabels(hexContainer, charContainer, stream) {
		this.PopulateLabel(`Message type: ${stream[0]}`, 0, hexContainer, charContainer, 0, 1);
		this.PopulateLabel(`Hardware type: ${stream[1]}`, 0, hexContainer, charContainer, 1, 1);
		this.PopulateLabel(`Hardware address length: ${stream[2]}`, 0, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Hops: ${stream[3]}`, 0, hexContainer, charContainer, 3, 1);

		this.PopulateLabel(`Transaction ID: 0x${stream[4].toString(16).padStart(2,"0")}${stream[5].toString(16).padStart(2,"0")}${stream[6].toString(16).padStart(2,"0")}${stream[7].toString(16).padStart(2,"0")}`, 0, hexContainer, charContainer, 4, 4);

		this.PopulateLabel(`Seconds elapsed: ${(stream[8]<<8) | (stream[9])}`, 0, hexContainer, charContainer, 8, 2);

		this.PopulateLabel(`Bootp flags`, 0, hexContainer, charContainer, 10, 2);

		let clientIp = `${stream[12]}.${stream[13]}.${stream[14]}.${stream[15]}`;
		this.PopulateLabel(`Client IP address: ${clientIp}`, 0, hexContainer, charContainer, 12, 4);

		let yourIp = `${stream[16]}.${stream[17]}.${stream[18]}.${stream[19]}`;
		this.PopulateLabel(`Your IP address: ${yourIp}`, 0, hexContainer, charContainer, 16, 4);

		let nextServer = `${stream[20]}.${stream[21]}.${stream[22]}.${stream[23]}`;
		this.PopulateLabel(`Next server IP address: ${nextServer}`, 0, hexContainer, charContainer, 20, 4);

		let relayServer = `${stream[24]}.${stream[25]}.${stream[26]}.${stream[27]}`;
		this.PopulateLabel(`Relay agent IP address: ${relayServer}`, 0, hexContainer, charContainer, 24, 4);

		let clientMac = "";
		clientMac += stream[28].toString(16).padStart(2,"0");
		clientMac += stream[29].toString(16).padStart(2,"0");
		clientMac += stream[30].toString(16).padStart(2,"0");
		clientMac += stream[31].toString(16).padStart(2,"0");
		clientMac += stream[32].toString(16).padStart(2,"0");
		clientMac += stream[33].toString(16).padStart(2,"0");
		this.PopulateLabel(`Client MAC address: ${clientMac}`, 0, hexContainer, charContainer, 28, 6);

		this.PopulateLabel("Server hostname", 0, hexContainer, charContainer, 44, 64);

		this.PopulateLabel("Boot file name", 0, hexContainer, charContainer, 108, 128);

		this.PopulateLabel("Magic cookie", 0, hexContainer, charContainer, 236, 4);

		const options = this.PopulateLabel("Options", 0, hexContainer, charContainer, 240, stream.length - 240);

		let index = 240;
		while (index < stream.length) {
			let opt = stream[index++];
			let len = stream[index++];

			switch (opt) {
			case 1:
				this.PopulateLabel(`Subnet mask: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 2:
				this.PopulateLabel(`Time offset`, 1, hexContainer, charContainer, index, len);
				break;

			case 3:
				this.PopulateLabel(`Router: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 4:
				this.PopulateLabel(`Time server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 5:
				this.PopulateLabel(`Name server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 6:
				this.PopulateLabel(`Domain name server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 7:
				this.PopulateLabel(`Log server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 8:
				this.PopulateLabel(`Quotes server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 9:
				this.PopulateLabel(`LPR server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 10:
				this.PopulateLabel(`Impress server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 11:
				this.PopulateLabel(`RLP server: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 12:
				this.PopulateLabel(`Hostname`, 1, hexContainer, charContainer, index, len);
				break;

			case 13:
				this.PopulateLabel(`Boot file size`, 1, hexContainer, charContainer, index, len);
				break;

			case 15:
				this.PopulateLabel(`Domain name`, 1, hexContainer, charContainer, index, len);
				break;

			case 28:
				this.PopulateLabel(`Broadcast address: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 31:
				this.PopulateLabel(`Router discovery`, 1, hexContainer, charContainer, index, len);
				break;

			case 33:
				this.PopulateLabel(`Static route`, 1, hexContainer, charContainer, index, len);
				break;

			case 35:
				this.PopulateLabel(`ARP timeout`, 1, hexContainer, charContainer, index, len);
				break;

			case 42:
				this.PopulateLabel(`NTP Servers`, 1, hexContainer, charContainer, index, len);
				for (let i = 0; i < len; i += 4) {
					this.PopulateLabel(`${stream[index+i]}.${stream[index+i+1]}.${stream[index+i+2]}.${stream[index+i+3]}`, 2, hexContainer, charContainer, index+i, 4);
				}
				break;

			case 43:
				this.PopulateLabel(`Vendor specific`, 1, hexContainer, charContainer, index, len);
				break;

			case 44:
				this.PopulateLabel(`NetBIOS name server`, 1, hexContainer, charContainer, index, len);
				break;

			case 46:
				this.PopulateLabel(`NetBIOS node type`, 1, hexContainer, charContainer, index, len);
				break;

			case 47:
				this.PopulateLabel(`NetBIOS scope`, 1, hexContainer, charContainer, index, len);
				break;

			case 50:
				this.PopulateLabel(`Requested address: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 51:
				let l_time = (stream[index] << 24) | (stream[index+1] << 16) | (stream[index+2] << 8) | (stream[index+3]);
				this.PopulateLabel(`Lease time: ${l_time}s`, 1, hexContainer, charContainer, index, len);
				break;

			case 53:
				let type;
				switch (stream[index]) {
				case 1: type = "Discover"; break;
				case 2: type = "Offer"; break;
				case 3: type = "Request"; break;
				case 4: type = "Decline"; break;
				case 5: type = "Acknowledge"; break;
				case 6: type = "Negative acknowledgment"; break;
				case 7: type = "Release"; break;
				case 8: type = "Informational"; break;
				case 9: type = "Force renew"; break;
				default: type = "Unknown type"; break;
				}
				this.PopulateLabel(`DHCP Message type: ${type}`, 1, hexContainer, charContainer, index, len);
				break;

			case 54:
				this.PopulateLabel(`Server identifier: ${stream[index]}.${stream[index+1]}.${stream[index+2]}.${stream[index+3]}`, 1, hexContainer, charContainer, index, len);
				break;

			case 55:
				this.PopulateLabel(`Parameter request list`, 1, hexContainer, charContainer, index, len);

				for (let i = 0; i < len; i++) {
					if (stream[index+i] < HexViewer.DHCP_OPTIONS.length) {
						this.PopulateLabel(`(${stream[index+i]}) ${HexViewer.DHCP_OPTIONS
						[stream[index+i]]}`, 2, hexContainer, charContainer, index+i, 1);
					}
					else {
						this.PopulateLabel(`(${stream[index+i]})`, 2, hexContainer, charContainer, index+i, 1);
					}
				}
				break;

			case 58:
				let r_time = (stream[index] << 24) | (stream[index+1] << 16) | (stream[index+2] << 8) | (stream[index+3]);
				this.PopulateLabel(`Renewal time: ${r_time}s`, 1, hexContainer, charContainer, index, len);
				break;

			case 59:
				let rb_time = (stream[index] << 24) | (stream[index+1] << 16) | (stream[index+2] << 8) | (stream[index+3]);
				this.PopulateLabel(`Rebinding time: ${rb_time}s`, 1, hexContainer, charContainer, index, len);
				break;

			case 61:
				let macAddress = "";
				macAddress += stream[index+1].toString(16).padStart(2,"0");
				macAddress += stream[index+2].toString(16).padStart(2,"0");
				macAddress += stream[index+3].toString(16).padStart(2,"0");
				macAddress += stream[index+4].toString(16).padStart(2,"0");
				macAddress += stream[index+5].toString(16).padStart(2,"0");
				macAddress += stream[index+6].toString(16).padStart(2,"0");

				this.PopulateLabel(`Client ID`, 1, hexContainer, charContainer, index, len);
				this.PopulateLabel(`Hardware type: ${stream[index]}`, 2, hexContainer, charContainer, index, 1);
				this.PopulateLabel(`MAC address: ${macAddress}`, 2, hexContainer, charContainer, index+1, 6);
				break;

			case 255: //end
				this.PopulateLabel(`End`, 1, hexContainer, charContainer, index-2, 1);

				this.list.insertBefore(this.PopulateLabel("Options", 0, hexContainer, charContainer, 240, index - 241), options);
				this.list.removeChild(options);

				break;
			}

			index += len;
		}
	}
}