# Phase 1B.2 Performance Optimization Report

## Overview
Phase 1B.2 focused on refactoring the correctness-critical recursion of `analyzeExchange` to improve performance without changing its semantic output or behavior. This optimization is critical to prepare for Phase 2, which will analyze every destination of a selected piece simultaneously.

## Methodology
The optimization was carried out in two strictly separated agent phases:
1. **Agent B (Reference & Validation)**: Created a frozen reference copy of the Phase 1B implementation (`tests/support/reference-exchange.ts`). Built an equivalence testing harness using Vitest `toEqual` assertions and a performance benchmarking script (`scripts/bench-exchange.ts`).
2. **Agent A (Optimization)**: Rewrote the internals of `src/engine/exchange.ts` to use recursive calls on cloned `chessops` positions, generated destination-specific capture candidates using geometric destination checks (`pos.dests(fromSq)`), and introduced a unified local cache utilizing a fast string representation of `pos.board.occupied` and `targetRole`.

## Performance Benchmarks

### Before Optimization (Agent B Baseline)
*Using `analyzeExchange` invoking `makeFen`, `parseFen`, and full `getLegalMoves` sorting per node.*
- **Crowded Fixture Alone**: ~506 ms
- **All Legal Moves Per Corpus Position**:
  - startpos (20 moves): ~88 ms
  - kiwipete (48 moves): ~475 ms
  - pos4 (6 moves): ~28 ms
  - pos4m (6 moves): ~35 ms
  - pos6 (46 moves): ~255 ms
  - crowded (47 moves): ~2274 ms
- **All-Positions Total**: ~3155 ms

### After Optimization (Agent A Implementation)
*Using `bestExchangePos` with position cloning, restricted destination move generation, and local memoization.*
- **Crowded Fixture Alone**: ~32.65 ms
- **All Legal Moves Per Corpus Position**:
  - startpos (20 moves): ~8.58 ms
  - kiwipete (48 moves): ~23.06 ms
  - pos4 (6 moves): ~2.79 ms
  - pos4m (6 moves): ~3.06 ms
  - pos6 (46 moves): ~13.29 ms
  - crowded (47 moves): ~56.49 ms
- **All-Positions Total**: ~107.28 ms

## Equivalence Verification
The equivalence harness (`tests/engine/exchange-equivalence.test.ts`) ran against:
- 19 individual explicit edge-case and Phase 1B fixtures.
- 173 total legal moves generated dynamically across all 6 standard positions in the corpus.

**Result**: PASS on all 192 inputs. The optimized implementation is deep-equal to the frozen reference in all aspects (SEE value, best line sequence, balances, en passant tie-breaking, etc).

## Git History
```
dd44f2f Phase 1B.2: Exchange Performance Optimization
491f766 Phase 1B.2: reference snapshot and equivalence harness
```
