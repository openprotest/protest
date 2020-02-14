class Netcalc extends Window {
    constructor() {
        super();

        this.setTitle("Network calculator");
        this.setIcon("res/netcalc.svgz");

        this.content.style.overflow = "auto";
        this.content.style.padding = "16px";
        this.content.style.display = "grid";
        this.content.style.gridTemplateColumns = "192px 72px 192px 96px";
        this.content.style.gridTemplateRows = "repeat(10, 32px)";
        this.content.style.alignItems = "end";
        
        let lblAddress = document.createElement("div");
        lblAddress.innerHTML = "IP address:";
        lblAddress.style.gridColumn = "1";
        lblAddress.style.gridRow = "1";
        this.content.appendChild(lblAddress);

        let divAddress = document.createElement("div");
        divAddress.style.gridColumn = "1";
        divAddress.style.gridRow = "2";
        this.content.appendChild(divAddress);       
        this.ipAddress = new IpBox();
        this.ipAddress.SetIp(192, 168, 0, 0);
        this.ipAddress.Attach(divAddress);

        this.lblClass = document.createElement("div");
        this.lblClass.innerHTML = "Class C";
        this.lblClass.style.gridColumn = "2";
        this.lblClass.style.gridRow = "2";
        this.lblClass.style.padding = "10px 0px";
        this.content.appendChild(this.lblClass);

        let lblMask = document.createElement("div");
        lblMask.innerHTML = "Subnet mask:";
        lblMask.style.gridColumn = "1";
        lblMask.style.gridRow = "3";
        this.content.appendChild(lblMask);

        let divMask = document.createElement("div");
        divMask.style.gridColumn = "1";
        divMask.style.gridRow = "4";
        this.content.appendChild(divMask);
        this.ipMask = new IpBox();
        this.ipMask.SetIp(255, 255, 255, 0);
        this.ipMask.Attach(divMask);

        let lblSlash = document.createElement("div");
        lblSlash.innerHTML = "/";
        lblSlash.style.display = "inline-block";
        lblSlash.style.paddingLeft = "4px";
        divMask.appendChild(lblSlash);

        let lblCIDR = document.createElement("div");
        lblCIDR.innerHTML = "CIDR:";
        lblCIDR.value = "24";
        lblCIDR.style.gridColumn = "2";
        lblCIDR.style.gridRow = "3";
        this.content.appendChild(lblCIDR);

        this.txtCIDR = document.createElement("input");
        this.txtCIDR.type = "number";
        this.txtCIDR.min = "4";
        this.txtCIDR.max = "30";
        this.txtCIDR.value = "24";
        this.txtCIDR.style.width = "40px";
        this.txtCIDR.style.marginLeft = "0px";
        this.txtCIDR.style.gridColumn = "2";
        this.txtCIDR.style.gridRow = "4";
        this.content.appendChild(this.txtCIDR);

        this.rngCIDR = document.createElement("input");
        this.rngCIDR.type = "range";
        this.rngCIDR.min = "4";
        this.rngCIDR.max = "30";
        this.rngCIDR.value = "24";
        this.rngCIDR.style.gridColumn = "3";
        this.rngCIDR.style.gridRow = "4";
        this.rngCIDR.style.margin = "10px 0";
        this.rngCIDR.style.marginLeft = "8px";
        this.content.appendChild(this.rngCIDR);

        this.divMap = document.createElement("div");
        this.divMap.style.gridArea = "7 / 4 / 1 / 1";
        this.divMap.style.padding = "8px";
        this.divMap.style.textAlign = "center";
        this.content.appendChild(this.divMap);

        this.lblSubnet = document.createElement("div");
        this.lblSubnet.innerHTML = "Subnet:<br>192.168.0.0";
        this.lblSubnet.style.gridArea = "9 / 2 / 1 / 1";
        this.lblSubnet.style.textAlign = "center";
        this.content.appendChild(this.lblSubnet);

        this.lblBroadcast = document.createElement("div");
        this.lblBroadcast.innerHTML = "Broadcast:<br>192.168.0.255";
        this.lblBroadcast.style.gridArea = "9 / 3 / 1 / auto";
        this.lblBroadcast.style.textAlign = "center";
        this.content.appendChild(this.lblBroadcast);

        this.lblRange = document.createElement("div");
        this.lblRange.innerHTML = "Host range:<br>192.168.0.1 - 192.168.0.254";
        this.lblRange.style.gridArea = "11 / 1 / 1 / 4";
        this.lblRange.style.textAlign = "center";
        this.content.appendChild(this.lblRange);

        this.lblTotal = document.createElement("div");
        this.lblTotal.innerHTML = "Hosts:<br>254";
        this.lblTotal.style.gridArea = "11 / 4 / 1 / 4";
        this.lblTotal.style.textAlign = "center";
        this.lblTotal.style.marginLeft = "8px";
        this.content.appendChild(this.lblTotal);

        this.divMap.style.border = this.lblSubnet.style.border = this.lblBroadcast.style.border = this.lblRange.style.border = this.lblTotal.style.border = "rgb(224,224,224) 1px solid";
        this.divMap.style.borderRadius = this.lblSubnet.style.borderRadius = this.lblBroadcast.style.borderRadius = this.lblRange.style.borderRadius = this.lblTotal.style.borderRadius = "4px";

        this.lblSubnet.style.userSelect = this.lblBroadcast.style.userSelect = this.lblRange.style.userSelect = this.lblTotal.style.userSelect = "text";
        this.lblSubnet.style.webkitUserSelect = this.lblBroadcast.style.webkitUserSelect = this.lblRange.style.webkitUserSelect = this.lblTotal.style.webkitUserSelect = "text";

        this.txtCIDR.oninput = () => {
            this.rngCIDR.value = this.txtCIDR.value;

            let octet = Math.floor(this.txtCIDR.value / 8);
            let value = this.txtCIDR.value % 8;

            for (let i = 0; i < octet; i++)
                this.ipMask.textBoxes[i].value = 255;

            for (let i = octet + 1; i < 4; i++)
                this.ipMask.textBoxes[i].value = 0;

            let v = 0;
            for (let i = 0; i < value; i++)
                v += Math.pow(2, 7 - i);
            this.ipMask.textBoxes[octet].value = v;

            this.Calculate();
        };

        this.rngCIDR.oninput = () => {
            this.txtCIDR.value = this.rngCIDR.value;

            let octet = Math.floor(this.rngCIDR.value / 8);
            let value = this.rngCIDR.value % 8;

            for (let i = 0; i < octet; i++)
                this.ipMask.textBoxes[i].value = 255;

            for (let i = octet+1; i < 4; i++)
                this.ipMask.textBoxes[i].value = 0;

            let v = 0;
            for (let i = 0; i < value; i++)
                v += Math.pow(2, 7-i);
            this.ipMask.textBoxes[octet].value = v;

            this.Calculate();
        };

        for (let i = 0; i < 32; i++) {
            let newBit = document.createElement("div");
            newBit.style.display = "inline-block";
            newBit.style.width = "12px";
            newBit.style.height = "14px";
            newBit.style.margin = "0 1px 0 0";
            newBit.style.borderRadius = "1px";
            newBit.style.transition = ".4s";
            if (i % 8 == 0 && 1 > 0) newBit.style.margin = "0 1px 0 4px";

            this.divMap.appendChild(newBit);
        }

        this.ipAddress.textBoxes[0].onkeyup = this.ipAddress.textBoxes[0].oninput =
        this.ipAddress.textBoxes[1].onkeyup = this.ipAddress.textBoxes[1].oninput =
        this.ipAddress.textBoxes[2].onkeyup = this.ipAddress.textBoxes[2].oninput =
        this.ipAddress.textBoxes[3].onkeyup = this.ipAddress.textBoxes[3].oninput = () => {
            this.Calculate();
        };

        this.ipMask.textBoxes[0].onkeyup = this.ipMask.textBoxes[0].oninput =
        this.ipMask.textBoxes[1].onkeyup = this.ipMask.textBoxes[1].oninput =
        this.ipMask.textBoxes[2].onkeyup = this.ipMask.textBoxes[2].oninput =
        this.ipMask.textBoxes[3].onkeyup = this.ipMask.textBoxes[3].oninput = () => {
            let bits = parseInt(this.ipMask.textBoxes[0].value).toString(2) +
                       parseInt(this.ipMask.textBoxes[1].value).toString(2) +
                       parseInt(this.ipMask.textBoxes[2].value).toString(2) +
                       parseInt(this.ipMask.textBoxes[3].value).toString(2);

            let bitcount = 0;
            for (let i = 0; i < bits; i++) {
                if (bits[i] == "0") break;
                bitcount++;
            }

            this.rngCIDR.value = bitcount;
            this.txtCIDR.value = bitcount;

            this.Calculate();
        };

        this.Calculate();
    }

    Calculate() {
        let ip = this.ipAddress.GetIpArray();
        let mask = this.ipMask.GetIpArray();

        let octet = parseInt(this.ipAddress.GetIpArray()[0]);
        let octet2 = parseInt(this.ipAddress.GetIpArray()[1]);

        if (octet == 10) this.lblClass.innerHTML = "Private";
        else if (octet > 0 && octet < 127) this.lblClass.innerHTML = "Class A";
        else if (octet == 127) this.lblClass.innerHTML = "Local host";

        else if (octet == 172 && octet2 > 15 && octet2 < 32) this.lblClass.innerHTML = "Private";
        else if (octet > 127 && octet < 192) this.lblClass.innerHTML = "Class B";

        else if (octet == 192) this.lblClass.innerHTML = "Private";
        else if (octet > 192 && octet < 224) this.lblClass.innerHTML = "Class C";

        else if (octet >= 224 && octet < 240) this.lblClass.innerHTML = "Class D";
        else this.lblClass.innerHTML = "";

        let net = [], broadcast = [];
        for (let i = 0; i < 4; i++) {
            net.push(ip[i] & mask[i]);
            broadcast.push(ip[i] | (255-mask[i]));
        }

        let static_bits = 0;
        if (octet > 0 && octet <= 127)        static_bits = 8;
        else if (octet > 127 && octet <= 192) static_bits = 16;
        else                                  static_bits = 24;

        for (let i = 0; i < 32; i++)
            this.divMap.childNodes[i].style.backgroundColor = i < this.rngCIDR.value ? "rgb(232,118,0)" : "rgb(111,212,43)";

        for (let i = 0; i < static_bits; i++)
            this.divMap.childNodes[i].style.backgroundColor = i < this.rngCIDR.value ? "rgb(232,0,0)" : "rgb(111,212,43)";
        
        this.lblSubnet.innerHTML = "Subnet:<br>" + net.join(".");
        this.lblBroadcast.innerHTML = "Broadcast:<br>" + broadcast.join(".");
        this.lblRange.innerHTML = "Host range:<br>" + net[0] + "." + net[1] + "." + net[2] + "." + (net[3] + 1) + " - " +
                                   broadcast[0] + "." + broadcast[1] + "." + broadcast[2] + "." + (broadcast[3]-1);

        this.lblTotal.innerHTML = "Hosts:<br>" + (Math.pow(2, 32-this.rngCIDR.value) - 2);
    }
}