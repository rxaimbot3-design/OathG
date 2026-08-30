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

  let vault: TokenVault;

  beforeEach(async () => {
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
    OwnerLock.clearCache();
    
    // Create and initialize vault
    vault = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });
    await vault.initialize();
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

  it("should store and retrieve a token", async () => {
    const testToken = "test-token-12345";
    await vault.store(testToken, "TEST_TOKEN");
    
    const retrieved = await vault.retrieve("TEST_TOKEN", "123456789");
    expect(retrieved).toBe(testToken);
  });

  it("should persist token in Redis/in-memory storage", async () => {
    const testToken = "test-token-12345";
    await vault.store(testToken, "TEST_TOKEN");
    
    // Verify token is stored in persistence (Redis or in-memory fallback)
    const stats = await vault.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.isCompromised).toBe(false);
    expect(stats.initialized).toBe(true);
  });

  it("should fail to retrieve without owner permission", async () => {
    await vault.store("test-token", "TEST_TOKEN");
    
    // Unauthorized access should trigger self-destruct
    await expect(vault.retrieve("TEST_TOKEN", "unauthorized-user")).rejects.toThrow("Unauthorized token access attempt by unauthorized-user");
  });

  it("should allow guild owner to retrieve", async () => {
    await vault.store("test-token", "TEST_TOKEN");
    
    const retrieved = await vault.retrieve("TEST_TOKEN", "different-user", "different-user");
    expect(retrieved).toBe("test-token");
  });

  it("should persist across instances", async () => {
    await vault.store("persistent-token", "PERSISTENT");
    
    // Create new instance with same config
    TokenVault.resetInstance();
    const vault2 = TokenVault.getInstance({
      vaultFile: testVaultFile,
      saltFile: testSaltFile,
      masterSecret: "test-master-secret",
    });
    await vault2.initialize();

    const retrieved = await vault2.retrieve("PERSISTENT", "123456789");
    expect(retrieved).toBe("persistent-token");
  });

  it("should trigger self-destruct on compromise", async () => {
    await vault.store("test-token", "TEST_TOKEN");
    
    // Trigger self-destruct
    await expect(vault.triggerSelfDestruct("Test compromise")).rejects.toThrow("Access denied: Test compromise");
    
    // Verify vault is compromised
    expect(vault.isCompromisedState()).toBe(true);
    
    // Further access should fail with compromise message
    await expect(vault.retrieve("TEST_TOKEN", "123456789")).rejects.toThrow("Attempted access after compromise lockdown");
  });

  it("should generate consistent salt per deployment", async () => {
    // Salt is loaded from persistence, should be consistent within a deployment
    const stats = await vault.getStats();
    expect(stats.initialized).toBe(true);
    expect(stats.keyVersion).toBe(1);
  });

  it("should handle empty token gracefully", async () => {
    await vault.store("", "EMPTY_TOKEN");
    await vault.store("valid-token", "VALID_TOKEN");
    
    const retrieved = await vault.retrieve("VALID_TOKEN", "123456789");
    expect(retrieved).toBe("valid-token");
  });

  it("should throw on missing token entry", async () => {
    await expect(vault.retrieve("NONEXISTENT", "123456789")).rejects.toThrow("Token Vault entry 'NONEXISTENT' is empty");
  });

  it("should provide stats", async () => {
    const stats1 = await vault.getStats();
    expect(stats1.entries).toBe(0);
    expect(stats1.isCompromised).toBe(false);
    
    await vault.store("token1", "TOKEN1");
    await vault.store("token2", "TOKEN2");
    
    const stats2 = await vault.getStats();
    expect(stats2.entries).toBe(2);
  });
});