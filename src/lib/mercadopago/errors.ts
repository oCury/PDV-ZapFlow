import { MpApiError } from "./client";

export type OperatorError = {
  code: "DEVICE_BUSY" | "OFFLINE" | "DECLINED" | "CONFIG" | "GENERIC";
  message: string;
};

export function mapMpErrorToOperatorMessage(err: unknown): OperatorError {
  if (err instanceof MpApiError) {
    if (err.status === 409)
      return { code: "DEVICE_BUSY", message: "Maquininha ocupada — cancele a cobrança anterior." };
    if (err.status === 403)
      return { code: "CONFIG", message: "Configuração do Mercado Pago inválida. Verifique o app/integração." };
    if (err.status === 400)
      return { code: "GENERIC", message: "Dados da cobrança inválidos." };
    return { code: "GENERIC", message: "Erro ao comunicar com a maquininha. Tente novamente." };
  }
  // fetch network failures throw TypeError
  return { code: "OFFLINE", message: "Maquininha sem conexão. Verifique a internet do dispositivo." };
}
