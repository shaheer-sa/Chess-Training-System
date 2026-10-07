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
1. **Performance Overhead**: Generating legal moves and cloning/playing the board state at every depth is slower than a static bitboard evaluation.
2. **Intermediate Checks**: If a capture on the target square gives check, the opponent must respond to the check. If the only legal response is to move the king away (abandoning the recapture), the sequence terminates correctly but does not evaluate the broader positional consequences of the king move.
3. **Target Isolation**: The recursion strictly evaluates captures on the *target square* (and en-passant square). It does not analyze tactical deflections, "zwischenzugs" (in-between moves) on other squares, or mating threats.
