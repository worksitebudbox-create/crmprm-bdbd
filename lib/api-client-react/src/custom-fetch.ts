export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;

declare global {
  interface ImportMeta {
    readonly env?: {
      readonly DEV?: boolean;
      readonly VITE_USE_MOCKS?: string;
    };
  }
}

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

// ---------------------------------------------------------------------------
// Module-level configuration
// ---------------------------------------------------------------------------

let _baseUrl: string | null = null;
let _authTokenGetter: AuthTokenGetter | null = null;

/**
 * Set a base URL that is prepended to every relative request URL
 * (i.e. paths that start with `/`).
 *
 * Useful for Expo bundles that need to call a remote API server.
 * Pass `null` to clear the base URL.
 */
export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

/**
 * Register a getter that supplies a bearer auth token.  Before every fetch
 * the getter is invoked; when it returns a non-null string, an
 * `Authorization: Bearer <token>` header is attached to the request.
 *
 * Useful for Expo bundles making token-gated API calls.
 * Pass `null` to clear the getter.
 *
 * NOTE: This function should never be used in web applications where session
 * token cookies are automatically associated with API calls by the browser.
 */
export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _authTokenGetter = getter;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

// Use loose check for URL — some runtimes (e.g. React Native) polyfill URL
// differently, so `instanceof URL` can fail.
function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!_baseUrl) return input;
  const url = resolveUrl(input);
  // Only prepend to relative paths (starting with /)
  if (!url.startsWith("/")) return input;

  const absolute = `${_baseUrl}${url}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0].trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

// Use strict equality: in browsers, `response.body` is `null` when the
// response genuinely has no content.  In React Native, `response.body` is
// always `undefined` because the ReadableStream API is not implemented —
// even when the response carries a full payload readable via `.text()` or
// `.json()`.  Loose equality (`== null`) matches both `null` and `undefined`,
// which causes every React Native response to be treated as empty.
function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body === null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;

  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;

  return prefix;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(
    response: Response,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string },
  ) {
    super(
      `Failed to parse response from ${requestInfo.method} ${response.url || requestInfo.url} ` +
        `(${response.status} ${response.statusText}) as JSON`,
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  // Fall back to text when blob() is unavailable (e.g. some React Native builds).
  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType =
    responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          "Blob responses are not supported in this runtime. " +
            "Use responseType \"json\" or \"text\" instead.",
        );
      }
      return response.blob();
  }
}

const mockApiEnabled =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_MOCKS === "true";

function getCurrentMockManagerName(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("budbox-manager");
    if (stored && stored.trim()) return stored.trim();
  }
  return "Не призначено";
}

const makeIso = (date = new Date()) => new Date(date).toISOString();
type MockCompany = {
  id: number;
  name: string;
  taxId: string | null;
  customerType: string;
  city: string | null;
  manager: string;
  warehouse: string | null;
  paymentForm: string;
  creditLimitUah: number;
  paymentTermsDays: number;
  discountPercent: number;
  priceTier: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};
type MockContact = {
  id: number;
  companyId: number;
  fullName: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  viber: string | null;
  createdAt: string;
};
type MockOrder = {
  id: number;
  companyId: number | null;
  code: string;
  stage: string;
  amountUah: number;
  ttn: string | null;
  deliveryStatus: string | null;
  sender?: string | null;
  warehouse?: string | null;
  customerName?: string | null;
  phone?: string | null;
  itemCount?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  paidAt?: string | null;
  marketingSource?: string | null;
  orderDate?: string | null;
  arrivalDate?: string | null;
  createdAt: string;
  updatedAt: string;
};
type MockTask = {
  id: number;
  companyId: number;
  title: string;
  dueAt: string | null;
  assignee: string;
  isCompleted: boolean;
  createdAt: string;
  completedAt: string | null;
};
type MockActivity = {
  id: number;
  companyId: number;
  kind: string;
  title: string;
  details: string | null;
  createdBy: string;
  createdAt: string;
};

const initialCompanies: MockCompany[] = [
  { id: 1, name: "ТОВ «Моноліт Буд Груп»", taxId: "43821657", customerType: "Будмайданчик", city: "Київ", manager: "Олена Кравчук", warehouse: "Київ · Бориспільська", paymentForm: "ПДВ", creditLimitUah: 180000, paymentTermsDays: 14, discountPercent: 12, priceTier: "Прайс «Будівельний»", source: "Рекомендація партнера", createdAt: "2025-06-01T08:00:00.000Z", updatedAt: "2025-06-20T14:00:00.000Z" },
  { id: 2, name: "ФОП Петренко Дмитро Олегович", taxId: "3018841297", customerType: "Виконроб", city: "Бровари", manager: "Тарас Бондар", warehouse: "Бровари · промзона", paymentForm: "ФОП", creditLimitUah: 45000, paymentTermsDays: 0, discountPercent: 8, priceTier: "Прайс «Профі»", source: "Вхідний дзвінок", createdAt: "2025-06-11T09:00:00.000Z", updatedAt: "2025-06-18T10:00:00.000Z" },
  { id: 3, name: "ПП «Львівбуд Комплект»", taxId: "39572061", customerType: "Опт", city: "Львів", manager: "Марія Гнатюк", warehouse: "Львів · вул. Городоцька", paymentForm: "ПДВ", creditLimitUah: 250000, paymentTermsDays: 21, discountPercent: 15, priceTier: "Прайс «Оптовий»", source: "Виставка InterBuild", createdAt: "2025-05-30T07:30:00.000Z", updatedAt: "2025-06-17T12:15:00.000Z" },
  { id: 4, name: "ТОВ «Карпатський Дім»", taxId: "41295830", customerType: "Партнер", city: "Івано-Франківськ", manager: "Марія Гнатюк", warehouse: "Івано-Франківськ · Калуське шосе", paymentForm: "ПДВ", creditLimitUah: 90000, paymentTermsDays: 7, discountPercent: 10, priceTier: "Прайс «Партнерський»", source: "Сайт budbox.ua", createdAt: "2025-05-28T09:45:00.000Z", updatedAt: "2025-06-16T15:30:00.000Z" },
];

const initialContacts: MockContact[] = [
  { id: 1, companyId: 1, fullName: "Андрій Мельник", role: "Виконроб", phone: "+380 67 418 29 51", email: "a.melnyk@monolitbud.ua", telegram: "@amelnyk", viber: null, createdAt: "2025-06-12T09:00:00.000Z" },
  { id: 2, companyId: 1, fullName: "Ірина Савчук", role: "Бухгалтерка", phone: "+380 50 772 14 06", email: "i.savchuk@monolitbud.ua", telegram: null, viber: null, createdAt: "2025-06-13T10:20:00.000Z" },
  { id: 3, companyId: 2, fullName: "Дмитро Петренко", role: "Власник", phone: "+380 93 704 81 26", email: "d.petrenko@protonmail.com", telegram: "@petrenko_dm", viber: null, createdAt: "2025-06-14T13:10:00.000Z" },
  { id: 4, companyId: 3, fullName: "Роман Коваль", role: "Директор", phone: "+380 67 220 48 93", email: "office@lvivbudkomplekt.ua", telegram: "@romankoval", viber: null, createdAt: "2025-06-15T08:50:00.000Z" },
  { id: 5, companyId: 3, fullName: "Наталія Бойко", role: "Закупівельниця", phone: "+380 63 921 77 40", email: "n.boiko@lvivbudkomplekt.ua", telegram: null, viber: "+380639217740", createdAt: "2025-06-16T07:50:00.000Z" },
  { id: 6, companyId: 4, fullName: "Олег Скрипник", role: "Керівник проєкту", phone: "+380 68 119 48 71", email: "o.skrypnyk@karpatskydim.ua", telegram: "@oleg_karpaty", viber: null, createdAt: "2025-06-17T09:00:00.000Z" },
];

const initialOrders: MockOrder[] = [
  { id: 1, companyId: 1, code: "ЗАМ-10482", stage: "Відправлено", amountUah: 68450, ttn: "2045 0012 8471 56", deliveryStatus: "У дорозі · прибуття сьогодні", paymentStatus: "Неоплачено", paidAt: null, createdAt: "2025-06-17T15:05:00.000Z", updatedAt: "2025-06-18T09:12:00.000Z" },
  { id: 2, companyId: 2, code: "ЗАМ-10501", stage: "Уточнення деталей", amountUah: 24800, ttn: null, deliveryStatus: "Очікує підтвердження", paymentStatus: "Неоплачено", paidAt: null, createdAt: "2025-06-17T12:10:00.000Z", updatedAt: "2025-06-18T08:35:00.000Z" },
  { id: 3, companyId: 3, code: "ЗАМ-10496", stage: "Рахунок / передоплата", amountUah: 126780, ttn: null, deliveryStatus: "Після оплати", paymentStatus: "Неоплачено", paidAt: null, createdAt: "2025-06-16T14:40:00.000Z", updatedAt: "2025-06-17T10:02:00.000Z" },
  { id: 4, companyId: 4, code: "ЗАМ-10458", stage: "Успішно реалізовано", amountUah: 94120, ttn: "2045 3399 1188 21", deliveryStatus: "Доставлено", paymentStatus: "Оплачено", paidAt: "2025-06-15T10:05:00.000Z", createdAt: "2025-06-15T10:05:00.000Z", updatedAt: "2025-06-15T10:05:00.000Z" },
];

const initialTasks: MockTask[] = [
  { id: 1, companyId: 1, title: "Уточнити приймання та потребу на 2-й поверх", dueAt: "2026-10-05T10:30:00.000Z", assignee: "Олена Кравчук", isCompleted: false, createdAt: "2025-06-18T09:00:00.000Z", completedAt: null },
  { id: 2, companyId: 2, title: "Надіслати перерахований кошторис", dueAt: "2026-10-05T14:00:00.000Z", assignee: "Тарас Бондар", isCompleted: false, createdAt: "2025-06-18T08:00:00.000Z", completedAt: null },
  { id: 3, companyId: 3, title: "Перевірити надходження передоплати", dueAt: "2026-10-06T09:00:00.000Z", assignee: "Марія Гнатюк", isCompleted: false, createdAt: "2025-06-18T09:00:00.000Z", completedAt: null },
  { id: 4, companyId: 4, title: "Підтвердити сервісне обслуговування", dueAt: "2025-06-15T12:00:00.000Z", assignee: "Марія Гнатюк", isCompleted: true, createdAt: "2025-06-13T11:00:00.000Z", completedAt: "2025-06-15T11:40:00.000Z" },
];

const initialActivity: MockActivity[] = [
  { id: 1, companyId: 1, kind: "delivery", title: "Перевірено статус доставки", details: "Нова пошта · ТТН 2045 0012 8471 56 · відправлення в дорозі", createdBy: "Олена Кравчук", createdAt: "2025-06-18T09:12:00.000Z" },
  { id: 2, companyId: 1, kind: "order", title: "Замовлення передано перевізнику", details: "ЗАМ-10482 · 68 450 ₴ · склад Бориспільська", createdBy: "Склад", createdAt: "2025-06-18T16:48:00.000Z" },
  { id: 3, companyId: 2, kind: "call", title: "Заявка на матеріали", details: "Уточнює наявність гіпсокартону та профілю для ремонту офісу", createdBy: "Тарас Бондар", createdAt: "2025-06-18T08:35:00.000Z" },
  { id: 4, companyId: 3, kind: "order", title: "Рахунок надіслано клієнту", details: "Рахунок № РА-8714 · 126 780 ₴ · передоплата 50%", createdBy: "Марія Гнатюк", createdAt: "2025-06-17T14:40:00.000Z" },
  { id: 5, companyId: 4, kind: "note", title: "Підтверджено умови співпраці", details: "Партнерська знижка 10% та гнучкий графік поставок", createdBy: "Марія Гнатюк", createdAt: "2025-06-16T15:30:00.000Z" },
];

const mockState = {
  companies: [...initialCompanies],
  contacts: [...initialContacts],
  orders: [...initialOrders],
  tasks: [...initialTasks],
  activity: [...initialActivity],
};

const nextId = <T extends { id: number }>(items: T[]) => Math.max(0, ...items.map((item) => item.id)) + 1;

function getCompanyListItems(q?: string, filter?: string) {
  const search = q?.trim().toLowerCase();
  const rows = [...mockState.companies]
    .filter((company) => {
      if (!search) return true;
      const haystack = [company.name, company.city, company.taxId, company.customerType].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(search);
    })
    .filter((company) => {
      switch (filter) {
        case "mine":
          return company.manager === getCurrentMockManagerName();
        case "hasTasks":
          return mockState.tasks.some((task) => task.companyId === company.id && !task.isCompleted);
        case "overdue":
          return mockState.tasks.some((task) => task.companyId === company.id && !task.isCompleted && task.dueAt && new Date(task.dueAt).getTime() < Date.now());
        default:
          return true;
      }
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((company) => {
      const activeOrders = mockState.orders.filter((order) => order.companyId === company.id && order.stage !== "Успішно реалізовано");
      const pendingTasks = mockState.tasks.filter((task) => task.companyId === company.id && !task.isCompleted).sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER) - (b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER));
      return {
        ...company,
        activeOrder: activeOrders[0] ? { ...activeOrders[0] } : null,
        nextTask: pendingTasks[0] ? { ...pendingTasks[0] } : null,
        overdue: pendingTasks.some((task) => task.dueAt && new Date(task.dueAt).getTime() < Date.now()),
        contactsCount: mockState.contacts.filter((contact) => contact.companyId === company.id).length,
      };
    });

  return rows;
}

function getCompanyDetail(companyId: number) {
  const company = mockState.companies.find((item) => item.id === companyId);
  if (!company) return null;
  return {
    ...company,
    contacts: mockState.contacts.filter((contact) => contact.companyId === companyId),
    orders: mockState.orders.filter((order) => order.companyId === companyId),
    tasks: mockState.tasks.filter((task) => task.companyId === companyId),
    activity: mockState.activity.filter((entry) => entry.companyId === companyId),
  };
}

function getSummary() {
  const activeOrders = mockState.orders.filter((order) => order.stage !== "Успішно реалізовано");
  const overdueTasks = mockState.tasks.filter((task) => !task.isCompleted && task.dueAt && new Date(task.dueAt).getTime() < Date.now()).length;
  return {
    totalCompanies: mockState.companies.length,
    activeOrders: activeOrders.length,
    pipelineValueUah: activeOrders.reduce((sum, order) => sum + order.amountUah, 0),
    overdueTasks,
  };
}

function getTaskBoardItems() {
  return mockState.tasks
    .map((task) => {
      const company = mockState.companies.find((item) => item.id === task.companyId);
      return {
        ...task,
        companyName: company?.name ?? "Без компанії",
        companyManager: company?.manager ?? getCurrentMockManagerName(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function getOrderBoardItems() {
  return mockState.orders
    .map((order) => ({
      ...order,
      companyName: mockState.companies.find((company) => company.id === order.companyId)?.name ?? "Без компанії",
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function getActivityBoardItems() {
  return mockState.activity
    .map((item) => ({
      ...item,
      companyName: mockState.companies.find((company) => company.id === item.companyId)?.name ?? "Без компанії",
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function mockFetch<T = unknown>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const url = resolveUrl(input);
  const requestUrl = new URL(url, "http://localhost");
  const path = requestUrl.pathname;
  const method = resolveMethod(input, init.method);
  const body =
    typeof init.body === "string"
      ? JSON.parse(init.body || "{}")
      : init.body && typeof init.body === "object" && !(init.body instanceof FormData)
        ? Object.fromEntries(new URLSearchParams(String(init.body)))
        : {};

  if (path === "/api/healthz") {
    return { status: "ok" } as T;
  }
  if (path === "/api/crm/summary") {
    return getSummary() as T;
  }
  if (path === "/api/crm/tasks") {
    return getTaskBoardItems() as T;
  }
  if (path === "/api/crm/orders") {
    if (method === "POST") {
      const id = nextId(mockState.orders);
      const lastNumber = mockState.orders.reduce((max, order) => {
        const match = String(order.code ?? "").match(/(\d+)$/);
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      const item = {
        id,
        companyId: null,
        code: String(body.code ?? "").trim() || `ЗАМ-${String(lastNumber + 1).padStart(5, "0")}`,
        stage: body.stage || "Новий лід",
        amountUah: Number(body.amountUah ?? 0),
        ttn: body.ttn ?? null,
        deliveryStatus: body.deliveryStatus ?? null,
        sender: body.sender ?? null,
        warehouse: body.warehouse ?? null,
        customerName: body.customerName ?? null,
        phone: body.phone ?? null,
        itemCount: body.itemCount ?? null,
        paymentMethod: body.paymentMethod ?? null,
        paymentStatus: body.paymentStatus ?? "Неоплачено",
        paidAt: body.paymentStatus === "Оплачено" ? makeIso() : null,
        marketingSource: body.marketingSource ?? null,
        orderDate: body.orderDate ?? null,
        arrivalDate: body.arrivalDate ?? null,
        createdAt: makeIso(),
        updatedAt: makeIso(),
      };
      mockState.orders.push(item);
      return item as T;
    }
    return getOrderBoardItems() as T;
  }
  if (path === "/api/crm/activity") {
    return getActivityBoardItems() as T;
  }

  if (path === "/api/companies") {
    if (method === "GET") {
      return getCompanyListItems(requestUrl.searchParams.get("q") ?? undefined, requestUrl.searchParams.get("filter") ?? undefined) as T;
    }
    if (method === "POST") {
      const company = {
        id: nextId(mockState.companies),
        name: String(body.name ?? "").trim() || "Нова компанія",
        taxId: body.taxId ?? null,
        customerType: body.customerType || "Виконроб",
        city: body.city ?? null,
        manager: getCurrentMockManagerName(),
        warehouse: body.warehouse ?? null,
        paymentForm: body.paymentForm || "ПДВ",
        creditLimitUah: Number(body.creditLimitUah ?? 0),
        paymentTermsDays: Number(body.paymentTermsDays ?? 0),
        discountPercent: Number(body.discountPercent ?? 0),
        priceTier: body.priceTier ?? null,
        source: body.source ?? null,
        createdAt: makeIso(),
        updatedAt: makeIso(),
      };
      mockState.companies.push(company);
      mockState.activity.push({ id: nextId(mockState.activity), companyId: company.id, kind: "status", title: "Створено картку компанії", details: company.name, createdBy: company.manager, createdAt: makeIso() });
      return getCompanyDetail(company.id) as T;
    }
  }

  const companyMatch = path.match(/^\/api\/companies\/(\d+)$/);
  if (companyMatch) {
    const companyId = Number(companyMatch[1]);
    if (method === "GET") {
      const detail = getCompanyDetail(companyId);
      if (!detail) throw new Error("Компанію не знайдено.");
      return detail as T;
    }
    if (method === "PATCH") {
      const company = mockState.companies.find((item) => item.id === companyId);
      if (!company) throw new Error("Компанію не знайдено.");
      Object.assign(company, { ...company, ...body, name: String(body.name ?? company.name).trim() || company.name, manager: getCurrentMockManagerName(), updatedAt: makeIso() });
      mockState.activity.push({ id: nextId(mockState.activity), companyId, kind: "status", title: "Оновлено картку компанії", details: null, createdBy: company.manager, createdAt: makeIso() });
      return getCompanyDetail(companyId) as T;
    }
  }

  const contactMatch = path.match(/^\/api\/companies\/(\d+)\/contacts$/);
  if (contactMatch) {
    const companyId = Number(contactMatch[1]);
    if (method === "POST") {
      const item = {
        id: nextId(mockState.contacts),
        companyId,
        fullName: String(body.fullName ?? "").trim(),
        role: body.role ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        telegram: body.telegram ?? null,
        viber: body.viber ?? null,
        createdAt: makeIso(),
      };
      mockState.contacts.push(item);
      mockState.activity.push({ id: nextId(mockState.activity), companyId, kind: "contact", title: "Додано контакт", details: item.fullName, createdBy: getCurrentMockManagerName(), createdAt: makeIso() });
      return item as T;
    }
  }

  const orderMatch = path.match(/^\/api\/companies\/(\d+)\/orders$/);
  if (orderMatch) {
    const companyId = Number(orderMatch[1]);
    if (method === "POST") {
      const id = nextId(mockState.orders);
      const item = {
        id,
        companyId,
        code: String(body.code ?? "").trim() || `ЗАМ-${String(id).padStart(5, "0")}`,
        stage: body.stage || "Новий лід",
        amountUah: Number(body.amountUah ?? 0),
        ttn: body.ttn ?? null,
        deliveryStatus: body.deliveryStatus ?? null,
        sender: body.sender ?? null,
        warehouse: body.warehouse ?? null,
        customerName: body.customerName ?? null,
        phone: body.phone ?? null,
        itemCount: body.itemCount ?? null,
        paymentMethod: body.paymentMethod ?? null,
        paymentStatus: body.paymentStatus ?? "Неоплачено",
        paidAt: body.paymentStatus === "Оплачено" ? makeIso() : null,
        marketingSource: body.marketingSource ?? null,
        orderDate: body.orderDate ?? null,
        arrivalDate: body.arrivalDate ?? null,
        createdAt: makeIso(),
        updatedAt: makeIso(),
      };
      mockState.orders.push(item);
      mockState.activity.push({ id: nextId(mockState.activity), companyId, kind: "order", title: "Створено замовлення", details: `${item.code} · ${item.amountUah} ₴`, createdBy: getCurrentMockManagerName(), createdAt: makeIso() });
      return item as T;
    }
  }

  const taskMatch = path.match(/^\/api\/companies\/(\d+)\/tasks$/);
  if (taskMatch) {
    const companyId = Number(taskMatch[1]);
    if (method === "POST") {
      const item = {
        id: nextId(mockState.tasks),
        companyId,
        title: String(body.title ?? "").trim(),
        dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : null,
        assignee: String(body.assignee ?? "").trim() || getCurrentMockManagerName(),
        isCompleted: false,
        createdAt: makeIso(),
        completedAt: null,
      };
      mockState.tasks.push(item);
      mockState.activity.push({ id: nextId(mockState.activity), companyId, kind: "task", title: "Створено завдання", details: item.title, createdBy: item.assignee, createdAt: makeIso() });
      return item as T;
    }
  }

  const noteMatch = path.match(/^\/api\/companies\/(\d+)\/notes$/);
  if (noteMatch) {
    const companyId = Number(noteMatch[1]);
    if (method === "POST") {
      const item = {
        id: nextId(mockState.activity),
        companyId,
        kind: "note",
        title: String(body.title ?? "").trim(),
        details: body.details ?? null,
        createdBy: getCurrentMockManagerName(),
        createdAt: makeIso(),
      };
      mockState.activity.push(item);
      return item as T;
    }
  }

  const orderIdMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (orderIdMatch && method === "PATCH") {
    const order = mockState.orders.find((item) => item.id === Number(orderIdMatch[1]));
    if (!order) throw new Error("Замовлення не знайдено.");
    const wasPaid = order.paymentStatus === "Оплачено";
    const isBeingMarkedPaid = body.paymentStatus === "Оплачено";
    Object.assign(order, {
      ...order,
      ...body,
      ...(body.paymentStatus !== undefined
        ? { paidAt: isBeingMarkedPaid ? (wasPaid ? order.paidAt ?? makeIso() : makeIso()) : null }
        : {}),
      updatedAt: makeIso(),
    });
    return order as T;
  }

  const taskIdMatch = path.match(/^\/api\/tasks\/(\d+)$/);
  if (taskIdMatch && method === "PATCH") {
    const task = mockState.tasks.find((item) => item.id === Number(taskIdMatch[1]));
    if (!task) throw new Error("Завдання не знайдено.");
    Object.assign(task, { ...task, ...body, completedAt: body.isCompleted ? makeIso() : null, updatedAt: makeIso() });
    return task as T;
  }

  throw new Error(`Mock API route not implemented: ${method} ${path}`);
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
): Promise<T> {
  input = applyBaseUrl(input);
  const { responseType = "auto", headers: headersInit, ...init } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);

  if (
    typeof init.body === "string" &&
    !headers.has("content-type") &&
    looksLikeJson(init.body)
  ) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  // Attach bearer token when an auth getter is configured and no
  // Authorization header has been explicitly provided.
  if (_authTokenGetter && !headers.has("authorization")) {
    const token = await _authTokenGetter();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  const requestInfo = { method, url: resolveUrl(input) };

  if (mockApiEnabled && requestInfo.url.startsWith("/api/")) {
    return mockFetch<T>(input, { ...init, method, headers });
  }

  const response = await fetch(input, { ...init, method, headers });

  if (!response.ok) {
    const errorData = await parseErrorBody(response, method);
    throw new ApiError(response, errorData, requestInfo);
  }

  return (await parseSuccessBody(response, responseType, requestInfo)) as T;
}
