import React, { useEffect, useMemo, useRef, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Users,
  ClipboardList,
  Wallet,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Cloud,
  CloudOff,
  FileText,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Upload,
  Building2,
  User,
  LayoutDashboard,
  KanbanSquare,
  Save,
} from 'lucide-react';

const STORAGE_KEY = 'painel_reembolso_clientes_tarefas_v1';

// Para ativar a nuvem de verdade:
// 1. Crie um projeto no Firebase.
// 2. Ative Authentication > Anonymous.
// 3. Ative Firestore Database.
// 4. Copie as configurações do seu app web e cole abaixo.
// 5. Troque cloudEnabled para true.
const firebaseConfig = {
  cloudEnabled: true,
  apiKey: 'AIzaSyA1PObWO9auhTYcyenG0BdKFA3ErjRgu6M',
  authDomain: 'sistema-reembolso-df98f.firebaseapp.com',
  projectId: 'sistema-reembolso-df98f',
  storageBucket: 'sistema-reembolso-df98f.firebasestorage.app',
  messagingSenderId: '541836214382',
  appId: '1:541836214382:web:7f16d25942e7497e3ca67f',
};

const CLOUD_DOC_ID = 'sistema-reembolso-principal';

function isCloudConfigured() {
  return Boolean(
    firebaseConfig.cloudEnabled &&
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

const initialData = {
  clients: [],
  team: ['Thiago', 'Isabela', 'Marina', 'Rafaela', 'Joana'],
  reimbursements: [],
  activities: [],
};

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowLabel() {
  const d = new Date();
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskCpf(value = '') {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskCnpj(value = '') {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function maskPhone(value = '') {
  const v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 10) {
    return v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

const statusColors = {
  Pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  Aprovado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Rejeitado: 'bg-rose-100 text-rose-800 border-rose-200',
  Pago: 'bg-blue-100 text-blue-800 border-blue-200',
  'A Fazer': 'bg-slate-100 text-slate-700 border-slate-200',
  'Em Andamento': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  Concluído: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function Badge({ children, className = '' }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function Modal({ title, children, onClose }) {
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl" initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }}>
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X size={20} /></button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100';

export default function ReimbursementSystem() {
  const [data, setData] = useState(initialData);
  const [active, setActive] = useState('dashboard');
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '', onlyOverdue: false });
  const [activityFilter, setActivityFilter] = useState({ status: 'Todos', priority: 'Todas', assignee: 'Todos', onlyLate: false });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [cloudStatus, setCloudStatus] = useState(isCloudConfigured() ? 'Conectando à nuvem...' : 'Nuvem não configurada');
  const dbRef = useRef(null);
  const cloudReadyRef = useRef(false);
  const loadingFromCloudRef = useRef(false);
  const hasLoadedCloudRef = useRef(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setData(JSON.parse(saved));
    } catch (e) {
      console.warn('Erro ao carregar localStorage', e);
    }
  }, []);

  useEffect(() => {
    if (!isCloudConfigured()) return;

    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const db = getFirestore(app);
      dbRef.current = doc(db, 'workspaces', CLOUD_DOC_ID);

      const unsubscribeAuth = onAuthStateChanged(auth, async user => {
        if (!user) return;

        try {
          setCloudStatus('Carregando dados da nuvem...');
          cloudReadyRef.current = true;

          const snapshot = await getDoc(dbRef.current);
          const cloudData = snapshot.data();

          if (cloudData?.payload) {
            loadingFromCloudRef.current = true;
            setData(cloudData.payload);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData.payload));
            setTimeout(() => {
              loadingFromCloudRef.current = false;
              hasLoadedCloudRef.current = true;
              setCloudStatus('Conectado à nuvem');
            }, 0);
          } else {
            await setDoc(dbRef.current, { payload: data, updatedAt: new Date().toISOString() }, { merge: true });
            hasLoadedCloudRef.current = true;
            setCloudStatus('Conectado à nuvem');
          }
        } catch (error) {
          console.warn('Erro ao carregar dados da nuvem', error);
          hasLoadedCloudRef.current = true;
          cloudReadyRef.current = false;
          setCloudStatus('Erro na nuvem, salvando local');
        }
      });

      signInAnonymously(auth).catch(error => {
        console.warn('Erro ao autenticar na nuvem', error);
        setCloudStatus('Erro na autenticação da nuvem');
        cloudReadyRef.current = false;
      });

      return () => unsubscribeAuth();
    } catch (e) {
      console.warn('Erro ao iniciar Firebase', e);
      setCloudStatus('Firebase não configurado corretamente');
      cloudReadyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (loadingFromCloudRef.current) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Erro ao salvar localStorage', e);
    }

    if (!isCloudConfigured()) return;
    if (!cloudReadyRef.current || !dbRef.current || !hasLoadedCloudRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      setCloudStatus('Salvando na nuvem...');
      setDoc(dbRef.current, { payload: data, updatedAt: new Date().toISOString() }, { merge: true }).then(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setCloudStatus('Conectado à nuvem · salvo');
      }).catch(error => {
        console.warn('Erro ao salvar na nuvem', error);
        setCloudStatus('Falha ao salvar na nuvem, salvo localmente');
      });
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }

  const clientMap = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);

  function isReimbursementOverdue(r) {
    return Boolean(r.dueDate && r.dueDate < today() && r.status !== 'Pago');
  }

  function isInsideDateFilter(r) {
    if (!r.dueDate) return !dateFilter.start && !dateFilter.end;
    if (dateFilter.start && r.dueDate < dateFilter.start) return false;
    if (dateFilter.end && r.dueDate > dateFilter.end) return false;
    return true;
  }

  const stats = useMemo(() => {
    const total = data.reimbursements.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return {
      total,
      clients: data.clients.length,
      pending: data.reimbursements.filter(r => r.status === 'Pendente').length,
      approved: data.reimbursements.filter(r => r.status === 'Aprovado' || r.status === 'Pago').length,
      tasks: data.activities.filter(a => a.status !== 'Concluído').length,
      overdue: data.reimbursements.filter(r => r.dueDate && r.dueDate < today() && r.status !== 'Pago').length,
      overdueAmount: data.reimbursements.filter(r => r.dueDate && r.dueDate < today() && r.status !== 'Pago').reduce((sum, r) => sum + Number(r.amount || 0), 0),
    };
  }, [data]);

  const filteredClients = data.clients.filter(c => `${c.name} ${c.cpf} ${c.cnpj} ${c.email}`.toLowerCase().includes(query.toLowerCase()));
  const filteredReimbursements = data.reimbursements.filter(r => {
    const matchesSearch = `${r.id} ${r.title} ${clientMap[r.clientId]?.name || ''} ${r.status}`.toLowerCase().includes(query.toLowerCase());
    const matchesDate = isInsideDateFilter(r);
    const matchesOverdue = !dateFilter.onlyOverdue || isReimbursementOverdue(r);
    return matchesSearch && matchesDate && matchesOverdue;
  });

  const filteredActivities = data.activities.filter(a => {
    const matchesSearch = `${a.id} ${a.title} ${a.assignee} ${a.status} ${a.priority} ${clientMap[a.clientId]?.name || ''}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = activityFilter.status === 'Todos' || a.status === activityFilter.status;
    const matchesPriority = activityFilter.priority === 'Todas' || a.priority === activityFilter.priority;
    const matchesAssignee = activityFilter.assignee === 'Todos' || a.assignee === activityFilter.assignee;
    const matchesLate = !activityFilter.onlyLate || (a.dueDate && a.dueDate < today() && a.status !== 'Concluído');
    return matchesSearch && matchesStatus && matchesPriority && matchesAssignee && matchesLate;
  });

  function saveClient(form, editingId) {
    const client = {
      id: editingId || uid('cli'),
      name: form.name.trim(),
      type: form.cnpj ? 'PJ' : 'PF',
      cpf: form.cpf,
      cnpj: form.cnpj,
      email: form.email,
      phone: form.phone,
      notes: form.notes,
      createdAt: form.createdAt || today(),
    };
    if (!client.name) return notify('Informe o nome do cliente.');
    if (!client.cpf && !client.cnpj) return notify('Informe CPF ou CNPJ.');
    setData(prev => ({
      ...prev,
      clients: editingId ? prev.clients.map(c => c.id === editingId ? client : c) : [...prev.clients, client],
    }));
    setModal(null);
    notify(editingId ? 'Cliente atualizado.' : 'Cliente cadastrado.');
  }

  function saveReimbursement(form, editingId) {
    const item = {
      id: editingId || `REB-${String(data.reimbursements.length + 1).padStart(3, '0')}`,
      clientId: form.clientId,
      title: form.title,
      amount: Number(form.amount || 0),
      status: form.status || 'Pendente',
      dueDate: form.dueDate,
      description: form.description,
      documents: form.documents || [],
      comments: form.comments || [],
      createdAt: form.createdAt || today(),
    };
    if (!item.clientId || !item.title) return notify('Informe cliente e título.');
    setData(prev => ({
      ...prev,
      reimbursements: editingId ? prev.reimbursements.map(r => r.id === editingId ? item : r) : [...prev.reimbursements, item],
    }));
    setModal(null);
    notify(editingId ? 'Reembolso atualizado.' : 'Reembolso cadastrado.');
  }

  function saveActivity(form, editingId) {
    const task = {
      id: editingId || `ATV-${String(data.activities.length + 1).padStart(3, '0')}`,
      title: form.title,
      clientId: form.clientId,
      assignee: form.assignee?.trim(),
      status: form.status || 'A Fazer',
      priority: form.priority || 'Média',
      dueDate: form.dueDate,
      description: form.description,
      createdAt: form.createdAt || today(),
    };
    if (!task.title || !task.assignee) return notify('Informe título e responsável.');
    setData(prev => {
      const updatedTeam = prev.team.includes(task.assignee) ? prev.team : [...prev.team, task.assignee];
      return {
        ...prev,
        team: updatedTeam,
        activities: editingId ? prev.activities.map(a => a.id === editingId ? task : a) : [...prev.activities, task],
      };
    });
    setModal(null);
    notify(editingId ? 'Atividade atualizada.' : 'Atividade criada.');
  }

  function deleteClient(id) {
    setData(prev => ({
      ...prev,
      clients: prev.clients.filter(c => c.id !== id),
      reimbursements: prev.reimbursements.filter(r => r.clientId !== id),
      activities: prev.activities.map(a => a.clientId === id ? { ...a, clientId: '' } : a),
    }));
    notify('Cliente removido.');
  }

  function deleteReimbursement(id) {
    setData(prev => ({ ...prev, reimbursements: prev.reimbursements.filter(r => r.id !== id) }));
    notify('Reembolso removido.');
  }

  function deleteActivity(id) {
    setData(prev => ({ ...prev, activities: prev.activities.filter(a => a.id !== id) }));
    notify('Atividade removida.');
  }

  function addComment(reimbursementId, text) {
    if (!text.trim()) return;
    setData(prev => ({
      ...prev,
      reimbursements: prev.reimbursements.map(r => r.id === reimbursementId ? {
        ...r,
        comments: [...r.comments, { id: uid('com'), author: 'Thiago', text: text.trim(), date: nowLabel() }],
      } : r),
    }));
  }

  function addDocument(reimbursementId, fileName) {
    if (!fileName) return;
    setData(prev => ({
      ...prev,
      reimbursements: prev.reimbursements.map(r => r.id === reimbursementId ? { ...r, documents: [...r.documents, fileName] } : r),
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-sistema-reembolso-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Backup exportado.');
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white p-5 lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200"><Wallet /></div>
          <div>
            <h1 className="text-lg font-bold">Reembolsos</h1>
            <p className="text-xs text-slate-500">Clientes, tarefas e anexos</p>
          </div>
        </div>
        <nav className="space-y-2">
          {[
            ['dashboard', LayoutDashboard, 'Painel'],
            ['reimbursements', Wallet, 'Reembolsos'],
            ['clients', Users, 'Clientes'],
            ['activities', KanbanSquare, 'Atividades'],
          ].map(([key, Icon, label]) => (
            <button key={key} onClick={() => setActive(key)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active === key ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={19} /> {label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
          <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">{isCloudConfigured() ? <Cloud size={16} /> : <CloudOff size={16} />} {isCloudConfigured() ? 'Salvamento em nuvem' : 'Salvamento local'}</div>
          {cloudStatus}. {isCloudConfigured() ? 'As alterações aparecem para todos que abrirem o mesmo sistema.' : 'Para equipe acessar junto, configure o Firebase no código.'}
        </div>
      </aside>

      <main className="lg:ml-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold">{active === 'dashboard' ? 'Painel de controle' : active === 'reimbursements' ? 'Solicitações de reembolso' : active === 'clients' ? 'Cadastro de clientes' : 'Atividades da equipe'}</h2>
              <p className="text-sm text-slate-500">Sistema criado para controle interno de reembolsos aos clientes.</p>
              <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${isCloudConfigured() ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {isCloudConfigured() ? <Cloud size={14} /> : <CloudOff size={14} />}
                {cloudStatus}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={exportData} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">Exportar backup</button>
              {active === 'clients' && <button onClick={() => setModal({ type: 'client' })} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-100"><Plus size={18} /> Novo cliente</button>}
              {active === 'reimbursements' && <button onClick={() => setModal({ type: 'reimbursement' })} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-100"><Plus size={18} /> Novo reembolso</button>}
              {active === 'activities' && <button onClick={() => setModal({ type: 'activity' })} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-100"><Plus size={18} /> Nova atividade</button>}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8">
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Stat icon={Wallet} label="Valor em reembolso" value={currency(stats.total)} />
            <Stat icon={Users} label="Clientes" value={stats.clients} />
            <Stat icon={Clock3} label="Pendentes" value={stats.pending} />
            <Stat icon={CheckCircle2} label="Aprovados/Pagos" value={stats.approved} />
            <Stat icon={ClipboardList} label="Atividades abertas" value={stats.tasks} />
            <Stat icon={AlertTriangle} label="Vencidos para cobrar" value={`${stats.overdue} · ${currency(stats.overdueAmount)}`} />
          </div>

          {active !== 'dashboard' && (
            <div className="mb-5 space-y-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3">
                <Search className="ml-2 text-slate-400" size={20} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por cliente, CPF/CNPJ, status ou ID..." className="w-full bg-transparent px-2 py-2 text-sm outline-none" />
              </div>
              {active === 'reimbursements' && (
                <div className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-4">
                  <Field label="Vencimento inicial"><input type="date" className={inputClass} value={dateFilter.start} onChange={e => setDateFilter({ ...dateFilter, start: e.target.value })} /></Field>
                  <Field label="Vencimento final"><input type="date" className={inputClass} value={dateFilter.end} onChange={e => setDateFilter({ ...dateFilter, end: e.target.value })} /></Field>
                  <label className="flex items-end gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={dateFilter.onlyOverdue} onChange={e => setDateFilter({ ...dateFilter, onlyOverdue: e.target.checked })} />
                    Mostrar só vencidos para cobrar
                  </label>
                  <button onClick={() => setDateFilter({ start: '', end: '', onlyOverdue: false })} className="self-end rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold hover:bg-slate-50">Limpar filtros</button>
                </div>
              )}
              {active === 'activities' && (
                <div className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-5">
                  <Field label="Status"><select className={inputClass} value={activityFilter.status} onChange={e => setActivityFilter({ ...activityFilter, status: e.target.value })}><option>Todos</option><option>A Fazer</option><option>Em Andamento</option><option>Concluído</option></select></Field>
                  <Field label="Prioridade"><select className={inputClass} value={activityFilter.priority} onChange={e => setActivityFilter({ ...activityFilter, priority: e.target.value })}><option>Todas</option><option>Baixa</option><option>Média</option><option>Alta</option></select></Field>
                  <Field label="Responsável"><select className={inputClass} value={activityFilter.assignee} onChange={e => setActivityFilter({ ...activityFilter, assignee: e.target.value })}><option>Todos</option>{data.team.map(t => <option key={t}>{t}</option>)}</select></Field>
                  <label className="flex items-end gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={activityFilter.onlyLate} onChange={e => setActivityFilter({ ...activityFilter, onlyLate: e.target.checked })} />
                    Mostrar só atrasadas
                  </label>
                  <button onClick={() => setActivityFilter({ status: 'Todos', priority: 'Todas', assignee: 'Todos', onlyLate: false })} className="self-end rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold hover:bg-slate-50">Limpar filtros</button>
                </div>
              )}
            </div>
          )}

          {active === 'dashboard' && <Dashboard data={data} clientMap={clientMap} setActive={setActive} />}
          {active === 'clients' && <ClientsTable clients={filteredClients} onEdit={c => setModal({ type: 'client', item: c })} onDelete={deleteClient} />}
          {active === 'reimbursements' && <ReimbursementsTable items={filteredReimbursements} clientMap={clientMap} onOpen={r => setModal({ type: 'reimbursementDetails', item: r })} onEdit={r => setModal({ type: 'reimbursement', item: r })} onDelete={deleteReimbursement} />}
          {active === 'activities' && <ActivityWorkspace activities={filteredActivities} allActivities={data.activities} clientMap={clientMap} onEdit={a => setModal({ type: 'activity', item: a })} onDelete={deleteActivity} setData={setData} />}
        </div>
      </main>

      {modal?.type === 'client' && <ClientModal item={modal.item} onClose={() => setModal(null)} onSave={saveClient} />}
      {modal?.type === 'reimbursement' && <ReimbursementModal item={modal.item} clients={data.clients} onClose={() => setModal(null)} onSave={saveReimbursement} />}
      {modal?.type === 'activity' && <ActivityModal item={modal.item} clients={data.clients} team={data.team} onClose={() => setModal(null)} onSave={saveActivity} />}
      {modal?.type === 'reimbursementDetails' && <ReimbursementDetails item={data.reimbursements.find(r => r.id === modal.item.id)} client={clientMap[modal.item.clientId]} onClose={() => setModal(null)} setData={setData} addComment={addComment} addDocument={addDocument} />}

      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-5 right-5 z-[60] rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">{toast}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-blue-600"><Icon size={21} /></div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </motion.div>
  );
}

function Dashboard({ data, clientMap, setActive }) {
  const recent = [...data.reimbursements].slice(-5).reverse();
  const openTasks = data.activities.filter(a => a.status !== 'Concluído').slice(0, 5);
  const overdue = data.reimbursements.filter(r => r.dueDate && r.dueDate < today() && r.status !== 'Pago');
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Reembolsos vencidos para cobrar</h3>
          <button onClick={() => setActive('reimbursements')} className="text-sm font-semibold text-rose-600">Ver cobranças</button>
        </div>
        <div className="space-y-3">
          {overdue.length ? overdue.map(r => <div key={r.id} className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50 p-4"><div><div className="font-semibold text-rose-900">{r.title}</div><div className="text-sm text-rose-700">{clientMap[r.clientId]?.name || 'Sem cliente'} · Venceu em {r.dueDate}</div></div><div className="text-right"><div className="font-bold text-rose-900">{currency(r.amount)}</div><Badge className="border-rose-200 bg-white text-rose-700">Cobrar</Badge></div></div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum reembolso vencido no momento.</p>}
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Reembolsos recentes</h3>
          <button onClick={() => setActive('reimbursements')} className="text-sm font-semibold text-blue-600">Ver todos</button>
        </div>
        <div className="space-y-3">
          {recent.map(r => <div key={r.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4"><div><div className="font-semibold">{r.title}</div><div className="text-sm text-slate-500">{clientMap[r.clientId]?.name || 'Sem cliente'} · {r.id}</div></div><div className="text-right"><div className="font-bold">{currency(r.amount)}</div><Badge className={statusColors[r.status]}>{r.status}</Badge></div></div>)}
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 xl:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Atividades abertas</h3>
          <button onClick={() => setActive('activities')} className="text-sm font-semibold text-blue-600">Abrir quadro</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {openTasks.map(a => <div key={a.id} className="rounded-2xl border border-slate-100 p-4"><div className="mb-2 flex items-start justify-between gap-3"><div className="font-semibold">{a.title}</div><Badge className={statusColors[a.status]}>{a.status}</Badge></div><div className="text-sm text-slate-500">{clientMap[a.clientId]?.name || 'Sem cliente'} · Responsável: {a.assignee}</div></div>)}
        </div>
      </section>
    </div>
  );
}

function ClientsTable({ clients, onEdit, onDelete }) {
  return <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Cliente</th><th className="p-4">CPF / CNPJ</th><th className="p-4">Contato</th><th className="p-4">Observações</th><th className="p-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{clients.map(c => <tr key={c.id} className="hover:bg-slate-50"><td className="p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600">{c.type === 'PJ' ? <Building2 size={18}/> : <User size={18}/>}</div><div><div className="font-semibold">{c.name}</div><Badge className="border-slate-200 bg-slate-50 text-slate-600">{c.type}</Badge></div></div></td><td className="p-4 text-slate-600">{c.cpf || c.cnpj}</td><td className="p-4 text-slate-600"><div>{c.email || 'Sem e-mail'}</div><div>{c.phone || 'Sem telefone'}</div></td><td className="max-w-xs p-4 text-slate-600">{c.notes || '-'}</td><td className="p-4"><div className="flex justify-end gap-2"><button onClick={() => onEdit(c)} className="rounded-xl p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><Pencil size={17}/></button><button onClick={() => onDelete(c.id)} className="rounded-xl p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>;
}

function ReimbursementsTable({ items, clientMap, onOpen, onEdit, onDelete }) {
  return <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Solicitação</th><th className="p-4">Cliente</th><th className="p-4">Valor</th><th className="p-4">Vencimento</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map(r => { const overdue = r.dueDate && r.dueDate < today() && r.status !== 'Pago'; return <tr key={r.id} className={overdue ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-slate-50'}><td className="p-4"><div className="font-semibold">{r.title}</div><div className="text-xs text-slate-500">{r.id}</div></td><td className="p-4 text-slate-600">{clientMap[r.clientId]?.name || 'Sem cliente'}</td><td className="p-4 font-bold">{currency(r.amount)}</td><td className="p-4 text-slate-600"><div>{r.dueDate || '-'}</div>{overdue && <Badge className="mt-1 border-rose-200 bg-white text-rose-700">Vencido · cobrar</Badge>}</td><td className="p-4"><Badge className={statusColors[r.status]}>{r.status}</Badge></td><td className="p-4"><div className="flex justify-end gap-2"><button onClick={() => onOpen(r)} className="rounded-xl px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50">Detalhes</button><button onClick={() => onEdit(r)} className="rounded-xl p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><Pencil size={17}/></button><button onClick={() => onDelete(r.id)} className="rounded-xl p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={17}/></button></div></td></tr> })}</tbody></table></div>;
}

function ActivityWorkspace({ activities, allActivities, clientMap, onEdit, onDelete, setData }) {
  const total = allActivities.length;
  const done = allActivities.filter(a => a.status === 'Concluído').length;
  const doing = allActivities.filter(a => a.status === 'Em Andamento').length;
  const todo = allActivities.filter(a => a.status === 'A Fazer').length;
  const late = allActivities.filter(a => a.dueDate && a.dueDate < today() && a.status !== 'Concluído').length;
  const high = allActivities.filter(a => a.priority === 'Alta' && a.status !== 'Concluído').length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const byAssignee = Object.entries(allActivities.reduce((acc, a) => {
    acc[a.assignee || 'Sem responsável'] = (acc[a.assignee || 'Sem responsável'] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6 text-white shadow-xl">
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-blue-200">Central de atividades</p>
            <h3 className="mt-1 text-3xl font-bold">Acompanhe a divisão da equipe e os prazos críticos</h3>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">Use esta área para controlar quem está fazendo cada tarefa, o que está atrasado e o que já foi concluído.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat label="Total" value={total} />
              <MiniStat label="Em andamento" value={doing} />
              <MiniStat label="Atrasadas" value={late} danger />
              <MiniStat label="Alta prioridade" value={high} danger />
            </div>
          </div>
          <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/20">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold text-blue-100"><span>Progresso geral</span><span>{progress}%</span></div>
            <div className="h-4 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} /></div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-2xl bg-white/10 p-3"><div className="text-xl font-bold">{todo}</div><div>A fazer</div></div>
              <div className="rounded-2xl bg-white/10 p-3"><div className="text-xl font-bold">{doing}</div><div>Andamento</div></div>
              <div className="rounded-2xl bg-white/10 p-3"><div className="text-xl font-bold">{done}</div><div>Concluído</div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Kanban activities={activities} clientMap={clientMap} onEdit={onEdit} onDelete={onDelete} setData={setData} />
        <aside className="space-y-5">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-4 font-bold">Distribuição por responsável</h3>
            <div className="space-y-3">
              {byAssignee.length ? byAssignee.map(([name, count]) => <div key={name}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold text-slate-700">{name}</span><span className="text-slate-500">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></div></div>) : <p className="text-sm text-slate-500">Nenhuma atividade cadastrada.</p>}
            </div>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-4 font-bold">Próximos prazos</h3>
            <div className="space-y-3">
              {[...allActivities].filter(a => a.status !== 'Concluído' && a.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5).map(a => <div key={a.id} className={`rounded-2xl border p-3 ${a.dueDate < today() ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}><div className="font-semibold text-slate-800">{a.title}</div><div className="text-xs text-slate-500">{a.assignee} · Prazo: {a.dueDate}</div></div>)}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function MiniStat({ label, value, danger }) {
  return <div className={`rounded-3xl p-4 ring-1 ${danger ? 'bg-rose-500/20 ring-rose-300/30' : 'bg-white/10 ring-white/20'}`}><div className="text-2xl font-bold">{value}</div><div className="text-xs font-semibold text-blue-100">{label}</div></div>;
}

function Kanban({ activities, clientMap, onEdit, onDelete, setData }) {
  const columns = ['A Fazer', 'Em Andamento', 'Concluído'];
  function move(id, status) {
    setData(prev => ({ ...prev, activities: prev.activities.map(a => a.id === id ? { ...a, status } : a) }));
  }
  return <div className="grid gap-5 xl:grid-cols-3">{columns.map(col => <section key={col} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">{col}</h3><Badge className={statusColors[col]}>{activities.filter(a => a.status === col).length}</Badge></div><div className="space-y-3">{activities.filter(a => a.status === col).map(a => { const late = a.dueDate && a.dueDate < today() && a.status !== 'Concluído'; return <div key={a.id} className={`rounded-3xl border p-4 ${late ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}><div className="mb-2 flex items-start justify-between gap-2"><h4 className="font-semibold">{a.title}</h4><button onClick={() => onDelete(a.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={16}/></button></div><div className="mb-3 text-sm text-slate-600">{a.description}</div><div className="mb-3 flex flex-wrap gap-2"><Badge className="border-blue-100 bg-blue-50 text-blue-700">{clientMap[a.clientId]?.name || 'Sem cliente'}</Badge><Badge className="border-slate-200 bg-white text-slate-700">{a.assignee}</Badge><Badge className={a.priority === 'Alta' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>{a.priority}</Badge>{late && <Badge className="border-rose-200 bg-white text-rose-700">Atrasada</Badge>}</div><div className="mb-3 text-xs text-slate-500">Prazo: {a.dueDate || 'Sem prazo'}</div><div className="flex items-center justify-between gap-2"><select value={a.status} onChange={e => move(a.id, e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"><option>A Fazer</option><option>Em Andamento</option><option>Concluído</option></select><button onClick={() => onEdit(a)} className="rounded-xl p-2 text-slate-500 hover:bg-white hover:text-blue-600"><Pencil size={16}/></button></div></div> })}</div></section>)}</div>;
}

function ClientModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item || { name: '', cpf: '', cnpj: '', email: '', phone: '', notes: '' });
  return <Modal title={item ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}><div className="grid gap-4 md:grid-cols-2"><Field label="Nome do cliente *"><input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><Field label="CPF"><input className={inputClass} value={form.cpf} onChange={e => setForm({ ...form, cpf: maskCpf(e.target.value) })} /></Field><Field label="CNPJ"><input className={inputClass} value={form.cnpj} onChange={e => setForm({ ...form, cnpj: maskCnpj(e.target.value) })} /></Field><Field label="E-mail (opcional)"><input className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field><Field label="Telefone (opcional)"><input className={inputClass} value={form.phone} onChange={e => setForm({ ...form, phone: maskPhone(e.target.value) })} /></Field><Field label="Observações"><textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div><div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold">Cancelar</button><button onClick={() => onSave(form, item?.id)} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Salvar cliente</button></div></Modal>;
}

function ReimbursementModal({ item, clients, onClose, onSave }) {
  const [form, setForm] = useState(item || { clientId: '', title: '', amount: '', status: 'Pendente', dueDate: '', description: '', documents: [], comments: [] });
  return <Modal title={item ? 'Editar reembolso' : 'Novo reembolso'} onClose={onClose}><div className="grid gap-4 md:grid-cols-2"><Field label="Cliente *"><select className={inputClass} value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}><option value="">Selecione</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name} - {c.cpf || c.cnpj}</option>)}</select></Field><Field label="Título *"><input className={inputClass} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field><Field label="Valor"><input type="number" className={inputClass} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field><Field label="Status"><select className={inputClass} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>Pendente</option><option>Aprovado</option><option>Rejeitado</option><option>Pago</option></select></Field><Field label="Data prevista"><input type="date" className={inputClass} value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field><Field label="Descrição"><textarea className={`${inputClass} min-h-24`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div><div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold">Cancelar</button><button onClick={() => onSave(form, item?.id)} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Salvar reembolso</button></div></Modal>;
}

function ActivityModal({ item, clients, team, onClose, onSave }) {
  const [form, setForm] = useState(item || { title: '', clientId: '', assignee: 'Thiago', status: 'A Fazer', priority: 'Média', dueDate: '', description: '' });
  return <Modal title={item ? 'Editar atividade' : 'Nova atividade'} onClose={onClose}><div className="grid gap-4 md:grid-cols-2"><Field label="Título *"><input className={inputClass} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field><Field label="Cliente"><select className={inputClass} value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}><option value="">Sem cliente</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Responsável *"><input className={inputClass} list="responsaveis-atividades" value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="Digite ou selecione um responsável" /><datalist id="responsaveis-atividades">{team.map(t => <option key={t} value={t} />)}</datalist><span className="mt-1 block text-xs text-slate-500">Você pode escolher uma sugestão ou digitar qualquer outro nome.</span></Field><Field label="Status"><select className={inputClass} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>A Fazer</option><option>Em Andamento</option><option>Concluído</option></select></Field><Field label="Prioridade"><select className={inputClass} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>Baixa</option><option>Média</option><option>Alta</option></select></Field><Field label="Prazo"><input type="date" className={inputClass} value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field><Field label="Descrição"><textarea className={`${inputClass} min-h-24`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div><div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold">Cancelar</button><button onClick={() => onSave(form, item?.id)} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Salvar atividade</button></div></Modal>;
}

function ReimbursementDetails({ item, client, onClose, setData, addComment, addDocument }) {
  const [comment, setComment] = useState('');
  if (!item) return null;
  function changeStatus(status) {
    setData(prev => ({ ...prev, reimbursements: prev.reimbursements.map(r => r.id === item.id ? { ...r, status } : r) }));
  }
  return <Modal title={`Detalhes ${item.id}`} onClose={onClose}><div className="grid gap-5 md:grid-cols-2"><div className="rounded-3xl bg-slate-50 p-5"><h3 className="mb-3 font-bold">Resumo</h3><div className="space-y-2 text-sm"><p><b>Cliente:</b> {client?.name || 'Sem cliente'}</p><p><b>Solicitação:</b> {item.title}</p><p><b>Valor:</b> {currency(item.amount)}</p><p><b>Data prevista:</b> {item.dueDate || '-'}</p><p><b>Status:</b> <Badge className={statusColors[item.status]}>{item.status}</Badge></p><p><b>Descrição:</b> {item.description || '-'}</p></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => changeStatus('Aprovado')} className="rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Aprovar</button><button onClick={() => changeStatus('Rejeitado')} className="rounded-2xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white">Rejeitar</button><button onClick={() => changeStatus('Pago')} className="rounded-2xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Marcar pago</button><button onClick={() => changeStatus('Pendente')} className="rounded-2xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white">Pendente</button></div></div><div className="rounded-3xl bg-slate-50 p-5"><h3 className="mb-3 flex items-center gap-2 font-bold"><FileText size={18}/> Documentos</h3><div className="mb-3 space-y-2">{item.documents.length ? item.documents.map((d, i) => <div key={`${d}-${i}`} className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">{d}</div>) : <p className="text-sm text-slate-500">Nenhum documento anexado.</p>}</div><label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50"><Upload size={17}/> Adicionar documento<input type="file" className="hidden" onChange={e => addDocument(item.id, e.target.files?.[0]?.name)} /></label></div></div><div className="mt-5 rounded-3xl bg-slate-50 p-5"><h3 className="mb-3 flex items-center gap-2 font-bold"><MessageSquare size={18}/> Comentários</h3><div className="mb-4 max-h-56 space-y-3 overflow-auto">{item.comments.map(c => <div key={c.id} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><div className="mb-1 text-xs font-semibold text-slate-500">{c.author} · {c.date}</div><div className="text-sm text-slate-700">{c.text}</div></div>)}</div><div className="flex gap-2"><input className={inputClass} value={comment} onChange={e => setComment(e.target.value)} placeholder="Adicionar comentário..." /><button onClick={() => { addComment(item.id, comment); setComment(''); }} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Enviar</button></div></div></Modal>;
}
