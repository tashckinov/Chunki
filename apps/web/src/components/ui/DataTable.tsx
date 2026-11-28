import { useState, type Key, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface DataTableColumn<Row> {
  id: string;
  label: string;
  cell: (row: Row) => ReactNode;
  sortValue?: (row: Row) => string | number | null;
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const sizes = [10, 25, 50];

export function DataTable<Row>({ rows, columns, rowKey, label, empty }: {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  rowKey: (row: Row) => Key;
  label: string;
  empty: string;
}) {
  const [sort, setSort] = useState<{ id: string; descending: boolean }>();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(sizes[0]);
  const lastPage = Math.max(0, Math.ceil(rows.length / size) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * size;
  const value = columns.find((column) => column.id === sort?.id)?.sortValue;
  const sorted = value && sort ? [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const cmp = typeof left === 'number' && typeof right === 'number'
      ? left - right : collator.compare(String(left), String(right));
    return sort.descending ? -cmp : cmp;
  }) : rows;

  return <div className="min-w-0 rounded-xl border border-border bg-surface">
    <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="border-b border-border bg-surface-subtle">
          <tr>{columns.map((column) => {
            const direction = sort?.id === column.id ? sort.descending ? 'descending' : 'ascending' : undefined;
            const Icon = direction === 'descending' ? ArrowDown : direction === 'ascending' ? ArrowUp : ArrowUpDown;
            return <th key={column.id} scope="col" aria-sort={direction} className="whitespace-nowrap px-4 py-2 font-semibold">
              {column.sortValue ? <button type="button" className="flex min-h-8 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => {
                  setSort({ id: column.id, descending: direction === 'ascending' });
                  setPage(0);
                }}>
                {column.label}<Icon size={14} className={direction ? 'text-accent' : 'text-text-secondary'} aria-hidden="true" />
              </button> : column.label}
            </th>;
          })}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.slice(start, start + size).map((row) => <tr key={rowKey(row)} className="hover:bg-surface-subtle">
            {columns.map((column) => <td key={column.id} className="px-4 py-2.5 align-middle">{column.cell(row)}</td>)}
          </tr>)}
          {!rows.length && <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-body-secondary">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
    {rows.length > 0 && <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-border px-4 py-2">
      <p className="text-meta tabular-nums" aria-live="polite">{start + 1}–{Math.min(start + size, rows.length)} из {rows.length}</p>
      <label className="flex items-center gap-2 text-meta">Строк на странице
        <select value={size} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-text"
          onChange={(event) => { setSize(Number(event.target.value)); setPage(0); }}>
          {sizes.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
      <nav className="flex items-center gap-1" aria-label="Страницы таблицы">
        <Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          <ChevronLeft size={16} aria-hidden="true" /><span className="sr-only">Предыдущая страница</span>
        </Button>
        <span className="text-meta tabular-nums">{currentPage + 1} / {lastPage + 1}</span>
        <Button size="sm" variant="ghost" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>
          <ChevronRight size={16} aria-hidden="true" /><span className="sr-only">Следующая страница</span>
        </Button>
      </nav>
    </div>}
  </div>;
}
