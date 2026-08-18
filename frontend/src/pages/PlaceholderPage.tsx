interface Props {
  title: string;
  subtitle: string;
}

export default function PlaceholderPage({ title, subtitle }: Props) {
  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">{subtitle}</div>
        </div>
      </div>
      <div className="card">
        <div className="empty">Розділ підключимо до реальних даних наступним кроком.</div>
      </div>
    </section>
  );
}
