import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ComponentProps } from 'react'
import { AgentUsageSection } from './AgentUsageSection'
import type { DashboardAgentUsageView } from '../../types/dashboardPageView'

const baseUsage: DashboardAgentUsageView = {
  totalMessages: 10,
  agents: [
    {
      trailId: 'Trilha - Matemática',
      label: 'Matemática',
      messages: 6,
      uniqueStudents: 2,
      pctOfTotal: 60,
      lastActivityLabel: '18/09/2026, 14:00',
      studentIds: ['s1', 's2'],
    },
    {
      trailId: 'Tutor - Linguagens',
      label: 'Linguagens',
      messages: 4,
      uniqueStudents: 1,
      pctOfTotal: 40,
      lastActivityLabel: '18/09/2026, 15:00',
      studentIds: ['s3'],
    },
    {
      trailId: 'Trilha - Geral',
      label: 'Geral',
      messages: 0,
      uniqueStudents: 0,
      pctOfTotal: 0,
      lastActivityLabel: '—',
      studentIds: [],
    },
  ],
  series: [
    { date: '2026-09-18', trailId: 'Trilha - Matemática', label: 'Matemática', messages: 3 },
    { date: '2026-09-19', trailId: 'Tutor - Linguagens', label: 'Linguagens', messages: 2 },
  ],
}

const emptyUsage: DashboardAgentUsageView = {
  totalMessages: 0,
  agents: baseUsage.agents.map((a) => ({
    ...a,
    messages: 0,
    uniqueStudents: 0,
    pctOfTotal: 0,
    lastActivityLabel: '—',
    studentIds: [],
  })),
  series: [],
}

function renderSection(
  props: Partial<ComponentProps<typeof AgentUsageSection>> = {},
) {
  const onPeriodDaysChange = vi.fn()
  const onSelectAgentTrailId = vi.fn()
  const view = render(
    <MemoryRouter>
      <AgentUsageSection
        agentUsage={baseUsage}
        periodDays={0}
        onPeriodDaysChange={onPeriodDaysChange}
        loading={false}
        selectedAgentTrailId={null}
        onSelectAgentTrailId={onSelectAgentTrailId}
        selectedAgentStudents={[]}
        {...props}
      />
    </MemoryRouter>,
  )
  return { ...view, onPeriodDaysChange, onSelectAgentTrailId }
}

describe('AgentUsageSection', () => {
  it('mostra empty state quando não há mensagens', () => {
    renderSection({ agentUsage: emptyUsage })
    expect(
      screen.getByText('Nenhuma interação com agentes no período.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('mostra loading', () => {
    renderSection({ loading: true, agentUsage: emptyUsage })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Atualizando uso dos agentes…',
    )
  })

  it('renderiza tabela e gráficos com fixtures', () => {
    const { container } = renderSection()
    expect(container.querySelector('.dashboard-agent-usage')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Mensagens por agente' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Participação' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mensagens por dia' })).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getByText('Matemática')).toBeInTheDocument()
    expect(within(table).getByText('60%')).toBeInTheDocument()
    expect(within(table).getByText('Linguagens')).toBeInTheDocument()
  })

  it('permite trocar o período', async () => {
    const user = userEvent.setup()
    const { container, onPeriodDaysChange } = renderSection()
    const select = container.querySelector('select')
    expect(select).toBeTruthy()
    await user.selectOptions(select!, '7')
    expect(onPeriodDaysChange).toHaveBeenCalledWith(7)
  })

  it('seleciona agente ao clicar na linha e lista alunos', async () => {
    const user = userEvent.setup()
    const { onSelectAgentTrailId } = renderSection({
      selectedAgentTrailId: 'Trilha - Matemática',
      selectedAgentStudents: [
        { id: 's1', name: 'Ana', href: '/alunos/s1?agent_trail_id=Trilha%20-%20Matem%C3%A1tica' },
      ],
    })
    expect(screen.getByRole('heading', { name: 'Alunos em Matemática' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute(
      'href',
      '/alunos/s1?agent_trail_id=Trilha%20-%20Matem%C3%A1tica',
    )
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onSelectAgentTrailId).toHaveBeenCalledWith(null)
  })
})
