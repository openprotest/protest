<p align="center"><img src="https://raw.githubusercontent.com/openprotest/protest/master/protest.png" /></p>
<h1 align="center">Pro-test</h1>
<h2 align="center">A management base for System Admins</h2>
<br>

[![Download](https://custom-icon-badges.demolab.com/badge/-Download-blue?style=for-the-badge&logo=download&logoColor=white "Download")](https://github.com/openprotest/protest/releases/latest)

### Overview:
Pro-test is a robust solution for creating and managing an inventory database of your network environment.
It leverages data collection techniques by interacting with Active Directory or performing local network scans.
The suite automatically populates the database by targeting the domain controller or specified IP ranges.

**Pro-test provides complite data ownership, with all collected data remaining fully under your control.**

<p align="center"><img src="https://raw.githubusercontent.com/openprotest/openprotest.github.io/refs/heads/main/screenshot.png"/></p>

### How to use:
Pro-test is portable and self-contained, with a web interface accessible via the loopback address.
If you need to run it remotely, the included `Reverse proxy` allows for external access.
Authentication is required for requests originating from IPs other than the loopback address.
If you opt to use a different reverse proxy, ensure that the `X-Real-IP` header is forwarded.
If Pro-test fails to bind to the configured endpoint, it will attempt to bind to a fallback endpoint `127.0.0.1:8080`.
Pro-test runs with the privileges of the user executing it. For administrative tasks like WMI or Active Directory access, it must be run with Network Administrator privileges.

### Tools and utilities:
Pro-test includes a wide range of tools and utilities designed for system administration and network management:

#### **Network utilities**
- Ping utility (ICMP and ARP)
- DNS lookup
- mDNS discovery
- Trace route
- Port scan
- MAC address lookup
- DHCP client
- NTP client
- Website health check
- SNMP and WMI polling
- SSH and telnet client

#### **Network monitoring**
- Network topology
- IP discovery tool
- Network watchdog
- Reverse proxy
- Issue detection

#### **Documentation and communication**
- Documentation
- Debit notes
- Address book
- Integrated team chat

### Repo components:
  - **Protest:** The front-end and back-end workings.
  - **Protest-CacheGenerator:** A source-generator that embeds the front-end UI into the backend executable.
  - **Protest-MacLookupGenerator:** A source-generator that embeds the the mac-to-vendor database into the executable.
  - **Protest Agent:** A tool to enable the browser to communicate with the client's computer using a local communication protocol (`protest://`).

### Continuous Integration
![build](https://img.shields.io/github/actions/workflow/status/openprotest/protest/dotnet.yml?label=Build&style=for-the-badge)
![code-analyze](https://img.shields.io/github/actions/workflow/status/openprotest/protest/codeql.yml?label=Analyze%20Back-end&style=for-the-badge)
![code-analyze](https://img.shields.io/github/actions/workflow/status/openprotest/protest/codeql-front.yml?label=Analyze%20Front-end&style=for-the-badge)

### Release
![License](https://img.shields.io/github/license/openprotest/protest?style=for-the-badge)
![Release](https://img.shields.io/github/release/openprotest/protest?style=for-the-badge)
![Commits since](https://img.shields.io/github/commits-since/openprotest/protest/latest?style=for-the-badge)
![Downloads](https://img.shields.io/github/downloads/openprotest/protest/total?style=for-the-badge)

### Platform support
![Windows](https://img.shields.io/badge/Windows-0078D6?logo=windows&style=for-the-badge)
![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=222&style=for-the-badge)
![MacOS](https://shields.io/badge/Mac%20OS-ccc?logo=Apple&logoColor=222&style=for-the-badge)

### Sponsor:
*[![Sponsor](https://img.shields.io/badge/Sponsor%20on%20GitHub-374046?style=for-the-badge&logo=github)](https://github.com/sponsors/veniware)*
*[![Donate](https://img.shields.io/badge/Donate-00457C?style=for-the-badge&logo=paypal)](https://www.paypal.com/paypalme/veniware)*
