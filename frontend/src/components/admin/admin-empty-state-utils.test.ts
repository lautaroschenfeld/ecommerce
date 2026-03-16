import { describe, expect, it } from "vitest";

import {
  ADMIN_PRODUCTS_EMPTY_STATE_MESSAGES,
  createAdminEntityEmptyStateMessages,
  resolveAdminEmptyStateMessage,
} from "./admin-empty-state-utils";

describe("createAdminEntityEmptyStateMessages", () => {
  it("builds consistent defaults for admin collections", () => {
    expect(
      createAdminEntityEmptyStateMessages({
        entityLabelPlural: "clientes",
      })
    ).toEqual({
      emptyMessage: "Todavia no hay clientes.",
      filteredMessage: "No se encontraron clientes con los filtros aplicados.",
      unknownFilteredMessage: "No hay clientes para mostrar.",
    });
  });

  it("allows overriding the empty message while keeping the shared filter copy", () => {
    expect(
      createAdminEntityEmptyStateMessages({
        entityLabelPlural: "productos",
        emptyMessage:
          "Todavia no hay productos cargados. Crea el primero desde 'Crear nuevo producto'.",
      })
    ).toEqual(ADMIN_PRODUCTS_EMPTY_STATE_MESSAGES);
  });
});

describe("resolveAdminEmptyStateMessage", () => {
  it("uses the empty message when there are no records at all", () => {
    expect(
      resolveAdminEmptyStateMessage({
        hasActiveFilters: true,
        hasAnyRecords: false,
        emptyMessage: "Todavia no hay ordenes registradas.",
        filteredMessage: "No se encontraron ordenes con los filtros aplicados.",
        unknownFilteredMessage: "No hay ordenes para mostrar.",
      })
    ).toBe("Todavia no hay ordenes registradas.");
  });

  it("uses the filtered message when records exist but the filters hide them", () => {
    expect(
      resolveAdminEmptyStateMessage({
        hasActiveFilters: true,
        hasAnyRecords: true,
        emptyMessage: "Todavia no hay productos cargados.",
        filteredMessage: "No se encontraron productos con los filtros aplicados.",
        unknownFilteredMessage: "No hay productos para mostrar.",
      })
    ).toBe("No se encontraron productos con los filtros aplicados.");
  });

  it("falls back to a neutral message while the unfiltered presence is still unknown", () => {
    expect(
      resolveAdminEmptyStateMessage({
        hasActiveFilters: true,
        hasAnyRecords: null,
        emptyMessage: "Todavia no hay ordenes registradas.",
        filteredMessage: "No se encontraron ordenes con los filtros aplicados.",
        unknownFilteredMessage: "No hay ordenes para mostrar.",
      })
    ).toBe("No hay ordenes para mostrar.");
  });

  it("uses the empty message when there are no active filters", () => {
    expect(
      resolveAdminEmptyStateMessage({
        hasActiveFilters: false,
        hasAnyRecords: true,
        emptyMessage: "Todavia no hay productos cargados.",
        filteredMessage: "No se encontraron productos con los filtros aplicados.",
        unknownFilteredMessage: "No hay productos para mostrar.",
      })
    ).toBe("Todavia no hay productos cargados.");
  });
});
