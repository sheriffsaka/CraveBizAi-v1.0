import React, { useState, useEffect } from 'react';
import CreateInvoice from './CreateInvoice';
import { ResourceLimitView } from './common/ResourceLimitView';
import { checkResourceAvailability, ResourceLimitDetails } from '../services/resourceLimitService';
import { Client, Service, Company } from '../types';

interface CreateInvoiceRouteWrapperProps {
  activeTenantId: string;
  clients: Client[];
  services: Service[];
  targetCompany: Company;
  initialDraft: any;
  onNavigate: (page: string) => void;
  onAddInvoice: (inv: any) => Promise<void>;
  onCancel: () => void;
}

export const CreateInvoiceRouteWrapper: React.FC<CreateInvoiceRouteWrapperProps> = (props) => {
  const [limitDetails, setLimitDetails] = useState<ResourceLimitDetails | null>(null);
  const [isLoadingCheck, setIsLoadingCheck] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    setIsLoadingCheck(true);

    checkResourceAvailability(props.activeTenantId, 'invoice')
      .then((res) => {
        if (isSubscribed) {
          setLimitDetails(res);
          setIsLoadingCheck(false);
        }
      })
      .catch((err) => {
        console.warn("[CreateInvoiceRouteWrapper] Limit check error:", err);
        if (isSubscribed) setIsLoadingCheck(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [props.activeTenantId]);

  if (isLoadingCheck) {
    return (
      <div className="flex flex-col items-center justify-center p-12 my-16 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-100 max-w-md mx-auto text-center shadow-sm">
        <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-1">Checking Workspace Limits</h4>
        <p className="text-xs text-gray-500 font-medium">Verifying invoice quota against cloud vault...</p>
      </div>
    );
  }

  if (limitDetails && !limitDetails.allowed) {
    return (
      <ResourceLimitView
        details={limitDetails}
        onUpgrade={() => props.onNavigate('settings')}
        onViewPlan={() => props.onNavigate('settings')}
        onGoBack={() => props.onNavigate('invoices')}
      />
    );
  }

  return (
    <CreateInvoice
      clients={props.clients}
      services={props.services}
      company={props.targetCompany}
      initialDraft={props.initialDraft}
      onNavigate={props.onNavigate}
      onAddInvoice={props.onAddInvoice}
      onCancel={props.onCancel}
    />
  );
};
