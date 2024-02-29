class ScreenCapture extends Window {
	constructor(params) {
		super();

		this.params = params ?? {
			audio: true
		};

		this.SetTitle("Screen capture");
		this.SetIcon("mono/screenrecord.svg");

		this.recorder = null;
		this.recordChunks = [];

		this.SetupToolbar();
		this.recordButton = this.AddToolbarButton("Record", "mono/record.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.AddToolbarSeparator();
		this.settingsButton = this.AddToolbarButton("Settings", "mono/wrench.svg?light");

		this.stopButton.disabled = true;

		this.content.style.overflow = "hidden";

		this.videoFeedback = document.createElement("video");
		this.videoFeedback.style.width = "100%";
		this.videoFeedback.style.height = "100%";
		this.content.appendChild(this.videoFeedback);

		this.videoStream = null;
		this.audioStream = null;

		this.recordButton.onclick = () => this.Start();
		this.stopButton.onclick = ()=> this.Stop();
		this.settingsButton.onclick = ()=> this.Settings();
	}

	Settings() {
		const dialog = this.DialogBox("150px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "20px 20px 0 20px";
		innerBox.parentElement.style.maxWidth = "480px";

		const audioCheckbox = document.createElement("input");
		audioCheckbox.type = "checkbox";
		innerBox.appendChild(audioCheckbox);
		this.AddCheckBoxLabel(innerBox, audioCheckbox, "Record audio").style.paddingBottom = "16px";

		innerBox.appendChild(document.createElement("br"));

		audioCheckbox.checked = this.params.audio;

		okButton.onclick = async ()=> {
			this.params.audio = audioCheckbox.checked;
			dialog.Close();
		};
	}

	async Start() {
		try {
			this.videoStream = await navigator.mediaDevices.getDisplayMedia({
				video: true
			});

			let mixedStream = null;
			if (this.params.audio) {
				this.audioStream = await navigator.mediaDevices.getUserMedia({
					audio: true
				});

				mixedStream = new MediaStream([...this.videoStream.getTracks(), ...this.audioStream.getTracks()]);
			}
			else {
				mixedStream = new MediaStream([...this.videoStream.getTracks()]);
			}

			const videoTrack = this.videoStream.getVideoTracks()[0];

			this.videoFeedback.srcObject = this.videoStream;
			this.videoFeedback.play();

			this.recorder = new MediaRecorder(mixedStream);
			this.recordChunks = [];

			videoTrack.onended = ()=> {
				this.recorder.stop();
				this.Stop();
			};

			this.recorder.ondataavailable = event=> this.recordChunks.push(event.data);
			this.recorder.onstop = ()=> this.HandleStop();
			this.recorder.start();

			this.recordButton.disabled = true;
			this.stopButton.disabled = false;
			this.settingsButton.disabled = true;
		}
		catch (ex) {
			this.recordButton.disabled = false;
			this.stopButton.disabled = true;
			this.settingsButton.disabled = false;
			setTimeout(() => this.ConfirmBox(ex, true, "mono/error.svg"), 400);
		}
	}

	Stop() {
		if (this.recorder) {
			this.recorder.stop();
		}

		if (this.videoStream) {
			this.videoFeedback.srcObject = null;
			this.videoStream.getTracks().forEach(track=>track.stop());
			this.videoStream = null;
		}

		if (this.audioStream) {
			this.audioStream.getTracks().forEach(track=>track.stop());
			this.audioStream = null;
		}

		this.recordButton.disabled = false;
		this.stopButton.disabled = true;
		this.settingsButton.disabled = false;
	}

	HandleStop() {
		this.Stop();

		const dialog = this.DialogBox("120px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const cancelButton = dialog.cancelButton;
		const innerBox = dialog.innerBox;

		okButton.value = "Export";
		cancelButton.value = "Discard";

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

		const webmOption = document.createElement("option");
		webmOption.text = "WebM video";
		webmOption.value = "video/webm";

		const mp4Option = document.createElement("option");
		mp4Option.text = "MP4 -MPEG-4 Part 14";
		mp4Option.value = "video/mp4";

		const oggOption = document.createElement("option");
		oggOption.text = "OGG container format";
		oggOption.value = "video/ogg";

		typeInput.append(webmOption, mp4Option, oggOption);

		okButton.onclick = async ()=> {
			const blob = new Blob(this.recordChunks, { type: typeInput.value });
			const audioURL = URL.createObjectURL(blob);
			window.open(audioURL, "_blank");

			this.recordChunks = [];
			this.recorder = null;
			dialog.Close();
		};

		cancelButton.onclick = ()=> {
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