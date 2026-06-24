"use strict";

const hsl = [24,85,50];
document.querySelector(":root").style.setProperty("--clr-select", `hsl(${hsl[0]+5},${hsl[1]}%,${hsl[2]*.9}%)`);
document.querySelector(":root").style.setProperty("--clr-accent", `hsl(${hsl[0]},${hsl[1]}%,${hsl[2]}%)`);

function SetBarColor() {
	const bar = document.getElementsByClassName("address-book-search-bar")[0];
	bar.style.background = `linear-gradient(0deg, hsla(${hsl[0]+5},72.5%,42.5%,.6) 0%, hsla(${hsl[0]},75%,45%,1) 100%)`;

	const buttons = document.getElementsByClassName("address-book-button");
	for (let i=0; i<buttons.length; i++) {
		buttons[i].style.backgroundColor = "transparent";
	}
}

new AddressBook();
SetBarColor();
