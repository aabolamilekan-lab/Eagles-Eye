import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCacheForTests } from "@/lib/env";

const MANAGED_KEYS = [
  "NODE_ENV",
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
];

function setEnvironment(values: Record<string, string>): void {
  for (const key of MANAGED_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
  resetEnvCacheForTests();
}

describe("environment contract", () => {
  afterEach(() => {
    resetEnvCacheForTests();
  });

  it("requires a 32+ character AUTH_SECRET", () => {
    setEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      AUTH_SECRET: "too-short",
    });
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });

  it("allows the filesystem storage fallback outside production", () => {
    setEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      AUTH_SECRET: "x".repeat(32),
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(() => getEnv()).not.toThrow();
  });

  it("requires every S3 value in production", () => {
    setEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      AUTH_SECRET: "x".repeat(32),
      NEXT_PUBLIC_APP_URL: "https://stories.example.com",
    });
    expect(() => getEnv()).toThrow(/STORAGE_ENDPOINT/);
  });

  it("treats blank storage values as missing in production", () => {
    setEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      AUTH_SECRET: "x".repeat(32),
      NEXT_PUBLIC_APP_URL: "https://stories.example.com",
      STORAGE_ENDPOINT: "https://s3.example.com",
      STORAGE_REGION: "  ",
      STORAGE_BUCKET: "",
      STORAGE_ACCESS_KEY_ID: "id",
      STORAGE_SECRET_ACCESS_KEY: "secret",
    });
    expect(() => getEnv()).toThrow(/STORAGE_REGION/);
  });

  it("accepts a fully configured production environment", () => {
    setEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      AUTH_SECRET: "x".repeat(32),
      NEXT_PUBLIC_APP_URL: "https://stories.example.com",
      STORAGE_ENDPOINT: "https://s3.example.com",
      STORAGE_REGION: "auto",
      STORAGE_BUCKET: "covers",
      STORAGE_ACCESS_KEY_ID: "id",
      STORAGE_SECRET_ACCESS_KEY: "secret",
    });
    expect(() => getEnv()).not.toThrow();
  });
});