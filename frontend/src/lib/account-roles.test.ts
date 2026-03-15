import { describe, expect, it } from "vitest";

import {
  canAccessAdminPanel,
  customerRoleLabel,
  normalizeCustomerRole,
} from "./account-roles";

describe("account roles", () => {
  it("normalizeCustomerRole maps known and unknown values", () => {
    expect(normalizeCustomerRole("administrator")).toBe("administrator");
    expect(normalizeCustomerRole("employee")).toBe("employee");
    expect(normalizeCustomerRole("user")).toBe("user");
    expect(normalizeCustomerRole("owner")).toBe("user");
    expect(normalizeCustomerRole(null)).toBe("user");
  });

  it("canAccessAdminPanel only allows admin roles", () => {
    expect(canAccessAdminPanel("administrator")).toBe(true);
    expect(canAccessAdminPanel("employee")).toBe(true);
    expect(canAccessAdminPanel("user")).toBe(false);
    expect(canAccessAdminPanel("unknown")).toBe(false);
  });

  it("customerRoleLabel returns localized labels", () => {
    expect(customerRoleLabel("administrator")).toBe("Administrador");
    expect(customerRoleLabel("employee")).toBe("Empleado");
    expect(customerRoleLabel("user")).toBe("Usuario");
    expect(customerRoleLabel("other")).toBe("Usuario");
  });
});
