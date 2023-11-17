class WebcamTester extends Window {
	constructor(params) {
		super();

		this.params = params;

		this.SetTitle("Webcam tester");
		this.SetIcon("mono/webcam.svg");

		this.SetupToolbar();
		this.startButton   = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton    = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.AddToolbarSeparator();
		this.flipButton    = this.AddToolbarButton("Horizontal flip", "mono/horizontalflip.svg?light");
		this.controlButton = this.AddToolbarButton("Picture controls", "mono/personalize.svg?light");
		this.force4kButton = this.AddToolbarButton("Force 4K", "mono/4k.svg?light");

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

		this.stream = null;
		
		this.startButton.onclick = ()=> this.AttachCamera();
		this.stopButton.onclick = ()=> this.Stop();

		let flipToggle = false;
		this.flipButton.onclick = ()=>{
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

		this.force4k = false;
		this.force4kButton.onclick = ()=> {
			this.force4k = !this.force4k;
			this.Stop();
			this.AttachCamera();
			this.force4kButton.style.borderBottom = this.force4k ? "#c0c0c0 solid 3px" : "none";
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

	async AttachCamera() {
		try {
			this.stream = await navigator.mediaDevices.getUserMedia(this.force4k ?
			{
				audio: false,
				video: {
					width: { ideal: 3840 },
					height: { ideal: 2160 },
				}
			} : {
				audio: false,
				video: {
					width: { min: 1024, ideal: 1920, max: 3840 },
					height: { min: 576, ideal: 1080, max: 2160 },
				}
			});

			const videoTrack = this.stream.getVideoTracks()[0];
			const videoSettings = videoTrack.getSettings();
			videoTrack.onended = ()=> this.Stop();

			this.infoBox.textContent = `${videoSettings.width} x ${videoSettings.height} @ ${videoSettings.frameRate}FPS`;

			this.Start();

			this.startButton.disabled = true;
			this.stopButton.disabled = false;
			this.force4kButton.disabled = false;
		}
		catch (ex) {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
			this.force4kButton.disabled = true;
			setTimeout(() => this.ConfirmBox(ex, true, "mono/error.svg"), 400);
		}
	}

	Start() {
		if (this.stream) {
			this.videoFeedback.srcObject = this.stream;
			this.videoFeedback.play();
		}
	}

	Stop() {
		if (this.stream) {
			const tracks = this.stream.getTracks();
			tracks.forEach(track => track.stop());
			this.videoFeedback.srcObject = null;
			this.stream = null;
		}

		this.infoBox.textContent = "";
		this.startButton.disabled = false;
		this.stopButton.disabled = true;
		this.force4kButton.disabled = true;
	}

	Close() { //override
		this.Stop();
		super.Close();
	}
}