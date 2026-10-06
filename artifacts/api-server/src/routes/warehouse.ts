import { createSign } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, warehouseStockSnapshotsTable } from "@workspace/db";
import type { WarehouseStockSnapshot } from "@workspace/db";

const router: IRouter = Router();
const sheetsReadonlyScope = "https://www.googleapis.com/auth/spreadsheets.readonly";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const sheetsApi = "https://sheets.googleapis.com/v4/spreadsheets";
const aliases = {
  sku: ["артикул", "sku", "код товару"],
  name: ["назва", "товар", "найменування", "name"],
  quantity: ["залишок", "кількість", "кількість на складі", "stock", "quantity"],
};

type ServiceAccountToken = { accessToken: string; expiresAt: number };
let cachedToken: ServiceAccountToken | null = null;

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function createServiceAccountAssertion(email: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: email,
    scope: sheetsReadonlyScope,
    aud: tokenEndpoint,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;
  const email = process.env["GOOGLE_SERVICE_ACCOUNT_EMAIL"];
  const configuredKey = process.env["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"];
  if (!email || !configuredKey) {
    throw new Error("Google Sheets недоступний: додайте GOOGLE_SERVICE_ACCOUNT_EMAIL і GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY до Secrets.");
  }
  const privateKey = configuredKey.replace(/\\n/g, "\n");
  const assertion = createServiceAccountAssertion(email, privateKey);
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Google OAuth відхилив service account (${response.status}). Перевірте ключ і доступ до Google Sheets API.`);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("access_token" in result) || typeof result.access_token !== "string") {
    throw new Error("Google OAuth повернув некоректну відповідь без access token.");
  }
  const expiresIn = "expires_in" in result && typeof result.expires_in === "number" ? result.expires_in : 3600;
  cachedToken = { accessToken: result.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return cachedToken.accessToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStockSnapshot(value: unknown): value is Pick<WarehouseStockSnapshot, "items" | "fileName"> {
  if (!isRecord(value) || typeof value["fileName"] !== "string" || !value["fileName"].trim()) return false;
  const items = value["items"];
  return Array.isArray(items) && items.length > 0 && items.length <= 100_000 && items.every((item) =>
    isRecord(item) &&
    typeof item["sku"] === "string" && Boolean(item["sku"].trim()) &&
    typeof item["name"] === "string" && Boolean(item["name"].trim()) &&
    typeof item["totalQuantity"] === "number" && Number.isFinite(item["totalQuantity"]) &&
    Array.isArray(item["locations"]) &&
    item["locations"].every((location) =>
      isRecord(location) &&
      typeof location["name"] === "string" && Boolean(location["name"].trim()) &&
      typeof location["quantity"] === "number" && Number.isFinite(location["quantity"]),
    ),
  );
}

function normalizeHeader(value: unknown): string {
  return typeof value === "string" ? value.toLocaleLowerCase("uk-UA").replace(/[\s_]+/g, " ").trim() : "";
}

function getColumn(headers: unknown[], choices: string[]): number {
  return headers.findIndex((header) => choices.includes(normalizeHeader(header)));
}

function parseStockRows(rows: unknown): Array<{ sku: string; name: string; quantity: number }> {
  if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(rows[0])) {
    throw new Error("У вибраному аркуші немає рядків із товарами.");
  }
  const headers = rows[0] as unknown[];
  const skuIndex = getColumn(headers, aliases.sku);
  const nameIndex = getColumn(headers, aliases.name);
  const quantityIndex = getColumn(headers, aliases.quantity);
  if (skuIndex < 0 || nameIndex < 0 || quantityIndex < 0) {
    throw new Error("Не знайдено колонки «Артикул», «Назва» та «Залишок» у першому рядку аркуша.");
  }

  const items = (rows as unknown[][]).slice(1).map((row, index) => {
    const sku = row[skuIndex] == null ? "" : String(row[skuIndex]).trim();
    const name = row[nameIndex] == null ? "" : String(row[nameIndex]).trim();
    const quantityText = row[quantityIndex] == null ? "" : String(row[quantityIndex]).replace(/\s/g, "").replace(",", ".");
    const quantity = Number(quantityText);
    if (!sku || !name || !Number.isFinite(quantity) || quantity < 0) {
      throw new Error(`Перевірте дані в рядку ${index + 2}: потрібні артикул, назва та невід'ємний залишок.`);
    }
    return { sku, name, quantity };
  });
  if (!items.length) throw new Error("Не знайдено товарів для синхронізації.");
  return items;
}

router.get("/crm/warehouse/stock", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const [stored] = await db
    .select({ snapshot: warehouseStockSnapshotsTable.snapshot })
    .from(warehouseStockSnapshotsTable)
    .where(eq(warehouseStockSnapshotsTable.id, 1))
    .limit(1);
  res.json({ snapshot: stored?.snapshot ?? null });
});

router.put("/crm/warehouse/stock", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (!isStockSnapshot(req.body)) {
    res.status(400).json({ error: "Некоректний файл залишків: перевірте коди, назви та кількості товарів." });
    return;
  }
  const snapshot: WarehouseStockSnapshot = { ...req.body, updatedAt: new Date().toISOString() };
  await db
    .insert(warehouseStockSnapshotsTable)
    .values({ id: 1, snapshot, updatedAt: new Date(snapshot.updatedAt) })
    .onConflictDoUpdate({
      target: warehouseStockSnapshotsTable.id,
      set: { snapshot, updatedAt: new Date(snapshot.updatedAt) },
    });
  res.json({ snapshot });
});

router.get("/crm/warehouse/google-sheets-stock", async (req, res): Promise<void> => {
  const spreadsheetId = req.query["spreadsheetId"];
  const gid = req.query["gid"] ?? "0";
  const configuredSpreadsheetId = process.env["GOOGLE_SHEETS_SPREADSHEET_ID"];
  const configuredGid = process.env["GOOGLE_SHEETS_GID"];
  if (!configuredSpreadsheetId || !configuredGid) {
    res.status(503).json({ error: "Налаштуйте GOOGLE_SHEETS_SPREADSHEET_ID і GOOGLE_SHEETS_GID у Secrets для дозволеного аркуша залишків." });
    return;
  }
  if (
    typeof spreadsheetId !== "string" ||
    !/^[a-zA-Z0-9_-]{20,200}$/.test(spreadsheetId) ||
    typeof gid !== "string" ||
    !/^\d{1,20}$/.test(gid)
  ) {
    res.status(400).json({ error: "Перевірте ID таблиці та номер аркуша (gid)." });
    return;
  }
  if (spreadsheetId !== configuredSpreadsheetId || gid !== configuredGid) {
    res.status(403).json({ error: "Дозволена лише налаштована таблиця та аркуш залишків." });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const metadataResponse = await fetch(
      `${sheetsApi}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`,
      { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (metadataResponse.status === 401 || metadataResponse.status === 403) {
      res.status(403).json({ error: "Google відхилив доступ до таблиці. Поділіться нею з service account як із читачем і перевірте, що Google Sheets API увімкнений." });
      return;
    }
    if (!metadataResponse.ok) {
      res.status(502).json({ error: `Google Sheets API повернув помилку ${metadataResponse.status}.` });
      return;
    }

    const metadata: unknown = await metadataResponse.json();
    const sheets = isRecord(metadata) && Array.isArray(metadata["sheets"]) ? metadata["sheets"] : [];
    const targetSheet = sheets.find((sheet) =>
      isRecord(sheet) &&
      isRecord(sheet["properties"]) &&
      String(sheet["properties"]["sheetId"]) === gid &&
      typeof sheet["properties"]["title"] === "string",
    );
    if (!isRecord(targetSheet) || !isRecord(targetSheet["properties"])) {
      res.status(404).json({ error: `Аркуш із gid=${gid} не знайдено в таблиці.` });
      return;
    }
    const title = targetSheet["properties"]["title"];
    if (typeof title !== "string") {
      res.status(502).json({ error: "Google Sheets повернув некоректну назву аркуша." });
      return;
    }

    const valuesResponse = await fetch(
      `${sheetsApi}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${title.replace(/'/g, "''")}'!A:ZZ`)}`,
      { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) },
    );
    if (valuesResponse.status === 401 || valuesResponse.status === 403) {
      res.status(403).json({ error: "Service account не має права читати цей аркуш. Додайте його адресу до доступу таблиці з роллю «Читач»." });
      return;
    }
    if (!valuesResponse.ok) {
      res.status(502).json({ error: `Google Sheets API повернув помилку ${valuesResponse.status} під час читання аркуша.` });
      return;
    }

    const data: unknown = await valuesResponse.json();
    const rows = isRecord(data) ? data["values"] : undefined;
    res.json({ items: parseStockRows(rows) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Невідома помилка Google Sheets.";
    req.log.error({ err: cause }, "Google Sheets stock sync failed");
    res.status(502).json({ error: message });
  }
});

export default router;
