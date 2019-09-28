/* Windows.js is a vanilla javascript UI library, designed for Pro-test 3.1
 * Created by Andreas Venizelou, 2019.
 * Released into the public domain.
 */

const ANIM_DURATION = 200;
const TOOLBAR_GAP   = 48;

const $w = {
    array: [],
    active:  null,
    focused: null,
    iconSize: 64,
    isMoving:         false,
    isResizing:       false,
    isIcoMoving:      false,
    isControlPressed: false,
    x0:      0,
    y0:      0,
    offsetX: 0,
    offsetY: 0,
    startX:  10,
    startY:  10,
    count:   0,
    always_maxxed: false
};

document.body.onresize    = body_resize;
document.body.onmousemove = win_mousemove;
document.body.onmouseup   = win_mouseup;
document.body.onkeydown   = win_keydown;

bottombar.onmousedown = event=> { if (event.button == 1) event.preventDefault(); }; //prevent mid-mouse scroll

class Window {
    
    constructor(themeColor = [56,56,56]) {
        this.isMaximized = false;
        this.isMinimized = false;
        this.isClosed    = false;
        this.position    = null;
        this.themeColor  = themeColor;
        this.defaultElement = null;
        this.escAction   = null;

        $w.startX += 2;
        $w.startY += 6;
        if ($w.startY >= 40) {
            $w.startY = 4;
            $w.startX -= 10;
        }
        if ($w.startX >= 40) {
            $w.startY = 10;
            $w.startX = 10;
        }

        this.win = document.createElement("div");
        this.win.style.left   = $w.startX + "%";
        this.win.style.top    = $w.startY + "%";
        this.win.style.width  = "50%";
        this.win.style.height = "60%";
        this.win.style.zIndex = ++$w.count;
        this.win.className    = "window";
        container.appendChild(this.win);

        this.task = document.createElement("div");
        this.task.className = "bar-icon";
        this.task.style.left = 2 + $w.array.length * 64 + "px";
        bottombar.appendChild(this.task);

        this.icon = document.createElement("div");
        this.icon.className = "icon";
        this.task.appendChild(this.icon);

        this.content = document.createElement("div");
        this.content.className = "content";
        this.win.appendChild(this.content);

        this.lblTitle = document.createElement("div");
        this.lblTitle.className = "title";
        this.win.appendChild(this.lblTitle);

        this.titleicon = document.createElement("div");
        this.titleicon.className = "titleicon";
        this.win.appendChild(this.titleicon);
        
        this.resize = document.createElement("div");
        this.resize.className = "resize";
        this.win.appendChild(this.resize);

        let btnClose = document.createElement("div");
        btnClose.className = "control close-box";
        this.win.appendChild(btnClose);
        if (onMobile) {
            btnClose.style.width = btnClose.style.height = "28px";
            btnClose.style.backgroundSize = "26px";
            btnClose.style.backgroundPosition = "1px 1px";
        }

        let btnMaximize = document.createElement("div");
        if (!onMobile) {
            btnMaximize.className = "control maximize-box";
            this.win.appendChild(btnMaximize);
        }

        let btnMinimize = document.createElement("div");
        if (!onMobile) {
            btnMinimize.className = "control minimize-box";
            this.win.appendChild(btnMinimize);
        }
        
        this.toolbox = document.createElement("div");
        this.toolbox.className = "toolbox";
        this.win.appendChild(this.toolbox);

        this.toolbox.onmousedown = (event) => { event.stopPropagation(); this.BringToFront(); };

        let dblclickCheck = false;
        this.win.onmousedown = (event)=> {
            this.BringToFront();
            if (event.button == 0 && event.offsetY < 32) { //left click on title bar
                $w.offsetX  = this.win.offsetLeft;
                $w.offsetY  = this.win.offsetTop;
                $w.x0       = event.clientX;
                $w.y0       = event.clientY;
                $w.isMoving = true;

                if (dblclickCheck && !onMobile) {
                    this.Toogle();
                    dblclickCheck = false;
                    return;
                }
                dblclickCheck = true;
                setTimeout(()=> { dblclickCheck = false; }, 333);
            }
            $w.active = this;
            $w.focused = this;
        };

        //this.win.onmouseup = (event)=> { if (this.defaultElement != null) this.defaultElement.focus(); };

        this.resize.onmousedown = (event)=> {
            this.BringToFront();
            if (event.button == 0) { //left click
                $w.offsetX  = this.win.clientWidth;
                $w.offsetY  = this.win.clientHeight;
                $w.x0 = event.clientX;
                $w.y0 = event.clientY;
                $w.isResizing = true;
                $w.active = this;
            }
            event.stopPropagation();
        };

        let icoPosition = 0;
        this.task.onmousedown = (event)=> {
            if (event.button == 0) { //left click
                icoPosition = this.task.offsetLeft;

                this.task.style.zIndex = "5";
                $w.offsetX  = this.task.offsetLeft;
                $w.x0 = event.clientX;
                $w.isIcoMoving = true;
                $w.active = this;
            }
        };

        this.task.onmouseup = (event)=> {
            if (event.button==0 && (Math.abs(icoPosition - this.task.offsetLeft) < 2)) { //clicked but not moved
                this.Minimize();
                if (!this.isMinimized) if (this.defaultElement != null) this.defaultElement.focus();
            }

            if (event.button==1) { //close on middle click
                this.Close();
                event.preventDefault();
            }
        };
        
        this.content.onmousedown = (event)=> { this.BringToFront(); event.stopPropagation(); };

        btnClose.onmousedown =
        btnMaximize.onmousedown =
        btnMinimize.onmousedown =
        (event)=> {
            $w.control_pressed = this;
            this.BringToFront();
            event.stopPropagation();
        };
        
        btnClose.onmouseup    = (event)=> { if (event.button==0 && $w.control_pressed==this) {$w.control_pressed=null; this.Close();} };
        btnMaximize.onmouseup = (event)=> { if (event.button==0 && $w.control_pressed==this) {$w.control_pressed=null; this.Toogle();} };
        btnMinimize.onmouseup = (event)=> { if (event.button==0 && $w.control_pressed==this) {$w.control_pressed=null; this.Minimize();} };
    
        this.setTitle("Title");
        $w.array.push(this);

        this.setThemeColor(this.themeColor);
        this.BringToFront();

        alignIcon(false);

        if (onMobile || $w.always_maxxed) this.Toogle();
    }

    Close() {
        if (this.isClosed) return;
        this.isClosed = true;

        this.win.style.transition = ANIM_DURATION/1000 + "s";
        this.win.style.opacity    = "0";
        this.win.style.transform  = "scale(.85)";

        this.task.style.transition = ANIM_DURATION/2000 + "s";
        this.task.style.opacity    = "0";
        this.task.style.transform  = "scale(.85)";

        setTimeout(()=> {
            container.removeChild(this.win);
            bottombar.removeChild(this.task);
            $w.array.splice($w.array.indexOf(this), 1);
            alignIcon(false);
        }, ANIM_DURATION/2);

        $w.focused = null;
    }

    Toogle() {
        this.win.style.transition = ANIM_DURATION/1000 + "s";

        if (this.isMaximized) {
            if (this.position==null) {
                this.win.style.left   = "20%";
                this.win.style.top    = "20%";
                this.win.style.width  = "40%";
                this.win.style.height = "40%";
            } else {
                this.win.style.left   = this.position[0];
                this.win.style.top    = this.position[1];
                this.win.style.width  = this.position[2];
                this.win.style.height = this.position[3];
            }
            this.win.style.borderRadius  = "8px 8px 0 0";
            this.content.style.left      = "2px";
            this.content.style.right     = "2px";
            this.content.style.top       = "30px";
            this.content.style.bottom    = "2px";
            this.resize.style.visibility = "visible";
            this.toolbox.style.left      = TOOLBAR_GAP + "px";
            this.isMaximized = false;

            this.task.style.top = "2px";
            this.task.style.borderRadius = "12.5%";
        } else {
            this.position = [this.win.style.left, this.win.style.top, this.win.style.width, this.win.style.height];
            this.win.style.left          = "0%";
            this.win.style.top           = "0%";
            this.win.style.width         = "100%";
            this.win.style.height        = "100%";
            this.win.style.borderRadius  = "0";
            this.content.style.left      = "0";
            this.content.style.right     = "0";
            this.content.style.top       = "38px";
            this.content.style.bottom    = "0";
            this.toolbox.style.left      = "56px";
            this.resize.style.visibility = "hidden";
            this.isMaximized = true;

            this.task.style.top = "0";
            this.task.style.borderRadius = "0 0 12.5% 12.5%";
        }
        setTimeout(()=> {
            this.win.style.transition = "0s"; 
            this.AfterResize();
        }, ANIM_DURATION);
    }

    Minimize(force) {
        let isFocused = ($w.count == this.win.style.zIndex);
        this.win.style.transition = ".3s";

        if (this.isMinimized && !force) { //restore
            this.win.style.opacity    = "1";
            this.win.style.visibility = "visible";
            this.win.style.transform  = "none";
            this.isMinimized = false;
            setTimeout(()=> { this.BringToFront(); }, ANIM_DURATION/2);

            $w.focused = this;

        } else if (!isFocused && !force) { //pop
            this.Pop();

        } else { //minimize
            let iconPosition = this.task.getBoundingClientRect().x - this.win.offsetLeft - this.win.clientWidth/2;

            this.win.style.opacity    = "0";
            this.win.style.visibility = "hidden";
            this.win.style.transform  = "scale(.5) rotateX(10deg) translateY(" + container.clientHeight + "px) translateX(" + iconPosition + "px)";
            this.isMinimized = true;
          
            this.task.style.top = "2px";
            this.task.style.borderRadius = "12.5%";
            this.task.style.backgroundColor = "rgba(0,0,0,0)";
            this.icon.style.filter = "none";

            $w.focused = null;
        }

        setTimeout(()=> { this.win.style.transition = "0s"; }, ANIM_DURATION);
    }

    Pop() {
        if (this.isMinimized) {
            this.Minimize(); //minimize/restore
        } else {
            if (!this.isMaximized) this.win.style.animation = "focus-pop .2s";
            this.BringToFront();
            setTimeout(()=> { this.win.style.animation = "none" }, 200);
        }
    }

    BringToFront() {
        for (let i=0; i<$w.array.length; i++) {
            $w.array[i].task.style.top = "2px";
            $w.array[i].task.style.borderRadius = "12.5%";
            $w.array[i].task.style.backgroundColor = "rgba(0,0,0,0)";
            $w.array[i].icon.style.filter = "none";
        }

        if (this.isMaximized) {
            this.task.style.top = "0";
            this.task.style.borderRadius = "0 0 12.5% 12.5%";
        }

        this.task.style.backgroundColor = "rgb(" + this.themeColor[0] + "," + this.themeColor[1] + "," + this.themeColor[2] + ")";
        if ((this.themeColor[0]+this.themeColor[1]+this.themeColor[2]) / 3 < 128) this.icon.style.filter = "brightness(6)";

        if (this.win.style.zIndex < $w.count) this.win.style.zIndex = ++$w.count;

        $w.focused = this;
    }

    ConfirmBox(message, okOnly=false) {
        let confirm = document.createElement("div");
        confirm.className = "confirm";
        this.win.appendChild(confirm);

        let confirmBox = document.createElement("div");
        confirmBox.innerHTML = message;
        confirm.appendChild(confirmBox);

        let buttonBox = document.createElement("div");
        buttonBox.style.textAlign = "center";
        buttonBox.style.paddingTop = "24px";
        confirmBox.appendChild(buttonBox);

        let btnOK = document.createElement("input");
        btnOK.type = "button";
        btnOK.value = "OK";
        buttonBox.appendChild(btnOK);

        let btnCancel = document.createElement("input");
        btnCancel.type = "button";
        btnCancel.value = "Cancel";
        if (!okOnly) buttonBox.appendChild(btnCancel);

        confirmBox.onmousedown = event=> {event.stopPropagation(); this.BringToFront(); };

        this.content.style.filter = "blur(2px)";

        let once = false;
        btnCancel.onclick = (event)=> {
            if (once) return;
            once = true;

            confirm.style.filter = "opacity(0)";
            this.content.style.filter = "none";
            setTimeout(()=> {this.win.removeChild(confirm);}, ANIM_DURATION);
        };

        btnOK.onclick = event=> btnCancel.onclick(event);
        btnOK.focus();
        return btnOK;
    }

    DialogBox(height) {
        //if  a dialog is already opened, do nothing
        if (this.win.getElementsByClassName("dialog")[0] != null) return null;

        this.content.style.filter = "blur(2px) opacity(.2)";

        let dialog = document.createElement("div");
        dialog.className = "dialog";
        this.win.appendChild(dialog);

        let container = document.createElement("div");
        if (height != undefined) {
            container.style.maxHeight = height;
            container.style.borderRadius = "0 0 8px 8px";
        }
        dialog.appendChild(container);

        let innerBox = document.createElement("div");
        innerBox.style.position = "absolute";
        innerBox.style.left = "0";
        innerBox.style.right = "0";
        innerBox.style.top = "0";
        innerBox.style.bottom = "52px";
        innerBox.style.overflowY = "auto";
        container.appendChild(innerBox);

        let buttonBox = document.createElement("div");
        buttonBox.style.position = "absolute";
        buttonBox.style.textAlign = "center";
        buttonBox.style.bottom = "16px";
        buttonBox.style.width = "100%";
        container.appendChild(buttonBox);

        let btnOK = document.createElement("input");
        btnOK.type = "button";
        btnOK.value = "OK";
        buttonBox.appendChild(btnOK);

        let btnCancel = document.createElement("input");
        btnCancel.type = "button";
        btnCancel.value = "Cancel";
        buttonBox.appendChild(btnCancel);

        dialog.onmousedown = event=> {event.stopPropagation(); this.BringToFront(); };

        let once = false;
        btnCancel.onclick = (event)=> {
            if (once) return;
            once = true;
            dialog.style.filter = "opacity(0)";
            this.content.style.filter = "none";
            setTimeout(()=> {this.win.removeChild(dialog);}, ANIM_DURATION);
        };

        btnOK.onclick = event=> btnCancel.onclick(event);
        btnOK.focus();
        return [btnOK, innerBox];
    }

    AfterResize() { } //overridable

    setTitle(title="") {
        this.lblTitle.innerHTML = title;
        this.task.setAttribute("tip", title);
    }
    
    setIcon(icon) {
        this.icon.style.backgroundImage = "url(" + icon + ")";
        this.titleicon.style.backgroundImage = "url(" + icon + ")";
    }

    setThemeColor(color) {
        this.themeColor = color;
        this.content.style.backgroundColor = "rgb(" + color[0] + "," + color[1] + "," + color[2] + ")";

        if ((this.themeColor[0]+this.themeColor[1]+this.themeColor[2]) / 3 > 127)
            this.content.style.color = "#202020";
        //else
        //    this.content.style.color = "whitesmoke";
    }

    AddCheckBoxLabel(parent, checkbox, label) {
        let id = new Date().getTime() + Math.random() * 1000;
        checkbox.id = "id" + id;

        let newLabel = document.createElement("label");
        newLabel.innerHTML = label;
        newLabel.setAttribute("for", "id" + id);
        newLabel.setAttribute("tabindex", "0");
        newLabel.style.width = "80%";
        parent.appendChild(newLabel);

        newLabel.onkeydown = event=> {
            if (event.key == " " || event.key == "Enter") {
                checkbox.checked = !checkbox.checked;
                event.preventDefault();
                if (checkbox.onchange) checkbox.onchange();
            }
        };

        return newLabel;
    }

}

function body_resize(event) {
    alignIcon(false);

    for (let i=0; i<$w.array.length; i++) {
        $w.array[i].AfterResize();
        if ($w.array[i].InvalidateRecyclerList) 
            $w.array[i].InvalidateRecyclerList();
    }
}

function win_mousemove(event) {
    if ($w.active === null) return;

    if (event.buttons != 1 && !isIE) win_mouseup(event);

    document.getSelection().removeAllRanges(); //remove all selections

    if ($w.isMoving) {
        if ($w.active.isMaximized && event.clientY < 64) return;

        if ($w.active.isMaximized) {
            $w.active.Toogle();
            if ($w.active.position != null) {
                let w = parseFloat($w.active.position[2].replace("%", ""));
                $w.x0 = (w * container.clientWidth / 100) / 2;
                if (sidemenu_isopen) $w.x0 += SUBMENU_WIDTH;
            }
        }

        let x = ($w.offsetX - ($w.x0 - event.clientX)) * 100 / container.clientWidth;
        $w.active.win.style.left = Math.min(100 - $w.active.win.clientWidth * 100 / container.clientWidth, Math.max(0, x)) + "%";

        let y = ($w.offsetY - ($w.y0 - event.clientY)) * 100 / container.clientHeight;
        y = Math.min(100 - $w.active.win.clientHeight * 100 / container.clientHeight, Math.max(0, y));
        $w.active.win.style.top = ((y < 0) ? 0 : y) + "%";

    } else if ($w.isResizing) {
        let w = ($w.offsetX - ($w.x0 - event.clientX)) * 100 / container.clientWidth;
        let h = ($w.offsetY - ($w.y0 - event.clientY)) * 100 / container.clientHeight;
        $w.active.win.style.width = Math.min(100 - $w.active.win.offsetLeft * 100 / container.clientWidth, w) + "%";
        $w.active.win.style.height = Math.min(100 - $w.active.win.offsetTop * 100 / container.clientHeight, h) + "%";

        $w.active.AfterResize();

    } else if ($w.isIcoMoving) {
        let x = $w.offsetX - ($w.x0 - event.clientX);
        x = Math.max(0, x);
        x = Math.min(bottombar.clientWidth - $w.active.task.clientWidth, x);
        $w.active.task.style.left = x + "px";
        alignIcon(true);
    }
}

function win_mouseup(event) {
    //if (!$w.isMoving && !$w.isResizing) return;

    if ($w.active != null) {
        $w.active.task.style.transition = ANIM_DURATION/1000 + "s";
        $w.active.task.style.zIndex = "3";
        alignIcon(false);
    }

    $w.isMoving = false;
    $w.isResizing = false;
    $w.isIcoMoving = false;
    $w.active = null;
    //event.stopPropagation();
}

function win_keydown(event) {
    if (event.keyCode == 27) { //esc
        if ($w.focused === null) return;
        if ($w.focused.escAction === null) return;
        $w.focused.escAction();
    }
}

function alignIcon(ignoreActive) {
    $w.iconSize = (container.clientWidth / ($w.array.length) > 64) ? 64 : container.clientWidth / $w.array.length;

    for (let i = 0; i < $w.array.length; i++) {
        $w.array[i].task.style.width = ($w.iconSize-4) + "px";
        $w.array[i].task.style.height = ($w.iconSize-4) + "px";
    }

    bottombar.style.height = ($w.iconSize) + "px";
    main.style.bottom = ($w.iconSize) + "px";

    let temp = [];
    for (let i=0; i<$w.array.length; i++) temp.push($w.array[i].task);
    temp.sort((a, b)=> {return a.offsetLeft - b.offsetLeft} );   

    if (ignoreActive) {
        for (let i=0; i<temp.length; i++)
            if (temp[i] != $w.active.task) {
                temp[i].style.transition = ANIM_DURATION/1000 + "s";
                temp[i].style.left = 2 + i * $w.iconSize + "px";
            }
    } else {
        for (let i=0; i<temp.length; i++) {
            temp[i].style.transition = ANIM_DURATION/1000 + "s";
            temp[i].style.left = 2 + i * $w.iconSize + "px";
        }

        setTimeout(()=> {
            for (let i=0; i<temp.length; i++) temp[i].style.transition = "0s";
        }, ANIM_DURATION);
    }

}