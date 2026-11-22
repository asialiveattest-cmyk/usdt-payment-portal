import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from './supabase'
import { Copy, RefreshCw, ShieldCheck, Wallet, LogIn, LogOut, Save, Upload, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'

type Settings = {
  id: number
  wallet_address: string
  qr_image_url: string | null
  amount: number
  instructions: string | null
  payment_enabled: boolean
}

const DEFAULTS: Settings = {
  id: 1, wallet_address: '', qr_image_url: null, amount: 10,
  instructions: 'Send only USDT through the TRON (TRC20) network.',
  payment_enabled: true
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [qrData, setQrData] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [session, setSession] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [wallet, setWallet] = useState('')
  const [amount, setAmount] = useState('10')
  const [instructions, setInstructions] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [qrFile, setQrFile] = useState<File | null>(null)

  const configured = Boolean(supabase)
  const amountText = useMemo(() => Number(settings.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 6 }), [settings.amount])

  async function loadSettings() {
    if (!supabase) { setError('Supabase is not configured. Add your project URL and publishable key to the Vercel environment variables.'); setLoading(false); return }
    setError('')
    const { data, error } = await supabase.from('payment_settings').select('*').eq('id', 1).single()
    if (error) setError(error.message)
    else if (data) {
      setSettings(data as Settings)
      setWallet(data.wallet_address || '')
      setAmount(String(data.amount ?? 10))
      setInstructions(data.instructions || '')
      setEnabled(Boolean(data.payment_enabled))
    }
    setLoading(false)
  }

  async function checkAdmin(userId: string) {
    if (!supabase) return
    const { data, error } = await supabase.from('payment_admins').select('user_id').eq('user_id', userId).maybeSingle()
    setIsAdmin(!error && Boolean(data))
  }

  useEffect(() => {
    loadSettings()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) checkAdmin(data.session.user.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setIsAdmin(false)
      if (next?.user) setTimeout(() => checkAdmin(next.user.id), 0)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    if (!settings.wallet_address) { setQrData(''); return }
    QRCode.toDataURL(settings.wallet_address, { width: 420, margin: 2, errorCorrectionLevel: 'H' })
      .then(url => { if (active) setQrData(url) })
      .catch(() => { if (active) setQrData('') })
    return () => { active = false }
  }, [settings.wallet_address])

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(`${label} copied`)
      setTimeout(() => setNotice(''), 2500)
    } catch { setNotice('Copy failed. Please select and copy manually.') }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else { setPassword(''); setNotice('Signed in.'); setAdminOpen(true) }
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut()
    setIsAdmin(false)
    setAdminOpen(false)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !isAdmin) return
    setSaving(true); setError(''); setNotice('')
    try {
      let qrUrl = settings.qr_image_url
      if (qrFile) {
        const ext = qrFile.name.split('.').pop()?.toLowerCase() || 'png'
        const path = `payment-qr.${ext}`
        const { error: uploadError } = await supabase.storage.from('payment-assets').upload(path, qrFile, { upsert: true, contentType: qrFile.type })
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('payment-assets').getPublicUrl(path)
        qrUrl = `${data.publicUrl}?v=${Date.now()}`
      }
      const parsedAmount = Number(amount)
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) throw new Error('Enter a valid amount (zero or greater).')
      const { data, error } = await supabase.from('payment_settings').update({
        wallet_address: wallet.trim(),
        qr_image_url: qrUrl,
        amount: parsedAmount,
        instructions,
        payment_enabled: enabled,
        updated_at: new Date().toISOString()
      }).eq('id', 1).select().single()
      if (error) throw error
      setSettings(data as Settings); setQrFile(null); setNotice('Payment settings saved.')
    } catch (err: any) { setError(err.message || 'Unable to save settings.') }
    finally { setSaving(false) }
  }

  // Binance does not document a public URL that pre-fills an external TRC20 withdrawal.
  // Open its official site/withdrawal entry point and copy the address for manual paste.
  const binanceWithdrawUrl = 'https://www.binance.com/en/my/wallet/account/main/withdrawal/crypto'
  const payReady = settings.wallet_address.length > 0 && settings.payment_enabled && Number(settings.amount) > 0

  async function payWithBinance() {
    if (!payReady) return
    // Open synchronously from the click to reduce popup blocking.
    const opened = window.open(binanceWithdrawUrl, '_blank', 'noopener,noreferrer')
    await copy(settings.wallet_address, 'TRC20 wallet address')
    setNotice(`Address copied. In Binance, choose USDT, paste the address, select TRON (TRC20), and enter ${amountText} USDT.`)
    if (!opened) setNotice('Address copied. Open Binance manually, choose USDT withdrawal, select TRON (TRC20), and enter the displayed amount.')
  }

  return <main className="page">
    <header className="topbar">
      <div><h1>Make a Deposit</h1><p>Pay securely with USDT using the TRON (TRC20) network.</p></div>
      <div className="top-actions">
        <button className="soft-btn" onClick={loadSettings}><RefreshCw size={15}/> Refresh</button>
        <button className="admin-btn" onClick={() => setAdminOpen(v => !v)}><ShieldCheck size={16}/> {isAdmin ? 'Admin panel' : 'Admin login'}</button>
      </div>
    </header>

    {notice && <div className="notice"><CheckCircle2 size={16}/>{notice}</div>}
    {error && <div className="error"><AlertTriangle size={16}/>{error}</div>}
    {!configured && <div className="error">Set your Supabase environment variables before using this page.</div>}

    {adminOpen && <section className="admin-card">
      <div className="section-heading"><div><h2>Admin access</h2><p>Only an authorized payment admin can edit these settings.</p></div>{isAdmin && <button className="text-btn" onClick={logout}><LogOut size={15}/> Sign out</button>}</div>
      {!session ? <form className="login-form" onSubmit={login}>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username"/></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/></label>
        <button className="primary" type="submit"><LogIn size={16}/> Admin login</button>
      </form> : !isAdmin ? <p className="muted">This signed-in account is not registered as a payment admin.</p> :
      <form className="settings-form" onSubmit={saveSettings}>
        <label>USDT TRC20 wallet address<input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="Enter TRON wallet address" required/></label>
        <label>Payment amount (USDT)<input type="number" min="0" step="0.000001" value={amount} onChange={e => setAmount(e.target.value)} required/></label>
        <label>Replace QR image (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setQrFile(e.target.files?.[0] || null)}/></label>
        <label>Payment instructions<textarea rows={3} value={instructions} onChange={e => setInstructions(e.target.value)}/></label>
        <label className="toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/> Accept payments</label>
        <button className="primary" type="submit" disabled={saving}><Save size={16}/>{saving ? 'Saving…' : 'Save payment settings'}</button>
      </form>}
    </section>}

    <section className="payment-card">
      <div className="method"><div className="shield"><ShieldCheck size={21}/></div><div><h2>USDT (TRC20)</h2><p>Payment method · TRON network only</p></div></div>
      <div className="amount-panel"><span>AMOUNT TO PAY</span><strong>{amountText} <small>USDT</small></strong></div>
      {!settings.payment_enabled && <div className="warning"><AlertTriangle size={16}/> Payments are temporarily disabled by the administrator.</div>}
      <label className="field-label">USDT TRC20 address</label>
      <div className="address-row"><input readOnly value={settings.wallet_address || 'Wallet address not configured yet'}/><button aria-label="Copy wallet address" onClick={() => copy(settings.wallet_address, 'Wallet address')} disabled={!settings.wallet_address}><Copy size={17}/></button></div>
      <div className="field-label qr-label">Deposit QR code</div>
      <div className="qr-frame">
        {settings.qr_image_url ? <img src={settings.qr_image_url} alt="Payment QR code"/> : qrData ? <img src={qrData} alt="QR code for the current wallet address"/> : <div className="qr-empty"><Wallet size={34}/><span>QR code will appear when a wallet address is configured.</span></div>}
      </div>
      <p className="qr-caption">Scan this code with your wallet to enter the deposit address.</p>
      <div className="pay-actions">
        <button className="primary pay-now" disabled={!payReady} onClick={payWithBinance}><Wallet size={17}/> Pay with Binance · {amountText} USDT <ExternalLink size={15}/></button>
        <div className="wallet-links">
          <button className="copy-link" onClick={() => copy(settings.wallet_address, 'TRC20 wallet address')} disabled={!settings.wallet_address}><Copy size={13}/> Copy wallet address</button>
          <button className="copy-link" onClick={() => copy(String(settings.amount), 'Payment amount')}><Copy size={13}/> Copy amount</button>
        </div>
        <p className="wallet-note">Binance opens its withdrawal entry point. Paste the copied address, choose USDT, explicitly select TRON (TRC20), and enter {amountText} USDT. Binance does not provide a documented public link that automatically pre-fills an external withdrawal. Review the network, address and fee in Binance before confirming. This page never sends funds.</p>
      </div>
    </section>

    <section className="instructions-card">
      <h3>DEPOSIT INSTRUCTIONS</h3>
      <ol>
        <li>Copy the USDT TRC20 wallet address or scan the QR code.</li>
        <li>Open your crypto wallet and select USDT on the TRON (TRC20) network.</li>
        <li>Enter the displayed amount: <b>{amountText} USDT</b>.</li>
        <li>Confirm the destination address and network before sending.</li>
        <li>Keep a screenshot or transaction ID as payment proof.</li>
        <li>Wait for the company team to verify your payment.</li>
      </ol>
      <div className="important"><AlertTriangle size={17}/><span><b>IMPORTANT:</b> Sending funds through the wrong network may result in loss of funds.</span></div>
      {settings.instructions && <p className="custom-instructions">{settings.instructions}</p>}
    </section>

    <footer>USDT payments · TRON (TRC20) network only</footer>
    {loading && <div className="loading">Loading payment settings…</div>}
  </main>
}
