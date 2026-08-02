import React, { useEffect, useState } from 'react'
import { Save, Plus, Trash2, RefreshCw, Store, Printer, Truck, Info, ShoppingCart, Pencil, X, Copy, Wifi, WifiOff, Smartphone, RotateCcw, Download, Upload, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'

const APP_GARCOM_URL = 'https://tapedido-food-garcom.vercel.app/?reset=1'

// Funcoes pre-cadastradas: aparecem prontas no select do cadastro, sem
// precisar de uma tela separada so pra gerenciar 3 opcoes fixas.
const FUNCOES_COLABORADOR = ['Garçom', 'Caixa', 'Gerente']

const isElectron = typeof window !== 'undefined' && window.api

function abrirUrl(url) {
  if (isElectron) {
    window.api.shell.openExternal(url)
  } else {
    window.open(url, '_blank')
  }
}

export default function Configuracoes() {
  const [aba, setAba] = useState('loja')
  const [loja, setLoja] = useState({})
  const [config, setConfig] = useState({})
  const [zonas, setZonas] = useState([])
  const [licenca, setLicenca] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [portasDisponiveis, setPortasDisponiveis] = useState([])
  const [impressoras, setImpressoras] = useState([])
  const [testandoImpressao, setTestandoImpressao] = useState(false)
  const [balancaConectada, setBalancaConectada] = useState(false)
  const [pesoTeste, setPesoTeste] = useState(null)
  const [testando, setTestando] = useState(false)
  const [versaoApp, setVersaoApp] = useState('1.0.0')
  const [updateStatus, setUpdateStatus] = useState(null) // null | 'verificando' | 'atualizado'
  const [modalZona, setModalZona] = useState(null) // null | { modo: 'add' | 'edit', zona?: {} }
  const [formZona, setFormZona] = useState({ bairro: '', municipio: '', taxa_entrega: '' })
  const [salvandoZona, setSalvandoZona] = useState(false)
  const [entregadores, setEntregadores] = useState([])
  const [modalEntregador, setModalEntregador] = useState(null) // null | { modo: 'add' | 'edit', entregador?: {} }
  const [formEntregador, setFormEntregador] = useState({ nome: '', telefone: '', veiculo: '', placa: '' })
  const [salvandoEntregador, setSalvandoEntregador] = useState(false)
  const [colaboradores, setColaboradores] = useState([])
  const [modalColaborador, setModalColaborador] = useState(null) // null | { modo: 'add' | 'edit', colaborador?: {} }
  const [formColaborador, setFormColaborador] = useState({ nome: '', funcao: FUNCOES_COLABORADOR[0] })
  const [salvandoColaborador, setSalvandoColaborador] = useState(false)

  // App Garçom
  const [garcons, setGarcons] = useState([])
  const [carregandoGarcons, setCarregandoGarcons] = useState(false)
  const [statusConexao, setStatusConexao] = useState(null) // null | 'online' | 'offline'
  const [modalGarcom, setModalGarcom] = useState(null) // null | { nome, codigo }
  const [formGarcom, setFormGarcom] = useState({ nome: '', codigo: '' })
  const [salvandoGarcom, setSalvandoGarcom] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  // Backup
  const [exportando, setExportando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [confirmarRestauracao, setConfirmarRestauracao] = useState(false)

  useEffect(() => {
    carregar()
    const updateApi = isElectron ? window.api.update : null
    if (updateApi) updateApi.versao().then(setVersaoApp).catch(() => {})
  }, [])

  useEffect(() => {
    if (aba === 'balanca') carregarPortas()
    if (aba === 'garcom') carregarDadosGarcom()
    if (aba === 'impressora') carregarImpressoras()
  }, [aba])

  async function carregarImpressoras() {
    if (!isElectron) return
    try {
      setImpressoras(await window.api.impressao.listar())
    } catch {
      setImpressoras([])
    }
  }

  async function imprimirTeste() {
    if (!isElectron) return
    setTestandoImpressao(true)
    try {
      // Salva antes de testar: sem isso o teste usaria a configuracao antiga e
      // o lojista concluiria que o ajuste que acabou de fazer nao funcionou.
      await api.config.update({
        impressora_largura: config.impressora_largura || '80mm',
        impressora_tipo: config.impressora_tipo || 'usb',
        impressora_copias: Number(config.impressora_copias) || 1,
        impressora_nome: config.impressora_nome || null,
        impressora_ip: config.impressora_ip || null,
        impressora_porta: Number(config.impressora_porta) || 9100,
      })
      const r = await window.api.impressao.teste()
      if (r?.erro) toast.error(r.erro, { duration: 8000 })
      else toast.success('Cupom de teste enviado para a impressora!')
    } catch (err) {
      toast.error(`Erro ao imprimir: ${err?.message || err}`)
    } finally {
      setTestandoImpressao(false)
    }
  }

  async function carregar() {
    try {
      const [l, c, z, lic, ent, colab] = await Promise.all([
        api.loja.get(),
        api.config.get(),
        api.zonas.listar(),
        api.licenca.info(),
        // Inclui os desativados: e aqui que o lojista reativa quem voltou.
        api.entregadores.listar(true).catch(() => []),
        api.colaboradores.listar(true).catch(() => []),
      ])
      setLoja(l || {})
      setConfig(c || {})
      setZonas(z)
      setLicenca(lic)
      setEntregadores(ent || [])
      setColaboradores(colab || [])
    } finally {
      setCarregando(false)
    }
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 2MB)'); return }
    // Guarda como data URL direto na coluna `logo` (TEXT): sem upload nem
    // pasta pra gerenciar, funciona igual ao recibo que ja le esse campo.
    const reader = new FileReader()
    reader.onload = () => setLoja(p => ({ ...p, logo: reader.result }))
    reader.readAsDataURL(file)
  }

  async function salvarLoja(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      await api.loja.update(loja)
      toast.success('Dados da loja salvos!')
    } catch { toast.error('Erro ao salvar') }
    finally { setSalvando(false) }
  }

  async function salvarConfig(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      if (aba === 'impressora') {
        await api.config.update({
          impressora_largura: config.impressora_largura || '80mm',
          impressora_tipo: config.impressora_tipo || 'usb',
          impressora_copias: Number(config.impressora_copias) || 1,
          impressora_nome: config.impressora_nome || null,
          impressora_ip: config.impressora_ip || null,
          impressora_porta: Number.isNaN(config.impressora_porta) ? null : (config.impressora_porta || null),
        })
        // impressao_automatica é uma coluna adicionada por migration — salva separado para
        // não quebrar o save se o app ainda não foi reiniciado após a atualização
        try {
          await api.config.update({ impressao_automatica: config.impressao_automatica ? 1 : 0 })
        } catch { /* coluna pode não existir ainda — ok */ }
      } else {
        await api.config.update({
          tempo_entrega_min: Number.isNaN(config.tempo_entrega_min) ? 40 : (config.tempo_entrega_min || 40),
          tempo_retirada_min: Number.isNaN(config.tempo_retirada_min) ? 20 : (config.tempo_retirada_min || 20),
          pedido_minimo: Number.isNaN(config.pedido_minimo) ? 0 : (config.pedido_minimo ?? 0),
        })
      }
      toast.success('Configurações salvas!')
    } catch { toast.error('Erro ao salvar') }
    finally { setSalvando(false) }
  }

  function abrirModalAdicionar() {
    setFormZona({ bairro: '', municipio: '', taxa_entrega: '' })
    setModalZona({ modo: 'add' })
  }

  function abrirModalEditar(zona) {
    setFormZona({
      bairro: zona.bairro || '',
      municipio: zona.municipio || '',
      taxa_entrega: zona.taxa_entrega != null ? String(zona.taxa_entrega) : '0',
    })
    setModalZona({ modo: 'edit', zona })
  }

  async function salvarZona(e) {
    e.preventDefault()
    if (!formZona.bairro.trim()) { toast.error('Informe o nome do bairro'); return }
    const taxa = parseFloat(String(formZona.taxa_entrega).replace(',', '.')) || 0
    setSalvandoZona(true)
    try {
      if (modalZona.modo === 'add') {
        const nova = await api.zonas.criar({
          bairro: formZona.bairro.trim(),
          municipio: formZona.municipio.trim() || 'Nova Iguaçu',
          taxaEntrega: taxa,
        })
        setZonas(prev => [...prev, nova])
        toast.success('Zona adicionada!')
      } else {
        const atualizada = await api.zonas.atualizar({
          id: modalZona.zona.id,
          bairro: formZona.bairro.trim(),
          municipio: formZona.municipio.trim() || 'Nova Iguaçu',
          taxaEntrega: taxa,
        })
        setZonas(prev => prev.map(z => z.id === atualizada.id ? atualizada : z))
        toast.success('Zona atualizada!')
      }
      setModalZona(null)
    } catch { toast.error('Erro ao salvar zona') }
    finally { setSalvandoZona(false) }
  }

  async function deletarZona(id) {
    if (!window.confirm('Remover esta zona de entrega?')) return
    try {
      await api.zonas.deletar(id)
      setZonas(prev => prev.filter(z => z.id !== id))
      toast.success('Zona removida!')
    } catch { toast.error('Erro ao remover') }
  }

  function abrirEntregadorAdicionar() {
    setFormEntregador({ nome: '', telefone: '', veiculo: '', placa: '' })
    setModalEntregador({ modo: 'add' })
  }

  function abrirEntregadorEditar(entregador) {
    setFormEntregador({
      nome: entregador.nome || '',
      telefone: entregador.telefone || '',
      veiculo: entregador.veiculo || '',
      placa: entregador.placa || '',
    })
    setModalEntregador({ modo: 'edit', entregador })
  }

  async function salvarEntregador(e) {
    e.preventDefault()
    if (!formEntregador.nome.trim()) { toast.error('Informe o nome do entregador'); return }
    const dados = {
      nome: formEntregador.nome.trim(),
      telefone: formEntregador.telefone.trim(),
      veiculo: formEntregador.veiculo.trim(),
      placa: formEntregador.placa.trim().toUpperCase(),
    }
    setSalvandoEntregador(true)
    try {
      if (modalEntregador.modo === 'add') {
        const novo = await api.entregadores.criar(dados)
        setEntregadores(prev => [...prev, novo])
        toast.success('Entregador cadastrado!')
      } else {
        const atualizado = await api.entregadores.atualizar({ id: modalEntregador.entregador.id, ...dados })
        setEntregadores(prev => prev.map(x => x.id === atualizado.id ? atualizado : x))
        toast.success('Entregador atualizado!')
      }
      setModalEntregador(null)
    } catch { toast.error('Erro ao salvar entregador') }
    finally { setSalvandoEntregador(false) }
  }

  async function alternarEntregadorAtivo(entregador) {
    const desativando = entregador.ativo !== 0
    if (desativando && !window.confirm(`Desativar ${entregador.nome}? Ele deixa de aparecer na hora de despachar pedidos.`)) return
    try {
      // Desativa em vez de apagar: os pedidos ja entregues apontam para ele e
      // perderiam o nome de quem levou.
      const atualizado = desativando
        ? (await api.entregadores.deletar(entregador.id), { ...entregador, ativo: 0 })
        : await api.entregadores.atualizar({ id: entregador.id, ativo: 1 })
      setEntregadores(prev => prev.map(x => x.id === entregador.id ? atualizado : x))
      toast.success(desativando ? 'Entregador desativado' : 'Entregador reativado')
    } catch { toast.error('Erro ao alterar entregador') }
  }

  function abrirColaboradorAdicionar() {
    setFormColaborador({ nome: '', funcao: FUNCOES_COLABORADOR[0] })
    setModalColaborador({ modo: 'add' })
  }

  function abrirColaboradorEditar(colaborador) {
    setFormColaborador({
      nome: colaborador.nome || '',
      funcao: colaborador.funcao || FUNCOES_COLABORADOR[0],
    })
    setModalColaborador({ modo: 'edit', colaborador })
  }

  async function salvarColaborador(e) {
    e.preventDefault()
    if (!formColaborador.nome.trim()) { toast.error('Informe o nome do colaborador'); return }
    const dados = {
      nome: formColaborador.nome.trim(),
      funcao: formColaborador.funcao,
    }
    setSalvandoColaborador(true)
    try {
      if (modalColaborador.modo === 'add') {
        const novo = await api.colaboradores.criar(dados)
        setColaboradores(prev => [...prev, novo])
        toast.success('Colaborador cadastrado!')
      } else {
        const atualizado = await api.colaboradores.atualizar({ id: modalColaborador.colaborador.id, ...dados })
        setColaboradores(prev => prev.map(x => x.id === atualizado.id ? atualizado : x))
        toast.success('Colaborador atualizado!')
      }
      setModalColaborador(null)
    } catch { toast.error('Erro ao salvar colaborador') }
    finally { setSalvandoColaborador(false) }
  }

  async function alternarColaboradorAtivo(colaborador) {
    const desativando = colaborador.ativo !== 0
    if (desativando && !window.confirm(`Desativar ${colaborador.nome}? Ele deixa de aparecer na hora de abrir/fechar o caixa.`)) return
    try {
      // Desativa em vez de apagar: sessoes de caixa antigas guardam o nome de
      // quem abriu/fechou e nao podem perder essa informacao.
      const atualizado = desativando
        ? (await api.colaboradores.deletar(colaborador.id), { ...colaborador, ativo: 0 })
        : await api.colaboradores.atualizar({ id: colaborador.id, ativo: 1 })
      setColaboradores(prev => prev.map(x => x.id === colaborador.id ? atualizado : x))
      toast.success(desativando ? 'Colaborador desativado' : 'Colaborador reativado')
    } catch { toast.error('Erro ao alterar colaborador') }
  }

  async function carregarPortas() {
    try {
      const portas = await (isElectron ? window.api.balanca.listarPortas() : Promise.resolve([]))
      setPortasDisponiveis(portas)
      const conectado = isElectron ? await window.api.balanca.status() : false
      setBalancaConectada(conectado)
    } catch {}
  }

  async function conectarBalanca() {
    if (!isElectron || !config.balanca_porta) {
      toast.error('Selecione uma porta serial primeiro')
      return
    }
    setTestando(true)
    setPesoTeste(null)
    try {
      const ok = await window.api.balanca.conectar(config.balanca_porta, config.balanca_baud || 9600)
      if (ok) {
        setBalancaConectada(true)
        toast.success('Balança conectada!')
        // Listen for one reading to confirm
        window.api.balanca.onPeso((peso) => setPesoTeste(peso))
      } else {
        toast.error('Não foi possível conectar. Verifique a porta e o baud rate.')
      }
    } finally {
      setTestando(false)
    }
  }

  async function desconectarBalanca() {
    if (isElectron) await window.api.balanca.desconectar()
    window.api?.balanca.offPeso()
    setBalancaConectada(false)
    setPesoTeste(null)
    toast.success('Balança desconectada')
  }

  async function resetarDemoData() {
    if (!confirm('⚠️ Isso vai resetar TODOS os dados demo para o estado inicial. Continuar?')) return
    try {
      await api.config.resetDemo()
      toast.success('Dados demo resetados!')
    } catch { toast.error('Erro ao resetar') }
  }

  async function verificarAtualizacoes() {
    const updateApi = isElectron ? window.api.update : null
    if (!updateApi) return
    setUpdateStatus('verificando')
    await updateApi.verificar()
    setTimeout(() => setUpdateStatus('atualizado'), 3000)
  }

  async function carregarDadosGarcom() {
    setCarregandoGarcons(true)
    setStatusConexao(null)
    try {
      const [lista, online] = await Promise.all([
        api.garcons.listar(),
        api.supabase.statusConexao(),
      ])
      setGarcons(lista || [])
      setStatusConexao(online ? 'online' : 'offline')
    } catch {
      setStatusConexao('offline')
    } finally {
      setCarregandoGarcons(false)
    }
  }

  function abrirModalGarcom() {
    setFormGarcom({ nome: '', codigo: '' })
    setModalGarcom(true)
  }

  async function salvarGarcom(e) {
    e.preventDefault()
    if (!formGarcom.nome.trim()) { toast.error('Informe o nome do garçom'); return }
    if (!/^\d{4}$/.test(formGarcom.codigo)) { toast.error('O código deve ter exatamente 4 dígitos'); return }
    setSalvandoGarcom(true)
    try {
      const novo = await api.garcons.adicionar(formGarcom.nome.trim(), formGarcom.codigo)
      setGarcons(prev => [...prev, novo])
      setModalGarcom(null)
      toast.success('Garçom adicionado!')
    } catch (err) {
      toast.error(err?.message || 'Erro ao adicionar garçom')
    } finally {
      setSalvandoGarcom(false)
    }
  }

  async function deletarGarcom(id, nome) {
    if (!window.confirm(`Remover o garçom "${nome}"?`)) return
    try {
      await api.garcons.deletar(id)
      setGarcons(prev => prev.filter(g => g.id !== id))
      toast.success('Garçom removido!')
    } catch { toast.error('Erro ao remover garçom') }
  }

  async function sincronizarLoja() {
    setSincronizando(true)
    try {
      const resultado = await api.supabase.sincronizarLoja()
      if (resultado.sucesso) {
        setConfig(prev => ({ ...prev, codigo_loja: resultado.codigoLoja }))
        toast.success('Loja sincronizada com sucesso!')
        carregarDadosGarcom()
      } else {
        toast.error(resultado.erro || 'Erro ao sincronizar. Verifique sua internet.')
      }
    } catch { toast.error('Erro ao conectar ao Supabase') }
    finally { setSincronizando(false) }
  }


  async function exportarBackup() {
    if (!isElectron) { toast.error('Disponível apenas no aplicativo desktop'); return }
    setExportando(true)
    try {
      const r = await window.api.backup.exportar()
      if (r?.sucesso) toast.success(`Backup salvo em ${r.caminho}`, { duration: 6000 })
      else if (!r?.cancelado) toast.error(r?.erro || 'Erro ao exportar backup')
    } catch { toast.error('Erro ao exportar backup') }
    finally { setExportando(false) }
  }

  async function restaurarBackup() {
    setConfirmarRestauracao(false)
    if (!isElectron) { toast.error('Disponível apenas no aplicativo desktop'); return }
    setRestaurando(true)
    try {
      const r = await window.api.backup.importar()
      // Sucesso reinicia o app sozinho (app.relaunch no processo principal) —
      // esta resposta pode nem chegar a tempo de renderizar de novo.
      if (r?.sucesso) toast.success('Backup restaurado! Reiniciando o aplicativo...', { duration: 8000 })
      else if (!r?.cancelado) toast.error(r?.erro || 'Erro ao restaurar backup', { duration: 8000 })
    } catch { toast.error('Erro ao restaurar backup') }
    finally { setRestaurando(false) }
  }

  function copiarCodigo(codigo) {
    navigator.clipboard.writeText(codigo).then(() => toast.success('Código copiado!')).catch(() => toast.error('Não foi possível copiar'))
  }

  const abas = [
    { key: 'loja',      label: '🏪 Minha Loja' },
    { key: 'colaboradores', label: '👥 Colaboradores' },
    { key: 'impressora', label: '🖨️ Impressora' },
    { key: 'entrega',   label: '🛵 Entrega' },
    { key: 'balanca',   label: '⚖️ Balança' },
    { key: 'garcom',    label: '📱 App Garçom' },
    { key: 'backup',    label: '💾 Backup' },
    { key: 'licenca',   label: '🔑 Licença' },
    { key: 'sobre',     label: 'ℹ️ Sobre' },
  ]

  if (carregando) return <div className="text-center py-10 text-gray-400">Carregando...</div>

  return (
    <div className="space-y-4 fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Configurações</h2>
        <p className="text-sm text-gray-500">Gerencie as configurações do seu sistema</p>
      </div>

      <div className="flex border-b border-gray-200">
        {abas.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${aba === key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'loja' && (
        <form onSubmit={salvarLoja} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Dados da Loja</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo da Loja</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                  {loja.logo ? <img src={loja.logo} alt="Logo da loja" className="w-full h-full object-cover" /> : <Store size={22} className="text-gray-300" />}
                </div>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer text-sm font-medium text-orange-600 hover:text-orange-700 border border-orange-200 hover:bg-orange-50 px-3 py-2 rounded-lg transition-colors">
                    {loja.logo ? 'Trocar logo' : 'Enviar logo'}
                    <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                  </label>
                  {loja.logo && (
                    <button type="button" onClick={() => setLoja(p => ({ ...p, logo: '' }))} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">PNG ou JPG, até 2MB.</p>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Estabelecimento *</label>
              <input value={loja.nome || ''} onChange={e => setLoja(p => ({ ...p, nome: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input value={loja.cnpj || ''} onChange={e => setLoja(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input value={loja.telefone || ''} onChange={e => setLoja(p => ({ ...p, telefone: e.target.value }))} placeholder="(00) 00000-0000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
              <input value={loja.endereco || ''} onChange={e => setLoja(p => ({ ...p, endereco: e.target.value }))} placeholder="Rua, número, bairro" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input value={loja.cidade || ''} onChange={e => setLoja(p => ({ ...p, cidade: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <input value={loja.estado || ''} onChange={e => setLoja(p => ({ ...p, estado: e.target.value }))} maxLength={2} placeholder="RJ" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chave Pix</label>
              <input value={loja.pix_chave || ''} onChange={e => setLoja(p => ({ ...p, pix_chave: e.target.value }))} placeholder="CPF, e-mail, telefone..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Pix</label>
              <select value={loja.pix_tipo || ''} onChange={e => setLoja(p => ({ ...p, pix_tipo: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Selecione</option>
                {['CPF', 'CNPJ', 'Email', 'Telefone', 'Chave aleatória'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem no Recibo</label>
              <textarea value={loja.mensagem_recibo || ''} onChange={e => setLoja(p => ({ ...p, mensagem_recibo: e.target.value }))} placeholder="Ex: Obrigado pela preferência! Volte sempre!" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" rows={2} />
            </div>
          </div>
          <button type="submit" disabled={salvando} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar Dados da Loja'}
          </button>
        </form>
      )}

      {aba === 'colaboradores' && (
        <div className="max-w-2xl space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-800">Colaboradores</h3>
              <button onClick={abrirColaboradorAdicionar} className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium">
                <Plus size={15} />
                Adicionar Colaborador
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Quem estiver aqui pode ser atribuído na abertura e no fechamento do caixa.
            </p>
            {colaboradores.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum colaborador cadastrado</p>
            ) : (
              <div className="space-y-2">
                {colaboradores.map(col => {
                  const inativo = col.ativo === 0
                  return (
                    <div key={col.id} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${inativo ? 'bg-gray-50 opacity-60' : 'bg-gray-50'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 text-sm">{col.nome}</span>
                          {inativo && <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">Inativo</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{col.funcao}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => abrirColaboradorEditar(col)}
                          className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                          title="Editar colaborador"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => alternarColaboradorAtivo(col)}
                          className={`text-gray-400 p-1 rounded transition-colors ${inativo ? 'hover:text-green-600' : 'hover:text-red-600'}`}
                          title={inativo ? 'Reativar colaborador' : 'Desativar colaborador'}
                        >
                          {inativo ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {aba === 'impressora' && (
        <form onSubmit={salvarConfig} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Configuração de Impressora Térmica</h3>

          {/* Como a impressora esta ligada. Decide qual caminho o cupom toma:
              USB vai pelo spooler do Windows, rede vai por socket TCP. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Como a impressora está conectada?</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { valor: 'usb', titulo: '🔌 USB', desc: 'Instalada no Windows' },
                { valor: 'rede', titulo: '🌐 Rede', desc: 'Tem endereço IP' },
              ].map(opcao => (
                <button
                  key={opcao.valor}
                  type="button"
                  onClick={() => setConfig(p => ({ ...p, impressora_tipo: opcao.valor }))}
                  className={`text-left border-2 rounded-xl px-4 py-3 transition-all ${
                    (config.impressora_tipo || 'usb') === opcao.valor
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-orange-200'
                  }`}
                >
                  <p className="font-semibold text-gray-800 text-sm">{opcao.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opcao.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Largura do Papel</label>
              <select value={config.impressora_largura || '80mm'} onChange={e => setConfig(p => ({ ...p, impressora_largura: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cópias por impressão</label>
              <input type="number" min="1" max="5" value={config.impressora_copias || 1} onChange={e => setConfig(p => ({ ...p, impressora_copias: parseInt(e.target.value) || 1 }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>

            {(config.impressora_tipo || 'usb') === 'usb' ? (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Impressora</label>
                <div className="flex gap-2">
                  <select
                    value={config.impressora_nome || ''}
                    onChange={e => setConfig(p => ({ ...p, impressora_nome: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Selecione a impressora</option>
                    {impressoras.map(i => (
                      <option key={i.name} value={i.name}>
                        {i.displayName || i.name}{i.isDefault ? ' (padrão)' : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={carregarImpressoras} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors" title="Atualizar lista">
                    <RefreshCw size={15} />
                  </button>
                </div>
                {impressoras.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Nenhuma impressora encontrada. Verifique se ela está instalada e ligada.</p>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IP da Impressora</label>
                  <input value={config.impressora_ip || ''} onChange={e => setConfig(p => ({ ...p, impressora_ip: e.target.value }))} placeholder="192.168.1.100" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Porta (padrão 9100)</label>
                  <input type="number" value={config.impressora_porta || 9100} onChange={e => setConfig(p => ({ ...p, impressora_porta: parseInt(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </>
            )}
          </div>

          {/* O unico jeito de saber se a configuracao esta certa e imprimir. */}
          <button
            type="button"
            onClick={imprimirTeste}
            disabled={testandoImpressao}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Printer size={16} />
            {testandoImpressao ? 'Imprimindo...' : 'Imprimir cupom de teste'}
          </button>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!config.impressao_automatica}
              onChange={e => setConfig(p => ({ ...p, impressao_automatica: e.target.checked ? 1 : 0 }))}
              className="w-4 h-4 accent-orange-500"
            />
            <span className="text-sm text-gray-700">Imprimir cupom automaticamente ao fechar conta da mesa</span>
          </label>
          <button type="submit" disabled={salvando} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </form>
      )}

      {aba === 'entrega' && (
        <div className="max-w-2xl space-y-5">
          <form onSubmit={salvarConfig} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Tempos e Valores</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de Entrega (min)</label>
                <input type="number" value={config.tempo_entrega_min || 40} onChange={e => setConfig(p => ({ ...p, tempo_entrega_min: parseInt(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de Retirada (min)</label>
                <input type="number" value={config.tempo_retirada_min || 20} onChange={e => setConfig(p => ({ ...p, tempo_retirada_min: parseInt(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pedido Mínimo (R$)</label>
                <input type="number" value={config.pedido_minimo || 0} onChange={e => setConfig(p => ({ ...p, pedido_minimo: parseFloat(e.target.value) }))} step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
            <button type="submit" disabled={salvando} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              <Save size={16} />
              Salvar
            </button>
          </form>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Zonas de Entrega</h3>
              <button onClick={abrirModalAdicionar} className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium">
                <Plus size={15} />
                Adicionar Bairro
              </button>
            </div>
            {zonas.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma zona cadastrada</p>
            ) : (
              <div className="space-y-2">
                {zonas.map(z => (
                  <div key={z.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div>
                      <span className="font-medium text-gray-800 text-sm">{z.bairro}</span>
                      {z.municipio && <span className="text-gray-400 text-xs ml-1">— {z.municipio}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-orange-600 mr-1">
                        {z.taxa_entrega > 0 ? `R$ ${z.taxa_entrega.toFixed(2)}` : 'Grátis'}
                      </span>
                      <button
                        onClick={() => abrirModalEditar(z)}
                        className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                        title="Editar zona"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deletarZona(z.id)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors"
                        title="Remover zona"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-800">Entregadores</h3>
              <button onClick={abrirEntregadorAdicionar} className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium">
                <Plus size={15} />
                Adicionar Entregador
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Quem estiver aqui aparece na hora de despachar um pedido para entrega.
            </p>
            {entregadores.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum entregador cadastrado</p>
            ) : (
              <div className="space-y-2">
                {entregadores.map(ent => {
                  const inativo = ent.ativo === 0
                  return (
                    <div key={ent.id} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${inativo ? 'bg-gray-50 opacity-60' : 'bg-gray-50'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 text-sm">{ent.nome}</span>
                          {inativo && <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">Inativo</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {[ent.telefone, ent.veiculo, ent.placa].filter(Boolean).join(' · ') || 'Sem dados de contato'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => abrirEntregadorEditar(ent)}
                          className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                          title="Editar entregador"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => alternarEntregadorAtivo(ent)}
                          className={`text-gray-400 p-1 rounded transition-colors ${inativo ? 'hover:text-green-600' : 'hover:text-red-600'}`}
                          title={inativo ? 'Reativar entregador' : 'Desativar entregador'}
                        >
                          {inativo ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {aba === 'balanca' && (
        <div className="max-w-2xl space-y-5">
          <form onSubmit={async (e) => { e.preventDefault(); setSalvando(true); try { await api.config.update({ balanca_porta: config.balanca_porta, balanca_baud: config.balanca_baud || 9600 }); toast.success('Configuração da balança salva!') } catch { toast.error('Erro ao salvar') } finally { setSalvando(false) } }} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
            <h3 className="font-semibold text-gray-800">Configuração da Balança</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Porta Serial (COM)</label>
                <div className="flex gap-2">
                  <select
                    value={config.balanca_porta || ''}
                    onChange={e => setConfig(p => ({ ...p, balanca_porta: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Selecione a porta</option>
                    {portasDisponiveis.map(p => (
                      <option key={p.path} value={p.path}>
                        {p.path}{p.manufacturer ? ` — ${p.manufacturer}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={carregarPortas}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                    title="Atualizar lista de portas"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
                {portasDisponiveis.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Nenhuma porta encontrada. Verifique se a balança está conectada via USB/Serial.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Baud Rate</label>
                <select
                  value={config.balanca_baud || 9600}
                  onChange={e => setConfig(p => ({ ...p, balanca_baud: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Padrão: 9600 (Toledo, Filizola, Urano)</p>
              </div>

              <div className="flex items-end">
                {!balancaConectada ? (
                  <button
                    type="button"
                    onClick={conectarBalanca}
                    disabled={testando || !config.balanca_porta}
                    className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {testando ? 'Conectando...' : '⚡ Testar Conexão'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={desconectarBalanca}
                    className="w-full flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Desconectar
                  </button>
                )}
              </div>
            </div>

            {balancaConectada && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-800">✅ Balança conectada</p>
                  <p className="text-xs text-green-600 mt-0.5">Leitura em tempo real ativa</p>
                </div>
                {pesoTeste !== null && (
                  <div className="text-right">
                    <p className="text-3xl font-bold text-green-700 font-mono">{pesoTeste.toFixed(3)}</p>
                    <p className="text-xs text-green-600">kg</p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 space-y-1">
              <p className="font-semibold">💡 Compatibilidade</p>
              <p>Funciona com balanças seriais/USB: <strong>Toledo, Filizola, Urano, Balmak</strong> e genéricas que enviam o peso via porta serial.</p>
              <p>Produtos com unidade <strong>"kg"</strong> no cardápio usam a balança automaticamente ao serem selecionados em novos pedidos.</p>
            </div>

            <button type="submit" disabled={salvando} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              <Save size={16} />
              {salvando ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </form>
        </div>
      )}

      {aba === 'backup' && (
        <div className="max-w-2xl space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h3 className="font-semibold text-gray-800">Exportar Backup</h3>
            <p className="text-sm text-gray-500">
              Salva uma cópia completa dos seus dados (pedidos, cardápio, caixa, clientes...) num arquivo. Guarde em um pendrive ou na nuvem, longe deste computador.
            </p>
            <button
              onClick={exportarBackup}
              disabled={exportando}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Download size={16} />
              {exportando ? 'Salvando...' : 'Exportar Backup'}
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h3 className="font-semibold text-gray-800">Restaurar Backup</h3>
            <p className="text-sm text-gray-500">
              Substitui todos os dados atuais pelos de um arquivo de backup. O aplicativo reinicia sozinho ao terminar.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Isso apaga os dados atuais do sistema. Não tem como desfazer depois de confirmar.</span>
            </div>
            <button
              onClick={() => setConfirmarRestauracao(true)}
              disabled={restaurando}
              className="flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Upload size={16} />
              {restaurando ? 'Restaurando...' : 'Restaurar Backup'}
            </button>
          </div>

          {!isElectron && (
            <p className="text-xs text-center text-gray-400">Backup disponível apenas no aplicativo desktop instalado.</p>
          )}
        </div>
      )}

      {/* Modal confirmar restauração de backup */}
      {confirmarRestauracao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-3 text-red-600">
              <AlertTriangle size={20} />
              <h3 className="font-bold">Restaurar backup?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Todos os dados atuais (pedidos, caixa, cardápio, clientes) serão substituídos pelos do arquivo escolhido. Essa ação não pode ser desfeita e o aplicativo vai reiniciar.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarRestauracao(false)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={restaurarBackup} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                Escolher arquivo e restaurar
              </button>
            </div>
          </div>
        </div>
      )}

      {aba === 'licenca' && (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Informações da Licença</h3>
            {licenca ? (
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Tipo</span>
                  <span className={`text-sm font-semibold ${licenca.modo_demo ? 'text-amber-600' : 'text-green-600'}`}>
                    {licenca.modo_demo ? '⚠️ Modo Demonstração' : '✅ Licença Ativa'}
                  </span>
                </div>
                {!licenca.modo_demo && (
                  <>
                    <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Chave</span>
                      <span className="text-sm font-mono font-medium text-gray-800">{licenca.chave}</span>
                    </div>
                    {licenca.nome_cliente && (
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Registrado para</span>
                        <span className="text-sm font-medium text-gray-800">{licenca.nome_cliente}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2">
                      <span className="text-sm text-gray-500">Ativada em</span>
                      <span className="text-sm text-gray-700">{new Date(licenca.ativada_em).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhuma licença encontrada</p>
            )}
          </div>

          {licenca?.modo_demo && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h4 className="font-semibold text-amber-800 mb-2">🎮 Modo Demonstração Ativo</h4>
              <p className="text-sm text-amber-700 mb-4">
                Você está usando dados fictícios. Para uso real, adquira uma licença no Mercado Livre por <strong>R$ 78,90</strong> (pagamento único, sem mensalidade).
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => abrirUrl('https://www.mercadolivre.com.br/sistema-pdv-restaurante-lanchonete-delivery--app-garcom/up/MLBU3958667031')}
                  className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  <ShoppingCart size={15} />
                  Comprar Licença — R$ 78,90
                </button>
                <button
                  onClick={resetarDemoData}
                  className="flex items-center gap-2 border border-amber-400 text-amber-700 hover:bg-amber-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw size={15} />
                  Resetar Dados Demo
                </button>
              </div>
            </div>
          )}

        </div>
      )}
      {aba === 'garcom' && (
        <div className="max-w-2xl space-y-5">

          {/* Card código da loja */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-md">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone size={18} />
                  <span className="font-semibold text-sm uppercase tracking-wide">Código da sua loja</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-4xl font-bold font-mono tracking-widest">
                    {config.codigo_loja || '——'}
                  </span>
                  {config.codigo_loja && (
                    <button
                      onClick={() => copiarCodigo(config.codigo_loja)}
                      className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Copy size={14} />
                      Copiar
                    </button>
                  )}
                </div>
                <p className="text-orange-100 text-sm mt-3">
                  Compartilhe este código com seus garçons para acessar o app
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
              <button
                onClick={() => abrirUrl(APP_GARCOM_URL)}
                className="flex items-center gap-2 bg-white text-orange-600 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Smartphone size={15} />
                Abrir App Garçom
              </button>

              {/* Status de conexão */}
              <div className="flex items-center gap-2 text-sm">
                {statusConexao === null && (
                  <span className="text-orange-200">Verificando...</span>
                )}
                {statusConexao === 'online' && (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-green-300 animate-pulse" />
                    <span className="text-white font-medium">App garçom: Online</span>
                  </>
                )}
                {statusConexao === 'offline' && (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
                    <span className="text-orange-100">App garçom: Offline</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {!config.codigo_loja && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ Código ainda não gerado</p>
              <p className="text-sm text-amber-700 mb-4">
                Sua licença foi ativada antes desta funcionalidade existir. Clique abaixo para criar sua loja no Supabase e gerar o código de acesso para os garçons.
              </p>
              <button
                onClick={sincronizarLoja}
                disabled={sincronizando}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                {sincronizando ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sincronizando...
                  </>
                ) : '🔗 Sincronizar com Supabase'}
              </button>
            </div>
          )}


          {/* Lista de garçons */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Garçons Cadastrados</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={carregarDadosGarcom}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg transition-colors"
                  title="Atualizar lista"
                >
                  <RefreshCw size={15} className={carregandoGarcons ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={abrirModalGarcom}
                  disabled={!config.codigo_loja}
                  className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={15} />
                  Adicionar Garçom
                </button>
              </div>
            </div>

            {carregandoGarcons ? (
              <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
            ) : garcons.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">Nenhum garçom cadastrado</p>
                <p className="text-gray-300 text-xs mt-1">Adicione garçons para que eles possam usar o app</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {garcons.map(g => (
                  <div key={g.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{g.nome}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Código: <span className="font-mono font-semibold text-gray-600">{g.codigo}</span></p>
                    </div>
                    <button
                      onClick={() => deletarGarcom(g.id, g.nome)}
                      className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg transition-colors"
                      title="Remover garçom"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
            <p className="font-semibold mb-1">💡 Como funciona</p>
            <p>Compartilhe o código da sua loja e o código de acesso do garçom com cada membro da equipe. Eles acessam o app em qualquer celular sem precisar instalar nada.</p>
          </div>
        </div>
      )}

      {/* Modal de Garçom */}
      {modalGarcom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800 text-lg">Adicionar Garçom</h3>
              <button onClick={() => setModalGarcom(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={salvarGarcom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={formGarcom.nome}
                  onChange={e => setFormGarcom(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: João Silva"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código de Acesso (4 dígitos) *</label>
                <input
                  type="text"
                  value={formGarcom.codigo}
                  onChange={e => setFormGarcom(p => ({ ...p, codigo: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 1234"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">O garçom usará este código para entrar no app</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalGarcom(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoGarcom}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {salvandoGarcom ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Zona */}
      {modalZona && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800 text-lg">
                {modalZona.modo === 'add' ? 'Adicionar Bairro' : 'Editar Zona'}
              </h3>
              <button onClick={() => setModalZona(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={salvarZona} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bairro *</label>
                <input
                  type="text"
                  value={formZona.bairro}
                  onChange={e => setFormZona(p => ({ ...p, bairro: e.target.value }))}
                  placeholder="Ex: Centro"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Município</label>
                <input
                  type="text"
                  value={formZona.municipio}
                  onChange={e => setFormZona(p => ({ ...p, municipio: e.target.value }))}
                  placeholder="Ex: Nova Iguaçu"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Entrega (R$)</label>
                <input
                  type="number"
                  value={formZona.taxa_entrega}
                  onChange={e => setFormZona(p => ({ ...p, taxa_entrega: e.target.value }))}
                  placeholder="0,00"
                  min="0"
                  step="0.50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-gray-400 mt-1">Digite 0 para entrega grátis</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalZona(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoZona}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {salvandoZona ? 'Salvando...' : modalZona.modo === 'add' ? 'Adicionar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalEntregador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800 text-lg">
                {modalEntregador.modo === 'add' ? 'Adicionar Entregador' : 'Editar Entregador'}
              </h3>
              <button onClick={() => setModalEntregador(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={salvarEntregador} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={formEntregador.nome}
                  onChange={e => setFormEntregador(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Carlos"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input
                  type="text"
                  value={formEntregador.telefone}
                  onChange={e => setFormEntregador(p => ({ ...p, telefone: e.target.value }))}
                  placeholder="(21) 99999-0000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veículo</label>
                  <input
                    type="text"
                    value={formEntregador.veiculo}
                    onChange={e => setFormEntregador(p => ({ ...p, veiculo: e.target.value }))}
                    placeholder="Ex: Moto CG 160"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Placa</label>
                  <input
                    type="text"
                    value={formEntregador.placa}
                    onChange={e => setFormEntregador(p => ({ ...p, placa: e.target.value.toUpperCase() }))}
                    placeholder="ABC-1D23"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 uppercase"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalEntregador(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEntregador}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {salvandoEntregador ? 'Salvando...' : modalEntregador.modo === 'add' ? 'Adicionar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalColaborador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800 text-lg">
                {modalColaborador.modo === 'add' ? 'Adicionar Colaborador' : 'Editar Colaborador'}
              </h3>
              <button onClick={() => setModalColaborador(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={salvarColaborador} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={formColaborador.nome}
                  onChange={e => setFormColaborador(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Maria"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Função *</label>
                <select
                  value={formColaborador.funcao}
                  onChange={e => setFormColaborador(p => ({ ...p, funcao: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {FUNCOES_COLABORADOR.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalColaborador(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoColaborador}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {salvandoColaborador ? 'Salvando...' : modalColaborador.modo === 'add' ? 'Adicionar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {aba === 'sobre' && (
        <div className="max-w-xl space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center space-y-4">
            <div className="text-5xl">🍔</div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">TáPedido Food</h3>
              <p className="text-sm text-gray-500 mt-1">
                {licenca?.modo_demo ? '⚠️ Modo Demonstração' : '✅ Licença Ativa'} · Versão {versaoApp}
              </p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Sistema PDV completo para pequenos negócios alimentícios.
            </p>
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={verificarAtualizacoes}
                disabled={updateStatus === 'verificando'}
                className="flex items-center gap-2 mx-auto bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {updateStatus === 'verificando' ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando...
                  </>
                ) : '🔄 Verificar Atualizações'}
              </button>
              {updateStatus === 'atualizado' && (
                <p className="text-xs text-green-600 mt-2">✅ Você está usando a versão mais recente.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
