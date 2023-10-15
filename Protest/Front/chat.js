class Chat extends Window {
	constructor() {
		super();

		this.AddCssDependencies("chat.css");

		this.SetTitle("Team chat");
		this.SetIcon("mono/chat.svg");

		this.chatBox = document.createElement("div");
		this.chatBox.className = "chat-box";
		this.content.appendChild(this.chatBox);

	}
}