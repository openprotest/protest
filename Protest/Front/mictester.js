class MicTester extends Window {
	constructor(params) {
		super();

		this.params = params;

		this.SetTitle("Mic tester");
		this.SetIcon("mono/mic.svg");

		this.mediaStream = null;
		this.AttachMic();
	}

	AttachMic() {
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
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						sampleRate: 44100
					},
					video: false
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