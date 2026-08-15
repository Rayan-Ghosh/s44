# Test fixtures

**These are NOT excerpts of the real datasets.**

Every file here is hand-authored by this project to match the *column
shape* of the corresponding public dataset. No rows were copied from
PaySim, IEEE-CIS, the ULB credit-card dataset, or TeleAntiFraud-28k.

That distinction matters for two reasons:

1. **Licensing.** Committing excerpts of those datasets would be
   redistribution, which several of their licences restrict and which
   `docs/DATA_STRATEGY.md` forbids for this repository.
2. **Test speed.** Adapter tests must run in milliseconds against a
   handful of rows, not against multi-gigabyte downloads.

All identifiers, amounts and transcripts are fabricated. The
TeleAntiFraud fixture uses short invented Chinese-language strings purely
to exercise the language-tagging path in the adapter; they are not real
call transcripts.
