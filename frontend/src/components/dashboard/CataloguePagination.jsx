import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export default function CataloguePagination({ pagination, disabled, onPageChange }) {
  if (!pagination.pages || pagination.pages <= 1) return null;

  return (
    <nav aria-label="Course catalogue pages" className="mt-8 flex items-center justify-between gap-4 border-t border-stone-200 pt-6 dark:border-stone-800">
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:outline-terracotta-400"
        disabled={disabled || !pagination.hasPrevious}
        onClick={() => onPageChange(pagination.page - 1)}
        type="button"
      >
        <CaretLeft aria-hidden="true" size={17} weight="bold" />
        Previous
      </button>

      <p className="text-center text-sm text-stone-600 dark:text-stone-400">
        Page <span className="font-bold text-stone-900 dark:text-stone-100">{pagination.page}</span> of {pagination.pages}
      </p>

      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:outline-terracotta-400"
        disabled={disabled || !pagination.hasNext}
        onClick={() => onPageChange(pagination.page + 1)}
        type="button"
      >
        Next
        <CaretRight aria-hidden="true" size={17} weight="bold" />
      </button>
    </nav>
  );
}
