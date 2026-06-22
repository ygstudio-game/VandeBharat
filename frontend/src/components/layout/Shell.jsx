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
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Live Train Monitor', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Live Queue', path: '/live-queue', icon: ListVideo },
  { name: 'Inspections', path: '/sessions', icon: Train },
  { name: 'Defect Alert Console', path: '/defect-console', icon: ShieldAlert },
  { name: 'Defect Verification', path: '/defect-verification', icon: ShieldCheck },
  { name: 'OCR Results Log', path: '/ocr-log', icon: ScanText },
  { name: 'Historical Reports', path: '/reports', icon: FileText },
  { name: 'Defect Analytics', path: '/analytics', icon: Activity },
  { name: 'Camera Health Monitor', path: '/camera-health', icon: Camera },
  { name: 'System Health Dashboard', path: '/infrastructure', icon: Server },
  { name: 'Command Center', path: '/command-center', icon: MonitorDot },
  { name: 'Sync Hub', path: '/sync-hub', icon: GitMerge },
  { name: 'AI Inference', path: '/ai-inference', icon: Cpu },
  { name: 'AI Performance', path: '/ai-performance', icon: Brain },
  { name: 'Passage History', path: '/history', icon: History },
  { name: 'Image Archive', path: '/image-archive', icon: HardDrive },
  { name: 'Audit & Compliance', path: '/audit', icon: ClipboardList },
  { name: 'Asset Management', path: '/assets',   icon: Wrench  },
  { name: 'Station Monitor',  path: '/stations', icon: MapPin   },
  { name: 'Datasets',         path: '/datasets', icon: Database },
  { name: 'Root Cause',       path: '/rca',      icon: SearchCode },
  { name: 'AI Training',      path: '/training', icon: FlaskConical },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Shell = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };
  // Auto-collapse on small screens (≤1366px / 14" laptops) and in train workspace
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1440);

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
        <ScrollArea className="flex-1 py-4 px-3">
          <div className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold tracking-wide uppercase transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )
                }
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </NavLink>
            ))}
          </div>
        </ScrollArea>

        {/* Footer info */}
        <div className="p-4 border-t border-border bg-slate-50/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-bold text-muted-foreground">NODE_INFRA: ACTIVE</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono">
            <span>VER: 2.1.4-rc</span>
            <span>ZONE: WR_HQ</span>
          </div>
        </div>
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
          <Outlet />
        </main>
      </div>

      {/* Global toast notifications */}
      <ToastContainer />
    </div>
  );
};
