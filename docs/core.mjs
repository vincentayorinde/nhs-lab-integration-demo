/**
 * Genflow: educational clinical interoperability workflow engine.
 * Real in-browser workflow/state transitions, validation, HL7 v2-style messaging
 * and FHIR R4-style mapping; all data are fictional. Not clinical software.
 */
export const PATIENTS = Object.freeze([
  { id: 'PX-00184', name: 'Avery Morgan', initials: 'AM', dob: '1988-04-16' },
  { id: 'PX-00216', name: 'Jamie Ellis', initials: 'JE', dob: '1974-09-08' },
  { id: 'PX-00172', name: 'Taylor Quinn', initials: 'TQ', dob: '1992-01-24' },
  { id: 'PX-00139', name: 'Robin Clarke', initials: 'RC', dob: '1981-11-03' }
]);
export const TESTS = Object.freeze([
  { code: 'GEN-PNL', name: 'Hereditary conditions panel', turnaround: '10–14 days (illustrative)' },
  { code: 'GEN-EXO', name: 'Exome sequence analysis', turnaround: '14–21 days (illustrative)' },
  { code: 'GEN-CNV', name: 'Copy number variation analysis', turnaround: '5–7 days (illustrative)' }
]);
export const RESULTS = Object.freeze([
  'No reportable variant detected (synthetic)',
  'Variant of uncertain significance (synthetic)',
  'Analysis inconclusive; repeat specimen advised (synthetic)'
]);
export const STAGES = Object.freeze(['ordered', 'received', 'analysing', 'review', 'verified', 'delivered']);
export const STATUS_LABELS = Object.freeze({ordered:'Awaiting specimen',received:'Specimen received',analysing:'In analysis',review:'Needs verification',verified:'Ready to deliver',delivered:'Delivered'});
export const STATE_VERSION = 3;
const now = () => new Date().toISOString();
const safe = (v, max = 120) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\r\n|]/.test(v)) throw new Error('Invalid or unsupported field value');
  return v.trim();
};
const audit = (state, entry, action, detail, kind='info', at=now()) => {
  state.audit.unshift({id:`EV-${state.nextAudit++}`,caseId:entry.id,action,detail,kind,at});
  state.audit = state.audit.slice(0, 250);
  entry.updatedAt = at;
};
export function makeCase({patientId,testCode,priority='Routine'},number=2092,at=now()) {
  const patient = PATIENTS.find(p=>p.id===patientId);
  const test = TESTS.find(t=>t.code===testCode);
  if(!patient || !test || !['Routine','Urgent'].includes(priority)) throw new Error('Choose a valid fictional patient, test and priority');
  return {id:`GL-${number}`,patientId,patientName:patient.name,initials:patient.initials,priority,testCode,testName:test.name,
    specimenId:`SP-${number}`,status:'ordered',result:null,verifiedAt:null,deliveredAt:null,hl7:null,report:null,createdAt:at,updatedAt:at,deliveryAttempts:0};
}
export function newState(at=now()) {
  const s={version:STATE_VERSION,nextCase:2092,nextAudit:1,cases:[],audit:[],processedMessages:[]};
  const items=[
    {patientId:PATIENTS[0].id,testCode:TESTS[0].code,priority:'Routine',stage:'ordered'},
    {patientId:PATIENTS[1].id,testCode:TESTS[1].code,priority:'Urgent',stage:'received'},
    {patientId:PATIENTS[2].id,testCode:TESTS[2].code,priority:'Routine',stage:'review'},
    {patientId:PATIENTS[3].id,testCode:TESTS[0].code,priority:'Routine',stage:'delivered'}
  ];
  for(const item of items){
    const c=makeCase(item,s.nextCase++,at); s.cases.push(c); audit(s,c,'Order created','FHIR ServiceRequest registered','info',at);
    if(item.stage!=='ordered'){ perform(s,c.id,'receive',{at}); }
    if(['review','delivered'].includes(item.stage)){ perform(s,c.id,'start',{at}); perform(s,c.id,'result',{result:RESULTS[0],at}); }
    if(item.stage==='delivered'){ perform(s,c.id,'verify',{at}); perform(s,c.id,'deliver',{at}); }
  }
  return s;
}
export function checkState(s){
  return !!(s&&s.version===STATE_VERSION&&Array.isArray(s.cases)&&Array.isArray(s.audit)&&Array.isArray(s.processedMessages));
}
export function addCase(state,input,at=now()) {
  const c=makeCase(input,state.nextCase++,at);state.cases.unshift(c);audit(state,c,'Order created','FHIR ServiceRequest registered','info',at);return c;
}
export function buildServiceRequest(c) {
  return {resourceType:'ServiceRequest',id:c.id,status:'active',intent:'order',
    identifier:[{system:'https://example.org/genflow/requests',value:c.id}],
    priority:c.priority==='Urgent'?'urgent':'routine',code:{text:c.testName},
    subject:{reference:`Patient/${c.patientId}`,display:c.patientName},
    specimen:[{reference:`Specimen/${c.specimenId}`}],authoredOn:c.createdAt};
}
export function buildHL7(c,{patientOverride=null}={}){
  if(!c.result || !['review','verified','delivered'].includes(c.status)) throw new Error('No result available for message generation');
  const patient=safe(patientOverride??c.patientId),name=safe(c.patientName);
  const result=safe(c.result,300),order=safe(c.id),sample=safe(c.specimenId),test=safe(c.testCode);
  const stamp=new Date(c.verifiedAt||c.updatedAt).toISOString().replace(/[-:]/g,'').slice(0,14);
  const msgId=`MSG-${order}-01`;
  return [
    `MSH|^~\\&|GENFLOW_LIMS|DEMO_LAB|GENFLOW_EPR|DEMO|${stamp}||ORU^R01|${msgId}|P|2.5`,
    `PID|||${patient}||${name.replace(' ','^')}`,
    `OBR|1|${order}|${sample}|${test}^${c.testName}`,
    `OBX|1|ST|${test}^${c.testName}||${result}||||||F`
  ].join('\r');
}
export function parseHL7(message,c){
  if(typeof message!=='string')throw new Error('Invalid HL7 payload');
  const seg=message.trim().split(/\r\n|\r|\n/).map(x=>x.split('|'));
  const get=n=>seg.find(x=>x[0]===n);
  const msh=get('MSH'),pid=get('PID'),obr=get('OBR'),obx=get('OBX');
  if(!msh||!pid||!obr||!obx)throw new Error('Required HL7 segments are missing');
  if(msh[8]!=='ORU^R01')throw new Error('Unsupported message type');
  if(!msh[9])throw new Error('Missing message control ID');
  if(pid[3]!==c.patientId)throw new Error('Patient identifier mismatch: delivery quarantined');
  if(obr[2]!==c.id||obr[3]!==c.specimenId)throw new Error('Order or specimen identifier mismatch: delivery quarantined');
  if(!obx[5]||obx[2]!=='ST')throw new Error('Result missing or invalid');
  return {messageId:msh[9],patientId:pid[3],orderId:obr[2],specimenId:obr[3],result:obx[5],testCode:obx[3]?.split('^')[0]};
}
export function toFHIR(c,parsed){
  if(parsed.patientId!==c.patientId||parsed.orderId!==c.id||parsed.specimenId!==c.specimenId)throw new Error('Failed cross-system reconciliation');
  const obsId=`OBS-${c.id}`, reportId=`DR-${c.id}`;
  return {observation:{resourceType:'Observation',id:obsId,status:'final',
    category:[{coding:[{system:'http://terminology.hl7.org/CodeSystem/observation-category',code:'laboratory'}]}],
    code:{text:c.testName},subject:{reference:`Patient/${c.patientId}`},
    basedOn:[{reference:`ServiceRequest/${c.id}`}],specimen:{reference:`Specimen/${c.specimenId}`},valueString:parsed.result},
  report:{resourceType:'DiagnosticReport',id:reportId,status:'final',code:{text:c.testName},
    subject:{reference:`Patient/${c.patientId}`},basedOn:[{reference:`ServiceRequest/${c.id}`}],
    specimen:[{reference:`Specimen/${c.specimenId}`}],result:[{reference:`Observation/${obsId}`}],
    conclusion:'Fictional training output. Not for clinical decision-making.'}};
}
export function perform(state,id,action,options={}){
  const c=state.cases.find(x=>x.id===id);if(!c)throw new Error('Case not found');
  const at=options.at||now();
  const requireStatus=(status)=>{if(c.status!==status)throw new Error(`Cannot ${action} while case status is ${c.status}`);};
  if(action==='receive'){requireStatus('ordered');c.status='received';audit(state,c,'Specimen received',`${c.specimenId} checked into laboratory`, 'success',at);}
  else if(action==='start'){requireStatus('received');c.status='analysing';audit(state,c,'Analysis started','Laboratory processing initiated','info',at);}
  else if(action==='result'){requireStatus('analysing');if(!RESULTS.includes(options.result))throw new Error('Choose a fictional test outcome');c.result=options.result;c.status='review';audit(state,c,'Result recorded','Result pending independent verification','info',at);}
  else if(action==='verify'){requireStatus('review');c.status='verified';c.verifiedAt=at;audit(state,c,'Result verified','Result released by fictional reviewer','success',at);}
  else if(action==='deliver'||action==='retry'){
    if(!['verified','delivered'].includes(c.status))throw new Error('Result must be verified before delivery');
    c.deliveryAttempts++;
    const message=buildHL7(c,{patientOverride:options.patientOverride});
    try {
      const parsed=parseHL7(message,c);
      if(state.processedMessages.includes(parsed.messageId))throw new Error('Duplicate message rejected by idempotency guard');
      if(c.status==='delivered')throw new Error('Result already delivered');
      const mapped=toFHIR(c,parsed);
      state.processedMessages.push(parsed.messageId);c.hl7=message;c.report=mapped;c.status='delivered';c.deliveredAt=at;
      audit(state,c,'Result delivered','HL7 result validated and mapped to FHIR Observation + DiagnosticReport','success',at);
      return {ok:true,case:c,parsed};
    }catch(e){audit(state,c,'Delivery blocked',e.message,'error',at);return {ok:false,error:e.message,case:c};}
  }else throw new Error('Unsupported workflow action');
  return {ok:true,case:c};
}
export function caseCounts(cases){return {
  open:cases.filter(c=>c.status!=='delivered').length,
  inLab:cases.filter(c=>['received','analysing','review'].includes(c.status)).length,
  ready:cases.filter(c=>c.status==='verified').length,
  delivered:cases.filter(c=>c.status==='delivered').length
};}