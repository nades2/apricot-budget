import { NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { CalendarPage } from './pages/CalendarPage';
import { ForecastPage } from './pages/ForecastPage';
import { DetectionsPage } from './pages/DetectionsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ImportPage } from './pages/ImportPage';
import { AccountsPage } from './pages/AccountsPage';
import { BudgetPage } from './pages/BudgetPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { useTheme } from './lib/theme';
import { clearSession, useSession } from './lib/auth';

type NavItem = { to: string; label: string; icon: string };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Principal',
    items: [
      { to: '/calendar', label: 'Calendrier', icon: 'ti-calendar-month' },
      { to: '/forecast', label: 'Prévision',  icon: 'ti-chart-line' },
      { to: '/budget',   label: 'Budget',     icon: 'ti-target' },
    ],
  },
  {
    title: 'Gérer',
    items: [
      { to: '/actifs',   label: 'Actifs',     icon: 'ti-trending-up' },
      { to: '/passifs',  label: 'Passifs',    icon: 'ti-trending-down' },
      { to: '/import',   label: 'Import CSV', icon: 'ti-file-import' },
      { to: '/categories', label: 'Categories', icon: 'ti-tags' },
      { to: '/detections', label: 'Récurrences', icon: 'ti-wand' },
    ],
  },
];

export default function App() {
  const session = useSession();

  // Not logged in — only auth pages available.
  if (!session) {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return <AuthedShell />;
}

function AuthedShell() {
  const session = useSession();
  const [theme, , toggleTheme] = useTheme();
  const nav = useNavigate();

  const initials = (session?.user.displayName || session?.user.email || '?')
    .split(/[\s@]+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-black/30 backdrop-blur z-30">
        <div className="flex items-center gap-2 min-w-[176px]">
          <span className="text-xl">🍑</span>
          <span className="text-sm font-semibold tracking-tight">apricot-budget</span>
        </div>
        <div className="flex-1 max-w-lg mx-4 relative">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher…"
            className="w-full pl-9 pr-16 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-500 placeholder:text-gray-400"
          />
          <kbd className="hidden md:inline-block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 bg-white dark:bg-gray-900">
            ⌘K
          </kbd>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="Changer de thème"
            title={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
          >
            <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'} text-base`} aria-hidden="true" />
          </button>
          <button
            onClick={() => { clearSession(); nav('/login', { replace: true }); }}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <i className="ti ti-logout text-base" aria-hidden="true" />
          </button>
          <NavLink
            to="/profile"
            className="w-8 h-8 rounded-full bg-brand-200 text-brand-800 flex items-center justify-center text-xs font-medium hover:bg-brand-300 transition"
            title={`${session?.user.email} — Profil`}
            aria-label="Profil"
          >
            {initials || '?'}
          </NavLink>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-52 shrink-0 border-r border-gray-200 dark:border-gray-800 px-3 py-4 bg-white dark:bg-gray-950 overflow-y-auto">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-5">
              <div className="text-[10px] font-medium tracking-wider text-gray-400 dark:text-gray-500 uppercase px-2 mb-2">
                {section.title}
              </div>
              <nav className="flex flex-col gap-0.5 text-sm">
                {section.items.map((item) => (
                  <SideLink key={item.to} {...item} />
                ))}
              </nav>
            </div>
          ))}
        </aside>

        <main className="flex-1 min-h-0 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/calendar" replace />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/budget"   element={<BudgetPage />} />
            <Route path="/actifs"   element={<AccountsPage type="ASSET" />} />
            <Route path="/passifs"  element={<AccountsPage type="LIABILITY" />} />
            <Route path="/import"   element={<ImportPage />} />
            <Route path="/detections" element={<DetectionsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/profile"    element={<ProfilePage />} />
            <Route path="*"         element={<div className="p-6 text-sm text-gray-500 dark:text-gray-400">À venir…</div>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function SideLink({ to, label, icon }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition ${
          isActive
            ? 'bg-brand-100 dark:bg-brand-800/40 text-brand-700 dark:text-brand-200 font-medium'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-100'
        }`
      }
    >
      <i className={`ti ${icon} text-base`} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}
