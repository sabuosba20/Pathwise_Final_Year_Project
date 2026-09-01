import { FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react";

const SELECTS = [
  { key: "provider", label: "Provider", optionKey: "providers", emptyLabel: "All providers" },
  { key: "category", label: "Subject category", optionKey: "categories", emptyLabel: "All categories" },
  { key: "difficulty", label: "Difficulty", optionKey: "difficulties", emptyLabel: "All difficulties" },
  { key: "resourceType", label: "Resource type", optionKey: "resourceTypes", emptyLabel: "All resource types" },
];

export default function CatalogueFilters({
  query,
  filters,
  options,
  hasActiveFilters,
  onQueryChange,
  onFilterChange,
  onClear,
}) {
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_18px_50px_rgb(28_25_23/0.05)] dark:border-stone-800 dark:bg-stone-900 dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <FunnelSimple aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-400" size={20} weight="bold" />
            Filter catalogue
          </h2>
          {hasActiveFilters && (
            <button
              className="text-sm font-semibold text-terracotta-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:focus-visible:outline-terracotta-400"
              onClick={onClear}
              type="button"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-5 space-y-4">
          <label className="block" htmlFor="catalogue-search">
            <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Search courses</span>
            <span className="relative mt-2 block">
              <MagnifyingGlass
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500"
                size={18}
              />
              <input
                className="min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 pr-10 pl-10 text-sm text-stone-950 placeholder:text-stone-500 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400"
                id="catalogue-search"
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Title, skill, or subject"
                type="search"
                value={query}
              />
              {query && (
                <button
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:hover:bg-stone-800 dark:hover:text-stone-100 dark:focus-visible:outline-terracotta-400"
                  onClick={() => onQueryChange("")}
                  type="button"
                >
                  <X aria-hidden="true" size={16} weight="bold" />
                </button>
              )}
            </span>
          </label>

          {SELECTS.map((select) => (
            <label className="block" htmlFor={`catalogue-${select.key}`} key={select.key}>
              <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">{select.label}</span>
              <select
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm text-stone-950 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400"
                id={`catalogue-${select.key}`}
                onChange={(event) => onFilterChange(select.key, event.target.value)}
                value={filters[select.key]}
              >
                <option value="">{select.emptyLabel}</option>
                {(options[select.optionKey] || []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}
