class Terminal extends Window {
	constructor() {
		super();

		this.SetTitle("Terminal");
		this.SetIcon("mono/console.svg");

		this.AddCssDependencies("terminal.css");

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.settingsButton = this.AddToolbarButton("Settings", "mono/wrench.svg?light");
		this.AddToolbarSeparator();

		this.connectButton.disabled = true;

		this.content.tabIndex = 1;
		this.content.classList.add("terminal-content");

		const cursor = document.createElement("div");
		cursor.className = "terminal-cursor";
		this.content.appendChild(cursor);

		this.win.onclick = () => this.content.focus();
		this.content.onfocus = () => this.BringToFront();
		this.content.onkeydown = event => this.Terminal_onkeydown(event);
	}

	Terminal_onkeydown(event) {
		event.preventDefault();
		console.log(event.key, event.ctrlKey, event.altKey, event.shiftKey);
	}
}