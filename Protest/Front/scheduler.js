"use strict";
class Scheduler extends List {
	static JOB_ICONS = {
		"lifeline"     : "mono/lifeline.svg",
		"lastseen"     : "mono/lastseen.svg",
		"watchdog"     : "mono/watchdog.svg",
		"issues"       : "mono/issues.svg",
		"winevents"    : "mono/eventlogger.svg",
		"dataretention": "mono/dataretention.svg",
		"backup"       : "mono/backup.svg"
	};

	constructor(args) {
		super(args);

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		Window.AddCssDependencies("list.css");

		const columns = ["name", "status", {label:"enabled", render:d=> Scheduler.EnabledCell(d.enabled?.v)}, "interval", "lastrun"];
		this.SetupColumns(columns);

		this.columnsOptions.style.display = "none";

		this.SetTitle("Scheduler");
		this.SetIcon("mono/timeline.svg");

		this.list.style.overflowY = "auto";

		this.SetupToolbar();
		this.editButton = this.AddToolbarButton("Edit", "mono/edit.svg?light");
		this.runButton = this.AddToolbarButton("Run now", "mono/play.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.createButton = this.AddToolbarButton("Create task", "mono/add.svg?light");
		this.createButton.title = "Custom script jobs coming soon";

		this.editButton.onclick = ()=> this.EditDialog();
		this.runButton.onclick = ()=> this.RunSelectedJob();

		//clicks and keyboard navigation both select through the list box
		const onSelect = this.listBox.onSelect;
		this.listBox.onSelect = (id, element)=> {
			onSelect(id, element);
			this.UpdateButtons();
		};

		this.UpdateAuthorization();

		this.createButton.disabled = true;

		this.dataRetentionCategories = [
			{ key: "devicetimeline", label: "Device timeline",    icon: "mono/timeline.svg",     defaultDays: 365 },
			{ key: "usertimeline",   label: "User timeline",      icon: "mono/timeline.svg",     defaultDays: 365 },
			{ key: "lifeline",       label: "Lifeline",           icon: "mono/lifeline.svg",     defaultDays: 365 },
			{ key: "lastseen",       label: "Last seen",          icon: "mono/lastseen.svg",     defaultDays: 365 },
			{ key: "watchdog",       label: "Watchdog",           icon: "mono/watchdog.svg",     defaultDays: 90 },
			{ key: "syslog",         label: "Syslog",             icon: "mono/syslog.svg",       defaultDays: 90 },
			{ key: "snmptraps",      label: "SNMP traps",         icon: "mono/trap.svg",         defaultDays: 90 },
			{ key: "winevents",      label: "Windows events",     icon: "mono/eventlogger.svg",  defaultDays: 90 },
			{ key: "recordings",     label: "Session recordings", icon: "mono/screenrecord.svg", defaultDays: 30 },
			{ key: "logs",           label: "Logs",               icon: "mono/log.svg",          defaultDays: 90 },
		];

		this.ListJobs();
	}

	//a read-only switch, drawn like the toggle element, next to the text
	static EnabledCell(value) {
		const isOn = value === "Enabled";

		const cell = document.createElement("div");

		const track = document.createElement("div");
		track.style.display = "inline-block";
		track.style.verticalAlign = "middle";
		track.style.width = "32px";
		track.style.height = "18px";
		track.style.marginRight = "8px";
		track.style.borderRadius = "4px";
		track.style.backgroundColor = "rgb(96,96,96)";

		const knob = document.createElement("div");
		knob.style.width = "16px";
		knob.style.height = "14px";
		knob.style.margin = "2px";
		knob.style.borderRadius = "4px";
		knob.style.backgroundColor = isOn ? "var(--clr-accent)" : "var(--clr-control)";
		knob.style.boxShadow = "rgba(0,0,0,.5) 0 1px 1px";
		knob.style.transform = isOn ? "translateX(12px)" : "none";

		track.appendChild(knob);
		cell.append(track, document.createTextNode(value ?? ""));
		return cell;
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("scheduler:write");
		this.UpdateButtons();
		super.UpdateAuthorization();
	}

	UpdateButtons() {
		const job = this.GetSelectedJob();
		this.editButton.disabled = !this.canWrite || !job;
		this.runButton.disabled = !this.canWrite || !job?.runnable;
	}

	async ListJobs() {
		try {
			const response = await fetch("scheduler/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw (json.error);

			this.link = json;
			this.jobs = json.jobs ?? [];

			for (let key in this.link.data) {
				const element = document.createElement("div");
				element.id = key;
				element.className = "list-element";
				this.list.appendChild(element);

				this.InflateElement(element, this.link.data[key]);

				if (this.args.select && this.args.select === key) {
					this.selected = element;
					element.style.backgroundColor = "var(--clr-select)";
				}
			}

			this.UpdateButtons();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	InflateElement(element, entry) { //overrides
		const icon = Scheduler.JOB_ICONS[element.id.toLowerCase()] ?? "mono/task.svg";

		const iconBox = document.createElement("div");
		iconBox.className = "list-element-icon";
		iconBox.style.backgroundImage = `url(${icon})`;
		element.appendChild(iconBox);

		super.InflateElement(element, entry, null);

		if (!element.ondblclick) {
			element.ondblclick = event=> {
				event.stopPropagation();
				this.Entry_ondblclick(event);
			};
		}
	}

	Entry_ondblclick(event) {
		this.EditDialog();
	}

	GetSelectedJob() {
		if (!this.args.select) return null;
		return this.jobs?.find(j=> j.key === this.args.select) ?? null;
	}

	async RunSelectedJob() {
		const job = this.GetSelectedJob();
		if (!job?.runnable) return;

		this.runButton.disabled = true;

		try {
			const response = await fetch(`scheduler/run?key=${encodeURIComponent(job.key)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
		}
		catch (ex) {
			this.UpdateButtons();
			this.ConfirmBox(ex, true, "mono/error.svg");
			return;
		}

		this.RefreshJobs(job.key);
		this.WatchJob(job.key);
	}

	//refreshes the list once the job is no longer running
	async WatchJob(key) {
		for (let i=0; i<900; i++) {
			await new Promise(resolve=> setTimeout(resolve, 2000));
			if (!this.win.isConnected) return;

			try {
				const response = await fetch("scheduler/list");
				const json = await response.json();
				if (json.data?.[key]?.status?.v === "Running") continue;
			}
			catch {
				return;
			}

			this.RefreshJobs(this.args.select);
			return;
		}
	}

	async EditDialog() {
		const job = this.GetSelectedJob();
		if (!job) return;

		if (job.key === "dataretention") {
			await this.DataRetentionJobDialog(job);
		}
		else {
			this.SimpleJobDialog(job);
		}
	}

	SimpleJobDialog(job) {
		const dialog = this.DialogBox("220px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";

		innerBox.parentElement.style.maxWidth = "400px";

		innerBox.style.display = "grid";
		innerBox.style.margin = "20px";
		innerBox.style.gridTemplateColumns = "auto 100px";
		innerBox.style.gridTemplateRows = "repeat(2, 40px) auto";
		innerBox.style.alignItems = "center";

		const nameLabel = document.createElement("div");
		nameLabel.textContent = job.label;
		nameLabel.style.fontWeight = "600";
		nameLabel.style.gridColumn = "1 / 3";
		nameLabel.style.paddingLeft = "32px";
		nameLabel.style.lineHeight = "32px";
		innerBox.appendChild(nameLabel);

		nameLabel.style.backgroundSize = "24px 24px";
		nameLabel.style.backgroundPosition = "0 50%";
		nameLabel.style.backgroundRepeat = "no-repeat";
		nameLabel.style.backgroundImage = `url(${Scheduler.JOB_ICONS[job.key] ?? "mono/task.svg"})`;

		const enableBox = document.createElement("div");
		enableBox.style.gridColumn = "1 / 3";
		innerBox.appendChild(enableBox);
		const enableToggle = this.CreateToggle("Enable", job.enable, enableBox);

		let intervalInput = null;

		if (job.key !== "watchdog") {
			const intervalLabel = document.createElement("div");
			intervalLabel.textContent = "Every (hours):";
			innerBox.appendChild(intervalLabel);

			intervalInput = document.createElement("input");
			intervalInput.type = "number";
			intervalInput.min = 1;
			intervalInput.max = 8760;
			intervalInput.value = job.intervalHours > 0 ? job.intervalHours : 24;
			innerBox.appendChild(intervalInput);
		}

		okButton.onclick = async ()=> {
			try {
				const obj = {
					key: job.key,
					enable: enableToggle.checkbox.checked,
					intervalHours: intervalInput ? Math.max(parseInt(intervalInput.value), 1) : job.intervalHours
				};

				const response = await fetch("scheduler/save", {
					method: "POST",
					body: JSON.stringify(obj)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw json.error;

				this.RefreshJobs();
			}
			catch (ex) {
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 250);
			}

			dialog.Close();
		};

		setTimeout(()=>enableToggle.label.focus(), Window.ANIME_DURATION);
	}

	async DataRetentionJobDialog(job) {
		const dialog = this.DialogBox("560px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";

		innerBox.style.margin = "20px";

		const header = document.createElement("div");
		header.style.display = "grid";
		header.style.gridTemplateColumns = "auto 200px";
		header.style.alignItems = "center";
		header.style.marginBottom = "12px";
		innerBox.appendChild(header);

		const nameLabel = document.createElement("div");
		nameLabel.textContent = job.label;
		nameLabel.style.fontWeight = "600";
		nameLabel.style.gridColumn = "1 / 3";
		nameLabel.style.paddingLeft = "32px";
		nameLabel.style.lineHeight = "32px";
		innerBox.appendChild(nameLabel);

		nameLabel.style.backgroundSize = "24px 24px";
		nameLabel.style.backgroundPosition = "0 50%";
		nameLabel.style.backgroundRepeat = "no-repeat";
		nameLabel.style.backgroundImage = "url(mono/dataretention.svg)";

		const enableBox = document.createElement("div");
		enableBox.style.gridColumn = "1 / 3";
		header.appendChild(enableBox);
		const enableToggle = this.CreateToggle("Enable", job.enable, enableBox);

		const intervalLabel = document.createElement("div");
		intervalLabel.textContent = "Every (hours):";
		header.appendChild(intervalLabel);

		const intervalInput = document.createElement("input");
		intervalInput.type = "number";
		intervalInput.min = 1;
		intervalInput.max = 168;
		intervalInput.value = job.intervalHours > 0 ? job.intervalHours : 24;
		header.appendChild(intervalInput);

		const note = document.createElement("div");
		note.style.fontSize = "smaller";
		note.style.opacity = "0.8";
		note.style.marginBottom = "8px";
		note.textContent = "Permanently deletes historical data older than the chosen number of days for each selected category below. Runs align to the top of the hour (UTC). This cannot be undone.";
		innerBox.appendChild(note);

		const rows = [];
		const MIN_DAYS = 30;

		let settingsByKey = {};
		try {
			const response = await fetch("config/dataretention/settings/list");
			if (response.status === 200) {
				const json = await response.json();
				if (Array.isArray(json)) {
					for (const s of json) settingsByKey[s.key] = s;
				}
			}
		}
		catch (ex) {
			//fall back to defaults below
		}

		for (const category of this.dataRetentionCategories) {
			const setting = settingsByKey[category.key] ?? { enable: false, days: category.defaultDays };

			const row = document.createElement("div");
			row.style.display = "grid";
			row.style.gridTemplateColumns = "40px 1fr auto";
			row.style.alignItems = "center";
			row.style.columnGap = "8px";
			row.style.padding = "6px 0";
			innerBox.appendChild(row);

			const toggleBox = document.createElement("div");
			toggleBox.style.transform = "translateY(-16px)";
			row.appendChild(toggleBox);
			const toggle = this.CreateToggle("", setting.enable, toggleBox);

			const label = document.createElement("div");
			label.style.display = "flex";
			label.style.alignItems = "center";
			label.style.gap = "8px";
			const icon = document.createElement("div");
			icon.style.width = "20px";
			icon.style.height = "20px";
			icon.style.backgroundImage = `url(${category.icon})`;
			icon.style.backgroundSize = "20px 20px";
			icon.style.backgroundRepeat = "no-repeat";
			label.appendChild(icon);
			const text = document.createElement("span");
			text.textContent = category.label;
			label.appendChild(text);
			row.appendChild(label);

			const daysInput = document.createElement("input");
			daysInput.type = "number";
			daysInput.min = MIN_DAYS.toString();
			daysInput.value = Math.max(setting.days, MIN_DAYS);
			daysInput.style.width = "70px";
			row.appendChild(daysInput);

			rows.push({ category, toggle, daysInput });
		}

		okButton.onclick = async ()=> {
			try {
				const jobObj = {
					key: job.key,
					enable: enableToggle.checkbox.checked,
					intervalHours: Math.max(parseInt(intervalInput.value), 1)
				};

				const settingsArray = rows.map(r=> ({
					key: r.category.key,
					enable: r.toggle.checkbox.checked,
					days: Math.max(parseInt(r.daysInput.value) || MIN_DAYS, MIN_DAYS)
				}));

				const [jobResponse, settingsResponse] = await Promise.all([
					fetch("scheduler/save", { method: "POST", body: JSON.stringify(jobObj) }),
					fetch("config/dataretention/settings/save", { method: "POST", body: JSON.stringify(settingsArray) })
				]);

				if (jobResponse.status !== 200) LOADER.HttpErrorHandler(jobResponse.status);
				if (settingsResponse.status !== 200) LOADER.HttpErrorHandler(settingsResponse.status);

				const jobJson = await jobResponse.json();
				if (jobJson.error) throw jobJson.error;

				const settingsJson = await settingsResponse.json();
				if (settingsJson.error) throw settingsJson.error;

				this.RefreshJobs();
			}
			catch (ex) {
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 250);
			}

			dialog.Close();
		};

		setTimeout(()=>enableToggle.label.focus(), Window.ANIME_DURATION);
	}

	RefreshJobs(select=null) {
		this.list.textContent = "";
		this.selected = null;
		this.args.select = select;
		this.UpdateButtons();
		this.ListJobs();
	}
}
