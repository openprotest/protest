class Chess extends Window {
    constructor() {
        super([64,64,64]);

        this.args = null;

        this.AddCssDependencies("chess.css");

        this.SetTitle("Chess");
        this.SetIcon("res/knight.svgz");
        this.content.style.overflow = "hidden";

        this.board = document.createElement("div");
        this.board.className = "chess-board";
        this.board.onmousemove = event => this.Board_mousemove(event);
        this.board.onmouseup = event => this.Board_mouseup(event);
        this.content.appendChild(this.board);

        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
                const sqr = document.createElement("div");
                sqr.className = "chess-square";
                sqr.style.left = x * 100 / 8 + "%";
                sqr.style.top = y * 100 / 8 + "%";
                sqr.style.backgroundColor = (x + y) % 2 === 0 ? "rgb(112,112,112)" : "rgb(88,88,88)";
                this.board.appendChild(sqr);
            }

        for (let i = 0; i < 8; i++) {
            const coord_f = document.createElement("div");
            coord_f.className = "chess-coord";
            coord_f.innerHTML = 8-i;
            coord_f.style.color = i % 2 === 0 ? "rgb(84,84,84)" : "rgb(108,108,108)";
            coord_f.style.left = "0";
            coord_f.style.top = i * 100 / 8 + "%";
            this.board.appendChild(coord_f);

            const coord_r = document.createElement("div");
            coord_r.className = "chess-coord";
            coord_r.innerHTML = String.fromCharCode(97 + i);
            coord_r.style.color = i % 2 === 0 ? "rgb(108,108,108)" : "rgb(84,84,84)";
            coord_r.style.left = `calc(${(i+1) * 12.5}% - 20px)`;
            coord_r.style.bottom = "0";
            this.board.appendChild(coord_r);
        }

        this.AddPiece("r", [0,0]);
        this.AddPiece("n", [1,0]);
        this.AddPiece("b", [2,0]);
        this.AddPiece("q", [3,0]);
        this.AddPiece("k", [4,0]);
        this.AddPiece("b", [5,0]);
        this.AddPiece("n", [6,0]);
        this.AddPiece("r", [7,0]);
        this.AddPiece("p", [0,1]);
        this.AddPiece("p", [1,1]);
        this.AddPiece("p", [2,1]);
        this.AddPiece("p", [3,1]);
        this.AddPiece("p", [4,1]);
        this.AddPiece("p", [5,1]);
        this.AddPiece("p", [6,1]);
        this.AddPiece("p", [7,1]);

        this.AddPiece("P", [0,6]);
        this.AddPiece("P", [1,6]);
        this.AddPiece("P", [2,6]);
        this.AddPiece("P", [3,6]);
        this.AddPiece("P", [4,6]);
        this.AddPiece("P", [5,6]);
        this.AddPiece("P", [6,6]);
        this.AddPiece("P", [7,6]);
        this.AddPiece("R", [0,7]);
        this.AddPiece("N", [1,7]);
        this.AddPiece("B", [2,7]);
        this.AddPiece("Q", [3,7]);
        this.AddPiece("K", [4,7]);
        this.AddPiece("B", [5,7]);
        this.AddPiece("N", [6,7]);
        this.AddPiece("R", [7,7]);

        this.sidepanel = document.createElement("div");
        this.sidepanel.className = "chess-sidepanel";
        this.content.appendChild(this.sidepanel);

        setTimeout(() => {
            this.AfterResize();
        }, ANIM_DURATION);
    }

    AfterResize() { //override
        let w = this.content.clientWidth;
        let h = this.content.clientHeight;
        let min = Math.min(w, h) * .96;
        let offset = 0;

        if (w > h && w - min > 250) {
            this.sidepanel.style.visibility = "visible";
            this.sidepanel.style.opacity = "1";
            this.sidepanel.style.transform = "none";
            offset = -125;
        } else {
            this.sidepanel.style.visibility = "hidden";
            this.sidepanel.style.opacity = "0";
            this.sidepanel.style.transform = "translateX(100%)";
            offset = 0;
        }

        if (min < 400)
            for (const element of this.board.querySelectorAll(".chess-coord"))
                element.style.opacity = "0";            
        else
            for (const element of this.board.querySelectorAll(".chess-coord"))
                element.style.opacity = "1";

        this.board.style.width = min + "px";
        this.board.style.height = min + "px";
        this.board.style.left = (w - min) / 2 + offset + "px";
        this.board.style.top = (h - min) / 2 + "px";
    }

    AddPiece(type, position) {
        const piece = document.createElement("div");
        piece.className = "chess-piece";

        switch (type.toLowerCase()) {
            case "k": piece.style.backgroundImage = "url(res/king.svg)"; break;
            case "q": piece.style.backgroundImage = "url(res/queen.svg)"; break;
            case "r": piece.style.backgroundImage = "url(res/rook.svg)"; break;
            case "n": piece.style.backgroundImage = "url(res/knight.svg)"; break;
            case "b": piece.style.backgroundImage = "url(res/bishop.svg)"; break;
            case "p": piece.style.backgroundImage = "url(res/pawn.svg)"; break;
        }

        piece.style.left = position[0] * 12.5 + "%";
        piece.style.top = position[1] * 12.5 + "%";

        if (type === type.toUpperCase())
            piece.style.filter = "invert(1) brightness(.9)";

        piece.onmousedown = event => this.Piece_mousedown(event);

        this.board.appendChild(piece);
    }
        
    Piece_mousedown(event) {
        this.x0 = event.x;
        this.y0 = event.y;
        this.selected = event.srcElement;
        this.selectedPos = [
            parseFloat(event.srcElement.style.left) * this.board.getBoundingClientRect().width / 100,
            parseFloat(event.srcElement.style.top) * this.board.getBoundingClientRect().height / 100
        ];

        this.selected.style.left = parseFloat(event.srcElement.style.left) * this.board.getBoundingClientRect().width / 100 + "px";
        this.selected.style.top = parseFloat(event.srcElement.style.top) * this.board.getBoundingClientRect().height / 100 + "px";
        this.selected.style.zIndex = "1";
        this.selected.transition = "none";
    }

    Board_mousemove(event) {
        if (event.buttons !== 1) {
            if (this.selected) {
                //TODO: undo move
                this.Board_mouseup(event);
            }

            return;
        }

        if (this.selected) {
            this.selected.style.left = this.selectedPos[0] + event.x - this.x0 + "px";
            this.selected.style.top = this.selectedPos[1] + event.y - this.y0 + "px";
        }
    }

    Board_mouseup(event) {
        if (this.selected) {
            let x = parseFloat(event.srcElement.style.left) * 100 / this.board.getBoundingClientRect().width;
            let y = parseFloat(event.srcElement.style.top) * 100 / this.board.getBoundingClientRect().height;
            this.selected.style.left = parseInt((x + 6.25) / 12.5) * 12.5 + "%";
            this.selected.style.top = parseInt((y + 6.25) / 12.5) * 12.5 + "%";
            this.selected.style.zIndex = "0";
            this.selected.transition = "1s";
        }

        this.selected = null;
    }
}