export const toHex = (str: string): string => Buffer.from(str, "utf8").toString("hex");
