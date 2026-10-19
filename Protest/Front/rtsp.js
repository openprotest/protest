"use strict";

class Rtsp extends Window {
	static DEFAULT_PORT = 554;
	static MAX_DECODE_QUEUE = 8; //frames waiting on the decoder, past it the decoder skips up to the next key frame
	static SILENT_DECODER_LIMIT = 60; //frames a decoder takes without a picture before the next configuration is tried
	static RECONNECT_DELAYS = [2, 5, 10, 20, 30];

	static MESSAGE_FRAME = 1;
	static FLAG_KEY_FRAME = 0x01;
	static FRAME_HEADER_LENGTH = 10;

	constructor(args) {
		super();

		this.args = args ?? Object.create(null);

		Window.AddCssDependencies("rtsp.css");

		const isRestored = this.args.autoconnect === false;
		delete this.args.autoconnect;

		//args are persisted when the session is stored, the password is kept out of them
		this.password = isRestored ? null : this.args.password ?? null;
		delete this.args.password;

		if (this.args.url) {
			const split = Rtsp.SplitCredentials(this.args.url);
			this.args.url = split.url;
			if (split.username !== null && !this.args.credential) {
				this.args.username = split.username;
				if (!isRestored) this.password = split.password;
			}
		}

		this.socket = null;
		this.decoder = null;
		this.decoderConfig = null;
		this.decoderSps = null;
		this.decodedFrames = 0;  //by the current configuration
		this.submittedFrames = 0;
		this.rejectedData = false; //a decoder took the configuration but failed on the frames
		this.candidates = null; //the decoder configurations this browser takes, in order of preference
		this.candidateIndex = 0;
		this.selectingDecoder = false;
		this.pendingFrames = [];
		this.codec = null;
		this.connectionId = 0;
		this.streamInfo = null;
		this.playing = false;
		this.failed = false;
		this.closing = false;
		this.error = null;
		this.authenticationFailed = false;
		this.waitingForKey = true;
		this.decodingJpeg = false;
		this.pendingImage = null;
		this.renderHandle = 0;
		this.hasPicture = false;
		this.autoReconnect = false;
		this.reconnectAttempt = 0;
		this.reconnectTimeout = null;
		this.scaleToFit = true;
		this.stats = { frames:0, bytes:0, dropped:0, fps:0, bitrate:0 };
		this.serverStats = { lost:0, dropped:0 }; //packets the camera never delivered, frames the gateway held back

		this.SetTitle("RTSP");
		this.SetIcon("mono/playback.svg");

		this.SetupToolbar();
		this.connectButton    = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.AddToolbarSeparator();
		this.fitButton        = this.AddToolbarButton("Fit to window", "mono/fittoscreen.svg?light");
		this.fullScreenButton = this.AddToolbarButton("Full screen", "mono/fullscreen.svg?light");
		this.snapshotButton   = this.AddToolbarButton("Save snapshot", "mono/download.svg?light");
		this.AddToolbarSeparator();
		this.infoButton       = this.AddToolbarButton("Stream info", "mono/info.svg?light");

		this.canvasBox = document.createElement("div");
		this.canvasBox.className = "rtsp-canvas-box rtsp-fit";
		this.content.appendChild(this.canvasBox);

		this.canvas = document.createElement("canvas");
		this.canvas.width = 0;
		this.canvas.height = 0;
		this.canvasBox.appendChild(this.canvas);
		this.context = this.canvas.getContext("2d");

		this.statusBox = document.createElement("div");
		this.statusBox.className = "rtsp-status-box";

		this.infoBox = document.createElement("div");
		this.infoBox.className = "rtsp-info-box";
		this.content.appendChild(this.infoBox);

		//RTSPS behind a certificate that didn't validate is encrypted, but who's on the other end isn't confirmed
		this.certificateWarning = document.createElement("div");
		this.certificateWarning.className = "rtsp-certificate-warning";
		this.certificateWarning.textContent = "Certificate not verified";
		this.certificateWarning.onclick = ()=> {
			if (this.infoBox.style.display !== "grid") this.ToggleInfo();
		};
		this.content.appendChild(this.certificateWarning);

		this.connectButton.onclick    = ()=> this.ConnectDialog();
		this.fitButton.onclick        = ()=> this.ToggleScaling();
		this.fullScreenButton.onclick = ()=> this.canvasBox.requestFullscreen();
		this.snapshotButton.onclick   = ()=> this.SaveSnapshot();
		this.infoButton.onclick       = ()=> this.ToggleInfo();

		this.fitButton.style.borderBottom = "3px solid rgb(192,192,192)";

		this.statsInterval = setInterval(()=> this.UpdateStats(), 1000);

		//without a stream path the dialog asks for one first
		if (this.args.url && !isRestored && Rtsp.HasPath(this.args.url)) {
			this.Connect();
		}
		else {
			this.ConnectDialog(true);
		}
	}

	Connect() {
		const url = this.args.url;
		if (!url) return;

		const connectionId = ++this.connectionId;

		this.Disconnect();
		clearTimeout(this.reconnectTimeout);

		this.error = null;
		this.failed = false;
		this.authenticationFailed = false;
		this.stats.dropped = 0;
		this.serverStats = { lost:0, dropped:0 };
		this.connectButton.disabled = true;
		this.SetTitle(`RTSP - ${Rtsp.HostOf(url)}`);
		this.ShowStatus("mono/connect.svg", "Connecting...");

		let received = false;

		const socket = new WebSocket(`${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/rtsp`);
		socket.binaryType = "arraybuffer";
		this.socket = socket;

		socket.onopen = ()=> {
			const request = { url:url };
			if (this.args.credential) {
				request.credential = this.args.credential;
			}
			else if (this.args.username) {
				request.username = this.args.username;
				request.password = this.password ?? "";
			}
			socket.send(JSON.stringify(request));
		};

		socket.onmessage = event=> {
			if (connectionId !== this.connectionId) return;
			received = true;

			if (typeof event.data === "string") {
				this.OnControlMessage(event.data);
			}
			else {
				this.OnFrameMessage(event.data);
			}
		};

		socket.onclose = ()=> {
			if (connectionId !== this.connectionId) return;
			if (!received && !this.error) this.error = "Failed to reach the Pro-test server";
			this.OnClosed();
		};
	}

	Disconnect() {
		this.playing = false;

		if (this.socket) {
			const socket = this.socket;
			this.socket = null;
			socket.onmessage = null;
			socket.onclose = null;
			try { socket.close(); } catch {}
		}

		this.CloseDecoder();
		this.codec = null;
		this.streamInfo = null;
		this.waitingForKey = true;
		this.certificateWarning.style.display = "none";
	}

	UpdateCertificateWarning() {
		const info = this.streamInfo;
		const unverified = info?.secure === true && info.verified === false;
		this.certificateWarning.style.display = unverified ? "block" : "none";
		if (unverified) {
			this.certificateWarning.title = `The connection to the camera is encrypted, but its certificate couldn't be verified, so the camera's identity isn't confirmed. Certificate: ${info.certificate ?? "unknown"}, thumbprint: ${info.thumbprint ?? "unknown"}.`;
		}
	}

	OnControlMessage(text) {
		let message;
		try {
			message = JSON.parse(text);
		}
		catch {
			return;
		}

		if (message.error) {
			this.error = message.error;
			if (message.authentication) this.authenticationFailed = true;
		}
		else if (message.stream) {
			this.streamInfo = message.stream;
			this.UpdateCertificateWarning();
			this.playing = true;
			this.autoReconnect = true;
			this.reconnectAttempt = 0;
			if (!this.hasPicture) this.ShowStatus("mono/connect.svg", "Waiting for a key frame...");
			this.UpdateInfo();
		}
		else if (message.codec) {
			this.Configure(message.codec);
		}
		else if (message.stats) {
			this.serverStats = message.stats;
			this.UpdateInfo();

			//every frame so far was unreadable, as encrypted payloads are
			if (!this.codec && this.decodedFrames === 0 && this.serverStats.dropped >= 100) {
				this.ShowStatus("mono/warning.svg", "The camera's frames can't be read, the stream may be encrypted (SRTP)");
			}
		}
	}

	OnClosed() {
		this.socket = null;
		this.playing = false;
		this.CloseDecoder();
		this.connectButton.disabled = false;

		if (this.closing || this.failed) return;

		if (this.authenticationFailed) {
			this.autoReconnect = false;
			this.ShowStatus("mono/error.svg", this.error);
			this.PromptCredentials(`${this.error}. Please try again.`);
			return;
		}

		//once a stream has played, the viewer keeps trying to get it back, as a camera comes back after a reboot
		if (this.autoReconnect) {
			const delay = Rtsp.RECONNECT_DELAYS[Math.min(this.reconnectAttempt, Rtsp.RECONNECT_DELAYS.length - 1)];
			this.reconnectAttempt++;
			this.ShowStatus("mono/disconnect.svg", `${this.error ?? "Connection lost"}, reconnecting in ${delay}s...`);
			this.reconnectTimeout = setTimeout(()=> this.Connect(), delay * 1000);
			return;
		}

		this.ShowStatus(this.error ? "mono/error.svg" : "mono/disconnect.svg", this.error ?? "Connection closed");
	}

	//stops for good, retrying wouldn't help
	Fail(message) {
		this.failed = true;
		this.autoReconnect = false;
		this.error = message;
		this.ShowStatus("mono/error.svg", message);

		if (this.socket) {
			const socket = this.socket;
			this.socket = null;
			socket.onmessage = null;
			socket.onclose = null;
			try { socket.close(); } catch {}
		}

		this.playing = false;
		this.CloseDecoder();
		this.connectButton.disabled = false;
	}

	Configure(codec) {
		this.CloseDecoder();
		this.codec = codec;
		this.candidates = null;
		this.candidateIndex = 0;
		this.decoderConfig = null;
		this.decoderSps = null;
		this.selectingDecoder = false;
		this.pendingFrames = [];
		this.waitingForKey = true;
		this.UpdateInfo();

		if (codec === "jpeg") return;

		if (typeof VideoDecoder === "undefined") {
			this.Fail(window.isSecureContext
				? "This browser can't decode video streams"
				: `${Rtsp.CodecName(codec)} video decodes only over a secure connection, open Pro-test over HTTPS`);
		}
	}

	//The decoder is picked on the first key frame, out of the configurations this browser takes. Browsers differ,
	//some decode the Annex B stream as it comes, some only in software, some only with the parameter sets out of band.
	async SelectDecoder(keyFrame) {
		this.selectingDecoder = true;
		const codec = this.codec;
		const connectionId = this.connectionId;

		const supported = [];
		const report = [];
		for (const config of Rtsp.DecoderConfigurations(codec, keyFrame)) {
			let result;
			try {
				result = (await VideoDecoder.isConfigSupported(config)).supported;
			}
			catch (ex) {
				result = ex.message;
			}
			report.push(`${Rtsp.DescribeConfiguration(config)}: ${result}`);
			if (result === true) supported.push(config);
		}

		if (connectionId !== this.connectionId || codec !== this.codec) return;

		this.selectingDecoder = false;
		this.candidates = supported;
		this.candidateIndex = 0;
		this.decodedFrames = 0;
		this.submittedFrames = 0;
		this.rejectedData = false;

		if (supported.length === 0) {
			console.error(`RTSP: no decoder for ${codec}\n${report.join("\n")}`);
			this.Fail(Rtsp.UnsupportedMessage(codec));
			return;
		}

		const pending = this.pendingFrames;
		this.pendingFrames = [];
		for (const frame of pending) {
			this.DecodeFrame(frame.key, frame.timestamp, frame.data);
		}
	}

	//the next configuration that configures, on a key frame
	CreateDecoder(keyFrame) {
		while (this.candidateIndex < this.candidates.length) {
			let config = this.candidates[this.candidateIndex];
			let sps = null;

			if (config.description) { //from the parameter sets of this key frame, they may have changed
				const units = Rtsp.SplitNalUnits(keyFrame);
				sps = units.find(o=> (o[0] & 0x1F) === 7) ?? null;
				const pps = units.find(o=> (o[0] & 0x1F) === 8);
				if (sps && pps) config = { ...config, description:Rtsp.AvcConfigurationRecord(sps, pps) };
			}

			const decoder = new VideoDecoder({
				output: frame=> this.OnDecodedFrame(frame, decoder),
				error : ex=> this.OnDecoderError(ex, decoder)
			});

			try {
				decoder.configure(config);
				this.decoder = decoder;
				this.decoderConfig = config;
				this.decoderSps = sps ? sps.slice() : null;
				return;
			}
			catch (ex) {
				try { decoder.close(); } catch {}
				console.warn(`RTSP: ${Rtsp.DescribeConfiguration(config)} failed to configure, ${ex.message}`);
				this.candidateIndex++;
				this.decodedFrames = 0;
				this.submittedFrames = 0;
			}
		}

		this.Fail(this.DecoderFailureMessage());
	}

	//the configuration doesn't work in this browser after all, the next one starts on the next key frame
	NextDecoder(reason, rejectedData) {
		console.warn(`RTSP: ${Rtsp.DescribeConfiguration(this.decoderConfig)} ${reason}`);
		if (rejectedData) this.rejectedData = true;
		this.CloseDecoder();
		this.waitingForKey = true;
		this.candidateIndex++;
		this.decodedFrames = 0;
		this.submittedFrames = 0;
		if (this.candidateIndex >= this.candidates.length) this.Fail(this.DecoderFailureMessage());
	}

	//a decoder that took the configuration and then failed on the frames points at the stream rather than the browser
	DecoderFailureMessage() {
		if (this.rejectedData) return `The video can't be decoded (${this.codec}), the stream may be encrypted (SRTP) or damaged`;
		return Rtsp.UnsupportedMessage(this.codec);
	}

	CloseDecoder() {
		if (!this.decoder) return;
		const decoder = this.decoder;
		this.decoder = null;
		try { decoder.close(); } catch {}
	}

	OnFrameMessage(buffer) {
		if (buffer.byteLength < Rtsp.FRAME_HEADER_LENGTH) return;

		const view = new DataView(buffer);
		if (view.getUint8(0) !== Rtsp.MESSAGE_FRAME) return;

		const key = (view.getUint8(1) & Rtsp.FLAG_KEY_FRAME) !== 0;
		const timestamp = Math.round(view.getFloat64(2));
		const data = new Uint8Array(buffer, Rtsp.FRAME_HEADER_LENGTH);

		this.stats.frames++;
		this.stats.bytes += data.byteLength;

		if (this.failed || !this.codec) return;

		if (this.codec === "jpeg") {
			this.DecodeJpeg(data);
			return;
		}

		//the decoder is picked on the first key frame, what arrives meanwhile waits for it
		if (!this.candidates) {
			if (key) {
				this.pendingFrames = [];
			}
			else if (this.pendingFrames.length === 0 || this.pendingFrames.length > 300) {
				this.pendingFrames = [];
				this.stats.dropped++;
				return;
			}

			this.pendingFrames.push({ key:key, timestamp:timestamp, data:data });
			if (!this.selectingDecoder) this.SelectDecoder(data);
			return;
		}

		this.DecodeFrame(key, timestamp, data);
	}

	DecodeFrame(key, timestamp, data) {
		if (this.failed) return;

		if (!this.decoder) {
			if (!key) {
				this.stats.dropped++;
				return;
			}
			this.CreateDecoder(data);
			if (!this.decoder) return;
		}

		//decoding fell behind, the backlog is dropped and decoding resumes on the next key frame
		if (this.decoder.decodeQueueSize > Rtsp.MAX_DECODE_QUEUE) {
			this.CloseDecoder();
			this.waitingForKey = true;
			if (!key) {
				this.stats.dropped++;
				return;
			}
			this.CreateDecoder(data);
			if (!this.decoder) return;
		}

		if (this.waitingForKey && !key) {
			this.stats.dropped++;
			return;
		}

		let chunk = data;
		if (this.decoderConfig.description) { //length prefixed, the parameter sets go in the description instead
			const units = Rtsp.SplitNalUnits(data);

			if (key && !this.SameSps(units)) {
				this.CloseDecoder();
				this.CreateDecoder(data);
				if (!this.decoder) return;
			}

			chunk = Rtsp.ToLengthPrefixed(units.filter(o=> ![7, 8, 9].includes(o[0] & 0x1F)));
		}

		try {
			this.decoder.decode(new EncodedVideoChunk({ type:key ? "key" : "delta", timestamp:timestamp, data:chunk }));
			this.waitingForKey = false;
		}
		catch {
			this.CloseDecoder();
			this.waitingForKey = true;
			return;
		}

		//some decoders take the frames without a word and never return a picture
		if (++this.submittedFrames >= Rtsp.SILENT_DECODER_LIMIT && this.decodedFrames === 0) {
			this.NextDecoder(`returned no picture for ${this.submittedFrames} frames`, true);
		}
	}

	SameSps(units) {
		const sps = units.find(o=> (o[0] & 0x1F) === 7);
		if (!sps || !this.decoderSps) return true;
		return sps.length === this.decoderSps.length && sps.every((value, i)=> value === this.decoderSps[i]);
	}

	OnDecodedFrame(frame, decoder) {
		if (decoder !== this.decoder) {
			frame.close();
			return;
		}
		this.decodedFrames++;
		this.Present(frame);
	}

	//A corrupt frame closes the decoder, a new one starts on the next key frame. A configuration that never decoded
	//a frame doesn't work in this browser after all, then the next one is tried.
	OnDecoderError(ex, decoder) {
		if (decoder !== this.decoder) return;
		this.decoder = null;
		this.waitingForKey = true;

		if (ex?.name === "NotSupportedError" || this.decodedFrames === 0) {
			this.NextDecoder(`failed, ${ex?.name} ${ex?.message}`, ex?.name === "EncodingError");
		}
	}

	async DecodeJpeg(data) {
		if (this.decodingJpeg) { //the decoder is behind, this frame is skipped
			this.stats.dropped++;
			return;
		}

		this.decodingJpeg = true;
		const connectionId = this.connectionId;

		try {
			const bitmap = await createImageBitmap(new Blob([data], { type:"image/jpeg" }));
			if (connectionId === this.connectionId) {
				this.Present(bitmap);
			}
			else {
				bitmap.close();
			}
		}
		catch {
			this.stats.dropped++;
		}
		finally {
			this.decodingJpeg = false;
		}
	}

	//only the latest picture is drawn, on the next animation frame
	Present(image) {
		if (this.pendingImage) this.pendingImage.close();
		this.pendingImage = image;

		if (!this.renderHandle) {
			this.renderHandle = requestAnimationFrame(()=> this.Render());
		}
	}

	Render() {
		this.renderHandle = 0;

		const image = this.pendingImage;
		if (!image) return;
		this.pendingImage = null;

		const width = image.displayWidth ?? image.width;
		const height = image.displayHeight ?? image.height;

		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
			this.UpdateInfo();
		}

		this.context.drawImage(image, 0, 0, width, height);
		image.close();

		if (!this.hasPicture || this.statusBox.style.display !== "none") {
			this.hasPicture = true;
			this.HideStatus();
		}
	}

	ClearPicture() {
		if (this.pendingImage) {
			this.pendingImage.close();
			this.pendingImage = null;
		}
		this.canvas.width = 0;
		this.canvas.height = 0;
		this.hasPicture = false;
	}

	ShowStatus(icon, text) {
		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = `url(${icon})`;
		this.statusBox.textContent = text;
		this.statusBox.title = text;
		this.content.appendChild(this.statusBox);
	}

	HideStatus() {
		this.statusBox.style.display = "none";
	}

	UpdateStats() {
		this.stats.fps = this.stats.frames;
		this.stats.bitrate = this.stats.bytes * 8;
		this.stats.frames = 0;
		this.stats.bytes = 0;
		if (this.infoBox.style.display === "grid") this.UpdateInfo();
	}

	ToggleInfo() {
		const visible = this.infoBox.style.display !== "grid";
		this.infoBox.style.display = visible ? "grid" : "none";
		this.infoButton.style.borderBottom = visible ? "3px solid rgb(192,192,192)" : "none";
		if (visible) this.UpdateInfo();
	}

	UpdateInfo() {
		if (this.infoBox.style.display !== "grid") return;

		const rows = [["Address", this.args.url ?? ""]];
		const info = this.streamInfo;

		if (info) {
			rows.push(["Codec", this.codec && this.codec !== "jpeg" ? `${info.codec} (${this.codec})` : info.codec]);
			if (this.canvas.width > 0) rows.push(["Resolution", `${this.canvas.width} x ${this.canvas.height}`]);
			if (this.playing) {
				rows.push(["Frame rate", `${this.stats.fps} fps`]);
				rows.push(["Bit rate", Rtsp.FormatBitrate(this.stats.bitrate)]);
			}
			rows.push(["Dropped frames", String(this.stats.dropped + this.serverStats.dropped)]);
			rows.push(["Lost packets", String(this.serverStats.lost)]);
			rows.push(["Transport", info.secure ? "RTP over RTSPS (TLS)" : "RTP over RTSP (TCP)"]);
			rows.push(["Camera", info.address]);
			if (info.certificate) rows.push(["Certificate", `${info.certificate}${info.verified ? "" : " (not verified)"}`]);
			if (info.thumbprint) rows.push(["Thumbprint", info.thumbprint]);
			if (info.server) rows.push(["Server", info.server]);
			if (info.audio) rows.push(["Audio", `${info.audio}, not played`]);
		}

		this.infoBox.textContent = "";
		for (const [label, value] of rows) {
			const labelBox = document.createElement("div");
			labelBox.textContent = label;
			const valueBox = document.createElement("div");
			valueBox.textContent = value;
			this.infoBox.append(labelBox, valueBox);
		}
	}

	ToggleScaling() {
		this.scaleToFit = !this.scaleToFit;
		this.canvasBox.classList.toggle("rtsp-fit", this.scaleToFit);
		this.fitButton.style.borderBottom = this.scaleToFit ? "3px solid rgb(192,192,192)" : "none";
	}

	SaveSnapshot() {
		if (!this.hasPicture || this.canvas.width === 0) return;

		this.canvas.toBlob(blob=> {
			if (!blob) return;

			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;

			const host = Rtsp.HostOf(this.args.url) || "rtsp";
			const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
			link.download = `${host}_${stamp}.png`;

			document.body.appendChild(link);
			link.click();
			link.remove();

			setTimeout(()=> URL.revokeObjectURL(url), 1000);
		});
	}

	ConnectDialog(isNew=false) {
		const dialog = this.DialogBox("280px");
		if (dialog === null) return;

		//the user takes over, a pending reconnection is dropped
		clearTimeout(this.reconnectTimeout);

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;
		okButton.value = "Connect";

		const dialogBox = innerBox.parentElement;
		dialogBox.style.maxWidth = "520px";
		dialogBox.parentElement.onclick = event=> event.stopPropagation();

		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "100px minmax(50px, 380px)";
		innerBox.style.gridTemplateRows = "36px 8px repeat(3, 36px)";
		innerBox.style.alignItems = "center";
		innerBox.style.margin = "20px 20px 0 20px";

		const methodLabel = document.createElement("div");
		methodLabel.style.gridArea = "1 / 1";
		methodLabel.textContent = "Method:";
		const methodBox = new FewBox(["Manual", "Credentials"]);
		methodBox.Select(0);
		methodBox.container.style.gridArea = "1 / 2";
		innerBox.append(methodLabel, methodBox.container);

		const addressLabel = document.createElement("div");
		addressLabel.style.gridArea = "3 / 1";
		addressLabel.textContent = "Address:";
		const addressInput = document.createElement("input");
		addressInput.style.gridArea = "3 / 2";
		addressInput.type = "text";
		addressInput.placeholder = "rtsp://host:554/path";
		addressInput.spellcheck = false;
		addressInput.value = this.args.url ?? "";
		innerBox.append(addressLabel, addressInput);

		//without credentials the camera is asked anonymously, it asks for them if it needs them
		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "4 / 1";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "4 / 2";
		usernameInput.type = "text";
		usernameInput.placeholder = "Optional";
		usernameInput.value = this.args.credential ? "" : this.args.username ?? "";
		innerBox.append(usernameLabel, usernameInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.gridArea = "5 / 1";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.style.gridArea = "5 / 2";
		passwordInput.type = "password";
		passwordInput.placeholder = "Optional";
		passwordInput.value = this.args.credential ? "" : this.password ?? "";
		innerBox.append(passwordLabel, passwordInput);

		const credentialsLabel = document.createElement("div");
		credentialsLabel.style.gridArea = "4 / 1";
		credentialsLabel.textContent = "Credentials:";
		const credentialsInput = document.createElement("select");
		credentialsInput.style.gridArea = "4 / 2";
		innerBox.append(credentialsLabel, credentialsInput);

		const UpdateOkState = ()=> {
			const address = Rtsp.NormalizeAddress(addressInput.value) !== null;
			okButton.disabled = !address || (methodBox.index === 1 && !credentialsInput.value);
		};

		const UpdateSelection = ()=> {
			const manual = methodBox.index === 0;

			usernameLabel.style.display    = manual ? "initial" : "none";
			usernameInput.style.display    = manual ? "initial" : "none";
			passwordLabel.style.display    = manual ? "initial" : "none";
			passwordInput.style.display    = manual ? "initial" : "none";

			credentialsLabel.style.display = manual ? "none" : "initial";
			credentialsInput.style.display = manual ? "none" : "initial";

			UpdateOkState();
		};

		methodBox.container.onchange = UpdateSelection;

		const SelectVaultEntry = guid=> {
			methodBox.Select(1);
			credentialsInput.value = guid;
			UpdateSelection();
		};

		const listLoaded = (async ()=> {
			try {
				const response = await fetch("vault/credential/list");
				if (response.status === 200) {
					const json = await response.json();
					for (const item of json) {
						credentialsInput.append(new Option(item.name || item.username || item.guid, item.guid));
					}
				}
			}
			catch {}

			if (this.args.credential) {
				SelectVaultEntry(this.args.credential);
			}

			UpdateOkState();
		})();

		this.AddDropTarget(dialogBox, {
			accept     : [Window.DRAG_CREDENTIALS],
			text       : "Drop credentials here...",
			labelParent: buttonBox,
			tip        : "Drop key to auto-fill",
			onDrop     : async (format, guid)=> {
				await listLoaded;
				SelectVaultEntry(guid);
			}
		});

		//credentials typed into the address move to their own fields
		addressInput.onchange = ()=> {
			const split = Rtsp.SplitCredentials(Rtsp.NormalizeAddress(addressInput.value) ?? addressInput.value);
			if (split.username === null) return;
			addressInput.value = split.url;
			methodBox.Select(0);
			usernameInput.value = split.username;
			passwordInput.value = split.password;
			UpdateSelection();
		};

		okButton.onclick = ()=> {
			const split = Rtsp.SplitCredentials(Rtsp.NormalizeAddress(addressInput.value));
			if (split.url !== this.args.url) this.ClearPicture();
			this.args.url = split.url;

			if (methodBox.index === 0) {
				this.args.username = split.username ?? usernameInput.value.trim();
				this.password = split.username !== null ? split.password : passwordInput.value.length > 0 ? passwordInput.value : null;
				delete this.args.credential;
			}
			else {
				delete this.args.username;
				this.password = null;
				this.args.credential = credentialsInput.value;
			}

			if (!this.args.username) delete this.args.username;

			this.autoReconnect = false;
			this.reconnectAttempt = 0;

			dialog.Close();
			this.Connect();
		};

		if (isNew) {
			cancelButton.value = "Close";
			cancelButton.onclick = ()=> {
				dialog.Close();
				this.Close();
			};
		}

		addressInput.onkeydown = usernameInput.onkeydown = passwordInput.onkeydown = event=> {
			if (event.key !== "Enter" || okButton.disabled) return;
			addressInput.onchange();
			okButton.click();
		};

		addressInput.oninput = UpdateOkState;
		credentialsInput.onchange = UpdateOkState;

		UpdateSelection();
		setTimeout(()=> addressInput.focus(), 200);
	}

	PromptCredentials(text) {
		const dialog = this.DialogBox("200px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Connect";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "420px";
		innerBox.parentElement.parentElement.onclick = event=> event.stopPropagation();

		const message = document.createElement("div");
		message.textContent = text;
		message.style.paddingBottom = "16px";
		message.style.fontWeight = "600";

		const usernameLabel = document.createElement("div");
		usernameLabel.style.display = "inline-block";
		usernameLabel.style.minWidth = "88px";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.type = "text";
		usernameInput.style.width = "calc(100% - 120px)";
		usernameInput.value = this.args.credential ? "" : this.args.username ?? "";

		const passwordLabel = document.createElement("div");
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.minWidth = "88px";
		passwordLabel.style.marginTop = "8px";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.width = "calc(100% - 120px)";

		innerBox.append(message, usernameLabel, usernameInput, document.createElement("br"), passwordLabel, passwordInput);

		usernameInput.onkeydown = passwordInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.click();
		};

		okButton.onclick = ()=> {
			this.args.username = usernameInput.value.trim();
			this.password = passwordInput.value.length > 0 ? passwordInput.value : null;
			delete this.args.credential;
			if (!this.args.username) delete this.args.username;
			dialog.Close();
			this.Connect();
		};

		cancelButton.value = "Cancel";

		setTimeout(()=> {
			const input = usernameInput.value.length > 0 ? passwordInput : usernameInput;
			input.focus();
		}, 200);
	}

	//rtsp:// is assumed when the scheme is left out, null for anything that isn't an RTSP address
	static NormalizeAddress(value) {
		let address = (value ?? "").trim();
		if (address.length === 0) return null;
		if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) address = `rtsp://${address}`;

		let url;
		try {
			url = new URL(address);
		}
		catch {
			return null;
		}

		if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") return null;
		if (!url.hostname) return null;
		return url.href;
	}

	//the address without its credentials, username and password are null when it has none
	static SplitCredentials(address) {
		const none = { url:address, username:null, password:null };

		let url;
		try {
			url = new URL(address);
		}
		catch {
			return none;
		}

		if (!url.username && !url.password) return none;

		let username, password;
		try {
			username = decodeURIComponent(url.username);
			password = decodeURIComponent(url.password);
		}
		catch {
			username = url.username;
			password = url.password;
		}

		url.username = "";
		url.password = "";
		return { url:url.href, username:username, password:password };
	}

	static HasPath(address) {
		try {
			const url = new URL(address);
			return url.pathname.length > 1 || url.search.length > 0;
		}
		catch {
			return false;
		}
	}

	static HostOf(address) {
		try {
			return new URL(address).hostname;
		}
		catch {
			return "";
		}
	}

	static DecoderConfigurations(codec, keyFrame) {
		const configurations = [
			{ codec:codec, optimizeForLatency:true },
			{ codec:codec, optimizeForLatency:true, hardwareAcceleration:"prefer-software" }
		];

		if (codec.startsWith("avc1")) {
			const units = Rtsp.SplitNalUnits(keyFrame);
			const sps = units.find(o=> (o[0] & 0x1F) === 7);
			const pps = units.find(o=> (o[0] & 0x1F) === 8);
			if (sps && pps && sps.length >= 4) {
				configurations.push({ codec:codec, optimizeForLatency:true, description:Rtsp.AvcConfigurationRecord(sps, pps) });
			}

			//the profile and level are a hint, a decoder for High 5.1 takes any stream up to it
			if (codec !== "avc1.640033") configurations.push({ codec:"avc1.640033", optimizeForLatency:true });
		}
		else if (codec.startsWith("hev1") || codec.startsWith("hvc1")) {
			configurations.push({ codec:`${codec.startsWith("hev1") ? "hvc1" : "hev1"}${codec.substring(4)}`, optimizeForLatency:true });
		}

		return configurations;
	}

	static DescribeConfiguration(config) {
		if (!config) return "";
		const acceleration = config.hardwareAcceleration ? `, ${config.hardwareAcceleration}` : "";
		const format = config.description ? ", avcC" : ", Annex B";
		return `${config.codec}${format}${acceleration}`;
	}

	static UnsupportedMessage(codec) {
		return `This browser can't decode ${Rtsp.CodecName(codec)} video (${codec})`;
	}

	//the NAL units of an Annex B access unit, without their start codes
	static SplitNalUnits(data) {
		const units = [];
		let start = -1;

		for (let i = 0; i + 2 < data.length; i++) {
			if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 1) continue;
			if (start >= 0) units.push(data.subarray(start, data[i - 1] === 0 ? i - 1 : i));
			start = i + 3;
			i += 2;
		}

		if (start >= 0 && start < data.length) units.push(data.subarray(start));
		return units.filter(o=> o.length > 0);
	}

	static ToLengthPrefixed(units) {
		let size = 0;
		for (const unit of units) size += 4 + unit.length;

		const data = new Uint8Array(size);
		const view = new DataView(data.buffer);
		let offset = 0;
		for (const unit of units) {
			view.setUint32(offset, unit.length);
			data.set(unit, offset + 4);
			offset += 4 + unit.length;
		}
		return data;
	}

	//AVCDecoderConfigurationRecord, ISO/IEC 14496-15, with 4 byte lengths
	static AvcConfigurationRecord(sps, pps) {
		const record = new Uint8Array(11 + sps.length + pps.length);
		record.set([1, sps[1], sps[2], sps[3], 0xFF, 0xE1, sps.length >> 8, sps.length & 0xFF]);
		record.set(sps, 8);
		record.set([1, pps.length >> 8, pps.length & 0xFF], 8 + sps.length);
		record.set(pps, 11 + sps.length);
		return record;
	}

	static CodecName(codec) {
		if (codec?.startsWith("avc1")) return "H.264";
		if (codec?.startsWith("hev1") || codec?.startsWith("hvc1")) return "H.265";
		return codec ?? "";
	}

	static FormatBitrate(bits) {
		if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(2)} Mbps`;
		return `${Math.round(bits / 1000)} kbps`;
	}

	Close() { //overrides
		this.closing = true;
		clearTimeout(this.reconnectTimeout);
		clearInterval(this.statsInterval);
		if (this.renderHandle) cancelAnimationFrame(this.renderHandle);
		this.Disconnect();
		this.ClearPicture();
		super.Close();
	}
}
