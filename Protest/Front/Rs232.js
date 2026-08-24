"use strict";
class Rs232 extends PtyHost {

	constructor(args) {
		super(args);

		this.SetTitle("RS-232 Console");
		this.SetIcon("mono/serialconsole.svg");

		this.connectButton.disabled = true;

		this.port = null;
		this.reader = null;
		this.writer = null;

		this.reading = false;
		this.disconnecting = false;

		this.serial = {
			baudRate: 9600,
			dataBits: 8,
			stopBits: 1,
			parity: "none",
			flowControl: "none"
		};

		if (args && args.serial) {
			Object.assign(this.serial, args.serial);
		}

		this.ws = null;

		this.ConnectDialog();
	}

	Close() { //overrides
		this.Disconnect();
		super.Close();
	}

	ConnectDialog() { //overrides
		if (!("serial" in navigator)) {
			const dialog = this.DialogBox("180px");
			if (dialog === null) return;

			const {okButton, innerBox} = dialog;

			innerBox.style.padding = "20px";

			const message = document.createElement("div");
			message.textContent = "Web Serial API is not supported by this browser.";

			innerBox.appendChild(message);

			okButton.value = "Close";
			okButton.onclick = () => dialog.Close();

			return;
		}

		const dialog = this.DialogBox("300px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;
		innerBox.style.padding = "40px";
		innerBox.parentElement.style.width = "400px";
		dialog.okButton.value = "Connect";

		const CreateSelect = (labelText, values, currentValue) => {
			const label = document.createElement("div");
			label.style.display = "inline-block";
			label.style.minWidth = "120px";
			label.textContent = `${labelText}:`;

			const select = document.createElement("select");
			select.style.width = "180px";

			for (const value of values) {
				const option = document.createElement("option");

				if (typeof value === "object") {
					option.value = value.value;
					option.textContent = value.text;
				}
				else {
					option.value = value;
					option.textContent = value;
				}

				if (String(option.value) === String(currentValue)) {
					option.selected = true;
				}

				select.appendChild(option);
			}

			innerBox.appendChild(label);
			innerBox.appendChild(select);
			innerBox.appendChild(document.createElement("br"));

			return select;
		};

		const baudRate = CreateSelect(
			"Baud rate",
			["300", "600", "1200", "2400", "4800", "9600", "19200", "38400", "57600", "115200"],
			this.serial.baudRate
		);

		const dataBits = CreateSelect(
			"Data bits",
			["7", "8"],
			this.serial.dataBits
		);

		const stopBits = CreateSelect(
			"Stop bits",
			["1", "2"],
			this.serial.stopBits
		);

		const parity = CreateSelect(
			"Parity",
			[
				{value:"none", text:"None"},
				{value:"even", text:"Even"},
				{value:"odd",  text:"Odd"}
			],
			this.serial.parity
		);

		const flowControl = CreateSelect(
			"Flow control",
			[
				{value:"none",     text:"None"},
				{value:"hardware", text:"Hardware (RTS/CTS)"}
			],
			this.serial.flowControl
		);

		okButton.onclick = async () => {
			const settings = {
				baudRate: Number.parseInt(baudRate.value, 10),
				dataBits: Number.parseInt(dataBits.value, 10),
				stopBits: Number.parseInt(stopBits.value, 10),
				parity: parity.value,
				flowControl: flowControl.value
			};

			this.serial = settings;
			this.args.serial = {...settings};
			dialog.Close();
			await this.Connect();
		};

		setTimeout(() => baudRate.focus(), 200);
	}

	async Connect() {
		if (!("serial" in navigator)) {
			console.error("Web Serial API is not available.");
			return;
		}

		if (this.port) {
			await this.Disconnect();
		}

		try {
			const port = await navigator.serial.requestPort();
			this.port = port;

			this.statusBox.textContent = "Opening serial port...";

			await this.port.open({
				baudRate: this.serial.baudRate,
				dataBits: this.serial.dataBits,
				stopBits: this.serial.stopBits,
				parity: this.serial.parity,
				flowControl: this.serial.flowControl
			});

			this.ws = {
				readyState: 1,
				send: data => {this.Send(data);},
				close: () => {this.Disconnect();}
			};

			this.connectButton.disabled = false;
			this.statusBox.textContent = `Connected (${this.serial.baudRate}, ${this.serial.dataBits}${this.serial.parity[0].toUpperCase()}${this.serial.stopBits})`;
			this.reading = true;

			this.cursorElement.style.visibility = "visible";
			this.content.appendChild(this.cursorElement);

			this.ReadLoop();
		}
		catch (error) {
			this.ConfirmBox(`Failed to open serial port: ${error}`, true, "mono/error.svg");

			this.ws = null;
			this.reader = null;
			this.writer = null;

			if (this.port) {
				try {
					await this.port.close();
				}
				catch {}
			}

			this.port = null;
			this.connectButton.disabled = false;
			this.statusBox.textContent = "Disconnected";
		}
	}

	async ReadLoop() {
		if (!this.port || !this.port.readable) return;
		const decoder = new TextDecoder("utf-8");

		try {
			this.reader = this.port.readable.getReader();
			while (this.reading) {
				const {value, done} = await this.reader.read();
				if (done) break;
				if (!value || value.length === 0) continue;

				const text = decoder.decode(value, {stream:true});

				if (text.length > 0) {
					this.HandleMessage(text);
				}
			}

			const remaining = decoder.decode();
			if (remaining.length > 0) {
				this.HandleMessage(remaining);
			}
		}
		catch (error) {
			if (this.reading) {
				console.error("Serial read error:", error);
				this.statusBox.textContent = "Serial read error";
			}
		}
		finally {
			if (this.reader) {
				try {
					this.reader.releaseLock();
				}
				catch {}
				this.reader = null;
			}

			if (this.reading) {
				this.reading = false;
				this.SetDisconnectedState();
			}
		}
	}

	async Send(data) {
		if (!this.port || !this.port.writable) return;
		if (data === null || data === undefined) return;
		if (data.length === 0) return;

		try {
			if (!this.writer) {
				this.writer = this.port.writable.getWriter();
			}

			const encoder = new TextEncoder();
			const bytes = encoder.encode(data);
			await this.writer.write(bytes);
		}
		catch (error) {
			console.error("Serial write error:", error);
			this.statusBox.textContent = "Serial write error";
		}
	}

	async Disconnect() {
		if (this.disconnecting) return;

		this.disconnecting = true;
		this.reading = false;

		try {
			if (this.reader) {
				try {
					await this.reader.cancel();
				}
				catch {}
			}

			if (this.reader) {
				try {
					this.reader.releaseLock();
				}
				catch {}
				this.reader = null;
			}

			if (this.writer) {
				try {
					this.writer.releaseLock();
				}
				catch {}

				this.writer = null;
			}

			if (this.port) {
				try {
					await this.port.close();
				}
				catch (error) {
					console.warn("Serial port close error:", error);
				}
			}
		}
		finally {
			this.port = null;
			this.reader = null;
			this.writer = null;
			this.ws = null;
			this.SetDisconnectedState();
			this.disconnecting = false;
		}
	}

	SetDisconnectedState() {
		this.statusBox.textContent = "Disconnected";
		this.connectButton.disabled = false;
	}
}