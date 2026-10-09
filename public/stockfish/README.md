# Stockfish (vendored)

- Build: Stockfish 19 Lite WASM, single-threaded (`stockfish-19-lite-single.js` + `.wasm`)
- Source: npm package `stockfish@19.0.0` (stockfish.js by Nathan Rugg, https://github.com/nmrugg/stockfish.js), based on Stockfish (https://github.com/official-stockfish/Stockfish)
- License: GPL-3.0 (see COPYING.txt). ROOKVEX is GPL-3.0-or-later, so this is compatible.
- Runs as a Web Worker; no cross-origin-isolation headers needed. Supervisor-owned: do not edit (protected path).
