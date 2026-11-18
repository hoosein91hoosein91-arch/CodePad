export type MachineSnap = {
  a: number;
  bits: string;
  pc: number;
  steps: number;
  gloss: string;
};

export type BinaryResult = { ok: true; lines: string[]; snap: MachineSnap } | { ok: false; error: string };

type Op = { code: string; n: number; line: number };

const NAME: Record<string, string> = {
  "0001": "load",
  "0010": "add",
  "0011": "sub",
  "0101": "print",
  "0110": "skip if equal",
  "0111": "skip if smaller",
  "1000": "jump",
  "1001": "read",
  "1010": "and",
  "1111": "halt",
};

export const BINARY_BAR: { label: string; insert: string }[] = [
  { label: "0", insert: "0" },
  { label: "1", insert: "1" },
  { label: "read", insert: "1001 0000\n" },
  { label: "add", insert: "0010 0001\n" },
  { label: "print", insert: "0101 0000\n" },
  { label: "jump", insert: "1000 0000\n" },
  { label: "skip", insert: "0110 0000\n" },
  { label: "halt", insert: "1111 0000\n" },
];

export function bitsOf(value: number): string {
  return (value & 255).toString(2).padStart(8, "0");
}

function parseProgram(source: string): Op[] {
  const ops: Op[] = [];
  const rows = source.split("\n");
  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index] ?? "";
    const cut = raw.split("#")[0] ?? "";
    const bits = cut.replace(/\s+/g, "");
    if (!bits) continue;
    if (!/^[01]{8}$/.test(bits)) {
      throw new Error(`line ${index + 1}: each order must be 8 bits of 0 and 1`);
    }
    ops.push({ code: bits.slice(0, 4), n: Number.parseInt(bits.slice(4), 2), line: index + 1 });
  }
  if (!ops.length) throw new Error("There is no 0/1 program");
  return ops;
}

function readNumber(stdin: string): number {
  const raw = stdin.trim().replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  if (!raw) return 0;
  if (/^[01]+$/.test(raw) && raw.length > 1) return Number.parseInt(raw, 2) & 255;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("ورودی باید عدد یا بیت باشد");
  return Math.trunc(value) & 255;
}

export function runBinary(source: string, stdin: string): BinaryResult {
  try {
    const ops = parseProgram(source);
    const input = readNumber(stdin);
    let a = 0;
    let pc = 0;
    let steps = 0;
    let gloss = "ready";
    const lines: string[] = [];
    while (pc < ops.length) {
      if (steps > 300) return { ok: false, error: "The loop did not stop. More than 300 steps." };
      const op = ops[pc];
      if (!op) break;
      gloss = `${NAME[op.code] ?? "unknown"} ${op.n}`;
      steps += 1;
      if (op.code === "0001") {
        a = op.n;
        pc += 1;
      } else if (op.code === "0010") {
        a = (a + op.n) & 255;
        pc += 1;
      } else if (op.code === "0011") {
        a = (a - op.n) & 255;
        pc += 1;
      } else if (op.code === "0101") {
        lines.push(`${a} = ${bitsOf(a)}`);
        pc += 1;
      } else if (op.code === "0110") {
        pc += a === op.n ? 2 : 1;
      } else if (op.code === "0111") {
        pc += a < op.n ? 2 : 1;
      } else if (op.code === "1000") {
        if (op.n >= ops.length) return { ok: false, error: `line ${op.line}: jump to order ${op.n} is outside the program` };
        pc = op.n;
      } else if (op.code === "1001") {
        a = input;
        pc += 1;
      } else if (op.code === "1010") {
        a = a & op.n;
        pc += 1;
      } else if (op.code === "1111") {
        gloss = "halt";
        pc = ops.length;
      } else {
        return { ok: false, error: `line ${op.line}: order ${op.code} is not in the machine` };
      }
    }
    return { ok: true, lines, snap: { a, bits: bitsOf(a), pc, steps, gloss } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ماشین خطا داد" };
  }
}
