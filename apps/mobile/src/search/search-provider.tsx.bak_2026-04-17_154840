import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import SearchSheet from './search-sheet';

type SearchContextValue = {
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
};

const SearchContext = createContext<SearchContextValue>({
  isOpen: false,
  openSearch: () => {},
  closeSearch: () => {},
});

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<SearchContextValue>(() => {
    return {
      isOpen,
      openSearch,
      closeSearch,
    };
  }, [isOpen, openSearch, closeSearch]);

  return (
    <SearchContext.Provider value={value}>
      {children}
      <SearchSheet visible={isOpen} onClose={closeSearch} />
    </SearchContext.Provider>
  );
}

export function useGlobalSearch() {
  return useContext(SearchContext);
}
