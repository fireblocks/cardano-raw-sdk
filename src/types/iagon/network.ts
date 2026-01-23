type Tip = {
  slot: number;
  epoch: number;
  epoch_slot: number;
};

type NetworkInfo = {
  era: string;
  name: string;
  sync_progress: number;
};

type CurrentEpochParams = {
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
