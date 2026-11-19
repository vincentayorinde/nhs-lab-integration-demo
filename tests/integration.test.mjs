import test from 'node:test';
import assert from 'node:assert/strict';
import {newState,addCase,perform,buildServiceRequest,buildHL7,parseHL7,caseCounts,RESULTS} from '../docs/core.mjs';
function setup(){const s=newState('2026-11-19T12:00:00.000Z');const c=addCase(s,{patientId:'PX-00184',testCode:'GEN-PNL',priority:'Urgent'},'2026-11-19T13:00:00.000Z');return {s,c};}
function verified(){const {s,c}=setup();perform(s,c.id,'receive');perform(s,c.id,'start');perform(s,c.id,'result',{result:RESULTS[0]});perform(s,c.id,'verify');return {s,c};}
test('seed includes four cases and genuine multi-stage states',()=>{const s=newState();assert.equal(s.cases.length,4);assert.equal(s.cases.at(-1).status,'delivered');assert.ok(s.audit.length>=4);});
test('creates a unique FHIR-style order for synthetic patient and specimen',()=>{const {c}=setup();const req=buildServiceRequest(c);assert.equal(req.subject.reference,'Patient/PX-00184');assert.equal(req.specimen[0].reference,`Specimen/${c.specimenId}`);});
test('full workflow delivers a correctly mapped FHIR report',()=>{const {s,c}=verified();const res=perform(s,c.id,'deliver');assert.equal(res.ok,true);assert.equal(c.status,'delivered');assert.equal(c.report.observation.valueString,RESULTS[0]);assert.equal(c.report.report.result[0].reference,`Observation/OBS-${c.id}`);});
test('blocks analysis before receipt',()=>{const {s,c}=setup();assert.throws(()=>perform(s,c.id,'start'),/Cannot start/);});
test('blocks result before analysis',()=>{const {s,c}=setup();assert.throws(()=>perform(s,c.id,'result',{result:RESULTS[0]}),/Cannot result/);});
test('blocks release without verification',()=>{const {s,c}=setup();assert.throws(()=>perform(s,c.id,'deliver'),/must be verified/);});
test('rejects result values not in the synthetic catalogue',()=>{const {s,c}=setup();perform(s,c.id,'receive');perform(s,c.id,'start');assert.throws(()=>perform(s,c.id,'result',{result:'malicious|value'}),/Choose a fictional/);});
test('HL7 parser validates patient identity',()=>{const {c}=verified();assert.throws(()=>parseHL7(buildHL7(c,{patientOverride:'PX-WRONG'}),c),/Patient identifier/);});
test('quarantines mismatched result and allows corrected retry',()=>{const {s,c}=verified();let r=perform(s,c.id,'deliver',{patientOverride:'PX-WRONG'});assert.equal(r.ok,false);assert.equal(c.status,'verified');assert.equal(s.audit[0].kind,'error');r=perform(s,c.id,'deliver');assert.equal(r.ok,true);assert.equal(c.status,'delivered');});
test('blocks duplicate delivery and records audit',()=>{const {s,c}=verified();perform(s,c.id,'deliver');const r=perform(s,c.id,'retry');assert.equal(r.ok,false);assert.match(r.error,/Duplicate/);assert.equal(s.audit[0].kind,'error');});
test('rejects mismatched specimen identity',()=>{const {c}=verified();const msg=buildHL7(c).replace(c.specimenId,'SP-WRONG');assert.throws(()=>parseHL7(msg,c),/specimen identifier/);});
test('counts reflect case state',()=>{const s=newState();const counts=caseCounts(s.cases);assert.equal(counts.open,3);assert.equal(counts.delivered,1);});