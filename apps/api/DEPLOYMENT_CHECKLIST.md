# Deployment Readiness Checklist

## Pre-Deployment Verification

### ✅ Routing
- [ ] `TEMPLATE` route produces valid SQL for simple metric queries
- [ ] `TREND` route generates time-series SQL with correct `GROUP BY` periods
- [ ] `COMPARISON` route generates side-by-side SQL with entity deduplication
- [ ] `CONTRIBUTION` route generates weighted contribution SQL
- [ ] `ROOT_CAUSE` route generates multi-dimensional contribution SQL
- [ ] `LLM` fallback route is guarded by `claudeGuardrailService`
- [ ] All routes correctly fall back when engine returns null

### ✅ Caching
- [ ] SQL cache stores and retrieves correctly (7-day TTL)
- [ ] Narrative cache stores and retrieves correctly
- [ ] SQL cache key includes metric version hash
- [ ] ROOT_CAUSE results are NOT cached as SQL (multi-statement)
- [ ] Cache failures are non-fatal (silently degrade)

### ✅ Testing
- [ ] `analytics-regression.test.ts` passes all route validation tests
- [ ] Contradiction detection tests pass
- [ ] Claude input contract safety tests pass
- [ ] Guardrail blocking tests pass
- [ ] Query validation tests pass
- [ ] Metrics service tests pass
- [ ] Recommendation engine tests pass
- [ ] Load test completes for 1000 queries without errors

### ✅ Metrics & Observability
- [ ] `GET /api/metrics` returns valid JSON
- [ ] Query count increments per request
- [ ] Route distribution is accurate
- [ ] Cache hit/miss tracking works
- [ ] P95 latency is reported
- [ ] Error rate is tracked
- [ ] Contradiction rate is tracked
- [ ] Structured JSON logs are emitted at each pipeline stage

### ✅ Validation
- [ ] Pre-execution validation catches invalid metrics
- [ ] Pre-execution validation catches invalid dimensions
- [ ] Pre-execution validation catches impossible month values
- [ ] Post-execution validation catches empty result sets
- [ ] RootCausePackValidator catches numeric entity names
- [ ] RootCausePackValidator catches infinite contributions
- [ ] Volume share sum validation passes

### ✅ Cost Control
- [ ] Claude is BLOCKED for TEMPLATE SQL generation
- [ ] Claude is BLOCKED for TREND SQL generation
- [ ] Claude is BLOCKED for COMPARISON SQL generation
- [ ] Claude is BLOCKED for CONTRIBUTION SQL generation
- [ ] Claude is ALLOWED for LLM fallback SQL generation
- [ ] Claude is ALLOWED for ROOT_CAUSE_NARRATIVE
- [ ] Claude is ALLOWED for EXECUTIVE_SUMMARY
- [ ] Session cost tracking is accurate
- [ ] Token usage is recorded in database

### ✅ Failover
- [ ] Claude SQL failure returns user-friendly error message
- [ ] Claude SQL failure attempts template engine fallback
- [ ] Claude narrative failure falls back to deterministic narrative
- [ ] System remains fully functional without Claude connectivity
- [ ] `claudeFailed: true` flag is set in response payload

### ✅ Claude Integration
- [ ] Claude receives ONLY `ClaudeInputPack` (never raw SQL/rows)
- [ ] `assertClaudeInputSafe()` blocks SQL patterns in pack
- [ ] `assertClaudeInputSafe()` blocks file path patterns
- [ ] Narrative generator handles contradictions
- [ ] Narrative generator produces Executive Summary + Key Drivers + Risks

### ✅ Data Integrity
- [ ] Contribution math uses Mix-Rate formula
- [ ] `FULL OUTER JOIN` captures churned entities
- [ ] `COALESCE` prevents NULL dimension values
- [ ] Weighted contributions reconcile with overall metric change
- [ ] Entity attribution produces hotel/chain names (not metric values)

## Post-Deployment Monitoring

- [ ] Monitor `GET /api/metrics` for error rate spikes
- [ ] Monitor Claude session cost via `getSessionCostSummary()`
- [ ] Alert on P95 latency > 5000ms
- [ ] Alert on error rate > 5%
- [ ] Review structured logs for `[VALIDATION] FAILED` entries
