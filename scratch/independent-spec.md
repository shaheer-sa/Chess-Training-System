# Phase 1C Independent Test Specification

## 1. Supervisor Fixtures: T1-T8

| Fixture | FEN | Move | Expected Tactics | Chess Justification |
|---|---|---|---|---|
| T1 - defender moved | 6k1/8/1b6/8/3N4/8/8/3R2K1 w - - 0 1 | d1a1 | hangingAfterMove: d4 (gain 300, cause: defender_moved). allowsMateInOne: []. givesCheck: false | Rook moves away from defending the d4 knight against the b6 bishop. |
| T1b - BLACK mirror | 3r2k1/8/8/3n4/8/1B6/8/6K1 b - - 0 1 | d8a8 | hangingAfterMove: d5 (gain 300, cause: defender_moved). | Rook moves away from defending the d5 knight against the b3 bishop. |
| T2 - moving blocker opens line | 4r1k1/8/8/8/4B3/8/4N3/6K1 w - - 0 1 | e4c2 | hangingAfterMove: e2 (gain 300, cause: line_opened) | Bishop moves out of the way, opening the e-file for the e8 rook to attack the e2 knight. |
| T3 - leaving back rank allows mate | 1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 | a1a7 | allowsMateInOne: [b8b1]. hangingAfterMove: [] | Rook leaves the back rank undefended, allowing the black rook to checkmate on b1. |
| T3b - BLACK mirror | r5k1/5ppp/8/8/8/8/5PPP/1R4K1 b - - 0 1 | a8a2 | allowsMateInOne: [b1b8] | Rook leaves back rank undefended, allowing white rook to checkmate on b8. |
| T4 - candidate delivers mate | 6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 | a1a8 | givesCheck: true, deliversMate: true, allowsMateInOne: [], hangingAfterMove: [] | Rook moves to a8 delivering back rank mate. |
| T5 - candidate stalemates | 7k/5K2/8/8/8/8/8/6Q1 w - - 0 1 | g1g6 | causesStalemate: true, deliversMate: false, givesCheck: false | Queen moves to g6 leaving black king with no legal moves and not in check. |
| T6 - moved piece lands in absolute pin | 4r1k1/8/8/8/8/8/5N2/4K3 w - - 0 1 | f2e4 | moverPinned: absolute, pinned e4 knight, pinner e8 rook, target e1 king | Knight moves to e4 putting itself in the line of fire between the e8 rook and e1 king. |
| T7 - exchange line ends in mate | 1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 | a1b1 | exchangeLineMate: stepIndex 0, matedColor white, allowsMateInOne: [b8b1] | Capturing the b1 pawn throws the rook onto a square where it gets recaptured, leaving the back rank and leading to white being checkmated. |
| T8 - quiet baseline | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 | e2e4 | all flags false, arrays empty, moverPinned: null, exchangeLineMate: null | Standard opening move, no tactical consequences. |

## 2. Supervisor Fixtures: P1-P2

| Fixture | FEN | Expected Facts | Chess Justification |
|---|---|---|---|
| P1 - pin for side NOT to move | 4r1k1/8/8/8/8/8/4N3/4K3 b - - 0 1 | absolute pin on white knight e2 by black rook e8 on white king e1 | Pin is a geometric fact and must be computed for both colors regardless of whose turn it is. |
| P2 - relative pin to queen | 3r2k1/8/8/8/8/3B4/8/3Q2K1 w - - 0 1 | to_queen pin on white bishop d3 by black rook d8 on white queen d1. No absolute pin. | The bishop is pinned to the queen. It is a relative pin. |

## 3. Required Additional Tests

1. Absolute diagonal pin by queen.
   - FEN: `8/8/8/4k3/8/2B5/1Q6/K7 b - - 0 1` (Wait, queen pinning bishop. White Queen b2, Black Bishop c3, Black King e5? No, d4. b2, c3, d4, e5. So Black Bishop on c3 is pinned to Black King on e5 by White Queen on b2.)
   - Expected: absolute pin on c3 by b2 on e5.
   - Justification: Queen pins diagonally.

2. Two pins simultaneously (one affecting White, one affecting Black).
   - FEN: `3rk3/8/8/4n3/3B4/8/8/K2QR3 w - - 0 1`
   - Expected: absolute pin on e5 knight by e1 queen on e8 king. to_queen pin on d4 bishop by d8 rook on d1 queen.
   - Justification: Multiple pins can exist for both sides independently.

3. Slider-side blocker (Must NOT count as pin).
   - FEN: `4r2k/8/8/8/4n3/8/8/4K3 w - - 0 1` (Black rook e8, Black knight e4, White King e1).
   - Expected: 0 pins.
   - Justification: The blocker (e4 knight) is the same color as the pinner (e8 rook), so it is not pinned.

4. Two blockers between slider and king (Must NOT count as pin).
   - FEN: `4r2k/8/8/4N3/4B3/8/8/4K3 w - - 0 1` (Black rook e8, White knight e5, White bishop e4, White King e1).
   - Expected: 0 pins.
   - Justification: Two pieces block the ray, so neither is pinned.

5. King zone.
   - FEN: `8/8/8/4k3/8/3N2B1/2r5/K7 b - - 0 1`
   - Expected: White King a1 zone size 4, enemy attacker c2. Black King e5 zone size 9, enemy attackers d3, g3.
   - Justification: Corners have 4 squares (king + 3 adjacent). Center has 9 (king + 8 adjacent).

6. inCheck/checkers including DOUBLE CHECK.
   - FEN: `4k3/8/3N4/8/8/8/8/K3R3 b - - 0 1`
   - Expected: inCheck: true, checkers: [d6 knight, e1 rook].
   - Justification: King is attacked by two pieces simultaneously.

7. hangingAfterMove cause: other (already hanging).
   - FEN: `1k6/8/8/3n4/4P3/8/8/1K2R3 w - - 0 1` Move: e1e2.
   - Expected: hangingAfterMove on d5 (gain 300, cause: other).
   - Justification: The d5 knight was already attacked by the e4 pawn before the move.

8. Post-move position is CHECK, but hanging pieces are still computed through LEGAL moves only.
   - FEN: `1k6/8/8/8/4P3/3n4/8/1K2R3 b - - 0 1` Move: d3e1 (knight captures rook).
   - Expected: After d3e1, White is NOT in check. Oh wait, "Post-move position is CHECK".
   - Let's say White moves: `1k6/8/8/8/4P3/3n4/8/1K2R3 w - - 0 1` Move: e1f1. Then Black plays. Wait.
   - If candidate move delivers check, the opponent must respond to check. This severely limits opponent legal moves. Hanging pieces are only those capturable by LEGAL moves. So if opponent must block/evade check, they cannot capture pieces unless the capture also resolves the check.
   - FEN: `1k6/8/8/8/1B2P3/8/8/1K5R w - - 0 1` Move: h1h8 (Rook checks black king on b8). White Bishop on b4 is attacked by Black King b8? No, let's say Black Queen is on h4. If White plays h1h8+, Black MUST respond to check. Black Queen on h4 CANNOT capture White Bishop on b4 because Black is in check.
   - FEN: `1k6/8/8/8/1B6/8/8/1K5R w - - 0 1` Black queen on d4?
   - Expected: The b4 bishop is not hanging because opponent cannot legally capture it while in check.
   - Justification: `allowsMateInOne` and `hangingAfterMove` must only consider strictly legal opponent replies.

9. Error passthrough.
   - FEN: `invalid` -> `INVALID_FEN`.
   - FEN: `k7/8/8/8/8/8/8/K7 w - - 0 1` Move: a1a3 -> `ILLEGAL_MOVE`.
   - FEN: `k7/8/8/8/8/8/8/R3K2R w KQ - 0 1` Move: e1g1 -> `UNSUPPORTED_MOVE_TYPE`.

## 4. Ordering Expectations
- `pins`: sorted by pinned square numeric index.
- `enemyAttackers`: sorted by numeric square index.
- `checkers`: sorted by numeric square index.
- `allowsMateInOne`: sorted by from square index, then to square index.
- `hangingAfterMove`: sorted by target piece numeric square index.

## 5. Cause Attribution Semantics
- First match wins.
- `defender_moved`: The moved piece geometrically attacked the target square in `fenBefore`.
- `line_opened`: An enemy piece geometrically attacks the target square in `fenAfter` but did not in `fenBefore`.
- `other`: Anything else.

## 6. Error Behavior
- Invalid FEN -> `{ ok: false, error: { code: 'INVALID_FEN', ... } }`
- Missing kings / illegal position -> `{ ok: false, error: { code: 'ILLEGAL_POSITION', ... } }`
- Illegal move -> `{ ok: false, error: { code: 'ILLEGAL_MOVE', ... } }`
- Castling move -> `{ ok: false, error: { code: 'UNSUPPORTED_MOVE_TYPE', ... } }`
