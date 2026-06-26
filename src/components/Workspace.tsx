import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import type { PaneNode, PaneLeaf, Tab } from '@shared/types';
import { useWorkspaceStore } from '@/stores/workspace';
import { useEditorStore } from '@/stores/editor';
import { collectLeaves } from '@/lib/layoutTree';
import { TerminalPane } from './TerminalPane';
import { PaneErrorBoundary } from './PaneErrorBoundary';
import { EditorArea } from './EditorArea';
import { FileTreePanel } from './FileTreePanel';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { EmptySlotPicker } from './EmptySlotPicker';
import { VideoPane } from './VideoPane';
import { PaneDropZone } from './PaneDropZone';

/** Slot vazio "puro": sem tipo escolhido, sem projeto e sem terminal. */
function isEmptySlot(p: PaneLeaf): boolean {
  return !p.viewMode && !p.projectPath && !p.terminalId;
}

interface Props {
  tab: Tab;
}

export function Workspace({ tab }: Props) {
  // Resolve the project that the file tree + editor should bind to: the first
  // leaf in this tab that has a project assigned. Tabs without any project
  // fall back to the legacy "terminals only" layout.
  const projectInfo = useMemo(() => {
    for (const leaf of collectLeaves(tab.root)) {
      if (leaf.projectPath && leaf.projectName) {
        return { path: leaf.projectPath, name: leaf.projectName };
      }
    }
    return null;
  }, [tab.root]);

  // Árvore de arquivos — estado na store (controlada pelo header de cada terminal).
  const treeHidden = useWorkspaceStore((s) => s.treeHidden);
  const treeProject = useWorkspaceStore((s) => s.treeProject);
  const setTreeHidden = useWorkspaceStore((s) => s.setTreeHidden);
  const setTreeProject = useWorkspaceStore((s) => s.setTreeProject);

  // Ao entrar/trocar de aba (ou mudar o projeto principal), a árvore passa a
  // apontar para o projeto principal desta aba — assim cada aba mostra o seu.
  useEffect(() => {
    setTreeProject(projectInfo ? { path: projectInfo.path, name: projectInfo.name } : null);
  }, [tab.id, projectInfo?.path, projectInfo?.name, setTreeProject]);

  const hasOpenFiles = useEditorStore((s) =>
    (s.byTab[tab.id]?.openFiles.length ?? 0) > 0
  );

  // Ctrl/Cmd+B alterna a árvore (padrão de editores). Ignora quando o foco está
  // num campo de texto para não atrapalhar a digitação.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        const el = document.activeElement as HTMLElement | null;
        const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (typing) return;
        e.preventDefault();
        setTreeHidden(!useWorkspaceStore.getState().treeHidden);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTreeHidden]);

  const showTree = !treeHidden && !!treeProject;
  const editorPanelRef = useRef<ImperativePanelHandle>(null);

  // Imperatively collapse the editor panel when no files are open so the
  // terminal takes the whole vertical space. We never unmount the editor
  // panel — that would force its child to remount (and we don't want the
  // sibling terminal to be re-keyed either).
  useEffect(() => {
    const p = editorPanelRef.current;
    if (!p) return;
    if (hasOpenFiles && p.isCollapsed()) p.expand();
    else if (!hasOpenFiles && !p.isCollapsed()) p.collapse();
  }, [hasOpenFiles]);

  // Modo canvas: visão livre dos terminais (substitui o layout em grade).
  if (tab.canvasMode) {
    return (
      <div key={tab.id} className="tab-enter h-full w-full">
        <WorkspaceCanvas tab={tab} />
      </div>
    );
  }

  if (!projectInfo) {
    // Legacy behaviour: no project → just terminal panes.
    return (
      <div key={tab.id} className="tab-enter h-full w-full">
        <RenderNode tabId={tab.id} node={tab.root} />
      </div>
    );
  }

  return (
    <div key={tab.id} className="tab-enter relative flex h-full w-full">
      <PanelGroup direction="horizontal" autoSaveId={`voltz-ws-${tab.id}-h`}>
        {showTree && treeProject && (
          <>
            <Panel defaultSize={22} minSize={12} maxSize={45}>
              <FileTreePanel
                workspaceTabId={tab.id}
                projectRoot={treeProject.path}
                projectName={treeProject.name}
                onCollapse={() => setTreeHidden(true)}
              />
            </Panel>
            <PanelResizeHandle />
          </>
        )}
        <Panel defaultSize={showTree ? 78 : 100}>
          <PanelGroup direction="vertical" autoSaveId={`voltz-ws-${tab.id}-v`}>
            <Panel
              ref={editorPanelRef}
              defaultSize={hasOpenFiles ? 55 : 0}
              minSize={15}
              collapsible
              collapsedSize={0}
            >
              <EditorArea workspaceTabId={tab.id} />
            </Panel>
            <PanelResizeHandle style={{ display: hasOpenFiles ? undefined : 'none' }} />
            <Panel defaultSize={hasOpenFiles ? 45 : 100} minSize={10}>
              <RenderNode tabId={tab.id} node={tab.root} />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}

function RenderNode({ tabId, node }: { tabId: string; node: PaneNode }) {
  const setSizes = useWorkspaceStore((s) => s.setSplitSizes);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  if (node.kind === 'pane') {
    let content: React.ReactNode;
    if (node.viewMode === 'video') {
      content = (
        <PaneDropZone tabId={tabId} paneId={node.id}>
          <VideoPane
            tabId={tabId}
            pane={node}
            visible={activeTabId === tabId}
            onClose={() => useWorkspaceStore.getState().closePane(tabId, node.id)}
          />
        </PaneDropZone>
      );
    } else if (isEmptySlot(node)) {
      content = <EmptySlotPicker tabId={tabId} pane={node} />;
    } else {
      content = (
        <PaneDropZone tabId={tabId} paneId={node.id}>
          <TerminalPane tabId={tabId} pane={node} />
        </PaneDropZone>
      );
    }
    return <PaneErrorBoundary>{content}</PaneErrorBoundary>;
  }
  const direction = node.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  return (
    <PanelGroup
      direction={direction}
      onLayout={(sizes) => setSizes(tabId, node.id, sizes)}
      autoSaveId={undefined}
    >
      {node.children.map((child, idx) => (
        <PanelHolder
          key={child.id}
          tabId={tabId}
          child={child}
          defaultSize={node.sizes[idx] ?? 50}
          isLast={idx === node.children.length - 1}
        />
      ))}
    </PanelGroup>
  );
}

function PanelHolder({
  tabId, child, defaultSize, isLast,
}: {
  tabId: string;
  child: PaneNode;
  defaultSize: number;
  isLast: boolean;
}) {
  return (
    <>
      <Panel defaultSize={defaultSize} minSize={10}>
        <RenderNode tabId={tabId} node={child} />
      </Panel>
      {!isLast && <PanelResizeHandle />}
    </>
  );
}
