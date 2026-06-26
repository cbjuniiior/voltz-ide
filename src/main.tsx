import ReactDOM from 'react-dom/client';
import { App, TasksPipApp } from './App';
import './index.css';
import '@xterm/xterm/css/xterm.css';

// A janela flutuante (BrowserWindow nativa) carrega a mesma página com
// #pip=tasks — aí montamos só o painel de Tarefas.
const isTasksPip = window.location.hash.includes('pip=tasks');

ReactDOM.createRoot(document.getElementById('root')!).render(
  isTasksPip ? <TasksPipApp /> : <App />,
);
