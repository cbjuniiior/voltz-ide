import { Fragment, useEffect, useRef, useState } from 'react';
import { Plus, Grid3x3, TerminalSquare, X as XIcon, Maximize2, Minus, GripHorizontal, StickyNote, Play, Square, Loader2, ListOrdered, LayoutGrid, Copy, Trash2, Scan, Circle, CheckCircle2, GitBranch } from 'lucide-react';
import type { Tab, CanvasRect, CanvasState, CanvasNote, PaneLeaf } from '@shared/types';
import { useWorkspaceStore } from '@/stores/workspace';
import { useClaudeStatusStore } from '@/stores/claudeStatus';
import { useSettingsStore } from '@/stores/settings';
import { useAccountsStore } from '@/stores/claudeAccounts';
import { collectLeaves, newId } from '@/lib/layoutTree';
import { getProjectColor } from '@/lib/projectColors';
import { toast } from '@/stores/toasts';
import { TerminalPane } from './TerminalPane';
import { PaneErrorBoundary } from './PaneErrorBoundary';
import { SquadOverlay } from './SquadOverlay';
import { squadBounds } from '@/lib/squadLayout';

const DEFAULT_CANVAS: CanvasState = { positions: {}, notes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
const NOTE_COLORS = ['#f5c451', '#7dd3fc', '#86efac', '#f0abfc', '#fca5a5'];

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

type Interaction =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; id: string; isNote: boolean; sx: number; sy: number; rect: CanvasRect }
  | { kind: 'resize'; id: string; isNote: boolean; sx: number; sy: number; rect: CanvasRect };

type CtxItem =
  | { separator: true }
  | { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean };

export function WorkspaceCanvas({ tab }: { tab: Tab }) {
  const canvas = tab.canvas ?? DEFAULT_CANVAS;
  const leaves = collectLeaves(tab.root);
  const claudeByPane = useClaudeStatusStore((s) => s.byPane);

  const setCanvasMode = useWorkspaceStore((s) => s.setCanvasMode);
  const setViewport = useWorkspaceStore((s) => s.setCanvasViewport);
  const setRect = useWorkspaceStore((s) => s.setCanvasRect);
  const addTerminal = useWorkspaceStore((s) => s.addCanvasTerminal);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const addNote = useWorkspaceStore((s) => s.addCanvasNote);
  const updateNote = useWorkspaceStore((s) => s.updateCanvasNote);
  const removeNote = useWorkspaceStore((s) => s.removeCanvasNote);
  const addEdge = useWorkspaceStore((s) => s.addCanvasEdge);
  const removeEdge = useWorkspaceStore((s) => s.removeCanvasEdge);

  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(canvas.viewport);
  const [drag, setDrag] = useState<{ id: string; rect: CanvasRect } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; x: number; y: number } | null>(null);
  const [queue, setQueue] = useState<{ leafId: string; noteId: string; done: number; total: number } | null>(null);
  const [menu, setMenu] = useState<{ sx: number; sy: number; items: CtxItem[] } | null>(null);
  const [wtModal, setWtModal] = useState<{ name: string; busy: boolean } | null>(null);
  const interRef = useRef<Interaction | null>(null);
  const connectRef = useRef<string | null>(null);

  useEffect(() => { setView(canvas.viewport); /* eslint-disable-next-line */ }, [tab.id]);

  // Esquadrão: enquadra todos os slots (Maestro + 8 personas) automaticamente ao abrir.
  const fittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tab.squad || fittedRef.current === tab.id) return;
    fittedRef.current = tab.id;
    const t = setTimeout(() => {
      const el = rootRef.current;
      if (!el) return;
      const b = squadBounds();
      const pad = 70;
      const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxY - b.minY);
      const zoom = clamp(Math.min((el.clientWidth - pad * 2) / bw, (el.clientHeight - pad * 2) / bh), MIN_ZOOM, MAX_ZOOM);
      const next = { x: (el.clientWidth - bw * zoom) / 2 - b.minX * zoom, y: (el.clientHeight - bh * zoom) / 2 - b.minY * zoom, zoom };
      setView(next); setViewport(tab.id, next);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  function noteOf(id: string): CanvasNote | undefined {
    return canvas.notes.find((n) => n.id === id);
  }
  function rectOf(id: string): CanvasRect {
    if (drag && drag.id === id) return drag.rect;
    const n = noteOf(id);
    if (n) return { x: n.x, y: n.y, w: n.w, h: n.h };
    return canvas.positions[id] ?? { x: 80, y: 80, w: 460, h: 320 };
  }

  function screenToWorld(clientX: number, clientY: number) {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.zoom, y: (clientY - r.top - view.y) / view.zoom };
  }

  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function queuePersistView(next: { x: number; y: number; zoom: number }) {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => setViewport(tab.id, next), 250);
  }

  // ===== Zoom (Ctrl + wheel) =====
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setView((v) => {
        const nz = clamp(v.zoom * (e.deltaY < 0 ? 1.12 : 0.89), MIN_ZOOM, MAX_ZOOM);
        const wx = (mx - v.x) / v.zoom, wy = (my - v.y) / v.zoom;
        const next = { x: mx - wx * nz, y: my - wy * nz, zoom: nz };
        queuePersistView(next);
        return next;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Mouse global (pan / move / resize / connect) =====
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (connectRef.current) {
        const p = screenToWorld(e.clientX, e.clientY);
        setConnecting({ from: connectRef.current, x: p.x, y: p.y });
        return;
      }
      const it = interRef.current;
      if (!it) return;
      if (it.kind === 'pan') {
        setView({ x: it.vx + (e.clientX - it.sx), y: it.vy + (e.clientY - it.sy), zoom: view.zoom });
      } else if (it.kind === 'move') {
        const dx = (e.clientX - it.sx) / view.zoom, dy = (e.clientY - it.sy) / view.zoom;
        setDrag({ id: it.id, rect: { ...it.rect, x: it.rect.x + dx, y: it.rect.y + dy } });
      } else if (it.kind === 'resize') {
        const dx = (e.clientX - it.sx) / view.zoom, dy = (e.clientY - it.sy) / view.zoom;
        const minW = it.isNote ? 160 : 260, minH = it.isNote ? 90 : 160;
        setDrag({ id: it.id, rect: { ...it.rect, w: Math.max(minW, it.rect.w + dx), h: Math.max(minH, it.rect.h + dy) } });
      }
    }
    function onUp(e: MouseEvent) {
      if (connectRef.current) {
        const from = connectRef.current;
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const card = el?.closest('[data-card-id]') as HTMLElement | null;
        const to = card?.getAttribute('data-card-id');
        if (to && to !== from) addEdge(tab.id, from, to);
        connectRef.current = null;
        setConnecting(null);
        document.body.style.userSelect = '';
        return;
      }
      const it = interRef.current;
      if (it && (it.kind === 'move' || it.kind === 'resize') && drag) {
        if (it.isNote) updateNote(tab.id, drag.id, drag.rect);
        else setRect(tab.id, drag.id, drag.rect);
        setDrag(null);
      } else if (it && it.kind === 'pan') {
        setView((v) => { queuePersistView(v); return v; });
      }
      interRef.current = null;
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.zoom, drag, tab.id]);

  function startPan(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-canvas-card]')) return;
    if (e.button !== 0 && e.button !== 1) return;
    interRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    document.body.style.userSelect = 'none';
  }
  function startMove(id: string, isNote: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    interRef.current = { kind: 'move', id, isNote, sx: e.clientX, sy: e.clientY, rect: rectOf(id) };
    document.body.style.userSelect = 'none';
  }
  function startResize(id: string, isNote: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    interRef.current = { kind: 'resize', id, isNote, sx: e.clientX, sy: e.clientY, rect: rectOf(id) };
    document.body.style.userSelect = 'none';
  }
  function startConnect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    connectRef.current = id;
    const p = screenToWorld(e.clientX, e.clientY);
    setConnecting({ from: id, x: p.x, y: p.y });
    document.body.style.userSelect = 'none';
  }

  function centerWorld(w: number, h: number) {
    const el = rootRef.current;
    const cw = el?.clientWidth ?? 1200, ch = el?.clientHeight ?? 800;
    return { x: (cw / 2 - view.x) / view.zoom - w / 2, y: (ch / 2 - view.y) / view.zoom - h / 2 };
  }
  function addTerminalAt(x: number, y: number) {
    const project = leaves.find((l) => l.projectPath && l.projectName);
    addTerminal(tab.id, { x, y, w: 460, h: 320 }, project?.projectPath && project.projectName ? { name: project.projectName, path: project.projectPath } : undefined);
  }
  function addNoteAt(x: number, y: number) {
    addNote(tab.id, { id: newId('note'), x, y, w: 240, h: 150, text: '', color: NOTE_COLORS[0] });
  }
  function addTerminalCard() { const c = centerWorld(460, 320); addTerminalAt(c.x, c.y); }
  function addNoteCard() { const c = centerWorld(240, 150); addNoteAt(c.x, c.y); }
  function duplicateNote(note: CanvasNote) {
    addNote(tab.id, { ...note, id: newId('note'), x: note.x + 24, y: note.y + 24 });
  }

  // Cria um "agente" isolado: uma worktree git (branch própria) + um terminal nela.
  async function createWorktree() {
    if (!wtModal) return;
    const project = leaves.find((l) => l.projectPath && l.projectName);
    if (!project?.projectPath || !project.projectName) {
      toast.warning('Sem projeto', 'O canvas precisa de um terminal com projeto para criar worktrees.');
      return;
    }
    const name = wtModal.name.trim();
    if (!name) return;
    setWtModal({ name, busy: true });
    try {
      const res = await window.api.git.worktreeAdd(project.projectPath, name);
      if (!res.ok) { toast.error('Falha ao criar worktree', res.error); setWtModal((m) => (m ? { ...m, busy: false } : m)); return; }
      const c = centerWorld(460, 320);
      addTerminal(tab.id, { x: c.x, y: c.y, w: 460, h: 320 }, { name: `${project.projectName} ⑂ ${res.branch}`, path: res.path });
      toast.success('Agente criado', `worktree isolada na branch ${res.branch}`);
      setWtModal(null);
    } catch {
      toast.error('Falha ao criar worktree', 'Erro inesperado.');
      setWtModal((m) => (m ? { ...m, busy: false } : m));
    }
  }
  function resetView() {
    const next = { x: 0, y: 0, zoom: 1 };
    setView(next); setViewport(tab.id, next);
  }

  /** Reorganiza os terminais numa grade limpa (mantém os tamanhos). */
  function autoArrange() {
    const cols = Math.max(1, Math.min(3, leaves.length));
    const STEP_X = 500, STEP_Y = 390;
    leaves.forEach((l, i) => {
      const r = rectOf(l.id);
      setRect(tab.id, l.id, { ...r, x: 60 + (i % cols) * STEP_X, y: 60 + Math.floor(i / cols) * STEP_Y });
    });
    setTimeout(fitView, 60);
  }

  /** Ajusta o pan/zoom para enquadrar todos os cards na tela. */
  function fitView() {
    const rects = [...leaves.map((l) => rectOf(l.id)), ...canvas.notes.map((n) => rectOf(n.id))];
    if (rects.length === 0) return resetView();
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    const el = rootRef.current;
    if (!el) return;
    const pad = 60;
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const zoom = clamp(Math.min((el.clientWidth - pad * 2) / bw, (el.clientHeight - pad * 2) / bh), MIN_ZOOM, MAX_ZOOM);
    const x = (el.clientWidth - bw * zoom) / 2 - minX * zoom;
    const y = (el.clientHeight - bh * zoom) / 2 - minY * zoom;
    const next = { x, y, zoom };
    setView(next); setViewport(tab.id, next);
  }

  // ===== Menu de contexto (clique direito) =====
  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const r = rootRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const world = screenToWorld(e.clientX, e.clientY);
    const card = (e.target as HTMLElement).closest('[data-card-id]') as HTMLElement | null;
    if (card) {
      const id = card.getAttribute('data-card-id')!;
      const note = canvas.notes.find((n) => n.id === id);
      if (note) {
        setMenu({ sx, sy, items: [
          { label: 'Enviar p/ conectados', icon: <Play size={13} />, onClick: () => sendNote(note) },
          { label: 'Duplicar nota', icon: <Copy size={13} />, onClick: () => duplicateNote(note) },
          { separator: true },
          { label: 'Excluir nota', icon: <Trash2 size={13} />, danger: true, onClick: () => removeNote(tab.id, id) },
        ] });
      } else {
        setMenu({ sx, sy, items: [
          { label: 'Fechar terminal', icon: <XIcon size={13} />, danger: true, onClick: () => closePane(tab.id, id) },
        ] });
      }
      return;
    }
    setMenu({ sx, sy, items: [
      { label: 'Adicionar terminal aqui', icon: <TerminalSquare size={13} />, onClick: () => addTerminalAt(world.x, world.y) },
      { label: 'Adicionar nota aqui', icon: <StickyNote size={13} />, onClick: () => addNoteAt(world.x, world.y) },
      { separator: true },
      { label: 'Organizar em grade', icon: <LayoutGrid size={13} />, onClick: autoArrange },
      { label: 'Enquadrar tudo', icon: <Scan size={13} />, onClick: fitView },
      { label: 'Zoom 100%', icon: <Maximize2 size={13} />, onClick: resetView },
      { separator: true },
      { label: 'Voltar para grade', icon: <Grid3x3 size={13} />, onClick: () => setCanvasMode(tab.id, false) },
    ] });
  }

  function sendNote(note: CanvasNote) {
    if (!note.text.trim()) { toast.warning('Nota vazia', 'Escreva o briefing antes de enviar.'); return; }
    const targetIds = canvas.edges
      .filter((e) => e.from === note.id || e.to === note.id)
      .map((e) => (e.from === note.id ? e.to : e.from));
    const terms = targetIds
      .map((id) => leaves.find((l) => l.id === id))
      .filter((l): l is PaneLeaf => !!l && !!l.terminalId);
    if (terms.length === 0) {
      toast.warning('Nenhum terminal conectado', 'Ligue a nota a um terminal (puxe da bolinha) e tente de novo.');
      return;
    }
    for (const t of terms) window.api.pty.write(t.terminalId!, note.text + '\r');
    toast.success('Enviado', `Tarefa enviada para ${terms.length} terminal(is).`);
  }

  // ===== Lista de tarefas (notas conectadas) + execução em sequência =====
  // As tarefas de um terminal SÃO as notas ligadas a ele (ordem visual cima→baixo).
  function connectedNotes(leafId: string): CanvasNote[] {
    const ids = new Set(canvas.edges.filter((e) => e.from === leafId || e.to === leafId).map((e) => (e.from === leafId ? e.to : e.from)));
    return canvas.notes.filter((n) => ids.has(n.id)).sort((a, b) => a.y - b.y || a.x - b.x);
  }
  // Adicionar tarefa "direto na lista" = cria uma nota já conectada ao terminal.
  function addTaskToTerminal(leafId: string, text: string) {
    const r = rectOf(leafId);
    const count = connectedNotes(leafId).length;
    const id = newId('note');
    addNote(tab.id, { id, x: r.x + r.w + 60, y: r.y + count * 124, w: 240, h: 110, text: text.trim(), color: NOTE_COLORS[0] });
    addEdge(tab.id, leafId, id);
  }

  const queueRef = useRef<{ cancel: boolean } | null>(null);

  function stopQueue() {
    if (queueRef.current) queueRef.current.cancel = true;
    setQueue(null);
  }

  // Aguarda o Claude do terminal começar (running) e voltar a ficar ocioso.
  function waitForIdle(leafId: string, isCancelled: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      let started = false;
      const startTimer = setTimeout(() => { if (!started) finish(); }, 12000); // nunca "começou" → segue
      const poll = setInterval(() => {
        if (isCancelled()) return finish();
        const st = useClaudeStatusStore.getState().byPane[leafId];
        if (st === 'running') started = true;
        if (started && st !== 'running') finish();
      }, 400);
      function finish() { clearInterval(poll); clearTimeout(startTimer); resolve(); }
    });
  }

  // Aguarda o Claude SUBIR (status 'running') após iniciá-lo, com timeout.
  function waitForClaudeStart(leafId: string, isCancelled: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      const to = setTimeout(finish, 20000);
      const poll = setInterval(() => {
        if (isCancelled()) return finish();
        if (useClaudeStatusStore.getState().byPane[leafId]) finish(); // qualquer atividade já basta
      }, 300);
      function finish() { clearInterval(poll); clearTimeout(to); resolve(); }
    });
  }

  // Inicia o Claude no terminal se ainda não houver atividade detectada nele.
  async function ensureClaudeRunning(leaf: PaneLeaf, isCancelled: () => boolean) {
    if (!leaf.terminalId || useClaudeStatusStore.getState().byPane[leaf.id]) return;
    const s = useSettingsStore.getState().settings;
    let claudePath = s.claudePath;
    if (!claudePath) {
      try { const r = await window.api.claude.detect(); claudePath = r.path; } catch { /* ignore */ }
    }
    if (!claudePath) { toast.warning('Claude não encontrado', 'Defina o caminho do Claude nas Configurações.'); return; }
    // Garante a conta ativa (CLAUDE_CONFIG_DIR) ANTES do Claude — senão ele cai
    // no ~/.claude padrão e pode pedir login.
    const dir = useAccountsStore.getState().dirFor(leaf.claudeAccountId);
    if (dir) {
      const setEnv = s.defaultShell === 'cmd'
        ? `set "CLAUDE_CONFIG_DIR=${dir}"`
        : s.defaultShell === 'pwsh'
          ? `$env:CLAUDE_CONFIG_DIR='${dir}'`
          : `export CLAUDE_CONFIG_DIR="${dir}"`;
      window.api.pty.write(leaf.terminalId, `${setEnv}\r`);
    }
    const cmd = s.defaultShell === 'pwsh' ? `& "${claudePath}"` : `"${claudePath}"`;
    window.api.pty.write(leaf.terminalId, `${cmd}\r`);
    await waitForClaudeStart(leaf.id, isCancelled);
  }

  // Terminais ligados a este por dependência (edge A→B, ambos terminais).
  function downstreamTerminals(leafId: string): string[] {
    return canvas.edges
      .filter((e) => e.from === leafId && leaves.some((l) => l.id === e.to && !!l.terminalId))
      .map((e) => e.to);
  }

  // Executa a fila de UM terminal (auto-inicia o Claude se preciso).
  async function runTerminalQueue(leafId: string, token: { cancel: boolean }) {
    const leaf = leaves.find((l) => l.id === leafId);
    if (!leaf?.terminalId) return;
    const pending = connectedNotes(leafId).filter((n) => !n.done && n.text.trim());
    if (!pending.length) return;
    await ensureClaudeRunning(leaf, () => token.cancel);
    for (let i = 0; i < pending.length; i++) {
      if (token.cancel) return;
      setQueue({ leafId, noteId: pending[i].id, done: i, total: pending.length });
      window.api.pty.write(leaf.terminalId, pending[i].text + '\r');
      await new Promise((r) => setTimeout(r, 600)); // folga p/ o Claude começar
      await waitForIdle(leafId, () => token.cancel);
      if (!token.cancel) updateNote(tab.id, pending[i].id, { done: true }); // marca o ✓
    }
  }

  // Roda a fila e encadeia os terminais conectados (A→B→C), evitando ciclos.
  async function runChainFrom(leafId: string, token: { cancel: boolean }, chain: Set<string>) {
    if (token.cancel || chain.has(leafId)) return;
    chain.add(leafId);
    await runTerminalQueue(leafId, token);
    if (token.cancel) return;
    for (const next of downstreamTerminals(leafId)) {
      if (token.cancel) break;
      await runChainFrom(next, token, chain);
    }
  }

  async function runQueue(leafId: string) {
    const leaf = leaves.find((l) => l.id === leafId);
    if (!leaf?.terminalId) { toast.warning('Terminal não iniciado', 'Inicie o terminal antes de rodar a fila.'); return; }
    const hasTasks = connectedNotes(leafId).some((n) => !n.done && n.text.trim());
    if (!hasTasks && downstreamTerminals(leafId).length === 0) {
      toast.warning('Sem tarefas pendentes', 'Adicione tarefas na lista do terminal.');
      return;
    }
    const token = { cancel: false };
    queueRef.current = token;
    const chain = new Set<string>();
    await runChainFrom(leafId, token, chain);
    queueRef.current = null;
    setQueue(null);
    if (!token.cancel) {
      toast.success('Fila concluída', chain.size > 1 ? `${chain.size} terminais executados em cadeia.` : 'Tarefas executadas.');
    }
  }

  // Ponto de saída do rect `a` na direção do alvo (tx,ty): escolhe o lado
  // (cima/baixo/esq/dir) mais alinhado com a direção.
  function sideTowards(a: CanvasRect, tx: number, ty: number) {
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const dx = tx - ax, dy = ty - ay;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? a.x + a.w : a.x, y: ay, h: true };
    return { x: ax, y: dy >= 0 ? a.y + a.h : a.y, h: false };
  }
  function edgePoints(fromId: string, toId: string) {
    const a = rectOf(fromId), b = rectOf(toId);
    const pa = sideTowards(a, b.x + b.w / 2, b.y + b.h / 2);
    const pb = sideTowards(b, a.x + a.w / 2, a.y + a.h / 2);
    return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, horizontal: pa.h };
  }
  function bezier(p: { x1: number; y1: number; x2: number; y2: number; horizontal: boolean }) {
    if (p.horizontal) {
      const c = Math.max(40, Math.abs(p.x2 - p.x1) * 0.5) * (p.x2 >= p.x1 ? 1 : -1);
      return `M ${p.x1} ${p.y1} C ${p.x1 + c} ${p.y1}, ${p.x2 - c} ${p.y2}, ${p.x2} ${p.y2}`;
    }
    const c = Math.max(40, Math.abs(p.y2 - p.y1) * 0.5) * (p.y2 >= p.y1 ? 1 : -1);
    return `M ${p.x1} ${p.y1} C ${p.x1} ${p.y1 + c}, ${p.x2} ${p.y2 - c}, ${p.x2} ${p.y2}`;
  }

  return (
    <div
      ref={rootRef}
      className="canvas-bg relative h-full w-full overflow-hidden"
      style={{ cursor: interRef.current?.kind === 'pan' ? 'grabbing' : 'default' }}
      onMouseDown={(e) => { setMenu(null); startPan(e); }}
      onContextMenu={onContextMenu}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {/* Conexões (atrás dos cards) */}
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1 }}>
          <defs>
            <marker id="dep-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
            </marker>
          </defs>
          {canvas.edges.map((e) => {
            if (!rectExists(e.from, canvas, leaves) || !rectExists(e.to, canvas, leaves)) return null;
            const p = edgePoints(e.from, e.to);
            const d = bezier(p);
            // "Viva" quando um terminal conectado está com o Claude trabalhando
            // (ou a fila rodando) — anima o fluxo na direção origem → destino.
            const active = [e.from, e.to].some((id) => leaves.some((l) => l.id === id) && (claudeByPane[id] === 'running' || queue?.leafId === id));
            // Dependência: edge entre DOIS terminais (A→B encadeia a execução).
            const isDep = leaves.some((l) => l.id === e.from) && leaves.some((l) => l.id === e.to);
            return (
              <g key={e.id} className="pointer-events-auto">
                <path d={d} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer" onClick={() => removeEdge(tab.id, e.id)}>
                  <title>{isDep ? 'Dependência: ao terminar a origem, roda o destino · clique para remover' : 'Clique para remover a conexão'}</title>
                </path>
                <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeOpacity={active ? 0.25 : 0.55} strokeDasharray={isDep ? '6 5' : undefined} markerEnd={isDep ? 'url(#dep-arrow)' : undefined} className="pointer-events-none" />
                {active && <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" className="canvas-edge-flow pointer-events-none" />}
                {!isDep && <circle cx={p.x2} cy={p.y2} r={active ? 4 : 3.5} fill="var(--accent)" className={`pointer-events-none ${active ? 'claude-dot' : ''}`} />}
              </g>
            );
          })}
          {connecting && (() => {
            const a = rectOf(connecting.from);
            const pa = sideTowards(a, connecting.x, connecting.y);
            return <path d={bezier({ x1: pa.x, y1: pa.y, x2: connecting.x, y2: connecting.y, horizontal: pa.h })} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.8} />;
          })()}
        </svg>

        {/* Esquadrão: conexões + personas "aguardando" (abrem terminal ao receber ordem) */}
        {tab.squad && <SquadOverlay tabId={tab.id} leaves={leaves} rectOf={rectOf} />}

        {/* Terminais + sua lista de tarefas (browser não executa, então sem lista) */}
        {leaves.map((leaf) => {
          const running = queue?.leafId === leaf.id;
          const r = rectOf(leaf.id);
          const isBrowser = leaf.viewMode === 'browser';
          return (
            <Fragment key={leaf.id}>
              <TerminalCard
                tabId={tab.id}
                leaf={leaf}
                rect={r}
                highlight={running}
                needsApproval={claudeByPane[leaf.id] === 'approval'}
                onMoveStart={(e) => startMove(leaf.id, false, e)}
                onResizeStart={(e) => startResize(leaf.id, false, e)}
                onConnectStart={(e) => startConnect(leaf.id, e)}
                onClose={() => closePane(tab.id, leaf.id)}
              />
              {!isBrowser && !tab.squad && (
                <QueuePanel
                  rect={r}
                  notes={connectedNotes(leaf.id)}
                  running={running}
                  runningNoteId={running ? queue!.noteId : null}
                  onAdd={(text) => addTaskToTerminal(leaf.id, text)}
                  onToggle={(id, done) => updateNote(tab.id, id, { done })}
                  onEditText={(id, text) => updateNote(tab.id, id, { text })}
                  onRemove={(id) => removeNote(tab.id, id)}
                  onRun={() => runQueue(leaf.id)}
                  onStop={stopQueue}
                />
              )}
            </Fragment>
          );
        })}

        {/* Notas */}
        {canvas.notes.map((note) => (
          <NoteCard
            key={note.id}
            note={{ ...note, ...rectOf(note.id) }}
            active={queue?.noteId === note.id}
            onToggleDone={() => updateNote(tab.id, note.id, { done: !note.done })}
            onMoveStart={(e) => startMove(note.id, true, e)}
            onResizeStart={(e) => startResize(note.id, true, e)}
            onConnectStart={(e) => startConnect(note.id, e)}
            onChange={(text) => updateNote(tab.id, note.id, { text })}
            onColor={(color) => updateNote(tab.id, note.id, { color })}
            onClose={() => removeNote(tab.id, note.id)}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-border-subtle bg-bg-surface/95 p-1 shadow-lg backdrop-blur">
        <button
          onClick={() => setCanvasMode(tab.id, false)}
          title="Voltar para o layout em grade"
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-hover"
        >
          <Grid3x3 size={14} /> Grade
        </button>
        <span className="mx-0.5 h-5 w-px bg-border-subtle" />
        <ToolBtn onClick={addTerminalCard} title="Adicionar terminal"><TerminalSquare size={15} /></ToolBtn>
        <ToolBtn onClick={addNoteCard} title="Adicionar nota / briefing"><StickyNote size={15} /></ToolBtn>
        <ToolBtn onClick={() => setWtModal({ name: '', busy: false })} title="Novo agente em worktree isolada (git)"><GitBranch size={15} /></ToolBtn>
        <span className="mx-0.5 h-5 w-px bg-border-subtle" />
        <ToolBtn onClick={() => setView((v) => { const n = { ...v, zoom: clamp(v.zoom * 0.89, MIN_ZOOM, MAX_ZOOM) }; queuePersistView(n); return n; })} title="Diminuir zoom"><Minus size={15} /></ToolBtn>
        <span className="min-w-[42px] text-center text-[11px] font-semibold tabular-nums text-text-muted">{Math.round(view.zoom * 100)}%</span>
        <ToolBtn onClick={() => setView((v) => { const n = { ...v, zoom: clamp(v.zoom * 1.12, MIN_ZOOM, MAX_ZOOM) }; queuePersistView(n); return n; })} title="Aumentar zoom"><Plus size={15} /></ToolBtn>
        <ToolBtn onClick={resetView} title="Reajustar (100%)"><Maximize2 size={14} /></ToolBtn>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border-subtle bg-bg-surface/80 px-3 py-1 text-[10.5px] text-text-muted backdrop-blur">
        Arraste o fundo p/ mover · Ctrl+scroll p/ zoom · clique direito p/ menu · puxe a bolinha → para conectar
      </div>

      {/* Menu de contexto */}
      {menu && <ContextMenu sx={menu.sx} sy={menu.sy} items={menu.items} onClose={() => setMenu(null)} />}

      {/* Modal: novo agente em worktree */}
      {wtModal && (
        <div
          className="absolute inset-0 z-[40] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onMouseDown={() => { if (!wtModal.busy) setWtModal(null); }}
        >
          <div className="w-[min(380px,90vw)] rounded-xl border border-border-default bg-bg-overlay p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
              <GitBranch size={15} className="text-accent" /> Novo agente em worktree
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-text-muted">
              Cria uma cópia isolada do projeto numa branch nova — o Claude trabalha sem conflitar com os outros agentes do canvas.
            </p>
            <input
              autoFocus
              value={wtModal.name}
              onChange={(e) => setWtModal({ ...wtModal, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void createWorktree(); else if (e.key === 'Escape') setWtModal(null); }}
              placeholder="nome da branch (ex.: feature/login)"
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setWtModal(null)} className="rounded-lg px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-bg-hover">Cancelar</button>
              <button
                onClick={() => void createWorktree()}
                disabled={wtModal.busy || !wtModal.name.trim()}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {wtModal.busy ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />} Criar agente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextMenu({ sx, sy, items, onClose }: { sx: number; sy: number; items: CtxItem[]; onClose: () => void }) {
  useEffect(() => {
    function onDown() { onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div
      className="absolute z-30 min-w-[190px] overflow-hidden rounded-lg border border-border-default bg-bg-overlay py-1 shadow-xl"
      style={{ left: sx, top: sy }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => ('separator' in it ? (
        <div key={i} className="my-1 h-px bg-border-subtle" />
      ) : (
        <button
          key={i}
          onClick={() => { it.onClick(); onClose(); }}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-bg-hover"
          style={{ color: it.danger ? 'var(--danger)' : 'var(--text-secondary)' }}
        >
          <span className="opacity-80">{it.icon}</span>
          <span className="flex-1">{it.label}</span>
        </button>
      )))}
    </div>
  );
}

function rectExists(id: string, canvas: CanvasState, leaves: PaneLeaf[]): boolean {
  return !!canvas.positions[id] || canvas.notes.some((n) => n.id === id) || leaves.some((l) => l.id === id);
}

/** To-do list editável de um terminal: adicione tarefas direto na lista, marque,
 *  edite, remova — e rode tudo em sequência (✓ persiste conforme executa). */
function QueuePanel({
  rect, notes, running, runningNoteId, onAdd, onToggle, onEditText, onRemove, onRun, onStop,
}: {
  rect: CanvasRect;
  notes: CanvasNote[];
  running: boolean;
  runningNoteId: string | null;
  onAdd: (text: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onEditText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onRun: () => void;
  onStop: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const tasks = notes;
  const doneCount = tasks.filter((t) => t.done).length;
  const pending = tasks.filter((t) => !t.done).length;

  function commitEdit() {
    if (editing) { onEditText(editing, editVal.trim() || '(vazia)'); setEditing(null); }
  }

  return (
    <div
      data-canvas-card
      className="absolute overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg"
      style={{ left: rect.x, top: rect.y + rect.h + 10, width: Math.max(260, Math.min(rect.w, 380)) }}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-2.5 py-1.5">
        <ListOrdered size={12} className="text-accent" />
        <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Tarefas{tasks.length > 0 ? ` · ${doneCount}/${tasks.length}` : ''}
        </span>
        {running ? (
          <button onClick={onStop} onMouseDown={(e) => e.stopPropagation()}
            className="flex h-6 items-center gap-1 rounded-md border border-border-subtle px-2 text-[10.5px] font-semibold text-text-secondary transition-colors hover:bg-bg-hover">
            <Square size={10} fill="currentColor" /> Parar
          </button>
        ) : pending > 0 ? (
          <button onClick={onRun} onMouseDown={(e) => e.stopPropagation()}
            className="flex h-6 items-center gap-1 rounded-md px-2.5 text-[10.5px] font-semibold transition-all hover:brightness-110"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <Play size={10} fill="currentColor" /> Rodar tudo
          </button>
        ) : null}
      </div>

      <div className="max-h-[220px] overflow-y-auto py-1">
        {tasks.map((t, i) => {
          const isRunning = running && t.id === runningNoteId;
          return (
            <div key={t.id} className="group/task flex items-center gap-2 px-2 py-1">
              {isRunning ? (
                <Loader2 size={15} className="shrink-0 animate-spin text-accent" />
              ) : (
                <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggle(t.id, !t.done)} title={t.done ? 'Desmarcar' : 'Marcar como feita'} className="shrink-0">
                  {t.done ? <CheckCircle2 size={15} className="text-success" /> : <Circle size={15} className="text-text-disabled transition-colors hover:text-text-muted" />}
                </button>
              )}
              <span className="w-4 shrink-0 text-right text-[10px] font-semibold tabular-nums text-text-muted">{i + 1}.</span>
              {editing === t.id ? (
                <input
                  autoFocus
                  value={editVal}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); else if (e.key === 'Escape') setEditing(null); }}
                  className="flex-1 rounded border border-accent bg-bg-base px-1.5 py-0.5 text-[11.5px] text-text-primary outline-none"
                />
              ) : (
                <span
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={() => { setEditing(t.id); setEditVal(t.text); }}
                  title="Duplo-clique para editar"
                  className="flex-1 cursor-text truncate text-[11.5px]"
                  style={{ color: t.done ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: t.done ? 'line-through' : undefined }}
                >
                  {t.text.split('\n')[0] || '(vazia)'}
                </span>
              )}
              <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onRemove(t.id)} title="Remover tarefa"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-all hover:text-danger group-hover/task:opacity-100">
                <XIcon size={11} />
              </button>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className="px-3 py-1.5 text-[10.5px] text-text-muted">Nenhuma tarefa ainda — adicione abaixo.</div>
        )}
      </div>

      {/* Input para adicionar direto na lista */}
      <div className="flex items-center gap-1.5 border-t border-border-subtle px-2 py-1.5">
        <Plus size={13} className="shrink-0 text-text-muted" />
        <input
          value={draft}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { onAdd(draft.trim()); setDraft(''); } }}
          placeholder="Adicionar tarefa e Enter…"
          className="flex-1 bg-transparent text-[11.5px] text-text-primary outline-none placeholder:text-text-muted"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function ToolBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary">
      {children}
    </button>
  );
}

const HANDLE_SIDES = [
  { side: 'top', cls: 'left-1/2 -top-2 -translate-x-1/2' },
  { side: 'right', cls: '-right-2 top-1/2 -translate-y-1/2' },
  { side: 'bottom', cls: 'left-1/2 -bottom-2 -translate-x-1/2' },
  { side: 'left', cls: '-left-2 top-1/2 -translate-y-1/2' },
] as const;

/** Bolinhas de conexão nos 4 lados do card (aparecem no hover). */
function ConnectHandles({ onStart }: { onStart: (e: React.MouseEvent) => void }) {
  return (
    <>
      {HANDLE_SIDES.map(({ side, cls }) => (
        <div
          key={side}
          onMouseDown={onStart}
          title="Arraste para conectar a outro card"
          className={`absolute z-30 flex h-3.5 w-3.5 cursor-crosshair items-center justify-center rounded-full border-2 bg-bg-surface opacity-0 shadow-sm transition-all hover:scale-125 group-hover/card:opacity-100 ${cls}`}
          style={{ borderColor: 'var(--accent)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
        </div>
      ))}
    </>
  );
}

function TerminalCard({
  tabId, leaf, rect, highlight, needsApproval, onMoveStart, onResizeStart, onConnectStart, onClose,
}: {
  tabId: string;
  leaf: PaneLeaf;
  rect: CanvasRect;
  highlight: boolean;
  needsApproval?: boolean;
  onMoveStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onConnectStart: (e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  const color = leaf.customColor ?? (leaf.projectName ? getProjectColor(leaf.projectName).border : 'var(--accent)');
  const borderColor = needsApproval ? 'var(--warning)' : highlight ? 'var(--accent)' : `color-mix(in srgb, ${color} 35%, var(--border-subtle))`;
  return (
    <div data-canvas-card data-card-id={leaf.id} className={`group/card absolute ${needsApproval ? 'claude-dot' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-bg-surface shadow-xl"
        style={{ borderColor, boxShadow: needsApproval ? '0 0 0 2px var(--warning), 0 10px 30px -10px color-mix(in srgb, var(--warning) 50%, transparent)' : undefined }}
      >
        <div
          onMouseDown={onMoveStart}
          className="group/grip relative flex h-5 shrink-0 cursor-grab items-center justify-center border-b border-border-subtle bg-bg-elevated active:cursor-grabbing"
          title="Arraste para mover o terminal no canvas"
        >
          <GripHorizontal size={13} className="text-text-disabled transition-colors group-hover/grip:text-text-muted" />
          <button onClick={onClose} onMouseDown={(e) => e.stopPropagation()} title="Fechar terminal"
            className="absolute right-1 flex h-4 w-4 items-center justify-center rounded text-text-muted opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover/grip:opacity-100">
            <XIcon size={11} />
          </button>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <PaneErrorBoundary>
            <TerminalPane tabId={tabId} pane={leaf} canvasMode />
          </PaneErrorBoundary>
        </div>
      </div>
      <ConnectHandles onStart={onConnectStart} />
      <div onMouseDown={onResizeStart} title="Redimensionar" className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-se-resize"
        style={{ background: 'linear-gradient(135deg, transparent 50%, color-mix(in srgb, var(--text-muted) 50%, transparent) 50%)' }} />
    </div>
  );
}

function NoteCard({
  note, active, onToggleDone, onMoveStart, onResizeStart, onConnectStart, onChange, onColor, onClose,
}: {
  note: CanvasNote;
  active?: boolean;
  onToggleDone: () => void;
  onMoveStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onConnectStart: (e: React.MouseEvent) => void;
  onChange: (text: string) => void;
  onColor: (color: string) => void;
  onClose: () => void;
}) {
  const accent = note.color ?? NOTE_COLORS[0];
  return (
    <div data-canvas-card data-card-id={note.id} className="group/card absolute" style={{ left: note.x, top: note.y, width: note.w, height: note.h }}>
      <div
        className={`group/note flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-lg ${active ? 'claude-dot' : ''}`}
        style={{
          background: `color-mix(in srgb, ${accent} 16%, var(--bg-surface))`,
          borderColor: active ? 'var(--accent)' : note.done ? 'var(--success)' : `color-mix(in srgb, ${accent} 50%, transparent)`,
          boxShadow: active ? '0 0 0 2px var(--accent), 0 8px 24px -8px color-mix(in srgb, var(--accent) 60%, transparent)' : undefined,
          opacity: note.done && !active ? 0.6 : 1,
        }}
      >
        {/* Cabeçalho (mover) */}
        <div onMouseDown={onMoveStart} className="flex h-6 shrink-0 cursor-grab items-center gap-1 px-1.5 active:cursor-grabbing" style={{ background: `color-mix(in srgb, ${accent} 26%, transparent)` }}>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onToggleDone} title={note.done ? 'Desmarcar' : 'Marcar como feita'} className="shrink-0">
            {note.done ? <CheckCircle2 size={12} className="text-success" /> : <Circle size={12} className="text-text-muted transition-colors hover:text-text-secondary" />}
          </button>
          <div className="flex flex-1 items-center gap-1">
            {NOTE_COLORS.map((c) => (
              <button key={c} onMouseDown={(e) => e.stopPropagation()} onClick={() => onColor(c)} title="Cor"
                className="h-2.5 w-2.5 rounded-full border transition-transform hover:scale-125"
                style={{ background: c, borderColor: c === accent ? 'var(--text-primary)' : 'transparent' }} />
            ))}
          </div>
          <button onClick={onClose} onMouseDown={(e) => e.stopPropagation()} title="Excluir tarefa"
            className="flex h-4 w-4 items-center justify-center rounded text-text-muted opacity-0 transition-all hover:text-danger group-hover/note:opacity-100">
            <XIcon size={11} />
          </button>
        </div>
        {/* Texto */}
        <textarea
          value={note.text}
          onChange={(e) => onChange(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Briefing / tarefa para o terminal executar…"
          className="flex-1 resize-none bg-transparent px-2.5 py-2 text-[11.5px] leading-relaxed text-text-primary outline-none placeholder:text-text-muted"
          spellCheck={false}
        />
      </div>
      <ConnectHandles onStart={onConnectStart} />
      <div onMouseDown={onResizeStart} title="Redimensionar" className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-se-resize"
        style={{ background: 'linear-gradient(135deg, transparent 50%, color-mix(in srgb, var(--text-muted) 45%, transparent) 50%)' }} />
    </div>
  );
}
