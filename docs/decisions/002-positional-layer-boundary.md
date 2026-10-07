---
# ADR 002 — Positional Layer (Phase 1D) Boundary
Status: Accepted
1. PIECE_VALUES (pawn 100, knight 300, bishop 300, rook 500, queen 900)
   is NOMINAL material only and is never modified by positional logic.
2. Phase 1D (future) adds positional facts and trade context: safe
   mobility, king-zone participation, sole-defender duties, trapped
   pieces, outposts, rook files/7th rank, bad bishop, bishop pair,
   simple batteries, and before/after trade comparison.
3. Phase 1D outputs factors WITH EVIDENCE (squares, pieces) and ordinal
   levels (passive / normal / active / key). It never outputs fake
   numeric piece values as objective truth.
4. Move classification labels (Phase 1E) depend ONLY on material and
   immediate tactics. Positional findings must NEVER change a label.
   They appear as a separate, clearly labelled line in the UI.
5. Until Phase 1D exists, no UI text may claim "good trade", "strong
   piece", "weak piece" or "best move". "Safe" means only: no immediate
   material or tactical problem was detected.
6. Phase 1D validation: supervisor-curated fixtures + engine
   before/after evaluation used only as a direction check.
7. Scheduling: after the MVP has been tested with real players.
---
