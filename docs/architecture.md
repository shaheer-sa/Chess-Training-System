# Engine Architecture

## Overview

The Chess Training System engine is a pure, headless TypeScript library with zero UI or framework dependencies. Its sole responsibility is deterministic chess evaluation focusing on square safety, tactical justification, and exchange outcomes.

---

## Planned Engine Layers

Analysis flows linearly through five decoupled layers (planned for future phases; not implemented in Phase 0):

```
[Candidate Move Played]
          │
          ▼
1. Rules Adapter          (Wraps chessops; normalizes board state, moves, and legal constraints)
          │
          ▼
2. Attack / Defense Map   (Calculates geometric vs. legal attack/defense sets, rays, and pin blockers)
          │
          ▼
3. Exchange Analysis (SEE) (Simulates captures on target square; computes material balance and x-rays)
          │
          ▼
4. Tactical Checks        (Identifies discovered attacks, hanging pieces, removal of defenders, forks)
          │
          ▼
5. Classification & Codes (Assigns move safety verdict: safe, blunder, mistake, with deterministic reason codes)
```

---

## Core Analysis Rule

**All consequence analysis runs on the position AFTER the candidate move is played.**

- When a user considers moving a piece to square $S$, the engine plays the candidate move to generate the resulting board state.
- Square safety, opponent responses, newly unmasked x-rays, and exchange balances are evaluated on this subsequent position.

---

## Structured Output Contract

- Engine output must be structured, not just a classification verdict.
- At minimum, output includes:
  - The ordered exchange steps (piece, from-square, captured piece).
  - Deterministic reason codes.
- Explanations can later be generated directly from engine data rather than written freehand.

---

## Ordering Contract

"By square" ordering strictly follows chessops square index order (a1=0, b1=1 ... h1=7, a2=8 ... h8=63), not alphabetical string order.
- `getLegalMoves`: sort by from-index, then to-index, then promotion alphabetical (`bishop`, `knight`, `queen`, `rook`).
- `geometricAttackers`, `geometricDefenders`, `legalRecaptures`: by square index.
- `legalCaptures`: by capturer square index.

---

## Testing Approach

- **Deterministic FEN Fixtures**: Test positions live in `/tests/fixtures/` as structured FEN strings accompanied by hand-verified ground truth.
- **Regression Suites**: Every layer will be verified with targeted unit tests in `/tests/engine/`, asserting exact mathematical correctness and rule compliance.
- **No LLM Logic**: All evaluations are strictly computed from chess rules and deterministic algorithms.

---

## Phase 1B Limitations (Legal-Move SEE)

The Phase 1B Exchange Analysis utilizes recursive legal-move generation rather than a traditional static bitboard swap-list (Static Exchange Evaluation). 
Known limitations/characteristics of this approach include:

1. **Only captures on the current exchange square are considered.**
   Off-square zwischenzugs, deflections, forks, mating ideas and other tactical consequences are outside Phase 1B.

2. **Stand pat is allowed even when the side to move is in check.**
   This is a deliberate Phase 1B simplification. Therefore Phase 1B SEE is a MATERIAL EXCHANGE evaluator, not a complete tactical/legal-game-tree evaluator. Check/mate consequences belong to Phase 1C.

3. **Capture promotions are analyzed as queen promotion only, for BOTH sides.**
