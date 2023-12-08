class WebcamTester extends Window {
	constructor(params) {
		super();

		this.params = params ?? {
			force4K: false,
			audio: false
		};

		this.SetTitle("Webcam tester");
		this.SetIcon("mono/webcam.svg");

		this.recorder = null;
		this.recordChunks = [];

		this.SetupToolbar();
		this.recordButton = this.AddToolbarButton("Record", "mono/record.svg?light");
		this.startButton   = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton    = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.AddToolbarSeparator();
		this.settingsButton = this.AddToolbarButton("Settings", "mono/wrench.svg?light");
		this.controlButton = this.AddToolbarButton("Picture controls", "mono/personalize.svg?light");
		this.flipButton    = this.AddToolbarButton("Horizontal flip", "mono/horizontalflip.svg?light");

		this.stopButton.disabled = true;
		
		this.content.style.overflow = "hidden";

		this.videoFeedback = document.createElement("video");
		this.videoFeedback.style.width = "100%";
		this.videoFeedback.style.height = "100%";
		this.content.appendChild(this.videoFeedback);

		this.infoBox = document.createElement("div");
		this.infoBox.style.position = "absolute";
		this.infoBox.style.right = "8px";
		this.infoBox.style.bottom = "8px";
		this.infoBox.style.color = "var(--clr-light)";
		this.infoBox.style.textShadow = "black 0 0 2px";
		this.content.appendChild(this.infoBox);

		this.InitializePictureControls();
		
		this.recordButton.onclick = ()=> this.Record();
		this.startButton.onclick = ()=> this.Start();
		this.stopButton.onclick = ()=> this.Stop();

		this.settingsButton.onclick = ()=> this.Settings();

		let flipToggle = false;
		this.flipButton.onclick = ()=> {
			flipToggle = !flipToggle;
			this.videoFeedback.style.transform = flipToggle ? "rotateY(180deg)" : "none";
			this.flipButton.style.borderBottom = flipToggle ? "#c0c0c0 solid 3px" : "none";
		};

		let controlsToggle = false;
		this.controlButton.onclick = ()=> {
			controlsToggle = !controlsToggle;
			this.controlsBox.style.opacity   = controlsToggle ? "1" : "0";
			this.controlsBox.style.transform = controlsToggle ? "none" : "translateY(-150px)";
			this.controlButton.style.borderBottom = controlsToggle ? "#c0c0c0 solid 3px" : "none";
		};
	}

	Settings() {
		const dialog = this.DialogBox("150px");
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "20px 20px 0 20px";
		innerBox.parentElement.style.maxWidth = "480px";

		const chkForce4K = document.createElement("input");
		chkForce4K.type = "checkbox";
		innerBox.appendChild(chkForce4K);
		this.AddCheckBoxLabel(innerBox, chkForce4K, "Force 4K resolution").style.paddingBottom = "16px";

		innerBox.appendChild(document.createElement("br"));

		const chkAudio = document.createElement("input");
		chkAudio.type = "checkbox";
		innerBox.appendChild(chkAudio);
		this.AddCheckBoxLabel(innerBox, chkAudio, "Record audio").style.paddingBottom = "16px";

		innerBox.appendChild(document.createElement("br"));

		chkForce4K.checked = this.params.force4K;
		chkAudio.checked = this.params.audio;

		btnOK.onclick = async ()=> {
			this.params.force4K = chkForce4K.checked;
			this.params.audio = chkAudio.checked;
			dialog.Close();
		};
	}

	InitializePictureControls() {
		this.controlsBox = document.createElement("div");
		this.controlsBox.style.position = "absolute";
		this.controlsBox.style.top = "0";
		this.controlsBox.style.left = "0";
		this.controlsBox.style.width = "min(300px, 100%)";
		this.controlsBox.style.maxHeight = "100%";
		this.controlsBox.style.padding = "20px";
		this.controlsBox.style.borderRadius = "0 8px 8px 0";
		this.controlsBox.style.boxShadow = "rgba(0,0,0,.5) 2px 0 4px";
		this.controlsBox.style.color = "var(--clr-light)";
		this.controlsBox.style.backgroundColor = "#20202080";
		this.controlsBox.style.overflowY = "scroll";
		this.controlsBox.style.backdropFilter = "blur(12px)";
		this.controlsBox.style.opacity = "0";
		this.controlsBox.style.transform = "translateY(-150px)";
		this.controlsBox.style.transition = ".2s";
		this.content.appendChild(this.controlsBox);

		const CreateControl = (name, min, max, value, unit)=>{
			const nameBox = document.createElement("div");
			nameBox.textContent = `${name}:`;
			nameBox.style.margin = "16px 0 2px 0";
			nameBox.style.fontWeight = "600";

			const controlInput = document.createElement("input");
			controlInput.type = "range";
			controlInput.min = min;
			controlInput.max = max;
			controlInput.value = value;
			controlInput.style.width = "200px";

			const controlValue = document.createElement("div");
			controlValue.style.display = "inline-block";
			controlValue.style.paddingLeft = "8px";
			controlValue.style.fontWeight = "600";
			controlValue.textContent = `${value}${unit}`;
			this.controlsBox.append(nameBox, controlInput, controlValue);

			controlInput.addEventListener("input", ()=>{controlValue.textContent = `${controlInput.value}${unit}`});
			controlInput.addEventListener("change", ()=>{controlValue.textContent = `${controlInput.value}${unit}`});

			return controlInput;
		};

		const brightness = CreateControl("Brightness", 0, 200, 100, "%");
		this.controlsBox.appendChild(document.createElement("br"));

		const contrast = CreateControl("Contrast", 0, 200, 100, "%");
		this.controlsBox.appendChild(document.createElement("br"));

		const hue = CreateControl("Hue", -180, 180, 0, "°");
		this.controlsBox.appendChild(document.createElement("br"));

		const saturate = CreateControl("Saturate", 0, 200, 100, "%");
		this.controlsBox.appendChild(document.createElement("br"));

		const Update = ()=>{
			this.videoFeedback.style.filter = `brightness(${brightness.value}%) contrast(${contrast.value}%) hue-rotate(${hue.value}deg) saturate(${saturate.value}%)`;
		};

		brightness.oninput = brightness.onchange = ()=> Update();
		contrast.oninput = contrast.onchange = ()=> Update();
		hue.oninput = hue.onchange = ()=> Update();
		saturate.oninput = saturate.onchange = ()=> Update();
	}

	async Start(withRecording=false) {
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: this.params.audio ? {
					echoCancellation: true,
					noiseSuppression: true
				} : false,

				video: this.params.force4K ? {
					width: { ideal: 3840 },
					height: { ideal: 2160 }
				} : {
					width: { min: 640, ideal: 1920, max: 3840 },
					height: { min: 480, ideal: 1080, max: 2160 }
				}
			});
			
			const videoTrack = this.stream.getVideoTracks()[0];
			const videoSettings = videoTrack.getSettings();
			videoTrack.onended = ()=> this.Stop();

			this.videoFeedback.srcObject = this.stream;
			this.videoFeedback.play();

			this.infoBox.textContent = `${videoSettings.width} x ${videoSettings.height} @ ${Math.round(videoSettings.frameRate)}FPS`;

			if (withRecording) {
				this.recorder = new MediaRecorder(this.stream);
				this.recordChunks = [];

				this.recorder.ondataavailable = event=> this.recordChunks.push(event.data);
				this.recorder.onstop = ()=> this.HandleRecording();
				this.recorder.start();
			}

			this.startButton.disabled = true;
			this.stopButton.disabled = false;
			this.settingsButton.disabled = true;
		}
		catch (ex) {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
			this.settingsButton.disabled = false;
			setTimeout(() => this.ConfirmBox(ex, true, "mono/error.svg"), 400);
		}
	}

	Stop() {
		if (this.recorder) {
			this.recorder.stop();
		}

		if (this.stream) {
			const tracks = this.stream.getTracks();
			tracks.forEach(track => track.stop());
			this.videoFeedback.srcObject = null;
			this.stream = null;
		}

		this.infoBox.textContent = "";
		this.recordButton.disabled = false;
		this.startButton.disabled = false;
		this.stopButton.disabled = true;
		this.settingsButton.disabled = false;
	}

	async Record() {
		this.Stop();
		this.recordButton.disabled = true;
		await this.Start(true);
	}

	HandleRecording() {
		const dialog = this.DialogBox("120px");
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		btnOK.value = "Export";
		btnCancel.value = "Discard";

		innerBox.style.padding = "20px 20px 0 20px";
		innerBox.parentElement.style.maxWidth = "480px";

		const typeLabel = document.createElement("div");
		typeLabel.textContent = "Type:";
		typeLabel.style.display = "inline-block";
		typeLabel.style.minWidth = "80px";
		typeLabel.style.paddingBottom = "16px";
		innerBox.appendChild(typeLabel);

		const typeInput = document.createElement("select");
		typeInput.style.width = "280px";
		innerBox.appendChild(typeInput);

		const webm = document.createElement("option");
		webm.text = "WebM video";
		webm.value = "video/webm";
		
		const mp4 = document.createElement("option");
		mp4.text = "MP4 -MPEG-4 Part 14";
		mp4.value = "video/mp4";
		
		const ogg = document.createElement("option");
		ogg.text = "OGG container format";
		ogg.value = "video/ogg";
		
		typeInput.append(webm, mp4, ogg);

		btnOK.onclick = async ()=> {
			const blob = new Blob(this.recordChunks, { type: typeInput.video });
			const audioURL = URL.createObjectURL(blob);
			window.open(audioURL, "_blank");
	
			this.recordChunks = [];
			this.recorder = null;
			dialog.Close();
		};
		
		btnCancel.onclick = ()=> {
			this.recordChunks = [];
			this.recorder = null;
			dialog.Close();
		};
	}

	Close() { //override
		this.Stop();
		if (!this.recorder) {
			super.Close();
		}
	}
}