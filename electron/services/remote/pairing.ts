export function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function isOwner(chatId: string | number, ownerChatId: string | null): boolean {
  if (!ownerChatId) return false;
  return String(chatId) === String(ownerChatId);
}
