import fs from'node:fs/promises';import{FileBlob,PresentationFile}from'@oai/artifact-tool';
const p=await PresentationFile.importPptx(await FileBlob.load('/Users/eva/Downloads/Software Maintenance, Technical Debt and Refactoring - CSE416 Topic Presentation.pptx'));p.slides.keep([1]);const s=p.slides.items[0];
const r=(await p.inspect({select:'$.slides[0].elements[*]',include:['id','text']})).records;
const q=r.find(e=>e.text?.startsWith('How do engineering'));p.resolve(q.id).text='How do we keep software reliable, adaptable, and easy to change over time?';
const b=r.find(e=>e.text?.startsWith('Opening hook'));p.resolve(b.id).text='Maintenance keeps software useful. Technical debt shapes the cost of change. Refactoring improves its internal structure.';p.resolve(b.id).position={left:68.4,top:370.8,width:792.02,height:84};
await fs.writeFile('.cloudflare-build/minimal-intro.png',new Uint8Array(await(await s.export({format:'png'})).arrayBuffer()));await(await PresentationFile.exportPptx(p)).save('.cloudflare-build/minimal-intro-single.pptx');
