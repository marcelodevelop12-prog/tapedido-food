# Fase 3 — Fechar o acesso ao Supabase

> Status: **não aplicado**. Depende de acesso admin ao projeto
> `xckystaizmgubayuwtsx` e de uma nova versão do PDV distribuída aos clientes.

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

## Por que só ligar o RLS não resolve

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

## O que falta para começar

- Acesso admin ao projeto `xckystaizmgubayuwtsx`. O MCP do Supabase disponível
  aqui só enxerga a organização `bsekhxsgmnqiupfamghu`, que não contém este
  projeto.
- Uma janela combinada para o passo 4, com plano de rollback pronto.
