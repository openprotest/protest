class Watchdog extends Window {
	static HOUR_TICKS = 3_600_000;
	static DAY_TICKS  = 3_600_000 * 24;

	constructor() {
		super();

		this.AddCssDependencies("list.css");
		this.AddCssDependencies("watchdog.css");

		this.SetTitle("Watchdog");
		this.SetIcon("mono/watchdog.svg");

		this.SetupToolbar();
		this.newButton          = this.AddToolbarButton("Create watcher", "mono/add.svg?light");
		this.editButton         = this.AddToolbarButton("Edit", "mono/edit.svg?light");
		this.deleteButton       = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.notificationButton = this.AddToolbarButton("Notifications", "mono/notifications.svg?light");
		this.AddToolbarSeparator();
		this.reloadButton       = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.gotoButton         = this.AddToolbarButton("Go to", "mono/skipback.svg?light");
		this.zoomOutButton      = this.AddToolbarButton("Zoom out", "mono/zoomout.svg?light");
		this.zoomInButton       = this.AddToolbarButton("Zoom in", "mono/zoomin.svg?light");

		this.newButton.onclick          = ()=> this.WatcherDialog(true);
		this.editButton.onclick         = ()=> this.EditWatcher();
		this.deleteButton.onclick       = ()=> this.DeleteWatcher();
		this.notificationButton.onclick = ()=> this.NotificationsDialog();
		this.reloadButton.onclick       = ()=> this.ListWatchers();
		this.zoomOutButton.onclick      = ()=> this.ZoomOut();
		this.zoomInButton.onclick       = ()=> this.ZoomIn();
		this.gotoButton.onclick         = ()=> this.GoTo();

		this.timeline = document.createElement("div");
		this.timeline.className = "watchdog-timeline";

		this.list = document.createElement("div");
		this.list.className = "watchdog-list";

		this.stats = document.createElement("div");
		this.stats.className = "watchdog-stats";

		this.content.append(this.timeline, this.list, this.stats);

		this.watchers = {};
		this.cache = {};
		this.selected = null;
		this.selectedElement = null;

		this.offset = 0;
		this.dayPixels = 480;
		this.timezoneOffset = new Date().getTimezoneOffset() * Watchdog.HOUR_TICKS / 60;
		this.timezonePixelOffset = new Date().getTimezoneOffset() * (this.dayPixels / 24) / 60;

		let now = Date.now();
		this.utcToday = new Date(now - now % Watchdog.DAY_TICKS).getTime();

		let seeking = false;
		let mouseX0;
		let lastOffset = 0;

		this.timeline.onmousedown = event=> {
			this.timeline.style.cursor = "grabbing";
			mouseX0 = event.clientX;
			lastOffset = this.offset;
			seeking = true;
		};

		this.timeline.onmousemove = event=> {
			if (event.buttons !== 1) {
				this.timeline.onmouseup(event);
				return;
			}

			if (!seeking) { return; }

			let last = this.offset;

			this.offset = lastOffset - (mouseX0 - event.clientX);
			this.offset -= this.offset % Math.max((this.dayPixels / 24), 20);
			if (this.offset < this.timezonePixelOffset) this.offset = this.timezonePixelOffset;

			if (last === this.offset) return;
			this.Seek();
		};

		this.timeline.onmouseup = ()=> {
			this.timeline.style.cursor = "grab";
			seeking = false;
		};

		this.list.addEventListener("mousedown", event=> this.timeline.onmousedown(event));

		this.win.addEventListener("mousemove", event=> this.timeline.onmousemove(event));
		this.win.addEventListener("mouseup", event=> this.timeline.onmouseup(event));
	
		this.UpdateAuthorization();
		this.ListWatchers();
	}

	AfterResize() { //override
		if (this.content.getBoundingClientRect().width < 720) {
			this.timeline.style.right = `${4 + this.list.offsetWidth - this.list.clientWidth}px`;
			this.list.style.right = "4px";
			this.stats.style.display = "none";
		}
		else {
			this.timeline.style.right = `${200 + this.list.offsetWidth - this.list.clientWidth}px`;
			this.list.style.right = "200px";
			this.stats.style.display = "initial";
		}

		if (this.lastWidth && this.lastWidth === this.content.getBoundingClientRect().width) return;
		this.Seek();
		this.lastWidth = this.content.getBoundingClientRect().width;
	}

	GoTo() {
		const dialog = this.DialogBox("120px");
		if (dialog === null) return;

		const innerBox = dialog.innerBox;
		const btnOK = dialog.btnOK;

		innerBox.parentElement.style.maxWidth = "300px";

		innerBox.style.textAlign = "center";
		innerBox.style.marginTop = "20px";

		let maxDate = new Date(this.utcToday);

		const dateInput = document.createElement("input");
		dateInput.style.width = "calc(100% - 40px)";
		dateInput.type = "date";
		dateInput.max = `${maxDate.getFullYear()}-${`${maxDate.getMonth()+1}`.padStart(2,"0")}-${`${maxDate.getDate()}`.padStart(2,"0")}`;
		innerBox.appendChild(dateInput);

		dateInput.valueAsDate = new Date(this.utcToday - this.offset * Watchdog.DAY_TICKS / this.dayPixels);
		
		dateInput.onkeydown = event=> {
			if (event.key === "Enter") {
				btnOK.onclick();
			}
		};

		btnOK.onclick = ()=> {
			this.offset = (this.utcToday - dateInput.valueAsDate) * this.dayPixels / Watchdog.DAY_TICKS;
			if (this.offset < this.timezonePixelOffset) this.offset = this.timezonePixelOffset;
			this.Seek();
			dialog.Close();
		};

		dateInput.focus();
	}

	ZoomOut() {
		if (this.dayPixels <= 30) return;

		let current = new Date(this.utcToday - this.offset * Watchdog.DAY_TICKS / this.dayPixels);

		for (let key in this.watchers) {
			this.watchers[key].element.childNodes[2].textContent = "";
		}

		this.dayPixels /= 2;
		this.timezonePixelOffset = new Date().getTimezoneOffset() * (this.dayPixels / 24) / 60;
		this.offset = (this.utcToday - current) * this.dayPixels / Watchdog.DAY_TICKS;
		if (this.offset < this.timezonePixelOffset) this.offset = this.timezonePixelOffset;

		this.Seek();
	}

	ZoomIn() {
		if (this.dayPixels >= 1920) return;

		let current = new Date(this.utcToday - this.offset * Watchdog.DAY_TICKS / this.dayPixels);

		for (let key in this.watchers) {
			this.watchers[key].element.childNodes[2].textContent = "";
		}

		this.dayPixels *= 2;
		this.timezonePixelOffset = new Date().getTimezoneOffset() * (this.dayPixels / 24) / 60;
		this.offset = (this.utcToday - current) * this.dayPixels / Watchdog.DAY_TICKS;
		if (this.offset < this.timezonePixelOffset) this.offset = this.timezonePixelOffset;

		this.Seek();
	}

	UpdateAuthorization() {
		this.newButton.disabled          = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
		this.editButton.disabled         = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
		this.deleteButton.disabled       = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
		this.notificationButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
	}

	async ListWatchers() {
		let now = Date.now();
		this.utcToday = new Date(now - now % Watchdog.DAY_TICKS).getTime() + this.timezoneOffset;

		this.cache = {};

		try {
			const response = await fetch("watchdog/list");

			if (response.status !== 200) return;
			
			const json = await response.json();
			if (json.error) throw(json.error);
			
			this.list.textContent = "";

			json.sort((a, b)=>a.name.localeCompare(b.name));

			for (let i=0; i<json.length; i++) {
				const element = this.CreateWatcherElement(json[i]);
				this.list.appendChild(element);
				json[i].element = element;

				this.watchers[json[i].file] = json[i];
			}
	
			this.Seek();
		}
		catch (ex) {
			setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 200);
		}
	}

	WatcherDialog(isNew) {
		const dialog = this.DialogBox("350px");
		if (dialog === null) return;

		const innerBox = dialog.innerBox;
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;

		btnOK.value = isNew ? "Create" : "Save";

		innerBox.parentElement.style.transition = ".2s";

		innerBox.style.display = "grid";
		innerBox.style.margin = "20px";
		innerBox.style.gridTemplateColumns = "auto 200px 300px auto";
		innerBox.style.alignItems = "center";

		let types = ["ICMP", "TCP", "DNS", "HTTP", "HTTP keyword", "TLS"];
		let methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
		let dnsRecordTypes = ["A", "NS", "CNAME", "SOA", "PTR", "MX", "TXT", "AAAA", "SRV"];


		const enableBox = document.createElement("div");
		enableBox.style.gridArea = "1 / 2";

		const enableInput = document.createElement("input");
		enableInput.type = "checkbox";
		enableBox.appendChild(enableInput);
		const label = this.AddCheckBoxLabel(enableBox, enableInput, "Enable");
		label.style.minWidth = "38px";
		label.style.margin = "2px";


		const typeLabel = document.createElement("div");
		typeLabel.style.gridArea = "2 / 2";
		typeLabel.textContent = "Watcher type:";

		const typeInput = document.createElement("select");
		typeInput.style.gridArea = "2 / 3";
		typeInput.disabled = !isNew;
		for (let i = 0; i < types.length; i++) {
			const newType = document.createElement("option");
			newType.text = types[i];
			newType.value = types[i];
			typeInput.appendChild(newType);
		}

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "3 / 2";
		nameLabel.textContent = "Name:";

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.style.gridArea = "3 / 3";


		const targetLabel = document.createElement("div");
		targetLabel.textContent = "Target:";
		targetLabel.style.gridArea = "4 / 2";

		const targetInput = document.createElement("input");
		targetInput.type = "text";
		targetInput.style.gridArea = "4 / 3";


		const portLabel = document.createElement("div");
		portLabel.textContent = "Port:";

		const portInput = document.createElement("input");
		portInput.type = "number";
		portInput.min = 1;
		portInput.max = 65_535;
		portInput.value = 443;


		const timeoutLabel = document.createElement("div");
		timeoutLabel.textContent = "Timeout (ms):";
		timeoutLabel.style.gridArea = "5 / 2";

		const timeoutInput = document.createElement("input");
		timeoutInput.type = "number";
		timeoutInput.min = 1;
		timeoutInput.max = 10_000;
		timeoutInput.value = 500;
		timeoutInput.style.gridArea = "5 / 3";


		const rrTypeLabel = document.createElement("div");
		rrTypeLabel.textContent = "Resource record type:";

		const rrTypeInput = document.createElement("select");
		for (let i = 0; i < dnsRecordTypes.length; i++) {
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
		for (let i = 0; i < methods.length; i++) {
			const newMethod = document.createElement("option");
			newMethod.text = methods[i];
			newMethod.value = methods[i];
			methodInput.appendChild(newMethod);
		}

		const statusCodesLabel = document.createElement("div");
		statusCodesLabel.textContent = "Accepted status codes:";
		const statusCodesBox = document.createElement("div");

		let statusCodes = [];
		for (let i = 1; i < 6; i++) {
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
		retriesInput.max = 4;
		retriesInput.value = 1;

		let counter = 6;
		const AppendRow = (label, input) => {
			label.style.gridArea = `${counter} / 2`;
			input.style.gridArea = `${counter} / 3`;
			counter++;
			innerBox.append(label, input);
		};

		if (isNew) {
			enableInput.checked = true;
		}
		else {
			enableInput.checked = this.selected.enable;
			typeInput.value     = this.selected.type;
			nameInput.value     = this.selected.name;
			targetInput.value   = this.selected.target;
			portInput.value     = this.selected.port;
			methodInput.value   = this.selected.method;
			keywordInput.value  = this.selected.keyword;
			queryInput.value    = this.selected.query;
			rrTypeInput.value   = this.selected.rrtype;
			intervalInput.value = this.selected.interval;
			retriesInput.value  = this.selected.retries;

			for (let i=0; i<5; i++) {
				statusCodes[i].checked = this.selected.httpstatus[i];
			}
		}
		
		typeInput.onchange = ()=> {
			innerBox.textContent = "";

			innerBox.append(enableBox);
			innerBox.append(typeLabel, typeInput);
			innerBox.append(nameLabel, nameInput);
			innerBox.append(targetLabel, targetInput);
			innerBox.append(timeoutLabel, timeoutInput);

			if (isNew) {
				typeInput.focus();
			}
			else {
				nameInput.focus();
			}

			counter = 6;

			switch (typeInput.value) {
			case "ICMP":
				innerBox.style.gridTemplateRows = "repeat(7, 40px) auto";
				targetLabel.textContent = "Host:";
				targetInput.placeholder = "1.1.1.1";
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "TCP":
				innerBox.style.gridTemplateRows = "repeat(8, 40px) auto";
				targetLabel.textContent = "Host:";
				targetInput.placeholder = "1.1.1.1";
				AppendRow(portLabel, portInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "DNS":
				innerBox.style.gridTemplateRows = "repeat(10, 40px) auto";
				targetLabel.textContent = "DNS server:";
				targetInput.placeholder = "1.1.1.1";
				portInput.value = "53";
				AppendRow(rrTypeLabel, rrTypeInput);
				AppendRow(queryLabel, queryInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "HTTP":
				innerBox.style.gridTemplateRows = "repeat(6, 40px) 64px repeat(2, 40px) auto";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(methodLabel, methodInput);
				AppendRow(statusCodesLabel, statusCodesBox);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "HTTP keyword":
				innerBox.style.gridTemplateRows = "repeat(7, 40px) 64px repeat(2, 40px) auto";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(methodLabel, methodInput);
				AppendRow(keywordLabel, keywordInput);
				AppendRow(statusCodesLabel, statusCodesBox);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "TLS":
				innerBox.style.gridTemplateRows = "repeat(7, 40px) auto";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;
			}

			innerBox.parentElement.style.maxHeight = `calc(${56 + 44*counter}px)`;
		};

		targetInput.onchange = ()=> {
			nameInput.placeholder = targetInput.value;
		};

		typeInput.onchange();
		
		btnOK.onclick = async ()=> {
			if (!isNew && this.selected === null) return;

			let requiredFilledMissing = false;

			if (targetInput.value.length === 0) {
				if (!requiredFilledMissing) targetInput.focus();
				targetInput.required = true;
				requiredFilledMissing = true;
			}

			if (typeInput.value === "TCP" && portInput.value.length === 0) {
				if (!requiredFilledMissing) portInput.focus();
				portInput.required = true;
				requiredFilledMissing = true;
			}

			if (typeInput.value === "DNS" && portInput.value.length === 0) {
				if (!requiredFilledMissing) portInput.focus();
				portInput.required = true;
				requiredFilledMissing = true;
			}
			if (typeInput.value === "DNS" && queryInput.value.length === 0) {
				if (!requiredFilledMissing) queryInput.focus();
				queryInput.required = true;
				requiredFilledMissing = true;
			}

			if (typeInput.value === "HTTP keyword" && keywordInput.value.length === 0) {
				if (!requiredFilledMissing) keywordInput.focus();
				keywordInput.required = true;
				requiredFilledMissing = true;
			}

			if (requiredFilledMissing) return;

			if (nameInput.value.length === 0) {
				nameInput.value = targetInput.value;
			}

			try {
				const obj = {
					file       : isNew ? null : this.selected.file,
					enable     : enableInput.checked,
					type       : typeInput.value,
					name       : nameInput.value,
					target     : targetInput.value,
					port       : parseInt(portInput.value),
					timeout    : parseInt(timeoutInput.value),
					method     : methodInput.value,
					keyword    : keywordInput.value,
					query      : queryInput.value,
					rrtype     : rrTypeInput.value,
					httpstatus : [statusCodes[0].checked, statusCodes[1].checked, statusCodes[2].checked, statusCodes[3].checked, statusCodes[4].checked],
					interval   : Math.max(parseInt(intervalInput.value), 5),
					retries    : Math.max(parseInt(retriesInput.value), 0)
				};

				let url = isNew ? "watchdog/create" : `watchdog/create?file=${this.selected.file}`;

				const response = await fetch(url, {
					method: "POST",
					body : JSON.stringify(obj)
				});

				if (response.status !== 200) return;
				
				const json = await response.json();
				if (json.error) throw(json.error);

				if (!isNew) {
					this.list.removeChild(this.selectedElement);
				}
				
				const element = this.CreateWatcherElement(json);
				this.list.appendChild(element);
				json.element = element;

				this.watchers[json.file] = json;

				this.Seek();
			}
			catch (ex) {
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 200);
			}

			btnCancel.onclick();
		};

		return dialog;
	}

	async NotificationsDialog() {
		const dialog = this.DialogBox("520px");
		if (dialog === null) return;

		const innerBox = dialog.innerBox;
		const buttonBox = dialog.buttonBox;
		const btnOK = dialog.btnOK;

		btnOK.style.display = "none";

		const saveButton = document.createElement("input");
		saveButton.className = "with-icon";
		saveButton.type = "button";
		saveButton.value = "Save";
		saveButton.style.backgroundImage = "url(mono/floppy.svg?light)";
		buttonBox.prepend(saveButton);

		const newButton = document.createElement("input");
		newButton.className = "with-icon";
		newButton.type = "button";
		newButton.value = "New";
		newButton.style.position = "absolute";
		newButton.style.left = "8px";
		newButton.style.backgroundImage = "url(mono/add.svg?light)";
		buttonBox.prepend(newButton);

		const notificationsList = document.createElement("div");
		notificationsList.style.position = "absolute";
		notificationsList.style.left = "8px";
		notificationsList.style.top = "8px";
		notificationsList.style.bottom = "8px";
		notificationsList.style.width = "250px";
		notificationsList.style.border = "2px solid var(--clr-control)";
		notificationsList.style.borderRadius = "4px";
		notificationsList.style.overflowY = "auto";

		innerBox.appendChild(notificationsList);

		const nameLabel = document.createElement("div");
		nameLabel.textContent = "Name: ";
		nameLabel.style.position = "absolute";
		nameLabel.style.left = "270px";
		nameLabel.style.top = "25px";

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.style.position = "absolute";
		nameInput.style.left = "380px";
		nameInput.style.top = "20px";
		nameInput.style.width = "calc(100% - 396px)";
		nameInput.style.maxWidth = "300px";

		innerBox.append(nameLabel, nameInput);


		const smtpLabel = document.createElement("div");
		smtpLabel.textContent = "SMTP profile: ";
		smtpLabel.style.position = "absolute";
		smtpLabel.style.left = "270px";
		smtpLabel.style.top = "65px";

		const smtpInput = document.createElement("select");
		smtpInput.style.position = "absolute";
		smtpInput.style.left = "380px";
		smtpInput.style.top = "60px";
		smtpInput.style.width = "calc(100% - 396px)";
		smtpInput.style.maxWidth = "300px";

		innerBox.append(smtpLabel, smtpInput);


		const recipientsLabel = document.createElement("div");
		recipientsLabel.textContent = "Recipients: ";
		recipientsLabel.style.position = "absolute";
		recipientsLabel.style.left = "270px";
		recipientsLabel.style.top = "105px";

		const recipientsInput = document.createElement("input");
		recipientsInput.type = "text";
		recipientsInput.style.position = "absolute";
		recipientsInput.style.left = "380px";
		recipientsInput.style.top = "100px";
		recipientsInput.style.width = "calc(100% - 396px)";
		recipientsInput.style.maxWidth = "300px";
		
		innerBox.append(recipientsLabel, recipientsInput);


		const notifyLabel = document.createElement("div");
		notifyLabel.textContent = "Notify when: ";
		notifyLabel.style.position = "absolute";
		notifyLabel.style.left = "270px";
		notifyLabel.style.top = "145px";

		const notifyInput = document.createElement("select");
		notifyInput.style.position = "absolute";
		notifyInput.style.left = "380px";
		notifyInput.style.top = "140px";
		notifyInput.style.width = "calc(100% - 396px)";
		notifyInput.style.maxWidth = "300px";

		innerBox.append(notifyLabel, notifyInput);

		let notifyArray = ["Rise", "Fall", "Rise and fall"];
		for (let i = 0; i < notifyArray.length; i++) {
			const option = document.createElement("option");
			option.value = i;
			option.text = notifyArray[i];
			notifyInput.appendChild(option);
		}


		const watchersLabel = document.createElement("div");
		watchersLabel.textContent = "Watchers: ";
		watchersLabel.style.position = "absolute";
		watchersLabel.style.left = "270px";
		watchersLabel.style.top = "185px";

		const watchersList = document.createElement("div");
		watchersList.style.position = "absolute";
		watchersList.style.left = "380px";
		watchersList.style.top = "180px";
		watchersList.style.bottom = "8px";
		watchersList.style.width = "calc(100% - 396px)";
		watchersList.style.maxWidth = "300px";
		watchersList.style.margin = "2px";
		watchersList.style.border = "2px solid var(--clr-control)";
		watchersList.style.borderRadius = "4px";
		watchersList.style.overflowX = "hidden";
		watchersList.style.overflowY = "auto";

		innerBox.append(watchersLabel, watchersList);
		
		let notifications = {};
		let watchersCheckboxes = {};
		let selected = null;
		
		const AddNotification = name=> {
			const element = document.createElement("div");
			element.className = "list-element";
			notificationsList.appendChild(element);

			const label =  document.createElement("div");
			label.textContent = name.length===0 ? "unnamed notification" : name;
			label.style.color = name.length===0 ? "rgb(96,96,96)" : "var(--clr-dark)";
			label.style.fontStyle = name.length===0 ? "oblique" : "normal";
			label.style.lineHeight = "32px";
			label.style.paddingLeft = "4px";
			label.style.width = "calc(100% - 32px)";
			label.style.overflow = "hidden";
			label.style.textOverflow = "ellipsis";
			label.style.whiteSpace = "nowrap";
			
			const removeButton = document.createElement("div");
			removeButton.style.display = "none";
			removeButton.style.position = "absolute";
			removeButton.style.right = "2px";
			removeButton.style.top = "2px";
			removeButton.style.width = "28px";
			removeButton.style.height = "28px";
			removeButton.style.backgroundImage = "url(mono/delete.svg)";
			removeButton.style.backgroundSize = "24px 24px";
			removeButton.style.backgroundPosition = "center";
			removeButton.style.backgroundRepeat = "no-repeat";

			element.append(label, removeButton);

			const id = Math.random();

			let obj = {
				id: id,
				element: element,
				name: name,
				smtpprofile: smtpInput.childNodes.length === 0 ? null : smtpInput.childNodes[0].value,
				recipients: [],
				notify: 2,
				watchers: Object.values(this.watchers).map(o=>o.file)
			};

			notifications[id] = obj;
			
			element.onclick = ()=> {
				if (selected !== null && notifications[selected]) {
					notifications[selected].element.style.backgroundColor = "";
					notifications[selected].element.childNodes[1].style.display = "none";
				}

				selected = id;
				element.style.backgroundColor = "var(--clr-select)";
				removeButton.style.display = "initial";

				nameInput.value       = notifications[id].name;
				smtpInput.value       = notifications[id].smtpprofile;
				recipientsInput.value = notifications[id].recipients.join("; ");
				notifyInput.value     = notifications[id].notify;

				for (let file in watchersCheckboxes) {
					watchersCheckboxes[file].checked = false;
				}
				for (let i=0; i<notifications[id].watchers.length; i++) {
					watchersCheckboxes[notifications[id].watchers[i]].checked = true;
				}
			};

			removeButton.onclick = event=> {
				event.stopPropagation();
				delete notifications[id];
				selected = null;
				notificationsList.removeChild(element);
			};

			return {
				element: element,
				id: id
			};
		};

		nameInput.oninput = nameInput.onchange = ()=>{
			if (selected === null) return;

			notifications[selected].name = nameInput.value;

			if (nameInput.value.length === 0) {
				notifications[selected].element.childNodes[0].textContent = "unnamed notification";
				notifications[selected].element.childNodes[0].style.color = "rgb(96,96,96)";
				notifications[selected].element.childNodes[0].style.fontStyle = "oblique";
			}
			else {
				notifications[selected].element.childNodes[0].textContent = nameInput.value;
				notifications[selected].element.childNodes[0].style.color = "var(--clr-dark)";
				notifications[selected].element.childNodes[0].style.fontStyle = "normal";
			}
		};

		smtpInput.onchange = ()=>{
			if (selected === null) return;
			notifications[selected].smtpprofile = smtpInput.value;
		};

		recipientsInput.onchange = ()=> {
			if (selected === null) return;
			notifications[selected].recipients = recipientsInput.value.split(";").map(o=> o.trim());
		};

		notifyInput.onchange = ()=> {
			if (selected === null) return;
			notifications[selected].notify = notifyInput.value;
		};
		
		newButton.onclick = ()=> {
			const newElement = AddNotification("").element;
			newElement.onclick();
		};

		saveButton.onclick = async ()=> {
			let array = [];
			for (let id in notifications) {
				array.push({
					name        : notifications[id].name,
					smtpprofile : notifications[id].smtpprofile,
					recipients  : notifications[id].recipients,
					notify      : parseInt(notifications[id].notify),
					watchers    : notifications[id].watchers,
				});
			}

			try {
				const response = await fetch("notifications/save", {
					method: "POST",
					body: JSON.stringify(array)
				});
	
				if (response.status !== 200) return;

				const json = await response.json();
				if (json.error) throw(json.error);
			}
			catch (ex){
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 200);
			}
			
			dialog.Close();
		};
		
		const responses = await Promise.all([
			fetch("config/smtpprofiles/list"),
			fetch("notifications/list")
		]);

		const smtpJson = await responses[0].json();
		const notificationJson = await responses[1].json();

		for (let i = 0; i < smtpJson.length; i++) {
			const option = document.createElement("option");
			option.value = smtpJson[i].guid;
			option.text = smtpJson[i].username;
			smtpInput.appendChild(option);
		}

		for (let file in this.watchers) {
			const watcher = document.createElement("div");
			watcher.className = "list-element";
			watchersList.appendChild(watcher);

			const check = document.createElement("input");
			check.type = "checkbox";
			check.checked = true;
			watcher.appendChild(check);
			const toggle = this.AddCheckBoxLabel(watcher, check, this.watchers[file].name);
			toggle.style.left = "8px";
			toggle.style.top = "5px";

			watchersCheckboxes[file] = check;

			check.onchange = ()=> {
				if (selected === null) return;
				
				notifications[selected].watchers = [];
				for (let file2 in watchersCheckboxes) {
					if (!watchersCheckboxes[file2].checked) continue;
					notifications[selected].watchers.push(file2);
				}
			};
		}

		for (let i = 0; i < notificationJson.length; i++) {
			let obj = AddNotification(notificationJson[i].name);
			notifications[obj.id] = notificationJson[i];
			notifications[obj.id].element = obj.element;
			notifications[obj.id].id = obj.id;
		}

	}

	CreateWatcherElement(watcher) {
		const element = document.createElement("div");
		element.className = "list-element";

		const nameLabel = document.createElement("div");
		nameLabel.style.color = watcher.enable ? "var(--clr-light)" : "color-mix(in hsl, var(--clr-light), transparent)";
		nameLabel.textContent = watcher.name;

		const protocol = document.createElement("div");
		protocol.style.backgroundColor = watcher.enable ? "var(--clr-dark)" : "color-mix(in hsl, var(--clr-dark), transparent)";
		protocol.style.color = watcher.enable ? "var(--clr-light)" : "color-mix(in hsl, var(--clr-light), transparent)";
		protocol.textContent = watcher.type === "TCP" ? `TCP${watcher.port}` : watcher.type;

		const timeline = document.createElement("div");

		element.append(nameLabel, protocol, timeline);

		element.onclick = ()=> {
			for (let i=0; i<this.list.childNodes.length; i++) {
				this.list.childNodes[i].style.background = "";
			}
			element.style.backgroundColor = "rgb(80,80,80)";
			this.selected = watcher;
			this.selectedElement = element;

			this.Stats(watcher);
		};

		element.ondblclick = ()=> {
			this.selected = watcher;
			this.selectedElement = element;
			this.EditWatcher(watcher);
		};

		return element;
	}

	EditWatcher() {
		if (this.selected === null) return;
		const dialog = this.WatcherDialog(false);
	}

	DeleteWatcher() {
		if (this.selected === null) return;

		this.ConfirmBox("Are you sure you want to delete this watcher?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			try {
				const response = await fetch(`watchdog/delete?file=${this.selected.file}`);
				
				if (response.status !== 200) return;
				
				const json = await response.json();
				if (json.error) throw(json.error);
				
				this.list.removeChild(this.selectedElement);
				delete this.watchers[this.selected.file];
				this.selected = null;
				this.selectedElement = null;
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});
	}

	Stats(watcher) {
		this.stats.textContent = "";
		if (watcher === null) return;

		const CreateStatBox = (title, subtitle, value)=>{
			const box = document.createElement("div");
			this.stats.appendChild(box);
	
			const titleBox = document.createElement("div");
			titleBox.textContent = title;
			titleBox.style.fontSize = "larger";
			titleBox.style.fontWeight = "bold";
	
			const titleBox2 = document.createElement("div");
			titleBox2.textContent = subtitle;
			titleBox2.style.fontSize = "smaller";
	
			const valueBox = document.createElement("div");
			valueBox.textContent = value;
			valueBox.style.fontSize = "xx-large";
	
			box.append(titleBox, titleBox2, valueBox);
		};

		let today = this.cache[this.utcToday] ? this.cache[this.utcToday][watcher.file] ?? {} : {};
		let yesterday = this.cache[this.utcToday-Watchdog.DAY_TICKS] ? this.cache[this.utcToday-Watchdog.DAY_TICKS][watcher.file] ?? {} : {};

		let uptime24 = {...yesterday, ...today};
		let total, uptimeCount, totalRoundtrip, graphCounts, graphWidth;

		let barsCount = 0;
		let step = 100;
		while (barsCount < 8 && step > 4) {
			total = 0;
			uptimeCount = 0;
			totalRoundtrip = 0;
			graphCounts = {};
			graphWidth = 0;
			barsCount = 0;
			
			for (let time in uptime24) {
				if (time < Date.now() - Watchdog.DAY_TICKS) continue;

				let status = uptime24[time];
	
				if (status < 0) {
					if (!graphCounts[status]) {
						barsCount++;
						graphWidth += 18;
					}
					graphCounts[status] = graphCounts[status] ? graphCounts[status] + 1 : 1;
				}
				else {
					uptimeCount++;
					totalRoundtrip += status;

					let index = Math.floor(status / step) * step;
					if (!graphCounts[index]) {
						barsCount++;
						graphWidth += 14;
					}
					graphCounts[index] = graphCounts[index] ? graphCounts[index] + 1 : 1;
				}

				total++;
			}

			step = Math.floor(step/2);
		}

		if (total === 0) {
			CreateStatBox("Uptime", "(24-hour)", "--");
		}
		else {
			CreateStatBox("Uptime", "(24-hour)", `${Math.round(uptimeCount * 1000 / total) / 10}%`);
		}

		if (watcher.type === "ICMP" || watcher.type === "TCP") {
			if (uptimeCount === 0) {
				CreateStatBox("Average roundtrip", "(24-hour)", "--");
			}
			else {
				CreateStatBox("Average roundtrip", "(24-hour)", `${Math.round(totalRoundtrip / uptimeCount)} ms`);
			}
		}

		if (total > 0) {
			const graphBox = document.createElement("div");
			graphBox.style.backgroundColor = "transparent";
			graphBox.style.boxShadow = "var(--clr-light) 0 0 0 2px inset";
			this.stats.appendChild(graphBox);

			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("width", 180);
			svg.setAttribute("height", 128);
			graphBox.appendChild(svg);

			let x = (180 - graphWidth) / 2;
			let maxH = 2, maxX = 0, negativeCount = 0;
			let graphSorted = Object.entries(graphCounts).sort((a,b)=> parseInt(a[0]) > parseInt(b[0]));

			for (let i=0; i<graphSorted.length; i++) {
				let key = parseInt(graphSorted[i][0]);
				if (key < 0) negativeCount++;
				if (maxX < key) maxX = key;
				if (maxH < graphSorted[i][1]) maxH = graphSorted[i][1];
			}

			for (let i=0; i<graphSorted.length; i++) {
				let key = parseInt(graphSorted[i][0]);
				let h = Math.max(graphSorted[i][1] * 64 / maxH, 2);

				const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
				bar.setAttribute("x", x);
				bar.setAttribute("y", 72 - h);
				bar.setAttribute("width", 11);
				bar.setAttribute("height", h);
				bar.setAttribute("rx", 2);
				bar.setAttribute("fill", this.StatusToColor(key));
				svg.appendChild(bar);

				const lbllabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
				lbllabel.textContent = this.StatusToString(key, watcher);
				lbllabel.setAttribute("x", x);
				lbllabel.setAttribute("y", 70);
				lbllabel.setAttribute("fill", this.StatusToColor(key));
				lbllabel.setAttribute("font-size", "11px");
				lbllabel.style.transformOrigin = `${x-1}px ${74}px`;
				lbllabel.style.transform = "rotate(90deg)";
				svg.appendChild(lbllabel);

				x += key < 0 ? 18 : 14;
			}
		}
	}

	Seek() {
		this.DrawTimeline();

		const daysInViewport = Math.round(this.timeline.offsetWidth / this.dayPixels);
		const high = this.utcToday + Watchdog.DAY_TICKS;
		const low = this.utcToday - (this.offset - this.offset % this.dayPixels) / this.dayPixels * Watchdog.DAY_TICKS - daysInViewport * Watchdog.DAY_TICKS;

		let delta = this.offset / this.dayPixels;
		if (delta > 1) {
			let today = new Date(this.utcToday);
			let todayString = `${today.getFullYear()}${`${today.getMonth()+1}`.padStart(2,"0")}${`${today.getDate()}`.padStart(2,"0")}`;
			if (!this.cache.hasOwnProperty(today.getTime())) { this.cache[today.getTime()] = {}; }
			for (let file in this.watchers) {
				this.GetWatcher(today.getTime(), file, todayString);
			}
		}
		if (delta > 2) {
			let yesterday = new Date(this.utcToday - Watchdog.DAY_TICKS);
			let yesterdayString = `${yesterday.getFullYear()}${`${yesterday.getMonth()+1}`.padStart(2,"0")}${`${yesterday.getDate()}`.padStart(2,"0")}`;
			if (!this.cache.hasOwnProperty(yesterday.getTime())) { this.cache[yesterday.getTime()] = {}; }
			for (let file in this.watchers) {
				this.GetWatcher(yesterday.getTime(), file, yesterdayString);
			}
		}

		for (let date = low; date < high; date += Watchdog.DAY_TICKS) {
			let right = (this.utcToday - date) / Watchdog.DAY_TICKS * this.dayPixels - this.offset;
			if (right < -this.dayPixels*2) break;

			let day = new Date(date);
			let dayString = `${day.getFullYear()}${`${day.getMonth()+1}`.padStart(2,"0")}${`${day.getDate()}`.padStart(2,"0")}`;

			if (!this.cache.hasOwnProperty(date)) { this.cache[date] = {}; }

			for (let file in this.watchers) {
				if (this.cache[date].hasOwnProperty(file)) {
					this.DrawWatcher(this.watchers[file]);
					continue;
				}
				this.GetWatcher(date, file, dayString);
			}
		}
	}

	async GetWatcher(date, file, dayString) {
		if (!this.cache[date].hasOwnProperty(file)) { this.cache[date][file] = null; }

		const response = await fetch(`watchdog/view?date=${dayString}&file=${file}`);
		const buffer = await response.arrayBuffer();
		const bytes = new Uint8Array(buffer);

		if (this.cache[date][file] === null) { this.cache[date][file] = {}; }

		for (let i=0; i<bytes.length-9; i+=10) {
			const timeBuffer = new Uint8Array(bytes.slice(i,i+8)).buffer;
			const time = Number(new DataView(timeBuffer).getBigInt64(0, true));

			let status = (bytes[i+9] << 8) | bytes[i+8];
			if (status >= 32768) { //negative number
				status = -(65536 - status);
			}

			this.cache[date][file][time] = status;
		}

		this.DrawWatcher(this.watchers[file]);
	}

	DrawWatcher(watcher) {
		let previous = {};
		for (let i = 0; i < watcher.element.childNodes[2].childNodes.length; i++) {
			if (!watcher.element.childNodes[2].childNodes[i].getAttribute("date")) continue;
			previous[watcher.element.childNodes[2].childNodes[i].getAttribute("date")] = watcher.element.childNodes[2].childNodes[i];
		}

		watcher.element.childNodes[2].textContent = "";

		const daysInViewport = Math.round(this.timeline.offsetWidth / this.dayPixels);
		const high = this.utcToday + Watchdog.DAY_TICKS;
		const low = this.utcToday - (this.offset - this.offset % this.dayPixels) / this.dayPixels * Watchdog.DAY_TICKS - (daysInViewport+1) * Watchdog.DAY_TICKS;
		
		for (let date = low; date < high; date += Watchdog.DAY_TICKS) {
			let right = (this.utcToday - date) / Watchdog.DAY_TICKS * this.dayPixels - this.offset;
			if (right <= -this.dayPixels) break;

			if (previous.hasOwnProperty(date) && date) {
				const svg = previous[date];
				svg.style.right = `${right}px`;
				watcher.element.childNodes[2].appendChild(svg);
			}
			else {
				const svg = this.GenerateWatcherSvg(date, watcher.file);
				svg.style.top = "0";
				svg.style.right = `${right}px`;
				watcher.element.childNodes[2].appendChild(svg);
			}
		}
	}

	GenerateWatcherSvg(date, file) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", this.dayPixels);
		svg.setAttribute("height", 32);

		if (this.cache.hasOwnProperty(date) && this.cache[date].hasOwnProperty(file)) {
			if (this.cache[date][file] === null) { return svg; }

			let lastX = -20, lastV = -20;
			for (let key in this.cache[date][file]) {
				key = parseInt(key);
				let value = this.cache[date][file][key];

				let x = (key - date + this.timezoneOffset) * this.dayPixels / Watchdog.DAY_TICKS - 3;

				if (x - lastX < 6 && lastV === value) continue;
				
				lastX = x;
				lastV = value;

				const dot = document.createElementNS("http://www.w3.org/2000/svg", "rect");
				dot.setAttribute("x", x);
				dot.setAttribute("y", 4);
				dot.setAttribute("width", 6);
				dot.setAttribute("height", 24);
				dot.setAttribute("rx", 2);
				dot.setAttribute("fill", this.StatusToColor(value));
				svg.appendChild(dot);
			}
		}

		if (this.timezonePixelOffset < 0) {
			const s1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			s1.setAttribute("x", this.dayPixels + this.timezonePixelOffset - 1);
			s1.setAttribute("y", 1);
			s1.setAttribute("width", 2);
			s1.setAttribute("height", 30);
			s1.setAttribute("fill", "rgb(128,128,128)");
			svg.appendChild(s1);
		}
		else if (this.timezonePixelOffset > 0) {
			const s1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			s1.setAttribute("x", this.timezonePixelOffset - 1);
			s1.setAttribute("y", 1);
			s1.setAttribute("width", 2);
			s1.setAttribute("height", 30);
			s1.setAttribute("fill", "rgb(128,128,128)");
			svg.appendChild(s1);
		}
		else {
			const s1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			s1.setAttribute("x", 0);
			s1.setAttribute("y", 1);
			s1.setAttribute("width", 1);
			s1.setAttribute("height", 30);
			s1.setAttribute("fill", "rgb(128,128,128)");
			svg.appendChild(s1);

			const s2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			s2.setAttribute("x", this.dayPixels-1);
			s2.setAttribute("y", 1);
			s2.setAttribute("width", 1);
			s2.setAttribute("height", 30);
			s2.setAttribute("fill", "rgb(128,128,128)");
			svg.appendChild(s2);
		}

		return svg;
	}

	StatusToString(status, watcher) {
		if (status === -1) {
			return "unreach.";
		}
		else if (status === -2) {
			return "expired";
		}
		else if (status === -3) {
			return "warning";
		}
		else if (status === -4) {
			return "not valid";
		}
		else if (status >=0) {
			switch (watcher.type) {
			case "ICMP" : return `${status}ms`;
			case "TCP"  : return `${status}ms`;
			case "DNS"  : return "resolved";
			case "TLS"  : return "valid";
			default     : return "OK";
			}
		}
	}

	StatusToColor(status) {
		if (status === -1) { //unreachable
			return "var(--clr-error)";
		}
		else if (status === -2) { //expired
			return "var(--clr-orange)";
		}
		else if (status === -3) { //warning
			return "var(--clr-warning)";
		}
		else if (status === -4) { //tls not yet valid
			return "rgb(0,162,232)";
		}
		else if (status >=0) { //alive
			return UI.PingColor(status);
		}
		else { //other
			return "rgb(128,128,128)";
		}
	}

	DrawTimeline() {
		this.timeline.textContent = "";

		const daysInViewport = Math.round(this.timeline.offsetWidth / this.dayPixels);
		const high = this.utcToday + Watchdog.DAY_TICKS*2;
		const low = this.utcToday - (this.offset - this.offset % this.dayPixels) / this.dayPixels * Watchdog.DAY_TICKS - (daysInViewport + 1) * Watchdog.DAY_TICKS;
		
		for (let date = low; date < high; date += Watchdog.DAY_TICKS) {
			let right = (this.utcToday - date - this.timezoneOffset) / Watchdog.DAY_TICKS * this.dayPixels - this.offset;
			if (right <= -this.dayPixels*2) break;

			const svg = this.GenerateTimelineSvg(new Date(date));
			svg.style.top = "0";
			svg.style.right = `${right}px`;
			this.timeline.appendChild(svg);
		}

		const gradientL = document.createElement("div");
		gradientL.style.position = "absolute";
		gradientL.style.background = "linear-gradient(to right,rgb(64,64,64),transparent)";
		gradientL.style.left = gradientL.style.top = "0";
		gradientL.style.width = "20px";
		gradientL.style.height = "40px";
		this.timeline.appendChild(gradientL);

		const gradientR = document.createElement("div");
		gradientR.style.position = "absolute";
		gradientR.style.background = "linear-gradient(to right,transparent,rgb(64,64,64))";
		gradientR.style.right = gradientR.style.top = "0";
		gradientR.style.width = "20px";
		gradientR.style.height = "40px";
		this.timeline.appendChild(gradientR);
	}

	GenerateTimelineSvg(date) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", this.dayPixels);
		svg.setAttribute("height", 40);

		for (let i = 0; i < 25; i++) {
			const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			dot.setAttribute("cx", i * this.dayPixels / 24);
			dot.setAttribute("cy", 36);
			dot.setAttribute("r", i % 2 === 0 ? 2 : 1);
			dot.setAttribute("fill", "#C0C0C0");
			svg.appendChild(dot);
		}

		if (this.dayPixels >= 120) {
			let lastX = 0;

			for (let i = this.dayPixels < 960 ? 2 : 1; i < 24; i++) {
				let x = i * this.dayPixels / 24;
				if (x - lastX < 40) continue;
				lastX = x;
				
				const lblTime = document.createElementNS("http://www.w3.org/2000/svg", "text");
				lblTime.textContent = `${i.toString().padStart(2, "0")}:00`;
				lblTime.setAttribute("x", x);
				lblTime.setAttribute("y", 26);
				lblTime.setAttribute("fill", "#C0C0C0");
				lblTime.setAttribute("text-anchor", "middle");
				lblTime.setAttribute("font-size", "10px");
				svg.appendChild(lblTime);
			}
		}

		const l0 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		l0.setAttribute("x", -9);
		l0.setAttribute("y", 11);
		l0.setAttribute("width", 18);
		l0.setAttribute("height", 3);
		l0.setAttribute("fill", "#C0C0C0");
		svg.appendChild(l0);
		const d0 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		d0.setAttribute("x", -9);
		d0.setAttribute("y", 11);
		d0.setAttribute("width", 18);
		d0.setAttribute("height", 18);
		d0.style = "stroke:#C0C0C0;stroke-width:2;fill:rgba(0,0,0,0)";
		svg.appendChild(d0);
		const n0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
		n0.textContent = date.getDate();
		n0.setAttribute("x", 0);
		n0.setAttribute("y", 25);
		n0.setAttribute("fill", "#C0C0C0");
		n0.setAttribute("font-size", "11px");
		n0.setAttribute("text-anchor", "middle");
		svg.appendChild(n0);

		if (date.getDate() === 1) {
			const m0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
			m0.textContent = date.toLocaleString(UI.regionalFormat, {month:"short"}).toUpperCase();
			m0.setAttribute("x", 0);
			m0.setAttribute("y", 7);
			m0.setAttribute("fill", "#C0C0C0");
			m0.setAttribute("font-size", "10px");
			m0.setAttribute("text-anchor", "middle");
			svg.appendChild(m0);
		}

		date.setDate(date.getDate() + 1);

		const l1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		l1.setAttribute("x", this.dayPixels - 9);
		l1.setAttribute("y", 11);
		l1.setAttribute("width", 18);
		l1.setAttribute("height", 3);
		l1.setAttribute("fill", "#C0C0C0");
		svg.appendChild(l1);
		const d1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		d1.setAttribute("x", this.dayPixels - 9);
		d1.setAttribute("y", 11);
		d1.setAttribute("width", 18);
		d1.setAttribute("height", 18);
		d1.style = "stroke:#C0C0C0;stroke-width:2;fill:rgba(0,0,0,0)";
		svg.appendChild(d1);
		const n1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
		n1.textContent = date.getDate();
		n1.setAttribute("x", this.dayPixels);
		n1.setAttribute("y", 25);
		n1.setAttribute("fill", "#C0C0C0");
		n1.setAttribute("font-size", "11px");
		n1.setAttribute("text-anchor", "middle");
		svg.appendChild(n1);

		if (date.getDate() === 1) {
			const m1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
			m1.textContent = date.toLocaleString(UI.regionalFormat, {month:"short"}).toUpperCase();
			m1.setAttribute("x", this.dayPixels);
			m1.setAttribute("y", 7);
			m1.setAttribute("fill", "#C0C0C0");
			m1.setAttribute("font-size", "10px");
			m1.setAttribute("text-anchor", "middle");
			svg.appendChild(m1);
		}

		return svg;
	}
}