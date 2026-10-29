import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/eva/Desktop/CSE-416-Project';
const src='/Users/eva/Downloads/CSE416 Topic Presentation.pptx';
const skill='/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations';
const p=await PresentationFile.importPptx(await FileBlob.load(src));
p.slides.keep([8,9,10,11,12,13]);
const url1='https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/';
const url2='https://blog.cloudflare.com/cloudflare-outage/';
const data=JSON.parse(await fs.readFile(`${root}/.cloudflare-build/expanded-data.json`,'utf8'));
const ins=await p.inspect({select:'$.slides[*]',include:['id','elements.id','elements.text','elements.position','notes.id']});
for(let i=0;i<6;i++){
 const rec=ins.records[i], s=p.slides.items[i], d=data[i];
 const title=rec.elements.find(e=>e.text && e.position.top<80);const foot=rec.elements.find(e=>e.text?.startsWith('CASE'));
 const rows=rec.elements.filter(e=>e.text && e.position.top>100 && e.position.top<410).sort((a,b)=>a.position.top-b.position.top);
 for(const [j,e] of rows.entries()){const sh=p.resolve(e.id);sh.text=d.rows[j];sh.text.style={fontFamily:'Arial',fontSize:22.67,color:'#F7F9FC'};}
 p.resolve(title.id).text=d.title;
 p.resolve(title.id).text.style={fontFamily:'Arial',fontSize:30.67,bold:true,color:'#F7F9FC'};
 p.resolve(foot.id).text='CASE 1';
 const page=rec.elements.find(e=>/^\d+$/.test(e.text??''));if(page)p.resolve(page.id).delete();
 const source=s.shapes.add({geometry:'textbox',position:{left:57,top:457,width:835,height:27},fill:'none',line:{fill:'none',width:0}});
 source.text=d.source;source.text.style={fontFamily:'Arial',fontSize:11.5,color:'#9DACBC'};
 s.speakerNotes.text=d.note;
 await fs.writeFile(`${root}/.cloudflare-build/expanded-slide-${i+1}.png`,new Uint8Array(await(await s.export({format:'png'})).arrayBuffer()));
}
const candidatePath=`${root}/.cloudflare-build/expanded-candidate.pptx`;
await(await PresentationFile.exportPptx(p)).save(candidatePath);
console.log(await finalizePresentation({workspaceDir:root,candidatePath,finalPath:`${root}/output/Cloudflare-2019-Case-Study-Expanded.pptx`,pythonExecutable:'/Users/eva/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:`${skill}/container_tools/inspect_presentation_package_integrity.py`,layoutValidatorPath:`${skill}/container_tools/inspect_presentation_layout_geometry.py`,layoutArgs:['--expected-slide-size-emu','9144000,5143500','--validate-bullet-geometry','--validate-heading-fit'],fontPolicy:{basis:'reference',families:['Arial'],referencePath:src,referenceSha256:crypto.createHash('sha256').update(await fs.readFile(src)).digest('hex')},verifyArtifactToolImport:true,receiptPath:`${root}/.cloudflare-build/expanded-validation.json`}));
