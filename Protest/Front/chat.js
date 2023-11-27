class Chat extends Window {
	constructor() {
		super();

		this.AddCssDependencies("chat.css");

		this.SetTitle("Team chat");
		this.SetIcon("mono/chat.svg");

		this.lastBubble = null;
		this.outdoing = {};

		this.userStream  = [];
		this.displayStreams = [];
		this.remoteStreams = [];

		this.InitializeComponents();
	}

	async InitializeComponents() {
		this.blinkingDot = document.createElement("div");
		this.blinkingDot.className = "task-icon-dots";
		this.blinkingDot.style.backgroundColor = "transparent";
		this.blinkingDot.style.width = "16px";
		this.blinkingDot.style.height = "16px";
		this.blinkingDot.style.left = "calc(50% - 8px)";
		this.blinkingDot.style.top = "30%";
		this.blinkingDot.style.boxShadow = "none";
		this.blinkingDot.style.animation = "blink 1.5s infinite";
		this.task.appendChild(this.blinkingDot);

		this.localStreamsBox = document.createElement("div");
		this.localStreamsBox.className = "local-streams-box";
		this.content.appendChild(this.localStreamsBox);

		this.chatBox = document.createElement("div");
		this.chatBox.className = "chat-box";
		this.content.appendChild(this.chatBox);

		this.micButton = document.createElement("input");
		this.micButton.type = "button";
		this.micButton.className = "chat-button chat-mic";
		this.micButton.style.backgroundColor = "transparent";

		this.camButton = document.createElement("input");
		this.camButton.type = "button";
		this.camButton.className = "chat-button chat-cam";
		this.camButton.style.backgroundColor = "transparent";

		this.displayButton = document.createElement("input");
		this.displayButton.className = "chat-button chat-screen";
		this.displayButton.type = "button";
		this.displayButton.style.backgroundColor = "transparent";

		this.content.append(this.micButton, this.camButton, this.displayButton);

		//TODO:
		//this.micButton.disabled = true;
		//this.camButton.disabled = true;
		//this.displayButton.disabled = true;

		this.input = document.createElement("div");
		this.input.setAttribute("contenteditable", true);
		this.input.className = "chat-input";
		this.content.appendChild(this.input);

		this.sendButton = document.createElement("input");
		this.sendButton.type = "button";
		this.sendButton.className = "chat-button chat-send";
		this.sendButton.style.backgroundColor = "transparent";

		this.emojiButton = document.createElement("button");
		this.emojiButton.className = "chat-button chat-emoji";
		this.emojiButton.style.backgroundColor = "transparent";

		this.content.append(this.sendButton, this.emojiButton);

		const emojiBox = document.createElement("div");
		emojiBox.className = "chat-emoji-box";
		this.emojiButton.append(emojiBox);

		const emojisArray = ["mono/logo.svg", "mono/logo.svg", "mono/logo.svg", "mono/logo.svg", "mono/logo.svg", "mono/logo.svg"];
		for (let i=0; i<emojisArray.length; i++) {
			const emojiIcon = document.createElement("input");
			emojiIcon.type = "button";
			emojiIcon.style.backgroundImage = `url(${emojisArray[i]})`;
			emojiBox.appendChild(emojiIcon);

			emojiIcon.onclick = ()=> {
				const id = `${KEEP.username}${Date.now()}`;
				const bubble = this.CreateEmojiBubble(emojisArray[i], "out", KEEP.username, "", KEEP.color, id);
				bubble.style.color = "var(--clr-pane)";
				bubble.style.backgroundColor = "transparent";
				bubble.style.boxShadow = "var(--clr-pane) 0 0 0 2px inset";

				try {
					KEEP.socket.send(JSON.stringify({
						id: id,
						type: "chat-emoji",
						url: emojisArray[i]
					}));
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/chat.svg");
				}

				emojiIcon.blur();
			};
		}

		this.input.onkeydown = event=> this.Input_onkeydown(event);

		this.sendButton.onclick    = ()=> this.Send();
		this.micButton.onclick     = ()=> this.Mic_onclick();
		this.camButton.onclick     = ()=> this.Webcam_onclick();
		this.displayButton.onclick = ()=> this.Display_onclick();

		await this.GetHistory();
	}

	async GetHistory() {
		try {
			const response = await fetch("chat/history");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (json.length === 0) {
				const placeholder = document.createElement("div");
				placeholder.style.height = "150px";
				this.chatBox.append(placeholder);
			}

			for (let i=0; i<json.length; i++) {
				this.HandleMessage(json[i]);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	BringToFront() { //override
		super.BringToFront();
		if (this.blinkingDot) {
			this.blinkingDot.style.backgroundColor = "transparent";
			this.blinkingDot.style.boxShadow = "none";
		}
	}

	AdjustUI() {
		const hasUserStream     = this.userStream.length > 0;
		const hasDisplayStreams = this.displayStreams.length > 0;
		const hasRemoteStreams  = this.remoteStreams.length > 0;

		//this.micButton.style.backgroundColor = isMicOn ? "var(--clr-accent)" : "transparent";
		//this.micButton.style.backgroundImage = isMicOn ? "url(mono/mic.svg)" : "url(mono/mic.svg?light)";
		//this.camButton.style.backgroundColor = isCameraOn ? "var(--clr-accent)" : "transparent";
		//this.camButton.style.backgroundImage = isCameraOn ? "url(mono/webcam.svg)" : "url(mono/webcam.svg?light)";
		
		this.displayButton.style.backgroundColor = hasDisplayStreams ? "var(--clr-accent)" : "transparent";
		this.displayButton.style.backgroundImage = hasDisplayStreams ? "url(mono/screenshare.svg)" : "url(mono/screenshare.svg?light)";
	
		if ((hasUserStream || hasDisplayStreams) && !hasRemoteStreams) {
			this.localStreamsBox.style.visibility = "visible";
			this.localStreamsBox.style.opacity = "1";
			this.chatBox.style.left = "150px";
			this.chatBox.style.width = "unset";
		}
		else if ((hasUserStream || hasDisplayStreams) && hasRemoteStreams)  {
			this.localStreamsBox.style.visibility = "visible";
			this.localStreamsBox.style.opacity = "1";
			this.chatBox.style.left = "unset";
			this.chatBox.style.width = "33%";
		}
		else if (!hasRemoteStreams) {
			this.localStreamsBox.style.visibility = "hidden";
			this.localStreamsBox.style.opacity = "0";
			this.chatBox.style.left = "unset";
			this.chatBox.style.width = "33%";
		}
		else {
			this.localStreamsBox.style.visibility = "hidden";
			this.localStreamsBox.style.opacity = "0";
			this.chatBox.style.left = "8px";
			this.chatBox.style.width = "unset";
		}
	}

	Input_onkeydown(event) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			this.Send();
		}
		else if (event.key === "Escape") {
			this.ClearInput();
		}
	}

	ClearInput() {
		this.input.textContent = "";
		while (this.input.childNodes.length > 0) {
			this.input.removeChild(this.input.childNodes[0]);
		}
	}

	Send() {
		if (this.input.textContent.length === 0) return;
		if (this.input.innerHTML.length === 0) return;

		const id = `${KEEP.username}${Date.now()}`;

		try {
			KEEP.socket.send(JSON.stringify({
				id: id,
				type: "chat-text",
				text: this.input.innerHTML
			}));
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/chat.svg");
		}

		const bubble = this.CreateTextBubble(this.input.innerHTML, "out", KEEP.username, "", KEEP.color, id);
		bubble.style.color = "var(--clr-pane)";
		bubble.style.backgroundColor = "transparent";
		bubble.style.boxShadow = "var(--clr-pane) 0 0 0 2px inset";

		this.ClearInput();
	}

	HandleMessage(message) {
		if (this.outdoing.hasOwnProperty(message.id)) {
			this.outdoing[message.id].style.color = "var(--clr-dark)";
			this.outdoing[message.id].style.backgroundColor = "var(--clr-pane)";
			this.outdoing[message.id].style.boxShadow = "none";
			delete this.outdoing[message.id];
		}
		else {
			switch (message.action) {
			case "chattext":
				this.CreateTextBubble(
					message.text,
					message.sender === KEEP.username ? "out" : "in",
					message.sender,
					message.alias,
					message.color,
					message.id
				);
				break;

			case "chatemoji":
				this.CreateEmojiBubble(
					message.url,
					message.sender === KEEP.username ? "out" : "in",
					message.sender,
					message.alias,
					message.color,
					message.id
				);
				break;

			case "chatcommand":
				this.CreateCommandBubble(
					message.command,
					message.params,
					message.icon,
					message.title,
					message.sender === KEEP.username ? "out" : "in",
					message.sender,
					message.alias,
					message.color
				);
				break;
			}
		}

		if (!(WIN.focused instanceof Chat)) {
			this.blinkingDot.style.backgroundColor = message.color;
			this.blinkingDot.style.boxShadow = "black 0 0 1px inset";
		}
	}

	CreateBubble(direction, sender, alias, color) {
		let group;

		const wrapper = document.createElement("div");
		wrapper.tabIndex = 0;
		wrapper.className = direction;

		const bubble = document.createElement("div");
		bubble.className = "chat-bubble";

		wrapper.append(bubble);

		if (this.lastBubble && this.lastBubble.sender === sender) {
			this.lastBubble.bubble.style.marginBottom = "0";
			bubble.style.marginTop = "0";

			if (direction === "out") {
				this.lastBubble.bubble.style.borderBottomRightRadius = "2px";
				bubble.style.borderTopRightRadius = "2px";
			}
			else if (direction === "in") {
				this.lastBubble.bubble.style.borderBottomLeftRadius = "2px";
				bubble.style.borderTopLeftRadius = "2px";
			}

			group = this.lastBubble.group;
		}
		else {
			group = document.createElement("div");
			group.className = "chat-group";

			if (sender !== KEEP.username) {
				group.setAttribute("sender", alias && alias.length > 0 ? alias : sender);
			}

			const avatar = document.createElement("div");
			avatar.className = "chat-avatar";
			avatar.style.backgroundColor = color;
			group.appendChild(avatar);

			if (direction === "out") {
				group.style.textAlign = "right";
				group.style.paddingRight = "36px";
				avatar.style.right = "4px";
			}
			else {
				group.style.textAlign = "left";
				group.style.paddingLeft = "36px";
				avatar.style.left = "4px";
			}

			this.chatBox.appendChild(group);
		}

		this.lastBubble = {
			group: group,
			bubble: bubble,
			sender: sender
		};
		
		const isScrolledToBottom = this.chatBox.scrollTop + this.chatBox.clientHeight - this.chatBox.scrollHeight >= -96;

		group.appendChild(wrapper);

		if (isScrolledToBottom) {
			setTimeout(()=>wrapper.scrollIntoView({behavior:"smooth"}),50);
		}

		return bubble;
	}

	CreateTextBubble(text, direction, sender, alias, color, id=null) {
		if (text.length === 0) return;
		
		const bubble = this.CreateBubble(direction, sender, alias, color);
		bubble.innerHTML = text;

		if (direction === "out") {
			if (id && !this.outdoing.hasOwnProperty(id)) {
				this.outdoing[id] = bubble;
			}
		}

		return bubble;
	}

	CreateEmojiBubble(url, direction, sender, alias, color, id=null) {
		const bubble = this.CreateBubble(direction, sender, alias, color);
		
		const commandBox = document.createElement("div");
		commandBox.className = "chat-emoji-bubble";
		commandBox.style.maskImage = `url(${url})`;
		bubble.appendChild(commandBox);

		if (direction === "out") {
			if (id && !this.outdoing.hasOwnProperty(id)) {
				this.outdoing[id] = bubble;
			}
		}

		return bubble;
	}

	CreateCommandBubble(command, params, icon, title, direction, sender, alias, color) {
		const bubble = this.CreateBubble(direction, sender, alias, color);

		const commandBox = document.createElement("div");
		commandBox.className = "chat-command-box";
		commandBox.style.backgroundImage= `url(${icon})`;
		commandBox.textContent= title;
		bubble.appendChild(commandBox);

		commandBox.onclick = ()=> {
			const window = LOADER.Invoke({
				class: command,
				params: JSON.parse(params)
			});
			window.Pop();
		};

		return bubble;
	}

	CreateLocalStream(isUserMedia=false) {
		const element = document.createElement("div");
		return element;
	}

	CreateRemoteStream() {
		const element = document.createElement("div");
		return element;
	}

	async Mic_onclick() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
				},
				video: false
			});

			const element = this.CreateLocalStream(true);
			this.localStreamsBox.appendChild(element);

			this.userStream.push({
				stream: stream,
				element: element
			});
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/mic.svg");
			this.micButton.style.backgroundColor = "transparent";
			this.micButton.style.backgroundImage = "url(mono/mic.svg?light)";
		}
		finally {
			this.AdjustUI();
		}
	}

	async Webcam_onclick() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					width: { min: 640, ideal: 1280, max: 1920 },
					height: { min: 480, ideal: 720, max: 1080 },
				}
			});

			const element = this.CreateLocalStream(true);
			this.localStreamsBox.appendChild(element);

			this.userStream.push({
				stream: stream,
				element: element
			});
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/webcam.svg");
			this.camButton.style.backgroundColor = "transparent";
			this.camButton.style.backgroundImage = "url(mono/webcam.svg?light)";
		}
		finally {
			this.AdjustUI();
		}
	}

	async Display_onclick() {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true
			});

			const element = this.CreateLocalStream();
			this.localStreamsBox.appendChild(element);

			this.displayStreams.push({
				stream: stream,
				element: element
			});
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/screenshare.svg");
			this.displayButton.style.backgroundColor = "transparent";
			this.displayButton.style.backgroundImage = "url(mono/screenshare.svg?light)";
		}
		finally {
			this.AdjustUI();
		}
	}
}