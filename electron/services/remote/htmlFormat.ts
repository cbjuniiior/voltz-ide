// Converte o markdown que o Claude escreve para o HTML que o Telegram entende.
// O modo 'HTML' do Telegram só exige escapar < > & (bem mais tolerante que o
// Markdown/MarkdownV2, que falham silenciosamente com *, _, [, ., - soltos).
// Tags suportadas: <b> <i> <u> <s> <code> <pre> <a>.

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Sentinela em área de uso privado do Unicode — não aparece em texto normal e
// não é tocado pelo escapeHtml. String.fromCharCode evita gravar o char literal.
const H0 = String.fromCharCode(0xe000);
const H1 = String.fromCharCode(0xe001);

export function mdToTelegramHtml(src: string): string {
  const holds: string[] = [];
  const hold = (html: string) => { holds.push(html); return `${H0}${holds.length - 1}${H1}`; };

  let s = src;
  // 1) blocos ```...``` (protege o conteúdo de virar markdown)
  s = s.replace(/```[^\n`]*\n?([\s\S]*?)```/g, (_m, code: string) =>
    hold(`<pre>${escapeHtml(code.replace(/\n+$/, ''))}</pre>`));
  // 2) code spans `...`
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => hold(`<code>${escapeHtml(code)}</code>`));

  // 3) escapa o restante do texto
  s = escapeHtml(s);

  // 4) ênfases
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');               // **negrito**
  s = s.replace(/__([^_\n]+?)__/g, '<b>$1</b>');                    // __negrito__
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>');  // *itálico*
  s = s.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, '$1<i>$2</i>');    // _itálico_ (poupa snake_case)
  s = s.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');                    // ~~riscado~~
  // 5) títulos markdown viram negrito (Telegram não tem heading)
  s = s.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*$/gm, '<b>$1</b>');

  // 6) restaura os blocos de código protegidos
  s = s.replace(new RegExp(`${H0}(\\d+)${H1}`, 'g'), (_m, i: string) => holds[Number(i)]);
  return s;
}
