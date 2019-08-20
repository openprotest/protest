class SpeedTest extends Window {
    constructor() {
        super();

        this.setTitle("Speed test");
        this.setIcon("res/speedtest.svgz");

        this.escAction = () => { this.StopTest(); };

        /*
         half-dublex/full-dublex
         big packets
         small packets
         multiple connections
        */

        this.content.style.overflow = "auto";
        this.content.style.textAlign = "center";

        this.content.appendChild(document.createElement("br"));

        let lblType = document.createElement("div");
        lblType.innerHTML = "Test type: ";
        lblType.style.display = "inline-block";
        this.content.appendChild(lblType);

        this.selType = document.createElement("select");
        this.selType.setAttribute("disabled", true);
        this.content.appendChild(this.selType);

        let optHalfDublex = document.createElement("option");
        optHalfDublex.innerHTML = "Half-dublex";
        this.selType.appendChild(optHalfDublex);

        let optFullDublex = document.createElement("option");
        optFullDublex.innerHTML = "Full-dublex";
        this.selType.appendChild(optFullDublex);

        this.content.appendChild(document.createElement("br"));
        this.content.appendChild(document.createElement("br"));


        let svgGraph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgGraph.setAttribute("width", "640");
        svgGraph.setAttribute("height", "200");
        svgGraph.style.backgroundColor = "var(--control-color)";
        this.content.appendChild(svgGraph);

        let separator1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        separator1.setAttribute("x", "319px");
        separator1.setAttribute("y", "0");
        separator1.setAttribute("width", "2px");
        separator1.setAttribute("height", "200px");
        separator1.style.fill = "rgb(56,56,56)";
        svgGraph.appendChild(separator1);
        
        this.content.appendChild(document.createElement("br"));
        this.content.appendChild(document.createElement("br"));
               
        this.btnStart = document.createElement("input");
        this.btnStart.type = "button";
        this.btnStart.value = "Start";
        this.btnStart.style.width = "96px";
        this.btnStart.style.height = "40px";
        this.content.appendChild(this.btnStart);

        this.btnStart.onclick = () => { this.StartTest(); };
    }

    StartTest() {
        this.ws = null;

        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/speedtest");
        let count = 0;

        this.ws.onopen = event => {
            console.log("open");
            this.btnStart.value = "Stop";
            this.ws.send("Half");

            this.btnStart.onclick = () => { this.StopTest(); };
        };

        this.ws.onclose = () => {
            console.log("close");
            console.log(count);
            this.StopTest();
        };


        this.ws.onmessage = event => {
            console.log(event.data.size);
            count++;
            if (event.data.size == 2) {
                this.StopTest();
            }
        };

        this.ws.onerror = error => {
            console.log("error");
            this.StopTest();
            this.ConfirmBox("Socket error.", true);
        };

    }

    StopTest() {
        this.btnStart.value = "Start";
        this.ws.close();

        this.btnStart.onclick = () => { this.StartTest(); };
    }

    SendUpstream() {
        let array = new Uint8Array(2048);
        while (this.ws.OPEN) {
            this.ws.send(array);
        }
    }
}