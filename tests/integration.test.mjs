import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, createRequest, createHL7, parseHL7, processMessage } from '../docs/core.mjs';
test('order includes patient and specimen references',()=>{ const req=createRequest(); assert.equal(req.resourceType,'ServiceRequest'); assert.equal(req.subject.reference,'Patient/DEMO-001'); });
test('synthetic HL7 message maps to FHIR Observation and DiagnosticReport',()=>{ const result=processMessage(createHL7(),new Set()); assert.equal(result.observation.resourceType,'Observation'); assert.equal(result.report.resourceType,'DiagnosticReport'); assert.equal(result.report.result[0].reference,'Observation/OBS-001'); });
test('rejects patient mismatch',()=>{ const altered=createHL7().replace('PID|||DEMO-001','PID|||WRONG-001'); assert.throws(()=>parseHL7(altered),/Patient identifier/); });
test('rejects specimen mismatch',()=>{ const altered=createHL7().replace('SPEC-001','WRONG-001'); assert.throws(()=>parseHL7(altered),/Specimen identifier/); });
test('rejects missing observation value',()=>{ const altered=createHL7().replace(fixture.result,''); assert.throws(()=>parseHL7(altered),/observation value/); });
test('rejects duplicates',()=>{ const seen=new Set(); processMessage(createHL7(),seen); assert.throws(()=>processMessage(createHL7(),seen),/Duplicate message/); });
