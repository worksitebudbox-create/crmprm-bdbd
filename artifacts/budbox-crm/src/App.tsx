import { useEffect, useMemo, useState } from 'react';
import type { ElementType, ReactNode, FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownUp, ArrowRight, Bell, Building2, CalendarClock, Check, ChevronDown, Menu,
  ChevronRight, CircleAlert, ClipboardList, Copy, CreditCard, Edit3, FileText, Filter,
  History, LayoutDashboard, Mail, MapPin, MessageCircle, Package, Plus, Search, Send,
  Settings2, ShieldCheck, Tag, Truck, UserRound, UsersRound, Wallet, X, CircleHelp, SlidersHorizontal
} from 'lucide-react';
import {
  CustomerType, DealStage, GetCompaniesFilter, PaymentForm,
  getGetCompaniesQueryKey, getGetCompanyQueryKey, getGetCrmSummaryQueryKey, getGetCrmTasksQueryKey,
  getGetCrmOrdersQueryKey, getGetCrmActivityQueryKey,
  useCreateCompany, useCreateContact, useCreateNote, useCreateOrder, useCreateTask,
  useGetCompanies, useGetCompany, useGetCrmSummary, useGetCrmTasks, useGetCrmOrders, useGetCrmActivity, useUpdateCompany, useUpdateOrder,
  useUpdateTask
} from '@workspace/api-client-react';
import type {
  CompanyDetail, CompanyInput, CompanyListItem, ContactInput, OrderInput, TaskInput, TaskBoardItem, OrderBoardItem, ActivityBoardItem,
  CompanyUpdate
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

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
  const [, navigate] = useLocation();
  const [railOpen, setRailOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerPanel, setHeaderPanel] = useState<'notifications' | 'settings' | 'profile' | null>(null);
  const [compact, setCompact] = useState(() => localStorage.getItem('budbox-compact') === 'true');
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
  const [sortNewest, setSortNewest] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});

  const companyParams = useMemo(() => ({ q: query || undefined, filter: filter as typeof GetCompaniesFilter[keyof typeof GetCompaniesFilter] }), [query, filter]);
  const companiesQuery = useGetCompanies(companyParams);
  const summaryQuery = useGetCrmSummary();
  const taskBoard = useGetCrmTasks();
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
    const done = (item: CompanyDetail) => { setSelectedId(item.id); localStorage.setItem('budbox-selected-company', String(item.id)); close(); void refresh(item.id); flash(edit ? 'Картку компанії оновлено' : 'Компанію додано до черги'); };
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
  const overdueTasks = (taskBoard.data ?? []).filter((task) => !task.isCompleted && task.dueAt && new Date(task.dueAt) < new Date());
  const toggleCompact = () => { const next = !compact; setCompact(next); localStorage.setItem('budbox-compact', String(next)); document.documentElement.classList.toggle('bb-compact', next); };
  useEffect(() => { document.documentElement.classList.toggle('bb-compact', compact); }, [compact]);

  const sorted = [...companies].sort((a, b) => sortNewest ? b.id - a.id : a.id - b.id);
  const companyForm = { name: selected?.name ?? '', taxId: selected?.taxId ?? '', customerType: selected?.customerType ?? CustomerType.Виконроб, city: selected?.city ?? '', manager: selected?.manager ?? 'Олена Кравчук', warehouse: selected?.warehouse ?? '', paymentForm: selected?.paymentForm ?? PaymentForm.ПДВ, creditLimitUah: String(selected?.creditLimitUah ?? 0), paymentTermsDays: String(selected?.paymentTermsDays ?? 0), discountPercent: String(selected?.discountPercent ?? 0), priceTier: selected?.priceTier ?? '', source: selected?.source ?? '' };
  const showCompanyModal = modal === 'company' || modal === 'edit';
  const title = modal === 'company' ? 'Нова компанія' : modal === 'edit' ? 'Редагування компанії' : modal === 'contact' ? 'Новий контакт' : modal === 'order' ? 'Нове замовлення' : modal === 'task' ? 'Нове завдання' : 'Нова нотатка';

  return <div className="bb-app">
    <header className="topbar"><button data-testid="button-hamburger" className="icon-button hamburger" aria-label="Перемкнути навігацію" aria-expanded={window.innerWidth < 768 ? drawerOpen : railOpen} onClick={() => { if (window.innerWidth < 768) setDrawerOpen(!drawerOpen); else setRailOpen(!railOpen); }}><Menu size={19} /></button><div className="brand"><div className="brand-mark">B</div><div><strong>BUDBOX</strong><small>CRM / ПРОДАЖІ</small></div></div><div className="crumbs"><span>Продажі</span><ChevronRight size={13} /><b>Клієнти</b></div><div className="top-actions"><button aria-label="Сповіщення" aria-expanded={headerPanel === 'notifications'} data-testid="button-notifications" className="icon-button" onClick={() => setHeaderPanel(headerPanel === 'notifications' ? null : 'notifications')}><Bell size={17} />{overdueTasks.length > 0 && <i />}</button><button aria-label="Налаштування" aria-expanded={headerPanel === 'settings'} data-testid="button-settings" className="icon-button" onClick={() => setHeaderPanel(headerPanel === 'settings' ? null : 'settings')}><Settings2 size={17} /></button><button aria-label="Профіль і параметри" aria-expanded={headerPanel === 'profile'} className="profile profile-trigger" data-testid="button-profile-menu" onClick={() => setHeaderPanel(headerPanel === 'profile' ? null : 'profile')}><span>ОК</span><div><b>Олена Кравчук</b><small>Менеджерка</small></div><ChevronDown size={14} /></button></div>
      {headerPanel && <div className="header-popover" data-testid={`panel-${headerPanel}`}><div className="popover-title">{headerPanel === 'notifications' ? 'Потребують уваги' : headerPanel === 'settings' ? 'Налаштування вигляду' : 'Робочий профіль'}<button className="icon-button" onClick={() => setHeaderPanel(null)}><X size={14} /></button></div>{headerPanel === 'notifications' ? taskBoard.isLoading ? <p>Завантаження завдань…</p> : taskBoard.isError ? <p>Не вдалося завантажити сповіщення.</p> : overdueTasks.length ? overdueTasks.slice(0, 5).map((task) => <button className="popover-row" key={task.id} onClick={() => { setHeaderPanel(null); navigate('/tasks'); }}><CircleAlert size={14} /><span><b>{task.title}</b><small>{task.companyName} · {date(task.dueAt)}</small></span></button>) : <p>Прострочених завдань немає.</p> : headerPanel === 'settings' ? <label className="density-control"><span><b>Компактний список</b><small>Менше вертикальних відступів у черзі</small></span><input data-testid="toggle-compact-density" type="checkbox" checked={compact} onChange={toggleCompact} /></label> : <><p>Олена Кравчук · менеджерка продажів</p><button className="popover-row" onClick={() => { setHeaderPanel('settings'); }}><SlidersHorizontal size={14} /><span><b>Параметри робочого простору</b><small>Налаштування локальні для цього браузера</small></span></button></>}</div>}
    </header>
    <div className={`workspace ${!railOpen ? 'rail-collapsed' : ''}`}><aside className={`rail ${drawerOpen ? 'drawer-open' : ''}`}><NavItems current="/" navigate={(path) => { navigate(path); setDrawerOpen(false); }} /></aside>{drawerOpen && <button className="drawer-scrim" aria-label="Закрити меню" onClick={() => setDrawerOpen(false)} />}
      <main className="main"><div className="page-heading"><div><div className="eyebrow"><span /> РОБОЧА ЧЕРГА ПРОДАЖІВ</div><h1>Клієнти <small data-testid="text-company-count">{summaryQuery.data?.totalCompanies ?? companies.length} компаній</small></h1></div><button data-testid="button-new-company" className="primary-button" onClick={() => open('company')}><Plus size={16} /> <span>Нова компанія</span></button></div>
        <div className="summary-strip">{summaryQuery.isLoading ? <><Skeleton /><Skeleton /><Skeleton /><Skeleton /></> : summaryQuery.isError ? <div className="summary-error">Не вдалося завантажити підсумок <button onClick={() => summaryQuery.refetch()}>Повторити</button></div> : <><div><span>КОМПАНІЇ</span><b data-testid="summary-companies">{summaryQuery.data?.totalCompanies ?? 0}</b></div><div><span>АКТИВНІ ЗАМОВЛЕННЯ</span><b data-testid="summary-orders">{summaryQuery.data?.activeOrders ?? 0}</b></div><div><span>ВОРОНКА</span><b data-testid="summary-pipeline">{money(summaryQuery.data?.pipelineValueUah ?? 0)}</b></div><div className="summary-alert"><span>ПРОСТРОЧЕНІ ЗАВДАННЯ</span><b data-testid="summary-overdue">{summaryQuery.data?.overdueTasks ?? 0}</b></div></>}</div>
         <div className="crm-shell"><section className="queue"><div className="queue-head"><div><h2>Черга клієнтів</h2><p>Компанії та активні замовлення</p></div><button data-testid="button-sort-companies" className="icon-button" onClick={() => setSortNewest((value) => !value)}><ArrowDownUp size={15} /></button><div className="search-wrap"><Search size={15} /><input data-testid="input-company-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Назва, код або місто" /></div><div className="filter-row">{filters.map((item) => <button data-testid={`filter-${item.value}`} key={item.value} className={filter === item.value ? 'selected' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div></div><div className="queue-labels"><span>КОМПАНІЯ / ТИП</span><span>ЕТАП / СУМА</span></div><div className="company-list bb-scroll">{companiesQuery.isLoading ? <>{[1, 2, 3, 4].map((item) => <div key={item} className="company-skeleton"><Skeleton /><Skeleton /><Skeleton /></div>)}</> : companiesQuery.isError ? <div className="empty-state"><CircleAlert size={22} /><b>Не вдалося завантажити компанії</b><button onClick={() => companiesQuery.refetch()}>Повторити</button></div> : sorted.length ? sorted.map((company) => <CompanyRow key={company.id} company={company} active={company.id === activeId} select={() => { setSelectedId(company.id); localStorage.setItem('budbox-selected-company', String(company.id)); setTab('Огляд'); }} />) : companies.length === 0 && !query && filter === GetCompaniesFilter.all ? <div className="empty-state"><UsersRound size={24} /><b>Компаній ще немає</b><span>Створіть першу компанію, щоб почати вести клієнтів.</span><button data-testid="button-create-first-company" onClick={() => open('company')}>Створити компанію</button></div> : <div className="empty-state"><Search size={23} /><b>Нічого не знайдено</b><span>Змініть пошук або фільтр</span><button onClick={() => { setQuery(''); setFilter(GetCompaniesFilter.all); }}>Скинути фільтри</button></div>}</div><div className="queue-foot"><span>Показано {sorted.length} із {companies.length}</span><button onClick={() => { setQuery(''); setFilter(GetCompaniesFilter.all); }}>Скинути</button></div></section>
          <section className="profile-pane bb-scroll">{!activeId ? <div className="profile-empty"><Building2 size={32} /><h2>Оберіть компанію</h2><p>Профіль клієнта з’явиться тут після вибору в черзі.</p></div> : detailQuery.isLoading ? <div className="loading-profile"><Skeleton className="wide" /><Skeleton className="hero-skeleton" /><Skeleton className="wide" /></div> : detailQuery.isError || !detail ? <div className="empty-state"><CircleAlert size={22} /><b>Профіль недоступний</b><button onClick={() => detailQuery.refetch()}>Повторити</button></div> : <div className="profile-content bb-enter"><div className="profile-header"><div className="profile-breadcrumb">КЛІЄНТИ <ChevronRight size={12} /> {detail.name}</div><div className="profile-main"><div className="company-icon"><Building2 size={23} /></div><div className="company-title"><div><h2 data-testid={`text-company-${detail.id}`}>{detail.name}</h2><span className="badge type-badge">{detail.customerType}</span></div><div className="company-meta"><button data-testid="button-copy-tax-id" onClick={() => copy(detail.taxId, 'Код')}><ShieldCheck size={13} /> {detail.taxId || 'Код не вказано'} <Copy size={11} /></button><span><MapPin size={13} />{detail.city || 'Місто не вказано'}</span><span className="source-chip">Джерело: {detail.source || 'Не вказано'}</span></div></div><div className="profile-buttons"><button data-testid="button-add-note" className="secondary-button" onClick={() => open('note')}><FileText size={14} /> Нотатка</button><button data-testid="button-add-task" className="secondary-button" onClick={() => open('task')}><Plus size={14} /> Завдання</button><button data-testid="button-edit-company" className="primary-button small" onClick={() => open('edit', companyForm)}><Edit3 size={14} /> Редагувати</button></div></div><div className="tabs">{(['Огляд', 'Історія', 'Контакти', 'Замовлення'] as const).map((item) => <button data-testid={`tab-${item}`} key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Історія' && <em>{detail.activity.length}</em>}{item === 'Контакти' && <em>{detail.contacts.length}</em>}</button>)}</div></div>{tab === 'Огляд' ? <Overview detail={detail} open={open} completeTask={completeTask} editOrder={editOrder} editCompany={() => open('edit', companyForm)} copy={copy} flash={flash} /> : tab === 'Історія' ? <ActivityTab detail={detail} open={open} /> : tab === 'Контакти' ? <ContactsTab detail={detail} open={open} /> : <OrdersTab detail={detail} open={open} editOrder={editOrder} />}</div>}</section></div></main></div>
    {notice && <div className={`notice ${notice.kind}`} data-testid="status-notice"><Check size={15} /> {notice.text}</div>}
    {showCompanyModal && <Modal title={title} subtitle="Дані будуть збережені у CRM через API" close={close}><CompanyForm form={form} setValue={setValue} onSubmit={() => submitCompany(modal === 'edit')} busy={busy} edit={modal === 'edit'} /></Modal>}
    {modal === 'contact' && <Modal title={title} subtitle={`Новий контакт для ${selected?.name ?? 'компанії'}`} close={close}><ContactForm form={form} setValue={setValue} onSubmit={submitContact} busy={busy} /></Modal>}
    {modal === 'order' && <Modal title={title} subtitle="Вкажіть етап, суму та ручні дані доставки" close={close}><OrderForm form={form} setValue={setValue} onSubmit={submitOrder} busy={busy} /></Modal>}
    {modal === 'task' && <Modal title={title} subtitle={`Нагадування для ${selected?.name ?? 'компанії'}`} close={close}><TaskForm form={form} setValue={setValue} onSubmit={submitTask} busy={busy} /></Modal>}
    {modal === 'note' && <Modal title={title} subtitle="Запис з’явиться в історії активності клієнта" close={close}><NoteForm form={form} setValue={setValue} onSubmit={submitNote} busy={busy} /></Modal>}
  </div>;
}

const navigation = [
  { path: '/overview', label: 'Огляд', icon: LayoutDashboard, id: 'nav-overview' },
  { path: '/', label: 'Клієнти', icon: UsersRound, id: 'nav-clients' },
  { path: '/tasks', label: 'Завдання', icon: ClipboardList, id: 'nav-tasks' },
  { path: '/orders', label: 'Замовлення', icon: Package, id: 'nav-orders' },
  { path: '/activity', label: 'Активність', icon: Activity, id: 'nav-activity' },
  { path: '/support', label: 'Довідка', icon: MessageCircle, id: 'nav-support' },
];
function NavItems({ current, navigate }: { current: string; navigate?: (path: string) => void }) {
  return <>{navigation.map(({ path, label, icon: Icon, id }) => <Link key={path} href={path} aria-label={label} title={label} data-testid={id} className={`nav-link ${current === path ? 'active' : ''}`} onClick={() => navigate?.(path)}><Icon size={18} /><span>{label}</span></Link>)}</>;
}

function GlobalPage({ page }: { page: 'overview' | 'tasks' | 'orders' | 'activity' | 'support' }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [railOpen, setRailOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const summary = useGetCrmSummary();
  const tasks = useGetCrmTasks();
  const orders = useGetCrmOrders();
  const activity = useGetCrmActivity();
  const companiesQuery = useGetCompanies({ filter: GetCompaniesFilter.all });
  const createTask = useCreateTask();
  const createOrder = useCreateOrder();
  const createNote = useCreateNote();
  const updateTask = useUpdateTask();
  const updateOrder = useUpdateOrder();
  const [formKind, setFormKind] = useState<'task' | 'order' | 'note' | null>(null);
  const [form, setForm] = useState<{ companyId: string; title: string; details: string; dueAt: string; assignee: string; code: string; stage: DealStage; amountUah: string; ttn: string; deliveryStatus: string }>({ companyId: '', title: '', details: '', dueAt: '', assignee: 'Олена Кравчук', code: '', stage: stages[0], amountUah: '', ttn: '', deliveryStatus: '' });
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<'notifications' | 'settings' | 'profile' | null>(null);
  const [compact, setCompact] = useState(() => localStorage.getItem('budbox-compact') === 'true');
  const companies = companiesQuery.data ?? [];
  const taskRows = tasks.data ?? [];
  const orderRows = orders.data ?? [];
  const activityRows = activity.data ?? [];
  const titleMap = { overview: 'Огляд продажів', tasks: 'Завдання', orders: 'Замовлення', activity: 'Активність', support: 'Довідка' };
  const refresh = async (companyId?: number) => Promise.all([
    qc.invalidateQueries({ queryKey: getGetCrmSummaryQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCrmTasksQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCrmOrdersQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCrmActivityQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCompaniesQueryKey() }),
    ...(companyId ? [qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) })] : []),
  ]);
  const toggleTask = (task: TaskBoardItem) => updateTask.mutate({ taskId: task.id, data: { isCompleted: !task.isCompleted } }, {
    onSuccess: () => { void refresh(task.companyId); setNotice(task.isCompleted ? 'Завдання повернуто в роботу' : 'Завдання виконано'); },
    onError: () => setNotice('Не вдалося оновити завдання'),
  });
  const saveOrder = (orderId: number, companyId: number, data: { stage?: DealStage; ttn?: string | null; deliveryStatus?: string | null }) => updateOrder.mutate({ orderId, data }, {
    onSuccess: () => { void refresh(companyId); setNotice('Замовлення оновлено'); },
    onError: () => setNotice('Не вдалося оновити замовлення'),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const companyId = Number(form.companyId);
    if (!companyId) { setNotice('Спочатку оберіть компанію'); return; }
    if (formKind === 'task') {
      if (!form.title.trim()) return;
      createTask.mutate({ companyId, data: { title: form.title.trim(), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, assignee: form.assignee.trim() || 'Олена Кравчук' } }, {
        onSuccess: () => { void refresh(companyId); setFormKind(null); setNotice('Завдання створено'); },
        onError: () => setNotice('Не вдалося створити завдання'),
      });
    } else if (formKind === 'order') {
      if (!form.amountUah) return;
      createOrder.mutate({ companyId, data: { code: form.code || null, stage: form.stage as OrderInput['stage'], amountUah: Number(form.amountUah), ttn: form.ttn || null, deliveryStatus: form.deliveryStatus || null } }, {
        onSuccess: () => { void refresh(companyId); setFormKind(null); setNotice('Замовлення створено'); },
        onError: () => setNotice('Не вдалося створити замовлення'),
      });
    } else if (formKind === 'note') {
      if (!form.title.trim()) return;
      createNote.mutate({ companyId, data: { title: form.title.trim(), details: form.details.trim() || null, createdBy: 'Олена Кравчук' } }, {
        onSuccess: () => { void refresh(companyId); setFormKind(null); setNotice('Запис додано до активності'); },
        onError: () => setNotice('Не вдалося додати запис'),
      });
    }
  };
  const openForm = (kind: 'task' | 'order' | 'note') => {
    if (!companies.length) {
      sessionStorage.setItem('budbox-open-company', 'true');
      navigate('/');
      return;
    }
    setForm({ companyId: '', title: '', details: '', dueAt: '', assignee: 'Олена Кравчук', code: '', stage: stages[0], amountUah: '', ttn: '', deliveryStatus: '' });
    setFormKind(kind);
  };
  const overdueRows = taskRows.filter((task) => !task.isCompleted && task.dueAt && new Date(task.dueAt) < new Date());
  const setDensity = () => { const next = !compact; setCompact(next); localStorage.setItem('budbox-compact', String(next)); document.documentElement.classList.toggle('bb-compact', next); };
  useEffect(() => { document.documentElement.classList.toggle('bb-compact', compact); }, [compact]);
  const pageTitle = titleMap[page];
  const errorForPage = page === 'tasks' ? tasks.isError : page === 'orders' ? orders.isError : page === 'activity' ? activity.isError : page === 'overview' ? summary.isError || tasks.isError || orders.isError || activity.isError : false;
  const loadingForPage = page === 'tasks' ? tasks.isLoading : page === 'orders' ? orders.isLoading : page === 'activity' ? activity.isLoading : page === 'overview' ? summary.isLoading || tasks.isLoading || orders.isLoading || activity.isLoading : false;
  return <div className="bb-app global-app">
    <header className="topbar"><button data-testid="button-hamburger" className="icon-button hamburger" aria-label="Перемкнути навігацію" aria-expanded={window.innerWidth < 768 ? drawerOpen : railOpen} onClick={() => { if (window.innerWidth < 768) setDrawerOpen(!drawerOpen); else setRailOpen(!railOpen); }}><Menu size={19} /></button><div className="brand"><div className="brand-mark">B</div><div><strong>BUDBOX</strong><small>CRM / ПРОДАЖІ</small></div></div><div className="crumbs"><span>Продажі</span><ChevronRight size={13} /><b>{pageTitle}</b></div><div className="top-actions"><button aria-label="Сповіщення" aria-expanded={panel === 'notifications'} className="icon-button" data-testid="button-notifications" onClick={() => setPanel(panel === 'notifications' ? null : 'notifications')}><Bell size={17} />{overdueRows.length > 0 && <i />}</button><button aria-label="Налаштування" aria-expanded={panel === 'settings'} className="icon-button" data-testid="button-settings" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Settings2 size={17} /></button><button aria-label="Профіль і параметри" aria-expanded={panel === 'profile'} className="profile profile-trigger" data-testid="button-profile-menu" onClick={() => setPanel(panel === 'profile' ? null : 'profile')}><span>ОК</span><div><b>Олена Кравчук</b><small>Менеджерка</small></div><ChevronDown size={14} /></button></div>
      {panel && <div className="header-popover" data-testid={`panel-${panel}`}><div className="popover-title">{panel === 'notifications' ? 'Потребують уваги' : panel === 'settings' ? 'Налаштування вигляду' : 'Робочий профіль'}<button className="icon-button" onClick={() => setPanel(null)}><X size={14} /></button></div>{panel === 'notifications' ? tasks.isLoading ? <p>Завантаження завдань…</p> : tasks.isError ? <p>Не вдалося завантажити сповіщення.</p> : overdueRows.length ? overdueRows.slice(0, 5).map((task) => <button className="popover-row" key={task.id} onClick={() => { setPanel(null); navigate('/tasks'); }}><CircleAlert size={14} /><span><b>{task.title}</b><small>{task.companyName} · {date(task.dueAt)}</small></span></button>) : <p>Прострочених завдань немає.</p> : panel === 'settings' ? <label className="density-control"><span><b>Компактний список</b><small>Менше вертикальних відступів у списках</small></span><input data-testid="toggle-compact-density" type="checkbox" checked={compact} onChange={setDensity} /></label> : <><p>Олена Кравчук · менеджерка продажів</p><button className="popover-row" onClick={() => setPanel('settings')}><SlidersHorizontal size={14} /><span><b>Налаштування вигляду</b><small>Зберігаються локально у цьому браузері</small></span></button></>}</div>}
    </header>
    <div className={`workspace ${railOpen ? '' : 'rail-collapsed'}`}><aside className={`rail ${drawerOpen ? 'drawer-open' : ''}`}><NavItems current={page === 'overview' ? '/overview' : `/${page}`} navigate={() => setDrawerOpen(false)} /></aside>{drawerOpen && <button className="drawer-scrim" aria-label="Закрити меню" onClick={() => setDrawerOpen(false)} />}
        <main className="main global-main"><div className="page-heading"><div><div className="eyebrow"><span /> РОБОЧИЙ ПРОСТІР ПРОДАЖІВ</div><h1 data-testid="text-page-title">{pageTitle}</h1></div>{page === 'tasks' ? <button data-testid="button-new-task" className="primary-button" onClick={() => openForm('task')}><Plus size={15} /> Нове завдання</button> : page === 'orders' ? <button data-testid="button-new-order" className="primary-button" onClick={() => openForm('order')}><Plus size={15} /> Нове замовлення</button> : page === 'activity' ? <button data-testid="button-new-activity" className="primary-button" onClick={() => openForm('note')}><Plus size={15} /> Додати запис</button> : null}</div>
        {loadingForPage ? <div className="global-loading" data-testid="state-loading">{[1, 2, 3].map((n) => <div className="global-skeleton" key={n}><Skeleton /><Skeleton /><Skeleton /></div>)}</div> : errorForPage ? <div className="empty-state large" data-testid="state-error"><CircleAlert size={26} /><b>Дані тимчасово недоступні</b><span>Перевірте з’єднання та спробуйте ще раз.</span><button data-testid="button-retry-page" onClick={() => { void summary.refetch(); void tasks.refetch(); void orders.refetch(); void activity.refetch(); }}>Повторити</button></div> : null}
        {!loadingForPage && !errorForPage && page === 'overview' && <><div className="summary-strip">{[['КОМПАНІЇ', summary.data?.totalCompanies ?? 0], ['АКТИВНІ ЗАМОВЛЕННЯ', summary.data?.activeOrders ?? 0], ['ВОРОНКА', money(summary.data?.pipelineValueUah ?? 0)], ['ПРОСТРОЧЕНІ ЗАВДАННЯ', summary.data?.overdueTasks ?? 0]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b data-testid={`overview-metric-${String(label).toLowerCase().replaceAll(' ', '-')}`}>{value}</b></div>)}</div><div className="global-grid"><section className="data-card"><SectionHeader icon={ClipboardList} title="Найближчі завдання" subtitle="Незавершені нагадування команди" action={<Link className="text-button" href="/tasks">Усі завдання</Link>} />{taskRows.filter((task) => !task.isCompleted).slice(0, 6).map((task) => <TaskLine task={task} toggle={toggleTask} key={task.id} />)}{!taskRows.filter((task) => !task.isCompleted).length && <EmptyPanel label="Незавершених завдань поки немає." />}</section><section className="data-card"><SectionHeader icon={History} title="Останні записи" subtitle="Нещодавні дії у клієнтських картках" action={<Link className="text-button" href="/activity">Уся активність</Link>} />{activityRows.slice(0, 6).map((item) => <ActivityBoardLine item={item} key={item.id} onCompany={(companyId) => { localStorage.setItem('budbox-selected-company', String(companyId)); navigate('/'); }} />)}{!activityRows.length && <EmptyPanel label="Активність з’явиться після записів у CRM." />}</section></div></>}
        {!loadingForPage && !errorForPage && page === 'tasks' && <section className="data-card global-table"><div className="table-head"><span>ЗАВДАННЯ / КОМПАНІЯ</span><span>ВІДПОВІДАЛЬНА</span><span>ТЕРМІН</span><span>СТАН</span></div>{taskRows.map((task) => <TaskLine task={task} toggle={toggleTask} key={task.id} />)}{!taskRows.length && <EmptyPanel label="Завдань ще немає. Створіть завдання та оберіть компанію." action={<button className="secondary-button" onClick={() => openForm('task')}>Створити завдання</button>} />}</section>}
        {!loadingForPage && !errorForPage && page === 'orders' && <section className="data-card global-table"><div className="table-head order-table-head"><span>ЗАМОВЛЕННЯ / КОМПАНІЯ</span><span>ЕТАП</span><span>СУМА</span><span>ТТН / РУЧНИЙ СТАТУС</span></div>{orderRows.map((order) => <OrderLine order={order} save={saveOrder} key={order.id} />)}{!orderRows.length && <EmptyPanel label="Замовлень ще немає. Створіть замовлення для компанії." action={<button className="secondary-button" onClick={() => openForm('order')}>Створити замовлення</button>} />}</section>}
        {!loadingForPage && !errorForPage && page === 'activity' && <section className="data-card global-table"><div className="timeline global-timeline">{activityRows.map((item) => <ActivityBoardLine item={item} key={item.id} onCompany={(companyId) => { localStorage.setItem('budbox-selected-company', String(companyId)); navigate('/'); }} />)}</div>{!activityRows.length && <EmptyPanel label="Записів активності поки немає." action={<button className="secondary-button" data-testid="button-add-first-activity" onClick={() => openForm('note')}>Додати запис</button>} />}</section>}
        {page === 'support' && <div className="support-layout"><section className="data-card support-intro"><span className="support-kicker">BUDBOX · ПРОДАЖІ</span><h2>Робота з клієнтами — без зайвих кроків.</h2><p>Цей простір допомагає команді вести компанії, контакти, завдання, замовлення та домовленості в одному місці.</p></section><section className="data-card help-card"><h3>Компанії та контакти</h3><p>Додавайте компанії в чергу, фіксуйте відповідальну менеджерку, місто, умови співпраці та контакти. Детальна картка зберігає історію взаємодій.</p></section><section className="data-card help-card"><h3>Завдання</h3><p>Створюйте нагадування для конкретної компанії, задавайте термін і відповідальну особу. Позначайте виконання у списку завдань або картці клієнта.</p></section><section className="data-card help-card"><h3>Замовлення та доставка</h3><p>Етап замовлення, номер ТТН і статус доставки вводяться та оновлюються вручну. Інтеграції з Новою поштою, автоматичного створення ТТН або live-відстеження немає.</p><small>Поточний статус доставки — це нотатка команди, а не дані перевізника.</small></section><section className="data-card help-card"><h3>Налаштування</h3><p>Компактність списків зберігається локально у вашому браузері. Дані клієнтів і робочі записи завантажуються з CRM API.</p></section></div>}
      </main>
    </div>
    {notice && <button className="notice success" data-testid="status-notice" onClick={() => setNotice('')}><Check size={15} /> {notice}</button>}
    {formKind && <Modal title={formKind === 'task' ? 'Нове завдання' : formKind === 'order' ? 'Нове замовлення' : 'Новий запис активності'} subtitle={formKind === 'task' ? 'Оберіть компанію для нагадування' : formKind === 'order' ? 'Доставка ведеться вручну — без live-відстеження' : 'Зафіксуйте нотатку в історії вибраної компанії'} close={() => setFormKind(null)}><form className="form-grid" onSubmit={submit}><Field label="Компанія" wide><select data-testid="select-global-company" required value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })}><option value="">Оберіть компанію</option>{companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></Field>{formKind === 'task' ? <><Field label="Що потрібно зробити?" wide><input data-testid="input-global-task-title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field label="Термін"><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field><Field label="Відповідальна"><input value={form.assignee} onChange={(event) => setForm({ ...form, assignee: event.target.value })} /></Field></> : formKind === 'order' ? <><Field label="Код замовлення"><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field><Field label="Етап"><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value as DealStage })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></Field><Field label="Сума, ₴"><input type="number" min="0" required value={form.amountUah} onChange={(event) => setForm({ ...form, amountUah: event.target.value })} /></Field><Field label="ТТН вручну"><input value={form.ttn} onChange={(event) => setForm({ ...form, ttn: event.target.value })} /></Field><Field label="Статус доставки (вручну)" wide><input value={form.deliveryStatus} onChange={(event) => setForm({ ...form, deliveryStatus: event.target.value })} /></Field></> : <><Field label="Заголовок" wide><input data-testid="input-global-activity-title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field label="Деталі" wide><textarea data-testid="input-global-activity-details" rows={4} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></Field></>}<div className="form-actions"><button className="primary-button" data-testid="button-submit-global" disabled={createTask.isPending || createOrder.isPending || createNote.isPending}>{createTask.isPending || createOrder.isPending || createNote.isPending ? 'Збереження…' : 'Зберегти'}</button></div></form></Modal>}
  </div>;
}
function TaskLine({ task, toggle }: { task: TaskBoardItem; toggle: (task: TaskBoardItem) => void }) {
  const overdue = !task.isCompleted && task.dueAt && new Date(task.dueAt) < new Date();
  return <div className={`global-row task-global-row ${task.isCompleted ? 'completed' : ''}`} data-testid={`row-task-${task.id}`}><div className="global-primary"><button className={`check-button ${task.isCompleted ? 'checked' : ''}`} data-testid={`button-toggle-task-${task.id}`} aria-label={task.isCompleted ? 'Повернути в роботу' : 'Позначити виконаним'} onClick={() => toggle(task)}><Check size={14} /></button><span><b>{task.title}</b><small>{task.companyName}</small></span></div><span className="global-secondary">{task.assignee}</span><span className={`global-secondary ${overdue ? 'overdue' : ''}`}>{date(task.dueAt)}</span><span className={`badge ${task.isCompleted ? 'tone-success' : overdue ? 'tone-warm' : 'tone-primary'}`}>{task.isCompleted ? 'Виконано' : overdue ? 'Прострочено' : 'У роботі'}</span></div>;
}
function OrderLine({ order, save }: { order: OrderBoardItem; save: (id: number, companyId: number, data: { stage?: DealStage; ttn?: string | null; deliveryStatus?: string | null }) => void }) {
  return <div className="global-row order-global-row" data-testid={`row-order-${order.id}`}><div className="global-primary"><span className="order-code">{order.code}</span><span><b>{order.companyName}</b><small>{date(order.createdAt)}</small></span></div><select aria-label={`Етап ${order.code}`} data-testid={`select-order-stage-${order.id}`} value={order.stage} onChange={(event) => save(order.id, order.companyId, { stage: event.target.value as DealStage })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select><b className="global-amount">{money(order.amountUah)}</b><div className="delivery-edit"><input aria-label={`ТТН ${order.code}`} data-testid={`input-order-ttn-${order.id}`} defaultValue={order.ttn ?? ''} placeholder="ТТН" onBlur={(event) => event.target.value !== (order.ttn ?? '') && save(order.id, order.companyId, { ttn: event.target.value || null })} /><input aria-label={`Статус доставки ${order.code}`} data-testid={`input-order-delivery-${order.id}`} defaultValue={order.deliveryStatus ?? ''} placeholder="Статус вручну" onBlur={(event) => event.target.value !== (order.deliveryStatus ?? '') && save(order.id, order.companyId, { deliveryStatus: event.target.value || null })} /></div></div>;
}
function ActivityBoardLine({ item, onCompany }: { item: ActivityBoardItem; onCompany: (companyId: number) => void }) {
  return <div className="activity-item global-activity-item" data-testid={`activity-record-${item.id}`}><span className="activity-dot"><Activity size={11} /></span><div><div className="activity-title"><b>{item.title}</b><time>{date(item.createdAt)}</time></div><button className="activity-company-link" data-testid={`button-company-activity-${item.id}`} onClick={() => onCompany(item.companyId)}>{item.companyName} · {item.kind}</button><p>{item.details || 'Без додаткових деталей'}</p><small>{item.createdBy}</small></div></div>;
}
function EmptyPanel({ label, action }: { label: string; action?: ReactNode }) { return <div className="global-empty" data-testid="state-empty"><span className="empty-mark"><ClipboardList size={20} /></span><b>{label}</b>{action}</div>; }

function CompanyRow({ company, active, select }: { company: CompanyListItem; active: boolean; select: () => void }) {
  return <button data-testid={`row-company-${company.id}`} className={`company-row ${active ? 'active' : ''}`} onClick={select}><div className="row-top"><div><strong>{company.name}</strong><div className="row-meta"><span className="badge type-badge">{company.customerType}</span><span>{company.city || 'Місто не вказано'}</span></div></div><div className="row-amount">{company.activeOrder ? money(company.activeOrder.amountUah) : '—'}<span className={`badge ${company.activeOrder ? stageTone(company.activeOrder.stage) : 'tone-neutral'}`}>{company.activeOrder?.stage || 'Без замовлення'}</span></div></div><div className="row-foot"><span><UserRound size={11} />{company.manager}</span><span className={company.overdue ? 'overdue' : ''}>{company.overdue && <CircleAlert size={11} />}{company.overdue ? 'Прострочено' : company.nextTask?.title || 'Немає наступного завдання'}</span></div></button>;
}
function SectionHeader({ icon: Icon, title, subtitle, action }: { icon: ElementType; title: string; subtitle: string; action?: ReactNode }) { return <div className="section-header"><div className="section-icon"><Icon size={15} /></div><div><h3>{title}</h3><p>{subtitle}</p></div>{action && <div className="section-action">{action}</div>}</div>; }
function Overview({ detail, open, completeTask, editOrder, editCompany, copy, flash }: { detail: CompanyDetail; open: (kind: ModalKind, values?: Record<string, string>) => void; completeTask: (id: number, completed: boolean) => void; editOrder: (id: number, data: { stage?: DealStage; ttn?: string | null; deliveryStatus?: string | null }) => void; editCompany: () => void; copy: (value: string | null | undefined, label: string) => void; flash: (text: string, kind?: Notice['kind']) => void }) {
  const order = detail.orders[0];
  const task = detail.tasks.find((item) => !item.isCompleted) ?? detail.tasks[0];
  return <div className="overview-grid"><div className="overview-main"><div className="data-card"><SectionHeader icon={ShoppingBagIcon} title="Активне замовлення" subtitle={order?.code || 'Замовлень поки немає'} action={order && <select data-testid="select-order-stage" value={order.stage} onChange={(event) => editOrder(order.id, { stage: event.target.value as DealStage })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>} />{order ? <><div className="order-body"><div><span className="label">СУМА ЗАМОВЛЕННЯ</span><strong className="big-money">{money(order.amountUah)}</strong><div className="delivery-box"><Truck size={16} /><div><b>Доставка</b><span>{order.deliveryStatus || 'Статус не вказано'}</span><button onClick={() => copy(order.ttn, 'ТТН')}>ТТН: {order.ttn || 'Не вказано'} <Copy size={11} /></button></div></div></div><div className="order-side"><span className="label">МЕНЕДЖЕР</span><div className="manager"><b>{initials(detail.manager)}</b>{detail.manager}</div><span className="label">СКЛАД</span><span className="muted"><Package size={13} /> {detail.warehouse || 'Не вказано'}</span></div></div><div className="stage-line">{stages.map((stage, index) => <div key={stage} className={`stage-node ${index <= stages.indexOf(order.stage) ? 'done' : ''}`} title={stage}><i />{index < stages.length - 1 && <span />}</div>)}</div><div className="stage-caption"><span>Новий лід</span><span>Успішно реалізовано</span></div></> : <div className="empty-card"><Package size={24} /><span>У клієнта ще немає замовлень.</span><button data-testid="button-create-order-empty" className="secondary-button" onClick={() => open('order')}><Plus size={14} /> Створити замовлення</button></div>}</div>
    <div className="data-card"><SectionHeader icon={CalendarClock} title="Наступна дія" subtitle="Нагадування для менеджерки" action={<button data-testid="button-add-task-inline" className="icon-button" onClick={() => open('task')}><Plus size={15} /></button>} />{task ? <div className={`task-row ${task.isCompleted ? 'completed' : ''}`}><span className="task-dot" /><div><b>{task.title}</b><p><ClockIcon size={12} />{date(task.dueAt)} · {task.assignee}</p></div><button data-testid={`button-complete-task-${task.id}`} className="check-button" onClick={() => completeTask(task.id, task.isCompleted)}><Check size={14} /></button></div> : <div className="empty-card compact"><ClipboardList size={21} /><span>Немає відкритих завдань.</span></div>}</div>
    <div className="data-card"><SectionHeader icon={Wallet} title="Умови співпраці" subtitle="Фінансові параметри клієнта" action={<button data-testid="button-edit-terms" className="text-button" onClick={editCompany}>Редагувати</button>} /><div className="terms-grid"><Term icon={CreditCard} label="Форма оплати" value={detail.paymentForm} /><Term icon={ShieldCheck} label="Кредит / відстрочка" value={`${money(detail.creditLimitUah)} · ${detail.paymentTermsDays} дн.`} /><Term icon={Tag} label="Особиста знижка" value={`${detail.discountPercent}%`} /><Term icon={Filter} label="Ціновий рівень" value={detail.priceTier || 'Не вказано'} /></div></div></div><div className="overview-side"><div className="data-card"><SectionHeader icon={UsersRound} title="Контактні особи" subtitle={`${detail.contacts.length} контакти компанії`} action={<button data-testid="button-view-contacts" className="text-button" onClick={() => open('contact')}>Додати</button>} />{detail.contacts.length ? <div className="contact-list">{detail.contacts.slice(0, 3).map((contact) => <ContactMini key={contact.id} contact={contact} copy={copy} flash={flash} />)}</div> : <div className="empty-card compact">Контактів ще немає.</div>}</div><div className="data-card"><SectionHeader icon={History} title="Остання активність" subtitle="Хронологія взаємодій" action={<button data-testid="button-view-history" className="text-button" onClick={() => open('note')}>Додати запис</button>} /><div className="activity-list">{detail.activity.slice(0, 5).map((item) => <ActivityItem key={item.id} item={item} />)}</div>{!detail.activity.length && <div className="empty-card compact">Історія поки порожня.</div>}</div></div></div>;
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
function Router() { return <RoutedErrorBoundary><Switch><Route path="/" component={CrmWorkspace} /><Route path="/overview"><GlobalPage page="overview" /></Route><Route path="/tasks"><GlobalPage page="tasks" /></Route><Route path="/orders"><GlobalPage page="orders" /></Route><Route path="/activity"><GlobalPage page="activity" /></Route><Route path="/support"><GlobalPage page="support" /></Route><Route component={NotFound} /></Switch></RoutedErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;