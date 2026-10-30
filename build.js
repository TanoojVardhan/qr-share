const fs=require('fs');
const rd=p=>fs.readFileSync(p,'utf8');
const libs={QRCODE:rd('node_modules/qrcode-generator/qrcode.js'),JSQR:rd('node_modules/jsqr/dist/jsQR.js'),CORE:rd('core.js')};
for(const[k,v]of Object.entries(libs)) if(/<\/script/i.test(v)) throw k+' contains </script';
let h=rd('app.html'); for(const[k,v]of Object.entries(libs)) h=h.replace(`/*__${k}__*/`,()=>v);
fs.writeFileSync('qr-beam.html',h); console.log('size',(h.length/1024).toFixed(0)+'KB');
