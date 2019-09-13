const GRAPH_WIDTH = 560;
class Graph {

    constructor() {
        this.offset = 0;
        this.scale = 1;

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("width", GRAPH_WIDTH);
        this.svg.setAttribute("height", "200");

        this.svg.onmousewheel = event => {
            event.preventDefault();
        };
    }

    Attach(container) {
        container.appendChild(this.svg);
    }

    Push(array) {
        this.Draw(array);
    }

    Draw(array) {
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        this.svg.appendChild(defs);

        const gradientDownstream = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradientDownstream.setAttribute("id", "downstream-gradient");
        gradientDownstream.setAttribute("x1", "0%");
        gradientDownstream.setAttribute("y1", "0%");
        gradientDownstream.setAttribute("x2", "0%");
        gradientDownstream.setAttribute("y2", "100%");
        defs.appendChild(gradientDownstream);

        const stopDS1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopDS1.setAttribute("offset", "0%");
        stopDS1.setAttribute("style", "stop-color:rgb(0,232,118);stop-opacity:.5");
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
        defs.appendChild(gradientUpstream);

        const stopUS1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopUS1.setAttribute("offset", "0%");
        stopUS1.setAttribute("style", "stop-color:rgb(232,232,0);stop-opacity:.05");
        gradientUpstream.appendChild(stopUS1);

        const stopUS2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stopUS2.setAttribute("offset", "100%");
        stopUS2.setAttribute("style", "stop-color:rgb(232,118,0);stop-opacity:.5");
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

        let stringPathRx = "M " + (GRAPH_WIDTH-60) + " 100";
        let stringPathTx = "M " + (GRAPH_WIDTH-60) + " 100";

        let maxH = 0;
        for (let i = 0; i < array.length; i++) {
            if (array[i][1] > maxH) maxH = array[i][1];
            if (array[i][2] > maxH) maxH = array[i][2];
        }

        let stepH = Math.round(maxH / Math.pow(10, maxH.toString().length - 1)) + 1;
        for (let i = 5; i > 0; i--)
            if (stepH % i === 0) {
                stepH /= i;
                break;
            }

        stepH *= Math.pow(10, maxH.toString().length - 1);
        if (maxH / stepH > 3) stepH *= 2;
        if (maxH / stepH < 2) stepH /= 2;

        for (let i = stepH; i < maxH + stepH; i += stepH) { //vert. lines
            if (100 - 80 * i / maxH < 0) continue;

            for (let j = 0; j < 2; j++) {
                const newLine = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                newLine.setAttribute("x", "0");
                newLine.setAttribute("y", 100 + Math.round((j == 0 ? 80 : -80) * i / maxH));
                newLine.setAttribute("width", GRAPH_WIDTH - 60);
                newLine.setAttribute("height", 1);
                newLine.setAttribute("fill", "rgba(0,0,0,.2)");
                this.svg.appendChild(newLine);

                const lblLine = document.createElementNS("http://www.w3.org/2000/svg", "text");
                lblLine.innerHTML = this.BytesToString(i);
                lblLine.setAttribute("x", GRAPH_WIDTH - 52);
                lblLine.setAttribute("y", Math.max(100 + Math.round((j==0 ? 80 : -80) * i / maxH) + 4, 11));
                lblLine.setAttribute("fill", "rgba(0,0,0,.4)");
                lblLine.setAttribute("font-size", "10.5px");
                this.svg.appendChild(lblLine);
            }
        }


        const pathRx = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathRx.setAttribute("fill", "url(#downstream-gradient)");
        pathRx.setAttribute("style", "stroke:rgb(95,177,39);stroke-width:2");
        this.svg.appendChild(pathRx);

        const pathTx = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathTx.setAttribute("fill", "url(#upstream-gradient)");
        pathTx.setAttribute("style", "stroke:rgb(232,118,0);stroke-width:2");
        this.svg.appendChild(pathTx);

        for (let i = 0; i < array.length; i++) //path and dots
            for (let j = 1; j < 3; j++) {
                let x = GRAPH_WIDTH - 60 - i * 40;
                let y = 100 + Math.round((j==1 ? -80 : 80) * array[i][j] / maxH);
                let r = Math.min(6, Math.abs(100 - y) / 2);

                const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                dot.setAttribute("cx", x);
                dot.setAttribute("cy", y);
                dot.setAttribute("r", r);
                dot.setAttribute("fill", j==1 ? "rgb(95,177,39)" : "rgb(232,118,0)");
                this.svg.appendChild(dot);

                if (i > 0) {
                    let xp = GRAPH_WIDTH - 60 - (i - 1) * 40;

                    let x1 = x + 5;
                    let y1 = 100 + (j==1 ? -80 : 80) * (array[i][j]*.2 + array[i-1][j]*.8) / maxH;
                    let x2 = xp - 5;
                    let y2 = 100 + (j==1 ? -80 : 80) * (array[i][j]*.8 + array[i-1][j]*.2) / maxH;

                    if (j==1)
                        stringPathRx += " C " +
                            x1 + " " + y1 + " " +
                            x2 + " " + y2 + " " +
                            x + " " + y;
                    else 
                        stringPathTx += " C " +
                            x1 + " " + y1 + " " +
                            x2 + " " + y2 + " " +
                            x + " " + y;

                } else {
                    if (j==1)
                        stringPathRx += " L " + x + " " + y;
                    else
                        stringPathTx += " L " + x + " " + y;
                }
            }

        stringPathRx += " L " + (GRAPH_WIDTH - 60 - (array.length-1) * 40) + " 100 Z";
        stringPathTx += " L " + (GRAPH_WIDTH - 60 - (array.length-1) * 40) + " 100 Z";

        pathRx.setAttribute("d", stringPathRx);
        pathTx.setAttribute("d", stringPathTx);

        const lineXAaxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineXAaxis.setAttribute("x1", "0");
        lineXAaxis.setAttribute("y1", "100");
        lineXAaxis.setAttribute("x2", GRAPH_WIDTH);
        lineXAaxis.setAttribute("y2", "100");
        lineXAaxis.setAttribute("style", "stroke:rgb(0,0,0);stroke-width:2");
        this.svg.appendChild(lineXAaxis);
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