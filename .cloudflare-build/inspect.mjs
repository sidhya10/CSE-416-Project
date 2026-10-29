import fs from 'node:fs/promises';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
const p=await PresentationFile.importPptx(await FileBlob.load('/Users/eva/Downloads/CSE416 Topic Presentation.pptx'));
console.log((await p.inspect({select:'$.slides[6,7,8,9]',include:['id','index','elements.id','elements.text','elements.position','elements.style']})).ndjson);
console.log('masters',p.masters.items.map(m=>m.id));
for(let i of [6,7,8,9]) await fs.writeFile(`/Users/eva/Desktop/CSE-416-Project/.cloudflare-build/source-${i+1}.png`,new Uint8Array(await (await p.slides.items[i].export({format:'png'})).arrayBuffer()));
await fs.writeFile('/Users/eva/Desktop/CSE-416-Project/.cloudflare-build/help.txt',(await p.help('presentation',{include:'full'})).ndjson);
