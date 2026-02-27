
import React, { useState } from 'react';
import Icon from './common/Icon';
import { Company, User } from '../types';

interface HeaderProps {
    pageTitle: string;
    onCreateInvoice: () => void;
    companies: Company[];
    activeTenantId: string;
    onSwitchTenant: (tenantId: string) => void;
    user: User | null;
    toggleChatbot: () => void;
    onOpenUserProfile: () => void;
    onLogout: () => void;
    onToggleMobileMenu: () => void;
}

const UserAvatar: React.FC<{ user: User; onOpenUserProfile: () => void; onLogout: () => void; }> = ({ user, onOpenUserProfile, onLogout }) => {
    // Defensive check for user.name
    const name = user?.name || 'User';
    const initials = name.split(' ').map(n => n ? n[0] : '').join('').toUpperCase() || 'U';
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-md transform transition-transform hover:scale-105" 
                title={name}
            >
                {initials}
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                    <div className="p-3 border-b bg-gray-50">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Signed in as</p>
                        <p className="text-sm font-bold text-gray-800 truncate">{name}</p>
                    </div>
                    <div className="py-1">
                        <button onClick={() => { onOpenUserProfile(); setIsOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-primary-50 flex items-center">
                            <Icon name="user" className="w-4 h-4 mr-3 text-gray-400" /> Profile Settings
                        </button>
                        <button onClick={() => { onLogout(); setIsOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center">
                            <Icon name="logout" className="w-4 h-4 mr-3 text-red-400" /> Sign Out
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

const Header: React.FC<HeaderProps> = ({ pageTitle, onCreateInvoice, user, toggleChatbot, onOpenUserProfile, onLogout, onToggleMobileMenu }) => {
    return (
        <header className="flex justify-between items-center p-4 h-20 bg-white border-b shadow-sm relative z-40">
            <div className="flex items-center">
                <button onClick={onToggleMobileMenu} className="p-2 mr-3 text-gray-600 md:hidden hover:bg-gray-100 rounded-lg">
                    <Icon name="menu" className="w-6 h-6"/>
                </button>
                <h2 className="text-xl font-bold text-gray-800 tracking-tight">{pageTitle}</h2>
            </div>
            <div className="flex items-center space-x-3">
                <button 
                    onClick={toggleChatbot} 
                    className="p-2.5 bg-primary-50 text-primary-600 rounded-full hover:bg-primary-100 transition-all shadow-sm border border-primary-100"
                    title="Ask AI Assistant"
                >
                    <Icon name="message-square" className="w-5 h-5"/>
                </button>
                <button onClick={onCreateInvoice} className="hidden sm:flex px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-bold shadow-lg shadow-primary-200 transition-all transform hover:-translate-y-0.5 items-center">
                    <span className="mr-2 text-lg leading-none">+</span> New Invoice
                </button>
                {user && <UserAvatar user={user} onOpenUserProfile={onOpenUserProfile} onLogout={onLogout} />}
            </div>
        </header>
    );
};

export default Header;
