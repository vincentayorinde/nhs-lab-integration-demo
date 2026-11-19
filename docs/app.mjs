import {PATIENTS,TESTS,RESULTS,STAGES,STATUS_LABELS,newState,checkState,addCase,perform,buildServiceRequest,buildHL7,caseCounts} from './core.mjs';
const STORAGE='genflow-workbench-v3';
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state;
try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');state=checkState(saved)?saved:newState();}catch{state=newState();}
let view='cases',selectedId=state.cases[0]?.id,search='',statusFilter='all',messageTab='request',auditFilter='all',auditSearch='',notice=null,backendOnline=false;
const persist=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}};
const selected=()=>state.cases.find(c=>c.id===selectedId)||state.cases[0];
const fmt=iso=>new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const fmtTime=iso=>new Date(iso).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
const statusTag=c=>`<span class="status ${escapeHTML(c.status)}">${escapeHTML(STATUS_LABELS[c.status]||c.status)}</span>`;
function alertUser(text,kind='success'){notice={text,kind};renderNotice();}
function renderNotice(){const el=$('app-alert');if(!notice){el.hidden=true;return;}el.hidden=false;el.className=`notice ${notice.kind==='error'?'error':''}`;el.innerHTML=`<span>${escapeHTML(notice.text)}</span><button aria-label="Dismiss notice" data-dismiss="1">×</button>`;}
function renderMetrics(){const m=caseCounts(state.cases);$('summary-cards').innerHTML=[['Open requests',m.open,'Awaiting action'],['In the laboratory',m.inLab,'Processing & review'],['Ready for delivery',m.ready,'Verified findings'],['Results delivered',m.delivered,'To simulated EPR']].map(([name,value,sub],i)=>`<div class="metric ${i===2?'highlight':''}"><div class="metric-title">${name.toUpperCase()}</div><div class="metric-num">${value.toString().padStart(2,'0')}</div><div class="metric-bottom">${sub}</div></div>`).join('');}
function render(){renderMetrics();renderNotice();document.querySelectorAll('#side-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const headings={cases:['WORKSPACE / CASE MANAGEMENT','The full picture, in real time.','Every request is traceable from initial order through verification to delivery.'],messages:['WORKSPACE / INTEGRATION','See what the systems exchange.','Inspect the actual generated payloads for the selected synthetic case.'],audit:['WORKSPACE / QUALITY LEDGER','Every change leaves a trail.','Review workflow events, blocked transfers and delivery history.']};
  const h=headings[view];$('view-kicker').textContent=h[0];$('view-title').textContent=h[1];$('view-description').textContent=h[2];
  $('view-content').innerHTML=view==='cases'?renderCases():view==='messages'?renderMessages():renderAudit();
}
function queueRows(){const cases=state.cases.filter(c=>((c.patientName+' '+c.id+' '+c.testName).toLowerCase().includes(search.toLowerCase()))&&(statusFilter==='all'||(statusFilter==='open'?c.status!=='delivered':c.status===statusFilter)));
return cases.length?cases.map(c=>`<button class="queue-item ${c.id===selectedId?'active':''}" data-case="${escapeHTML(c.id)}" aria-label="Open ${escapeHTML(c.id)}"><span class="avatar">${escapeHTML(c.initials)}</span><span class="queue-body"><span class="queue-top"><strong>${escapeHTML(c.patientName)}</strong><span class="queue-id">${escapeHTML(c.id)}</span></span><span class="queue-detail">${escapeHTML(c.testName)}</span><span style="display:flex;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap">${statusTag(c)}${c.priority==='Urgent'?'<span class="pill-urgent">URGENT</span>':''}</span></span></button>`).join(''):'<div class="empty-state">No requests match this filter.</div>';
}
function caseActions(c){
if(c.status==='ordered')return `<button class="action-primary" data-action="receive">Receive specimen <span>→</span></button>`;
if(c.status==='received')return `<button class="action-primary" data-action="start">Start laboratory analysis →</button>`;
if(c.status==='analysing')return `<div class="result-form"><select id="result-choice" aria-label="Choose a fictional laboratory result">${RESULTS.map(r=>`<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join('')}</select><button class="action-primary" data-action="result">Record result →</button></div>`;
if(c.status==='review')return `<button class="action-primary" data-action="verify">Verify and release result →</button>`;
if(c.status==='verified')return `<div><button class="action-primary" data-action="deliver">Validate & deliver to EPR →</button><label class="risk-toggle"><input type="checkbox" id="inject-error"/> Inject a patient-ID mismatch to test rejection</label></div>`;
if(c.status==='delivered')return `<button class="action-secondary" data-action="retry">↺ Attempt duplicate delivery (idempotency test)</button><button class="action-secondary" data-open-messages="1">Inspect delivered payload ↗</button>`;
return '';
}
const explain={ordered:'The clinician has requested a test. The specimen must be physically received and linked to the same order before processing can begin.',received:'The specimen is checked in. Analysis can begin once the sample identity is confirmed.',analysing:'Record a fictional test outcome. This stage does not release the result; an independent verification step is required.',review:'The result is recorded but not released. Verify it before any transmission to the patient record is permitted.',verified:'The fictional result has been reviewed and is eligible for delivery. The integration engine checks patient and order identity before mapping the payload.',delivered:'The result was delivered and an audit entry recorded. A second attempt is rejected by the duplicate-message guard.'};
function renderCases(){const c=selected();if(!c)return '<div class="empty-state">No cases created.</div>';
const n=STAGES.indexOf(c.status)+1,events=state.audit.filter(e=>e.caseId===c.id).slice(0,5);
return `<div class="case-layout"><section class="panel"><div class="panel-head"><h3>Test request queue</h3><small>${state.cases.length} CASES</small></div><div class="queue-tools"><input id="case-search" placeholder="Search patient, test or order…" aria-label="Search cases" value="${escapeHTML(search)}"/><select id="case-filter" aria-label="Filter case status"><option value="all" ${statusFilter==='all'?'selected':''}>All requests</option><option value="open" ${statusFilter==='open'?'selected':''}>Open requests</option><option value="verified" ${statusFilter==='verified'?'selected':''}>Ready to deliver</option><option value="delivered" ${statusFilter==='delivered'?'selected':''}>Delivered</option></select></div><div class="queue-list" id="queue-list">${queueRows()}</div></section>
<section class="panel case-panel"><div class="case-top"><div class="case-overline">CASE FILE <span>·</span> ${escapeHTML(c.id)} <span style="margin-left:auto">${statusTag(c)}</span></div><h3>${escapeHTML(c.patientName)}</h3><div class="case-subtitle">Fictional patient record · ${escapeHTML(c.testName)}</div><div class="case-info"><div><span class="field-name">PATIENT ID</span><span class="field-value">${escapeHTML(c.patientId)}</span></div><div><span class="field-name">SPECIMEN ID</span><span class="field-value">${escapeHTML(c.specimenId)}</span></div><div><span class="field-name">PRIORITY</span><span class="field-value">${escapeHTML(c.priority)}</span></div></div></div>
<div class="progress-track"><div class="progress-caption"><span>Laboratory workflow</span><small>${n} / ${STAGES.length} STAGES</small></div><div class="progress-line">${STAGES.map((step,i)=>`<div class="progress-block ${i<n?'done':''}" title="${escapeHTML(STATUS_LABELS[step])}"></div>`).join('')}</div><div class="progress-labels"><span>Order</span><span>Intake</span><span>Analyse</span><span>Review</span><span>Verify</span><span>Deliver</span></div></div>
<div class="case-content"><div class="section-title">Next action</div><p class="stage-helper">${escapeHTML(explain[c.status])}</p><div class="case-actions">${caseActions(c)}</div><div class="case-banner"><span class="icon-ring">✳</span><p><strong>Built-in quality check</strong><br/>Identity must match across patient, order and specimen. Invalid transfers are blocked and recorded in the audit trail.</p></div></div>
<div class="activity-panel"><div class="panel-head" style="padding:0 0 14px;border:0"><h3>Recent activity</h3><button class="copy-link" data-open-audit="1">Full audit trail ↗</button></div><div class="event-list">${events.map(e=>`<div class="event-line ${e.kind}"><span class="event-circle"></span><div><strong>${escapeHTML(e.action)}</strong><p>${escapeHTML(e.detail)}</p></div><time>${fmtTime(e.at)}</time></div>`).join('')}</div></div></section></div>`;}
function payloadFor(c){if(!c)return '';
  if(messageTab==='request')return JSON.stringify(buildServiceRequest(c),null,2);
  if(messageTab==='hl7')return c.hl7?.replaceAll('\r','\n')||(c.result?buildHL7(c).replaceAll('\r','\n'):'No result recorded yet. Complete the analysis workflow to generate a message.');
  if(messageTab==='fhir')return c.report?JSON.stringify(c.report,null,2):'FHIR result resources are produced after validated delivery. Choose a verified case and deliver its result.';
  return '';
}
function renderMessages(){const c=selected();if(!c)return '<div class="empty-state">No case selected</div>';const payload=payloadFor(c);
return `<section class="panel message-layout"><div class="panel-head"><h3>Integration explorer</h3><select id="message-case" style="font-size:11px;padding:8px;border:1px solid #e1e5de;background:white;border-radius:4px">${state.cases.map(x=>`<option value="${escapeHTML(x.id)}" ${x.id===c.id?'selected':''}>${escapeHTML(x.id)} · ${escapeHTML(x.patientName)}</option>`).join('')}</select></div><div class="message-info">Inspect the actual JavaScript-generated payload for <strong>${escapeHTML(c.id)}</strong>. The example implements a limited HL7 v2 message subset and FHIR R4-style resources; it is not a conformance-validated hospital interface.</div><div class="payload-tabs"><button data-payload="request" class="${messageTab==='request'?'active':''}">01 · FHIR ServiceRequest</button><button data-payload="hl7" class="${messageTab==='hl7'?'active':''}">02 · HL7 result message</button><button data-payload="fhir" class="${messageTab==='fhir'?'active':''}">03 · FHIR diagnostic report</button></div><div class="payload-bar"><span>${messageTab==='request'?'application/fhir+json':messageTab==='hl7'?'text/hl7-v2':'application/fhir+json'}</span><button id="copy-payload">Copy payload ⧉</button></div><pre class="payload-code" id="payload-code">${escapeHTML(payload)}</pre><div class="message-info">${messageTab==='request'?'The order references the correct patient and specimen.':messageTab==='hl7'?'MSH, PID, OBR and OBX carry message, patient, order and observation details.':'The result is mapped to an Observation and DiagnosticReport referencing the original request.'}</div></section>`;}
function renderAudit(){const rows=state.audit.filter(e=>(auditFilter==='all'||e.kind===auditFilter)&&((e.caseId+' '+e.action+' '+e.detail).toLowerCase().includes(auditSearch.toLowerCase())));
return `<section class="panel audit-layout"><div class="panel-head"><h3>Workflow events</h3><small>${state.audit.length} RECORDED</small></div><div class="audit-filter"><input id="audit-search" aria-label="Search audit events" placeholder="Search order, event or message…" value="${escapeHTML(auditSearch)}"/><select id="audit-filter" aria-label="Filter by outcome"><option value="all" ${auditFilter==='all'?'selected':''}>All outcomes</option><option value="success" ${auditFilter==='success'?'selected':''}>Successful</option><option value="error" ${auditFilter==='error'?'selected':''}>Blocked</option><option value="info" ${auditFilter==='info'?'selected':''}>Information</option></select></div><p class="filter-help">Events record actions performed within this browser. This is not an immutable production audit log.</p>${rows.length?rows.map(e=>`<div class="audit-row ${e.kind}"><time>${fmt(e.at)}</time><div><strong>${escapeHTML(e.action)}</strong><p>${escapeHTML(e.detail)}</p></div><span class="event-tag">${escapeHTML(e.caseId)}</span></div>`).join(''):'<div class="audit-empty">No matching events.</div>'}</section>`;}
async function apiPost(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data;}
async function mutate(action,options={}){
 const c=selected();
 try{
  let r;
  if(backendOnline){const data=await apiPost(`/api/cases/${encodeURIComponent(c.id)}/actions`,{action,...options});state=data.state;r=data.outcome;}
  else {r=perform(state,c.id,action,options);persist();}
  if(r.ok)alertUser(action==='deliver'?'Result validated, mapped and delivered to the fictional EPR.':`Case ${c.id} updated successfully.`);
  else alertUser(r.error,'error');render();
 }catch(e){alertUser(e.message,'error');renderNotice();}
}
async function initialiseBackend(){
 try{const r=await fetch('/api/health',{cache:'no-store'});if(!r.ok)return;const health=await r.json();if(health.mode!=='sqlserver')return;
  const response=await fetch('/api/state',{cache:'no-store'});if(!response.ok)return;const data=await response.json();if(!checkState(data.state))return;
  backendOnline=true;state=data.state;selectedId=state.cases[0]?.id;
  document.querySelector('.system-status span:nth-child(2)').textContent='SQL Server connected';
  document.querySelector('.side-bottom p').textContent='Synthetic records persist in a local Microsoft SQL Server database.';
  document.querySelector('.workspace-foot span:first-child').textContent='DATA MODE: LOCAL SQL SERVER · SYNTHETIC RECORDS';
  document.querySelector('.environment').innerHTML='<span class="env-dot"></span> LOCAL SQL SERVER MODE';
  render();
 }catch{/* GitHub Pages and standalone static hosting use the browser engine. */}
}

function showModal(){const m=$('modal');$('form-patient').innerHTML=PATIENTS.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)} · ${escapeHTML(p.id)}</option>`).join('');$('form-test').innerHTML=TESTS.map(t=>`<option value="${escapeHTML(t.code)}">${escapeHTML(t.name)}</option>`).join('');m.hidden=false;$('form-patient').focus();}
function closeModal(){$('modal').hidden=true;$('new-order').focus();}
function downloadCase(){const c=selected();const json=JSON.stringify({case:c,audit:state.audit.filter(e=>e.caseId===c.id)},null,2);const blob=new Blob([json],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`genflow-${c.id}.json`;a.click();URL.revokeObjectURL(url);}
$('new-order').addEventListener('click',showModal);
$('close-modal').addEventListener('click',closeModal);$('cancel-modal').addEventListener('click',closeModal);
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').hidden)closeModal();});
$('order-form').addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(e.currentTarget);try{const body={patientId:form.get('patientId'),testCode:form.get('testCode'),priority:form.get('priority')};let c;if(backendOnline){const data=await apiPost('/api/cases',body);state=data.state;c=data.outcome;}else{c=addCase(state,body);persist();}selectedId=c.id;view='cases';statusFilter='all';search='';closeModal();alertUser(`New test request ${c.id} created. Receive the specimen to continue.`);render();}catch(err){alertUser(err.message,'error');closeModal();}});
$('reset-data').addEventListener('click',async()=>{if(!confirm('Reset the demo? All synthetic case changes in the current workspace will be replaced with sample records.'))return;try{if(backendOnline){const data=await apiPost('/api/reset',{});state=data.state;}else{state=newState();persist();}selectedId=state.cases[0].id;view='cases';search='';statusFilter='all';notice=null;render();}catch(e){alertUser(e.message,'error');}});
$('side-nav').addEventListener('click',e=>{const btn=e.target.closest('button[data-view]');if(!btn)return;view=btn.dataset.view;render();});
$('app-alert').addEventListener('click',e=>{if(e.target.closest('[data-dismiss]')){notice=null;renderNotice();}});
$('view-content').addEventListener('click',e=>{
  const choice=e.target.closest('[data-case]');if(choice){selectedId=choice.dataset.case;render();return;}
  const btn=e.target.closest('[data-action]');if(btn){const action=btn.dataset.action;if(action==='result')mutate(action,{result:$('result-choice').value});else if(action==='deliver')mutate(action,{patientOverride:$('inject-error')?.checked?'PX-MISMATCH':null});else mutate(action);return;}
  const link=e.target.closest('[data-open-messages],[data-open-audit]');if(link){view=link.hasAttribute('data-open-messages')?'messages':'audit';render();return;}
  const payload=e.target.closest('[data-payload]');if(payload){messageTab=payload.dataset.payload;render();return;}
  if(e.target.closest('#copy-payload')){const v=payloadFor(selected());if(navigator.clipboard?.writeText){navigator.clipboard.writeText(v).then(()=>alertUser('Payload copied to clipboard.')).catch(()=>alertUser('Clipboard permission denied.','error'));}else alertUser('Clipboard requires a secure browser context.','error');return;}
});
$('view-content').addEventListener('input',e=>{
  if(e.target.id==='case-search'){search=e.target.value;$('queue-list').innerHTML=queueRows();}
  if(e.target.id==='audit-search'){auditSearch=e.target.value;const start=e.target.selectionStart;render();const input=$('audit-search');input.focus();input.setSelectionRange(start,start);}
});
$('view-content').addEventListener('change',e=>{
  if(e.target.id==='case-filter'){statusFilter=e.target.value;$('queue-list').innerHTML=queueRows();}
  if(e.target.id==='message-case'){selectedId=e.target.value;render();}
  if(e.target.id==='audit-filter'){auditFilter=e.target.value;render();}
});
persist();render();initialiseBackend();