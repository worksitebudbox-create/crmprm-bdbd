import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import {
  CreateCompanyBody,
  CreateCompanyResponse,
  CreateContactBody,
  CreateContactParams,
  CreateContactResponse,
  CreateNoteBody,
  CreateNoteParams,
  CreateNoteResponse,
  CreateOrderBody,
  CreateOrderParams,
  CreateOrderResponse,
  CreateTaskBody,
  CreateTaskParams,
  CreateTaskResponse,
  GetCompaniesQueryParams,
  GetCompaniesResponse,
  GetCompanyParams,
  GetCompanyResponse,
  GetCrmActivityResponse,
  GetCrmOrdersResponse,
  GetCrmSummaryResponse,
  GetCrmTasksResponse,
  UpdateCompanyBody,
  UpdateCompanyParams,
  UpdateCompanyResponse,
  UpdateOrderBody,
  UpdateOrderParams,
  UpdateOrderResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  adminAuditLogsTable,
  activitiesTable,
  analyticsSettingsTable,
  companyContactLinksTable,
  companiesTable,
  contactsTable,
  chatMessagesTable,
  crmUserAccessTable,
  db,
  ordersTable,
  tasksTable,
} from "@workspace/db";
import type { AuthenticatedUser } from "../middleware/supabase-auth";
import {
  NovaPoshtaTrackingError,
  queueNovaPoshtaOrderRefresh,
  refreshNovaPoshtaOrderStatus,
} from "../lib/nova-poshta-tracking";

const router: IRouter = Router();
const completedStage = "Успішно реалізовано";
const autoPaidPaymentMethods = new Set(["промоплата", "лікпей", "ізіпей", "безготівкова"]);
const chatRoles = ["owner", "director", "sales_manager", "manager"] as const;
const onlineWindowMs = 90_000;

function getCurrentManager(user?: { email?: string | null } | null): string {
  const email = user?.email?.trim();
  return email || "Не призначено";
}

function getAuthenticatedUser(res: Response): AuthenticatedUser {
  return res.locals.authUser as AuthenticatedUser;
}

async function getManagerScope(user: AuthenticatedUser): Promise<string[] | null> {
  if (["owner", "director", "accountant", "warehouse", "auditor"].includes(user.role)) return null;
  const ownEmail = user.email?.trim().toLocaleLowerCase("en-US");
  if (user.role !== "sales_manager" || !user.team) return ownEmail ? [ownEmail] : [];

  const teamMembers = await db
    .select({ email: crmUserAccessTable.email })
    .from(crmUserAccessTable)
    .where(and(eq(crmUserAccessTable.team, user.team), eq(crmUserAccessTable.isActive, true)));
  return Array.from(new Set([
    ...(ownEmail ? [ownEmail] : []),
    ...teamMembers.map((member) => member.email.toLocaleLowerCase("en-US")),
  ]));
}

function managerScopeCondition(emails: string[] | null) {
  return emails === null ? undefined : inArray(sql`lower(${companiesTable.manager})`, emails);
}

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

function normalizePaymentMethod(value?: string | null) {
  return value?.trim() ?? "";
}

function isReceivedDeliveryStatus(value?: string | null) {
  return Boolean(value && /(доставлен|отримано|отримав|отримала|вручено)/i.test(value) && !/(очікує|відмова)/i.test(value));
}

function resolvePaymentStatus(input: {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
}): { paymentStatus: string; paidAt: Date | null } {
  const method = normalizePaymentMethod(input.paymentMethod).toLowerCase();
  const explicitStatus = input.paymentStatus?.trim() ?? "Неоплачено";
  const receivedDelivery = isReceivedDeliveryStatus(input.deliveryStatus);

  if (autoPaidPaymentMethods.has(method)) {
    return { paymentStatus: "Оплачено", paidAt: new Date() };
  }

  if (method === "новапей") {
    if (explicitStatus === "Оплачено" || receivedDelivery) {
      return { paymentStatus: "Оплачено", paidAt: new Date() };
    }
    return { paymentStatus: explicitStatus || "Неоплачено", paidAt: null };
  }

  if (explicitStatus === "Оплачено" || receivedDelivery) {
    return { paymentStatus: "Оплачено", paidAt: new Date() };
  }

  return { paymentStatus: explicitStatus || "Неоплачено", paidAt: null };
}
const errorBody = (error: string) => ({ error });

function toCompany(row: typeof companiesTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toOrder(row: typeof ordersTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTask(row: typeof tasksTable.$inferSelect) {
  return {
    ...row,
    dueAt: iso(row.dueAt),
    createdAt: row.createdAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

function toContact(row: typeof contactsTable.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function toActivity(row: typeof activitiesTable.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

async function addActivity(input: {
  companyId: number;
  kind: "note" | "task" | "order" | "contact" | "status";
  title: string;
  details?: string | null;
  createdBy?: string;
}) {
  const [row] = await db
    .insert(activitiesTable)
    .values({
      ...input,
      details: input.details ?? null,
      createdBy: input.createdBy?.trim() || "Не призначено",
    })
    .returning();
  return toActivity(row);
}

async function getCompanyDetail(companyId: number, managerScope: string[] | null = null) {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(and(eq(companiesTable.id, companyId), managerScopeCondition(managerScope)))
    .limit(1);

  if (!company) return null;

  const [contacts, linkedContacts, orders, tasks, activity] = await Promise.all([
    db.select().from(contactsTable).where(eq(contactsTable.companyId, companyId)).orderBy(desc(contactsTable.createdAt)),
    db.select({ contact: contactsTable })
      .from(companyContactLinksTable)
      .innerJoin(contactsTable, eq(companyContactLinksTable.contactId, contactsTable.id))
      .where(eq(companyContactLinksTable.companyId, companyId))
      .orderBy(desc(contactsTable.createdAt)),
    db.select().from(ordersTable).where(eq(ordersTable.companyId, companyId)).orderBy(desc(ordersTable.createdAt)),
    db.select().from(tasksTable).where(eq(tasksTable.companyId, companyId)).orderBy(desc(tasksTable.createdAt)),
    db.select().from(activitiesTable).where(eq(activitiesTable.companyId, companyId)).orderBy(desc(activitiesTable.createdAt)),
  ]);

  return {
    ...toCompany(company),
    contacts: [...contacts, ...linkedContacts.map(({ contact }) => contact)]
      .filter((contact, index, all) => all.findIndex((candidate) => candidate.id === contact.id) === index)
      .map(toContact),
    orders: orders.map(toOrder),
    tasks: tasks.map(toTask),
    activity: activity.map(toActivity),
  };
}

router.get("/crm/summary", async (req, res): Promise<void> => {
  const actor = getAuthenticatedUser(res);
  const managerScope = await getManagerScope(actor);
  const companyCondition = managerScopeCondition(managerScope);
  const [companies, orders, overdueTasks] = await Promise.all([
    db.select({ id: companiesTable.id }).from(companiesTable).where(companyCondition),
    db
      .select({ order: ordersTable })
      .from(ordersTable)
      .leftJoin(companiesTable, eq(ordersTable.companyId, companiesTable.id))
      .where(managerScope === null ? undefined : and(inArray(sql`lower(${companiesTable.manager})`, managerScope), sql`${ordersTable.companyId} IS NOT NULL`))
      .then((rows) => rows.map(({ order }) => order)),
    db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .innerJoin(companiesTable, eq(tasksTable.companyId, companiesTable.id))
      .where(and(eq(tasksTable.isCompleted, false), lt(tasksTable.dueAt, new Date()), companyCondition)),
  ]);
  const activeOrders = orders.filter((order) => order.stage !== completedStage);
  const response = GetCrmSummaryResponse.parse({
    totalCompanies: companies.length,
    activeOrders: activeOrders.length,
    pipelineValueUah: activeOrders.reduce((total, order) => total + order.amountUah, 0),
    overdueTasks: overdueTasks.length,
  });
  req.log.debug("CRM summary loaded");
  res.json(response);
});

const analyticsPlanBodySchema = z.object({
  value: z.number().finite().nonnegative().optional(),
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  selectedPeriod: z.enum(["day", "week", "month"]).optional(),
});

router.get("/crm/analytics-plan", async (req, res): Promise<void> => {
  const user = res.locals.authUser as { id: string; email: string | null } | undefined;
  if (!user) {
    res.status(401).json({ error: "Sign in to access the analytics plan." });
    return;
  }

  const [row] = await db
    .select()
    .from(analyticsSettingsTable)
    .where(eq(analyticsSettingsTable.userId, user.id))
    .limit(1);

  res.json({
    value: row?.planValue ?? 0,
    selectedDate: row?.selectedDate ?? new Date().toISOString().slice(0, 10),
    selectedPeriod: row?.selectedPeriod ?? "month",
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  });
});

router.put("/crm/analytics-plan", async (req, res): Promise<void> => {
  const user = res.locals.authUser as { id: string; email: string | null } | undefined;
  if (!user) {
    res.status(401).json({ error: "Sign in to save the analytics plan." });
    return;
  }

  const parsed = analyticsPlanBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const payload = parsed.data;
  const nextValue = payload.value ?? 0;
  const nextSelectedDate = payload.selectedDate ?? new Date().toISOString().slice(0, 10);
  const nextSelectedPeriod = payload.selectedPeriod ?? "month";

  const [row] = await db
    .insert(analyticsSettingsTable)
    .values({
      userId: user.id,
      email: user.email,
      planValue: nextValue,
      selectedDate: nextSelectedDate,
      selectedPeriod: nextSelectedPeriod,
    })
    .onConflictDoUpdate({
      target: analyticsSettingsTable.userId,
      set: {
        email: user.email,
        planValue: nextValue,
        selectedDate: nextSelectedDate,
        selectedPeriod: nextSelectedPeriod,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({
    value: row.planValue,
    selectedDate: row.selectedDate ?? nextSelectedDate,
    selectedPeriod: row.selectedPeriod ?? nextSelectedPeriod,
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.get("/crm/tasks", async (req, res): Promise<void> => {
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const rows = await db
    .select({
      task: tasksTable,
      companyName: companiesTable.name,
      companyManager: companiesTable.manager,
    })
    .from(tasksTable)
    .innerJoin(companiesTable, eq(tasksTable.companyId, companiesTable.id))
    .where(managerScopeCondition(managerScope))
    .orderBy(desc(tasksTable.createdAt));

  const response = rows.map(({ task, companyName, companyManager }) => ({
    ...toTask(task),
    companyName,
    companyManager,
  }));
  res.json(GetCrmTasksResponse.parse(response));
});

router.get("/crm/orders", async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const managerScope = await getManagerScope(user);
  const rows = await db
    .select({
      order: ordersTable,
      companyName: companiesTable.name,
    })
    .from(ordersTable)
    .leftJoin(companiesTable, eq(ordersTable.companyId, companiesTable.id))
    .where(managerScope === null ? undefined : and(
      inArray(sql`lower(${companiesTable.manager})`, managerScope),
      sql`${ordersTable.companyId} IS NOT NULL`,
    ))
    .orderBy(desc(ordersTable.createdAt));

  const response = rows.map(({ order, companyName }) => ({
    ...toOrder(order),
    ...(user.role === "warehouse" ? {
      amountUah: 0,
      comment: null,
      paymentMethod: null,
      paymentStatus: null,
      paidAt: null,
      marketingSource: null,
    } : {}),
    companyName: companyName ?? order.customerName ?? "Без компанії",
  }));
  res.json(GetCrmOrdersResponse.parse(response));
});

router.post("/crm/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(errorBody(parsed.error.message));
    return;
  }
  const actor = getAuthenticatedUser(res);
  const managerScope = await getManagerScope(actor);
  const input = parsed.data;
  const savedOrder = await db.transaction(async (tx) => {
    const customerName = input.customerName?.trim() || input.phone?.trim() || "";
    const phone = input.phone?.trim() || null;
    const phoneDigits = phone?.replace(/\D/g, "") ?? "";
    let company: typeof companiesTable.$inferSelect | undefined;

    if (phoneDigits) {
      const [matchedContact] = await tx
        .select({ company: companiesTable })
        .from(contactsTable)
        .innerJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
        .where(and(
          sql`regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`,
          managerScopeCondition(managerScope),
        ))
        .limit(1);
      company = matchedContact?.company;
    }
    if (!company && customerName) {
      const [matchedCompany] = await tx
        .select()
        .from(companiesTable)
        .where(and(
          sql`lower(trim(${companiesTable.name})) = ${customerName.toLocaleLowerCase("uk-UA")}`,
          managerScopeCondition(managerScope),
        ))
        .limit(1);
      company = matchedCompany;
    }
    if (!company && customerName) {
      const [createdCompany] = await tx
        .insert(companiesTable)
        .values({
          name: customerName,
          customerType: "Роздрібний клієнт",
          manager: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
          paymentForm: "готівка",
        })
        .returning();
      company = createdCompany;
    }
    if (company && customerName) {
      const existingContactCondition = phoneDigits
        ? sql`regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`
        : sql`lower(trim(${contactsTable.fullName})) = ${customerName.toLocaleLowerCase("uk-UA")}`;
      const [existingContact] = await tx
        .select({ id: contactsTable.id })
        .from(contactsTable)
        .where(and(eq(contactsTable.companyId, company.id), existingContactCondition))
        .limit(1);
      if (!existingContact) {
        await tx.insert(contactsTable).values({
          companyId: company.id,
          fullName: customerName,
          phone,
        });
      }
    }

    const normalizedPayment = resolvePaymentStatus({
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
    });

    const [order] = await tx.insert(ordersTable).values({
      companyId: company?.id ?? null,
      code: input.code?.trim() || "Нове замовлення",
      stage: input.stage,
      amountUah: input.amountUah,
      ttn: input.ttn ?? null,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      comment: input.comment?.trim() || null,
      deliveryStatus: null,
      sender: input.sender?.trim() || null,
      warehouse: input.warehouse?.trim() || null,
      customerName: input.customerName?.trim() || null,
      phone,
      itemCount: input.itemCount ?? null,
      paymentMethod: input.paymentMethod?.trim() || null,
      paymentStatus: normalizedPayment.paymentStatus,
      paidAt: normalizedPayment.paidAt,
      marketingSource: input.marketingSource?.trim() || null,
      orderDate: input.orderDate?.toISOString().slice(0, 10) ?? null,
      arrivalDate: input.arrivalDate?.toISOString() ?? null,
    }).returning();
    const code = input.code?.trim() || `ЗАМ-${String(order.id).padStart(5, "0")}`;
    if (code === order.code) return order;
    const [numberedOrder] = await tx
      .update(ordersTable)
      .set({ code, updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id))
      .returning();
    return numberedOrder;
  });
  if (savedOrder.ttn?.trim()) queueNovaPoshtaOrderRefresh(savedOrder.id);
  res.status(201).json(CreateOrderResponse.parse(toOrder(savedOrder)));
});

router.get("/crm/order-customer-search", async (req, res): Promise<void> => {
  const parsedQuery = z.string().trim().min(2).max(120).safeParse(req.query.q);
  if (!parsedQuery.success) {
    res.status(400).json(errorBody("Введіть щонайменше 2 символи для пошуку клієнта."));
    return;
  }

  const query = parsedQuery.data;
  const pattern = `%${query}%`;
  const digits = query.replace(/\D/g, "");
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const companySearchCondition = or(
    ilike(companiesTable.name, pattern),
    ilike(companiesTable.taxId, pattern),
    ilike(companiesTable.city, pattern),
    ilike(companiesTable.customerType, pattern),
  );
  const phoneSearchCondition = digits.length >= 2
    ? sql`regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') LIKE ${`%${digits}%`}`
    : undefined;

  const [contactMatches, linkedContactMatches, companyMatches] = await Promise.all([
    db.select({ company: companiesTable, contact: contactsTable })
      .from(contactsTable)
      .innerJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .where(and(
        or(
          ilike(contactsTable.fullName, pattern),
          ilike(contactsTable.phone, pattern),
          phoneSearchCondition,
          companySearchCondition,
        ),
        managerScopeCondition(managerScope),
      ))
      .orderBy(desc(contactsTable.createdAt))
      .limit(30),
    db.select({ company: companiesTable, contact: contactsTable })
      .from(companyContactLinksTable)
      .innerJoin(contactsTable, eq(companyContactLinksTable.contactId, contactsTable.id))
      .innerJoin(companiesTable, eq(companyContactLinksTable.companyId, companiesTable.id))
      .where(and(
        or(
          ilike(contactsTable.fullName, pattern),
          ilike(contactsTable.phone, pattern),
          phoneSearchCondition,
          companySearchCondition,
        ),
        managerScopeCondition(managerScope),
      ))
      .orderBy(desc(contactsTable.createdAt))
      .limit(30),
    db.select()
      .from(companiesTable)
      .where(and(companySearchCondition, managerScopeCondition(managerScope)))
      .orderBy(desc(companiesTable.updatedAt))
      .limit(20),
  ]);

  const allContactMatches = [...contactMatches, ...linkedContactMatches]
    .filter(({ company, contact }, index, all) => all.findIndex((item) => item.company.id === company.id && item.contact.id === contact.id) === index);
  const matchedCompanyIds = new Set(allContactMatches.map(({ company }) => company.id));
  const results = [
    ...allContactMatches.map(({ company, contact }) => ({
      companyId: company.id,
      companyName: company.name,
      taxId: company.taxId,
      city: company.city,
      customerType: company.customerType,
      manager: company.manager,
      contactId: contact.id,
      contactName: contact.fullName,
      phone: contact.phone,
    })),
    ...companyMatches
      .filter((company) => !matchedCompanyIds.has(company.id))
      .map((company) => ({
        companyId: company.id,
        companyName: company.name,
        taxId: company.taxId,
        city: company.city,
        customerType: company.customerType,
        manager: company.manager,
        contactId: null,
        contactName: null,
        phone: null,
      })),
  ];

  res.json(results);
});

router.get("/crm/activity", async (req, res): Promise<void> => {
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const rows = await db
    .select({
      activity: activitiesTable,
      companyName: companiesTable.name,
    })
    .from(activitiesTable)
    .innerJoin(companiesTable, eq(activitiesTable.companyId, companiesTable.id))
    .where(managerScopeCondition(managerScope))
    .orderBy(desc(activitiesTable.createdAt));

  const response = rows.map(({ activity, companyName }) => ({
    ...toActivity(activity),
    companyName,
  }));
  res.json(GetCrmActivityResponse.parse(response));
});

router.get("/crm/managers", async (_req, res): Promise<void> => {
  const managers = await db
    .select({ email: crmUserAccessTable.email })
    .from(crmUserAccessTable)
    .where(and(
      eq(crmUserAccessTable.isActive, true),
      inArray(crmUserAccessTable.role, ["owner", "director", "sales_manager", "manager"]),
    ))
    .orderBy(crmUserAccessTable.email);

  res.json(managers.map(({ email }) => email));
});

router.get("/crm/chat/managers", async (req, res): Promise<void> => {
  const actor = getAuthenticatedUser(res);
  const [managers, unreadRows] = await Promise.all([
    db
      .select({
        userId: crmUserAccessTable.userId,
        email: crmUserAccessTable.email,
        role: crmUserAccessTable.role,
        displayName: crmUserAccessTable.displayName,
        lastSeenAt: crmUserAccessTable.lastSeenAt,
      })
      .from(crmUserAccessTable)
      .where(and(
        eq(crmUserAccessTable.isActive, true),
        inArray(crmUserAccessTable.role, [...chatRoles]),
      ))
      .orderBy(crmUserAccessTable.email),
    db.select({
      senderUserId: chatMessagesTable.senderUserId,
      count: sql<number>`count(*)::int`,
    })
      .from(chatMessagesTable)
      .where(and(
        eq(chatMessagesTable.recipientUserId, actor.id),
        isNull(chatMessagesTable.readAt),
      ))
      .groupBy(chatMessagesTable.senderUserId),
  ]);
  const unreadBySender = new Map(unreadRows.map((row) => [row.senderUserId, row.count]));

  res.json(managers.map((manager) => ({
    userId: manager.userId,
    email: manager.email,
    name: manager.displayName?.trim() || manager.email.split("@")[0] || manager.email,
    role: manager.role,
    isOnline: Boolean(manager.lastSeenAt && Date.now() - manager.lastSeenAt.getTime() <= onlineWindowMs),
    lastSeenAt: iso(manager.lastSeenAt),
    isSelf: manager.userId === actor.id,
    unreadCount: unreadBySender.get(manager.userId) ?? 0,
  })));
});

router.get("/crm/chat/notifications", async (_req, res): Promise<void> => {
  const actor = getAuthenticatedUser(res);
  const [messages, [unreadCountRow]] = await Promise.all([db
    .select({
      id: chatMessagesTable.id,
      senderUserId: chatMessagesTable.senderUserId,
      senderEmail: crmUserAccessTable.email,
      senderDisplayName: crmUserAccessTable.displayName,
      body: chatMessagesTable.body,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .innerJoin(crmUserAccessTable, eq(chatMessagesTable.senderUserId, crmUserAccessTable.userId))
    .where(and(
      eq(chatMessagesTable.recipientUserId, actor.id),
      isNull(chatMessagesTable.readAt),
      eq(crmUserAccessTable.isActive, true),
      inArray(crmUserAccessTable.role, [...chatRoles]),
    ))
    .orderBy(desc(chatMessagesTable.createdAt), desc(chatMessagesTable.id))
    .limit(50), db.select({ count: sql<number>`count(*)::int` })
    .from(chatMessagesTable)
    .where(and(
      eq(chatMessagesTable.recipientUserId, actor.id),
      isNull(chatMessagesTable.readAt),
    ))]);
  res.json({
    unreadCount: unreadCountRow?.count ?? 0,
    messages: messages.map((message) => ({
      ...message,
      senderName: message.senderDisplayName?.trim() || message.senderEmail.split("@")[0] || message.senderEmail,
      createdAt: message.createdAt.toISOString(),
    })),
  });
});

router.post("/crm/chat/presence", async (req, res): Promise<void> => {
  const parsed = z.object({
    displayName: z.string().trim().max(60).optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(errorBody(parsed.error.message));
    return;
  }

  const actor = getAuthenticatedUser(res);
  const [updated] = await db
    .update(crmUserAccessTable)
    .set({
      displayName: parsed.data.displayName || null,
      lastSeenAt: new Date(),
    })
    .where(and(
      eq(crmUserAccessTable.userId, actor.id),
      eq(crmUserAccessTable.isActive, true),
    ))
    .returning({ lastSeenAt: crmUserAccessTable.lastSeenAt });
  if (!updated) {
    res.status(403).json(errorBody("Активний доступ до CRM не знайдено."));
    return;
  }
  res.json({ lastSeenAt: iso(updated.lastSeenAt) });
});

router.get("/crm/chat/messages/:userId", async (req, res): Promise<void> => {
  const parsedUserId = z.string().trim().min(1).max(200).safeParse(req.params.userId);
  if (!parsedUserId.success) {
    res.status(400).json(errorBody("Некоректний користувач чату."));
    return;
  }

  const actor = getAuthenticatedUser(res);
  const recipientId = parsedUserId.data;
  if (recipientId === actor.id) {
    res.status(400).json(errorBody("Не можна відкрити чат із самим собою."));
    return;
  }
  const [recipient] = await db
    .select({ userId: crmUserAccessTable.userId })
    .from(crmUserAccessTable)
    .where(and(
      eq(crmUserAccessTable.userId, recipientId),
      eq(crmUserAccessTable.isActive, true),
      inArray(crmUserAccessTable.role, [...chatRoles]),
    ))
    .limit(1);
  if (!recipient) {
    res.status(404).json(errorBody("Менеджера не знайдено або його доступ вимкнено."));
    return;
  }

  const parsedBeforeId = req.query.beforeId === undefined
    ? { success: true as const, data: undefined }
    : z.coerce.number().int().positive().safeParse(req.query.beforeId);
  if (!parsedBeforeId.success) {
    res.status(400).json(errorBody("Некоректний курсор історії повідомлень."));
    return;
  }
  await db.update(chatMessagesTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(chatMessagesTable.senderUserId, recipientId),
      eq(chatMessagesTable.recipientUserId, actor.id),
      isNull(chatMessagesTable.readAt),
    ));
  const conversationCondition = or(
      and(
        eq(chatMessagesTable.senderUserId, actor.id),
        eq(chatMessagesTable.recipientUserId, recipientId),
      ),
      and(
        eq(chatMessagesTable.senderUserId, recipientId),
        eq(chatMessagesTable.recipientUserId, actor.id),
      ),
    );
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(and(
      conversationCondition,
      parsedBeforeId.data === undefined ? undefined : lt(chatMessagesTable.id, parsedBeforeId.data),
    ))
    .orderBy(desc(chatMessagesTable.createdAt), desc(chatMessagesTable.id))
    .limit(100);
  const chronological = messages.reverse();
  res.json({
    messages: chronological.map((message) => ({
    id: message.id,
    senderUserId: message.senderUserId,
    recipientUserId: message.recipientUserId,
    body: message.body,
    editedAt: iso(message.editedAt),
    readAt: iso(message.readAt),
    createdAt: message.createdAt.toISOString(),
    })),
    hasMore: messages.length === 100,
    nextBeforeId: messages[0]?.id ?? null,
  });
});

router.post("/crm/chat/messages/:userId", async (req, res): Promise<void> => {
  const parsedUserId = z.string().trim().min(1).max(200).safeParse(req.params.userId);
  const parsedBody = z.object({
    body: z.string().trim().min(1).max(4000),
  }).safeParse(req.body);
  if (!parsedUserId.success) {
    res.status(400).json(errorBody("Некоректний користувач чату."));
    return;
  }
  if (!parsedBody.success) {
    res.status(400).json(errorBody(parsedBody.error.message));
    return;
  }

  const actor = getAuthenticatedUser(res);
  const recipientId = parsedUserId.data;
  if (recipientId === actor.id) {
    res.status(400).json(errorBody("Не можна надіслати повідомлення самому собі."));
    return;
  }
  const [recipient] = await db
    .select({ userId: crmUserAccessTable.userId })
    .from(crmUserAccessTable)
    .where(and(
      eq(crmUserAccessTable.userId, recipientId),
      eq(crmUserAccessTable.isActive, true),
      inArray(crmUserAccessTable.role, [...chatRoles]),
    ))
    .limit(1);
  if (!recipient) {
    res.status(404).json(errorBody("Менеджера не знайдено або його доступ вимкнено."));
    return;
  }

  const [message] = await db
    .insert(chatMessagesTable)
    .values({
      senderUserId: actor.id,
      recipientUserId: recipientId,
      body: parsedBody.data.body,
    })
    .returning();
  res.status(201).json({
    id: message.id,
    senderUserId: message.senderUserId,
    recipientUserId: message.recipientUserId,
    body: message.body,
    editedAt: iso(message.editedAt),
    readAt: iso(message.readAt),
    createdAt: message.createdAt.toISOString(),
  });
});

router.patch("/crm/chat/messages/:messageId", async (req, res): Promise<void> => {
  const parsedId = z.coerce.number().int().positive().safeParse(req.params.messageId);
  const parsedBody = z.object({
    body: z.string().trim().min(1).max(4000),
  }).safeParse(req.body);
  if (!parsedId.success) {
    res.status(400).json(errorBody("Некоректне повідомлення."));
    return;
  }
  if (!parsedBody.success) {
    res.status(400).json(errorBody(parsedBody.error.message));
    return;
  }
  const actor = getAuthenticatedUser(res);
  const [message] = await db
    .update(chatMessagesTable)
    .set({ body: parsedBody.data.body, editedAt: new Date() })
    .where(and(
      eq(chatMessagesTable.id, parsedId.data),
      eq(chatMessagesTable.senderUserId, actor.id),
    ))
    .returning();
  if (!message) {
    res.status(404).json(errorBody("Повідомлення не знайдено або воно належить іншому користувачу."));
    return;
  }
  res.json({
    id: message.id,
    senderUserId: message.senderUserId,
    recipientUserId: message.recipientUserId,
    body: message.body,
    editedAt: iso(message.editedAt),
    readAt: iso(message.readAt),
    createdAt: message.createdAt.toISOString(),
  });
});

router.delete("/crm/chat/messages/:messageId", async (req, res): Promise<void> => {
  const parsedId = z.coerce.number().int().positive().safeParse(req.params.messageId);
  if (!parsedId.success) {
    res.status(400).json(errorBody("Некоректне повідомлення."));
    return;
  }
  const actor = getAuthenticatedUser(res);
  const [deleted] = await db
    .delete(chatMessagesTable)
    .where(and(
      eq(chatMessagesTable.id, parsedId.data),
      eq(chatMessagesTable.senderUserId, actor.id),
    ))
    .returning({ id: chatMessagesTable.id });
  if (!deleted) {
    res.status(404).json(errorBody("Повідомлення не знайдено або воно належить іншому користувачу."));
    return;
  }
  res.status(204).end();
});

router.get("/companies", async (req, res): Promise<void> => {
  const parsed = GetCompaniesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(errorBody(parsed.error.message));
    return;
  }

  const actor = getAuthenticatedUser(res);
  const managerScope = await getManagerScope(actor);
  const currentManager = getCurrentManager(actor);
  const search = parsed.data.q?.trim();
  const searchDigits = search?.replace(/\D/g, "") ?? "";
  const contactSearchCondition = search
    ? sql`EXISTS (
        SELECT 1
        FROM ${contactsTable}
        WHERE ${contactsTable.companyId} = ${companiesTable.id}
          AND ${or(
            ilike(contactsTable.fullName, `%${search}%`),
            ilike(contactsTable.phone, `%${search}%`),
            searchDigits.length >= 2
              ? sql`regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') LIKE ${`%${searchDigits}%`}`
              : undefined,
          )}
      )`
    : undefined;
  const linkedContactSearchCondition = search
    ? sql`EXISTS (
        SELECT 1
        FROM ${companyContactLinksTable}
        INNER JOIN ${contactsTable} ON ${companyContactLinksTable.contactId} = ${contactsTable.id}
        WHERE ${companyContactLinksTable.companyId} = ${companiesTable.id}
          AND ${or(
            ilike(contactsTable.fullName, `%${search}%`),
            ilike(contactsTable.phone, `%${search}%`),
            searchDigits.length >= 2
              ? sql`regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') LIKE ${`%${searchDigits}%`}`
              : undefined,
          )}
      )`
    : undefined;
  const searchCondition = search
    ? or(
        ilike(companiesTable.name, `%${search}%`),
        ilike(companiesTable.taxId, `%${search}%`),
        ilike(companiesTable.city, `%${search}%`),
        ilike(companiesTable.customerType, `%${search}%`),
        contactSearchCondition,
        linkedContactSearchCondition,
      )
    : undefined;

  const [companies, contacts, orders, tasks] = await Promise.all([
    db.select().from(companiesTable).where(and(searchCondition, managerScopeCondition(managerScope))).orderBy(desc(companiesTable.updatedAt)),
    db.select({ companyId: contactsTable.companyId }).from(contactsTable),
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)),
    db.select().from(tasksTable),
  ]);
  const contactCounts = new Map<number, number>();
  for (const contact of contacts) {
    contactCounts.set(contact.companyId, (contactCounts.get(contact.companyId) ?? 0) + 1);
  }

  const activeOrders = new Map<number, typeof orders>();
  for (const order of orders) {
    if (order.stage === completedStage || order.companyId === null) continue;
    const existing = activeOrders.get(order.companyId) ?? [];
    existing.push(order);
    activeOrders.set(order.companyId, existing);
  }
  const tasksByCompany = new Map<number, typeof tasks>();
  for (const task of tasks) {
    if (task.isCompleted) continue;
    const existing = tasksByCompany.get(task.companyId) ?? [];
    existing.push(task);
    tasksByCompany.set(task.companyId, existing);
  }

  const now = Date.now();
  const items = companies.map((company) => {
    const companyTasks = tasksByCompany.get(company.id) ?? [];
    const companyOrders = activeOrders.get(company.id) ?? [];
    companyTasks.sort((a, b) => (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
    return {
      ...toCompany(company),
      activeOrder: companyOrders[0] ? toOrder(companyOrders[0]) : null,
      nextTask: companyTasks[0] ? toTask(companyTasks[0]) : null,
      overdue: companyTasks.some((task) => task.dueAt !== null && task.dueAt.getTime() < now),
      contactsCount: contactCounts.get(company.id) ?? 0,
    };
  });

  const filtered = items.filter((company) => {
    switch (parsed.data.filter) {
      case "mine":
        return company.manager.toLocaleLowerCase("en-US") === currentManager.toLocaleLowerCase("en-US");
      case "hasTasks":
        return company.nextTask !== null;
      case "overdue":
        return company.overdue;
      default:
        return true;
    }
  });

  res.json(GetCompaniesResponse.parse(filtered));
});

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(errorBody(parsed.error.message));
    return;
  }
  const input = parsed.data;
  const currentManager = getCurrentManager(res.locals.authUser as { email?: string | null } | undefined);
  const nextManager = currentManager;
  if (!input.name.trim() || !nextManager.trim()) {
    res.status(400).json(errorBody("Назва компанії та менеджер є обов’язковими."));
    return;
  }

  const [company] = await db
    .insert(companiesTable)
    .values({
      name: input.name.trim(),
      taxId: input.taxId ?? null,
      customerType: input.customerType,
      city: input.city ?? null,
      manager: nextManager,
      warehouse: input.warehouse ?? null,
      paymentForm: input.paymentForm ?? "ПДВ",
      creditLimitUah: input.creditLimitUah ?? 0,
      paymentTermsDays: input.paymentTermsDays ?? 0,
      discountPercent: input.discountPercent ?? 0,
      priceTier: input.priceTier ?? null,
      source: input.source ?? null,
    })
    .returning();

  await addActivity({
    companyId: company.id,
    kind: "status",
    title: "Створено картку компанії",
    details: company.name,
    createdBy: company.manager,
  });
  const detail = await getCompanyDetail(company.id);
  res.status(201).json(CreateCompanyResponse.parse(detail));
});

router.get("/crm/contact-search", async (req, res): Promise<void> => {
  const parsedQuery = z.string().trim().min(2).max(120).safeParse(req.query.q);
  if (!parsedQuery.success) {
    res.status(400).json(errorBody("Введіть щонайменше 2 символи для пошуку контакту."));
    return;
  }
  const query = parsedQuery.data;
  const digits = query.replace(/\D/g, "");
  const pattern = `%${query}%`;
  const phoneSearchCondition = digits.length >= 2
    ? sql`regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') LIKE ${`%${digits}%`}`
    : undefined;
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const results = await db
    .select({
      id: contactsTable.id,
      fullName: contactsTable.fullName,
      phone: contactsTable.phone,
      email: contactsTable.email,
      role: contactsTable.role,
      companyId: contactsTable.companyId,
      companyName: companiesTable.name,
    })
    .from(contactsTable)
    .innerJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
    .where(and(
      or(
        ilike(contactsTable.fullName, pattern),
        ilike(contactsTable.phone, pattern),
        phoneSearchCondition,
      ),
      managerScopeCondition(managerScope),
    ))
    .orderBy(desc(contactsTable.createdAt))
    .limit(30);
  res.json(results);
});

router.put("/companies/:companyId/responsible-contact", async (req, res): Promise<void> => {
  const params = GetCompanyParams.safeParse(req.params);
  const parsed = z.object({ contactId: z.number().int().positive().nullable() }).safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json(errorBody(!params.success ? params.error.message : "Виберіть коректний контакт."));
    return;
  }
  const actor = getAuthenticatedUser(res);
  const managerScope = await getManagerScope(actor);
  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(and(
      eq(companiesTable.id, params.data.companyId),
      managerScopeCondition(managerScope),
    ))
    .limit(1);
  if (!company) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  if (parsed.data.contactId === null) {
    await db.delete(companyContactLinksTable).where(eq(companyContactLinksTable.companyId, company.id));
    res.status(204).end();
    return;
  }
  const [contact] = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .innerJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
    .where(and(
      eq(contactsTable.id, parsed.data.contactId),
      managerScopeCondition(managerScope),
    ))
    .limit(1);
  if (!contact) {
    res.status(404).json(errorBody("Контакт не знайдено або він недоступний для вашої команди."));
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(companyContactLinksTable).where(eq(companyContactLinksTable.companyId, company.id));
    await tx.insert(companyContactLinksTable).values({ companyId: company.id, contactId: contact.id });
  });
  res.status(204).end();
});

router.get("/companies/:companyId", async (req, res): Promise<void> => {
  const params = GetCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(errorBody(params.error.message));
    return;
  }
  const detail = await getCompanyDetail(
    params.data.companyId,
    await getManagerScope(getAuthenticatedUser(res)),
  );
  if (!detail) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  res.json(GetCompanyResponse.parse(detail));
});

router.patch("/companies/:companyId", async (req, res): Promise<void> => {
  const params = UpdateCompanyParams.safeParse(req.params);
  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success ? params.error.message : parsed.error?.message ?? "Невірні дані.";
    res.status(400).json(errorBody(message));
    return;
  }
  if (parsed.data.name !== undefined && !parsed.data.name.trim()) {
    res.status(400).json(errorBody("Назва компанії не може бути порожньою."));
    return;
  }
  const actor = getAuthenticatedUser(res);
  const managerScope = await getManagerScope(actor);
  const [existingCompany] = await db
    .select({ manager: companiesTable.manager })
    .from(companiesTable)
    .where(and(
      eq(companiesTable.id, params.data.companyId),
      managerScopeCondition(managerScope),
    ))
    .limit(1);
  if (!existingCompany) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  if (
    parsed.data.manager !== undefined &&
    !["owner", "director", "sales_manager"].includes(actor.role)
  ) {
    res.status(403).json(errorBody("Перерозподіляти клієнтів може лише керівник продажів або вище."));
    return;
  }
  if (
    actor.role === "sales_manager" &&
    parsed.data.manager !== undefined &&
    !managerScope?.includes(parsed.data.manager.trim().toLocaleLowerCase("en-US"))
  ) {
    res.status(403).json(errorBody("Керівник продажів може передавати клієнтів лише менеджерам своєї команди."));
    return;
  }
  const [company] = await db
    .update(companiesTable)
    .set({
      ...parsed.data,
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.manager !== undefined ? { manager: parsed.data.manager.trim() } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(companiesTable.id, params.data.companyId),
      managerScopeCondition(managerScope),
    ))
    .returning();
  if (!company) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  await addActivity({
    companyId: company.id,
    kind: "status",
    title: "Оновлено картку компанії",
    createdBy: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
  });
  const detail = await getCompanyDetail(company.id, managerScope);
  res.json(UpdateCompanyResponse.parse(detail));
});

router.post("/companies/:companyId/contacts", async (req, res): Promise<void> => {
  const params = CreateContactParams.safeParse(req.params);
  const parsed = CreateContactBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success ? params.error.message : parsed.error?.message ?? "Невірні дані.";
    res.status(400).json(errorBody(message));
    return;
  }
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const [company] = await db.select().from(companiesTable).where(and(
    eq(companiesTable.id, params.data.companyId),
    managerScopeCondition(managerScope),
  )).limit(1);
  if (!company) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  const [contact] = await db
    .insert(contactsTable)
    .values({
      companyId: company.id,
      fullName: parsed.data.fullName.trim(),
      role: parsed.data.role ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      telegram: parsed.data.telegram ?? null,
      viber: parsed.data.viber ?? null,
    })
    .returning();
  await addActivity({
    companyId: company.id,
    kind: "contact",
    title: "Додано контакт",
    details: contact.fullName,
    createdBy: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
  });
  res.status(201).json(CreateContactResponse.parse(toContact(contact)));
});

router.post("/companies/:companyId/orders", async (req, res): Promise<void> => {
  const params = CreateOrderParams.safeParse(req.params);
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success ? params.error.message : parsed.error?.message ?? "Невірні дані.";
    res.status(400).json(errorBody(message));
    return;
  }
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const [company] = await db.select().from(companiesTable).where(and(
    eq(companiesTable.id, params.data.companyId),
    managerScopeCondition(managerScope),
  )).limit(1);
  if (!company) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  const normalizedPayment = resolvePaymentStatus({
    paymentMethod: parsed.data.paymentMethod,
    paymentStatus: parsed.data.paymentStatus,
  });

  const [order] = await db
  .insert(ordersTable)
  .values({
    companyId: company.id,
    code: parsed.data.code?.trim() || "Нова угода",
    stage: parsed.data.stage,
    amountUah: parsed.data.amountUah,
    ttn: parsed.data.ttn ?? null,
    invoiceNumber: parsed.data.invoiceNumber?.trim() || null,
    comment: parsed.data.comment?.trim() || null,
    deliveryStatus: null,
    sender: parsed.data.sender?.trim() || null,
    warehouse: parsed.data.warehouse?.trim() || null,
    customerName: parsed.data.customerName?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
    itemCount: parsed.data.itemCount ?? null,
    paymentMethod: parsed.data.paymentMethod?.trim() || null,
    paymentStatus: normalizedPayment.paymentStatus,
    paidAt: normalizedPayment.paidAt,
    marketingSource: parsed.data.marketingSource?.trim() || null,
    orderDate: parsed.data.orderDate?.toISOString().slice(0, 10) ?? null,
    arrivalDate: parsed.data.arrivalDate?.toISOString() ?? null,
  })
  .returning();
  const code = parsed.data.code?.trim() || `ЗАМ-${String(order.id).padStart(5, "0")}`;
  const [savedOrder] = code === order.code
    ? [order]
    : await db.update(ordersTable).set({ code, updatedAt: new Date() }).where(eq(ordersTable.id, order.id)).returning();
  await addActivity({
    companyId: company.id,
    kind: "order",
    title: "Створено замовлення",
    details: `${savedOrder.code} · ${savedOrder.amountUah.toLocaleString("uk-UA")} ₴`,
    createdBy: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
  });
  if (savedOrder.ttn?.trim()) queueNovaPoshtaOrderRefresh(savedOrder.id);
  res.status(201).json(CreateOrderResponse.parse(toOrder(savedOrder)));
});

router.patch("/orders/:orderId", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success ? params.error.message : parsed.error?.message ?? "Невірні дані.";
    res.status(400).json(errorBody(message));
    return;
  }
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const { arrivalDate, orderDate, ...orderUpdate } = parsed.data;
  const [existingOrder] = await db
    .select({
      paymentStatus: ordersTable.paymentStatus,
      paidAt: ordersTable.paidAt,
      paymentMethod: ordersTable.paymentMethod,
      deliveryStatus: ordersTable.deliveryStatus,
      ttn: ordersTable.ttn,
      companyId: ordersTable.companyId,
    })
    .from(ordersTable)
    .leftJoin(companiesTable, eq(ordersTable.companyId, companiesTable.id))
    .where(and(
      eq(ordersTable.id, params.data.orderId),
      managerScope === null ? undefined : inArray(sql`lower(${companiesTable.manager})`, managerScope),
    ))
    .limit(1);
  if (!existingOrder) {
    res.status(404).json(errorBody("Замовлення не знайдено."));
    return;
  }
  const nextPayment = resolvePaymentStatus({
    paymentMethod: parsed.data.paymentMethod ?? orderUpdate.paymentMethod ?? null,
    paymentStatus: parsed.data.paymentStatus ?? orderUpdate.paymentStatus ?? existingOrder.paymentStatus,
    deliveryStatus: existingOrder.deliveryStatus,
  });
  const paidAtUpdate = parsed.data.paymentStatus === undefined && parsed.data.paymentMethod === undefined
    ? {}
    : { paymentStatus: nextPayment.paymentStatus, paidAt: nextPayment.paidAt };
  const [order] = await db
    .update(ordersTable)
    .set({
      ...orderUpdate,
      ...paidAtUpdate,
      ...(orderDate !== undefined
        ? { orderDate: orderDate?.toISOString().slice(0, 10) ?? null }
        : {}),
      ...(arrivalDate !== undefined
        ? { arrivalDate: arrivalDate?.toISOString() ?? null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, params.data.orderId))
    .returning();
  if (!order) {
    res.status(404).json(errorBody("Замовлення не знайдено."));
    return;
  }
  if (order.companyId !== null) {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, order.companyId)).limit(1);
    await addActivity({
      companyId: order.companyId,
      kind: "status",
      title: "Оновлено замовлення",
      details: `${order.code} · ${order.stage}`,
      createdBy: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
    });
  }
  if (parsed.data.ttn !== undefined && order.ttn?.trim() && order.ttn !== existingOrder.ttn) {
    queueNovaPoshtaOrderRefresh(order.id);
  }
  res.json(UpdateOrderResponse.parse(toOrder(order)));
});

router.post("/crm/orders/:orderId/nova-poshta-status", async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    res.status(400).json(errorBody("Невірний номер замовлення."));
    return;
  }
  try {
    const updated = await refreshNovaPoshtaOrderStatus(orderId);
    res.json(UpdateOrderResponse.parse(toOrder(updated)));
  } catch (error) {
    if (error instanceof NovaPoshtaTrackingError) {
      res.status(error.statusCode).json(errorBody(error.message));
      return;
    }
    throw error;
  }
});

router.delete("/orders/:orderId", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(errorBody(params.error.message));
    return;
  }

  const actor = getAuthenticatedUser(res);
  const deleted = await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(ordersTable)
      .where(eq(ordersTable.id, params.data.orderId))
      .returning({ id: ordersTable.id, code: ordersTable.code });
    if (!removed) return null;
    await tx.insert(adminAuditLogsTable).values({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: "delete_order",
      entityType: "order",
      entityId: removed.id,
      summary: `Видалено замовлення ${removed.code || `#${removed.id}`}`,
    });
    return removed;
  });
  if (!deleted) {
    res.status(404).json(errorBody("Замовлення не знайдено."));
    return;
  }
  res.status(204).end();
});

router.post("/companies/:companyId/tasks", async (req, res): Promise<void> => {
  const params = CreateTaskParams.safeParse(req.params);
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success ? params.error.message : parsed.error?.message ?? "Невірні дані.";
    res.status(400).json(errorBody(message));
    return;
  }
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const [company] = await db.select().from(companiesTable).where(and(
    eq(companiesTable.id, params.data.companyId),
    managerScopeCondition(managerScope),
  )).limit(1);
  if (!company) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  const [task] = await db
    .insert(tasksTable)
    .values({
      companyId: company.id,
      title: parsed.data.title.trim(),
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      assignee: parsed.data.assignee.trim() || getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
    })
    .returning();
  await addActivity({
    companyId: company.id,
    kind: "task",
    title: "Створено нагадування",
    details: task.title,
    createdBy: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
  });
  res.status(201).json(CreateTaskResponse.parse(toTask(task)));
});

router.patch("/tasks/:taskId", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success ? params.error.message : parsed.error?.message ?? "Невірні дані.";
    res.status(400).json(errorBody(message));
    return;
  }
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const [existing] = await db
    .select({ task: tasksTable })
    .from(tasksTable)
    .innerJoin(companiesTable, eq(tasksTable.companyId, companiesTable.id))
    .where(and(
      eq(tasksTable.id, params.data.taskId),
      managerScopeCondition(managerScope),
    ))
    .limit(1)
    .then((rows) => rows.map(({ task }) => task));
  if (!existing) {
    res.status(404).json(errorBody("Нагадування не знайдено."));
    return;
  }
  const isCompleted = parsed.data.isCompleted ?? existing.isCompleted;
  const [task] = await db
    .update(tasksTable)
    .set({
      ...parsed.data,
      ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.assignee !== undefined ? { assignee: parsed.data.assignee.trim() } : {}),
      ...(parsed.data.dueAt !== undefined ? { dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null } : {}),
      completedAt: isCompleted ? existing.completedAt ?? new Date() : null,
    })
    .where(eq(tasksTable.id, existing.id))
    .returning();
  await addActivity({
    companyId: task.companyId,
    kind: "task",
    title: isCompleted ? "Нагадування виконано" : "Оновлено нагадування",
    details: task.title,
    createdBy: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
  });
  res.json(UpdateTaskResponse.parse(toTask(task)));
});

router.post("/companies/:companyId/notes", async (req, res): Promise<void> => {
  const params = CreateNoteParams.safeParse(req.params);
  const parsed = CreateNoteBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success ? params.error.message : parsed.error?.message ?? "Невірні дані.";
    res.status(400).json(errorBody(message));
    return;
  }
  const managerScope = await getManagerScope(getAuthenticatedUser(res));
  const [company] = await db.select().from(companiesTable).where(and(
    eq(companiesTable.id, params.data.companyId),
    managerScopeCondition(managerScope),
  )).limit(1);
  if (!company) {
    res.status(404).json(errorBody("Компанію не знайдено."));
    return;
  }
  const activity = await addActivity({
    companyId: company.id,
    kind: "note",
    title: parsed.data.title.trim(),
    details: parsed.data.details ?? null,
    createdBy: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
  });
  res.status(201).json(CreateNoteResponse.parse(activity));
});

export default router;