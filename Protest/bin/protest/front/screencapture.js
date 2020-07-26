class ScreenCapture extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : { value: "" };

        this.setTitle("Screen capture");
        this.setIcon("res/screencapture.svgz");

        this.content.style.textAlign = "center";

        const btnCapture = document.createElement("input");
        btnCapture.type = "button";
        btnCapture.value = "Capture";
        btnCapture.style.display = "block-line";
        btnCapture.style.width = "96px";
        btnCapture.style.height = "40px";
        btnCapture.style.margin = "16px";
        btnCapture.style.borderRadius = "4px";
        this.content.appendChild(btnCapture);

        this.preview = document.createElement("div");
        this.preview.style.position = "absolute";
        this.preview.style.left = "8px";
        this.preview.style.right = "8px";
        this.preview.style.top = "72px";
        this.preview.style.bottom = "8px";
        this.preview.style.overflow = "auto";
        this.content.appendChild(this.preview);

        btnCapture.onclick = () => this.Capture();
    }

    Capture() {
        while (this.preview.childNodes.length > 0)
            this.preview.removeChild(this.preview.childNodes[0]);

        let canvas = document.createElement("canvas");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        this.preview.appendChild(canvas);

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgb(16,16,16)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.CaptureLoop(main, ctx);
    }

    CaptureLoop(element, ctx) {
        if (!element.tagName) return;
        if (element === this.win) return;
        if (element.style.visibility === "hidden") return;
        if (window.getComputedStyle(element).getPropertyValue("opacity") == 0) return;

        if (element.classList.contains("tool-submenu")) return;

        //console.log(element, element.tagName);

        let rect = element.getBoundingClientRect();

        ctx.fillStyle = window.getComputedStyle(element).getPropertyValue("background-color");
        
        if (window.getComputedStyle(element).getPropertyValue("border-radius") == "50%") {
            ctx.beginPath();
            ctx.arc(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width / 2, 0, 2 * Math.PI, false);
            ctx.fill();

            if (parseInt(window.getComputedStyle($w.array[0].btnClose).getPropertyValue("border-size")) > 0) {
                ctx.strokeStyle  = window.getComputedStyle($w.array[0].btnClose).getPropertyValue("border-color");
                ctx.lineWidth = parseInt(window.getComputedStyle($w.array[0].btnClose).getPropertyValue("border-size"));
                ctx.stroke();
            }
            ctx.closePath();
            
        } else {
            ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
            if (parseInt(window.getComputedStyle($w.array[0].btnClose).getPropertyValue("border-size")) > 0) {
                ctx.strokeStyle = window.getComputedStyle($w.array[0].btnClose).getPropertyValue("border-color");
                ctx.lineWidth = parseInt(window.getComputedStyle($w.array[0].btnClose).getPropertyValue("border-size"));
                ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
            }
        }

        if (element.tagName === "INPUT" && element.type === "text" || element.type === "button") {
            let size = window.getComputedStyle(element).getPropertyValue("font-size");
            let font = window.getComputedStyle(element).getPropertyValue("font-family");
            let align = window.getComputedStyle(element).getPropertyValue("text-align");
            let paddingTop = parseInt(window.getComputedStyle(element).getPropertyValue("padding-top")) + parseInt(window.getComputedStyle(element).getPropertyValue("margin-top"));

            ctx.font = `${size} ${font}`;
            ctx.fillStyle = window.getComputedStyle(element).getPropertyValue("color");

            if (align == "right") {
                let paddingRight = parseInt(window.getComputedStyle(element).getPropertyValue("padding-right"));
                ctx.textAlign = "end";
                ctx.fillText(element.value, rect.left, paddingTop + rect.top + rect.height / 2, rect.width - paddingRight);

            } else if (align == "center") {
                ctx.textAlign = "center";
                ctx.fillText(element.value, rect.left + rect.width/2, paddingTop + rect.top + rect.height / 2, rect.width);

            } else {
                let paddingLeft = parseInt(window.getComputedStyle(element).getPropertyValue("padding-left"));
                ctx.textAlign = "start";
                ctx.fillText(element.value, rect.left + paddingLeft, paddingTop + rect.top + rect.height / 2, rect.width);
            }
        }

        if (element.innerHTML && element.innerHTML === element.innerText) {
            let size = window.getComputedStyle(element).getPropertyValue("font-size");
            let font = window.getComputedStyle(element).getPropertyValue("font-family");
            let align = window.getComputedStyle(element).getPropertyValue("text-align");
            let paddingTop = parseInt(window.getComputedStyle(element).getPropertyValue("padding-top")) + parseInt(window.getComputedStyle(element).getPropertyValue("margin-top"));

            ctx.font = `${size} ${font}`;
            ctx.fillStyle = window.getComputedStyle(element).getPropertyValue("color");

            if (align == "right") {
                let paddingRight = parseInt(window.getComputedStyle(element).getPropertyValue("padding-right"));
                ctx.textAlign = "end";
                ctx.fillText(element.innerHTML, rect.left + rect.width, paddingTop + rect.top + rect.height / 2, rect.width - paddingRight);

            } else if (align == "center") {
                ctx.textAlign = "center";
                ctx.fillText(element.innerHTML, rect.left + rect.width/2, paddingTop + rect.top + rect.height / 2, rect.width);

            } else {
                let paddingLeft = parseInt(window.getComputedStyle(element).getPropertyValue("padding-left"));
                ctx.textAlign = "start";
                ctx.fillText(element.innerHTML, rect.left + paddingLeft, paddingTop + rect.top + rect.height / 2, rect.width);
            }
        }

        //TODO: clip

        for (let i = 0; i < element.childNodes.length; i++) 
            this.CaptureLoop(element.childNodes[i], ctx);
    }

}