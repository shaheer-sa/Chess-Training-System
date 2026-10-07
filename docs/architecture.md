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

## Testing Approach

- **Deterministic FEN Fixtures**: Test positions live in `/tests/fixtures/` as structured FEN strings accompanied by hand-verified ground truth.
- **Regression Suites**: Every layer will be verified with targeted unit tests in `/tests/engine/`, asserting exact mathematical correctness and rule compliance.
- **No LLM Logic**: All evaluations are strictly computed from chess rules and deterministic algorithms.
