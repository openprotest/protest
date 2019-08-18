/* Windows.js is a vanilla javascript library, designed for Pro-test 3.1
 * Created by Andreas Venizelou, June 2018.
 * Released into the public domain.
 */

/* The DOM needs to have a div with id="container" for the Windows
 * and another div with id="bottombar" for the taskbar icons.
 */
 
const ANIM_DURATION = 200;
const TOOLBAR_GAP   = 48;

var w_always_maxxed = false;

var w_array   = [];
var w_active  = null;
var w_focused = null;

var w_iconSize        = 64;
var w_isMoving        = false;
var w_isResizing      = false;
var w_isIcoMoving     = false;
var w_control_pressed = false;
var w_x0 = 0, w_y0 = 0;
var w_offsetX = 0, w_offsetY = 0;
var w_startX = 10, w_startY = 10;
var w_wincount = 0;

bottombar.onmousedown = event=> { if (event.button == 1) event.preventDefault(); }; //prevent mid-mouse scroll

document.body.onresize    = body_resize;
document.body.onmousemove = win_mousemove;
document.body.onmouseup   = win_mouseup;
document.body.onkeydown   = win_keydown;
//document.body.oncontextmenu = (event) => { return false; };

class Window {
    
    constructor(themeColor = [56,56,56]) {
        this.isMaximized = false;
        this.isMinimized = false;
        this.isClosed    = false;
        this.position    = null;
        this.themeColor  = themeColor;
        this.defaultElement = null;
        this.escAction = null;

        w_startX += 2;
        w_startY += 6;
        if (w_startY >= 40) {
            w_startY = 4;
            w_startX -= 10;
        }
        if (w_startX >= 40) {
            w_startY = 10;
            w_startX = 10;
        }

        this.win = document.createElement("div");
        this.win.style.left   = w_startX + "%";
        this.win.style.top    = w_startY + "%";
        this.win.style.width  = "50%";
        this.win.style.height = "60%";
        this.win.style.zIndex = ++w_wincount;
        this.win.className    = "window";
        container.appendChild(this.win);

        this.task = document.createElement("div");
        this.task.className = "bar-icon";
        this.task.style.left = 2 + w_array.length * 64 + "px";
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

        let w_dblclickCheck = false;
        this.win.onmousedown = (event)=> {
            this.BringToFront();
            if (event.button == 0 && event.offsetY < 32) { //left click on title bar
                w_offsetX  = this.win.offsetLeft;
                w_offsetY  = this.win.offsetTop;
                w_x0       = event.clientX;
                w_y0       = event.clientY;
                w_isMoving = true;

                if (w_dblclickCheck && !onMobile) {
                    this.Toogle();
                    w_dblclickCheck = false;
                    return;
                }
                w_dblclickCheck = true;
                setTimeout(()=> { w_dblclickCheck = false; }, 333);
            }
            w_active = this;
            w_focused = this;
        };

        //this.win.onmouseup = (event)=> { if (this.defaultElement != null) this.defaultElement.focus(); };

        this.resize.onmousedown = (event)=> {
            this.BringToFront();
            if (event.button == 0) { //left click
                w_offsetX  = this.win.clientWidth;
                w_offsetY  = this.win.clientHeight;
                w_x0 = event.clientX;
                w_y0 = event.clientY;
                w_isResizing = true;
                w_active = this;
            }
            event.stopPropagation();
        };

        let icoPosition = 0;
        this.task.onmousedown = (event)=> {
            if (event.button == 0) { //left click
                icoPosition = this.task.offsetLeft;

                this.task.style.zIndex = "5";
                w_offsetX  = this.task.offsetLeft;
                w_x0 = event.clientX;
                w_isIcoMoving = true;
                w_active = this;
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
            w_control_pressed = this;
            this.BringToFront();
            event.stopPropagation();
        };
        
        btnClose.onmouseup    = (event)=> { if (event.button==0 && w_control_pressed==this) {w_control_pressed=null; this.Close();} };
        btnMaximize.onmouseup = (event)=> { if (event.button==0 && w_control_pressed==this) {w_control_pressed=null; this.Toogle();} };
        btnMinimize.onmouseup = (event)=> { if (event.button==0 && w_control_pressed==this) {w_control_pressed=null; this.Minimize();} };
    
        this.setTitle("Title");
        w_array.push(this);
        //alignIcon(false);

        this.setThemeColor(this.themeColor);
        this.BringToFront();

        alignIcon(false);

        if (onMobile || w_always_maxxed) this.Toogle();
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
            w_array.splice(w_array.indexOf(this), 1);
            alignIcon(false);
        }, ANIM_DURATION/2);

        w_focused = null;
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
        let isFocused = (w_wincount == this.win.style.zIndex);
        this.win.style.transition = ".3s";

        if (this.isMinimized && !force) { //restore
            this.win.style.opacity    = "1";
            this.win.style.visibility = "visible";
            this.win.style.transform  = "none";
            this.isMinimized = false;
            setTimeout(()=> { this.BringToFront(); }, ANIM_DURATION/2);

            w_focused = this;

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

            w_focused = null;
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
        for (let i=0; i<w_array.length; i++) {
            w_array[i].task.style.top = "2px";
            w_array[i].task.style.borderRadius = "12.5%";
            w_array[i].task.style.backgroundColor = "rgba(0,0,0,0)";
            w_array[i].icon.style.filter = "none";
        }

        if (this.isMaximized) {
            this.task.style.top = "0";
            this.task.style.borderRadius = "0 0 12.5% 12.5%";
        }

        this.task.style.backgroundColor = "rgb(" + this.themeColor[0] + "," + this.themeColor[1] + "," + this.themeColor[2] + ")";
        if ((this.themeColor[0]+this.themeColor[1]+this.themeColor[2]) / 3 < 128) this.icon.style.filter = "brightness(6)";

        if (this.win.style.zIndex < w_wincount) this.win.style.zIndex = ++w_wincount;

        w_focused = this;
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

    AfterResize() {
        //override me...
    }

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
    }

}

function body_resize(event) {
    alignIcon(false);

    for (let i=0; i<w_array.length; i++) {
        w_array[i].AfterResize();
        if (w_array[i].InvalidateRecyclerList) 
            w_array[i].InvalidateRecyclerList();
    }
}

function win_mousemove(event) {
    if (w_active === null) return;

    if (event.buttons != 1 && !isIE) win_mouseup(event);

    document.getSelection().removeAllRanges(); //remove all selections

    if (w_isMoving) {
        if (w_active.isMaximized && event.clientY < 64) return;

        if (w_active.isMaximized) {
            w_active.Toogle();
            if (w_active.position != null) {
                let w = parseFloat(w_active.position[2].replace("%", ""));
                w_x0 = (w * container.clientWidth / 100) / 2;
                if (sidemenu_isopen) w_x0 += SUBMENU_WIDTH;
            }
        }

        let x = (w_offsetX - (w_x0 - event.clientX)) * 100 / container.clientWidth;
        w_active.win.style.left = Math.min(100 - w_active.win.clientWidth * 100 / container.clientWidth, Math.max(0, x)) + "%";

        let y = (w_offsetY - (w_y0 - event.clientY)) * 100 / container.clientHeight;
        y = Math.min(100 - w_active.win.clientHeight * 100 / container.clientHeight, Math.max(0, y));
        w_active.win.style.top = ((y < 0) ? 0 : y) + "%";

    } else if (w_isResizing) {
        let w = (w_offsetX - (w_x0 - event.clientX)) * 100 / container.clientWidth;
        let h = (w_offsetY - (w_y0 - event.clientY)) * 100 / container.clientHeight;
        w_active.win.style.width = Math.min(100 - w_active.win.offsetLeft * 100 / container.clientWidth, w) + "%";
        w_active.win.style.height = Math.min(100 - w_active.win.offsetTop * 100 / container.clientHeight, h) + "%";

        w_active.AfterResize();

    } else if (w_isIcoMoving) {
        let x = w_offsetX - (w_x0 - event.clientX);
        x = Math.max(0, x);
        x = Math.min(bottombar.clientWidth - w_active.task.clientWidth, x);
        w_active.task.style.left = x + "px";
        alignIcon(true);
    }
}

function win_mouseup(event) {
    //if (!w_isMoving && !w_isResizing) return;

    if (w_active != null) {
        w_active.task.style.transition = ANIM_DURATION/1000 + "s";
        w_active.task.style.zIndex = "3";
        alignIcon(false);
    }

    w_isMoving = false;
    w_isResizing = false;
    w_isIcoMoving = false;
    w_active = null;
    //event.stopPropagation();
}

function win_keydown(event) {
    if (event.keyCode == 27) { //esc
        if (w_focused === null) return;
        if (w_focused.escAction === null) return;
        w_focused.escAction();
    }
}

function alignIcon(ignoreActive) {
    w_iconSize = (container.clientWidth / (w_array.length) > 64) ? 64 : container.clientWidth / w_array.length;

    for (let i=0; i<w_array.length; i++) {
        w_array[i].task.style.width = (w_iconSize-4) + "px";
        w_array[i].task.style.height = (w_iconSize-4) + "px";
    }

    bottombar.style.height = (w_iconSize) + "px";
    main.style.bottom = (w_iconSize) + "px";

    let temp = [];
    for (let i=0; i<w_array.length; i++) temp.push(w_array[i].task);
    temp.sort((a, b)=> {return a.offsetLeft - b.offsetLeft} );   

    if (ignoreActive) {
        for (let i=0; i<temp.length; i++) 
        for (let i=0; i<temp.length; i++)
            if (temp[i] != w_active.task) {
                temp[i].style.transition = ANIM_DURATION/1000 + "s";
                temp[i].style.left = 2 + i * w_iconSize + "px";
            }
    } else {
        for (let i=0; i<temp.length; i++) {
            temp[i].style.transition = ANIM_DURATION/1000 + "s";
            temp[i].style.left = 2 + i * w_iconSize + "px";
        }

        setTimeout(()=> {
            for (let i=0; i<temp.length; i++) temp[i].style.transition = "0s";
        }, ANIM_DURATION);
    }

}