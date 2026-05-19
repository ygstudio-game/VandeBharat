import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export const KPICard = ({ 
  label, 
  value, 
  highlightColor = 'slate',
  icon
}) => {
  const colorMap = {
    emerald: 'text-success hover:scale-[1.02] transition-transform duration-200',
    amber: 'text-warning hover:scale-[1.02] transition-transform duration-200',
    red: 'text-destructive hover:scale-[1.02] transition-transform duration-200',
    cyan: 'text-processing hover:scale-[1.02] transition-transform duration-200',
    blue: 'text-blue-600 hover:scale-[1.02] transition-transform duration-200',
    slate: 'text-foreground hover:scale-[1.02] transition-transform duration-200',
  };

  const bgBorderMap = {
    emerald: 'border-l-4 border-l-success',
    amber: 'border-l-4 border-l-warning',
    red: 'border-l-4 border-l-destructive',
    cyan: 'border-l-4 border-l-processing',
    blue: 'border-l-4 border-l-blue-600',
    slate: 'border-l-4 border-l-primary',
  };

  return (
    <Card className={`bg-card border border-border shadow-sm overflow-hidden ${bgBorderMap[highlightColor]}`}>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
          <p className={`text-2xl font-black font-mono tracking-tight ${colorMap[highlightColor]}`}>
            {value}
          </p>
        </div>
        {icon && (
          <div className="text-muted-foreground/60 bg-muted p-2 rounded-md">
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
