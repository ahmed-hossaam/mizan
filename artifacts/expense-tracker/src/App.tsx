import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  getGetCurrentUserQueryKey,
  getGetTransactionQueryKey,
  getGetMonthlyStatsQueryKey,
  getGetMonthlyTrendsQueryKey,
  getListBudgetsQueryKey,
  getListCategoriesQueryKey,
  getListTransactionsQueryKey,
  useCreateBudget,
  useCreateCategory,
  useCreateTransaction,
  useDeleteBudget,
  useDeleteCategory,
  useDeleteTransaction,
  useGetCurrentUser,
  useGetMonthlyStats,
  useGetMonthlyTrends,
  useGetTransaction,
  useListBudgets,
  useListCategories,
  useListTransactions,
  useUpdateBudget,
  useUpdateCategory,
  useUpdateTransaction,
} from '@workspace/api-client-react';
import type { Budget, Category, Transaction, TransactionInput } from '@workspace/api-client-react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Receipt,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster as SonnerToaster, toast } from 'sonner';
import './expense.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const money = new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 });
const monthFormatter = new Intl.DateTimeFormat('en-EG', { month: 'long', year: 'numeric' });
const colors = ['#438d6a', '#c98c42', '#557492', '#b9675d', '#5a9b9b', '#8a76a8', '#bd8050', '#648b55'];
const cairoDateParts = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const nowMonth = () => {
  const parts = cairoDateParts();
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
};
const nowDate = () => {
  const parts = cairoDateParts();
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
};
const egp = (piastres: number | null | undefined) => money.format((piastres ?? 0) / 100);
const monthLabel = (month: string) => {
  const [year, value] = month.split('-').map(Number);
  return monthFormatter.format(new Date(year, value - 1, 1));
};
const shortDate = (value: string) => new Intl.DateTimeFormat('en-EG', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const stripBase = (path: string) => (basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path);
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#243a52',
    colorForeground: '#26384a',
    colorMutedForeground: '#68798a',
    colorDanger: '#c44b4b',
    colorBackground: '#ffffff',
    colorInput: '#fbfcfd',
    colorInputForeground: '#26384a',
    colorNeutral: '#dbe2e8',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'clerk-auth-root w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#26384a] font-semibold',
    headerSubtitle: 'text-[#68798a]',
    socialButtonsBlockButtonText: 'text-[#26384a] font-medium',
    formFieldLabel: 'text-[#34485b] font-medium',
    footerActionLink: 'text-[#397a5b] font-semibold',
    footerActionText: 'text-[#68798a]',
    dividerText: 'text-[#68798a]',
    identityPreviewEditButton: 'text-[#397a5b]',
    formFieldSuccessText: 'text-[#397a5b]',
    alertText: 'text-[#a33c3c]',
    logoBox: 'mb-2',
    logoImage: 'h-10 w-auto',
    socialButtonsBlockButton: 'border-[#dbe2e8] hover:bg-[#f4f7f6]',
    formButtonPrimary: 'bg-[#243a52] hover:bg-[#1b2e44] text-white',
    formFieldInput: 'border-[#dbe2e8] bg-[#fbfcfd] text-[#26384a]',
    footerAction: 'border-0',
    dividerLine: 'bg-[#e5eaee]',
    alert: 'bg-[#fff5f4] border-[#f3ceca]',
    otpCodeFieldInput: 'border-[#dbe2e8]',
    formFieldRow: 'mb-4',
    main: 'text-[#26384a]',
  },
};

function invalidateUserData(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
  void client.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  void client.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  void client.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
  void client.invalidateQueries({ queryKey: getGetMonthlyStatsQueryKey() });
  void client.invalidateQueries({ queryKey: getGetMonthlyTrendsQueryKey() });
}

function ClerkCacheReset() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) client.clear();
    previous.current = id;
  }), [addListener, client]);
  return null;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Your money, clearly in view.' } },
        signUp: { start: { title: 'A clearer month starts here', subtitle: 'Create your private EGP spending space.' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkCacheReset />
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/dashboard"><ProtectedPage><Dashboard /></ProtectedPage></Route>
        <Route path="/transactions"><ProtectedPage><Transactions /></ProtectedPage></Route>
        <Route path="/budgets"><ProtectedPage><Budgets /></ProtectedPage></Route>
        <Route path="/categories"><ProtectedPage><Categories /></ProtectedPage></Route>
        <Route component={NotFound} />
      </Switch>
    </ClerkProvider>
  );
}

function SignInPage() {
  return <div className="auth-stage"><AuthMessage /><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}
function SignUpPage() {
  return <div className="auth-stage"><AuthMessage /><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}
function AuthMessage() {
  return <div className="auth-note"><BrandMark /><p>Private by design.<br /><strong>Clarity, month by month.</strong></p><span>Your spending stays yours. No noise, just a better view of your money.</span></div>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageLoading />;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <Landing />;
}

function ProtectedPage({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageLoading />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <AppShell>{children}</AppShell>;
}

function BrandMark() {
  return <Link href="/" className="brand" aria-label="Mizan home" data-testid="link-brand-home">
    <span className="brand-mark"><span /></span><span>mizan<span className="brand-period">.</span></span>
  </Link>;
}

function Landing() {
  return <main className="landing">
    <header className="landing-nav"><BrandMark /><nav><a href="#how-it-works">How it works</a><a href="#privacy">Privacy</a></nav><div className="landing-actions"><Link href="/sign-in" className="text-link" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="btn btn-primary" data-testid="link-get-started">Get started <ArrowRight size={16} /></Link></div></header>
    <section className="landing-hero">
      <div className="hero-copy animate-enter"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR MONEY, IN BETTER FOCUS</div><h1>Make room for<br /><em>what matters.</em></h1><p>A private, thoughtful way to understand your monthly spending in Egyptian pounds. No spreadsheets. No surprises.</p><div className="hero-actions"><Link href="/sign-up" className="btn btn-primary" data-testid="link-start-tracking">Start tracking <ArrowRight size={17} /></Link><span className="hero-privacy"><ShieldCheck size={15} /> Private to you</span></div><div className="hero-proof"><div className="proof-line" /><span>Built for life in Egypt</span><span className="proof-separator">·</span><span>EGP, always</span></div></div>
      <div className="hero-visual" aria-label="Preview of monthly spending overview">
        <div className="preview-window"><div className="preview-top"><div className="preview-brand"><span className="mini-mark" /> Mizan <span className="preview-pill">SAMPLE PREVIEW</span></div><span className="preview-date">Example month <ChevronDown size={13} /></span></div>
          <div className="preview-heading"><span>MONTHLY OVERVIEW</span><strong>Your month, so far.</strong></div>
          <div className="preview-balance"><span>Available after spending</span><strong>EGP 18,420<span>.00</span></strong><div className="balance-rule"><i /></div><small>Income <b>EGP 32,500</b><span>Spent <b>EGP 14,080</b></span></small></div>
          <div className="preview-bottom"><div className="preview-breakdown"><span>TOP CATEGORIES</span><div><i className="swatch swatch-green" /><b>Home & bills</b><strong>EGP 5,200</strong></div><div><i className="swatch swatch-amber" /><b>Food & dining</b><strong>EGP 3,840</strong></div><div><i className="swatch swatch-blue" /><b>Transport</b><strong>EGP 1,460</strong></div></div><div className="preview-chart"><span>6 MONTHS</span><div className="spark-bars">{[38, 53, 45, 69, 56, 78, 63, 84, 68, 91, 73, 98].map((h, i) => <i key={i} style={{ height: `${h}%`, opacity: i % 2 ? .48 : 1 }} />)}</div><small>Steadier, month over month</small></div></div>
        </div>
        <div className="floating-note"><span><Check size={14} /></span><div><b>Well within budget</b><small>Home & bills · 68% used</small></div></div>
      </div>
    </section>
    <section className="landing-trust"><span>SMALL DETAILS. BETTER HABITS.</span><div><span><ShieldCheck size={17} /> Private by default</span><span><Wallet size={17} /> Made for EGP</span><span><Clock3 size={17} /> A clear monthly view</span></div></section>
    <section className="landing-story" id="how-it-works"><div className="story-index">01 / THE IDEA</div><div><h2>Money feels lighter<br />when it’s <em>understood.</em></h2><p>Mizan gives your everyday spending a place to land. Add the things that come in and go out, then see the shape of your month without digging through receipts or doing the math twice.</p><Link href="/sign-up" className="story-link" data-testid="link-create-private-space">Create your private space <ArrowRight size={16} /></Link></div><div className="story-side"><div className="side-number">01</div><p>Every number has context. Every month has a plan.</p></div></section>
    <section className="feature-band" id="privacy"><article><div className="feature-number">01</div><CalendarDays size={22} /><h3>One month at a time</h3><p>Know where you are this month, then move forward with a plan that feels realistic.</p></article><article><div className="feature-number">02</div><BarChart3 size={22} /><h3>Spending, made legible</h3><p>Useful category breakdowns and a six-month view, built from your own activity.</p></article><article><div className="feature-number">03</div><ShieldCheck size={22} /><h3>Yours means yours</h3><p>A personal account with no shared feed, public profile, or unnecessary noise.</p></article></section>
    <section className="landing-closer"><span className="eyebrow">START WITH THIS MONTH</span><h2>A calmer way to<br />keep track.</h2><p>Make your next money decision with the full picture in front of you.</p><Link href="/sign-up" className="btn btn-light" data-testid="link-create-account">Create your account <ArrowRight size={17} /></Link><div className="closer-seal"><ShieldCheck size={18} />PRIVATE · EGP · PERSONAL</div></section>
    <footer className="landing-footer"><BrandMark /><span>For your money, and only yours.</span><Link href="/sign-in" className="footer-signin" data-testid="link-footer-sign-in">Already have an account? Sign in <ArrowRight size={14} /></Link><small>© {new Date().getFullYear()} Mizan</small></footer>
  </main>;
}

const navigation = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ArrowDownLeft },
  { href: '/budgets', label: 'Budgets', icon: Wallet },
  { href: '/categories', label: 'Categories', icon: Tag },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const client = useQueryClient();
  const auth = useAuth();
  const currentUser = useGetCurrentUser({ query: { enabled: !!auth.isSignedIn, queryKey: getGetCurrentUserQueryKey() } });
  const profile = currentUser.data;
  const firstName = clerkUser?.firstName?.trim() || profile?.name?.trim().split(/\s+/)[0] || clerkUser?.username?.trim() || clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0] || profile?.email?.split('@')[0] || 'there';
  const email = clerkUser?.primaryEmailAddress?.emailAddress || profile?.email;
  const doSignOut = () => {
    client.clear();
    void signOut({ redirectUrl: basePath || '/' });
  };
  return <div className="app-layout">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><BrandMark /><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="workspace-caption">PERSONAL SPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`side-link ${location === href ? 'side-link-active' : ''}`} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase()}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{location === href && <i />}</Link>)}</nav>
       <div className="sidebar-bottom"><div className="sidebar-guide"><span className="guide-icon"><CircleHelp size={17} /></span><div><b>A little guidance?</b><small>Build a habit that sticks.</small></div><ArrowRight size={14} /></div><div className="profile-block"><div className="profile-avatar">{firstName.slice(0, 1).toUpperCase()}</div><div className="profile-info"><b>{firstName}</b><small>{currentUser.isLoading && !email ? 'Loading profile…' : email || 'Personal account'}</small></div><button onClick={doSignOut} className="logout-button" aria-label="Sign out" title="Sign out" data-testid="button-sign-out"><LogOut size={17} /></button></div></div>
    </aside>
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <div className="main-column"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-menu"><Menu size={20} /></button><div className="topbar-context"><span className="topbar-dot" /> Your private money view</div><div className="topbar-right"><span className="secure-label"><ShieldCheck size={15} /> Private</span><div className="topbar-avatar">{firstName.slice(0, 1).toUpperCase()}</div></div></header><main className="page-content">{children}<footer className="app-footer"><span>Money, made a little clearer.</span><span><ShieldCheck size={13} /> Private account · EGP</span></footer></main></div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`mobile-nav-link ${location === href ? 'mobile-nav-active' : ''}`} data-testid={`mobile-nav-${label.toLowerCase()}`}><Icon size={19} /><span>{label}</span></Link>)}</nav>
  </div>;
}

function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading animate-enter"><div><div className="page-kicker">{kicker}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function MonthControl({ month, setMonth }: { month: string; setMonth: (month: string) => void }) {
  return <label className="month-control"><CalendarDays size={16} /><input aria-label="Choose month" data-testid="input-selected-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><ChevronDown size={14} /></label>;
}
function PageLoading() {
  return <div className="loading-screen"><div className="loading-brand"><BrandMark /></div><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton-grid"><i className="skeleton" /><i className="skeleton" /><i className="skeleton" /></div><span>Preparing your private space…</span></div>;
}
function LoadingPanel({ rows = 4 }: { rows?: number }) {
  return <div className="panel loading-panel" aria-label="Loading"><div className="skeleton skeleton-line wide" />{Array.from({ length: rows }, (_, i) => <div className="skeleton skeleton-row" key={i} />)}</div>;
}
function QueryError({ retry }: { retry: () => void }) {
  return <div className="panel error-panel"><div className="error-mark"><X size={17} /></div><b>We couldn’t load this just now.</b><span>Your data is safe. Please try again.</span><button className="btn btn-secondary" onClick={retry} data-testid="button-retry">Try again</button></div>;
}
function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Wallet; title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><b>{title}</b><p>{detail}</p>{action}</div>;
}
function CardTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="card-title"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}
function MetricCard({ label, value, icon: Icon, tone = 'navy', detail, format = 'money' }: { label: string; value: number; icon: typeof Wallet; tone?: string; detail: string; format?: 'money' | 'count' }) {
  const displayValue = format === 'money' ? egp(value) : new Intl.NumberFormat('en-EG').format(value);
  return <article className="metric-card panel"><div className="metric-top"><span>{label}</span><i className={`metric-icon tone-${tone}`}><Icon size={17} /></i></div><strong className={tone === 'green' ? 'value-positive' : tone === 'red' ? 'value-negative' : ''} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{displayValue}</strong><small>{detail}</small></article>;
}

function Dashboard() {
  const [month, setMonth] = useState(nowMonth());
  const stats = useGetMonthlyStats({ month });
  const trends = useGetMonthlyTrends();
  const data = stats.data;
  const chartData = useMemo(() => (trends.data || []).map((item) => ({ ...item, label: monthLabel(item.month).split(' ')[0] })), [trends.data]);
  return <div className="page-stack">
      <PageHeading kicker="YOUR MONEY, IN FOCUS" title="Good to see you." description={`Here’s how ${monthLabel(month)} is taking shape.`} action={<MonthControl month={month} setMonth={setMonth} />} />
    {stats.isLoading ? <div className="metric-grid"><LoadingPanel rows={2} /><LoadingPanel rows={2} /><LoadingPanel rows={2} /><LoadingPanel rows={2} /></div> : stats.isError ? <QueryError retry={() => void stats.refetch()} /> : <>
      <section className="metric-grid">
        <MetricCard label="Income" value={data?.totalIncome || 0} icon={ArrowDownLeft} tone="green" detail="Money in this month" />
        <MetricCard label="Spent" value={data?.totalExpenses || 0} icon={ArrowUpRight} tone="red" detail="Expenses this month" />
        <MetricCard label="Left to work with" value={data?.netBalance || 0} icon={Wallet} tone="navy" detail="Income after spending" />
        <MetricCard label="Transactions" value={data?.transactionCount || 0} icon={Receipt} tone="blue" detail={`Entries in ${monthLabel(month)}`} format="count" />
      </section>
      <section className="dashboard-grid">
        <article className="panel breakdown-panel">
          <CardTitle title="Where it went" detail="Expense by category" action={<span className="period-label">{monthLabel(month)}</span>} />
          {!data?.categoryBreakdown?.length ? <EmptyState icon={Tag} title="Nothing spent yet" detail="Your category breakdown will appear once you add an expense." /> : <div className="breakdown-content">
            <div className="donut-wrap"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categoryBreakdown} dataKey="amount" nameKey="name" innerRadius="68%" outerRadius="94%" paddingAngle={2} stroke="none">{data.categoryBreakdown.map((item, index) => <Cell key={`${item.name}-${index}`} fill={item.color || colors[index % colors.length]} />)}</Pie><ChartTooltip formatter={(value) => egp(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#dfe6e8', fontSize: 11 }} /></PieChart></ResponsiveContainer><div className="donut-center"><b>{egp(data.totalExpenses)}</b><small>spent</small></div></div></div>
            <div className="category-legend">{data.categoryBreakdown.slice(0, 6).map((item, index) => <div className="legend-row" key={`${item.name}-${index}`} data-testid={`category-breakdown-${index}`}><span className="legend-dot" style={{ backgroundColor: item.color || colors[index % colors.length] }} /><span className="legend-name">{item.name}</span><span className="legend-amount">{egp(item.amount)}</span></div>)}</div>
          </div>}
        </article>
        <article className="panel trend-panel">
          <CardTitle title="Your rhythm" detail="Income and spending over six months" action={<div className="chart-legend"><span><i className="legend-income" />Income</span><span><i className="legend-spend" />Expenses</span></div>} />
          {trends.isLoading ? <div className="chart-loading"><div className="skeleton" /></div> : trends.isError ? <QueryError retry={() => void trends.refetch()} /> : !chartData.length || chartData.every((item) => !item.income && !item.expenses) ? <EmptyState icon={BarChart3} title="Your story starts here" detail="Monthly trends will build as you add transactions." /> : <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 6, left: -18, bottom: 0 }}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#478d6b" stopOpacity={0.15} /><stop offset="95%" stopColor="#478d6b" stopOpacity={0} /></linearGradient><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c16b60" stopOpacity={0.1} /><stop offset="95%" stopColor="#c16b60" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9eef0" strokeDasharray="4 5" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#84919d', fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#84919d', fontSize: 10 }} tickFormatter={(value) => value >= 10000000 ? `${Math.round(value / 1000000) / 10}m` : `${Math.round(value / 100000)}k`} /><ChartTooltip formatter={(value) => egp(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#dfe6e8', fontSize: 12 }} /><Area type="monotone" dataKey="income" name="Income" stroke="#478d6b" strokeWidth={2.4} fill="url(#incomeFill)" /><Area type="monotone" dataKey="expenses" name="Expenses" stroke="#c16b60" strokeWidth={2.2} fill="url(#expenseFill)" /></AreaChart></ResponsiveContainer></div>}
        </article>
      </section>
      <section className="panel recent-panel">
        <CardTitle title="Recent activity" detail="The latest entries in your ledger" action={<Link href="/transactions" className="subtle-link" data-testid="link-view-all-transactions">All transactions <ArrowRight size={14} /></Link>} />
        {!data?.recentTransactions?.length ? <EmptyState icon={ArrowDownLeft} title="Your first entry is a good start" detail="Add income or spending to see your activity here." action={<Link href="/transactions" className="btn btn-primary" data-testid="link-add-first-transaction"><Plus size={15} /> Add transaction</Link>} /> : <TransactionRows rows={data.recentTransactions} compact />}
      </section>
    </>}
  </div>;
}

function TransactionRows({ rows, compact = false, onEdit, onDelete }: { rows: Transaction[]; compact?: boolean; onEdit?: (tx: Transaction) => void; onDelete?: (tx: Transaction) => void }) {
  return <div className="transaction-list">{rows.map((tx) => <div className="transaction-row" key={tx.id} data-testid={`transaction-row-${tx.id}`}><span className="transaction-symbol" style={{ backgroundColor: `${tx.categoryColor || '#788a9a'}17`, color: tx.categoryColor || '#617487' }}>{tx.type === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><div className="transaction-main"><b>{tx.note?.trim() || tx.categoryName || (tx.type === 'income' ? 'Income' : 'Expense')}</b><span>{tx.categoryName || 'Uncategorized'} <i>·</i> {shortDate(tx.date)}</span></div><strong className={tx.type === 'income' ? 'value-positive' : 'value-negative'}>{tx.type === 'income' ? '+' : '−'}{egp(tx.amount)}</strong>{!compact && <div className="row-actions"><button className="icon-button small-icon" aria-label="Edit transaction" onClick={() => onEdit?.(tx)} data-testid={`button-edit-transaction-${tx.id}`}><Pencil size={15} /></button><button className="icon-button small-icon danger-icon" aria-label="Delete transaction" onClick={() => onDelete?.(tx)} data-testid={`button-delete-transaction-${tx.id}`}><Trash2 size={15} /></button></div>}</div>)}</div>;
}

function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog"><X size={18} /></button></div>{children}</section></div>;
}

function Transactions() {
  const client = useQueryClient();
  const categories = useListCategories();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Transaction | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [exporting, setExporting] = useState(false);
  const filters = useMemo(() => ({ page, limit: 10, ...(search.trim() ? { search: search.trim() } : {}), ...(type ? { type: type as 'income' | 'expense' } : {}), ...(categoryId ? { categoryId } : {}), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}), sortBy, sortOrder }), [page, search, type, categoryId, startDate, endDate, sortBy, sortOrder]);
  const list = useListTransactions(filters);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const refresh = () => {
    invalidateUserData(client);
    void client.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  };
  const changeFilter = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setter(event.target.value); setPage(1); };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (type) params.set('type', type);
      if (categoryId) params.set('categoryId', categoryId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const query = params.toString();
      const response = await fetch(`/api/transactions/export${query ? `?${query}` : ''}`, { credentials: 'include', headers: { Accept: 'text/csv' } });
      if (!response.ok) throw new Error('Export unavailable');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mizan-transactions-${nowMonth()}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV export downloaded');
    } catch {
      toast.error('CSV export failed', { description: 'Please try again in a moment.' });
    } finally { setExporting(false); }
  };
  const submitTransaction = (input: TransactionInput, item: Transaction | 'new') => {
    if (item === 'new') create.mutate({ data: input }, { onSuccess: () => { setDialog(null); refresh(); toast.success('Transaction added'); }, onError: () => toast.error('Transaction could not be saved', { description: 'Please check the details and try again.' }) });
    else update.mutate({ id: item.id, data: input }, { onSuccess: () => { setDialog(null); refresh(); toast.success('Transaction updated'); }, onError: () => toast.error('Transaction could not be updated', { description: 'Please try again.' }) });
  };
  const deleteTransaction = () => {
    if (!pendingDelete) return;
    remove.mutate({ id: pendingDelete.id }, { onSuccess: () => { setPendingDelete(null); refresh(); toast.success('Transaction deleted'); }, onError: () => toast.error('Transaction could not be deleted', { description: 'Please try again.' }) });
  };
  return <div className="page-stack">
    <PageHeading kicker="YOUR LEDGER" title="Transactions" description="A clear record of what came in and what went out." action={<div className="heading-buttons"><button className="btn btn-secondary" onClick={() => void exportCsv()} disabled={exporting} data-testid="button-export-csv"><Download size={16} />{exporting ? 'Preparing…' : 'Export CSV'}</button><button className="btn btn-primary" onClick={() => setDialog('new')} data-testid="button-add-transaction"><Plus size={16} /> Add transaction</button></div>} />
    <section className="panel filters-panel"><div className="search-wrap"><Search size={17} /><input type="search" value={search} onChange={changeFilter(setSearch)} placeholder="Search notes or categories" aria-label="Search transactions" data-testid="input-search-transactions" /></div><div className="filter-fields"><select className="field filter-select" value={type} onChange={changeFilter(setType)} aria-label="Filter by type" data-testid="filter-transaction-type"><option value="">All types</option><option value="income">Income</option><option value="expense">Expenses</option></select><select className="field filter-select" value={categoryId} onChange={changeFilter(setCategoryId)} aria-label="Filter by category" data-testid="filter-transaction-category"><option value="">All categories</option>{(categories.data || []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><label className="date-filter"><span>From</span><input className="field" type="date" value={startDate} onChange={changeFilter(setStartDate)} aria-label="Start date" data-testid="filter-start-date" /></label><label className="date-filter"><span>To</span><input className="field" type="date" value={endDate} onChange={changeFilter(setEndDate)} aria-label="End date" data-testid="filter-end-date" /></label><select className="field filter-select sort-select" value={`${sortBy}-${sortOrder}`} onChange={(event) => { const [sort, order] = event.target.value.split('-'); setSortBy(sort as 'date' | 'amount'); setSortOrder(order as 'asc' | 'desc'); }} aria-label="Sort transactions" data-testid="filter-transaction-sort"><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="amount-desc">Highest amount</option><option value="amount-asc">Lowest amount</option></select></div></section>
    <section className="panel table-panel"><div className="table-head"><div><b>All activity</b><span>{list.data?.total ?? 0} entries</span></div><span className="privacy-chip"><ShieldCheck size={13} /> Private to you</span></div>
      {list.isLoading ? <LoadingPanel rows={7} /> : list.isError ? <QueryError retry={() => void list.refetch()} /> : !list.data?.items.length ? <EmptyState icon={Search} title="No transactions found" detail={search || type || categoryId || startDate || endDate ? 'Try adjusting your filters, or add a new entry.' : 'When you add your first entry, it will be easy to find here.'} action={<button className="btn btn-primary" onClick={() => setDialog('new')} data-testid="button-add-empty-transaction"><Plus size={15} /> Add transaction</button>} /> : <TransactionRows rows={list.data.items} onEdit={setDialog} onDelete={setPendingDelete} />}
      {!!list.data?.items.length && <div className="pagination"><span>Showing <b>{(list.data.page - 1) * list.data.limit + 1}–{Math.min(list.data.page * list.data.limit, list.data.total)}</b> of {list.data.total}</span><div><button className="pagination-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))} aria-label="Previous page" data-testid="button-previous-page"><ArrowLeft size={15} /></button><span>Page {list.data.page} of {Math.max(list.data.totalPages, 1)}</span><button className="pagination-button" disabled={page >= list.data.totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Next page" data-testid="button-next-page"><ArrowRight size={15} /></button></div></div>}
    </section>
    {dialog && <TransactionDialog key={typeof dialog === 'string' ? dialog : dialog.id} item={dialog} categories={categories.data || []} busy={create.isPending || update.isPending} onClose={() => setDialog(null)} onSubmit={submitTransaction} />}
    {pendingDelete && <Modal title="Delete this transaction?" description="This entry will be permanently removed from your ledger." onClose={() => setPendingDelete(null)}><div className="confirm-summary"><b>{pendingDelete.note || pendingDelete.categoryName || 'Transaction'}</b><span>{egp(pendingDelete.amount)} · {shortDate(pendingDelete.date)}</span></div><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setPendingDelete(null)} data-testid="button-cancel-delete-transaction">Keep transaction</button><button className="btn btn-danger" onClick={deleteTransaction} disabled={remove.isPending} data-testid="button-confirm-delete-transaction"><Trash2 size={15} />{remove.isPending ? 'Deleting…' : 'Delete entry'}</button></div></Modal>}
  </div>;
}

function TransactionDialog({ item, categories, busy, onClose, onSubmit }: { item: Transaction | 'new'; categories: Category[]; busy: boolean; onClose: () => void; onSubmit: (input: TransactionInput, item: Transaction | 'new') => void }) {
  const existing = item !== 'new' ? item : undefined;
  const detail = useGetTransaction(existing?.id || '', { query: { enabled: !!existing, queryKey: getGetTransactionQueryKey(existing?.id || '') } });
  const [type, setType] = useState<'income' | 'expense'>(existing?.type || 'expense');
  const [amount, setAmount] = useState(existing ? String(existing.amount / 100) : '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId || '');
  const [note, setNote] = useState(existing?.note || '');
  const [date, setDate] = useState(existing?.date.slice(0, 10) || nowDate());
  const initializedDetail = useRef(false);
  useEffect(() => {
    if (detail.data && !initializedDetail.current) {
      initializedDetail.current = true;
      setType(detail.data.type);
      setAmount(String(detail.data.amount / 100));
      setCategoryId(detail.data.categoryId || '');
      setNote(detail.data.note || '');
      setDate(detail.data.date.slice(0, 10));
    }
  }, [detail.data]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    onSubmit({ type, amount: Math.round(numeric * 100), categoryId: categoryId || null, note: note.trim() || null, date }, item);
  };
  return <Modal title={existing ? 'Edit transaction' : 'Add a transaction'} description="Capture the detail now. You can always refine it later." onClose={onClose}><form onSubmit={submit} className="modal-form">
    <div className="type-switch" role="group" aria-label="Transaction type"><button type="button" className={type === 'expense' ? 'type-active expense-active' : ''} onClick={() => setType('expense')} data-testid="button-type-expense"><ArrowUpRight size={16} /> Expense</button><button type="button" className={type === 'income' ? 'type-active income-active' : ''} onClick={() => setType('income')} data-testid="button-type-income"><ArrowDownLeft size={16} /> Income</button></div>
    <label><span className="label">Amount in EGP</span><div className="amount-field"><span>EGP</span><input required autoFocus inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" data-testid="input-transaction-amount" /></div></label>
    <label><span className="label">Category</span><select className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} data-testid="input-transaction-category"><option value="">Uncategorized</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
    <label><span className="label">Date</span><input required className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} data-testid="input-transaction-date" /></label>
    <label><span className="label">Note <small>(optional)</small></span><input className="field" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="A little context helps later" data-testid="input-transaction-note" /></label>
    <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose} data-testid="button-cancel-transaction">Cancel</button><button className="btn btn-primary" disabled={busy || !amount} data-testid="button-save-transaction">{busy ? 'Saving…' : existing ? 'Save changes' : 'Add transaction'}</button></div>
  </form></Modal>;
}

function Budgets() {
  const client = useQueryClient();
  const [month, setMonth] = useState(nowMonth());
  const [dialog, setDialog] = useState<Budget | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Budget | null>(null);
  const budgets = useListBudgets({ month });
  const categories = useListCategories();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();
  const refresh = () => {
    invalidateUserData(client);
    void client.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
  };
  const save = (categoryId: string, amount: number, item: Budget | 'new') => {
    if (item === 'new') create.mutate({ data: { categoryId, month, limitAmount: amount } }, { onSuccess: () => { setDialog(null); refresh(); toast.success('Budget created'); }, onError: () => toast.error('Budget could not be created', { description: 'This category may already have a budget for the selected month.' }) });
    else update.mutate({ id: item.id, data: { limitAmount: amount } }, { onSuccess: () => { setDialog(null); refresh(); toast.success('Budget updated'); }, onError: () => toast.error('Budget could not be updated', { description: 'Please try again.' }) });
  };
  const deleteBudget = () => {
    if (!pendingDelete) return;
    remove.mutate({ id: pendingDelete.id }, { onSuccess: () => { setPendingDelete(null); refresh(); toast.success('Budget removed'); }, onError: () => toast.error('Budget could not be removed', { description: 'Please try again.' }) });
  };
  const current = budgets.data || [];
  const totalLimit = current.reduce((sum, budget) => sum + budget.limitAmount, 0);
  const totalSpent = current.reduce((sum, budget) => sum + budget.spent, 0);
  return <div className="page-stack">
    <PageHeading kicker="MAKE A PLAN" title="Budgets" description="Give the spending that matters a thoughtful boundary." action={<div className="heading-buttons"><MonthControl month={month} setMonth={setMonth} /><button className="btn btn-primary" onClick={() => setDialog('new')} data-testid="button-add-budget"><Plus size={16} /> New budget</button></div>} />
    {budgets.isLoading ? <LoadingPanel rows={6} /> : budgets.isError ? <QueryError retry={() => void budgets.refetch()} /> : <>
      {!!current.length && <section className="budget-overview panel"><div><span>PLANNED THIS MONTH</span><b>{egp(totalLimit)}</b></div><div><span>SPENT SO FAR</span><b>{egp(totalSpent)}</b></div><div><span>REMAINING</span><b className={totalSpent > totalLimit ? 'value-negative' : 'value-positive'}>{egp(totalLimit - totalSpent)}</b></div><div className="overview-note"><span className="overview-note-icon"><Settings2 size={16} /></span><span>A plan, not a rule.<br />Adjust any time.</span></div></section>}
      {!current.length ? <section className="panel budget-empty"><EmptyState icon={Wallet} title="A little structure can go a long way" detail={`Create a monthly spending limit for a category in ${monthLabel(month)}.`} action={<button className="btn btn-primary" onClick={() => setDialog('new')} data-testid="button-create-first-budget"><Plus size={15} /> Create a budget</button>} /></section> : <section className="budget-list">{current.map((budget) => <BudgetCard key={budget.id} budget={budget} onEdit={() => setDialog(budget)} onDelete={() => setPendingDelete(budget)} />)}</section>}
    </>}
    {dialog && <BudgetDialog item={dialog} month={month} categories={categories.data || []} existing={current} busy={create.isPending || update.isPending} onClose={() => setDialog(null)} onSubmit={save} />}
    {pendingDelete && <Modal title="Remove this budget?" description="Your transaction history stays untouched." onClose={() => setPendingDelete(null)}><div className="confirm-summary"><b>{pendingDelete.categoryName}</b><span>{monthLabel(pendingDelete.month)} · limit {egp(pendingDelete.limitAmount)}</span></div><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setPendingDelete(null)} data-testid="button-cancel-delete-budget">Keep budget</button><button className="btn btn-danger" onClick={deleteBudget} disabled={remove.isPending} data-testid="button-confirm-delete-budget"><Trash2 size={15} />{remove.isPending ? 'Removing…' : 'Remove budget'}</button></div></Modal>}
  </div>;
}

function BudgetCard({ budget, onEdit, onDelete }: { budget: Budget; onEdit: () => void; onDelete: () => void }) {
  const percentage = Math.max(0, Math.min(100, budget.percentage));
  const over = budget.spent > budget.limitAmount;
  return <article className="budget-card panel" data-testid={`budget-card-${budget.id}`}><div className="budget-card-head"><span className="budget-category-mark" style={{ backgroundColor: `${budget.categoryColor}22`, color: budget.categoryColor }}>{budget.categoryName.slice(0, 1)}</span><div className="budget-name"><b>{budget.categoryName}</b><small>{monthLabel(budget.month)}</small></div><div className="budget-actions"><button className="icon-button small-icon" onClick={onEdit} aria-label={`Edit ${budget.categoryName} budget`} data-testid={`button-edit-budget-${budget.id}`}><Pencil size={15} /></button><button className="icon-button small-icon danger-icon" onClick={onDelete} aria-label={`Delete ${budget.categoryName} budget`} data-testid={`button-delete-budget-${budget.id}`}><Trash2 size={15} /></button></div></div><div className="budget-numbers"><div><span>Spent</span><b className={over ? 'value-negative' : ''}>{egp(budget.spent)}</b></div><div><span>{over ? 'Over limit' : 'Remaining'}</span><b className={over ? 'value-negative' : 'value-positive'}>{egp(over ? budget.spent - budget.limitAmount : budget.remaining)}</b></div><div className="budget-limit"><span>Monthly limit</span><b>{egp(budget.limitAmount)}</b></div></div><div className="progress-meta"><span>{Math.round(budget.percentage)}% used</span><span>{over ? 'A little over plan' : `${egp(Math.max(budget.remaining, 0))} left`}</span></div><div className="progress-track"><i style={{ width: `${percentage}%`, background: over ? '#c44b4b' : budget.percentage >= 80 ? '#c98c42' : '#438d6a' }} /></div></article>;
}

function BudgetDialog({ item, month, categories, existing, busy, onClose, onSubmit }: { item: Budget | 'new'; month: string; categories: Category[]; existing: Budget[]; busy: boolean; onClose: () => void; onSubmit: (categoryId: string, amount: number, item: Budget | 'new') => void }) {
  const original = item !== 'new' ? item : undefined;
  const [categoryId, setCategoryId] = useState(original?.categoryId || '');
  const [amount, setAmount] = useState(original ? String(original.limitAmount / 100) : '');
  const available = categories.filter((category) => !existing.some((budget) => budget.categoryId === category.id) || category.id === original?.categoryId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!categoryId || Number(amount) <= 0) return;
    onSubmit(categoryId, Math.round(Number(amount) * 100), item);
  };
  return <Modal title={original ? 'Adjust your budget' : 'Plan a budget'} description={original ? 'Change the monthly limit for this category.' : `Set a monthly limit for ${monthLabel(month)}.`} onClose={onClose}><form className="modal-form" onSubmit={submit}>{!original && <label><span className="label">Category</span><select required className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} data-testid="input-budget-category"><option value="">Choose a category</option>{available.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select>{!available.length && <small className="field-hint">Every category already has a budget for this month.</small>}</label>}<label><span className="label">Monthly limit in EGP</span><div className="amount-field"><span>EGP</span><input required inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" data-testid="input-budget-limit" /></div></label><div className="modal-note"><ShieldCheck size={15} /> Your limit is a guide. Your actual spending is always visible.</div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose} data-testid="button-cancel-budget">Cancel</button><button type="submit" className="btn btn-primary" disabled={busy || !amount || (!original && !categoryId)} data-testid="button-save-budget">{busy ? 'Saving…' : original ? 'Save limit' : 'Create budget'}</button></div></form></Modal>;
}

function Categories() {
  const client = useQueryClient();
  const categories = useListCategories();
  const transactions = useListTransactions({ page: 1, limit: 100 });
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [dialog, setDialog] = useState<Category | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const usedCategoryIds = useMemo(() => new Set((transactions.data?.items || []).flatMap((transaction) => transaction.categoryId ? [transaction.categoryId] : [])), [transactions.data?.items]);
  const refresh = () => {
    invalidateUserData(client);
    void client.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  };
  const saveCategory = (name: string, color: string, item: Category | 'new') => {
    setErrorMessage('');
    if (item === 'new') create.mutate({ data: { name, color } }, { onSuccess: () => { setDialog(null); refresh(); }, onError: () => setErrorMessage('That category could not be created. Check the name and try again.') });
    else update.mutate({ id: item.id, data: { name, color } }, { onSuccess: () => { setDialog(null); refresh(); }, onError: () => setErrorMessage('That category could not be updated. Please try again.') });
  };
  const deleteCategory = () => {
    if (!pendingDelete || usedCategoryIds.has(pendingDelete.id)) return;
    remove.mutate({ id: pendingDelete.id }, { onSuccess: () => { setPendingDelete(null); refresh(); }, onError: () => setErrorMessage('This category is in use and cannot be removed. Reassign its transactions first.') });
  };
  return <div className="page-stack">
    <PageHeading kicker="MAKE IT YOURS" title="Categories" description="Give your spending the names that make sense to you." action={<button className="btn btn-primary" onClick={() => { setErrorMessage(''); setDialog('new'); }} data-testid="button-add-category"><Plus size={16} /> Add category</button>} />
    {errorMessage && <div className="inline-alert" role="alert"><span>{errorMessage}</span><button className="icon-button" onClick={() => setErrorMessage('')} aria-label="Dismiss message" data-testid="button-dismiss-category-error"><X size={16} /></button></div>}
    {categories.isLoading ? <LoadingPanel rows={6} /> : categories.isError ? <QueryError retry={() => void categories.refetch()} /> : !categories.data?.length ? <section className="panel category-empty"><EmptyState icon={Tag} title="Name the things that matter" detail="Create a few categories to make your monthly spending easier to understand." action={<button className="btn btn-primary" onClick={() => setDialog('new')} data-testid="button-create-first-category"><Plus size={15} /> Create category</button>} /></section> : <section className="category-grid">{categories.data.map((category, index) => {
      const isUsed = usedCategoryIds.has(category.id);
      return <article className="panel category-card" key={category.id} data-testid={`category-card-${category.id}`}><div className="category-card-top"><span className="category-color-dot" style={{ backgroundColor: category.color }} /><span className="category-order">{String(index + 1).padStart(2, '0')}</span></div><h2>{category.name}</h2><div className="category-card-bottom"><span className={isUsed ? 'in-use-pill' : 'unused-pill'}>{isUsed ? 'In use' : 'Ready to use'}</span><div><button className="icon-button small-icon" onClick={() => { setErrorMessage(''); setDialog(category); }} aria-label={`Edit ${category.name}`} data-testid={`button-edit-category-${category.id}`}><Pencil size={15} /></button><button className="icon-button small-icon danger-icon" onClick={() => { setErrorMessage(''); setPendingDelete(category); }} aria-label={`Delete ${category.name}`} data-testid={`button-delete-category-${category.id}`}><Trash2 size={15} /></button></div></div>{isUsed && <p className="category-use-note">Used by existing transactions. Deletion is blocked.</p>}</article>;
    })}</section>}
    <div className="category-tip"><span><CircleHelp size={16} /></span><p><b>Good to know</b> — categories in use cannot be deleted. This keeps your past spending clear and intact.</p></div>
    {dialog && <CategoryDialog item={dialog} busy={create.isPending || update.isPending} onClose={() => setDialog(null)} onSubmit={saveCategory} />}
    {pendingDelete && <Modal title={usedCategoryIds.has(pendingDelete.id) ? 'This category is in use' : 'Delete this category?'} description={usedCategoryIds.has(pendingDelete.id) ? 'To protect your transaction history, categories used in transactions cannot be deleted.' : 'This category will be removed from your personal list.'} onClose={() => setPendingDelete(null)}><div className="confirm-summary"><b><i className="category-color-dot inline-dot" style={{ backgroundColor: pendingDelete.color }} />{pendingDelete.name}</b><span>{usedCategoryIds.has(pendingDelete.id) ? 'Reassign existing transactions first.' : 'This action cannot be undone.'}</span></div><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setPendingDelete(null)} data-testid="button-close-delete-category">{usedCategoryIds.has(pendingDelete.id) ? 'Understood' : 'Cancel'}</button>{!usedCategoryIds.has(pendingDelete.id) && <button className="btn btn-danger" disabled={remove.isPending} onClick={deleteCategory} data-testid="button-confirm-delete-category"><Trash2 size={15} />{remove.isPending ? 'Deleting…' : 'Delete category'}</button>}</div></Modal>}
  </div>;
}

function CategoryDialog({ item, busy, onClose, onSubmit }: { item: Category | 'new'; busy: boolean; onClose: () => void; onSubmit: (name: string, color: string, item: Category | 'new') => void }) {
  const original = item !== 'new' ? item : undefined;
  const [name, setName] = useState(original?.name || '');
  const [color, setColor] = useState(original?.color || colors[0]);
  const submit = (event: FormEvent) => { event.preventDefault(); const cleaned = name.trim(); if (cleaned) onSubmit(cleaned, color, item); };
  return <Modal title={original ? 'Edit category' : 'Create a category'} description="A clear name makes the numbers more useful." onClose={onClose}><form className="modal-form" onSubmit={submit}><label><span className="label">Category name</span><input required autoFocus maxLength={50} className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Home & bills" data-testid="input-category-name" /></label><div><span className="label">Choose a colour</span><div className="color-picker" role="radiogroup" aria-label="Category colour">{colors.map((value) => <button type="button" key={value} className={`color-option ${color === value ? 'color-option-selected' : ''}`} style={{ backgroundColor: value }} aria-label={`Choose ${value} colour`} aria-checked={color === value} role="radio" onClick={() => setColor(value)} data-testid={`button-category-color-${value.slice(1)}`}>{color === value && <Check size={15} />}</button>)}</div></div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose} data-testid="button-cancel-category">Cancel</button><button type="submit" className="btn btn-primary" disabled={busy || !name.trim()} data-testid="button-save-category">{busy ? 'Saving…' : original ? 'Save category' : 'Create category'}</button></div></form></Modal>;
}

function ErrorBoundaryShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function ClerkApp() {
  return <WouterRouter base={basePath}><ErrorBoundaryShell><ClerkRoutes /></ErrorBoundaryShell></WouterRouter>;
}
function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <QueryClientProvider client={queryClient}><TooltipProvider><ClerkApp /><SonnerToaster position="top-right" richColors closeButton /></TooltipProvider></QueryClientProvider>;
}

export default App;
