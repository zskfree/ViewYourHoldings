export function normalizeStockCode(raw) {
  if (!raw) {
    return "";
  }

  const code = raw.trim().toLowerCase();

  if (code.startsWith("us.")) {
    return `us${code.slice(3).toUpperCase()}`;
  }

  if (code.startsWith("us")) {
    return `us${code.slice(2).toUpperCase()}`;
  }

  if (/^[a-zA-Z]{1,5}$/.test(code)) {
    return `us${code.toUpperCase()}`;
  }

  if (code.startsWith("r_hk")) {
    return code;
  }

  if (code.startsWith("hk")) {
    return `r_${code}`;
  }

  if (/^\d{5}$/.test(code)) {
    return `r_hk${code}`;
  }

  if (code.startsWith("sh") || code.startsWith("sz") || code.startsWith("bj")) {
    return code;
  }

  if (/^(8|4|92)\d{5}$/.test(code) || /^(8|4|92)\d{4}$/.test(code)) {
    return `bj${code}`;
  }

  if (code === "000001" || /^(60|68|11|50|51|56|58|900)\d{4}$/.test(code)) {
    return `sh${code}`;
  }

  if (/^(00|30|12|15|16|200|399)\d{4}$/.test(code)) {
    return `sz${code}`;
  }

  return code;
}
