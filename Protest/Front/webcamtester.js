class WebcamTester extends Window {
	constructor(params) {
		super();

		this.params = params;

		this.SetTitle("Webcam tester");
		this.SetIcon("mono/webcam.svg");

		this.mediaStream = null;
		this.AttachCamera();
	}

	AttachCamera() {
		const dialog = this.DialogBox("120px");
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		const message = document.createElement("div");
		message.textContent = "Attach webcam?";
		message.style.padding = "20px";
		message.style.textAlign = "center";
		message.style.fontWeight = "600";
		innerBox.appendChild(message);

		btnOK.onclick = async ()=> {
			try {
				this.mediaStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						width: { min: 1024, ideal: 1280, max: 1920 },
						height: { min: 576, ideal: 720, max: 1080 },
					}
				});
			}
			catch (ex) {
				setTimeout(()=>{
					this.ConfirmBox(ex, true, "mono/error.svg").addEventListener("click", ()=>{this.Close()});
				}, 400);
			}
			finally {
				dialog.Close();
			}
		};

		btnCancel.onclick = ()=> this.Close();
	}

	Close() { //override
		super.Close();
	}
}