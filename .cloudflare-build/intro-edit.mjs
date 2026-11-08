import fs from'node:fs/promises';import{FileBlob,PresentationFile}from'@oai/artifact-tool';
const src='/Users/eva/Downloads/Software Maintenance, Technical Debt and Refactoring - CSE416 Topic Presentation.pptx';
const p=await PresentationFile.importPptx(await FileBlob.load(src));p.slides.keep([1]);const s=p.slides.items[0];
for(const sh of [...s.shapes.items])if(sh.position.width>10)sh.delete();
function t(text,x,y,w,h,size,color='#F7F9FC',bold=false){let q=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});q.text=text;q.text.style={fontFamily:'Arial',fontSize:size,color,bold};}
t('The challenge of changing working software',47,35,864,55,30.67,'#F7F9FC',true);
t('How do teams improve existing software\nwithout creating new failures?',65,123,830,100,34.67,'#F7F9FC',true);
t('A small change can remove a safeguard. Delayed upkeep can leave a security gap. Replacing old code can take years.',65,239,830,70,22.67);
const cases=[['Cloudflare','A refactor removed\na CPU safeguard.'],['Netflix','Growing demands\noutgrew an old design.'],['Equifax','A known vulnerability\nwent unpatched.'],['Netscape','Replacing old code\ndelayed a major release.']];
for(let i=0;i<4;i++){const x=65+i*212;t(cases[i][0],x,341,202,36,23,'#189D94',true);t(cases[i][1],x,387,202,71,19);}
t('Four cases: what went wrong, how teams responded, and what we can learn.',65,469,830,29,17,'#9DACBC');t('INTRODUCTION',50,506,648,22,10.67,'#9DACBC');
await fs.writeFile('.cloudflare-build/intro-after.png',new Uint8Array(await(await s.export({format:'png'})).arrayBuffer()));
await(await PresentationFile.exportPptx(p)).save('.cloudflare-build/intro-single.pptx');
