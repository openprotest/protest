class MacLookup extends Console {
	constructor(args) {
		super();

		this.args = args ?? { entries: [] };

		this.AddCssDependencies("tools.css");

		this.hashtable = {}; //contains all elements

		this.SetTitle("MAC lookup");
		this.SetIcon("mono/maclookup.svg");

		this.SetupToolbar();
		this.clearButton   = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.AddSendToChatButton();

		this.inputBox.placeholder = "mac address";

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

	Filter(macaddr) {
		if (macaddr.indexOf(";", 0) > -1) {
			let ips = macaddr.split(";");
			for (let i = 0; i < ips.length; i++) this.Add(ips[i].trim());

		}
		else if (macaddr.indexOf(",", 0) > -1) {
			let ips = macaddr.split(",");
			for (let i = 0; i < ips.length; i++) this.Add(ips[i].trim());

		}
		else {
			this.Add(macaddr);
		}
	}

	async Add(macaddr) {
		if (macaddr in this.hashtable) {
			this.list.appendChild(this.hashtable[macaddr].element);
			return;
		}

		let element = document.createElement("div");
		element.className = "tool-element";
		this.list.appendChild(element);

		let name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.textContent = macaddr;
		element.appendChild(name);

		let result = document.createElement("div");
		result.className = "tool-result collapsed100";
		result.textContent = "";
		element.appendChild(result);

		let remove = document.createElement("div");
		remove.className = "tool-remove";
		element.appendChild(remove);

		this.hashtable[macaddr] = {
			element: element,
			result: result
		};

		remove.onclick = ()=> { this.Remove(macaddr); };

		this.args.entries.push(macaddr);

		try {
			const response = await fetch("tools/maclookup", {
				method: "POST",
				body: macaddr
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const responseText = await response.text();

			const label = document.createElement("div");
			label.textContent = responseText;
			result.appendChild(label);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	Remove(macaddr) {
		if (!(macaddr in this.hashtable)) return;
		this.list.removeChild(this.hashtable[macaddr].element);
		delete this.hashtable[macaddr];

		const index = this.args.entries.indexOf(macaddr);
		if (index > -1)
			this.args.entries.splice(index, 1);
	}
}