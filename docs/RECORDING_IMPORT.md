# Reviewed recording import

The September 30 FotMob recording contributes eight reviewed 1X2 odds snapshots and six readable scoring summaries. The fixture loader attaches observations only on an exact competition, ordered canonical team pair and UTC fixture-date match. Missing or ambiguous matches remain unattached. No kickoff times or completed-match dates are fabricated.

The prediction drawer displays margin-normalized bookmaker probabilities separately from the existing model forecast. The import does not change confidence, slip selections or the default model. Date-only snapshots are labelled historical after their recording date. Unknown scoring summaries stay null. xPTS league tables are not imported as match-level xG. Injury observations are withheld because they need a complete, reviewed team mapping and verified timing.

The current model requires dated completed matches; the recording's aggregate summaries cannot satisfy that input contract. Genuine prediction archival and settlement are separate unfinished work. No accuracy improvement is claimed from importing this context.

This integration spans the existing frontend, data/model and docs/tests paths, with the new reviewed data and helper assigned to data/model for this task. It does not change the future AWS wire contract.

Validation: `node --test tests/recording-observations.test.ts` and TypeScript checking.
