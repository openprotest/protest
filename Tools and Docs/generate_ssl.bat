rem feel free top modify this file

rem !! This script requires OpenSSL !!
rem https://www.openssl.org

ECHO off

ECHO %RANDOM%-%RANDOM%-%RANDOM%-%RANDOM%-%RANDOM%-%RANDOM%-%RANDOM%-%RANDOM% > .rnd
SET RANDFILE=.rnd

ECHO -- GENERATE SSL CERTIFICATE --
ECHO ------------------------------

ECHO -- Generate private key:
openssl genpkey -algorithm RSA -out private.key -outform PEM -pkeyopt rsa_keygen_bits:4096

ECHO -- Generate certificate signing request:
openssl req -new -key private.key -inform PEM -out csr.csr -outform PEM

ECHO -- Generate self signed certificate:
openssl x509 -req -days 36500 -in csr.csr -signkey private.key -out crt.crt -extensions v3_ca

ECHO -- Generate a public key cryptography file:
openssl pkcs12 -export -out public.pfx -inkey private.key -in crt.crt
