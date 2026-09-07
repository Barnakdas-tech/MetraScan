# MetraScan — SIH26034 Starter

AI-assisted compliance inspection system for packaged commodities under the Legal Metrology (Packaged Commodities) Rules, 2011.

Architecture:
- client/      React frontend
- server/      Node.js + Express API
- ai-service/  Python + FastAPI OCR/CV service
- legal/       Legal rule catalog and matrix
- docs/        Architecture/API notes

Principle: AI extracts evidence; deterministic rules decide PASS/FAIL/REVIEW.

The supplied PDF also contains provisions that cannot be established from photographs alone (physical quantity measurement, calibrated procedures, sampling, seizure/enforcement and registration administration). These are represented as MANUAL_REQUIRED or OUT_OF_SCOPE_AUTOMATION rather than fabricated image-based conclusions.

Historical provisos marked withdrawn/amended in the supplied PDF are not activated automatically.
