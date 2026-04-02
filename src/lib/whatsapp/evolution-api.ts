/**
 * Evolution API Client for WhatsApp Integration
 * Documentation: https://doc.evolution-api.com/v2/pt/integrations/cloudapi
 */

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface SendMessageOptions {
  number: string;
  text: string;
}

export interface SendMediaOptions {
  number: string;
  mediaUrl: string;
  caption?: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
}

export interface InstanceStatus {
  instanceName: string;
  state: 'open' | 'close' | 'connecting';
  qrcode?: string;
}

export interface EvolutionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

class EvolutionAPIClient {
  private config: EvolutionConfig | null = null;

  getConfig(): EvolutionConfig {
    if (this.config) return this.config;

    const apiUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

    if (!apiUrl || !apiKey || !instanceName) {
      throw new Error('Evolution API not configured. Check environment variables.');
    }

    this.config = {
      apiUrl: apiUrl.replace(/\/$/, ''),
      apiKey,
      instanceName,
    };

    return this.config;
  }

  isConfigured(): boolean {
    try {
      this.getConfig();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the API URL is a placeholder (not properly configured)
   */
  isPlaceholder(): boolean {
    const apiUrl = process.env.EVOLUTION_API_URL || "";
    const apiKey = process.env.EVOLUTION_API_KEY || "";
    
    const placeholderUrls = [
      "https://sua-instancia-evolution.com",
      "https://api.seudominio.com",
      "https://example.com",
      "http://localhost",
    ];
    
    const placeholderKeys = [
      "seu-token-global-aqui",
      "seu-token-global",
      "your-api-key",
      "your-token",
    ];

    return (
      placeholderUrls.some((p) => apiUrl.includes(p)) ||
      placeholderKeys.some((p) => apiKey.includes(p)) ||
      apiUrl.length < 10 ||
      apiKey.length < 10
    );
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<EvolutionResponse<T>> {
    try {
      const config = this.getConfig();
      const url = `${config.apiUrl}${endpoint}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || data.error || `HTTP ${response.status}`,
        };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Format phone number to WhatsApp format
   * Accepts: 11999999999, 5511999999999, +5511999999999
   * Returns: 5511999999999
   */
  formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 11 || cleaned.length === 10) {
      cleaned = '55' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Check instance connection status
   * @param instanceName Optional instance name (uses configured instance if not provided)
   */
  async getInstanceStatus(instanceName?: string): Promise<EvolutionResponse<InstanceStatus>> {
    const config = this.getConfig();
    const name = instanceName || config.instanceName;
    return this.request<InstanceStatus>(
      `/instance/connectionState/${name}`
    );
  }

  /**
   * Get QR Code for connecting WhatsApp
   * Evolution API v2 endpoint: GET /instance/connect/:instanceName
   * @param instanceName Optional instance name (uses configured instance if not provided)
   */
  async getQRCode(instanceName?: string): Promise<EvolutionResponse<{ qrcode?: string; base64?: string; pairingCode?: string }>> {
    const config = this.getConfig();
    const name = instanceName || config.instanceName;
    
    const result = await this.request<{ qrcode?: string; base64?: string; pairingCode?: string; code?: string; instance?: { state?: string } }>(
      `/instance/connect/${name}`
    );

    if (result.success && result.data) {
      const qr = result.data.qrcode || result.data.base64 || result.data.code;
      if (qr) {
        return { success: true, data: { qrcode: qr } };
      }
      if (result.data.instance?.state === 'open') {
        return { success: true, data: {} };
      }
    }

    return result;
  }

  /**
   * Send text message
   * @param options Message options (number, text)
   * @param instanceName Optional instance name (uses configured instance if not provided)
   */
  async sendText(options: SendMessageOptions, instanceName?: string): Promise<EvolutionResponse> {
    const config = this.getConfig();
    const name = instanceName || config.instanceName;
    const formattedNumber = this.formatPhoneNumber(options.number);

    return this.request(
      `/message/sendText/${name}`,
      'POST',
      {
        number: formattedNumber,
        text: options.text,
      }
    );
  }

  /**
   * Send media (image, video, audio, document)
   * @param options Media options
   * @param instanceName Optional instance name (uses configured instance if not provided)
   */
  async sendMedia(options: SendMediaOptions, instanceName?: string): Promise<EvolutionResponse> {
    const config = this.getConfig();
    const name = instanceName || config.instanceName;
    const formattedNumber = this.formatPhoneNumber(options.number);

    const mediaTypeMap = {
      image: 'sendMedia',
      video: 'sendMedia',
      audio: 'sendWhatsAppAudio',
      document: 'sendMedia',
    };

    const endpoint = `/message/${mediaTypeMap[options.mediaType]}/${name}`;

    return this.request(endpoint, 'POST', {
      number: formattedNumber,
      mediatype: options.mediaType,
      media: options.mediaUrl,
      caption: options.caption || '',
      fileName: options.fileName,
    });
  }

  /**
   * Send location
   */
  async sendLocation(
    number: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<EvolutionResponse> {
    const config = this.getConfig();
    const formattedNumber = this.formatPhoneNumber(number);

    return this.request(
      `/message/sendLocation/${config.instanceName}`,
      'POST',
      {
        number: formattedNumber,
        latitude,
        longitude,
        name: name || '',
        address: address || '',
      }
    );
  }

  /**
   * Send buttons message
   */
  async sendButtons(
    number: string,
    title: string,
    description: string,
    buttons: Array<{ buttonId: string; buttonText: string }>
  ): Promise<EvolutionResponse> {
    const config = this.getConfig();
    const formattedNumber = this.formatPhoneNumber(number);

    return this.request(
      `/message/sendButtons/${config.instanceName}`,
      'POST',
      {
        number: formattedNumber,
        title,
        description,
        buttons,
      }
    );
  }

  /**
   * Send list message
   */
  async sendList(
    number: string,
    title: string,
    description: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ title: string; description?: string; rowId: string }>;
    }>
  ): Promise<EvolutionResponse> {
    const config = this.getConfig();
    const formattedNumber = this.formatPhoneNumber(number);

    return this.request(
      `/message/sendList/${config.instanceName}`,
      'POST',
      {
        number: formattedNumber,
        title,
        description,
        buttonText,
        sections,
      }
    );
  }

  /**
   * Check if number is registered on WhatsApp
   */
  async checkNumber(phone: string): Promise<EvolutionResponse<{ exists: boolean; jid: string }>> {
    const config = this.getConfig();
    const formattedNumber = this.formatPhoneNumber(phone);

    return this.request<{ exists: boolean; jid: string }>(
      `/chat/whatsappNumbers/${config.instanceName}`,
      'POST',
      { numbers: [formattedNumber] }
    );
  }

  /**
   * Logout / Disconnect instance
   */
  async logout(): Promise<EvolutionResponse> {
    const config = this.getConfig();
    return this.request(
      `/instance/logout/${config.instanceName}`,
      'DELETE'
    );
  }

  /**
   * Restart instance
   */
  async restart(): Promise<EvolutionResponse> {
    const config = this.getConfig();
    return this.request(
      `/instance/restart/${config.instanceName}`,
      'PUT'
    );
  }

  /**
   * Create a new WhatsApp instance
   * Based on: https://doc.evolution-api.com/v2/api-reference/instance-controller/create-instance-basic
   */
  async createInstance(options?: {
    instanceName?: string;
    qrcode?: boolean;
    integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS';
  }): Promise<EvolutionResponse<{
    instance: {
      instanceName: string;
      instanceId: string;
      status: string;
    };
    hash: {
      apikey: string;
    };
  }>> {
    const config = this.getConfig();
    const instanceName = options?.instanceName || config.instanceName;

    return this.request(
      '/instance/create',
      'POST',
      {
        instanceName,
        qrcode: options?.qrcode ?? true,
        integration: options?.integration || 'WHATSAPP-BAILEYS',
      }
    );
  }

  /**
   * Fetch all instances
   */
  async fetchInstances(): Promise<EvolutionResponse<Array<{
    instance: {
      instanceName: string;
      instanceId: string;
      status: string;
      owner?: string;
    };
  }>>> {
    return this.request('/instance/fetchInstances');
  }

  /**
   * Delete an instance
   */
  async deleteInstance(instanceName?: string): Promise<EvolutionResponse> {
    const config = this.getConfig();
    const name = instanceName || config.instanceName;
    return this.request(`/instance/delete/${name}`, 'DELETE');
  }

  /**
   * Check if the API server is reachable and get instance info
   */
  async checkConnection(): Promise<EvolutionResponse<{ reachable: boolean; instances?: number }>> {
    try {
      const config = this.getConfig();
      const response = await fetch(`${config.apiUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data: {
            reachable: true,
            instances: Array.isArray(data) ? data.length : 0,
          },
        };
      }

      return {
        success: false,
        error: `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}

export const evolutionAPI = new EvolutionAPIClient();
export default evolutionAPI;
