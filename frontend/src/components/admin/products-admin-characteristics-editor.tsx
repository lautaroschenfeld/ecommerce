"use client";

import { Plus, X } from "lucide-react";

import {
  createExtraProductCharacteristic,
  MAX_EXTRA_CHARACTERISTICS,
  METRIC_UNIT_OPTIONS,
  normalizeExtraCharacteristicKey,
  PRODUCT_CHARACTERISTIC_SECTIONS,
  type ProductCharacteristicItem,
  type ProductCharacteristicValueType,
} from "@/lib/product-characteristics";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import styles from "./products-admin.module.css";

type ProductCharacteristicsEditorProps = {
  items: ProductCharacteristicItem[];
  busy: boolean;
  onChange: (next: ProductCharacteristicItem[]) => void;
};

export function ProductCharacteristicsEditor({
  items,
  busy,
  onChange,
}: ProductCharacteristicsEditorProps) {
  const sections = PRODUCT_CHARACTERISTIC_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0 || section.key === "others");
  const extras = items.filter((item) => item.isExtra);
  const canAddExtra = extras.length < MAX_EXTRA_CHARACTERISTICS;
  const metricUnitsDatalistId = "product-characteristics-units";

  const updateItem = (id: string, patch: Partial<ProductCharacteristicItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeExtra = (id: string) => {
    onChange(items.filter((item) => !(item.isExtra && item.id === id)));
  };

  const addExtra = () => {
    if (!canAddExtra) return;
    onChange([...items, createExtraProductCharacteristic(extras.length + 1)]);
  };

  return (
    <div className={styles.characteristicsEditor}>
      <div className={styles.characteristicsEditorTop}>
        <p className={styles.characteristicsEditorHint}>
          Plantilla por categoría + atributos libres en la sección Otros.
        </p>
        <p className={styles.characteristicsEditorHint}>
          Extras: {extras.length}/{MAX_EXTRA_CHARACTERISTICS}
        </p>
      </div>

      <datalist id={metricUnitsDatalistId}>
        {METRIC_UNIT_OPTIONS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <div className={styles.characteristicsSections}>
        {sections.map((section) => (
          <section key={section.key} className={styles.characteristicsSection}>
            <div className={styles.characteristicsSectionHeader}>
              <p className={styles.characteristicsSectionTitle}>{section.label}</p>
              {section.key === "others" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addExtra}
                  disabled={busy || !canAddExtra}
                >
                  <Plus size={14} />
                  Agregar atributo
                </Button>
              ) : null}
            </div>
            {section.key === "compatibility" ? (
              <p className={styles.characteristicsSectionHint}>
                Completa modelos, años y OEM para reducir devoluciones y aumentar confianza.
              </p>
            ) : null}

            <div className={styles.characteristicsTable}>
              {section.items.map((item, index) => {
                const extraIndex = Math.max(1, index + 1);
                const valueAsText =
                  item.value === null || item.value === undefined ? "" : String(item.value);
                const typeValue = item.type as ProductCharacteristicValueType;

                return (
                  <div key={item.id} className={styles.characteristicsRow}>
                    <div className={styles.characteristicsLabelCell}>
                      {item.isExtra ? (
                        <Input
                          value={item.label}
                          onChange={(e) => {
                            const nextLabel = e.target.value;
                            updateItem(item.id, {
                              label: nextLabel,
                              key: normalizeExtraCharacteristicKey(nextLabel, extraIndex),
                            });
                          }}
                          placeholder="Nombre del atributo"
                          disabled={busy}
                        />
                      ) : (
                        <span className={styles.characteristicsLabelText}>{item.label}</span>
                      )}
                    </div>

                    <div className={styles.characteristicsValueCell}>
                      {typeValue === "boolean" ? (
                        <Select
                          value={item.value === true ? "true" : "false"}
                          onChange={(e) => updateItem(item.id, { value: e.target.value === "true" })}
                          disabled={busy}
                        >
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </Select>
                      ) : typeValue === "long_text" ? (
                        <Textarea
                          value={valueAsText}
                          onChange={(e) => updateItem(item.id, { value: e.target.value })}
                          className={styles.characteristicsTextarea}
                          disabled={busy}
                        />
                      ) : typeValue === "number" ? (
                        <div className={styles.characteristicsNumberRow}>
                          <Input
                            inputMode="decimal"
                            value={valueAsText}
                            onChange={(e) =>
                              updateItem(item.id, { value: e.target.value.replace(",", ".") })
                            }
                            placeholder="Valor"
                            disabled={busy}
                          />
                          <Input
                            value={item.unit ?? ""}
                            onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                            list={metricUnitsDatalistId}
                            placeholder="Unidad"
                            disabled={busy}
                          />
                        </div>
                      ) : (
                        <Input
                          value={valueAsText}
                          onChange={(e) => updateItem(item.id, { value: e.target.value })}
                          placeholder="Valor"
                          disabled={busy}
                        />
                      )}
                    </div>

                    <div className={styles.characteristicsActionCell}>
                      {item.isExtra ? (
                        <>
                          <Select
                            value={typeValue}
                            onChange={(e) => {
                              const nextType = e.target.value as ProductCharacteristicValueType;
                              updateItem(item.id, {
                                type: nextType,
                                value:
                                  nextType === "boolean"
                                    ? false
                                    : nextType === "number"
                                      ? null
                                      : "",
                                unit: nextType === "number" ? item.unit : undefined,
                              });
                            }}
                            disabled={busy}
                          >
                            <option value="text">Texto corto</option>
                            <option value="long_text">Texto largo</option>
                            <option value="number">Número</option>
                            <option value="boolean">Sí/No</option>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeExtra(item.id)}
                            disabled={busy}
                          >
                            <X size={14} />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

