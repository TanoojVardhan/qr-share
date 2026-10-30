require('./core.js'); const qrcode=require('qrcode-generator'); const jsQR=require('jsqr'); const crypto=require('crypto');
const file=new Uint8Array(crypto.randomBytes(30000)); const e=new QRBeam.Encoder(file,'test.png','image/png',1200);
const d=new QRBeam.Decoder(); let s=0, st, fails=0;
while(st!=='done'){ const qr=qrcode(0,'L'); qr.addData(e.frame(s++),'Alphanumeric'); qr.make();
 const n=qr.getModuleCount(), sc=4, q=4, size=(n+2*q)*sc; const px=new Uint8ClampedArray(size*size*4).fill(255);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const r=Math.floor(y/sc)-q,c=Math.floor(x/sc)-q; if(r>=0&&c>=0&&r<n&&c<n&&qr.isDark(r,c)){const o=(y*size+x)*4;px[o]=px[o+1]=px[o+2]=0;}}
 const res=jsQR(px,size,size); if(!res){fails++;continue;} st=d.addFrame(res.data); }
console.log('K',e.K,'frames',s,'jsQR fails',fails,'ok',d.result.ok, d.result.name, Buffer.compare(Buffer.from(d.result.bytes),Buffer.from(file))===0);
