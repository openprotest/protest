class MicTester extends Window {
	static FFT_SIZE = 512;

	constructor(params) {
		super();

		this.params = params ?? {
			echoCancellation: true,
			noiseSuppression: true,
			sampleSize: 16,
			sampleRate: 44100
		};

		this.SetTitle("Mic tester");
		this.SetIcon("mono/mic.svg");

		this.content.style.padding = "20px";

		this.SetupToolbar();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");

		this.stopButton.disabled = true;

		this.stream = null;
		this.audioContext = null;
		this.analyser = null;
		this.canvas = null;

		this.startButton.onclick = () => this.AttachMic();
		this.stopButton.onclick = () => this.Stop();

		this.AttachMic();
	}

	AfterResize() { //override
		if (this.canvas) {
			this.canvas.width = this.content.clientWidth;
			this.canvas.height = this.content.clientHeight;
		}
	}

	async AttachMic() {
		const dialog = this.DialogBox("250px");
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "480px";
		

		const chkEchoCancellation = document.createElement("input");
		chkEchoCancellation.type = "checkbox";
		chkEchoCancellation.checked = true;
		innerBox.appendChild(chkEchoCancellation);
		this.AddCheckBoxLabel(innerBox, chkEchoCancellation, "Echo cancellation");

		innerBox.appendChild(document.createElement("br"));

		const chkNoiseSuppression = document.createElement("input");
		chkNoiseSuppression.type = "checkbox";
		chkNoiseSuppression.checked = true;
		innerBox.appendChild(chkNoiseSuppression);
		this.AddCheckBoxLabel(innerBox, chkNoiseSuppression, "Noise suppression");

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const sampleSizeLabel = document.createElement("div");
		sampleSizeLabel.textContent = "Sample size:";
		sampleSizeLabel.style.display = "inline-block";
		sampleSizeLabel.style.minWidth = "120px";
		innerBox.appendChild(sampleSizeLabel);

		const sampleSizeInput = document.createElement("select");
		sampleSizeInput.style.width = "100px";
		innerBox.appendChild(sampleSizeInput);
		const size16 = document.createElement("option");
		size16.value = 16;
		size16.text = "16-bit";
		const size24 = document.createElement("option");
		size24.value = 24;
		size24.text = "24-bit";
		const size32 = document.createElement("option");
		size32.value = 32;
		size32.text = "32-bit";
		sampleSizeInput.append(size16, size24, size32);

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const sampleRateLabel = document.createElement("div");
		sampleRateLabel.textContent = "Sample rate:";
		sampleRateLabel.style.display = "inline-block";
		sampleRateLabel.style.minWidth = "120px";
		innerBox.appendChild(sampleRateLabel);

		const sampleRateInput = document.createElement("select");
		sampleRateInput.style.width = "100px";
		innerBox.appendChild(sampleRateInput);
		const rate44 = document.createElement("option");
		rate44.value = 44100;
		rate44.text = "44.1KHz";
		const rate48 = document.createElement("option");
		rate48.value = 48000;
		rate48.text = "48KHz";
		const rate96 = document.createElement("option");
		rate96.value = 96000;
		rate96.text = "96KHz";
		sampleRateInput.append(rate44, rate48, rate96);

		chkEchoCancellation.checked = this.params.echoCancellation;
		chkNoiseSuppression.checked = this.params.noiseSuppression;
		sampleSizeInput.value = this.params.sampleSize;
		sampleRateInput.value = this.params.sampleRate;

		btnOK.onclick = async ()=> {
			try {
				this.stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: chkEchoCancellation.checked,
						noiseSuppression: chkNoiseSuppression.checked,
						sampleSize: sampleSizeInput.value,
						sampleRate: sampleRateInput.value
					},
					video: false
				});

				this.Start();

				this.startButton.disabled = true;
				this.stopButton.disabled = false;
			}
			catch (ex) {
				setTimeout(() => this.ConfirmBox(ex, true, "mono/error.svg"), 400);
			}
			finally {
				dialog.Close();

				this.params.echoCancellation = chkEchoCancellation.checked;
				this.params.noiseSuppression = chkNoiseSuppression.checked;
				this.params.sampleSize = sampleSizeInput.value;
				this.params.sampleRate = sampleRateInput.value;
			}
		};
		
		btnCancel.onclick = ()=> this.Close();
	}

	Start() {
		if (this.stream) {
			this.audioContext = new window.AudioContext();
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = MicTester.FFT_SIZE;
			const bufferLength = this.analyser.frequencyBinCount;
			const dataArray = new Uint8Array(bufferLength);

			const source = this.audioContext.createMediaStreamSource(this.stream);
			source.connect(this.analyser);

			this.canvas = document.createElement("canvas");
			this.canvas.width = this.content.clientWidth;
			this.canvas.height = this.content.clientHeight;
			this.canvas.style.width = "100%";
			this.canvas.style.height = "100%";
			this.content.appendChild(this.canvas);

			const ctx = this.canvas.getContext("2d");

			let maxHeight = [];
			let maxAcc = [];
			for (let i = 0; i < this.analyser.frequencyBinCount; i++) {
				maxHeight.push(0);
				maxAcc.push(0);
			}

			const drawVisualizer = ()=> {
				if (!this.canvas) return;

				this.analyser.getByteFrequencyData(dataArray);
				ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

				const horizontalCenter = this.canvas.width / 2;
				const barWidth = 2 * this.canvas.width / bufferLength;
				let barHeight;
				let x = 0;
 
				for (let i = 0; i < bufferLength; i++) {
					barHeight = dataArray[i] * this.canvas.height / 255;
					ctx.fillStyle = `hsl(${12 + dataArray[i]/2},100%,40%)`;
					ctx.fillRect(horizontalCenter + x, (this.canvas.height - barHeight) / 2, barWidth, barHeight);
					ctx.fillRect(horizontalCenter - x, (this.canvas.height - barHeight) / 2, barWidth, barHeight);
					
					if (maxHeight[i] < dataArray[i]) {
						maxHeight[i] = dataArray[i];
						maxAcc[i] = 0;
					} else {
						maxAcc[i] += .2;
						maxHeight[i] = Math.max(maxHeight[i] - maxAcc[i], 0);
					}

					barHeight = maxHeight[i] * this.canvas.height / 255;
					ctx.fillRect(horizontalCenter + x, (this.canvas.height - barHeight) / 2, barWidth, 4);
					ctx.fillRect(horizontalCenter - x, (this.canvas.height - barHeight) / 2, barWidth, 4);
					ctx.fillRect(horizontalCenter + x, (this.canvas.height + barHeight) / 2, barWidth, 4);
					ctx.fillRect(horizontalCenter - x, (this.canvas.height + barHeight) / 2, barWidth, 4);

					x += barWidth - 1;
				}

				const step =this.canvas.width < 960 ? 22 : 11;
				ctx.fillStyle = '#c0c0c0';
				ctx.font = '11px';
				ctx.textBaseline = 'middle';
				ctx.textAlign = "center";
				for (let i = step; i < bufferLength; i+=step) {
					let tx = i * barWidth;
					if (horizontalCenter + tx + 20 > this.canvas.width) continue;

					const text = `${Math.round(i * this.audioContext.sampleRate / bufferLength / 1000)}KHz`;
					ctx.fillText(text, horizontalCenter + tx , 10);
					ctx.fillText(text, horizontalCenter - tx , 10);
					ctx.fillRect(horizontalCenter + tx, 20, 3, 3);
					ctx.fillRect(horizontalCenter - tx, 20, 3, 3);
				}

				if (this.stream) {
					requestAnimationFrame(drawVisualizer);
				}
			};

			drawVisualizer();
		}
	}

	Stop() {
		if (this.stream) {
			const tracks = this.stream.getTracks();
			tracks.forEach(track => track.stop());
			this.stream = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		if (this.canvas) {
			this.canvas.remove();
			this.canvas = null;
		}

		this.startButton.disabled = false;
		this.stopButton.disabled = true;
	}

	Close() { //override
		this.Stop();
		super.Close();
	}
}