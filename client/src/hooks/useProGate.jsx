import React, { useState, useCallback } from 'react';
import { usePlan } from './usePlan';
import UpgradeModal from '../components/UpgradeModal';

export function useProGate() {
  const { isFree } = usePlan();
  const [modalState, setModalState] = useState({ isOpen: false, featureName: '' });

  const requirePro = useCallback((featureName) => {
    if (isFree) {
      setModalState({ isOpen: true, featureName });
      return false; // blocked
    }
    return true; // allowed
  }, [isFree]);

  // Force-open the upgrade modal (used when server returns permission-denied)
  const showUpgradeModal = useCallback((featureName) => {
    setModalState({ isOpen: true, featureName });
  }, []);

  const close = () => setModalState(prev => ({ ...prev, isOpen: false }));

  const UpgradeModalRenderer = useCallback(() => (
    <UpgradeModal 
      isOpen={modalState.isOpen} 
      featureName={modalState.featureName} 
      onClose={close} 
    />
  ), [modalState]);

  return { requirePro, showUpgradeModal, UpgradeModalRenderer };
}
