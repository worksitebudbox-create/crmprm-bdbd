import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AlertTriangle, FileSpreadsheet, Package as WarehouseIcon, Search, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { customFetch } from '@workspace/api-client-react';

type StockLocation = { name: string; quantity: number };
type StockItem = { sku: string; name: string; totalQuantity: number; locations: StockLocation[] };
type StoredStock = { items: StockItem[]; updatedAt: string; fileName: string };
type ParsedStock = { items: StockItem[]; warnings: string[] };

const STOCK_KEY = 'budbox-stock-items';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStockItem(value: unknown): value is StockItem {
  return typeof value === 'object' &&
    value !== null &&
    'sku' in value &&
    typeof value.sku === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'totalQuantity' in value &&
    typeof value.totalQuantity === 'number' &&
    Number.isFinite(value.totalQuantity) &&
    'locations' in value &&
    Array.isArray(value.locations) &&
    value.locations.every((location) =>
      typeof location === 'object' &&
      location !== null &&
      'name' in location &&
      typeof location.name === 'string' &&
      'quantity' in location &&
      typeof location.quantity === 'number' &&
      Number.isFinite(location.quantity),
    );
}

function isStoredStock(value: unknown): value is StoredStock {
  return typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray(value.items) &&
    value.items.every(isStockItem) &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'string' &&
    'fileName' in value &&
    typeof value.fileName === 'string';
}

function readStoredStock(): { stock: StoredStock | null; error: string } {
  try {
    const stored = localStorage.getItem(STOCK_KEY);
    if (!stored) return { stock: null, error: '' };
    const parsed: unknown = JSON.parse(stored);
    if (!isStoredStock(parsed)) {
      throw new Error('Збережений файл залишків має некоректний формат.');
    }
    return { stock: parsed, error: '' };
  } catch (cause) {
    console.error('Не вдалося прочитати збережені залишки складу.', cause);
    return { stock: null, error: 'Не вдалося прочитати збережені залишки. Імпортуйте файл повторно.' };
  }
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase('uk-UA').replace(/[\s_:.,]+/g, '').trim();
}

function parseQuantity(value: unknown, rowNumber: number, location: string, warnings: string[]): number {
  if (value === '' || value === null || value === undefined || value === '—' || value === '-') return 0;
  const quantityText = String(value).replace(/[\s\u00a0]/g, '').replace(',', '.');
  const quantity = Number(quantityText);
  if (!Number.isFinite(quantity)) {
    warnings.push(`рядок ${rowNumber} · ${location}`);
    return 0;
  }
  return quantity;
}

function parseStockFile(buffer: ArrayBuffer): ParsedStock {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'повна');
  if (!sheetName) {
    throw new Error('У файлі не знайдено аркуш «Повна».');
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('Не вдалося відкрити аркуш «Повна» у файлі.');
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true });
  const headerRowIndex = rows.findIndex((row) => normalizeHeader(row[3]) === 'всього');
  if (headerRowIndex < 0) {
    throw new Error('На аркуші «Повна» не знайдено заголовок «Всього» в колонці D.');
  }

  const headers = rows[headerRowIndex] ?? [];
  const locations = headers.slice(4, 12).map((value, index) => ({
    name: String(value ?? '').trim(),
    index: index + 4,
  }));
  if (normalizeHeader(headers[3]) !== 'всього' || locations.some(({ name }) => !name)) {
    throw new Error('Перевірте заголовки аркуша «Повна»: D — «Всього», E–L — назви міст/складів.');
  }

  const items: StockItem[] = [];
  const warnings: string[] = [];
  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const sku = String(row[1] ?? '').trim();
    const name = String(row[2] ?? '').trim();
    if (!sku && !name) continue;
    const rowNumber = index + 1;
    if (!sku || !name) {
      throw new Error(`Перевірте рядок ${rowNumber} аркуша «Повна»: у B потрібен код товару, у C — повна назва.`);
    }
    const parsedLocations = locations.map(({ name: location, index: columnIndex }) => ({
      name: location,
      quantity: parseQuantity(row[columnIndex], rowNumber, location, warnings),
    }));
    const previousWarningCount = warnings.length;
    const parsedTotal = parseQuantity(row[3], rowNumber, 'Всього', warnings);
    const invalidTotal = warnings.length > previousWarningCount;
    const totalQuantity = invalidTotal
      ? parsedLocations.reduce((sum, location) => sum + location.quantity, 0)
      : parsedTotal;
    items.push({ sku, name, totalQuantity, locations: parsedLocations });
  }
  if (!items.length) throw new Error('На аркуші «Повна» не знайдено товарів під рядком заголовків.');
  return { items, warnings };
}

function itemTotal(item: StockItem): number {
  return item.totalQuantity;
}

export default function WarehousePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [initialStock] = useState(readStoredStock);
  const [stock, setStock] = useState(initialStock.stock);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialStock.error);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    let active = true;
    void customFetch<{ snapshot: unknown }>('/api/crm/warehouse/stock', { responseType: 'json' })
      .then((result) => {
        if (!isRecord(result) || !('snapshot' in result)) {
          throw new Error('База даних повернула некоректний знімок залишків.');
        }
        const snapshot = result.snapshot;
        if (snapshot !== null && !isStoredStock(snapshot)) {
          throw new Error('Збережений знімок залишків має некоректний формат.');
        }
        if (!active) return;
        setStock(snapshot);
        if (snapshot) localStorage.setItem(STOCK_KEY, JSON.stringify(snapshot));
        else localStorage.removeItem(STOCK_KEY);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        console.error('Не вдалося завантажити залишки з бази даних.', cause);
        setError(cause instanceof Error ? cause.message : 'Не вдалося завантажити залишки з бази даних.');
      });
    return () => { active = false; };
  }, []);

  const items = stock?.items ?? [];
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('uk-UA');
    return term ? items.filter((item) => `${item.sku} ${item.name}`.toLocaleLowerCase('uk-UA').includes(term)) : items;
  }, [items, search]);
  const locationColumns = items[0]?.locations ?? [];
  const lowStockCount = items.filter((item) => itemTotal(item) < 3).length;

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setError('');
    setWarning('');
    setIsLoading(true);
    try {
      const parsed = parseStockFile(await file.arrayBuffer());
      const items = parsed.items;
      const imported: StoredStock = { items, updatedAt: new Date().toISOString(), fileName: file.name };
      const result = await customFetch<{ snapshot: unknown }>('/api/crm/warehouse/stock', {
        method: 'PUT',
        body: JSON.stringify(imported),
        responseType: 'json',
      });
      if (!isRecord(result) || !('snapshot' in result) || !isStoredStock(result.snapshot)) {
        throw new Error('API зберегло залишки, але повернуло некоректну відповідь.');
      }
      localStorage.setItem(STOCK_KEY, JSON.stringify(result.snapshot));
      setStock(result.snapshot);
      if (parsed.warnings.length) {
        const shownWarnings = parsed.warnings.slice(0, 8).join('; ');
        const moreWarnings = parsed.warnings.length > 8
          ? `; та ще ${parsed.warnings.length - 8} некоректних клітинок`
          : '';
        setWarning(`Імпорт завершено з пропусками: ${shownWarnings}${moreWarnings}. Некоректні клітинки враховані як 0; якщо зіпсовано «Всього», його суму розраховано за E–L.`);
      }
    } catch (cause) {
      console.error('Не вдалося імпортувати файл складських залишків.', cause);
      setError(cause instanceof Error ? cause.message : 'Не вдалося прочитати файл залишків.');
    } finally {
      setIsLoading(false);
    }
  };

  return <div className="warehouse-page">
    <section className="warehouse-connect data-card">
      <div className="warehouse-connect-copy">
        <span className="warehouse-icon"><FileSpreadsheet size={18} /></span>
        <div><h2>Імпорт залишків із файлу</h2><p>Завантажте Excel — з аркуша «Повна» зчитаються B: код, C: повна назва, D: всього, E–L: залишки по містах.</p></div>
      </div>
      <div className="warehouse-file-actions">
        <input ref={fileInput} aria-label="Файл залишків складу" className="warehouse-file-input" type="file" accept=".xlsx,.xls" onChange={(event) => { void importFile(event); }} />
        <button className="primary-button" type="button" disabled={isLoading} onClick={() => fileInput.current?.click()}>
          {isLoading ? <span className="warehouse-spin"><Upload size={15} /></span> : <Upload size={15} />}
          {isLoading ? 'Завантаження…' : stock ? 'Імпортувати новий файл' : 'Обрати файл'}
        </button>
        {stock && <span className="warehouse-source">{stock.fileName}</span>}
      </div>
      {error && <p className="warehouse-error" role="alert"><AlertTriangle size={14} />{error}</p>}
      {warning && <p className="warehouse-warning" role="status"><AlertTriangle size={14} />{warning}</p>}
      <p className="warehouse-help">Підтримуються .xlsx і .xls. У базі зберігається останній імпортований файл; наступне завантаження оновлює залишки.</p>
    </section>

    <div className="warehouse-stats">
      <div className="data-card"><span>ПОЗИЦІЙ У ФАЙЛІ</span><b>{items.length}</b><small>Товарних рядків</small></div>
      <div className={`data-card ${lowStockCount ? 'warehouse-low-card' : ''}`}><span>НИЗЬКИЙ ЗАЛИШОК</span><b>{lowStockCount}</b><small>Менше 3 одиниць загалом</small></div>
      <div className="data-card"><span>ОСТАННЄ ОНОВЛЕННЯ</span><b className="warehouse-updated">{stock ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stock.updatedAt)) : 'Ще не імпортовано'}</b><small>{stock?.fileName ?? 'Очікує файл залишків'}</small></div>
    </div>

    <section className="data-card warehouse-table">
      <div className="warehouse-table-head"><div><WarehouseIcon size={17} /><div><h2>Складські залишки</h2><p>Пошук за кодом або найменуванням товару</p></div></div><label className="warehouse-search"><Search size={15} /><input aria-label="Пошук товару на складі" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук коду або назви" /></label></div>
      {filteredItems.length > 0 ? <div className="warehouse-sheet-scroll"><table className="warehouse-sheet-grid">
        <thead><tr><th>КОД ТОВАРУ</th><th>ПОВНА НАЗВА</th><th>ВСЬОГО</th>{locationColumns.map((location) => <th key={location.name}>{location.name}</th>)}</tr></thead>
        <tbody>{filteredItems.map((item) => <tr key={item.sku} className={itemTotal(item) < 3 ? 'low-stock' : ''}>
          <td><b>{item.sku}</b></td><td>{item.name}</td><td className={item.totalQuantity < 0 ? 'warehouse-negative' : item.totalQuantity === 0 ? 'warehouse-zero' : ''}>{new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(item.totalQuantity)}</td>
          {item.locations.map((location) => <td className={location.quantity < 0 ? 'warehouse-negative' : location.quantity === 0 ? 'warehouse-zero' : ''} key={location.name}>{new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(location.quantity)}</td>)}
        </tr>)}</tbody>
      </table></div> : <div className="warehouse-empty"><WarehouseIcon size={23} /><b>{items.length ? 'Товари не знайдено' : 'Файл залишків ще не завантажений'}</b><span>{items.length ? 'Змініть пошуковий запит.' : 'Оберіть Excel-файл з аркушем «Повна», щоб імпортувати залишки.'}</span></div>}
    </section>
  </div>;
}
