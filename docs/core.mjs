/* Synthetic, browser-only educational workflow. Not a clinical integration. */
export const fixture = Object.freeze({
  patientId: 'DEMO-001', patientName: 'Jane Example', orderId: 'ORDER-001',
  specimenId: 'SPEC-001', messageId: 'MSG-001', testCode: 'GEN-001',
  testName: 'Synthetic genetics panel', result: 'No variant detected (synthetic)'
});
export function createRequest(f = fixture) {
  return {
    resourceType: 'ServiceRequest', id: f.orderId, status: 'active', intent: 'order',
    code: { text: f.testName }, subject: { reference: `Patient/${f.patientId}` },
    identifier: [{ system: 'https://example.org/synthetic-orders', value: f.orderId }],
    specimen: [{ reference: `Specimen/${f.specimenId}` }]
  };
}
export function createHL7(f = fixture) {
  return [
    `MSH|^~\\&|LAB_SIM|DEMO_LAB|EPR_SIM|DEMO|202611191200||ORU^R01|${f.messageId}|P|2.5`,
    `PID|||${f.patientId}||EXAMPLE^JANE`,
    `OBR|1|${f.orderId}|${f.specimenId}|${f.testCode}^${f.testName}`,
    `OBX|1|ST|${f.testCode}^${f.testName}||${f.result}`
  ].join('\r');
}
export function parseHL7(message, expected = fixture) {
  if (typeof message !== 'string') throw new Error('HL7 message must be text');
  const rows = message.trim().split(/\r\n|\r|\n/).map(s => s.split('|'));
  const segments = new Map(rows.map(parts => [parts[0], parts]));
  const msh = segments.get('MSH'), pid = segments.get('PID');
  const obr = segments.get('OBR'), obx = segments.get('OBX');
  if (!msh || !pid || !obr || !obx) throw new Error('Missing required MSH, PID, OBR or OBX segment');
  if (msh[8] !== 'ORU^R01') throw new Error('Expected an ORU^R01 result message');
  if (!msh[9]) throw new Error('Missing message identifier');
  if (pid[3] !== expected.patientId) throw new Error('Patient identifier does not match the test order');
  if (obr[2] !== expected.orderId) throw new Error('Order identifier does not match');
  if (obr[3] !== expected.specimenId) throw new Error('Specimen identifier does not match');
  if (obx[2] !== 'ST' || !obx[5]) throw new Error('Missing or unsupported observation value');
  return { messageId: msh[9], patientId: pid[3], orderId: obr[2], specimenId: obr[3], result: obx[5] };
}
export function mapToFHIR(parsed, f = fixture) {
  if (parsed.patientId !== f.patientId || parsed.orderId !== f.orderId || parsed.specimenId !== f.specimenId) {
    throw new Error('Data reconciliation failed');
  }
  const observation = {
    resourceType: 'Observation', id: 'OBS-001', status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { text: f.testName }, subject: { reference: `Patient/${f.patientId}` },
    basedOn: [{ reference: `ServiceRequest/${f.orderId}` }],
    specimen: { reference: `Specimen/${f.specimenId}` },
    valueString: parsed.result
  };
  const report = {
    resourceType: 'DiagnosticReport', id: 'REPORT-001', status: 'final',
    code: { text: f.testName }, subject: { reference: `Patient/${f.patientId}` },
    basedOn: [{ reference: `ServiceRequest/${f.orderId}` }],
    specimen: [{ reference: `Specimen/${f.specimenId}` }],
    result: [{ reference: 'Observation/OBS-001' }],
    conclusion: 'Synthetic report only; not a clinical finding.'
  };
  return { observation, report };
}
export function processMessage(message, seenIds = new Set(), expected = fixture) {
  const parsed = parseHL7(message, expected);
  if (seenIds.has(parsed.messageId)) throw new Error('Duplicate message rejected (idempotency check)');
  const mapped = mapToFHIR(parsed, expected);
  seenIds.add(parsed.messageId);
  return { parsed, ...mapped };
}
