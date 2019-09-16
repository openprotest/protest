const GRAPH_WIDTH = 560;
const GRAPH_SCALE_FACTOR = .25;
class Graph {

    constructor(array) {
        this.offset = 0;
        this.rollingElements = [];
        
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("width", GRAPH_WIDTH);
        this.svg.setAttribute("height", "250");

        this.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        this.svg.appendChild(this.defs);

        const gradientOpaque = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradientOpaque.setAttribute("id", "opaque");
        gradientOpaque.setAttribute("x1", "0");
        gradientOpaque.setAttribute("y1", "0");
        gradientOpaque.setAttribute("x2", "100%");
        gradientOpaque.setAttribute("y2", "0");
        this.defs.appendChild(gradientOpaque);

        const stopS1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopS1.setAttribute("offset", "0%");
        stopS1.setAttribute("style", "stop-color:rgb(208,208,208);stop-opacity:0");
        gradientOpaque.appendChild(stopS1);

        const stopS2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopS2.setAttribute("offset", "100%");
        stopS2.setAttribute("style", "stop-color:rgb(208,208,208);stop-opacity:1");
        gradientOpaque.appendChild(stopS2);
        
        this.opaque = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        this.opaque.setAttribute("x", 500);
        this.opaque.setAttribute("y", 0);
        this.opaque.setAttribute("width", 60);
        this.opaque.setAttribute("height", 250);        
        this.opaque.setAttribute("fill", "url(#opaque)");
        this.opaque.style = "opacity:0";

        const gradientDownstream = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradientDownstream.setAttribute("id", "downstream-gradient");
        gradientDownstream.setAttribute("x1", "0%");
        gradientDownstream.setAttribute("y1", "0%");
        gradientDownstream.setAttribute("x2", "0%");
        gradientDownstream.setAttribute("y2", "100%");
        this.defs.appendChild(gradientDownstream);

        const stopDS1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopDS1.setAttribute("offset", "0%");
        stopDS1.setAttribute("style", "stop-color:rgb(0,232,118);stop-opacity:.6");
        gradientDownstream.appendChild(stopDS1);

        const stopDS2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopDS2.setAttribute("offset", "100%");
        stopDS2.setAttribute("style", "stop-color:rgb(232,232,0);stop-opacity:.05");
        gradientDownstream.appendChild(stopDS2);

        const gradientUpstream = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradientUpstream.setAttribute("id", "upstream-gradient");
        gradientUpstream.setAttribute("x1", "0%");
        gradientUpstream.setAttribute("y1", "0%");
        gradientUpstream.setAttribute("x2", "0%");
        gradientUpstream.setAttribute("y2", "100%");
        this.defs.appendChild(gradientUpstream);

        const stopUS1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopUS1.setAttribute("offset", "0%");
        stopUS1.setAttribute("style", "stop-color:rgb(232,232,0);stop-opacity:.05");
        gradientUpstream.appendChild(stopUS1);

        const stopUS2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopUS2.setAttribute("offset", "100%");
        stopUS2.setAttribute("style", "stop-color:rgb(232,118,0);stop-opacity:.6");
        gradientUpstream.appendChild(stopUS2);

        const lblRx = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lblRx.innerHTML = "Rx";
        lblRx.setAttribute("x", "4");
        lblRx.setAttribute("y", "96");
        lblRx.setAttribute("fill", "black");
        this.svg.appendChild(lblRx);

        const lblTx = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lblTx.innerHTML = "Tx";
        lblTx.setAttribute("x", "4");
        lblTx.setAttribute("y", "116");
        lblTx.setAttribute("fill", "black");
        this.svg.appendChild(lblTx);
        
        this.xMin = parseInt(array[0][0].substring(0,2)) * 24 * 60 +
                   parseInt(array[0][0].substring(2,4)) * 60 +
                   parseInt(array[0][0].substring(4,6));

        this.lastPixel = (parseInt(array[array.length-1][0].substring(0, 2)) * 24 * 60 +
                         parseInt(array[array.length-1][0].substring(2, 4)) * 60 +
                         parseInt(array[array.length-1][0].substring(4, 6)) - this.xMin) * GRAPH_SCALE_FACTOR ;

        let map = array.map(o => {
            let time = parseInt(o[0].substring(0,2)) * 24 * 60 +
                       parseInt(o[0].substring(2,4)) * 60 +
                       parseInt(o[0].substring(4,6));

            let obj = {};
            //obj.timestamp = time;
            obj.t = this.lastPixel - (time-this.xMin) * GRAPH_SCALE_FACTOR;
            obj.date = [o[0].substring(0,2), o[0].substring(2,4), o[0].substring(4,6)];
            obj.rx = o[1];
            obj.tx = o[2];

            return obj;
        });

        this.Draw(map);

        this.svg.onmousewheel = event => {
            this.Roll(event.deltaY);
            event.preventDefault();
        };
    }

    Attach(container) {
        container.appendChild(this.svg);
    }

    Draw(map) {
        let stringPathRx = "M " + (GRAPH_WIDTH-60 - this.lastPixel) + " 100";
        let stringPathTx = "M " + (GRAPH_WIDTH-60 - this.lastPixel) + " 100";

        let maxRx = 0, maxTx = 0;
        for (let i = 0; i < map.length; i++) { //find max value
            if (map[i].rx > maxRx) maxRx = map[i].rx;
            if (map[i].tx > maxTx) maxTx = map[i].tx;
        }

        for (let i = 0; i < map.length; i++) //path and dots
            for (let j = 1; j < 3; j++) {
                let x = GRAPH_WIDTH - 60 - map[i].t;
                let y = 100 + Math.round(j==1 ? -80 * map[i].rx / maxRx : 80 * map[i].tx / maxTx);
                let r = Math.min(4, Math.abs(100 - y) / 2);

                const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                dot.setAttribute("cx", x);
                dot.setAttribute("cy", y);
                dot.setAttribute("r", r);
                dot.setAttribute("fill", j==1 ? "rgb(95,177,39)" : "rgb(232,118,0)");
                this.svg.appendChild(dot);
                this.rollingElements.push(dot);

                if (i > 0) {
                    let xp = GRAPH_WIDTH - 60 - map[i - 1].t;
                    let x1 = x - 5;
                    let y1 = Math.round(100 + (j == 1 ? -80 * (map[i].rx * .2 + map[i - 1].rx * .75) / maxRx : 80 * (map[i].tx * .25 + map[i - 1].tx * .8) / maxTx));
                    let x2 = xp + 5;
                    let y2 = Math.round(100 + (j == 1 ? -80 * (map[i].rx * .8 + map[i - 1].rx * .25) / maxRx : 80 * (map[i].tx * .75 + map[i - 1].tx * .2) / maxTx));

                    if (j == 1)
                        stringPathRx += " C " + x1 + " " + y1 + " " + x2 + " " + y2 + " " + x + " " + y;
                    else
                        stringPathTx += " C " + x1 + " " + y1 + " " + x2 + " " + y2 + " " + x + " " + y;
                } else {
                    if (j == 1)
                        stringPathRx += " L " + x + " " + y;
                    else
                        stringPathTx += " L " + x + " " + y;
                }
            }

        stringPathRx += " L " + (GRAPH_WIDTH - 60) + " 100 Z";
        stringPathTx += " L " + (GRAPH_WIDTH - 60) + " 100 Z";

        const pathRx = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathRx.setAttribute("fill", "url(#downstream-gradient)");
        pathRx.setAttribute("style", "stroke:rgb(95,177,39);stroke-width:2");
        pathRx.setAttribute("d", stringPathRx);
        this.svg.appendChild(pathRx);
        this.rollingElements.push(pathRx);

        const pathTx = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathTx.setAttribute("fill", "url(#upstream-gradient)");
        pathTx.setAttribute("style", "stroke:rgb(232,118,0);stroke-width:2");
        pathTx.setAttribute("d", stringPathTx);
        this.svg.appendChild(pathTx);
        this.rollingElements.push(pathTx);

        this.svg.appendChild(this.opaque);

        let stepRx = Math.round(maxRx / Math.pow(10, maxRx.toString().length - 1)) + 1; //Rx
        for (let i = 5; i > 0; i--)
            if (stepRx % i === 0) {
                stepRx /= i;
                break;
            }
        stepRx *= Math.pow(10, maxRx.toString().length - 1);
        if (maxRx / stepRx > 3) stepRx *= 2;
        if (maxRx / stepRx < 2) stepRx /= 2;

        for (let i = stepRx; i < maxRx + stepRx; i += stepRx) { //vert. lines Rx
            if (100 - 80 * i / maxRx < 0) continue;

            const newLine = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            newLine.setAttribute("x", "0");
            newLine.setAttribute("y", 100 - Math.round(80 * i / maxRx));
            newLine.setAttribute("width", GRAPH_WIDTH - 60);
            newLine.setAttribute("height", 1);
            newLine.setAttribute("fill", "rgba(0,0,0,.2)");
            this.svg.appendChild(newLine);

            const lblLine = document.createElementNS("http://www.w3.org/2000/svg", "text");
            lblLine.innerHTML = this.BytesToString(i);
            lblLine.setAttribute("x", GRAPH_WIDTH - 52);
            lblLine.setAttribute("y", Math.max(100 - Math.round(80 * i / maxRx - 4),8));
            lblLine.setAttribute("fill", "rgba(0,0,0,.4)");
            lblLine.setAttribute("font-size", "10.5px");
            this.svg.appendChild(lblLine);
        }

        let stepTx = Math.round(maxTx / Math.pow(10, maxTx.toString().length - 1)) + 1; //Tx
        for (let i = 5; i > 0; i--)
            if (stepTx % i === 0) {
                stepTx /= i;
                break;
            }
        stepTx *= Math.pow(10, maxTx.toString().length - 1);
        if (maxTx / stepTx > 3) stepTx *= 2;
        if (maxTx / stepTx < 2) stepTx /= 2;

        for (let i = stepTx; i < maxTx + stepTx; i += stepTx) { //vert. lines Tx
            if (100 + 80 * i / maxTx > 200) continue;

            const newLine = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            newLine.setAttribute("x", "0");
            newLine.setAttribute("y", 100 + Math.round(80 * i / maxTx));
            newLine.setAttribute("width", GRAPH_WIDTH - 60);
            newLine.setAttribute("height", 1);
            newLine.setAttribute("fill", "rgba(0,0,0,.2)");
            this.svg.appendChild(newLine);

            const lblLine = document.createElementNS("http://www.w3.org/2000/svg", "text");
            lblLine.innerHTML = this.BytesToString(i);
            lblLine.setAttribute("x", GRAPH_WIDTH - 52);
            lblLine.setAttribute("y", 100 + Math.round(80 * i / maxTx + 4));
            lblLine.setAttribute("fill", "rgba(0,0,0,.4)");
            lblLine.setAttribute("font-size", "10.5px");
            this.svg.appendChild(lblLine);
        }

        const lineXAaxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineXAaxis.setAttribute("x1", "0");
        lineXAaxis.setAttribute("y1", "100");
        lineXAaxis.setAttribute("x2", GRAPH_WIDTH);
        lineXAaxis.setAttribute("y2", "100");
        lineXAaxis.setAttribute("style", "stroke:rgb(0,0,0);stroke-width:2");
        this.svg.appendChild(lineXAaxis);


        let from = (map[0].date[0] * 24 * 60 + map[0].date[1] * 60);
        from -= from % 120;

        let to = (map[map.length-1].date[0] * 24 * 60 + map[map.length-1].date[1] * 60);
        to -= to % 120; 

        for (let i = from; i <= to; i += 120) {
            let date = Math.round((i - (i % (60 * 24))) / (60 * 24));
            let time = ((i % (60 * 24)) / 60).toString().padStart(2,"0") + ":00";

            let x = GRAPH_WIDTH - 60 - (this.lastPixel - (i-this.xMin) * GRAPH_SCALE_FACTOR);

            if (time == "00:00") {
                const dateOutline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                dateOutline.setAttribute("x", x - 10);
                dateOutline.setAttribute("y", 220);
                dateOutline.setAttribute("width", 20);
                dateOutline.setAttribute("height", 20);
                dateOutline.style = "stroke:rgb(32,32,32);stroke-width:2;fill:rgba(0,0,0,0)";
                this.svg.appendChild(dateOutline);
                this.rollingElements.push(dateOutline);

                const dateTitle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                dateTitle.setAttribute("x", x - 10);
                dateTitle.setAttribute("y", 220);
                dateTitle.setAttribute("width", 20);
                dateTitle.setAttribute("height", 4);
                dateTitle.fill = "rgb(32,32,32)";
                this.svg.appendChild(dateTitle);
                this.rollingElements.push(dateTitle);

                const dateLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                dateLabel.innerHTML = date;
                dateLabel.setAttribute("x", x);
                dateLabel.setAttribute("y", 236);
                dateLabel.setAttribute("width", 20);
                dateLabel.setAttribute("height", 4);
                dateLabel.setAttribute("font-size", "12px");
                dateLabel.setAttribute("font-weight", "bold");
                dateLabel.setAttribute("text-anchor", "middle");
                dateLabel.fill = "rgb(32,32,32)";
                this.svg.appendChild(dateLabel);
                this.rollingElements.push(dateLabel);

            } else {
                const lblDate = document.createElementNS("http://www.w3.org/2000/svg", "text");
                lblDate.innerHTML = time;
                lblDate.setAttribute("x", x-12);
                lblDate.setAttribute("y", 235);
                lblDate.setAttribute("fill", "rgb(32,32,32)");
                lblDate.setAttribute("font-size", "9px");
                this.svg.appendChild(lblDate);
                this.rollingElements.push(lblDate);
            }

            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", x);
            dot.setAttribute("cy", 212);
            dot.setAttribute("r", 2);
            dot.setAttribute("fill", "rgb(32,32,32)");
            this.svg.appendChild(dot);
            this.rollingElements.push(dot);
        }

    }

    Roll(value) {
        if ((this.offset + value) > this.lastPixel + 100) return; 

        this.offset = Math.max(this.offset + value, 0);
        this.opaque.style = this.offset == 0 ? "opacity:0" : "opacity:1";

        for (let i = 0; i < this.rollingElements.length; i++)
            this.rollingElements[i].style.transform = "translateX(" + this.offset + "px)";
    }

    BytesToString(value) {
        if (value < 1024) return value + " B";
        if (value < Math.pow(1024,2)) return Math.round(value/1024) + " KB";
        if (value < Math.pow(1024,3)) return Math.round(value/Math.pow(1024,2)) + " MB";
        if (value < Math.pow(1024,4)) return Math.round(value/Math.pow(1024,3)) + " GB";
        if (value < Math.pow(1024,5)) return Math.round(value/Math.pow(1024,4)) + " TB";
        return Math.round(value / Math.pow(1024,5)) + " PB";
    }

}