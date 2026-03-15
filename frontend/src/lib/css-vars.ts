import type { CSSProperties } from "react";

type CssVarName = `--${string}`;
type CssVarValue = string | number;

export function withCssVar(name: CssVarName, value: CssVarValue): CSSProperties {
  return { [name]: String(value) } as CSSProperties;
}

export function withPercentCssVar(name: CssVarName, value: number): CSSProperties {
  return withCssVar(name, `${value}%`);
}

export function withColorCssVar(name: CssVarName, value: string): CSSProperties {
  return withCssVar(name, value);
}

export function withChCssVar(name: CssVarName, value: number): CSSProperties {
  return withCssVar(name, `${value}ch`);
}

export function withCssVars(
  values: Partial<Record<CssVarName, CssVarValue | null | undefined>>
): CSSProperties {
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    style[name] = String(value);
  }
  return style as CSSProperties;
}
