export type ColorTokens = Record<string, string>;

export interface ContrastPairing {
  fg: string;
  bg: string;
  min: number;
  label: string;
}

export interface ContrastResult extends ContrastPairing {
  ratio: number;
  pass: boolean;
}

export function parseColorTokens(css: string): ColorTokens;
export function toRgb(hex: string): [number, number, number];
export function relativeLuminance(hex: string): number;
export function contrast(a: string, b: string): number;
export const pairings: ContrastPairing[];
export function evaluateContrast(
  tokens: ColorTokens,
  checks?: ContrastPairing[],
): ContrastResult[];
