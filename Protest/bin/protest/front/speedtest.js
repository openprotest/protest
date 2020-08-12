class SpeedTest extends Window {
    constructor() {
        super();

        this.setTitle("Speed test");
        this.setIcon("res/speedtest.svgz");

        this.content.style.overflowY = "auto";

        this.graph = document.createElement("div");
        this.graph.style.backgroundColor = "var(--pane-color)";
        this.graph.style.width = "640px";
        this.graph.style.height = "320px";
        this.graph.style.margin = "24px auto";
        this.graph.style.borderRadius = "4px";
        this.content.append(this.graph);

        const options = document.createElement("div");
        options.style.display = "grid";
        options.style.gridTemplateColumns = "auto 64px 100px 100px 100px 100px 64px auto";
        options.style.gridTemplateRows = "repeat(5, 32px)";
        this.content.append(options);


        const connections = document.createElement("div");
        connections.innerHTML = "Concurrent connections: ";
        connections.style.gridArea = "1 / 3 / 2 / 5";
        options.appendChild(connections);

        this.rngConnections = document.createElement("input");
        this.rngConnections.type = "range";
        this.rngConnections.min = 1;
        this.rngConnections.max = 6;
        this.rngConnections.value = 2;
        this.rngConnections.style.gridArea = "1 / 5 / 2 / 7";
        options.appendChild(this.rngConnections);

        this.lblConnections = document.createElement("div");
        this.lblConnections.style.marginLeft = "8px";
        this.lblConnections.style.gridArea = "1 / 7 / 2 / 7";
        options.appendChild(this.lblConnections);


        const timeout = document.createElement("div");
        timeout.innerHTML = "Duration: ";
        timeout.style.gridArea = "2 / 3 / 3 / 5";
        options.appendChild(timeout);
        
        this.rngTimeout = document.createElement("input");
        this.rngTimeout.type = "range";
        this.rngTimeout.min = 5;
        this.rngTimeout.max = 30;
        this.rngTimeout.value = 10;
        this.rngTimeout.style.gridArea = "2 / 5 / 3 / 7";
        options.appendChild(this.rngTimeout);

        this.lblTimeout = document.createElement("div");
        this.lblTimeout.style.marginLeft = "8px";
        this.lblTimeout.style.gridArea = "2 / 7 / 3 / 7";
        options.appendChild(this.lblTimeout);


        const comm = document.createElement("div");
        comm.innerHTML = "Communication: ";
        comm.style.gridArea = "3 / 3 / 4 / 5";
        options.appendChild(comm);

        this.cmbComm = document.createElement("select");
        this.cmbComm.setAttribute("disabled", true);
        this.cmbComm.style.gridArea = "3 / 5 / 4 / 7";
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
        this.btnStart.style.gridArea = "4 / 4 / 5 / 6";
        options.appendChild(this.btnStart);


        this.rngTimeout.oninput = () => {
            this.lblTimeout.innerHTML = this.rngTimeout.value + " s";
        };

        this.rngConnections.oninput = () => {
            this.lblConnections.innerHTML = this.rngConnections.value;
        };

        this.btnStart.onclick = () => this.StartTest();

        this.rngTimeout.oninput();
        this.rngConnections.oninput();

        this.InitGraph();

        this.kilo = "";
        for (let i = 0; i < 1024; i++)
            this.kilo += String.fromCharCode(Math.round(Math.random() * 255));
    }

    InitGraph() {
        this.graph.style.display = "grid";
        this.graph.style.gridTemplateColumns = "auto";
        this.graph.style.gridTemplateRows = "32px 175px repeat(2, 32px)";
        this.graph.style.color = "#202020";
        this.graph.style.fontSize = "large";
        this.graph.style.fontWeight = "600";
        this.graph.style.userSelect = "text";

        this.svgDown = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgDown.setAttribute("width", "300");
        this.svgDown.setAttribute("height", "150");
        this.svgDown.style.gridArea = "2 / 1 / 3 / 2";
        this.svgDown.style.marginLeft = "10px";
        this.graph.appendChild(this.svgDown);

        this.lblDownAvg = document.createElement("div");
        this.lblDownAvg.innerHTML = "Average: --";
        this.lblDownAvg.style.textAlign = "center";
        this.lblDownAvg.style.gridArea = "3 / 1 / 4 / 2";
        this.graph.appendChild(this.lblDownAvg);

        this.lblDownProgress = document.createElement("div");
        this.lblDownProgress.innerHTML = "--";
        this.lblDownProgress.style.textAlign = "center";
        this.lblDownProgress.style.gridArea = "4 / 1 / 5 / 2";
        this.graph.appendChild(this.lblDownProgress);
    }

    StartTest() {
        this.Freeze();

        this.startTime = Infinity;
        this.downstream = [];
        for (let i = 0; i < this.rngConnections.value; i++)
            this.downstream.push(0);

        for (let i = 0; i < this.rngConnections.value; i++)
            this.DownstreamTest(i);

        //if (this.cmbComm.value == "full")
        //    for (let i = 0; i < this.rngConnections.value; i++)
        //        this.UpstreamTest(i);
    }

    Freeze() {
        this.btnStart.setAttribute("disabled", true);
        this.rngTimeout.setAttribute("disabled", true);
        this.rngConnections.setAttribute("disabled", true);
        //this.cmbComm.setAttribute("disabled", true);
    }

    Unfreeze() {
        this.btnStart.removeAttribute("disabled");
        this.rngTimeout.removeAttribute("disabled");
        this.rngConnections.removeAttribute("disabled");
        //this.cmbComm.removeAttribute("disabled");
    }

    DownstreamTest(index) {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {

            if (xhr.readyState === 3) {
                this.downstream[index] = xhr.responseText.length;

                let d = Date.now() - this.startTime;
                let s = this.downstream.reduce((sum, next)=> sum + next);

                this.lblDownAvg.innerHTML = Math.round(8 * (s / d) / 1000) + " Kb/s";


            } else if (xhr.readyState === 2) {
                if (Date.now() < this.startTime) this.startTime = Date.now();

            } else if (xhr.readyState === 4 && xhr.status === 200) {
                //if (this.cmbComm.value != "full")
                //    this.UpstreamTest(index);                
                this.Unfreeze();

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("GET", `speedtest_downstream&timeout=${this.rngTimeout.value}`, true);
        xhr.send();
    }

    UpstreamTest(index) {

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                
            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };

        xhr.open("POST", `speedtest_upstream&timeout=${this.rngTimeout.value}`, true);
        xhr.send(this.kilo);

        /*ws.onclose = () => {
            this.socket.splice(this.socket.indexOf("u"+index),1);

            if (this.socket.length === 0) {
                this.Plot(true);
                this.Unfreeze();
            }
        };

        ws.onerror = error => console.log(error);*/
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