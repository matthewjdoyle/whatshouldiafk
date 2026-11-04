import type { Method } from '../calculations/profit';

export function getMethodIconUrl(method: Method): string | undefined {
  if (method.iconUrl) return method.iconUrl;
  const item = method.outputs[0] ?? method.inputs[0];
  return item ? `https://static.runelite.net/cache/item/icon/${item.id}.png` : undefined;
}

export function formatAfk(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}
