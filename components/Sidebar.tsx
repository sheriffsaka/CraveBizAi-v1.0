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
    { id: 'document-transformer', label: 'DocGenerator', icon: 'edit' },
    { id: 'doc-signify', label: 'DocSignify', icon: 'signature' },
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
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex-shrink-0 bg-white shadow-2xl transform transition-transform duration-300 md:relative md:translate-x-0 ${
          isCollapsed ? 'w-20' : 'w-64'
        } ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:block`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className={`flex items-center justify-between h-20 border-b px-4 ${isCollapsed ? 'py-2' : ''}`}>
            {isCollapsed ? (
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-100 text-primary-700 font-black text-xl shadow-inner cursor-pointer mx-auto" title={companyName}>
                CB
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="flex items-baseline">
                    <h1 className="text-2xl font-bold text-primary-700">CraveBiZ</h1>
                    <span className="text-2xl font-thin text-gray-500 ml-1">AI</span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider mt-0.5 truncate max-w-[150px]">{companyName}</p>
                </div>
                <button
                  onClick={onClose}
                  className="md:hidden p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors shrink-0"
                  title="Close menu"
                  aria-label="Close menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
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
    </>
  );
};

export default Sidebar;
