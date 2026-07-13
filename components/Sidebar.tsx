import React from 'react';
import { Page } from '../App';
import Icon from './common/Icon';

interface SidebarProps {
  activePage: Page;
  setActivePage: (page: Page) => void;
  companyName: string;
  onLogout: () => void;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
}

const NavItem: React.FC<{
  iconName: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isCollapsed?: boolean;
}> = ({ iconName, label, isActive, onClick, isCollapsed }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex items-center p-3 my-1 rounded-lg transition-all ${
        isCollapsed ? 'justify-center' : ''
      } ${
        isActive
          ? 'bg-primary-600 text-white shadow-lg'
          : 'text-gray-600 hover:bg-primary-100 hover:text-primary-700'
      }`}
      title={isCollapsed ? label : undefined}
    >
      <Icon name={iconName} className="w-6 h-6 flex-shrink-0" />
      {!isCollapsed && <span className="ml-4 text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>}
    </a>
  </li>
);

const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage, companyName, onLogout, isAdmin, isOpen, onClose, isCollapsed = false }) => {
  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'document-transformer', label: 'SmartDocs', icon: 'edit' },
    { id: 'invoices', label: 'Invoices', icon: 'invoices' },
    { id: 'recurring-invoices', label: 'Recurring Invoices', icon: 'repeat' },
    { id: 'sent-receipts', label: 'Sent Receipts', icon: 'mail' },
    { id: 'clients', label: 'Clients', icon: 'clients' },
    { id: 'services', label: 'Services', icon: 'services' },
    { id: 'reports', label: 'Reports', icon: 'reports' },
    { id: 'payment-intelligence', label: 'Payment Intelligence', icon: 'reports' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  // Add Admin Dashboard item only if the user is an admin
  if (isAdmin) {
    const adminDashboardExists = navItems.some(item => item.id === 'admin-dashboard');
    if (!adminDashboardExists) {
      navItems.unshift({ id: 'admin-dashboard', label: 'Admin Dashboard', icon: 'dashboard' });
    }
  }

  return (
    <aside 
      className={`fixed inset-y-0 left-0 z-50 flex-shrink-0 bg-white shadow-md transform transition-all duration-300 md:relative md:translate-x-0 ${
        isCollapsed ? 'w-20' : 'w-64'
      } ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:block`}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <div className={`flex flex-col items-center justify-center h-20 border-b px-4 ${isCollapsed ? 'py-2' : ''}`}>
          {isCollapsed ? (
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-100 text-primary-700 font-black text-xl shadow-inner cursor-pointer" title={companyName}>
              CB
            </div>
          ) : (
            <>
              <div className="flex items-baseline">
                <h1 className="text-2xl font-bold text-primary-700">CraveBiZ</h1>
                <span className="text-2xl font-thin text-gray-500 ml-1">AI</span>
              </div>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider mt-1 truncate w-full text-center">{companyName}</p>
            </>
          )}
        </div>
        <nav className="flex-1 px-4 py-4 overflow-y-auto">
          <ul>
            {navItems.map((item) => (
              <NavItem
                key={item.id}
                iconName={item.icon}
                label={item.label}
                isCollapsed={isCollapsed}
                isActive={activePage === item.id}
                onClick={() => { setActivePage(item.id); onClose(); }}
              />
            ))}
          </ul>
        </nav>
        <div className="px-4 py-4 border-t">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); onLogout(); onClose(); }}
            className={`flex items-center p-3 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? "Logout" : undefined}
          >
            <Icon name="logout" className="w-6 h-6 flex-shrink-0" />
            {!isCollapsed && <span className="ml-4 text-sm font-medium">Logout</span>}
          </a>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
