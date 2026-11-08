import fs from 'node:fs/promises';import{FileBlob,PresentationFile}from'@oai/artifact-tool';
const p=await PresentationFile.importPptx(await FileBlob.load('/Users/eva/Downloads/Software Maintenance, Technical Debt and Refactoring - CSE416 Topic Presentation.pptx'));
console.log((await p.inspect({select:'$.slides[1]',include:['id','elements.id','elements.text','elements.position','elements.style']})).ndjson);
for(let i of [1,2])await fs.writeFile(`.cloudflare-build/intro-before-${i}.png`,new Uint8Array(await(await p.slides.items[i].export({format:'png'})).arrayBuffer()));
