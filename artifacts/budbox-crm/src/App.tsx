import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType, ReactNode, FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import {
  Activity, ArrowDownUp, ArrowRight, BarChart3, Bell, BellRing, Building2, CalendarClock, Check, ChevronDown, Menu,
  ChevronRight, CircleAlert, ClipboardList, Copy, CreditCard, Edit3, FileText, Filter,
  Globe, History, LayoutDashboard, Mail, MapPin, MessageCircle, Package, Phone, Plus, Search, Send,
  ShoppingCart,
  Settings2, ShieldCheck, Tag, Trash2, Truck, UserRound, UsersRound, Wallet, X, CircleHelp, SlidersHorizontal, LogOut, LoaderCircle, RefreshCw
} from 'lucide-react';
import {
  CustomerType, DealStage, GetCompaniesFilter, PaymentForm,
  customFetch, getGetCompaniesQueryKey, getGetCompanyQueryKey, getGetCrmSummaryQueryKey, getGetCrmTasksQueryKey,
  getGetCrmOrdersQueryKey, getGetCrmActivityQueryKey, setAuthTokenGetter, setBaseUrl,
  useCreateCompany, useCreateContact, useCreateNote, useCreateOrder, useCreateStandaloneOrder, useCreateTask,
  useDeleteOrder, useGetCompanies, useGetCompany, useGetCrmSummary, useGetCrmTasks, useGetCrmOrders, useGetCrmActivity, useUpdateCompany, useUpdateOrder,
  useUpdateTask
} from '@workspace/api-client-react';
import type {
  CompanyDetail, CompanyInput, CompanyListItem, ContactInput, OrderInput, OrderUpdate, TaskInput, TaskBoardItem, OrderBoardItem, ActivityBoardItem,
  CompanyUpdate
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SiTelegram, SiViber, SiWhatsapp } from 'react-icons/si';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import WarehousePage from './Warehouse';
import NovaPoshtaTruck from './NovaPoshtaTruck';
import LoginPage from './LoginPage';
import { supabaseClient } from './auth-client';

const queryClient = new QueryClient();
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl.replace(/\/+$/, ''));
}
const stages: DealStage[] = [
  DealStage.Новий_лід,
  DealStage['Рахунок_/_передоплата'],
  DealStage.Уточнення_деталей,
  DealStage.Зібрано_на_складі,
  DealStage.Відправлено,
  DealStage.Успішно_реалізовано,
];
const retailCustomerType = 'Роздрібний клієнт';
const customerTypes: string[] = Array.from(new Set([retailCustomerType, ...Object.values(CustomerType)]));
const paymentForms = Object.values(PaymentForm);
const filters = [
  { label: 'Усі клієнти', value: GetCompaniesFilter.all },
  { label: 'Мої клієнти', value: GetCompaniesFilter.mine },
  { label: 'Є завдання', value: GetCompaniesFilter.hasTasks },
  { label: 'Прострочено', value: GetCompaniesFilter.overdue },
];
const orderStageLabels: Record<string, string> = {
  [DealStage.Новий_лід]: 'Нове замовлення',
  [DealStage['Рахунок_/_передоплата']]: 'Очікує оплати',
  [DealStage.Уточнення_деталей]: 'Прийнято в роботу',
  [DealStage.Зібрано_на_складі]: 'Передано на склад / Збирається',
  [DealStage.Відправлено]: 'Відправлено',
  [DealStage.Успішно_реалізовано]: 'Виконано',
};
const orderStatuses = ['Неоплачено', 'Оплачено', 'Відмова від отримання', 'Скасовано', 'Повернення'] as const;
const paymentMethods = ['НоваПей', 'Промоплата', 'Лікпей', 'Ізіпей', 'Безготівкова', 'Післяплата'];
const autoPaidPaymentMethods = new Set(['промоплата', 'лікпей', 'ізіпей', 'безготівкова']);
const orderSenders = ['Наконечний', 'ТВК БАЙРІС'];

function normalizePaymentMethod(method?: string | null) {
  return method?.trim() ?? '';
}

function resolveManagerName(value?: string | null, fallback = 'Не призначено') {
  return value?.trim() || fallback;
}

function readSavedDisplayName() {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('budbox-crm-display-name') ?? '').trim();
}

function writeSavedDisplayName(value: string) {
  if (typeof window === 'undefined') return;
  const next = value.trim();
  if (next) localStorage.setItem('budbox-crm-display-name', next);
  else localStorage.removeItem('budbox-crm-display-name');
  window.dispatchEvent(new Event('crm-display-name-changed'));
}

function getPrimaryDisplayName(userEmail?: string | null, fallback = 'Робочий акаунт') {
  const saved = readSavedDisplayName();
  return saved || userEmail?.trim() || fallback;
}

function getContactMessengerLinks(contact: { phone?: string | null; telegram?: string | null; viber?: string | null }) {
  const phoneDigits = (contact.phone ?? '').replace(/\D/g, '');
  const normalizedPhone = phoneDigits.startsWith('0') ? `38${phoneDigits}` : phoneDigits;
  const whatsappUrl = normalizedPhone ? `https://wa.me/${normalizedPhone}` : null;
  const telegramValue = (contact.telegram ?? '').trim().replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, '').replace(/^@/, '').split(/[/?#]/, 1)[0];
  const telegramUrl = telegramValue ? `https://t.me/${encodeURIComponent(telegramValue)}` : null;
  const viberValue = (contact.viber ?? '').trim();
  const viberDigits = viberValue.replace(/\D/g, '');
  const viberPhone = viberDigits ? (viberDigits.startsWith('0') ? `38${viberDigits}` : viberDigits) : normalizedPhone;
  const viberUrl = viberPhone ? `viber://chat?number=%2B${viberPhone}` : null;
  return { whatsappUrl, telegramUrl, viberUrl };
}

function isAutoPaidPaymentMethod(method?: string | null) {
  return autoPaidPaymentMethods.has(normalizePaymentMethod(method).toLowerCase());
}

function derivePaymentStatus({ paymentMethod, paymentStatus, deliveryStatus }: { paymentMethod?: string | null; paymentStatus?: string | null; deliveryStatus?: string | null; }) {
  const normalizedMethod = normalizePaymentMethod(paymentMethod);
  if (isAutoPaidPaymentMethod(normalizedMethod)) return 'Оплачено';
  if (normalizedMethod.toLowerCase() === 'новапей' && (paymentStatus?.trim() === 'Оплачено' || /(?:доставлен|отримано|вручено)/i.test(deliveryStatus ?? ''))) {
    return 'Оплачено';
  }
  return paymentStatus?.trim() || 'Неоплачено';
}

function isPaidOrder(order: { paymentStatus?: string | null; paymentMethod?: string | null; deliveryStatus?: string | null }) {
  return derivePaymentStatus({
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
  }) === 'Оплачено';
}
const orderWarehouses = ['Наукова 26', 'Польська 6', 'Закарпаття', 'Вінниця', 'Тернопіль', 'Франківськ', 'Чернівці', 'Декілька відправок'];
const marketingSources = ['Пошукова реклама', 'Таргетована реклама', 'Соцмережі', 'Блогери', 'Через знайомих', 'Пром Маркетплейс', 'Постійний покупець', 'B2B Клієнт'];
const funnelClassNames: Record<string, string> = {
  [DealStage.Новий_лід]: 'funnel-new',
  [DealStage['Рахунок_/_передоплата']]: 'funnel-prepayment',
  [DealStage.Уточнення_деталей]: 'funnel-processing',
  [DealStage.Зібрано_на_складі]: 'funnel-stock',
  [DealStage.Відправлено]: 'funnel-sent',
  [DealStage.Успішно_реалізовано]: 'funnel-complete',
};

function money(value: number) {
  return new Intl.NumberFormat('uk-UA').format(value) + ' ₴';
}
function date(value?: string | null) {
  if (!value) return 'Не вказано';
  return new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function localDateInput() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
function localDateTimeInput(value: string | Date) {
  const local = new Date(value);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}
function shortDate(value?: string | null) {
  if (!value) return 'Не вказано';
  const dateValue = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' }).format(dateValue);
}
function isDeliveredStatus(status?: string | null) {
  return Boolean(status && /(доставлен|отримано|отримав|отримала|вручено)/i.test(status) && !/(очікує|відмова)/i.test(status));
}
function isAtPickupStatus(status?: string | null) {
  return Boolean(status && /(прибув.*(відділен|поштомат)|відділен.*(очікує|прибул)|готов.*отриман)/i.test(status));
}
function orderDeliveryTone(status?: string | null, ttn?: string | null) {
  if (status && /(відмов|повернен)/i.test(status)) return 'status-refused';
  if (isDeliveredStatus(status)) return 'status-delivered';
  if (isAtPickupStatus(status)) return 'status-arrived';
  if (!ttn) return status && /(в дорозі|їде|переміщ|прямує|на сортуван|кур.?єр)/i.test(status) ? 'status-transit' : 'status-new';
  return 'status-transit';
}
function localDateKey(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
function stageTone(stage: string) {
  if (stage === DealStage.Новий_лід) return 'tone-new';
  if (stage === DealStage.Успішно_реалізовано) return 'tone-success';
  if (stage === DealStage['Рахунок_/_передоплата']) return 'tone-warm';
  if (stage === DealStage.Відправлено) return 'tone-blue';
  if (stage === DealStage.Зібрано_на_складі) return 'tone-cyan';
  if (stage === DealStage.Уточнення_деталей) return 'tone-neutral';
  return 'tone-primary';
}

type ModalKind = 'company' | 'client' | 'edit' | 'contact' | 'order' | 'task' | 'note' | null;
type Notice = { kind: 'success' | 'error'; text: string };
type OrderCustomerSuggestion = {
  companyId: number;
  companyName: string;
  taxId: string | null;
  city: string | null;
  customerType: string;
  manager: string;
  contactId: number | null;
  contactName: string | null;
  phone: string | null;
};
type ChatManager = {
  userId: string;
  email: string;
  name: string;
  role: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  isSelf: boolean;
  unreadCount: number;
};
type InternalChatMessage = {
  id: number;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  editedAt?: string | null;
  readAt?: string | null;
  createdAt: string;
};
type ChatNotificationMessage = {
  id: number;
  senderUserId: string;
  senderName: string;
  body: string;
  createdAt: string;
};
type ChatNotificationsResponse = {
  unreadCount: number;
  messages: ChatNotificationMessage[];
};
type ChatHistoryResponse = {
  messages: InternalChatMessage[];
  hasMore: boolean;
  nextBeforeId: number | null;
};
type ContactSearchResult = {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  companyId: number;
  companyName: string;
};

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}</label>;
}
function Modal({ title, subtitle, children, close }: { title: string; subtitle: string; children: ReactNode; close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && close()}>
    <div className="modal-panel bb-enter" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-subtitle">
      <div className="modal-head">
        <div>
          <h3 id="modal-title">{title}</h3>
          <p id="modal-subtitle">{subtitle}</p>
        </div>
        <button data-testid="button-close-modal" className="icon-button" onClick={close} aria-label="Закрити модальне вікно"><X size={17} /></button>
      </div>
      {children}
    </div>
  </div>;
}
function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} />; }

function CrmWorkspace({ userEmail, role, isAdmin, onSignOut, chatUnreadCount = 0, notificationsEnabled = false, notificationPermission = 'default', onEnableNotifications }: { userEmail: string | null; role: CrmRole; isAdmin: boolean; onSignOut: () => Promise<void>; chatUnreadCount?: number; notificationsEnabled?: boolean; notificationPermission?: NotificationPermission | 'unsupported'; onEnableNotifications?: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [railOpen, setRailOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerPanel, setHeaderPanel] = useState<'notifications' | 'settings' | 'profile' | null>(null);
  const [compact, setCompact] = useState(() => localStorage.getItem('budbox-compact') === 'true');
  const [savedDisplayName, setSavedDisplayName] = useState(() => readSavedDisplayName());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>(GetCompaniesFilter.all);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const savedId = Number(localStorage.getItem('budbox-selected-company'));
    return Number.isFinite(savedId) && savedId > 0 ? savedId : null;
  });
  const [tab, setTab] = useState<'Огляд' | 'Історія' | 'Контакти' | 'Замовлення'>('Огляд');
  const [modal, setModal] = useState<ModalKind>(() => {
    if (sessionStorage.getItem('budbox-open-company') === 'true') {
      sessionStorage.removeItem('budbox-open-company');
      return 'company';
    }
    return null;
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [companyDeleteTarget, setCompanyDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});

  const companyParams = useMemo(() => ({ q: query || undefined, filter: filter as typeof GetCompaniesFilter[keyof typeof GetCompaniesFilter] }), [query, filter]);
  const companiesQuery = useGetCompanies(companyParams);
  const summaryQuery = useGetCrmSummary();
  const taskBoard = useGetCrmTasks();
  const companies = Array.isArray(companiesQuery.data) ? companiesQuery.data : [];
  const selectedFromList = companies.find((item) => item.id === selectedId);
  const activeId = selectedId ?? companies[0]?.id ?? null;
  const detailQuery = useGetCompany(activeId as number, { query: { enabled: Boolean(activeId), queryKey: getGetCompanyQueryKey(activeId ?? 0), refetchInterval: 60_000 } });
  const detail = detailQuery.data as CompanyDetail | undefined;
  const selected = detail ?? selectedFromList;

  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const createContact = useCreateContact();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const removeOrder = useDeleteOrder();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const createNote = useCreateNote();
  const busy = createCompany.isPending || updateCompany.isPending || createContact.isPending || createOrder.isPending || updateOrder.isPending || removeOrder.isPending || createTask.isPending || updateTask.isPending || createNote.isPending;
  const currentManager = resolveManagerName(userEmail);

  useEffect(() => {
    if (companies.length && (!selectedId || !companies.some((company) => company.id === selectedId))) {
      setSelectedId(companies[0].id);
    }
  }, [companies, selectedId]);
  useEffect(() => {
    if (selectedId) localStorage.setItem('budbox-selected-company', String(selectedId));
  }, [selectedId]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3600); return () => window.clearTimeout(timer); }, [notice]);

  const flash = (text: string, kind: Notice['kind'] = 'success') => setNotice({ text, kind });
  const refresh = async (id = activeId) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getGetCompaniesQueryKey(companyParams) }),
      qc.invalidateQueries({ queryKey: getGetCrmSummaryQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetCrmTasksQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetCrmOrdersQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetCrmActivityQueryKey() }),
      ...(id ? [qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(id) })] : []),
    ]);
  };
  const open = (kind: ModalKind, values: Record<string, string> = {}) => { setForm(values); setModal(kind); };
  const close = () => { setModal(null); setForm({}); };

  const saveDisplayName = (value: string) => {
    const trimmed = value.trim();
    setSavedDisplayName(trimmed);
    writeSavedDisplayName(trimmed);
  };
  const setValue = (key: string, value: string) => setForm((current) => key === 'companySearch'
    ? { ...current, companyId: '', companySearch: value, customerName: '', phone: '', taxId: '', city: '', manager: '', selectedCompanyName: '', selectedContactName: '', selectedCustomerType: '' }
    : { ...current, [key]: value });
  useEffect(() => { const handler = () => close(); window.addEventListener('close-modal', handler); return () => window.removeEventListener('close-modal', handler); }, []);
  const submitCompany = (edit = false) => {
    const payload = {
      name: form.name?.trim(), taxId: form.taxId || null, customerType: (form.customerType || CustomerType.Виконроб) as CompanyInput['customerType'],
      city: form.city || null, warehouse: form.warehouse || null,
      paymentForm: (form.paymentForm || PaymentForm.ПДВ) as CompanyInput['paymentForm'],
      creditLimitUah: Number(form.creditLimitUah || 0), paymentTermsDays: Number(form.paymentTermsDays || 0),
      discountPercent: Number(form.discountPercent || 0), priceTier: form.priceTier || null, source: form.source || null,
    };
    if (!payload.name) return flash('Вкажіть назву компанії', 'error');
    const done = (item: CompanyDetail) => { setSelectedId(item.id); localStorage.setItem('budbox-selected-company', String(item.id)); close(); void refresh(item.id); flash(edit ? 'Картку компанії оновлено' : 'Компанію додано до черги'); };
    const finishCreation = async (item: CompanyDetail) => {
      if (form.responsibleContactId) {
        try {
          await customFetch<void>(`/api/companies/${item.id}/responsible-contact`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId: Number(form.responsibleContactId) }),
          });
          done(item);
        } catch (error) {
          console.error('Company was created but contact linking failed', error);
          setSelectedId(item.id);
          localStorage.setItem('budbox-selected-company', String(item.id));
          close();
          void refresh(item.id);
          flash('Компанію створено, але контакт не вдалося прив’язати. Додайте його у вкладці «Контакти».', 'error');
        }
        return;
      }
      const contactName = form.responsibleContactName?.trim();
      const contactPhone = form.responsibleContactPhone?.trim();
      if (!contactName && !contactPhone) {
        done(item);
        return;
      }
      if (!contactName || !contactPhone) {
        close();
        setSelectedId(item.id);
        localStorage.setItem('budbox-selected-company', String(item.id));
        void refresh(item.id);
        flash('Компанію створено, але потрібно заповнити і ПІБ, і телефон відповідального контакту.', 'error');
        return;
      }
      createContact.mutate({
        companyId: item.id,
        data: { fullName: contactName, phone: contactPhone, role: 'Відповідальний клієнт', email: null, telegram: null, viber: null },
      }, {
        onSuccess: () => done(item),
        onError: () => {
          close();
          setSelectedId(item.id);
          localStorage.setItem('budbox-selected-company', String(item.id));
          void refresh(item.id);
          flash('Компанію створено, але відповідального контакту не вдалося додати.', 'error');
        },
      });
    };
    if (edit && activeId) updateCompany.mutate({
      companyId: activeId,
      data: { ...payload, ...(roleCanAssignClients(role) ? { manager: form.manager?.trim() || currentManager } : {}) } as CompanyUpdate,
    }, { onSuccess: done, onError: () => flash('Не вдалося оновити компанію', 'error') });
    else if ((form.responsibleContactName?.trim() && !form.responsibleContactPhone?.trim()) || (!form.responsibleContactName?.trim() && form.responsibleContactPhone?.trim())) {
      flash('Щоб додати нового відповідального, вкажіть і ПІБ, і номер телефону.', 'error');
    } else createCompany.mutate({ data: { ...payload, manager: currentManager } as CompanyInput }, { onSuccess: (item) => { void finishCreation(item); }, onError: () => flash('Не вдалося створити компанію', 'error') });
  };
  const submitClient = () => {
    const fullName = form.fullName?.trim();
    if (!fullName) return flash('Вкажіть ім’я клієнта', 'error');
    const payload: CompanyInput = {
      name: fullName,
      taxId: form.taxId?.trim() || null,
      customerType: (form.customerType || retailCustomerType) as CompanyInput['customerType'],
      city: form.city?.trim() || null,
      manager: currentManager,
      warehouse: form.warehouse?.trim() || null,
      paymentForm: (form.paymentForm || PaymentForm.готівка) as CompanyInput['paymentForm'],
      creditLimitUah: 0,
      paymentTermsDays: 0,
      discountPercent: 0,
      priceTier: null,
      source: form.source || null,
    };
    createCompany.mutate({ data: payload as CompanyInput }, {
      onSuccess: (client) => {
        const finishClientCreation = (message: string, kind: Notice['kind'] = 'success') => {
          close();
          void refresh(client.id).then(() => {
            setSelectedId(client.id);
            localStorage.setItem('budbox-selected-company', String(client.id));
            flash(message, kind);
          }).catch(() => {
            setSelectedId(client.id);
            localStorage.setItem('budbox-selected-company', String(client.id));
            flash('Картку клієнта створено, але список не оновився. Натисніть «Повторити» для оновлення.', 'error');
          });
        };
        const phone = form.phone?.trim() || null;
        if (!phone) {
          finishClientCreation('Клієнта створено. Додайте номер телефону в контакти.');
          return;
        }
        createContact.mutate({
          companyId: client.id,
          data: { fullName, phone, role: 'Клієнт', email: null, telegram: null, viber: null },
        }, {
          onSuccess: () => finishClientCreation('Клієнта збережено в CRM'),
          onError: () => finishClientCreation('Картку клієнта створено, але телефон не збережено. Додайте його у вкладці «Контакти».', 'error'),
        });
      },
      onError: () => flash('Не вдалося створити клієнта', 'error'),
    });
  };
  const submitContact = () => {
    if (!activeId || !form.fullName?.trim()) return flash('Вкажіть ім’я контакту', 'error');
    const data: ContactInput = { fullName: form.fullName.trim(), role: form.role || null, phone: form.phone || null, email: form.email || null, telegram: form.telegram || null, viber: form.viber || null };
    createContact.mutate({ companyId: activeId, data }, { onSuccess: () => { close(); void refresh(); flash('Контакт додано до картки'); }, onError: () => flash('Не вдалося додати контакт', 'error') });
  };
  const submitOrder = () => {
    if (!activeId || !form.amountUah) return flash('Вкажіть суму замовлення', 'error');
    const data: OrderInput = {
      code: form.code || null,
      stage: stages[0],
      amountUah: Number(form.amountUah),
      ttn: form.ttn || null,
      invoiceNumber: form.invoiceNumber || null,
      comment: form.comment || null,
      sender: form.sender || null,
      warehouse: form.warehouse || null,
      customerName: form.customerName || null,
      phone: form.phone || null,
      itemCount: form.itemCount ? Number(form.itemCount) : null,
      paymentMethod: form.paymentMethod || null,
      paymentStatus: form.paymentStatus || orderStatuses[0],
    };
    createOrder.mutate({ companyId: activeId, data }, { onSuccess: () => { close(); void refresh(); flash('Замовлення створено'); }, onError: () => flash('Не вдалося створити замовлення', 'error') });
  };
  const submitTask = () => {
    if (!activeId || !form.title?.trim()) return flash('Вкажіть назву завдання', 'error');
    const data: TaskInput = { title: form.title.trim(), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, assignee: form.assignee?.trim() || currentManager };
    createTask.mutate({ companyId: activeId, data }, { onSuccess: () => { close(); void refresh(); flash('Завдання створено'); }, onError: () => flash('Не вдалося створити завдання', 'error') });
  };
  const submitNote = () => {
    if (!activeId || !form.title?.trim()) return flash('Вкажіть текст нотатки', 'error');
    createNote.mutate({ companyId: activeId, data: { title: form.title.trim(), details: form.details || null, createdBy: currentManager } }, { onSuccess: () => { close(); void refresh(); flash('Нотатку збережено в історії'); }, onError: () => flash('Не вдалося зберегти нотатку', 'error') });
  };
  const completeTask = (taskId: number, isCompleted: boolean) => {
    updateTask.mutate({ taskId, data: { isCompleted: !isCompleted } }, { onSuccess: () => { void refresh(); flash(isCompleted ? 'Завдання повернуто в роботу' : 'Завдання виконано'); }, onError: () => flash('Не вдалося змінити стан завдання', 'error') });
  };
  const editOrder = async (orderId: number, data: OrderUpdate) => {
    try {
      await updateOrder.mutateAsync({ orderId, data });
      await refresh();
      flash('Дані замовлення збережено');
    } catch {
      flash('Не вдалося зберегти зміни замовлення', 'error');
      throw new Error('Не вдалося зберегти зміни замовлення.');
    }
  };
  const deleteOrder = async (orderId: number) => {
    try {
      await removeOrder.mutateAsync({ orderId });
      await refresh();
      flash('Замовлення видалено');
    } catch {
      flash('Не вдалося видалити замовлення', 'error');
      throw new Error('Не вдалося видалити замовлення.');
    }
  };
  const deleteCompany = async () => {
    if (!companyDeleteTarget) return;
    const companyId = companyDeleteTarget.id;
    setDeletingCompany(true);
    try {
      await customFetch<void>(`/api/companies/${companyId}`, { method: 'DELETE' });
      if (Number(localStorage.getItem('budbox-selected-company')) === companyId) {
        localStorage.removeItem('budbox-selected-company');
        setSelectedId(null);
      }
      setCompanyDeleteTarget(null);
      await refresh(companyId);
      flash('Клієнта/компанію та пов’язані дані видалено');
    } catch (error) {
      console.error('Could not delete CRM company and related records', error);
      flash(error instanceof Error ? error.message : 'Не вдалося видалити клієнта або компанію', 'error');
    } finally {
      setDeletingCompany(false);
    }
  };
  const copy = (value: string | null | undefined, label: string) => { if (value) { void navigator.clipboard?.writeText(value); flash(`${label} скопійовано`); } };
  const overdueTasks = (taskBoard.data ?? []).filter((task) => !task.isCompleted && task.dueAt && new Date(task.dueAt) < new Date());
  const toggleCompact = () => { const next = !compact; setCompact(next); localStorage.setItem('budbox-compact', String(next)); document.documentElement.classList.toggle('bb-compact', next); };
  useEffect(() => { document.documentElement.classList.toggle('bb-compact', compact); }, [compact]);

  const sorted = [...companies].sort((a, b) => sortNewest ? b.id - a.id : a.id - b.id);
  const companyForm = { name: selected?.name ?? '', taxId: selected?.taxId ?? '', customerType: selected?.customerType ?? CustomerType.Виконроб, city: selected?.city ?? '', manager: selected?.manager ?? currentManager, warehouse: selected?.warehouse ?? '', paymentForm: selected?.paymentForm ?? PaymentForm.ПДВ, creditLimitUah: String(selected?.creditLimitUah ?? 0), paymentTermsDays: String(selected?.paymentTermsDays ?? 0), discountPercent: String(selected?.discountPercent ?? 0), priceTier: selected?.priceTier ?? '', source: selected?.source ?? '' };
  const showCompanyModal = modal === 'company' || modal === 'edit';
  const title = modal === 'company' ? 'Нова компанія' : modal === 'client' ? 'Новий клієнт' : modal === 'edit' ? 'Редагування компанії' : modal === 'contact' ? 'Новий контакт' : modal === 'order' ? 'Нове замовлення' : modal === 'task' ? 'Нове завдання' : 'Нова нотатка';
  const profileDisplayName = getPrimaryDisplayName(userEmail, 'Робочий акаунт');

  return <div className="bb-app clients-app">
    <header className="topbar"><button data-testid="button-hamburger" className="icon-button hamburger" aria-label="Перемкнути навігацію" aria-expanded={window.innerWidth < 768 ? drawerOpen : railOpen} onClick={() => { if (window.innerWidth < 768) setDrawerOpen(!drawerOpen); else setRailOpen(!railOpen); }}><Menu size={19} /></button><div className="brand"><div className="brand-mark">B</div><div><strong>BUDBOX</strong><small>CRM / ПРОДАЖІ</small></div></div><div className="crumbs"><span>Продажі</span><ChevronRight size={13} /><b>Клієнти</b></div><div className="top-actions"><button aria-label="Сповіщення" aria-expanded={headerPanel === 'notifications'} data-testid="button-notifications" className="icon-button" onClick={() => setHeaderPanel(headerPanel === 'notifications' ? null : 'notifications')}><Bell size={17} />{(overdueTasks.length > 0 || chatUnreadCount > 0) && <i />}</button><button aria-label="Налаштування" aria-expanded={headerPanel === 'settings'} data-testid="button-settings" className="icon-button" onClick={() => setHeaderPanel(headerPanel === 'settings' ? null : 'settings')}><Settings2 size={17} /></button>    <button aria-label="Профіль і параметри" aria-expanded={headerPanel === 'profile'} className="profile profile-trigger" data-testid="button-profile-menu" onClick={() => setHeaderPanel(headerPanel === 'profile' ? null : 'profile')}><span>{userEmail?.slice(0, 2).toUpperCase() || 'BU'}</span><div><b>{profileDisplayName}</b><small>{userEmail || 'Робочий акаунт'}</small></div><ChevronDown size={14} /></button></div>
      {headerPanel && <div className="header-popover" data-testid={`panel-${headerPanel}`}><div className="popover-title">{headerPanel === 'notifications' ? 'Потребують уваги' : headerPanel === 'settings' ? 'Налаштування вигляду' : 'Робочий профіль'}<button className="icon-button" onClick={() => setHeaderPanel(null)}><X size={14} /></button></div>{headerPanel === 'notifications' ? taskBoard.isLoading ? <p>Завантаження завдань…</p> : taskBoard.isError ? <p>Не вдалося завантажити сповіщення.</p> : overdueTasks.length ? overdueTasks.slice(0, 5).map((task) => <button className="popover-row" key={task.id} onClick={() => { setHeaderPanel(null); navigate('/tasks'); }}><CircleAlert size={14} /><span><b>{task.title}</b><small>{task.companyName} · {date(task.dueAt)}</small></span></button>) : <p>Прострочених завдань немає.</p> : headerPanel === 'settings' ? <><label className="density-control"><span><b>Компактний список</b><small>Менше вертикальних відступів у черзі</small></span><input data-testid="toggle-compact-density" type="checkbox" checked={compact} onChange={toggleCompact} /></label><DisplayNameEditor initialName={savedDisplayName} onSave={saveDisplayName} /><div className="browser-notification-setting"><span><BellRing size={15} /><span><b>Сповіщення про чат</b><small>{notificationPermission === 'unsupported' ? 'Браузер не підтримує сповіщення' : notificationPermission === 'denied' ? 'Дозвіл заборонено в налаштуваннях браузера' : notificationsEnabled ? 'Увімкнені, поки CRM відкрита' : 'Системні сповіщення про нові повідомлення'}</small></span></span>{notificationPermission !== 'unsupported' && notificationPermission !== 'denied' && <button type="button" className="secondary-button" onClick={onEnableNotifications}>{notificationsEnabled ? 'Вимкнути' : 'Увімкнути'}</button>}</div></> : <><p>{userEmail || 'Робочий акаунт'}</p><button className="popover-row" onClick={() => { setHeaderPanel('settings'); }}><SlidersHorizontal size={14} /><span><b>Параметри робочого простору</b><small>Налаштування локальні для цього браузера</small></span></button><button className="popover-row auth-signout-row" onClick={() => { setHeaderPanel(null); void onSignOut().catch(() => flash('Не вдалося вийти з акаунта', 'error')); }}><LogOut size={14} /><span><b>Вийти з акаунта</b><small>Завершити поточний сеанс CRM</small></span></button></>}</div>}
    </header>
    <div className={`workspace ${!railOpen ? 'rail-collapsed' : ''}`}><aside className={`rail ${drawerOpen ? 'drawer-open' : ''}`}><NavItems current="/" role={role} isAdmin={isAdmin} chatUnreadCount={chatUnreadCount} navigate={(path) => { navigate(path); setDrawerOpen(false); }} /></aside>{drawerOpen && <button className="drawer-scrim" aria-label="Закрити меню" onClick={() => setDrawerOpen(false)} />}
      <main className="main"><div className="page-heading"><div><div className="eyebrow"><span /> РОБОЧА ЧЕРГА ПРОДАЖІВ</div><h1>Клієнти <small data-testid="text-company-count">{summaryQuery.data?.totalCompanies ?? companies.length} клієнтів і компаній</small></h1></div><div className="client-heading-actions"><button data-testid="button-new-company" className="secondary-button" onClick={() => open('company')}><Plus size={16} /> <span>Нова компанія</span></button><button data-testid="button-new-client" className="primary-button" onClick={() => open('client', { customerType: retailCustomerType, manager: currentManager, paymentForm: PaymentForm.готівка })}><Plus size={16} /> <span>Новий клієнт</span></button></div></div>
        <div className="summary-strip">{summaryQuery.isLoading ? <><Skeleton /><Skeleton /><Skeleton /><Skeleton /></> : summaryQuery.isError ? <div className="summary-error">Не вдалося завантажити підсумок <button onClick={() => summaryQuery.refetch()}>Повторити</button></div> : <><div><span>КОМПАНІЇ</span><b data-testid="summary-companies">{summaryQuery.data?.totalCompanies ?? 0}</b></div><div><span>АКТИВНІ ЗАМОВЛЕННЯ</span><b data-testid="summary-orders">{summaryQuery.data?.activeOrders ?? 0}</b></div><div><span>ВОРОНКА</span><b data-testid="summary-pipeline">{money(summaryQuery.data?.pipelineValueUah ?? 0)}</b></div><div className="summary-alert"><span>ПРОСТРОЧЕНІ ЗАВДАННЯ</span><b data-testid="summary-overdue">{summaryQuery.data?.overdueTasks ?? 0}</b></div></>}</div>
         <div className="crm-shell"><section className="queue"><div className="queue-head"><div><h2>Черга клієнтів</h2><p>Фізичні особи, компанії та їхні замовлення</p></div><button data-testid="button-sort-companies" className="icon-button" onClick={() => setSortNewest((value) => !value)}><ArrowDownUp size={15} /></button><div className="search-wrap"><Search size={15} /><input data-testid="input-company-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ім’я, телефон, код або місто" /></div><div className="filter-row">{filters.map((item) => <button data-testid={`filter-${item.value}`} key={item.value} className={filter === item.value ? 'selected' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div></div><div className="queue-labels"><span>КЛІЄНТ / ТИП</span><span>ЕТАП / СУМА</span></div><div className="company-list bb-scroll">{companiesQuery.isLoading ? <>{[1, 2, 3, 4].map((item) => <div key={item} className="company-skeleton"><Skeleton /><Skeleton /><Skeleton /></div>)}</> : companiesQuery.isError ? <div className="empty-state"><CircleAlert size={22} /><b>Не вдалося завантажити клієнтів</b><button onClick={() => companiesQuery.refetch()}>Повторити</button></div> : sorted.length ? sorted.map((company) => <CompanyRow key={company.id} company={company} active={company.id === activeId} canDelete={roleCanManageCrmData(role)} select={() => { setSelectedId(company.id); localStorage.setItem('budbox-selected-company', String(company.id)); setTab('Огляд'); }} onDelete={() => setCompanyDeleteTarget(company)} />) : companies.length === 0 && !query && filter === GetCompaniesFilter.all ? <div className="empty-state"><UsersRound size={24} /><b>Клієнтів ще немає</b><span>Створіть картку клієнта або компанії.</span><button data-testid="button-create-first-company" onClick={() => open('client', { customerType: retailCustomerType, manager: currentManager, paymentForm: PaymentForm.готівка, channel: 'Instagram Direct' })}>Створити клієнта</button></div> : <div className="empty-state"><Search size={23} /><b>Нічого не знайдено</b><span>Змініть пошук або фільтр</span><button onClick={() => { setQuery(''); setFilter(GetCompaniesFilter.all); }}>Скинути фільтри</button></div>}</div><div className="queue-foot"><span>Показано {sorted.length} із {companies.length}</span><button onClick={() => { setQuery(''); setFilter(GetCompaniesFilter.all); }}>Скинути</button></div></section>
          <section className="profile-pane bb-scroll">{!activeId ? <div className="profile-empty"><Building2 size={32} /><h2>Оберіть компанію</h2><p>Профіль клієнта з’явиться тут після вибору в черзі.</p></div> : detailQuery.isLoading ? <div className="loading-profile"><Skeleton className="wide" /><Skeleton className="hero-skeleton" /><Skeleton className="wide" /></div> : detailQuery.isError || !detail ? <div className="empty-state"><CircleAlert size={22} /><b>Профіль недоступний</b><button onClick={() => detailQuery.refetch()}>Повторити</button></div> : <div className="profile-content bb-enter"><div className="profile-header"><div className="profile-breadcrumb">КЛІЄНТИ <ChevronRight size={12} /> {detail.name}</div><div className="profile-main"><div className="company-icon"><Building2 size={23} /></div><div className="company-title"><div><h2 data-testid={`text-company-${detail.id}`}>{detail.name}</h2><span className="badge type-badge">{detail.customerType}</span></div><div className="company-meta"><button data-testid="button-copy-tax-id" onClick={() => copy(detail.taxId, 'Код')}><ShieldCheck size={13} /> {detail.taxId || 'Код не вказано'} <Copy size={11} /></button><span><MapPin size={13} />{detail.city || 'Місто не вказано'}</span><span className={`source-chip ${detail.source ? 'has-source' : ''}`}><Tag size={11} /> Маркетинг: {detail.source || 'Не вказано'}</span></div></div><div className="profile-buttons"><button data-testid="button-add-note" className="secondary-button" onClick={() => open('note')}><FileText size={14} /> Нотатка</button><button data-testid="button-add-task" className="secondary-button" onClick={() => open('task')}><Plus size={14} /> Завдання</button><button data-testid="button-edit-company" className="primary-button small" onClick={() => open('edit', companyForm)}><Edit3 size={14} /> Редагувати</button>{roleCanManageCrmData(role) && <button data-testid="button-delete-company" className="order-delete-button" onClick={() => setCompanyDeleteTarget(detail)}><Trash2 size={14} /> Видалити</button>}</div></div><div className="tabs">{(['Огляд', 'Історія', 'Контакти', 'Замовлення'] as const).map((item) => <button data-testid={`tab-${item}`} key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Історія' && <em>{detail.activity.length}</em>}{item === 'Контакти' && <em>{detail.contacts.length}</em>}</button>)}</div></div>{tab === 'Огляд' ? <Overview detail={detail} open={open} completeTask={completeTask} editOrder={editOrder} editCompany={() => open('edit', companyForm)} copy={copy} flash={flash} /> : tab === 'Історія' ? <ActivityTab detail={detail} open={open} /> : tab === 'Контакти' ? <ContactsTab detail={detail} open={open} flash={flash} /> : <OrdersTab detail={detail} role={role} open={open} editOrder={editOrder} deleteOrder={deleteOrder} refreshTracking={() => refresh(activeId ?? undefined)} onOpenCompany={(companyId) => { setSelectedId(companyId); localStorage.setItem('budbox-selected-company', String(companyId)); }} />}</div>}</section></div></main></div>
    {notice && <div className={`notice ${notice.kind}`} data-testid="status-notice"><Check size={15} /> {notice.text}</div>}
    {showCompanyModal && <Modal title={title} subtitle="Дані будуть збережені у CRM через API" close={close}><CompanyForm form={form} setValue={setValue} onSubmit={() => submitCompany(modal === 'edit')} busy={busy} edit={modal === 'edit'} canAssignManager={roleCanAssignClients(role)} /></Modal>}
    {modal === 'client' && <Modal title="Новий клієнт" subtitle="Створіть окрему картку покупця та збережіть його телефон у контактах" close={close}><ClientForm form={form} setValue={setValue} onSubmit={submitClient} busy={busy} /></Modal>}
    {modal === 'contact' && <Modal title={title} subtitle={`Новий контакт для ${selected?.name ?? 'компанії'}`} close={close}><ContactForm form={form} setValue={setValue} onSubmit={submitContact} busy={busy} /></Modal>}
    {modal === 'order' && <Modal title={title} subtitle="Вкажіть етап, суму та ручні дані доставки" close={close}><OrderForm form={form} setValue={setValue} onSubmit={submitOrder} busy={busy} /></Modal>}
    {modal === 'task' && <Modal title={title} subtitle={`Нагадування для ${selected?.name ?? 'компанії'}`} close={close}><TaskForm form={form} setValue={setValue} onSubmit={submitTask} busy={busy} /></Modal>}
    {modal === 'note' && <Modal title={title} subtitle="Запис з’явиться в історії активності клієнта" close={close}><NoteForm form={form} setValue={setValue} onSubmit={submitNote} busy={busy} /></Modal>}
    <AlertDialog open={Boolean(companyDeleteTarget)} onOpenChange={(open) => !deletingCompany && !open && setCompanyDeleteTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити {companyDeleteTarget?.name || 'клієнта'}?</AlertDialogTitle>
          <AlertDialogDescription>Разом із карткою буде безповоротно видалено пов’язані замовлення, контакти, завдання та історію активності.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingCompany}>Скасувати</AlertDialogCancel>
          <AlertDialogAction className="order-delete-confirm-action" disabled={deletingCompany} onClick={(event) => { event.preventDefault(); void deleteCompany(); }}>{deletingCompany ? 'Видалення…' : 'Видалити картку'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

const navigation = [
  { path: '/overview', label: 'Огляд', icon: LayoutDashboard, id: 'nav-overview' },
  { path: '/', label: 'Клієнти', icon: UsersRound, id: 'nav-clients' },
  { path: '/tasks', label: 'Завдання', icon: ClipboardList, id: 'nav-tasks' },
  { path: '/chat', label: 'Менеджери онлайн', icon: MessageCircle, id: 'nav-chat' },
  { path: '/orders', label: 'Замовлення', icon: Package, id: 'nav-orders' },
  { path: '/analytics', label: 'Аналітика', icon: BarChart3, id: 'nav-analytics' },
  { path: '/warehouse', label: 'Склад', icon: Package, id: 'nav-warehouse' },
  { path: '/activity', label: 'Активність', icon: Activity, id: 'nav-activity' },
];
function NavItems({ current, role, isAdmin, navigate, chatUnreadCount = 0 }: { current: string; role: CrmRole; isAdmin: boolean; navigate?: (path: string) => void; chatUnreadCount?: number }) {
  const pageForPath: Record<string, string> = { '/': 'clients', '/overview': 'overview', '/tasks': 'tasks', '/chat': 'chat', '/orders': 'orders', '/analytics': 'analytics', '/warehouse': 'warehouse', '/activity': 'activity' };
  const items = [
    ...navigation.filter(({ path }) => roleCanAccessPage(role, pageForPath[path] ?? '')),
    ...(isAdmin ? [{ path: '/admin', label: 'Адмінка', icon: ShieldCheck, id: 'nav-admin' }] : []),
  ];
  return <>{items.map(({ path, label, icon: Icon, id }) => <Link key={path} href={path} aria-label={label} title={label} data-testid={id} className={`nav-link ${current === path ? 'active' : ''}`} onClick={() => navigate?.(path)}><Icon size={18} /><span>{label}</span>{path === '/chat' && chatUnreadCount > 0 && <em className="nav-unread-badge">{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</em>}</Link>)}</>;
}

type AnalyticsPeriod = 'day' | 'week' | 'month' | 'range';
type CrmRole = 'owner' | 'director' | 'sales_manager' | 'manager' | 'warehouse' | 'accountant' | 'auditor';
type AdminUser = {
  id: number;
  userId: string;
  email: string;
  role: CrmRole;
  team: string | null;
  isActive: boolean;
  deletedAt: string | null;
  updatedAt: string;
};
type AdminAuditItem = {
  id: number;
  actorEmail: string | null;
  action: string;
  entityType: string;
  summary: string;
  createdAt: string;
};
const crmRoleLabels: Record<CrmRole, string> = {
  owner: 'Головний адміністратор',
  director: 'Директор',
  sales_manager: 'Керівник продажів',
  manager: 'Менеджер',
  warehouse: 'Комірник',
  accountant: 'Бухгалтер',
  auditor: 'Перегляд / аудитор',
};
const crmRoleDescriptions: Record<CrmRole, string> = {
  owner: 'Повний доступ, команда, ролі, системні налаштування та аудит.',
  director: 'Усі клієнти й показники компанії, замовлення, склад та розподіл клієнтів.',
  sales_manager: 'Клієнти, завдання, замовлення й аналітика своєї команди; розподіл клієнтів у команді.',
  manager: 'Власні клієнти, контакти, замовлення, завдання та аналітика.',
  warehouse: 'Комплектація, залишки, відправлення й статуси доставки без фінансових сум.',
  accountant: 'Перегляд сум і аналітики; зміна статусу оплати та номера видаткової.',
  auditor: 'Лише перегляд журналу активності.',
};
function roleCanManageCrmData(role: CrmRole) {
  return ['owner', 'director', 'sales_manager', 'manager'].includes(role);
}
function roleCanAssignClients(role: CrmRole) {
  return ['owner', 'director', 'sales_manager'].includes(role);
}

function addDays(date: Date, offset: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function parseAnalyticsDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getAnalyticsRevenueDate(order: OrderBoardItem) {
  return parseAnalyticsDate(order.paidAt ?? order.orderDate ?? order.createdAt);
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function getStartOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getEndOfWeek(date: Date) {
  const start = getStartOfWeek(date);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatWindowLabel(period: AnalyticsPeriod, anchorDate: string, rangeStart: string, rangeEnd: string) {
  if (period === 'range') {
    return `${shortDate(rangeStart)} – ${shortDate(rangeEnd)}`;
  }
  const date = new Date(`${anchorDate}T12:00:00`);
  if (period === 'day') return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(date);
  if (period === 'week') {
    const start = getStartOfWeek(date);
    const end = getEndOfWeek(date);
    return `${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(end)}`;
  }
  return new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' }).format(date);
}

function buildAnalyticsChartData(orders: OrderBoardItem[], period: AnalyticsPeriod, anchorDate: string, rangeStart: string, rangeEnd: string) {
  if (period === 'range') {
    const start = new Date(`${rangeStart}T12:00:00`);
    const end = new Date(`${rangeEnd}T12:00:00`);
    const numberOfDays = Math.floor((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000) + 1;
    const totalsByDay = new Map<string, number>();
    for (const order of orders) {
      if (order.paymentStatus !== 'Оплачено') continue;
      const revenueDate = getAnalyticsRevenueDate(order);
      if (!revenueDate) continue;
      const key = localDateKey(revenueDate.toISOString());
      if (key < rangeStart || key > rangeEnd) continue;
      totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + order.amountUah);
    }
    return Array.from({ length: numberOfDays }, (_, index) => {
      const day = addDays(start, index);
      const key = localDateKey(day.toISOString());
      const value = totalsByDay.get(key) ?? 0;
      return { label: new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(day), value };
    });
  }
  const base = new Date(`${anchorDate}T12:00:00`);
  if (period === 'day') {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(base, index - 6);
      const key = localDateKey(day.toISOString());
      const value = orders.filter((order) => order.paymentStatus === 'Оплачено' && getAnalyticsRevenueDate(order) && localDateKey(getAnalyticsRevenueDate(order)!.toISOString()) === key).reduce((sum, order) => sum + order.amountUah, 0);
      return { label: new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(day), value };
    });
  }
  if (period === 'week') {
    return Array.from({ length: 8 }, (_, index) => {
      const start = getStartOfWeek(addDays(base, (index - 7) * 7));
      const end = getEndOfWeek(start);
      const value = orders.filter((order) => {
        const revenueDate = getAnalyticsRevenueDate(order);
        return order.paymentStatus === 'Оплачено' && revenueDate && revenueDate >= start && revenueDate <= end;
      }).reduce((sum, order) => sum + order.amountUah, 0);
      const label = `${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(start)}`;
      return { label, value };
    });
  }
  return Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(base, index - 5);
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const value = orders.filter((order) => {
      const date = getAnalyticsRevenueDate(order);
      return order.paymentStatus === 'Оплачено' && date && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === monthKey;
    }).reduce((sum, order) => sum + order.amountUah, 0);
    return { label: new Intl.DateTimeFormat('uk-UA', { month: 'short', year: '2-digit' }).format(month), value };
  });
}

function AnalyticsPage({ orders }: { orders: OrderBoardItem[] }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('day');
  const [selectedDate, setSelectedDate] = useState(() => localDateInput());
  const [rangeStart, setRangeStart] = useState(() => `${localDateInput().slice(0, 7)}-01`);
  const [rangeEnd, setRangeEnd] = useState(() => localDateInput());
  const [planValue, setPlanValue] = useState<number>(() => {
    const saved = Number(localStorage.getItem('budbox-analytics-plan-ua') ?? '0');
    return Number.isFinite(saved) ? saved : 0;
  });

  useEffect(() => {
    localStorage.setItem('budbox-analytics-plan-ua', String(planValue));
  }, [planValue]);

  const currentPeriodValue = useMemo(() => {
    const date = new Date(`${selectedDate}T12:00:00`);
    const isWithinRange = (value: Date) => {
      const key = localDateKey(value.toISOString());
      return key >= rangeStart && key <= rangeEnd;
    };
    const inRange = (order: OrderBoardItem) => {
      const value = getAnalyticsRevenueDate(order);
      if (!value) return false;
      if (period === 'day') return localDateKey(value.toISOString()) === selectedDate;
      if (period === 'range') return isWithinRange(value);
      if (period === 'week') {
        const start = getStartOfWeek(date);
        const end = getEndOfWeek(date);
        return value >= start && value <= end;
      }
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      return value >= monthStart && value <= monthEnd;
    };
    return orders.filter((order) => order.paymentStatus === 'Оплачено' && inRange(order)).reduce((sum, order) => sum + order.amountUah, 0);
  }, [orders, period, selectedDate, rangeStart, rangeEnd]);

  const chartData = useMemo(() => buildAnalyticsChartData(orders, period, selectedDate, rangeStart, rangeEnd), [orders, period, selectedDate, rangeStart, rangeEnd]);
  const remaining = Math.max(planValue - currentPeriodValue, 0);
  const completion = planValue > 0 ? Math.min((currentPeriodValue / planValue) * 100, 100) : 0;
  const currentWindowLabel = formatWindowLabel(period, selectedDate, rangeStart, rangeEnd);
  const periodLabel = period === 'day' ? 'день' : period === 'week' ? 'тиждень' : period === 'month' ? 'місяць' : 'період';

  return <section className="analytics-page">
    <div className="analytics-toolbar data-card">
      <div className="analytics-period-switch" role="tablist" aria-label="Період аналітики">
        {(['day', 'week', 'month', 'range'] as AnalyticsPeriod[]).map((item) => <button key={item} type="button" className={period === item ? 'active' : ''} onClick={() => setPeriod(item)}>{item === 'day' ? 'День' : item === 'week' ? 'Тиждень' : item === 'month' ? 'Місяць' : 'Від — до'}</button>)}
      </div>
      {period === 'range' ? <>
        <label className="analytics-date-picker">
          <span>Від</span>
          <input aria-label="Дата початку аналітики" type="date" value={rangeStart} max={rangeEnd} onChange={(event) => { if (event.target.value) setRangeStart(event.target.value); }} />
        </label>
        <label className="analytics-date-picker">
          <span>До</span>
          <input aria-label="Дата завершення аналітики" type="date" value={rangeEnd} min={rangeStart} onChange={(event) => { if (event.target.value) setRangeEnd(event.target.value); }} />
        </label>
      </> : <label className="analytics-date-picker">
        <span>Дата</span>
        <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
      </label>}
      <label className="analytics-plan-input">
        <span>План на {periodLabel}</span>
        <input type="number" min="0" step="100" value={planValue || ''} placeholder="0" onChange={(event) => setPlanValue(Number(event.target.value || 0))} />
      </label>
    </div>

    <div className="analytics-summary-grid">
      <div className="data-card analytics-metric">
        <span>Виручка за {periodLabel}</span>
        <b>{money(currentPeriodValue)}</b>
        <small>{currentWindowLabel}</small>
      </div>
      <div className="data-card analytics-metric">
        <span>План</span>
        <b>{money(planValue)}</b>
        <small>{planValue > 0 ? `План запланований на цей ${periodLabel}` : 'План ще не задано'}</small>
      </div>
      <div className="data-card analytics-metric">
        <span>Залишилось до плану</span>
        <b className={remaining > 0 ? '' : 'success'}>{money(remaining)}</b>
        <small>{remaining > 0 ? 'Ще потрібно досягти' : 'План виконано'}</small>
      </div>
      <div className="data-card analytics-metric">
        <span>Виконання</span>
        <b>{planValue > 0 ? `${Math.round(completion)}%` : '—'}</b>
        <small>{planValue > 0 ? `${money(currentPeriodValue)} / ${money(planValue)}` : 'Вкажіть план для розрахунку'}</small>
      </div>
    </div>

    <div className="data-card analytics-chart-block">
      <div className="analytics-chart-header">
        <div>
          <small>Динаміка продажів</small>
          <h3>{period === 'day' ? 'За останні 7 днів' : period === 'week' ? 'За останні 8 тижнів' : period === 'month' ? 'За останні 6 місяців' : `${shortDate(rangeStart)} – ${shortDate(rangeEnd)}`}</h3>
        </div>
      </div>
      <div className="analytics-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(123, 138, 168, 0.15)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#7082a5', fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#7082a5', fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
            <Tooltip formatter={(value: number) => money(Number(value))} labelStyle={{ color: '#1d2a39' }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#4b7ef7" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </section>;
}

function GlobalPage({ page, userEmail, userId, role, isAdmin, onSignOut, presenceError = '', chatUnreadCount = 0, notificationsEnabled = false, notificationPermission = 'default', onEnableNotifications }: { page: 'overview' | 'tasks' | 'orders' | 'warehouse' | 'activity' | 'analytics' | 'admin' | 'chat'; userEmail: string | null; userId: string; role: CrmRole; isAdmin: boolean; onSignOut: () => Promise<void>; presenceError?: string; chatUnreadCount?: number; notificationsEnabled?: boolean; notificationPermission?: NotificationPermission | 'unsupported'; onEnableNotifications?: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [railOpen, setRailOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const summary = useGetCrmSummary();
  const tasks = useGetCrmTasks();
  const orders = useGetCrmOrders({ query: { queryKey: getGetCrmOrdersQueryKey(), refetchInterval: 60_000 } });
  const activity = useGetCrmActivity();
  const companiesQuery = useGetCompanies({ filter: GetCompaniesFilter.all });
  const createTask = useCreateTask();
  const createOrder = useCreateOrder();
  const createStandaloneOrder = useCreateStandaloneOrder();
  const createNote = useCreateNote();
  const updateTask = useUpdateTask();
  const updateOrder = useUpdateOrder();
  const removeOrder = useDeleteOrder();
  const currentManager = resolveManagerName(userEmail);
  const [savedDisplayName, setSavedDisplayName] = useState(() => readSavedDisplayName());
  const profileDisplayName = getPrimaryDisplayName(userEmail, 'Робочий акаунт');
  const saveDisplayName = (value: string) => {
    const trimmed = value.trim();
    setSavedDisplayName(trimmed);
    writeSavedDisplayName(trimmed);
  };
  const [formKind, setFormKind] = useState<'task' | 'order' | 'note' | null>(null);
  const [editingTask, setEditingTask] = useState<TaskBoardItem | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const companies = Array.isArray(companiesQuery.data) ? companiesQuery.data : [];
  const [form, setForm] = useState<{ companyId: string; companySearch: string; taxId: string; title: string; details: string; dueAt: string; assignee: string; code: string; stage: DealStage; amountUah: string; ttn: string; invoiceNumber: string; comment: string; sender: string; warehouse: string; customerName: string; selectedCompanyName: string; selectedContactName: string; selectedCustomerType: string; phone: string; itemCount: string; paymentMethod: string; paymentStatus: string; marketingSource: string; orderDate: string; city: string }>({ companyId: '', companySearch: '', taxId: '', title: '', details: '', dueAt: '', assignee: currentManager, code: '', stage: stages[0], amountUah: '', ttn: '', invoiceNumber: '', comment: '', sender: '', warehouse: '', customerName: '', selectedCompanyName: '', selectedContactName: '', selectedCustomerType: '', phone: '', itemCount: '', paymentMethod: paymentMethods[0], paymentStatus: orderStatuses[0], marketingSource: '', orderDate: localDateInput(), city: '' });
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedCustomerSearch(form.companySearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [form.companySearch]);
  const orderCustomerSearch = useQuery({
    queryKey: ['order-customer-search', debouncedCustomerSearch],
    queryFn: () => customFetch<OrderCustomerSuggestion[]>(`/api/crm/order-customer-search?q=${encodeURIComponent(debouncedCustomerSearch)}`),
    enabled: (formKind === 'order' || formKind === 'task') && !form.companyId && debouncedCustomerSearch.length >= 2,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!orderCustomerSearch.error || (formKind !== 'order' && formKind !== 'task')) return;
    setNoticeIsError(true);
    setNotice('Не вдалося виконати пошук клієнта. Спробуйте ще раз.');
  }, [formKind, orderCustomerSearch.error]);
  const applyCompanySuggestion = (company: OrderCustomerSuggestion) => {
    setForm((current) => ({
      ...current,
      companyId: String(company.companyId),
      companySearch: company.contactName || company.companyName,
      customerName: company.contactName || company.companyName,
      phone: company.phone || '',
      taxId: company.taxId || '',
      city: company.city || '',
      manager: company.manager || '',
      selectedCompanyName: company.companyName,
      selectedContactName: company.contactName || '',
      selectedCustomerType: company.customerType || '',
    }));
  };
  const clearCompanySuggestion = () => {
    setForm((current) => ({
      ...current,
      companyId: '',
      companySearch: '',
      customerName: '',
      phone: '',
      taxId: '',
      city: '',
      manager: '',
      selectedCompanyName: '',
      selectedContactName: '',
      selectedCustomerType: '',
    }));
  };
  const setValue = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [panel, setPanel] = useState<'notifications' | 'settings' | 'profile' | null>(null);
  const [compact, setCompact] = useState(() => localStorage.getItem('budbox-compact') === 'true');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const taskRows = Array.isArray(tasks.data) ? tasks.data : [];
  const orderRows = Array.isArray(orders.data) ? orders.data : [];
  const normalizedOrderSearch = orderSearch.trim().toLocaleLowerCase('uk-UA');
  const searchedOrderRows = orderRows.filter((order) => {
    const orderDateKey = (order.orderDate || order.createdAt).slice(0, 10);
    if (orderDateFrom && orderDateKey < orderDateFrom) return false;
    if (orderDateTo && orderDateKey > orderDateTo) return false;
    const isPaid = isPaidOrder(order);
    if (paymentFilter === 'paid' && !isPaid) return false;
    if (paymentFilter === 'unpaid' && isPaid) return false;
    if (!normalizedOrderSearch) return true;
    const searchable = [
      order.code,
      order.customerName,
      order.companyName,
      order.phone,
      order.ttn,
      order.invoiceNumber,
      String(order.amountUah),
      new Intl.NumberFormat('uk-UA').format(order.amountUah),
    ].filter(Boolean).join(' ').toLocaleLowerCase('uk-UA');
    const queryDigits = normalizedOrderSearch.replace(/\D/g, '');
    return searchable.includes(normalizedOrderSearch) ||
      (queryDigits.length > 0 && searchable.replace(/\D/g, '').includes(queryDigits));
  });
  const selectedOrder = orderRows.find((order) => order.id === selectedOrderId);
  const activityRows = Array.isArray(activity.data) ? activity.data : [];
  const now = new Date();
  const paymentInRange = (order: OrderBoardItem) => {
    if (order.paymentStatus !== 'Оплачено' || !order.paidAt) return false;
    const paidDate = localDateKey(order.paidAt);
    return (!orderDateFrom || paidDate >= orderDateFrom) && (!orderDateTo || paidDate <= orderDateTo);
  };
  const creditedOrders = orderRows.filter(paymentInRange);
  const creditedAmount = creditedOrders.reduce((total, order) => total + order.amountUah, 0);
  const todayDateKey = localDateInput();
  const creditedToday = orderRows
    .filter((order) => order.paymentStatus === 'Оплачено' && localDateKey(order.paidAt) === todayDateKey)
    .reduce((total, order) => total + order.amountUah, 0);
  const unpaidOrders = orderRows.filter((order) => !order.paymentStatus || order.paymentStatus === 'Неоплачено');
  const unpaidAmount = unpaidOrders.reduce((total, order) => total + order.amountUah, 0);
  const activeOrderRows = searchedOrderRows.filter((order) => order.stage !== DealStage.Успішно_реалізовано);
  const completedOrderRows = searchedOrderRows.filter((order) => order.stage === DealStage.Успішно_реалізовано);
  const dailyCredits = creditedOrders.reduce<Record<string, number>>((totals, order) => {
    const paidDate = localDateKey(order.paidAt);
    if (paidDate) totals[paidDate] = (totals[paidDate] ?? 0) + order.amountUah;
    return totals;
  }, {});
  const titleMap = { overview: 'Огляд продажів', tasks: 'Завдання', orders: 'Замовлення', analytics: 'Аналітика', warehouse: 'Склад', activity: 'Активність', admin: 'Адмін-панель', chat: 'Менеджери онлайн' };
  const refresh = async (companyId?: number) => Promise.all([
    qc.invalidateQueries({ queryKey: getGetCrmSummaryQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCrmTasksQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCrmOrdersQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCrmActivityQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCompaniesQueryKey() }),
    ...(companyId ? [qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) })] : []),
  ]);
  const toggleTask = (task: TaskBoardItem) => updateTask.mutate({ taskId: task.id, data: { isCompleted: !task.isCompleted } }, {
    onSuccess: () => { void refresh(task.companyId); setNoticeIsError(false); setNotice(task.isCompleted ? 'Завдання повернуто в роботу' : 'Завдання виконано'); },
    onError: () => { setNoticeIsError(true); setNotice('Не вдалося оновити завдання'); },
  });
  const openTaskEditor = (task: TaskBoardItem) => {
    setEditingTask(task);
    setForm({
      companyId: String(task.companyId),
      companySearch: task.companyName,
      selectedCompanyName: task.companyName,
      title: task.title,
      dueAt: task.dueAt ? localDateTimeInput(task.dueAt) : '',
      assignee: task.assignee,
      taxId: '',
      details: '',
      code: '',
      stage: stages[0],
      amountUah: '',
      ttn: '',
      invoiceNumber: '',
      comment: '',
      sender: '',
      warehouse: '',
      customerName: '',
      selectedContactName: '',
      selectedCustomerType: '',
      phone: '',
      itemCount: '',
      paymentMethod: paymentMethods[0],
      paymentStatus: orderStatuses[0],
      marketingSource: '',
      orderDate: localDateInput(),
      city: '',
    });
    setFormKind('task');
  };
  const deleteTask = async (task: TaskBoardItem) => {
    if (!window.confirm(`Видалити завдання «${task.title}»?`)) return;
    try {
      await customFetch<void>(`/api/tasks/${task.id}`, { method: 'DELETE' });
      await refresh(task.companyId);
      setNoticeIsError(false);
      setNotice('Завдання видалено');
    } catch (error) {
      console.error('Could not delete CRM task', error);
      setNoticeIsError(true);
      setNotice(error instanceof Error ? error.message : 'Не вдалося видалити завдання');
    }
  };
  const saveOrder = async (orderId: number, companyId: number | null, data: OrderUpdate) => {
    try {
      const allowedData = role === 'accountant'
        ? { paymentStatus: data.paymentStatus, invoiceNumber: data.invoiceNumber }
        : role === 'warehouse'
          ? { stage: data.stage, ttn: data.ttn, invoiceNumber: data.invoiceNumber, sender: data.sender, warehouse: data.warehouse, itemCount: data.itemCount }
          : data;
      await updateOrder.mutateAsync({ orderId, data: allowedData });
      await refresh(companyId ?? undefined);
      setNoticeIsError(false);
      setNotice('Зміни замовлення збережено');
    } catch {
      setNoticeIsError(true);
      setNotice('Не вдалося зберегти зміни замовлення');
      throw new Error('Не вдалося зберегти зміни замовлення.');
    }
  };
  const deleteOrder = async (orderId: number) => {
    try {
      await removeOrder.mutateAsync({ orderId });
      await refresh();
      setNoticeIsError(false);
      setNotice('Замовлення видалено');
    } catch {
      setNoticeIsError(true);
      setNotice('Не вдалося видалити замовлення');
      throw new Error('Не вдалося видалити замовлення.');
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const companyId = Number(form.companyId);
    if (formKind !== 'order' && !companyId) { setNoticeIsError(true); setNotice('Спочатку оберіть компанію'); return; }
    if (formKind === 'task') {
      if (!form.title.trim()) return;
      if (editingTask) {
        updateTask.mutate({ taskId: editingTask.id, data: { title: form.title.trim(), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, assignee: form.assignee.trim() || currentManager } }, {
          onSuccess: () => { void refresh(editingTask.companyId); setFormKind(null); setEditingTask(null); setNoticeIsError(false); setNotice('Завдання оновлено'); },
          onError: () => { setNoticeIsError(true); setNotice('Не вдалося оновити завдання'); },
        });
        return;
      }
      createTask.mutate({ companyId, data: { title: form.title.trim(), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, assignee: form.assignee.trim() || currentManager } }, {
        onSuccess: () => { void refresh(companyId); setFormKind(null); setNoticeIsError(false); setNotice('Завдання створено'); },
        onError: () => { setNoticeIsError(true); setNotice('Не вдалося створити завдання'); },
      });
    } else if (formKind === 'order') {
      if (!form.amountUah) return;
      createStandaloneOrder.mutate({ data: {
        code: form.code || null,
        stage: stages[0],
        amountUah: Number(form.amountUah),
        ttn: form.ttn || null,
        invoiceNumber: form.invoiceNumber || null,
        comment: form.comment || null,
        sender: form.sender || null,
        warehouse: form.warehouse || null,
        customerName: form.customerName || null,
        phone: form.phone || null,
        itemCount: form.itemCount ? Number(form.itemCount) : null,
        paymentMethod: form.paymentMethod || null,
        paymentStatus: form.paymentStatus || orderStatuses[0],
        marketingSource: form.marketingSource || null,
        orderDate: form.orderDate || null,
      } }, {
        onSuccess: () => { void refresh(); setFormKind(null); setNoticeIsError(false); setNotice('Замовлення створено'); },
        onError: () => { setNoticeIsError(true); setNotice('Не вдалося створити замовлення'); },
      });
    } else if (formKind === 'note') {
      if (!form.title.trim()) return;
      createNote.mutate({ companyId, data: { title: form.title.trim(), details: form.details.trim() || null, createdBy: currentManager } }, {
        onSuccess: () => { void refresh(companyId); setFormKind(null); setNoticeIsError(false); setNotice('Запис додано до активності'); },
        onError: () => { setNoticeIsError(true); setNotice('Не вдалося додати запис'); },
      });
    }
  };
  const openForm = (kind: 'task' | 'order' | 'note') => {
    if (kind !== 'order' && !companies.length) {
      sessionStorage.setItem('budbox-open-company', 'true');
      navigate('/');
      return;
    }
    setForm({ companyId: '', companySearch: '', taxId: '', title: '', details: '', dueAt: '', assignee: currentManager, code: '', stage: stages[0], amountUah: '', ttn: '', invoiceNumber: '', comment: '', sender: orderSenders[0], warehouse: orderWarehouses[0], customerName: '', selectedCompanyName: '', selectedContactName: '', selectedCustomerType: '', phone: '', itemCount: '', paymentMethod: paymentMethods[0], paymentStatus: orderStatuses[0], marketingSource: '', orderDate: localDateInput(), city: '' });
    setEditingTask(null);
    setFormKind(kind);
  };
  const overdueRows = taskRows.filter((task) => !task.isCompleted && task.dueAt && new Date(task.dueAt) < new Date());
  const setDensity = () => { const next = !compact; setCompact(next); localStorage.setItem('budbox-compact', String(next)); document.documentElement.classList.toggle('bb-compact', next); };
  useEffect(() => { document.documentElement.classList.toggle('bb-compact', compact); }, [compact]);
  const pageTitle = titleMap[page];
  const errorForPage = page === 'tasks' ? tasks.isError : page === 'orders' ? orders.isError : page === 'activity' ? activity.isError : page === 'analytics' ? orders.isError : page === 'overview' ? summary.isError || tasks.isError || orders.isError || activity.isError : page === 'admin' ? summary.isError || orders.isError : false;
  const loadingForPage = page === 'tasks' ? tasks.isLoading : page === 'orders' ? orders.isLoading : page === 'activity' ? activity.isLoading : page === 'analytics' ? orders.isLoading : page === 'overview' ? summary.isLoading || tasks.isLoading || orders.isLoading || activity.isLoading : page === 'admin' ? summary.isLoading || orders.isLoading : false;
  return <div className="bb-app global-app">
    <header className="topbar"><button data-testid="button-hamburger" className="icon-button hamburger" aria-label="Перемкнути навігацію" aria-expanded={window.innerWidth < 768 ? drawerOpen : railOpen} onClick={() => { if (window.innerWidth < 768) setDrawerOpen(!drawerOpen); else setRailOpen(!railOpen); }}><Menu size={19} /></button><div className="brand"><div className="brand-mark">B</div><div><strong>BUDBOX</strong><small>CRM / ПРОДАЖІ</small></div></div><div className="crumbs"><span>Продажі</span><ChevronRight size={13} /><b>{pageTitle}</b></div><div className="top-actions"><button aria-label="Сповіщення" aria-expanded={panel === 'notifications'} className="icon-button" data-testid="button-notifications" onClick={() => setPanel(panel === 'notifications' ? null : 'notifications')}><Bell size={17} />{overdueRows.length > 0 && <i />}</button><button aria-label="Налаштування" aria-expanded={panel === 'settings'} className="icon-button" data-testid="button-settings" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Settings2 size={17} /></button><button aria-label="Профіль і параметри" aria-expanded={panel === 'profile'} className="profile profile-trigger" data-testid="button-profile-menu" onClick={() => setPanel(panel === 'profile' ? null : 'profile')}><span>{userEmail?.slice(0, 2).toUpperCase() || 'BU'}</span><div><b>{profileDisplayName}</b><small>{userEmail || 'Робочий акаунт'}</small></div><ChevronDown size={14} /></button></div>
      {panel && <div className="header-popover" data-testid={`panel-${panel}`}><div className="popover-title">{panel === 'notifications' ? 'Потребують уваги' : panel === 'settings' ? 'Налаштування вигляду' : 'Робочий профіль'}<button className="icon-button" onClick={() => setPanel(null)}><X size={14} /></button></div>{panel === 'notifications' ? tasks.isLoading ? <p>Завантаження завдань…</p> : tasks.isError ? <p>Не вдалося завантажити сповіщення.</p> : overdueRows.length ? overdueRows.slice(0, 5).map((task) => <button className="popover-row" key={task.id} onClick={() => { setPanel(null); navigate('/tasks'); }}><CircleAlert size={14} /><span><b>{task.title}</b><small>{task.companyName} · {date(task.dueAt)}</small></span></button>) : <p>Прострочених завдань немає.</p> : panel === 'settings' ? <><label className="density-control"><span><b>Компактний список</b><small>Менше вертикальних відступів у списках</small></span><input data-testid="toggle-compact-density" type="checkbox" checked={compact} onChange={setDensity} /></label><DisplayNameEditor initialName={savedDisplayName} onSave={saveDisplayName} /><div className="browser-notification-setting"><span><BellRing size={15} /><span><b>Сповіщення про чат</b><small>{notificationPermission === 'unsupported' ? 'Браузер не підтримує сповіщення' : notificationPermission === 'denied' ? 'Дозвіл заборонено в налаштуваннях браузера' : notificationsEnabled ? 'Увімкнені, поки CRM відкрита' : 'Системні сповіщення про нові повідомлення'}</small></span></span>{notificationPermission !== 'unsupported' && notificationPermission !== 'denied' && <button type="button" className="secondary-button" onClick={onEnableNotifications}>{notificationsEnabled ? 'Вимкнути' : 'Увімкнути'}</button>}</div></> : <><p>{userEmail || 'Робочий акаунт'}</p><button className="popover-row" onClick={() => setPanel('settings')}><SlidersHorizontal size={14} /><span><b>Налаштування вигляду</b><small>Зберігаються локально у цьому браузері</small></span></button><button className="popover-row auth-signout-row" onClick={() => { setPanel(null); void onSignOut().catch(() => { setNoticeIsError(true); setNotice('Не вдалося вийти з акаунта'); }); }}><LogOut size={14} /><span><b>Вийти з акаунта</b><small>Завершити поточний сеанс CRM</small></span></button></>}</div>}
    </header>
    <div className={`workspace ${railOpen ? '' : 'rail-collapsed'}`}><aside className={`rail ${drawerOpen ? 'drawer-open' : ''}`}><NavItems current={page === 'overview' ? '/overview' : `/${page}`} role={role} isAdmin={isAdmin} chatUnreadCount={chatUnreadCount} navigate={() => setDrawerOpen(false)} /></aside>{drawerOpen && <button className="drawer-scrim" aria-label="Закрити меню" onClick={() => setDrawerOpen(false)} />}
        <main className="main global-main"><div className="page-heading"><div><div className="eyebrow"><span /> РОБОЧИЙ ПРОСТІР ПРОДАЖІВ</div><h1 data-testid="text-page-title">{pageTitle}</h1></div>{page === 'tasks' && roleCanManageCrmData(role) ? <button data-testid="button-new-task" className="primary-button" onClick={() => openForm('task')}><Plus size={15} /> Нове завдання</button> : page === 'orders' && roleCanManageCrmData(role) ? <button data-testid="button-new-order" className="primary-button" onClick={() => openForm('order')}><Plus size={15} /> Нове замовлення</button> : page === 'activity' && roleCanManageCrmData(role) ? <button data-testid="button-new-activity" className="primary-button" onClick={() => openForm('note')}><Plus size={15} /> Додати запис</button> : null}</div>
        {!loadingForPage && !errorForPage && page === 'chat' && <ChatPage currentUserId={userId} presenceError={presenceError} />}
        {loadingForPage ? <div className="global-loading" data-testid="state-loading">{page === 'orders' ? <div className="orders-loading-grid">{[1, 2, 3, 4, 5, 6].map((n) => <div className="order-card-skeleton" key={n}><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>)}</div> : [1, 2, 3].map((n) => <div className="global-skeleton" key={n}><Skeleton /><Skeleton /><Skeleton /></div>)}</div> : errorForPage ? <div className="empty-state large" data-testid="state-error"><CircleAlert size={26} /><b>Дані тимчасово недоступні</b><span>Перевірте з’єднання та спробуйте ще раз.</span><button data-testid="button-retry-page" onClick={() => { void summary.refetch(); void tasks.refetch(); void orders.refetch(); void activity.refetch(); }}>Повторити</button></div> : null}
        {!loadingForPage && !errorForPage && page === 'overview' && <><div className="summary-strip">{[['КОМПАНІЇ', summary.data?.totalCompanies ?? 0], ['АКТИВНІ ЗАМОВЛЕННЯ', summary.data?.activeOrders ?? 0], ['ВОРОНКА', money(summary.data?.pipelineValueUah ?? 0)], ['ПРОСТРОЧЕНІ ЗАВДАННЯ', summary.data?.overdueTasks ?? 0]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b data-testid={`overview-metric-${String(label).toLowerCase().replaceAll(' ', '-')}`}>{value}</b></div>)}</div><div className="global-grid"><section className="data-card"><SectionHeader icon={ClipboardList} title="Найближчі завдання" subtitle="Незавершені нагадування команди" action={<Link className="text-button" href="/tasks">Усі завдання</Link>} />{taskRows.filter((task) => !task.isCompleted).slice(0, 6).map((task) => <TaskLine task={task} toggle={toggleTask} key={task.id} />)}{!taskRows.filter((task) => !task.isCompleted).length && <EmptyPanel label="Незавершених завдань поки немає." />}</section><section className="data-card"><SectionHeader icon={History} title="Останні записи" subtitle="Нещодавні дії у клієнтських картках" action={<Link className="text-button" href="/activity">Уся активність</Link>} />{activityRows.slice(0, 6).map((item) => <ActivityBoardLine item={item} key={item.id} onCompany={(companyId) => { localStorage.setItem('budbox-selected-company', String(companyId)); navigate('/'); }} />)}{!activityRows.length && <EmptyPanel label="Активність з’явиться після записів у CRM." />}</section></div></>}
        {!loadingForPage && !errorForPage && page === 'tasks' && <section className="data-card global-table"><div className="table-head"><span>ЗАВДАННЯ / КОМПАНІЯ</span><span>ВІДПОВІДАЛЬНА</span><span>ТЕРМІН</span><span>СТАН / ДІЇ</span></div>{taskRows.map((task) => <TaskLine task={task} toggle={toggleTask} onEdit={() => openTaskEditor(task)} onDelete={() => void deleteTask(task)} key={task.id} />)}{!taskRows.length && <EmptyPanel label="Завдань ще немає. Створіть завдання та оберіть компанію." action={<button className="secondary-button" onClick={() => openForm('task')}>Створити завдання</button>} />}</section>}
        {!loadingForPage && !errorForPage && page === 'analytics' && <AnalyticsPage orders={orderRows} />}
        {!loadingForPage && !errorForPage && page === 'orders' && <>
          <section className="order-filter-panel" aria-label="Пошук і фільтри замовлень">
            <label className="order-search-field"><Search size={16} /><input data-testid="input-order-search" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder={role === 'warehouse' ? 'Номер замовлення, ПІБ, телефон або ТТН' : '№ замовлення, видаткової, ПІБ, телефон, сума або ТТН'} /><kbd>Пошук</kbd></label>
            <div className="order-date-filters"><span>Дата замовлення</span><label><small>Від</small><input data-testid="input-order-date-from" type="date" value={orderDateFrom} max={orderDateTo || undefined} onChange={(event) => setOrderDateFrom(event.target.value)} /></label><span className="order-date-separator">—</span><label><small>До</small><input data-testid="input-order-date-to" type="date" value={orderDateTo} min={orderDateFrom || undefined} onChange={(event) => setOrderDateTo(event.target.value)} /></label>            <button type="button" className="order-filter-reset" onClick={() => { setOrderSearch(''); setOrderDateFrom(''); setOrderDateTo(''); setPaymentFilter('all'); }}>Очистити</button></div>
            {role !== 'warehouse' && <div className="order-payment-filters" role="group" aria-label="Фільтр за статусом оплати">
            <span>Оплата</span>
            <button type="button" className={paymentFilter === 'all' ? 'active' : ''} aria-pressed={paymentFilter === 'all'} onClick={() => setPaymentFilter('all')}>Усі <b>{orderRows.length}</b></button>
            <button type="button" className={paymentFilter === 'paid' ? 'active paid' : 'paid'} aria-pressed={paymentFilter === 'paid'} onClick={() => setPaymentFilter('paid')}>Оплачені <b>{orderRows.filter((order) => order.paymentStatus === 'Оплачено').length}</b></button>
            <button type="button" className={paymentFilter === 'unpaid' ? 'active unpaid' : 'unpaid'} aria-pressed={paymentFilter === 'unpaid'} onClick={() => setPaymentFilter('unpaid')}>Неоплачені <b>{orderRows.filter((order) => order.paymentStatus !== 'Оплачено').length}</b></button>
            </div>}
          </section>
          {role !== 'warehouse' && <>
          <div className="order-summary-strip">
            <div className="data-card"><span>ЗАРАХОВАНО ЗА ПЕРІОД</span><b data-testid="metric-orders-credited">{money(creditedAmount)}</b><small>{creditedOrders.length} оплат · зарахування лише зі статусом «Оплачено»</small></div>
            <div className="data-card"><span>ОЧІКУЮТЬ ОПЛАТИ</span><b data-testid="metric-orders-unpaid">{unpaidOrders.length} <small>· {money(unpaidAmount)}</small></b><small>Тільки замовлення зі статусом «Неоплачено»</small></div>
            <div className="data-card"><span>ЗАРАХОВАНО СЬОГОДНІ</span><b data-testid="metric-orders-credited-today">{money(creditedToday)}</b><small>{new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' }).format(now)}</small></div>
          </div>
          <div className="order-period-hint"><CircleHelp size={14} /><span>Фільтр дат обмежує замовлення за датою створення; баланс рахується за датою фактичного переходу в статус «Оплачено».</span></div>
          {Object.keys(dailyCredits).length > 0 && <section className="order-credit-breakdown" aria-label="Зарахування за днями"><b>Зарахування за днями</b>{Object.entries(dailyCredits).sort(([left], [right]) => right.localeCompare(left)).map(([day, amount]) => <span key={day}><time>{shortDate(day)}</time><strong>{money(amount)}</strong></span>)}</section>}
          </>}
          {orderRows.length > 0 ? searchedOrderRows.length > 0 ? <>
            <section className="orders-card-grid" aria-label="Невиконані замовлення">
              {activeOrderRows.map((order, index) => <OrderCard key={order.id} order={order} marketingSource={role === 'warehouse' ? null : order.marketingSource || (order.companyId === null ? null : companiesById.get(order.companyId)?.source)} index={index} role={role} editOrder={(id, data) => saveOrder(id, order.companyId, data)} open={() => setSelectedOrderId(order.id)} />)}
              {!activeOrderRows.length && <div className="data-card"><EmptyPanel label="Невиконаних замовлень за цими фільтрами немає." /></div>}
            </section>
            {completedOrderRows.length > 0 && <details className="completed-orders-history">
              <summary><History size={16} /><span>Історія виконаних замовлень</span><b>{completedOrderRows.length}</b></summary>
              <section className="orders-card-grid" aria-label="Виконані замовлення">
                {completedOrderRows.map((order, index) => <OrderCard key={order.id} order={order} marketingSource={role === 'warehouse' ? null : order.marketingSource || (order.companyId === null ? null : companiesById.get(order.companyId)?.source)} index={index} role={role} editOrder={(id, data) => saveOrder(id, order.companyId, data)} open={() => setSelectedOrderId(order.id)} />)}
              </section>
            </details>}
          </> : <section className="data-card"><EmptyPanel label="За цим пошуком, періодом і фільтром оплати замовлень не знайдено." action={<button className="secondary-button" onClick={() => { setOrderSearch(''); setOrderDateFrom(''); setOrderDateTo(''); setPaymentFilter('all'); }}>Очистити фільтри</button>} /></section> : <section className="data-card"><EmptyPanel label="Замовлень ще немає." action={roleCanManageCrmData(role) ? <button className="secondary-button" onClick={() => openForm('order')}>Створити замовлення</button> : undefined} /></section>}
        </>}
        {!loadingForPage && !errorForPage && page === 'warehouse' && <WarehousePage />}
        {!loadingForPage && !errorForPage && page === 'activity' && <section className="data-card global-table"><div className="timeline global-timeline">{activityRows.map((item) => <ActivityBoardLine item={item} key={item.id} onCompany={role === 'auditor' ? undefined : (companyId) => { localStorage.setItem('budbox-selected-company', String(companyId)); navigate('/'); }} />)}</div>{!activityRows.length && <EmptyPanel label="Записів активності поки немає." action={roleCanManageCrmData(role) ? <button className="secondary-button" data-testid="button-add-first-activity" onClick={() => openForm('note')}>Додати запис</button> : undefined} />}</section>}
        {!loadingForPage && !errorForPage && page === 'admin' && <AdminPanel orders={orderRows} companyCount={companies.length} compact={compact} toggleCompact={setDensity} currentUserId={userId} />}
      </main>
    </div>
    {notice && <button className={`notice ${noticeIsError ? 'error' : 'success'}`} data-testid="status-notice" onClick={() => setNotice('')}>{noticeIsError ? <CircleAlert size={15} /> : <Check size={15} />} {notice}</button>}
    {formKind && <Modal title={formKind === 'task' ? editingTask ? 'Редагувати завдання' : 'Нове завдання' : formKind === 'order' ? 'Нове замовлення' : 'Новий запис активності'} subtitle={formKind === 'task' ? editingTask ? 'Оновіть опис, термін або відповідального' : 'Знайдіть клієнта або компанію та призначте відповідального' : formKind === 'order' ? 'Знайдіть клієнта або компанію — дані контакту заповняться автоматично' : 'Зафіксуйте нотатку в історії вибраної компанії'} close={() => { setFormKind(null); setEditingTask(null); }}><form className="form-grid" onSubmit={submit}>{formKind === 'task' ? <>{editingTask ? <Field label="Клієнт / компанія" wide><input value={editingTask.companyName} readOnly /></Field> : <CompanyLookupField form={form} setValue={setValue} suggestions={orderCustomerSearch.data ?? []} loading={orderCustomerSearch.isFetching} error={orderCustomerSearch.isError} onSelect={applyCompanySuggestion} onClear={clearCompanySuggestion} />}<Field label="Що потрібно зробити?" wide><div className="callback-task-input"><input data-testid="input-global-task-title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Наприклад, уточнити деталі замовлення" /><button type="button" className="secondary-button" data-testid="button-callback-task" disabled={!form.companyId} onClick={() => setForm((current) => ({ ...current, title: `Передзвонити: ${current.customerName || current.selectedContactName || current.selectedCompanyName}` }))}><Phone size={13} /> Передзвонити</button></div></Field><Field label="Термін"><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field><ManagerSelect value={form.assignee} onChange={(assignee) => setForm((current) => ({ ...current, assignee }))} /></> : formKind === 'order' ? <GlobalOrderFields form={form} setValue={setValue} suggestions={orderCustomerSearch.data ?? []} loading={orderCustomerSearch.isFetching} error={orderCustomerSearch.isError} onSuggestionSelect={applyCompanySuggestion} onSuggestionClear={clearCompanySuggestion} /> : <><Field label="Компанія" wide><select data-testid="select-global-company" required value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })}><option value="">Оберіть компанію</option>{companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></Field><Field label="Заголовок" wide><input data-testid="input-global-activity-title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field label="Деталі" wide><textarea data-testid="input-global-activity-details" rows={4} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></Field></>}<div className="form-actions"><button className="primary-button" data-testid="button-submit-global" disabled={createTask.isPending || updateTask.isPending || createStandaloneOrder.isPending || createNote.isPending}>{createTask.isPending || updateTask.isPending || createStandaloneOrder.isPending || createNote.isPending ? 'Збереження…' : editingTask ? 'Зберегти зміни' : 'Зберегти'}</button></div></form></Modal>}
    {selectedOrder && <OrderDetailModal order={selectedOrder} company={selectedOrder.companyId === null ? undefined : companiesById.get(selectedOrder.companyId)} role={role} save={saveOrder} remove={deleteOrder} refreshTracking={() => refresh(selectedOrder.companyId ?? undefined)} onOpenCompany={(companyId) => { localStorage.setItem('budbox-selected-company', String(companyId)); navigate('/'); setSelectedOrderId(null); }} close={() => setSelectedOrderId(null)} />}
  </div>;
}
function AdminPanel({ orders, companyCount, compact, toggleCompact, currentUserId }: {
  orders: OrderBoardItem[];
  companyCount: number;
  compact: boolean;
  toggleCompact: () => void;
  currentUserId: string;
}) {
  const [section, setSection] = useState<'dashboard' | 'users' | 'audit' | 'settings'>('dashboard');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AdminAuditItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [savingUserId, setSavingUserId] = useState('');
  const [notice, setNotice] = useState('');
  const loadUsers = async () => {
    setLoadingUsers(true);
    setLoadError('');
    try {
      setUsers(await customFetch<AdminUser[]>('/api/admin/users'));
    } catch {
      setLoadError('Не вдалося завантажити команду. Перевірте з’єднання і повторіть спробу.');
    } finally {
      setLoadingUsers(false);
    }
  };
  const loadAudit = async () => {
    setLoadingAudit(true);
    setLoadError('');
    try {
      setAudit(await customFetch<AdminAuditItem[]>('/api/admin/audit?limit=100'));
    } catch {
      setLoadError('Не вдалося завантажити журнал аудиту.');
    } finally {
      setLoadingAudit(false);
    }
  };
  const updateUser = async (user: AdminUser, update: Partial<Pick<AdminUser, 'role' | 'team' | 'isActive'>> & { isDeleted?: boolean }) => {
    setSavingUserId(user.userId);
    setNotice('');
    setLoadError('');
    try {
      const updated = await customFetch<AdminUser>(`/api/admin/users/${encodeURIComponent(user.userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      setUsers((current) => current.map((item) => item.userId === updated.userId ? updated : item));
      setNotice(`Доступ для ${updated.email} оновлено.`);
    } catch {
      setLoadError(`Не вдалося змінити доступ для ${user.email}. Спробуйте ще раз.`);
    } finally {
      setSavingUserId('');
    }
  };
  const deleteUserAccess = async (user: AdminUser) => {
    if (user.deletedAt || !window.confirm(`Видалити доступ до CRM для ${user.email}?`)) return;
    setSavingUserId(user.userId);
    setNotice('');
    setLoadError('');
    try {
      await customFetch<void>(`/api/admin/users/${encodeURIComponent(user.userId)}`, { method: 'DELETE' });
      setUsers((current) => current.map((item) => item.userId === user.userId
        ? { ...item, isActive: false, deletedAt: new Date().toISOString() }
        : item));
      setNotice(`Доступ для ${user.email} видалено. Його можна відновити зі списку.`);
    } catch {
      setLoadError(`Не вдалося видалити доступ для ${user.email}. Спробуйте ще раз.`);
    } finally {
      setSavingUserId('');
    }
  };
  useEffect(() => {
    if (section === 'users') void loadUsers();
    if (section === 'audit') void loadAudit();
  }, [section]);
  const paid = orders.filter((order) => order.paymentStatus === 'Оплачено');
  const unpaid = orders.filter((order) => !order.paymentStatus || order.paymentStatus === 'Неоплачено');
  const paidToday = paid.filter((order) => localDateKey(order.paidAt) === localDateInput()).reduce((sum, order) => sum + order.amountUah, 0);
  return <div className="admin-page">
    <div className="admin-tabs" role="tablist" aria-label="Розділи адмін-панелі">
      <button type="button" role="tab" aria-selected={section === 'dashboard'} className={section === 'dashboard' ? 'active' : ''} onClick={() => setSection('dashboard')}><LayoutDashboard size={14} /> Панель</button>
      <button type="button" role="tab" aria-selected={section === 'users'} className={section === 'users' ? 'active' : ''} onClick={() => setSection('users')}><UsersRound size={14} /> Команда й ролі</button>
      <button type="button" role="tab" aria-selected={section === 'audit'} className={section === 'audit' ? 'active' : ''} onClick={() => setSection('audit')}><History size={14} /> Журнал аудиту</button>
      <button type="button" role="tab" aria-selected={section === 'settings'} className={section === 'settings' ? 'active' : ''} onClick={() => setSection('settings')}><SlidersHorizontal size={14} /> Налаштування</button>
    </div>
    {section === 'dashboard' ? <>
      <div className="admin-metrics">
        <div className="data-card"><span>КЛІЄНТСЬКІ КАРТКИ</span><b>{companyCount}</b><small>У базі CRM</small></div>
        <div className="data-card"><span>УСІ ЗАМОВЛЕННЯ</span><b>{orders.length}</b><small>Активні та завершені</small></div>
        <div className="data-card"><span>ОЧІКУЮТЬ ОПЛАТИ</span><b>{unpaid.length}</b><small>{money(unpaid.reduce((sum, order) => sum + order.amountUah, 0))}</small></div>
        <div className="data-card"><span>ЗАРАХОВАНО СЬОГОДНІ</span><b>{money(paidToday)}</b><small>{paid.filter((order) => localDateKey(order.paidAt) === localDateInput()).length} оплачених замовлень</small></div>
      </div>
      <section className="data-card admin-access-note"><ShieldCheck size={18} /><div><b>Керування доступом</b><p>Призначайте ролі працівникам і вимикайте доступ до CRM. Головний адміністратор захищений від зміни ролі та блокування.</p></div></section>
    </> : section === 'users' ? <section className="data-card admin-settings-card">
      <SectionHeader icon={UsersRound} title="Команда й ролі" subtitle="Доступні акаунти, які вже входили в CRM" />
      <p className="admin-help-text">Новий співробітник з’явиться тут після першого входу через налаштовану авторизацію. Призначте йому роль та команду; тимчасово заблокований акаунт не зможе працювати в CRM.</p>
      <details className="admin-role-guide"><summary>Опис доступів за ролями</summary><div>{Object.entries(crmRoleDescriptions).map(([role, description]) => <p key={role}><b>{crmRoleLabels[role as CrmRole]}:</b> {description}</p>)}</div></details>
      {loadError && <p className="admin-error" role="alert">{loadError}</p>}
      {notice && <p className="admin-success" role="status">{notice}</p>}
      {loadingUsers ? <div className="admin-loading">Завантаження команди…</div> : users.length ? <div className="admin-user-list">
        <div className="admin-user-head"><span>КОРИСТУВАЧ</span><span>РОЛЬ</span><span>КОМАНДА</span><span>ДОСТУП</span><span>ДІЇ</span></div>
        {users.map((user) => {
          const isProtectedOwner = user.role === 'owner';
          const isSelf = user.userId === currentUserId;
          const isDeleted = Boolean(user.deletedAt);
          const disabled = isProtectedOwner || isSelf || isDeleted || savingUserId === user.userId;
          return <div className={`admin-user-row ${isDeleted ? 'deleted' : ''}`} key={user.userId}>
            <div className="admin-user-identity"><b>{user.email}</b><small>{isProtectedOwner ? 'Захищений власник CRM' : isDeleted ? `Доступ видалено ${date(user.deletedAt)}` : `Оновлено ${date(user.updatedAt)}`}</small></div>
            <select aria-label={`Роль ${user.email}`} value={user.role} disabled={disabled} onChange={(event) => void updateUser(user, { role: event.target.value as CrmRole })}>
              {Object.entries(crmRoleLabels).filter(([role]) => role !== 'owner').map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              {user.role === 'owner' && <option value="owner">{crmRoleLabels.owner}</option>}
            </select>
            <input aria-label={`Команда ${user.email}`} defaultValue={user.team ?? ''} disabled={disabled || user.role === 'owner'} placeholder="Назва команди" maxLength={100} onBlur={(event) => {
              const value = event.currentTarget.value.trim() || null;
              if (value !== user.team) void updateUser(user, { team: value });
            }} />
            {isDeleted ? <button className="admin-access-toggle" type="button" disabled={isProtectedOwner || isSelf || savingUserId === user.userId} onClick={() => void updateUser(user, { isDeleted: false })}>
              {savingUserId === user.userId ? 'Збереження…' : 'Відновити'}
            </button> : <button className={user.isActive ? 'admin-access-toggle active' : 'admin-access-toggle'} type="button" disabled={disabled} onClick={() => void updateUser(user, { isActive: !user.isActive })}>
              {savingUserId === user.userId ? 'Збереження…' : user.isActive ? 'Активний' : 'Заблокований'}
            </button>}
            {!isProtectedOwner && !isSelf && !isDeleted && <button className="admin-user-delete" type="button" aria-label={`Видалити доступ ${user.email}`} disabled={savingUserId === user.userId} onClick={() => void deleteUserAccess(user)}><Trash2 size={14} /><span>Видалити</span></button>}
          </div>;
        })}
      </div> : !loadError ? <EmptyPanel label="Ще немає інших акаунтів. Після першого входу співробітника можна буде призначити йому роль." /> : null}
      <div className="admin-inline-actions"><button type="button" className="secondary-button" onClick={() => void loadUsers()} disabled={loadingUsers}>Оновити список</button></div>
    </section> : section === 'audit' ? <section className="data-card admin-settings-card">
      <SectionHeader icon={History} title="Журнал аудиту" subtitle="Зміни доступів і критичні операції в CRM" />
      {loadError && <p className="admin-error" role="alert">{loadError}</p>}
      {loadingAudit ? <div className="admin-loading">Завантаження журналу…</div> : audit.length ? <div className="admin-audit-list">
        {audit.map((item) => <div className="admin-audit-row" key={item.id}><span><b>{item.summary}</b><small>{item.actorEmail || 'Системна подія'} · {item.action}</small></span><time>{date(item.createdAt)}</time></div>)}
      </div> : !loadError ? <EmptyPanel label="Записів аудиту поки немає." /> : null}
      <div className="admin-inline-actions"><button type="button" className="secondary-button" onClick={() => void loadAudit()} disabled={loadingAudit}>Оновити журнал</button></div>
    </section> : <section className="data-card admin-settings-card">
      <SectionHeader icon={SlidersHorizontal} title="Налаштування CRM" subtitle="Параметри вигляду для цього браузера" />
      <label className="density-control"><span><b>Компактні списки</b><small>Зменшити відступи у списках клієнтів і картках</small></span><input data-testid="toggle-admin-compact" type="checkbox" checked={compact} onChange={toggleCompact} /></label>
      <div className="admin-settings-note"><CircleHelp size={14} /><span>Секрети інтеграцій та системні параметри залишаються лише в налаштуваннях сервера.</span></div>
    </section>}
  </div>;
}

function TaskLine({ task, toggle, onEdit, onDelete }: { task: TaskBoardItem; toggle: (task: TaskBoardItem) => void; onEdit?: () => void; onDelete?: () => void }) {
  const overdue = !task.isCompleted && task.dueAt && new Date(task.dueAt) < new Date();
  return <div className={`global-row task-global-row ${task.isCompleted ? 'completed' : ''}`} data-testid={`row-task-${task.id}`}><div className="global-primary"><button className={`check-button ${task.isCompleted ? 'checked' : ''}`} data-testid={`button-toggle-task-${task.id}`} aria-label={task.isCompleted ? 'Повернути в роботу' : 'Позначити виконаним'} onClick={() => toggle(task)}><Check size={14} /></button><span><b>{task.title}</b><small>{task.companyName}</small></span></div><span className="global-secondary">{task.assignee}</span><span className={`global-secondary ${overdue ? 'overdue' : ''}`}>{date(task.dueAt)}</span><span className="task-status-actions"><span className={`badge ${task.isCompleted ? 'tone-success' : overdue ? 'tone-warm' : 'tone-primary'}`}>{task.isCompleted ? 'Виконано' : overdue ? 'Прострочено' : 'У роботі'}</span>{onEdit && <button type="button" className="icon-button" aria-label={`Редагувати завдання ${task.title}`} onClick={onEdit}><Edit3 size={14} /></button>}{onDelete && <button type="button" className="icon-button task-delete-button" aria-label={`Видалити завдання ${task.title}`} onClick={onDelete}><Trash2 size={14} /></button>}</span></div>;
}
function NovaPoshtaStatus({ status, ttn, compact = false }: {
  status?: string | null;
  ttn?: string | null;
  compact?: boolean;
}) {
  const arrived = isAtPickupStatus(status);
  const delivered = isDeliveredStatus(status);
  const tone = delivered ? 'delivered' : arrived ? 'arrived' : 'transit';
  return <div className={`nova-status-card ${tone} ${compact ? 'compact' : ''}`}>
    <span className="nova-poshta-mark"><NovaPoshtaTruck /></span>
    <div className="nova-status-content">
      <div className="nova-status-title"><b>НОВА ПОШТА</b><span>{delivered ? 'Доставлено' : arrived ? 'Прибуло у відділення' : ttn ? 'Відстеження відправлення' : 'ТТН не додано'}</span></div>
      <strong>{status || (ttn ? 'Очікує перевірки статусу' : 'Додайте ТТН у картці замовлення')}</strong>
      <div className="nova-progress" aria-label={delivered ? 'Відправлення доставлено' : arrived ? 'Відправлення прибуло у відділення' : 'Відправлення у дорозі'}>
        <i />
      </div>
      {ttn && <small>ТТН {ttn}</small>}
    </div>
  </div>;
}
function OrderCard({ order, marketingSource, index = 0, role, editOrder, open }: { order: OrderBoardItem; marketingSource?: string | null; index?: number; role: CrmRole; editOrder: (id: number, data: OrderUpdate) => Promise<void>; open: () => void }) {
  const [savingStatus, setSavingStatus] = useState(false);
  const paymentStatus = derivePaymentStatus({ paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus });
  const delivered = isDeliveredStatus(order.deliveryStatus);
  const normalizedSource = marketingSource?.trim() || (order.paymentMethod?.toLocaleLowerCase('uk-UA').includes('пром') ? 'Пром' : '');
  const sourceKind = /пром|prom/i.test(normalizedSource) ? 'prom' : /сайт|website|web|онлайн.?магазин/i.test(normalizedSource) ? 'website' : /телефон|дзвін|phone|call/i.test(normalizedSource) ? 'phone' : 'other';
  const SourceIcon = sourceKind === 'prom' ? ShoppingCart : sourceKind === 'website' ? Globe : sourceKind === 'phone' ? Phone : Tag;
  const sourceLabel = sourceKind === 'prom' ? 'Пром' : sourceKind === 'website' ? 'Сайт' : sourceKind === 'phone' ? 'Телефон' : normalizedSource;
  const canChangeStage = roleCanManageCrmData(role) || role === 'warehouse';
  const canChangePayment = (roleCanManageCrmData(role) || role === 'accountant') && !isAutoPaidPaymentMethod(order.paymentMethod);
  const changeStage = async (stage: string) => {
    if (stage === order.stage) return;
    setSavingStatus(true);
    try {
      await editOrder(order.id, { stage: stage as DealStage });
    } catch {
      // editOrder already reports the failed save through the workspace notice.
    } finally {
      setSavingStatus(false);
    }
  };
  const changePaymentStatus = async (status: string) => {
    if (status === paymentStatus) return;
    setSavingStatus(true);
    try {
      await editOrder(order.id, { paymentStatus: status });
    } catch {
      // editOrder already reports the failed save through the workspace notice.
    } finally {
      setSavingStatus(false);
    }
  };
  return <article tabIndex={0} aria-label={`${order.code || `Замовлення #${order.id}`}. Відкрити деталі клавішею Enter`} role="group" className={`order-card ${orderDeliveryTone(order.deliveryStatus, order.ttn)} bb-enter`} style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }} data-testid={`row-order-${order.id}`} onClick={open} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } }}>
    <span className="order-card-top"><span className="order-card-identifier"><span className="order-card-code">{order.code || `Замовлення #${order.id}`}</span>{order.invoiceNumber?.trim() ? <small className="order-invoice-reference"><FileText size={12} /> Видаткова · {order.invoiceNumber}</small> : <small className="order-invoice-missing"><CircleAlert size={12} /> ВКАЖІТЬ номер видаткової</small>}</span><span className="order-card-date"><CalendarClock size={13} />{shortDate(order.orderDate || order.createdAt)}</span></span>
    <span className="order-card-customer">{order.customerName || order.companyName}</span>
    <span className="order-card-phone">{order.phone || 'Телефон не вказано'}</span>
    {role !== 'warehouse' && <span className="order-card-details"><span><small>Сума замовлення</small><b>{money(order.amountUah)}</b></span><span><small>Спосіб оплати</small><b>{order.paymentMethod || 'Не вказано'}</b></span></span>}
    {role !== 'warehouse' && normalizedSource && <span className={`order-source-badge source-${sourceKind}`} title={`Джерело: ${normalizedSource}`}><SourceIcon size={12} /><span>{sourceLabel}</span></span>}
    <span className="order-card-badges">{role !== 'warehouse' && (canChangePayment ? <select aria-label={`Оплата замовлення ${order.code || order.id}`} className={`order-status-select ${paymentStatus === 'Оплачено' ? 'tone-success' : paymentStatus === 'Неоплачено' ? 'tone-danger' : 'tone-warm'}`} value={paymentStatus} disabled={savingStatus} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => void changePaymentStatus(event.target.value)}>{orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select> : <span className={`badge ${paymentStatus === 'Оплачено' ? 'tone-success' : paymentStatus === 'Неоплачено' ? 'tone-danger' : 'tone-warm'}`}>{paymentStatus}</span>)}{canChangeStage ? <select aria-label={`Статус замовлення ${order.code || order.id}`} className={`order-status-select ${stageTone(order.stage)}`} value={order.stage} disabled={savingStatus} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => void changeStage(event.target.value)}>{stages.map((stage) => <option key={stage} value={stage}>{orderStageLabels[stage] ?? stage}</option>)}</select> : <span className={`badge ${stageTone(order.stage)}`}>{orderStageLabels[order.stage] ?? order.stage}</span>}{delivered && <span className="badge tone-success">Доставлено</span>}</span>
    <NovaPoshtaStatus status={order.deliveryStatus} ttn={order.ttn} compact />
    {order.arrivalDate && <span className="order-arrival-time"><CalendarClock size={12} /> Прибуло: {date(order.arrivalDate)}</span>}
    <span className="order-card-bottom"><span>{order.paidAt && paymentStatus === 'Оплачено' ? <>Зараховано {shortDate(order.paidAt)}</> : 'Відкрити для деталей доставки'}</span><span>Відкрити <ArrowRight size={13} /></span></span>
  </article>;
}

type OrderDraft = {
  orderDate: string;
  stage: string;
  amountUah: string;
  ttn: string;
  invoiceNumber: string;
  comment: string;
  sender: string;
  warehouse: string;
  customerName: string;
  phone: string;
  itemCount: string;
  paymentMethod: string;
  paymentStatus: string;
};
function orderDraft(order: OrderBoardItem): OrderDraft {
  return {
    orderDate: order.orderDate ? String(order.orderDate).slice(0, 10) : '',
    stage: order.stage,
    amountUah: String(order.amountUah),
    ttn: order.ttn || '',
    invoiceNumber: order.invoiceNumber || '',
    comment: order.comment || '',
    sender: order.sender || orderSenders[0],
    warehouse: order.warehouse || orderWarehouses[0],
    customerName: order.customerName || '',
    phone: order.phone || '',
    itemCount: order.itemCount == null ? '' : String(order.itemCount),
    paymentMethod: order.paymentMethod || paymentMethods[0],
    paymentStatus: order.paymentStatus || 'Неоплачено',
  };
}
function OrderDetailModal({ order, company, role, save, remove, refreshTracking, onOpenCompany, close }: {
  order: OrderBoardItem;
  company: CompanyListItem | undefined;
  role: CrmRole;
  save: (id: number, companyId: number | null, data: OrderUpdate) => Promise<void>;
  remove: (id: number) => Promise<void>;
  refreshTracking: () => Promise<unknown>;
  onOpenCompany: (companyId: number) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => orderDraft(order));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshingTracking, setRefreshingTracking] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [error, setError] = useState('');
  const editableFields = role === 'accountant'
    ? new Set(['invoiceNumber', 'paymentStatus'])
    : role === 'warehouse'
      ? new Set(['stage', 'ttn', 'invoiceNumber', 'sender', 'warehouse', 'itemCount'])
      : new Set(['orderDate', 'stage', 'amountUah', 'ttn', 'invoiceNumber', 'comment', 'sender', 'warehouse', 'customerName', 'phone', 'itemCount', 'paymentMethod', 'paymentStatus']);
  const canEdit = editableFields.size > 0;
  const canDelete = role === 'owner' || role === 'director';
  const disabledField = (field: string) => !editing || !editableFields.has(field);
  useEffect(() => {
    if (!editing) setDraft(orderDraft(order));
  }, [order, editing]);
  const deliveryStatus = order.deliveryStatus || 'Статус ще не перевірявся';
  const paymentStatus = order.paymentStatus || 'Неоплачено';
  const hasUnsavedTtn = draft.ttn.trim() !== (order.ttn ?? '').trim();
  const setDraftValue = (key: keyof OrderDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const cancelEdit = () => {
    setDraft(orderDraft(order));
    setEditing(false);
    setError('');
  };
  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    const amountUah = Number(draft.amountUah);
    if (!['accountant', 'warehouse'].includes(role) && (!Number.isFinite(amountUah) || amountUah < 0)) {
      setError('Вкажіть коректну суму замовлення.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const update: OrderUpdate = role === 'accountant'
        ? { paymentStatus: draft.paymentStatus || null, invoiceNumber: draft.invoiceNumber.trim() || null }
        : role === 'warehouse'
          ? {
            stage: draft.stage as DealStage,
            ttn: draft.ttn.trim() || null,
            invoiceNumber: draft.invoiceNumber.trim() || null,
            sender: draft.sender || null,
            warehouse: draft.warehouse || null,
            itemCount: draft.itemCount ? Number(draft.itemCount) : null,
          }
          : {
        orderDate: draft.orderDate || null,
        stage: draft.stage as DealStage,
        amountUah,
        ttn: draft.ttn.trim() || null,
        invoiceNumber: draft.invoiceNumber.trim() || null,
        comment: draft.comment.trim() || null,
        sender: draft.sender || null,
        warehouse: draft.warehouse || null,
        customerName: draft.customerName.trim() || null,
        phone: draft.phone.trim() || null,
        itemCount: draft.itemCount ? Number(draft.itemCount) : null,
        paymentMethod: draft.paymentMethod || null,
        paymentStatus: draft.paymentStatus || null,
          };
      await save(order.id, order.companyId, update);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не вдалося зберегти замовлення.');
    } finally {
      setSaving(false);
    }
  };
  const submitDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await remove(order.id);
      setDeleteConfirmationOpen(false);
      close();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не вдалося видалити замовлення.');
      setDeleteConfirmationOpen(false);
    } finally {
      setDeleting(false);
    }
  };
  const updateTracking = async () => {
    setRefreshingTracking(true);
    setError('');
    try {
      await customFetch<unknown>(`/api/crm/orders/${order.id}/nova-poshta-status`, {
        method: 'POST',
        responseType: 'json',
      });
      await refreshTracking();
    } catch (trackingError) {
      setError(trackingError instanceof Error ? trackingError.message : 'Не вдалося оновити статус Нової пошти.');
    } finally {
      setRefreshingTracking(false);
    }
  };
  return <>
    <Modal title={order.code || `Замовлення #${order.id}`} subtitle={role === 'warehouse' ? 'Дані для комплектації та відправлення' : 'Деталі замовлення, оплати та доставки'} close={close}>
    <form className="order-detail-modal" onSubmit={(event) => void submitEdit(event)}>
      <div className="order-detail-summary"><span><small>Клієнт</small>{order.companyId !== null ? <button type="button" className="order-detail-customer-link" data-testid={`button-open-order-customer-${order.id}`} onClick={() => onOpenCompany(order.companyId!)}>{order.customerName || order.companyName}<ArrowRight size={13} /></button> : <b>{order.customerName || order.companyName}</b>}<span>{order.phone || company?.name || 'Телефон не вказано'}</span></span>{role !== 'warehouse' && <strong>{money(order.amountUah)}</strong>}</div>
      <div className="order-detail-fields">
        {role !== 'warehouse' && <Field label="Дата замовлення"><input type="date" value={draft.orderDate} disabled={disabledField('orderDate')} onChange={(event) => setDraftValue('orderDate', event.target.value)} /></Field>}
        {role !== 'warehouse' && <Field label="Сума замовлення, ₴"><input type="number" min="0" step="0.01" required value={draft.amountUah} disabled={disabledField('amountUah')} onChange={(event) => setDraftValue('amountUah', event.target.value)} /></Field>}
        {role !== 'warehouse' && <Field label="ПІБ клієнта"><input value={draft.customerName} disabled={disabledField('customerName')} onChange={(event) => setDraftValue('customerName', event.target.value)} /></Field>}
        {role !== 'warehouse' && <Field label="Телефон"><input type="tel" value={draft.phone} disabled={disabledField('phone')} onChange={(event) => setDraftValue('phone', event.target.value)} /></Field>}
        <Field label="Відправник"><select value={draft.sender} disabled={disabledField('sender')} onChange={(event) => setDraftValue('sender', event.target.value)}>{order.sender && !orderSenders.includes(order.sender) && <option>{order.sender}</option>}{orderSenders.map((sender) => <option key={sender}>{sender}</option>)}</select></Field>
        <Field label="Склад відправлення"><select value={draft.warehouse} disabled={disabledField('warehouse')} onChange={(event) => setDraftValue('warehouse', event.target.value)}>{order.warehouse && !orderWarehouses.includes(order.warehouse) && <option>{order.warehouse}</option>}{orderWarehouses.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></Field>
        <Field label="ТТН"><input data-testid={`input-order-ttn-${order.id}`} value={draft.ttn} disabled={disabledField('ttn')} placeholder="Номер накладної Нової пошти" onChange={(event) => setDraftValue('ttn', event.target.value)} /></Field>
        <Field label="Номер видаткової"><input data-testid={`input-order-invoice-${order.id}`} value={draft.invoiceNumber} disabled={disabledField('invoiceNumber')} placeholder="Вкажіть номер видаткової" onChange={(event) => setDraftValue('invoiceNumber', event.target.value)} /></Field>
        {role !== 'warehouse' && <Field label="Статус оплати"><select value={draft.paymentStatus} disabled={disabledField('paymentStatus')} onChange={(event) => setDraftValue('paymentStatus', event.target.value)}>{!['Неоплачено', 'Оплачено'].includes(paymentStatus) && <option>{paymentStatus}</option>}<option>Неоплачено</option><option>Оплачено</option></select></Field>}
        <Field label="Статус Нової пошти"><span className="arrival-time-value">{deliveryStatus}</span></Field>
        <Field label="Етап воронки"><select value={draft.stage} disabled={disabledField('stage')} onChange={(event) => setDraftValue('stage', event.target.value)}>{stages.map((stage) => <option key={stage} value={stage}>{orderStageLabels[stage] ?? stage}</option>)}</select></Field>
        <Field label="Кількість товару"><input type="number" min="0" step="1" value={draft.itemCount} disabled={disabledField('itemCount')} onChange={(event) => setDraftValue('itemCount', event.target.value)} /></Field>
        {role !== 'warehouse' && <Field label="Спосіб оплати"><select value={draft.paymentMethod} disabled={disabledField('paymentMethod')} onChange={(event) => setDraftValue('paymentMethod', event.target.value)}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></Field>}
        <Field label="Дата прибуття у відділення НП"><span className="arrival-time-value">{order.arrivalDate ? date(order.arrivalDate) : 'Буде заповнено автоматично після оновлення статусу НП'}</span></Field>
        {role !== 'warehouse' && <Field label="Коментар до замовлення" wide><textarea data-testid={`input-order-comment-${order.id}`} rows={3} value={draft.comment} disabled={disabledField('comment')} placeholder="Наприклад: який товар замовив клієнт" onChange={(event) => setDraftValue('comment', event.target.value)} /></Field>}
      </div>
      <NovaPoshtaStatus status={deliveryStatus} ttn={draft.ttn} />
      {error && <p className="order-form-error" role="alert">{error}</p>}
      <div className="order-detail-footer">{role !== 'warehouse' && <span>Спосіб оплати: <b>{order.paymentMethod || 'Не вказано'}</b></span>}<span>Склад: <b>{order.warehouse || 'Не вказано'}</b></span>{role !== 'warehouse' && <span>Зараховано: <b>{paymentStatus === 'Оплачено' ? shortDate(order.paidAt) : 'Ще не зараховано'}</b></span>}</div>
      <div className="order-detail-actions">
        {role !== 'accountant' && <button type="button" className="secondary-button" onClick={() => void updateTracking()} disabled={!draft.ttn.trim() || hasUnsavedTtn || refreshingTracking || saving || deleting} title={hasUnsavedTtn ? 'Спочатку збережіть зміни ТТН' : undefined}><RefreshCw size={14} className={refreshingTracking ? 'spin' : ''} />{refreshingTracking ? 'Оновлення статусу…' : 'Оновити статус НП'}</button>}
        {editing ? <>
          <button type="button" className="secondary-button" onClick={cancelEdit} disabled={saving || deleting}>Скасувати</button>
          <button type="submit" className="primary-button" disabled={saving || deleting}>{saving ? 'Збереження…' : 'Зберегти зміни'}</button>
        </> : canEdit && <button type="button" className="primary-button" onClick={() => setEditing(true)} disabled={deleting}><Edit3 size={14} /> Редагувати</button>}
        {canDelete && <button type="button" className="order-delete-button" onClick={() => setDeleteConfirmationOpen(true)} disabled={saving || deleting}>Видалити замовлення</button>}
      </div>
    </form>
    </Modal>
    {deleteConfirmationOpen && <div className="order-delete-confirm-backdrop" onMouseDown={(event) => event.currentTarget === event.target && !deleting && setDeleteConfirmationOpen(false)}>
      <div className="order-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="order-delete-title" aria-describedby="order-delete-description">
        <div className="order-delete-confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
        </div>
        <div className="order-delete-confirm-header">
          <h3 id="order-delete-title">Видалити замовлення?</h3>
          <p id="order-delete-description">Замовлення «{order.code || `#${order.id}`}» буде видалено без можливості відновлення.</p>
        </div>
        <div className="order-delete-confirm-footer">
          <button type="button" className="secondary-button" disabled={deleting} onClick={() => !deleting && setDeleteConfirmationOpen(false)}>Залишити</button>
          <button type="button" className="order-delete-confirm-action" disabled={deleting} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void submitDelete(); }}>
            {deleting ? 'Видалення…' : 'Так, видалити'}
          </button>
        </div>
      </div>
    </div>}
  </>;
}
function ActivityBoardLine({ item, onCompany }: { item: ActivityBoardItem; onCompany?: (companyId: number) => void }) {
  return <div className="activity-item global-activity-item" data-testid={`activity-record-${item.id}`}><span className="activity-dot"><Activity size={11} /></span><div><div className="activity-title"><b>{item.title}</b><time>{date(item.createdAt)}</time></div>{onCompany ? <button className="activity-company-link" data-testid={`button-company-activity-${item.id}`} onClick={() => onCompany(item.companyId)}>{item.companyName} · {item.kind}</button> : <span className="activity-company-link">{item.companyName} · {item.kind}</span>}<p>{item.details || 'Без додаткових деталей'}</p><small>{item.createdBy}</small></div></div>;
}
function EmptyPanel({ label, action }: { label: string; action?: ReactNode }) { return <div className="global-empty" data-testid="state-empty"><span className="empty-mark"><ClipboardList size={20} /></span><b>{label}</b>{action}</div>; }

function CompanyRow({ company, active, select, canDelete, onDelete }: { company: CompanyListItem; active: boolean; select: () => void; canDelete: boolean; onDelete: () => void }) {
  return <div data-testid={`row-company-${company.id}`} role="button" tabIndex={0} className={`company-row ${active ? 'active' : ''}`} onClick={select} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(); } }}><div className="row-top"><div><strong>{company.name}</strong><div className="row-meta"><span className="badge type-badge">{company.customerType}</span><span>{company.city || 'Місто не вказано'}</span></div>{company.source && <span className="marketing-chip"><Tag size={10} />{company.source}</span>}</div><div className="row-amount">{company.activeOrder ? money(company.activeOrder.amountUah) : '—'}<span className={`badge ${company.activeOrder ? stageTone(company.activeOrder.stage) : 'tone-neutral'}`}>{company.activeOrder?.stage || 'Без замовлення'}</span></div></div><div className="row-foot"><span><UserRound size={11} />{company.manager}</span><span className={company.overdue ? 'overdue' : ''}>{company.overdue && <CircleAlert size={11} />}{company.overdue ? 'Прострочено' : company.nextTask?.title || 'Немає наступного завдання'}</span>{canDelete && <button type="button" className="company-row-delete" aria-label={`Видалити ${company.name}`} title="Видалити картку" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={13} /></button>}</div></div>;
}
function SectionHeader({ icon: Icon, title, subtitle, action }: { icon: ElementType; title: string; subtitle: string; action?: ReactNode }) { return <div className="section-header"><div className="section-icon"><Icon size={15} /></div><div><h3>{title}</h3><p>{subtitle}</p></div>{action && <div className="section-action">{action}</div>}</div>; }
function Overview({ detail, open, completeTask, editOrder, editCompany, copy, flash }: { detail: CompanyDetail; open: (kind: ModalKind, values?: Record<string, string>) => void; completeTask: (id: number, completed: boolean) => void; editOrder: (id: number, data: { stage?: DealStage; ttn?: string | null; deliveryStatus?: string | null }) => void; editCompany: () => void; copy: (value: string | null | undefined, label: string) => void; flash: (text: string, kind?: Notice['kind']) => void }) {
  const order = detail.orders[0];
  const task = detail.tasks.find((item) => !item.isCompleted) ?? detail.tasks[0];
  return <div className="overview-grid"><div className="overview-main"><div className="data-card"><SectionHeader icon={ShoppingBagIcon} title="Активне замовлення" subtitle={order?.code || 'Замовлень поки немає'} action={order && <select data-testid="select-order-stage" value={order.stage} onChange={(event) => editOrder(order.id, { stage: event.target.value as DealStage })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>} />{order ? <><div className="order-body"><div><span className="label">СУМА ЗАМОВЛЕННЯ</span><strong className="big-money">{money(order.amountUah)}</strong><div className="delivery-box"><Truck size={16} /><div><b>Доставка</b><span>{order.deliveryStatus || 'Статус не вказано'}</span><button onClick={() => copy(order.ttn, 'ТТН')}>ТТН: {order.ttn || 'Не вказано'} <Copy size={11} /></button></div></div></div><div className="order-side"><span className="label">МЕНЕДЖЕР</span><div className="manager"><b>{initials(detail.manager)}</b>{detail.manager}</div><span className="label">СКЛАД</span><span className="muted"><Package size={13} /> {detail.warehouse || 'Не вказано'}</span></div></div><div className="stage-line">{stages.map((stage, index) => <div key={stage} className={`stage-node ${index <= stages.indexOf(order.stage) ? 'done' : ''}`} title={stage}><i />{index < stages.length - 1 && <span />}</div>)}</div><div className="stage-caption"><span>Новий лід</span><span>Успішно реалізовано</span></div></> : <div className="empty-card"><Package size={24} /><span>У клієнта ще немає замовлень.</span><button data-testid="button-create-order-empty" className="secondary-button" onClick={() => open('order')}><Plus size={14} /> Створити замовлення</button></div>}</div>
    <div className="data-card"><SectionHeader icon={CalendarClock} title="Наступна дія" subtitle="Нагадування для менеджерки" action={<button data-testid="button-add-task-inline" className="icon-button" onClick={() => open('task')}><Plus size={15} /></button>} />{task ? <div className={`task-row ${task.isCompleted ? 'completed' : ''}`}><span className="task-dot" /><div><b>{task.title}</b><p><ClockIcon size={12} />{date(task.dueAt)} · {task.assignee}</p></div><button data-testid={`button-complete-task-${task.id}`} className="check-button" onClick={() => completeTask(task.id, task.isCompleted)}><Check size={14} /></button></div> : <div className="empty-card compact"><ClipboardList size={21} /><span>Немає відкритих завдань.</span></div>}</div>
    <div className="data-card"><SectionHeader icon={Wallet} title="Умови співпраці" subtitle="Фінансові параметри клієнта" action={<button data-testid="button-edit-terms" className="text-button" onClick={editCompany}>Редагувати</button>} /><div className="terms-grid"><Term icon={CreditCard} label="Форма оплати" value={detail.paymentForm} /><Term icon={ShieldCheck} label="Кредит / відстрочка" value={`${money(detail.creditLimitUah)} · ${detail.paymentTermsDays} дн.`} /><Term icon={Tag} label="Особиста знижка" value={`${detail.discountPercent}%`} /><Term icon={Filter} label="Ціновий рівень" value={detail.priceTier || 'Не вказано'} /></div></div></div><div className="overview-side"><div className="data-card"><SectionHeader icon={UsersRound} title="Контактні особи" subtitle={`${detail.contacts.length} контакти компанії`} action={<button data-testid="button-view-contacts" className="text-button" onClick={() => open('contact')}>Додати</button>} />{detail.contacts.length ? <div className="contact-list">{detail.contacts.slice(0, 3).map((contact) => <ContactMini key={contact.id} contact={contact} copy={copy} />)}</div> : <div className="empty-card compact">Контактів ще немає.</div>}</div><div className="data-card"><SectionHeader icon={History} title="Остання активність" subtitle="Хронологія взаємодій" action={<button data-testid="button-view-history" className="text-button" onClick={() => open('note')}>Додати запис</button>} /><div className="activity-list">{detail.activity.slice(0, 5).map((item) => <ActivityItem key={item.id} item={item} />)}</div>{!detail.activity.length && <div className="empty-card compact">Історія поки порожня.</div>}</div></div></div>;
}
function ShoppingBagIcon(props: { size?: number }) { return <Package {...props} />; }
function ClockIcon(props: { size?: number }) { return <CalendarClock {...props} />; }
function Term({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) { return <div><span className="term-label"><Icon size={12} />{label}</span><b>{value}</b></div>; }
function ContactMessengerLinks({ contact }: { contact: { phone?: string | null; telegram?: string | null; viber?: string | null } }) {
  const links = getContactMessengerLinks(contact);
  if (!links.whatsappUrl && !links.telegramUrl && !links.viberUrl) return null;
  return <div className="contact-messenger-links" aria-label="Написати контакту">
    {links.whatsappUrl && <a className="messenger-link whatsapp" href={links.whatsappUrl} target="_blank" rel="noreferrer" aria-label="Відкрити WhatsApp"><SiWhatsapp size={15} /></a>}
    {links.telegramUrl && <a className="messenger-link telegram" href={links.telegramUrl} target="_blank" rel="noreferrer" aria-label="Відкрити Telegram"><SiTelegram size={15} /></a>}
    {links.viberUrl && <a className="messenger-link viber" href={links.viberUrl} aria-label="Відкрити Viber"><SiViber size={15} /></a>}
  </div>;
}
function ContactMini({ contact, copy }: { contact: CompanyDetail['contacts'][number]; copy: (value: string | null | undefined, label: string) => void }) {
  return <div className="contact-mini"><div className="avatar">{initials(contact.fullName)}</div><div className="contact-info"><b>{contact.fullName}</b><span>{contact.role || 'Роль не вказана'}</span><button onClick={() => copy(contact.phone, 'Телефон')}>{contact.phone || 'Телефон не вказано'}</button><button onClick={() => copy(contact.email, 'Email')}><Mail size={10} />{contact.email || 'Email не вказано'}</button><ContactMessengerLinks contact={contact} /></div></div>;
}
function ActivityItem({ item }: { item: CompanyDetail['activity'][number] }) { return <div className="activity-item"><span className="activity-dot"><Activity size={11} /></span><div><div className="activity-title"><b>{item.title}</b><time>{date(item.createdAt)}</time></div><p>{item.details || 'Без додаткових деталей'}</p><small>{item.createdBy}</small></div></div>; }
function ActivityTab({ detail, open }: { detail: CompanyDetail; open: (kind: ModalKind) => void }) { return <div className="tab-page"><div className="tab-heading"><div><h3>Історія взаємодій</h3><p>Усі записи по клієнту в одному порядку.</p></div><button className="primary-button small" data-testid="button-add-history-note" onClick={() => open('note')}><Plus size={14} /> Додати запис</button></div>{detail.activity.length ? <div className="timeline">{detail.activity.map((item) => <ActivityItem key={item.id} item={item} />)}</div> : <div className="empty-state large"><History size={28} /><b>Історія порожня</b><span>Додайте нотатку, щоб зафіксувати домовленість.</span></div>}</div>; }
function ContactsTab({ detail, open }: { detail: CompanyDetail; open: (kind: ModalKind) => void; flash?: (text: string) => void }) { return <div className="tab-page"><div className="tab-heading"><div><h3>Контактні особи</h3><p>Люди, з якими команда BUDBOX працює по цій компанії.</p></div><button className="primary-button small" data-testid="button-add-contact" onClick={() => open('contact')}><Plus size={14} /> Додати контакт</button></div>{detail.contacts.length ? <div className="contacts-grid">{detail.contacts.map((contact) => <div className="contact-card" key={contact.id}><div className="avatar large">{initials(contact.fullName)}</div><h4>{contact.fullName}</h4><span>{contact.role || 'Роль не вказана'}</span><p><MessageCircle size={13} />{contact.phone || 'Телефон не вказано'}</p><p><Mail size={13} />{contact.email || 'Email не вказано'}</p><div className="contact-actions"><a href={contact.phone ? `tel:${contact.phone}` : undefined}>Зателефонувати</a><ContactMessengerLinks contact={contact} /></div></div>)}</div> : <div className="empty-state large"><UsersRound size={28} /><b>Контактів ще немає</b><span>Додайте першу контактну особу компанії.</span></div>}</div>; }
function OrdersTab({ detail, role, open, editOrder, deleteOrder, refreshTracking, onOpenCompany }: {
  detail: CompanyDetail;
  role: CrmRole;
  open: (kind: ModalKind) => void;
  editOrder: (id: number, data: OrderUpdate) => Promise<void>;
  deleteOrder: (id: number) => Promise<void>;
  refreshTracking: () => Promise<unknown>;
  onOpenCompany: (companyId: number) => void;
}) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const orderRows: OrderBoardItem[] = detail.orders.map((order) => ({ ...order, companyName: detail.name }));
  const selectedOrder = orderRows.find((order) => order.id === selectedOrderId);
  return <div className="tab-page"><div className="tab-heading"><div><h3>Замовлення клієнта</h3><p>Відкрийте картку, щоб керувати оплатою та доставкою.</p></div><button className="primary-button small" data-testid="button-add-order" onClick={() => open('order')}><Plus size={14} /> Нове замовлення</button></div>  {orderRows.length ? <div className="orders-card-grid">{orderRows.map((order, index) => <OrderCard key={order.id} order={order} marketingSource={order.marketingSource || detail.source} index={index} role={role} editOrder={editOrder} open={() => setSelectedOrderId(order.id)} />)}</div> : <div className="empty-state large"><Package size={28} /><b>Замовлень ще немає</b><span>Створіть замовлення, щоб відстежувати оплату та доставку.</span></div>}
    {selectedOrder && <OrderDetailModal order={selectedOrder} company={undefined} role={role} save={(id, _companyId, data) => editOrder(id, data)} remove={deleteOrder} refreshTracking={refreshTracking} onOpenCompany={(companyId) => { onOpenCompany(companyId); setSelectedOrderId(null); }} close={() => setSelectedOrderId(null)} />}
  </div>;
}

function CompanyForm({ form, setValue, onSubmit, busy, edit, canAssignManager }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean; edit: boolean; canAssignManager: boolean }) {
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <Field label="Назва компанії" wide><input autoFocus data-testid="input-company-name" value={form.name || ''} onChange={(event) => setValue('name', event.target.value)} placeholder="ТОВ «Нова Будова»" required /></Field>
    <Field label="Код / ІПН"><input data-testid="input-tax-id" value={form.taxId || ''} onChange={(event) => setValue('taxId', event.target.value)} /></Field>
    <Field label="Тип клієнта"><select value={form.customerType || customerTypes[0]} onChange={(event) => setValue('customerType', event.target.value)}>{customerTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
    {!edit && <ResponsibleContactField form={form} setValue={setValue} />}
    <Field label="Місто"><input value={form.city || ''} onChange={(event) => setValue('city', event.target.value)} /></Field>
    {canAssignManager && edit && <Field label="Відповідальний менеджер"><input value={form.manager || ''} onChange={(event) => setValue('manager', event.target.value)} /></Field>}
    <Field label="Склад"><input value={form.warehouse || ''} onChange={(event) => setValue('warehouse', event.target.value)} /></Field>
    <Field label="Форма оплати"><select value={form.paymentForm || paymentForms[0]} onChange={(event) => setValue('paymentForm', event.target.value)}>{paymentForms.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Кредитний ліміт, ₴"><input type="number" min="0" value={form.creditLimitUah || '0'} onChange={(event) => setValue('creditLimitUah', event.target.value)} /></Field>
    <Field label="Відстрочка, днів"><input type="number" min="0" value={form.paymentTermsDays || '0'} onChange={(event) => setValue('paymentTermsDays', event.target.value)} /></Field>
    <Field label="Знижка, %"><input type="number" min="0" max="100" value={form.discountPercent || '0'} onChange={(event) => setValue('discountPercent', event.target.value)} /></Field>
    <Field label="Ціновий рівень"><input value={form.priceTier || ''} onChange={(event) => setValue('priceTier', event.target.value)} /></Field>
    <MarketingSourceField form={form} setValue={setValue} />
    <div className="form-actions"><button type="button" className="secondary-button" onClick={() => window.dispatchEvent(new Event('close-modal'))}>Скасувати</button><button data-testid="button-submit-company" className="primary-button" disabled={busy}>{busy ? 'Збереження…' : edit ? 'Зберегти зміни' : 'Створити компанію'}</button></div>
  </form>;
}
function ResponsibleContactField({ form, setValue }: { form: Record<string, string>; setValue: (key: string, value: string) => void }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const contactQuery = useQuery({
    queryKey: ['crm-contact-search', debouncedSearch],
    queryFn: () => customFetch<ContactSearchResult[]>(`/api/crm/contact-search?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.length >= 2 && !form.responsibleContactId,
    staleTime: 30_000,
  });
  const selectContact = (contact: ContactSearchResult) => {
    setValue('responsibleContactId', String(contact.id));
    setValue('responsibleContactName', contact.fullName);
    setValue('responsibleContactPhone', contact.phone || '');
    setValue('responsibleContactCompanyName', contact.companyName);
    setSearch('');
  };
  const clearContact = () => {
    setValue('responsibleContactId', '');
    setValue('responsibleContactName', '');
    setValue('responsibleContactPhone', '');
    setValue('responsibleContactCompanyName', '');
    setSearch('');
  };

  return <div className="responsible-contact-field field-wide">
    <div className="responsible-contact-heading"><b>Відповідальний клієнт організації</b><small>Знайдіть контакт за ПІБ/телефоном або створіть новий</small></div>
    {form.responsibleContactId ? <div className="responsible-contact-selected">
      <span className="avatar">{initials(form.responsibleContactName || '')}</span>
      <span><b>{form.responsibleContactName || 'Обраний контакт'}</b><small>{form.responsibleContactPhone || 'Номер не вказано'}{form.responsibleContactCompanyName ? ` · зараз у ${form.responsibleContactCompanyName}` : ''}</small></span>
      <button type="button" className="text-button" onClick={clearContact}>Змінити</button>
    </div> : <>
      <label className="responsible-contact-search">
        <Search size={15} />
        <input data-testid="input-responsible-contact-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ПІБ або номер телефону" autoComplete="off" />
      </label>
      {search.trim().length >= 2 && <div className="responsible-contact-results">
        {contactQuery.isFetching ? <small>Шукаємо контакт…</small> : contactQuery.isError ? <div className="manager-select-error" role="alert">Не вдалося знайти контакт. <button type="button" onClick={() => void contactQuery.refetch()}>Повторити</button></div> : contactQuery.data?.length ? contactQuery.data.map((contact) => <button type="button" key={contact.id} onClick={() => selectContact(contact)}><b>{contact.fullName}</b><small>{contact.phone || 'Телефон не вказано'} · клієнт {contact.companyName}</small></button>) : <small>Контактів за цим запитом не знайдено. Додайте його як новий нижче.</small>}
      </div>}
      <div className="responsible-contact-new">
        <Field label="ПІБ нового контакту"><input data-testid="input-new-responsible-contact-name" value={form.responsibleContactName || ''} onChange={(event) => setValue('responsibleContactName', event.target.value)} placeholder="Ім’я та прізвище" /></Field>
        <Field label="Номер телефону"><input data-testid="input-new-responsible-contact-phone" type="tel" autoComplete="tel" value={form.responsibleContactPhone || ''} onChange={(event) => setValue('responsibleContactPhone', event.target.value)} placeholder="+380…" /></Field>
      </div>
    </>}
  </div>;
}
function MarketingSourceField({ form, setValue }: { form: Record<string, string>; setValue: (key: string, value: string) => void }) {
  const source = form.source || '';
  return <Field label="Маркетинг / джерело залучення">
<select data-testid="select-marketing-source" value={source} onChange={(event) => setValue('source', event.target.value)}>
  <option value="">Не вказано</option>
  {source && !marketingSources.includes(source) && <option value={source}>{source}</option>}
  {marketingSources.map((item) => <option key={item}>{item}</option>)}
</select>
  </Field>;
}
function ClientForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) {
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <Field label="Ім’я клієнта" wide><input autoFocus data-testid="input-client-name" value={form.fullName || ''} onChange={(event) => setValue('fullName', event.target.value)} placeholder="Ім’я та прізвище" required /></Field>
    <Field label="Тип клієнта"><select data-testid="select-client-type" value={form.customerType || retailCustomerType} onChange={(event) => setValue('customerType', event.target.value)}>{customerTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
    <Field label="Телефон"><input data-testid="input-client-phone" type="tel" autoComplete="tel" value={form.phone || ''} onChange={(event) => setValue('phone', event.target.value)} placeholder="+380…" required /></Field>
    <Field label="Місто"><input data-testid="input-client-city" value={form.city || ''} onChange={(event) => setValue('city', event.target.value)} placeholder="Місто" /></Field>
    <Field label="Форма оплати"><select data-testid="select-client-payment" value={form.paymentForm || PaymentForm.готівка} onChange={(event) => setValue('paymentForm', event.target.value)}>{paymentForms.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
    <MarketingSourceField form={form} setValue={setValue} />
    <Field label="Відповідальний менеджер"><input data-testid="input-client-manager" value={form.manager || ''} onChange={(event) => setValue('manager', event.target.value)} placeholder="Менеджер" /></Field>
    <div className="client-form-note"><CircleHelp size={15} /><span>Клієнта буде додано окремою карткою, а номер телефону — в його контакти. Компанію можна створити окремо.</span></div>
    <div className="form-actions"><button type="button" className="secondary-button" onClick={() => window.dispatchEvent(new Event('close-modal'))}>Скасувати</button><button data-testid="button-submit-client" className="primary-button" disabled={busy}>{busy ? 'Збереження…' : 'Створити клієнта'}</button></div>
  </form>;
}
function ContactForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Ім’я та прізвище" wide><input autoFocus data-testid="input-contact-name" value={form.fullName || ''} onChange={(event) => setValue('fullName', event.target.value)} required /></Field><Field label="Роль"><input value={form.role || ''} onChange={(event) => setValue('role', event.target.value)} /></Field><Field label="Телефон"><input value={form.phone || ''} onChange={(event) => setValue('phone', event.target.value)} /></Field><Field label="Email"><input type="email" value={form.email || ''} onChange={(event) => setValue('email', event.target.value)} /></Field><Field label="Telegram"><input value={form.telegram || ''} onChange={(event) => setValue('telegram', event.target.value)} /></Field><Field label="Viber"><input value={form.viber || ''} onChange={(event) => setValue('viber', event.target.value)} /></Field><Submit busy={busy} label="Додати контакт" /></form>; }
function OrderFields({ form, setValue }: { form: Record<string, string>; setValue: (key: string, value: string) => void }) {
  return <>
    <Field label="Номер замовлення"><input autoFocus value={form.code || ''} onChange={(event) => setValue('code', event.target.value)} placeholder="ЗАМ-10512" /></Field>
    <Field label="Відправник"><input value={form.sender || ''} onChange={(event) => setValue('sender', event.target.value)} /></Field>
    <Field label="Склад"><input value={form.warehouse || ''} onChange={(event) => setValue('warehouse', event.target.value)} /></Field>
    <Field label="ПІБ клієнта"><input value={form.customerName || ''} onChange={(event) => setValue('customerName', event.target.value)} /></Field>
    <Field label="Телефон"><input type="tel" value={form.phone || ''} onChange={(event) => setValue('phone', event.target.value)} /></Field>
    <Field label="ТТН"><input value={form.ttn || ''} onChange={(event) => setValue('ttn', event.target.value)} placeholder="Номер накладної Нової пошти" /></Field>
    <Field label="Номер видаткової"><input value={form.invoiceNumber || ''} onChange={(event) => setValue('invoiceNumber', event.target.value)} placeholder="Вкажіть номер видаткової" /></Field>
    <Field label="Коментар до замовлення" wide><textarea rows={3} value={form.comment || ''} onChange={(event) => setValue('comment', event.target.value)} placeholder="Наприклад: який товар замовив клієнт" /></Field>
    <Field label="Кількість товарів"><input type="number" min="0" step="1" value={form.itemCount || ''} onChange={(event) => setValue('itemCount', event.target.value)} /></Field>
    <Field label="Спосіб оплати"><select value={form.paymentMethod || paymentMethods[0]} onChange={(event) => setValue('paymentMethod', event.target.value)}>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Сума замовлення, ₴"><input type="number" min="0" value={form.amountUah || ''} onChange={(event) => setValue('amountUah', event.target.value)} required /></Field>
    <Field label="Статус замовлення"><select value={form.paymentStatus || orderStatuses[0]} onChange={(event) => setValue('paymentStatus', event.target.value)}>{orderStatuses.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="ТТН"><input value={form.ttn || ''} onChange={(event) => setValue('ttn', event.target.value)} placeholder="Номер ТТН" /></Field>
  </>;
}
function CompanyLookupField({ form, setValue, suggestions, loading, error, onSelect, onClear }: {
  form: Record<string, string>;
  setValue: (key: string, value: string) => void;
  suggestions: OrderCustomerSuggestion[];
  loading: boolean;
  error: boolean;
  onSelect: (company: OrderCustomerSuggestion) => void;
  onClear: () => void;
}) {
  const query = form.companySearch.trim();
  return <div className="company-lookup-field">
    {form.companyId ? <div className="selected-customer-card" data-testid="selected-order-customer">
      <span className="selected-customer-icon"><Building2 size={17} /></span>
      <span className="selected-customer-info">
        <strong>{form.customerName || form.selectedCompanyName}</strong>
        <small>{form.selectedCompanyName}{form.taxId ? ` · ІПН ${form.taxId}` : ''}</small>
        <small>{form.phone || 'Телефон не вказано'}{form.city ? ` · ${form.city}` : ''}</small>
        {form.manager && <small>Менеджер: {form.manager}</small>}
      </span>
      <button type="button" className="company-lookup-change" onClick={onClear}>Змінити</button>
    </div> : <>
      <Field label="Клієнт / компанія" wide>
        <span className="company-lookup-input-wrap">
          <Search size={15} aria-hidden="true" />
          <input
            data-testid="input-order-company-search"
            autoComplete="off"
            value={form.companySearch || ''}
            onChange={(event) => setValue('companySearch', event.target.value)}
            placeholder="ПІБ, телефон, назва компанії або ІПН"
            aria-controls="order-customer-suggestions"
            aria-expanded={query.length >= 2}
          />
        </span>
      </Field>
      {query.length >= 2 && <div id="order-customer-suggestions" className="company-lookup-results" aria-live="polite">
        {loading ? <div className="company-lookup-message"><LoaderCircle size={14} className="spin" /> Шукаємо клієнтів…</div>
          : error ? <div className="company-lookup-message error">Не вдалося завантажити підказки. Змініть запит або спробуйте ще раз.</div>
            : suggestions.length ? <div className="company-lookup-list" role="listbox" aria-label="Підходящі клієнти та компанії">
              {suggestions.map((suggestion) => (
                <button key={`${suggestion.companyId}-${suggestion.contactId ?? 'company'}`} type="button" role="option" aria-selected={false} className="company-lookup-item" onClick={() => onSelect(suggestion)}>
                  <span className="company-lookup-result-icon">{suggestion.contactName ? <UserRound size={15} /> : <Building2 size={15} />}</span>
                  <span className="company-lookup-result-copy">
                    <strong>{suggestion.contactName || suggestion.companyName}</strong>
                    <small>{suggestion.contactName ? suggestion.companyName : suggestion.customerType}{suggestion.phone ? ` · ${suggestion.phone}` : ''}</small>
                    {(suggestion.taxId || suggestion.city || suggestion.manager) && <small>{[suggestion.taxId && `ІПН ${suggestion.taxId}`, suggestion.city, suggestion.manager && `Менеджер: ${suggestion.manager}`].filter(Boolean).join(' · ')}</small>}
                  </span>
                  <ChevronRight size={15} className="company-lookup-arrow" />
                </button>
              ))}
            </div> : <div className="company-lookup-message">Збігів не знайдено. Заповніть дані клієнта вручну.</div>}
      </div>}
    </>}
  </div>;
}

function GlobalOrderFields({ form, setValue, suggestions, loading, error, onSuggestionSelect, onSuggestionClear }: {
  form: Record<string, string>;
  setValue: (key: string, value: string) => void;
  suggestions: OrderCustomerSuggestion[];
  loading: boolean;
  error: boolean;
  onSuggestionSelect: (company: OrderCustomerSuggestion) => void;
  onSuggestionClear: () => void;
}) {
  return <>
    <CompanyLookupField form={form} setValue={setValue} suggestions={suggestions} loading={loading} error={error} onSelect={onSuggestionSelect} onClear={onSuggestionClear} />
    <Field label="Дата замовлення"><input data-testid="input-global-order-date" type="date" value={form.orderDate || localDateInput()} onChange={(event) => setValue('orderDate', event.target.value)} required /></Field>
    <Field label="Відправник"><select data-testid="select-order-sender" value={form.sender || orderSenders[0]} onChange={(event) => setValue('sender', event.target.value)}>{orderSenders.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Склад відправлення"><select data-testid="select-order-warehouse" value={form.warehouse || orderWarehouses[0]} onChange={(event) => setValue('warehouse', event.target.value)}>{orderWarehouses.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="ПІБ отримувача"><input data-testid="input-order-customer-name" value={form.customerName} onChange={(event) => setValue('customerName', event.target.value)} required placeholder="Прізвище та ім’я" /></Field>
    <Field label="Номер телефону"><input data-testid="input-order-customer-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setValue('phone', event.target.value)} required placeholder="+380…" /></Field>
    <Field label="Сума замовлення, ₴"><input data-testid="input-order-amount" type="number" min="0" step="0.01" value={form.amountUah} onChange={(event) => setValue('amountUah', event.target.value)} required /></Field>
    <Field label="Номер замовлення"><input data-testid="input-order-code" value={form.code} onChange={(event) => setValue('code', event.target.value)} placeholder="Залиште порожнім для автонумерації" /></Field>
    <Field label="Спосіб оплати"><select data-testid="select-order-payment-method" value={form.paymentMethod || paymentMethods[0]} onChange={(event) => setValue('paymentMethod', event.target.value)}>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="ТТН"><input data-testid="input-order-ttn" value={form.ttn || ''} onChange={(event) => setValue('ttn', event.target.value)} placeholder="Номер накладної Нової пошти" /></Field>
    <Field label="Номер видаткової"><input data-testid="input-order-invoice" value={form.invoiceNumber || ''} onChange={(event) => setValue('invoiceNumber', event.target.value)} placeholder="Вкажіть номер видаткової" /></Field>
    <Field label="Коментар до замовлення" wide><textarea data-testid="input-order-comment" rows={3} value={form.comment || ''} onChange={(event) => setValue('comment', event.target.value)} placeholder="Наприклад: який товар замовив клієнт" /></Field>
    <MarketingSourceField form={{ source: form.marketingSource || '' }} setValue={(key, value) => setValue('marketingSource', value)} />
  </>;
}
function OrderForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><OrderFields form={form} setValue={setValue} /><Submit busy={busy} label="Створити замовлення" /></form>; }
function TaskForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Що потрібно зробити?" wide><div className="callback-task-input"><input autoFocus data-testid="input-task-title" value={form.title || ''} onChange={(event) => setValue('title', event.target.value)} required placeholder="Зателефонувати щодо оплати" /><button type="button" className="secondary-button" data-testid="button-callback-task" onClick={() => setValue('title', 'Передзвонити клієнту')}><Phone size={13} /> Передзвонити</button></div></Field><Field label="Термін"><input type="datetime-local" value={form.dueAt || ''} onChange={(event) => setValue('dueAt', event.target.value)} /></Field><ManagerSelect value={form.assignee || ''} onChange={(value) => setValue('assignee', value)} /><Submit busy={busy} label="Створити завдання" /></form>; }
function ChatPage({ currentUserId, presenceError }: { currentUserId: string; presenceError: string }) {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState(() => sessionStorage.getItem('budbox-chat-selected-user') || '');
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [olderMessages, setOlderMessages] = useState<InternalChatMessage[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markedReadChats = useRef(new Set<string>());
  const historyInitialized = useRef(new Set<string>());
  const managersQuery = useQuery({
    queryKey: ['crm-chat-managers'],
    queryFn: () => customFetch<ChatManager[]>('/api/crm/chat/managers'),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
  const managers = (managersQuery.data ?? []).filter((manager) => !manager.isSelf);
  const selectedManager = managers.find((manager) => manager.userId === selectedUserId);
  const messagesQuery = useQuery({
    queryKey: ['crm-chat-messages', currentUserId, selectedUserId],
    queryFn: () => customFetch<ChatHistoryResponse>(`/api/crm/chat/messages/${encodeURIComponent(selectedUserId)}`),
    enabled: Boolean(selectedManager),
    refetchInterval: 4_000,
    staleTime: 1_000,
  });
  const latestMessages = messagesQuery.data?.messages ?? [];
  const messages = [...olderMessages, ...latestMessages].filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index);
  useEffect(() => {
    setOlderMessages([]);
    setHistoryHasMore(false);
    setEditingMessageId(null);
    setEditingDraft('');
    if (selectedUserId) historyInitialized.current.delete(selectedUserId);
  }, [selectedUserId]);
  useEffect(() => {
    const openConversation = (event: Event) => {
      const userId = (event as CustomEvent<string>).detail;
      if (!userId) return;
      setSelectedUserId(userId);
      setDraft('');
      setSendError('');
    };
    window.addEventListener('crm-open-chat', openConversation);
    return () => window.removeEventListener('crm-open-chat', openConversation);
  }, []);
  useEffect(() => {
    if (!selectedManager || !messagesQuery.data || historyInitialized.current.has(selectedManager.userId)) return;
    historyInitialized.current.add(selectedManager.userId);
    setHistoryHasMore(messagesQuery.data.hasMore);
  }, [messagesQuery.data, selectedManager]);
  useEffect(() => {
    if (!selectedManager || !messagesQuery.isSuccess || markedReadChats.current.has(selectedManager.userId)) return;
    markedReadChats.current.add(selectedManager.userId);
    void qc.invalidateQueries({ queryKey: ['crm-chat-notifications'] });
    void qc.invalidateQueries({ queryKey: ['crm-chat-managers'] });
  }, [messagesQuery.isSuccess, messagesQuery.dataUpdatedAt, qc, selectedManager]);
  const latestMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (selectedUserId && !managers.some((manager) => manager.userId === selectedUserId)) setSelectedUserId('');
  }, [managers, selectedUserId]);
  useEffect(() => {
    if (latestMessageId === undefined) return;
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [latestMessageId, selectedUserId]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedManager || sending) return;
    setSending(true);
    setSendError('');
    try {
      await customFetch<InternalChatMessage>(`/api/crm/chat/messages/${encodeURIComponent(selectedManager.userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      setDraft('');
      await qc.invalidateQueries({ queryKey: ['crm-chat-messages', currentUserId, selectedManager.userId] });
      await qc.invalidateQueries({ queryKey: ['crm-chat-notifications'] });
      await qc.invalidateQueries({ queryKey: ['crm-chat-managers'] });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Не вдалося надіслати повідомлення.');
    } finally {
      setSending(false);
    }
  };

  const loadOlderMessages = async () => {
    const oldestId = messages[0]?.id;
    if (!selectedManager || !oldestId || loadingOlder) return;
    setLoadingOlder(true);
    setSendError('');
    try {
      const history = await customFetch<ChatHistoryResponse>(`/api/crm/chat/messages/${encodeURIComponent(selectedManager.userId)}?beforeId=${oldestId}`);
      setOlderMessages((current) => [...history.messages, ...current]);
      setHistoryHasMore(history.hasMore);
      await qc.invalidateQueries({ queryKey: ['crm-chat-notifications'] });
      await qc.invalidateQueries({ queryKey: ['crm-chat-managers'] });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Не вдалося завантажити попередні повідомлення.');
    } finally {
      setLoadingOlder(false);
    }
  };
  const saveMessage = async (messageId: number) => {
    const body = editingDraft.trim();
    if (!body || !selectedManager) return;
    setSendError('');
    try {
      await customFetch<InternalChatMessage>(`/api/crm/chat/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      setEditingMessageId(null);
      setEditingDraft('');
      await qc.invalidateQueries({ queryKey: ['crm-chat-messages', currentUserId, selectedManager.userId] });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Не вдалося відредагувати повідомлення.');
    }
  };
  const deleteMessage = async (messageId: number) => {
    if (!selectedManager || !window.confirm('Видалити це повідомлення назавжди?')) return;
    setSendError('');
    try {
      await customFetch<void>(`/api/crm/chat/messages/${messageId}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['crm-chat-messages', currentUserId, selectedManager.userId] });
      await qc.invalidateQueries({ queryKey: ['crm-chat-notifications'] });
      await qc.invalidateQueries({ queryKey: ['crm-chat-managers'] });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Не вдалося видалити повідомлення.');
    }
  };

  const renderManager = (manager: ChatManager) => <button
    type="button"
    className={`chat-manager ${selectedUserId === manager.userId ? 'selected' : ''}`}
    key={manager.userId}
    onClick={() => { setSelectedUserId(manager.userId); sessionStorage.setItem('budbox-chat-selected-user', manager.userId); setDraft(''); setSendError(''); }}
    data-testid={`chat-manager-${manager.userId}`}
  >
    <span className="chat-avatar">{initials(manager.name)}<i className={manager.isOnline ? 'online' : ''} /></span>
    <span className="chat-manager-info"><b>{manager.name}</b><small>{manager.isOnline ? 'Онлайн' : manager.lastSeenAt ? `Був(ла) ${new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' }).format(new Date(manager.lastSeenAt))}` : 'Ще не заходив(ла)'}</small></span>
    {manager.unreadCount > 0 && <em className="chat-unread-badge">{manager.unreadCount > 99 ? '99+' : manager.unreadCount}</em>}
    <MessageCircle size={15} />
  </button>;
  return <section className="chat-page">
    <aside className="chat-people data-card">
      <div className="chat-people-heading"><div><h2>Менеджери</h2><p>Натисніть, щоб відкрити приватний чат</p></div><button className="icon-button" type="button" aria-label="Оновити список" onClick={() => void managersQuery.refetch()}><RefreshCw size={15} /></button></div>
      {managersQuery.isLoading ? <p className="chat-state">Завантаження менеджерів…</p> : managersQuery.isError ? <div className="chat-error" role="alert">Не вдалося завантажити список менеджерів. <button type="button" onClick={() => void managersQuery.refetch()}>Повторити</button></div> : <>
        <div className="chat-presence-group"><h3><i /> Онлайн <span>{managers.filter((manager) => manager.isOnline).length}</span></h3>{managers.filter((manager) => manager.isOnline).map(renderManager)}</div>
        <div className="chat-presence-group"><h3>Офлайн <span>{managers.filter((manager) => !manager.isOnline).length}</span></h3>{managers.filter((manager) => !manager.isOnline).map(renderManager)}</div>
        {!managers.length && <p className="chat-state">Поки немає інших активних менеджерів.</p>}
      </>}
    </aside>
    <section className="chat-conversation data-card">
      {presenceError && <div className="chat-warning" role="status">{presenceError}</div>}
      {!selectedManager ? <div className="chat-empty"><MessageCircle size={28} /><b>Внутрішній чат</b><span>Оберіть менеджера зі списку, щоб почати переписку.</span></div> : <>
        <header className="chat-conversation-heading"><span className="chat-avatar">{initials(selectedManager.name)}<i className={selectedManager.isOnline ? 'online' : ''} /></span><div><b>{selectedManager.name}</b><small>{selectedManager.isOnline ? 'Онлайн зараз' : 'Офлайн'}</small></div></header>
        <div className="chat-messages" data-testid="chat-messages">
          {messagesQuery.isLoading ? <p className="chat-state">Завантаження повідомлень…</p> : messagesQuery.isError ? <div className="chat-error" role="alert">Не вдалося завантажити переписку. <button type="button" onClick={() => void messagesQuery.refetch()}>Повторити</button></div> : <>
            {historyHasMore && <button type="button" className="chat-load-older" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? 'Завантажуємо…' : 'Завантажити попередні повідомлення'}</button>}
            {messages.length ? messages.map((message) => <article className={`chat-message ${message.senderUserId === currentUserId ? 'mine' : ''}`} key={message.id}>
              {editingMessageId === message.id ? <div className="chat-edit-form"><textarea value={editingDraft} maxLength={4000} rows={3} onChange={(event) => setEditingDraft(event.target.value)} /><div><button type="button" className="secondary-button" onClick={() => { setEditingMessageId(null); setEditingDraft(''); }}>Скасувати</button><button type="button" className="primary-button" disabled={!editingDraft.trim()} onClick={() => void saveMessage(message.id)}>Зберегти</button></div></div> : <p>{message.body}</p>}
              <div className="chat-message-footer"><time>{message.editedAt && 'ред. · '}{new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(message.createdAt))}{message.senderUserId === currentUserId && message.readAt && ' · Прочитано'}</time>
                {message.senderUserId === currentUserId && editingMessageId !== message.id && <span className="chat-message-actions"><button type="button" aria-label="Редагувати повідомлення" title="Редагувати" onClick={() => { setEditingMessageId(message.id); setEditingDraft(message.body); }}><Edit3 size={12} /></button><button type="button" aria-label="Видалити повідомлення" title="Видалити" onClick={() => void deleteMessage(message.id)}><X size={13} /></button></span>}
              </div>
            </article>) : <div className="chat-empty-inline">Повідомлень ще немає. Напишіть першим.</div>}
          </>}
          <div ref={messagesEndRef} />
        </div>
        <form className="chat-compose" onSubmit={sendMessage}>
          {sendError && <div className="chat-error" role="alert">{sendError}</div>}
          <div><textarea data-testid="input-chat-message" value={draft} maxLength={4000} rows={2} placeholder="Напишіть повідомлення…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <button type="submit" className="primary-button" data-testid="button-send-chat-message" disabled={sending || !draft.trim()} aria-label="Надіслати повідомлення">{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={16} />}<span>Надіслати</span></button></div>
          <small>Enter — надіслати · Shift+Enter — новий рядок</small>
        </form>
      </>}
    </section>
  </section>;
}

function ManagerSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const managersQuery = useQuery({
    queryKey: ['crm-managers'],
    queryFn: () => customFetch<string[]>('/api/crm/managers'),
    staleTime: 5 * 60_000,
  });
  const managers = managersQuery.data ?? [];
  const options = value && !managers.includes(value) ? [value, ...managers] : managers;
  return <div className="manager-select-field">
    <Field label="Відповідальний менеджер">
      <select data-testid="select-task-assignee" value={value} onChange={(event) => onChange(event.target.value)} disabled={managersQuery.isLoading || managersQuery.isError}>
        <option value="">Оберіть менеджера</option>
        {options.map((manager) => <option key={manager} value={manager}>{manager}</option>)}
      </select>
    </Field>
    {managersQuery.isLoading && <small>Завантажуємо список менеджерів…</small>}
    {managersQuery.isError && <div className="manager-select-error" role="alert">Не вдалося завантажити менеджерів. <button type="button" onClick={() => void managersQuery.refetch()}>Повторити</button></div>}
  </div>;
}
function DisplayNameEditor({ initialName, onSave }: { initialName: string; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initialName);
  useEffect(() => setValue(initialName), [initialName]);
  return <div className="display-name-editor">
    <label htmlFor="crm-display-name">Ім’я в CRM</label>
    <div><input id="crm-display-name" data-testid="input-crm-display-name" value={value} maxLength={60} placeholder="Як до вас звертатися" onChange={(event) => setValue(event.target.value)} />
      <button type="button" className="secondary-button" data-testid="button-save-display-name" onClick={() => onSave(value)}>Зберегти</button></div>
    <small>Ім’я також показується іншим менеджерам у списку чату.</small>
  </div>;
}
function NoteForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Заголовок нотатки" wide><input autoFocus data-testid="input-note-title" value={form.title || ''} onChange={(event) => setValue('title', event.target.value)} required placeholder="Підсумок дзвінка" /></Field><Field label="Деталі" wide><textarea data-testid="input-note-details" rows={4} value={form.details || ''} onChange={(event) => setValue('details', event.target.value)} placeholder="Зафіксуйте домовленість або наступний крок" /></Field><Submit busy={busy} label="Зберегти нотатку" /></form>; }
function Submit({ busy, label }: { busy: boolean; label: string }) { return <div className="form-actions"><button type="submit" className="primary-button" data-testid="button-submit-form" disabled={busy}>{busy ? 'Збереження…' : label}</button></div>; }

function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function roleCanAccessPage(role: CrmRole, page: string): boolean {
  switch (role) {
    case 'owner': return true;
    case 'director': return page !== 'admin';
    case 'sales_manager': return ['overview', 'clients', 'tasks', 'orders', 'analytics', 'activity', 'chat'].includes(page);
    case 'manager': return ['clients', 'tasks', 'orders', 'analytics', 'activity', 'chat'].includes(page);
    case 'warehouse': return ['orders', 'warehouse'].includes(page);
    case 'accountant': return ['orders', 'analytics'].includes(page);
    case 'auditor': return ['activity'].includes(page);
  }
}
function Router({ userEmail, userId, role, isAdmin, onSignOut }: { userEmail: string | null; userId: string; role: CrmRole; isAdmin: boolean; onSignOut: () => Promise<void> }) {
  const [, navigate] = useLocation();
  const [presenceError, setPresenceError] = useState('');
  const [notificationEnabled, setNotificationEnabled] = useState(() => localStorage.getItem('budbox-chat-notifications') === 'true');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const notifiedMessageIds = useRef<Set<number> | null>(null);
  const chatNotifications = useQuery({
    queryKey: ['crm-chat-notifications', userId],
    queryFn: () => customFetch<ChatNotificationsResponse>('/api/crm/chat/notifications'),
    enabled: roleCanAccessPage(role, 'chat'),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    staleTime: 3_000,
  });
  const incomingNotifications = chatNotifications.data?.messages ?? [];
  const unreadChatCount = chatNotifications.data?.unreadCount ?? 0;
  useEffect(() => {
    if (!chatNotifications.data) return;
    const messages = incomingNotifications;
    const messageIds = new Set(messages.map((message) => message.id));
    if (notifiedMessageIds.current === null) {
      notifiedMessageIds.current = messageIds;
      return;
    }
    const freshMessages = messages.filter((message) => !notifiedMessageIds.current?.has(message.id));
    notifiedMessageIds.current = messageIds;
    if (!notificationEnabled || notificationPermission !== 'granted') return;
    for (const message of freshMessages) {
      const notification = new Notification(`Нове повідомлення від ${message.senderName}`, {
        body: message.body.slice(0, 180),
        tag: `crm-chat-${message.id}`,
        icon: '/favicon.ico',
      });
      notification.onclick = () => {
        sessionStorage.setItem('budbox-chat-selected-user', message.senderUserId);
        window.dispatchEvent(new CustomEvent('crm-open-chat', { detail: message.senderUserId }));
        window.focus();
        navigate('/chat');
        notification.close();
      };
    }
  }, [chatNotifications.data, notificationEnabled, notificationPermission, navigate]);
  const enableNotifications = async () => {
    if (notificationEnabled) {
      setNotificationEnabled(false);
      localStorage.setItem('budbox-chat-notifications', 'false');
      return;
    }
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      const enabled = permission === 'granted';
      setNotificationEnabled(enabled);
      localStorage.setItem('budbox-chat-notifications', String(enabled));
    } catch (error) {
      console.error('Could not request browser notification permission', error);
    }
  };
  useEffect(() => {
    if (!roleCanAccessPage(role, 'chat')) return;
    let cancelled = false;
    const updatePresence = async () => {
      try {
        await customFetch<{ lastSeenAt: string }>('/api/crm/chat/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: readSavedDisplayName() || null }),
        });
        if (!cancelled) setPresenceError('');
      } catch (error) {
        if (!cancelled) {
          console.error('CRM presence heartbeat failed', error);
          setPresenceError('Не вдалося оновити ваш статус онлайн. Перевірте з’єднання.');
        }
      }
    };
    void updatePresence();
    const interval = window.setInterval(() => void updatePresence(), 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void updatePresence();
    };
    const onDisplayNameChange = () => void updatePresence();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('crm-display-name-changed', onDisplayNameChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('crm-display-name-changed', onDisplayNameChange);
    };
  }, [role, userId]);
  const globalPage = (page: 'overview' | 'tasks' | 'orders' | 'warehouse' | 'activity' | 'analytics' | 'admin' | 'chat') =>
    roleCanAccessPage(role, page === 'admin' ? 'admin' : page) || (page === 'admin' && isAdmin)
      ? <GlobalPage page={page} userEmail={userEmail} userId={userId} role={role} isAdmin={isAdmin} onSignOut={onSignOut} presenceError={presenceError} chatUnreadCount={unreadChatCount} notificationsEnabled={notificationEnabled && notificationPermission === 'granted'} notificationPermission={notificationPermission} onEnableNotifications={() => void enableNotifications()} />
      : <NotFound />;
  return <RoutedErrorBoundary><Switch>
    <Route path="/">{roleCanAccessPage(role, 'clients') ? <CrmWorkspace userEmail={userEmail} role={role} isAdmin={isAdmin} onSignOut={onSignOut} chatUnreadCount={unreadChatCount} notificationsEnabled={notificationEnabled && notificationPermission === 'granted'} notificationPermission={notificationPermission} onEnableNotifications={() => void enableNotifications()} /> : <NotFound />}</Route>
    <Route path="/overview">{globalPage('overview')}</Route>
    <Route path="/tasks">{globalPage('tasks')}</Route>
    <Route path="/orders">{globalPage('orders')}</Route>
    <Route path="/analytics">{globalPage('analytics')}</Route>
    <Route path="/warehouse">{globalPage('warehouse')}</Route>
    <Route path="/activity">{globalPage('activity')}</Route>
    <Route path="/chat">{globalPage('chat')}</Route>
    <Route path="/admin">{globalPage('admin')}</Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}
function AuthGate() {
  const client = supabaseClient;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabaseClient));
  const [authError, setAuthError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessChecking, setAccessChecking] = useState(false);
  const [accessVerifiedUserId, setAccessVerifiedUserId] = useState<string | null>(null);
  const [role, setRole] = useState<CrmRole>('manager');
  const isAdmin = role === 'owner';

  useEffect(() => {
    const email = session?.user.email?.trim();
    if (email) localStorage.setItem('budbox-manager', email);
    else localStorage.removeItem('budbox-manager');
  }, [session?.user.email]);

  useEffect(() => {
    if (!client) {
      setAuthTokenGetter(null);
      setLoading(false);
      setAccessChecking(false);
      return;
    }
    let mounted = true;
    setAuthTokenGetter(async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthError('');
      setAccessError('');
      setAccessChecking(Boolean(nextSession));
      setLoading(false);
      if (!nextSession) {
        setAccessVerifiedUserId(null);
        queryClient.clear();
      }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError('Не вдалося відновити сеанс. Спробуйте увійти ще раз.');
      const nextSession = error ? null : data.session;
      setSession(nextSession);
      setAccessChecking(Boolean(nextSession));
      setLoading(false);
      if (!nextSession) setAccessVerifiedUserId(null);
    }).catch(() => {
      if (!mounted) return;
      setAuthError('Не вдалося перевірити сеанс. Перевірте з’єднання та спробуйте ще раз.');
      setAccessChecking(false);
      setLoading(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
      setAuthTokenGetter(null);
    };
  }, []);

  useEffect(() => {
    if (!client || !session) {
      setRole('manager');
      setAccessChecking(false);
      setAccessVerifiedUserId(null);
      return;
    }
    let active = true;
    setAccessChecking(true);
    void (async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) {
          setRole('manager');
          setAccessError('');
          setAccessVerifiedUserId(session.user.id);
          setAccessChecking(false);
          return;
        }
        const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          const { error } = await client.auth.signOut({ scope: 'local' });
          if (error) throw error;
          return;
        }
        if (!response.ok) {
          if (response.status === 403) {
            if (active) setAccessError('Доступ до CRM для цього акаунта вимкнений. Зверніться до головного адміністратора.');
            return;
          }
          throw new Error(`CRM identity check failed with HTTP ${response.status}`);
        }
        const result: unknown = await response.json();
        const verifiedRole = (
          result &&
          typeof result === 'object' &&
          'role' in result &&
          typeof result.role === 'string' &&
          ['owner', 'director', 'sales_manager', 'manager', 'warehouse', 'accountant', 'auditor'].includes(result.role)
        ) ? result.role as CrmRole : 'manager';
        if (active) {
          setAccessError('');
          setRole(verifiedRole);
          setAccessVerifiedUserId(session.user.id);
        }
      } catch (error) {
        console.error('Could not verify CRM administrator access.', error);
        if (active) {
          setRole('manager');
          setAccessError('Не вдалося перевірити доступ до CRM. Оновіть сторінку або зверніться до адміністратора.');
        }
      } finally {
        if (active) setAccessChecking(false);
      }
    })();
    return () => { active = false; };
  }, [client, session?.access_token]);

  if (!client) {
    return <LoginPage client={client} errorMessage={authError} />;
  }

  if (!session) {
    if (loading) return <main className="auth-loading"><LoaderCircle size={24} /><span>Перевіряємо доступ…</span></main>;
    return <LoginPage client={client} errorMessage={authError} />;
  }

  const signOut = async () => {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  };
  if (loading || (accessChecking && accessVerifiedUserId !== session.user.id)) return <main className="auth-loading"><LoaderCircle size={24} /><span>Перевіряємо доступ…</span></main>;
  if (accessError) return <main className="auth-loading"><ShieldCheck size={24} /><span>{accessError}</span><button type="button" className="secondary-button" onClick={() => void signOut()}>Вийти з акаунта</button></main>;
  return <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router userEmail={session.user.email ?? null} userId={session.user.id} role={role} isAdmin={isAdmin} onSignOut={signOut} /></WouterRouter><Toaster /></TooltipProvider>;
}
function App() { return <QueryClientProvider client={queryClient}><AuthGate /></QueryClientProvider>; }
export default App;