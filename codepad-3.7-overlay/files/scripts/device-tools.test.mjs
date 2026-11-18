import test from "node:test";
import assert from "node:assert/strict";
import { buildNmapCommand, validateScanTarget } from "../mobile-src/assets/device-tools.js";

test("scan targets are limited to the user's own private network", () => {
  for (const ok of ["192.168.1.0/24", "192.168.1.20", "10.1.2.3", "172.16.0.0/22", "172.31.255.1", "127.0.0.1", "localhost", "169.254.1.1"]) assert.equal(validateScanTarget(ok).ok, true, ok);
  for (const bad of ["8.8.8.8", "1.1.1.1/32", "0.0.0.0/0", "192.168.0.0/16", "10.0.0.0/8", "172.32.0.1", "172.15.255.255", "192.169.0.1", "example.com", "192.168.1.300", "192.168.1.0/33", "192.168.0.0/21", "", "10.0.0.1; rm -rf /"]) assert.equal(validateScanTarget(bad).ok, false, bad);
  // CIDR که تا بیرون از بازهٔ خصوصی کشیده می‌شود رد می‌شود
  assert.equal(validateScanTarget("172.31.255.0/23").ok, true);
  for (const bad of ["172.16.0.0/11", "192.167.255.0/23", "9.255.255.0/23"]) assert.equal(validateScanTarget(bad).ok, false, bad);
});

test("nmap commands are built from validated structured input only", () => {
  assert.equal(buildNmapCommand({ target: "192.168.1.0/24" }), "nmap -sn -T3 192.168.1.0/24");
  assert.equal(buildNmapCommand({ target: "192.168.1.5", mode: "ports", ports: "22,80,8000-8100" }), "nmap -sT -T3 -p 22,80,8000-8100 192.168.1.5");
  assert.equal(buildNmapCommand({ target: "localhost", mode: "services" }), "nmap -sT -sV -T3 -F 127.0.0.1");
  assert.throws(() => buildNmapCommand({ target: "8.8.8.8" }), /خصوصی/);
  assert.throws(() => buildNmapCommand({ target: "192.168.1.5", mode: "ports", ports: "80; id" }), /پورت/);
  assert.throws(() => buildNmapCommand({ target: "192.168.1.5", mode: "ports", ports: "70000" }), /65535/);
  assert.throws(() => buildNmapCommand({ target: "192.168.1.5", mode: "x" }), /mode/);
});
