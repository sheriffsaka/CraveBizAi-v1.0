import React from 'react';
import { Company } from '../types';
import Icon from './common/Icon';

interface OnboardingSetupPromptProps {
  company: Company | null;
  onNavigateToSettings: (section?: string) => void;
}

export const OnboardingSetupPrompt: React.FC<OnboardingSetupPromptProps> = ({
  company,
  onNavigateToSettings,
}) => {
  if (!company) return null;

  const hasLogo = Boolean(company.logoUrl && company.logoUrl.trim() !== '');
  const hasAccountNumber = Boolean(
    company.bankAccounts &&
      company.bankAccounts.length > 0 &&
      company.bankAccounts.some(
        (b) => b.accountNumber && b.accountNumber.trim() !== ''
      )
  );

  // If both logo AND account number are already present, do not display the prompt
  if (hasLogo && hasAccountNumber) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300/80 rounded-2xl p-6 shadow-md mb-6 transition-all animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-amber-500/10 text-amber-600 rounded-2xl border border-amber-200/80 shrink-0">
            <Icon name="building" className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              Complete Your Account Setup
              <span className="text-[10px] uppercase font-extrabold tracking-wider bg-amber-200/90 text-amber-900 px-2.5 py-0.5 rounded-full">
                Action Required
              </span>
            </h3>
            <p className="text-sm font-medium text-gray-700 mt-1 max-w-2xl leading-relaxed">
              Your account is almost ready. Please add your company logo and bank/account number so they can be used on your invoices, receipts and other business documents.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {!hasLogo && (
                <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-800 bg-amber-100/90 border border-amber-300/60 px-3 py-1 rounded-full">
                  <span>⚠️</span> Missing Company Logo
                </span>
              )}
              {!hasAccountNumber && (
                <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-800 bg-amber-100/90 border border-amber-300/60 px-3 py-1 rounded-full">
                  <span>⚠️</span> Missing Bank / Account Number
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!hasLogo && (
            <button
              onClick={() => onNavigateToSettings('logo')}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black tracking-wide shadow-md hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Icon name="image" className="w-4 h-4" />
              Set Up Logo
            </button>
          )}
          {!hasAccountNumber && (
            <button
              onClick={() => onNavigateToSettings('bank')}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black tracking-wide shadow-md hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Icon name="creditCard" className="w-4 h-4" />
              Add Account Number
            </button>
          )}
          <button
            onClick={() => onNavigateToSettings('general')}
            className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black tracking-wide shadow-md hover:shadow-lg transition-all flex items-center gap-2"
          >
            Complete Setup
            <Icon name="chevronRight" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingSetupPrompt;
