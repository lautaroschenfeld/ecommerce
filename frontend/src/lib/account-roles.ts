export type CustomerRole = "administrator" | "employee" | "user";

export function normalizeCustomerRole(input: unknown): CustomerRole {
  if (input === "administrator") return "administrator";
  if (input === "employee") return "employee";
  return "user";
}

export function canAccessAdminPanel(role: unknown) {
  const normalized = normalizeCustomerRole(role);
  return normalized === "administrator" || normalized === "employee";
}

export function customerRoleLabel(role: unknown) {
  const normalized = normalizeCustomerRole(role);
  if (normalized === "administrator") return "Administrador";
  if (normalized === "employee") return "Empleado";
  return "Usuario";
}

