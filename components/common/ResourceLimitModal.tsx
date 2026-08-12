import React from 'react';
import { ResourceLimitDetails } from '../../services/resourceLimitService';
import Icon from './Icon';

interface ResourceLimitModalProps {
  details: ResourceLimitDetails | null;
  onClose: () => void;
  onUpgrade: () => void;
  onViewPlan?: () => void;
}

export const ResourceLimitModal: React.FC<ResourceLimitModalProps> = ({
  details,
  onClose,
  onUpgrade,
  onViewPlan
}) => {
  if (!details) return null;

  const {
    title,
    description,
    currentUsage,
    maxLimit,
    unitName,
    resetDate,
    tier,
    resourceType,
    canUpgrade
  } = details;

  const isUnlimited = maxLimit >= 999999;
  const percentage = isUnlimited ? 0 : Math.min(100, Math.round((currentUsage / Math.max(1, maxLimit)) * 100));

  const getResourceIcon = () => {
    switch (resourceType) {
      case 'invoice':
        return <Icon name="file-text" className="w-8 h-8 text-amber-600" />;
      case 'receipt':
        return <Icon name="credit-card" className="w-8 h-8 text-amber-600" />;
      case 'ai_credit':
        return <Icon name="sparkles" className="w-8 h-8 text-amber-600" />;
      case 'user':
        return <Icon name="users" className="w-8 h-8 text-amber-600" />;
      case 'client':
        return <Icon name="userPlus" className="w-8 h-8 text-amber-600" />;
      case 'service':
        return <Icon name="plus" className="w-8 h-8 text-amber-600" />;
      case 'project':
        return <Icon name="folder" className="w-8 h-8 text-amber-600" />;
      case 'document':
      default:
        return <Icon name="file-text" className="w-8 h-8 text-amber-600" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-amber-100 text-center my-auto transform transition-all animate-in zoom-in-95 duration-200 relative">
        {/* Close X button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-all"
          aria-label="Close dialog"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Top Icon Badge */}
        <div className="bg-amber-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-amber-200/80 shadow-sm">
          {getResourceIcon()}
        </div>

        {/* Title & Tier Badge */}
        <div className="space-y-1 mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
            {tier} Plan Limit
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-gray-900 uppercase tracking-tight">
            {title}
          </h3>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-6 leading-relaxed font-medium">
          {description}
        </p>

        {/* Usage Stats Box */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-6 space-y-2.5 text-left">
          <div className="flex justify-between items-center text-xs font-bold text-gray-700">
            <span>Current Allowance Used</span>
            <span className="text-amber-700 font-extrabold">
              {isUnlimited ? 'Unlimited' : `${currentUsage} of ${maxLimit} ${unitName}`}
            </span>
          </div>

          {!isUnlimited && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  percentage >= 100 ? 'bg-amber-500' : 'bg-primary-600'
                }`}
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>
          )}

          {resetDate && (
            <div className="text-[11px] text-gray-500 font-medium pt-1 flex items-center gap-1.5 border-t border-gray-200/60 mt-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Allowance scheduled to renew on <strong className="text-gray-700">{resetDate}</strong></span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {canUpgrade && (
            <button
              onClick={() => {
                onClose();
                onUpgrade();
              }}
              className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Upgrade Plan
            </button>
          )}

          {onViewPlan && (
            <button
              onClick={() => {
                onClose();
                onViewPlan();
              }}
              className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            >
              View Plan
            </button>
          )}

          <button
            onClick={onClose}
            className="px-5 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};
