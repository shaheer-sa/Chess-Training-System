import { Square } from '../../engine/types.js';

export interface Exercise {
  id: string;
  difficulty: number;
  fen: string;
  from: Square;
  to: Square;
  promotion?: string;
}

export const EXERCISES: Exercise[] = [
  { id: 'E01', difficulty: 1, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', from: 'g1', to: 'f3' },
  { id: 'E02', difficulty: 1, fen: '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', from: 'd1', to: 'd5' },
  { id: 'E03', difficulty: 1, fen: '4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1', from: 'c3', to: 'd5' },
  { id: 'E04', difficulty: 1, fen: '4k3/8/2p5/3n4/8/4N3/8/4K3 w - - 0 1', from: 'e3', to: 'd5' },
  { id: 'E05', difficulty: 1, fen: '4k3/8/8/3r4/8/2P2N2/8/4K3 w - - 0 1', from: 'f3', to: 'd4' },
  { id: 'E06', difficulty: 1, fen: 'r3k3/8/8/8/8/2n5/8/4K2R b - - 0 1', from: 'c3', to: 'd5' },
  { id: 'E07', difficulty: 1, fen: '4k3/8/8/b7/8/8/3P4/4K3 b - - 0 1', from: 'a5', to: 'c3' },
  { id: 'E08', difficulty: 1, fen: '4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1', from: 'd2', to: 'd4' },
  { id: 'E09', difficulty: 1, fen: '4k3/8/8/2b5/8/4P3/1B6/4K3 w - - 0 1', from: 'b2', to: 'd4' },
  { id: 'E10', difficulty: 1, fen: '4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1', from: 'b7', to: 'b8', promotion: 'queen' },
  { id: 'E11', difficulty: 1, fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', from: 'a1', to: 'a8' },
  { id: 'E12', difficulty: 2, fen: '7k/8/2p5/8/4P3/8/8/3Q2K1 w - - 0 1', from: 'd1', to: 'd5' },
  { id: 'E13', difficulty: 2, fen: 'k7/1b6/4p3/8/5N2/8/8/3R2K1 w - - 0 1', from: 'f4', to: 'd5' },
  { id: 'E14', difficulty: 2, fen: '4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1', from: 'e5', to: 'f4' },
  { id: 'E15', difficulty: 2, fen: '3qk3/8/4n3/8/3P4/8/8/3RK3 b - - 0 1', from: 'e6', to: 'd4' },
  { id: 'E16', difficulty: 2, fen: '6k1/8/1b6/8/3N4/8/8/3R2K1 w - - 0 1', from: 'd1', to: 'a1' },
  { id: 'E17', difficulty: 2, fen: '4r1k1/8/8/8/4B3/8/4N3/6K1 w - - 0 1', from: 'e4', to: 'c2' },
  { id: 'E18', difficulty: 2, fen: '1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', from: 'a1', to: 'a7' },
  { id: 'E19', difficulty: 2, fen: 'r5k1/5ppp/8/8/8/8/5PPP/1R4K1 b - - 0 1', from: 'a8', to: 'a2' },
  { id: 'E20', difficulty: 2, fen: '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1', from: 'g1', to: 'g6' },
  { id: 'E21', difficulty: 2, fen: '6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E22', difficulty: 3, fen: 'k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', from: 'e6', to: 'g5' },
  { id: 'E23', difficulty: 3, fen: '4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1', from: 'd2', to: 'd3' },
  { id: 'E24', difficulty: 3, fen: '4r1k1/8/8/8/8/8/5N2/4K3 w - - 0 1', from: 'f2', to: 'e4' },
  { id: 'E25', difficulty: 3, fen: 'k6r/8/8/8/7p/2Q5/4N3/7K w - - 0 1', from: 'e2', to: 'g3' },
  { id: 'E26', difficulty: 3, fen: '3r3k/8/5n2/8/8/4N3/3R4/3R2K1 w - - 0 1', from: 'e3', to: 'd5' },
  { id: 'E27', difficulty: 3, fen: '7k/8/8/1R6/8/8/2pN3K/8 w - - 0 1', from: 'b5', to: 'b1' },
  { id: 'E28', difficulty: 3, fen: '4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1', from: 'e5', to: 'c6' },
  { id: 'E29', difficulty: 3, fen: '3r2k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1', from: 'e2', to: 'e8' },
  { id: 'E30', difficulty: 3, fen: '7k/7p/6P1/5N2/2Bq4/8/8/1K6 w - - 0 1', from: 'g6', to: 'g7' },
];
