import { getSubscriptionInfo, TIER_LIMITS, SubscriptionTier } from './subscriptionService';
import { api, supabase } from '../lib/api';

export type ResourceType = 
  | 'invoice'
  | 'receipt'
  | 'ai_credit'
  | 'user'
  | 'client'
  | 'service'
  | 'project'
  | 'document'
  | 'storage';

export interface ResourceLimitDetails {
  allowed: boolean;
  resourceType: ResourceType;
  title: string;
  description: string;
  currentUsage: number;
  maxLimit: number;
  remaining: number;
  unitName: string;
  resetDate?: string;
  tier: SubscriptionTier;
  canUpgrade: boolean;
  reason?: string;
}

/**
  Check resource availability against database records & tier quotas.
  Acts as the single source of truth for resource limits across CraveBiz AI.
 */
export async function checkResourceAvailability(
  companyId: string,
  resourceType: ResourceType,
  contextCounts?: {
    clientsCount?: number;
    servicesCount?: number;
    projectsCount?: number;
    usersCount?: number;
    docsCount?: number;
  }
): Promise<ResourceLimitDetails> {
  const targetCompany = companyId || (typeof window !== 'undefined' ? localStorage.getItem('cravebiz_tenant') : '') || 'default-tenant';
  const subInfo = getSubscriptionInfo(targetCompany);
  const tier: SubscriptionTier = subInfo.tier || 'Free';
  const tierConfig = TIER_LIMITS[tier] || TIER_LIMITS.Free;

  const defaultResetDate = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  switch (resourceType) {
    case 'invoice': {
      let createdCount = subInfo.invoiceCount || 0;
      let totalQuota = subInfo.maxInvoices;
      let remainingCount = Math.max(0, totalQuota - createdCount);
      let resetDateStr = defaultResetDate;

      try {
        const usage = await api.getInvoiceUsage(targetCompany, tier);
        if (usage && typeof usage.remainingCount === 'number') {
          createdCount = usage.createdCount;
          totalQuota = usage.totalQuota;
          remainingCount = usage.remainingCount;
          if (usage.resetDate) {
            resetDateStr = new Date(usage.resetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
        }
      } catch (err) {
        console.warn("[ResourceLimit] Invoice usage DB check warning:", err);
      }

      const isUnlimited = totalQuota >= 999999;
      const allowed = isUnlimited || remainingCount > 0;

      return {
        allowed,
        resourceType: 'invoice',
        title: 'Invoice Limit Reached',
        description: allowed
          ? 'Invoice creation is available.'
          : 'You have used all available invoices for your current plan. Please upgrade your plan or wait until your allowance is renewed to create another invoice.',
        currentUsage: createdCount,
        maxLimit: totalQuota,
        remaining: isUnlimited ? 999999 : remainingCount,
        unitName: 'invoices',
        resetDate: resetDateStr,
        tier,
        canUpgrade: tier !== 'Enterprise',
        reason: allowed ? undefined : `Invoice quota exhausted (${createdCount}/${totalQuota} created).`
      };
    }

    case 'receipt': {
      let createdCount = subInfo.receiptCount || 0;
      let totalQuota = subInfo.maxReceipts;
      let remainingCount = Math.max(0, totalQuota - createdCount);
      let resetDateStr = defaultResetDate;

      try {
        const usage = await api.getReceiptUsage(targetCompany, tier);
        if (usage && typeof usage.remainingCount === 'number') {
          createdCount = usage.createdCount;
          totalQuota = usage.totalQuota;
          remainingCount = usage.remainingCount;
          if (usage.resetDate) {
            resetDateStr = new Date(usage.resetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
        }
      } catch (err) {
        console.warn("[ResourceLimit] Receipt usage DB check warning:", err);
      }

      const isUnlimited = totalQuota >= 999999;
      const allowed = isUnlimited || remainingCount > 0;

      return {
        allowed,
        resourceType: 'receipt',
        title: 'Receipt Limit Reached',
        description: allowed
          ? 'Receipt creation is available.'
          : 'You have used all available receipts for your current plan. Please upgrade your plan or wait for your allowance to renew.',
        currentUsage: createdCount,
        maxLimit: totalQuota,
        remaining: isUnlimited ? 999999 : remainingCount,
        unitName: 'receipts',
        resetDate: resetDateStr,
        tier,
        canUpgrade: tier !== 'Enterprise',
        reason: allowed ? undefined : `Receipt quota exhausted (${createdCount}/${totalQuota} generated).`
      };
    }

    case 'ai_credit': {
      const remainingCredits = subInfo.aiUnits;
      const maxCredits = tierConfig.maxAiUnits || 5;
      const isModeEnabled = subInfo.aiModeEnabled;
      const allowed = isModeEnabled && remainingCredits > 0;

      let description = 'AI credits are available.';
      if (!isModeEnabled) {
        description = 'AI Assistant mode is currently disabled in your Workspace Settings. Please enable AI Mode in settings or upgrade your plan.';
      } else if (remainingCredits <= 0) {
        description = 'You have used all of your available AI credits. Please upgrade your plan or wait until your credits are renewed before using this feature.';
      }

      return {
        allowed,
        resourceType: 'ai_credit',
        title: 'AI Credits Exhausted',
        description,
        currentUsage: Math.max(0, maxCredits - remainingCredits),
        maxLimit: maxCredits,
        remaining: remainingCredits,
        unitName: 'AI credits',
        resetDate: defaultResetDate,
        tier,
        canUpgrade: tier !== 'Enterprise',
        reason: allowed ? undefined : (!isModeEnabled ? 'AI Mode disabled' : '0 AI credits remaining')
      };
    }

    case 'user': {
      let currentUsers = contextCounts?.usersCount ?? 1;
      const subMembers = (subInfo as any).invitedMembers;
      if (subMembers && typeof subMembers === 'object') {
        currentUsers = Math.max(currentUsers, Object.keys(subMembers).length + 1);
      }
      const maxUsers = tierConfig.maxUsers || 1;
      const isUnlimited = maxUsers >= 999999;
      const allowed = isUnlimited || currentUsers < maxUsers;

      return {
        allowed,
        resourceType: 'user',
        title: 'Team Member Limit Reached',
        description: allowed
          ? 'Team invitations available.'
          : `Your ${tier} Plan allows up to ${maxUsers} team member${maxUsers > 1 ? 's' : ''}. Upgrade your plan to invite more colleagues to this workspace.`,
        currentUsage: currentUsers,
        maxLimit: maxUsers,
        remaining: isUnlimited ? 999999 : Math.max(0, maxUsers - currentUsers),
        unitName: 'team members',
        resetDate: defaultResetDate,
        tier,
        canUpgrade: tier !== 'Enterprise',
        reason: allowed ? undefined : `Maximum user capacity reached (${currentUsers}/${maxUsers}).`
      };
    }

    case 'client': {
      const currentClients = contextCounts?.clientsCount ?? 0;
      const maxClients = tier === 'Free' ? 20 : tier === 'Starter' ? 100 : 999999;
      const isUnlimited = maxClients >= 999999;
      const allowed = isUnlimited || currentClients < maxClients;

      return {
        allowed,
        resourceType: 'client',
        title: 'Client Limit Reached',
        description: allowed
          ? 'Client creation available.'
          : `You have reached the limit of ${maxClients} clients for your ${tier} Plan. Please upgrade your plan to manage more clients.`,
        currentUsage: currentClients,
        maxLimit: maxClients,
        remaining: isUnlimited ? 999999 : Math.max(0, maxClients - currentClients),
        unitName: 'clients',
        resetDate: defaultResetDate,
        tier,
        canUpgrade: tier !== 'Enterprise'
      };
    }

    case 'service': {
      const currentServices = contextCounts?.servicesCount ?? 0;
      const maxServices = tier === 'Free' ? 20 : tier === 'Starter' ? 100 : 999999;
      const isUnlimited = maxServices >= 999999;
      const allowed = isUnlimited || currentServices < maxServices;

      return {
        allowed,
        resourceType: 'service',
        title: 'Service Catalog Limit Reached',
        description: allowed
          ? 'Service creation available.'
          : `You have reached the service catalog limit of ${maxServices} items for your ${tier} Plan. Upgrade to list unlimited services.`,
        currentUsage: currentServices,
        maxLimit: maxServices,
        remaining: isUnlimited ? 999999 : Math.max(0, maxServices - currentServices),
        unitName: 'services',
        resetDate: defaultResetDate,
        tier,
        canUpgrade: tier !== 'Enterprise'
      };
    }

    case 'project': {
      const currentProjects = contextCounts?.projectsCount ?? 0;
      const maxProjects = tier === 'Free' ? 5 : tier === 'Starter' ? 20 : 999999;
      const isUnlimited = maxProjects >= 999999;
      const allowed = isUnlimited || currentProjects < maxProjects;

      return {
        allowed,
        resourceType: 'project',
        title: 'Project Limit Reached',
        description: allowed
          ? 'Project creation available.'
          : `You have reached the maximum allowance of ${maxProjects} active projects for your ${tier} Plan. Please upgrade to create additional projects.`,
        currentUsage: currentProjects,
        maxLimit: maxProjects,
        remaining: isUnlimited ? 999999 : Math.max(0, maxProjects - currentProjects),
        unitName: 'projects',
        resetDate: defaultResetDate,
        tier,
        canUpgrade: tier !== 'Enterprise'
      };
    }

    case 'document':
    default: {
      const currentDocs = contextCounts?.docsCount ?? 0;
      const maxDocs = tier === 'Free' ? 10 : tier === 'Starter' ? 50 : 999999;
      const isUnlimited = maxDocs >= 999999;
      const allowed = isUnlimited || currentDocs < maxDocs;

      return {
        allowed,
        resourceType: 'document',
        title: 'Document Limit Reached',
        description: allowed
          ? 'Document processing available.'
          : `You have used your document processing allowance for your ${tier} Plan (${currentDocs}/${maxDocs}). Upgrade your plan to process additional smart documents.`,
        currentUsage: currentDocs,
        maxLimit: maxDocs,
        remaining: isUnlimited ? 999999 : Math.max(0, maxDocs - currentDocs),
        unitName: 'documents',
        resetDate: defaultResetDate,
        tier,
        canUpgrade: tier !== 'Enterprise'
      };
    }
  }
}

/**
 * Dispatch a global custom event to trigger the ResourceLimitModal UI anywhere in the app
 */
export function triggerResourceLimitModal(details: ResourceLimitDetails): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cravebiz_resource_limit_reached', { detail: details }));
  }
}
