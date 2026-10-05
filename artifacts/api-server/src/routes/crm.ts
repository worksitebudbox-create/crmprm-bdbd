import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
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
  companiesTable,
  contactsTable,
  db,
  ordersTable,
  tasksTable,
} from "@workspace/db";

const router: IRouter = Router();
const defaultManager = "Олена Кравчук";
const completedStage = "Успішно реалізовано";

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;
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
      createdBy: input.createdBy?.trim() || defaultManager,
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
    .innerJoin(companiesTable, eq(ordersTable.companyId, companiesTable.id))
    .orderBy(desc(ordersTable.createdAt));

  const response = rows.map(({ order, companyName }) => ({
    ...toOrder(order),
    companyName,
  }));
  res.json(GetCrmOrdersResponse.parse(response));
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
    if (order.stage === completedStage) continue;
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
        return company.manager === defaultManager;
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
  if (!input.name.trim() || !input.manager.trim()) {
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
      manager: input.manager.trim(),
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
      ...(parsed.data.manager !== undefined ? { manager: parsed.data.manager.trim() } : {}),
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
    createdBy: company.manager,
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
    createdBy: company.manager,
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
  const [order] = await db
    .insert(ordersTable)
    .values({
      companyId: company.id,
      code: parsed.data.code?.trim() || "Нова угода",
      stage: parsed.data.stage,
      amountUah: parsed.data.amountUah,
      ttn: parsed.data.ttn ?? null,
      deliveryStatus: parsed.data.deliveryStatus ?? null,
    })
    .returning();
  const code = parsed.data.code?.trim() || `BB-${String(order.id).padStart(5, "0")}`;
  const [savedOrder] = code === order.code
    ? [order]
    : await db.update(ordersTable).set({ code, updatedAt: new Date() }).where(eq(ordersTable.id, order.id)).returning();
  await addActivity({
    companyId: company.id,
    kind: "order",
    title: "Створено замовлення",
    details: `${savedOrder.code} · ${savedOrder.amountUah.toLocaleString("uk-UA")} ₴`,
    createdBy: company.manager,
  });
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
  const [order] = await db
    .update(ordersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(ordersTable.id, params.data.orderId))
    .returning();
  if (!order) {
    res.status(404).json(errorBody("Замовлення не знайдено."));
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, order.companyId)).limit(1);
  await addActivity({
    companyId: order.companyId,
    kind: "status",
    title: "Оновлено замовлення",
    details: `${order.code} · ${order.stage}`,
    createdBy: company?.manager ?? defaultManager,
  });
  res.json(UpdateOrderResponse.parse(toOrder(order)));
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
      assignee: parsed.data.assignee.trim() || company.manager,
    })
    .returning();
  await addActivity({
    companyId: company.id,
    kind: "task",
    title: "Створено нагадування",
    details: task.title,
    createdBy: task.assignee,
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
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, task.companyId)).limit(1);
  await addActivity({
    companyId: task.companyId,
    kind: "task",
    title: isCompleted ? "Нагадування виконано" : "Оновлено нагадування",
    details: task.title,
    createdBy: task.assignee || company?.manager,
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
    createdBy: parsed.data.createdBy,
  });
  res.status(201).json(CreateNoteResponse.parse(activity));
});

export default router;