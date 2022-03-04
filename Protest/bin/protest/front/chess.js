const FEN_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
        this.board.onmouseleave = event => this.Board_mouseleave(event);
        this.content.appendChild(this.board);

        this.game = {
            fen: null,
            placement: [],
            activecolor: "w",
            castling: "",
            enpassant: "-"
            //halfmove: 0
            //fullmove: 1
        };

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
            coord_r.style.verticalAlign = "bottom";
            this.board.appendChild(coord_r);
        }

        this.LoadFen(FEN_START);

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
        this.game.placement[position.x][position.y] = type;
        console.log(this.game.placement);

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

        piece.style.left = position.x * 12.5 + "%";
        piece.style.top = position.y * 12.5 + "%";

        if (type === type.toUpperCase())
            piece.style.filter = "invert(1) brightness(.9)";

        piece.onmousedown = event => this.Piece_mousedown(event);

        this.board.appendChild(piece);
    }

    LoadFen(notation) {
        //clear all pieces
        const pieces = this.board.querySelectorAll(".chess-piece");
        for (const element of pieces)
            this.board.removeChild(element);

        this.game.placement = [];
        for (let i = 0; i < 8; i++)
            this.game.placement[i] = [null, null, null, null, null, null, null, null];


        let array = notation.split(" ");
        if (array.length < 4) return;
        let placement = array[0];

        let position = { x: 0, y: 0 };
        for (let i = 0; i < placement.length; i++) {
            if (placement[i] == "/") {
                position.x = 0;
                position.y += 1;
                continue;
            }

            if (!isNaN(placement[i])) {
                position.x += parseInt(placement[i]);
                continue;
            }

            this.AddPiece(placement[i], position);
            this.game.placement[position.x][position.y] = placement[i];
            position.x += 1;
        }

        this.game.fen = notation;
        this.game.activecolor = array[1];
        this.game.castling = array[2];
        this.game.enpassant = array[3];
    }

    GetCurrentFen() {

    }

    MovePiece(move) {

    }

    Piece_mousedown(event) {
        if (event.buttons !== 1) {
            this.Board_mouseleave();
            return;
        }

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
        this.selected.style.cursor = "none";
        this.selected.style.transition = "none";
    }

    Board_mousemove(event) {
        if (event.buttons !== 1) {
            return;
        }

        if (this.selected) {
            let x = this.selectedPos[0] + event.x - this.x0;
            let y = this.selectedPos[1] + event.y - this.y0;

            x = Math.max(x, -this.board.getBoundingClientRect().width / 16);
            x = Math.min(x, this.board.getBoundingClientRect().width - this.board.getBoundingClientRect().height / 16);
            y = Math.max(y, -this.board.getBoundingClientRect().height / 16);
            y = Math.min(y, this.board.getBoundingClientRect().height - this.board.getBoundingClientRect().height / 16);

            this.selected.style.left = x + "px";
            this.selected.style.top = y + "px";
        }
    }

    Board_mouseup(event) {
        if (this.selected) {
            let x = parseFloat(event.srcElement.style.left) * 100 / this.board.getBoundingClientRect().width;
            let y = parseFloat(event.srcElement.style.top) * 100 / this.board.getBoundingClientRect().height;
            x = Math.min(Math.max(x, 0), 87.5);
            y = Math.min(Math.max(y, 0), 87.5);

            this.selected.style.left = parseInt((x + 6.25) / 12.5) * 12.5 + "%";
            this.selected.style.top = parseInt((y + 6.25) / 12.5) * 12.5 + "%";
            this.selected.style.zIndex = "0";
            this.selected.style.cursor = "inherit";
            this.selected.style.transition = ".15s";
        }

        this.selected = null;
    }

    Board_mouseleave(event) {
        if (this.selected) { //undo move
            this.selected.style.transition = ".2s";
            this.selected.style.left = this.selectedPos[0] * 100 / this.board.getBoundingClientRect().width + "%";
            this.selected.style.top = this.selectedPos[1] * 100 / this.board.getBoundingClientRect().height + "%";
            this.selected.style.zIndex = "0";
            this.selected.style.cursor = "inherit";
            this.selected = null;
        }
    }

}