# Decision Record 001: Chess Rules Library Selection

- **Status**: Accepted
- **Date**: 2026-10-07
- **Deciders**: Engineering Lead & Agent Evaluator
- **Chosen Library**: `chessops` (v0.15.1)
- **Rejected Library**: `chess.js` (v1.4.0)

---

## Context & Problem Statement

We are developing an interactive chess training platform centered on deterministic "square safety" analysis: assessing piece geometric attackers, geometric/legal defenders, x-ray lines of sight, pin states, and static exchange evaluation (SEE).

The engine requires:

1. Rigorous, deterministic move generation and position validation (Perft benchmarks).
2. Distinction between geometric (pseudo-legal) attacks and strictly legal moves/defenders (e.g., handling absolute pins).
3. Geometric defender and attacker queries for either color regardless of whose turn it is, without mutating board state or generating illegal states.
4. Low-level primitives for exchange analysis: ray generation (`ray`, `between`), sliding attacks with custom occupancy masks for x-ray detection, and pin/checker sets.
5. High TypeScript type safety and maintainability.

---

## Evaluation Evidence

We evaluated `chessops` and `chess.js` via automated spike tests in `/tests/spike/`.

### 1. Legal Move Generation (Perft Checks)

Both libraries correctly passed the standard Perft benchmarks:

- **Standard Startpos**:
  - Depth 1: 20
  - Depth 2: 400
  - Depth 3: 8,902
- **Kiwipete (`r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1`)**:
  - Depth 1: 48
  - Depth 2: 2,039

### 2. Pinned-Defender Test

**Test Position FEN**: `4r1k1/8/8/8/1b6/8/3nR3/4K3 w - - 0 1`

- Facts: White Rook `e2` is absolutely pinned to King `e1` by Black Rook `e8`. Black Knight `d2` is defended by Black Bishop `b4`. White has NO legal captures on `d2` (`Rxd2` leaves King in check; `Kxd2` moves King into Bishop `b4` check).

| Metric                     | `chess.js`                                     | `chessops`                                                   |
| :------------------------- | :--------------------------------------------- | :----------------------------------------------------------- |
| **Attackers Query**        | `chess.attackers('d2', 'w')` -> `['e1', 'e2']` | `pos.kingAttackers(d2, 'white', occ)` -> `SquareSet(e1, e2)` |
| **Attackers Semantics**    | Geometric / Pseudo-legal                       | Geometric / Pseudo-legal                                     |
| **Pin Detection API**      | None (private internal checks)                 | First-class (`ctx.blockers.has(e2) === true`)                |
| **Legal Captures on `d2`** | `[]` (0 moves) via `chess.moves()` filter      | `[]` (0 moves) via `pos.allDests()` / `pos.dests()`          |

**Key Finding**: Both libraries' square attacker queries are purely **geometric** (line of sight / pseudo-legal). However, `chessops` explicitly exposes `ctx.blockers` (pinned pieces) and `ctx.checkers`, whereas `chess.js` encapsulates pin status privately inside move generation, preventing inspection without attempting full moves.

### 3. Defenders for the Side NOT to Move & Legality Determination

In square safety analysis, we need the defenders of a target square for the side not to move.

- **`chess.js`**:
  - Attempting to load a FEN with turn flipped to Black when White is in check (`6rk/8/8/8/8/8/8/6K1 b - - 0 1`) succeeds without validation error, leading to a legally corrupt state where Black can capture White's King (`Rxg1`).
  - `chess.setTurn()` internally executes a null move; when in check, it throws `Error: Null move not allowed when in check`.
  - Loading a FEN with an en passant square for the wrong turn throws an error.
  - Cannot evaluate geometric defenders without either mutating turn or relying on pseudo-legal `attackers()`.
- **`chessops`**:
  - Validates chess law: `Chess.fromSetup()` rejects opposite-check positions with `PositionError: ERR_OPPOSITE_CHECK`.
  - `pos.kingAttackers(square, color, occ)` and ray functions give **GEOMETRIC attackers** for either color without mutating the position.
  - `ctx.blockers` gives pin information for the **SIDE TO MOVE only**.
  - **Legal recaptures are NOT determined by geometric queries**.
  - **Planned Phase 1 approach**: Determine legality by actually playing each capture and generating legal moves for the side to move at each step. Geometric/bitboard queries are used for speed and x-ray detection only, never as proof of legality.

### 4. Exchange & X-Ray Analysis Primitives

- **`chess.js`**:
  - No sliding ray (`ray()`) or segment (`between()`) functions exposed.
  - Cannot compute attacks through an altered occupancy mask (e.g., removing a piece to see x-rays) without mutating the board via `remove()` and restoring via `put()`.
  - Internal 0x88 attack tables and masks are private and unexported.
- **`chessops`**:
  - Exports `ray(a, b)` and `between(a, b)`.
  - Sliding attack functions (`rookAttacks`, `bishopAttacks`, `queenAttacks`) accept an arbitrary `SquareSet` occupancy mask. Computing X-rays requires zero state mutation: `rookAttacks(e8, occupied.without(e2))`.
  - Bitboard architecture (`SquareSet`) provides high-performance set operations (`intersect`, `union`, `diff`, `has`).

### 5. Practical & Operational Factors

- **TypeScript Quality**:
  - `chessops` is written natively in TypeScript with robust types (`Square` 0..63, `Color`, `Role`, `Piece`, `SquareSet`) and typed `@badrap/result` returns.
  - `chess.js` uses stringly-typed squares and throws raw strings or untyped exceptions.
- **Maintenance**:
  - `chessops` is developed by Niklas Fiekas and powers Lichess in production.
  - `chess.js` is community-maintained with slower evolution.
- **License**:
  - `chessops`: GPL-3.0-or-later.
  - `chess.js`: BSD-2-Clause.

---

## Decision

We adopt **`chessops`** as the rules and board representation engine.

### Rationale

1. `chessops` provides the exact primitives required for square safety analysis and SEE: bitboard rays, custom occupancy masks for x-ray line of sight, and explicit pin blockers (`ctx.blockers`).
2. It allows querying geometric attackers for either color without clumsy FEN turn-flipping hacks.
3. It has strict, deterministic position validation and zero hidden mutation.

---

## License

- `chessops` is licensed under **GPL-3.0-or-later**.
- **Decision**: This project is licensed **GPL-3.0-or-later** and the source will be publicly available. This allows the engine to run in the browser.

---

## Known Limitations to Handle Ourselves

1. **Geometric vs Legal Distinction**: `pos.kingAttackers()` returns geometric attackers, not legal moves or legal defenders, and `ctx.blockers` covers pins for the side to move only. Legality must be established in Phase 1 by making moves and checking legal candidate moves at each exchange step.
2. **Square Indexing**: Squares in `chessops` are represented as integers `0..63` (`Square`). Our adapter layer will map between algebraic strings (`'e4'`) and chessops numerical squares using `parseSquare` and `makeSquare`.
