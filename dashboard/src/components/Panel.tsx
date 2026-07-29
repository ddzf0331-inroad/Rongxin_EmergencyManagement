import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  icon?: ReactNode;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, icon, className = "", action, children }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel__header">
        <div className="panel__title">
          <span className="panel__icon">{icon}</span>
          <span>{title}</span>
        </div>
        {action ?? <span className="panel__chevrons">{">>>>>"}</span>}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
