# Paper-crane acceptance metrics

The deterministic replay fixtures are a development gate, not a production reliability claim. Physical trials must report raw counts and preserve the frozen acceptance set.

| Metric | Initial acceptance |
|---|---:|
| Correct-step recognition | ≥90% transition accuracy |
| Selected wrong-fold recall | ≥90% |
| Wrong-fold intervention precision | ≥90% |
| False urgent interventions | ≤5% of correct transitions |
| Occluded-state handling | ≥90% uncertain rather than wrong |
| Recovery selection | 10/10 approved recovery fixtures |
| Intervention latency | p95 ≤2 seconds after persistence threshold |
| Unsupported recovery invention | 0 |
| Replay determinism | 100% identical graph-engine result |
| Why-response provenance | 100% linked to approved requirement or evidence |

Report frame accuracy, transition accuracy, intervention accuracy, run success rate, and recovery success rate separately. A ten-trial demonstration is reported as a raw result such as `9/10`; it is not presented as statistically proven production reliability.

## Dataset gate

Do not claim detector accuracy until the dataset includes an approved Golden Run, 10–20 additional correct recordings, at least five recordings per selected deviation, portrait and landscape samples, varied lighting, hand occlusion, frame/segment annotations, participant-disjoint evaluation where possible, and a frozen acceptance set excluded from tuning.
