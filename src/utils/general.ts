export const toHex = (str: string): string => Buffer.from(str, "utf8").toString("hex");

export const decodeAssetName = (assetId: string): string => {
  const [, assetNameHex] = assetId.split(".");

  if (!assetNameHex) {
    return ""; // ADA or invalid format
  }

  // Convert hex to ASCII
  const assetName = Buffer.from(assetNameHex, "hex").toString("utf8");
  return assetName;
};

/**
 * Convert raw amount to human-readable format with decimals.
 * Uses BigInt arithmetic to avoid floating-point precision loss for large lovelace values
 * (max ADA supply exceeds Number.MAX_SAFE_INTEGER when expressed in lovelace).
 *
 * @param rawAmount - The raw integer amount in smallest units (lovelace)
 * @param decimals - Number of decimal places (6 for ADA)
 * @returns Object with formatted value and formatted raw value with commas
 * @example
 * formatWithDecimals(1700000, 6) // { value: "1.700000", raw: "1,700,000" }
 * formatWithDecimals(470000, 6) // { value: "0.470000", raw: "470,000" }
 */
export const formatWithDecimals = (
  rawAmount: number | bigint,
  decimals: number
): { value: string; raw: string } => {
  const amount = typeof rawAmount === "bigint" ? rawAmount : BigInt(Math.trunc(Number(rawAmount)));
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const fracStr = remainder.toString().padStart(decimals, "0");
  const formattedValue = `${whole}.${fracStr}`;
  const formattedRaw = amount.toLocaleString();

  return {
    value: formattedValue,
    raw: formattedRaw,
  };
};

/**
 * Parse an ADA decimal string (e.g. "0.178701") to lovelace as an integer.
 * Uses string splitting to avoid floating-point precision loss.
 */
export const parseAdaStringToLovelace = (ada: string): number => {
  const [wholePart = "0", fracPart = ""] = ada.split(".");
  const paddedFrac = fracPart.padEnd(6, "0").slice(0, 6);
  return parseInt(wholePart, 10) * 1_000_000 + parseInt(paddedFrac || "0", 10);
};
