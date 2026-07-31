# Fase 3 — Fechar o acesso ao Supabase

> Status: **passo 1 e metade do passo 2 feitos em 30/07/2026**. `licencas` foi
> endurecida, a Edge Function `entrar` está publicada e o **PDV já usa o token**
> (com fallback). Falta o app do garçom (spec entregue em
> `spec-app-garcom-jwt.md`) e o segredo de assinatura no servidor. As 10 tabelas
> de dados continuam com RLS aberto de propósito — fechar antes de os clientes
> atualizarem derruba todo mundo.

## Onde está cada peça (30/07/2026)

| Peça | Estado |
|------|--------|
| Edge Function `entrar` | publicada, v1, `verify_jwt: true` |
| `licencas.loja_id` (vínculo licença ↔ loja) | criado; escrita só por service role |
| PDV usando o token | feito — `electron/sessaoSupabase.js` |
| Realtime do renderer usando o token | feito — `src/lib/supabaseClient.js` via IPC |
| **`JWT_SECRET` nos secrets da função** | **PENDENTE — bloqueia tudo** |
| App do garçom | pendente (outro repositório; ver `spec-app-garcom-jwt.md`) |
| Políticas de RLS das 10 tabelas | **não** aplicadas — só depois da adoção |

### Passo manual pendente: o segredo de assinatura

A `entrar` assina o JWT com o segredo do próprio projeto (HS256, o mesmo que
assina a chave anon) — é isso que faz o PostgREST e o Realtime aceitarem o
token. Esse valor não é exposto por API; tem que ser cadastrado à mão, uma vez:

1. Supabase → **Project Settings → API → JWT Settings → JWT Secret** → copiar.
2. **Edge Functions → Secrets** → novo secret `JWT_SECRET` com esse valor.
   (Se o painel recusar o nome, use `TAPEDIDO_JWT_SECRET` — a função aceita os
   dois.)

Enquanto não for feito, a `entrar` responde `503` e **os apps continuam na chave
anon** — ou seja, tudo funciona como hoje, nada quebra. É um estado seguro para
ficar parado.

### Vínculo licença ↔ loja

`licencas` não tinha `loja_id`, então o PDV não tinha como provar de que loja
ele é. A coluna foi criada e o vínculo é **TOFU**: fica nulo até o primeiro
`entrar` bem-sucedido, ali gruda na loja informada e depois disso o servidor
sempre devolve *essa* loja, ignorando o que o cliente mandar.

Efeitos colaterais desejados: reinstalar o PDV recupera a loja original (o
cliente adota o `loja_id` que voltar na resposta) e pedir token da loja de outro
cliente deixa de ser possível.

A licença do cliente (`TAPF-MKLX-UG18-VCY9`) foi vinculada à mão à loja
`ed3a1bc2…`, sem depender do TOFU — nome e horário de criação batiam.

Cuidado: o `GRANT` de `INSERT`/`UPDATE` em `licencas` era de **tabela**, então a
coluna nova nasceu escrevível por `anon`. Isso reabriria o buraco (gravar o
`loja_id` de outro durante a ativação). Já foi revogado por coluna.

## O problema

A chave anon é pública — está no bundle do app do garçom e neste repositório,
que é público. Isso seria normal se o RLS estivesse configurado. Não está.

Verificado com a chave pública, usando filtros que casam zero linhas:

```
PATCH  lojas     -> HTTP 204      DELETE lojas   -> HTTP 204
PATCH  pedidos   -> HTTP 204      DELETE pedidos -> HTTP 204
PATCH  garcons   -> HTTP 204
PATCH  menu_items-> HTTP 204
PATCH  licencas  -> HTTP 204
```

`204` significa permitido. Na prática, qualquer pessoa com um `curl` pode:

- apagar todas as lojas, produtos e pedidos de todos os clientes;
- ler nome, telefone e endereço de todos os clientes de todas as lojas;
- **listar todas as chaves de licença** (`SELECT chave FROM licencas`) e ativar
  o software de graça;
- **revogar a licença de todos os clientes pagantes** com um único `PATCH`.

Não há isolamento por loja: cada `SELECT` devolve dados de todas as lojas.

## O que já foi corrigido (30/07/2026)

`licencas` tinha o mesmo problema das outras: uma política `anon_all_licencas`
com `USING (true) WITH CHECK (true)` para `ALL`. Diferente das outras tabelas,
essa deu para endurecer **sem esperar nova versão do cliente**, porque o único
código que toca `licencas` via chave anon (`electron/database/db.js`,
`ativar()` e `verificarPeriodicamente()`) faz sempre a mesma coisa: `SELECT`
por chave exata, e um único `UPDATE` que so roda quando o proprio cliente ja
confirmou que o status atual nao e `usada` nem `revogada`. Nunca faz `INSERT`
nem `DELETE` — isso e feito só pela Edge Function `gerar-licenca` (service
role, ignora RLS).

Migração aplicada (`endurecer_rls_licencas`):

- `SELECT` continua liberado para `anon` — não dá para restringir mais sem
  autenticação (ver seção abaixo), mas as colunas `email_cliente` e
  `telefone` foram retiradas do `GRANT`, então uma consulta anônima não
  vaza mais esse PII, só `chave/status/machine_id/nome_cliente/ativada_em`.
- `UPDATE` só é permitido quando `status <> 'usada' AND status <> 'revogada'`
  (linha ainda não ativada), e o `WITH CHECK` só aceita gravar
  `status = 'usada'`. Isso fecha o pior exploit — **revogar em massa a
  licença de todo cliente pagante com um único PATCH** — porque `anon` nunca
  mais consegue escrever `status = 'revogada'`, nem mexer numa linha já
  ativada.
- `INSERT`/`DELETE` de `anon`: negados por padrão (sem política = deny).

Verificado batendo direto na API REST com a chave anon: `SELECT` de coluna
fora do grant dá `permission denied`; `PATCH` tentando `status=revogada` em
massa dá `42501 new row violates row-level security policy` e não altera
nenhuma linha; ativação legítima (`UPDATE` para `status='usada'`) continua
funcionando; uma segunda tentativa de ativar a mesma chave já usada é
barrada pela política, sem erro visível e sem alterar a linha.

**Risco residual, sem solução até a Fase 3 completa:** `SELECT` continua
aberto para todas as linhas, então ainda dá para listar toda `chave` +
`nome_cliente` de todo mundo e tentar ativar uma chave antes do cliente
legítimo. RLS não tem como distinguir "buscar pela própria chave" de
"listar tudo" sem um JWT — é exatamente o problema descrito abaixo.

## Por que só ligar o RLS não resolve (nas outras 10 tabelas)

Os apps não autenticam no Supabase. Usam a chave anon, que é anônima por
definição: o servidor não tem como saber qual loja está do outro lado.

Isso significa que uma política do tipo

```sql
-- NÃO FUNCIONA: o loja_id vem do próprio cliente, que pode mentir
using (loja_id = current_setting('request.headers')::json->>'loja-id')
```

é inútil — qualquer um manda o header que quiser.

E ligar o RLS sem políticas **derruba tudo na hora**: o app do garçom e todos
os PDVs instalados param de funcionar, porque hoje dependem do acesso irrestrito.

Ou seja: a correção exige **autenticação**, não só políticas.

## Desenho proposto

1. **Edge Function `entrar`** (roda com service role, do lado do servidor)
   - recebe `codigo_loja` e `codigo_garcom`;
   - valida contra as tabelas;
   - devolve um JWT assinado com a claim `loja_id`.

2. **Apps passam a usar esse JWT** em vez da chave anon crua.

3. **Políticas de RLS** passam a se apoiar numa claim que o cliente não
   controla:

   ```sql
   alter table pedidos enable row level security;

   create policy "loja enxerga so os proprios pedidos"
     on pedidos for all
     using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
     with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);
   ```

   Mesma ideia para `lojas`, `menu_items`, `mesas`, `comandas`, `garcons`,
   `configuracoes`.

4. **`licencas` perde qualquer acesso anon.** Ativação e verificação passam a
   ser Edge Functions com service role. É o único jeito de o portão de receita
   não ser contornável a partir do cliente.

5. **`comanda_itens` ganha `loja_id`.** Hoje a tabela não tem a coluna, o que
   impede filtrar o canal de realtime no servidor — o PDV recebe itens de todas
   as lojas e só descarta depois de checar o dono pela comanda (veja
   `supabaseSync.js`, `itemPertenceALoja`). Com a coluna, o filtro volta para o
   servidor e o vazamento acaba na origem.

## Ordem de aplicação (para não derrubar quem está em produção)

A ordem importa: **o cliente novo tem que estar rodando antes de fechar a
porta**, senão o PDV instalado para de ativar licença e o garçom para de entrar.

1. Criar as Edge Functions (`entrar`, `licenca-ativar`, `licenca-verificar`) e
   testá-las num branch do Supabase, sem tocar em produção.
2. Publicar a versão do PDV e do app do garçom que usa as Edge Functions,
   mantendo o caminho antigo como fallback.
3. Esperar os clientes atualizarem (o auto-update é semanal; dá para acompanhar
   pela tabela `licencas.ultima_verificacao`).
4. Só então ligar o RLS e remover o fallback.
5. Depois disso: trocar o "sem internet nunca bloqueia" por um período de
   tolerância (ex.: 7 dias), fechando a brecha de ficar offline para sempre.

## O que falta para continuar

Em ordem:

1. **Cadastrar o `JWT_SECRET`** (passo manual acima). Sem ele a `entrar`
   responde 503 e o resto não sai do lugar.
2. **Testar a `entrar` de ponta a ponta** logo depois — hoje só foi possível
   testar os caminhos de recusa, porque sem segredo ela não assina nada.
3. **App do garçom** adotar o token (`spec-app-garcom-jwt.md`). É outro
   repositório; depende do agente que cuida dele.
4. **Publicar** PDV e garçom e esperar adoção. Dá para acompanhar por
   `licencas.ultima_verificacao` e, melhor ainda, por `licencas.loja_id` deixar
   de ser nulo — só a `entrar` preenche essa coluna, então cada linha
   preenchida é um PDV que já está usando o token.
5. **Só então** trocar as políticas das 10 tabelas. É feito no servidor, **não
   precisa de release novo**. Formato:

   ```sql
   -- para cada tabela com loja_id
   drop policy if exists "anon_all_<tabela>" on <tabela>;
   create policy "so a propria loja" on <tabela> for all to anon
     using      ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
     with check ((auth.jwt() ->> 'loja_id')::uuid = loja_id);
   ```

   `to anon` de propósito: o token emitido pela `entrar` carrega
   `role: "anon"`, então continua usando os mesmos GRANTs de hoje. Quem usar a
   chave anon crua não tem a claim e é negado. Rollback é recriar a política
   antiga com `using (true)` — uma instrução, efeito imediato.

   `comanda_itens` já tem `loja_id` (preenchido por trigger `security definer` a
   partir da comanda), então entra na mesma regra.

Riscos ainda em aberto:

- **Sem limite de tentativas na `entrar`.** `codigo_loja` tem 6 caracteres de um
  alfabeto de 32; `codigo_garcom` tem 4 dígitos. Quem já souber o código de uma
  loja varre os 10 000 códigos de garçom sem esforço. Precisa de throttling no
  servidor antes de considerar a fase 3 fechada.
- **`SELECT` de `licencas` continua aberto para `anon`** até o passo 5 (item 4
  do desenho abaixo: tirar `licencas` do alcance de `anon` de vez, já que
  ativação e verificação hoje passam por Edge Function).
- Uma janela combinada para o passo 5, com o rollback acima à mão.
