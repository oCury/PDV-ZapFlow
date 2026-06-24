import { mpFetch } from "./client";

export interface MpDevice {
  id: string;
  operating_mode?: string;
}

export async function listDevices(): Promise<MpDevice[]> {
  const res = (await mpFetch("/point/integration-api/devices")) as {
    devices?: MpDevice[];
  };
  return res.devices ?? [];
}

export async function setOperatingMode(
  deviceId: string,
  mode: "PDV" | "STANDALONE"
): Promise<void> {
  await mpFetch(`/point/integration-api/devices/${deviceId}`, {
    method: "PATCH",
    body: JSON.stringify({ operating_mode: mode }),
  });
}
