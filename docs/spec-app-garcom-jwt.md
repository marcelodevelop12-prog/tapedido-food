# Spec para o app do garçom — passar a usar o JWT da Edge Function `entrar`

> Documento autocontido. Pode ser entregue direto ao agente que trabalha no
> repositório do app do garçom (`tapedido-food-garcom`). Nada aqui depende de
> ler o código do PDV.

## 1. Contexto: por que isso precisa mudar

Hoje o app do garçom fala com o Supabase usando a **chave anon crua**, que está
no bundle e portanto é pública. Chave anon é anônima por definição: o servidor
não tem como saber qual loja está do outro lado da requisição.

Consequência atual, verificada com `curl` usando só a chave pública:

- dá para **ler pedidos, clientes, telefones e endereços de todas as lojas**;
- dá para **apagar ou alterar dados de qualquer loja** de qualquer cliente.

Não é possível corrigir isso só ligando políticas de RLS. Uma política do tipo

```sql
-- INÚTIL: o loja_id vem do próprio cliente, que pode mandar o que quiser
using (loja_id = current_setting('request.headers')::json ->> 'loja-id')
```

não protege nada. A correção exige **autenticação**: o servidor precisa emitir
um token que o cliente não consegue forjar.

Foi criada a Edge Function **`entrar`**, que troca credencial (código da loja +
código do garçom) por um **JWT assinado pelo servidor** carregando a claim
`loja_id`. Depois que os dois apps estiverem usando esse token, as políticas
passam a ser:

```sql
using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
```

Quem usar a chave anon crua não tem a claim → é negado.

## 2. Ordem de execução (importante — não pule)

1. `entrar` criada e publicada — **já feito**.
2. PDV e app do garçom passam a usar o token, **com fallback** para o jeito
   atual — *é a sua parte*.
3. Esperar os clientes atualizarem.
4. **Só então** as políticas de RLS são trocadas (feito no servidor, não precisa
   de release novo dos apps).

Trocar a RLS antes do passo 3 derruba todo app do garçom instalado. Por isso o
**fallback do passo 2 é obrigatório**, não é opcional.

## 3. Contrato da Edge Function

```
POST https://xckystaizmgubayuwtsx.supabase.co/functions/v1/entrar
Authorization: Bearer <CHAVE_ANON>      (a mesma de sempre)
Content-Type: application/json
```

### Requisição

```json
{
  "tipo": "garcom",
  "codigo_loja": "AB3K9P",
  "codigo_garcom": "4821"
}
```

- `codigo_loja` — 6 caracteres. É normalizado no servidor (`trim` + maiúsculas),
  então pode mandar como o usuário digitou.
- `codigo_garcom` — aceita **duas** credenciais:
  - o código geral da loja (`configuracoes.codigo_garcom`) — é o que o app usa
    hoje; e
  - o código individual de um garçom ativo (`garcons.codigo`) — passa a
    funcionar também. Quando for esse caso, a resposta traz `garcom_id` e
    `garcom_nome`; quando for o código geral, os dois vêm `null`.

### Resposta 200

```json
{
  "sucesso": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "loja_id": "d17aee11-995b-4e9b-accb-50107dca3e55",
  "nome_loja": "Minha Loja",
  "garcom_id": null,
  "garcom_nome": null,
  "expira_em": "2026-08-29T22:41:00.000Z",
  "servidor_em": "2026-07-30T22:41:00.000Z"
}
```

O `token` vale **30 dias**.

### Erros

| HTTP | Corpo | O que o app faz |
|------|-------|-----------------|
| 400 | `{"sucesso":false,"erro":"Credenciais invalidas"}` | campo faltando — mensagem de erro na tela |
| 403 | `{"sucesso":false,"erro":"Credenciais invalidas"}` | código da loja ou do garçom errado — mensagem de erro na tela |
| 500 / 503 | `{"sucesso":false,"erro":"..."}` | **serviço indisponível → usar o fallback**, não tratar como credencial errada |
| falha de rede / timeout | — | **fallback** |

> A resposta de credencial errada é **propositalmente genérica**: não diz se foi
> o código da loja ou o do garçom que não bateu. Não "melhore" essa mensagem —
> distinguir os dois permitiria enumerar lojas válidas 4 dígitos por vez.

## 4. O que implementar

### 4.1 Chamar `entrar` no login

Onde hoje o app valida `codigo_loja` + `codigo_garcom` consultando as tabelas
direto, passe a chamar a `entrar`. Guarde a resposta inteira.

```js
const SUPABASE_URL = 'https://xckystaizmgubayuwtsx.supabase.co'

async function entrar(codigoLoja, codigoGarcom) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/entrar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tipo: 'garcom',
      codigo_loja: codigoLoja,
      codigo_garcom: codigoGarcom,
    }),
  })

  // 5xx e falha de rede NÃO são credencial errada: o app precisa distinguir,
  // senão o garçom vê "código inválido" quando o problema é a internet do salão.
  if (resp.status >= 500) return { indisponivel: true }

  const corpo = await resp.json().catch(() => null)
  if (!resp.ok || !corpo?.sucesso) return { negado: true }

  return { sessao: corpo }
}
```

### 4.2 Guardar a sessão

Persistir no `localStorage` (ou equivalente): `token`, `loja_id`, `expira_em`,
`nome_loja`, `garcom_id`, `garcom_nome`.

### 4.3 Fazer o cliente Supabase usar o token

O ponto mais importante: **o token precisa valer também no Realtime**, não só
nas consultas REST. Se ficar só no REST, o app continua recebendo eventos e para
de funcionar no dia da virada.

Com `@supabase/supabase-js` v2 recente (≥ 2.44), use a opção `accessToken` — ela
cobre REST e Realtime de uma vez:

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // Fallback embutido: sem token guardado, devolve a chave anon e tudo segue
  // funcionando como hoje. É isso que permite publicar antes da virada da RLS.
  accessToken: async () => lerTokenGuardado() ?? SUPABASE_ANON_KEY,
  realtime: { params: { eventsPerSecond: 10 } },
})
```

Se a versão do `supabase-js` for antiga demais para ter `accessToken`, **suba a
versão**. Se por algum motivo não der, o equivalente manual é:

```js
supabase.realtime.setAuth(token)   // NÃO ESQUEÇA ESTA LINHA
// + recriar o client com global.headers.Authorization = `Bearer ${token}`
```

e é preciso chamar `setAuth` de novo toda vez que o token trocar, **antes** de
assinar os canais.

> O header `apikey` continua sendo a chave anon em todos os casos — o gateway do
> Supabase exige isso. Só o `Authorization` é que muda.

### 4.4 Renovar antes de vencer

- Ao abrir o app: se `expira_em` está a menos de **7 dias**, chame `entrar` de
  novo em segundo plano com as credenciais guardadas e substitua a sessão.
- Se a renovação falhar, **continue usando o token atual** — ele ainda vale.
- Se o token venceu e a renovação falhou: peça login de novo.

### 4.5 Continuar filtrando por `loja_id` no cliente

Todas as consultas devem continuar com `.eq('loja_id', lojaId)` como estão hoje.
A RLS é a **segunda** barreira, não a única. Não remova os filtros existentes.

## 5. O que NÃO fazer

- ❌ Não mexa em nenhuma política de RLS, nem em GRANT, nem em nada no banco.
  Isso é feito de um lado só (servidor), depois que os dois apps estiverem
  publicados e adotados.
- ❌ Não remova o fallback para a chave anon nesta versão.
- ❌ Não decodifique o JWT no cliente para tirar decisão de segurança. Use o
  `loja_id` que veio no corpo da resposta.
- ❌ Não mande `loja_id` no corpo da requisição de `tipo: "garcom"` — é ignorado.
- ❌ Não logue o `token` no console nem em telemetria. Ele é credencial.

## 6. Como testar

1. Login com código de loja e de garçom corretos → 200, token presente,
   `loja_id` bate com a loja esperada.
2. Login com código do garçom errado → 403, mensagem de erro, **nenhum** token
   guardado.
3. Com o token guardado, confirmar que **as consultas e o Realtime continuam
   funcionando** exatamente como antes (é o que prova que o fallback e a troca
   de token não quebraram nada).
4. Apagar o token do `localStorage` e recarregar → o app tem que continuar
   funcionando pela chave anon (prova do fallback).
5. Simular `entrar` fora do ar (bloquear a URL da função) → tela de erro deve
   ser "serviço indisponível", **não** "código inválido".

## 7. Quando terminar, avise

Precisamos saber, para poder marcar a data da virada da RLS:

- versão publicada e data;
- confirmação de que o Realtime está usando o token (item 6.3);
- se o app usa alguma tabela **além** de `lojas`, `configuracoes`, `menu_items`,
  `mesas`, `comandas`, `comanda_itens`, `pedidos`, `itens_pedido`, `garcons`,
  `zonas_entrega` — se usar, precisa entrar na lista de políticas;
- se o app faz `INSERT`/`UPDATE`/`DELETE` em alguma tabela **sem** preencher
  `loja_id` na linha. Isso é crítico: com a RLS ligada, um `INSERT` sem
  `loja_id` (ou com `loja_id` diferente do token) passa a ser **rejeitado**.

## 8. Pendência conhecida do lado do servidor

`codigo_loja` tem 6 caracteres de um alfabeto de 32 e `codigo_garcom` tem 4
dígitos. Não existe hoje limite de tentativas na `entrar`. Um atacante que já
conheça o código de uma loja consegue varrer os 10 000 códigos de garçom. Está
registrado como pendência do servidor — **não** tente resolver no cliente.
