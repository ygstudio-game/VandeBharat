import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ToastContainer } from '../ui/ToastContainer';
import {
  LayoutDashboard,
  Train,
  ListVideo,
  FileText,
  Activity,
  Server,
  Settings,
  Bell,
  User,
  ShieldCheck,
  Menu,
  ScanText,
  ShieldAlert,
  Camera,
  LogOut,
  Cpu,
  HardDrive,
  History,
  Brain,
  MonitorDot,
  GitMerge,
  ClipboardList,
  Wrench,
  MapPin,
  Database,
  SearchCode,
  FlaskConical,
  ChevronDown,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ROLES, ALL_ROLES } from '@/lib/roles';

const { ADMIN, RDSO_INSPECTOR, ZR_OFFICER } = ROLES;

// Grouped, role-scoped navigation. Settings is rendered separately in the footer.
const navGroups = [
  {
    label: 'Overview',
    items: [
      { name: 'Home',              path: '/dashboard',      icon: LayoutDashboard, roles: ALL_ROLES, tip: 'Live train monitor and what needs your attention' },
      { name: 'Operations Center', path: '/command-center', icon: MonitorDot,      roles: [ADMIN, RDSO_INSPECTOR, ZR_OFFICER] },
      { name: 'Processing Queue',  path: '/live-queue',     icon: ListVideo,       roles: ALL_ROLES, tip: 'Videos currently being processed' },
      { name: 'Stations',          path: '/stations',       icon: MapPin,          roles: [ADMIN, RDSO_INSPECTOR, ZR_OFFICER] },
    ],
  },
  {
    label: 'Inspection',
    items: [
      { name: 'Inspections',      path: '/sessions',            icon: Train,       roles: ALL_ROLES },
      { name: 'Defect Alerts',    path: '/defect-console',      icon: ShieldAlert, roles: ALL_ROLES },
      { name: 'Verify Defects',   path: '/defect-verification', icon: ShieldCheck, roles: [ADMIN, RDSO_INSPECTOR] },
      { name: 'Coach Number Log', path: '/ocr-log',             icon: ScanText,    roles: ALL_ROLES, tip: 'Every coach number the cameras read' },
    ],
  },
  {
    label: 'Reports & Records',
    items: [
      { name: 'Reports',       path: '/reports',       icon: FileText,      roles: ALL_ROLES },
      { name: 'Train History', path: '/history',       icon: History,       roles: ALL_ROLES },
      { name: 'Image Archive', path: '/image-archive', icon: HardDrive,     roles: [ADMIN, RDSO_INSPECTOR, ZR_OFFICER] },
      { name: 'Audit Log',     path: '/audit',         icon: ClipboardList, roles: [ADMIN] },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Analytics',           path: '/analytics', icon: Activity,   roles: [ADMIN, RDSO_INSPECTOR, ZR_OFFICER] },
      { name: 'Root Cause Analysis', path: '/rca',       icon: SearchCode, roles: [ADMIN, RDSO_INSPECTOR, ZR_OFFICER] },
      { name: 'Fleet & Assets',      path: '/assets',    icon: Wrench,     roles: [ADMIN, RDSO_INSPECTOR, ZR_OFFICER] },
    ],
  },
  {
    label: 'System Health',
    items: [
      { name: 'Cameras',       path: '/camera-health',  icon: Camera,   roles: [ADMIN, RDSO_INSPECTOR], tip: 'Camera online/offline status' },
      { name: 'System Health', path: '/infrastructure', icon: Server,   roles: [ADMIN] },
      { name: 'Data Sync',     path: '/sync-hub',       icon: GitMerge, roles: [ADMIN], tip: 'Background data synchronisation' },
    ],
  },
  {
    label: 'AI Lab',
    items: [
      { name: 'AI Engine',   path: '/ai-inference',   icon: Cpu,          roles: [ADMIN], tip: 'AI model processing engine' },
      { name: 'AI Accuracy', path: '/ai-performance', icon: Brain,        roles: [ADMIN] },
      { name: 'Datasets',    path: '/datasets',       icon: Database,     roles: [ADMIN] },
      { name: 'AI Training', path: '/training',       icon: FlaskConical, roles: [ADMIN] },
    ],
  },
  {
    label: 'Account',
    items: [
      { name: 'Settings', path: '/settings', icon: Settings, roles: ALL_ROLES, tip: 'Account, security, users' },
    ],
  },
];

// Single source of truth for route-level role guard — derived from navGroups so nav and guard never drift.
// Routes not listed here (e.g. /settings, /train/:id, /timeline/:id) are open to any authenticated user.
const ROUTE_ROLES = navGroups.reduce((map, g) => {
  g.items.forEach((i) => { map[i.path] = i.roles; });
  return map;
}, {});

export const Shell = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();

  // Role-scoped navigation: unknown/missing role falls back to least-privilege Field Staff.
  const role = user?.role ?? ROLES.FIELD_STAFF;
  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

  // Keep the group containing the active route pinned open so the current page stays visible.
  useEffect(() => {
    const activeGroup = navGroups.find((g) => g.items.some((i) => i.path === location.pathname));
    if (activeGroup) {
      setPinnedGroups((prev) => (prev.has(activeGroup.label) ? prev : new Set(prev).add(activeGroup.label)));
    }
  }, [location.pathname]);

  // Route guard: hiding a nav link is not enough — block direct-URL access to restricted pages.
  const requiredRoles = ROUTE_ROLES[location.pathname];
  const accessDenied = requiredRoles && !requiredRoles.includes(role);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };
  // Auto-collapse on small screens (≤1366px / 14" laptops) and in train workspace
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1440);

  // Group submenus: collapsed by default, toggled open by click.
  const [pinnedGroups, setPinnedGroups] = useState(() => new Set());
  const toggleGroup = (label) => {
    setPinnedGroups((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  useEffect(() => {
    const isSmall = window.innerWidth < 1440;
    if (location.pathname.startsWith('/train/') || location.pathname.startsWith('/timeline/')) {
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(isSmall);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (!location.pathname.startsWith('/train/') && !location.pathname.startsWith('/timeline/')) {
        setSidebarCollapsed(window.innerWidth < 1440);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside 
        style={{ width: sidebarCollapsed ? '0px' : '256px', minWidth: sidebarCollapsed ? '0px' : '256px' }}
        className={cn(
          "bg-card border-r border-border flex flex-col shadow-sm z-10 transition-all duration-300 ease-in-out shrink-0",
          sidebarCollapsed ? "opacity-0 -translate-x-full overflow-hidden border-r-0" : "translate-x-0"
        )}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-md">
            <Train className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight text-foreground leading-none">RDSO_MVIS</h1>
            <p className="text-[10px] text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Live Train Monitor</p>
          </div>
        </div>
        
        {/* Nav Links */}
        <ScrollArea className="flex-1 min-h-0 py-4 px-3">
          <div className="space-y-5">
            {visibleGroups.map((group) => {
              const isOpen = pinnedGroups.has(group.label);
              const groupHasActive = group.items.some((i) => i.path === location.pathname);
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isOpen}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      groupHasActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 space-y-0.5 pl-2">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          title={item.tip || item.name}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                            )
                          }
                        >
                          <item.icon className="w-4 h-4 shrink-0" />
                          {item.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center border border-border bg-card shadow-sm"
              title={sidebarCollapsed ? "Expand Navigation" : "Collapse Navigation"}
            >
              <Menu className="w-4 h-4" />
            </button>
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Machine Vision-based Inspection System
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <button className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-all">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </button>

            <Separator orientation="vertical" className="h-6" />

            {/* User Profile */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold leading-none text-foreground">{user?.name || 'Operator'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-medium uppercase">{user?.role || '—'}</p>
              </div>
              <div className="w-9 h-9 bg-secondary rounded-full flex items-center justify-center border border-border">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Route Outlet */}
        <main className="flex-1 overflow-y-auto bg-background">
          {accessDenied ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="text-center max-w-md">
                <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
                <h2 className="text-xl font-bold text-foreground">Access restricted</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Your role ({user?.role || 'unknown'}) does not have permission to view this page.
                  Contact your Administrator if you need access.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
                >
                  <LayoutDashboard className="w-4 h-4" /> Back to Home
                </button>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      {/* Global toast notifications */}
      <ToastContainer />
    </div>
  );
};
