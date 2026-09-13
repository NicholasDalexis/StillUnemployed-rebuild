const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'../..');
test('Lexend is a local licensed variable font with the declared weight range',()=>{
  const folder=path.join(root,'assets/fonts/lexend');
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'SOURCE.json'),'utf8'));
  for(const [file,metadata] of Object.entries(receipt.files)){
    const data=fs.readFileSync(path.join(folder,file));assert.equal(data.length,metadata.bytes);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'),metadata.sha256);
    assert.match(metadata.source,/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\//);
  }
  assert.match(fs.readFileSync(path.join(folder,'OFL.txt'),'utf8'),/SIL OPEN FONT LICENSE Version 1\.1/);
  const font=fs.readFileSync(path.join(folder,'Lexend-Variable.ttf'));assert.equal(font.readUInt32BE(0),0x00010000);
  const tables={};for(let i=0;i<font.readUInt16BE(4);i++){const n=12+i*16;tables[font.toString('ascii',n,n+4)]=font.readUInt32BE(n+8);}
  const fvar=tables.fvar;assert(fvar);const axis=fvar+font.readUInt16BE(fvar+4);
  assert.equal(font.toString('ascii',axis,axis+4),'wght');assert.equal(font.readInt32BE(axis+4)/65536,100);assert.equal(font.readInt32BE(axis+12)/65536,900);
});
test('the body token changes while display and handwriting keep their separate local roles',()=>{
  const brand=fs.readFileSync(path.join(root,'css/brand.css'),'utf8');
  assert.match(brand,/--su-body:\s*'Lexend', system-ui, sans-serif/);
  assert.match(brand,/--su-display:\s*'Archivo Black'/);assert.match(brand,/--su-hand:\s*'Indie Flower'/);
  const fonts=fs.readFileSync(path.join(root,'css/fonts.css'),'utf8');
  const lexend=fonts.match(/@font-face\s*\{[^}]*font-family:\s*'Lexend'[^}]*\}/);assert(lexend);
  assert.match(lexend[0],/font-weight:\s*100 900/);assert.match(lexend[0],/font-display:\s*swap/);
  assert.match(lexend[0],/url\("\.\.\/assets\/fonts\/lexend\/Lexend-Variable\.ttf"\)/);assert.doesNotMatch(lexend[0],/https?:/);
});
