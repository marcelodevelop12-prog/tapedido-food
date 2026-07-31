// Ativação de licença do lado do servidor.
//
// Por que existe: até aqui o PDV ativava consultando a tabela `licencas`
// direto com a chave anon. Isso obriga a política de RLS a manter
// `SELECT` aberto para `anon` — e com `SELECT` aberto qualquer pessoa com a
// chave anon (que está no bundle e no repositório público) lista todas as
// chaves e ativa de graça. Com a ativação aqui, rodando com service role,
// o `SELECT` de `licencas` pode ser fechado para `anon`.
//
// Contrato de resposta: espelha o que db.js já esperava (`{ sucesso, erro }`),
// para o cliente poder usar esta função com fallback para o caminho antigo
// sem mudar o tratamento na tela de ativação.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Mesma normalização de electron/database/db.js (variantesDeChave). O cliente
// pode mandar a chave em minúsculas, sem hífens, com espaços ou com os hífens
// em posições erradas — a busca no banco é por igualdade exata.
function variantesDeChave(valor: unknown): string[] {
  const limpo = String(valor ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!limpo) return [];

  const variantes = new Set<string>();
  variantes.add(limpo);

  // Chaves de 15 caracteres emitidas enquanto esta função gerava "TPF-"
  if (limpo.startsWith("TPF") && !limpo.startsWith("TAPF")) {
    const blocos = limpo.slice(3).match(/.{1,4}/g) ?? [];
    if (blocos.length) variantes.add(["TPF", ...blocos].join("-"));
  }

  // Canônico atual: blocos uniformes de 4 (TAPF-XXXX-XXXX-XXXX)
  const uniformes = limpo.match(/.{1,4}/g) ?? [];
  if (uniformes.length) variantes.add(uniformes.join("-"));

  return [...variantes];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { sucesso: false, erro: "Method not allowed" });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { sucesso: false, erro: "Corpo inválido" });
  }

  const chave = String(payload.chave ?? "").trim();
  const machineId = String(payload.machine_id ?? "").trim();

  if (!chave) return json(400, { sucesso: false, erro: "Chave inválida" });
  if (!machineId) return json(400, { sucesso: false, erro: "machine_id é obrigatório" });

  const variantes = variantesDeChave(chave);
  if (variantes.length === 0) return json(400, { sucesso: false, erro: "Chave inválida" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("licencas")
    .select("id, chave, status, machine_id, nome_cliente")
    .or(variantes.map((v) => `chave.eq.${v}`).join(","))
    .limit(1);

  if (error) {
    console.error("[licenca-ativar] erro na consulta:", error.message);
    return json(500, { sucesso: false, erro: "Erro ao consultar licença" });
  }

  const registro = data?.[0];
  if (!registro) return json(200, { sucesso: false, erro: "Chave de licença não encontrada" });
  if (registro.status === "revogada") {
    return json(200, { sucesso: false, erro: "Esta licença foi revogada" });
  }
  if (registro.status === "usada" && registro.machine_id !== machineId) {
    return json(200, { sucesso: false, erro: "Esta licença já está ativada em outro computador" });
  }

  const agora = new Date().toISOString();
  const { error: erroUpdate } = await supabase
    .from("licencas")
    .update({ status: "usada", machine_id: machineId, ativada_em: agora })
    .eq("id", registro.id);

  if (erroUpdate) {
    console.error("[licenca-ativar] erro no update:", erroUpdate.message);
    return json(500, { sucesso: false, erro: "Erro ao ativar licença" });
  }

  return json(200, {
    sucesso: true,
    // Grafia canônica: o cliente guarda esta e usa em licenca-verificar.
    chave: registro.chave,
    nomeCliente: registro.nome_cliente ?? null,
    servidorEm: agora,
  });
});
