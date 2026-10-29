import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/eva/Desktop/CSE-416-Project',skill='/Users/eva/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations',src=`${root}/output/Cloudflare-2019-Case-Study-Expanded.pptx`;
const p=await PresentationFile.importPptx(await FileBlob.load(src));
const data=JSON.parse(await fs.readFile(`${root}/.cloudflare-build/expanded-data.json`,'utf8'));
const C={white:'#F7F9FC',teal:'#189D94',muted:'#9DACBC'};
function tx(s,t,x,y,w,h,size=22.67,color=C.white,bold=false){let sh=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});sh.text=t;sh.text.style={fontFamily:'Arial',fontSize:size,color,bold};return sh;}
async function img(s,n,x,y,w,h,alt){let b=await fs.readFile(`${root}/.cloudflare-build/assets/${n}.png`);s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:'image/png',position:{left:x,top:y,width:w,height:h},fit:'contain',alt});}
function head(s,t,n){tx(s,t,54,37,860,54,30.67,C.white,true);tx(s,'CLOUDFLARE 2019',56,507,250,18,10.67,C.muted);tx(s,`${n} / 5`,859,507,60,18,10.67,C.muted);}
for(let i=0;i<6;i++){let s=p.slides.items[i];for(const sh of [...s.shapes.items])if(sh.position.width>10 || sh.position.left>1)sh.delete();s.speakerNotes.text=data[i].note+'\n\nPresentation detail:\n'+data[i].rows.join('\n');}
let s=p.slides.items[0];head(s,'Cloudflare’s outage: the story in brief',1);
tx(s,'JULY 2, 2019',56,112,380,24,14,C.teal,true);
tx(s,'What Cloudflare does',56,153,400,40,25,C.white,true);
tx(s,'Websites use Cloudflare to load faster and filter harmful traffic. Because visitors pass through Cloudflare first, its failures can make those sites unreachable.',56,204,390,150,22.67);
tx(s,'What happened that day',492,153,413,40,25,C.white,true);
tx(s,'A new firewall rule overloaded Cloudflare’s servers. An earlier refactor had removed a CPU safeguard. Visitors saw error pages instead of otherwise healthy websites.',492,204,413,150,22.67);
tx(s,'Engineers disabled the faulty security checks, restored traffic, then tested and rolled back the rule.',56,365,849,46,18,C.muted);
for(const [x,num,label] of [[56,'27 min','service disruption'],[354,'82%','worst traffic drop'],[652,'100%','server CPU usage']]){tx(s,num,x,407,250,58,46,C.teal,true);tx(s,label,x,473,260,26,17,C.white);}
s=p.slides.items[1];head(s,'Inside the failure: one costly security rule',3);
tx(s,'THE SIMPLIFIED PATTERN',56,120,360,25,14,C.teal,true);
tx(s,'.*.*=.*',56,166,355,66,50,C.teal,true);
tx(s,'Each .* can match almost any amount of text. The overlapping sections create many possible ways to split the same input.',56,252,350,144);
tx(s,'A regex is a text-search pattern used inside a firewall rule.',56,422,350,72,20,C.muted);
const steps=[['01  Inspect the request','The web application firewall (WAF) used this regex to detect malicious JavaScript.'],['02  Retry possible matches','Backtracking tries alternative matches. Too many retries use up processing time.'],['03  Crowd out normal work','The check consumed CPU that servers needed to respond to visitors.']];
for(let i=0;i<3;i++){tx(s,steps[i][0],470,119+i*107,435,34,24,C.white,true);tx(s,steps[i][1],470,158+i*107,435,78,21);}
tx(s,'“Simulate” mode still runs the check. It only prevents the rule from blocking visitors.',470,447,435,52,18,C.muted);
s.speakerNotes.text+='\nThe firewall runs security rules, and a rule can use a regex to search request text. Here the rule targeted malicious JavaScript. The simplified regex fragment contains overlapping wildcards, so its engine can repeatedly try different allocations of characters. This retrying is backtracking.\nThe processing cost matters because these checks execute in the request-serving path. Excessive work can prevent servers from responding to ordinary visitors. Simulate mode prevents blocking decisions but still evaluates the regex.\nConnect to the next slide: a separate, earlier refactoring had accidentally removed a CPU safeguard that would have helped contain this costly processing. The refactor and the rule update were different changes.\nSource: https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/';
s=p.slides.items[2];head(s,'An earlier refactor removed a safety net',4);
const stages=[['Weeks earlier','The regression','A refactor aimed to reduce WAF CPU use, but accidentally removed a safeguard against excessive regex processing.'],['July 2','The trigger','A later rule update introduced a costly regex. The missing safeguard left it less constrained.'],['Worldwide','The amplification','Tests missed excessive CPU use, and the rule went global without a limited trial. Servers became too busy to serve visitors.']];
for(let i=0;i<3;i++){let y=119+i*108;tx(s,stages[i][0],56,y,180,32,22,C.teal,true);tx(s,stages[i][1],251,y,654,33,25,C.white,true);tx(s,stages[i][2],251,y+40,654,72,22);}
tx(s,'The refactor weakened a defense. The later regex update exposed that weakness.',56,463,849,35,19,C.muted);
s.speakerNotes.text+='\nMake the chronology explicit: these were two different changes. Weeks before the outage, performance-focused refactoring accidentally removed protection against excessive CPU use. On July 2, a separate managed-rule update introduced an expensive regex. The earlier regression therefore contributed to the outage, while the new rule was the immediate trigger.\nA regression is an unintended loss of previously working behavior or protection after a change. Cloudflare said the removed safeguard would have helped prevent excessive CPU use. Avoid claiming it was guaranteed to prevent this entire outage, because several other weaknesses also contributed.\nThe testing and rollout gaps increased the impact. The regex was part of the WAF request-processing path, so its CPU cost competed with serving users.\nSource: https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/';
s=p.slides.items[3];head(s,'What it took to get websites working again',2);
tx(s,'SERVERS RAN OUT OF PROCESSING CAPACITY',56,115,548,24,13,C.teal,true);
await img(s,'cpu',56,157,548,225,'Cloudflare original CPU-utilization chart from the July 2, 2019 outage');
tx(s,'CPU = processor usage. Original chart from Cloudflare’s report.',56,390,548,25,11.5,C.muted);
tx(s,'Turning off the affected firewall checks let websites load again. Other security protections stayed active.',56,428,548,66,21);
const times=[['13:42','Rule deployed globally'],['14:00','Firewall identified as cause'],['14:07','Firewall checks disabled'],['14:09','Websites load normally'],['14:52','Firewall restored after tests']];
for(let i=0;i<5;i++){let y=114+i*74;tx(s,times[i][0],653,y,250,34,27,C.teal,true);tx(s,times[i][1],653,y+36,250,40,18.5);}
tx(s,'All times UTC, July 2, 2019',653,493,252,18,11.5,C.muted);
s.speakerNotes.text+='\nImage: original CPU chart, Cloudflare engineering postmortem. https://blog.cloudflare.com/_emdash/api/media/file/01KW44G5FHMGT7B6C2NGNFWVW7.png\nThe chart shows one location, not a separately measured global average.';
s=p.slides.items[4];head(s,'Fixes and lessons for safer maintenance',5);
tx(s,'COMPLETED BY JULY 12',56,118,390,26,14,C.teal,true);
tx(s,'Restored CPU protection',56,163,390,38,24,C.white,true);
tx(s,'Reintroduced the safeguard and inspected all 3,868 managed rules for similar problems.',56,211,390,113,22.67);
tx(s,'ANNOUNCED NEXT STEPS',492,118,413,26,14,C.teal,true);
tx(s,'Test cost, then limit exposure',492,163,413,38,24,C.white,true);
tx(s,'Profile CPU use, roll rules out in stages, and move to RE2 or Rust regex with runtime guarantees.',492,211,413,113,22.67);
tx(s,'Technical debt',56,355,390,38,24,C.teal,true);
tx(s,'Shortcuts in testing and deployment can become future outage costs.',56,402,390,79,22.67);
tx(s,'Refactoring',492,355,413,38,24,C.teal,true);
tx(s,'Regression tests must preserve safety limits too. A refactor can keep correct answers while losing a protection.',492,402,413,79,22.67);
s.speakerNotes.text+='\n\nAdditional lessons and discussion:\n'+data[5].note+'\n'+data[5].rows.join('\n');
p.slides.keep([0,1,2,3,4]);
const slideIds=(await p.inspect({select:'$.slides[*]',include:['id']})).records.map(r=>r.id);
p.slides.reorder([0,3,1,2,4].map(i=>slideIds[i]));
for(let i=0;i<5;i++)await fs.writeFile(`${root}/.cloudflare-build/integrated-slide-${i+1}.png`,new Uint8Array(await(await p.slides.items[i].export({format:'png'})).arrayBuffer()));
const candidatePath=`${root}/.cloudflare-build/integrated-candidate.pptx`;await(await PresentationFile.exportPptx(p)).save(candidatePath);
console.log(await finalizePresentation({workspaceDir:root,candidatePath,explicitTotalSlideCount:5,finalPath:`${root}/output/Cloudflare-2019-Case-Study-Updated.pptx`,pythonExecutable:'/Users/eva/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:`${skill}/container_tools/inspect_presentation_package_integrity.py`,layoutValidatorPath:`${skill}/container_tools/inspect_presentation_layout_geometry.py`,layoutArgs:['--expected-slide-size-emu','9144000,5143500','--validate-heading-fit'],fontPolicy:{basis:'reference',families:['Arial'],referencePath:src,referenceSha256:crypto.createHash('sha256').update(await fs.readFile(src)).digest('hex')},verifyArtifactToolImport:true,receiptPath:`${root}/.cloudflare-build/integrated-final-validation.json`}));
