# Phase 2A — UX Definition (Interactive Board MVP)

Status: DRAFT for owner review → once approved, commit to `docs/ux/phase-2a-ux-definition.md`
Governs: Phase 2B (board + Analysis), Phase 2C (explanations), Phase 3 (Training)
Depends on: ADR 002 (positional boundary), ADR 003 (vocabulary), frozen engine 1A–1E

This document defines WHAT the interface must do and WHY. It is not a visual mockup.
No board code may be written before this document is approved.

---

## 1. Users (proto-personas — assumptions to validate in MVP testing)

| Persona | Who | Device | Key behavior | Design consequence ("so what") |
|---|---|---|---|---|
| **P1 Novice** | Knows how pieces move, ~600–1000 online rating, regularly loses pieces to simple captures | Phone, short sessions | Thinks "defended = safe"; easily overwhelmed by detail | One-sentence primary explanation; detail hidden behind "Show why"; big touch targets |
| **P2 Improver** | ~1000–1600, understands basic tactics, miscounts exchanges | Laptop/desktop, sometimes phone | Wants to see attackers, defenders and the exact sequence | Exchange sequence step-through; keyboard support; faster flow |
| **P3 Returning trainer** | Either of the above, using it daily | Phone | Wants to start training in one tap | Home screen = two big actions; no repeated onboarding |
| **E Edge users** | Color-blind, low vision, keyboard-only, bright sunlight, slow network | Any | — | Icon + text with every color; full keyboard path; works offline after load (engine runs in browser) |

Assumptions to verify in MVP testing: P1 understands the four labels without a tutorial; P2 uses the
exchange step-through; nobody reads the board colors as "best move".

---

## 2. Core tasks

| ID | Goal | Task flow | Likely errors | Frequency |
|---|---|---|---|---|
| **A1** | "What happens if I move here?" | Open position → tap piece → see labelled destinations → tap a destination → read result → optionally expand detail | Tapping wrong piece/square (slip); reading color as "good move" (mistake) | Very high |
| **A2** | Understand WHY | From A1 result → "Show why" → attackers/defenders highlighted → step through exchange | Losing track of which piece is which | High |
| **A3** | Load my own position | Paste FEN or pick a sample position | Invalid FEN | Medium |
| **T1** | Predict, then learn | Exercise shows a move → choose a label (or "Not sure") → optional confidence → Submit → see verdict + explanation → Next/Retry | Mis-tap on an answer (slip); answering by habit | Very high |
| **T2** | Recover from a slip | Change the answer before Submit | Submitting too fast | Medium |
| **M1** | Know which mode I am in | Always visible | Thinking answers are hidden when they are not (or vice versa) | Constant |

---

## 3. Conceptual model the UI must teach

The interface must move the user toward these distinctions (HCI §12):

- A **legal** move is not automatically a **safe** move.
- **Attacked** does not automatically mean **bad**.
- **Defended** does not automatically mean **safe**.
- **Can recapture** does not automatically mean **good exchange**.
- **Safe** never means **best move**.

The UI always presents the result in the same thinking order:
**Who attacks → Who defends → Can they really recapture → What happens → Result.**

### Labels (from ADR 003 — user-facing wording)

| Label | Icon | One-line meaning shown in the help sheet |
|---|---|---|
| **Safe** | ✓ | "No immediate material or tactical problem was found. It does not mean this is the best move." |
| **Even trade** | ⇄ | "Your piece can be taken, but you win back the same value." |
| **Loses material** | ⚠ | "This move loses material or allows a tactic against you right away." |
| **Unclear** | ? | "This needs deeper calculation than this trainer does — check it yourself." |

A permanent "What do the labels mean?" link is available on both screens.

---

## 4. Information architecture (MVP only)

```
Home
 ├── Train      (Phase 3)
 ├── Analyze    (Phase 2B)
 └── Help: What the labels mean
```

Not in MVP: accounts, profile, play vs bot, game import, progress dashboard.
Every screen header shows: product name · screen name · back/home control.

---

## 5. Shared board component

### 5.1 Behavior
- Board orientation: side to move at the bottom; a "Flip" control is available.
- Coordinates (a–h, 1–8) always visible, readable at phone size.
- **Select piece**: tap/click a piece of the side to move. A neutral **outline ring** marks it.
- **Legal destinations**: a neutral dot (empty square) or neutral corner ring (capture).
- Tapping the selected piece again, or pressing Esc, cancels selection.
- Tapping another own piece switches selection.
- Tapping a non-legal square: nothing moves; a short message near the board says
  "That square isn't a legal move for this piece."
- The board never plays a move on its own.

### 5.2 Visual channels (must not collide)
| Meaning | Channel |
|---|---|
| Selection | neutral outline ring |
| Legal destination | neutral dot / corner ring |
| Last move (if shown) | neutral light tint |
| Check | ring around king + text "Check" |
| **Classification (Analysis only)** | colored **badge with icon** in the square corner; the badge has its own solid background so it is readable on light and dark squares |
| Attackers / defenders (when expanded) | numbered markers + legend list beside the board |

Classification colors are reserved for classification only. No other element uses
green / blue / red / yellow.

### 5.3 Keyboard
- Board is one focusable grid. Arrow keys move focus square by square.
- Enter/Space = select piece / choose destination. Esc = cancel.
- Visible focus ring (≥ 3:1 contrast against both square colors).
- Tab leaves the board to the result panel.

### 5.4 Screen reader labels (aria)
- Square: "e4, white knight" / "d5, empty, legal destination".
- **Training mode: square labels never include classification words.** (Prevents answer leakage.)
- Results announced through a polite live region: "Result: Loses material. Your knight can be captured by the pawn on h6…"

---

## 6. Analysis screen (Phase 2B/2C)

### 6.1 Layout
- **Mobile (< 768 px):** mode bar → board (full width) → result panel below the board.
  The result panel never covers the board. Primary text stays within one screen height;
  detail opens as an expandable section below, the board stays visible (sticky) when scrolling.
- **Desktop (≥ 1024 px):** board left, result panel right, same content order.
- Tablet: mobile layout with larger board.

### 6.2 Mode bar (always visible)
`ANALYSIS · Results are shown immediately` — text label + icon, full width, distinct from Training's bar.

### 6.3 Flow and states
| State | What the user sees |
|---|---|
| **No position loaded** | Sample positions list + "Paste FEN" field |
| **Idle** | Board + instruction near the board: "Tap one of your pieces to check where it can go." |
| **Piece selected** | Every legal destination shows its classification badge (✓ ⇄ ⚠ ?). Instruction: "Tap a square to see why." |
| **Piece with no legal moves** | Message near board: "This piece has no legal moves." |
| **Analyzing** (only if > 150 ms) | Small "Checking moves…" indicator near the board; board stays interactive for cancel |
| **Destination selected** | Result panel Level 1 (see 6.4); the chosen square is outlined |
| **Engine error** | "We couldn't analyze this move. Try another square." — selection kept |
| **Invalid FEN** | Inline under the field: "This position isn't valid. Check the FEN." — field keeps the text |

### 6.4 Progressive disclosure (result panel)
- **Level 1 (always):** label + icon + ONE plain sentence (generated, see §8).
  Example: "⚠ Loses material — Your knight can be taken by the pawn on h6, and your rook can't take back because it is pinned."
- **Level 2 ("Show why"):** attackers and defenders as a list; matching numbered markers on the board.
  Unavailable defenders are listed with the reason ("pinned", "king can't recapture").
- **Level 3 ("Show the exchange"):** step-through of the exchange line with Prev/Next;
  the board shows each step; the running material balance is shown in pawns (e.g. "−3").
- **Level 4 ("Advanced", collapsed):** net material in pawns, reason codes, other informational
  reasons (piece already hanging, gives check, piece pinned on arrival).

Material is always displayed in **pawn units** to users (−3, +1), never centipawns.

---

## 7. Training screen (Phase 3 — defined now for mode clarity)

### 7.1 Exercise format (MVP)
The exercise **shows the candidate move** (arrow from piece to destination) and asks:
"White plays the knight to g5. What happens?"
Reason: the MVP tests prediction of consequences, not move search; fixed moves also remove
selection slips. A "choose your own move" mode can come later.

### 7.2 Mode bar
`TRAINING · Exercise 3 of 10 · Answer hidden until you submit` — different icon and background
treatment from Analysis. Never a small icon only.

### 7.3 Flow and states
1. **Prompt:** board + arrow + question. No badges anywhere on the board.
2. **Choosing:** five buttons in one group — Safe ✓ · Even trade ⇄ · Loses material ⚠ · Unclear ? ·
   (separated) Not sure. Selecting highlights the button; it can be changed freely.
3. **Confidence (optional):** Low / Medium / High, shown after an answer is chosen; skippable.
4. **Submit:** disabled until an answer is chosen; disabled again after submitting (no double submit).
5. **Reveal:** "Correct" / "Not quite" + the real label + Level 1 explanation; Levels 2–3 available.
   "Not sure" reveals the answer and is marked "Not graded".
6. **Next exercise** (large, primary) and **Try again** (secondary). Exit is in the header,
   far from Next.
7. **Session complete:** score summary + "Train again".

### 7.4 Answer-leak prevention (P0)
- No classification badge, color, aria text, or tooltip before Submit.
- Analysis for the exercise is computed before the exercise is shown, so response time
  cannot hint at difficulty.
- The DOM contains no label class/attribute for the answer before Submit.

### 7.5 Slips vs mistakes
- An answer can be changed until Submit → mis-taps are not recorded as mistakes.
- Only submitted answers are recorded. "Not sure" is recorded separately, not as wrong.

---

## 8. Explanation text (generated from engine data only)

Explanations are templates filled with engine facts. No freehand text, no LLM in the MVP.
The primary sentence uses the FIRST reason in the engine's reason order.

| Reason code | Primary sentence template (novice level) |
|---|---|
| ALLOWS_MATE_IN_ONE | "After this move your opponent can checkmate you with {move}." |
| EXCHANGE_LINE_MATE | "The capture sequence on this square ends with you getting checkmated." |
| CAUSES_STALEMATE | "This move leaves your opponent no legal moves — the game ends in a draw." |
| EXCHANGE_LINE_MATES_OPPONENT | "The capture sequence on this square ends with your opponent checkmated — calculate it yourself." |
| FORCED_CAPTURE_IGNORED | "Your opponent is forced to capture here — this trainer can't judge the result simply." |
| PINNED_DEFENDER | "Your {piece} on {sq} seems to defend this square, but it's pinned to your king, so it can't take back." |
| KING_CANNOT_RECAPTURE | "Your king defends this square, but it can't take back because the square is still attacked." |
| DEFENDER_UNAVAILABLE | "Your {piece} on {sq} can't legally take back here." |
| UNDEFENDED_PIECE_LOST | "Nothing protects your {piece} on {dest} — it can be taken for free." |
| BAD_EXCHANGE | "You can take back, but you still end up {abs(net)} pawn(s) down." |
| DEFENDER_MOVED | "This piece was protecting your {piece} on {sq} — now it can be taken." |
| LINE_OPENED | "Moving this piece opens a line: your {piece} on {sq} can now be taken." |
| EVEN_EXCHANGE | "Your opponent can take, and you take back the same value." |
| OPPONENT_CAPTURE_LOSES | "Your opponent can take, but they would lose material doing it." |
| ATTACKER_CANNOT_CAPTURE | "The {piece} on {sq} attacks this square but can't legally take right now." |
| NOT_ATTACKED | "Nothing attacks this square." |
| WINS_MATERIAL | "You win material here (+{amount} pawns)." |
| DELIVERS_MATE | "This is checkmate." |
| CASTLING_NOT_ANALYZED | "Castling isn't analyzed by this trainer yet." |

Secondary informational reasons (shown at Level 2/4): PIECE_ALREADY_HANGING —
"Note: your {piece} on {sq} was already unprotected before this move."; GIVES_CHECK —
"This move gives check."; MOVER_PINNED — "Careful: on this square your piece is pinned by the {pinner}."

Every template must be covered by a test that fills it from a real engine result.

---

## 9. Accessibility requirements (P0)

- Color never alone: every classification = color + icon + text label.
- Contrast: text ≥ 4.5:1; large text and UI components ≥ 3:1 — including badges on BOTH square colors.
- Touch targets ≥ 44 × 44 px (board squares on a 360 px phone ≈ 45 px — the board must use full width).
- Full keyboard path for Analysis and Training (§5.3).
- Screen reader labels (§5.4) and live region for results.
- Respects "reduced motion" (no animated exchange playback unless the user steps).
- Automated accessibility check (axe) on every screen in CI; manual keyboard walk-through in review.

---

## 10. Performance

- Engine runs in a **Web Worker** so the UI never freezes.
- On piece selection: `classifyMovesFrom` once; results cached for that position.
- Show the "Checking moves…" indicator only if the result takes longer than 150 ms.
- Target: piece selection → all badges visible in < 300 ms on a mid-range phone for typical positions.

---

## 11. Technical decisions (proposed, owner approval requested)

| Decision | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript | Same language as the engine; widely known; fast builds |
| Board | **Custom board component** (HTML grid + SVG pieces), not chessground | Full control over accessibility, badges, answer-leak prevention; an 8×8 grid is small to build |
| Pieces | An open-licensed SVG set compatible with GPL-3 (license verified and recorded in Phase 2B) | License safety |
| Structure | `src/engine/` stays pure; app in `src/app/`; lint rule: engine may never import app | Keeps the frozen engine independent |
| State | React state / reducer; no global state library | Small app |
| Tests | Vitest + React Testing Library + axe | Component behavior + accessibility |

---

## 12. Phase plan after approval

| Phase | Content |
|---|---|
| **2B** | Board component + Analysis screen with badges, Level 1 result, all states in §6.3, keyboard + aria, Web Worker |
| **2C** | Explanation templates (§8) + Levels 2–4 + exchange step-through |
| **3** | Training mode (§7) + 20–50 curated exercises (expected labels computed by the engine and verified by the supervisor) |
| **MVP test** | Real players; measure label understanding, answer accuracy, return usage |

---

## 13. Usability-test questions for the MVP (recorded now)

- Without help, what does each label mean to you? (Check: does anyone read ✓ as "best move"?)
- Can you find out WHY a square is ⚠ without being told how?
- In Training, did you ever think the answer was already visible?
- On a phone, did you mis-tap squares or answer buttons?
- Would you use this again tomorrow? What would make you return?
