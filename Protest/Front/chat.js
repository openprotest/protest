class Chat extends Window {
	constructor() {
		super();

		this.AddCssDependencies("chat.css");

		this.SetTitle("Team chat");
		this.SetIcon("mono/chat.svg");

		this.micOn = false;
		this.camOn = false;
		this.screenOn = false;

		this.chatBox = document.createElement("div");
		this.chatBox.className = "chat-box";
		this.content.appendChild(this.chatBox);

		this.input = document.createElement("div");
		this.input.setAttribute("contenteditable", true);
		this.input.className = "chat-input";
		this.content.appendChild(this.input);

		this.sendButton = document.createElement("input");
		this.sendButton.type = "button";
		this.sendButton.className = "chat-button chat-send";
		this.sendButton.style.backgroundColor = "transparent";

		this.micButton = document.createElement("input");
		this.micButton.type = "button";
		this.micButton.className = "chat-button chat-mic";
		this.micButton.style.backgroundColor = "transparent";

		this.camButton = document.createElement("input");
		this.camButton.type = "button";
		this.camButton.className = "chat-button chat-cam";
		this.camButton.style.backgroundColor = "transparent";

		this.screenButton = document.createElement("input");
		this.screenButton.className = "chat-button chat-screen";
		this.screenButton.type = "button";
		this.screenButton.style.backgroundColor = "transparent";

		this.content.append(this.sendButton, this.micButton, this.camButton, this.screenButton);

		this.input.onkeydown = event=> this.Input_onkeydown(event);

		this.sendButton.onclick = ()=> this.Send();
		this.micButton.onclick = ()=> this.ToggleMic();
		this.camButton.onclick = ()=> this.ToggleWebcam();
		this.screenButton.onclick = ()=> this.ToggleScreen();
	}

	Input_onkeydown(event) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			this.Send();
		}
	}

	Send() {
		

		//clean input
		this.input.textContent = "";
		while (this.input.childNodes.length > 0) {
			this.input.removeChild(this.input.childNodes[0]);
		}
	}

	ToggleMic() {
		this.micOn = !this.micOn;

		this.micButton.style.backgroundColor = this.micOn ? "var(--clr-accent)" : "transparent";
		this.micButton.style.backgroundImage = this.micOn ? "url(mono/mic.svg)" : "url(mono/mic.svg?light)";
	}

	ToggleWebcam() {
		this.camOn = !this.camOn;

		this.camButton.style.backgroundColor = this.camOn ? "var(--clr-accent)" : "transparent";
		this.camButton.style.backgroundImage = this.camOn ? "url(mono/webcam.svg)" : "url(mono/webcam.svg?light)";
	}

	ToggleScreen() {
		this.screenOn = !this.screenOn;

		this.screenButton.style.backgroundColor = this.screenOn ? "var(--clr-accent)" : "transparent";
		this.screenButton.style.backgroundImage = this.screenOn ? "url(mono/screenshare.svg)" : "url(mono/screenshare.svg?light)";
	}

}