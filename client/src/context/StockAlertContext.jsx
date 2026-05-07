import { createContext, useContext, useMemo } from 'react';
import { useProducts, useEntries, useStockLogs } from '../hooks/useFirestore';

const StockAlertContext = createContext({ alerts: [], outCount: 0, lowCount: 0 });

export function useStockAlerts() {
  return useContext(StockAlertContext);
}

export function StockAlertProvider({ children }) {
  const { products } = useProducts();
  const { entries } = useEntries();
  const { stockLogs } = useStockLogs();

  const alerts = useMemo(() => {
    return products
      .map(p => {
        const opening = Number(p.openingStock) || 0;
        const loaded = stockLogs
          .filter(l => l.productId === p.id)
          .reduce((sum, l) => sum + Number(l.quantityLoaded || 0), 0);
        const sold = entries
          .filter(e => e.product === p.name)
          .reduce((sum, e) => sum + Number(e.quantitySold || 0), 0);
        const currentStock = Math.max(0, opening + loaded - sold);
        const threshold = Number(p.lowStockThreshold) || 5;

        if (currentStock === 0) return { ...p, currentStock, threshold, status: 'out' };
        if (currentStock <= threshold) return { ...p, currentStock, threshold, status: 'low' };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.status === 'out' && b.status !== 'out') return -1;
        if (a.status !== 'out' && b.status === 'out') return 1;
        return a.name.localeCompare(b.name);
      });
  }, [products, entries, stockLogs]);

  const outCount = alerts.filter(a => a.status === 'out').length;
  const lowCount = alerts.filter(a => a.status === 'low').length;

  return (
    <StockAlertContext.Provider value={{ alerts, outCount, lowCount }}>
      {children}
    </StockAlertContext.Provider>
  );
}
