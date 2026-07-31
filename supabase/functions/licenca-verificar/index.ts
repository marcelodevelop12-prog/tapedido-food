// Verificação periódica de licença do lado do servidor.
//
// Por que existe:
// 1. Permite fechar o `SELECT` de `licencas` para `anon` (ver licenca-ativar).
// 2. Devolve `servidorEm` — a hora do SERVIDOR. É nela que a tolerância de
//    dias offline vai se apoiar. Se a contagem usasse o relógio da máquina e
//    um timestamp no SQLite local, bastaria atrasar o relógio ou editar o
//    banco para nunca vencer.
// 3. Devolve `maquinaConfere`, comparando o machine_id enviado com o gravado
//    na ativação — sinaliza licença copiada para outra máquina, coisa que a
//    verificação antiga (só olhava `status`) não enxergava.
//
// NÃO devolve dados do cliente: só o necessário para decidir bloqueio.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { erro: "Method not allowed" });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { erro: "Corpo inválido" });
  }

  const chave = String(payload.chave ?? "").trim();
  const machineId = String(payload.machine_id ?? "").trim();

  if (!chave) return json(400, { erro: "Chave inválida" });

  const variantes = variantesDeChave(chave);
  if (variantes.length === 0) return json(400, { erro: "Chave inválida" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("licencas")
    .select("chave, status, machine_id")
    .or(variantes.map((v) => `chave.eq.${v}`).join(","))
    .limit(1);

  const servidorEm = new Date().toISOString();

  if (error) {
    console.error("[licenca-verificar] erro na consulta:", error.message);
    // 5xx: o cliente trata como "não consegui confirmar", igual a falha de rede.
    return json(500, { erro: "Erro ao consultar licença" });
  }

  const registro = data?.[0];

  if (!registro) {
    // Diferente de falha de rede: o servidor RESPONDEU que a chave não existe.
    // É o caso de licença forjada no SQLite local — o cliente pode bloquear.
    return json(200, { encontrada: false, status: null, maquinaConfere: null, servidorEm });
  }

  return json(200, {
    encontrada: true,
    status: registro.status,
    // null quando a licença ainda não foi ativada em máquina nenhuma.
    maquinaConfere: registro.machine_id ? registro.machine_id === machineId : null,
    servidorEm,
  });
});
