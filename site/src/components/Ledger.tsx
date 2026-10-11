import type { Cell, Scope } from "../model/scope";

/**
 * A ledger of cells that all belong to one scope (SPLIT or WINDOW). The scope is a DOM attribute so a test can fail
 * on any cell that mixes the two (the scope guard).
 */
export function Ledger({ caption, scope, cells, className = "", note }: { caption: string; scope: Scope; cells: Cell[]; className?: string; note?: string }) {
  return (
    <div role="group" className={`ledger ledger--${scope.toLowerCase()} ${className}`} data-scope={scope} aria-label={caption}>
      <p className="ledger__cap">{caption}</p>
      <dl className="ledger__cells">
        {cells.map((c) => (
          <div key={c.key} className="ledger__cell" data-scope={c.scope} title={c.title}>
            <dt>{c.label}</dt>
            <dd className="tnum">{c.value}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="ledger__note">{note}</p> : null}
    </div>
  );
}
