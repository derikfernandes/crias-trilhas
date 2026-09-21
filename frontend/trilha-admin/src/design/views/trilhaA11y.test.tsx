import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { StudentShellView } from '../layouts/StudentShellView'
import { TrilhaHomePageView } from './TrilhaHomePageView'
import { TrilhaLoginPageView } from './TrilhaLoginPageView'
import { TrilhaPlayerPageView } from './TrilhaPlayerPageView'

const noop = () => {}

describe('Trilha a11y — login / home / player', () => {
  it('login: telefone rotulado, erro em alert, aria-invalid', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())

    const { rerender } = render(
      <TrilhaLoginPageView
        phone="12"
        submitting={false}
        formError={null}
        onPhoneChange={noop}
        onSubmit={onSubmit}
      />,
    )

    const phone = screen.getByLabelText(/telefone/i)
    expect(phone).toHaveAttribute('type', 'tel')
    expect(phone).not.toHaveAttribute('aria-invalid')

    rerender(
      <TrilhaLoginPageView
        phone="12"
        submitting={false}
        formError="Não encontrámos este número."
        onPhoneChange={noop}
        onSubmit={onSubmit}
      />,
    )

    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone).toHaveAttribute('aria-describedby', 'trilha-login-error')
    expect(screen.getByRole('alert')).toHaveTextContent(/não encontrámos/i)

    await user.click(screen.getByRole('button', { name: /entrar/i }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('home: landmarks, CTA, link WhatsApp anuncia nova janela', () => {
    render(
      <MemoryRouter>
        <StudentShellView studentName="Ana" onLogout={noop}>
          <TrilhaHomePageView
            studentName="Ana"
            trailTitle="Trilha Crias"
            stageNumber={2}
            questionNumber={1}
            progressRatio={0.4}
            status="in_progress"
            canContinue
            whatsappHelpHref="https://wa.me/5512974085258"
            loadState="ready"
            onContinue={noop}
          />
        </StudentShellView>
      </MemoryRouter>,
    )

    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /navegação do aluno/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^trilha$/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { level: 1, name: /sua trilha/i }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    expect(
      screen.getByRole('link', {
        name: /tirar dúvida no whatsapp \(abre numa nova janela\)/i,
      }),
    ).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled()
  })

  it('home loading: anuncia estado busy com texto para leitores de ecrã', () => {
    render(
      <TrilhaHomePageView
        studentName="Ana"
        trailTitle=""
        stageNumber={1}
        questionNumber={1}
        progressRatio={null}
        status="not_started"
        canContinue={false}
        loadState="loading"
        onContinue={noop}
      />,
    )

    expect(screen.getByText(/a carregar a sua trilha/i)).toBeInTheDocument()
    expect(screen.getByText(/a carregar a sua trilha/i).parentElement).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('player: h1, alerta de erro, formulário de exercício com fieldset', async () => {
    const user = userEvent.setup()
    const onSubmitAnswer = vi.fn()

    render(
      <TrilhaPlayerPageView
        stageNumber={3}
        questionNumber={2}
        stageType="exercise"
        title="Questão de leitura"
        body="Qual a resposta?"
        options={['A', 'B']}
        nextAction="await_answer"
        submitting={false}
        answerValue=""
        loadState="ready"
        onAnswerChange={noop}
        onContinue={noop}
        onSubmitAnswer={onSubmitAnswer}
        onBack={noop}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: /questão de leitura/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()

    const group = screen.getByRole('group', { name: /escolha uma opção/i })
    expect(within(group).getByLabelText('A')).toBeInTheDocument()
    expect(within(group).getByLabelText('B')).toBeInTheDocument()

    await user.click(within(group).getByLabelText('A'))
  })

  it('player: conflito usa role=status; loading anuncia', () => {
    const { rerender } = render(
      <TrilhaPlayerPageView
        stageNumber={1}
        questionNumber={1}
        stageType="fixed"
        body="Texto"
        options={null}
        nextAction="deliver_content"
        submitting={false}
        answerValue=""
        loadState="ready"
        conflictMessage="O progresso foi atualizado noutro dispositivo."
        onAnswerChange={noop}
        onContinue={noop}
        onSubmitAnswer={noop}
        onBack={noop}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/noutro dispositivo/i)

    rerender(
      <TrilhaPlayerPageView
        stageNumber={1}
        questionNumber={1}
        stageType="fixed"
        body=""
        options={null}
        nextAction="deliver_content"
        submitting={false}
        answerValue=""
        loadState="loading"
        onAnswerChange={noop}
        onContinue={noop}
        onSubmitAnswer={noop}
        onBack={noop}
      />,
    )

    expect(screen.getByText(/a carregar o passo da trilha/i)).toBeInTheDocument()
  })

  it('player erro: banner alert + h1 landmark', () => {
    render(
      <TrilhaPlayerPageView
        stageNumber={1}
        questionNumber={1}
        stageType="fixed"
        body=""
        options={null}
        nextAction="deliver_content"
        submitting={false}
        answerValue=""
        loadState="error"
        errorMessage="Falha de rede"
        onAnswerChange={noop}
        onContinue={noop}
        onSubmitAnswer={noop}
        onBack={noop}
        onRetry={noop}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: /player da trilha/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/falha de rede/i)
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
  })
})
