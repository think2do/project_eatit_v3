"""Research agent package (F-320).

Eighth agent. Runs in parallel with Parse during the intake phase to
gather *external, public-only* context about the candidate's target
company and industry — never reading the resume body.

L0 A11 privacy guardrail is enforced at the schema layer (extra=forbid),
the service layer (audit log carries cache_key hash, not company name),
and the prompt (system.j2 reminds the LLM that the only inputs are
company / role / industry). See `apps/api/app/agents/research/schemas.py`
for the rejected-field contract.
"""
