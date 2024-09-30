class LocateIp extends Console {
	constructor(args) {
		super();

		this.args = args ?? { entries: [] };

		this.AddCssDependencies("tools.css");

		this.hashtable = {}; //contains all elements

		this.SetTitle("Locate IP");
		this.SetIcon("mono/locate.svg");

		this.SetupToolbar();
		this.clearButton = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.AddSendToChatButton();

		if (this.args.entries) { //restore entries from previous session
			let temp = this.args.entries;
			this.args.entries = [];
			for (let i = 0; i < temp.length; i++)
				this.Push(temp[i]);
		}

		this.clearButton.addEventListener("click", ()=> {
			const okButton = this.ConfirmBox("Are you sure you want to clear the list?");
			if (okButton) okButton.addEventListener("click", ()=> {
				this.list.textContent = "";
				this.hashtable = {};
				this.args.entries = [];
			});
		});
	}

	Push(name) { //overrides
		if (!super.Push(name)) return;
		this.Filter(name);
	}

	Filter(ipaddr) {
		if (ipaddr.indexOf(";", 0) > -1) {
			let ips = ipaddr.split(";");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (ipaddr.indexOf(",", 0) > -1) {
			let ips = ipaddr.split(",");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (ipaddr.indexOf("-", 0) > -1) {
			let split = ipaddr.split("-");
			let start = split[0].trim().split(".");
			let end = split[1].trim().split(".");

			let istart = (parseInt(start[0]) << 24) + (parseInt(start[1]) << 16) + (parseInt(start[2]) << 8) + (parseInt(start[3]));
			let iend = (parseInt(end[0]) << 24) + (parseInt(end[1]) << 16) + (parseInt(end[2]) << 8) + (parseInt(end[3]));

			if (istart > iend) iend = istart;
			if (iend - istart > 255) iend = istart + 255;

			function intToBytes(int) {
				let b = [0, 0, 0, 0];
				let i = 4;
				do {
					b[--i] = int & (255);
					int = int >> 8;
				} while (i);
				return b;
			}

			for (let i = istart; i <= iend; i++)
				this.Add(intToBytes(i).join("."));
		}
		else if (ipaddr.indexOf("/", 0) > -1) {
			let cidr = parseInt(ipaddr.split("/")[1].trim());
			if (isNaN(cidr)) return;

			let ip = ipaddr.split("/")[0].trim();
			let ipBytes = ip.split(".");
			if (ipBytes.length != 4) return;

			ipBytes = ipBytes.map(o=> parseInt(o));

			let bits = "1".repeat(cidr).padEnd(32, "0");
			let mask = [];
			mask.push(parseInt(bits.substr(0, 8), 2));
			mask.push(parseInt(bits.substr(8, 8), 2));
			mask.push(parseInt(bits.substr(16, 8), 2));
			mask.push(parseInt(bits.substr(24, 8), 2));

			let net = [], broadcast = [];
			for (let i = 0; i < 4; i++) {
				net.push(ipBytes[i] & mask[i]);
				broadcast.push(ipBytes[i] | (255 - mask[i]));
			}

			this.Filter(net.join(".") + " - " + broadcast.join("."));
		}
		else {
			this.Add(ipaddr);
		}
	}

	async Add(ipaddr) {
		if (ipaddr.length == 0) return;
		if (ipaddr.indexOf(" ") > -1) return;

		if (ipaddr in this.hashtable) {
			this.list.appendChild(this.hashtable[ipaddr].element);
			return;
		}

		const element = document.createElement("div");
		element.className = "tool-element";
		this.list.appendChild(element);

		const name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.textContent = ipaddr;
		element.appendChild(name);

		const result = document.createElement("div");
		result.className = "tool-result collapsed100";
		result.textContent = "";
		result.style.paddingLeft = "28px";
		result.style.width = "calc(70% - 52px)";
		result.style.backgroundSize = "24px 24px";
		result.style.backgroundPosition = "0 50%";
		result.style.backgroundRepeat = "no-repeat";
		element.appendChild(result);

		const remove = document.createElement("div");
		remove.className = "tool-remove";
		element.appendChild(remove);

		this.hashtable[ipaddr] = {
			element: element,
			result: result
		};

		remove.onclick = ()=> { this.Remove(ipaddr); };

		this.args.entries.push(ipaddr);

		try {
			const response = await fetch("tools/locateip", {
				method: "POST",
				body: ipaddr
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const responseText = await response.text();

			let split = responseText.split(";");

			if (split.length == 1) {
				const label = document.createElement("div");
				label.textContent = split[0];
				result.appendChild(label);
				return;
			}

			if (split[0] !== "--") {
				result.style.backgroundImage = `url(flags/${split[0].toLowerCase()}.svg)`;
			}

			if (split[1] === "Local domain"
				|| split[1] === "Private domain"
				|| split[1] === "Automatic Private IP Addressing"
				|| split[1] === "Multicast domain"
				|| "Broadcast") {
				result.textContent += split[1];
			}
			else {
				result.textContent += `${split[1]}, ${split[2]}, ${split[3]}`;
			}

			if (split[4].length > 0 && split[4] != "0,0") {
				const divLocation = document.createElement("div");
				divLocation.style.position = "absolute";
				divLocation.style.width = "24px";
				divLocation.style.height = "24px";
				divLocation.style.right = "64px";
				divLocation.style.top = "4px";
				divLocation.style.backgroundSize = "contain";
				divLocation.style.backgroundImage = "url(mono/locate.svg?light)";
				divLocation.setAttribute("tip-below", "Location");
				divLocation.style.cursor = "pointer";
				element.appendChild(divLocation);
				divLocation.onclick= ()=>{
					const link = document.createElement("a");
					link.href = `https://www.google.com/maps/place/${split[4]}`;
					link.target = "_blank";
					link.click();
				};
			}

			if (split[6] == "true") { //tor
				const divTor = document.createElement("div");
				divTor.style.position = "absolute";
				divTor.style.width = "24px";
				divTor.style.height = "24px";
				divTor.style.right = "96px";
				divTor.style.top = "4px";
				divTor.style.backgroundSize = "contain";
				divTor.style.backgroundImage = "url(mono/tor.svg?light)";
				divTor.setAttribute("tip-below", "Tor");
				element.appendChild(divTor);
			}
			else if (split[5] == "true") { //proxy
				const divProxy = document.createElement("div");
				divProxy.style.position = "absolute";
				divProxy.style.width = "24px";
				divProxy.style.height = "24px";
				divProxy.style.right = "96px";
				divProxy.style.top = "4px";
				divProxy.style.backgroundSize = "contain";
				divProxy.style.backgroundImage = "url(mono/proxy.svg?light)";
				divProxy.setAttribute("tip-below", "Proxy");
				element.appendChild(divProxy);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	Remove(ipaddr) {
		if (!(ipaddr in this.hashtable)) return;
		this.list.removeChild(this.hashtable[ipaddr].element);
		delete this.hashtable[ipaddr];

		const index = this.args.entries.indexOf(ipaddr);
		if (index > -1) { this.args.entries.splice(index, 1); }
	}
}