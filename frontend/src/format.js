// Shared number formatting.
// `fmt` rounds to a whole number and groups digits in the UK style (e.g. 12,345).
// NaN or undefined formats as 0. Analytics keeps its own compact chart formatter,
// which shows decimals below 1000.
export const fmt = (n) => Number(Math.round(n) || 0).toLocaleString('en-GB')
