import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Copy,
  CreditCard,
  FileText,
  Filter,
  Headphones,
  History,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Tag,
  Truck,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";

type Stage =
  | "Новий лід"
  | "Уточнення деталей"
  | "Рахунок / передоплата"
  | "Зібрано на складі"
  | "Відправлено"
  | "Успішно реалізовано";

type Contact = {
  name: string;
  role: string;
  phone: string;
  email: string;
  initials: string;
};

type ActivityItem = {
  date: string;
  time: string;
  title: string;
  detail: string;
  kind: "call" | "order" | "note" | "delivery" | "task";
  owner: string;
};

type Company = {
  id: number;
  name: string;
  shortName: string;
  code: string;
  type: string;
  city: string;
  manager: string;
  managerInitials: string;
  warehouse: string;
  payment: string;
  credit: string;
  discount: string;
  tier: string;
  source: string;
  stage: Stage;
  amount: number;
  orderNo: string;
  ttn: string;
  delivery: string;
  nextTask: string;
  taskDate: string;
  overdue: boolean;
  contacts: Contact[];
  history: ActivityItem[];
};

const seedCompanies: Company[] = [
  {
    id: 1,
    name: "ТОВ «Моноліт Буд Груп»",
    shortName: "Моноліт Буд Груп",
    code: "ЄДРПОУ 43821657",
    type: "Будмайданчик",
    city: "Київ · Голосіївський р-н",
    manager: "Олена Кравчук",
    managerInitials: "ОК",
    warehouse: "Київ · Бориспільська",
    payment: "ПДВ",
    credit: "ліміт 180 000 ₴ · відстрочка 14 дн.",
    discount: "12%",
    tier: "Прайс «Будівельний»",
    source: "Рекомендація партнера",
    stage: "Відправлено",
    amount: 68450,
    orderNo: "ЗАМ-10482",
    ttn: "2045 0012 8471 56",
    delivery: "У дорозі · прибуття сьогодні",
    nextTask: "Уточнити приймання та потребу на 2-й поверх",
    taskDate: "Сьогодні, 10:30",
    overdue: true,
    contacts: [
      { name: "Андрій Мельник", role: "Виконроб", phone: "+380 67 418 29 51", email: "a.melnyk@monolitbud.ua", initials: "АМ" },
      { name: "Ірина Савчук", role: "Бухгалтерка", phone: "+380 50 772 14 06", email: "i.savchuk@monolitbud.ua", initials: "ІС" },
    ],
    history: [
      { date: "Сьогодні", time: "09:12", title: "Перевірено статус доставки", detail: "Нова пошта · ТТН 2045 0012 8471 56 · відправлення в дорозі", kind: "delivery", owner: "Олена Кравчук" },
      { date: "Вчора, 18 черв.", time: "16:48", title: "Замовлення передано перевізнику", detail: "ЗАМ-10482 · 68 450 ₴ · склад Бориспільська", kind: "order", owner: "Склад" },
      { date: "Вчора, 18 черв.", time: "11:20", title: "Узгоджено комплектацію", detail: "Арматура А500С, 12 мм — 1,2 т; доставка на об’єкт", kind: "call", owner: "Олена Кравчук" },
      { date: "17 черв., 2025", time: "15:05", title: "Створено замовлення ЗАМ-10482", detail: "Рахунок оплачено · погоджено особисту знижку 12%", kind: "order", owner: "Олена Кравчук" },
      { date: "12 черв., 2025", time: "10:14", title: "Нотатка після дзвінка", detail: "Завершують монолітний каркас. Наступна потреба — мурувальні суміші.", kind: "note", owner: "Олена Кравчук" },
    ],
  },
  {
    id: 2,
    name: "ФОП Петренко Дмитро Олегович",
    shortName: "ФОП Петренко Д. О.",
    code: "ІПН 3018841297",
    type: "Виконроб",
    city: "Бровари · Київська обл.",
    manager: "Тарас Бондар",
    managerInitials: "ТБ",
    warehouse: "Бровари · промзона",
    payment: "ФОП",
    credit: "ліміт 45 000 ₴ · без відстрочки",
    discount: "8%",
    tier: "Прайс «Профі»",
    source: "Вхідний дзвінок",
    stage: "Уточнення деталей",
    amount: 24800,
    orderNo: "ЗАМ-10501",
    ttn: "Не створено",
    delivery: "Очікує підтвердження",
    nextTask: "Надіслати перерахований кошторис",
    taskDate: "Сьогодні, 14:00",
    overdue: false,
    contacts: [
      { name: "Дмитро Петренко", role: "Виконроб · власник", phone: "+380 93 704 81 26", email: "d.petrenko@protonmail.com", initials: "ДП" },
    ],
    history: [
      { date: "Сьогодні", time: "08:35", title: "Заявка на матеріали", detail: "Уточнює наявність гіпсокартону та профілю для ремонту офісу", kind: "call", owner: "Тарас Бондар" },
      { date: "17 черв., 2025", time: "12:10", title: "Надіслано першу пропозицію", detail: "Кошторис на 24 800 ₴ · очікуємо підтвердження обсягів", kind: "note", owner: "Тарас Бондар" },
    ],
  },
  {
    id: 3,
    name: "ПП «Львівбуд Комплект»",
    shortName: "Львівбуд Комплект",
    code: "ЄДРПОУ 39572061",
    type: "Опт",
    city: "Львів · Сихів",
    manager: "Марія Гнатюк",
    managerInitials: "МГ",
    warehouse: "Львів · вул. Городоцька",
    payment: "ПДВ",
    credit: "ліміт 250 000 ₴ · відстрочка 21 дн.",
    discount: "15%",
    tier: "Прайс «Оптовий»",
    source: "Виставка InterBuild",
    stage: "Рахунок / передоплата",
    amount: 126780,
    orderNo: "ЗАМ-10496",
    ttn: "Не створено",
    delivery: "Після оплати",
    nextTask: "Перевірити надходження передоплати",
    taskDate: "Завтра, 09:00",
    overdue: false,
    contacts: [
      { name: "Роман Коваль", role: "Директор", phone: "+380 67 220 48 93", email: "office@lvivbudkomplekt.ua", initials: "РК" },
      { name: "Наталія Бойко", role: "Закупівельниця", phone: "+380 63 921 77 40", email: "n.boiko@lvivbudkomplekt.ua", initials: "НБ" },
    ],
    history: [
      { date: "Вчора, 18 черв.", time: "14:40", title: "Рахунок надіслано клієнту", detail: "Рахунок № РА-8714 · 126 780 ₴ · передоплата 50%", kind: "order", owner: "Марія Гнатюк" },
      { date: "16 черв., 2025", time: "10:02", title: "Підтверджено оптові ціни", detail: "Застосовано прайс «Оптовий» та знижку 15%", kind: "note", owner: "Марія Гнатюк" },
    ],
  },
  {
    id: 4,
    name: "ТОВ «Карпатський Дім»",
    shortName: "Карпатський Дім",
    code: "ЄДРПОУ 41295830",
    type: "Партнер",
    city: "Івано-Франківськ",
    manager: "Марія Гнатюк",
    managerInitials: "МГ",
    warehouse: "Івано-Франківськ · Калуське шосе",
    payment: "ПДВ",
    credit: "ліміт 90 000 ₴ · відстрочка 7 дн.",
    discount: "10%",
    tier: "Прайс «Партнерський»",
    source: "Сайт budbox.ua",
    stage: "Успішно реалізовано",
    amount: 41200,
    orderNo: "ЗАМ-10475",
    ttn: "2045 0012 8300 19",
    delivery: "Доставлено 17 червня",
    nextTask: "Запланувати повторне замовлення на липень",
    taskDate: "24 черв., 11:00",
    overdue: false,
    contacts: [
      { name: "Василь Яремчук", role: "Керівник закупівель", phone: "+380 50 318 08 67", email: "v.yaremchuk@karpatskydim.ua", initials: "ВЯ" },
    ],
    history: [
      { date: "17 черв., 2025", time: "13:26", title: "Замовлення успішно доставлено", detail: "ЗАМ-10475 · 41 200 ₴ · отримано на складі клієнта", kind: "delivery", owner: "Марія Гнатюк" },
      { date: "10 черв., 2025", time: "09:50", title: "Погоджено повторне замовлення", detail: "Сухі суміші та кріплення · сезонна закупівля", kind: "call", owner: "Марія Гнатюк" },
    ],
  },
  {
    id: 5,
    name: "ТОВ «Вектор Дистрибуція»",
    shortName: "Вектор Дистрибуція",
    code: "ЄДРПОУ 42760318",
    type: "Дропшипінг",
    city: "Дніпро · Центральний",
    manager: "Олена Кравчук",
    managerInitials: "ОК",
    warehouse: "Дніпро · Лівий берег",
    payment: "ПДВ",
    credit: "ліміт 120 000 ₴ · відстрочка 14 дн.",
    discount: "11%",
    tier: "Прайс «Дилерський»",
    source: "Холодний контакт",
    stage: "Зібрано на складі",
    amount: 95760,
    orderNo: "ЗАМ-10499",
    ttn: "2045 0012 8438 22",
    delivery: "Очікує забору перевізником",
    nextTask: "Погодити час забору Новою поштою",
    taskDate: "Сьогодні, 15:30",
    overdue: false,
    contacts: [
      { name: "Світлана Руденко", role: "Комерційна директорка", phone: "+380 95 447 20 31", email: "s.rudenko@vektor-d.com.ua", initials: "СР" },
      { name: "Олег Шевчук", role: "Логіст", phone: "+380 68 115 92 43", email: "logistics@vektor-d.com.ua", initials: "ОШ" },
    ],
    history: [
      { date: "Сьогодні", time: "09:40", title: "Комплектацію завершено", detail: "ЗАМ-10499 · 95 760 ₴ · 18 позицій зібрано", kind: "order", owner: "Склад" },
      { date: "Вчора, 18 черв.", time: "10:26", title: "Додано адресу відвантаження", detail: "Дніпро, вул. Маршала Малиновського, 12", kind: "note", owner: "Олена Кравчук" },
    ],
  },
];

const stages: Stage[] = [
  "Новий лід",
  "Уточнення деталей",
  "Рахунок / передоплата",
  "Зібрано на складі",
  "Відправлено",
  "Успішно реалізовано",
];

const stageStyles: Record<Stage, string> = {
  "Новий лід": "bg-[#f2eee5] text-[#846335]",
  "Уточнення деталей": "bg-[#edf2f5] text-[#587184]",
  "Рахунок / передоплата": "bg-[#f5f0df] text-[#8a7033]",
  "Зібрано на складі": "bg-[#e9f1ec] text-[#4d775c]",
  "Відправлено": "bg-[#e8eff1] text-[#426b76]",
  "Успішно реалізовано": "bg-[#e8f1e9] text-[#477351]",
};

const kindIcon = {
  call: MessageCircle,
  order: ShoppingBag,
  note: FileText,
  delivery: Truck,
  task: CheckCheck,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value) + " ₴";
}

export function BudboxCRM() {
  const [companies, setCompanies] = useState(seedCompanies);
  const [selectedId, setSelectedId] = useState(1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Усі клієнти");
  const [activeTab, setActiveTab] = useState("Огляд");
  const [modal, setModal] = useState<"company" | "task" | "note" | null>(null);
  const [modalText, setModalText] = useState("");
  const [notice, setNotice] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const [newCompanyName, setNewCompanyName] = useState("");

  const selected = companies.find((company) => company.id === selectedId) ?? companies[0];
  const visibleCompanies = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk");
    return companies.filter((company) => {
      const matchesQuery = !needle || `${company.name} ${company.code} ${company.city} ${company.type}`.toLocaleLowerCase("uk").includes(needle);
      const matchesFilter =
        filter === "Усі клієнти" ||
        (filter === "Мої клієнти" && company.manager === "Олена Кравчук") ||
        (filter === "Є завдання" && Boolean(company.nextTask)) ||
        (filter === "Прострочено" && company.overdue);
      return matchesQuery && matchesFilter;
    });
  }, [companies, filter, query]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const addActivity = (kind: "task" | "note") => {
    const text = modalText.trim();
    if (!text) return;
    setCompanies((current) =>
      current.map((company) =>
        company.id !== selected.id
          ? company
          : {
              ...company,
              nextTask: kind === "task" ? text : company.nextTask,
              taskDate: kind === "task" ? "Сьогодні, 16:00" : company.taskDate,
              overdue: false,
              history: [
                {
                  date: "Сьогодні",
                  time: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
                  title: kind === "task" ? "Створено нагадування" : "Додано нотатку",
                  detail: text,
                  kind,
                  owner: "Олена Кравчук",
                },
                ...company.history,
              ],
            },
      ),
    );
    setModal(null);
    setModalText("");
    flash(kind === "task" ? "Нагадування додано до картки" : "Нотатку збережено в історії");
  };

  const addCompany = () => {
    const name = newCompanyName.trim();
    if (!name) return;
    const newItem: Company = {
      ...seedCompanies[1],
      id: Date.now(),
      name,
      shortName: name.replace(/^ТОВ\s*«?/, "").replace(/»$/, ""),
      code: "ЄДРПОУ — уточнити",
      city: "Місто не вказано",
      stage: "Новий лід",
      amount: 0,
      orderNo: "Замовлень поки немає",
      nextTask: "Заповнити контактні дані компанії",
      taskDate: "Сьогодні, 16:00",
      overdue: false,
      history: [{ date: "Сьогодні", time: "Зараз", title: "Створено картку клієнта", detail: "Додано вручну до бази клієнтів", kind: "note", owner: "Олена Кравчук" }],
    };
    setCompanies((current) => [newItem, ...current]);
    setSelectedId(newItem.id);
    setNewCompanyName("");
    setModal(null);
    setActiveTab("Огляд");
    flash("Нову компанію додано до списку");
  };

  const cycleStage = () => {
    const currentIndex = stages.indexOf(selected.stage);
    const nextStage = stages[(currentIndex + 1) % stages.length];
    setCompanies((current) => current.map((company) => company.id === selected.id ? { ...company, stage: nextStage } : company));
    flash(`Етап замовлення змінено: ${nextStage}`);
  };

  const copyValue = (value: string, label: string) => {
    if (navigator.clipboard) void navigator.clipboard.writeText(value);
    flash(`${label} скопійовано`);
  };

  const tabs = [
    { label: "Огляд", icon: LayoutDashboard },
    { label: "Історія", icon: History, count: selected.history.length },
    { label: "Контакти", icon: UsersRound, count: selected.contacts.length },
    { label: "Замовлення", icon: Package },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#edf1ed] text-[#202d29] font-['DM_Sans']">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        .bb-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .bb-scroll::-webkit-scrollbar-thumb { background: #cbd4cd; border-radius: 8px; }
        .bb-scroll::-webkit-scrollbar-track { background: transparent; }
        .bb-fade { animation: bbFade .28s ease both; }
        @keyframes bbFade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        button { -webkit-tap-highlight-color: transparent; }
      `}</style>
      <div className="flex min-h-[100dvh] flex-col">
        <header className="z-10 flex h-[64px] shrink-0 items-center justify-between border-b border-[#dce3dc] bg-[#fafbf8] px-5 md:px-7">
          <div className="flex items-center gap-7">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#236450] text-[#f2f6ee] shadow-[0_3px_8px_rgba(35,100,80,.18)]">
                <span className="font-['Manrope'] text-[17px] font-extrabold tracking-[-1.5px]">B</span>
              </div>
              <div className="leading-none">
                <div className="font-['Manrope'] text-[14px] font-extrabold tracking-[.09em] text-[#214b3d]">BUDBOX</div>
                <div className="mt-1 text-[9px] font-bold tracking-[.19em] text-[#809087]">КЛІЄНТИ</div>
              </div>
            </div>
            <div className="hidden h-8 w-px bg-[#e1e6e0] md:block" />
            <div className="hidden items-center gap-2 text-[12px] text-[#6d7d74] md:flex">
              <span>Продажі</span><ChevronRight size={13} /><span className="font-semibold text-[#2d3d35]">Клієнти</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={() => flash("Усі нагадування переглянуто")} aria-label="Сповіщення" className="relative grid h-9 w-9 place-items-center rounded-lg text-[#68776f] hover:bg-[#eef2ed]"><Bell size={17} /><span className="absolute right-[7px] top-[6px] h-1.5 w-1.5 rounded-full bg-[#cf684f]" /></button>
            <button onClick={() => flash("Налаштування робочого простору")} className="grid h-9 w-9 place-items-center rounded-lg text-[#68776f] hover:bg-[#eef2ed]" aria-label="Налаштування"><Settings2 size={17} /></button>
            <div className="ml-1 flex items-center gap-2.5 border-l border-[#e1e6e0] pl-3">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e4ece4] text-[10px] font-bold text-[#3d6652]">ОК</div>
              <div className="hidden leading-tight sm:block"><div className="text-[11px] font-semibold">Олена Кравчук</div><div className="mt-0.5 text-[10px] text-[#849188]">Менеджерка</div></div>
              <ChevronDown size={13} className="text-[#8c9991]" />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[62px] shrink-0 flex-col items-center gap-2 border-r border-[#dce3dc] bg-[#f6f8f4] py-5 md:flex">
            {[
              { icon: LayoutDashboard, label: "Огляд" },
              { icon: UsersRound, label: "Клієнти", active: true },
              { icon: ClipboardList, label: "Завдання" },
              { icon: ShoppingBag, label: "Замовлення" },
              { icon: Activity, label: "Аналітика" },
            ].map(({ icon: Icon, label, active }) => (
              <button key={label} onClick={() => flash(`${label} — розділ робочого простору`)} title={label} className={`relative grid h-10 w-10 place-items-center rounded-xl transition-colors ${active ? "bg-[#deebe2] text-[#24614c]" : "text-[#849189] hover:bg-[#ebf0ea] hover:text-[#43584b]"}`}>
                {active && <span className="absolute -left-[11px] h-5 w-[3px] rounded-r bg-[#2c7557]" />}
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              </button>
            ))}
            <div className="mt-auto grid h-10 w-10 place-items-center rounded-xl text-[#849189]"><Headphones size={18} /></div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-5 md:px-7">
              <div>
                <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-[#829087]"><span className="h-1.5 w-1.5 rounded-full bg-[#5d9a74]" /> Робочий простір продажів</div>
                <h1 className="font-['Manrope'] text-[22px] font-extrabold tracking-[-.7px] text-[#25362e] md:text-[25px]">Клієнти <span className="ml-1 align-middle font-['DM_Sans'] text-[12px] font-medium tracking-normal text-[#8a978f]">{companies.length} компаній</span></h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 rounded-lg border border-[#dce4dc] bg-[#f8faf7] px-3 py-2 text-[11px] text-[#68786e] sm:flex"><CalendarClock size={14} className="text-[#688975]" /> Середа, 19 червня <ChevronDown size={13} /></div>
                <button onClick={() => { setNewCompanyName(""); setModal("company"); }} className="flex h-9 items-center gap-2 rounded-lg bg-[#236450] px-3.5 text-[11px] font-semibold text-white shadow-[0_2px_5px_rgba(35,100,80,.15)] transition hover:bg-[#1b5743]"><Plus size={15} /> <span className="hidden sm:inline">Нова компанія</span><span className="sm:hidden">Додати</span></button>
              </div>
            </div>
            <div className="mx-5 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#dce3dc] bg-[#f9faf7] shadow-[0_4px_18px_rgba(49,73,58,.035)] md:mx-7 md:mb-6 md:flex-row">
              <section className="flex w-full shrink-0 flex-col border-b border-[#e1e6e0] md:w-[328px] md:border-b-0 md:border-r lg:w-[362px] xl:w-[380px]">
                <div className="border-b border-[#e8ece7] px-4 pb-3 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div><h2 className="text-[13px] font-bold tracking-[-.2px]">Черга клієнтів</h2><p className="mt-1 text-[10px] text-[#89958d]">Компанії та активні замовлення</p></div>
                    <button onClick={() => setSortNewest((value) => !value)} className="grid h-8 w-8 place-items-center rounded-lg text-[#87938c] hover:bg-[#edf1ec]" title="Змінити сортування"><ArrowDownUp size={15} /></button>
                  </div>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#98a39c]" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Назва, код або місто" className="h-9 w-full rounded-lg border border-[#e1e7e0] bg-[#fff] pl-9 pr-3 text-[11px] text-[#32433a] outline-none placeholder:text-[#a1aaa4] focus:border-[#85aa91] focus:ring-2 focus:ring-[#e2eee4]" />
                  </div>
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                    {["Усі клієнти", "Мої клієнти", "Є завдання", "Прострочено"].map((item) => (
                      <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-md px-2 py-[5px] text-[9px] font-semibold transition ${filter === item ? "bg-[#e2ece4] text-[#35684d]" : "text-[#828f86] hover:bg-[#f0f3ef]"}`}>{item}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.11em] text-[#9aa49d]">
                  <span>Компанія / тип</span><span>Етап / сума</span>
                </div>
                <div className="bb-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                  {visibleCompanies.length ? (
                    [...visibleCompanies].sort((a, b) => sortNewest ? b.id - a.id : a.id - b.id).map((company) => {
                      const active = company.id === selected.id;
                      return (
                        <button key={company.id} onClick={() => { setSelectedId(company.id); setActiveTab("Огляд"); setShowAllHistory(false); }} className={`group mb-1 w-full rounded-[10px] border px-3 py-3 text-left transition-all ${active ? "border-[#c7d9ca] bg-[#edf4ed] shadow-[inset_3px_0_0_#397356]" : "border-transparent bg-transparent hover:border-[#e4e9e3] hover:bg-[#f6f8f5]"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[11px] font-bold text-[#33443a]">{company.shortName}</div>
                              <div className="mt-1.5 flex items-center gap-1.5"><span className="rounded bg-[#f0f2ed] px-1.5 py-[3px] text-[8px] font-semibold text-[#748178]">{company.type}</span><span className="truncate text-[9px] text-[#94a098]">{company.city.split(" · ")[0]}</span></div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[10px] font-bold tabular-nums text-[#39483f]">{formatMoney(company.amount)}</div>
                              <div className="mt-1.5 flex justify-end"><span className={`max-w-[132px] truncate rounded-full px-2 py-[3px] text-[8px] font-semibold ${stageStyles[company.stage]}`}>{company.stage}</span></div>
                            </div>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between border-t border-[#e6ebe5] pt-2">
                            <span className="flex items-center gap-1.5 text-[9px] text-[#89958d]"><UserRound size={11} />{company.manager.split(" ")[0]} {company.manager.split(" ")[1]?.[0]}.</span>
                            <span className={`flex items-center gap-1 text-[9px] ${company.overdue ? "font-semibold text-[#be5a4d]" : "text-[#8d9991]"}`}>{company.overdue && <CircleAlert size={11} />}{company.overdue ? "Прострочено" : company.nextTask.split(" ").slice(0, 3).join(" ")}</span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="mx-2 my-6 rounded-xl border border-dashed border-[#dce4dc] px-4 py-7 text-center">
                      <Search size={19} className="mx-auto text-[#a6b1a8]" /><p className="mt-2 text-[11px] font-semibold text-[#56675c]">Нічого не знайдено</p><p className="mt-1 text-[10px] text-[#96a199]">Змініть пошук або фільтр</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-[#e8ece7] px-4 py-3 text-[9px] text-[#8d9991]"><span>Показано {visibleCompanies.length} із {companies.length}</span><button onClick={() => { setQuery(""); setFilter("Усі клієнти"); }} className="font-semibold text-[#5d8068] hover:text-[#315b40]">Скинути фільтри</button></div>
              </section>

              <section className="bb-scroll min-h-[580px] min-w-0 flex-1 overflow-y-auto">
                <div className="bb-fade">
                  <div className="border-b border-[#e6ebe5] px-5 pb-4 pt-5 md:px-7">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[9px] text-[#89968e]"><span>Клієнти</span><ChevronRight size={11} /><span className="font-medium text-[#596a60]">{selected.shortName}</span></div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => copyValue(selected.code, "Код компанії")} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[9px] font-medium text-[#76847b] hover:bg-[#edf1ec]"><Copy size={12} /> Копіювати код</button>
                        <button onClick={() => flash("Додаткові дії картки клієнта")} className="grid h-7 w-7 place-items-center rounded-md text-[#78867d] hover:bg-[#edf1ec]" aria-label="Інші дії"><MoreHorizontal size={17} /></button>
                      </div>
                    </div>
                    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                      <div className="flex gap-3.5">
                        <div className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[13px] border border-[#d8e3d8] bg-[#e9f0e7] text-[#4a7458]"><Building2 size={20} strokeWidth={1.7} /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-['Manrope'] text-[18px] font-extrabold leading-tight tracking-[-.55px] text-[#27382f] md:text-[20px]">{selected.name}</h2>
                            <span className={`rounded-full px-2 py-1 text-[8px] font-bold tracking-[.02em] ${stageStyles[selected.stage]}`}>{selected.type}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#7e8c83]">
                            <button onClick={() => copyValue(selected.code.replace(/^(ЄДРПОУ|ІПН) /, ""), "Код")} className="flex items-center gap-1.5 hover:text-[#3f6f53]"><ShieldCheck size={12} className="text-[#73917a]" />{selected.code}<Copy size={10} className="opacity-50" /></button>
                            <span className="flex items-center gap-1.5"><MapPin size={12} />{selected.city}</span>
                            <span className="rounded bg-[#f0f3ef] px-1.5 py-0.5 text-[9px] font-medium text-[#708077]">Джерело: {selected.source}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button onClick={() => setModal("note")} className="flex h-8 items-center gap-1.5 rounded-lg border border-[#dfe5de] bg-[#fbfcfa] px-2.5 text-[10px] font-semibold text-[#62736a] hover:bg-[#f0f4ef]"><FileText size={13} /> Нотатка</button>
                        <button onClick={() => setModal("task")} className="flex h-8 items-center gap-1.5 rounded-lg border border-[#dfe5de] bg-[#fbfcfa] px-2.5 text-[10px] font-semibold text-[#62736a] hover:bg-[#f0f4ef]"><Plus size={13} /> Завдання</button>
                        <button onClick={() => flash("Редагування картки клієнта")} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#236450] px-3 text-[10px] font-semibold text-white hover:bg-[#1b5743]"><span className="hidden sm:inline">Редагувати</span><span className="sm:hidden">Змінити</span><ChevronDown size={12} /></button>
                      </div>
                    </div>
                    <div className="mt-5 flex gap-5 overflow-x-auto border-b border-[#e6ebe5]">
                      {tabs.map(({ label, icon: Icon, count }) => (
                        <button key={label} onClick={() => { setActiveTab(label); setShowAllHistory(label === "Історія"); }} className={`relative flex shrink-0 items-center gap-1.5 pb-2.5 text-[10px] font-semibold transition ${activeTab === label ? "text-[#2e6549]" : "text-[#89958d] hover:text-[#4d6254]"}`}>
                          <Icon size={13} />{label}{count !== undefined && <span className="rounded-full bg-[#edf1ec] px-1.5 py-[1px] text-[8px] text-[#78867d]">{count}</span>}
                          {activeTab === label && <span className="absolute inset-x-0 bottom-[-1px] h-[2px] rounded-full bg-[#43805a]" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeTab === "Огляд" && (
                    <div className="grid gap-4 p-4 md:p-5 xl:grid-cols-[minmax(0,1.22fr)_minmax(270px,.78fr)]">
                      <div className="space-y-4">
                        <div className="overflow-hidden rounded-xl border border-[#e1e7e0] bg-[#fff]">
                          <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
                            <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-[#f2f2e8] text-[#8b7847]"><ShoppingBag size={14} /></div><div><h3 className="text-[11px] font-bold">Активне замовлення</h3><p className="mt-0.5 text-[9px] text-[#929d94]">{selected.orderNo}</p></div></div>
                            <button onClick={cycleStage} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[8px] font-bold ${stageStyles[selected.stage]}`} title="Змінити етап">{selected.stage}<ChevronDown size={11} /></button>
                          </div>
                          <div className="grid gap-4 px-4 py-3.5 sm:grid-cols-[1fr_auto]">
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-[.1em] text-[#9aa39c]">Сума замовлення</div>
                              <div className="mt-1 font-['Manrope'] text-[22px] font-extrabold tracking-[-.6px] text-[#2a4938]">{formatMoney(selected.amount)}</div>
                              <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#f6f8f5] px-2.5 py-2">
                                <Truck size={14} className="mt-0.5 shrink-0 text-[#648574]" />
                                <div className="min-w-0"><div className="text-[9px] font-bold text-[#50645a]">Нова пошта · {selected.delivery}</div><button onClick={() => selected.ttn !== "Не створено" ? copyValue(selected.ttn, "ТТН") : flash("ТТН з’явиться після відправлення")} className="mt-1 flex items-center gap-1 text-[9px] text-[#788880] hover:text-[#3e7356]">ТТН: {selected.ttn}{selected.ttn !== "Не створено" && <Copy size={10} />}</button></div>
                              </div>
                            </div>
                            <div className="flex min-w-[146px] flex-col items-start justify-center border-t border-[#edf0eb] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                              <div className="mb-2 text-[9px] font-semibold uppercase tracking-[.1em] text-[#9aa39c]">Менеджерка</div>
                              <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-full bg-[#e7eee7] text-[8px] font-bold text-[#51715a]">{selected.managerInitials}</div><span className="text-[10px] font-semibold text-[#506056]">{selected.manager}</span></div>
                              <div className="mb-1 mt-3 text-[9px] font-semibold uppercase tracking-[.1em] text-[#9aa39c]">Склад відвантаження</div>
                              <div className="flex items-center gap-1.5 text-[9px] text-[#68796f]"><Package size={12} />{selected.warehouse}</div>
                            </div>
                          </div>
                          <div className="border-t border-[#edf0eb] px-4 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center">
                                {stages.map((stage, index) => {
                                  const activeIndex = stages.indexOf(selected.stage);
                                  return <div key={stage} className="flex min-w-0 flex-1 items-center">
                                    <div title={stage} className={`h-[7px] w-[7px] shrink-0 rounded-full ${index <= activeIndex ? "bg-[#538968]" : "bg-[#e3e9e2]"}`} />
                                    {index < stages.length - 1 && <div className={`h-[2px] min-w-2 flex-1 ${index < activeIndex ? "bg-[#9fbea4]" : "bg-[#e8ece6]"}`} />}
                                  </div>;
                                })}
                              </div>
                              <button onClick={cycleStage} className="shrink-0 text-[9px] font-semibold text-[#5f8068] hover:text-[#315b40]">Наступний етап <ArrowRight size={11} className="ml-0.5 inline" /></button>
                            </div>
                            <div className="mt-1.5 flex justify-between text-[8px] text-[#a1aaa3]"><span>Новий лід</span><span>Реалізовано</span></div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-[#e1e7e0] bg-[#fff]">
                          <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3">
                            <div className="flex items-center gap-2"><div className={`grid h-7 w-7 place-items-center rounded-lg ${selected.overdue ? "bg-[#fbefeb] text-[#c45c4d]" : "bg-[#edf3e9] text-[#648357]"}`}><CalendarClock size={14} /></div><div><h3 className="text-[11px] font-bold">Наступна дія</h3><p className="mt-0.5 text-[9px] text-[#929d94]">Нагадування для менеджерки</p></div></div>
                            <button onClick={() => setModal("task")} className="grid h-7 w-7 place-items-center rounded-md text-[#849189] hover:bg-[#f0f3ef]" aria-label="Додати завдання"><Plus size={15} /></button>
                          </div>
                          <div className={`flex items-start gap-3 px-4 py-3.5 ${selected.overdue ? "bg-[#fffaf8]" : ""}`}>
                            <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${selected.overdue ? "bg-[#c85c4e]" : "bg-[#79a276]"}`} />
                            <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold leading-[1.5] text-[#485a4e]">{selected.nextTask}</p><div className={`mt-1.5 flex flex-wrap items-center gap-2 text-[9px] ${selected.overdue ? "font-semibold text-[#c15d4f]" : "text-[#929d94]"}`}><span className="flex items-center gap-1"><Clock3 size={11} />{selected.taskDate}</span>{selected.overdue && <span className="rounded bg-[#fbe8e3] px-1.5 py-0.5 text-[8px]">Прострочено на 1 год 42 хв</span>}</div></div>
                            <button onClick={() => { setCompanies((current) => current.map((company) => company.id === selected.id ? { ...company, overdue: false, nextTask: "Завдання виконано" } : company)); flash("Завдання позначено виконаним"); }} title="Позначити виконаним" className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#e5ebe4] text-[#85958a] hover:border-[#a9c6ae] hover:bg-[#f0f6ef] hover:text-[#497451]"><Check size={14} /></button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-[#e1e7e0] bg-[#fff]">
                          <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3"><div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-[#f1f0e8] text-[#92814b]"><Wallet size={14} /></div><div><h3 className="text-[11px] font-bold">Умови співпраці</h3><p className="mt-0.5 text-[9px] text-[#929d94]">Фінансові параметри клієнта</p></div></div><button onClick={() => flash("Умови оплати та ціни")} className="text-[9px] font-semibold text-[#6d8c72] hover:text-[#345f43]">Редагувати</button></div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 sm:grid-cols-4">
                            {[{ label: "Форма оплати", value: selected.payment, icon: CreditCard }, { label: "Кредит / відстрочка", value: selected.credit.replace("ліміт ", ""), icon: ShieldCheck }, { label: "Особиста знижка", value: selected.discount, icon: Tag }, { label: "Ціновий рівень", value: selected.tier.replace("Прайс ", ""), icon: SlidersHorizontal }].map(({ label, value, icon: Icon }) => <div key={label}><div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[.07em] text-[#9aa49c]"><Icon size={11} />{label}</div><div className="mt-1.5 text-[10px] font-bold text-[#46594d]">{value}</div></div>)}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-[#e1e7e0] bg-[#fff]">
                          <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3"><div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-[#edf1f1] text-[#5c7c7a]"><UsersRound size={14} /></div><div><h3 className="text-[11px] font-bold">Контактні особи</h3><p className="mt-0.5 text-[9px] text-[#929d94]">{selected.contacts.length} контакти компанії</p></div></div><button onClick={() => setActiveTab("Контакти")} className="text-[9px] font-semibold text-[#6d8c72] hover:text-[#345f43]">Усі контакти <ArrowUpRight size={11} className="ml-0.5 inline" /></button></div>
                          <div className="divide-y divide-[#f0f2ee]">
                            {selected.contacts.map((contact) => (
                              <div key={contact.email} className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eaf0e8] text-[9px] font-bold text-[#52725a]">{contact.initials}</div>
                                  <div className="min-w-0 flex-1"><div className="truncate text-[10px] font-bold text-[#45574c]">{contact.name}</div><div className="mt-0.5 text-[9px] text-[#939e96]">{contact.role}</div></div>
                                  <button onClick={() => flash(`Дзвінок ${contact.name}: ${contact.phone}`)} className="grid h-7 w-7 place-items-center rounded-md text-[#77887c] hover:bg-[#edf3ec] hover:text-[#42734f]" title="Зателефонувати"><MessageCircle size={14} /></button>
                                  <button onClick={() => flash(`Telegram / Viber для ${contact.name}`)} className="grid h-7 w-7 place-items-center rounded-md text-[#77887c] hover:bg-[#edf3ec] hover:text-[#42734f]" title="Telegram або Viber"><Send size={13} /></button>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-[42px] text-[9px] text-[#78877e]"><button onClick={() => copyValue(contact.phone, "Телефон")} className="hover:text-[#437450]">{contact.phone}</button><button onClick={() => copyValue(contact.email, "Email")} className="flex items-center gap-1 hover:text-[#437450]"><Mail size={10} />{contact.email}</button></div>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => flash("Додати контакт до картки")} className="flex w-full items-center justify-center gap-1.5 border-t border-[#edf0eb] py-2.5 text-[9px] font-semibold text-[#6b8971] hover:bg-[#f7f9f6]"><Plus size={12} /> Додати контакт</button>
                        </div>

                        <div className="rounded-xl border border-[#e1e7e0] bg-[#fff]">
                          <div className="flex items-center justify-between border-b border-[#edf0eb] px-4 py-3"><div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-lg bg-[#edf0e9] text-[#72875d]"><History size={14} /></div><div><h3 className="text-[11px] font-bold">Остання активність</h3><p className="mt-0.5 text-[9px] text-[#929d94]">Хронологія взаємодій</p></div></div><button onClick={() => { setActiveTab("Історія"); setShowAllHistory(true); }} className="text-[9px] font-semibold text-[#6d8c72] hover:text-[#345f43]">Вся історія <ArrowUpRight size={11} className="ml-0.5 inline" /></button></div>
                          <div className="px-4 py-1">
                            {selected.history.slice(0, showAllHistory ? selected.history.length : 4).map((event, index) => {
                              const Icon = kindIcon[event.kind];
                              return <div key={`${event.date}-${event.time}-${event.title}`} className="relative flex gap-2.5 py-3">
                                {index < Math.min(selected.history.length, showAllHistory ? selected.history.length : 4) - 1 && <span className="absolute bottom-[-2px] left-[10px] top-[34px] w-px bg-[#e8ede7]" />}
                                <div className="relative z-[1] grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full border border-[#e3eae2] bg-[#f7f9f6] text-[#718a73]"><Icon size={11} /></div>
                                <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-[9px] font-bold leading-[1.45] text-[#536359]">{event.title}</p><span className="shrink-0 text-[8px] text-[#a0aaa2]">{event.time}</span></div><p className="mt-1 text-[9px] leading-[1.45] text-[#8b978f]">{event.detail}</p><div className="mt-1 text-[8px] text-[#a0aaa2]">{event.date} · {event.owner}</div></div>
                              </div>;
                            })}
                            {selected.history.length > 4 && <button onClick={() => setShowAllHistory((value) => !value)} className="mb-2 ml-8 text-[9px] font-semibold text-[#6c8a72] hover:text-[#345f43]">{showAllHistory ? "Згорнути історію" : `Показати ще ${selected.history.length - 4}`}</button>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-[#e1e7e0] bg-[#f4f7f2] px-4 py-3"><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#e6ede3] text-[#618166]"><Filter size={14} /></div><div><p className="text-[9px] font-bold text-[#516458]">Картка клієнта оновлена</p><p className="mt-0.5 text-[8px] text-[#929d94]">Олена Кравчук · сьогодні о 09:12</p></div></div><ArrowUpRight size={14} className="text-[#95a298]" /></div>
                      </div>
                    </div>
                  )}

                  {activeTab === "Історія" && (
                    <div className="mx-auto max-w-[760px] px-5 py-6 md:px-8">
                      <div className="mb-5 flex items-end justify-between"><div><h3 className="font-['Manrope'] text-[17px] font-extrabold text-[#304339]">Історія взаємодій</h3><p className="mt-1 text-[10px] text-[#87948b]">Усі дзвінки, замовлення та домовленості з клієнтом</p></div><button onClick={() => setModal("note")} className="flex h-8 items-center gap-1.5 rounded-lg border border-[#dfe5de] px-2.5 text-[9px] font-semibold text-[#62736a] hover:bg-[#f0f4ef]"><Plus size={12} /> Додати запис</button></div>
                      <div className="rounded-xl border border-[#e1e7e0] bg-white px-5 py-1">
                        {selected.history.map((event, index) => { const Icon = kindIcon[event.kind]; return <div key={`${event.time}-${event.title}`} className="relative flex gap-3 py-4">
                          {index < selected.history.length - 1 && <span className="absolute bottom-[-1px] left-[12px] top-[42px] w-px bg-[#e8ede7]" />}
                          <div className="relative z-[1] grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#e1e9e0] bg-[#f5f8f4] text-[#718a73]"><Icon size={12} /></div>
                          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-[11px] font-bold text-[#45574c]">{event.title}</h4><span className="text-[9px] text-[#9aa49c]">{event.date} · {event.time}</span></div><p className="mt-1 text-[10px] text-[#7e8b82]">{event.detail}</p><div className="mt-2 text-[9px] text-[#a0aaa2]">Відповідальна: {event.owner}</div></div>
                        </div>; })}
                      </div>
                    </div>
                  )}
                  {activeTab === "Контакти" && (
                    <div className="mx-auto max-w-[760px] px-5 py-6 md:px-8">
                      <div className="mb-5 flex items-end justify-between"><div><h3 className="font-['Manrope'] text-[17px] font-extrabold text-[#304339]">Контактні особи</h3><p className="mt-1 text-[10px] text-[#87948b]">Люди, з якими працює команда BUDBOX</p></div><button onClick={() => flash("Форма додавання контакту")} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#236450] px-2.5 text-[9px] font-semibold text-white hover:bg-[#1b5743]"><Plus size={12} /> Додати контакт</button></div>
                      <div className="grid gap-3 sm:grid-cols-2">{selected.contacts.map((contact) => <div key={contact.email} className="rounded-xl border border-[#e1e7e0] bg-white p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#eaf0e8] text-[11px] font-bold text-[#52725a]">{contact.initials}</div><div><h4 className="text-[12px] font-bold text-[#45574c]">{contact.name}</h4><p className="mt-0.5 text-[10px] text-[#929d94]">{contact.role}</p></div></div><div className="mt-4 space-y-2 text-[10px] text-[#708077]"><p className="flex items-center gap-2"><MessageCircle size={13} />{contact.phone}</p><p className="flex items-center gap-2"><Mail size={13} />{contact.email}</p></div><div className="mt-4 flex gap-2 border-t border-[#edf0eb] pt-3"><button onClick={() => flash(`Дзвінок ${contact.name}: ${contact.phone}`)} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#edf3ec] py-2 text-[9px] font-semibold text-[#507153] hover:bg-[#e4eee3]"><MessageCircle size={12} /> Зателефонувати</button><button onClick={() => flash(`Telegram / Viber для ${contact.name}`)} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#e4e9e3] py-2 text-[9px] font-semibold text-[#718078] hover:bg-[#f6f8f5]"><Send size={12} /> Telegram / Viber</button></div></div>)}</div>
                    </div>
                  )}
                  {activeTab === "Замовлення" && (
                    <div className="mx-auto max-w-[760px] px-5 py-6 md:px-8">
                      <div className="mb-5 flex items-end justify-between"><div><h3 className="font-['Manrope'] text-[17px] font-extrabold text-[#304339]">Замовлення клієнта</h3><p className="mt-1 text-[10px] text-[#87948b]">Останні угоди та відвантаження</p></div><button onClick={() => flash("Створення замовлення доступне в робочій системі")} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#236450] px-2.5 text-[9px] font-semibold text-white hover:bg-[#1b5743]"><Plus size={12} /> Нове замовлення</button></div>
                      <div className="overflow-hidden rounded-xl border border-[#e1e7e0] bg-white"><div className="grid grid-cols-[1.1fr_1fr_.85fr_auto] gap-3 border-b border-[#edf0eb] bg-[#f8faf7] px-4 py-2.5 text-[8px] font-bold uppercase tracking-[.09em] text-[#99a49c]"><span>Замовлення</span><span>Етап</span><span>Доставка</span><span className="text-right">Сума</span></div><div className="grid grid-cols-[1.1fr_1fr_.85fr_auto] items-center gap-3 px-4 py-4"><div><div className="text-[10px] font-bold text-[#4b5d51]">{selected.orderNo}</div><div className="mt-1 text-[8px] text-[#9aa49c]">19 червня, 2025</div></div><span className={`w-fit rounded-full px-2 py-1 text-[8px] font-semibold ${stageStyles[selected.stage]}`}>{selected.stage}</span><div className="text-[9px] text-[#738178]">{selected.delivery}<div className="mt-1 text-[8px] text-[#a0aaa2]">ТТН {selected.ttn}</div></div><div className="text-right text-[10px] font-bold text-[#405447]">{formatMoney(selected.amount)}</div></div></div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      {notice && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#294a3b] px-4 py-2.5 text-[10px] font-semibold text-white shadow-[0_8px_25px_rgba(28,57,41,.22)]"><Check size={14} className="text-[#b9d5b9]" />{notice}</div>}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1d3028]/30 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <div className="w-full max-w-[400px] rounded-2xl border border-[#dce5dc] bg-[#fbfcf9] p-5 shadow-[0_20px_70px_rgba(29,48,40,.22)]">
            <div className="flex items-start justify-between"><div><h3 className="font-['Manrope'] text-[16px] font-extrabold text-[#2d4035]">{modal === "company" ? "Нова компанія" : modal === "task" ? "Нове нагадування" : "Нотатка до картки"}</h3><p className="mt-1 text-[10px] text-[#86938a]">{modal === "company" ? "Додайте компанію до черги клієнтів" : `Буде збережено в картці ${selected.shortName}`}</p></div><button onClick={() => setModal(null)} className="grid h-7 w-7 place-items-center rounded-md text-[#829087] hover:bg-[#edf1ec]" aria-label="Закрити"><X size={15} /></button></div>
            {modal === "company" ? <label className="mt-5 block text-[10px] font-semibold text-[#617168]">Назва компанії<input autoFocus value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCompany(); }} placeholder="Наприклад, ТОВ «Нова Будова»" className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe6de] bg-white px-3 text-[11px] font-normal text-[#32433a] outline-none placeholder:text-[#a4ada6] focus:border-[#85aa91] focus:ring-2 focus:ring-[#e2eee4]" /></label> : <label className="mt-5 block text-[10px] font-semibold text-[#617168]">{modal === "task" ? "Що потрібно зробити?" : "Текст нотатки"}<textarea autoFocus value={modalText} onChange={(event) => setModalText(event.target.value)} rows={3} placeholder={modal === "task" ? "Наприклад, зателефонувати щодо оплати рахунку" : "Коротко зафіксуйте важливу домовленість…"} className="mt-1.5 w-full resize-none rounded-lg border border-[#dfe6de] bg-white px-3 py-2.5 text-[11px] font-normal leading-relaxed text-[#32433a] outline-none placeholder:text-[#a4ada6] focus:border-[#85aa91] focus:ring-2 focus:ring-[#e2eee4]" />{modal === "task" && <span className="mt-1 block text-[9px] font-normal text-[#929d94]">Нагадування: сьогодні о 16:00</span>}</label>}
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(null)} className="h-9 rounded-lg px-3 text-[10px] font-semibold text-[#738178] hover:bg-[#eef2ed]">Скасувати</button><button onClick={modal === "company" ? addCompany : () => addActivity(modal)} disabled={modal === "company" ? !newCompanyName.trim() : !modalText.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#236450] px-3.5 text-[10px] font-semibold text-white hover:bg-[#1b5743] disabled:cursor-not-allowed disabled:opacity-45">{modal === "company" ? <><Plus size={13} /> Створити картку</> : <><Check size={13} /> Зберегти</>}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}