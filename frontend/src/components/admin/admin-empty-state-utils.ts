export type AdminEmptyStateMessages = {
  emptyMessage: string;
  filteredMessage: string;
  unknownFilteredMessage: string;
};

type ResolveAdminEmptyStateMessageInput = {
  hasActiveFilters: boolean;
  hasAnyRecords: boolean | null;
} & AdminEmptyStateMessages;

type CreateAdminEntityEmptyStateMessagesInput = {
  entityLabelPlural: string;
  emptyMessage?: string;
  filteredMessage?: string;
  unknownFilteredMessage?: string;
};

export function createAdminEntityEmptyStateMessages({
  entityLabelPlural,
  emptyMessage,
  filteredMessage,
  unknownFilteredMessage,
}: CreateAdminEntityEmptyStateMessagesInput): AdminEmptyStateMessages {
  return {
    emptyMessage: emptyMessage ?? `Todavia no hay ${entityLabelPlural}.`,
    filteredMessage:
      filteredMessage ??
      `No se encontraron ${entityLabelPlural} con los filtros aplicados.`,
    unknownFilteredMessage:
      unknownFilteredMessage ?? `No hay ${entityLabelPlural} para mostrar.`,
  };
}

export const ADMIN_ORDERS_EMPTY_STATE_MESSAGES = createAdminEntityEmptyStateMessages({
  entityLabelPlural: "ordenes",
  emptyMessage: "Todavia no hay ordenes registradas.",
});

export const ADMIN_PRODUCTS_EMPTY_STATE_MESSAGES = createAdminEntityEmptyStateMessages({
  entityLabelPlural: "productos",
  emptyMessage:
    "Todavia no hay productos cargados. Crea el primero desde 'Crear nuevo producto'.",
});

export const ADMIN_QUESTIONS_EMPTY_STATE_MESSAGES = createAdminEntityEmptyStateMessages({
  entityLabelPlural: "preguntas",
  emptyMessage: "Todavia no hay preguntas registradas.",
});

export const ADMIN_INVENTORY_EMPTY_STATE_MESSAGES = createAdminEntityEmptyStateMessages({
  entityLabelPlural: "productos",
  emptyMessage: "Todavia no hay productos en inventario.",
});

export const ADMIN_CLIENTS_EMPTY_STATE_MESSAGES = createAdminEntityEmptyStateMessages({
  entityLabelPlural: "clientes",
  emptyMessage: "Todavia no hay clientes registrados.",
});

export function resolveAdminEmptyStateMessage({
  hasActiveFilters,
  hasAnyRecords,
  emptyMessage,
  filteredMessage,
  unknownFilteredMessage,
}: ResolveAdminEmptyStateMessageInput) {
  if (hasAnyRecords === false) {
    return emptyMessage;
  }

  if (!hasActiveFilters) {
    return emptyMessage;
  }

  if (hasAnyRecords === true) {
    return filteredMessage;
  }

  return unknownFilteredMessage;
}
