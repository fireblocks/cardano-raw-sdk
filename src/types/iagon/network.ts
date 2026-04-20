export type Tip = {
  slot: number;
  epoch: number;
  epoch_slot: number;
};

export type NetworkInfo = {
  era: string;
  name: string;
  sync_progress: number;
};

export type CurrentEpochParams = {
  epoch_length: number;
  slot_length: number;
};

export interface CurrentEpochResponse {
  success: boolean;
  data: {
    tip: Tip;
    network: NetworkInfo;
    params: CurrentEpochParams;
  };
}
