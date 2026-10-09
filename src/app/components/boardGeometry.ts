export function squareOffset(from: number, to: number, flipped: boolean): { dx: number; dy: number } {
  const fromFile = from % 8;
  const fromRank = Math.floor(from / 8);
  const toFile = to % 8;
  const toRank = Math.floor(to / 8);

  const dx = flipped ? fromFile - toFile : toFile - fromFile;
  const dy = flipped ? toRank - fromRank : fromRank - toRank;

  return { dx, dy };
}
