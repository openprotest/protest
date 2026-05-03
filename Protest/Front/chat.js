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

	static RTC_CONFIG = {
		iceServers: [
			{
				urls: ["stun:stun2.l.google.com:19302", "stun:stun4.l.google.com:19302"]
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

		this.peerId = UI.GenerateUuid();

		this.userStream = null;
		this.displayStreams = [];
		this.peers = {};

		this.remoteStreamOrder = [];
		this.primaryStreamKey = null;

		this.isMicEnable = false;
		this.isCamEnable = false;

		this.hasJoined = false;

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

		this.remoteStreamsBox = document.createElement("div");
		this.remoteStreamsBox.className = "remote-streams-box";
		this.remoteStreamsBox.style.display = "block";
		this.remoteStreamsBox.style.padding = "0";
		this.remoteStreamsBox.style.overflow = "hidden";
		this.content.appendChild(this.remoteStreamsBox);

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

		this.SendChatJoin();

		this.AdjustUI();
	}

	Close() { //overrides
		this.LeaveChat();
		super.Close();
	}

	SendChatJoin() {
		try {
			KEEP.socket.send(JSON.stringify({
				type: "chat-join",
				peerId: this.peerId
			}));
			this.hasJoined = true;
		}
		catch {}
	}

	LeaveChat() {
		for (const peerId in this.peers) {
			this.RemovePeer(peerId);
		}
		this.peers = {};

		if (this.userStream) {
			try { this.userStream.stream.getTracks().forEach(t=>t.stop()); } catch {}
			if (this.userStream.element && this.userStream.element.container.parentElement) {
				this.localStreamsBox.removeChild(this.userStream.element.container);
			}
			this.userStream = null;
		}

		for (const ds of this.displayStreams) {
			try { ds.stream.getTracks().forEach(t=>t.stop()); } catch {}
			if (ds.element && ds.element.container.parentElement) {
				this.localStreamsBox.removeChild(ds.element.container);
			}
		}
		this.displayStreams = [];

		if (this.hasJoined) {
			try {
				KEEP.socket.send(JSON.stringify({
					type: "chat-leave",
					peerId: this.peerId
				}));
			}
			catch {}
			this.hasJoined = false;
		}
	}

	async EnsureUserStream() {
		const wantAudio = this.isMicEnable;
		const wantVideo = this.isCamEnable;

		if (!wantAudio && !wantVideo) {
			if (this.userStream) this.StopUserStream();
			return;
		}

		const haveAudio = !!(this.userStream && this.userStream.stream.getAudioTracks().length > 0);
		const haveVideo = !!(this.userStream && this.userStream.stream.getVideoTracks().length > 0);

		if (this.userStream && haveAudio === wantAudio && haveVideo === wantVideo) {
			const audioTrack = this.userStream.stream.getAudioTracks()[0];
			const videoTrack = this.userStream.stream.getVideoTracks()[0];
			if (audioTrack) audioTrack.enabled = wantAudio;
			if (videoTrack) videoTrack.enabled = wantVideo;
			this.UpdateLocalAudioVisualizer();
			return;
		}

		if (this.userStream && (haveAudio || haveVideo) && !(wantAudio && !haveAudio) && !(wantVideo && !haveVideo)) {
			const audioTrack = this.userStream.stream.getAudioTracks()[0];
			const videoTrack = this.userStream.stream.getVideoTracks()[0];
			if (audioTrack) audioTrack.enabled = wantAudio;
			if (videoTrack) videoTrack.enabled = wantVideo;
			this.UpdateLocalAudioVisualizer();
			return;
		}

		if (this.userStream) {
			this.StopUserStream({preserveFlags: true});
		}

		await this.AcquireUserStream(wantAudio, wantVideo);
	}

	async AcquireUserStream(wantAudio, wantVideo) {
		const constraints = {
			audio: wantAudio ? {
				echoCancellation: true,
				noiseSuppression: true
			} : false,
			video: wantVideo ? {
					width: { ideal:1280, max:1920 },
					height: { ideal:720, max:1080 }
			} : false
		};

		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia(constraints);
		}
		catch (ex) {
			const icon = wantVideo ? "mono/webcam.svg" : "mono/mic.svg";
			this.ConfirmBox(ex, true, icon);
			if (wantAudio) this.isMicEnable = false;
			if (wantVideo) this.isCamEnable = false;
			this.AdjustUI();
			return;
		}

		const element = this.CreateLocalStreamElement(stream, true);
		this.localStreamsBox.appendChild(element.container);
		element.video.srcObject = stream;
		element.video.muted = true;

		this.userStream = {
			stream: stream,
			element: element,
			kind: "user"
		};

		const audioTrack = stream.getAudioTracks()[0];
		const videoTrack = stream.getVideoTracks()[0];
		if (audioTrack) audioTrack.enabled = this.isMicEnable;
		if (videoTrack) videoTrack.enabled = this.isCamEnable;

		const onLocalEnd = ()=> this.StopUserStream();
		if (audioTrack) audioTrack.onended = onLocalEnd;
		if (videoTrack) videoTrack.onended = onLocalEnd;

		element.stopButton.onclick = ()=> this.StopUserStream();

		this.AddStreamToAllPeers(stream);
		this.UpdateLocalAudioVisualizer();
		this.AdjustUI();
	}

	SetupAudioVisualizer(container, stream, color) {
		if (!container) return null;
		if (container._visualizer) {
			container._visualizer.color = color || container._visualizer.color;
			return container._visualizer;
		}
		if (!stream || stream.getAudioTracks().length === 0) return null;

		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) return null;

		let audioCtx;
		try { audioCtx = new AudioCtx(); }
		catch { return null; }

		let source;
		try { source = audioCtx.createMediaStreamSource(stream); }
		catch {
			try { audioCtx.close(); } catch {}
			return null;
		}

		const analyser = audioCtx.createAnalyser();
		analyser.fftSize = 512;
		analyser.smoothingTimeConstant = 0.65;
		source.connect(analyser);

		const canvas = document.createElement("canvas");
		canvas.className = "chat-audio-viz";
		canvas.style.position = "absolute";
		canvas.style.left = "0";
		canvas.style.top = "0";
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.pointerEvents = "none";
		canvas.style.zIndex = "1";
		container.appendChild(canvas);

		const data = new Uint8Array(analyser.frequencyBinCount);
		const handle = {
			canvas: canvas,
			audioCtx: audioCtx,
			source: source,
			analyser: analyser,
			color: color || "#888",
			stopped: false,
			raf: 0,
			stop: ()=> {
				if (handle.stopped) return;
				handle.stopped = true;
				if (handle.raf) cancelAnimationFrame(handle.raf);
				try { source.disconnect(); } catch {}
				try { audioCtx.close(); } catch {}
				if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
				if (container._visualizer === handle) container._visualizer = null;
			}
		};

		const draw = ()=> {
			if (handle.stopped) return;
			const w = canvas.clientWidth | 0;
			const h = canvas.clientHeight | 0;
			if (w === 0 || h === 0) {
				handle.raf = requestAnimationFrame(draw);
				return;
			}
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const targetW = (w * dpr) | 0;
			const targetH = (h * dpr) | 0;
			if (canvas.width !== targetW) canvas.width = targetW;
			if (canvas.height !== targetH) canvas.height = targetH;

			analyser.getByteTimeDomainData(data);
			let sum = 0;
			for (let i=0; i<data.length; i++) {
				const v = (data[i] - 128) / 128;
				sum += v * v;
			}
			const rms = Math.sqrt(sum / data.length);
			const amplitude = Math.min(1, rms * 4);

			const ctx = canvas.getContext("2d");
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, w, h);

			const cx = w / 2;
			const cy = h / 2;
			const baseR = Math.min(w, h) * 0.18;
			const r = baseR * (1 + amplitude * 0.5);

			ctx.fillStyle = handle.color;

			ctx.globalAlpha = 0.15;
			ctx.beginPath();
			ctx.arc(cx, cy, r * 1.85 + amplitude * 18, 0, Math.PI * 2);
			ctx.fill();

			ctx.globalAlpha = 0.30;
			ctx.beginPath();
			ctx.arc(cx, cy, r * 1.35 + amplitude * 10, 0, Math.PI * 2);
			ctx.fill();

			ctx.globalAlpha = 1.0;
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.fill();

			handle.raf = requestAnimationFrame(draw);
		};

		if (audioCtx.state === "suspended") {
			audioCtx.resume().catch(()=>{});
		}
		handle.raf = requestAnimationFrame(draw);

		container._visualizer = handle;
		return handle;
	}

	RemoveAudioVisualizer(container) {
		if (container && container._visualizer) {
			container._visualizer.stop();
		}
	}

	UpdateLocalAudioVisualizer() {
		if (!this.userStream) return;
		const container = this.userStream.element.container;
		const showViz = this.isMicEnable && !this.isCamEnable;
		if (showViz) {
			this.SetupAudioVisualizer(container, this.userStream.stream, KEEP.color || "#888");
		}
		else {
			this.RemoveAudioVisualizer(container);
		}
	}

	UpdateRemoteAudioVisualizer(remote) {
		if (!remote || !remote.container) return;
		const peer = this.peers[remote.peerId];
		const color = peer && peer.info && peer.info.color ? peer.info.color : "#888";

		const stream = remote.stream;
		const audioTracks = stream.getAudioTracks();
		const videoTracks = stream.getVideoTracks();

		const hasAudio = audioTracks.some(t=> t.readyState === "live");
		const hasLiveVideo = videoTracks.some(t=> t.readyState === "live" && !t.muted);

		if (hasAudio && !hasLiveVideo) {
			this.SetupAudioVisualizer(remote.container, stream, color);
		}
		else {
			this.RemoveAudioVisualizer(remote.container);
		}
	}

	WireRemoteTrackForVisualizer(remote, track) {
		if (!track) return;
		const update = ()=> this.UpdateRemoteAudioVisualizer(remote);
		try {
			track.addEventListener("mute", update);
			track.addEventListener("unmute", update);
			track.addEventListener("ended", update);
		}
		catch {}
	}

	StopUserStream(options) {
		if (!this.userStream) return;

		const preserveFlags = !!(options && options.preserveFlags);

		const stream = this.userStream.stream;
		this.RemoveStreamFromAllPeers(stream);

		try { stream.getTracks().forEach(t=>t.stop()); } catch {}

		this.RemoveAudioVisualizer(this.userStream.element.container);

		if (this.userStream.element.container.parentElement) {
			this.localStreamsBox.removeChild(this.userStream.element.container);
		}

		this.userStream = null;
		if (!preserveFlags) {
			this.isMicEnable = false;
			this.isCamEnable = false;
		}
		this.AdjustUI();
	}

	StopDisplayStream(displayStream) {
		const index = this.displayStreams.indexOf(displayStream);
		if (index < 0) return;

		this.RemoveStreamFromAllPeers(displayStream.stream);

		try { displayStream.stream.getTracks().forEach(t=>t.stop()); } catch {}

		if (displayStream.element.container.parentElement) {
			this.localStreamsBox.removeChild(displayStream.element.container);
		}

		this.displayStreams.splice(index, 1);
		this.AdjustUI();
	}

	GetAllLocalStreams() {
		const result = [];
		if (this.userStream) result.push(this.userStream.stream);
		for (const ds of this.displayStreams) result.push(ds.stream);
		return result;
	}

	AddStreamToAllPeers(stream) {
		for (const peerId in this.peers) {
			this.AddStreamToPeer(this.peers[peerId], stream);
		}
	}

	AddStreamToPeer(peer, stream) {
		const existingSenders = peer.pc.getSenders();
		for (const track of stream.getTracks()) {
			const already = existingSenders.find(s=>s.track === track);
			if (already) continue;
			try {
				peer.pc.addTrack(track, stream);
			}
			catch (ex) {
				console.error("addTrack failed:", ex);
			}
		}
	}

	RemoveStreamFromAllPeers(stream) {
		const trackIds = new Set(stream.getTracks().map(t=>t.id));
		for (const peerId in this.peers) {
			const peer = this.peers[peerId];
			for (const sender of peer.pc.getSenders()) {
				if (sender.track && trackIds.has(sender.track.id)) {
					try { peer.pc.removeTrack(sender); } catch {}
				}
			}
		}
	}

	EnsurePeer(peerId, info) {
		if (this.peers[peerId]) {
			if (info) {
				if (info.alias) this.peers[peerId].info.alias = info.alias;
				if (info.color) {
					this.peers[peerId].info.color = info.color;
					for (const sid in this.peers[peerId].remoteStreams) {
						const remote = this.peers[peerId].remoteStreams[sid];
						if (remote.container && remote.container._visualizer) {
							remote.container._visualizer.color = info.color;
						}
					}
				}
				if (info.sender) this.peers[peerId].info.sender = info.sender;
			}
			return this.peers[peerId];
		}

		const pc = new RTCPeerConnection(Chat.RTC_CONFIG);

		const peer = {
			pc: pc,
			peerId: peerId,
			polite: this.peerId > peerId,
			makingOffer: false,
			ignoreOffer: false,
			isSettingRemoteAnswerPending: false,
			info: info || {},
			remoteStreams: {} //streamId -> {stream, container, video, label}
		};
		this.peers[peerId] = peer;

		pc.onicecandidate = ({candidate})=> {
			if (!candidate) return;
			try {
				KEEP.socket.send(JSON.stringify({
					type: "chat-ice",
					target: peerId,
					peerId: this.peerId,
					candidate: JSON.stringify(candidate)
				}));
			}
			catch {}
		};

		pc.ontrack = event=> {
			const stream = event.streams && event.streams[0]
				? event.streams[0]
				: new MediaStream([event.track]);
			this.AttachRemoteStream(peer, stream, event.track);
		};

		pc.onnegotiationneeded = async ()=> {
			try {
				peer.makingOffer = true;
				await pc.setLocalDescription();
				if (!pc.localDescription) return;
				KEEP.socket.send(JSON.stringify({
					type: "chat-sdp-offer",
					target: peerId,
					peerId: this.peerId,
					offer: JSON.stringify(pc.localDescription)
				}));
			}
			catch (ex) {
				console.error("negotiationneeded:", ex);
			}
			finally {
				peer.makingOffer = false;
			}
		};

		pc.oniceconnectionstatechange = ()=> {
			if (pc.iceConnectionState === "failed") {
				try { pc.restartIce(); } catch {}
			}
		};

		pc.onconnectionstatechange = ()=> {
			if (pc.connectionState === "failed" || pc.connectionState === "closed") {
				this.RemovePeer(peerId);
			}
		};

		for (const stream of this.GetAllLocalStreams()) {
			this.AddStreamToPeer(peer, stream);
		}

		return peer;
	}

	RemovePeer(peerId) {
		const peer = this.peers[peerId];
		if (!peer) return;

		try { peer.pc.close(); } catch {}

		for (const id in peer.remoteStreams) {
			const remote = peer.remoteStreams[id];
			this.RemoveAudioVisualizer(remote.container);
			if (remote.container && remote.container.parentElement) {
				this.remoteStreamsBox.removeChild(remote.container);
			}
			this.RemoveStreamFromOrder(peerId, id);
		}

		delete this.peers[peerId];
		this.LayoutRemoteStreams();
		this.AdjustUI();
	}

	RemoveStreamFromOrder(peerId, streamId) {
		const key = `${peerId}|${streamId}`;
		this.remoteStreamOrder = this.remoteStreamOrder.filter(o=> !(o.peerId === peerId && o.streamId === streamId));
		if (this.primaryStreamKey === key) {
			this.primaryStreamKey = null;
		}
	}

	AttachRemoteStream(peer, stream, track) {
		let remote = peer.remoteStreams[stream.id];

		if (!remote) {
			const element = this.CreateRemoteStreamElement(peer.info);
			this.remoteStreamsBox.appendChild(element.container);
			element.video.srcObject = stream;

			const key = `${peer.peerId}|${stream.id}`;

			remote = {
				stream: stream,
				container: element.container,
				video: element.video,
				label: element.label,
				peerId: peer.peerId,
				streamId: stream.id,
				key: key
			};
			peer.remoteStreams[stream.id] = remote;
			this.remoteStreamOrder.push({peerId: peer.peerId, streamId: stream.id});

			if (!this.primaryStreamKey) {
				this.primaryStreamKey = key;
			}

			element.container.onclick = ()=> {
				if (this.primaryStreamKey === key) return;
				this.primaryStreamKey = key;
				this.LayoutRemoteStreams();
			};

			const removeRemote = ()=> {
				this.RemoveAudioVisualizer(remote.container);
				if (remote.container.parentElement) {
					this.remoteStreamsBox.removeChild(remote.container);
				}
				delete peer.remoteStreams[stream.id];
				this.RemoveStreamFromOrder(peer.peerId, stream.id);
				this.LayoutRemoteStreams();
				this.AdjustUI();
			};

			stream.onremovetrack = ev=> {
				if (stream.getTracks().length === 0) {
					removeRemote();
				}
				else {
					this.UpdateRemoteAudioVisualizer(remote);
				}
			};
			stream.onaddtrack = ev=> {
				remote.video.srcObject = stream;
				if (ev && ev.track) this.WireRemoteTrackForVisualizer(remote, ev.track);
				this.UpdateRemoteAudioVisualizer(remote);
			};

			remote._cleanup = removeRemote;

			for (const t of stream.getTracks()) {
				this.WireRemoteTrackForVisualizer(remote, t);
			}
		}
		else {
			this.WireRemoteTrackForVisualizer(remote, track);
		}

		track.onended = ()=> {
			try { stream.removeTrack(track); } catch {}
			if (stream.getTracks().length === 0 && remote._cleanup) {
				remote._cleanup();
			}
			else {
				this.UpdateRemoteAudioVisualizer(remote);
			}
		};

		this.UpdateRemoteAudioVisualizer(remote);
		this.LayoutRemoteStreams();
		this.AdjustUI();
	}

	LayoutRemoteStreams() {
		const list = [];
		for (const entry of this.remoteStreamOrder) {
			const peer = this.peers[entry.peerId];
			if (!peer) continue;
			const remote = peer.remoteStreams[entry.streamId];
			if (!remote) continue;
			list.push(remote);
		}

		if (list.length === 0) return;

		if (!this.primaryStreamKey || !list.find(r=> r.key === this.primaryStreamKey)) {
			this.primaryStreamKey = list[0].key;
		}

		const primary = list.find(r=> r.key === this.primaryStreamKey);
		const secondaries = list.filter(r=> r.key !== this.primaryStreamKey);
		const hasSecondaries = secondaries.length > 0;

		primary.container.style.top    = "0%";
		primary.container.style.left   = "0%";
		primary.container.style.width  = "100%";
		primary.container.style.height = hasSecondaries ? "75%" : "100%";
		primary.container.classList.add("primary");
		primary.container.style.zIndex = "2";

		const n = secondaries.length;
		if (n === 0) return;

		const w = 100 / n;
		for (let i=0; i<n; i++) {
			const s = secondaries[i];
			s.container.style.top    = "75%";
			s.container.style.left   = `${i * w}%`;
			s.container.style.width  = `${w}%`;
			s.container.style.height = "25%";
			s.container.style.zIndex = "1";
			s.container.classList.remove("primary");
		}
	}

	async HandleMessage(message, ignoreDot=false) {
		if (message.peerId && message.peerId === this.peerId
			&& (message.action === "chat-offer" || message.action === "chat-answer"
				|| message.action === "chat-ice" || message.action === "chat-join"
				|| message.action === "chat-presence" || message.action === "chat-leave")) {
			return;
		}

		if (message.id in this.outdoing) {
			this.outdoing[message.id].style.color = "var(--clr-dark)";
			this.outdoing[message.id].style.backgroundColor = "var(--clr-pane)";
			this.outdoing[message.id].style.boxShadow = "none";
			delete this.outdoing[message.id];
		}
		else {
			const time = new Date(message.time);
			const timeString = time.toLocaleTimeString(UI.regionalFormat, {});
			const direction = message.sender === KEEP.username ? "out" : "in";

			switch (message.action) {
			case "chat-text":
				this.CreateTextBubble(message.text, direction, message.sender, message.alias, message.color, timeString, message.id);
				break;

			case "chat-image":
				this.CreateImageBubble(message.src, direction, message.sender, message.alias, message.color, timeString, message.id);
				break;

			case "chat-emoji":
				this.CreateEmojiBubble(message.url, direction, message.sender, message.alias, message.color, timeString, message.id);
				break;

			case "chat-command":
				this.CreateCommandBubble(message.command, message.args, message.icon, message.title, direction, message.sender, message.alias, message.color, timeString);
				break;

			case "chat-join":
				this.HandleJoin(message);
				break;

			case "chat-presence":
				this.HandlePresence(message);
				break;

			case "chat-leave":
				this.HandleLeave(message);
				break;

			case "chat-offer":
				this.HandleOffer(message);
				break;

			case "chat-answer":
				this.HandleAnswer(message);
				break;

			case "chat-ice":
				this.HandleIce(message);
				break;

			case "chat-stream":
				break;
			}
		}

		if (!(WIN.focused instanceof Chat) && !ignoreDot) {
			this.blinkingDot.style.backgroundColor = message.color;
			this.blinkingDot.style.boxShadow = "black 0 0 1px inset";
		}
	}

	HandleJoin(message) {
		if (!message.peerId || message.peerId === this.peerId) return;

		this.EnsurePeer(message.peerId, {
			sender: message.sender,
			alias: message.alias,
			color: message.color
		});

		try {
			KEEP.socket.send(JSON.stringify({
				type: "chat-presence",
				target: message.peerId,
				peerId: this.peerId
			}));
		}
		catch {}
	}

	HandlePresence(message) {
		if (!message.peerId || message.peerId === this.peerId) return;
		if (message.target !== this.peerId) return;

		this.EnsurePeer(message.peerId, {
			sender: message.sender,
			alias: message.alias,
			color: message.color
		});
	}

	HandleLeave(message) {
		if (!message.peerId) return;
		this.RemovePeer(message.peerId);
	}

	async HandleOffer(message) {
		if (!message.peerId || message.peerId === this.peerId) return;
		if (message.target !== this.peerId) return;

		const peer = this.EnsurePeer(message.peerId, {
			sender: message.sender,
			alias: message.alias,
			color: message.color
		});

		const description = JSON.parse(message.sdp);
		const pc = peer.pc;

		const readyForOffer =
			!peer.makingOffer &&
			(pc.signalingState === "stable" || peer.isSettingRemoteAnswerPending);

		const offerCollision = description.type === "offer" && !readyForOffer;
		peer.ignoreOffer = !peer.polite && offerCollision;
		if (peer.ignoreOffer) return;

		try {
			peer.isSettingRemoteAnswerPending = description.type === "answer";
			await pc.setRemoteDescription(description);
			peer.isSettingRemoteAnswerPending = false;

			if (description.type === "offer") {
				await pc.setLocalDescription();
				KEEP.socket.send(JSON.stringify({
					type: "chat-sdp-answer",
					target: message.peerId,
					peerId: this.peerId,
					answer: JSON.stringify(pc.localDescription)
				}));
			}
		}
		catch (ex) {
			console.error("HandleOffer:", ex);
		}
	}

	async HandleAnswer(message) {
		if (!message.peerId || message.peerId === this.peerId) return;
		if (message.target !== this.peerId) return;

		const peer = this.peers[message.peerId];
		if (!peer) return;

		const description = JSON.parse(message.sdp);

		try {
			peer.isSettingRemoteAnswerPending = true;
			await peer.pc.setRemoteDescription(description);
			peer.isSettingRemoteAnswerPending = false;
		}
		catch (ex) {
			console.error("HandleAnswer:", ex);
		}
	}

	async HandleIce(message) {
		if (!message.peerId || message.peerId === this.peerId) return;
		if (message.target !== this.peerId) return;

		const peer = this.peers[message.peerId];
		if (!peer) return;

		try {
			const candidate = JSON.parse(message.candidate);
			await peer.pc.addIceCandidate(candidate);
		}
		catch (ex) {
			if (!peer.ignoreOffer) {
				console.error("HandleIce:", ex);
			}
		}
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
			placeholder.style.color = "var(--clr-contrast)";
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

	HasRemoteStreams() {
		for (const peerId in this.peers) {
			if (Object.keys(this.peers[peerId].remoteStreams).length > 0) {
				return true;
			}
		}
		return false;
	}

	AdjustUI() {
		const hasUserStream = this.userStream !== null;
		const hasDisplayStreams = this.displayStreams.length > 0;
		const hasLocalStreams = hasUserStream || hasDisplayStreams;
		const hasRemoteStreams = this.HasRemoteStreams();

		this.micButton.style.backgroundColor = this.isMicEnable ? "var(--clr-accent)" : "transparent";
		this.micButton.style.backgroundImage = this.isMicEnable ? "url(mono/mic.svg)" : "url(mono/mic.svg?light)";
		this.camButton.style.backgroundColor = this.isCamEnable ? "var(--clr-accent)" : "transparent";
		this.camButton.style.backgroundImage = this.isCamEnable ? "url(mono/webcam.svg)" : "url(mono/webcam.svg?light)";

		this.displayButton.style.backgroundColor = hasDisplayStreams ? "var(--clr-accent)" : "transparent";
		this.displayButton.style.backgroundImage = hasDisplayStreams ? "url(mono/screenshare.svg)" : "url(mono/screenshare.svg?light)";

		if (hasLocalStreams) {
			this.localStreamsBox.style.visibility = "visible";
			this.localStreamsBox.style.opacity = "1";
		}
		else {
			this.localStreamsBox.style.visibility = "hidden";
			this.localStreamsBox.style.opacity = "0";
		}

		if (hasRemoteStreams) {
			this.remoteStreamsBox.style.visibility = "visible";
			this.remoteStreamsBox.style.opacity = "1";
		}
		else {
			this.remoteStreamsBox.style.visibility = "hidden";
			this.remoteStreamsBox.style.opacity = "0";
		}

		if (hasLocalStreams && hasRemoteStreams) {
			this.remoteStreamsBox.style.left = "156px";
			this.remoteStreamsBox.style.right = "calc(min(33%, 400px) + 24px)";
			this.chatBox.style.left = "unset";
			this.chatBox.style.width = "min(33%, 400px)";
		}
		else if (hasLocalStreams && !hasRemoteStreams) {
			this.chatBox.style.left = "156px";
			this.chatBox.style.width = "unset";
		}
		else if (!hasLocalStreams && hasRemoteStreams) {
			this.remoteStreamsBox.style.left = "8px";
			this.remoteStreamsBox.style.right = "calc(min(33%, 400px) + 24px)";
			this.chatBox.style.left = "unset";
			this.chatBox.style.width = "min(33%, 400px)";
		}
		else {
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
		if (this.input.innerHTML.length === 0) return;

		if (this.input.innerHTML.length === 4 && this.input.innerHTML === "<br>") {
			this.ClearInput();
			return;
		}

		const id = `${KEEP.username}${UI.GenerateUuid()}`;

		const normalizedHtml = this.input.innerHTML
			.replaceAll(/<br\s*\/?>/gi, "\n")
			.replaceAll(/<\/div>/gi, "\n");

		const sanitizer = document.createElement("div");
		sanitizer.innerHTML = normalizedHtml;

		let text = sanitizer.textContent
			.replaceAll(" ", "\n")
			.trim();

		try {
			KEEP.socket.send(JSON.stringify({
				id: id,
				type: "chat-text",
				text: text
			}));
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/chat.svg");
		}

		const nowString = new Date().toLocaleTimeString(UI.regionalFormat, {});

		const bubble = this.CreateTextBubble(text, "out", KEEP.username, "", KEEP.color, nowString, id);
		if (bubble) {
			bubble.style.color = "var(--clr-pane)";
			bubble.style.backgroundColor = "transparent";
			bubble.style.boxShadow = "var(--clr-pane) 0 0 0 2px inset";
		}

		const images = [];
		this.FindImgTags(this.input, images);

		for (let i=0; i<images.length; i++) {
			if (!images[i].src.startsWith("data:image/")) continue;

			try {
				KEEP.socket.send(JSON.stringify({
					id: `${KEEP.username}${UI.GenerateUuid()}`,
					type: "chat-image",
					src: images[i].src
				}));
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/chat.svg");
				return;
			}
		}

		this.ClearInput();
	}

	FindImgTags(element, images) {
		const childNodes = element.childNodes;
		for (let i=0; i<childNodes.length; i++) {
			const node = childNodes[i];
			if (node.tagName === "IMG" && node.src.startsWith("data:image/")) {
				images.push(node);
			}
			else {
				this.FindImgTags(node, images);
			}
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

	async Mic_onclick() {
		this.isMicEnable = !this.isMicEnable;
		await this.EnsureUserStream();
		this.AdjustUI();
	}

	async Webcam_onclick() {
		this.isCamEnable = !this.isCamEnable;
		await this.EnsureUserStream();
		this.AdjustUI();
	}

	async Display_onclick() {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: true
			});

			const element = this.CreateLocalStreamElement(stream, false);
			this.localStreamsBox.appendChild(element.container);
			element.video.srcObject = stream;
			element.video.muted = true;

			const displayStream = {
				stream: stream,
				element: element,
				kind: "display"
			};

			this.displayStreams.push(displayStream);

			const stopThis = ()=> this.StopDisplayStream(displayStream);
			stream.getTracks().forEach(t=>t.onended = stopThis);
			element.stopButton.onclick = stopThis;

			this.AddStreamToAllPeers(stream);
		}
		catch (ex) {
			if (ex && ex.name !== "NotAllowedError") {
				this.ConfirmBox(ex.message || String(ex), true, "mono/screenshare.svg");
			}
		}

		this.AdjustUI();
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
			setTimeout(()=> wrapper.scrollIntoView({behavior:"smooth"}),50);
		}

		return bubble;
	}

	CreateTextBubble(text, direction, sender, alias, color, time, id=null) {
		if (text.length === 0) return;

		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		bubble.textContent = text;

		if (direction === "out") {
			if (id && !(id in this.outdoing)) {
				this.outdoing[id] = bubble;
			}
		}

		return bubble;
	}

	CreateImageBubble(src, direction, sender, alias, color, time, id=null) {
		if (!src.startsWith("data:image/")) return null;

		const bubble = this.CreateBubble(direction, sender, alias, color, time);

		const image = document.createElement("img");
		image.src = src;
		image.style.maxWidth = "200px";
		bubble.appendChild(image);

		if (direction === "out") {
			if (id && !(id in this.outdoing)) {
				this.outdoing[id] = bubble;
			}
		}

		image.onclick = ()=> {
				const dialog = this.DialogBox("80%");
				if (dialog === null) return;

				const {okButton, cancelButton, innerBox} = dialog;

				innerBox.style.margin = "20px 20px 0 20px";
				innerBox.style.userSelect = "text";
				innerBox.parentElement.style.top = "10%";
				innerBox.parentElement.style.maxWidth = "80%";

				innerBox.style.backgroundImage = `url(${src})`;
				innerBox.style.backgroundSize = "contain";
				innerBox.style.backgroundPosition = "center";
				innerBox.style.backgroundRepeat = "no-repeat";

				okButton.style.display = "none";
				cancelButton.value = "Close";

				innerBox.parentElement.onclick = event=> event.stopPropagation();
				innerBox.parentElement.parentElement.onclick = ()=> dialog.Close();
			};

		return bubble;
	}

	CreateEmojiBubble(url, direction, sender, alias, color, time, id=null) {
		const bubble = this.CreateBubble(direction, sender, alias, color, time);

		const emojiBox = document.createElement("div");
		emojiBox.style.filter = "drop-shadow(#000 0 0 1px)";
		bubble.appendChild(emojiBox);

		const emoji = document.createElement("div");
		emoji.className = "chat-emoji-bubble";
		emoji.style.background = `linear-gradient(to bottom, ${color} 0%, color-mix(in hsl shorter hue, ${color} 80%, black 20%) 100%)`;
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

	CreateLocalStreamElement(stream, isUserMedia=false) {
		const container = document.createElement("div");
		container.className = "local-stream";

		const video = document.createElement("video");
		video.autoplay = true;
		video.playsInline = true;
		video.muted = true;
		video.style.width = "100%";
		video.style.height = "100%";
		video.style.objectFit = "cover";
		container.appendChild(video);

		const stopButton = document.createElement("div");
		stopButton.className = "chat-stop-stream-button";
		container.appendChild(stopButton);

		return {
			container: container,
			video: video,
			videoFeedback: video,
			stopButton: stopButton
		};
	}

	CreateRemoteStreamElement(info) {
		const container = document.createElement("div");
		container.className = "remote-stream";
		container.style.position = "absolute";
		container.style.top = "0%";
		container.style.left = "0%";
		container.style.width = "100%";
		container.style.height = "100%";
		container.style.minHeight = "0";
		container.style.boxSizing = "border-box";
		container.style.overflow = "hidden";
		container.style.transition = ".2s";

		const video = document.createElement("video");
		video.autoplay = true;
		video.playsInline = true;
		video.style.objectFit = "contain";
		container.appendChild(video);

		const label = document.createElement("div");
		label.className = "remote-stream-label";
		label.textContent = info && info.alias ? info.alias : (info && info.sender ? info.sender : "");
		if (info && info.color) {
			label.style.backgroundColor = info.color;
		}
		container.appendChild(label);

		return {container, video, label};
	}
}
