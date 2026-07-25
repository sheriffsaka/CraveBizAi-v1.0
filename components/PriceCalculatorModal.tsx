import React, { useState } from 'react';
import Modal from './Modal';
import { Calculator, Plus, Trash2, ArrowRight, Percent, DollarSign, Check } from 'lucide-react';

interface CostItem {
  id: string;
  label: string;
  amount: number | string;
}

interface PriceCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPrice: (price: number) => void;
  initialPrice?: number;
}

const PriceCalculatorModal: React.FC<PriceCalculatorModalProps> = ({
  isOpen,
  onClose,
  onApplyPrice,
  initialPrice = 0
}) => {
  const [directCosts, setDirectCosts] = useState<CostItem[]>([
    { id: 'dc_1', label: 'Direct Labor / Production', amount: 0 },
    { id: 'dc_2', label: 'Materials & Resources', amount: 0 }
  ]);

  const [indirectCosts, setIndirectCosts] = useState<CostItem[]>([
    { id: 'ic_1', label: 'Overhead & Admin', amount: 0 },
    { id: 'ic_2', label: 'Software / Tools License', amount: 0 }
  ]);

  const [profitPercent, setProfitPercent] = useState<number | string>(20);

  // Direct cost handlers
  const handleAddDirectCost = () => {
    setDirectCosts(prev => [
      ...prev,
      { id: `dc_${Date.now()}_${Math.random()}`, label: 'New Direct Cost', amount: '' }
    ]);
  };

  const handleUpdateDirectCost = (id: string, field: 'label' | 'amount', value: any) => {
    setDirectCosts(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveDirectCost = (id: string) => {
    if (directCosts.length <= 1) {
      setDirectCosts([{ id: `dc_${Date.now()}`, label: 'Direct Cost', amount: 0 }]);
      return;
    }
    setDirectCosts(prev => prev.filter(item => item.id !== id));
  };

  // Indirect cost handlers
  const handleAddIndirectCost = () => {
    setIndirectCosts(prev => [
      ...prev,
      { id: `ic_${Date.now()}_${Math.random()}`, label: 'New Indirect Cost', amount: '' }
    ]);
  };

  const handleUpdateIndirectCost = (id: string, field: 'label' | 'amount', value: any) => {
    setIndirectCosts(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveIndirectCost = (id: string) => {
    if (indirectCosts.length <= 1) {
      setIndirectCosts([{ id: `ic_${Date.now()}`, label: 'Indirect Cost', amount: 0 }]);
      return;
    }
    setIndirectCosts(prev => prev.filter(item => item.id !== id));
  };

  // Math Calculations
  const totalDirectCosts = directCosts.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );

  const totalIndirectCosts = indirectCosts.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );

  const totalCost = totalDirectCosts + totalIndirectCosts;
  const numProfitPercent = Math.max(0, Number(profitPercent) || 0);
  const profitAmount = totalCost * (numProfitPercent / 100);
  const calculatedSellingPrice = Math.round(totalCost + profitAmount);

  const handleApply = () => {
    onApplyPrice(calculatedSellingPrice);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Smart Price Calculator">
      <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
        {/* Intro */}
        <div className="bg-primary-50 p-3.5 rounded-xl border border-primary-100 flex items-start space-x-3 text-xs text-primary-900">
          <Calculator className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">Automated Pricing Engine</p>
            <p className="text-primary-700 mt-0.5">
              Enter your direct and indirect cost line items, plus your target profit margin (%). We'll compute your recommended Selling Price automatically.
            </p>
          </div>
        </div>

        {/* 1. Direct Costs */}
        <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <span>1. Direct Costs</span>
            </h4>
            <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
              Subtotal: ₦{totalDirectCosts.toLocaleString()}
            </span>
          </div>

          <div className="space-y-2">
            {directCosts.map((item, idx) => (
              <div key={item.id} className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="e.g. Developer Hourly Rate / Materials"
                  value={item.label}
                  onChange={e => handleUpdateDirectCost(item.id, 'label', e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1.5 text-xs text-gray-400 font-bold">₦</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={item.amount === 0 || item.amount === '' ? '' : item.amount}
                    onChange={e => handleUpdateDirectCost(item.id, 'amount', e.target.value)}
                    className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white font-semibold text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDirectCost(item.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddDirectCost}
            className="inline-flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors pt-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Direct Cost Item</span>
          </button>
        </div>

        {/* 2. Indirect Costs */}
        <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>2. Indirect Costs</span>
            </h4>
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
              Subtotal: ₦{totalIndirectCosts.toLocaleString()}
            </span>
          </div>

          <div className="space-y-2">
            {indirectCosts.map((item, idx) => (
              <div key={item.id} className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="e.g. Internet, Rent, Hosting"
                  value={item.label}
                  onChange={e => handleUpdateIndirectCost(item.id, 'label', e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1.5 text-xs text-gray-400 font-bold">₦</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={item.amount === 0 || item.amount === '' ? '' : item.amount}
                    onChange={e => handleUpdateIndirectCost(item.id, 'amount', e.target.value)}
                    className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white font-semibold text-gray-900 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveIndirectCost(item.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddIndirectCost}
            className="inline-flex items-center space-x-1 text-xs font-bold text-amber-600 hover:text-amber-800 transition-colors pt-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Indirect Cost Item</span>
          </button>
        </div>

        {/* 3. Profit Margin % */}
        <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center space-x-1.5">
              <Percent className="w-4 h-4 text-emerald-600" />
              <span>3. Target Profit Margin (%)</span>
            </label>
            <span className="text-xs font-bold text-emerald-700">
              Profit: +₦{Math.round(profitAmount).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative flex-1">
              <input
                type="number"
                min="0"
                max="500"
                value={profitPercent}
                onChange={e => setProfitPercent(e.target.value)}
                placeholder="20"
                className="w-full px-3 py-2 pr-8 text-sm font-bold border border-emerald-300 rounded-lg bg-white text-emerald-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-xs font-black text-emerald-600">%</span>
            </div>
            {/* Quick preset chips */}
            <div className="flex items-center space-x-1.5">
              {[15, 20, 25, 30, 40, 50].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setProfitPercent(pct)}
                  className={`px-2.5 py-1 text-3xs font-black rounded-lg transition-all ${
                    Number(profitPercent) === pct
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4. Calculation Breakdown Card */}
        <div className="bg-gradient-to-br from-gray-900 to-slate-800 text-white p-4 rounded-xl space-y-3 shadow-lg">
          <h5 className="text-4xs font-black uppercase tracking-widest text-emerald-400">Calculated Cost & Pricing Breakdown</h5>
          <div className="grid grid-cols-2 gap-2 text-xs border-b border-gray-700/60 pb-3">
            <div>
              <p className="text-gray-400 text-3xs">Total Direct Costs:</p>
              <p className="font-bold">₦{totalDirectCosts.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-3xs">Total Indirect Costs:</p>
              <p className="font-bold">₦{totalIndirectCosts.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-3xs">Total Cost (Direct + Indirect):</p>
              <p className="font-bold text-amber-300">₦{totalCost.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400 text-3xs">Profit ({numProfitPercent}%):</p>
              <p className="font-bold text-emerald-400">+₦{Math.round(profitAmount).toLocaleString()}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-3xs uppercase tracking-widest text-gray-300 font-bold">Recommended Selling Price</p>
              <p className="text-2xl font-black text-white tracking-tight">
                ₦{calculatedSellingPrice.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-md transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Apply Price to Form</span>
            </button>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PriceCalculatorModal;
