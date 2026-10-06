// Tipos de scan.mjs, para o teste em TypeScript (src/lib/security/piiCheck.test.ts).
export interface PiiConfig {
  allowedEmailDomains: string[];
  allowedEmails: Set<string>;
  allowedIps: Set<string>;
  allowedPhones: Set<string>;
  ignoredPaths: string[];
}
export interface Denylist {
  uuids: Set<string>;
  emails: Set<string>;
  tokens: Set<string>;
  digits: Set<string>;
  phrases: string[];
  phraseRe: RegExp | null;
}
export interface Finding {
  kind: string;
  value: string;
}
export interface AddedLine {
  n: number;
  text: string;
}
export function loadConfig(file?: string): PiiConfig;
export function loadHistoryList(file?: string): Set<string>;
export function isIgnoredPath(file: string, config: PiiConfig, history: Set<string>): boolean;
export function normalize(text: string): string;
export function parseDenylist(text: string): Denylist;
export function loadDenylist(file: string | null | undefined): Denylist | null;
export function isFakePhoneDigits(digits: string): boolean;
export function mask(value: string): string;
export function scanLine(line: string, config: PiiConfig, deny?: Denylist | null): Finding[];
export function scanLines(file: string, lines: AddedLine[], config: PiiConfig, deny?: Denylist | null): (Finding & { file: string; line: number })[];
export function parseAddedLines(diff: string): Map<string, AddedLine[]>;
