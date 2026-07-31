// Porta de entrada dos dois apps. Troca credencial por um JWT que carrega a
// claim `loja_id`.
//
// POR QUE ISSO EXISTE
// Hoje PDV e app do garcom falam com o Supabase usando a chave anon crua. Ela e
// publica (esta no bundle do app do garcom), e anonima por definicao: o servidor
// nao tem como saber qual loja esta do outro lado. Por isso as 10 tabelas de
// dados continuam com politica `using (true)` -- qualquer pessoa com um curl le
// e escreve dados de todos os clientes.
//
// Nao adianta o cliente mandar `loja_id` num header: quem controla o valor e
// ele. A claim so vale porque quem assina e o servidor, com o segredo do
// projeto, depois de conferir credencial de verdade.
//
// ATENCAO AO `role: "anon"` NO TOKEN
// E de proposito. O PostgREST troca de role do banco conforme a claim `role`.
// Mantendo "anon", o token e um substituto direto da chave anon: mesmos GRANTs,
// nada quebra durante a transicao. O que muda e que agora existe `loja_id`
// dentro do token, e as politicas podem se apoiar nele:
//
//   using ((auth.jwt() ->> 'loja_id')::uuid = loja_id)
//
// Quem usar a chave anon crua nao tem a claim -> a politica nega. E exatamente
// o corte que queremos no dia da virada, sem precisar mexer em GRANT nenhum.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

const PROJECT_REF = "xckystaizmgubayuwtsx";

// 30 dias. Precisa ser folgado porque o PDV roda em restaurante com internet
// ruim: se o token vencesse em 1h, cair a rede viraria perda de sincronizacao.
// O bloqueio por licenca revogada/offline nao depende disso -- e a
// `licenca-verificar` que cuida dele.
const VALIDADE_DIAS = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Mesma funcao de licenca-ativar / licenca-verificar / db.js. Chave digitada
// pelo cliente chega com separador de todo jeito; o banco guarda uma grafia so.
function variantesDeChave(valor: unknown): string[] {
  const limpo = String(valor ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!limpo) return [];

  const variantes = new Set<string>();
  variantes.add(limpo);

  if (limpo.startsWith("TPF") && !limpo.startsWith("TAPF")) {
    const blocos = limpo.slice(3).match(/.{1,4}/g) ?? [];
    if (blocos.length) variantes.add(["TPF", ...blocos].join("-"));
  }

  const uniformes = limpo.match(/.{1,4}/g) ?? [];
  if (uniformes.length) variantes.add(uniformes.join("-"));

  return [...variantes];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assinar(lojaId: string, origem: string, segredo: Uint8Array) {
  const agora = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    iss: "supabase",
    ref: PROJECT_REF,
    role: "anon",
    loja_id: lojaId,
    origem,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(agora)
    .setExpirationTime(agora + VALIDADE_DIAS * 86400)
    .sign(segredo);
}

// Resposta unica para credencial errada. Nao diz se foi o codigo da loja ou o
// do garcom que nao bateu -- senao da para enumerar lojas validas 4 digitos por
// vez.
const NEGADO = { sucesso: false, erro: "Credenciais invalidas" };

type Supa = ReturnType<typeof createClient>;

async function entrarComoPdv(supabase: Supa, payload: Record<string, unknown>) {
  const chave = String(payload.chave ?? "").trim();
  const machineId = String(payload.machine_id ?? "").trim();
  const lojaIdInformado = String(payload.loja_id ?? "").trim();

  const variantes = variantesDeChave(chave);
  if (!variantes.length) return { erro: json(400, NEGADO) };

  const { data, error } = await supabase
    .from("licencas")
    .select("id, chave, status, machine_id, loja_id")
    .or(variantes.map((v) => `chave.eq.${v}`).join(","))
    .limit(1);

  if (error) {
    console.error("[entrar] consulta de licenca falhou:", error.message);
    return { erro: json(500, { sucesso: false, erro: "Erro ao consultar licenca" }) };
  }

  const licenca = data?.[0];
  if (!licenca) return { erro: json(403, NEGADO) };
  if (licenca.status === "revogada") {
    return { erro: json(403, { sucesso: false, erro: "Licenca revogada" }) };
  }
  // Licenca so vale para a maquina onde foi ativada. Se ainda nao foi ativada
  // em maquina nenhuma, nao ha token a dar: ativa primeiro.
  if (!licenca.machine_id) return { erro: json(403, NEGADO) };
  if (licenca.machine_id !== machineId) {
    return { erro: json(403, { sucesso: false, erro: "Licenca em uso em outra maquina" }) };
  }

  // TOFU: a primeira entrada bem-sucedida grava o vinculo; depois disso o
  // servidor manda, e o loja_id enviado pelo cliente e ignorado.
  let lojaId = licenca.loja_id as string | null;

  if (!lojaId) {
    if (!UUID.test(lojaIdInformado)) return { erro: json(400, { sucesso: false, erro: "loja_id ausente" }) };

    const { data: loja } = await supabase
      .from("lojas")
      .select("id")
      .eq("id", lojaIdInformado)
      .maybeSingle();
    if (!loja) return { erro: json(400, { sucesso: false, erro: "Loja inexistente" }) };

    // `is('loja_id', null)` evita corrida entre dois PDVs entrando ao mesmo tempo.
    const { data: gravada, error: erroVinculo } = await supabase
      .from("licencas")
      .update({ loja_id: lojaIdInformado })
      .eq("id", licenca.id)
      .is("loja_id", null)
      .select("loja_id")
      .maybeSingle();

    if (erroVinculo) {
      console.error("[entrar] vinculo licenca->loja falhou:", erroVinculo.message);
      return { erro: json(500, { sucesso: false, erro: "Erro ao vincular loja" }) };
    }

    if (gravada?.loja_id) {
      lojaId = gravada.loja_id as string;
    } else {
      // Outro processo venceu a corrida: releia o vinculo que valeu.
      const { data: relido } = await supabase
        .from("licencas").select("loja_id").eq("id", licenca.id).maybeSingle();
      lojaId = (relido?.loja_id as string | null) ?? null;
      if (!lojaId) return { erro: json(500, { sucesso: false, erro: "Erro ao vincular loja" }) };
    }
  }

  if (lojaIdInformado && lojaIdInformado !== lojaId) {
    // Nao e erro: PDV reinstalado cria uma loja local nova e chega aqui com o
    // id errado. O cliente deve adotar o loja_id que voltar na resposta.
    console.warn(`[entrar] pdv pediu loja ${lojaIdInformado}, licenca vinculada a ${lojaId}`);
  }

  const { data: loja } = await supabase
    .from("lojas").select("nome, codigo_loja").eq("id", lojaId).maybeSingle();

  return { lojaId, origem: "pdv", extra: { nome_loja: loja?.nome ?? null, codigo_loja: loja?.codigo_loja ?? null } };
}

async function entrarComoGarcom(supabase: Supa, payload: Record<string, unknown>) {
  const codigoLoja = String(payload.codigo_loja ?? "").trim().toUpperCase();
  const codigoGarcom = String(payload.codigo_garcom ?? "").trim();

  if (!codigoLoja || !codigoGarcom) return { erro: json(400, NEGADO) };

  // O codigo vive em configuracoes; lojas.codigo_loja e o espelho gravado na
  // criacao. Consulta os dois para nao depender de qual ficou preenchido.
  const [{ data: cfg }, { data: lojaPorCodigo }] = await Promise.all([
    supabase.from("configuracoes").select("loja_id, codigo_garcom").eq("codigo_loja", codigoLoja).maybeSingle(),
    supabase.from("lojas").select("id").eq("codigo_loja", codigoLoja).maybeSingle(),
  ]);

  const lojaId = (cfg?.loja_id as string | null) ?? (lojaPorCodigo?.id as string | null) ?? null;
  if (!lojaId) return { erro: json(403, NEGADO) };

  // Duas credenciais aceitas: o codigo geral da loja (configuracoes) e o codigo
  // individual de um garcom ativo. O app de hoje usa o geral; o individual ja
  // existe na tabela `garcons` e passa a valer aqui tambem.
  let garcom: { id: string; nome: string } | null = null;

  if (!cfg?.codigo_garcom || String(cfg.codigo_garcom).trim() !== codigoGarcom) {
    const { data: g } = await supabase
      .from("garcons")
      .select("id, nome")
      .eq("loja_id", lojaId)
      .eq("codigo", codigoGarcom)
      .eq("ativo", true)
      .maybeSingle();
    if (!g) return { erro: json(403, NEGADO) };
    garcom = { id: g.id as string, nome: g.nome as string };
  }

  const { data: loja } = await supabase
    .from("lojas").select("nome").eq("id", lojaId).maybeSingle();

  return {
    lojaId,
    origem: "garcom",
    extra: { nome_loja: loja?.nome ?? null, garcom_id: garcom?.id ?? null, garcom_nome: garcom?.nome ?? null },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { sucesso: false, erro: "Method not allowed" });

  // Segundo nome como alternativa: o Supabase reserva alguns nomes de secret,
  // e se `JWT_SECRET` for recusado no painel da pra cadastrar o outro.
  const segredoBruto = Deno.env.get("JWT_SECRET") ?? Deno.env.get("TAPEDIDO_JWT_SECRET");
  if (!segredoBruto) {
    // 5xx de proposito: o cliente trata como indisponibilidade e cai no
    // fallback da chave anon, em vez de achar que a credencial estava errada.
    console.error("[entrar] JWT_SECRET nao configurado nos secrets da funcao");
    return json(503, { sucesso: false, erro: "Servico indisponivel" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { sucesso: false, erro: "Corpo invalido" });
  }

  const tipo = String(payload.tipo ?? "").trim().toLowerCase();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let resultado;
  if (tipo === "pdv") resultado = await entrarComoPdv(supabase, payload);
  else if (tipo === "garcom") resultado = await entrarComoGarcom(supabase, payload);
  else return json(400, { sucesso: false, erro: "tipo deve ser 'pdv' ou 'garcom'" });

  if ("erro" in resultado && resultado.erro) return resultado.erro;

  const { lojaId, origem, extra } = resultado as {
    lojaId: string; origem: string; extra: Record<string, unknown>;
  };

  const token = await assinar(lojaId, origem, new TextEncoder().encode(segredoBruto));

  return json(200, {
    sucesso: true,
    token,
    loja_id: lojaId,
    expira_em: new Date(Date.now() + VALIDADE_DIAS * 86400 * 1000).toISOString(),
    servidor_em: new Date().toISOString(),
    ...extra,
  });
});
