# Estado do projeto

Atualizado ao fim de cada task. O que é permanente fica no `CLAUDE.md`;
aqui fica o que muda.

## Onde estamos

**Plano ativo:** `docs/superpowers/plans/2026-07-31-fundacao-passos-0-3.md`
**Task atual:** Features do anúncio (5 e 6 bloqueadas — ver abaixo)
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

### Feature 1 — Impressora térmica de verdade (31/07, `460e14cb`)

O stub vazio virou `electron/database/impressao.js`. Cupom e comanda são
montados uma vez como lista de linhas e despachados para USB (spooler do
Windows, via `electron-pos-printer`) ou rede (ESC/POS cru em socket TCP na
porta 9100) — são transportes sem nada em comum além do texto.

Na tela de configuração, o nome da impressora deixou de ser digitado e virou
lista das instaladas: um espaço a mais no nome fazia a impressão falhar calada.
Tem botão de cupom de teste, que salva a configuração antes de imprimir.

Acentos são removidos de propósito — impressora térmica tem code page
inconsistente e "ção" saía como lixo.

### Feature 2 — Leitor de código de barras (31/07, `2eac7e60`)

`src/hooks/useLeitorCodigoBarras.js` + `produtos.buscarPorCodigoBarras`.

O leitor USB não tem driver: ele se apresenta como teclado. O que o distingue
de alguém digitando é a velocidade — mais de 60ms entre teclas reinicia o
buffer. Código não cadastrado e produto desativado dão mensagens diferentes,
porque são problemas diferentes para o lojista.

### Feature 3 — Adicionais e observação por item (31/07)

`src/pages/Pedidos/ModalItem.jsx` + `src/lib/precoItem.js`.

Clicar num produto que tem adicionais cadastrados abre o modal; produto sem
adicionais continua entrando direto no carrinho com um clique — o caminho
rápido do balcão não podia ficar mais lento. Qualquer linha do carrinho ganha
observação pelo lápis, inclusive produto sem adicionais.

A conta de preço saiu da tela para `src/lib/precoItem.js` e ganhou teste: o
componente React não é testável sob o runtime atual. De quebra, todo valor
agora volta arredondado em centavos — antes `12.90 + 2.50` entrava no pedido
como `15.400000000000002`.

O item guarda `precoBase` separado de `precoUnitario`; sem isso, editar os
adicionais de uma linha somaria duas vezes o que já estava embutido no preço.

### `JWT_SECRET` — resolvido (31/07)

O secret foi cadastrado e a Edge Function `entrar` saiu do 503. Testada de
ponta a ponta:

| Cenário | Resultado |
|---|---|
| Loja `4W48D8` + código `4321` | 200, token com `loja_id` certo |
| Token levado ao PostgREST | **200 — o Postgres valida a assinatura** |
| Código de garçom errado | 403 `Credenciais invalidas` |
| Loja inexistente | 403 (mesma mensagem — não dá para enumerar lojas) |
| Campos vazios | 400 |
| PDV, máquina errada | 403 `Licenca em uso em outra maquina` |
| PDV, licença revogada | 403 `Licenca revogada` |

O teste do PostgREST era o que importava: prova que o segredo cadastrado é
mesmo o do projeto. Com um valor aleatório, o token seria emitido normalmente
e só falharia depois da virada da RLS — quando já seria tarde.

## 🚧 BLOQUEIO ATIVO — a virada da RLS depende de release publicada

Descoberto ao testar: **o JWT do PDV não está na versão que os clientes têm.**
A tag `v1.2.0` aponta para `f720c792`; o commit que ensina o PDV a pegar token
é `4b8dddd1`, posterior. Ou seja, todo PDV instalado hoje fala com o Supabase
usando a chave anon crua.

Existe uma licença real ativada em máquina de cliente (loja
`ed3a1bc2-dfc9-4fd0-b1be-0102cc80d191`). Virar a RLS antes de esse PDV estar
atualizado **para a sincronização dele** — silenciosamente, porque o cliente
não vê erro de RLS, vê dado que não chega.

Ordem obrigatória:

1. Publicar o app do garçom (Vercel). Seguro: sem token, cai no fallback anon.
2. Publicar release do PDV com o JWT. Mesmo fallback.
3. **Confirmar que o PDV do cliente real atualizou e está pegando token** —
   dá para ver nos logs da função `entrar`.
4. Só então virar a RLS.

O passo 3 é o portão e não dá para apressar: depende do auto-update chegar na
máquina do cliente. Enquanto a RLS não vira, nada está quebrado — mas os dados
das 10 tabelas seguem legíveis por qualquer um com a chave anon.

## Próximo

1. Publicar o app do garçom e uma release do PDV (ambos pedem confirmação —
   são ações para fora).
2. Task 6: virada da RLS, só depois de confirmar que o PDV do cliente real
   está pegando token.

Features restantes do anúncio, na ordem de risco de reclamação:

4. Baixa automática de estoque em `pedidos.criar`, com o ledger idempotente
   que a Task 2 já preparou.
5. Cadastro de entregadores (tela) e kanban de delivery de verdade.
6. Categorias personalizadas, relatório de custo × lucro e exportação em PDF.
