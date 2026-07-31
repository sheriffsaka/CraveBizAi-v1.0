import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, X, Check, Package, Tag, AlertCircle, Plus } from 'lucide-react';
import { Service } from '../../types';

export interface SearchableServiceSelectProps {
  services: Service[];
  selectedServiceId?: string;
  onSelectService: (service: Service | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  allowCustomItem?: boolean;
  onCustomItemSelect?: (customTerm: string) => void;
}

export const SearchableServiceSelect: React.FC<SearchableServiceSelectProps> = ({
  services = [],
  selectedServiceId,
  onSelectService,
  placeholder = "Search line item, service, or package...",
  disabled = false,
  className = "",
  label,
  allowCustomItem = true,
  onCustomItemSelect
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find currently selected service object
  const selectedService = useMemo(() => {
    if (!selectedServiceId) return null;
    return services.find(s => s.id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Filter and score services based on search query
  const filteredServices = useMemo(() => {
    if (!searchTerm.trim()) {
      return services.slice(0, 50); // Fast top results when query is empty
    }

    const term = searchTerm.toLowerCase().trim();

    const matches = services.filter(s => {
      const nameMatch = s.name.toLowerCase().includes(term);
      const pkgMatch = s.packageName ? s.packageName.toLowerCase().includes(term) : false;
      const categoryMatch = s.category ? s.category.toLowerCase().includes(term) : false;
      const descMatch = s.description ? s.description.toLowerCase().includes(term) : false;
      const priceMatch = s.price ? s.price.toString().includes(term) || `₦${s.price.toLocaleString()}`.includes(term) : false;

      return nameMatch || pkgMatch || categoryMatch || descMatch || priceMatch;
    });

    // Relevance sorting: Exact match -> Starts with match -> Includes match
    matches.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      if (aName === term && bName !== term) return -1;
      if (bName === term && aName !== term) return 1;

      const aStarts = aName.startsWith(term);
      const bStarts = bName.startsWith(term);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      return 0;
    });

    return matches.slice(0, 60); // Cap at 60 for optimal UI performance
  }, [services, searchTerm]);

  // Reset highlight index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(filteredServices.length > 0 ? 0 : -1);
  }, [filteredServices]);

  // Scroll highlighted item into view during arrow key navigation
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const itemElement = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      if (itemElement) {
        itemElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSelect = (service: Service | null) => {
    onSelectService(service);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectService(null);
    setSearchTerm('');
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCustomSelect = (termToUse?: string) => {
    const customText = termToUse || searchTerm;
    if (onCustomItemSelect && customText.trim()) {
      onCustomItemSelect(customText.trim());
    } else {
      onSelectService(null);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          if (filteredServices.length === 0) return -1;
          return prev < filteredServices.length - 1 ? prev + 1 : 0;
        });
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          if (filteredServices.length === 0) return -1;
          return prev > 0 ? prev - 1 : filteredServices.length - 1;
        });
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredServices.length) {
          handleSelect(filteredServices[highlightedIndex]);
        } else if (searchTerm.trim()) {
          handleCustomSelect();
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;

      case 'Tab':
        setIsOpen(false);
        break;

      default:
        break;
    }
  };

  // Helper function to highlight search term matches in text
  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim() || !text) return <span>{text}</span>;

    const parts = text.split(new RegExp(`(${query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-primary-100 text-primary-900 rounded font-extrabold px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">
          {label}
        </label>
      )}

      {/* Main Select Button / Input Trigger */}
      {!isOpen && selectedService ? (
        <div
          onClick={handleOpen}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleKeyDown}
          className={`group flex items-start justify-between w-full p-3 border rounded-lg bg-gray-50 text-gray-900 font-bold shadow-sm transition-all cursor-pointer hover:border-primary-400 focus:ring-2 focus:ring-primary-500 outline-none ${
            disabled ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-md bg-primary-100 text-primary-700 flex items-center justify-center shrink-0 font-extrabold text-xs mt-0.5">
              {selectedService.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-left space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-gray-900 text-sm leading-snug break-words whitespace-normal">
                  {selectedService.name}
                </span>
                {selectedService.packageName && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                    <Package className="w-2.5 h-2.5" />
                    {selectedService.packageName}
                  </span>
                )}
                {selectedService.category && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                    <Tag className="w-2.5 h-2.5" />
                    {selectedService.category}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 font-medium break-words leading-relaxed">
                ₦{selectedService.price.toLocaleString()} {selectedService.description ? `• ${selectedService.description}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            <button
              type="button"
              onClick={handleClearSelection}
              title="Change or clear line item"
              className="p-1.5 hover:bg-gray-200 text-gray-400 hover:text-gray-700 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors" />
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              value={searchTerm}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={selectedService ? selectedService.name : placeholder}
              className={`w-full pl-10 pr-10 py-3 border rounded-lg bg-gray-50 text-gray-900 font-bold text-sm shadow-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                disabled ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <ChevronDown
                onClick={() => setIsOpen(!isOpen)}
                className={`w-4 h-4 text-gray-400 absolute right-3 cursor-pointer transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            )}
          </div>
        </div>
      )}

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-[120] left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-1">
          {/* Top header bar */}
          <div className="px-3 py-2 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between text-[10px] font-black uppercase text-gray-400 tracking-wider">
            <span>
              {filteredServices.length} {filteredServices.length === 1 ? 'Item' : 'Items'} Found
            </span>
            <span className="text-[9px] text-gray-400 font-medium">Use ↑↓ keys to navigate</span>
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto divide-y divide-gray-50 p-1.5 focus:outline-none"
          >
            {filteredServices.map((service, idx) => {
              const isSelected = selectedServiceId === service.id;
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={service.id}
                  data-index={idx}
                  onClick={() => handleSelect(service)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-3 rounded-lg cursor-pointer transition-all flex flex-col sm:flex-row items-start justify-between gap-2.5 sm:gap-3 ${
                    isHighlighted
                      ? 'bg-primary-50 text-primary-900 border-l-4 border-primary-600'
                      : isSelected
                      ? 'bg-gray-100 text-gray-900'
                      : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <span className="font-extrabold text-sm text-gray-900 leading-snug break-words whitespace-normal">
                        {renderHighlightedText(service.name, searchTerm)}
                      </span>

                      {service.packageName && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0 mt-0.5">
                          <Package className="w-2.5 h-2.5" />
                          {renderHighlightedText(service.packageName, searchTerm)}
                        </span>
                      )}

                      {service.category && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0 mt-0.5">
                          <Tag className="w-2.5 h-2.5" />
                          {renderHighlightedText(service.category, searchTerm)}
                        </span>
                      )}
                    </div>

                    {service.description && (
                      <p className="text-xs text-gray-500 font-normal leading-relaxed break-words whitespace-normal mt-1">
                        {renderHighlightedText(service.description, searchTerm)}
                      </p>
                    )}
                  </div>

                  <div className="text-left sm:text-right shrink-0 flex items-center sm:flex-col sm:items-end gap-1.5 self-start sm:self-start pt-0.5">
                    <span className="font-black text-xs sm:text-sm text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md border border-primary-100/50">
                      ₦{service.price.toLocaleString()}
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600">
                        <Check className="w-3 h-3 stroke-[3]" /> Selected
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty State when no matching items found */}
            {filteredServices.length === 0 && (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 mx-auto flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">No matching line item found</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto break-words whitespace-normal">
                    No saved items match "{searchTerm}". You can use custom details or clear search terms.
                  </p>
                </div>

                {allowCustomItem && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleCustomSelect()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-xs font-bold hover:bg-primary-700 transition-colors shadow-sm break-words whitespace-normal text-left max-w-full"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span className="break-words">Use "{searchTerm || 'custom'}" as custom line item</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ad-hoc Custom Item Footer Option */}
          {allowCustomItem && filteredServices.length > 0 && (
            <div className="p-2 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleCustomSelect()}
                className="w-full py-2.5 px-3 text-left text-xs font-bold text-gray-600 hover:text-primary-700 hover:bg-white rounded-lg transition-all flex items-start gap-2 border border-dashed border-gray-200 break-words whitespace-normal"
              >
                <Plus className="w-3.5 h-3.5 text-primary-600 shrink-0 mt-0.5" />
                <span className="break-words min-w-0">
                  {searchTerm.trim()
                    ? `Enter "${searchTerm}" as ad-hoc custom line item`
                    : "Enter custom / ad-hoc line item details..."}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableServiceSelect;
