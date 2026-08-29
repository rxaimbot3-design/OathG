import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { TokenVault } from "../../src/security/modules/token-vault.js";
import { OwnerLock } from "../../src/security/modules/owner-lock.js";

describe("TokenVault", () => {
  const testVaultDir = "/tmp/tokenvault-test";
  const testVaultFile = path.join(testVaultDir, "vault_tokens.json");
  const testSaltFile = path.join(testVaultDir, "vault_salt.txt");

  beforeEach(() => {
    // Clean up any existing test files
    if (fs.existsSync(testVaultFile)) fs.unlinkSync(testVaultFile);
    if (fs.existsSync(testSaltFile)) fs.unlinkSync(testSaltFile);
    if (fs.existsSync(testVaultDir)) fs.rmSync(testVaultDir, { recursive: true, force: true });
    
    // Create test directory
    fs.mkdirSync(testVaultDir, { recursive: true });
    
    // Reset singleton instances
    TokenVault.resetInstance();
    OwnerLock.resetInstance();
    
    // Set up test owner
    process.env.ALLOWED_OWNERS = "123456789";
  });

  afterEach(() => {
    TokenVault.resetInstance();
    OwnerLock.resetInstance();
    delete process.env.ALLOWED_OWNERS;
    
    // Clean up test files
    if (fs.existsSync(testVaultFile)) fs.unlinkSync(testVaultFile);
    if (fs.existsSync(testSaltFile)) fs.unlinkSync(testSaltFile);
    if (fs.existsSync(testVaultDir)) fs.rmSync(testVaultDir, { recursive: true, force: true });
  });

  it("should store and retrieve a token", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    const testToken = "test-token-12345";
    vault.store(testToken, "TEST_TOKEN");
    
    const retrieved = vault.retrieve("TEST_TOKEN", "123456789");
    expect(retrieved).toBe(testToken);
  });

  it("should encrypt token on disk", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    const testToken = "test-token-12345";
    vault.store(testToken, "TEST_TOKEN");
    
    // Read the raw file and verify it's encrypted
    const raw = fs.readFileSync(testVaultFile, "utf8");
    const parsed = JSON.parse(raw);
    
    expect(parsed.TEST_TOKEN).toBeDefined();
    expect(parsed.TEST_TOKEN.encrypted).toBeDefined();
    expect(parsed.TEST_TOKEN.iv).toBeDefined();
    expect(parsed.TEST_TOKEN.authTag).toBeDefined();
    expect(parsed.TEST_TOKEN.encrypted).not.toBe(testToken);
  });

  it("should fail to retrieve without owner permission", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    vault.store("test-token", "TEST_TOKEN");
    
    expect(() => vault.retrieve("TEST_TOKEN", "unauthorized-user")).toThrow("Unauthorized token access attempt");
  });

  it("should allow guild owner to retrieve", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    vault.store("test-token", "TEST_TOKEN");
    
    const retrieved = vault.retrieve("TEST_TOKEN", "different-user", "different-user");
    expect(retrieved).toBe("test-token");
  });

  it("should persist across instances", () => {
    const vault1 = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    vault1.store("persistent-token", "PERSISTENT");
    
    // Create new instance with same config
    TokenVault.resetInstance();
    const vault2 = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    const retrieved = vault2.retrieve("PERSISTENT", "123456789");
    expect(retrieved).toBe("persistent-token");
  });

  it("should trigger self-destruct on compromise", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    vault.store("test-token", "TEST_TOKEN");
    
    // Trigger self-destruct
    expect(() => vault.triggerSelfDestruct("Test compromise")).toThrow("Access denied");
    
    // Verify vault is compromised
    expect(vault.isCompromisedState()).toBe(true);
    
    // Further access should fail
    expect(() => vault.retrieve("TEST_TOKEN", "123456789")).toThrow("Access denied");
  });

  it("should generate unique salts per deployment", () => {
    const vault1 = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });
    vault1.store("token1", "TOKEN1");
    
    // Read salt file
    const salt1 = fs.readFileSync(testSaltFile, "utf8").trim();
    expect(salt1.length).toBeGreaterThan(16);
    
    // Reset and create new instance with different master secret
    TokenVault.resetInstance();
    if (fs.existsSync(testVaultFile)) fs.unlinkSync(testVaultFile);
    
    const vault2 = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "different-master-secret",
    });
    vault2.store("token2", "TOKEN2");
    
    // Salt should be the same (loaded from file)
    const salt2 = fs.readFileSync(testSaltFile, "utf8").trim();
    expect(salt2).toBe(salt1);
  });

  it("should handle empty token gracefully", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    vault.store("", "EMPTY_TOKEN");
    vault.store("valid-token", "VALID_TOKEN");
    
    expect(vault.retrieve("VALID_TOKEN", "123456789")).toBe("valid-token");
  });

  it("should throw on missing token entry", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    expect(() => vault.retrieve("NONEXISTENT", "123456789")).toThrow("Token Vault entry 'NONEXISTENT' is empty");
  });

  it("should provide stats", () => {
    const vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });

    expect(vault.getStats().entries).toBe(0);
    expect(vault.getStats().isCompromised).toBe(false);
    
    vault.store("token1", "TOKEN1");
    vault.store("token2", "TOKEN2");
    
    expect(vault.getStats().entries).toBe(2);
  });
});