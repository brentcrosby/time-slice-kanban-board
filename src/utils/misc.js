export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
