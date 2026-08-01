"use client";

import { Plane, Globe } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  type: "green" | "blue" | "dark";
}

export function StatCard({ title, value, type }: StatCardProps) {
  const getStyles = () => {
    switch (type) {
      case "green":
        return {
          headerBg: "bg-[#00BFA6]",
          icon: <Plane className="w-12 h-12 text-[#00BFA6] rotate-45 opacity-20 absolute -right-2 -bottom-2" />,
          illustration: "✈️", // Placeholder for 3D jet
        };
      case "blue":
        return {
          headerBg: "bg-[#3B82F6]",
          icon: <Plane className="w-12 h-12 text-[#3B82F6] rotate-45 opacity-20 absolute -right-2 -bottom-2" />,
          illustration: "🛫", // Placeholder
        };
      case "dark":
        return {
          headerBg: "bg-[#0A1A2F]",
          icon: <Globe className="w-12 h-12 text-[#0A1A2F] opacity-20 absolute -right-2 -bottom-2" />,
          illustration: "🌍", // Placeholder
        };
    }
  };

  const styles = getStyles();

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 flex flex-col relative h-full">
      <div className={`${styles.headerBg} h-3 w-full`} />
      <div className="p-6 flex-1 flex flex-col relative overflow-hidden">
        <h3 className="text-slate-400 font-medium mb-1">{title}</h3>
        <div className="text-3xl font-bold text-slate-800">{value}</div>
        
        {/* Background icon */}
        {styles.icon}
        
        {/* Mockup for the 3D illustration mentioned in the prompt */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-80">
          {styles.illustration}
        </div>
      </div>
    </div>
  );
}
