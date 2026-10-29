import fs from 'node:fs/promises';import {FileBlob,PresentationFile} from '@oai/artifact-tool';
const p=await PresentationFile.importPptx(await FileBlob.load('/Users/eva/Downloads/CSE416 Topic Presentation.pptx'));
for(let i of [10,11])await fs.writeFile(`.cloudflare-build/source-${i+1}.png`,new Uint8Array(await(await p.slides.items[i].export({format:'png'})).arrayBuffer()));
console.log((await p.help('slide.speakerNotes',{include:'all'})).ndjson);console.log((await p.help('presentation.slides.keep',{include:'all'})).ndjson);
