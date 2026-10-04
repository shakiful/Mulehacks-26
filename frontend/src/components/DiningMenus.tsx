import { ExternalLink, RefreshCw, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import { EmptyState, ErrorState, LoadingState } from "./States";

const campusDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const officialMenus = [
  { name: "Todd", url: "https://ucmo.sodexomyway.com/en-us/locations/todd-dining-center-in-todd-hall" },
  { name: "Ellis", url: "https://ucmo.sodexomyway.com/en-us/locations/ellis-dining-center" },
];

export function DiningMenus() {
  const { api, isMock, scenario } = useApi();
  const [day, setDay] = useState(campusDate);
  const menus = useResource(() => api.getDiningMenus(), [api, scenario, day]);
  useEffect(() => {
    // An open page requests the new day after midnight in UCM's time zone.
    const timer = window.setInterval(() => setDay(campusDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dateLabel = menus.data && new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date(`${menus.data.date}T12:00:00Z`));

  return (
    <section id="dining-menus" aria-labelledby="dining-menu-heading" className="form-panel mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2"><Utensils size={14} /> UCM DINING · SODEXO</p>
          <h2 id="dining-menu-heading" className="mt-2 text-xl font-semibold">
            {isMock ? "Dining menu examples" : "Today’s dining menus"}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {dateLabel ? `${dateLabel} · Central time` : "Todd and Ellis Dining Centers · Central time"}
          </p>
        </div>
        <button className="button-secondary" disabled={menus.loading} onClick={menus.reload}>
          <RefreshCw size={14} /> Refresh menus
        </button>
      </div>
      {isMock && <p className="notice mt-4">Synthetic menu examples with a fixed date. Switch to live API mode for today’s Sodexo menus.</p>}
      <div className="mt-5">
        {menus.loading ? <LoadingState label="Loading today’s Todd and Ellis menus…" /> :
          menus.error ? <ErrorState error={menus.error} retry={menus.reload} /> :
          menus.data && <div className="grid items-start gap-5 lg:grid-cols-2">
            {menus.data.halls.map((hall) => (
              <article key={hall.id} aria-labelledby={`dining-${hall.id}-heading`} className="min-w-0 rounded-xl border border-stone-200 bg-white p-5">
                <h3 id={`dining-${hall.id}-heading`} className="text-lg font-semibold">{hall.name}</h3>
                {hall.status === "AVAILABLE" ? <div className="mt-4 space-y-3">
                  {hall.meals.map((meal, index) => (
                    <details key={`${meal.name}-${index}`} open={index === 0} className="rounded-lg border border-stone-200">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{meal.name}</summary>
                      <div role="region" aria-label={`${hall.name} ${meal.name} items`} tabIndex={0}
                        className="max-h-80 space-y-5 overflow-y-auto border-t border-stone-100 p-4">
                        {meal.stations.map((station, stationIndex) => (
                          <div key={`${station.name}-${stationIndex}`}>
                            <h4 className="break-words text-sm font-semibold text-emerald-900">{station.name}</h4>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
                              {station.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`} className="break-words">{item}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div> : hall.status === "EMPTY" ? <div className="mt-4">
                  <EmptyState title="No menu published" description={hall.message ?? "Check the official menu for updates."} />
                </div> : <div className="mt-4">
                  <ErrorState error={new Error(hall.message ?? "This dining menu is unavailable.")} retry={menus.reload} />
                </div>}
                <a className="text-button mt-4" href={hall.source_url} target="_blank" rel="noopener noreferrer">
                  Open {hall.id === "todd" ? "Todd" : "Ellis"} on Sodexo <ExternalLink size={14} />
                </a>
              </article>
            ))}
          </div>}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-stone-600">
        Menus may change. Check Sodexo for ingredients, nutrition, allergens and dining hours.
        {menus.data && !isMock && ` Checked at ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(menus.data.fetched_at))}.`}
      </p>
      <div className="mt-2 flex flex-wrap gap-5">
        {officialMenus.map((menu) => <a key={menu.name} className="text-button" href={menu.url} target="_blank" rel="noopener noreferrer">
          Official {menu.name} menu <ExternalLink size={12} />
        </a>)}
      </div>
    </section>
  );
}
