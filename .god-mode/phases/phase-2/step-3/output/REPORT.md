# Step 2.3 REPORT: Firestore rules (summary of worker hand-back). Merged (9abdaac).
- `firestore.rules`: members-only everywhere; households/invites never listable; `sent` denied; exact key sets per collection (no `pending`, no stored ids); join requires `household.invite.code == code`.
- Strictness: jar one-change-per-write (setup from null, edit treat/target, ±1, redeem only when full with treats/{round} in same batch, never back to null); every "now" field == request.time; owner removal + last-leaver must clear/rotate invite; attribution fields == caller; event push 'pending' exactly for requested/completed/jar_filled.
- Indexes: tasks(status, completedAt desc); photos dataUrl/thumbDataUrl exempt from indexing.
- Tests: 340 (9 files), allow+deny per collection; 71/76 mutants caught (5 deliberate double-guards).
- Dependent reads: complete-batch max 10; join 6; redeem 6; reopen 5; owner removal 5.
- Security review fixes: photoURL restricted to https://*.googleusercontent.com; last leaver clears invite; owner removal rotates invite; deleting a nonexistent member doc denied (no household probing); device docs and users.householdId must point to a household the caller belongs to.
- Accepted risks: no rate limiting (App Check later), jar pumping by a member, weak self-chosen codes.
- `docs/firestore-schema.md` is the adapter spec (exact key sets, batches, serverTimestamp, join/leave increments, invite memberCount, expiresAt skew −10min, join error mapping by re-reading the invite).
