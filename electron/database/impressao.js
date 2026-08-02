// Impressao termica de cupom, 58mm e 80mm, USB ou rede.
//
// Ate aqui isto era um stub que devolvia { sucesso: true } sem imprimir nada,
// enquanto a tela de Configuracoes coletava IP, porta, nome e largura. O
// lojista configurava e nada saia na impressora.
//
// SAO DOIS CAMINHOS DIFERENTES, NAO UM SO
// - USB: a impressora esta instalada no Windows e tem nome. Vai por
//   electron-pos-printer, que renderiza HTML e manda pro spooler do sistema.
// - Rede: a impressora tem IP e escuta na porta 9100. Nao passa pelo spooler;
//   e preciso abrir um socket TCP e mandar bytes ESC/POS na mao.
//
// Por isso o texto do cupom e montado uma vez, em formato neutro (uma lista de
// linhas), e so a entrega muda. Sem isso, mudar o layout exigiria mexer nos
// dois lugares e eles sairiam diferentes com o tempo.
const net = require('net')

// Caracteres por linha. Vem do papel: 58mm cabe 32 colunas na fonte padrao,
// 80mm cabe 48.
const COLUNAS = { '58mm': 32, '80mm': 48 }

// ── Comandos ESC/POS ───────────────────────────────────────────────────────
const ESC = 0x1b
const GS = 0x1d
const CMD = {
  init: Buffer.from([ESC, 0x40]),
  alinharEsq: Buffer.from([ESC, 0x61, 0]),
  alinharCentro: Buffer.from([ESC, 0x61, 1]),
  negritoOn: Buffer.from([ESC, 0x45, 1]),
  negritoOff: Buffer.from([ESC, 0x45, 0]),
  // Avanca 4 linhas antes de cortar: sem isso o corte cai no meio do texto,
  // porque a lamina fica alguns milimetros acima da cabeca de impressao.
  cortar: Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x00]),
}

// Impressora termica generica nao tem fonte com acento confiavel: cada modelo
// usa uma tabela de codigos diferente e o resultado vira caractere trocado.
// Tirar o acento e o que todo PDV faz, e o cupom deste projeto ja era escrito
// assim ("ENDERECO", "OBSERVACOES").
function semAcento(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// ── Montagem do cupom (formato neutro) ─────────────────────────────────────

function linhaDupla(esquerda, direita, colunas) {
  const e = semAcento(esquerda)
  const d = semAcento(direita)
  const espacos = colunas - e.length - d.length
  if (espacos < 1) return `${e} ${d}`.slice(0, colunas)
  return e + ' '.repeat(espacos) + d
}

function centralizar(texto, colunas) {
  const t = semAcento(texto).slice(0, colunas)
  const margem = Math.max(0, Math.floor((colunas - t.length) / 2))
  return ' '.repeat(margem) + t
}

const dinheiro = (v) => `R$ ${Number(v || 0).toFixed(2)}`

/**
 * Monta o cupom como lista de linhas.
 *
 * Cada item e { texto, negrito?, centro? } — o suficiente para os dois
 * caminhos de impressao renderizarem igual.
 */
function montarCupom(dados, loja, colunas) {
  const linhas = []
  const add = (texto = '', extra = {}) => linhas.push({ texto, ...extra })
  const divisor = () => add('-'.repeat(colunas))

  add(centralizar(loja?.nome || 'RESTAURANTE', colunas), { negrito: true })
  if (loja?.cidade) {
    add(centralizar(`${loja.cidade}${loja.estado ? ` - ${loja.estado}` : ''}`, colunas))
  }
  if (loja?.telefone) add(centralizar(loja.telefone, colunas))
  divisor()

  const tipo = dados.tipo === 'mesa' ? 'Mesa'
    : dados.tipo === 'balcao' ? 'Balcão'
    : dados.tipo === 'entrega' ? 'Delivery'
    : dados.tipo === 'retirada' ? 'Retirada'
    : 'Pedido'

  if (dados.numeroPedido) {
    add(linhaDupla('PEDIDO', `#${String(dados.numeroPedido).padStart(3, '0')}`, colunas), { negrito: true })
  }
  add(linhaDupla('Data', new Date().toLocaleString('pt-BR'), colunas))
  add(linhaDupla('Tipo', tipo, colunas))

  const cliente = dados.mesa || dados.nomeCliente
  if (cliente) {
    divisor()
    add('CLIENTE', { negrito: true })
    add(semAcento(cliente))
    if (dados.telefoneCliente) add(semAcento(dados.telefoneCliente))
  }

  if (dados.enderecoEntrega) {
    divisor()
    add('ENDERECO', { negrito: true })
    for (const parte of String(dados.enderecoEntrega).split('\n')) {
      if (parte.trim()) add(semAcento(parte.trim()))
    }
  }

  divisor()
  add('ITENS', { negrito: true })
  for (const item of dados.itens || []) {
    const qtd = item.quantidade ?? item.qtd ?? 1
    const nome = item.nome_item ?? item.nomeItem ?? ''
    const sub = item.subtotal ?? (Number(item.preco_unitario ?? item.precoUnitario ?? 0) * qtd)
    add(linhaDupla(`${qtd}x ${nome}`, dinheiro(sub), colunas))

    const obs = item.observacao
    if (obs) add(`   ${semAcento(obs)}`)
  }

  divisor()
  const taxa = Number(dados.taxaEntrega || 0)
  const subtotal = Number(dados.subtotal || 0)
  if (taxa > 0) {
    if (subtotal > 0) add(linhaDupla('Subtotal', dinheiro(subtotal), colunas))
    add(linhaDupla('Taxa de entrega', dinheiro(taxa), colunas))
  }
  add(linhaDupla('TOTAL', dinheiro(dados.total), colunas), { negrito: true })

  if (dados.formaPagamento) {
    divisor()
    add('PAGAMENTO', { negrito: true })
    add(semAcento(String(dados.formaPagamento).toUpperCase()))
    const trocoPara = Number(dados.trocoPara || 0)
    if (trocoPara > 0) {
      add(linhaDupla('Recebido', dinheiro(trocoPara), colunas))
      add(linhaDupla('Troco', dinheiro(trocoPara - Number(dados.total || 0)), colunas))
    }
  }

  if (dados.observacoes) {
    divisor()
    add('OBSERVACOES', { negrito: true })
    add(semAcento(dados.observacoes))
  }

  divisor()
  add(centralizar(loja?.mensagem_recibo || 'Obrigado pela preferencia!', colunas))

  return linhas
}

/** Comanda de cozinha: sem preco, com fonte grande nos itens. */
function montarComanda(dados, colunas) {
  const linhas = []
  const add = (texto = '', extra = {}) => linhas.push({ texto, ...extra })

  add(centralizar('*** COZINHA ***', colunas), { negrito: true })
  add('-'.repeat(colunas))
  if (dados.mesa) add(linhaDupla('Mesa', semAcento(dados.mesa), colunas), { negrito: true })
  if (dados.numeroPedido) {
    add(linhaDupla('Pedido', `#${String(dados.numeroPedido).padStart(3, '0')}`, colunas), { negrito: true })
  }
  add(linhaDupla('Hora', new Date().toLocaleTimeString('pt-BR'), colunas))
  add('-'.repeat(colunas))

  for (const item of dados.itens || []) {
    const qtd = item.quantidade ?? item.qtd ?? 1
    const nome = item.nome_item ?? item.nomeItem ?? ''
    add(`${qtd}x ${semAcento(nome)}`, { negrito: true })
    if (item.observacao) add(`   ${semAcento(item.observacao)}`)
  }

  if (dados.observacoes) {
    add('-'.repeat(colunas))
    add(`OBS: ${semAcento(dados.observacoes)}`)
  }

  return linhas
}

// ── Entrega: rede (ESC/POS por TCP) ────────────────────────────────────────

function bytesDoCupom(linhas) {
  const partes = [CMD.init]
  for (const linha of linhas) {
    partes.push(linha.centro ? CMD.alinharCentro : CMD.alinharEsq)
    if (linha.negrito) partes.push(CMD.negritoOn)
    partes.push(Buffer.from(`${linha.texto}\n`, 'ascii'))
    if (linha.negrito) partes.push(CMD.negritoOff)
  }
  partes.push(CMD.cortar)
  return Buffer.concat(partes)
}

function imprimirNaRede(linhas, ip, porta, copias) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let finalizado = false

    // Impressora de rede desligada nao recusa a conexao: ela simplesmente nao
    // responde, e sem timeout o PDV ficaria pendurado no fechamento da conta.
    socket.setTimeout(5000)

    const encerrar = (resultado) => {
      if (finalizado) return
      finalizado = true
      socket.destroy()
      resolve(resultado)
    }

    socket.on('timeout', () => encerrar({
      erro: `Impressora ${ip}:${porta} nao respondeu em 5 segundos.`,
    }))
    socket.on('error', (err) => encerrar({
      erro: `Nao foi possivel falar com a impressora ${ip}:${porta}: ${err.message}`,
    }))

    socket.connect(porta, ip, () => {
      const dados = bytesDoCupom(linhas)
      const total = Buffer.concat(Array.from({ length: copias }, () => dados))
      socket.write(total, () => encerrar({ sucesso: true }))
    })
  })
}

// ── Entrega: USB (spooler do Windows via electron-pos-printer) ─────────────

async function imprimirNoUsb(linhas, nomeImpressora, largura, copias) {
  let PosPrinter
  try {
    ({ PosPrinter } = require('electron-pos-printer'))
  } catch (err) {
    return { erro: `Biblioteca de impressao nao carregou: ${err.message}` }
  }

  // Monoespacada de proposito: o alinhamento das colunas foi calculado em
  // caracteres, nao em pixels. Com fonte proporcional, os totais saem tortos.
  const conteudo = linhas.map((linha) => ({
    type: 'text',
    value: linha.texto.replace(/ /g, '&nbsp;'),
    style: `font-family: 'Courier New', monospace; font-size: 12px; white-space: pre; ${
      linha.negrito ? 'font-weight: 700;' : ''
    }`,
  }))

  try {
    await PosPrinter.print(conteudo, {
      printerName: nomeImpressora,
      pageSize: largura,
      copies: copias,
      silent: true,
      preview: false,
      margin: '0 0 0 0',
      timeOutPerLine: 400,
    })
    return { sucesso: true }
  } catch (err) {
    return { erro: `Falha ao imprimir em "${nomeImpressora}": ${err.message || err}` }
  }
}

// ── Fachada ────────────────────────────────────────────────────────────────

/**
 * @param lerConfig  () => linha de `configuracoes`
 * @param lerLoja    () => linha de `lojas`
 */
function criarImpressao(lerConfig, lerLoja) {
  async function despachar(linhas, cfg) {
    const copias = Math.max(1, Number(cfg.impressora_copias) || 1)
    const largura = COLUNAS[cfg.impressora_largura] ? cfg.impressora_largura : '80mm'

    // impressora_tipo e a fonte da verdade. Antes o codigo teria que adivinhar
    // pelo preenchimento do IP, e um IP esquecido de um teste antigo mandaria o
    // cupom para o lugar errado sem aviso.
    const tipo = cfg.impressora_tipo === 'rede' ? 'rede' : 'usb'

    if (tipo === 'rede') {
      if (!cfg.impressora_ip) {
        return { erro: 'Impressora de rede selecionada, mas o IP nao esta configurado.' }
      }
      return imprimirNaRede(linhas, cfg.impressora_ip, Number(cfg.impressora_porta) || 9100, copias)
    }

    if (!cfg.impressora_nome) {
      return { erro: 'Nenhuma impressora selecionada em Configuracoes.' }
    }
    return imprimirNoUsb(linhas, cfg.impressora_nome, largura, copias)
  }

  function colunasDe(cfg) {
    return COLUNAS[cfg?.impressora_largura] || COLUNAS['80mm']
  }

  return {
    async recibo(dados) {
      const cfg = lerConfig() || {}
      return despachar(montarCupom(dados, lerLoja(), colunasDe(cfg)), cfg)
    },

    async comanda(dados) {
      const cfg = lerConfig() || {}
      return despachar(montarComanda(dados, colunasDe(cfg)), cfg)
    },

    /** Cupom de teste, para a tela de Configuracoes provar que funciona. */
    async teste() {
      const cfg = lerConfig() || {}
      return despachar(
        montarCupom(
          {
            tipo: 'mesa',
            mesa: 'TESTE DE IMPRESSAO',
            total: 42.5,
            subtotal: 42.5,
            formaPagamento: 'dinheiro',
            itens: [
              { quantidade: 1, nomeItem: 'Item de teste', subtotal: 30 },
              { quantidade: 2, nomeItem: 'Outro item', subtotal: 12.5, observacao: 'sem cebola' },
            ],
          },
          lerLoja(),
          colunasDe(cfg)
        ),
        cfg
      )
    },
  }
}

module.exports = { criarImpressao, montarCupom, montarComanda, semAcento, linhaDupla, COLUNAS }
