# Laboratory Integration Simulator

Independent software engineering portfolio demonstration by Vincent Olagbemide, showing a synthetic EPR → LIMS → EPR exchange.

**Independent educational prototype. Not an NHS application, not affiliated with Oxford University Hospitals, and not connected to real patients or clinical systems.**

## Live demonstration

Once GitHub Pages is enabled from `main` / `docs`:
https://vincentayorinde.github.io/nhs-lab-integration-demo/

## What the demonstration does

1. Creates an illustrative FHIR R4-style `ServiceRequest` for a fictional genetics test.
2. Creates a small synthetic HL7 v2-style `ORU^R01` result with `MSH`, `PID`, `OBR` and `OBX` segments.
3. Checks patient, order and specimen identifiers before mapping results.
4. Outputs illustrative FHIR R4-style `Observation` and `DiagnosticReport` JSON.
5. Rejects malformed identifiers, missing results and duplicate messages in automated tests.

## Run locally

```bash
python3 -m http.server 8000 --directory docs
# Open http://localhost:8000/
npm test
```

Requires Node.js 20+ for the tests; the browser demonstration has no runtime dependencies.

## Repository structure

- `docs/index.html`, `docs/style.css`, `docs/app.mjs` — browser interface
- `docs/core.mjs` — synthetic integration logic
- `tests/integration.test.mjs` — automated tests
- `sql/schema.sql` — illustrative SQL Server schema, **not connected** to the frontend

## Limitations

This is a client-side proof of concept, not certified clinical software. The HL7 subset and FHIR-style resource JSON are illustrative and are not fully standards-validated. It has no live EPR or LIMS, SQL Server persistence, authenticated endpoints, clinical terminology service, or patient-safety accreditation. All patients and results are fictional.

## Next engineering steps

Add a real SQL Server-backed NestJS integration service, standards-based HL7/FHIR validation, structured audits, deterministic retries, authentication, terminology mappings and documented verification procedures.

## References

- https://hl7.org/fhir/R4/servicerequest.html
- https://hl7.org/fhir/R4/observation.html
- https://hl7.org/fhir/R4/diagnosticreport.html
