import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
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
  activitiesTable,
  analyticsSettingsTable,
  companiesTable,
  contactsTable,
  db,
  ordersTable,
  tasksTable,
} from "@workspace/db";
import {
  NovaPoshtaTrackingError,
  queueNovaPoshtaOrderRefresh,
  refreshNovaPoshtaOrderStatus,
} from "../lib/nova-poshta-tracking";

const router: IRouter = Router();
const completedStage = "Успішно реалізовано";
const autoPaidPaymentMethods = new Set(["промоплата", "лікпей", "ізіпей", "безготівкова"]);

function getCurrentManager(user?: { email?: string | null } | null): string {
  const email = user?.email?.trim();
  return email || "Не призначено";
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

async function getCompanyDetail(companyId: number) {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (!company) return null;

  const [contacts, orders, tasks, activity] = await Promise.all([
    db.select().from(contactsTable).where(eq(contactsTable.companyId, companyId)).orderBy(desc(contactsTable.createdAt)),
    db.select().from(ordersTable).where(eq(ordersTable.companyId, companyId)).orderBy(desc(ordersTable.createdAt)),
    db.select().from(tasksTable).where(eq(tasksTable.companyId, companyId)).orderBy(desc(tasksTable.createdAt)),
    db.select().from(activitiesTable).where(eq(activitiesTable.companyId, companyId)).orderBy(desc(activitiesTable.createdAt)),
  ]);

  return {
    ...toCompany(company),
    contacts: contacts.map(toContact),
    orders: orders.map(toOrder),
    tasks: tasks.map(toTask),
    activity: activity.map(toActivity),
  };
}

router.get("/crm/summary", async (req, res): Promise<void> => {
  const [companies, orders, overdueTasks] = await Promise.all([
    db.select({ id: companiesTable.id }).from(companiesTable),
    db.select().from(ordersTable),
    db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(and(eq(tasksTable.isCompleted, false), lt(tasksTable.dueAt, new Date()))),
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
  const rows = await db
    .select({
      task: tasksTable,
      companyName: companiesTable.name,
      companyManager: companiesTable.manager,
    })
    .from(tasksTable)
    .innerJoin(companiesTable, eq(tasksTable.companyId, companiesTable.id))
    .orderBy(desc(tasksTable.createdAt));

  const response = rows.map(({ task, companyName, companyManager }) => ({
    ...toTask(task),
    companyName,
    companyManager,
  }));
  res.json(GetCrmTasksResponse.parse(response));
});

router.get("/crm/orders", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      order: ordersTable,
      companyName: companiesTable.name,
    })
    .from(ordersTable)
    .leftJoin(companiesTable, eq(ordersTable.companyId, companiesTable.id))
    .orderBy(desc(ordersTable.createdAt));

  const response = rows.map(({ order, companyName }) => ({
    ...toOrder(order),
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
        .where(sql`regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`)
        .limit(1);
      company = matchedContact?.company;
    }
    if (!company && customerName) {
      const [matchedCompany] = await tx
        .select()
        .from(companiesTable)
        .where(sql`lower(trim(${companiesTable.name})) = ${customerName.toLocaleLowerCase("uk-UA")}`)
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

router.get("/crm/activity", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      activity: activitiesTable,
      companyName: companiesTable.name,
    })
    .from(activitiesTable)
    .innerJoin(companiesTable, eq(activitiesTable.companyId, companiesTable.id))
    .orderBy(desc(activitiesTable.createdAt));

  const response = rows.map(({ activity, companyName }) => ({
    ...toActivity(activity),
    companyName,
  }));
  res.json(GetCrmActivityResponse.parse(response));
});

router.get("/companies", async (req, res): Promise<void> => {
  const parsed = GetCompaniesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(errorBody(parsed.error.message));
    return;
  }

  const currentManager = getCurrentManager(res.locals.authUser as { email?: string | null } | undefined);
  const search = parsed.data.q?.trim();
  const searchCondition = search
    ? or(
        ilike(companiesTable.name, `%${search}%`),
        ilike(companiesTable.taxId, `%${search}%`),
        ilike(companiesTable.city, `%${search}%`),
        ilike(companiesTable.customerType, `%${search}%`),
      )
    : undefined;

  const [companies, contacts, orders, tasks] = await Promise.all([
    db.select().from(companiesTable).where(searchCondition).orderBy(desc(companiesTable.updatedAt)),
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
        return company.manager === currentManager;
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

router.get("/companies/:companyId", async (req, res): Promise<void> => {
  const params = GetCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(errorBody(params.error.message));
    return;
  }
  const detail = await getCompanyDetail(params.data.companyId);
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
  const [company] = await db
    .update(companiesTable)
    .set({
      ...parsed.data,
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      manager: getCurrentManager(res.locals.authUser as { email?: string | null } | undefined),
      updatedAt: new Date(),
    })
    .where(eq(companiesTable.id, params.data.companyId))
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
  const detail = await getCompanyDetail(company.id);
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
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
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
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
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
  const { arrivalDate, orderDate, ...orderUpdate } = parsed.data;
  const [existingOrder] = await db
    .select({
      paymentStatus: ordersTable.paymentStatus,
      paidAt: ordersTable.paidAt,
      paymentMethod: ordersTable.paymentMethod,
      deliveryStatus: ordersTable.deliveryStatus,
      ttn: ordersTable.ttn,
    })
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.orderId))
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

  const [deleted] = await db
    .delete(ordersTable)
    .where(eq(ordersTable.id, params.data.orderId))
    .returning({ id: ordersTable.id });
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
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
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
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.taskId)).limit(1);
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
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
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