class MicTester extends Window {
	static FFT_SIZE = 512;

	constructor(params) {
		super();

		this.params = params ?? {
			echoCancellation: true,
			noiseSuppression: false,
			sampleSize: 16,
			sampleRate: 48_000
		};

		this.SetTitle("Mic tester");
		this.SetIcon("mono/mic.svg");

		this.content.style.padding = "20px";

		this.SetupToolbar();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");

		this.infoBox = document.createElement("div");
		this.infoBox.style.position = "absolute";
		this.infoBox.style.right = "8px";
		this.infoBox.style.bottom = "8px";
		this.infoBox.style.zIndex = "1";
		this.infoBox.style.color = "var(--clr-light)";
		this.infoBox.style.textShadow = "black 0 0 2px";
		this.content.appendChild(this.infoBox);

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
		sampleSizeLabel.textContent = "Bit depth:";
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
		rate44.value = 44_100;
		rate44.text = "44.1KHz";
		const rate48 = document.createElement("option");
		rate48.value = 48_000;
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
						sampleSize: parseInt(sampleSizeInput.value),
						sampleRate: parseInt(sampleRateInput.value)
					},
					video: false
				});
				
				const audioTrack = this.stream.getAudioTracks()[0];
				const audioSettings = audioTrack.getSettings();
				audioTrack.onended = () => this.Stop();

				this.Start();
		
				if (audioSettings.sampleRate && audioSettings.sampleSize) {
					this.infoBox.textContent = `${audioSettings.sampleRate}Hz @ ${audioSettings.sampleSize}-bits`;
				}
		
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
				this.params.sampleSize = parseInt(sampleSizeInput.value);
				this.params.sampleRate = parseInt(sampleRateInput.value);
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

				ctx.fillStyle = "#c0c0c0";
				ctx.font = "14px Consolas";
				ctx.textAlign = "right";
				ctx.textBaseline = 'middle';

				const step = this.canvas.height > 800 ? 32 : this.canvas.height > 400 ? 64 : 128;
				for (let i=step; i<256; i+=step) {
					let y = i * this.canvas.height / 512;
					const dB = 20 * Math.log10((i / 255));
					ctx.fillText(`${dB.toFixed(1)}dB`, 56, this.canvas.height / 2 - y);
					ctx.fillRect(64, this.canvas.height / 2 - y, this.canvas.width, 1);

					ctx.fillText(`${dB.toFixed(1)}dB`, 56, this.canvas.height / 2 + y);
					ctx.fillRect(64, this.canvas.height / 2 + y, this.canvas.width, 1);
				}

				const horizontalCenter = this.canvas.width / 2;
				const barWidth = Math.max(this.canvas.width / bufferLength, 2);
				let barHeight;
				let x = 0;
				let peakFrequency = 0;
				let peakIndex = -1;

				ctx.textAlign = "center";
				ctx.textBaseline = "middle";

				for (let i=0; i < bufferLength; i++) {
					if (peakFrequency < dataArray[i]) {
						peakFrequency = dataArray[i];
						peakIndex = i;
					}

					ctx.fillStyle = "#c0c0c0";

					//draw bars
					barHeight = dataArray[i] * this.canvas.height / 255;
					ctx.fillRect(horizontalCenter + x, (this.canvas.height - barHeight) / 2, barWidth, barHeight);
					ctx.fillRect(horizontalCenter - x, (this.canvas.height - barHeight) / 2, barWidth, barHeight);
					
					//draw labels
					if (i > 0 && i % (this.canvas.width > 800 ? 32 : 64) === 0) {
						const frequency = i * this.audioContext.sampleRate / bufferLength / 2000;
						ctx.fillText(`${frequency}KHz`, horizontalCenter + x, 10);
						ctx.fillText(`${frequency}KHz`, horizontalCenter - x, 10);
						ctx.fillRect(horizontalCenter + x, 20, 3, 3);
						ctx.fillRect(horizontalCenter - x, 20, 3, 3);
					}

					//calculate recent max
					if (maxHeight[i] < dataArray[i]) {
						maxHeight[i] = dataArray[i];
						maxAcc[i] = 0;
					}
					else {
						maxAcc[i] += .2;
						maxHeight[i] = Math.max(maxHeight[i] - maxAcc[i], 0);
					}

					//draw recent max
					ctx.fillStyle = `hsl(${12 + dataArray[i]/2},100%,40%)`;
					barHeight = maxHeight[i] * this.canvas.height / 255;
					ctx.fillRect(horizontalCenter + x, (this.canvas.height - barHeight) / 2 - barWidth, barWidth, barWidth);
					ctx.fillRect(horizontalCenter - x, (this.canvas.height - barHeight) / 2 - barWidth, barWidth, barWidth);
					ctx.fillRect(horizontalCenter + x, (this.canvas.height + barHeight) / 2, barWidth, barWidth);
					ctx.fillRect(horizontalCenter - x, (this.canvas.height + barHeight) / 2, barWidth, barWidth);

					x += barWidth - 1;

					if (x > horizontalCenter) {
						break;
					}
				}

				if (peakIndex > -1) { //draw peak
					ctx.fillStyle = "#c0c0c0";
					ctx.textBaseline = "bottom";
					const frequency = Math.round(peakIndex * this.audioContext.sampleRate / bufferLength / 2);
					const frequencyString = frequency < 1000 ? `${frequency}Hz` : `${frequency/1000}KHz`
					const x = (horizontalCenter + (barWidth-1) * peakIndex + barWidth / 2);
					const y = this.canvas.height * 46 / 48;

					if (frequency > 0) {
						ctx.fillRect(x-2, this.canvas.height - 52, 5, 5);
						ctx.fillRect(x, this.canvas.height - 48, 1, 10);
						ctx.fillText(`${frequencyString}`, x, this.canvas.height-20);
						if (frequency >= 440) {
							let note = this.CalculateNote(frequency);
							ctx.fillText(`${note.note} ${note.cents}`, x, this.canvas.height);
						}
					}
				}

				if (this.stream) {
					requestAnimationFrame(drawVisualizer);
				}
			};

			drawVisualizer();
		}
	}

	CalculateNote(frequency) {
		const referenceFrequency = 440; //A4
		const referenceNote = 69; //MIDI note number for A4
	
		const cents = Math.round(1200 * Math.log2(frequency / referenceFrequency)) % 1200;
		const note = 12 * Math.log2(frequency / referenceFrequency) + referenceNote;
		const roundedNote = Math.round(note);

		const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
		const noteIndex = (roundedNote % 12 + 12) % 12;
		const octave = Math.floor(roundedNote / 12) - 1; //MIDI octave starts from -1
	
		const closestNote = `${noteNames[noteIndex]}${octave}`;

		return { note: closestNote, cents: cents > 0 ? `+${cents}` : `${cents}`};
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

		this.infoBox.textContent = "";
		this.startButton.disabled = false;
		this.stopButton.disabled = true;
	}

	Close() { //override
		this.Stop();
		super.Close();
	}
}