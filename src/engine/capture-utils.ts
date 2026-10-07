/**
 * Internal helper to determine the actual square where a piece is captured.
 * 
 * - Normal non-capture: returns null
 * - Normal capture: returns the destination square
 * - En passant capture: returns the square of the pawn actually removed
 * 
 * @param move Object containing 'from' and 'to' algebraic squares
 * @param isCapture True if the move is a capture
 * @param isEnPassant True if the move is an en passant capture
 * @returns The algebraic square of the captured piece, or null if not a capture
 */
export function getActualCapturedSquare(
  move: { from: string; to: string },
  isCapture: boolean,
  isEnPassant: boolean
): string | null {
  if (!isCapture) {
    return null;
  }
  if (!isEnPassant) {
    return move.to;
  }
  // For en passant, the captured pawn is on the same file as `to`,
  // but on the same rank as `from`.
  const capFile = move.to[0];
  const capRank = move.from[1];
  return capFile + capRank;
}
