class Chat extends Window {
	static EMOJIS = ["mono/handthumbsup.svg", "mono/handok.svg", "mono/handhorns.svg", "mono/handvictory.svg", "mono/handfist.svg", "mono/handbird.svg", "mono/handthumbsdown.svg"];

	constructor() {
		super();

		this.AddCssDependencies("chat.css");

		this.SetTitle("Team chat");
		this.SetIcon("mono/chat.svg");
		this.content.classList.add("chat-window");

		this.lastBubble = null;
		this.outdoing = {};

		this.userStream = null;
		this.displayStreams = [];
		this.remoteStreams = [];

		this.isMicEnable = false;
		this.isCamEnable = false;

		this.InitializeComponents();
	}

	async InitializeComponents() {
		this.blinkingDot = document.createElement("div");
		this.blinkingDot.className = "task-icon-dots";
		this.blinkingDot.style.backgroundColor = "transparent";
		this.blinkingDot.style.width = "12px";
		this.blinkingDot.style.height = "12px";
		this.blinkingDot.style.left = "calc(50% - 6px)";
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

		for (let i=0; i<Chat.EMOJIS.length; i++) {
			const emojiIcon = document.createElement("input");
			emojiIcon.type = "button";
			emojiIcon.style.backgroundImage = `url(${Chat.EMOJIS[i]})`;
			emojiBox.appendChild(emojiIcon);

			emojiIcon.onclick = ()=> {
				let nowString = new Date().toLocaleTimeString(UI.regionalFormat, {});

				const id = `${KEEP.username}${Date.now()}`;
				const bubble = this.CreateEmojiBubble(Chat.EMOJIS[i], "out", KEEP.username, "", KEEP.color, nowString, id);
				bubble.style.color = "var(--clr-pane)";
				bubble.style.backgroundColor = "transparent";
				bubble.style.boxShadow = "var(--clr-pane) 0 0 0 2px inset";

				try {
					KEEP.socket.send(JSON.stringify({
						id: id,
						type: "chat-emoji",
						url: Chat.EMOJIS[i]
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

	async SetupLocalUserMediaStream() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true
				},
				video: {
					width: { min: 640, ideal: 1280, max: 1920 },
					height: { min: 480, ideal: 720, max: 1080 }
				}
			});

			const videoTrack = stream.getVideoTracks()[0];
			videoTrack.onended = ()=> {};

			const element = this.CreateLocalStreamElement(true);
			this.localStreamsBox.appendChild(element.container);

			element.videoFeedback.srcObject = stream;
			element.videoFeedback.play();

			this.userStream = {
				stream: stream,
				element: element
			};
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

	async SetupLocalDisplayMediaStream() {
		/*try*/ {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true
			});

			const videoTrack = stream.getVideoTracks()[0];
			videoTrack.onended = ()=> {};

			const element = this.CreateLocalStreamElement();
			this.localStreamsBox.appendChild(element.container);

			element.videoFeedback.srcObject = stream;
			element.videoFeedback.play();

			this.displayStreams.push({
				stream: stream,
				element: element
			});
		}
		/*catch (ex) {
			this.ConfirmBox(ex, true, "mono/screenshare.svg");
			this.displayButton.style.backgroundColor = "transparent";
			this.displayButton.style.backgroundImage = "url(mono/screenshare.svg?light)";
		}
		finally {
			this.AdjustUI();
		}*/
	}

	async InitializeRtc() {
		this.peer = new RTCPeerConnection();

		this.peer.onicecandidate = event=> this.Peer_onIceCandidate(event);
		this.peer.onnegotiationneeded = event=> this.Peer_onNegotiationNeeded(event);
		this.peer.ontrack = event=> this.Peer_onTrack(event);

		this.userStream.forEach(user=> {
			user.stream.getTracks().forEach(track=> {
				this.peer.addTrack(track, user.stream);
			});
		});
	}

	Peer_onIceCandidate(event) {
		if (event.candidate) {
			console.log(event.candidate);
			KEEP.socket.send(JSON.stringify({ type: 'chat-stream-candidate', candidate: event.candidate }));
		}
	}

	async Peer_onNegotiationNeeded(event) {
		const offer = await this.peer.createOffer();
		await this.peer.setLocalDescription(offer);
	

		KEEP.socket.send(JSON.stringify({ type: 'chat-stream-offer', offer: offer }));
	}

	Peer_onTrack(event) {
		const remoteStreamElement = this.CreateRemoteStream();
		remoteStreamElement.srcObject = event.streams[0];

		//this.remoteStreamsBox.appendChild(remoteStreamElement);
	}

	async GetHistory() {
		try {
			const response = await fetch("chat/history");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			const placeholder = document.createElement("div");
			placeholder.style.height = json.length === 0 ? "150px" : "50px";
			this.chatBox.append(placeholder);

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
		const hasUserStream     = this.userStream !== null;
		const hasDisplayStreams = this.displayStreams.length > 0;
		const hasRemoteStreams  = this.remoteStreams.length > 0;

		this.micButton.style.backgroundColor = this.isMicEnable ? "var(--clr-accent)" : "transparent";
		this.micButton.style.backgroundImage = this.isMicEnable ? "url(mono/mic.svg)" : "url(mono/mic.svg?light)";
		this.camButton.style.backgroundColor = this.isCamEnable ? "var(--clr-accent)" : "transparent";
		this.camButton.style.backgroundImage = this.isCamEnable ? "url(mono/webcam.svg)" : "url(mono/webcam.svg?light)";
		
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

		let nowString = new Date().toLocaleTimeString(UI.regionalFormat, {});

		const bubble = this.CreateTextBubble(this.input.innerHTML, "out", KEEP.username, "", KEEP.color, nowString, id);
		bubble.style.color = "var(--clr-pane)";
		bubble.style.backgroundColor = "transparent";
		bubble.style.boxShadow = "var(--clr-pane) 0 0 0 2px inset";

		this.ClearInput();
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

	async Mic_onclick() {
		this.isMicEnable = !this.isMicEnable;
		if (this.userStream === null) {
			this.SetupLocalUserMediaStream();
		}

		this.AdjustUI();
	}

	async Webcam_onclick() {
		this.isCamEnable = !this.isCamEnable;
		if (this.userStream === null) {
			this.SetupLocalUserMediaStream();
		}

		this.AdjustUI();
	}

	async Display_onclick() {
		this.SetupLocalDisplayMediaStream();
		
		this.AdjustUI();
	}

	HandleMessage(message) {
		if (this.outdoing.hasOwnProperty(message.id)) {
			this.outdoing[message.id].style.color = "var(--clr-dark)";
			this.outdoing[message.id].style.backgroundColor = "var(--clr-pane)";
			this.outdoing[message.id].style.boxShadow = "none";
			delete this.outdoing[message.id];
		}
		else {
			let time = new Date(UI.TicksToUnixDate(message.time));
			let timeString = time.toLocaleTimeString(UI.regionalFormat, {});

			switch (message.action) {
			case "chattext":
				this.CreateTextBubble(
					message.text,
					message.sender === KEEP.username ? "out" : "in",
					message.sender,
					message.alias,
					message.color,
					timeString,
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
					timeString,
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
					message.color,
					timeString
				);
				break;
			}
		}

		if (!(WIN.focused instanceof Chat)) {
			this.blinkingDot.style.backgroundColor = message.color;
			this.blinkingDot.style.boxShadow = "black 0 0 1px inset";
		}
	}

	CreateBubble(direction, sender, alias, color, time) {
		let group;

		const wrapper = document.createElement("div");
		wrapper.tabIndex = 0;
		wrapper.className = direction;

		const bubble = document.createElement("div");
		bubble.className = "chat-bubble";

		const timeLabel = document.createElement("div");
		timeLabel.className = "chat-timestamp";
		timeLabel.textContent = time;

		if (this.lastBubble && this.lastBubble.sender === sender) {
			if (direction === "out") {
				this.lastBubble.bubble.style.borderBottomRightRadius = "2px";
				bubble.style.borderTopRightRadius = "2px";
				wrapper.append(timeLabel, bubble);
			}
			else if (direction === "in") {
				this.lastBubble.bubble.style.borderBottomLeftRadius = "2px";
				bubble.style.borderTopLeftRadius = "2px";
				wrapper.append(bubble, timeLabel);

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
				wrapper.append(timeLabel, bubble);
			}
			else {
				group.style.textAlign = "left";
				group.style.paddingLeft = "36px";
				avatar.style.left = "4px";
				wrapper.append(bubble, timeLabel);
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

	CreateTextBubble(text, direction, sender, alias, color, time, id=null) {
		if (text.length === 0) return;
		
		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		bubble.innerHTML = text;

		if (direction === "out") {
			if (id && !this.outdoing.hasOwnProperty(id)) {
				this.outdoing[id] = bubble;
			}
		}

		return bubble;
	}

	CreateEmojiBubble(url, direction, sender, alias, color, time, id=null) {
		console.log(color);
		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		
		const emojiBox = document.createElement("div");
		emojiBox.style.filter = "drop-shadow(#000 0 0 1px)";
		bubble.appendChild(emojiBox);

		const emoji = document.createElement("div");
		emoji.className = "chat-emoji-bubble";
		emoji.style.background = `linear-gradient(to bottom, ${color} 0%, color-mix(in hsl shorter hue, ${color} 80%, black 20%)100%)`;
		emoji.style.webkitMaskImage = `url(${url})`;
		emoji.style.maskImage = `url(${url})`;
		emojiBox.appendChild(emoji);

		let index = Chat.EMOJIS.indexOf("url");
		
		if (index !== -1) {
			emoji.classList.add(`chat-emoji-${index+1}`);
		}

		if (direction === "out") {
			if (id && !this.outdoing.hasOwnProperty(id)) {
				this.outdoing[id] = bubble;
			}
		}

		return bubble;
	}

	CreateCommandBubble(command, params, icon, title, direction, sender, alias, color, time) {
		const bubble = this.CreateBubble(direction, sender, alias, color, time);

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

	CreateLocalStreamElement(isUserMedia=false) {
		const container = document.createElement("div");
		
		const videoFeedback = document.createElement("video");
		videoFeedback.style.width = "100%";
		videoFeedback.style.height = "100%";
		container.appendChild(videoFeedback);

		return {
			container: container,
			videoFeedback: videoFeedback
		};
	}

	CreateRemoteStream() {
		const element = document.createElement("div");
		return element;
	}
}