import {fixture, createRequest, createHL7, processMessage} from './core.mjs';
const $ = id => document.getElementById(id);
let state = 0, message = '', seen = new Set();
const pretty = x => JSON.stringify(x, null, 2);
function reset() { state=0; message=''; seen=new Set(); $('order').textContent='Not created yet.'; $('hl7').textContent='Not generated yet.'; $('fhir').textContent='Not mapped yet.'; $('status').textContent='Ready to create a synthetic laboratory order.'; draw(); }
function draw(){ $('step1').disabled=state!==0; $('step2').disabled=state!==1; $('step3').disabled=state!==2; for(let i=1;i<=3;i++) $('a'+i).classList.toggle('active',state>=i); }
$('step1').addEventListener('click',()=>{ $('order').textContent=pretty(createRequest(fixture)); state=1; $('status').textContent='Order created: patient and specimen linked to a synthetic ServiceRequest.'; draw(); });
$('step2').addEventListener('click',()=>{ message=createHL7(); $('hl7').textContent=message.replaceAll('\r','\n'); state=2; $('status').textContent='Synthetic HL7 v2-style ORU^R01 message generated.'; draw(); });
$('step3').addEventListener('click',()=>{ try {const mapped=processMessage(message,seen); $('fhir').textContent=pretty({Observation:mapped.observation,DiagnosticReport:mapped.report}); state=3; $('status').textContent='Validated identifiers and mapped result. Basic duplicate protection enabled.'; draw();} catch(e){ $('status').textContent='Error: '+e.message; } });
$('reset').addEventListener('click',reset);
reset();
