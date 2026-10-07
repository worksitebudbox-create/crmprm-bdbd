export const crmRoles = [
  "owner",
  "director",
  "sales_manager",
  "manager",
  "warehouse",
  "accountant",
  "auditor",
] as const;

export type CrmRole = (typeof crmRoles)[number];

export type CrmAccessUser = {
  id: string;
  email: string | null;
  appMetadata: Record<string, unknown>;
  isAdmin: boolean;
  role: CrmRole;
  team: string | null;
  accessRecordId: number;
};

export function isCrmRole(value: unknown): value is CrmRole {
  return typeof value === "string" && (crmRoles as readonly string[]).includes(value);
}

export function canViewFinancialData(role: CrmRole): boolean {
  return role !== "warehouse";
}

export function canManageCrmData(role: CrmRole): boolean {
  return role !== "warehouse" && role !== "accountant" && role !== "auditor";
}

export function isAllowedCrmRequest(
  role: CrmRole,
  method: string,
  path: string,
  body: unknown,
): boolean {
  const verb = method.toUpperCase();
  if (role === "owner" || role === "director") return true;

  if (["sales_manager", "manager"].includes(role) && path.startsWith("/crm/chat/")) {
    return ["GET", "POST", "PATCH", "DELETE"].includes(verb);
  }
  if (["sales_manager", "manager"].includes(role) && verb === "DELETE") {
    return /^\/companies\/\d+$/.test(path) || /^\/tasks\/\d+$/.test(path);
  }

  if (role === "warehouse") {
    if (verb === "GET" && path === "/crm/orders") return true;
    if (verb === "GET" && [
      "/crm/warehouse/stock",
      "/crm/warehouse/google-sheets-stock",
    ].includes(path)) return true;
    if (verb === "PUT" && path === "/crm/warehouse/stock") return true;
    if (verb === "POST" && /^\/crm\/orders\/\d+\/nova-poshta-status$/.test(path)) return true;
    if (verb === "PATCH" && /^\/orders\/\d+$/.test(path)) {
      const fields = body && typeof body === "object" ? Object.keys(body) : [];
      const shippingFields = ["stage", "ttn", "invoiceNumber", "sender", "warehouse", "itemCount"];
      return fields.length > 0 && fields.every((field) => shippingFields.includes(field));
    }
    return false;
  }

  if (role === "accountant") {
    if (verb === "GET" && ["/crm/orders", "/crm/summary", "/crm/analytics-plan"].includes(path)) return true;
    if (verb === "PUT" && path === "/crm/analytics-plan") return true;
    if (verb === "PATCH" && /^\/orders\/\d+$/.test(path)) {
      const fields = body && typeof body === "object" ? Object.keys(body) : [];
      return fields.length > 0 && fields.every((field) => ["paymentStatus", "invoiceNumber"].includes(field));
    }
    return false;
  }

  if (role === "auditor") {
    return verb === "GET" && [
      "/crm/activity",
    ].includes(path);
  }

  if (path.startsWith("/crm/warehouse/")) return false;
  if (verb === "DELETE") return false;
  return true;
}

export function canAccessPage(role: CrmRole, page: string): boolean {
  switch (role) {
    case "owner":
      return true;
    case "director":
      return page !== "admin";
    case "sales_manager":
      return ["overview", "clients", "tasks", "orders", "analytics", "activity", "chat"].includes(page);
    case "manager":
      return ["clients", "tasks", "orders", "analytics", "activity", "chat"].includes(page);
    case "warehouse":
      return ["orders", "warehouse"].includes(page);
    case "accountant":
      return ["orders", "analytics"].includes(page);
    case "auditor":
      return ["activity"].includes(page);
  }
}
