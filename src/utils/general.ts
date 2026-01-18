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
