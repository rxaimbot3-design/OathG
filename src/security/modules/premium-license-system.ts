import crypto from "crypto";

export interface PremiumLicenseSystemConfig {
  secretSeed?: string;
  licenseKey?: string;
  licenseServerUrl?: string;
}

export class PremiumLicenseSystem {
  private static instance: PremiumLicenseSystem;
  private SECRET_SEED: string;
  private activeLicenseKey: string;
  private _isPremiumOverride: boolean | null;
  private licenseServerUrl: string | undefined;

  private constructor(config: PremiumLicenseSystemConfig = {}) {
    this.SECRET_SEED = config.secretSeed || process.env.LICENSE_SECRET_SEED || crypto.randomBytes(32).toString("hex");
    this.activeLicenseKey = config.licenseKey || process.env.PREMIUM_LICENSE_KEY || "";
    this._isPremiumOverride = null;
    this.licenseServerUrl = config.licenseServerUrl || process.env.LICENSE_SERVER_URL;
  }

  static getInstance(config?: PremiumLicenseSystemConfig): PremiumLicenseSystem {
    if (!PremiumLicenseSystem.instance) {
      PremiumLicenseSystem.instance = new PremiumLicenseSystem(config);
    }
    return PremiumLicenseSystem.instance;
  }

  static resetInstance(): void {
    PremiumLicenseSystem.instance = undefined as any;
  }

  computeChecksum(keyBody: string): string {
    const hash = crypto.createHmac("sha256", this.SECRET_SEED).update(keyBody.toUpperCase()).digest("hex");
    return hash.substring(0, 4).toUpperCase();
  }

  generateSignedKey(): string {
    const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const body = `ENT-${part1}-${part2}`;
    const checksum = this.computeChecksum(body);
    return `PREMIUM-${body}-${checksum}`;
  }

  getHardwareFingerprint(): string {
    const raw = `${process.arch}-${process.platform}-${process.env.HOSTNAME || "node"}-ASHTRON-CORE`;
    return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 32).toUpperCase();
  }

  validateLicense(key: string): boolean {
    if (!key || typeof key !== "string") return false;
    const cleanKey = key.trim().toUpperCase();

    if (!/^PREMIUM-ENT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey)) {
      return false;
    }

    const match = cleanKey.match(/^PREMIUM-(ENT-[A-Z0-9]{4}-[A-Z0-9]{4})-([A-Z0-9]{4})$/);
    if (!match) return false;

    const body = match[1];
    const checksum = match[2];
    const expectedChecksum = this.computeChecksum(body);

    if (checksum === expectedChecksum) {
      this.activeLicenseKey = cleanKey;
      this._isPremiumOverride = true;
      return true;
    }

    return false;
  }

  async validateLicenseRemote(key: string): Promise<boolean> {
    if (!this.licenseServerUrl) return this.validateLicense(key);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(this.licenseServerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key, hardwareFingerprint: this.getHardwareFingerprint() }),
        signal: controller.signal as any
      });
      clearTimeout(timeout);

      if (!response.ok) return false;
      const data = await response.json() as { valid?: boolean };
      if (data.valid) {
        this.activeLicenseKey = key.trim().toUpperCase();
        this._isPremiumOverride = true;
        return true;
      }
      return false;
    } catch {
      return this.validateLicense(key);
    }
  }

  get isPremium(): boolean {
    if (this._isPremiumOverride !== null) return this._isPremiumOverride;
    return this.validateLicense(this.activeLicenseKey);
  }

  getLicenseExpiry(): string | null {
    return null;
  }

  getMaxGuilds(): number | null {
    return null;
  }

  getActiveLicenseKey(): string {
    return this.activeLicenseKey;
  }

  setLicenseKey(key: string): void {
    this.activeLicenseKey = key;
    this._isPremiumOverride = null;
  }
}