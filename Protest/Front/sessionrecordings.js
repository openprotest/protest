"use strict";
class SessionRecordings extends List {
	constructor(args) {
		super(args);

		Window.AddCssDependencies("list.css");

		this.SetTitle(this.args.deviceName ? `Session recordings - ${this.args.deviceName}` : "Session recordings");
		this.SetIcon("mono/screenrecord.svg");

		this.defaultColumns = ["host", "username", "start", "duration"];
		this.SetupColumns(this.defaultColumns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.refreshButton = this.AddToolbarButton("Refresh", "mono/update.svg?light");
		this.openButton    = this.AddToolbarButton("Open", "mono/play.svg?light");
		this.AddToolbarSeparator();
		this.SetupFind();

		this.openButton.disabled = true;

		this.refreshButton.onclick = ()=> this.GetRecordings();
		this.openButton.onclick    = ()=> { if (this.args.select) this.Open(this.args.select); };

		this.GetRecordings();
	}

	async GetRecordings() {
		let url = "/recordings/list";
		if (this.args.device) url += `?device=${encodeURIComponent(this.args.device)}`;

		try {
			const response = await fetch(url);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			const data = Object.create(null);
			for (const rec of json) {
				data[rec.id] = {
					type:     { v: rec.protocol },
					protocol: { v: rec.protocol },
					host:     { v: `${rec.host}:${rec.port}` },
					username: { v: rec.username },
					start:    { v: rec.start },
					duration: { v: rec.durationMs },
					device:   { v: rec.device },
					status:   { v: rec.end ? "completed" : "recording" }
				};
			}

			this.link = { data: data, length: json.length };
			this.RefreshList();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	GetTypeIcon(type) { //overrides
		switch (type) {
		case "vnc":      return "mono/vnc.svg";
		case "ssh":      return "mono/ssh.svg";
		case "telnet":   return "mono/telnet.svg";
		case "winrm":    return "mono/remote.svg";
		case "serial":   return "mono/serialconsole.svg";
		case "terminal": return "mono/terminal.svg";
		default:         return "mono/screenrecord.svg";
		}
	}

	InflateElement(element, entry, type) { //overrides
		element.style.backgroundImage = `url(${this.GetTypeIcon(type)})`;

		for (let i = 0; i < this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in entry)) continue;

			const newAttr = document.createElement("div");
			element.appendChild(newAttr);

			switch (this.columnsElements[i].textContent) {
			case "host":     newAttr.textContent = entry["host"].v; break;
			case "username": newAttr.textContent = entry["username"].v; break;
			case "start":    newAttr.textContent = new Date(entry["start"].v).toLocaleString(); break;
			case "duration": newAttr.textContent = entry["status"].v === "recording" ? "recording..." : this.FormatDuration(entry["duration"].v); break;
			}

			if (i === 0) {
				newAttr.style.top = "5px";
				newAttr.style.left = "36px";
				newAttr.style.width = `calc(${this.columnsElements[0].style.width} - 36px)`;
				newAttr.style.whiteSpace = "nowrap";
				newAttr.style.overflow = "hidden";
				newAttr.style.textOverflow = "ellipsis";
			}
			else {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;
			}
		}

		element.onclick = ()=> {
			if (this.selected) this.selected.style.backgroundColor = "";

			this.args.select = element.id;

			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
			this.openButton.disabled = false;
		};

		element.ondblclick = ()=> this.Open(element.id);
	}

	FormatDuration(ms) {
		if (!ms) return "0:00";

		const totalSeconds = Math.floor(ms / 1000);
		const h = Math.floor(totalSeconds / 3600);
		const m = Math.floor((totalSeconds % 3600) / 60);
		const s = totalSeconds % 60;

		return h > 0
			? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
			: `${m}:${s.toString().padStart(2, "0")}`;
	}

	Open(id) {
		const entry = this.link?.data?.[id];
		if (!entry) return;

		const protocol = entry.protocol.v;

		switch (protocol) {
		case "vnc":
			new VncRecording({ recordingId: id });
			break;
		case "ssh":
		case "telnet":
		case "winrm":
		case "serial":
		case "terminal":
			new TerminalRecording({ recordingId: id, protocol: protocol });
			break;
		default:
			this.ConfirmBox("Playback for this protocol is not supported yet.", true, "mono/error.svg");
		}
	}
}
