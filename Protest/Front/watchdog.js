class Watchdog extends Window {
	constructor() {
		super();

		this.AddCssDependencies("watchdog.css");

		this.SetTitle("Watchdog");
		this.SetIcon("mono/watchdog.svg");

		this.SetupToolbar();

		const newButton          = this.AddToolbarButton("Create watcher", "mono/add.svg?light");
		const notificationButton = this.AddToolbarButton("Notifications", "mono/notifications.svg?light");
		const refreshButton      = this.AddToolbarButton("Refresh", "mono/update.svg?light");

		refreshButton.onclick = ()=> this.Load();
		notificationButton.onclick = ()=> this.Notifications();
		newButton.onclick = ()=> this.NewWatcher();
	}

	Load() {
		
	}

	Notifications() {
		const dialog = this.DialogBox("720px");
		if (dialog === null) return;

		const innerBox = dialog.innerBox;
		const btnOK    = dialog.btnOK;

	}

	NewWatcher() {
		const dialog = this.DialogBox("350px");
		if (dialog === null) return;

		const innerBox = dialog.innerBox;
		const btnOK    = dialog.btnOK;

		innerBox.parentElement.style.transition = ".2s";

		innerBox.style.display = "grid";
		innerBox.style.margin = "20px";
		innerBox.style.gridTemplateColumns = "auto 200px 300px auto";
		innerBox.style.alignItems = "center";

		btnOK.value = "Create";

		let types = ["ICMP", "TCP", "DNS", "HTTP", "HTTP keyword", "TLS"];
		let methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
		let dnsRecordTypes = ["A", "NS", "CNAME", "SOA", "PTR", "MX", "TXT", "AAAA", "SRV"];

		const typeLabel = document.createElement("div");
		typeLabel.style.gridArea = "1 / 2";
		typeLabel.textContent = "Watcher type:";
		
		const typeInput = document.createElement("select");
		typeInput.style.gridArea = "1 / 3";
		for (let i=0; i<types.length; i++){
			const newType = document.createElement("option");
			newType.text = types[i];
			newType.value = types[i];
			typeInput.appendChild(newType);
		}
		
		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "2 / 2";
		nameLabel.textContent = "Name:";
		
		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.style.gridArea = "2 / 3";
	

		const targetLabel = document.createElement("div");
		targetLabel.textContent = "Target:";

		const targetInput = document.createElement("input");
		targetInput.type = "text";


		const portLabel = document.createElement("div");
		portLabel.textContent = "Port:";

		const portInput = document.createElement("input");
		portInput.type = "number";
		portInput.min = 1;
		portInput.max = 65_535;
		portInput.value = 443;


		const rrTypeLabel = document.createElement("div");
		rrTypeLabel.textContent = "Resource record type:";

		const rrTypeInput = document.createElement("select");
		for (let i=0; i<dnsRecordTypes.length; i++){
			const newType = document.createElement("option");
			newType.text = dnsRecordTypes[i];
			newType.value = dnsRecordTypes[i];
			rrTypeInput.appendChild(newType);
		}


		const queryLabel = document.createElement("div");
		queryLabel.textContent = "Query:";

		const queryInput = document.createElement("input");
		queryInput.type = "text";
		queryInput.placeholder = "one.one.one.one";


		const keywordLabel = document.createElement("div");
		keywordLabel.textContent = "Keyword:";

		const keywordInput = document.createElement("input");
		keywordInput.type = "text";


		const methodLabel = document.createElement("div");
		methodLabel.textContent = "Method:";

		const methodInput = document.createElement("select");
		for (let i=0; i<methods.length; i++){
			const newMethod = document.createElement("option");
			newMethod.text = methods[i];
			newMethod.value = methods[i];
			methodInput.appendChild(newMethod);
		}


		const statusCodesLabel = document.createElement("div");
		statusCodesLabel.textContent = "Accepted status codes:";

		const statusCodesBox = document.createElement("div");


		let statusCodes = [];
		for (let i=1; i<6; i++) {
			const checkBox = document.createElement("input");
			checkBox.type = "checkbox";
			checkBox.checked = i > 1 && i < 4;
			statusCodesBox.appendChild(checkBox);
			const label = this.AddCheckBoxLabel(statusCodesBox, checkBox, `${i}xx`);
			label.style.minWidth = "38px";
			label.style.margin = "2px";
			statusCodes.push(checkBox);
		}

		const intervalLabel = document.createElement("div");
		intervalLabel.textContent = "Interval (minutes):";

		const intervalInput = document.createElement("input");
		intervalInput.type = "number";
		intervalInput.min = 5;
		intervalInput.max = 1440;
		intervalInput.value = 120;


		const retriesLabel = document.createElement("div");
		retriesLabel.textContent = "Retries:";

		const retriesInput = document.createElement("input");
		retriesInput.type = "number";
		retriesInput.min = 0;
		retriesInput.max = 16;
		retriesInput.value = 1;

		let counter = 3;
		const AppendRow = (label, input)=> {
			label.style.gridArea = `${counter} / 2`;
			input.style.gridArea = `${counter} / 3`;
			counter++;
			innerBox.append(label, input);
		};

		typeInput.onchange = ()=> {
			innerBox.textContent = "";
			
			innerBox.append(typeLabel, typeInput);
			innerBox.append(nameLabel, nameInput);
			typeInput.focus();

			counter = 3;

			switch (typeInput.value) {
			case "ICMP":
				innerBox.parentElement.style.maxHeight = "350px";
				innerBox.style.gridTemplateRows = "repeat(5, 44px)";
				targetLabel.textContent = "Host:";
				targetInput.placeholder = "1.1.1.1";
				AppendRow(targetLabel, targetInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;
			
			case "TCP":
				innerBox.parentElement.style.maxHeight = "400px";
				innerBox.style.gridTemplateRows = "repeat(6, 44px)";
				targetLabel.textContent = "Host:";
				targetInput.placeholder = "1.1.1.1";
				AppendRow(targetLabel, targetInput);
				AppendRow(portLabel, portInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;
				
			case "DNS":
				innerBox.parentElement.style.maxHeight = "450px";
				innerBox.style.gridTemplateRows = "repeat(6, 44px)";
				targetLabel.textContent = "DNS server:";
				targetInput.placeholder = "1.1.1.1";
				portInput.value = "53";
				AppendRow(targetLabel, targetInput);
				AppendRow(portLabel, portInput);
				AppendRow(rrTypeLabel, rrTypeInput);
				AppendRow(queryLabel, queryInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;
				
			case "HTTP":
				innerBox.parentElement.style.maxHeight = "450px";
				innerBox.style.gridTemplateRows = "repeat(4, 44px) 64px repeat(2, 44px)";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(targetLabel, targetInput);
				AppendRow(methodLabel, methodInput);
				AppendRow(statusCodesLabel, statusCodesBox);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;
	
			case "HTTP keyword":
				innerBox.parentElement.style.maxHeight = "480px";
				innerBox.style.gridTemplateRows = "repeat(5, 44px) 64px repeat(2, 44px)";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(targetLabel, targetInput);
				AppendRow(methodLabel, methodInput);
				AppendRow(keywordLabel, keywordInput);
				AppendRow(statusCodesLabel, statusCodesBox);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "TLS":
				innerBox.parentElement.style.maxHeight = "350px";
				innerBox.style.gridTemplateRows = "repeat(5, 44px)";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(targetLabel, targetInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;
			}

		};

		typeInput.onchange();

	}

}