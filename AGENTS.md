# Operational guidance

- Read this file and `CLAUDE.md` before changing the repository. Preserve unrelated local work and stage files selectively.
- Never store SMS codes, tokens, credentials, private keys, cookies, session data, device identifiers, or full phone numbers in tracked files or final responses.
- Keep sensitive operational notes, APKs, UI captures, logs, and other evidence under `storage/app/private/ops/`; that path is ignored by Git.
- The current Android/WhatsApp registration runbook and evidence live under `storage/app/private/ops/whalibmob-registration-20260916/`.
- Before a live registration attempt, confirm one authorized ADB device, the exact target account and SIM, the current WhatsApp screen, exclusivity of the attempt, and the server cooldown state.
- Request a fresh SMS at most once per authorized attempt, never print or reuse its code, and verify durable account identity after completion.
- Prefer the official WhatsApp registration and companion-pairing path when it satisfies the goal. Do not bypass account restrictions, review states, or cooldowns.
- Restore temporary ADB forwards, Frida helpers, and device settings after the operation; record before/after state privately.
- Reusable operational facts must also be recorded in the Bom Sucesso private ops area. Shared credentials belong only in `C:\dados\servers\my-credentials-and-services`.


## Mandatory learning log

- Maintain `storage/app/private/ops/PROJECT-LEARNINGS.md` as the project-wide, append-only record of everything materially learned while investigating, implementing, testing, reviewing, or operating this repository.
- Append an entry after every meaningful work batch and before declaring a task complete. Record successful findings, negative results, failed attempts, regressions, reversals, assumptions, decisions, validation results, unresolved questions, and the next safe action. Do not record only the final success path.
- Each entry must include: timestamp; scope; source/evidence (file, symbol, commit, issue/PR, official URL, APK class, or sanitized command/result); observation; classification (`fact`, `inference`, or `hypothesis`); confidence; decision/impact; validation; and follow-up.
- Never rewrite or delete a prior learning. Correct stale or wrong information with a new dated addendum that points to the superseded entry and explains why it changed.
- Sanitize before writing. Never include SMS/OTP values, tokens, credentials, private keys, cookies, session payloads, device identifiers, full phone numbers, private URLs containing one-time slugs, or raw account/session files. Use neutral aliases such as `authorized-target-A`, slot labels, boolean outcomes, counts, hashes, and redacted excerpts.
- Keep raw sensitive evidence only in the operation-specific ignored directory when strictly necessary; the consolidated learning log must contain only sanitized conclusions and references to the private evidence location.
- Distinguish protocol evidence from speculation. Never promote a hypothesis to a fact because a workaround appeared to help once; record the controlled comparison or state explicitly that causality remains unproven.
- Reusable, non-sensitive learnings must also be converted into the appropriate tracked artifact (test, type, code comment, README/runbook, or changelog) and mirrored to the Bom Sucesso private ops area when its path is available.
