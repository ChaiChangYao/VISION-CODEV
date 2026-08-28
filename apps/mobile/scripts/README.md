# Physical acceptance reports

`device-acceptance.mjs` creates and validates evidence reports for the staged
physical-device gates. It never turns a fixture into hardware evidence.

```powershell
node apps/mobile/scripts/device-acceptance.mjs init --phase 4 --out .tmp/phase-04.json
node apps/mobile/scripts/device-acceptance.mjs checklist --phase 4
node apps/mobile/scripts/device-acceptance.mjs validate --report .tmp/phase-04.json
node apps/mobile/scripts/device-acceptance.mjs validate --report .tmp/phase-04.json --strict
```

Use phases `4`, `12`, and `15`. Keep reports containing device or provider
evidence outside version control and redact credentials, bearer tokens, and
provider secrets.
