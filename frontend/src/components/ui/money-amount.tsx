import { type MoneyFormatOptions, formatMoneyToParts } from "@/lib/format";
import { cn } from "@/lib/utils";

import styles from "./money-amount.module.css";

type MoneyAmountProps = {
  value: number;
  options?: MoneyFormatOptions;
  className?: string;
  currencyClassName?: string;
};

export function MoneyAmount({
  value,
  options,
  className,
  currencyClassName,
}: MoneyAmountProps) {
  const parts = formatMoneyToParts(value, options);

  return (
    <span className={cn(styles.amount, className)}>
      {parts.map((part, idx) => (
        <span
          key={`${part.type}-${idx}`}
          className={part.type === "currency" ? cn(styles.currency, currencyClassName) : undefined}
        >
          {part.value}
        </span>
      ))}
    </span>
  );
}
