class SpeedTest extends Window {
    constructor() {
        super();

        this.setTitle("Speed test");
        this.setIcon("res/speedtest.svgz");

        this.content.style.overflowY = "auto";

        this.graph = document.createElement("div");
        this.graph.style.backgroundColor = "var(--control-color)";
        this.graph.style.width = "640px";
        this.graph.style.height = "320px";
        this.graph.style.margin = "24px auto";
        this.graph.style.borderRadius = "4px";
        this.content.append(this.graph);

        const options = document.createElement("div");
        options.style.display = "grid";
        options.style.gridTemplateColumns = "auto 64px 100px 100px 100px 100px 64px auto";
        options.style.gridTemplateRows = "repeat(6, 32px)";
        this.content.append(options);


        const connections = document.createElement("div");
        connections.innerHTML = "Concurrent connections: ";
        connections.style.gridArea = "1 / 3 / 2 / 5";
        options.appendChild(connections);

        this.rngConnections = document.createElement("input");
        this.rngConnections.type = "range";
        this.rngConnections.min = 1;
        this.rngConnections.max = 8;
        this.rngConnections.value = 2;
        this.rngConnections.style.gridArea = "1 / 5 / 2 / 7";
        options.appendChild(this.rngConnections);

        this.lblConnections = document.createElement("div");
        this.lblConnections.style.marginLeft = "8px";
        this.lblConnections.style.gridArea = "1 / 7 / 2 / 7";
        options.appendChild(this.lblConnections);


        const timeout = document.createElement("div");
        timeout.innerHTML = "Duration up to: ";
        timeout.style.gridArea = "2 / 3 / 3 / 5";
        options.appendChild(timeout);
        
        this.rngTimeout = document.createElement("input");
        this.rngTimeout.type = "range";
        this.rngTimeout.min = 5;
        this.rngTimeout.max = 60;
        this.rngTimeout.value = 10;
        this.rngTimeout.style.gridArea = "2 / 5 / 3 / 7";
        options.appendChild(this.rngTimeout);

        this.lblTimeout = document.createElement("div");
        this.lblTimeout.style.marginLeft = "8px";
        this.lblTimeout.style.gridArea = "2 / 7 / 3 / 7";
        options.appendChild(this.lblTimeout);


        const size = document.createElement("div");
        size.innerHTML = "Size up to: ";
        size.style.gridArea = "3 / 3 / 4 / 5";
        options.appendChild(size);

        this.rngSize = document.createElement("input");
        this.rngSize.type = "range";
        this.rngSize.min = 2;
        this.rngSize.max = 9;
        this.rngSize.value = 4;
        this.rngSize.style.gridArea = "3 / 5 / 4 / 7";
        options.appendChild(this.rngSize);

        this.lblSize = document.createElement("div");
        this.lblSize.style.marginLeft = "8px";
        this.lblSize.style.gridArea = "3 / 7 / 4 / 7";
        options.appendChild(this.lblSize);


        const buffer = document.createElement("div");
        buffer.innerHTML = "Buffer size: ";
        buffer.style.gridArea = "4 / 3 / 5 / 5";
        options.appendChild(buffer);

        this.rngBuffer = document.createElement("input");
        this.rngBuffer.type = "range";
        this.rngBuffer.min = 8;
        this.rngBuffer.max = 24;
        this.rngBuffer.value = 13;
        this.rngBuffer.style.gridArea = "4 / 5 / 5 / 7";
        options.appendChild(this.rngBuffer);

        this.lblBuffer = document.createElement("div");
        this.lblBuffer.style.marginLeft = "8px";
        this.lblBuffer.style.gridArea = "4 / 7 / 5 / 7";
        options.appendChild(this.lblBuffer);


        const comm = document.createElement("div");
        comm.innerHTML = "Communication: ";
        comm.style.gridArea = "5 / 3 / 6 / 5";
        options.appendChild(comm);

        this.cmbComm = document.createElement("select");
        this.cmbComm.style.gridArea = "5 / 5 / 6 / 7";
        options.appendChild(this.cmbComm);

        let optHalf = document.createElement("option");
        optHalf.value = "half";
        optHalf.text = "Half dublex";
        this.cmbComm.appendChild(optHalf);

        let optFull = document.createElement("option");
        optFull.value = "full";
        optFull.text = "Full-dublex";
        this.cmbComm.appendChild(optFull);


        this.btnStart = document.createElement("input");
        this.btnStart.type = "button";
        this.btnStart.value = "Start";
        this.btnStart.style.height = "40px";
        this.btnStart.style.margin = "16px";
        this.btnStart.style.borderRadius = "4px";
        this.btnStart.style.gridArea = "6 / 4 / 7 / 6";
        options.appendChild(this.btnStart);


        this.rngTimeout.oninput = () => {
            this.lblTimeout.innerHTML = this.rngTimeout.value + " s";
        };

        this.rngConnections.oninput =
        this.rngSize.oninput = () => {
            this.lblConnections.innerHTML = this.rngConnections.value;

            let totalSize = Math.pow(2, this.rngSize.value) * this.rngConnections.value;
            this.lblSize.innerHTML = (totalSize < 1024) ? totalSize + " MB" : totalSize/1024 + " GB";
        };

        this.rngBuffer.oninput = () => {
            let bufferSize = Math.pow(2, this.rngBuffer.value);
            this.lblBuffer.innerHTML = this.SizeToString(bufferSize);
        };

        this.btnStart.onclick = () => this.StartTest();

        this.rngTimeout.oninput();
        this.rngConnections.oninput();
        this.rngBuffer.oninput();

        this.InitGraph();
    }

    InitGraph() {
        this.graph.style.display = "grid";
        this.graph.style.gridTemplateColumns = "320px 320px";
        this.graph.style.gridTemplateRows = "32px 150px repeat(4, 32px)";
        this.graph.style.color = "#202020";
        this.graph.style.fontSize = "large";
        this.graph.style.fontWeight = "600";
        this.graph.style.userSelect = "text";

        let lblDownstream = document.createElement("div");
        lblDownstream.innerHTML = "Downstream";
        lblDownstream.style.textDecoration = "underline";
        lblDownstream.style.textAlign = "center";
        lblDownstream.style.gridArea = "2 / 0 / 3 / 1";
        lblDownstream.style.margin = "4px";
        this.graph.appendChild(lblDownstream);

        let lblUpstream = document.createElement("div");
        lblUpstream.innerHTML = "Upstream";
        lblUpstream.style.textDecoration = "underline";
        lblUpstream.style.textAlign = "center";
        lblUpstream.style.gridArea = "2 / 0 / 3 / 1";
        lblUpstream.style.margin = "4px";
        this.graph.appendChild(lblUpstream);

        this.svgDown = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgDown.setAttribute("width", "300");
        this.svgDown.setAttribute("height", "150");
        this.svgDown.style.gridArea = "2 / 1 / 3 / 2";
        this.svgDown.style.marginLeft = "10px";
        this.graph.appendChild(this.svgDown);

        this.svgUp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgUp.setAttribute("width", "300");
        this.svgUp.setAttribute("height", "150");
        this.svgUp.style.gridArea = "2 / 2 / 3 / 3";
        this.svgUp.style.marginLeft = "10px";
        this.graph.appendChild(this.svgUp);

        this.lblDownAvg = document.createElement("div");
        this.lblDownAvg.innerHTML = "Average: --";
        this.lblDownAvg.style.textAlign = "center";
        this.lblDownAvg.style.gridArea = "3 / 1 / 4 / 2";
        this.graph.appendChild(this.lblDownAvg);

        this.lblUpAvg = document.createElement("div");
        this.lblUpAvg.innerHTML = "Average: --";
        this.lblUpAvg.style.textAlign = "center";
        this.lblUpAvg.style.gridArea = "3 / 2 / 4 / 3";
        this.graph.appendChild(this.lblUpAvg);

        this.lblDownPeak = document.createElement("div");
        this.lblDownPeak.innerHTML = "Peak: --";
        this.lblDownPeak.style.textAlign = "center";
        this.lblDownPeak.style.gridArea = "4 / 1 / 5 / 2";
        this.graph.appendChild(this.lblDownPeak);

        this.lblUpPeak = document.createElement("div");
        this.lblUpPeak.innerHTML = "Peak: --";
        this.lblUpPeak.style.textAlign = "center";
        this.lblUpPeak.style.gridArea = "4 / 2 / 5 / 3";
        this.graph.appendChild(this.lblUpPeak);


        this.lblDownProgress = document.createElement("div");
        this.lblDownProgress.innerHTML = "--";
        this.lblDownProgress.style.textAlign = "center";
        this.lblDownProgress.style.gridArea = "6 / 1 / 7 / 2";
        this.graph.appendChild(this.lblDownProgress);

        this.lblUpProgress = document.createElement("div");
        this.lblUpProgress.innerHTML = "--";
        this.lblUpProgress.style.textAlign = "center";
        this.lblUpProgress.style.gridArea = "6 / 2 / 7 / 3";
        this.graph.appendChild(this.lblUpProgress);
    }

    StartTest() {
        this.Freeze();

        this.socket = [];
        this.downstream = [];
        this.upstream = [];
        this.downpeak = 0
        this.uppeak = 0;
        this.lastPlot = new Date().getTime();

        for (let i = 0; i < this.rngConnections.value; i++)
            this.DownstreamTest(i);

        if (this.cmbComm.value == "full")
            for (let i = 0; i < this.rngConnections.value; i++)
                this.UpstreamTest(i);
    }

    Freeze() {
        this.btnStart.setAttribute("disabled", true);
        this.rngTimeout.setAttribute("disabled", true);
        this.rngConnections.setAttribute("disabled", true);
        this.rngSize.setAttribute("disabled", true);
        this.rngBuffer.setAttribute("disabled", true);
        this.cmbComm.setAttribute("disabled", true);
    }

    Unfreeze() {
        this.btnStart.removeAttribute("disabled");
        this.rngTimeout.removeAttribute("disabled");
        this.rngConnections.removeAttribute("disabled");
        this.rngSize.removeAttribute("disabled");
        this.rngBuffer.removeAttribute("disabled");
        this.cmbComm.removeAttribute("disabled");
    }

    DownstreamTest(index) {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        let ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + `/ws/speedtest_down&timeout=${this.rngTimeout.value}&size=${Math.pow(2, this.rngSize.value)}&buffer=${Math.pow(2, this.rngBuffer.value)}`);

        ws.onopen = () => {
            this.socket.push("d"+index);
            this.downstarttime = new Date().getTime();
        };

        ws.onmessage = event => {
            this.downstream.push(new Date().getTime());
            this.Plot();
        };

        ws.onclose = () => {
            this.socket.splice(this.socket.indexOf("d"+index), 1);
            if (this.socket.length === 0) {
                this.Plot(true);

                if (this.cmbComm.value == "full") {
                    this.Unfreeze();
                } else {
                    for (let i = 0; i < this.rngConnections.value; i++)
                        this.UpstreamTest(i);
                }
            }
        };

        ws.onerror = error => console.log(error);
    }

    UpstreamTest(index) {
        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        const buffer = new ArrayBuffer(Math.pow(2, this.rngBuffer.value));

        let ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + `/ws/speedtest_up&timeout=${this.rngTimeout.value}&size=${Math.pow(2, this.rngSize.value)}&buffer=${Math.pow(2, this.rngBuffer.value)}`);

        let sendCount = 0;

        ws.onopen = () => {
            this.socket.push("u"+index);
            this.upstarttime = new Date().getTime();
        };

        ws.onmessage = event => {
            if (new Date().getTime() - this.upstarttime < 1000 * this.rngTimeout.value && sendCount < Math.pow(2, this.rngSize.value) * 1024 * 1024) {
                ws.send(buffer);
                this.upstream.push(new Date().getTime());
                sendCount += Math.pow(2, this.rngBuffer.value);
                this.Plot();
            }
        };

        ws.onclose = () => {
            this.socket.splice(this.socket.indexOf("u"+index),1);

            if (this.socket.length === 0) {
                this.Plot(true);
                this.Unfreeze();
            }
        };

        ws.onerror = error => console.log(error);
    }

    Plot(force = false) {
        if (new Date().getTime() - this.lastPlot < 100 && !force) return;

        if (this.downstream.length > 0) {
            let downSize = this.downstream.length * Math.pow(2, this.rngBuffer.value); //bytes
            let downDuration = (this.downstream[this.downstream.length - 1] - this.downstarttime) / 1000; //s
            let downAvg = downSize * 8 / downDuration; //bps

            this.lblDownAvg.innerHTML = "Agerage: " + ((downAvg < 1000000) ? Math.round(downAvg / 1000) + " Kbps" : Math.round(downAvg / 1000000) + " Mbps");
            this.lblDownProgress.innerHTML = this.SizeToString(downSize) + " / " + Math.round(downDuration * 10) / 10 + "s";
        }

        if (this.upstream.length > 0) {
            let upSize = this.upstream.length * Math.pow(2, this.rngBuffer.value); //bytes
            let upDuration = (this.upstream[this.upstream.length - 1] - this.upstarttime) / 1000; //s
            let upAvg = upSize * 8 / upDuration; //bps

            this.lblUpAvg.innerHTML = "Average: " + ((upAvg < 1000000) ? Math.round(upAvg / 1000) + " Kbps" : Math.round(upAvg / 1000000) + " Mbps");
            this.lblUpProgress.innerHTML = this.SizeToString(upSize) + " / " + Math.round(upDuration * 10) / 10 + "s";
        } else {
            this.lblUpAvg.innerHTML = "Average: --";
            this.lblUpProgress.innerHTML = "--";
        }

        this.lastPlot = new Date().getTime();
    }

    SizeToString(value) {
        let size = parseInt(value);

        if (size <= 1024) return size + " B";
        if (size < Math.pow(1024, 2)) return Math.round(size / 1024) + " KB";
        if (size < Math.pow(1024, 3)) return Math.round(size / Math.pow(1024, 2) * 10) / 10 + " MB";
        if (size < Math.pow(1024, 4)) return Math.round(size / Math.pow(1024, 3) * 10) / 10 + " GB";
        if (size < Math.pow(1024, 5)) return Math.round(size / Math.pow(1024, 4) * 10) / 10 + " TB";
        if (size < Math.pow(1024, 6)) return Math.round(size / Math.pow(1024, 5) * 10) / 10 + " EB"; //Exabyte
        if (size < Math.pow(1024, 7)) return Math.round(size / Math.pow(1024, 6) * 10) / 10 + " ZB"; //Zettabyte
        if (size < Math.pow(1024, 8)) return Math.round(size / Math.pow(1024, 7) * 10) / 10 + " YB"; //Yottabyte
        if (size < Math.pow(1024, 9)) return Math.round(size / Math.pow(1024, 8) * 10) / 10 + " BB"; //Brontobyte
        return size;
    }
}