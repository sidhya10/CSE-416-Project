import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/eva/Desktop/CSE-416-Project',skill='/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations',src=`${root}/output/Cloudflare-2019-Case-Study-Expanded.pptx`;
const p=await PresentationFile.importPptx(await FileBlob.load(src));
const data=JSON.parse(await fs.readFile(`${root}/.cloudflare-build/expanded-data.json`,'utf8'));
const C={white:'#F7F9FC',teal:'#189D94',muted:'#9DACBC'};
function tx(s,t,x,y,w,h,size=22.67,color=C.white,bold=false){let sh=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});sh.text=t;sh.text.style={fontFamily:'Arial',fontSize:size,color,bold};return sh;}
async function img(s,n,x,y,w,h,alt){let b=await fs.readFile(`${root}/.cloudflare-build/assets/${n}.png`);s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:'image/png',position:{left:x,top:y,width:w,height:h},fit:'contain',alt});}
function head(s,t,n){tx(s,t,54,37,860,54,30.67,C.white,true);tx(s,'CLOUDFLARE 2019',56,507,250,18,10.67,C.muted);tx(s,`${n} / 6`,859,507,60,18,10.67,C.muted);}
for(let i=0;i<6;i++){let s=p.slides.items[i];for(const sh of [...s.shapes.items])if(sh.position.width>10 || sh.position.left>1)sh.delete();s.speakerNotes.text=data[i].note+'\n\nPresentation detail:\n'+data[i].rows.join('\n');}
let s=p.slides.items[0];head(s,'One faulty rule. A worldwide outage',1);
tx(s,'JULY 2, 2019',56,112,380,24,14,C.teal,true);
tx(s,'Cloudflare sits between visitors and websites, delivering content and checking requests for threats.',56,149,390,108);
tx(s,'A firewall update overloaded its servers. Visitors saw 502 errors even when the websites behind Cloudflare were healthy.',56,264,390,112);
await img(s,'server',485,111,420,280,'Original photograph of disassembled Cloudflare G9 server hardware, published in 2018');
tx(s,'Cloudflare G9 hardware, 2018. Context photo, not the incident.',485,394,420,31,11.5,C.muted);
for(const [x,num,label] of [[56,'27 min','service disruption'],[354,'82%','worst traffic drop'],[652,'100%','CPU usage']]){tx(s,num,x,419,250,54,42,C.teal,true);tx(s,label,x,473,260,26,17,C.white);}
s.speakerNotes.text+='\nImage: Cloudflare, A Tour Inside Cloudflare’s G9 Servers (October 10, 2018). https://blog.cloudflare.com/a-tour-inside-cloudflares-g9-servers/\nOriginal asset: https://blog.cloudflare.com/_emdash/api/media/file/01KW46RPEYCEAKMS3YKZM20Z6N.png';
s=p.slides.items[1];head(s,'Why a text-search rule consumed the CPU',2);
tx(s,'THE SIMPLIFIED PATTERN',56,120,360,25,14,C.teal,true);tx(s,'.*.*=.*',56,166,355,66,50,C.teal,true);
tx(s,'Each .* can match almost any amount of text. The overlapping sections create many possible ways to split the same input.',56,252,350,144);
tx(s,'A regex is a pattern for searching text.',56,422,350,52,20,C.muted);
const steps=[['01  Inspect the request','The web application firewall (WAF) ran this rule to detect malicious JavaScript.'],['02  Retry possible matches','Backtracking tries alternative matches. Too many retries use up processing time.'],['03  Crowd out normal work','The check consumed CPU that servers needed to respond to visitors.']];
for(let i=0;i<3;i++){tx(s,steps[i][0],470,119+i*107,435,34,24,C.white,true);tx(s,steps[i][1],470,158+i*107,435,65,21);}
tx(s,'“Simulate” mode still runs the check. It only prevents the rule from blocking visitors.',470,447,435,52,18,C.muted);
s=p.slides.items[2];head(s,'Four missing defenses amplified the failure',3);
let rows=[['CPU protection','An earlier performance refactor accidentally removed a safeguard against costly regex processing.'],['Performance tests','Tests checked allow/block decisions, but did not catch runaway CPU use. Correct answers were not enough.'],['A limited rollout','The rule reached the world without a small trial first. One defect affected many locations together.'],['Independent recovery','The outage also blocked internal tools, making emergency access and recovery harder.']];
for(let i=0;i<4;i++){let y=120+i*88;tx(s,String(i+1).padStart(2,'0'),56,y,63,48,34,C.teal,true);tx(s,rows[i][0],135,y+2,265,60,24,C.white,true);tx(s,rows[i][1],430,y,475,74,21.5);}
tx(s,'The rule triggered the incident. Existing weaknesses made it global and harder to stop.',135,478,770,25,16,C.muted);
s=p.slides.items[3];head(s,'Service recovered before the firewall returned',4);
tx(s,'CPU USAGE AT ONE CLOUDFLARE LOCATION',56,115,548,24,13,C.teal,true);
await img(s,'cpu',56,157,548,225,'Cloudflare original CPU-utilization chart from the July 2, 2019 outage');
tx(s,'Original monitoring chart from Cloudflare’s postmortem',56,390,548,25,11.5,C.muted);
tx(s,'Disabling the WAF removed the immediate load. Other security protections stayed active.',56,428,548,66,21);
const times=[['13:42','Rule deployed globally'],['14:00','WAF identified as cause'],['14:07','WAF disabled globally'],['14:09','Traffic and CPU recover'],['14:52','WAF restored after testing']];
for(let i=0;i<5;i++){let y=114+i*74;tx(s,times[i][0],653,y,250,34,27,C.teal,true);tx(s,times[i][1],653,y+36,250,40,18.5);}
tx(s,'All times UTC, July 2, 2019',653,493,252,18,11.5,C.muted);
s.speakerNotes.text+='\nImage: original CPU chart, Cloudflare engineering postmortem. https://blog.cloudflare.com/_emdash/api/media/file/01KW44G5FHMGT7B6C2NGNFWVW7.png\nThe chart shows one location, not a separately measured global average.';
s=p.slides.items[4];head(s,'The response addressed code and release process',5);
tx(s,'COMPLETED BY JULY 12',56,118,350,26,14,C.teal,true);tx(s,'3,868',56,165,350,68,52,C.white,true);tx(s,'managed rules inspected',56,236,350,40,22.67);tx(s,'Cloudflare also restored the CPU safeguard removed during refactoring.',56,314,350,111,22.67);
tx(s,'ANNOUNCED NEXT STEPS',470,118,435,26,14,C.teal,true);
let fixes=[['Measure processing cost','Profile rules for excessive CPU use, as well as checking whether they detect attacks.'],['Expand releases gradually','Start with limited traffic and inspect results before deploying worldwide.'],['Use a safer regex engine','RE2 or Rust regex can provide runtime guarantees. Compatibility still needs testing.']];
for(let i=0;i<3;i++){tx(s,fixes[i][0],470,163+i*106,435,34,24,C.white,true);tx(s,fixes[i][1],470,201+i*106,435,70,21);}
tx(s,'RE2: for a fixed pattern, matching time scales linearly with input length.',56,467,849,27,17,C.muted);
s=p.slides.items[5];head(s,'What this case teaches engineering teams',6);
const lessons=[['Maintenance','Restore service first. Then improve the controls that keep the same failure from recurring.'],['Technical debt','Shortcuts in testing and deployment can turn today’s speed into tomorrow’s outage costs.'],['Refactoring','Preserve safety limits as well as feature behavior. Test resource use, not only correct answers.']];
for(let i=0;i<3;i++){let x=56+i*289;tx(s,lessons[i][0],x,126,260,44,25,C.teal,true);tx(s,lessons[i][1],x,185,260,170,22.67);}
tx(s,'Does “the same output” mean\n“the same behavior” under load?',56,367,849,100,34,C.white,true);
tx(s,'Test processing cost. Limit rollout exposure. Rehearse recovery without normal tools.',56,475,849,27,17,C.muted);
for(let i=0;i<6;i++)await fs.writeFile(`${root}/.cloudflare-build/designed-${i+1}.png`,new Uint8Array(await(await p.slides.items[i].export({format:'png'})).arrayBuffer()));
const candidatePath=`${root}/.cloudflare-build/designed-candidate.pptx`;await(await PresentationFile.exportPptx(p)).save(candidatePath);
console.log(await finalizePresentation({workspaceDir:root,candidatePath,finalPath:`${root}/output/Cloudflare-2019-Case-Study-Final.pptx`,pythonExecutable:'/Users/eva/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:`${skill}/container_tools/inspect_presentation_package_integrity.py`,layoutValidatorPath:`${skill}/container_tools/inspect_presentation_layout_geometry.py`,layoutArgs:['--expected-slide-size-emu','9144000,5143500','--validate-heading-fit'],fontPolicy:{basis:'reference',families:['Arial'],referencePath:src,referenceSha256:crypto.createHash('sha256').update(await fs.readFile(src)).digest('hex')},verifyArtifactToolImport:true,receiptPath:`${root}/.cloudflare-build/final-design-validation.json`}));
