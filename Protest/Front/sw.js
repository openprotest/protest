"use strict";

self.addEventListener("install", ()=> self.skipWaiting());

self.addEventListener("activate", event=> {
	event.waitUntil((async ()=> {
		await self.registration.navigationPreload?.disable();
		await self.clients.claim();
	})());
});

self.addEventListener("fetch", event=> {
	if (event.request.mode !== "navigate") return;
	event.respondWith(Navigate(event.request));
});

const Navigate = async request=> {
	try {
		const response = await fetch(request);

		//the server never answers with these, a reverse proxy does when the server behind it is down
		if (response.status === 502 || response.status === 503 || response.status === 504) {
			return OfflineResponse();
		}

		return response;
	}
	catch {
		return OfflineResponse();
	}
};

const OfflineResponse = ()=> {
	const nonce = crypto.randomUUID();

	const html = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>Pro-test</title>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<style>
		body { margin:0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background-color:#404040; color:#c0c0c0; font-family:"Segoe UI",sans-serif; text-align:center; user-select:none; }
		h1 { margin:20px 16px 8px 16px; font-size:22px; font-weight:600; color:#e0e0e0; }
		p { margin:4px 16px; max-width:480px; }
		b { color:#e0e0e0; }
		#countdown { display:flex; width:24px; height:24px; margin:20px 0 4px 0; }
		#countdown > div { overflow:hidden; width:12px; height:24px; }
		#countdown > div:nth-child(2) { transform:rotate(180deg); }
		#countdown > div > div { width:24px; height:24px; box-sizing:border-box; border:5px solid transparent; border-top-color:#c0c0c0; border-left-color:#c0c0c0; border-radius:50%; transform:rotate(-45deg); }
		#countdown.running > div:nth-child(1) > div { animation:countdown-a 20s linear 1 forwards; }
		#countdown.running > div:nth-child(2) > div { animation:countdown-b 20s linear 1 forwards; }
		#statusLabel { margin:4px; min-height:22px; color:#a0a0a0; }
		@keyframes countdown-a { 0% { transform:rotate(-45deg); } 50% { transform:rotate(-226deg); opacity:1; animation-timing-function:step-start; } 100% { transform:rotate(-226deg); opacity:0; } }
		@keyframes countdown-b { 0% { transform:rotate(-45deg); opacity:1; animation-timing-function:step-end; } 50% { transform:rotate(-45deg); } 100% { transform:rotate(-225deg); opacity:0; } }
	</style>
</head>
<body>
	<svg width="96" height="96" viewBox="0 0 32 32" aria-hidden="true">
		<path fill="#101010" d="M30.345,10.59l0.453,0.333c0.291,0.214 0.463,0.553 0.466,0.913l0.152,18.538c0.002,0.308 -0.119,0.604 -0.337,0.821l-0.472,0.471c-0.217,0.216 -0.512,0.337 -0.819,0.334l-26.177,-0.23c-0.287,-0.002 -0.562,-0.112 -0.772,-0.308l-0.708,-0.661c-0.21,-0.196 -0.338,-0.463 -0.36,-0.75l-1.183,-15.531c-0.022,-0.278 0.059,-0.554 0.227,-0.777l0.573,-0.759c0.168,-0.223 0.411,-0.377 0.685,-0.433l1.058,-0.217l-0.171,-0.135c-0.269,-0.212 -0.428,-0.532 -0.436,-0.874l-0.215,-9.687c-0.006,-0.308 0.111,-0.606 0.327,-0.826l0.456,-0.467c0.216,-0.221 0.511,-0.345 0.819,-0.345l4.604,-0c0.297,-0 0.583,0.116 0.796,0.322l0.471,0.456c0.052,0.05 0.099,0.105 0.141,0.164c0,-0 0.598,-0.603 0.598,-0.603c0.215,-0.217 0.508,-0.339 0.813,-0.339l3.456,-0c0.29,-0 0.569,0.11 0.781,0.307l0.671,0.625c0.212,0.198 0.342,0.468 0.362,0.757l0.097,1.372l0.012,-1.612c0.002,-0.302 0.124,-0.591 0.338,-0.804l0.314,-0.312c0.215,-0.213 0.505,-0.333 0.807,-0.333l3.922,-0c0.296,-0 0.58,0.114 0.793,0.319l0.595,0.571c0.064,0.061 0.119,0.128 0.167,0.201c0.053,-0.183 0.151,-0.352 0.287,-0.489l0.261,-0.263c0.216,-0.217 0.508,-0.339 0.813,-0.339l3.753,-0c0.285,-0 0.56,0.106 0.77,0.298l0.779,0.708c0.21,0.191 0.342,0.454 0.369,0.737l0.685,7.125c0.027,0.276 -0.048,0.553 -0.209,0.778l-0.439,0.611c-0.099,0.138 -0.227,0.251 -0.373,0.333Z"/>
		<g fill="hsl(31,100%,45%)">
			<path d="M25.339,12.758l4.27,-1.288l0.51,0.376l0.151,18.538l-0.472,0.47l-26.177,-0.229l-0.708,-0.661l-1.183,-15.531l0.573,-0.759l13.773,-2.823l0.456,0.372l0,6.121l-0.375,0.445l-7.615,1.305l-0.621,0.727l-0.063,4.235l0.507,0.344l13.813,-5.706l0.584,-0.572l2.193,-5.024l0.384,-0.34Z"/>
			<path d="M24.749,1.409l0.261,-0.263l3.753,-0l0.778,0.707l0.685,7.125l-0.439,0.611l-4.478,1.055l-0.485,-0.381l-0.075,-8.854Z"/>
			<path d="M17.859,1.457l0.313,-0.311l3.922,-0l0.595,0.57l0.367,8.813l-0.212,0.278l-4.582,1.041l-0.478,-0.384l0.075,-10.007Z"/>
			<path d="M10.737,1.748l0.597,-0.602l3.456,-0l0.671,0.624l0.484,6.84l-0.425,0.551l-4.136,0.769l-0.577,-0.475l-0.07,-7.707Z"/>
			<path d="M3.911,1.146l-0.456,0.467l0.215,9.687l0.658,0.52l4.436,-0.951l0.509,-0.651l-0.287,-8.617l-0.471,-0.455l-4.604,-0Z"/>
		</g>
	</svg>
	<h1>The server is unreachable</h1>
	<div id="countdown"><div><div></div></div><div><div></div></div></div>
	<div id="statusLabel"></div>
	<script nonce="${nonce}">
		const Wait = ()=> {
			statusLabel.textContent = "Retrying every 20 seconds.";
			countdown.classList.remove("running");
			void countdown.offsetWidth;
			countdown.classList.add("running");
			setTimeout(Retry, 20_000);
		};

		const Retry = async ()=> {
			statusLabel.textContent = "Connecting...";

			try {
				const response = await fetch("/", { cache:"no-store" });
				if (response.ok) {
					location.reload();
					return;
				}
			}
			catch {}

			Wait();
		};

		Wait();
	</script>
</body>
</html>`;

	return new Response(html, {
		status: 503,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
			"Cache-Control": "no-store"
		}
	});
};
