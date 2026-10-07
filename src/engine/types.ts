export type EngineErrorCode =
  | 'INVALID_FEN'
  | 'ILLEGAL_POSITION'
  | 'ILLEGAL_MOVE'
  | 'UNSUPPORTED_MOVE_TYPE';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: EngineErrorCode; message: string } };

export type Square =
  | 'a1' | 'b1' | 'c1' | 'd1' | 'e1' | 'f1' | 'g1' | 'h1'
  | 'a2' | 'b2' | 'c2' | 'd2' | 'e2' | 'f2' | 'g2' | 'h2'
  | 'a3' | 'b3' | 'c3' | 'd3' | 'e3' | 'f3' | 'g3' | 'h3'
  | 'a4' | 'b4' | 'c4' | 'd4' | 'e4' | 'f4' | 'g4' | 'h4'
  | 'a5' | 'b5' | 'c5' | 'd5' | 'e5' | 'f5' | 'g5' | 'h5'
  | 'a6' | 'b6' | 'c6' | 'd6' | 'e6' | 'f6' | 'g6' | 'h6'
  | 'a7' | 'b7' | 'c7' | 'd7' | 'e7' | 'f7' | 'g7' | 'h7'
  | 'a8' | 'b8' | 'c8' | 'd8' | 'e8' | 'f8' | 'g8' | 'h8';

export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Color = 'white' | 'black';

export interface PieceOnSquare {
  square: Square;
  role: Role;
  color: Color;
}

export interface LegalMove {
  from: Square;
  to: Square;
  role: Role;
  promotion?: Role;
  isCapture: boolean;
  isEnPassant: boolean;
  isCastling: boolean;
}

export interface CaptureOption {
  capturer: PieceOnSquare;
  captureSquare: Square; // = `to`, or the en passant target square
  isEnPassant: boolean;
  promotion?: Role;
  legalRecaptures: PieceOnSquare[]; // own LEGAL moves onto captureSquare after this capture is played
}

export interface DestinationReport {
  fenBefore: string;
  fenAfter: string;
  mover: { color: Color; role: Role; from: Square; to: Square; promotion?: Role };
  givesCheck: boolean;
  geometricAttackers: PieceOnSquare[]; // opponent pieces with line of sight on `to`, post-move
  geometricDefenders: PieceOnSquare[]; // own pieces with line of sight on `to`, post-move, EXCLUDING the moved piece itself
  legalCaptures: CaptureOption[]; // opponent LEGAL moves that capture the moved piece (incl. en passant)
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: Role;
}

export interface ExchangeStep {
  side: Color;
  capturer: PieceOnSquare;     // capturing piece at its FROM square
  to: Square;                  // landing square
  captured: PieceOnSquare;     // removed piece (for en passant: its actual square)
  promotion?: Role;
  givesCheck: boolean;
  balanceAfter: number;        // running net material for the MOVER, starting from materialFromMove
}

export interface ExchangeReport {
  fenBefore: string;
  fenAfter: string;
  mover: { color: Color; role: Role; from: Square; to: Square; promotion?: Role };
  materialFromMove: number;
  see: number;                 // net material for the MOVER, best play
  bestLine: ExchangeStep[];    // opponent's first capture onward
  captureOptions: {            // EVERY legal opponent first capture
    capturer: PieceOnSquare;
    captureSquare: Square;
    isEnPassant: boolean;
    promotion?: Role;
    resultForMover: number;    // mover's final net material if opponent starts with this capture
  }[];
}

export interface Pin {
  kind: 'absolute' | 'to_queen';
  pinned: PieceOnSquare;
  pinner: PieceOnSquare;
  target: PieceOnSquare;
}

export interface PositionFacts {
  sideToMove: Color;
  inCheck: boolean;
  checkers: PieceOnSquare[];
  pins: Pin[];
  kingZones: {
    white: { king: Square; zone: Square[]; enemyAttackers: PieceOnSquare[] };
    black: { king: Square; zone: Square[]; enemyAttackers: PieceOnSquare[] };
  };
}

export interface TacticalReport {
  fenBefore: string;
  fenAfter: string;
  mover: { color: Color; role: Role; from: Square; to: Square; promotion?: Role };
  givesCheck: boolean;
  deliversMate: boolean;
  causesStalemate: boolean;
  moverPinned: Pin | null;
  allowsMateInOne: { from: Square; to: Square; promotion?: Role }[];
  hangingAfterMove: {
    piece: PieceOnSquare;
    opponentGain: number;
    cause: 'defender_moved' | 'line_opened' | 'other';
  }[];
  exchangeLineMate: { stepIndex: number; matedColor: Color } | null;
}

export type ReasonCode =
  | 'ALLOWS_MATE_IN_ONE'
  | 'EXCHANGE_LINE_MATE'
  | 'CAUSES_STALEMATE'
  | 'EXCHANGE_LINE_MATES_OPPONENT'
  | 'FORCED_CAPTURE_IGNORED'
  | 'PINNED_DEFENDER'
  | 'KING_CANNOT_RECAPTURE'
  | 'DEFENDER_UNAVAILABLE'
  | 'UNDEFENDED_PIECE_LOST'
  | 'BAD_EXCHANGE'
  | 'DEFENDER_MOVED'
  | 'LINE_OPENED'
  | 'PIECE_ALREADY_HANGING'
  | 'EVEN_EXCHANGE'
  | 'OPPONENT_CAPTURE_LOSES'
  | 'ATTACKER_CANNOT_CAPTURE'
  | 'NOT_ATTACKED'
  | 'WINS_MATERIAL'
  | 'DELIVERS_MATE'
  | 'GIVES_CHECK'
  | 'MOVER_PINNED'
  | 'CASTLING_NOT_ANALYZED';

export interface Reason {
  code: ReasonCode;
  squares: Square[];
  moves?: { from: Square; to: Square; promotion?: Role }[];
  amount?: number;
}

export interface MoveClassification {
  move: { from: Square; to: Square; promotion?: Role };
  label: 'safe' | 'even_trade' | 'loses_material' | 'unclear';
  netMaterial: number;
  reasons: Reason[];
  destination: DestinationReport | null;
  exchange: ExchangeReport | null;
  tactics: TacticalReport | null;
}
