import { Invoice, Client, Service, InvoiceStatus } from '../types';

export type DateRangeOption =
  | 'all_time'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

export interface GlobalFilterState {
  dateRange: DateRangeOption;
  customStartDate: string;
  customEndDate: string;
  selectedClientIds: string[];
  selectedServiceIds: string[];
  selectedStatuses: InvoiceStatus[];
  searchQuery: string;
}

export const DEFAULT_GLOBAL_FILTER: GlobalFilterState = {
  dateRange: 'all_time',
  customStartDate: '',
  customEndDate: '',
  selectedClientIds: [],
  selectedServiceIds: [],
  selectedStatuses: [],
  searchQuery: ''
};

const SESSION_STORAGE_KEY = 'cravebiz_global_filter_state';

export function loadGlobalFilterFromSession(): GlobalFilterState {
  try {
    const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_GLOBAL_FILTER,
        ...parsed
      };
    }
  } catch (e) {
    console.warn("Failed to load global filter from sessionStorage", e);
  }
  return DEFAULT_GLOBAL_FILTER;
}

export function saveGlobalFilterToSession(filter: GlobalFilterState): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filter));
  } catch (e) {
    console.warn("Failed to save global filter to sessionStorage", e);
  }
}

export function getDateBounds(
  dateRange: DateRangeOption,
  customStart?: string,
  customEnd?: string
): { startDate: Date | null; endDate: Date | null } {
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = new Date();
  endDate.setHours(23, 59, 59, 999);

  switch (dateRange) {
    case 'today': {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'yesterday': {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(now);
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'this_week': {
      startDate = new Date(now);
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'this_month': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    }
    case 'this_quarter': {
      const currentMonth = now.getMonth();
      const quarterStartMonth = currentMonth - (currentMonth % 3);
      startDate = new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
      break;
    }
    case 'this_year': {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
    }
    case 'custom': {
      startDate = customStart ? new Date(`${customStart}T00:00:00`) : null;
      endDate = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
      break;
    }
    case 'all_time':
    default: {
      startDate = null;
      endDate = null;
      break;
    }
  }

  return { startDate, endDate };
}

export function filterInvoices(
  invoices: Invoice[],
  services: Service[],
  clients: Client[],
  filter: GlobalFilterState,
  includeTemplates: boolean = false
): Invoice[] {
  const { startDate, endDate } = getDateBounds(
    filter.dateRange,
    filter.customStartDate,
    filter.customEndDate
  );

  return invoices.filter((inv) => {
    // 1. Recurring template check - ignore templates unless explicitly requested
    if (!includeTemplates && inv.isRecurringTemplate) return false;

    // 2. Date Filter check (by issueDate)
    if (startDate || endDate) {
      const invDate = new Date(inv.issueDate);
      if (startDate && invDate < startDate) return false;
      if (endDate && invDate > endDate) return false;
    }

    // 3. Client Filter check
    if (filter.selectedClientIds.length > 0) {
      if (!filter.selectedClientIds.includes(inv.clientId)) return false;
    }

    // 4. Service Filter check
    if (filter.selectedServiceIds.length > 0) {
      const matchesService = inv.items?.some((item) => {
        // Direct match by serviceId
        if (item.serviceId && filter.selectedServiceIds.includes(item.serviceId)) {
          return true;
        }
        // Match by service name in description
        const matchedSvc = services.find((s) => filter.selectedServiceIds.includes(s.id));
        if (
          matchedSvc &&
          item.description &&
          item.description.toLowerCase().includes(matchedSvc.name.toLowerCase())
        ) {
          return true;
        }
        return false;
      });

      if (!matchesService) return false;
    }

    // 5. Status Filter check
    if (filter.selectedStatuses.length > 0) {
      if (!filter.selectedStatuses.includes(inv.status)) return false;
    }

    // 6. Search Query check
    if (filter.searchQuery.trim().length > 0) {
      const query = filter.searchQuery.toLowerCase().trim();
      const clientName = clients.find((c) => c.id === inv.clientId)?.companyName || '';
      const invoiceNum = inv.invoiceNumber || '';
      const itemDescMatch = inv.items?.some((i) => i.description?.toLowerCase().includes(query));

      const matchesSearch =
        invoiceNum.toLowerCase().includes(query) ||
        clientName.toLowerCase().includes(query) ||
        inv.status.toLowerCase().includes(query) ||
        itemDescMatch;

      if (!matchesSearch) return false;
    }

    return true;
  });
}

export function isFilterActive(filter: GlobalFilterState): boolean {
  return (
    filter.dateRange !== 'all_time' ||
    filter.selectedClientIds.length > 0 ||
    filter.selectedServiceIds.length > 0 ||
    filter.selectedStatuses.length > 0 ||
    filter.searchQuery.trim().length > 0
  );
}
