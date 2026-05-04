export function Card({ children, className = '' }) {
  return (
    <div className={`glass p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

export function SummaryCard({ label, value, sub, color = 'text-gray-800 dark:text-gray-100', icon }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
