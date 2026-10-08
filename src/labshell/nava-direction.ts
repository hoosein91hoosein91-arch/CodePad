/** Compact commands read left to right; Persian commands read right to left. */
export function navaCodeDirection(source: string): "ltr" | "rtl" {
  const line = source.split(/\r?\n/).map((row) => row.trim()).find((row) => row && !row.startsWith("#") && !row.startsWith("//"));
  return line && /^[a-z]/i.test(line) ? "ltr" : "rtl";
}
