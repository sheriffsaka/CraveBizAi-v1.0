import React from 'react';
import { ResourceLimitDetails } from '../../services/resourceLimitService';
import Icon from './Icon';

interface ResourceLimitViewProps {
  details: ResourceLimitDetails;
  onUpgrade: () => void;
  onGoBack: () => void;
  onViewPlan?: () => void;
}

export const ResourceLimitView: React.FC<ResourceLimitViewProps> = ({
  details,
  onUpgrade,
  onGoBack,
  onViewPlan
}) => {
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
        return <Icon name="file-text" className="w-10 h-10 text-amber-600" />;
      case 'receipt':
        return <Icon name="credit-card" className="w-10 h-10 text-amber-600" />;
      case 'ai_credit':
        return <Icon name="sparkles" className="w-10 h-10 text-amber-600" />;
      case 'user':
        return <Icon name="users" className="w-10 h-10 text-amber-600" />;
      case 'client':
        return <Icon name="userPlus" className="w-10 h-10 text-amber-600" />;
      case 'service':
        return <Icon name="plus" className="w-10 h-10 text-amber-600" />;
      case 'project':
        return <Icon name="folder" className="w-10 h-10 text-amber-600" />;
      case 'document':
      default:
        return <Icon name="file-text" className="w-10 h-10 text-amber-600" />;
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-6 md:p-10">
      <div className="bg-white rounded-3xl p-8 sm:p-12 max-w-xl w-full shadow-xl border border-amber-200/80 text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Icon Badge */}
        <div className="bg-amber-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-200/80 shadow-inner">
          {getResourceIcon()}
        </div>

        {/* Tier Tag */}
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200 mb-3">
          {tier} Plan Allowance Reached
        </span>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 uppercase tracking-tight mb-3">
          {title}
        </h2>

        {/* Description */}
        <p className="text-sm sm:text-base text-gray-600 mb-8 leading-relaxed font-medium">
          {description}
        </p>

        {/* Usage Card */}
        <div className="bg-amber-50/60 rounded-2xl p-5 border border-amber-200/80 mb-8 space-y-3 text-left">
          <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-gray-800">
            <span>Quota Consumption</span>
            <span className="text-amber-700 font-extrabold text-sm sm:text-base">
              {isUnlimited ? 'Unlimited' : `${currentUsage} / ${maxLimit} ${unitName}`}
            </span>
          </div>

          {!isUnlimited && (
            <div className="w-full bg-amber-200/60 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  percentage >= 100 ? 'bg-amber-600' : 'bg-primary-600'
                }`}
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>
          )}

          {resetDate && (
            <p className="text-xs text-gray-500 font-medium pt-1 flex items-center gap-1.5 border-t border-amber-200/50">
              <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Next allowance renewal date: <strong className="text-gray-800">{resetDate}</strong></span>
            </p>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-3.5 justify-center">
          {canUpgrade && (
            <button
              onClick={onUpgrade}
              className="flex-1 px-6 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Upgrade Subscription
            </button>
          )}

          {onViewPlan && (
            <button
              onClick={onViewPlan}
              className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            >
              View Plan
            </button>
          )}

          <button
            onClick={onGoBack}
            className="px-6 py-3.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};
