# Pro-test
## Join the revolution!

#### This repository contains the source code for:
  * **Pro-test back-end application** (HTTP server, database, fetching and managing tools)
  * **Pro-test front-end web page**
  * **Address book** (populated from active directory)
  * **Remote agent**
  * **Pro-tools**

Pro-test provide tools to organize your network environment. It can create a database of users and equipment by fetching from your domain controller or by scanning your network.


**It collects information such:**
  * Hardware specification
  * Model and serial number
  * Network information
  * User information
  * Logged in user and start time

**Additionally you can:**
  * Send a wake on lan packet
  * Turn off, restart, or log off computers
  * Remotly connect to computers using SSH, RDP, SMB, uVNC or PSExec
  * Manage processes and services
  * Enable, disable or unlock users

**Additional tools can help you manage and troubleshoot:**
  * Ping
  * DNS lookup
  * Trace route
  * Port scan
  * Locate IP  *[demo](https://veniware.github.io/#locateip)*
  * MAC lookup  *[demo](https://veniware.github.io/#maclookup)*
  * Website check
  * Sub-net calculator  *[demo](https://veniware.github.io/#netcalc)*
  * WMI console
  * Password generator  *[demo](https://veniware.github.io/#passgen)*
  * Debit notes

Pro-test is intended to be used as a portable tool. In that case, the web interface can be accessed via the loopback address without authentication.
By default, it listens only on localhost:80. (check *[config file](https://github.com/veniware/OpenProtest/blob/master/OpenProtest/bin/config.txt)*).

:exclamation: **If you want to use pro-test as a centralized service, we highly recommend to use a secure reverse proxy, such as [nginx](http://nginx.org/en/download.html).**

Requests from IP other than loopback are rejected and require a username and a password.
The username must be whitelisted in the [config file](https://github.com/veniware/OpenProtest/blob/master/OpenProtest/bin/config.txt) and the password will be verified by your domain controller.
If you use a reverse proxy, in order for the authentication to work properly, you need to pass the "X-Forwarded-For" header from your proxy to the back-end *([see example](https://github.com/veniware/OpenProtest/blob/master/Tools%20and%20Docs/nginx.conf)).*
