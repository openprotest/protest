class SpeedTest extends Window {
	static DURATION = 5;

	constructor(args) {
		super();

		this.args = args ?? "";

		this.SetTitle("Speed test");
		this.SetIcon("mono/speedtest.svg");

		this.content.style.padding = "32px 16px 0 16px";
		this.content.style.overflowY = "auto";
		this.content.style.textAlign = "center";

		const box = document.createElement("div");
		box.style.maxWidth = "480px";
		box.style.minHeight = "100px";
		box.style.margin = "40px auto";
		box.style.padding = "16px 24px";
		box.style.backgroundColor = "var(--clr-pane)";
		box.style.color = "var(--clr-dark)";
		box.style.borderRadius = "4px";
		box.style.userSelect = "text";
		this.content.appendChild(box);

		this.progressBarContainer = document.createElement("div");
		this.progressBarContainer.style.width = "100%";
		this.progressBarContainer.style.height = "20px";
		this.progressBarContainer.style.marginBottom = "20px";
		this.progressBarContainer.style.padding = "2px";
		this.progressBarContainer.style.borderRadius = "8px";
		this.progressBarContainer.style.backgroundColor = "var(--clr-control)";
		box.appendChild(this.progressBarContainer);

		this.progressBar = document.createElement("div");
		this.progressBar.style.width = "0%";
		this.progressBar.style.height = "100%";
		this.progressBar.style.borderRadius = "8px";
		this.progressBar.style.backgroundColor = "var(--clr-accent)";
		//this.progressBar.style.transition = ".1s";
		this.progressBarContainer.appendChild(this.progressBar);

		this.download = document.createElement("div");
		this.download.style.textAlign = "left";
		this.download.textContent = "Download: ";

		this.upload = document.createElement("div");
		this.upload.style.textAlign = "left";
		this.upload.textContent = "Upload: ";

		this.latency = document.createElement("div");
		this.latency.style.textAlign = "left";
		this.latency.textContent = "Latency: ";

		box.append(this.download, this.upload, this.latency);

		this.startButton = document.createElement("input");
		this.startButton.type = "button";
		this.startButton.value = "Start";
		this.startButton.style.width = "150px";
		this.startButton.style.height = "40px";
		this.startButton.style.marginTop = "40px";
		box.appendChild(this.startButton);

		this.startButton.onclick = ()=> this.Start();
	}

	async Start() {
		this.startButton.disabled = true;

		let count = 2;
		let startTime = 0, endTime = 0;

		let promises = [];
		let ping = [];
		let start = [];
		let received = [];
		let duration = [];

		const callback = (index, status, value)=> {
			switch (status) {

			case "ping":
				ping[index] = value;
				this.latency.textContent = `Latency: ${Math.min(...ping)}ms`;
				break;

			case "start":
				if (startTime === 0) {
					startTime = Date.now();
				}

				start[index] = value;
				break;

			case "update":
				received[index] = value;
				let total = received.reduce((sum, val)=> sum + val, 0);
				this.progressBar.style.width = `${(Date.now() - startTime) / 100}%`;
				break;

			case "finish":
				duration[index] = value;
				this.progressBar.style.width = "100%";
				break;
			}
		};

		for (let i = 0; i < count; i++) {
			promises.push(this.DownloadTest(i, callback));
			ping.push(0);
			start.push(0);
			received.push(0);
			duration.push(0);
		}

		try {
			await Promise.all(promises);
		}
		catch {}
		finally {
			this.startButton.disabled = false;
		}
	}

	DownloadTest(index, callback) {
		return new Promise(async (resolve, reject)=> {
			let openTime, startTime, endTime;
			let lastLength = 0;
			const xhr = new XMLHttpRequest();
			xhr.onreadystatechange = ()=> {
				if (xhr.readyState === XMLHttpRequest.UNSENT) {
					reject(xhr.readyState);
				}
				else if (xhr.readyState === XMLHttpRequest.OPENED) {
					openTime = performance.now();
				}
				else if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
					startTime = performance.now();
					callback(index, "ping", startTime - openTime);
				}
				else if (xhr.readyState === XMLHttpRequest.LOADING) {
					if (this.isClosed) {
						xhr.abort();
						return;
					}

					if (lastLength === 0) {
						callback(index, "start", performance.now());
					}

					lastLength = xhr.responseText.length;
					callback(index, "update", lastLength);
				}
				else if (xhr.readyState === XMLHttpRequest.DONE) {
					endTime = performance.now();

					if (xhr.status === 200) {
						callback(index, "finish", endTime - startTime);
						resolve();
					}
					else {
						reject();
					}
				}
			};

			xhr.open("GET", `tools/speedtestdown?chunksize=32768&duration=${SpeedTest.DURATION}`, true);
			xhr.send();
		});
	}
}