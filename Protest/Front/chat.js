"use strict";

class Chat extends Window {
	static EMOJIS = [
		"mono/handthumbsup.svg",
		"mono/handok.svg",
		"mono/handhorns.svg",
		"mono/handvictory.svg",
		"mono/handfist.svg",
		"mono/handbird.svg",
		"mono/handthumbsdown.svg"
	];

	static STUN_SERVERS = {
		iceServers: [
			{
				urls: ["stun:stun2.l.google.com:19302", "stun:stun4.l.google.com:19302"],
				//username: "", //optional
				//credentials: "" //token
			}
		]
	};

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

		this.localConnections = {};
		this.remoteConnections = {};

		this.isMicEnable = false;
		this.isCamEnable = false;

		this.upstreamUserSocket = null;

		this.InitializeComponents();
	}

	async InitializeComponents() {
		this.blinkingDot = document.createElement("div");
		this.blinkingDot.style.position = "absolute";
		this.blinkingDot.style.width = "12px";
		this.blinkingDot.style.height = "12px";
		this.blinkingDot.style.left = "calc(50% - 6px)";
		this.blinkingDot.style.top = "30%";
		this.blinkingDot.style.borderRadius = "50%";
		this.blinkingDot.style.backgroundColor = "transparent";
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

		this.sendButton.onclick = ()=> this.Send();
		this.micButton.onclick = ()=> this.Mic_onclick();
		this.camButton.onclick = ()=> this.Webcam_onclick();
		this.displayButton.onclick = ()=> this.Display_onclick();

		await this.GetHistory();

		KEEP.socket.send(JSON.stringify({
			type: "chat-join"
		}));
	}

	async SetupLocalUserMediaStream() {
		/*try*/ {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true
				},
				video: {
					//aspectRatio: { ideal: 1.333333},
					width: { min: 640, ideal: 1280, max: 1920 },
					height: { min: 480, ideal: 720, max: 1080 }
				}
			});

			const element = this.CreateLocalStreamElement(true);
			this.localStreamsBox.appendChild(element.container);
			element.videoFeedback.srcObject = stream;
			element.videoFeedback.muted = true;

			const userStream = {
				stream: stream,
				element: element,
				feedbackElement: element.videoFeedback
			};

			this.userStream = userStream;

			const videoTrack = stream.getVideoTracks()[0];
			const audioTrack = this.userStream.stream.getAudioTracks()[0];
			audioTrack.enabled = this.isMicEnable;
			videoTrack.enabled = this.isCamEnable;

			videoTrack.onended = ()=> {
				this.localStreamsBox.removeChild(element.container);
				this.userStream.stream.getTracks().forEach(track=>track.enabled = false);
				this.userStream = null;
				this.isMicEnable = false;
				this.isCamEnable = false;
				this.AdjustUI();
			};

			await this.InitializeRtc();
		}
		/*catch (ex) {
			this.ConfirmBox(ex, true, "mono/mic.svg");
			this.micButton.style.backgroundColor = "transparent";
			this.micButton.style.backgroundImage = "url(mono/mic.svg?light)";
			this.isMicEnable = false;
			this.isCamEnable = false;
		}*/

		this.AdjustUI();
	}

	async SetupLocalDisplayMediaStream() {
		/*try*/ {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true
			});

			const element = this.CreateLocalStreamElement();
			this.localStreamsBox.appendChild(element.container);
			element.videoFeedback.srcObject = stream;

			const displayStream = {
				stream: stream,
				element: element,
				feedbackElement: element.videoFeedback
			};

			this.displayStreams.push(displayStream);

			const videoTrack = stream.getVideoTracks()[0];
			videoTrack.onended = ()=> {
				this.localStreamsBox.removeChild(element.container);
				let index = this.displayStreams.indexOf(displayStream);
				if (index > -1) {
					this.displayStreams.splice(index, 1);
				}
				this.AdjustUI();
			};

			await this.InitializeRtc();
		}
		/*catch (ex) {
			this.ConfirmBox(ex, true, "mono/screenshare.svg");
			this.displayButton.style.backgroundColor = "transparent";
			this.displayButton.style.backgroundImage = "url(mono/screenshare.svg?light)";
		}*/

		this.AdjustUI();
	}

	async InitializeRtc() {
		const uuid = UI.GenerateUuid(KEEP.username);

		await KEEP.socket.send(JSON.stringify({
			type: "chat-stream",
			uuid: uuid
		}));
		console.log("send chat-stream:", uuid);

		const localConnection = new RTCPeerConnection(Chat.STUN_SERVERS);
		this.localConnections[uuid] = localConnection;

		console.log("pushing into local connections:", uuid);

		localConnection.onicecandidate = event=> {
			/*const time = new Date();
			this.CreateBurstedBubble(`ICE: ${JSON.stringify(event.candidate)}`, "out", KEEP.username, KEEP.alias, KEEP.color, time.toLocaleTimeString(UI.regionalFormat, {}));

			if (event.candidate) {
				KEEP.socket.send(JSON.stringify({
					type: "chat-ice",
					uuid: uuid,
					candidate: JSON.stringify(event.candidate)
				}));
			}*/

			if (localConnection.iceGatheringState !== "complete") { return; }

			KEEP.socket.send(JSON.stringify({
				type: "chat-sdp-offer",
				uuid: uuid,
				offer: JSON.stringify(offer)
			}));

			console.log("send chat-sdp-offer:", uuid);
		};

		/*localConnection.onnegotiationneeded = async event=> {
			console.log("negotiation needed");

			let offer = await localConnection.createOffer();

			if (localConnection.signalingState != "stable") { return; }

			await localConnection.setLocalDescription(offer);

			console.log({description: localConnection.localDescription});

			KEEP.socket.send(JSON.stringify({
				type: "chat-sdp-negotiation",
				uuid: uuid,
				answer: JSON.stringify({description: localConnection.localDescription})
			}));
		};*/

		localConnection.onopen = event=>{
			console.log("local connection open");
		};

		const sendChannel = localConnection.createDataChannel("channel");
		sendChannel.onmessage = event=> console.log(`message received: ${e.data}`);

		sendChannel.onopen = event=> {
			console.log("local data channel open");
			setInterval(()=>{
				sendChannel.send("if you see this, we good!");
			}, 2000);
		};

		sendChannel.onclose = event=> {
			console.log("local data channel close");
		};

		setTimeout(()=>{
			this.userStream.stream.getTracks().forEach(track=> {
				console.log("adding track");
				localConnection.addTrack(track, this.userStream.stream);
			});

			/*this.displayStreams[0].stream.getTracks().forEach(track=> {
				console.log("adding track");
				localConnection.addTrack(track, this.displayStreams[0].stream);
			});*/
		}, 2000);

		const offer = await localConnection.createOffer();

		await localConnection.setLocalDescription(offer);

		this.AdjustUI();
	}

	async HandleMessage(message, ignoreDot=false) {
		if (message.id in this.outdoing) {
			this.outdoing[message.id].style.color = "var(--clr-dark)";
			this.outdoing[message.id].style.backgroundColor = "var(--clr-pane)";
			this.outdoing[message.id].style.boxShadow = "none";
			delete this.outdoing[message.id];
		}
		else {
			const time = new Date(UI.TicksToUnixDate(message.time));
			const timeString = time.toLocaleTimeString(UI.regionalFormat, {});
			const direction = message.sender === KEEP.username ? "out" : "in";

			switch (message.action) {
			case "chat-text":
				this.CreateTextBubble(message.text, direction, message.sender, message.alias, message.color, timeString, message.id);
				break;

			case "chat-emoji":
				this.CreateEmojiBubble(message.url, direction, message.sender, message.alias, message.color, timeString, message.id);
				break;

			case "chat-command":
				this.CreateCommandBubble(message.command, message.args, message.icon, message.title, direction, message.sender, message.alias, message.color, timeString);
				break;

			case "chat-offer":
				this.CreateBurstedBubble("SDP: Offer", direction, message.sender, message.alias, message.color, timeString);
				if (direction === "out") break;
				this.HandleOffer(message);
				break;

			case "chat-answer":
				this.CreateBurstedBubble("SDP: Answer", direction, message.sender, message.alias, message.color, timeString);
				this.HandleAnswer(message, direction);
				break;

			/*case "chat-join":
				this.CreateBurstedBubble("Join", direction, message.sender, message.alias, message.color, timeString);
				break;*/

			case "chat-stream":
				this.CreateBurstedBubble(`Starting a stream: ${message.uuid}`, direction, message.sender, message.alias, message.color, timeString);
				if (direction === "out") break;

				console.log("receive chat-stream:", message.uuid);
				break;

			case "chat-ice":
				this.CreateBurstedBubble(`ICE: ${message.candidate}`, direction, message.sender, message.alias, message.color, timeString);
				this.HandleIce(message, direction);
				break;
			}
		}

		if (!(WIN.focused instanceof Chat) && !ignoreDot) {
			this.blinkingDot.style.backgroundColor = message.color;
			this.blinkingDot.style.boxShadow = "black 0 0 1px inset";
		}
	}

	async HandleOffer(message) {
		console.log("receive chat-sdp-offer:", message.uuid);

		const remoteConnection = new RTCPeerConnection(Chat.STUN_SERVERS);

		this.remoteConnections[message.uuid] = remoteConnection;
		console.log("pushing in remote connections:", message.uuid);

		remoteConnection.onicecandidate = event=> {
			const time = new Date();
			this.CreateBurstedBubble(
				`ICE: ${JSON.stringify(event.candidate)}`,
				"out",
				KEEP.username,
				KEEP.alias,
				KEEP.color,
				time.toLocaleTimeString(UI.regionalFormat, {})
			);

			if (event.candidate) {
				KEEP.socket.send(JSON.stringify({
					type: "chat-ice",
					uuid: message.uuid,
					candidate: JSON.stringify(event.candidate)
				}));
			}

			if (remoteConnection.iceGatheringState !== "complete") { return; }

			KEEP.socket.send(JSON.stringify({
				type: "chat-sdp-answer",
				uuid: message.uuid,
				answer: JSON.stringify(remoteConnection.localDescription)
			}));

			console.log("sending chat-sdp-answer:", message.uuid);
		};

		/*remoteConnection.onnegotiationneeded = async event=> {
			console.log("negotiation needed");

			let offer = await remoteConnection.createOffer();

			if (remoteConnection.signalingState != "stable") { return; }

			await remoteConnection.setLocalDescription(offer);

			console.log({description: remoteConnection.localDescription});

			KEEP.socket.send(JSON.stringify({
				type: "chat-sdp-negotiation",
				uuid: message.uuid,
				answer: JSON.stringify({description: remoteConnection.localDescription})
			}));
		};*/

		remoteConnection.onopen = event=> {
			console.log("remote connection open");
		};

		remoteConnection.ondatachannel = event=> {
			const receiveChannel = event.channel;
			receiveChannel.onmessage = event=> console.log("message received:", event.data);

			receiveChannel.onopen = event=> {
				console.log("remote data channel open");
			};

			receiveChannel.onclose = event=> {
				console.log("remote data channel close");
			};

			remoteConnection.channel = receiveChannel;
		};

		remoteConnection.ontrack = event=> {
			console.log("getting track");

			/*const track = event.track;
			if (track.kind === "audio") {
				const remoteAudio = document.createElement("audio");
				remoteAudio.controls = true;
				remoteAudio.srcObject = new MediaStream([track]);
				this.chatBox.appendChild(remoteAudio);
				try {
					remoteAudio.play();
				}
				catch {}
			}
			else if (track.kind === "video") {
				const remoteVideo = document.createElement("video");
				remoteVideo.controls = true;
				remoteVideo.srcObject = new MediaStream([track]);
				this.chatBox.appendChild(remoteVideo);
				try {
					remoteVideo.play();
				}
				catch {}
			}*/
		};

		await remoteConnection.setRemoteDescription(JSON.parse(message.sdp));

		const answer = await remoteConnection.createAnswer();
		await remoteConnection.setLocalDescription(answer);
	}

	async HandleAnswer(message) {
		const answer = JSON.parse(message.sdp);

		console.log("looking for local connection:", message.uuid);
		if (message.uuid in this.localConnections) {
			this.localConnections[message.uuid].setRemoteDescription(answer);
		}
	}

	async HandleIce(message) {
		/*if (message.uuid in this.remoteConnections) {
			await this.remoteConnections[message.uuid].addIceCandidate(JSON.parse(message.candidate));
		}

		if (message.uuid in this.localConnections) {
			await this.localConnections[message.uuid].addIceCandidate(JSON.parse(message.candidate));
		}*/
	}

	async GetHistory() {
		try {
			const response = await fetch("chat/history");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			const placeholder = document.createElement("div");
			placeholder.style.padding = "40px 8px";
			placeholder.style.textAlign = "center";
			placeholder.style.color = "var(--clr-pane)";
			placeholder.textContent = "Messages are self-destruct after 24 hours.";
			this.chatBox.append(placeholder);

			for (let i=0; i<json.length; i++) {
				this.HandleMessage(json[i]);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	BringToFront() { //overrides
		super.BringToFront();
		if (this.blinkingDot) {
			this.blinkingDot.style.backgroundColor = "transparent";
			this.blinkingDot.style.boxShadow = "none";
		}
	}

	AdjustUI() {
		const hasUserStream = this.userStream !== null;
		const hasDisplayStreams = this.displayStreams.length > 0;
		const hasRemoteStreams = this.remoteStreams.length > 0;

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
		else if ((hasUserStream || hasDisplayStreams) && hasRemoteStreams) {
			this.localStreamsBox.style.visibility = "visible";
			this.localStreamsBox.style.opacity = "1";
			this.chatBox.style.left = "unset";
			this.chatBox.style.width = "33%";
		}
		else if (hasRemoteStreams) {
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
		//if (this.input.textContent.length === 0) return;
		if (this.input.innerHTML.length === 0) return;

		if (this.input.innerHTML.length === 4 && this.input.innerHTML === "<br>") {
			this.ClearInput();
			return;
		}

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

		const bubble = this.CreateTextBubble(this.input.textContent, "out", KEEP.username, "", KEEP.color, nowString, id);
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

		try {
			if (this.userStream === null) {
				this.isMicEnable = true;
				this.isCamEnable = false;
				await this.SetupLocalUserMediaStream();
			}
		}
		catch (ex) {
			this.isMicEnable = false;
			console.log("mic error:", ex);
		}

		if (this.userStream) {
			let audioTrack = this.userStream.stream.getAudioTracks()[0];
			if (audioTrack) { audioTrack.enabled = this.isMicEnable; }
		}

		this.AdjustUI();
	}

	async Webcam_onclick() {
		this.isCamEnable = !this.isCamEnable;

		try {
			if (this.userStream === null) {
				this.isMicEnable = false;
				this.isCamEnable = true;
				await this.SetupLocalUserMediaStream();
			}
		}
		catch {
			this.isCamEnable = false;
		}

		if (this.userStream) {
			let videoTrack = this.userStream.stream.getVideoTracks()[0];
			if (videoTrack) { videoTrack.enabled = this.isCamEnable; }
		}

		this.AdjustUI();
	}

	async Display_onclick() {
		this.SetupLocalDisplayMediaStream();
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

		//TODO: sanitize text and handle links, images, etc

		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		bubble.textContent = text;

		if (direction === "out") {
			if (id && !(id in this.outdoing)) {
				this.outdoing[id] = bubble;
			}
		}

		return bubble;
	}

	CreateEmojiBubble(url, direction, sender, alias, color, time, id=null) {
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

		if (direction === "out") {
			if (id && !(id in this.outdoing)) {
				this.outdoing[id] = bubble;
			}
		}

		return bubble;
	}

	CreateCommandBubble(command, args, icon, title, direction, sender, alias, color, time) {
		const bubble = this.CreateBubble(direction, sender, alias, color, time);

		const commandBox = document.createElement("div");
		commandBox.className = "chat-command-box";
		commandBox.style.backgroundImage = `url(${icon})`;
		commandBox.textContent = title;
		bubble.appendChild(commandBox);

		commandBox.onclick = ()=> {
			const window = LOADER.Invoke({
				class: command,
				args: JSON.parse(args)
			});
			window.Pop();
		};

		return bubble;
	}

	CreateBurstedBubble(text, direction, sender, alias, color, time) {
		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		bubble.classList.add("chat-burst-bubble");
		bubble.textContent = text;
		return bubble;
	}

	CreateLocalStreamElement(isUserMedia=false) {
		const container = document.createElement("div");

		const videoFeedback = document.createElement("video");
		videoFeedback.setAttribute("autoplay", true);
		videoFeedback.style.width = "100%";
		videoFeedback.style.height = "100%";
		container.appendChild(videoFeedback);

		const stopButton = document.createElement("div");
		stopButton.className = "chat-stop-stream-button";
		container.appendChild(stopButton);

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