class HexViewer extends Window {

	static dhcpOptions = [
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

	constructor(params) {
		super();

		this.params = params;

		this.SetIcon("mono/hexviewer.svg");
		this.SetTitle("Hex viewer");

		this.AddCssDependencies("hexviewer.css");

		this.content.classList.add("hexviewer-content");

		this.hexBox = document.createElement("div");
		this.hexBox.className = "hexviewer-hexbox";
		this.content.appendChild(this.hexBox);

		this.asciiBox = document.createElement("div");
		this.asciiBox.className = "hexviewer-asciibox";
		this.content.appendChild(this.asciiBox);
		
		this.list = document.createElement("div");
		this.list.className = "hexviewer-list";
		this.content.appendChild(this.list);

		this.details = document.createElement("div");
		this.details.className = "hexviewer-details";
		this.content.appendChild(this.details);

		this.hexBox.onscroll = ()=> {
			this.asciiBox.scrollTop = this.hexBox.scrollTop;
		};

		this.asciiBox.onscroll = ()=> {
			this.hexBox.scrollTop = this.asciiBox.scrollTop;
		};
	
		this.Plot(this.params.exchange, this.params.protocol);
	}

	Plot(exchange, protocol) {
		this.hexBox.textContent = "";
		this.asciiBox.textContent = "";
		this.list.textContent = "";

		for (let i = 0; i < exchange.length; i++) {
			const hexSeparator = document.createElement("div");
			hexSeparator.textContent = exchange[i].direction;
			hexSeparator.className = "hexviewer-separator";
			this.hexBox.appendChild(hexSeparator);

			const asciiSeparator = document.createElement("div");
			asciiSeparator.textContent = exchange[i].direction;
			asciiSeparator.className = "hexviewer-separator";
			this.asciiBox.appendChild(asciiSeparator);

			const listSeparator = document.createElement("div");
			listSeparator.textContent = exchange[i].direction;
			listSeparator.className = "hexviewer-separator";
			this.list.appendChild(listSeparator);
			
			const hexContainer = document.createElement("div");
			this.hexBox.appendChild(hexContainer);

			const charContainer = document.createElement("div");
			this.asciiBox.appendChild(charContainer);

			for (let j = 0; j < exchange[i].data.length; j++) {
				const hex = document.createElement("div");
				hex.textContent = exchange[i].data[j].toString(16).padStart(2, "0");
				hexContainer.appendChild(hex);

				const char = document.createElement("div");
				charContainer.appendChild(char);

				if (exchange[i].data[j] < 33) {
					char.textContent = ".";
				}
				else {
					char.textContent = String.fromCharCode(exchange[i].data[j]);
				}

				hex.onmouseenter = char.onmouseenter = ()=>{
					hex.style.boxShadow = char.style.boxShadow = "#808080 0 0 0 1px inset";
					this.details.textContent = `0x${j.toString(16).padStart(4, "0")}`;
				};

				hex.onmouseleave = char.onmouseleave = ()=>{
					hex.style.boxShadow = char.style.boxShadow = "";
					this.details.textContent = "";
				};
			}

			switch (protocol) {
				case "dns" : this.PopulateDnsLabels(hexContainer, charContainer, exchange[i].data); break;
				case "ntp" : this.PopulateNtpLabels(hexContainer, charContainer, exchange[i].data); break;
				case "dhcp": this.PopulateDhcpLabels(hexContainer, charContainer, exchange[i].data); break;
			}
		}
	}

	PopulateLabel(label, indentation, hexContainer, charContainer, offset, length) {
		const element = document.createElement("div");
		element.textContent = label;
		element.style.paddingLeft = `${8 + indentation * 20}px`;
		this.list.appendChild(element);

		element.onclick = event=> {
			const hexElements  = hexContainer.childNodes;
			const charElements = charContainer.childNodes;
			const listElements = this.list.childNodes;

			for (let i = 0; i < this.hexBox.childNodes.length; i++) {
				if (this.hexBox.childNodes[i].className === "hexviewer-separator") continue;
				for (let j = 0; j < this.hexBox.childNodes[i].childNodes.length; j++) {
					this.hexBox.childNodes[i].childNodes[j].style.color = "";
					this.asciiBox.childNodes[i].childNodes[j].style.color = "";
					this.hexBox.childNodes[i].childNodes[j].style.backgroundColor = "";
					this.asciiBox.childNodes[i].childNodes[j].style.backgroundColor = "";
				}
			}

			for (let i = 0; i < hexElements.length; i++) {
				hexElements[i].style.color = charElements[i].style.color = "";
				hexElements[i].style.backgroundColor = charElements[i].style.backgroundColor = "";
			}
			
			for (let i = 0; i < listElements.length; i++) {
				listElements[i].style.color = "";
				listElements[i].style.backgroundColor = "";
			}

			for (let i = offset; i < Math.min(offset + length, hexElements.length); i++) {
				hexElements[i].style.color = charElements[i].style.color = "#000";
				hexElements[i].style.backgroundColor = charElements[i].style.backgroundColor = "var(--clr-select)";

				hexElements[i].scrollIntoView({ block:"center", inline:"center" });
				charElements[i].scrollIntoView({ block:"center", inline:"center" });
			}

			event.target.style.color = "#000";
			event.target.style.backgroundColor = "var(--clr-select)";
		};

		return element;
	}

	PopulateDnsLabels(hexContainer, charContainer, stream) {
		const transactionId = stream[0].toString(16).padStart(2,"0") + stream[1].toString(16).padStart(2,"0");
		this.PopulateLabel(`Transaction ID: 0x${transactionId}`, 0, hexContainer, charContainer, 0, 2);

		const flags = stream[2].toString(16).padStart(2,"0") + stream[3].toString(16).padStart(2,"0");
		this.PopulateLabel(`Flags: 0x${flags}`, 0, hexContainer, charContainer, 2, 2);

		let isResponse    = (stream[2] & 0b10000000) > 0;
		let options       = (stream[2] & 0b01111000) >> 3;
		let isAuthoritative = (stream[2] & 0b00000100) > 0;
		let isTrancated   = (stream[2] & 0b00000010) > 0;
		let isRecursive   = (stream[2] & 0b00000001) > 0;
		this.PopulateLabel(`Response: ${isResponse}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Options: ${options}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Authoritative: ${isAuthoritative}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Trancated: ${isTrancated}`, 1, hexContainer, charContainer, 2, 1);
		this.PopulateLabel(`Recursive: ${isRecursive}`, 1, hexContainer, charContainer, 2, 1);

		if (isResponse) {
			let isRecursionAvailable  = (stream[3] & 0b10000000) > 0;
			let isAnswerAuthenticated = (stream[3] & 0b00100000) > 0;
			let nonAuthenticatedData  = (stream[3] & 0b00010000) > 0;
			let replyCode             = stream[3] & 0b00001111;
			this.PopulateLabel(`Recursion is available: ${isRecursionAvailable}`, 1, hexContainer, charContainer, 3, 1);
			this.PopulateLabel(`Answer is authenticated: ${isAnswerAuthenticated}`, 1, hexContainer, charContainer, 3, 1);
			this.PopulateLabel(`Non authenticated data: ${nonAuthenticatedData}`, 1, hexContainer, charContainer, 3, 1);
			this.PopulateLabel(`Reply code: ${replyCode}`, 1, hexContainer, charContainer, 3, 1);
		}

		const qCount = stream[4] << 8 | stream[5];
		this.PopulateLabel(`Questions counter: ${qCount}`, 0, hexContainer, charContainer, 4, 2);

		const anCount = stream[6] << 8 | stream[7];
		this.PopulateLabel(`Answers counter:  ${anCount}`, 0, hexContainer, charContainer, 6, 2);

		const auCount = stream[8] << 8 | stream[9];
		this.PopulateLabel(`Authority RRs: ${auCount}`, 0, hexContainer, charContainer, 8, 2);

		const adCount = stream[10] << 8 | stream[11];
		this.PopulateLabel(`Additional RRs: ${adCount}`, 0, hexContainer, charContainer, 10, 2);

		let offset = 12;
		let count = 0;

		while (offset < stream.length && count < qCount) { //questions
			let start = offset;
			let end = offset;

			switch (stream[offset]) {
			case 0xc0: //pointer
				end += 2;
				break;

			default:
				while (end < stream.length && stream[end] !== 0) {
					end++;
				}
				break;
			}
			
			const first = this.PopulateLabel("Name", 1, hexContainer, charContainer, start, end - start);
			offset = end + 1;

			let type = (stream[offset] << 8) | stream[offset+1];
			this.PopulateLabel(`Type: ${type}`, 1, hexContainer, charContainer, offset, 2);
			offset += 2;
			
			let class_ = (stream[offset] << 8) | stream[offset+1];
			this.PopulateLabel(`Class: ${class_}`, 1, hexContainer, charContainer, offset, 2);
			offset += 2;

			const element = this.PopulateLabel("Question:", 0, hexContainer, charContainer, start, offset - start);
			this.list.insertBefore(element, first);

			count++;
		}

		while (offset < stream.length && count < qCount + anCount + auCount + adCount) { //answers
			let start = offset;
			let end = offset;

			switch (stream[offset]) {
			case 0xc0: //pointer
				end += 2;
				break;

			default:
				while (end < stream.length && stream[end] !== 0) {
					end++;
				}
				break;
			}

			const first = this.PopulateLabel("Name", 1, hexContainer, charContainer, start, end - start);

			offset = end;

			let type = (stream[offset] << 8) | stream[offset+1];
			this.PopulateLabel(`Type: ${type}`, 1, hexContainer, charContainer, offset, 2);
			offset += 2;

			let class_ = (stream[offset] << 8) | stream[offset+1];
			this.PopulateLabel(`Class: ${class_}`, 1, hexContainer, charContainer, offset, 2);
			offset += 2;

			let ttl = (stream[offset] << 24) | (stream[offset+1] << 16) | (stream[offset+2] << 8) | stream[offset+3];
			this.PopulateLabel(`TTL: ${ttl}`, 1, hexContainer, charContainer, offset, 4);
			offset += 4;

			let len = (stream[offset] << 8) | stream[offset+1];
			this.PopulateLabel(`Length: ${len}`, 1, hexContainer, charContainer, offset, 2);
			offset += 2;

			let data;
			switch (type) {
			case 1: //A
				if (len === 4) {
					data = `${stream[offset]}.${stream[offset+1]}.${stream[offset+2]}.${stream[offset+3]}`;
					this.PopulateLabel(data, 1, hexContainer, charContainer, offset, len);
				}
				break;

			case 28: //AAAA
				if (len === 16) {
					data = "";
					for (let j = 0; j < 16; j+=2) {
						if (j > 0) data += ":";
						data += stream[offset + j].toString(16).padStart(2, "0");
						data += stream[offset + j + 1].toString(16).padStart(2, "0");
					}
					this.PopulateLabel(data, 1, hexContainer, charContainer, offset, len);
				}
				break;

			default:
				this.PopulateLabel("Answer", 1, hexContainer, charContainer, offset, len);
				break;
			}
			offset += len;

			end = offset;

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
					if (stream[index+i] < HexViewer.dhcpOptions.length) {
						this.PopulateLabel(`(${stream[index+i]}) ${HexViewer.dhcpOptions[stream[index+i]]}`, 2, hexContainer, charContainer, index+i, 1);
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