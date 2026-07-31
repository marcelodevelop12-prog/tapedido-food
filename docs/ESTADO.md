# Estado do projeto

Atualizado ao fim de cada task. O que é permanente fica no `CLAUDE.md`;
aqui fica o que muda.

## Onde estamos

**Plano ativo:** `docs/superpowers/plans/2026-07-31-fundacao-passos-0-3.md`
**Task atual:** 5 — App do garçom adota o JWT
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

### Task 2 — Schema definitivo (31/07, `72d0fa36`)

Todas as colunas das 8 features entraram de uma vez, antes de existir dado de
cliente. Verificado que aplicam num banco novo e que o índice único parcial
recusa baixa dupla do mesmo pedido, aceita outro produto no mesmo pedido e não
atrapalha entrada manual repetida.

### Task 3 — Infraestrutura de teste (31/07, `5d38b50d`)

`npm test` passa a existir. Três obstáculos caíram: o ABI do `better-sqlite3`
(resolvido rodando sob `ELECTRON_RUN_AS_NODE`), o caminho fixo do banco
(`TAPEDIDO_DB_PATH`), e o `postcss.config.js` em ESM que o Node 18 lia como
CommonJS (config de postcss inline no `vitest.config.js`).

### Task 4 — Testes dos caminhos de dinheiro (31/07, `80af3df2`)

19 testes em 4 arquivos, todos verdes. Congelam o comportamento atual de
pedido, caixa, dashboard e relatórios.

### Task 5 — App do garçom adota o JWT (31/07, parcial)

Código pronto e compilando, commitado em `6f0cb89` no repo do garçom. **Teste
end-to-end e publicação pendentes** — ver bloqueio abaixo.

O que mudou lá: `src/lib/sessao.js` novo, `accessToken` no cliente Supabase com
fallback para a chave anon, e a validação migrou da tela de código da loja para
a de login (a Edge Function recebe os dois códigos juntos). Isso também fechou
uma brecha: a tela antiga respondia se um código de loja existia, o que
permitia varrer códigos válidos.

## 🚧 BLOQUEIO ATIVO — `JWT_SECRET` não configurado

A Edge Function `entrar` responde **503 em toda chamada**, desde sempre —
confirmado nos logs, inclusive nas tentativas de 30/07 23:41. Nenhum token foi
emitido até hoje.

Causa, direto do código
(`supabase/functions/entrar/index.ts:224`): o secret `JWT_SECRET` (ou
`TAPEDIDO_JWT_SECRET`) não existe nos secrets da função, e ela devolve 503 de
propósito nesse caso.

**O valor precisa ser o JWT Secret do próprio projeto Supabase**, não um valor
aleatório. A função assina em HS256 e o Postgres verifica a assinatura com o
segredo do projeto; com um segredo diferente, os tokens seriam emitidos mas
`auth.jwt()` não os validaria — e, depois da virada da RLS, os dois apps
parariam de ler qualquer coisa.

Enquanto isso não for resolvido, **nada está quebrado**: sem token, os dois
apps usam a chave anon e funcionam como sempre. Mas as Tasks 5 e 6 não podem
fechar, e a janela de virar a RLS sem base instalada fecha em 01/08.

## Próximo

1. Configurar `JWT_SECRET` nos secrets da função `entrar` (ação manual no
   painel do Supabase — é credencial).
2. Retomar a Task 5 a partir do Step 7 (teste dos 4 cenários) e publicar.
3. Task 6: virada da RLS.
4. Depois, o plano das 8 features do anúncio.
