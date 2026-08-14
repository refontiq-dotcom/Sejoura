"use client";

import { MoreHorizontal } from "lucide-react";

const trips = [
  {
    id: 1,
    name: "John Doe",
    destination: "Dubai",
    flight: "Boeing 787",
    members: 4,
    price: "$5,200",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=John"
  },
  {
    id: 2,
    name: "Martin Lopess",
    destination: "London",
    flight: "Airbus 811",
    members: 2,
    price: "$3,400",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Martin"
  }
];

export function LastTrips() {
  return (
    <div className="bg-[var(--card-bg,var(--surface))] rounded-3xl p-6 shadow-sm flex flex-col h-full border border-[var(--border)] relative">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Last Trips</h2>
          <p className="text-sm text-[var(--muted-foreground)]">Overview of latest month</p>
        </div>
        <button className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
          <MoreHorizontal className="w-5 h-5 text-[var(--muted-foreground)]" />
        </button>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[var(--muted-foreground)] text-sm border-b border-[var(--border)]">
              <th className="pb-4 font-medium">Members</th>
              <th className="pb-4 font-medium">Flight</th>
              <th className="pb-4 font-medium">Total Members</th>
              <th className="pb-4 font-medium">Ticket Price</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={trip.id} className="border-b border-[var(--border)] last:border-0">
                <td className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--muted)] overflow-hidden">
                      <img src={trip.avatar} alt={trip.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--foreground)]">{trip.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{trip.destination}</div>
                    </div>
                  </div>
                </td>
                <td className="py-4 text-[var(--foreground)] font-medium">{trip.flight}</td>
                <td className="py-4">
                  <div className="flex -space-x-2">
                    {[...Array(trip.members)].map((_, i) => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-[var(--card-border,var(--border))] bg-[var(--muted)] overflow-hidden">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${trip.name}${i}`} alt="member" />
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-4 font-bold text-[var(--foreground)]">{trip.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Visual connection point (underlays the left border) */}
      <div className="absolute top-1/2 -left-8 w-8 h-16 bg-[#00BFA6] -translate-y-1/2 -z-10 rounded-r-lg opacity-0" />
      {/* The actual connection is handled by the sidebar bridging over, but this is a fallback if needed */}
    </div>
  );
}
