export type JourneyBandKey =
  | 'completed'
  | 'final'
  | 'mid'
  | 'start'
  | 'stalled'
  | 'notStarted'

export type JourneyBand = {
  key: JourneyBandKey
  label: string
  count: number
}

export type JourneyBandsProps = {
  bands: JourneyBand[]
  stalledHref?: string | null
  stalledLinkLabel?: string | null
}

const TONE: Record<JourneyBandKey, string> = {
  completed: '',
  final: '',
  mid: '',
  start: '',
  stalled: 'crias-journey__band--parado',
  notStarted: 'crias-journey__band--nao',
}

export function JourneyBands({
  bands,
  stalledHref,
  stalledLinkLabel,
}: JourneyBandsProps) {
  if (bands.length === 0) return null

  return (
    <section className="crias-journey" aria-label="Situação dos alunos">
      <div className="crias-journey__head">
        <div>
          <div className="crias-label">Situação dos alunos</div>
          <h2 className="crias-section-title" style={{ borderBottom: 0, paddingBottom: 0 }}>
            Onde cada aluno está
          </h2>
        </div>
        {stalledHref && stalledLinkLabel ? (
          <a href={stalledHref} style={{ fontSize: 14, fontWeight: 800 }}>
            {stalledLinkLabel} →
          </a>
        ) : null}
      </div>
      <div className="crias-journey__grid">
        {bands.map((band) => (
          <div
            key={band.key}
            className={`crias-journey__band ${TONE[band.key]}`.trim()}
          >
            <div className="crias-journey__band-count">{band.count}</div>
            <div className="crias-journey__band-label">{band.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
