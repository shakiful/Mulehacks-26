import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

export function CategoryCard({
  title,
  description,
  to,
  icon: Icon,
  color,
}: {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <Link to={to} className="category-card group">
      <div className="flex items-center justify-between">
        <span className="shortcut-icon" style={{ backgroundColor: color }}>
          <Icon size={23} strokeWidth={1.6} />
        </span>
        <ArrowUpRight
          size={17}
          className="text-stone-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </div>
      <h3 className="mt-5 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">
        {description}
      </p>
    </Link>
  );
}
