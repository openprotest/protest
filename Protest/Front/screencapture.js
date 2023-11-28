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
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "20px 20px 0 20px";
		innerBox.parentElement.style.maxWidth = "480px";

		const chkAudio = document.createElement("input");
		chkAudio.type = "checkbox";
		innerBox.appendChild(chkAudio);
		this.AddCheckBoxLabel(innerBox, chkAudio, "Record audio").style.paddingBottom = "16px";

		innerBox.appendChild(document.createElement("br"));

		chkAudio.checked = this.params.audio;

		btnOK.onclick = async ()=> {
			this.params.audio = chkAudio.checked;
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
			const blob = new Blob(this.recordChunks, { type: typeInput.value });
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