import React, { createContext, useContext, useState, useEffect } from 'react';

interface CompareContextType {
  selectedIds: string[];
  toggleListing: (id: string) => void;
  clearCompare: () => void;
  isMaxSelected: boolean;
}

const CompareContext = createContext<CompareContextType | undefined>(undefined);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('compare_listings');
    if (saved) {
      try {
        setSelectedIds(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load compare state', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('compare_listings', JSON.stringify(selectedIds));
  }, [selectedIds]);

  const toggleListing = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const clearCompare = () => setSelectedIds([]);

  return (
    <CompareContext.Provider
      value={{
        selectedIds,
        toggleListing,
        clearCompare,
        isMaxSelected: selectedIds.length >= 3,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (context === undefined) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
}
