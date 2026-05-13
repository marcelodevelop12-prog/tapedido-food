import React, { useEffect, useState } from 'react'
import { Save, Plus, Trash2, RefreshCw, Store, Printer, Truck, Info, ShoppingCart, MessageCircle, Pencil, X, Copy, Wifi, WifiOff, Smartphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'

const APP_GARCOM_URL = 'https://tapedido-food-garcom.vercel.app/?reset=1'

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
  const [balancaConectada, setBalancaConectada] = useState(false)
  const [pesoTeste, setPesoTeste] = useState(null)
  const [testando, setTestando] = useState(false)
  const [versaoApp, setVersaoApp] = useState('1.0.0')
  const [updateStatus, setUpdateStatus] = useState(null) // null | 'verificando' | 'atualizado'
  const [modalZona, setModalZona] = useState(null) // null | { modo: 'add' | 'edit', zona?: {} }
  const [formZona, setFormZona] = useState({ bairro: '', municipio: '', taxa_entrega: '' })
  const [salvandoZona, setSalvandoZona] = useState(false)

  // App Garçom
  const [garcons, setGarcons] = useState([])
  const [carregandoGarcons, setCarregandoGarcons] = useState(false)
  const [statusConexao, setStatusConexao] = useState(null) // null | 'online' | 'offline'
  const [modalGarcom, setModalGarcom] = useState(null) // null | { nome, codigo }
  const [formGarcom, setFormGarcom] = useState({ nome: '', codigo: '' })
  const [salvandoGarcom, setSalvandoGarcom] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  useEffect(() => {
    carregar()
    const updateApi = isElectron ? window.api.update : null
    if (updateApi) updateApi.versao().then(setVersaoApp).catch(() => {})
  }, [])

  useEffect(() => {
    if (aba === 'balanca') carregarPortas()
    if (aba === 'garcom') carregarDadosGarcom()
  }, [aba])

  async function carregar() {
    try {
      const [l, c, z, lic] = await Promise.all([
        api.loja.get(),
        api.config.get(),
        api.zonas.listar(),
        api.licenca.info(),
      ])
      setLoja(l || {})
      setConfig(c || {})
      setZonas(z)
      setLicenca(lic)
    } finally {
      setCarregando(false)
    }
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
      await api.config.update(config)
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

  function copiarCodigo(codigo) {
    navigator.clipboard.writeText(codigo).then(() => toast.success('Código copiado!')).catch(() => toast.error('Não foi possível copiar'))
  }

  const abas = [
    { key: 'loja',      label: '🏪 Minha Loja' },
    { key: 'impressora', label: '🖨️ Impressora' },
    { key: 'entrega',   label: '🛵 Entrega' },
    { key: 'balanca',   label: '⚖️ Balança' },
    { key: 'garcom',    label: '📱 App Garçom' },
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

      {aba === 'impressora' && (
        <form onSubmit={salvarConfig} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Configuração de Impressora Térmica</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Largura do Papel</label>
              <select value={config.impressora_largura || '80mm'} onChange={e => setConfig(p => ({ ...p, impressora_largura: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Impressora</label>
              <input value={config.impressora_nome || ''} onChange={e => setConfig(p => ({ ...p, impressora_nome: e.target.value }))} placeholder="Nome no Windows" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IP da Impressora (rede)</label>
              <input value={config.impressora_ip || ''} onChange={e => setConfig(p => ({ ...p, impressora_ip: e.target.value }))} placeholder="192.168.1.100" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Porta (padrão 9100)</label>
              <input type="number" value={config.impressora_porta || 9100} onChange={e => setConfig(p => ({ ...p, impressora_porta: parseInt(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <strong>💡 Dica:</strong> Para impressoras USB, informe o nome exato como aparece no Windows (Painel de Controle → Dispositivos e Impressoras). Para impressoras de rede, informe o IP e porta.
          </div>
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

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => abrirUrl('https://www.mercadolivre.com.br/sistema-pdv-restaurante-lanchonete-delivery--app-garcom/up/MLBU3958667031')}
                className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                <ShoppingCart size={15} />
                Comprar Licença — R$ 78,90
              </button>
              <button
                onClick={() => abrirUrl('https://wa.me/5521992791713')}
                className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                <MessageCircle size={15} />
                Falar com Suporte
              </button>
            </div>
            <button
              onClick={() => abrirUrl('https://wa.me/5521992791713')}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
            >
              <MessageCircle size={15} />
              Adquira sua 2ª licença com 40% de desconto
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-sm text-gray-500">
            <p className="font-semibold text-gray-700 mb-2">ℹ️ Sobre o TáPedido Food</p>
            <p>Versão 1.0.0 · Sistema PDV para pequenos negócios alimentícios</p>
            <p className="mt-1">Funciona 100% offline após a ativação. Banco de dados local (SQLite).</p>
            <button
              onClick={() => abrirUrl('https://wa.me/5521992791713')}
              className="mt-2 flex items-center gap-2 text-green-600 hover:text-green-700 font-medium transition-colors"
            >
              <MessageCircle size={15} />
              Suporte via WhatsApp incluso na compra
            </button>
          </div>
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

      {aba === 'sobre' && (
        <div className="max-w-xl space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center space-y-4">
            <div className="text-5xl">🍔</div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">TáPedido Food</h3>
              <p className="text-sm text-gray-500 mt-1">Versão {versaoApp}</p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Sistema PDV completo para pequenos negócios alimentícios. Funciona 100% offline após a ativação. Banco de dados local (SQLite).
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

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <h4 className="font-semibold text-gray-700 text-sm">Suporte</h4>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => abrirUrl('https://wa.me/5521992791713')}
                className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                <MessageCircle size={15} />
                Suporte via WhatsApp
              </button>
              <button
                onClick={() => abrirUrl('https://www.mercadolivre.com.br/sistema-pdv-restaurante-lanchonete-delivery--app-garcom/up/MLBU3958667031')}
                className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                <ShoppingCart size={15} />
                Comprar Licença — R$ 78,90
              </button>
            </div>
          </div>

          <p className="text-xs text-center text-gray-400">
            Licença vitalícia · Pagamento único · Atualizações incluídas
          </p>
        </div>
      )}
    </div>
  )
}
