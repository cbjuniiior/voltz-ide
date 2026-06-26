export function sliceForTelegram(text: string, max = 4096): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    out.push(text.slice(i, i + max));
  }
  return out;
}

export function formatApprovalCard(projectName: string, target: string): string {
  return `🔐 *${projectName}* — o Claude quer:\n\`${target}\``;
}
