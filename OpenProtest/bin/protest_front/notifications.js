function showNotification(message, okOnly=false) {
    let notificationBox = document.createElement("div");
    notificationBox.style.position = "absolute";
    notificationBox.style.right = "8px";
    notificationBox.style.bottom = "8px";
    notificationBox.style.width = "250px";
    notificationBox.style.height = "auto";
    notificationBox.style.borderRadius = "4px";
    notificationBox.style.padding = "12px 8px 8px 12px";
    notificationBox.style.color = "rgb(224,224,224)";
    notificationBox.style.boxShadow = "black 0 0 8px";
    notificationBox.style.backgroundColor = "rgb(48,48,48)";
    notificationBox.style.transformOrigin = "100% 50%";
    notificationBox.style.animation = "slide-in .4s";
    notificationBox.style.transition = ANIM_DURATION / 1000 +"s";
    notificationBox.innerHTML = message;
    main.appendChild(notificationBox);

    let buttonBox = document.createElement("div");
    buttonBox.style.textAlign = "center";
    buttonBox.style.paddingTop = "8px";
    notificationBox.appendChild(buttonBox);

    let btnOK = document.createElement("input");
    btnOK.type = "button";
    btnOK.value = "OK";
    buttonBox.appendChild(btnOK);

    let btnCancel = document.createElement("input");
    btnCancel.type = "button";
    btnCancel.value = "Cancel";
    if (!okOnly) buttonBox.appendChild(btnCancel);

    let once = false;
    btnCancel.onclick = (event)=> {
        if (once) return;
        once = true;

        notificationBox.style.transform = "translateX(100%)";
        setTimeout(()=> {main.removeChild(notificationBox);}, ANIM_DURATION);
    };

    btnOK.onclick = event=> btnCancel.onclick(event);

    return [btnOK, btnCancel];
}