import type { Granularity } from '../types.js';

const LOREM = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'in',
  'reprehenderit',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'dolore',
  'eu',
  'fugiat',
  'nulla',
  'pariatur',
];
const PUNCT = [',', ';', ':'];

export function buildTokens(length: number, level: Granularity, rng: () => number): string[] {
  return Array.from({ length }, () => randomToken(level, rng));
}

export function tokensToText(tokens: string[], level: Granularity, rng: () => number): string {
  switch (level) {
    case 'char':
      return tokens.join('');
    case 'line':
      return tokens.join('\n');
    case 'word':
      return joinWithNL(tokens, rng, 0.05);
    case 'sentence':
      return joinWithNL(tokens, rng, 0.15);
    case 'json':
      throw new Error('tokensToText not applicable for JSON granularity. Use JSON.stringify.');
  }
}

export function randomToken(level: Granularity, rng: () => number): string {
  switch (level) {
    case 'char':
      return randChar(rng);
    case 'word':
      return randWord(rng);
    case 'sentence':
      return randSentence(rng);
    case 'line':
      return randLine(rng);
    case 'json':
      throw new Error('randomToken not applicable for JSON. Use randomJsonValue.');
  }
}

export function buildInsertMap(
  count: number,
  length: number,
  level: Granularity,
  rng: () => number
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (let i = 0; i < count; i++) {
    const pos = Math.floor(rng() * (length + 1));
    const list = map.get(pos) ?? [];
    list.push(randomToken(level, rng));
    map.set(pos, list);
  }
  return map;
}

function joinWithNL(tokens: string[], rng: () => number, newlineChance: number): string {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    out += tokens[i];
    if (i < tokens.length - 1) out += rng() < newlineChance ? '\n' : ' ';
  }
  return out;
}

function randChar(rng: () => number): string {
  const set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.;:?!';
  return set.charAt(Math.floor(rng() * set.length));
}

function randWord(rng: () => number): string {
  let word = LOREM[Math.floor(rng() * LOREM.length)];
  if (rng() < 0.2) word += PUNCT[Math.floor(rng() * PUNCT.length)];
  return word;
}

function randSentence(rng: () => number): string {
  const len = 4 + Math.floor(rng() * 8);
  const words = Array.from({ length: len }, () => randWord(rng));
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.?!'[Math.floor(rng() * 3)];
}

function randLine(rng: () => number): string {
  const len = 2 + Math.floor(rng() * 6);
  return Array.from({ length: len }, () => randWord(rng)).join(' ');
}
