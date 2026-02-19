export const toHex = (str: string): string => Buffer.from(str, "utf8").toString("hex");

export const decodeAssetName = (assetId: string): string => {
  const [_policyId, assetNameHex] = assetId.split(".");

  if (!assetNameHex) {
    return ""; // ADA or invalid format
  }

  // Convert hex to ASCII
  const assetName = Buffer.from(assetNameHex, "hex").toString("utf8");
  return assetName;
};

/**
 * Convert raw amount to human-readable format with decimals
 * @param rawAmount - The raw amount in smallest units
 * @param decimals - Number of decimal places (6 for ADA)
 * @returns Object with formatted value and formatted raw value with commas
 * @example
 * formatWithDecimals(1700000, 6) // { value: "1.70", raw: "1,700,000" }
 * formatWithDecimals(470000, 6) // { value: "0.47", raw: "470,000" }
 */
export const formatWithDecimals = (
  rawAmount: number,
  decimals: number
): { value: string; raw: string } => {
  const divisor = Math.pow(10, decimals);
  const formattedValue = (rawAmount / divisor).toFixed(decimals);
  const formattedRaw = rawAmount.toLocaleString();

  return {
    value: formattedValue,
    raw: formattedRaw,
  };
};
