import React, { useEffect, useState } from 'react';
import { fetchAiCreditsInfo } from '../services/aiGenerationService.ts';
import Icon from './common/Icon.tsx';

export const AiCreditDashboard: React.FC<{ companyId: string }> = ({ companyId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [creditsInfo, setCreditsInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCredits = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAiCreditsInfo();
      if (data) {
        setCreditsInfo(data);
      } else {
        setError('Unable to fetch AI credits information.');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading AI credits.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredits();

    const handleSubChange = () => {
      loadCredits();
    };

    window.addEventListener('cravebiz_subscription_change', handleSubChange);
    return () => {
      window.removeEventListener('cravebiz_subscription_change', handleSubChange);
    };
  }, [companyId]);

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-gray-500 text-sm font-medium">
          <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading AI Credits Depletion Engine...</span>
        </div>
      </div>
    );
  }

  if (error || !creditsInfo) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">AI Credit Management</h3>
          <button
            onClick={loadCredits}
            className="text-xs text-primary-600 hover:text-primary-800 font-semibold flex items-center gap-1"
          >
            <Icon name="refresh" className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
        <p className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl">{error || 'Failed to load credit details.'}</p>
      </div>
    );
  }

  const {
    totalCredits = 100,
    remainingCredits = 100,
    creditsUsed = 0,
    lastResetDate,
    subscriptionPlan = 'Free',
    logs = []
  } = creditsInfo;

  const percentageUsed = Math.min(100, Math.round((creditsUsed / (totalCredits || 1)) * 100));

  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">AI Credit Depletion System</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-medium">
            Real-time server-enforced AI usage tracker & audit logs
          </p>
        </div>
        <button
          onClick={loadCredits}
          className="self-start sm:self-auto px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all flex items-center gap-1.5"
        >
          <Icon name="refresh" className="w-3.5 h-3.5" />
          <span>Refresh Credits</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100/80">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Subscription Plan</p>
          <p className="text-lg font-black text-gray-900 mt-1">{subscriptionPlan}</p>
        </div>

        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100/80">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total AI Credits</p>
          <p className="text-lg font-black text-gray-900 mt-1">{totalCredits.toLocaleString()}</p>
        </div>

        <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/60">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Remaining Credits</p>
          <p className="text-lg font-black text-emerald-700 mt-1">{remainingCredits.toLocaleString()}</p>
        </div>

        <div className="bg-amber-50/40 p-4 rounded-2xl border border-amber-100/60">
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Credits Used</p>
          <p className="text-lg font-black text-amber-700 mt-1">{creditsUsed.toLocaleString()}</p>
        </div>

        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100/80 col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Reset Date</p>
          <p className="text-xs font-bold text-gray-700 mt-2 truncate">
            {lastResetDate ? new Date(lastResetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
          </p>
        </div>
      </div>

      {/* Visual Usage Bar */}
      <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
        <div className="flex justify-between items-center text-xs font-bold text-gray-600">
          <span>AI Credit Depletion Rate</span>
          <span>{remainingCredits} remaining ({percentageUsed}% consumed)</span>
        </div>
        <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              remainingCredits <= 2 ? 'bg-rose-500' : remainingCredits < 10 ? 'bg-amber-500' : 'bg-primary-600'
            }`}
            style={{ width: `${Math.max(5, 100 - percentageUsed)}%` }}
          ></div>
        </div>
      </div>

      {/* AI Request Logs Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">AI Request Audit Logs</h4>
          <span className="text-[10px] text-gray-400 font-medium">
            {logs.length} request{logs.length === 1 ? '' : 's'} recorded
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs">
            No AI requests logged yet. Credits will be automatically deducted after successful requests.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b border-gray-100">
                <tr>
                  <th className="py-3 px-4">Feature Used</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Credits Deducted</th>
                  <th className="py-3 px-4 text-right">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {logs.map((log: any, idx: number) => (
                  <tr key={log.id || idx} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {log.featureUsed}
                    </td>
                    <td className="py-3 px-4">
                      {log.status === 'Success' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      {log.status === 'Success' ? `-${log.creditsDeducted || 1}` : '0'}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-400 font-mono text-[11px]">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
