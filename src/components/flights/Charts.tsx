"use client";

import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from "recharts";
import { MoreHorizontal } from "lucide-react";

const barData = [
  { name: 'Jan', green: 40, blue: 24 },
  { name: 'Feb', green: 30, blue: 13 },
  { name: 'Mar', green: 20, blue: 48 },
  { name: 'Apr', green: 27, blue: 39 },
  { name: 'May', green: 18, blue: 48 },
  { name: 'Jun', green: 23, blue: 38 },
];

const pieData = [
  { name: 'A', value: 400, color: '#3B82F6' },
  { name: 'B', value: 300, color: '#00BFA6' },
  { name: 'C', value: 300, color: '#F97316' },
  { name: 'D', value: 200, color: '#EC4899' },
];

const lineData = [
  { name: '1', green: 10, blue: 30 },
  { name: '2', green: 20, blue: 25 },
  { name: '3', green: 45, blue: 20 },
  { name: '4', green: 30, blue: 40 },
  { name: '5', green: 50, blue: 35 },
  { name: '6', green: 40, blue: 55 },
];

export function StatisticsChart() {
  return (
    <div className="bg-[var(--card)] rounded-3xl p-6 shadow-sm border border-[var(--border)] flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-[var(--foreground)]">Statistics</h2>
        <button className="p-2 hover:bg-[var(--muted)] rounded-full">
          <MoreHorizontal className="w-5 h-5 text-[var(--muted-foreground)]" />
        </button>
      </div>
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
            <Tooltip cursor={{fill: 'transparent'}} />
            <Bar dataKey="green" fill="#00BFA6" radius={[4, 4, 0, 0]} barSize={12} />
            <Bar dataKey="blue" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function FlightsShareChart() {
  return (
    <div className="bg-[var(--card)] rounded-3xl p-6 shadow-sm border border-[var(--border)] flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-[var(--foreground)]">Flights Share</h2>
        <button className="p-2 hover:bg-[var(--muted)] rounded-full">
          <MoreHorizontal className="w-5 h-5 text-[var(--muted-foreground)]" />
        </button>
      </div>
      <div className="flex-1 min-h-[200px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function FlightsScheduleChart() {
  return (
    <div className="bg-[var(--card)] rounded-3xl p-6 shadow-sm border border-[var(--border)] flex flex-col h-full relative overflow-hidden">
      <div className="flex justify-between items-center mb-4 z-10">
        <h2 className="text-xl font-bold text-[var(--foreground)]">Flights Schedule</h2>
        <button className="p-2 hover:bg-[var(--muted)] rounded-full">
          <MoreHorizontal className="w-5 h-5 text-[var(--muted-foreground)]" />
        </button>
      </div>
      <div className="absolute top-1/4 right-8 bg-[var(--card)] shadow-lg rounded-full px-4 py-2 text-sm font-bold text-[var(--foreground)] z-10 border border-[var(--border)]">
        3500 Passengers
      </div>
      <div className="flex-1 min-h-[200px] -mx-4 -mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lineData}>
            <Line type="monotone" dataKey="green" stroke="#00BFA6" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="blue" stroke="#3B82F6" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
