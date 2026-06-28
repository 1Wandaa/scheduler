import React, { createContext, useContext } from 'react';
import { useFirestoreData } from '../hooks/useFirestoreData';

const AppDataContext = createContext(null);

export function AppDataProvider({ children, activeSemester, activeSchoolYear }) {
  const data = useFirestoreData(activeSemester, activeSchoolYear);
  return (
    <AppDataContext.Provider value={data}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
