import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/eva/Desktop/CSE-416-Project';
const src='/Users/eva/Downloads/CSE416 Topic Presentation.pptx';
const skill='/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations';
const p=await PresentationFile.importPptx(await FileBlob.load(src));
p.slides.keep([8,9,10,11]);
const url1='https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/';
const url2='https://blog.cloudflare.com/cloudflare-outage/';
const data=[
 {title:'Cloudflare 2019: context & impact', rows:[
 'System: Cloudflare’s global reverse proxy and CDN use a web application firewall (WAF) to inspect web traffic.',
 'Trigger: a July 2 rule update targeted malicious JavaScript. “Simulate” mode still executed the regex on real traffic.',
 'Impact: 27 minutes of disruption. Visitors saw 502 errors, CPU reached 100%, and traffic fell 82% at its worst.',
 'Operational impact: customers also lost Dashboard/API access, while engineers struggled to reach internal recovery tools.'
 ],note:`Sources: ${url2}\n${url1}\nThe 82% figure is Cloudflare’s worst reported traffic drop, not the percentage of the Internet affected. Customer-facing implications include failed page loads and interrupted online transactions. The cited reports do not quantify total financial losses.`,source:'Sources: Cloudflare incident update (July 2) and postmortem (July 12, 2019)'},
 {title:'Cloudflare 2019: why the rule failed',rows:[
 'Expensive matching: overlapping wildcards in .*.*=.* made the engine repeatedly retry matches, exhausting CPU.',
 'Refactoring regression: an earlier performance refactor accidentally removed a CPU safeguard.',
 'Testing gap: functional tests passed, but the suite did not detect excessive CPU consumption.',
 'Deployment risk: rules bypassed staged rollout and reached the global network within seconds.'
 ],note:`Source: ${url1}\nThe regex shown is a simplified fragment, not the full production rule.\nAnalysis: performance limits are part of a system’s operational contract. Refactoring requires regression checks for resource consumption as well as matching correctness.`,source:'Source: Cloudflare engineering postmortem, July 12, 2019'},
 {title:'Cloudflare 2019: recovery timeline',rows:[
 '13:42 UTC: deployment begins. By 14:00, engineers identify the WAF as the cause.',
 '14:07 UTC: the team disables the WAF globally. Traffic and CPU recover by 14:09.',
 '14:52 UTC: after rollback and testing, engineers restore the WAF globally.',
 'Tradeoff: restoring availability required temporarily disabling WAF inspection. Other protection mechanisms continued operating.'
 ],note:`Sources: ${url1}\n${url2}\nAll times are UTC on July 2, 2019. Distinguish restored traffic from restored WAF protection.`,source:'Sources: Cloudflare incident update and engineering postmortem, July 2019'},
 {title:'Cloudflare 2019: maintenance & lessons',rows:[
 'Completed by July 12: Cloudflare restored the CPU safeguard and inspected all 3,868 managed rules.',
 'Announced fixes: performance profiling, staged rule rollout, and a regex engine with runtime guarantees.',
 'Technical debt lesson: fast global updates carried reliability risk. Missing performance checks let that risk accumulate.',
 'Refactoring lesson: preserve safety limits with regression tests. Safer rollouts trade deployment speed for a smaller failure scope.'
 ],note:`Source for completed and announced actions: ${url1}\nThe final two bullets are case analysis. Corrective maintenance restores service. Preventive maintenance reduces recurrence risk. The postmortem lists planned engineering work, not measured long-term reliability gains.\nDiscussion: What performance invariant should a refactoring test preserve?`,source:'Source: Cloudflare postmortem, July 12, 2019. Lessons are case analysis.'}
];
const ins=await p.inspect({select:'$.slides[*]',include:['id','elements.id','elements.text','elements.position','notes.id']});
for(let i=0;i<4;i++){
 const rec=ins.records[i], s=p.slides.items[i], d=data[i];
 const title=rec.elements.find(e=>e.text && e.position.top<80);const foot=rec.elements.find(e=>e.text?.startsWith('CASE'));
 const rows=rec.elements.filter(e=>e.text && e.position.top>100 && e.position.top<410).sort((a,b)=>a.position.top-b.position.top);
 for(const [j,e] of rows.entries()){const sh=p.resolve(e.id);sh.text=d.rows[j];sh.text.style={fontFamily:'Arial',fontSize:22.67,color:'#F7F9FC'};}
 p.resolve(title.id).text=d.title;
 p.resolve(title.id).text.style={fontFamily:'Arial',fontSize:30.67,bold:true,color:'#F7F9FC'};
 p.resolve(foot.id).text='CASE 1';
 const page=rec.elements.find(e=>e.text==='10');if(page)p.resolve(page.id).delete();
 const source=s.shapes.add({geometry:'textbox',position:{left:57,top:457,width:835,height:27},fill:'none',line:{fill:'none',width:0}});
 source.text=d.source;source.text.style={fontFamily:'Arial',fontSize:11.5,color:'#9DACBC'};
 s.speakerNotes.text=d.note;
 await fs.writeFile(`${root}/.cloudflare-build/slide-${i+1}.png`,new Uint8Array(await(await s.export({format:'png'})).arrayBuffer()));
}
const candidatePath=`${root}/.cloudflare-build/candidate.pptx`;
await(await PresentationFile.exportPptx(p)).save(candidatePath);
console.log(await finalizePresentation({workspaceDir:root,candidatePath,finalPath:`${root}/output/Cloudflare-2019-Case-Study.pptx`,pythonExecutable:'/Users/eva/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:`${skill}/container_tools/inspect_presentation_package_integrity.py`,layoutValidatorPath:`${skill}/container_tools/inspect_presentation_layout_geometry.py`,layoutArgs:['--expected-slide-size-emu','9144000,5143500','--validate-bullet-geometry','--validate-heading-fit'],fontPolicy:{basis:'reference',families:['Arial'],referencePath:src,referenceSha256:crypto.createHash('sha256').update(await fs.readFile(src)).digest('hex')},verifyArtifactToolImport:true,receiptPath:`${root}/.cloudflare-build/validation.json`}));
