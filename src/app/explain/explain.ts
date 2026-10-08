import { MoveClassification, ReasonCode } from '../../engine/types.js';
import { Chess, fen as fenOps } from 'chessops';

const PRIORITY_ORDER: ReasonCode[] = [
  'DELIVERS_MATE',
  'ALLOWS_MATE_IN_ONE',
  'EXCHANGE_LINE_MATE',
  'CAUSES_STALEMATE',
  'EXCHANGE_LINE_MATES_OPPONENT',
  'CAPTURE_ALLOWS_MATE',
  'FORCED_CAPTURE_IGNORED',
  'PINNED_DEFENDER',
  'KING_CANNOT_RECAPTURE',
  'DEFENDER_UNAVAILABLE',
  'UNDEFENDED_PIECE_LOST',
  'BAD_EXCHANGE',
  'DEFENDER_MOVED',
  'LINE_OPENED',
  'WINS_MATERIAL',
  'EVEN_EXCHANGE',
  'OPPONENT_CAPTURE_LOSES',
  'ATTACKER_CANNOT_CAPTURE',
  'NOT_ATTACKED',
  'CASTLING_NOT_ANALYZED'
];

const INFORMATIONAL = new Set<ReasonCode>([
  'PIECE_ALREADY_HANGING',
  'GIVES_CHECK',
  'MOVER_PINNED'
]);

const getRole = (fen: string, sq: string): string => {
  if (!fen || !sq) return 'piece';
  const setup = fenOps.parseFen(fen);
  if (!setup.isOk) return 'piece';
  const pos = Chess.fromSetup(setup.unwrap());
  if (!pos.isOk) return 'piece';
  const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = sq.charCodeAt(1) - '1'.charCodeAt(0);
  const index = (rank << 3) | file;
  const piece = pos.unwrap().board.get(index);
  return piece ? piece.role : 'piece';
};

const formatTemplate = (code: ReasonCode, c: MoveClassification): string => {
  const reason = c.reasons.find(r => r.code === code);
  if (!reason) return '';
  const sq = reason.squares?.[0] || '';
  
  // "role of any square mentioned in a reason on the POST-MOVE position"
  const fenAfter = c.exchange?.fenAfter || c.tactics?.fenAfter || c.destination?.fenAfter || '';
  const role = getRole(fenAfter, sq);
  
  const dest = c.move.to;
  const moverRole = getRole(fenAfter, dest);
  
  let n = 0;
  if (reason.amount !== undefined) {
    n = Math.abs(reason.amount) / 100;
  } else if (c.netMaterial !== undefined) {
    n = Math.abs(c.netMaterial) / 100;
  }
  
  const nStr = n === 1 ? '1 pawn' : `${n} pawns`;

  switch(code) {
    case 'DELIVERS_MATE': return "This is checkmate.";
    case 'ALLOWS_MATE_IN_ONE': {
      const move = reason.moves?.[0];
      const from = move?.from || '';
      const to = move?.to || '';
      const oppRole = getRole(fenAfter, from);
      return `After this move your opponent can checkmate you: ${oppRole} ${from}→${to}.`;
    }
    case 'EXCHANGE_LINE_MATE': return "The capture sequence on this square ends with you getting checkmated.";
    case 'CAUSES_STALEMATE': return "This move leaves your opponent no legal moves — the game ends in a draw.";
    case 'EXCHANGE_LINE_MATES_OPPONENT': return "The capture sequence on this square ends with your opponent checkmated — calculate it yourself.";
    case 'CAPTURE_ALLOWS_MATE': {
      const move = reason.moves?.[0];
      const from = move?.from || '';
      const to = move?.to || '';
      const mateRole = getRole(fenAfter, from);
      return `If your opponent takes, you can checkmate them: ${mateRole} ${from}→${to}.`;
    }
    case 'FORCED_CAPTURE_IGNORED': return "Your opponent is forced to capture here — this trainer can't judge the result simply.";
    case 'PINNED_DEFENDER': return `Your ${role} on ${sq} seems to defend this square, but it's pinned to your king, so it can't take back.`;
    case 'KING_CANNOT_RECAPTURE': return "Your king defends this square, but it can't take back because the square is still attacked.";
    case 'DEFENDER_UNAVAILABLE': return `Your ${role} on ${sq} can't legally take back here.`;
    case 'UNDEFENDED_PIECE_LOST': return `Nothing protects your ${moverRole} on ${dest} — it can be taken for free.`;
    case 'BAD_EXCHANGE': return `You can take back, but you still end up ${nStr} down.`;
    case 'DEFENDER_MOVED': return `This piece was protecting your ${role} on ${sq} — now it can be taken.`;
    case 'LINE_OPENED': return `Moving this piece opens a line: your ${role} on ${sq} can now be taken.`;
    case 'WINS_MATERIAL': return `You win material here (+${nStr}).`;
    case 'EVEN_EXCHANGE': return "Your opponent can take, and you take back the same value.";
    case 'OPPONENT_CAPTURE_LOSES': return "Your opponent can take, but they would lose material doing it.";
    case 'ATTACKER_CANNOT_CAPTURE': return `The ${role} on ${sq} attacks this square but can't legally take right now.`;
    case 'NOT_ATTACKED': return "Nothing attacks this square.";
    case 'CASTLING_NOT_ANALYZED': return "Castling isn't analyzed by this trainer yet.";
    case 'PIECE_ALREADY_HANGING': return `Note: your ${role} on ${sq} was already in danger before this move.`;
    case 'GIVES_CHECK': return "This move gives check.";
    case 'MOVER_PINNED': return `Careful: on this square your piece is pinned by the ${role} on ${sq}.`;
  }
  return '';
};

export function explain(c: MoveClassification): { primary: string; details: string[]; notes: string[] } {
  let primaryCode: ReasonCode | null = null;
  
  const reasons = c.reasons || [];
  
  for (const code of PRIORITY_ORDER) {
    if (reasons.some(r => r.code === code)) {
      primaryCode = code;
      break;
    }
  }

  const primary = primaryCode ? formatTemplate(primaryCode, c) : '';
  const details: string[] = [];
  const notes: string[] = [];

  for (const code of PRIORITY_ORDER) {
    if (code !== primaryCode && reasons.some(r => r.code === code)) {
      details.push(formatTemplate(code, c));
    }
  }

  for (const reason of reasons) {
    if (INFORMATIONAL.has(reason.code)) {
      notes.push(formatTemplate(reason.code, c));
    }
  }

  return { primary, details, notes };
}
