# QR Beam

Send files between two phones using animated QR codes. No network, no pairing, no Bluetooth.

## Use it
1. Host `qr-beam.html` on any https site (drag it onto https://app.netlify.com/drop, or use GitHub Pages as `index.html`). The camera only works over https.
2. Open the link on both phones.
3. Phone A: **Send** -> choose a file -> **Start beaming**.
4. Phone B: **Receive** -> **Start camera** -> point it at phone A from 15-30 cm.

## Files
- `qr-beam.html` – the built app, single self-contained file (open/host this one)
- `app.html` – page source with placeholders for the libraries
- `core.js` – Base45 packing + LT fountain encoder/decoder
- `build.js` – inlines qrcode-generator, jsQR and core.js into `qr-beam.html`
- `test.js`, `e2e.js` – codec tests (packet loss, late join, full QR round trip)

## Rebuild
```
npm install
node build.js
node test.js
```
