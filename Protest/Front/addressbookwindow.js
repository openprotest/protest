"use strict";
function SetBarColor() {
	const bar = document.getElementsByClassName("address-book-search-bar")[0];
	bar.style.background = "none";
	bar.style.boxShadow = "rgba(0,0,0,.4) 0 2px 1px";

	const blocks = document.getElementsByClassName("address-book-block");
	for (let i=0; i<blocks.length; i++) {
		const block = blocks[i];
		block.style.backgroundColor = `hsla(${24+i},${75-i/2}%,${45-i/2}%,${1-i/16})`;
	}

	const buttons = document.getElementsByClassName("address-book-button");
	for (let i=0; i<buttons.length; i++) {
		buttons[i].style.backgroundColor = "transparent";
	}
}

new AddressBook();
SetBarColor();