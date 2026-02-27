
import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'increase' | 'decrease';
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, changeType, icon }) => {
  const changeColor = changeType === 'increase' ? 'text-green-500' : 'text-red-500';
  const changeIcon = changeType === 'increase' ? '▲' : '▼';

  return (
    <div className="bg-white p-6 rounded-xl shadow-md flex items-start justify-between transition-all hover:shadow-lg hover:-translate-y-1">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
        {change && (
          <div className={`mt-2 flex items-center text-xs ${changeColor}`}>
            <span>{changeIcon} {change}</span>
            <span className="text-gray-400 ml-1">vs last month</span>
          </div>
        )}
      </div>
      <div className="bg-primary-100 text-primary-600 p-3 rounded-full">
        {icon}
      </div>
    </div>
  );
};

export default StatCard;