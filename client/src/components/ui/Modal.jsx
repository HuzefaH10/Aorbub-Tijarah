import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Modal({ title, children, onClose }) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{title}</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <X size={18} className="text-gray-400 dark:text-gray-500" />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/* Password Modal */
export function PasswordModal({ onConfirm, onCancel }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const check = () => {
    if (pw === 'edit123') onConfirm();
    else setError('Incorrect password');
  };

  return (
    <Modal title="Authentication Required" onClose={onCancel}>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Enter password to continue</p>
      <input
        type="password"
        value={pw}
        onChange={(e) => { setPw(e.target.value); setError(''); }}
        onKeyDown={(e) => e.key === 'Enter' && check()}
        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
        placeholder="Enter password"
        autoFocus
      />
      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      <div className="flex gap-3 mt-5">
        <button
          onClick={check}
          className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
