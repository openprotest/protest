"use strict";
class TerminalRecording extends PtyHost {
	static SPEED_STEPS = [0.5, 1, 2, 4, 8, 16];

	constructor(args) {
		super(args ?? {});

		this.AddCssDependencies("recordingplayback.css");

		this.connectButton.disabled = true;
		this.sendKeyButton.disabled = true;
		this.pasteButton.disabled = true;

		if (this.term) {
			this.term.options.disableStdin = true;

			this.term.options.cursorBlink = false;
			this.term.options.cursorInactiveStyle = this.term.options.cursorStyle;
		}

		this.meta = null;
		this.durationMs = 0;
		this.currentMs = 0;
		this.playing = true;
		this.speed = 1;
		this.ended = false;

		this.controlSocket = null;

		this.SetTitle("Session recording");
		this.SetIcon("mono/screenrecord.svg");

		this.content.style.bottom = "72px";

		this.timelineBox = document.createElement("div");
		this.timelineBox.className = "vr-timeline";
		this.win.appendChild(this.timelineBox);

		this.timeLabel = document.createElement("div");
		this.timeLabel.className = "vr-time";
		this.timeLabel.textContent = "00:00 / 00:00";
		this.timelineBox.appendChild(this.timeLabel);

		this.speedLabel = document.createElement("div");
		this.speedLabel.className = "vr-speed-label";
		this.timelineBox.appendChild(this.speedLabel);

		this.track = document.createElement("div");
		this.track.className = "vr-track";
		this.track.style.cursor = "pointer";
		this.timelineBox.appendChild(this.track);

		this.progress = document.createElement("div");
		this.progress.className = "vr-progress";
		this.track.appendChild(this.progress);

		this.playhead = document.createElement("div");
		this.playhead.className = "vr-playhead";
		this.track.appendChild(this.playhead);

		this.track.addEventListener("pointerdown", event=> this.SeekFromClientX(event.clientX));

		const controlsRow = document.createElement("div");
		controlsRow.className = "vr-controls";
		this.timelineBox.appendChild(controlsRow);

		this.playPauseButton = document.createElement("button");
		this.playPauseButton.className = "vr-button";
		this.playPauseButton.style.backgroundImage = "url(mono/pause.svg)";
		this.timelineBox.appendChild(this.playPauseButton);

		this.rewindButton = document.createElement("button");
		this.rewindButton.className = "vr-button";
		this.rewindButton.style.backgroundImage = "url(mono/rewind.svg)";
		this.rewindButton.style.right = "40px";
		this.timelineBox.appendChild(this.rewindButton);

		this.fastForwardButton = document.createElement("button");
		this.fastForwardButton.className = "vr-button";
		this.fastForwardButton.style.backgroundImage = "url(mono/fastforward.svg)";
		this.fastForwardButton.style.right = "8px";
		this.timelineBox.appendChild(this.fastForwardButton);

		this.rewindButton.onclick      = ()=> this.StepSpeed(-1);
		this.playPauseButton.onclick   = ()=> this.ended ? this.RestartPlayback() : this.TogglePlayback();
		this.fastForwardButton.onclick = ()=> this.StepSpeed(1);

		this.UpdateSpeedDisplay();

		this._tickHandle = setInterval(()=> this.UpdateClockDisplay(), 200);

		this.Load();
	}

	async Load() {
		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = "url(mono/connect.svg)";
		this.statusBox.textContent = "Loading recording...";
		this.content.appendChild(this.statusBox);

		let meta;
		try {
			const response = await fetch(`/recordings/meta?protocol=${encodeURIComponent(this.args.protocol)}&id=${encodeURIComponent(this.args.recordingId)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			meta = await response.json();
			if (meta.error) throw meta.error;
		}
		catch (ex) {
			this.statusBox.textContent = "Failed to load recording";
			return;
		}

		this.meta = meta;
		this.durationMs = meta.durationMs || 0;
		this.args.host = meta.host;

		this.SetTitle(`${this.ProtocolLabel(meta.protocol)} recording - ${meta.host} (${new Date(meta.start).toLocaleString()})`);

		this.ConnectPlayback(0);
	}

	ProtocolLabel(protocol) {
		switch (protocol) {
		case "ssh":      return "SSH";
		case "telnet":   return "Telnet";
		case "winrm":    return "Remote shell";
		case "serial":   return "Serial console";
		case "terminal": return "Terminal";
		default:         return "Session";
		}
	}

	ConnectPlayback(startMs) {
		this.TeardownPlayback();

		this.currentMs = startMs;
		this.ended = false;
		this.term?.reset();

		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = "url(mono/connect.svg)";
		this.statusBox.textContent = "Loading recording...";
		this.content.appendChild(this.statusBox);

		const wsUrl = `${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/recordingplayback?protocol=${encodeURIComponent(this.args.protocol)}&id=${encodeURIComponent(this.args.recordingId)}&t=${Math.round(startMs)}`;
		const controlSocket = new WebSocket(wsUrl);
		controlSocket.binaryType = "arraybuffer";
		this.controlSocket = controlSocket;

		const decoder = new TextDecoder("utf-8");

		controlSocket.onopen = ()=> {
			if (this.controlSocket !== controlSocket) return;
			this.statusBox.style.display = "none";

			if (!this.playing) {
				controlSocket.send(JSON.stringify({ cmd: "pause" }));
			}
		};

		controlSocket.onclose = ()=> {
			if (this.controlSocket !== controlSocket) return;

			this.playing = false;
			this.ended = true;
			this.playPauseButton.style.backgroundImage = "url(mono/play.svg)";

			this.currentMs = this.durationMs;
			this.UpdateClockDisplay();
		};

		controlSocket.onerror = ()=> {};

		controlSocket.onmessage = e=> {
			if (this.controlSocket !== controlSocket) return;
			if (typeof e.data === "string") return;
			this.HandleMessage(decoder.decode(e.data));
		};
	}

	TeardownPlayback() {
		if (this.controlSocket) {
			try { this.controlSocket.close(); } catch { /* already closed */ }
			this.controlSocket = null;
		}
	}

	SendControl(obj) {
		if (this.controlSocket && this.controlSocket.readyState === WebSocket.OPEN) {
			this.controlSocket.send(JSON.stringify(obj));
		}
	}

	TogglePlayback() {
		this.playing = !this.playing;
		this.SendControl({ cmd: this.playing ? "play" : "pause" });
		this.playPauseButton.style.backgroundImage = this.playing ? "url(mono/pause.svg)" : "url(mono/play.svg)";
	}

	RestartPlayback() {
		this.playing = true;
		this.playPauseButton.style.backgroundImage = "url(mono/pause.svg)";
		this.ConnectPlayback(0);
	}

	StepSpeed(direction) {
		const steps = TerminalRecording.SPEED_STEPS;
		const index = steps.indexOf(this.speed);
		const nextIndex = Math.min(steps.length - 1, Math.max(0, index + direction));
		if (nextIndex === index) return;

		this.speed = steps[nextIndex];
		this.SendControl({ cmd: "speed", x: this.speed });
		this.UpdateSpeedDisplay();
	}

	UpdateSpeedDisplay() {
		const steps = TerminalRecording.SPEED_STEPS;
		this.speedLabel.textContent = this.speed === 1 ? "" : `${this.speed}x`;
		this.rewindButton.disabled = this.speed <= steps[0];
		this.fastForwardButton.disabled = this.speed >= steps[steps.length - 1];
	}

	SeekFromClientX(clientX) {
		if (!this.durationMs) return;

		const rect = this.track.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

		this.ConnectPlayback(ratio * this.durationMs);
		this.UpdateClockDisplay();
	}

	UpdateClockDisplay() {
		if (!this.durationMs) return;

		if (this.playing) {
			this.currentMs = Math.min(this.durationMs, this.currentMs + 200 * this.speed);
		}

		const ratio = Math.min(1, this.currentMs / this.durationMs);
		this.progress.style.width = `${ratio * 100}%`;
		this.playhead.style.left = `${ratio * 100}%`;
		this.timeLabel.textContent = `${this.FormatTime(this.currentMs)} / ${this.FormatTime(this.durationMs)}`;
	}

	FormatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}

	AfterResize() { //overrides
		this.content.style.bottom = "72px";
		super.AfterResize();
	}

	Close() { //overrides
		clearInterval(this._tickHandle);
		this.TeardownPlayback();
		super.Close();
	}
}
