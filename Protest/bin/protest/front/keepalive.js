let wsKeepAlive = null;

function initKeepAlive() {
    let server = window.location.href;
    server = server.replace("https://", "");
    server = server.replace("http://", "");
    if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

    this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/keepalive");

    this.ws.onopen = () => {
    };

    this.ws.onclose = () => {
    };

    this.ws.onmessage = event => {
    };

    this.ws.onerror = () => {
    };

}