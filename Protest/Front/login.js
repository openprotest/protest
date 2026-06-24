let status = 1;
let token = null;
usernameInput.value = localStorage.getItem("last_username");
usernameInput.onkeyup = event=> {
	if (event.key==="Enter") passwordInput.focus();
};

passwordInput.onkeyup = otpInput.onkeyup = event=> {
	if (event.key==="Enter") Login();
};

usernameInput.oninput = usernameInput.onchange = passwordInput.oninput = passwordInput.onchange = event=> {
	loginButton.style.opacity = usernameInput.value === "" || passwordInput.value === "" ? "0" : "1";
};

if (usernameInput.value.length === 0) {
	usernameInput.focus();
}
else {
	passwordInput.focus();
}

loginButton.onclick = ()=>Login();

let busy = false;
const Login = async ()=> {
	if (busy) return;

	switch (status) {
	//case -1: await TotpEnrollment(); break;
	case 1: await PrimaryLogin(); break;
	case 2: await SecondaryLogin(); break;
	}
};

const HandleResponse = json => {
	if (json.status === -1) { //enrollment required
		usernameInput.style.display = "none";
		passwordInput.style.display = "none";
		loginButton.style.display = "none";

		const enrollmentBox = document.createElement("div");
		enrollmentBox.style.backgroundColor = "rgb(224,224,224)";
		enrollmentBox.style.position = "absolute";
		enrollmentBox.style.width = "500px";
		enrollmentBox.style.height = "500px";
		enrollmentBox.style.left = "calc(50% - 250px)";
		enrollmentBox.style.top = "20px";
		enrollmentBox.style.border = "1px solid rgb(224,224,224)";
		enrollmentBox.style.borderRadius = "8px";
		enrollmentBox.style.animation = "enroll-in .8s 1 forwards";
		document.body.appendChild(enrollmentBox);

		const enrollTitle = document.createElement("div");
		enrollTitle.textContent = "Scan this QR code with your OTP app to enroll.";
		enrollTitle.style.color = "#202020";
		enrollTitle.style.fontWeight = "bold";
		enrollTitle.style.margin = "20px";
		enrollmentBox.appendChild(enrollTitle);

		const qrBox = document.createElement("div");
		qrBox.style.marginTop = "24px";
		enrollmentBox.appendChild(qrBox);

		const inputBox = document.createElement("div");
		inputBox.style.marginTop = "12px";
		inputBox.style.marginBottom = "12px";
		enrollmentBox.appendChild(inputBox);

		const optImage = document.createElement("img");
		optImage.src = "mono/mfa.svg";
		optImage.title = "OTP";
		optImage.width = 28;
		optImage.height = 28;
		inputBox.appendChild(optImage);

		const otpInput = document.createElement("input");
		otpInput.type = "text";
		otpInput.maxLength = 6;
		otpInput.style.fontSize = "16px";
		otpInput.style.fontWeight = "bold";
		otpInput.style.fontFamily = "monospace";
		otpInput.style.textAlign = "center";
		otpInput.style.letterSpacing = "12px";
		otpInput.style.color = "#202020";
		otpInput.style.backgroundColor = "rgb(224,224,224)";
		otpInput.style.boxShadow = "#202020 0 0 0 2px";
		inputBox.appendChild(otpInput);

		const otpLabel = document.createElement("span");
		otpLabel.style.fontWeight = "bold";
		otpLabel.style.margin = "16px 0";
		enrollmentBox.appendChild(otpLabel);

		enrollmentBox.appendChild(document.createElement("br"));

		const enrollButton = document.createElement("input");
		enrollButton.type = "button";
		enrollButton.value = "Enroll";
		enrollmentBox.appendChild(enrollButton);

		const qrLib = document.createElement("script");
		qrLib.src = "qrcode.js";
		document.body.appendChild(qrLib);

		qrLib.onload = ()=> {
			const label = `Pro-test:${usernameInput.value}`;
			new QRCode(qrBox, {
				text: `otpauth://totp/${label}?secret=${json.secret}&issuer=Pro-test`,
				width: 250,
				height: 250,
				colorDark: "#202020",
				colorLight: "transparent",
				correctLevel: QRCode.CorrectLevel.L
			});

			qrBox.childNodes[0].style.padding = "8px";
			qrBox.childNodes[0].style.border = "4px solid #202020";
			qrBox.childNodes[0].style.borderRadius = "8px";
		};

		otpInput.onkeyup = event=> {
			enrollButton.style.opacity = otpInput.value.length === 6 ? "1" : "0";
			if (event.key==="Enter") {
				TotpEnrollment(usernameInput.value, json.token, otpInput.value, otpLabel);
			}
		};

		enrollButton.onclick = ()=> {
			TotpEnrollment(usernameInput.value, json.token, otpInput.value, otpLabel);
		};

		otpInput.focus();
	}
	else if (json.status === 2) { //otp required
		usernameInput.setAttribute("readonly", true);
		passwordInput.setAttribute("readonly", true);
		otpBox.style.display = "block";
		otpInput.focus();
	}
	else {
		location.replace("/");
	}

	status = json.status;
};

const PrimaryLogin = async ()=> {
	if (usernameInput.value === "" || passwordInput.value === "") return;

	loginButton.setAttribute("disabled", true);
	busy = true;

	try {
		const response = await fetch("auth", {
			method: "POST",
			credentials: "same-origin",
			body: `${status}${String.fromCharCode(127)}${usernameInput.value}${String.fromCharCode(127)}${passwordInput.value}`
		});

		if (response.status === 202) {
			localStorage.setItem("last_username", usernameInput.value);

			const json = await response.json();
			token = json.token;
			HandleResponse(json);
		}
		else {
			passwordInput.value="";
			messageLabel.style.visibility="visible";
			messageLabel.style.animation="shake 1s 1";
			locklatch.style.animation="fail .4s 1";
			setTimeout(()=> {
				messageLabel.style.animation="none";
				locklatch.style.animation="none";
			}, 1000);
		}
		loginButton.removeAttribute("disabled");
		busy = false;
	}
	catch (ex) {
		messageLabel.style.visibility="visible";
		messageLabel.style.color="red";
		messageLabel.textContent="Server is unreachable.";
		console.error(ex);
		loginButton.removeAttribute("disabled");
		busy = false;
	}
};

const SecondaryLogin = async ()=> {
	if (otpInput.value.length != 6) return;

	busy = true;

	try {
		const response = await fetch("auth", {
			method: "POST",
			credentials: "same-origin",
			body: `2${String.fromCharCode(127)}${usernameInput.value}${String.fromCharCode(127)}${token}${String.fromCharCode(127)}${otpInput.value}`
		});

		if (response.status === 202) {
			const json = await response.json();
			HandleResponse(json);
		}
		else {
			messageLabel.textContent = "OTP challenge failed.";
			messageLabel.style.visibility="visible";
			messageLabel.style.animation="shake 1s 1";
			locklatch.style.animation="fail .4s 1";
			setTimeout(()=> {
				messageLabel.style.animation="none";
				locklatch.style.animation="none";
			}, 1000);
		}

		loginButton.removeAttribute("disabled");
		busy = false;
	}
	catch (ex) {
		messageLabel.style.visibility = "visible";
		messageLabel.style.color = "red";
		messageLabel.textContent = "Server is unreachable.";
		console.error(ex);
		loginButton.removeAttribute("disabled");
		busy = false;
	}
};

const TotpEnrollment = async (username, token, otp, label)=> {
	if (otp.length != 6) return;

	busy = true;

	try {
		const response = await fetch("auth", {
			method: "POST",
			credentials: "same-origin",
			body: `-1${String.fromCharCode(127)}${username}${String.fromCharCode(127)}${token}${String.fromCharCode(127)}${otp}`
		});

		if (response.status === 202) {
			const json = await response.json();
			HandleResponse(json);
		}
		else {
			label.textContent = "Enrollment failed. Please try again.";
			label.style.color="red";
			setTimeout(()=> {
				label.style.animation="none";
			}, 1000);
		}

		loginButton.removeAttribute("disabled");
		busy = false;
	}
	catch (ex) {
		label.style.visibility = "visible";
		label.style.color = "red";
		label.textContent = "Server is unreachable.";
		console.error(ex);
		loginButton.removeAttribute("disabled");
		busy = false;
	}
};
