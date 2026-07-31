# Estado do projeto

Atualizado ao fim de cada task. O que é permanente fica no `CLAUDE.md`;
aqui fica o que muda.

## Onde estamos

**Plano ativo:** `docs/superpowers/plans/2026-07-31-fundacao-passos-0-3.md`
**Task atual:** 1 — Baseline limpo e memória do agente
**Spec:** `docs/superpowers/specs/2026-07-31-remodelagem-tapedido-design.md`

## Contexto que não está no código

- Os primeiros lojistas reais entram em **01/08/2026**. Antes disso o schema é
  livre; depois, toda mudança de tabela vira migração com dado de cliente.
- O app do garçom é outro repositório: `C:\Users\ANDERSON\tapedido-food-garcom`,
  publicado em https://tapedido-food-garcom.vercel.app
- Referência de regra de negócio para delivery: `C:\Users\ANDERSON\DEPGEST`
  (mesmo domínio, TypeScript). `MecOS-APP OFICINA` foi avaliado e descartado —
  domínio de oficina mecânica, sem sobreposição.
- O anúncio promete 8 recursos que ainda não existem. Levantamento completo na
  seção 2 do spec.

## Decisões tomadas

| Data | Decisão | Motivo |
|---|---|---|
| 31/07 | Segurança antes de qualquer feature | Janela sem base instalada fecha em 01/08 |
| 31/07 | Todo o schema entra de uma vez na Task 2 | Depois de 01/08 vira migração arriscada |
| 31/07 | Baixa de estoque desconta o próprio produto, não ficha técnica | É o que o anúncio promete; sem cadastro extra |
| 31/07 | Testes só nos caminhos de dinheiro e estoque | Pega o que custa dinheiro sem virar projeto de testes |
| 31/07 | `db.js` fatiado por domínio junto de cada feature | Evita refatoração grande sem testes |
| 31/07 | Trabalhar direto na `main` | Projeto de um dev só, prazo de um dia; cada task commita separada e reverte sozinha |

## Concluído

### Task 1 — Baseline limpo e memória do agente (31/07)

- Trabalho de segurança de 30/07 commitado em `4b8dddd1` (JWT no PDV, três
  Edge Functions, spec do app do garçom). Verificado antes de commitar que o
  diff não toca em caixa, pedido nem estoque.
- Removidos 7 worktrees abandonados em `.claude/worktrees/`, todos com último
  commit de maio/2026.
- Criados `CLAUDE.md` e este arquivo.

## Próximo

Tasks 2 a 6 do plano ativo. Depois, o plano das 8 features do anúncio.
