"use client";

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  let strength: "weak" | "fair" | "good" | "strong" = "weak";
  if (score <= 2) strength = "weak";
  else if (score === 3) strength = "fair";
  else if (score === 4) strength = "good";
  else strength = "strong";

  if (!password) return null;

  const colors = {
    weak: "bg-red-500",
    fair: "bg-orange-500",
    good: "bg-yellow-500",
    strong: "bg-green-500",
  };

  const labels = {
    weak: "Faible",
    fair: "Moyen",
    good: "Bon",
    strong: "Fort",
  };

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              level <= score ? colors[strength] : "bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Force : {labels[strength]}
      </p>
    </div>
  );
}
