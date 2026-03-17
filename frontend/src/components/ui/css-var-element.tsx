import { createElement, type ComponentPropsWithoutRef, type ElementType } from "react";

import { withCssVars } from "@/lib/css-vars";

type CssVarValues = Partial<Record<`--${string}`, string | number | null | undefined>>;

type CssVarElementProps<T extends ElementType> = {
  as?: T;
  vars: CssVarValues;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "style">;

export function CssVarElement<T extends ElementType = "div">({
  as,
  vars,
  ...props
}: CssVarElementProps<T>) {
  const Component = (as ?? "div") as ElementType;
  return createElement(Component, {
    ...props,
    style: withCssVars(vars),
  });
}
