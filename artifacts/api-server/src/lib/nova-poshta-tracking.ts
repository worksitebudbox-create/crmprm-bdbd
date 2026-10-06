import { eq, isNotNull } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";
import { logger } from "./logger";

const NOVA_POSHTA_URL = "https://api.novaposhta.ua/v2.0/json/";
const TRACKING_INTERVAL_MS = 60 * 60 * 1000;

export class NovaPoshtaTrackingError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "NovaPoshtaTrackingError";
  }
}

function arrivalTimestamp(dateScan: string): string | null {
  const match = dateScan.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) return null;

  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const offsetLabel = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Kyiv",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(localAsUtc))
    .find((part) => part.type === "timeZoneName")?.value;
  const offsetMatch = offsetLabel?.match(/GMT([+-])(\d{2}):?(\d{2})/);
  if (!offsetMatch) return null;

  const offsetMinutes =
    (offsetMatch[1] === "+" ? 1 : -1) *
    (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
  return new Date(localAsUtc - offsetMinutes * 60_000).toISOString();
}

export async function refreshNovaPoshtaOrderStatus(orderId: number) {
  const apiKey = process.env.NOVA_POSHTA_API_KEY;
  if (!apiKey) {
    throw new NovaPoshtaTrackingError(
      "Не налаштовано NOVA_POSHTA_API_KEY на сервері.",
      503,
    );
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!order) {
    throw new NovaPoshtaTrackingError("Замовлення не знайдено.", 404);
  }
  if (!order.ttn?.trim()) {
    throw new NovaPoshtaTrackingError(
      "Додайте номер ТТН перед перевіркою статусу.",
      400,
    );
  }

  let payload: unknown;
  try {
    const response = await fetch(NOVA_POSHTA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        modelName: "TrackingDocument",
        calledMethod: "getStatusDocuments",
        methodProperties: {
          Documents: [
            {
              DocumentNumber: order.ttn.trim(),
              Phone: order.phone?.replace(/\D/g, "") ?? "",
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    payload = await response.json();
    if (!response.ok) {
      logger.error(
        { orderId, status: response.status },
        "Nova Poshta tracking request failed",
      );
      throw new NovaPoshtaTrackingError(
        "Сервіс Нової пошти тимчасово недоступний.",
        502,
      );
    }
  } catch (error) {
    if (error instanceof NovaPoshtaTrackingError) throw error;
    logger.error({ err: error, orderId }, "Nova Poshta tracking request failed");
    throw new NovaPoshtaTrackingError(
      "Не вдалося зв’язатися з Новою поштою.",
      502,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("success" in payload) ||
    payload.success !== true ||
    !("data" in payload) ||
    !Array.isArray(payload.data)
  ) {
    const errors =
      payload &&
      typeof payload === "object" &&
      "errors" in payload &&
      Array.isArray(payload.errors)
        ? payload.errors
            .filter((item): item is string => typeof item === "string")
            .join(" ")
        : "";
    throw new NovaPoshtaTrackingError(
      errors || "Нова пошта не повернула статус для цієї ТТН.",
      502,
    );
  }

  const tracking = payload.data[0];
  if (
    !tracking ||
    typeof tracking !== "object" ||
    !("Status" in tracking) ||
    typeof tracking.Status !== "string"
  ) {
    throw new NovaPoshtaTrackingError(
      "Нова пошта не повернула статус для цієї ТТН.",
      502,
    );
  }

  const status = tracking.Status.trim();
  const paymentMethod = order.paymentMethod?.trim().toLocaleLowerCase("uk-UA") ?? "";
  const isReceived = /(доставлен|отримано|отримав|отримала|вручено)/i.test(status) && !/(очікує|відмова)/i.test(status);
  const shouldMarkPaid = paymentMethod === "новапей" && isReceived;
  const statusCode =
    "StatusCode" in tracking ? String(tracking.StatusCode) : "";
  const arrived =
    statusCode === "7" || /прибув.*(відділен|поштомат)/i.test(status);
  const dateScan =
    "DateScan" in tracking && typeof tracking.DateScan === "string"
      ? tracking.DateScan
      : "";
  const scannedArrival = arrived ? arrivalTimestamp(dateScan) : null;
  const arrivalDate = scannedArrival ?? order.arrivalDate;

  if (status === order.deliveryStatus && arrivalDate === order.arrivalDate && (!shouldMarkPaid || order.paymentStatus === "Оплачено")) {
    return order;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({
      deliveryStatus: status,
      arrivalDate,
      ...(shouldMarkPaid ? { paymentStatus: "Оплачено", paidAt: order.paidAt ?? new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId))
    .returning();
  return updated;
}

let trackingTimer: NodeJS.Timeout | undefined;
let trackingRunActive = false;

async function refreshAllTrackedOrders(): Promise<void> {
  if (trackingRunActive) return;
  trackingRunActive = true;
  try {
    const trackedOrders = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(isNotNull(ordersTable.ttn));
    for (const { id } of trackedOrders) {
      try {
        await refreshNovaPoshtaOrderStatus(id);
      } catch (error) {
        logger.error(
          { err: error, orderId: id },
          "Scheduled Nova Poshta tracking update failed",
        );
      }
    }
    logger.info(
      { trackedOrders: trackedOrders.length },
      "Scheduled Nova Poshta tracking update completed",
    );
  } catch (error) {
    logger.error({ err: error }, "Could not load orders for Nova Poshta tracking");
  } finally {
    trackingRunActive = false;
  }
}

export function startNovaPoshtaTracking(): void {
  if (!process.env.NOVA_POSHTA_API_KEY) {
    logger.warn(
      "Nova Poshta hourly tracking is disabled because NOVA_POSHTA_API_KEY is not configured",
    );
    return;
  }
  if (trackingTimer) return;

  trackingTimer = setInterval(() => void refreshAllTrackedOrders(), TRACKING_INTERVAL_MS);
  trackingTimer.unref();
  void refreshAllTrackedOrders();
  logger.info("Nova Poshta hourly tracking started");
}

export function queueNovaPoshtaOrderRefresh(orderId: number): void {
  if (!process.env.NOVA_POSHTA_API_KEY) return;
  setImmediate(() => {
    void refreshNovaPoshtaOrderStatus(orderId).catch((error: unknown) => {
      logger.error(
        { err: error, orderId },
        "Initial Nova Poshta tracking update failed",
      );
    });
  });
}
