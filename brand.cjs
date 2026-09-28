// Rebuild the vector brand assets and all Windows icon sizes.
const fs=require('fs'),path=require('path');
const sharp=require(process.env.SHARP_MODULE || 'sharp');
const out=path.resolve(process.env.BRAND_OUTPUT || path.join(__dirname,'brand-assets')),brand=path.join(__dirname,'app/brand');
fs.mkdirSync(brand,{recursive:true});fs.mkdirSync(out,{recursive:true});
const tile='<path d="M30 99 96 33M34 33h62v62" fill="none" stroke="#17eac2" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>';
const symbol=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><title>Glitch</title>${tile}</svg>`;
const lockup=color=>`<svg xmlns="http://www.w3.org/2000/svg" width="430" height="144" viewBox="0 0 430 144"><title>Glitch — real estate conversations</title><g transform="translate(8 8)">${color==='#FFFFFF'?tile:tile.replace('#17eac2','#ff554f')}</g><text x="160" y="99" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="86" font-weight="600" letter-spacing="-3">Glitch</text></svg>`;
(async()=>{
 fs.writeFileSync(path.join(brand,'symbol.svg'),symbol);
 fs.writeFileSync(path.join(brand,'wordmark.svg'),lockup('#18243B'));
 fs.writeFileSync(path.join(brand,'wordmark-white.svg'),lockup('#FFFFFF'));
 for(const [name,svg] of [['Glitch-logo',lockup('#18243B')],['Glitch-logo-white',lockup('#FFFFFF')],['Glitch-symbol',symbol]]){
  fs.writeFileSync(path.join(out,name+'.svg'),svg);
  await sharp(Buffer.from(svg)).resize(name.includes('symbol')?1024:2040).png().toFile(path.join(out,name+'.png'));
 }
 await sharp(Buffer.from(symbol)).resize(512).png().toFile(path.join(__dirname,'app/icon.png'));
 const sizes=[16,24,32,48,64,128,256],pngs=[];
 for(const size of sizes)pngs.push(await sharp(Buffer.from(symbol)).resize(size).png().toBuffer());
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((s,i)=>{const p=6+i*16;header[p]=s===256?0:s;header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(pngs[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=pngs[i].length;});
 const ico=Buffer.concat([header,...pngs]);fs.writeFileSync(path.join(__dirname,'app/icon.ico'),ico);fs.writeFileSync(path.join(out,'Glitch-icon.ico'),ico);
 console.log('Created vector wordmarks, transparent PNGs and seven Windows icon sizes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
