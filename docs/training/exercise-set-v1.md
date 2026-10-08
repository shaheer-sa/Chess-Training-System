# Phase 3 — Exercise Set v1 (supervisor-verified)

Generated with the frozen engine (Phase 1E `classifyMove`, tag phase-1e) and reviewed by the supervisor.
Columns: id | difficulty | FEN | move | expected label | netMaterial (centipawns) | engine reasons

- E01 | d1 | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 | g1f3 | safe | 0 | NOT_ATTACKED
- E02 | d1 | 4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1 | d1d5 | safe | 300 | NOT_ATTACKED,WINS_MATERIAL
- E03 | d1 | 4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1 | c3d5 | loses_material | -300 | UNDEFENDED_PIECE_LOST
- E04 | d1 | 4k3/8/2p5/3n4/8/4N3/8/4K3 w - - 0 1 | e3d5 | even_trade | 0 | EVEN_EXCHANGE
- E05 | d1 | 4k3/8/8/3r4/8/2P2N2/8/4K3 w - - 0 1 | f3d4 | safe | 0 | OPPONENT_CAPTURE_LOSES
- E06 | d1 | r3k3/8/8/8/8/2n5/8/4K2R b - - 0 1 | c3d5 | safe | 0 | NOT_ATTACKED
- E07 | d1 | 4k3/8/8/b7/8/8/3P4/4K3 b - - 0 1 | a5c3 | loses_material | -300 | UNDEFENDED_PIECE_LOST
- E08 | d1 | 4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1 | d2d4 | even_trade | 0 | EVEN_EXCHANGE
- E09 | d1 | 4k3/8/8/2b5/8/4P3/1B6/4K3 w - - 0 1 | b2d4 | even_trade | 0 | EVEN_EXCHANGE
- E10 | d1 | 4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1 | b7b8 (queen) | safe | 800 | NOT_ATTACKED,WINS_MATERIAL,GIVES_CHECK
- E11 | d1 | 6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 | a1a8 | safe | 0 | NOT_ATTACKED,DELIVERS_MATE
- E12 | d2 | 7k/8/2p5/8/4P3/8/8/3Q2K1 w - - 0 1 | d1d5 | loses_material | -800 | BAD_EXCHANGE
- E13 | d2 | k7/1b6/4p3/8/5N2/8/8/3R2K1 w - - 0 1 | f4d5 | loses_material | -300 | BAD_EXCHANGE
- E14 | d2 | 4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1 | e5f4 | even_trade | 0 | EVEN_EXCHANGE
- E15 | d2 | 3qk3/8/4n3/8/3P4/8/8/3RK3 b - - 0 1 | e6d4 | safe | 100 | OPPONENT_CAPTURE_LOSES,WINS_MATERIAL,MOVER_PINNED
- E16 | d2 | 6k1/8/1b6/8/3N4/8/8/3R2K1 w - - 0 1 | d1a1 | loses_material | -300 | DEFENDER_MOVED,NOT_ATTACKED
- E17 | d2 | 4r1k1/8/8/8/4B3/8/4N3/6K1 w - - 0 1 | e4c2 | loses_material | -300 | LINE_OPENED,NOT_ATTACKED
- E18 | d2 | 1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 | a1a7 | loses_material | 0 | ALLOWS_MATE_IN_ONE,NOT_ATTACKED
- E19 | d2 | r5k1/5ppp/8/8/8/8/5PPP/1R4K1 b - - 0 1 | a8a2 | loses_material | 0 | ALLOWS_MATE_IN_ONE,NOT_ATTACKED
- E20 | d2 | 7k/5K2/8/8/8/8/8/6Q1 w - - 0 1 | g1g6 | unclear | 0 | CAUSES_STALEMATE,NOT_ATTACKED
- E21 | d2 | 6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1 | e2e4 | even_trade | 0 | EVEN_EXCHANGE
- E22 | d3 | k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1 | e6g5 | loses_material | -300 | PINNED_DEFENDER,PIECE_ALREADY_HANGING
- E23 | d3 | 4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1 | d2d3 | loses_material | -100 | KING_CANNOT_RECAPTURE
- E24 | d3 | 4r1k1/8/8/8/8/8/5N2/4K3 w - - 0 1 | f2e4 | loses_material | -300 | UNDEFENDED_PIECE_LOST,MOVER_PINNED
- E25 | d3 | k6r/8/8/8/7p/2Q5/4N3/7K w - - 0 1 | e2g3 | loses_material | -300 | DEFENDER_UNAVAILABLE
- E26 | d3 | 3r3k/8/5n2/8/8/4N3/3R4/3R2K1 w - - 0 1 | e3d5 | even_trade | 0 | EVEN_EXCHANGE
- E27 | d3 | 7k/8/8/1R6/8/8/2pN3K/8 w - - 0 1 | b5b1 | loses_material | -400 | BAD_EXCHANGE
- E28 | d3 | 4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1 | e5c6 | safe | 0 | ATTACKER_CANNOT_CAPTURE,GIVES_CHECK
- E29 | d3 | 3r2k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1 | e2e8 | unclear | 0 | EXCHANGE_LINE_MATES_OPPONENT,GIVES_CHECK
- E30 | d3 | 7k/7p/6P1/5N2/2Bq4/8/8/1K6 w - - 0 1 | g6g7 | unclear | 0 | FORCED_CAPTURE_IGNORED,GIVES_CHECK

Distribution: safe 8 · even_trade 6 · loses_material 13 · unclear 3. Black to move: E06, E07, E14, E15, E19.
