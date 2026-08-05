import { mpFetch } from "./client";

export interface MpDevice {
  id: string;
  operating_mode?: string;
}

export async function listDevices(accessToken?: string): Promise<MpDevice[]> {
  const res = (await mpFetch("/point/integration-api/devices", { accessToken })) as {
    devices?: MpDevice[];
  };
  return res.devices ?? [];
}

export async function setOperatingMode(
  deviceId: string,
  mode: "PDV" | "STANDALONE",
  accessToken?: string,
): Promise<void> {
  await mpFetch(`/point/integration-api/devices/${deviceId}`, {
    method: "PATCH",
    body: JSON.stringify({ operating_mode: mode }),
    accessToken,
  });
}
