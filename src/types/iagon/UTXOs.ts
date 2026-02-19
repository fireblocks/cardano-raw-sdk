export interface UtxoData {
  transaction_id: string;
  output_index: number;
  address: string;
  value: {
    lovelace: number;
    assets: {
      [key: string]: number;
    };
  };
  datum_hash: string | null;
  script_hash: string | null;
  created_at: {
    slot_no: number;
    header_hash: string;
  };
}

export interface UtxoIagonResponse {
  success: boolean;
  data?: UtxoData[];
}
