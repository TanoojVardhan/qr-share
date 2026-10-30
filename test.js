require('./core.js'); const {Encoder,Decoder,b45enc,b45dec}=QRBeam;
const qrcode=require('qrcode-generator');
const crypto=require('crypto');
// base45 roundtrip
for(let n=0;n<50;n++){const b=crypto.randomBytes(n);const r=b45dec(b45enc(b));if(Buffer.compare(Buffer.from(r),b))throw 'b45 fail '+n}
for (const [size,bs] of [[10,700],[2_000_000,700],[200_000,1200],[50_000,300]]) {
  const file=new Uint8Array(crypto.randomBytes(size));
  const e=new Encoder(file,'photo.jpg','image/jpeg',bs);
  for (const loss of [0,0.3,0.6]) {
    const d=new Decoder(); let sent=0, st;
    // receiver joins late: start at seed 37
    for(let s=37;;s++){ sent++; if(Math.random()<loss) continue; st=d.addFrame(e.frame(s)); if(st==='done')break; if(sent>e.K*10)throw 'stuck';}
    const ok=d.result.ok && Buffer.compare(Buffer.from(d.result.bytes),Buffer.from(file))===0;
    console.log(`size ${size} bs ${bs} K ${e.K} loss ${loss}: received ${d.packets} (${(d.packets/e.K).toFixed(3)}x K), ok=${ok}`);
  }
  const f=e.frame(e.K+5); const t=Date.now(); let q;
  for(let i=0;i<20;i++){q=qrcode(0,'L');q.addData(f,'Alphanumeric');q.make();}
  console.log(`  frame chars ${f.length}, QR modules ${q.getModuleCount()}, ${(Date.now()-t)/20}ms/QR`);
}
