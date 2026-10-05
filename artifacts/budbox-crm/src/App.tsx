import { useEffect, useMemo, useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownUp, ArrowRight, Bell, Building2, CalendarClock, Check, ChevronDown,
  ChevronRight, CircleAlert, ClipboardList, Copy, CreditCard, Edit3, FileText, Filter,
  History, LayoutDashboard, Mail, MapPin, MessageCircle, Package, Plus, Search, Send,
  Settings2, ShieldCheck, Tag, Truck, UserRound, UsersRound, Wallet, X
} from 'lucide-react';
import {
  CustomerType, DealStage, GetCompaniesFilter, PaymentForm,
  getGetCompaniesQueryKey, getGetCompanyQueryKey, getGetCrmSummaryQueryKey,
  useCreateCompany, useCreateContact, useCreateNote, useCreateOrder, useCreateTask,
  useGetCompanies, useGetCompany, useGetCrmSummary, useUpdateCompany, useUpdateOrder,
  useUpdateTask
} from '@workspace/api-client-react';
import type {
  CompanyDetail, CompanyInput, CompanyListItem, ContactInput, OrderInput, TaskInput,
  CompanyUpdate
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const stages = Object.values(DealStage);
const customerTypes = Object.values(CustomerType);
const paymentForms = Object.values(PaymentForm);
const filters = [
  { label: 'Усі клієнти', value: GetCompaniesFilter.all },
  { label: 'Мої клієнти', value: GetCompaniesFilter.mine },
  { label: 'Є завдання', value: GetCompaniesFilter.hasTasks },
  { label: 'Прострочено', value: GetCompaniesFilter.overdue },
];

function money(value: number) {
  return new Intl.NumberFormat('uk-UA').format(value) + ' ₴';
}
function date(value?: string | null) {
  if (!value) return 'Не вказано';
  return new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
function stageTone(stage: string) {
  if (stage === DealStage.Успішно_реалізовано) return 'tone-success';
  if (stage === DealStage['Рахунок_/_передоплата']) return 'tone-warm';
  if (stage === DealStage.Відправлено) return 'tone-blue';
  if (stage === DealStage.Зібрано_на_складі) return 'tone-cyan';
  if (stage === DealStage.Уточнення_деталей) return 'tone-neutral';
  return 'tone-primary';
}

type ModalKind = 'company' | 'edit' | 'contact' | 'order' | 'task' | 'note' | null;
type Notice = { kind: 'success' | 'error'; text: string };

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}</label>;
}
function Modal({ title, subtitle, children, close }: { title: string; subtitle: string; children: ReactNode; close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && close()}>
    <div className="modal-panel bb-enter"><div className="modal-head"><div><h3>{title}</h3><p>{subtitle}</p></div><button data-testid="button-close-modal" className="icon-button" onClick={close}><X size={17} /></button></div>{children}</div>
  </div>;
}
function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} />; }

function CrmWorkspace() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>(GetCompaniesFilter.all);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<'Огляд' | 'Історія' | 'Контакти' | 'Замовлення'>('Огляд');
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sortNewest, setSortNewest] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});

  const companyParams = useMemo(() => ({ q: query || undefined, filter: filter as typeof GetCompaniesFilter[keyof typeof GetCompaniesFilter] }), [query, filter]);
  const companiesQuery = useGetCompanies(companyParams);
  const summaryQuery = useGetCrmSummary();
  const companies = companiesQuery.data ?? [];
  const selectedFromList = companies.find((item) => item.id === selectedId);
  const activeId = selectedId ?? companies[0]?.id ?? null;
  const detailQuery = useGetCompany(activeId as number, { query: { enabled: Boolean(activeId), queryKey: getGetCompanyQueryKey(activeId ?? 0) } });
  const detail = detailQuery.data as CompanyDetail | undefined;
  const selected = detail ?? selectedFromList;

  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const createContact = useCreateContact();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const createNote = useCreateNote();
  const busy = createCompany.isPending || updateCompany.isPending || createContact.isPending || createOrder.isPending || updateOrder.isPending || createTask.isPending || updateTask.isPending || createNote.isPending;

  useEffect(() => { if (!selectedId && companies[0]) setSelectedId(companies[0].id); }, [companies, selectedId]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3600); return () => window.clearTimeout(timer); }, [notice]);

  const flash = (text: string, kind: Notice['kind'] = 'success') => setNotice({ text, kind });
  const refresh = async (id = activeId) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getGetCompaniesQueryKey(companyParams) }),
      qc.invalidateQueries({ queryKey: getGetCrmSummaryQueryKey() }),
      ...(id ? [qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(id) })] : []),
    ]);
  };
  const open = (kind: ModalKind, values: Record<string, string> = {}) => { setForm(values); setModal(kind); };
  const close = () => { setModal(null); setForm({}); };
  const setValue = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => { const handler = () => close(); window.addEventListener('close-modal', handler); return () => window.removeEventListener('close-modal', handler); }, []);
  const submitCompany = (edit = false) => {
    const payload = {
      name: form.name?.trim(), taxId: form.taxId || null, customerType: (form.customerType || CustomerType.Виконроб) as CompanyInput['customerType'],
      city: form.city || null, manager: form.manager?.trim() || 'Олена Кравчук', warehouse: form.warehouse || null,
      paymentForm: (form.paymentForm || PaymentForm.ПДВ) as CompanyInput['paymentForm'],
      creditLimitUah: Number(form.creditLimitUah || 0), paymentTermsDays: Number(form.paymentTermsDays || 0),
      discountPercent: Number(form.discountPercent || 0), priceTier: form.priceTier || null, source: form.source || null,
    };
    if (!payload.name) return flash('Вкажіть назву компанії', 'error');
    const done = (item: CompanyDetail) => { setSelectedId(item.id); close(); void refresh(item.id); flash(edit ? 'Картку компанії оновлено' : 'Компанію додано до черги'); };
    if (edit && activeId) updateCompany.mutate({ companyId: activeId, data: payload as CompanyUpdate }, { onSuccess: done, onError: () => flash('Не вдалося оновити компанію', 'error') });
    else createCompany.mutate({ data: payload as CompanyInput }, { onSuccess: done, onError: () => flash('Не вдалося створити компанію', 'error') });
  };
  const submitContact = () => {
    if (!activeId || !form.fullName?.trim()) return flash('Вкажіть ім’я контакту', 'error');
    const data: ContactInput = { fullName: form.fullName.trim(), role: form.role || null, phone: form.phone || null, email: form.email || null, telegram: form.telegram || null, viber: form.viber || null };
    createContact.mutate({ companyId: activeId, data }, { onSuccess: () => { close(); void refresh(); flash('Контакт додано до картки'); }, onError: () => flash('Не вдалося додати контакт', 'error') });
  };
  const submitOrder = () => {
    if (!activeId || !form.amountUah) return flash('Вкажіть суму замовлення', 'error');
    const data: OrderInput = { code: form.code || null, stage: (form.stage || stages[0]) as OrderInput['stage'], amountUah: Number(form.amountUah), ttn: form.ttn || null, deliveryStatus: form.deliveryStatus || null };
    createOrder.mutate({ companyId: activeId, data }, { onSuccess: () => { close(); void refresh(); flash('Замовлення створено'); }, onError: () => flash('Не вдалося створити замовлення', 'error') });
  };
  const submitTask = () => {
    if (!activeId || !form.title?.trim()) return flash('Вкажіть назву завдання', 'error');
    const data: TaskInput = { title: form.title.trim(), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, assignee: form.assignee?.trim() || 'Олена Кравчук' };
    createTask.mutate({ companyId: activeId, data }, { onSuccess: () => { close(); void refresh(); flash('Завдання створено'); }, onError: () => flash('Не вдалося створити завдання', 'error') });
  };
  const submitNote = () => {
    if (!activeId || !form.title?.trim()) return flash('Вкажіть текст нотатки', 'error');
    createNote.mutate({ companyId: activeId, data: { title: form.title.trim(), details: form.details || null, createdBy: 'Олена Кравчук' } }, { onSuccess: () => { close(); void refresh(); flash('Нотатку збережено в історії'); }, onError: () => flash('Не вдалося зберегти нотатку', 'error') });
  };
  const completeTask = (taskId: number, isCompleted: boolean) => {
    updateTask.mutate({ taskId, data: { isCompleted: !isCompleted } }, { onSuccess: () => { void refresh(); flash(isCompleted ? 'Завдання повернуто в роботу' : 'Завдання виконано'); }, onError: () => flash('Не вдалося змінити стан завдання', 'error') });
  };
  const editOrder = (orderId: number, data: { stage?: DealStage; ttn?: string | null; deliveryStatus?: string | null }) => {
    updateOrder.mutate({ orderId, data }, { onSuccess: () => { void refresh(); flash('Дані замовлення оновлено'); }, onError: () => flash('Не вдалося оновити замовлення', 'error') });
  };
  const copy = (value: string | null | undefined, label: string) => { if (value) { void navigator.clipboard?.writeText(value); flash(`${label} скопійовано`); } };

  const sorted = [...companies].sort((a, b) => sortNewest ? b.id - a.id : a.id - b.id);
  const companyForm = { name: selected?.name ?? '', taxId: selected?.taxId ?? '', customerType: selected?.customerType ?? CustomerType.Виконроб, city: selected?.city ?? '', manager: selected?.manager ?? 'Олена Кравчук', warehouse: selected?.warehouse ?? '', paymentForm: selected?.paymentForm ?? PaymentForm.ПДВ, creditLimitUah: String(selected?.creditLimitUah ?? 0), paymentTermsDays: String(selected?.paymentTermsDays ?? 0), discountPercent: String(selected?.discountPercent ?? 0), priceTier: selected?.priceTier ?? '', source: selected?.source ?? '' };
  const showCompanyModal = modal === 'company' || modal === 'edit';
  const title = modal === 'company' ? 'Нова компанія' : modal === 'edit' ? 'Редагування компанії' : modal === 'contact' ? 'Новий контакт' : modal === 'order' ? 'Нове замовлення' : modal === 'task' ? 'Нове завдання' : 'Нова нотатка';

  return <div className="bb-app">
    <header className="topbar"><div className="brand"><div className="brand-mark">B</div><div><strong>BUDBOX</strong><small>CRM / ПРОДАЖІ</small></div></div><div className="crumbs"><span>Продажі</span><ChevronRight size={13} /><b>Клієнти</b></div><div className="top-actions"><button data-testid="button-notifications" className="icon-button" onClick={() => flash('Сповіщень, що потребують уваги, немає')}><Bell size={17} /><i /></button><button data-testid="button-settings" className="icon-button" onClick={() => flash('Налаштування робочого простору доступні адміністратору')}><Settings2 size={17} /></button><div className="profile"><span>ОК</span><div><b>Олена Кравчук</b><small>Менеджерка</small></div><ChevronDown size={14} /></div></div></header>
    <div className="workspace"><aside className="rail"><button data-testid="nav-overview" onClick={() => flash('Огляд продажів буде доступний у цьому робочому просторі')}><LayoutDashboard size={18} /></button><button data-testid="nav-clients" className="active"><UsersRound size={18} /></button><button data-testid="nav-tasks" onClick={() => flash('Завдання доступні в картці клієнта')}><ClipboardList size={18} /></button><button data-testid="nav-orders" onClick={() => flash('Замовлення доступні в картці клієнта')}><Package size={18} /></button><button data-testid="nav-activity" onClick={() => flash('Активність доступна в картці клієнта')}><Activity size={18} /></button><div className="rail-bottom"><button data-testid="nav-support" onClick={() => flash('Служба підтримки BUDBOX')}><MessageCircle size={18} /></button></div></aside>
      <main className="main"><div className="page-heading"><div><div className="eyebrow"><span /> РОБОЧА ЧЕРГА ПРОДАЖІВ</div><h1>Клієнти <small data-testid="text-company-count">{summaryQuery.data?.totalCompanies ?? companies.length} компаній</small></h1></div><button data-testid="button-new-company" className="primary-button" onClick={() => open('company')}><Plus size={16} /> <span>Нова компанія</span></button></div>
        <div className="summary-strip">{summaryQuery.isLoading ? <><Skeleton /><Skeleton /><Skeleton /><Skeleton /></> : summaryQuery.isError ? <div className="summary-error">Не вдалося завантажити підсумок <button onClick={() => summaryQuery.refetch()}>Повторити</button></div> : <><div><span>КОМПАНІЇ</span><b data-testid="summary-companies">{summaryQuery.data?.totalCompanies ?? 0}</b></div><div><span>АКТИВНІ ЗАМОВЛЕННЯ</span><b data-testid="summary-orders">{summaryQuery.data?.activeOrders ?? 0}</b></div><div><span>ВОРОНКА</span><b data-testid="summary-pipeline">{money(summaryQuery.data?.pipelineValueUah ?? 0)}</b></div><div className="summary-alert"><span>ПРОСТРОЧЕНІ ЗАВДАННЯ</span><b data-testid="summary-overdue">{summaryQuery.data?.overdueTasks ?? 0}</b></div></>}</div>
        <div className="crm-shell"><section className="queue"><div className="queue-head"><div><h2>Черга клієнтів</h2><p>Компанії та активні замовлення</p></div><button data-testid="button-sort-companies" className="icon-button" onClick={() => setSortNewest((value) => !value)}><ArrowDownUp size={15} /></button><div className="search-wrap"><Search size={15} /><input data-testid="input-company-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Назва, код або місто" /></div><div className="filter-row">{filters.map((item) => <button data-testid={`filter-${item.value}`} key={item.value} className={filter === item.value ? 'selected' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div></div><div className="queue-labels"><span>КОМПАНІЯ / ТИП</span><span>ЕТАП / СУМА</span></div><div className="company-list bb-scroll">{companiesQuery.isLoading ? <>{[1, 2, 3, 4].map((item) => <div key={item} className="company-skeleton"><Skeleton /><Skeleton /><Skeleton /></div>)}</> : companiesQuery.isError ? <div className="empty-state"><CircleAlert size={22} /><b>Не вдалося завантажити компанії</b><button onClick={() => companiesQuery.refetch()}>Повторити</button></div> : sorted.length ? sorted.map((company) => <CompanyRow key={company.id} company={company} active={company.id === activeId} select={() => { setSelectedId(company.id); setTab('Огляд'); }} />) : <div className="empty-state"><Search size={23} /><b>Нічого не знайдено</b><span>Змініть пошук або фільтр</span><button onClick={() => { setQuery(''); setFilter(GetCompaniesFilter.all); }}>Скинути фільтри</button></div>}</div><div className="queue-foot"><span>Показано {sorted.length} із {companies.length}</span><button onClick={() => { setQuery(''); setFilter(GetCompaniesFilter.all); }}>Скинути</button></div></section>
          <section className="profile-pane bb-scroll">{!activeId ? <div className="profile-empty"><Building2 size={32} /><h2>Оберіть компанію</h2><p>Профіль клієнта з’явиться тут після вибору в черзі.</p></div> : detailQuery.isLoading ? <div className="loading-profile"><Skeleton className="wide" /><Skeleton className="hero-skeleton" /><Skeleton className="wide" /></div> : detailQuery.isError || !detail ? <div className="empty-state"><CircleAlert size={22} /><b>Профіль недоступний</b><button onClick={() => detailQuery.refetch()}>Повторити</button></div> : <div className="profile-content bb-enter"><div className="profile-header"><div className="profile-breadcrumb">КЛІЄНТИ <ChevronRight size={12} /> {detail.name}</div><div className="profile-main"><div className="company-icon"><Building2 size={23} /></div><div className="company-title"><div><h2 data-testid={`text-company-${detail.id}`}>{detail.name}</h2><span className="badge type-badge">{detail.customerType}</span></div><div className="company-meta"><button data-testid="button-copy-tax-id" onClick={() => copy(detail.taxId, 'Код')}><ShieldCheck size={13} /> {detail.taxId || 'Код не вказано'} <Copy size={11} /></button><span><MapPin size={13} />{detail.city || 'Місто не вказано'}</span><span className="source-chip">Джерело: {detail.source || 'Не вказано'}</span></div></div><div className="profile-buttons"><button data-testid="button-add-note" className="secondary-button" onClick={() => open('note')}><FileText size={14} /> Нотатка</button><button data-testid="button-add-task" className="secondary-button" onClick={() => open('task')}><Plus size={14} /> Завдання</button><button data-testid="button-edit-company" className="primary-button small" onClick={() => open('edit', companyForm)}><Edit3 size={14} /> Редагувати</button></div></div><div className="tabs">{(['Огляд', 'Історія', 'Контакти', 'Замовлення'] as const).map((item) => <button data-testid={`tab-${item}`} key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Історія' && <em>{detail.activity.length}</em>}{item === 'Контакти' && <em>{detail.contacts.length}</em>}</button>)}</div></div>{tab === 'Огляд' ? <Overview detail={detail} open={open} completeTask={completeTask} editOrder={editOrder} copy={copy} flash={flash} /> : tab === 'Історія' ? <ActivityTab detail={detail} open={open} /> : tab === 'Контакти' ? <ContactsTab detail={detail} open={open} /> : <OrdersTab detail={detail} open={open} editOrder={editOrder} />}</div>}</section></div></main></div>
    {notice && <div className={`notice ${notice.kind}`} data-testid="status-notice"><Check size={15} /> {notice.text}</div>}
    {showCompanyModal && <Modal title={title} subtitle="Дані будуть збережені у CRM через API" close={close}><CompanyForm form={form} setValue={setValue} onSubmit={() => submitCompany(modal === 'edit')} busy={busy} edit={modal === 'edit'} /></Modal>}
    {modal === 'contact' && <Modal title={title} subtitle={`Новий контакт для ${selected?.name ?? 'компанії'}`} close={close}><ContactForm form={form} setValue={setValue} onSubmit={submitContact} busy={busy} /></Modal>}
    {modal === 'order' && <Modal title={title} subtitle="Вкажіть етап, суму та ручні дані доставки" close={close}><OrderForm form={form} setValue={setValue} onSubmit={submitOrder} busy={busy} /></Modal>}
    {modal === 'task' && <Modal title={title} subtitle={`Нагадування для ${selected?.name ?? 'компанії'}`} close={close}><TaskForm form={form} setValue={setValue} onSubmit={submitTask} busy={busy} /></Modal>}
    {modal === 'note' && <Modal title={title} subtitle="Запис з’явиться в історії активності клієнта" close={close}><NoteForm form={form} setValue={setValue} onSubmit={submitNote} busy={busy} /></Modal>}
  </div>;
}

function CompanyRow({ company, active, select }: { company: CompanyListItem; active: boolean; select: () => void }) {
  return <button data-testid={`row-company-${company.id}`} className={`company-row ${active ? 'active' : ''}`} onClick={select}><div className="row-top"><div><strong>{company.name}</strong><div className="row-meta"><span className="badge type-badge">{company.customerType}</span><span>{company.city || 'Місто не вказано'}</span></div></div><div className="row-amount">{company.activeOrder ? money(company.activeOrder.amountUah) : '—'}<span className={`badge ${company.activeOrder ? stageTone(company.activeOrder.stage) : 'tone-neutral'}`}>{company.activeOrder?.stage || 'Без замовлення'}</span></div></div><div className="row-foot"><span><UserRound size={11} />{company.manager}</span><span className={company.overdue ? 'overdue' : ''}>{company.overdue && <CircleAlert size={11} />}{company.overdue ? 'Прострочено' : company.nextTask?.title || 'Немає наступного завдання'}</span></div></button>;
}
function SectionHeader({ icon: Icon, title, subtitle, action }: { icon: ElementType; title: string; subtitle: string; action?: ReactNode }) { return <div className="section-header"><div className="section-icon"><Icon size={15} /></div><div><h3>{title}</h3><p>{subtitle}</p></div>{action && <div className="section-action">{action}</div>}</div>; }
function Overview({ detail, open, completeTask, editOrder, copy, flash }: { detail: CompanyDetail; open: (kind: ModalKind, values?: Record<string, string>) => void; completeTask: (id: number, completed: boolean) => void; editOrder: (id: number, data: { stage?: DealStage; ttn?: string | null; deliveryStatus?: string | null }) => void; copy: (value: string | null | undefined, label: string) => void; flash: (text: string, kind?: Notice['kind']) => void }) {
  const order = detail.orders[0];
  const task = detail.tasks.find((item) => !item.isCompleted) ?? detail.tasks[0];
  return <div className="overview-grid"><div className="overview-main"><div className="data-card"><SectionHeader icon={ShoppingBagIcon} title="Активне замовлення" subtitle={order?.code || 'Замовлень поки немає'} action={order && <select data-testid="select-order-stage" value={order.stage} onChange={(event) => editOrder(order.id, { stage: event.target.value as DealStage })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>} />{order ? <><div className="order-body"><div><span className="label">СУМА ЗАМОВЛЕННЯ</span><strong className="big-money">{money(order.amountUah)}</strong><div className="delivery-box"><Truck size={16} /><div><b>Доставка</b><span>{order.deliveryStatus || 'Статус не вказано'}</span><button onClick={() => copy(order.ttn, 'ТТН')}>ТТН: {order.ttn || 'Не вказано'} <Copy size={11} /></button></div></div></div><div className="order-side"><span className="label">МЕНЕДЖЕР</span><div className="manager"><b>{initials(detail.manager)}</b>{detail.manager}</div><span className="label">СКЛАД</span><span className="muted"><Package size={13} /> {detail.warehouse || 'Не вказано'}</span></div></div><div className="stage-line">{stages.map((stage, index) => <div key={stage} className={`stage-node ${index <= stages.indexOf(order.stage) ? 'done' : ''}`} title={stage}><i />{index < stages.length - 1 && <span />}</div>)}</div><div className="stage-caption"><span>Новий лід</span><span>Успішно реалізовано</span></div></> : <div className="empty-card"><Package size={24} /><span>У клієнта ще немає замовлень.</span><button data-testid="button-create-order-empty" className="secondary-button" onClick={() => open('order')}><Plus size={14} /> Створити замовлення</button></div>}</div>
    <div className="data-card"><SectionHeader icon={CalendarClock} title="Наступна дія" subtitle="Нагадування для менеджерки" action={<button data-testid="button-add-task-inline" className="icon-button" onClick={() => open('task')}><Plus size={15} /></button>} />{task ? <div className={`task-row ${task.isCompleted ? 'completed' : ''}`}><span className="task-dot" /><div><b>{task.title}</b><p><ClockIcon size={12} />{date(task.dueAt)} · {task.assignee}</p></div><button data-testid={`button-complete-task-${task.id}`} className="check-button" onClick={() => completeTask(task.id, task.isCompleted)}><Check size={14} /></button></div> : <div className="empty-card compact"><ClipboardList size={21} /><span>Немає відкритих завдань.</span></div>}</div>
    <div className="data-card"><SectionHeader icon={Wallet} title="Умови співпраці" subtitle="Фінансові параметри клієнта" action={<button data-testid="button-edit-terms" className="text-button" onClick={() => flash('Для зміни умов відкрийте редагування компанії')}>Редагувати</button>} /><div className="terms-grid"><Term icon={CreditCard} label="Форма оплати" value={detail.paymentForm} /><Term icon={ShieldCheck} label="Кредит / відстрочка" value={`${money(detail.creditLimitUah)} · ${detail.paymentTermsDays} дн.`} /><Term icon={Tag} label="Особиста знижка" value={`${detail.discountPercent}%`} /><Term icon={Filter} label="Ціновий рівень" value={detail.priceTier || 'Не вказано'} /></div></div></div><div className="overview-side"><div className="data-card"><SectionHeader icon={UsersRound} title="Контактні особи" subtitle={`${detail.contacts.length} контакти компанії`} action={<button data-testid="button-view-contacts" className="text-button" onClick={() => open('contact')}>Додати</button>} />{detail.contacts.length ? <div className="contact-list">{detail.contacts.slice(0, 3).map((contact) => <ContactMini key={contact.id} contact={contact} copy={copy} flash={flash} />)}</div> : <div className="empty-card compact">Контактів ще немає.</div>}</div><div className="data-card"><SectionHeader icon={History} title="Остання активність" subtitle="Хронологія взаємодій" action={<button data-testid="button-view-history" className="text-button" onClick={() => open('note')}>Додати запис</button>} /><div className="activity-list">{detail.activity.slice(0, 5).map((item) => <ActivityItem key={item.id} item={item} />)}</div>{!detail.activity.length && <div className="empty-card compact">Історія поки порожня.</div>}</div></div></div>;
}
function ShoppingBagIcon(props: { size?: number }) { return <Package {...props} />; }
function ClockIcon(props: { size?: number }) { return <CalendarClock {...props} />; }
function Term({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) { return <div><span className="term-label"><Icon size={12} />{label}</span><b>{value}</b></div>; }
function ContactMini({ contact, copy, flash }: { contact: CompanyDetail['contacts'][number]; copy: (value: string | null | undefined, label: string) => void; flash: (text: string) => void }) { return <div className="contact-mini"><div className="avatar">{initials(contact.fullName)}</div><div className="contact-info"><b>{contact.fullName}</b><span>{contact.role || 'Роль не вказана'}</span><button onClick={() => copy(contact.phone, 'Телефон')}>{contact.phone || 'Телефон не вказано'}</button><button onClick={() => copy(contact.email, 'Email')}><Mail size={10} />{contact.email || 'Email не вказано'}</button></div><button className="icon-button" onClick={() => flash(`Контакт: ${contact.fullName}`)}><Send size={14} /></button></div>; }
function ActivityItem({ item }: { item: CompanyDetail['activity'][number] }) { return <div className="activity-item"><span className="activity-dot"><Activity size={11} /></span><div><div className="activity-title"><b>{item.title}</b><time>{date(item.createdAt)}</time></div><p>{item.details || 'Без додаткових деталей'}</p><small>{item.createdBy}</small></div></div>; }
function ActivityTab({ detail, open }: { detail: CompanyDetail; open: (kind: ModalKind) => void }) { return <div className="tab-page"><div className="tab-heading"><div><h3>Історія взаємодій</h3><p>Усі записи по клієнту в одному порядку.</p></div><button className="primary-button small" data-testid="button-add-history-note" onClick={() => open('note')}><Plus size={14} /> Додати запис</button></div>{detail.activity.length ? <div className="timeline">{detail.activity.map((item) => <ActivityItem key={item.id} item={item} />)}</div> : <div className="empty-state large"><History size={28} /><b>Історія порожня</b><span>Додайте нотатку, щоб зафіксувати домовленість.</span></div>}</div>; }
function ContactsTab({ detail, open }: { detail: CompanyDetail; open: (kind: ModalKind) => void }) { return <div className="tab-page"><div className="tab-heading"><div><h3>Контактні особи</h3><p>Люди, з якими команда BUDBOX працює по цій компанії.</p></div><button className="primary-button small" data-testid="button-add-contact" onClick={() => open('contact')}><Plus size={14} /> Додати контакт</button></div>{detail.contacts.length ? <div className="contacts-grid">{detail.contacts.map((contact) => <div className="contact-card" key={contact.id}><div className="avatar large">{initials(contact.fullName)}</div><h4>{contact.fullName}</h4><span>{contact.role || 'Роль не вказана'}</span><p><MessageCircle size={13} />{contact.phone || 'Телефон не вказано'}</p><p><Mail size={13} />{contact.email || 'Email не вказано'}</p><div className="contact-actions"><a href={contact.phone ? `tel:${contact.phone}` : undefined}>Зателефонувати</a><button onClick={() => navigator.clipboard?.writeText(contact.telegram || contact.viber || '')}>Месенджер</button></div></div>)}</div> : <div className="empty-state large"><UsersRound size={28} /><b>Контактів ще немає</b><span>Додайте першу контактну особу компанії.</span></div>}</div>; }
function OrdersTab({ detail, open, editOrder }: { detail: CompanyDetail; open: (kind: ModalKind) => void; editOrder: (id: number, data: { stage?: DealStage; ttn?: string | null; deliveryStatus?: string | null }) => void }) { return <div className="tab-page"><div className="tab-heading"><div><h3>Замовлення клієнта</h3><p>Етапи, суми та ручні дані доставки.</p></div><button className="primary-button small" data-testid="button-add-order" onClick={() => open('order')}><Plus size={14} /> Нове замовлення</button></div>{detail.orders.length ? <div className="orders-table"><div className="table-head"><span>Замовлення</span><span>Етап</span><span>Сума</span><span>ТТН / доставка</span></div>{detail.orders.map((order) => <div className="table-row" key={order.id}><div><b>{order.code || `Замовлення #${order.id}`}</b><small>{date(order.createdAt)}</small></div><select value={order.stage} onChange={(event) => editOrder(order.id, { stage: event.target.value as DealStage })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select><b>{money(order.amountUah)}</b><div><input data-testid={`input-ttn-${order.id}`} defaultValue={order.ttn || ''} placeholder="ТТН вручну" onBlur={(event) => event.target.value !== (order.ttn || '') && editOrder(order.id, { ttn: event.target.value || null })} /><input defaultValue={order.deliveryStatus || ''} placeholder="Статус доставки" onBlur={(event) => event.target.value !== (order.deliveryStatus || '') && editOrder(order.id, { deliveryStatus: event.target.value || null })} /></div></div>)}</div> : <div className="empty-state large"><Package size={28} /><b>Замовлень ще немає</b><span>Створіть замовлення, щоб відстежувати етап, суму й доставку.</span></div>}</div>; }

function CompanyForm({ form, setValue, onSubmit, busy, edit }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean; edit: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Назва компанії" wide><input autoFocus data-testid="input-company-name" value={form.name || ''} onChange={(event) => setValue('name', event.target.value)} placeholder="ТОВ «Нова Будова»" required /></Field><Field label="Код / ІПН"><input data-testid="input-tax-id" value={form.taxId || ''} onChange={(event) => setValue('taxId', event.target.value)} /></Field><Field label="Тип клієнта"><select value={form.customerType || customerTypes[0]} onChange={(event) => setValue('customerType', event.target.value)}>{customerTypes.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Місто"><input value={form.city || ''} onChange={(event) => setValue('city', event.target.value)} /></Field><Field label="Менеджер"><input value={form.manager || ''} onChange={(event) => setValue('manager', event.target.value)} /></Field><Field label="Склад"><input value={form.warehouse || ''} onChange={(event) => setValue('warehouse', event.target.value)} /></Field><Field label="Форма оплати"><select value={form.paymentForm || paymentForms[0]} onChange={(event) => setValue('paymentForm', event.target.value)}>{paymentForms.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Кредитний ліміт, ₴"><input type="number" min="0" value={form.creditLimitUah || '0'} onChange={(event) => setValue('creditLimitUah', event.target.value)} /></Field><Field label="Відстрочка, днів"><input type="number" min="0" value={form.paymentTermsDays || '0'} onChange={(event) => setValue('paymentTermsDays', event.target.value)} /></Field><Field label="Знижка, %"><input type="number" min="0" max="100" value={form.discountPercent || '0'} onChange={(event) => setValue('discountPercent', event.target.value)} /></Field><Field label="Ціновий рівень"><input value={form.priceTier || ''} onChange={(event) => setValue('priceTier', event.target.value)} /></Field><Field label="Джерело"><input value={form.source || ''} onChange={(event) => setValue('source', event.target.value)} /></Field><div className="form-actions"><button type="button" className="secondary-button" onClick={() => window.dispatchEvent(new Event('close-modal'))}>Скасувати</button><button data-testid="button-submit-company" className="primary-button" disabled={busy}>{busy ? 'Збереження…' : edit ? 'Зберегти зміни' : 'Створити компанію'}</button></div></form>; }
function ContactForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Ім’я та прізвище" wide><input autoFocus data-testid="input-contact-name" value={form.fullName || ''} onChange={(event) => setValue('fullName', event.target.value)} required /></Field><Field label="Роль"><input value={form.role || ''} onChange={(event) => setValue('role', event.target.value)} /></Field><Field label="Телефон"><input value={form.phone || ''} onChange={(event) => setValue('phone', event.target.value)} /></Field><Field label="Email"><input type="email" value={form.email || ''} onChange={(event) => setValue('email', event.target.value)} /></Field><Field label="Telegram"><input value={form.telegram || ''} onChange={(event) => setValue('telegram', event.target.value)} /></Field><Field label="Viber"><input value={form.viber || ''} onChange={(event) => setValue('viber', event.target.value)} /></Field><Submit busy={busy} label="Додати контакт" /></form>; }
function OrderForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Код замовлення"><input autoFocus value={form.code || ''} onChange={(event) => setValue('code', event.target.value)} placeholder="ЗАМ-10512" /></Field><Field label="Етап"><select value={form.stage || stages[0]} onChange={(event) => setValue('stage', event.target.value)}>{stages.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Сума, ₴"><input type="number" min="0" value={form.amountUah || ''} onChange={(event) => setValue('amountUah', event.target.value)} required /></Field><Field label="ТТН вручну"><input value={form.ttn || ''} onChange={(event) => setValue('ttn', event.target.value)} placeholder="Не створено" /></Field><Field label="Статус доставки" wide><input value={form.deliveryStatus || ''} onChange={(event) => setValue('deliveryStatus', event.target.value)} placeholder="Очікує підтвердження" /></Field><Submit busy={busy} label="Створити замовлення" /></form>; }
function TaskForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Що потрібно зробити?" wide><input autoFocus data-testid="input-task-title" value={form.title || ''} onChange={(event) => setValue('title', event.target.value)} required placeholder="Зателефонувати щодо оплати" /></Field><Field label="Термін"><input type="datetime-local" value={form.dueAt || ''} onChange={(event) => setValue('dueAt', event.target.value)} /></Field><Field label="Відповідальна особа"><input value={form.assignee || 'Олена Кравчук'} onChange={(event) => setValue('assignee', event.target.value)} /></Field><Submit busy={busy} label="Створити завдання" /></form>; }
function NoteForm({ form, setValue, onSubmit, busy }: { form: Record<string, string>; setValue: (key: string, value: string) => void; onSubmit: () => void; busy: boolean }) { return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Заголовок нотатки" wide><input autoFocus data-testid="input-note-title" value={form.title || ''} onChange={(event) => setValue('title', event.target.value)} required placeholder="Підсумок дзвінка" /></Field><Field label="Деталі" wide><textarea data-testid="input-note-details" rows={4} value={form.details || ''} onChange={(event) => setValue('details', event.target.value)} placeholder="Зафіксуйте домовленість або наступний крок" /></Field><Submit busy={busy} label="Зберегти нотатку" /></form>; }
function Submit({ busy, label }: { busy: boolean; label: string }) { return <div className="form-actions"><button type="submit" className="primary-button" data-testid="button-submit-form" disabled={busy}>{busy ? 'Збереження…' : label}</button></div>; }

function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function Router() { return <RoutedErrorBoundary><Switch><Route path="/" component={CrmWorkspace} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;