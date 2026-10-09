export const formatWorkTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m${!hours && !minutes ? ` ${total % 60}s` : ""}`;
};
