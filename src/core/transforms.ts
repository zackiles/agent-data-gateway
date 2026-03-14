import type { Finding } from './types.ts';

export function allow(value: unknown): unknown {
  return value;
}

export function drop(): typeof DROP {
  return DROP;
}

export const DROP = Symbol('drop');

export function toNull(): null {
  return null;
}

export function mask(value: unknown, className?: string): unknown {
  if (typeof value === 'number' || typeof value === 'boolean') return null;
  const str = String(value);

  if (className === 'pii.email') return maskEmail(str);
  if (className === 'pii.phone') return maskPhone(str);
  return maskGeneric(str);
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return maskGeneric(email);
  return email[0] + '***' + email.slice(at);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const last4 = digits.slice(-4);
  let result = '';
  let digitIndex = 0;
  const totalDigits = digits.length;
  const maskUpTo = totalDigits - 4;
  for (const ch of phone) {
    if (/\d/.test(ch)) {
      result += digitIndex < maskUpTo ? '*' : last4[digitIndex - maskUpTo]!;
      digitIndex++;
    } else {
      result += ch;
    }
  }
  return result;
}

function maskGeneric(str: string): string {
  if (str.length < 4) return '***';
  return str[0] + '***' + str[str.length - 1];
}

export function maskInline(value: string, findings: Finding[]): string {
  if (findings.length === 0) return value;
  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);

  let result = '';
  let cursor = 0;
  for (const f of sorted) {
    if (f.start < cursor) continue;
    result += value.slice(cursor, f.start) + '***';
    cursor = f.end;
  }
  result += value.slice(cursor);
  return result;
}

export function last4(value: unknown): string {
  const str = String(value);
  const alphanumeric: Array<{ index: number; char: string }> = [];
  for (let i = 0; i < str.length; i++) {
    if (/[a-zA-Z0-9]/.test(str[i]!)) {
      alphanumeric.push({ index: i, char: str[i]! });
    }
  }
  if (alphanumeric.length <= 4) return str;
  const keepFrom = alphanumeric.length - 4;
  const keepIndices = new Set(alphanumeric.slice(keepFrom).map((a) => a.index));

  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (/[a-zA-Z0-9]/.test(str[i]!)) {
      result += keepIndices.has(i) ? str[i] : '*';
    } else {
      result += str[i];
    }
  }
  return result;
}

export function yearOnly(value: unknown): string | null {
  const str = String(value);
  const patterns = [
    /^(\d{4})-\d{2}-\d{2}/,
    /^(\d{4})\/\d{2}\/\d{2}/,
  ];
  for (const p of patterns) {
    const m = str.match(p);
    if (m?.[1]) return m[1];
  }
  const d = new Date(str);
  if (!isNaN(d.getTime()) && str.length >= 8) return String(d.getFullYear());
  return null;
}

export async function hash(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(String(value));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
